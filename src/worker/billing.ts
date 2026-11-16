import { Hono, type MiddlewareHandler } from "hono";
import type { AppEnv, Env } from "./env";
import { readSession, requireUser } from "./auth/session";

// Cobros con Paddle Billing (Merchant of Record: Paddle cobra, factura y gestiona los impuestos).
// - El navegador abre el checkout de Paddle.js con el precio elegido y custom_data { user_id }.
// - Paddle avisa por webhook (firmado) de cada cambio de la suscripción; se guarda en D1 (subscriptions).
// - Plan Pro = suscripción en prueba, activa o con un pago pendiente (past_due), o administrador.
// - Sin Paddle configurado (falta el client token o los precios), todo el mundo tiene acceso completo:
//   así la app no se bloquea antes de tener la cuenta.
// Variables: PADDLE_ENV ("sandbox" | "production"), PADDLE_CLIENT_TOKEN, PADDLE_PRICE_MONTHLY,
// PADDLE_PRICE_ANNUAL; secretos: PADDLE_API_KEY (portal de cliente) y PADDLE_WEBHOOK_SECRET.

const PRO_STATUSES = new Set(["trialing", "active", "past_due"]);

export function billingConfigured(env: Env): boolean {
  return !!(env.PADDLE_CLIENT_TOKEN && env.PADDLE_PRICE_MONTHLY && env.PADDLE_PRICE_ANNUAL);
}

const apiBase = (env: Env) => (env.PADDLE_ENV === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com");

interface SubRow {
  id: string;
  customer_id: string | null;
  status: string;
  interval: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  next_billed_at: string | null;
  cancel_at: string | null;
}

async function latestSubscription(env: Env, userId: string, email: string): Promise<SubRow | null> {
  // La que da acceso primero; si no, la más reciente
  const { results } = await env.DB.prepare(
    "SELECT id, customer_id, status, interval, trial_ends_at, current_period_end, next_billed_at, cancel_at FROM subscriptions WHERE user_id = ? OR lower(email) = lower(?) ORDER BY updated_at DESC"
  )
    .bind(userId, email)
    .all<SubRow>();
  const rows = results ?? [];
  return rows.find((r) => PRO_STATUSES.has(r.status)) ?? rows[0] ?? null;
}

export interface PlanInfo {
  configured: boolean;
  plan: "pro" | "free";
  reason: "admin" | "subscription" | "unconfigured" | "none";
  status: string | null;
  interval: string | null;
  trialEndsAt: string | null;
  renewsAt: string | null;
  cancelAt: string | null;
  hasCustomer: boolean;
}

export async function planOf(env: Env, user: { id: string; email: string }): Promise<PlanInfo> {
  const configured = billingConfigured(env);
  const base: PlanInfo = { configured, plan: "free", reason: "none", status: null, interval: null, trialEndsAt: null, renewsAt: null, cancelAt: null, hasCustomer: false };
  const row = await env.DB.prepare("SELECT role FROM users WHERE id = ?").bind(user.id).first<{ role: string }>();
  const sub = await latestSubscription(env, user.id, user.email).catch(() => null);
  const subInfo = sub
    ? { status: sub.status, interval: sub.interval, trialEndsAt: sub.trial_ends_at, renewsAt: sub.next_billed_at ?? sub.current_period_end, cancelAt: sub.cancel_at, hasCustomer: !!sub.customer_id }
    : {};
  if (row?.role === "admin") return { ...base, ...subInfo, plan: "pro", reason: "admin" };
  if (!configured) return { ...base, ...subInfo, plan: "pro", reason: "unconfigured" };
  if (sub && PRO_STATUSES.has(sub.status)) return { ...base, ...subInfo, plan: "pro", reason: "subscription" };
  return { ...base, ...subInfo };
}

/** Rutas solo para Pro (las de IA, que cuestan dinero). Va después de requireUser. */
export const requirePro: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get("user") ?? (await readSession(c));
  if (!user) return c.json({ error: "Sesión no iniciada o vencida." }, 401);
  const p = await planOf(c.env, user);
  if (p.plan !== "pro") return c.json({ error: "Función del plan Pro.", code: "PRO_REQUIRED" }, 402);
  await next();
};

// ---------------------------------------------------------------- webhook

/** Firma de Paddle: cabecera "ts=…;h1=…", HMAC-SHA256 de "ts:cuerpo" con el secreto del destino. */
async function validSignature(secret: string, header: string | undefined, body: string): Promise<boolean> {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(";").map((kv) => kv.split("=") as [string, string]));
  const ts = parts.ts;
  const h1 = parts.h1;
  if (!ts || !h1) return false;
  // Eventos de más de 5 minutos: posible reenvío malicioso
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}:${body}`)));
  const hex = Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
  if (hex.length !== h1.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ h1.charCodeAt(i);
  return diff === 0;
}

async function upsertSubscription(env: Env, d: any, occurredAt: string) {
  const item = Array.isArray(d.items) ? d.items[0] : null;
  const userId = d.custom_data?.user_id ? String(d.custom_data.user_id) : null;
  let email = d.custom_data?.email ? String(d.custom_data.email) : null;
  if (!userId && !email && d.customer_id && env.PADDLE_API_KEY) {
    // Suscripción creada fuera de la app: el correo del cliente de Paddle
    const r = await fetch(`${apiBase(env)}/customers/${d.customer_id}`, { headers: { Authorization: `Bearer ${env.PADDLE_API_KEY}` } }).catch(() => null);
    const j: any = r && r.ok ? await r.json().catch(() => null) : null;
    email = j?.data?.email ?? null;
  }
  const prev = await env.DB.prepare("SELECT occurred_at FROM subscriptions WHERE id = ?").bind(d.id).first<{ occurred_at: string | null }>();
  if (prev?.occurred_at && prev.occurred_at > occurredAt) return; // evento antiguo que llega tarde
  await env.DB.prepare(
    `INSERT INTO subscriptions (id, user_id, email, customer_id, status, price_id, interval, trial_ends_at, current_period_end, next_billed_at, cancel_at, canceled_at, occurred_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET user_id = COALESCE(excluded.user_id, subscriptions.user_id), email = COALESCE(excluded.email, subscriptions.email),
       customer_id = excluded.customer_id, status = excluded.status, price_id = excluded.price_id, interval = excluded.interval,
       trial_ends_at = excluded.trial_ends_at, current_period_end = excluded.current_period_end, next_billed_at = excluded.next_billed_at,
       cancel_at = excluded.cancel_at, canceled_at = excluded.canceled_at, occurred_at = excluded.occurred_at, updated_at = excluded.updated_at`
  )
    .bind(
      d.id,
      userId,
      email,
      d.customer_id ?? null,
      String(d.status || "active"),
      item?.price?.id ?? null,
      item?.price?.billing_cycle?.interval ?? null,
      item?.trial_dates?.ends_at ?? null,
      d.current_billing_period?.ends_at ?? null,
      d.next_billed_at ?? null,
      d.scheduled_change?.action === "cancel" ? d.scheduled_change.effective_at ?? null : null,
      d.canceled_at ?? null,
      occurredAt,
      new Date().toISOString()
    )
    .run();
}

// ---------------------------------------------------------------- rutas

export const billingRoutes = new Hono<AppEnv>();

// Datos públicos para Paddle.js (el client token es público por diseño)
billingRoutes.get("/config", (c) =>
  c.json({
    configured: billingConfigured(c.env),
    environment: c.env.PADDLE_ENV === "production" ? "production" : "sandbox",
    clientToken: c.env.PADDLE_CLIENT_TOKEN ?? null,
    prices: { monthly: c.env.PADDLE_PRICE_MONTHLY ?? null, annual: c.env.PADDLE_PRICE_ANNUAL ?? null },
    trialDays: 7,
  })
);

billingRoutes.get("/status", requireUser, async (c) => c.json(await planOf(c.env, c.get("user"))));

// Portal de cliente de Paddle (cambiar tarjeta, plan o cancelar)
billingRoutes.post("/portal", requireUser, async (c) => {
  const user = c.get("user");
  if (!c.env.PADDLE_API_KEY) return c.json({ error: "Falta PADDLE_API_KEY en el Worker." }, 503);
  const sub = await latestSubscription(c.env, user.id, user.email);
  if (!sub?.customer_id) return c.json({ error: "No tienes una suscripción." }, 404);
  const r = await fetch(`${apiBase(c.env)}/customers/${sub.customer_id}/portal-sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.env.PADDLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ subscription_ids: [sub.id] }),
  });
  const j: any = await r.json().catch(() => null);
  if (!r.ok) {
    console.error("[billing] portal", r.status, JSON.stringify(j).slice(0, 300));
    return c.json({ error: "Paddle no respondió. Inténtalo de nuevo." }, 502);
  }
  const subUrls = j?.data?.urls?.subscriptions?.[0] ?? {};
  return c.json({ url: j?.data?.urls?.general?.overview ?? null, cancelUrl: subUrls.cancel_subscription ?? null, updatePaymentUrl: subUrls.update_subscription_payment_method ?? null });
});

billingRoutes.post("/webhook", async (c) => {
  const body = await c.req.text();
  if (!c.env.PADDLE_WEBHOOK_SECRET || !(await validSignature(c.env.PADDLE_WEBHOOK_SECRET, c.req.header("Paddle-Signature"), body))) {
    return c.json({ error: "Firma no válida" }, 401);
  }
  const evt: any = JSON.parse(body);
  const type = String(evt?.event_type || "");
  if (type.startsWith("subscription.") && evt?.data?.id) {
    await upsertSubscription(c.env, evt.data, String(evt.occurred_at || new Date().toISOString()));
  }
  // Paddle solo necesita un 200 rápido; el resto de eventos (transacciones…) no se usa
  return c.json({ ok: true });
});

