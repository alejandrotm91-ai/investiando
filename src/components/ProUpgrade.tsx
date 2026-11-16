import React, { useEffect, useState } from "react";
import { Check, Crown, Lock, X, Sparkles, CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { ANNUAL_SAVING, PRICES, closeUpgrade, getBillingConfig, openBillingPortal, openUpgrade, startCheckout, usePlan, type BillingConfig, type PlanInfo } from "../lib/billing";

// Plan Pro: selector de planes (modal), candado de las funciones Pro, tarjeta del menú lateral y
// tarjeta de suscripción de Mi Cuenta. Los colores van por tema con clases propias (no las de
// Tailwind que reescribe el modo claro de index.css).

type Lang = "EN" | "ES";
type Theme = "dark" | "light";

const PRO_FEATURES = (es: boolean) => [
  es ? "KPIs y segmentos de cada empresa" : "Company KPIs and segments",
  es ? "Valoración: múltiplos, valor razonable, DCF y motores de Bogle" : "Valuation: multiples, fair value, DCF and Bogle engines",
  es ? "Simulación y Análisis de tu cartera" : "Portfolio Simulation and Analysis",
  es ? "Analista IA, noticias y carteras creadas con IA" : "AI analyst, news and AI-built portfolios",
  es ? "Hasta 2 carteras" : "Up to 2 portfolios",
];

const palette = (theme: Theme) =>
  theme === "light"
    ? { panel: "#fbfaf7", card: "#ffffff", line: "#e3ded2", lineStrong: "#1f1e22", text: "#1b1917", muted: "#787366", soft: "#f3f0e8", cta: "#2b2a2e", ctaText: "#ffffff", accent: "#047857", accentSoft: "#e6f4ec" }
    : { panel: "#0f111a", card: "#151826", line: "#262b3b", lineStrong: "#e5e7eb", text: "#f1f5f9", muted: "#8b90a0", soft: "#1b1f2e", cta: "#10b981", ctaText: "#04130d", accent: "#34d399", accentSoft: "rgba(52,211,153,0.12)" };

const fmtUsd = (v: number) => `$${v % 1 ? v.toFixed(2) : v}`;
const fmtDate = (iso: string | null, es: boolean) =>
  iso ? new Date(iso).toLocaleDateString(es ? "es-ES" : "en-US", { day: "numeric", month: "short", year: "numeric" }) : "—";

// ---------------------------------------------------------------- selector de planes

export function PricingModal({ language, theme, user }: { language: Lang; theme: Theme; user: { id?: string; email?: string } | null }) {
  const es = language === "ES";
  const p = palette(theme);
  const { upgradeOpen, upgradeReason } = usePlan();
  const [period, setPeriod] = useState<"annual" | "monthly">("annual");
  const [cfg, setCfg] = useState<BillingConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (upgradeOpen) getBillingConfig().then(setCfg);
    setErr(null);
  }, [upgradeOpen]);
  useEffect(() => {
    if (!upgradeOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeUpgrade();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [upgradeOpen]);
  if (!upgradeOpen) return null;

  const trial = cfg?.trialDays ?? 7;
  const price = period === "annual" ? `${fmtUsd(PRICES.annual)}${es ? "/año" : "/yr"}` : `${fmtUsd(PRICES.monthly)}${es ? "/mes" : "/mo"}`;
  const reasonLine: Record<string, [string, string]> = {
    kpis: ["Los KPIs y segmentos son parte de Pro", "KPIs and segments are part of Pro"],
    valuation: ["La valoración es parte de Pro", "Valuation is part of Pro"],
    portfolio: ["Simulación y Análisis son parte de Pro", "Simulation and Analysis are part of Pro"],
    ai: ["Las funciones con IA son parte de Pro", "AI features are part of Pro"],
    portfolios: ["Con Pro puedes tener 2 carteras", "Pro lets you keep 2 portfolios"],
  };
  const sub = upgradeReason && reasonLine[upgradeReason] ? reasonLine[upgradeReason][es ? 0 : 1] : es ? "Acceso completo a Investiando" : "Full access to Investiando";

  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      await startCheckout({ interval: period, email: user?.email, userId: user?.id, theme, language });
    } catch (e: any) {
      setErr(
        e?.message === "not-configured"
          ? es ? "Los pagos estarán disponibles muy pronto." : "Payments will be available very soon."
          : es ? "No se pudo abrir el pago. Inténtalo de nuevo." : "Couldn't open checkout. Please try again."
      );
    } finally {
      setBusy(false);
    }
  };

  const PlanCard = ({ id, title, big, small, badge }: { id: "annual" | "monthly"; title: string; big: string; small: string; badge?: string }) => {
    const active = period === id;
    return (
      <button
        type="button"
        onClick={() => setPeriod(id)}
        aria-pressed={active}
        className="relative text-left rounded-2xl p-4 pt-5 transition-all cursor-pointer"
        style={{ background: active ? p.soft : p.card, border: `${active ? 2 : 1}px solid ${active ? p.lineStrong : p.line}` }}
      >
        {badge && (
          <span className="absolute -top-2.5 left-3 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: p.lineStrong, color: p.card }}>
            <Sparkles size={10} />
            {badge}
          </span>
        )}
        <span
          className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center"
          style={{ background: active ? p.lineStrong : "transparent", border: active ? "none" : `1.5px solid ${p.line}` }}
        >
          {active && <Check size={12} color={p.card} strokeWidth={3} />}
        </span>
        <span className="block text-sm font-semibold" style={{ color: p.muted }}>
          {title}
        </span>
        <span className="block mt-1">
          <span className="text-2xl font-bold" style={{ color: p.text }}>
            {big.split("/")[0]}
          </span>
          <span className="text-sm" style={{ color: p.muted }}>
            /{big.split("/")[1]}
          </span>
        </span>
        <span className="block text-xs mt-1" style={{ color: p.muted }}>
          {small}
        </span>
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeUpgrade} />
      <div className="relative w-full max-w-[440px] rounded-3xl shadow-2xl overflow-hidden" style={{ background: p.panel, border: `1px solid ${p.line}` }}>
        <button type="button" onClick={closeUpgrade} className="absolute top-4 right-4 p-1 rounded-lg cursor-pointer" style={{ color: p.muted }} aria-label={es ? "Cerrar" : "Close"}>
          <X size={18} />
        </button>
        <div className="px-6 pt-7 pb-6 space-y-5">
          <div className="text-center space-y-1.5">
            <div className="mx-auto w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: p.accentSoft, color: p.accent }}>
              <Crown size={20} />
            </div>
            <h2 className="text-xl font-bold font-mono tracking-tight" style={{ color: p.text }}>
              {es ? "Elige tu plan" : "Choose your plan"}
            </h2>
            <p className="text-sm" style={{ color: p.muted }}>
              {sub}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <PlanCard id="annual" title={es ? "Anual" : "Annual"} big={`${fmtUsd(PRICES.annual)}/${es ? "año" : "yr"}`} small={`${fmtUsd(PRICES.annual / 12)}/${es ? "mes" : "mo"}`} badge={`${es ? "Ahorra" : "Save"} ${ANNUAL_SAVING}%`} />
            <PlanCard id="monthly" title={es ? "Mensual" : "Monthly"} big={`${fmtUsd(PRICES.monthly)}/${es ? "mes" : "mo"}`} small={`${fmtUsd(PRICES.monthly * 12)}/${es ? "año" : "yr"}`} />
          </div>

          <ul className="space-y-2">
            {PRO_FEATURES(es).map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-[13px]" style={{ color: p.text }}>
                <span className="mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{ background: p.accentSoft, color: p.accent }}>
                  <Check size={10} strokeWidth={3} />
                </span>
                {f}
              </li>
            ))}
          </ul>

          <div className="space-y-2">
            <button
              type="button"
              onClick={go}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold cursor-pointer transition-transform hover:-translate-y-px disabled:opacity-70"
              style={{ background: p.cta, color: p.ctaText }}
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
              {es ? `Empezar ${trial} días gratis` : `Start ${trial}-day free trial`}
            </button>
            <p className="text-center text-xs" style={{ color: p.muted }}>
              {es ? `Después ${price}. Cancela cuando quieras antes de que termine la prueba y no se te cobra nada.` : `Then ${price}. Cancel anytime before the trial ends and you won't be charged.`}
            </p>
            {err && (
              <p className="text-center text-xs font-semibold" style={{ color: "#e11d48" }}>
                {err}
              </p>
            )}
          </div>

          <p className="flex items-center justify-center gap-1.5 text-[11px]" style={{ color: p.muted }}>
            <ShieldCheck size={12} />
            {es ? "Pago seguro con Paddle · Paddle.com es el revendedor oficial" : "Secure payment with Paddle · Paddle.com is the merchant of record"}
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- candado de una función Pro

export function ProGate({ language, theme, feature, title, children }: { language: Lang; theme: Theme; feature: string; title: string; children: React.ReactNode }) {
  const { isPro } = usePlan();
  if (isPro) return <>{children}</>;
  const es = language === "ES";
  const p = palette(theme);
  return (
    <div className="rounded-3xl px-6 py-12 sm:py-16 flex flex-col items-center text-center gap-5" style={{ background: p.panel, border: `1px solid ${p.line}` }}>
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: p.accentSoft, color: p.accent }}>
        <Lock size={24} />
      </div>
      <div className="space-y-1.5 max-w-md">
        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: p.accentSoft, color: p.accent }}>
          <Crown size={11} /> Pro
        </span>
        <h3 className="text-lg font-bold" style={{ color: p.text }}>
          {title}
        </h3>
        <p className="text-sm" style={{ color: p.muted }}>
          {es ? "Disponible en el plan Pro. Pruébalo 7 días gratis y cancela cuando quieras." : "Available on the Pro plan. Try it free for 7 days and cancel anytime."}
        </p>
      </div>
      <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-left">
        {PRO_FEATURES(es).map((f) => (
          <li key={f} className="flex items-start gap-2 text-xs" style={{ color: p.text }}>
            <Check size={13} className="mt-0.5 shrink-0" style={{ color: p.accent }} />
            {f}
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => openUpgrade(feature)} className="rounded-2xl px-6 py-3 text-sm font-bold cursor-pointer transition-transform hover:-translate-y-px" style={{ background: p.cta, color: p.ctaText }}>
        {es ? `Probar Pro gratis · desde ${fmtUsd(PRICES.annual / 12)}/mes` : `Try Pro free · from ${fmtUsd(PRICES.annual / 12)}/mo`}
      </button>
    </div>
  );
}

/** Insignia pequeña para pestañas y botones Pro (solo en el plan gratuito). */
export function ProBadge({ theme }: { theme: Theme }) {
  const { isPro } = usePlan();
  if (isPro) return null;
  const p = palette(theme);
  return (
    <span className="inline-flex items-center gap-0.5 rounded-md px-1 py-px text-[9px] font-black tracking-wider" style={{ background: p.accentSoft, color: p.accent }}>
      <Lock size={8} strokeWidth={3} />
      PRO
    </span>
  );
}

// ---------------------------------------------------------------- menú lateral

export function SidebarPlanCard({ language, theme }: { language: Lang; theme: Theme }) {
  const { info, isPro } = usePlan();
  const es = language === "ES";
  const p = palette(theme);
  if (!info || info.reason === "unconfigured") return null;
  if (isPro) {
    const trial = info.status === "trialing" && info.trialEndsAt;
    return (
      <div className="mx-3 mb-3 rounded-2xl px-3 py-2.5 flex items-center gap-2.5" style={{ background: p.accentSoft }}>
        <Crown size={15} style={{ color: p.accent }} />
        <div className="min-w-0">
          <div className="text-xs font-bold" style={{ color: p.text }}>
            {info.reason === "admin" ? (es ? "Pro · Administrador" : "Pro · Admin") : es ? "Plan Pro" : "Pro plan"}
          </div>
          {trial && (
            <div className="text-[10px]" style={{ color: p.muted }}>
              {es ? "Prueba hasta el" : "Trial until"} {fmtDate(info.trialEndsAt, es)}
            </div>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="mx-3 mb-3 rounded-2xl p-3.5 space-y-2.5" style={{ background: p.card, border: `1px solid ${p.line}` }}>
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ background: p.accentSoft, color: p.accent }}>
          <Crown size={14} />
        </span>
        <div>
          <div className="text-xs font-bold" style={{ color: p.text }}>
            Investiando Pro
          </div>
          <div className="text-[10px]" style={{ color: p.muted }}>
            {es ? `7 días gratis · ${fmtUsd(PRICES.annual / 12)}/mes` : `7 days free · ${fmtUsd(PRICES.annual / 12)}/mo`}
          </div>
        </div>
      </div>
      <button type="button" onClick={() => openUpgrade()} className="w-full rounded-xl py-2 text-xs font-bold cursor-pointer" style={{ background: p.cta, color: p.ctaText }}>
        {es ? "Mejorar a Pro" : "Upgrade to Pro"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- Mi Cuenta

const statusLabel = (info: PlanInfo, es: boolean) => {
  const m: Record<string, [string, string]> = {
    trialing: ["En prueba", "Trial"],
    active: ["Activa", "Active"],
    past_due: ["Pago pendiente", "Payment due"],
    paused: ["En pausa", "Paused"],
    canceled: ["Cancelada", "Canceled"],
  };
  return info.status && m[info.status] ? m[info.status][es ? 0 : 1] : null;
};

export function SubscriptionCard({ language, theme }: { language: Lang; theme: Theme }) {
  const { info, isPro } = usePlan();
  const es = language === "ES";
  const p = palette(theme);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!info) return null;
  const st = statusLabel(info, es);
  const portal = async () => {
    setBusy(true);
    setErr(null);
    try {
      await openBillingPortal();
    } catch {
      setErr(es ? "No se pudo abrir la gestión de la suscripción." : "Couldn't open subscription management.");
    } finally {
      setBusy(false);
    }
  };
  const rows: [string, string][] = [];
  if (info.interval) rows.push([es ? "Facturación" : "Billing", info.interval === "year" ? (es ? `Anual · ${fmtUsd(PRICES.annual)}` : `Annual · ${fmtUsd(PRICES.annual)}`) : es ? `Mensual · ${fmtUsd(PRICES.monthly)}` : `Monthly · ${fmtUsd(PRICES.monthly)}`]);
  const trial = info.status === "trialing" && info.trialEndsAt;
  if (trial) rows.push([es ? "Prueba gratis hasta (primer cobro)" : "Free trial until (first charge)", fmtDate(info.trialEndsAt!, es)]);
  if (info.cancelAt) rows.push([es ? "Se cancela el" : "Cancels on", fmtDate(info.cancelAt, es)]);
  else if (!(trial && info.renewsAt && fmtDate(info.renewsAt, es) === fmtDate(info.trialEndsAt!, es)) && info.renewsAt && (info.status === "active" || info.status === "trialing" || info.status === "past_due")) rows.push([es ? "Próximo cobro" : "Next charge", fmtDate(info.renewsAt, es)]);

  return (
    <div id="subscription-card" className="rounded-2xl p-6 space-y-4" style={{ background: p.panel, border: `1px solid ${p.line}` }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: p.accentSoft, color: p.accent }}>
            <Crown size={17} />
          </span>
          <div>
            <h3 className="text-sm font-bold" style={{ color: p.text }}>
              {es ? "Suscripción" : "Subscription"}
            </h3>
            <p className="text-xs" style={{ color: p.muted }}>
              {info.reason === "admin"
                ? es ? "Plan Pro (administrador)" : "Pro plan (admin)"
                : info.reason === "unconfigured"
                  ? es ? "Acceso completo durante el lanzamiento" : "Full access during launch"
                  : isPro ? (es ? "Plan Pro" : "Pro plan") : es ? "Plan gratuito" : "Free plan"}
            </p>
          </div>
        </div>
        {st && (
          <span className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider" style={{ background: p.accentSoft, color: p.accent }}>
            {st}
          </span>
        )}
      </div>
      {rows.length > 0 && (
        <dl className="grid grid-cols-2 gap-3">
          {rows.map(([k, v]) => (
            <div key={k} className="rounded-xl px-3 py-2.5" style={{ background: p.card, border: `1px solid ${p.line}` }}>
              <dt className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: p.muted }}>
                {k}
              </dt>
              <dd className="text-sm font-semibold mt-0.5" style={{ color: p.text }}>
                {v}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <div className="flex flex-wrap gap-2">
        {info.hasCustomer && (
          <button type="button" onClick={portal} disabled={busy} className="rounded-xl px-4 py-2 text-xs font-bold cursor-pointer inline-flex items-center gap-1.5" style={{ background: p.card, color: p.text, border: `1px solid ${p.line}` }}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <CreditCard size={13} />}
            {es ? "Gestionar suscripción" : "Manage subscription"}
          </button>
        )}
        {!isPro && (
          <button type="button" onClick={() => openUpgrade()} className="rounded-xl px-4 py-2 text-xs font-bold cursor-pointer" style={{ background: p.cta, color: p.ctaText }}>
            {es ? "Mejorar a Pro · 7 días gratis" : "Upgrade to Pro · 7 days free"}
          </button>
        )}
      </div>
      {info.hasCustomer && (
        <p className="text-[11px]" style={{ color: p.muted }}>
          {es ? "Desde ahí cambias la tarjeta, el plan o cancelas. Las facturas te llegan por correo desde Paddle." : "Change your card or plan, or cancel there. Paddle emails your invoices."}
        </p>
      )}
      {err && (
        <p className="text-xs font-semibold" style={{ color: "#e11d48" }}>
          {err}
        </p>
      )}
    </div>
  );
}
