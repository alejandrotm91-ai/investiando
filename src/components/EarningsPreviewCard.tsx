import React, { useEffect, useState } from "react";
import { FileClock, ExternalLink } from "lucide-react";

// Capa 3 de la SEC: avance de resultados del 8-K (provisional). Solo aparece mientras el 10-Q/10-K
// de ese trimestre no se ha presentado; después la API deja de devolverlo y la tarjeta desaparece.

interface Preview {
  ticker: string;
  filed: string;
  url: string | null;
  filingIndex: string;
  periodEnd: string;
  fiscalYear: number | null;
  fiscalQuarter: number | null;
  quarter: Record<string, number | null>;
  yoy: Record<string, number | null> | null;
  nonGaapEps: number | null;
  guidance: string | null;
}

interface Props {
  ticker: string;
  language: "EN" | "ES";
  theme: "dark" | "light";
}

const money = (v: number | null | undefined) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  const s = a >= 1e9 ? `${(a / 1e9).toFixed(a >= 1e11 ? 0 : 2)}B` : `${(a / 1e6).toFixed(0)}M`;
  return `${v < 0 ? "−" : ""}$${s}`;
};

export default function EarningsPreviewCard({ ticker, language, theme }: Props) {
  const isES = language === "ES";
  const [p, setP] = useState<Preview | null>(null);

  useEffect(() => {
    let alive = true;
    setP(null);
    fetch(`/api/sec/preview/${encodeURIComponent(ticker)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => alive && setP(j && j.periodEnd ? j : null))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [ticker]);

  if (!p) return null;
  const date = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString(isES ? "es-ES" : "en-US");
  const growthColor = (g: number | null | undefined) =>
    g === null || g === undefined ? undefined : g >= 0 ? (theme === "light" ? "#15803d" : "#34d399") : theme === "light" ? "#b91c1c" : "#fb7185";
  const pct = (g: number | null | undefined) => (g === null || g === undefined ? "" : `${g >= 0 ? "+" : ""}${(g * 100).toFixed(1)}%`);
  const q = p.quarter;
  const period = p.fiscalQuarter ? `${isES ? "T" : "Q"}${p.fiscalQuarter} FY${String(p.fiscalYear ?? "").slice(2)}` : date(p.periodEnd);
  const items: { label: string; value: string; g?: number | null }[] = [
    { label: isES ? "Ingresos" : "Revenue", value: money(q.revenue), g: p.yoy?.revenue },
    { label: isES ? "Bº operativo" : "Operating income", value: money(q.operating_income), g: p.yoy?.operatingIncome },
    { label: isES ? "Bº neto" : "Net income", value: money(q.net_income), g: p.yoy?.netIncome },
    { label: isES ? "BPA diluido (GAAP)" : "Diluted EPS (GAAP)", value: q.diluted_eps === null || q.diluted_eps === undefined ? "—" : `$${q.diluted_eps.toFixed(2)}`, g: p.yoy?.dilutedEPS },
  ];

  return (
    <div className="bg-theme-card border border-amber-500/40 rounded-2xl p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <FileClock size={16} className="text-amber-500 shrink-0" />
          <h3 className="text-xs font-black uppercase tracking-wider text-theme-text-bright truncate">
            {isES ? `Avance de resultados ${period}` : `Earnings preview ${period}`}
          </h3>
          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border border-amber-500/40 shrink-0"
            style={{ color: theme === "light" ? "#b45309" : "#fbbf24" }}>
            Provisional
          </span>
        </div>
        <a
          href={p.url ?? p.filingIndex}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] text-theme-text-muted hover:text-theme-text-bright inline-flex items-center gap-1"
        >
          {isES ? `8-K del ${date(p.filed)}` : `8-K filed ${date(p.filed)}`} <ExternalLink size={11} />
        </a>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {items.map((it) => (
          <div key={it.label} className="bg-theme-input border border-theme-border rounded-xl px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-wider text-theme-text-muted font-bold">{it.label}</div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="font-mono font-bold text-theme-text-bright text-sm">{it.value}</span>
              {it.g !== undefined && it.g !== null && (
                <span className="font-mono text-[11px]" style={{ color: growthColor(it.g) }}>
                  {pct(it.g)}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-1 text-[11px] text-theme-text-muted">
        {p.nonGaapEps !== null && p.nonGaapEps !== undefined && (
          <p>{isES ? `BPA ajustado (no GAAP) según la empresa: $${p.nonGaapEps.toFixed(2)}` : `Company-adjusted (non-GAAP) EPS: $${p.nonGaapEps.toFixed(2)}`}</p>
        )}
        {p.guidance && <p>{isES ? `Previsión: ${p.guidance}` : `Outlook: ${p.guidance}`}</p>}
        <p>
          {isES
            ? "Cifras del comunicado de resultados (8-K), leídas con IA y contrastadas con el mismo trimestre del año anterior en la SEC. Los modelos siguen usando el último 10-Q/10-K; este avance desaparece cuando se presente el 10-Q."
            : "Figures from the earnings release (8-K), read by AI and checked against the prior-year quarter in SEC data. Models still use the latest 10-Q/10-K; this preview disappears once the 10-Q is filed."}
        </p>
      </div>
    </div>
  );
}
