// Cobros con Paddle en el navegador: estado del plan (GET /api/billing/status), Paddle.js para el
// checkout (overlay), portal de cliente y el selector de planes (PricingModal), que se abre desde
// cualquier sitio con openUpgrade() o cuando una ruta responde 402 PRO_REQUIRED.

import { useEffect, useState } from "react";

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

export interface BillingConfig {
  configured: boolean;
  environment: "sandbox" | "production";
  clientToken: string | null;
  prices: { monthly: string | null; annual: string | null };
  trialDays: number;
}

// Precios que se muestran (los cobra Paddle según los precios configurados en su panel)
export const PRICES = { annual: 60, monthly: 6.5 };
export const ANNUAL_SAVING = Math.round((1 - PRICES.annual / (PRICES.monthly * 12)) * 100); // 23 %

// ---------------------------------------------------------------- estado compartido

type State = { info: PlanInfo | null; loading: boolean; upgradeOpen: boolean; upgradeReason: string | null };
let state: State = { info: null, loading: false, upgradeOpen: false, upgradeReason: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

let configPromise: Promise<BillingConfig | null> | null = null;
export function getBillingConfig(): Promise<BillingConfig | null> {
  if (!configPromise)
    configPromise = fetch("/api/billing/config")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  return configPromise;
}

export async function refreshPlan(): Promise<PlanInfo | null> {
  set({ loading: true });
  try {
    const r = await fetch("/api/billing/status", { credentials: "include", headers: authHeaders() });
    const info = r.ok ? ((await r.json()) as PlanInfo) : null;
    set({ info, loading: false });
    return info;
  } catch {
    set({ loading: false });
    return null;
  }
}

function authHeaders(): Record<string, string> {
  try {
    const t = localStorage.getItem("stock_tracker_user_token");
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch {
    return {};
  }
}

export function openUpgrade(reason?: string) {
  set({ upgradeOpen: true, upgradeReason: reason ?? null });
}
export function closeUpgrade() {
  set({ upgradeOpen: false, upgradeReason: null });
}

/** Para llamadas automáticas que cuestan IA: false solo si se sabe que el plan es gratuito. */
export const isProNow = () => !state.info || state.info.plan === "pro";

/** Plan del usuario. isPro es true mientras no se sabe (para no parpadear con candados) y si Paddle aún no está configurado. */
export function usePlan() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  const info = state.info;
  return {
    info,
    loading: state.loading,
    isPro: !info || info.plan === "pro",
    upgradeOpen: state.upgradeOpen,
    upgradeReason: state.upgradeReason,
  };
}

// ---------------------------------------------------------------- 402 → selector de planes

let intercepting = false;
/** Cualquier respuesta 402 PRO_REQUIRED de la API abre el selector de planes. */
export function installProInterceptor() {
  if (intercepting || typeof window === "undefined") return;
  intercepting = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const res = await orig(...args);
    if (res.status === 402) {
      res
        .clone()
        .json()
        .then((j) => j?.code === "PRO_REQUIRED" && openUpgrade("ai"))
        .catch(() => {});
    }
    return res;
  };
}

// ---------------------------------------------------------------- Paddle.js

declare global {
  interface Window {
    Paddle?: any;
  }
}

let paddlePromise: Promise<any> | null = null;
function loadPaddle(cfg: BillingConfig): Promise<any> {
  if (!paddlePromise)
    paddlePromise = new Promise((resolve, reject) => {
      const init = () => {
        try {
          const P = window.Paddle;
          if (cfg.environment === "sandbox") P.Environment.set("sandbox");
          P.Initialize({
            token: cfg.clientToken,
            eventCallback: (e: any) => {
              if (e?.name === "checkout.completed") onCheckoutCompleted();
            },
          });
          resolve(P);
        } catch (err) {
          reject(err);
        }
      };
      if (window.Paddle) return init();
      const s = document.createElement("script");
      s.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
      s.async = true;
      s.onload = init;
      s.onerror = () => {
        paddlePromise = null;
        reject(new Error("No se pudo cargar Paddle"));
      };
      document.head.appendChild(s);
    });
  return paddlePromise;
}

// Tras pagar, el webhook de Paddle tarda unos segundos en llegar: se consulta el plan hasta que sea Pro
async function onCheckoutCompleted() {
  for (let i = 0; i < 12; i++) {
    const info = await refreshPlan();
    if (info?.plan === "pro" && info.reason === "subscription") break;
    await new Promise((r) => setTimeout(r, 2500));
  }
  setTimeout(() => {
    try {
      window.Paddle?.Checkout.close();
    } catch {
      // ya cerrado
    }
    closeUpgrade();
  }, 2500);
}

export async function startCheckout(opts: { interval: "annual" | "monthly"; email?: string | null; userId?: string | null; theme: "dark" | "light"; language: "EN" | "ES" }) {
  const cfg = await getBillingConfig();
  if (!cfg?.configured || !cfg.clientToken) throw new Error("not-configured");
  const priceId = opts.interval === "annual" ? cfg.prices.annual : cfg.prices.monthly;
  const P = await loadPaddle(cfg);
  P.Checkout.open({
    items: [{ priceId, quantity: 1 }],
    ...(opts.email ? { customer: { email: opts.email } } : {}),
    customData: { user_id: opts.userId ?? null, email: opts.email ?? null },
    settings: { displayMode: "overlay", theme: opts.theme, locale: opts.language === "ES" ? "es" : "en", allowLogout: false },
  });
}

/** Portal de cliente de Paddle (cambiar tarjeta, plan o cancelar). */
export async function openBillingPortal(): Promise<void> {
  const r = await fetch("/api/billing/portal", { method: "POST", credentials: "include", headers: authHeaders() });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.url) throw new Error(j?.error || "portal");
  window.open(j.url, "_blank", "noopener");
}
