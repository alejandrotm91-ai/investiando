import React, { useMemo, useState } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Info } from "lucide-react";

// Márgenes y costes por segmento (pestaña Segmentos). Los gastos por segmento salen del XBRL de los
// 10-K/10-Q desde 2024 (norma ASU 2023-07; src/worker/sec/segments.ts, COST_TAGS), así que el
// histórico suele empezar en 2022-2023.

export type CostKey = "cogs" | "sga" | "rnd" | "sm" | "ga" | "da" | "capex";
export interface MarginPeriod {
  date: string;
  kind: "Q" | "FY";
  revenue: Record<string, number>;
  operatingIncome: Record<string, number>;
  costs?: Partial<Record<CostKey | "base", Record<string, number>>>;
}

/** Ingresos contra los que se miden costes y márgenes: los del mismo informe que los gastos. */
const revOf = (p: MarginPeriod, m: string) => p.costs?.base?.[m] ?? p.revenue[m];
interface Series { id: string; label: string; color: string }

interface Props {
  periods: MarginPeriod[]; // en orden cronológico, los mismos que el gráfico de ingresos
  series: Series[]; // líneas visibles (filtro de la leyenda), sin "Otros"
  label: (p: any) => string;
  theme: "dark" | "light";
  isES: boolean;
}

type Metric = "operating" | "gross" | "cash" | "structure";

// Componentes de la estructura de costes: tonos propios (no son segmentos) en orden fijo
const PARTS: { key: string; es: string; en: string; light: string; dark: string }[] = [
  { key: "cogs", es: "Coste de ventas", en: "Cost of sales", light: "#8a6d3b", dark: "#b8975a" },
  { key: "sga", es: "Comerciales y generales", en: "SG&A", light: "#6250d6", dark: "#9085e9" },
  { key: "sm", es: "Marketing", en: "Sales & marketing", light: "#e87ba4", dark: "#d55181" },
  { key: "ga", es: "Generales y admin.", en: "G&A", light: "#2a78d6", dark: "#3987e5" },
  { key: "rnd", es: "I+D", en: "R&D", light: "#eda100", dark: "#c98500" },
  { key: "other", es: "Otros costes", en: "Other costs", light: "#b3afa6", dark: "#4b4a45" },
  { key: "margin", es: "Margen operativo", en: "Operating margin", light: "#1baf7a", dark: "#199e70" },
];

const pct = (v: number | null | undefined, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(d)}%`);
const money = (v: number | undefined) => {
  if (v === undefined || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  return `${v < 0 ? "−" : ""}$${a >= 1e9 ? `${(a / 1e9).toFixed(a >= 1e10 ? 1 : 2)}B` : `${(a / 1e6).toFixed(0)}M`}`;
};

/** Costes identificados de un segmento (si hay SG&A, sus partes no se suman otra vez). */
function knownCosts(p: MarginPeriod, m: string) {
  const c = p.costs ?? {};
  const get = (k: CostKey) => c[k]?.[m];
  const parts: Record<string, number> = {};
  for (const k of ["cogs", "sga", "rnd"] as CostKey[]) if (get(k) !== undefined) parts[k] = get(k)!;
  if (get("sga") === undefined) for (const k of ["sm", "ga"] as CostKey[]) if (get(k) !== undefined) parts[k] = get(k)!;
  return parts;
}

/**
 * Margen bruto, solo si el coste de ventas es fiable: con beneficio operativo, los costes identificados
 * deben cubrir al menos el 80 % de los gastos del segmento (Disney pone casi todo en etiquetas propias).
 */
function grossMargin(p: MarginPeriod, m: string): number | null {
  const r = revOf(p, m);
  const cogs = p.costs?.cogs?.[m];
  if (!r || r <= 0 || cogs === undefined) return null;
  const oi = p.operatingIncome[m];
  if (oi !== undefined) {
    const expenses = r - oi;
    const known = Object.values(knownCosts(p, m)).reduce((a, b) => a + b, 0);
    if (expenses > 0 && known / expenses < 0.8) return null;
  }
  return (r - cogs) / r;
}

const cashOf = (p: MarginPeriod, m: string) => {
  const oi = p.operatingIncome[m], da = p.costs?.da?.[m], capex = p.costs?.capex?.[m];
  return oi === undefined || da === undefined || capex === undefined ? null : oi + da - capex;
};

export default function SegmentMargins({ periods, series, label, theme, isES }: Props) {
  const [metric, setMetric] = useState<Metric>("operating");
  const withCosts = periods.filter((p) => p.costs && Object.keys(p.costs).length);
  const hasGross = periods.some((p) => series.some((s) => grossMargin(p, s.id) !== null));
  const hasCash = periods.some((p) => series.some((s) => cashOf(p, s.id) !== null));
  const hasOI = periods.some((p) => series.some((s) => p.operatingIncome[s.id] !== undefined && revOf(p, s.id) > 0));

  const metrics: { id: Metric; es: string; en: string; on: boolean }[] = [
    { id: "operating", es: "Margen operativo", en: "Operating margin", on: hasOI },
    { id: "gross", es: "Margen bruto", en: "Gross margin", on: hasGross },
    { id: "structure", es: "Estructura de costes", en: "Cost structure", on: withCosts.length > 0 },
    { id: "cash", es: "Caja aprox.", en: "Cash proxy", on: hasCash },
  ];
  const available = metrics.filter((m) => m.on);
  const active: Metric = available.some((m) => m.id === metric) ? metric : available[0]?.id ?? "operating";

  // Series temporales (una línea por segmento)
  const rows = useMemo(
    () =>
      periods.map((p) => {
        const row: Record<string, any> = { name: label(p) };
        for (const s of series) {
          const r = revOf(p, s.id);
          if (!r || r <= 0) continue;
          if (active === "operating" && p.operatingIncome[s.id] !== undefined) row[s.id] = p.operatingIncome[s.id] / r;
          if (active === "gross") row[s.id] = grossMargin(p, s.id) ?? undefined;
          if (active === "cash") {
            const c = cashOf(p, s.id);
            if (c !== null) {
              row[s.id] = c / r;
              row[`${s.id}__abs`] = c;
            }
          }
        }
        return row;
      }),
    [periods, series, active, label]
  );
  const lineSeries = series.filter((s) => rows.some((r) => r[s.id] !== undefined));

  // Estructura de costes del último periodo con gastos por segmento
  const last = withCosts[withCosts.length - 1];
  const structure = useMemo(() => {
    if (!last) return [];
    return series
      .filter((s) => (revOf(last, s.id) ?? 0) > 0)
      .map((s) => {
        const r = revOf(last, s.id);
        const parts = knownCosts(last, s.id);
        const known = Object.values(parts).reduce((a, b) => a + b, 0);
        const oi = last.operatingIncome[s.id];
        const row: Record<string, any> = { name: s.label, revenue: r };
        for (const [k, v] of Object.entries(parts)) row[k] = v / r;
        if (oi !== undefined) {
          const other = r - oi - known;
          if (other > r * 0.005) row.other = other / r;
          row.margin = Math.max(0, oi) / r;
          row.oi = oi;
        }
        return row;
      })
      .filter((row) => PARTS.some((p) => p.key !== "margin" && row[p.key] !== undefined));
  }, [last, series]);
  const usedParts = PARTS.filter((p) => structure.some((r) => r[p.key] !== undefined));

  if (!available.length) return null;
  const gridColor = theme === "light" ? "#e7e3da" : "#1e2230";
  const axisColor = theme === "light" ? "#6b675e" : "#8b90a0";
  const firstWithCosts = withCosts[0];

  const LineTip = ({ active: on, payload, label: name }: any) => {
    if (!on || !payload?.length) return null;
    return (
      <div className="bg-theme-sidebar border border-theme-border rounded-xl px-3 py-2 shadow-xl text-xs min-w-[180px]">
        <div className="font-bold text-theme-text-bright mb-1.5">{name}</div>
        {[...payload].sort((a: any, b: any) => b.value - a.value).map((p: any) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-3 py-0.5">
            <span className="flex items-center gap-1.5 text-theme-text-muted truncate">
              <span className="w-2.5 h-0.5 rounded shrink-0" style={{ background: p.color }} />
              {series.find((s) => s.id === p.dataKey)?.label}
            </span>
            <span className="font-mono text-theme-text-bright">
              {pct(p.value)}
              {active === "cash" && <span className="text-theme-text-muted"> · {money(p.payload[`${p.dataKey}__abs`])}</span>}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const BarTip = ({ active: on, payload }: any) => {
    if (!on || !payload?.length) return null;
    const row = payload[0].payload;
    return (
      <div className="bg-theme-sidebar border border-theme-border rounded-xl px-3 py-2 shadow-xl text-xs min-w-[200px]">
        <div className="font-bold text-theme-text-bright mb-1.5">
          {row.name} · {money(row.revenue)}
        </div>
        {usedParts.filter((p) => row[p.key] !== undefined).map((p) => (
          <div key={p.key} className="flex items-center justify-between gap-3 py-0.5">
            <span className="flex items-center gap-1.5 text-theme-text-muted">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: p[theme] }} />
              {isES ? p.es : p.en}
            </span>
            <span className="font-mono text-theme-text-bright">
              {pct(p.key === "margin" ? row.oi / row.revenue : row[p.key])} <span className="text-theme-text-muted">· {money(p.key === "margin" ? row.oi : row[p.key] * row.revenue)}</span>
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="pt-5 border-t border-theme-border space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h4 className="text-xs font-black uppercase tracking-wider text-theme-text-bright">{isES ? "Márgenes y costes por segmento" : "Segment margins & costs"}</h4>
          <p className="text-[11px] text-theme-text-muted mt-0.5">
            {active === "structure" && last
              ? isES
                ? `% de los ingresos de cada segmento · ${label(last)}`
                : `% of each segment's revenue · ${label(last)}`
              : isES
                ? "% de los ingresos de cada segmento"
                : "% of each segment's revenue"}
          </p>
        </div>
        <div className="flex flex-wrap bg-theme-input border border-theme-border rounded-xl p-0.5 self-start">
          {available.map((m) => (
            <button
              key={m.id}
              onClick={() => setMetric(m.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${active === m.id ? "bg-theme-border text-theme-text-bright" : "text-theme-text-muted hover:text-theme-text-bright"}`}
            >
              {isES ? m.es : m.en}
            </button>
          ))}
        </div>
      </div>

      {active === "structure" ? (
        <>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {usedParts.map((p) => (
              <span key={p.key} className="flex items-center gap-1.5 text-[11px] text-theme-text-bright">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: p[theme] }} />
                {isES ? p.es : p.en}
              </span>
            ))}
          </div>
          <div style={{ height: Math.max(120, structure.length * 44 + 30) }} className="-ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={structure} layout="vertical" barCategoryGap="22%" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke={gridColor} />
                <XAxis type="number" domain={[0, 1]} tickFormatter={(v) => pct(v, 0)} tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<BarTip />} cursor={{ fill: theme === "light" ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)" }} />
                {usedParts.map((p) => (
                  <Bar key={p.key} dataKey={p.key} stackId="s" fill={p[theme]} stroke={theme === "light" ? "#ffffff" : "#0f111a"} strokeWidth={1} isAnimationActive={false} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {lineSeries.map((s) => (
              <span key={s.id} className="flex items-center gap-1.5 text-[11px] text-theme-text-bright">
                <span className="w-3 h-0.5 rounded" style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
          </div>
          <div className="h-[240px] -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={gridColor} />
                <XAxis dataKey="name" tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => pct(v, 0)} tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
                <ReferenceLine y={0} stroke={axisColor} strokeOpacity={0.5} />
                <Tooltip content={<LineTip />} />
                {lineSeries.map((s) => (
                  <Line key={s.id} dataKey={s.id} stroke={s.color} strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: s.color }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      <p className="text-[11px] text-theme-text-muted flex items-start gap-1.5">
        <Info size={12} className="mt-0.5 shrink-0" />
        <span>
          {active === "cash"
            ? isES
              ? "Aproximación, no es el flujo de caja libre publicado: beneficio operativo del segmento + amortizaciones − inversión (capex). Sin impuestos ni capital circulante."
              : "Approximation, not reported free cash flow: segment operating income + D&A − capex. Excludes taxes and working capital."
            : active === "gross"
              ? isES
                ? "Ingresos menos coste de ventas del segmento. Se omite cuando la empresa declara la mayoría de sus costes con partidas propias."
                : "Revenue minus the segment's cost of sales. Omitted when the company reports most of its costs under its own line items."
              : active === "structure"
                ? isES
                  ? "\"Otros costes\" es la diferencia hasta el beneficio operativo: partidas que la empresa no clasifica en las categorías estándar."
                  : "\"Other costs\" is the remainder up to operating income: items the company doesn't classify in the standard categories."
                : isES
                  ? "Beneficio del segmento según la empresa: operativo, o la medida que use (Caterpillar, antes de impuestos; Uber, EBITDA ajustado)."
                  : "Segment profit as defined by the company: operating income, or its own measure (Caterpillar: pre-tax profit; Uber: adjusted EBITDA)."}
          {firstWithCosts && active !== "operating" &&
            (isES
              ? ` Los gastos por segmento se publican desde ${label(firstWithCosts)} (norma de la SEC de 2024).`
              : ` Segment expenses are reported since ${label(firstWithCosts)} (2024 SEC rule).`)}
        </span>
      </p>
    </div>
  );
}
