import { WorkerMailer } from "worker-mailer";
import type { Env } from "./env";

// Envío de correos (verificación y recuperación de contraseña).
// 1) SMTP, como el servidor antiguo (p. ej. Gmail con contraseña de aplicación): secretos SMTP_HOST,
//    SMTP_USER, SMTP_PASS y opcionales SMTP_PORT (465 por defecto: TLS directo; 587: STARTTLS) y
//    SMTP_FROM ("investiando <cuenta@gmail.com>"; por defecto, SMTP_USER). Va por un socket TCP del
//    Worker (cloudflare:sockets) con worker-mailer.
// 2) Si no hay SMTP: la API HTTP de Resend (RESEND_API_KEY y EMAIL_FROM).
// Sin ninguno, el correo no se envía y solo queda en el registro del Worker (npx wrangler tail).

export type EmailProvider = "smtp" | "resend";
export interface EmailResult {
  ok: boolean;
  provider: EmailProvider | null;
  /** Motivo del fallo (para el registro y el panel de administración; no se muestra a los usuarios). */
  error?: string;
}

export function emailProvider(env: Env): EmailProvider | null {
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) return "smtp";
  if (env.RESEND_API_KEY && env.EMAIL_FROM) return "resend";
  return null;
}

/** Remitente: "Nombre <correo>" o solo el correo. */
export function emailSender(env: Env): string {
  return emailProvider(env) === "smtp" ? env.SMTP_FROM || env.SMTP_USER || "" : env.EMAIL_FROM || "";
}

function parseAddress(s: string): { name?: string; email: string } {
  const m = s.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].trim() || undefined, email: m[2].trim() } : { email: s.trim() };
}

async function viaSmtp(env: Env, to: string, subject: string, html: string): Promise<void> {
  const port = Number(env.SMTP_PORT || 465);
  const secure = port === 465;
  await WorkerMailer.send(
    {
      host: String(env.SMTP_HOST),
      port,
      secure,
      startTls: !secure,
      credentials: { username: String(env.SMTP_USER), password: String(env.SMTP_PASS) },
      authType: ["plain", "login"],
      socketTimeoutMs: 10000,
      responseTimeoutMs: 10000,
    },
    { from: parseAddress(emailSender(env)), to: { email: to }, subject, html }
  );
}

async function viaResend(env: Env, to: string, subject: string, html: string): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, html }),
  });
  if (!res.ok) throw new Error(`Resend respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

/** Envía y dice si salió y, si no, por qué. */
export async function deliverEmail(env: Env, to: string, subject: string, html: string): Promise<EmailResult> {
  const provider = emailProvider(env);
  if (!provider) {
    console.log(`[Email sin proveedor] Para: ${to} | Asunto: ${subject}`);
    return { ok: false, provider: null, error: "No hay proveedor de correo configurado (secretos SMTP_* o RESEND_API_KEY/EMAIL_FROM)." };
  }
  try {
    if (provider === "smtp") await viaSmtp(env, to, subject, html);
    else await viaResend(env, to, subject, html);
    return { ok: true, provider };
  } catch (err: any) {
    const error = String(err?.message || err).slice(0, 400);
    console.error(`[Email] Falló el envío por ${provider} a ${to}: ${error}`);
    return { ok: false, provider, error };
  }
}

export async function sendEmail(env: Env, to: string, subject: string, html: string): Promise<boolean> {
  return (await deliverEmail(env, to, subject, html)).ok;
}
