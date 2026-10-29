import { Hono, type Context } from "hono";
import type { AppEnv } from "../env";
import { hashPassword, verifyPassword, sixDigitCode } from "./password";
import { createSession, clearSession, readSession, verifyToken, requireUser } from "./session";
import { sendEmail } from "../email";

// Registro, verificación, inicio de sesión, recuperación de contraseña y datos del usuario.
// Mismo contrato (rutas, cuerpos, respuestas y códigos de error) que server.ts, pero con
// usuarios en D1, contraseñas cifradas y sesión firmada.

interface UserRow {
  email: string;
  id: string;
  name: string;
  password_hash: string | null;
  email_verified: number;
  status: string;
  role: string;
  verification_code: string | null;
  reset_code: string | null;
  reset_expires: number | null;
  code_attempts: number;
  data: string;
  created_at: string;
  updated_at: string;
  verified_at: string | null;
  last_login: string | null;
}

const MAX_CODE_ATTEMPTS = 5;
const RESET_CODE_TTL_MS = 15 * 60 * 1000;

const DEFAULT_COMPOUNDERS_HOLDINGS = [
  { ticker: "MSFT", shares: 31.82, avgCost: 440.0 },
  { ticker: "AAPL", shares: 53.33, avgCost: 225.0 },
  { ticker: "NVDA", shares: 88.0, avgCost: 125.0 },
  { ticker: "GOOGL", shares: 55.56, avgCost: 180.0 },
  { ticker: "META", shares: 19.23, avgCost: 520.0 },
  { ticker: "MA", shares: 16.49, avgCost: 485.0 },
  { ticker: "COST", shares: 9.04, avgCost: 885.0 },
  { ticker: "NFLX", shares: 10.29, avgCost: 680.0 },
  { ticker: "LLY", shares: 6.67, avgCost: 900.0 },
  { ticker: "MELI", shares: 2.56, avgCost: 1950.0 },
  { ticker: "UBER", shares: 66.67, avgCost: 75.0 },
  { ticker: "NU", shares: 275.86, avgCost: 14.5 },
];
const DEFAULT_WATCHLIST = ["MSFT", "AAPL", "NVDA", "GOOGL", "META", "MA", "COST", "NFLX", "LLY", "MELI", "UBER", "NU"];

// Campos que nunca se guardan dentro de `data` (los maneja el servidor).
const PROTECTED_KEYS = [
  "email", "id", "name", "clave", "password", "passwordHash", "emailVerified", "status", "role",
  "verificationCode", "resetCode", "resetCodeExpires", "createdAt", "verifiedAt", "lastLogin",
];

const now = () => new Date().toISOString();
const cleanEmailOf = (v: unknown) => String(v ?? "").toLowerCase().trim();

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}

function parseData(row: UserRow): Record<string, any> {
  try { return JSON.parse(row.data || "{}"); } catch { return {}; }
}

/** Cartera y watchlist por defecto si el usuario aún no tiene (igual que server.ts). */
function withDefaults(data: Record<string, any>): { data: Record<string, any>; changed: boolean } {
  let changed = false;
  const out = { ...data };
  const firstHoldings = out.portfolios?.[0]?.holdings;
  if (!Array.isArray(out.portfolios) || out.portfolios.length === 0 || !Array.isArray(firstHoldings) || firstHoldings.length === 0) {
    out.portfolios = [{ id: "portfolio-1", name: "Compounders de Alta Calidad", holdings: DEFAULT_COMPOUNDERS_HOLDINGS, createdAt: now(), updatedAt: now() }];
    out.activePortfolioId = "portfolio-1";
    changed = true;
  }
  if (!Array.isArray(out.holdings) || out.holdings.length === 0) { out.holdings = DEFAULT_COMPOUNDERS_HOLDINGS; changed = true; }
  if (!Array.isArray(out.watchlist) || out.watchlist.length === 0) { out.watchlist = DEFAULT_WATCHLIST; changed = true; }
  if (!Array.isArray(out.marginPositions)) { out.marginPositions = []; changed = true; }
  return { data: out, changed };
}

function publicUser(row: UserRow) {
  return { id: row.id, name: row.name, email: row.email, emailVerified: true };
}

async function getUser(c: Context<AppEnv>, email: string): Promise<UserRow | null> {
  if (!email) return null;
  return c.env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<UserRow>();
}

function appUrl(c: Context<AppEnv>): string {
  return (c.env.APP_URL || new URL(c.req.url).origin).replace(/\/$/, "");
}

// --- Plantillas de correo (las mismas de server.ts) ---
function verificationEmail(name: string, code: string, verifyUrl: string, resend: boolean): string {
  const intro = resend
    ? `Has solicitado un nuevo código de verificación para completar tu registro:`
    : `Gracias por registrarte en investiando.ai, tu terminal de simulación y análisis de portafolios de inversión de alta precisión.</p>
          <p style="font-size: 14px; line-height: 1.5; color: #cbd5e1;">Usa el siguiente código de verificación de 6 dígitos para activar tu cuenta en la terminal:`;
  return `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 25px; border: 1px solid #1e293b; background-color: #0b0f19; color: #f8fafc; border-radius: 12px;">
          <h2 style="color: #10b981; font-family: monospace; border-bottom: 1px solid #1e293b; padding-bottom: 12px; margin-top: 0;">investiando.ai</h2>
          <p style="font-size: 14px;">Hola <strong>${escapeHtml(name)}</strong>,</p>
          <p style="font-size: 14px; line-height: 1.5; color: #cbd5e1;">${intro}</p>
          <div style="background-color: #ffffff; color: #000000; font-family: monospace; font-size: 26px; font-weight: bold; text-align: center; padding: 15px; border-radius: 8px; letter-spacing: 5px; margin: 20px 0; border: 1px solid #e2e8f0;">${code}</div>
          <p style="font-size: 14px; line-height: 1.5; color: #cbd5e1;">O si lo prefieres, haz clic en el botón para verificar tu cuenta automáticamente:</p>
          <p style="text-align: center; margin: 25px 0;">
            <a href="${verifyUrl}" target="_blank" style="background-color: #10b981; color: #020617; text-decoration: none; padding: 12px 28px; font-weight: bold; border-radius: 8px; display: inline-block; font-size: 14px;">Verificar mi Cuenta</a>
          </p>
          <p style="font-size: 11px; color: #64748b; margin-top: 30px; border-top: 1px solid #1e293b; padding-top: 15px; text-align: center;">Si no creaste una cuenta en investiando.ai, puedes ignorar este correo de forma segura.</p>
        </div>`;
}

function resetEmail(name: string, code: string): string {
  return `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 25px; border: 1px solid #1e293b; background-color: #0b0f19; color: #f8fafc; border-radius: 12px;">
        <h2 style="color: #f43f5e; font-family: monospace; border-bottom: 1px solid #1e293b; padding-bottom: 12px; margin-top: 0;">Restablecer Contraseña</h2>
        <p style="font-size: 14px;">Hola <strong>${escapeHtml(name)}</strong>,</p>
        <p style="font-size: 14px; line-height: 1.5; color: #cbd5e1;">Has solicitado restablecer la contraseña de tu terminal en investiando.ai. Usa el siguiente código de 6 dígitos:</p>
        <div style="background-color: #1e293b; color: #f43f5e; font-family: monospace; font-size: 26px; font-weight: bold; text-align: center; padding: 15px; border-radius: 8px; letter-spacing: 5px; margin: 20px 0; border: 1px solid #334155;">${code}</div>
        <p style="font-size: 12px; color: #64748b; margin-top: 25px; border-top: 1px solid #1e293b; padding-top: 15px;">Este código expirará en 15 minutos. Si no solicitaste este cambio, puedes ignorar este correo de forma segura.</p>
      </div>`;
}

function verifyLinkPage(title: string, message: string, ok: boolean): string {
  return `<!DOCTYPE html><html><head><title>${title} - investiando.ai</title><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>body{background:#020617;color:#f1f5f9;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:16px}
.card{background:#0f172a;border:1px solid #1e293b;padding:40px;border-radius:16px;text-align:center;max-width:400px}
h2{color:${ok ? "#10b981" : "#ef4444"};margin-top:0}p{color:#94a3b8;font-size:14px;line-height:1.5}
a{background:#10b981;color:#020617;text-decoration:none;padding:12px 24px;font-weight:bold;border-radius:8px;display:inline-block;margin-top:20px}</style></head>
<body><div class="card"><h2>${title}</h2><p>${message}</p>${ok ? `<a href="/">Ir a investiando.ai</a>` : ""}</div></body></html>`;
}

/** Marca el correo como verificado y completa la cartera por defecto. */
async function markVerified(c: Context<AppEnv>, row: UserRow) {
  const { data } = withDefaults(parseData(row));
  await c.env.DB.prepare(
    `UPDATE users SET email_verified = 1, status = CASE WHEN status = 'suspended' THEN status ELSE 'active' END,
       verification_code = NULL, code_attempts = 0, verified_at = ?, updated_at = ?, data = ? WHERE email = ?`
  ).bind(now(), now(), JSON.stringify(data), row.email).run();
}

/** Registra un intento fallido; tras MAX_CODE_ATTEMPTS invalida los códigos vigentes. */
async function failCodeAttempt(c: Context<AppEnv>, row: UserRow): Promise<boolean> {
  const attempts = (row.code_attempts || 0) + 1;
  if (attempts >= MAX_CODE_ATTEMPTS) {
    await c.env.DB.prepare(
      "UPDATE users SET verification_code = NULL, reset_code = NULL, reset_expires = NULL, code_attempts = 0 WHERE email = ?"
    ).bind(row.email).run();
    return true;
  }
  await c.env.DB.prepare("UPDATE users SET code_attempts = ? WHERE email = ?").bind(attempts, row.email).run();
  return false;
}

const TOO_MANY = "Demasiados intentos con este código. Solicita uno nuevo.";

export const authRoutes = new Hono<AppEnv>();

authRoutes.post("/signup", async (c) => {
  const { name, email, password } = await c.req.json().catch(() => ({} as any));
  if (!name || !email || !password) return c.json({ error: "Todos los campos son obligatorios" }, 400);
  const cleanEmail = cleanEmailOf(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return c.json({ error: "El correo electrónico no es válido" }, 400);
  if (String(password).length < 6) return c.json({ error: "La contraseña debe tener al menos 6 caracteres" }, 400);
  if (await getUser(c, cleanEmail)) return c.json({ error: "El correo electrónico ya está registrado" }, 400);

  const code = sixDigitCode();
  const id = "user_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const { data } = withDefaults({});
  await c.env.DB.prepare(
    `INSERT INTO users (email, id, name, password_hash, email_verified, status, verification_code, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, 'active', ?, ?, ?, ?)`
  ).bind(cleanEmail, id, String(name).trim(), await hashPassword(String(password)), code, JSON.stringify(data), now(), now()).run();

  const verifyUrl = `${appUrl(c)}/api/auth/verify-link?email=${encodeURIComponent(cleanEmail)}&code=${code}`;
  c.executionCtx.waitUntil(sendEmail(c.env, cleanEmail, "🔑 Verifica tu cuenta en investiando.ai", verificationEmail(String(name), code, verifyUrl, false)));
  return c.json({ success: true, email: cleanEmail });
});

authRoutes.post("/verify", async (c) => {
  const { email, code } = await c.req.json().catch(() => ({} as any));
  if (!email || !code) return c.json({ error: "El correo y el código son obligatorios" }, 400);
  const row = await getUser(c, cleanEmailOf(email));
  if (!row) return c.json({ error: "Usuario no encontrado" }, 400);
  if (!row.verification_code || row.verification_code !== String(code).trim()) {
    const blocked = await failCodeAttempt(c, row);
    return c.json({ error: blocked ? TOO_MANY : "El código de verificación es incorrecto" }, 400);
  }
  await markVerified(c, row);
  const token = await createSession(c, { email: row.email, id: row.id });
  return c.json({ success: true, user: publicUser(row), token });
});

authRoutes.get("/verify-link", async (c) => {
  const email = cleanEmailOf(c.req.query("email"));
  const code = String(c.req.query("code") ?? "").trim();
  if (!email || !code) return c.html(verifyLinkPage("Error de Verificación", "Faltan parámetros requeridos.", false), 400);
  const row = await getUser(c, email);
  if (!row || !row.verification_code || row.verification_code !== code) {
    if (row) await failCodeAttempt(c, row);
    return c.html(verifyLinkPage("Enlace de Verificación Inválido", "El código o el correo electrónico no son válidos o ya expiraron.", false), 400);
  }
  await markVerified(c, row);
  return c.html(verifyLinkPage("¡Cuenta Verificada!", `Tu correo <strong>${escapeHtml(email)}</strong> ha sido verificado. Ya puedes iniciar sesión en tu terminal.`, true));
});

authRoutes.post("/resend", async (c) => {
  const { email } = await c.req.json().catch(() => ({} as any));
  if (!email) return c.json({ error: "El correo es obligatorio" }, 400);
  const row = await getUser(c, cleanEmailOf(email));
  if (!row) return c.json({ error: "Usuario no registrado" }, 400);
  if (row.email_verified) return c.json({ success: true, message: "La cuenta ya está verificada." });

  const code = sixDigitCode();
  await c.env.DB.prepare("UPDATE users SET verification_code = ?, code_attempts = 0, updated_at = ? WHERE email = ?").bind(code, now(), row.email).run();
  const verifyUrl = `${appUrl(c)}/api/auth/verify-link?email=${encodeURIComponent(row.email)}&code=${code}`;
  c.executionCtx.waitUntil(sendEmail(c.env, row.email, "🔑 [Nuevo Código] Verifica tu cuenta en investiando.ai", verificationEmail(row.name, code, verifyUrl, true)));
  return c.json({ success: true, message: "Verification code resent." });
});

authRoutes.post("/signin", async (c) => {
  const { email, password } = await c.req.json().catch(() => ({} as any));
  if (!email || !password) return c.json({ error: "El correo y la contraseña son obligatorios" }, 400);
  const row = await getUser(c, cleanEmailOf(email));
  if (!row) {
    return c.json({ error: "No encontramos una cuenta con ese correo. ¿Quieres registrarte?", code: "USER_NOT_FOUND" }, 404);
  }
  const pass = String(password);
  const ok = (await verifyPassword(pass, row.password_hash)) || (pass.trim() !== pass && (await verifyPassword(pass.trim(), row.password_hash)));
  if (!ok) {
    return c.json({ error: "Contraseña incorrecta. Si olvidaste tu contraseña, usa '¿Olvidaste tu contraseña?'.", code: "WRONG_PASSWORD" }, 401);
  }
  // La contraseña se comprueba antes que el estado para no revelar datos de la cuenta a quien no la conoce.
  if (!row.email_verified) {
    return c.json({ error: "Tu cuenta está pendiente de verificación. Revisa tu correo y haz clic en el enlace de activación.", code: "EMAIL_NOT_VERIFIED", needsVerification: true }, 403);
  }
  if (row.status === "suspended") {
    return c.json({ error: "Acceso suspendido. Comunícate con el administrador.", code: "ACCOUNT_SUSPENDED" }, 403);
  }

  const { data, changed } = withDefaults(parseData(row));
  await c.env.DB.prepare(
    changed ? "UPDATE users SET last_login = ?, data = ? WHERE email = ?" : "UPDATE users SET last_login = ? WHERE email = ?"
  ).bind(...(changed ? [now(), JSON.stringify(data), row.email] : [now(), row.email])).run();

  const token = await createSession(c, { email: row.email, id: row.id });
  return c.json({ success: true, user: publicUser(row), token });
});

authRoutes.post("/forgot-request", async (c) => {
  const { email } = await c.req.json().catch(() => ({} as any));
  if (!email) return c.json({ error: "El correo es obligatorio" }, 400);
  const row = await getUser(c, cleanEmailOf(email));
  if (!row) return c.json({ error: "No se encontró ningún usuario con ese correo electrónico" }, 404);

  const code = sixDigitCode();
  await c.env.DB.prepare("UPDATE users SET reset_code = ?, reset_expires = ?, code_attempts = 0, updated_at = ? WHERE email = ?")
    .bind(code, Date.now() + RESET_CODE_TTL_MS, now(), row.email).run();
  c.executionCtx.waitUntil(sendEmail(c.env, row.email, "🔒 Restablecer Contraseña - investiando.ai", resetEmail(row.name, code)));
  return c.json({ success: true, email: row.email, message: "Código de restablecimiento enviado." });
});

authRoutes.post("/forgot-reset", async (c) => {
  const { email, code, newPassword } = await c.req.json().catch(() => ({} as any));
  if (!email || !code || !newPassword) return c.json({ error: "Todos los campos son obligatorios" }, 400);
  if (String(newPassword).length < 6) return c.json({ error: "La contraseña debe tener al menos 6 caracteres" }, 400);
  const row = await getUser(c, cleanEmailOf(email));
  if (!row) return c.json({ error: "Usuario no registrado" }, 404);
  if (!row.reset_code || row.reset_code !== String(code).trim()) {
    const blocked = await failCodeAttempt(c, row);
    return c.json({ error: blocked ? TOO_MANY : "El código de restablecimiento es incorrecto" }, 400);
  }
  if (!row.reset_expires || row.reset_expires < Date.now()) {
    return c.json({ error: "El código ha expirado. Por favor solicita uno nuevo." }, 400);
  }
  // El código prueba que controla el correo, así que también queda verificado.
  await c.env.DB.prepare(
    `UPDATE users SET password_hash = ?, reset_code = NULL, reset_expires = NULL, code_attempts = 0,
       email_verified = 1, verified_at = COALESCE(verified_at, ?), updated_at = ? WHERE email = ?`
  ).bind(await hashPassword(String(newPassword)), now(), now(), row.email).run();
  return c.json({ success: true, message: "Contraseña actualizada exitosamente." });
});

authRoutes.post("/me", async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const session = (await verifyToken(c.env, body?.token)) || (await readSession(c));
  if (!session) return c.json({ error: "No autorizado" }, 401);
  const row = await getUser(c, session.email);
  if (!row || row.id !== session.id || row.status === "suspended" || !row.email_verified) {
    return c.json({ error: "Sesión inválida" }, 401);
  }
  return c.json({ success: true, user: publicUser(row) });
});

authRoutes.post("/logout", (c) => {
  clearSession(c);
  return c.json({ success: true });
});

// Bandeja virtual del servidor antiguo: exponía los códigos de verificación a cualquiera. Ya no existe.
authRoutes.get("/emails", (c) => c.json([]));
authRoutes.post("/emails/clear", (c) => c.json({ success: true }));

// --- Datos de la app del usuario (carteras, posiciones, watchlist, margen) ---
export const userRoutes = new Hono<AppEnv>();

userRoutes.use("*", requireUser);

userRoutes.get("/get-cloud-data", async (c) => {
  const session = c.get("user");
  const asked = cleanEmailOf(c.req.query("email"));
  if (asked && asked !== session.email) return c.json({ error: "No autorizado" }, 403);
  const row = await getUser(c, session.email);
  if (!row) return c.json({ success: true, data: null });
  return c.json({ success: true, data: { ...parseData(row), email: row.email, name: row.name, updatedAt: row.updated_at } });
});

userRoutes.post("/save-cloud-data", async (c) => {
  const session = c.get("user");
  const { email, data } = await c.req.json().catch(() => ({} as any));
  if (!data || typeof data !== "object" || Array.isArray(data)) return c.json({ error: "Datos requeridos" }, 400);
  if (email && cleanEmailOf(email) !== session.email) return c.json({ error: "No autorizado" }, 403);

  const patch: Record<string, unknown> = { ...data };
  for (const k of PROTECTED_KEYS) delete patch[k];
  patch.updatedAt = now();
  const json = JSON.stringify(patch);
  if (json.length > 1_500_000) return c.json({ error: "Datos demasiado grandes" }, 413);

  // json_patch mezcla en el servidor (como el merge de Firestore) sin leer y reescribir todo.
  const res = await c.env.DB.prepare("UPDATE users SET data = json_patch(data, ?), updated_at = ? WHERE email = ?")
    .bind(json, now(), session.email).run();
  if (!res.meta.changes) return c.json({ error: "Usuario no encontrado" }, 404);
  return c.json({ success: true });
});
