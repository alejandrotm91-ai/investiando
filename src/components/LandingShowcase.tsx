import React, { useEffect, useRef, useState } from "react";

// Página de presentación (antes de iniciar sesión): un recorrido vertical por las funciones de la app
// que aparece a medida que se hace scroll. Colores propios por tema (variables CSS en la raíz) para
// que las reglas generales de modo claro de index.css no la alteren. Los botones abren el modal de
// acceso de LandingPage.

interface Props {
  language: "EN" | "ES";
  theme: "light" | "dark";
  onThemeChange: (t: "light" | "dark") => void;
  onLanguageChange?: (l: "EN" | "ES") => void;
  onSignIn: () => void;
  onSignUp: () => void;
}

const PALETTE: Record<"light" | "dark", Record<string, string>> = {
  dark: {
    bg: "#0b0d13", band: "#0f121a", card: "#131621", "card-2": "#1a1e2b", line: "#262b3a", "line-strong": "#3a4052",
    text: "#f1f5f9", muted: "#a3abbd", "nav-bg": "rgba(11,13,19,0.78)",
    "accent-text": "#34d399", "accent-bg": "#10b981", "on-accent": "#04130d", "accent-soft": "rgba(52,211,153,0.13)", "accent-line": "rgba(52,211,153,0.5)",
    selected: "#232838", glow: "rgba(16,185,129,0.16)", shadow: "0 30px 60px -30px rgba(0,0,0,0.7)",
    "up-1": "#2f6b47", "up-2": "#15803d", "dn-1": "#7a3b3b", "dn-2": "#b91c1c", flat: "#57534e", block: "#0f111a",
    "on-soft": "#ffffff", "on-strong": "#ffffff", "up-text": "#34d399", "dn-text": "#fb7185",
    "seg-2": "#3b82f6", "seg-3": "#f59e0b",
    "cta-bg": "linear-gradient(160deg,#10241c,#0f1a17)", "cta-text": "#f1f5f9", "cta-muted": "#b5c2bd", "cta-line": "rgba(255,255,255,0.25)", "cta-glow": "rgba(52,211,153,0.25)",
    curtain: "0 -24px 60px -36px rgba(0,0,0,0.8)",
  },
  light: {
    bg: "#ffffff", band: "#f6f4ee", card: "#ffffff", "card-2": "#f6f4ee", line: "#e4e0d4", "line-strong": "#d6cfbd",
    text: "#1b1917", muted: "#635e54", "nav-bg": "rgba(255,255,255,0.82)",
    "accent-text": "#047857", "accent-bg": "#047857", "on-accent": "#ffffff", "accent-soft": "#e6f4ec", "accent-line": "#86c9a6",
    selected: "#eae6db", glow: "rgba(16,185,129,0.10)", shadow: "0 30px 60px -34px rgba(58,55,48,0.28)",
    "up-1": "#9fd8b4", "up-2": "#16a34a", "dn-1": "#f2b0b0", "dn-2": "#dc2626", flat: "#e2e8f0", block: "#f1f5f9",
    "on-soft": "#0f172a", "on-strong": "#ffffff", "up-text": "#047857", "dn-text": "#be123c",
    "seg-2": "#2563eb", "seg-3": "#d97706",
    "cta-bg": "linear-gradient(160deg,#0b3b2c,#062a20)", "cta-text": "#ffffff", "cta-muted": "#c8e6d8", "cta-line": "rgba(255,255,255,0.35)", "cta-glow": "rgba(52,211,153,0.28)",
    curtain: "0 -24px 60px -36px rgba(0,0,0,0.45)",
  },
};

const CSS = `
html{scroll-behavior:smooth}
.lp a{color:inherit}
.lp-nav-link{color:var(--muted);text-decoration:none;background:none;border:0;padding:0;font:inherit;cursor:pointer}
.lp-nav-link:hover{color:var(--text)}
.lp-btn{cursor:pointer;font:inherit;border:0}
.lp-primary{transition:transform .15s ease, box-shadow .15s ease}
.lp-primary:hover{transform:translateY(-1px);box-shadow:0 10px 24px -10px var(--accent-bg)}
.lp-ghost:hover{background:var(--card-2) !important}
.lp-card-hover{transition:transform .25s ease, border-color .25s ease}
.lp-card-hover:hover{transform:translateY(-3px);border-color:var(--accent-line) !important}
.lp-h{font-family:'Space Grotesk',sans-serif;font-weight:700;letter-spacing:-0.02em}
.lp-mono{font-family:'JetBrains Mono',ui-monospace,monospace}
.lp-hide-sm{display:flex}
@media (max-width: 760px){.lp-hide-sm{display:none !important}}
@media (max-width: 520px){.lp-hide-xs{display:none !important}.lp-nav-pad{padding:12px 16px !important}}
@keyframes lp-rise{from{opacity:0;transform:translateY(48px)}to{opacity:1;transform:none}}
@keyframes lp-grow{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:none}}
@keyframes lp-draw{from{stroke-dashoffset:900}to{stroke-dashoffset:0}}
@supports (animation-timeline: view()){
.lp-rv{animation:lp-rise linear both;animation-timeline:view();animation-range:entry 0% cover 28%}
.lp-rv-scale{animation:lp-grow linear both;animation-timeline:view();animation-range:entry 0% cover 35%}
.lp-rv-line{stroke-dasharray:900;animation:lp-draw linear both;animation-timeline:view();animation-range:entry 10% cover 45%}
}
@media (prefers-reduced-motion: reduce){
.lp-rv,.lp-rv-scale,.lp-rv-line{animation:none !important}
html{scroll-behavior:auto}
}
`;

const Check = ({ color = "var(--accent-text)", size = 16 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12l5 5L20 7" />
  </svg>
);
const Arrow = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

type Tile = { s: string; tone: "up-1" | "up-2" | "dn-1" | "dn-2" | "flat"; col?: number; row?: number; pct?: string; fs?: number };
const tileStyle = (t: Tile): React.CSSProperties => ({
  gridColumn: t.col ? `span ${t.col}` : undefined,
  gridRow: t.row ? `span ${t.row}` : undefined,
  borderRadius: 4,
  background: `var(--${t.tone})`,
  color: t.tone === "up-2" || t.tone === "dn-2" ? "var(--on-strong)" : "var(--on-soft)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 700,
  fontSize: t.fs ?? 11,
  lineHeight: 1.15,
});

function SectorBlock({ name, pct, up, cols, rows, gc, gr, tiles }: { name: string; pct: string; up: boolean; cols: number; rows: number; gc: number; gr: number; tiles: Tile[] }) {
  return (
    <div style={{ gridColumn: `span ${gc}`, gridRow: `span ${gr}`, borderRadius: 10, background: "var(--block)", padding: 4, display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `18px repeat(${rows}, minmax(0, 1fr))`, gap: 3 }}>
      <div style={{ gridColumn: `span ${cols}`, fontSize: 10, fontWeight: 800, letterSpacing: ".05em", color: "var(--muted)", paddingLeft: 3, whiteSpace: "nowrap", overflow: "hidden" }}>
        {name} <span style={{ color: up ? "var(--up-text)" : "var(--dn-text)" }}>{pct}</span>
      </div>
      {tiles.map((t) => (
        <div key={t.s} style={tileStyle(t)}>
          {t.s}
          {t.pct && <span style={{ fontSize: Math.max(10, (t.fs ?? 11) - 5), fontWeight: 500 }}>{t.pct}</span>}
        </div>
      ))}
    </div>
  );
}

export default function LandingShowcase({ language, theme, onThemeChange, onLanguageChange, onSignIn, onSignUp }: Props) {
  const es = language === "ES";
  const t = (en: string, esText: string) => (es ? esText : en);
  const dark = theme === "dark";
  const vars = Object.fromEntries(Object.entries(PALETTE[theme]).map(([k, v]) => [`--${k}`, v])) as React.CSSProperties;
  // Banner fijo con el resto subiendo por encima: se fija cuando su borde inferior llega al final de
  // la pantalla (top negativo si es más alto que la pantalla), así se ve entero en cualquier tamaño
  const heroRef = useRef<HTMLElement>(null);
  const [heroTop, setHeroTop] = useState(72);
  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const update = () => setHeroTop(Math.min(72, window.innerHeight - el.offsetHeight));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  const card: React.CSSProperties = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 24, boxShadow: "var(--shadow)" };
  const eyebrow: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: "var(--accent-text)" };
  const h2: React.CSSProperties = { fontSize: "clamp(32px, 4vw, 46px)", lineHeight: 1.08, margin: "14px 0 0" };
  const lead: React.CSSProperties = { fontSize: 17, lineHeight: 1.65, color: "var(--muted)", margin: "18px 0 0" };
  const primaryBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 10, padding: "15px 22px", borderRadius: 14, background: "var(--accent-bg)", color: "var(--on-accent)", fontWeight: 600, fontSize: 15 };
  const ghostBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 10, padding: "15px 22px", borderRadius: 14, border: "1px solid var(--line)", background: "var(--card)", color: "var(--text)", fontWeight: 600, fontSize: 15 };
  const iconBox: React.CSSProperties = { width: 44, height: 44, borderRadius: 12, background: "var(--accent-soft)", color: "var(--accent-text)", display: "flex", alignItems: "center", justifyContent: "center" };
  const featureCard: React.CSSProperties = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 22, padding: 26, display: "flex", flexDirection: "column", gap: 16 };

  return (
    <div className="lp" style={{ ...vars, colorScheme: dark ? "dark" : "light" } as React.CSSProperties}>
      <style>{CSS}</style>
      <div style={{ background: "var(--bg)", color: "var(--text)", fontFamily: "Inter, system-ui, sans-serif", minHeight: "100vh", overflowX: "clip" }}>
        {/* NAV */}
        <header style={{ position: "sticky", top: 0, zIndex: 20, background: "var(--nav-bg)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", borderBottom: "1px solid var(--line)" }}>
          <nav className="lp-nav-pad" aria-label={t("Main", "Principal")} style={{ maxWidth: 1200, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
            <button type="button" className="lp-btn" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} style={{ display: "flex", alignItems: "center", gap: 10, background: "none", color: "var(--text)", padding: 0 }}>
              <span style={{ width: 34, height: 34, borderRadius: 10, overflow: "hidden", border: "1px solid var(--accent-line)", background: "var(--card)", display: "flex" }}>
                <img
                  src="/mascot.png"
                  alt=""
                  onError={(e) => {
                    const img = e.currentTarget;
                    if (img.src.endsWith("/mascot.png")) img.src = "/logo.png";
                    else if (img.src.endsWith("/logo.png")) img.src = "/favicon.svg";
                  }}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </span>
              <span className="lp-mono lp-hide-xs" style={{ fontWeight: 600, fontSize: 16 }}>
                investiando<span style={{ color: "var(--accent-text)" }}>.app</span>
              </span>
            </button>
            <div className="lp-hide-sm" style={{ gap: 22, fontSize: 14, fontWeight: 500, flex: "1 1 auto", justifyContent: "center", flexWrap: "wrap" }}>
              <button type="button" className="lp-nav-link" onClick={() => go("lp-market")}>{t("Market", "Mercado")}</button>
              <button type="button" className="lp-nav-link" onClick={() => go("lp-explorer")}>Stock Explorer</button>
              <button type="button" className="lp-nav-link" onClick={() => go("lp-portfolio")}>{t("Portfolio", "Portafolio")}</button>
              <button type="button" className="lp-nav-link" onClick={() => go("lp-ai")}>{t("AI Analyst", "Analista IA")}</button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
              {onLanguageChange && (
                <button
                  type="button"
                  className="lp-btn lp-ghost lp-hide-xs"
                  onClick={() => onLanguageChange(es ? "EN" : "ES")}
                  aria-label={es ? "Switch to English" : "Cambiar a español"}
                  style={{ height: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--line)", background: "var(--card)", color: "var(--text)", fontSize: 13, fontWeight: 700 }}
                >
                  {es ? "EN" : "ES"}
                </button>
              )}
              <button
                type="button"
                className="lp-btn lp-ghost"
                onClick={() => onThemeChange(dark ? "light" : "dark")}
                aria-label={dark ? t("Switch to light mode", "Cambiar a modo claro") : t("Switch to dark mode", "Cambiar a modo oscuro")}
                style={{ width: 44, height: 44, borderRadius: 12, border: "1px solid var(--line)", background: "var(--card)", color: "var(--text)", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                {dark ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
                  </svg>
                )}
              </button>
              <button type="button" className="lp-btn lp-ghost" onClick={onSignIn} style={{ padding: "12px 14px", borderRadius: 12, fontSize: 14, fontWeight: 600, color: "var(--text)", background: "transparent" }}>
                {t("Sign in", "Iniciar sesión")}
              </button>
              <button type="button" className="lp-btn lp-primary" onClick={onSignUp} style={{ padding: "12px 16px", borderRadius: 12, fontSize: 14, fontWeight: 600, background: "var(--accent-bg)", color: "var(--on-accent)" }}>
                {t("Sign up free", "Crear cuenta")}
              </button>
            </div>
          </nav>
        </header>

        {/* HERO (fijo: el resto sube por encima) */}
        <section ref={heroRef} style={{ position: "sticky", top: heroTop, zIndex: 0, padding: "64px 24px 56px" }}>
          <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "radial-gradient(60% 50% at 75% 30%, var(--glow), transparent 70%)", pointerEvents: "none" }} />
          <div style={{ position: "relative", maxWidth: 1200, margin: "0 auto", display: "flex", flexWrap: "wrap", gap: 56, alignItems: "center" }}>
            <div style={{ flex: "1 1 460px", minWidth: 0 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 999, background: "var(--accent-soft)", color: "var(--accent-text)", fontSize: 13, fontWeight: 600 }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--accent-text)" }} />
                {t("Investment terminal for long-term investors", "Terminal de inversión para el largo plazo")}
              </span>
              <h1 className="lp-h" style={{ fontSize: "clamp(38px, 5.6vw, 66px)", lineHeight: 1.02, letterSpacing: "-0.025em", margin: "22px 0 0" }}>
                {t("Simulate, analyze & ", "Simula, analiza y ")}
                <span style={{ color: "var(--accent-text)" }}>{t("master your investments", "domina tus inversiones")}</span>
              </h1>
              <p style={{ fontSize: 18, lineHeight: 1.6, color: "var(--muted)", margin: "22px 0 0", maxWidth: 540 }}>
                {t(
                  "See what moves the market, understand any company and test your portfolio before you invest.",
                  "Mira qué mueve el mercado, entiende cualquier empresa y pon a prueba tu cartera antes de invertir."
                )}
              </p>
              <div style={{ display: "flex", gap: 12, marginTop: 32, flexWrap: "wrap" }}>
                <button type="button" className="lp-btn lp-primary" onClick={onSignUp} style={primaryBtn}>
                  {t("Create free account", "Crear cuenta gratis")}
                  <Arrow />
                </button>
                <button type="button" className="lp-btn lp-ghost" onClick={() => go("lp-market")} style={ghostBtn}>
                  {t("See what's inside", "Ver qué incluye")}
                </button>
              </div>
              <div style={{ display: "flex", gap: 22, marginTop: 28, flexWrap: "wrap", fontSize: 14, color: "var(--muted)" }}>
                {[t("Free to start", "Gratis para empezar"), t("Email-verified accounts", "Cuentas verificadas por correo"), t("Light & dark mode", "Modo claro y oscuro")].map((x) => (
                  <span key={x} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Check />
                    {x}
                  </span>
                ))}
              </div>
            </div>

            {/* Maqueta de la app */}
            <div style={{ flex: "1 1 480px", minWidth: 0 }}>
              <div style={{ ...card, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 18px", borderBottom: "1px solid var(--line)" }}>
                  {[0, 1, 2].map((i) => (
                    <span key={i} style={{ width: 10, height: 10, borderRadius: 999, background: "var(--line-strong)" }} />
                  ))}
                  <span className="lp-mono" style={{ marginLeft: 10, fontSize: 12, color: "var(--muted)" }}>{t("Your Portfolio", "Tu Portafolio")}</span>
                </div>
                <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ display: "flex", gap: 4, padding: 4, borderRadius: 14, border: "1px solid var(--line)", background: "var(--card)", fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" }}>
                    {[t("Summary", "Resumen"), t("Holdings", "Posiciones"), t("Simulation", "Simulación"), t("Analysis", "Análisis")].map((x, i) => (
                      <span key={x} style={{ flex: 1, textAlign: "center", padding: "9px 4px", borderRadius: 10, background: i === 0 ? "var(--selected)" : "transparent", color: i === 0 ? "var(--text)" : "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {x}
                      </span>
                    ))}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                    <div style={{ padding: 16, borderRadius: 16, background: "var(--card-2)", border: "1px solid var(--line)" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", color: "var(--muted)", textTransform: "uppercase" }}>{t("Portfolio value", "Valor de la cartera")}</div>
                      <div className="lp-h" style={{ fontSize: 30, marginTop: 6 }}>$121,139</div>
                      <div className="lp-mono" style={{ fontSize: 12, color: "var(--up-text)", marginTop: 4 }}>{t("+21.2% all time", "+21,2 % desde el inicio")}</div>
                    </div>
                    <div style={{ padding: 16, borderRadius: 16, background: "var(--card-2)", border: "1px solid var(--line)" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", color: "var(--muted)", textTransform: "uppercase" }}>{t("Vs S&P 500 · YTD", "Vs S&P 500 · en el año")}</div>
                      <svg viewBox="0 0 200 60" style={{ width: "100%", height: 56, marginTop: 8 }} aria-hidden="true">
                        <polyline points="0,46 20,44 40,40 60,42 80,34 100,30 120,32 140,22 160,18 180,20 200,10" fill="none" stroke="var(--accent-text)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        <polyline points="0,48 20,47 40,45 60,46 80,41 100,40 120,39 140,34 160,32 180,33 200,28" fill="none" stroke="var(--muted)" strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round" />
                      </svg>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gridAutoRows: 38, gap: 3, borderRadius: 14, overflow: "hidden" }}>
                    {(
                      [
                        { s: "NVDA", tone: "up-2", col: 2, row: 2, pct: "+2.78%", fs: 15 },
                        { s: "AAPL", tone: "dn-1", col: 2, row: 2, pct: "−0.52%", fs: 15 },
                        { s: "AVGO", tone: "up-1" },
                        { s: "AMD", tone: "up-2" },
                        { s: "ORCL", tone: "dn-2" },
                        { s: "CSCO", tone: "flat" },
                        { s: "MSFT −0.99%", tone: "dn-1", col: 2, fs: 12 },
                        { s: "META +0.84%", tone: "up-1", col: 2, fs: 12 },
                        { s: "TSLA", tone: "up-2" },
                        { s: "AMZN", tone: "dn-1" },
                      ] as Tile[]
                    ).map((x) => (
                      <div key={x.s} style={{ ...tileStyle(x), borderRadius: 0 }}>
                        {x.s}
                        {x.pct && <span style={{ fontSize: 11, fontWeight: 500 }}>{x.pct}</span>}
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "right" }}>{t("Illustrative data", "Datos ilustrativos")}</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Todo lo demás sube por encima del banner */}
        <div style={{ position: "relative", zIndex: 1, background: "var(--bg)", borderRadius: "28px 28px 0 0", boxShadow: "var(--curtain)", overflow: "hidden" }}>
          {/* QUÉ INCLUYE */}
          <section aria-label={t("What's inside", "Qué incluye")} style={{ borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)", background: "var(--band)" }}>
            <div style={{ maxWidth: 1200, margin: "0 auto", padding: "22px 24px", display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 18, fontSize: 14, fontWeight: 600, color: "var(--muted)" }}>
              {[
                { d: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5", l: t("Official SEC 10-K & 10-Q data", "Datos oficiales de la SEC (10-K y 10-Q)") },
                { d: "M3 17l6-6 4 4 8-8", l: t("Live market quotes", "Cotizaciones en tiempo real") },
                { d: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z", l: t("AI analyst powered by Claude", "Analista IA con Claude") },
                { d: "M12 2l8 4v6c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10V6z", l: t("Educational — not financial advice", "Educativo, no es asesoría financiera") },
              ].map((x) => (
                <span key={x.l} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={x.d} />
                  </svg>
                  {x.l}
                </span>
              ))}
            </div>
          </section>

          {/* 01 MERCADO */}
          <section id="lp-market" style={{ padding: "120px 24px 40px", scrollMarginTop: 72 }}>
            <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexWrap: "wrap", gap: 56, alignItems: "center" }}>
              <div className="lp-rv" style={{ flex: "1 1 380px", minWidth: 0 }}>
                <div className="lp-mono" style={eyebrow}>01 · {t("MARKET", "MERCADO")}</div>
                <h2 className="lp-h" style={h2}>{t("See the whole market at a glance", "Todo el mercado de un vistazo")}</h2>
                <p style={lead}>
                  {t(
                    "A heatmap of the S&P 500's largest companies, sized by market cap and colored by return. Switch the period and every sector shows its move and RSI.",
                    "Un mapa de calor de las mayores empresas del S&P 500, por capitalización y coloreado por rentabilidad. Cambia el periodo y cada sector muestra su movimiento y su RSI."
                  )}
                </p>
                <ul style={{ listStyle: "none", padding: 0, margin: "26px 0 0", display: "flex", flexDirection: "column", gap: 14, fontSize: 15 }}>
                  {[
                    [t("1D to 1Y", "De 1D a 1Y"), t("the same view for a day's move or a year's trend", "la misma vista para el día o la tendencia del año")],
                    [t("Market breadth", "Amplitud del mercado"), t("leading and lagging sector, how many are up, mean return", "sector líder y rezagado, cuántos suben y rentabilidad media")],
                    [t("Indices, commodities & crypto", "Índices, materias primas y cripto"), t("S&P 500, Nasdaq, Dow, VIX, gold, oil and bitcoin against their highs", "S&P 500, Nasdaq, Dow, VIX, oro, petróleo y bitcoin frente a sus máximos")],
                  ].map(([b, rest]) => (
                    <li key={b} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                      <span style={{ flex: "none", width: 26, height: 26, borderRadius: 8, background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Check size={14} />
                      </span>
                      <span>
                        <b>{b}</b> — {rest}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="lp-rv-scale" style={{ flex: "1.3 1 520px", minWidth: 0 }}>
                <div style={{ ...card, padding: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
                    <div className="lp-h" style={{ fontSize: 15 }}>{t("Sector performance", "Rendimiento por sector")}</div>
                    <div className="lp-mono" style={{ display: "flex", gap: 2, padding: 3, borderRadius: 10, border: "1px solid var(--line)", fontSize: 11, color: "var(--muted)" }}>
                      {["1D", "1W", "1M", "YTD", "1Y"].map((p) => (
                        <span key={p} style={{ padding: "5px 9px", borderRadius: 7, background: p === "YTD" ? "var(--selected)" : "transparent", color: p === "YTD" ? "var(--text)" : undefined }}>
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gridAutoRows: 30, gap: 4 }}>
                    <SectorBlock name={t("TECHNOLOGY", "TECNOLOGÍA")} pct="+14.2%" up cols={4} rows={6} gc={5} gr={7} tiles={[
                      { s: "AAPL", tone: "up-1", col: 2, row: 3, pct: "+25.9%", fs: 16 },
                      { s: "NVDA", tone: "flat", col: 2, row: 3, pct: "+0.1%", fs: 16 },
                      { s: "MSFT", tone: "up-1", col: 2, row: 2, pct: "+9.7%", fs: 14 },
                      { s: "MU", tone: "up-2" }, { s: "AMD", tone: "up-2" }, { s: "ORCL", tone: "dn-2" }, { s: "CSCO", tone: "up-1" },
                      { s: "AVGO", tone: "dn-1" }, { s: "PLTR", tone: "up-2" }, { s: "IBM", tone: "dn-1" }, { s: "INTC", tone: "up-1" },
                    ]} />
                    <SectorBlock name={t("FINANCIALS", "FINANZAS")} pct="+4.1%" up cols={3} rows={3} gc={4} gr={4} tiles={[
                      { s: "BRK-B", tone: "up-1", row: 2, fs: 13 }, { s: "JPM", tone: "up-2", row: 2, fs: 13 }, { s: "V", tone: "up-1", row: 2, fs: 13 },
                      { s: "MA", tone: "up-1" }, { s: "BAC", tone: "dn-1" }, { s: "GS", tone: "up-2" },
                    ]} />
                    <SectorBlock name={t("COMMS", "COMUNIC.")} pct="−10.4%" up={false} cols={2} rows={3} gc={3} gr={4} tiles={[
                      { s: "GOOGL", tone: "dn-1", row: 2, fs: 13 }, { s: "META", tone: "dn-2", row: 2, fs: 13 }, { s: "NFLX", tone: "dn-2" }, { s: "TMUS", tone: "up-1" },
                    ]} />
                    <SectorBlock name={t("HEALTHCARE", "SALUD")} pct="+18.8%" up cols={3} rows={2} gc={4} gr={3} tiles={[
                      { s: "LLY", tone: "up-2", fs: 12 }, { s: "JNJ", tone: "up-2", fs: 12 }, { s: "ABBV", tone: "up-1", fs: 12 },
                      { s: "UNH", tone: "up-1" }, { s: "MRK", tone: "up-2" }, { s: "ABT", tone: "dn-1" },
                    ]} />
                    <SectorBlock name={t("ENERGY", "ENERGÍA")} pct="+35.0%" up cols={2} rows={2} gc={3} gr={3} tiles={[
                      { s: "XOM", tone: "up-2", row: 2, fs: 13 }, { s: "CVX", tone: "up-2" }, { s: "COP", tone: "dn-1" },
                    ]} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontSize: 11, color: "var(--muted)" }}>
                    <span>{t("Size: market cap · Color: return", "Tamaño: capitalización · Color: rentabilidad")}</span>
                    <span>{t("Illustrative data", "Datos ilustrativos")}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 02 STOCK EXPLORER */}
          <section id="lp-explorer" style={{ padding: "120px 24px 40px", scrollMarginTop: 72 }}>
            <div style={{ maxWidth: 1200, margin: "0 auto" }}>
              <div className="lp-rv" style={{ maxWidth: 720 }}>
                <div className="lp-mono" style={eyebrow}>02 · STOCK EXPLORER</div>
                <h2 className="lp-h" style={h2}>{t("Understand any company in minutes", "Entiende cualquier empresa en minutos")}</h2>
                <p style={lead}>
                  {t("Search a ticker and get the full picture in three tabs, built on the company's own filings with the SEC.", "Busca un ticker y ten la foto completa en tres pestañas, construidas con los propios informes de la empresa a la SEC.")}
                </p>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 20, marginTop: 44 }}>
                <article className="lp-rv lp-card-hover" style={featureCard}>
                  <span style={iconBox}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 2l9 5-9 5-9-5z" /><path d="M3 12l9 5 9-5M3 17l9 5 9-5" /></svg>
                  </span>
                  <h3 className="lp-h" style={{ fontSize: 22, margin: 0 }}>Fundamental</h3>
                  <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--muted)", margin: 0 }}>
                    {t("Price chart against the S&P 500 and Nasdaq, the 52-week range, analyst targets and a quality scorecard.", "Gráfico de precio frente al S&P 500 y el Nasdaq, rango de 52 semanas, precios objetivo y una ficha de calidad.")}
                  </p>
                  <svg viewBox="0 0 300 90" style={{ width: "100%", height: 90, marginTop: "auto" }} aria-hidden="true">
                    <path d="M0,70 C30,62 50,72 80,58 S130,30 160,40 S210,60 240,28 S280,14 300,18 L300,90 L0,90 Z" fill="var(--accent-soft)" />
                    <path className="lp-rv-line" d="M0,70 C30,62 50,72 80,58 S130,30 160,40 S210,60 240,28 S280,14 300,18" fill="none" stroke="var(--accent-text)" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                </article>
                <article className="lp-rv lp-card-hover" style={featureCard}>
                  <span style={iconBox}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></svg>
                  </span>
                  <h3 className="lp-h" style={{ fontSize: 22, margin: 0 }}>Financials</h3>
                  <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--muted)", margin: 0 }}>
                    {t(
                      "Ten years of audited statements, revenue by segment, product and region, margins by segment, and each company's own KPIs — like Uber trips or Lilly's Mounjaro sales.",
                      "Diez años de estados auditados, ingresos por segmento, producto y región, márgenes por segmento y los KPIs propios de cada empresa, como los viajes de Uber o las ventas de Mounjaro de Lilly."
                    )}
                  </p>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 90, marginTop: "auto" }} aria-hidden="true">
                    {[[42, 3, 2], [52, 3, 2], [63, 4, 2], [76, 4, 3], [100, 5, 3]].map(([h, a, b], i) => (
                      <div key={i} style={{ flex: 1, height: `${h}%`, display: "flex", flexDirection: "column", borderRadius: "6px 6px 2px 2px", overflow: "hidden" }}>
                        <div style={{ flex: a, background: "var(--accent-bg)" }} />
                        <div style={{ flex: b, background: "var(--seg-2)" }} />
                        <div style={{ flex: 1, background: "var(--seg-3)" }} />
                      </div>
                    ))}
                  </div>
                </article>
                <article className="lp-rv lp-card-hover" style={featureCard}>
                  <span style={iconBox}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 14l4-4" /><path d="M3.3 19a10 10 0 1 1 17.4 0" /></svg>
                  </span>
                  <h3 className="lp-h" style={{ fontSize: 22, margin: 0 }}>Valuation</h3>
                  <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--muted)", margin: 0 }}>
                    {t(
                      "P/E, P/FCF, EV/EBITDA and more against their own history, a fair-value range, a 3-statement model with DCF, and the engines of return.",
                      "P/E, P/FCF, EV/EBITDA y más frente a su propia historia, un rango de valor razonable, un modelo de 3 estados con DCF y los motores de rentabilidad."
                    )}
                  </p>
                  <svg viewBox="0 0 300 90" style={{ width: "100%", height: 90, marginTop: "auto" }} aria-hidden="true">
                    <rect x="0" y="34" width="300" height="24" fill="var(--accent-soft)" />
                    <line x1="0" y1="46" x2="300" y2="46" stroke="var(--muted)" strokeWidth="1.5" strokeDasharray="5 5" />
                    <path className="lp-rv-line" d="M0,60 L25,52 L50,56 L75,40 L100,44 L125,30 L150,36 L175,48 L200,42 L225,26 L250,20 L275,30 L300,24" fill="none" stroke="var(--accent-text)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    <text x="296" y="72" textAnchor="end" fontSize="11" fontFamily="JetBrains Mono, monospace" fill="var(--muted)">{t("median P/E", "P/E mediano")}</text>
                  </svg>
                </article>
              </div>
            </div>
          </section>

          {/* 03 PORTAFOLIO */}
          <section id="lp-portfolio" style={{ padding: "120px 24px 40px", scrollMarginTop: 72 }}>
            <div style={{ maxWidth: 1200, margin: "0 auto" }}>
              <div className="lp-rv" style={{ maxWidth: 720 }}>
                <div className="lp-mono" style={eyebrow}>03 · {t("YOUR PORTFOLIO", "TU PORTAFOLIO")}</div>
                <h2 className="lp-h" style={h2}>{t("Your portfolio, explained", "Tu cartera, explicada")}</h2>
                <p style={lead}>
                  {t(
                    "Add your positions once. investiando keeps them priced live and tells you how they're doing, what you own and what could happen next.",
                    "Añade tus posiciones una vez. investiando las mantiene con precios en vivo y te dice cómo van, qué tienes y qué podría pasar."
                  )}
                </p>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 440px), 1fr))", gap: 24, marginTop: 44 }}>
                {/* A */}
                <article className="lp-rv" style={{ ...card, padding: 26 }}>
                  <div className="lp-mono" style={{ fontSize: 12, color: "var(--accent-text)", fontWeight: 600 }}>A · {t("SUMMARY", "RESUMEN")}</div>
                  <h3 className="lp-h" style={{ fontSize: 24, margin: "8px 0 0" }}>{t("Know where you stand every day", "Sabe dónde estás cada día")}</h3>
                  <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--muted)", margin: "10px 0 0" }}>
                    {t(
                      "Total value, today's gains and losses, future value at analyst targets and how you compare with the S&P 500 or the Nasdaq-100.",
                      "Valor total, ganancias y pérdidas del día, valor futuro con los precios objetivo y cómo vas frente al S&P 500 o el Nasdaq-100."
                    )}
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginTop: 20 }}>
                    {[
                      [t("Value", "Valor"), "$121.1k", ""],
                      [t("Today", "Hoy"), "+0.37%", "var(--up-text)"],
                      [t("At avg. target", "Al objetivo medio"), "$155.2k", ""],
                    ].map(([l, v, c]) => (
                      <div key={l} style={{ padding: 14, borderRadius: 14, background: "var(--card-2)" }}>
                        <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>{l}</div>
                        <div className="lp-h" style={{ fontSize: 22, marginTop: 4, color: c || undefined }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <svg viewBox="0 0 500 120" style={{ width: "100%", height: 120, marginTop: 16 }} aria-hidden="true">
                    <line x1="0" y1="100" x2="500" y2="100" stroke="var(--line)" />
                    <path className="lp-rv-line" d="M0,92 L40,88 L80,90 L120,80 L160,84 L200,66 L240,70 L280,52 L320,58 L360,40 L400,44 L440,26 L500,18" fill="none" stroke="var(--accent-text)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M0,94 L40,92 L80,93 L120,88 L160,90 L200,80 L240,82 L280,72 L320,76 L360,64 L400,66 L440,56 L500,50" fill="none" stroke="var(--muted)" strokeWidth="2" strokeDasharray="5 5" />
                  </svg>
                  <div style={{ display: "flex", gap: 18, fontSize: 12, color: "var(--muted)" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 3, borderRadius: 2, background: "var(--accent-text)" }} />{t("Your portfolio", "Tu cartera")}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 0, borderTop: "2px dashed var(--muted)" }} />S&amp;P 500</span>
                  </div>
                </article>
                {/* B */}
                <article className="lp-rv" style={{ ...card, padding: 26 }}>
                  <div className="lp-mono" style={{ fontSize: 12, color: "var(--accent-text)", fontWeight: 600 }}>B · {t("HOLDINGS", "POSICIONES")}</div>
                  <h3 className="lp-h" style={{ fontSize: 24, margin: "8px 0 0" }}>{t("Every position, grouped the way you think", "Cada posición, agrupada como tú piensas")}</h3>
                  <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--muted)", margin: "10px 0 0" }}>
                    {t(
                      "Group by sector and subsector, sort any column, and switch between cost basis, valuation, financial health and financials.",
                      "Agrupa por sector y subsector, ordena cualquier columna y cambia entre coste, valoración, salud financiera y estados financieros."
                    )}
                  </p>
                  <div style={{ marginTop: 18, border: "1px solid var(--line)", borderRadius: 14, overflow: "hidden", fontSize: 13 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", padding: "10px 14px", background: "var(--card-2)", fontSize: 11, fontWeight: 700, letterSpacing: ".06em", color: "var(--muted)" }}>
                      <span>TICKER</span><span style={{ textAlign: "right" }}>{t("WEIGHT", "PESO")}</span><span style={{ textAlign: "right" }}>{t("RETURN", "RETORNO")}</span>
                    </div>
                    {[
                      { g: `${t("TECHNOLOGY", "TECNOLOGÍA")} · 42.8%` },
                      { s: "MSFT", w: "18.4%", r: "+31.2%", up: true },
                      { s: "NVDA", w: "14.1%", r: "+64.8%", up: true },
                      { g: `${t("FINANCIALS", "FINANZAS")} · 11.6%` },
                      { s: "V", w: "6.2%", r: "−2.4%", up: false },
                    ].map((row, i) =>
                      "g" in row ? (
                        <div key={i} style={{ padding: "8px 14px", background: "var(--selected)", fontSize: 11, fontWeight: 700, letterSpacing: ".06em", borderTop: i ? "1px solid var(--line)" : undefined }}>{row.g}</div>
                      ) : (
                        <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", padding: "10px 14px", borderTop: "1px solid var(--line)" }}>
                          <span style={{ fontWeight: 600 }}>{row.s}</span>
                          <span className="lp-mono" style={{ textAlign: "right" }}>{row.w}</span>
                          <span className="lp-mono" style={{ textAlign: "right", color: row.up ? "var(--up-text)" : "var(--dn-text)" }}>{row.r}</span>
                        </div>
                      )
                    )}
                  </div>
                </article>
                {/* C */}
                <article className="lp-rv" style={{ ...card, padding: 26 }}>
                  <div className="lp-mono" style={{ fontSize: 12, color: "var(--accent-text)", fontWeight: 600 }}>C · {t("SIMULATION", "SIMULACIÓN")}</div>
                  <h3 className="lp-h" style={{ fontSize: 24, margin: "8px 0 0" }}>{t("Try it before you buy it", "Pruébalo antes de comprar")}</h3>
                  <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--muted)", margin: "10px 0 0" }}>
                    {t(
                      "Add, trim or swap positions in a sandbox and see the new weights, risk and 5- or 10-year projection with monthly contributions.",
                      "Añade, reduce o cambia posiciones en un entorno de prueba y mira los nuevos pesos, el riesgo y la proyección a 5 o 10 años con aportaciones mensuales."
                    )}
                  </p>
                  <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 12 }}>
                    {[
                      [t("Today", "Hoy"), 48, "var(--seg-2)", "$121k"],
                      [t("5 years", "5 años"), 72, "var(--accent-bg)", "$180k"],
                      [t("10 years", "10 años"), 100, "var(--accent-bg)", "$268k"],
                    ].map(([l, w, c, v]) => (
                      <div key={l as string} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}>
                        <span style={{ width: 64, fontWeight: 600 }}>{l}</span>
                        <div style={{ flex: 1, height: 14, borderRadius: 999, background: "var(--card-2)", overflow: "hidden" }}>
                          <div style={{ width: `${w}%`, height: "100%", background: c as string }} />
                        </div>
                        <span className="lp-mono" style={{ width: 70, textAlign: "right" }}>{v}</span>
                      </div>
                    ))}
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>{t("Illustrative projection at an assumed growth rate", "Proyección ilustrativa con un crecimiento supuesto")}</div>
                  </div>
                </article>
                {/* D */}
                <article className="lp-rv" style={{ ...card, padding: 26 }}>
                  <div className="lp-mono" style={{ fontSize: 12, color: "var(--accent-text)", fontWeight: 600 }}>D · {t("ANALYSIS", "ANÁLISIS")}</div>
                  <h3 className="lp-h" style={{ fontSize: 24, margin: "8px 0 0" }}>{t("Where will your return come from?", "¿De dónde saldrá tu rentabilidad?")}</h3>
                  <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--muted)", margin: "10px 0 0" }}>
                    {t(
                      "John Bogle's three engines — dividends, earnings growth and the change in valuation — for every position and for the whole portfolio.",
                      "Los tres motores de John Bogle (dividendos, crecimiento del beneficio y cambio de valoración) para cada posición y para toda la cartera."
                    )}
                  </p>
                  <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                    {[
                      [t("Dividend yield", "Dividendo"), 22, "var(--seg-2)"],
                      [t("Earnings growth", "Crecimiento"), 78, "var(--accent-bg)"],
                      [t("Valuation change", "Valoración"), 34, "var(--seg-3)"],
                    ].map(([l, w, c]) => (
                      <div key={l as string} style={{ padding: 14, borderRadius: 14, background: "var(--card-2)" }}>
                        <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>{l}</div>
                        <div style={{ height: 6, borderRadius: 999, background: "var(--line)", marginTop: 10, overflow: "hidden" }}>
                          <div style={{ width: `${w}%`, height: "100%", background: c as string }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              </div>
            </div>
          </section>

          {/* 04 ANALISTA IA */}
          <section id="lp-ai" style={{ padding: "140px 24px 40px", scrollMarginTop: 72 }}>
            <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexWrap: "wrap", gap: 56, alignItems: "center" }}>
              <div className="lp-rv" style={{ flex: "1 1 380px", minWidth: 0 }}>
                <div className="lp-mono" style={eyebrow}>04 · {t("AI ANALYST", "ANALISTA IA")}</div>
                <h2 className="lp-h" style={h2}>{t("An analyst that reads the numbers with you", "Un analista que lee los números contigo")}</h2>
                <p style={lead}>
                  {t(
                    "Ask about a company or your portfolio in plain language. The AI works from the same filings and prices you see, and explains its reasoning.",
                    "Pregunta por una empresa o por tu cartera con tus palabras. La IA trabaja con los mismos informes y precios que ves y explica su razonamiento."
                  )}
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginTop: 26 }}>
                  {[
                    [t("Investment memos", "Memos de inversión"), t("Bull and bear case, risks and stress tests", "Escenario alcista y bajista, riesgos y pruebas de estrés")],
                    [t("Portfolio builder", "Creador de carteras"), t("A starting portfolio from your strategy", "Una cartera inicial según tu estrategia")],
                    [t("Import a screenshot", "Importa una captura"), t("Load positions from your broker's screen", "Carga posiciones desde la pantalla de tu bróker")],
                  ].map(([a, b]) => (
                    <div key={a} style={{ padding: 16, borderRadius: 16, border: "1px solid var(--line)", background: "var(--card)" }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{a}</div>
                      <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6, lineHeight: 1.5 }}>{b}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="lp-rv-scale" style={{ flex: "1.1 1 460px", minWidth: 0 }}>
                <div style={{ ...card, padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ alignSelf: "flex-end", maxWidth: "80%", padding: "12px 16px", borderRadius: "16px 16px 4px 16px", background: "var(--selected)", fontSize: 14 }}>
                    {t("Is my portfolio too concentrated in tech?", "¿Está mi cartera demasiado concentrada en tecnología?")}
                  </div>
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <span style={{ flex: "none", width: 34, height: 34, borderRadius: 10, background: "var(--accent-bg)", color: "var(--on-accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /></svg>
                    </span>
                    <div style={{ padding: "14px 16px", borderRadius: "4px 16px 16px 16px", background: "var(--card-2)", fontSize: 14, lineHeight: 1.6 }}>
                      <div style={{ fontWeight: 700, marginBottom: 6 }}>{t("Analyst memo", "Memo del analista")}</div>
                      <div>{t("Technology is 42.8% of your portfolio versus about a third of the S&P 500. Two positions drive most of that weight.", "La tecnología es el 42,8 % de tu cartera, frente a cerca de un tercio del S&P 500. Dos posiciones explican casi todo ese peso.")}</div>
                      <div style={{ marginTop: 8, color: "var(--muted)" }}>{t("Ideas to consider: healthcare and staples would lower your beta without changing your growth profile much.", "Ideas a considerar: salud y consumo básico bajarían tu beta sin cambiar mucho tu perfil de crecimiento.")}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "right" }}>{t("Illustrative answer", "Respuesta ilustrativa")}</div>
                </div>
              </div>
            </div>
          </section>

          {/* 05 Y MÁS */}
          <section style={{ padding: "140px 24px 40px" }}>
            <div style={{ maxWidth: 1200, margin: "0 auto" }}>
              <div className="lp-rv" style={{ textAlign: "center", maxWidth: 680, margin: "0 auto" }}>
                <div className="lp-mono" style={eyebrow}>05 · {t("AND MORE", "Y MÁS")}</div>
                <h2 className="lp-h" style={h2}>{t("Everything a long-term investor checks", "Todo lo que revisa un inversor a largo plazo")}</h2>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 18, marginTop: 44 }}>
                {[
                  { d: "M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM16 3v4M8 3v4M3 10h18", h: t("Earnings calendar", "Calendario de resultados"), p: t("Upcoming reports for your holdings, with results from the press release before the 10-Q is filed.", "Próximos resultados de tus posiciones, con las cifras del comunicado antes de que se presente el 10-Q.") },
                  { d: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z", h: "Watchlist", p: t("Follow ideas you don't own yet, with price, performance and valuation side by side.", "Sigue ideas que aún no tienes, con precio, rentabilidad y valoración lado a lado.") },
                  { d: "M9 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM2 21c0-3.9 3.1-7 7-7s7 3.1 7 7M16 4a4 4 0 0 1 0 8M22 21c0-3-1.8-5.6-4.5-6.6", h: t("Superinvestors", "Superinversores"), p: t("See what well-known investors hold and how their portfolios have changed.", "Mira qué tienen inversores conocidos y cómo han cambiado sus carteras.") },
                  { d: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z", h: t("Analyst targets", "Precios objetivo"), p: t("Consensus high, average and low price targets, and your portfolio's value at each.", "Objetivos de consenso alto, medio y bajo, y el valor de tu cartera en cada uno.") },
                ].map((x) => (
                  <article key={x.h} className="lp-rv lp-card-hover" style={{ padding: 24, borderRadius: 20, border: "1px solid var(--line)", background: "var(--card)" }}>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={x.d} /></svg>
                    <h3 className="lp-h" style={{ fontSize: 19, margin: "14px 0 0" }}>{x.h}</h3>
                    <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--muted)", margin: "8px 0 0" }}>{x.p}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          {/* CÓMO EMPEZAR (sin animación: al final de la página no queda recorrido para completarla) */}
          <section style={{ padding: "140px 24px 40px" }}>
            <div style={{ maxWidth: 1200, margin: "0 auto" }}>
              <h2 className="lp-h" style={{ ...h2, textAlign: "center", margin: 0 }}>{t("Start in three steps", "Empieza en tres pasos")}</h2>
              <ol style={{ listStyle: "none", padding: 0, margin: "44px 0 0", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 18 }}>
                {[
                  [t("Create your free account", "Crea tu cuenta gratis"), t("Sign up with your email and confirm it with a code.", "Regístrate con tu correo y confírmalo con un código.")],
                  [t("Add your portfolio", "Añade tu cartera"), t("Type your positions, import a screenshot or let the AI suggest one.", "Escribe tus posiciones, importa una captura o deja que la IA te sugiera una.")],
                  [t("Explore and simulate", "Explora y simula"), t("Research companies, follow the market and test changes before you make them.", "Investiga empresas, sigue el mercado y prueba los cambios antes de hacerlos.")],
                ].map(([h, p], i) => (
                  <li key={h} style={{ padding: 26, borderRadius: 20, background: "var(--band)", border: "1px solid var(--line)" }}>
                    <div className="lp-h" style={{ width: 44, height: 44, borderRadius: 999, background: "var(--accent-bg)", color: "var(--on-accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{i + 1}</div>
                    <h3 className="lp-h" style={{ fontSize: 20, margin: "18px 0 0" }}>{h}</h3>
                    <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--muted)", margin: "8px 0 0" }}>{p}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {/* CTA */}
          <section style={{ padding: "140px 24px 100px" }}>
            <div style={{ maxWidth: 1000, margin: "0 auto", borderRadius: 32, padding: "clamp(36px, 6vw, 72px)", background: "var(--cta-bg)", color: "var(--cta-text)", textAlign: "center", position: "relative", overflow: "hidden" }}>
              <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "radial-gradient(50% 60% at 50% 0%, var(--cta-glow), transparent 70%)", pointerEvents: "none" }} />
              <h2 className="lp-h" style={{ position: "relative", fontSize: "clamp(32px, 4.5vw, 52px)", lineHeight: 1.05, margin: 0 }}>{t("Invest with clarity, not guesswork", "Invierte con claridad, no a ciegas")}</h2>
              <p style={{ position: "relative", fontSize: 18, lineHeight: 1.6, margin: "18px auto 0", maxWidth: 560, color: "var(--cta-muted)" }}>
                {t(
                  "Create your free account and bring your portfolio, the market and every company's numbers into one place.",
                  "Crea tu cuenta gratis y reúne tu cartera, el mercado y los números de cada empresa en un solo lugar."
                )}
              </p>
              <div style={{ position: "relative", display: "flex", gap: 12, justifyContent: "center", marginTop: 32, flexWrap: "wrap" }}>
                <button type="button" className="lp-btn lp-primary" onClick={onSignUp} style={{ ...primaryBtn, padding: "16px 24px" }}>
                  {t("Create free account", "Crear cuenta gratis")}
                  <Arrow />
                </button>
                <button type="button" className="lp-btn" onClick={onSignIn} style={{ display: "inline-flex", alignItems: "center", padding: "16px 24px", borderRadius: 14, border: "1px solid var(--cta-line)", background: "transparent", color: "var(--cta-text)", fontWeight: 600, fontSize: 15 }}>
                  {t("Sign in", "Iniciar sesión")}
                </button>
              </div>
              <p style={{ position: "relative", fontSize: 13, margin: "26px 0 0", color: "var(--cta-muted)" }}>{t("Accounts are protected with email verification.", "Las cuentas se protegen con verificación por correo.")}</p>
            </div>
          </section>

          {/* PIE */}
          <footer style={{ borderTop: "1px solid var(--line)", background: "var(--band)" }}>
            <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px", display: "flex", flexWrap: "wrap", gap: 20, justifyContent: "space-between", alignItems: "center", fontSize: 13, color: "var(--muted)" }}>
              <span className="lp-mono" style={{ fontWeight: 600, color: "var(--text)" }}>investiando<span style={{ color: "var(--accent-text)" }}>.app</span></span>
              <span style={{ maxWidth: 560, lineHeight: 1.6 }}>
                {t(
                  "investiando provides educational information, not financial advice. Market data may be delayed. Financial statements come from company filings with the SEC.",
                  "investiando ofrece información educativa, no asesoría financiera. Los datos de mercado pueden tener retraso. Los estados financieros provienen de los informes de las empresas a la SEC."
                )}
              </span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
