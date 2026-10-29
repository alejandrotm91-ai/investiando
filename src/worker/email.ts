import type { Env } from "./env";

// Envío de correos (verificación y recuperación de contraseña) con la API HTTP de Resend.
// Requiere los secretos RESEND_API_KEY y EMAIL_FROM (p. ej. "investiando <no-reply@tudominio.com>").
// Si no están configurados, el correo no se envía y solo queda en el registro del Worker
// (visible con `npx wrangler tail`), para poder probar sin proveedor.
export async function sendEmail(env: Env, to: string, subject: string, html: string): Promise<boolean> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    console.log(`[Email sin proveedor] Para: ${to} | Asunto: ${subject}`);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, html }),
    });
    if (!res.ok) {
      console.error(`[Email] Resend respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return false;
    }
    return true;
  } catch (err: any) {
    console.error("[Email] Error enviando con Resend:", err?.message || err);
    return false;
  }
}
