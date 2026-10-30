import { Hono, type MiddlewareHandler } from "hono";
import type { AppEnv } from "../env";
import { readSession } from "../auth/session";
import { sendEmail } from "../email";

// Panel de administración (Fase 5). Mismo contrato que server.ts, con dos cambios de seguridad:
// - Quién es admin lo decide la sesión firmada y la columna users.role de D1, no el campo
//   "adminEmail" que enviaba el navegador (cualquiera podía escribirlo).
// - El correo sale por Resend con los secretos del Worker; ya no se guarda SMTP en disco.

const MAIN_ADMIN = "alejandrotm91@gmail.com"; // no se puede borrar ni suspender
const MASK = "••••••••••••";

const now = () => new Date().toISOString();
const cleanEmailOf = (v: unknown) => String(v ?? "").toLowerCase().trim();

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}

const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const session = await readSession(c);
  if (!session) return c.json({ error: "Sesión no iniciada o vencida." }, 401);
  const row = await c.env.DB.prepare("SELECT id, role, status FROM users WHERE email = ?")
    .bind(session.email).first<{ id: string; role: string; status: string }>();
  if (!row || row.id !== session.id || row.status === "suspended" || row.role !== "admin") {
    return c.json({ error: "No tienes permisos de administrador." }, 403);
  }
  c.set("user", session);
  await next();
};

export const adminRoutes = new Hono<AppEnv>();
adminRoutes.use("*", requireAdmin);

adminRoutes.get("/users", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, name, email, email_verified, status, created_at, last_login, data FROM users ORDER BY created_at"
  ).all<{ id: string; name: string; email: string; email_verified: number; status: string; created_at: string; last_login: string | null; data: string }>();
  return c.json(results.map((u) => {
    let d: any = {};
    try { d = JSON.parse(u.data || "{}"); } catch {}
    const portfolios = Array.isArray(d.portfolios) ? d.portfolios : null;
    return {
      id: u.id,
      name: u.name || "Inversionista",
      email: u.email,
      emailVerified: !!u.email_verified,
      status: u.status || "active",
      createdAt: u.created_at,
      lastLogin: u.last_login,
      holdingsCount: Array.isArray(d.holdings)
        ? d.holdings.length
        : portfolios ? portfolios.reduce((n: number, p: any) => n + (p.holdings?.length || 0), 0) : 0,
      portfoliosCount: portfolios ? portfolios.length : 1,
    };
  }));
});

adminRoutes.post("/delete-user", async (c) => {
  const { targetEmail } = await c.req.json().catch(() => ({} as any));
  const target = cleanEmailOf(targetEmail);
  if (!target) return c.json({ error: "El correo del usuario es requerido." }, 400);
  if (target === MAIN_ADMIN || target === c.get("user").email) {
    return c.json({ error: "No se puede eliminar la cuenta del administrador principal." }, 400);
  }
  await c.env.DB.prepare("DELETE FROM users WHERE email = ?").bind(target).run();
  return c.json({ success: true, message: `El usuario ${target} ha sido eliminado definitivamente del sistema.` });
});

adminRoutes.post("/toggle-user-status", async (c) => {
  const { targetEmail, status } = await c.req.json().catch(() => ({} as any));
  const target = cleanEmailOf(targetEmail);
  if (!target) return c.json({ error: "El correo del usuario es requerido." }, 400);
  if (target === MAIN_ADMIN || target === c.get("user").email) {
    return c.json({ error: "No se puede suspender al administrador principal." }, 400);
  }
  const row = await c.env.DB.prepare("SELECT status FROM users WHERE email = ?").bind(target).first<{ status: string }>();
  if (!row) return c.json({ error: "Usuario no encontrado." }, 404);

  const newStatus = status === "active" || status === "suspended" ? status : row.status === "suspended" ? "active" : "suspended";
  await c.env.DB.prepare("UPDATE users SET status = ?, updated_at = ? WHERE email = ?").bind(newStatus, now(), target).run();
  return c.json({
    success: true,
    status: newStatus,
    message: newStatus === "suspended" ? `Acceso revocado/suspendido para ${target}.` : `Acceso reactivado para ${target}.`,
  });
});

function broadcastHtml(name: string, message: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #f8fafc; padding: 32px 20px; border-radius: 16px; border: 1px solid #1e293b; max-width: 580px; margin: 0 auto;">
      <div style="text-align: center; margin-bottom: 24px; border-bottom: 1px solid #1e293b; padding-bottom: 20px;">
        <span style="font-size: 22px; font-weight: 800; color: #10b981; letter-spacing: 0.05em; font-family: monospace;">INVESTIANDO.AI</span>
        <p style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b; margin-top: 4px;">Comunicado Oficial para Usuarios Registrados</p>
      </div>
      <div style="font-size: 14px; line-height: 1.6; color: #e2e8f0; margin-bottom: 24px;">
        <p style="margin-top: 0;">Hola <strong style="color: #10b981;">${escapeHtml(name)}</strong>,</p>
        <div style="background-color: rgba(15, 23, 42, 0.6); border-left: 3px solid #10b981; padding: 16px 20px; border-radius: 0 12px 12px 0; margin: 20px 0; font-size: 14px;">
          ${escapeHtml(message).replace(/\n/g, "<br />")}
        </div>
      </div>
      <div style="border-top: 1px solid #1e293b; padding-top: 20px; text-align: center; font-size: 11px; color: #64748b; font-family: monospace;">
        <p style="margin: 0 0 6px 0;">Este es un mensaje enviado directamente a tu cuenta registrada en <strong>investiando.ai</strong>.</p>
        <p style="margin: 0; color: #475569;">© 2026 investiando.ai | Terminal de Inteligencia Financiera</p>
      </div>
    </div>`;
}

adminRoutes.post("/broadcast-email", async (c) => {
  const { recipientEmail, subject, message } = await c.req.json().catch(() => ({} as any));
  if (!subject || !message) return c.json({ error: "El asunto y el contenido del mensaje son obligatorios." }, 400);
  if (!c.env.RESEND_API_KEY || !c.env.EMAIL_FROM) {
    return c.json({ error: "El correo no está configurado (faltan RESEND_API_KEY y EMAIL_FROM en el Worker)." }, 503);
  }

  let targets: { name: string; email: string }[];
  if (!recipientEmail || recipientEmail === "ALL") {
    const { results } = await c.env.DB.prepare("SELECT name, email FROM users WHERE status = 'active'").all<{ name: string; email: string }>();
    targets = results;
  } else {
    const email = cleanEmailOf(recipientEmail);
    const row = await c.env.DB.prepare("SELECT name, email FROM users WHERE email = ?").bind(email).first<{ name: string; email: string }>();
    // server.ts enviaba a cualquier dirección; aquí solo a usuarios registrados, para no servir de relé.
    if (!row) return c.json({ error: "No hay destinatarios válidos para enviar este correo." }, 400);
    targets = [row];
  }
  if (targets.length === 0) return c.json({ error: "No hay destinatarios válidos para enviar este correo." }, 400);

  const sentTo: string[] = [];
  const errors: string[] = [];
  for (const t of targets) {
    const ok = await sendEmail(c.env, t.email, String(subject), broadcastHtml(t.name || "Inversionista", String(message)));
    if (ok) sentTo.push(t.email); else errors.push(`${t.email}: no se pudo enviar`);
  }
  return c.json({ success: true, sentCount: sentTo.length, sentTo, errors: errors.length ? errors : undefined });
});

// --- Correo: en el Worker lo configuran los secretos de Resend, no un formulario SMTP ---
export const smtpRoutes = new Hono<AppEnv>();
smtpRoutes.use("*", requireAdmin);

smtpRoutes.get("/config", (c) => c.json({
  host: "api.resend.com",
  port: "443",
  secure: true,
  user: "resend",
  pass: c.env.RESEND_API_KEY ? MASK : "",
  from: c.env.EMAIL_FROM || "",
  provider: "resend",
  configured: !!(c.env.RESEND_API_KEY && c.env.EMAIL_FROM),
}));

smtpRoutes.post("/config", (c) => c.json({
  error: "El correo se configura con los secretos RESEND_API_KEY y EMAIL_FROM del Worker (npx wrangler secret put), no desde aquí.",
}, 400));

smtpRoutes.post("/test", async (c) => {
  const { testEmail } = await c.req.json().catch(() => ({} as any));
  const to = cleanEmailOf(testEmail);
  if (!to) return c.json({ error: "El correo de prueba es obligatorio" }, 400);
  if (!c.env.RESEND_API_KEY || !c.env.EMAIL_FROM) {
    return c.json({ error: "El correo no está configurado (faltan RESEND_API_KEY y EMAIL_FROM en el Worker)." }, 503);
  }
  const html = `
    <div style="font-family: sans-serif; background-color: #0b0f19; color: #e2e8f0; padding: 40px; border-radius: 16px; max-width: 500px; margin: 0 auto; text-align: center;">
      <span style="font-size: 24px; font-weight: bold; color: #10b981; font-family: monospace;">INVESTIANDO.AI</span>
      <h3 style="color: #10b981;">¡Correo configurado correctamente!</h3>
      <p style="font-size: 12px; color: #94a3b8;">Remitente: ${escapeHtml(c.env.EMAIL_FROM)}</p>
    </div>`;
  const ok = await sendEmail(c.env, to, "🧪 Prueba de correo - investiando.ai", html);
  return ok ? c.json({ success: true }) : c.json({ error: "Resend rechazó el envío. Revisa el registro del Worker (npx wrangler tail)." }, 502);
});
