import React, { useEffect, useMemo, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Loader2, Info, Gauge } from "lucide-react";
import FairValueGraph from "./FairValueGraph";

// Múltiplos de valoración a lo largo del tiempo. Datos: GET /api/valuation/:ticker
// (src/worker/legacy/routes.ts): precio diario de Yahoo y fundamentales TTM de la SEC.

type MetricKey = "pe" | "dy" | "pfcf" | "pocf" | "ps" | "ev" | "pb" | "peg";
type RangeKey = "1M" | "6M" | "YTD" | "1Y" | "5Y" | "10Y" | "ALL";
interface Point { d: string; p: number; pe?: number | null; dy?: number | null; pfcf?: number | null; pocf?: number | null; ps?: number | null; ev?: number | null; pb?: number | null; peg?: number | null }
interface ValuationData { symbol: string; currency: string; asOf: string | null; forwardPE: number | null; points: (Point & Record<string, any>)[] }

interface Props {
  ticker: string;
  language: "EN" | "ES";
  theme: "dark" | "light";
}

const METRICS: { key: MetricKey; label: { EN: string; ES: string }; pct?: boolean; help: { EN: string; ES: string } }[] = [
  { key: "pe", label: { EN: "P/E", ES: "PER" }, help: { EN: "Price ÷ diluted EPS of the last 4 quarters (TTM). Not shown when EPS is negative.", ES: "Precio ÷ BPA diluido de los 4 últimos trimestres (TTM). No se muestra con BPA negativo." } },
  { key: "dy", label: { EN: "Dividend Yield", ES: "Rent. dividendo" }, pct: true, help: { EN: "Dividends per share paid in the last 12 months ÷ price.", ES: "Dividendos por acción pagados en los últimos 12 meses ÷ precio." } },
  { key: "pfcf", label: { EN: "P/FCF", ES: "P/FCF" }, help: { EN: "Market cap ÷ free cash flow TTM (operating cash flow − capex).", ES: "Capitalización ÷ flujo de caja libre TTM (flujo operativo − inversiones)." } },
  { key: "pocf", label: { EN: "P/OCF", ES: "P/OCF" }, help: { EN: "Market cap ÷ operating cash flow TTM.", ES: "Capitalización ÷ flujo de caja operativo TTM." } },
  { key: "ps", label: { EN: "P/S", ES: "P/Ventas" }, help: { EN: "Market cap ÷ revenue TTM.", ES: "Capitalización ÷ ingresos TTM." } },
  { key: "ev", label: { EN: "EV/EBITDA", ES: "EV/EBITDA" }, help: { EN: "(Market cap + debt − cash and short-term investments) ÷ EBITDA TTM.", ES: "(Capitalización + deuda − caja e inversiones a corto) ÷ EBITDA TTM." } },
  { key: "pb", label: { EN: "P/B", ES: "P/VC" }, help: { EN: "Market cap ÷ shareholders' equity (latest balance sheet).", ES: "Capitalización ÷ patrimonio neto (último balance)." } },
  { key: "peg", label: { EN: "PEG", ES: "PEG" }, help: { EN: "P/E ÷ year-over-year growth of TTM diluted EPS (in %). Only when EPS grows.", ES: "PER ÷ crecimiento interanual del BPA diluido TTM (en %). Solo si el BPA crece." } },
];
const RANGES: RangeKey[] = ["1M", "6M", "YTD", "1Y", "5Y", "10Y", "ALL"];

const DAY = 86400000;
const fmtVal = (v: number | null | undefined, pct?: boolean) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : pct ? `${v.toFixed(2)}%` : v.toFixed(2);

export default function ValuationMultiples({ ticker, language, theme }: Props) {
  const isES = language === "ES";
  const [data, setData] = useState<ValuationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<MetricKey>("pe");
  const [range, setRange] = useState<RangeKey>("5Y");
  const [basis, setBasis] = useState<"TTM" | "FWD">("TTM");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setData(null);
    fetch(`/api/valuation/${encodeURIComponent(ticker)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!alive) return;
        if (!r.ok || !j?.points?.length) {
          setError(j?.error || (isES ? "Sin datos de valoración." : "No valuation data."));
          return;
        }
        setData(j);
      })
      .catch(() => alive && setError(isES ? "No se pudo cargar la valoración." : "Could not load valuation."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [ticker]);

  const def = METRICS.find((m) => m.key === metric)!;

  const view = useMemo(() => {
    if (!data) return null;
    const last = data.points[data.points.length - 1];
    const lastT = new Date(last.d).getTime();
    const from =
      range === "1M" ? lastT - 31 * DAY
      : range === "6M" ? lastT - 183 * DAY
      : range === "YTD" ? new Date(`${last.d.slice(0, 4)}-01-01`).getTime()
      : range === "1Y" ? lastT - 366 * DAY
      : range === "5Y" ? lastT - 5 * 365.25 * DAY
      : range === "10Y" ? lastT - 10 * 365.25 * DAY
      : 0;
    // Desde el primer dato del múltiplo (los años sin fundamentales no se dibujan vacíos)
    const firstWith = data.points.findIndex((p) => typeof p[metric] === "number");
    const rows = data.points.filter((p, i) => i >= Math.max(0, firstWith) && new Date(p.d).getTime() >= from).map((p) => ({ d: p.d, t: Date.parse(`${p.d}T12:00:00Z`), p: p.p, v: p[metric] ?? null }));
    const vals = rows.map((r) => r.v).filter((v): v is number => typeof v === "number");
    const current = [...data.points].reverse().find((p) => typeof p[metric] === "number");
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    const spanDays = rows.length ? (new Date(rows[rows.length - 1].d).getTime() - new Date(rows[0].d).getTime()) / DAY : 0;
    return {
      rows,
      current: current ? { v: current[metric] as number, d: current.d } : null,
      avg,
      min: vals.length ? Math.min(...vals) : null,
      max: vals.length ? Math.max(...vals) : null,
      spanDays,
      hasData: vals.length > 0,
    };
  }, [data, metric, range]);

  const card = "bg-theme-card border border-theme-border rounded-3xl p-5 sm:p-6";
  if (loading)
    return (
      <div className={`${card} flex items-center justify-center gap-2 py-16 text-theme-text-muted text-sm`}>
        <Loader2 size={16} className="animate-spin" /> {isES ? "Calculando múltiplos…" : "Computing multiples…"}
      </div>
    );
  if (error || !data || !view)
    return (
      <div className={`${card} text-center py-14`}>
        <Gauge size={28} className="mx-auto mb-3 text-theme-text-muted" />
        <p className="text-sm text-theme-text-bright font-semibold">{error || (isES ? "Sin datos de valoración." : "No valuation data.")}</p>
      </div>
    );

  const light = theme === "light";
  const lineColor = light ? "#047857" : "#34d399";
  const gridColor = light ? "#e7e3da" : "#1e2230";
  const axisColor = light ? "#6b675e" : "#8b90a0";
  const gradId = `valgrad-${theme}`;
  const showFwd = metric === "pe" && basis === "FWD";
  const premium = view.current && view.avg ? view.current.v / view.avg - 1 : null;
  // Eje X de tiempo real (los puntos antiguos son semanales y los recientes diarios): marcas el 1 de
  // enero en rangos largos, cada 1-2 meses en rangos de meses y semanales en un mes
  const t0 = view.rows[0]?.t ?? 0, t1 = view.rows[view.rows.length - 1]?.t ?? 0;
  const ticks: number[] = [];
  {
    const a = new Date(t0);
    if (view.spanDays > 2 * 365) {
      for (let y = a.getUTCFullYear() + 1; Date.UTC(y, 0, 1) <= t1; y++) ticks.push(Date.UTC(y, 0, 1));
    } else if (view.spanDays > 40) {
      const step = view.spanDays > 200 ? 2 : 1;
      for (let m = a.getUTCMonth() + 1, y = a.getUTCFullYear(); ; m += step) {
        const t = Date.UTC(y + Math.floor(m / 12), m % 12, 1);
        if (t > t1) break;
        ticks.push(t);
      }
    } else {
      for (let t = t0 + 7 * DAY; t <= t1; t += 7 * DAY) ticks.push(t);
    }
  }
  const tickFmt = (t: number) => {
    const dt = new Date(t);
    if (view.spanDays > 2 * 365) return String(dt.getUTCFullYear());
    return dt.toLocaleDateString(isES ? "es-ES" : "en-US", { month: "short", year: view.spanDays > 200 ? "2-digit" : undefined, day: view.spanDays <= 40 ? "numeric" : undefined, timeZone: "UTC" });
  };

  const TooltipBox = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    return (
      <div className="bg-theme-sidebar border border-theme-border rounded-xl px-3 py-2 shadow-xl text-xs min-w-[150px]">
        <div className="font-bold text-theme-text-bright mb-1">
          {new Date(`${row.d}T12:00:00Z`).toLocaleDateString(isES ? "es-ES" : "en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-theme-text-muted">{def.label[language]}</span>
          <span className="font-mono text-theme-text-bright font-bold">{fmtVal(row.v, def.pct)}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-theme-text-muted">{isES ? "Precio" : "Price"}</span>
          <span className="font-mono text-theme-text-bright">{row.p?.toFixed(2)}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
    <div className={`${card} space-y-5`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-black uppercase tracking-wider text-theme-text-bright flex items-center gap-2">
          <Gauge size={15} className="text-emerald-500" />
          {isES ? "Múltiplos de valoración" : "Valuation multiples"} · {ticker}
        </h3>
        <span className="text-[11px] text-theme-text-muted">
          {isES ? "Precio: Yahoo · Fundamentales: SEC 10-Q/10-K" : "Price: Yahoo · Fundamentals: SEC 10-Q/10-K"}
        </span>
      </div>

      {/* Múltiplos */}
      <div className="flex gap-1 overflow-x-auto border-b border-theme-border -mx-1 px-1">
        {METRICS.map((m) => (
          <button
            key={m.key}
            onClick={() => setMetric(m.key)}
            className={`px-3 py-2 text-sm font-bold whitespace-nowrap cursor-pointer border-b-2 -mb-px transition-colors ${
              metric === m.key ? "border-emerald-500 text-theme-text-bright" : "border-transparent text-theme-text-muted hover:text-theme-text-bright"
            }`}
          >
            {m.label[language]}
          </button>
        ))}
      </div>

      {/* Valor actual + controles */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-theme-text-muted flex items-center gap-1.5">
            {isES ? "Actual" : "Current"} {def.label[language]} {showFwd ? (isES ? "(próximos 12 meses)" : "(forward)") : ""}
            <span title={def.help[language]} className="cursor-help">
              <Info size={11} />
            </span>
          </div>
          <div className="text-4xl font-black font-mono text-theme-text-bright mt-1">
            {showFwd ? fmtVal(data.forwardPE) : fmtVal(view.current?.v, def.pct)}
          </div>
          {!showFwd && view.hasData && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-theme-text-muted">
              <span>
                {isES ? "Media" : "Average"} <b className="font-mono text-theme-text-bright">{fmtVal(view.avg, def.pct)}</b>
              </span>
              <span>
                {isES ? "Mín" : "Min"} <b className="font-mono text-theme-text-bright">{fmtVal(view.min, def.pct)}</b>
              </span>
              <span>
                {isES ? "Máx" : "Max"} <b className="font-mono text-theme-text-bright">{fmtVal(view.max, def.pct)}</b>
              </span>
              {premium !== null && metric !== "dy" && (
                <span>
                  {isES ? "vs. media" : "vs. average"}{" "}
                  <b className="font-mono" style={{ color: premium > 0 ? (light ? "#b91c1c" : "#fb7185") : light ? "#15803d" : "#34d399" }}>
                    {premium > 0 ? "+" : ""}
                    {(premium * 100).toFixed(1)}%
                  </b>
                </span>
              )}
            </div>
          )}
          {showFwd && (
            <p className="text-xs text-theme-text-muted mt-2 max-w-sm">
              {isES
                ? "Precio ÷ BPA estimado por los analistas para los próximos 12 meses (Yahoo). Solo hay valor actual, no histórico."
                : "Price ÷ analysts' estimated EPS for the next 12 months (Yahoo). Current value only, no history."}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {metric === "pe" && (
            <div className="flex bg-theme-input border border-theme-border rounded-xl p-0.5">
              {(["TTM", "FWD"] as const).map((b) => (
                <button
                  key={b}
                  onClick={() => setBasis(b)}
                  disabled={b === "FWD" && data.forwardPE === null}
                  title={b === "FWD" && data.forwardPE === null ? (isES ? "Sin estimación de analistas" : "No analyst estimate") : undefined}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                    basis === b ? "bg-theme-border text-theme-text-bright" : "text-theme-text-muted hover:text-theme-text-bright"
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          )}
          <div className="flex bg-theme-input border border-theme-border rounded-xl p-0.5">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                  range === r ? "bg-theme-border text-theme-text-bright" : "text-theme-text-muted hover:text-theme-text-bright"
                }`}
              >
                {r === "ALL" ? (isES ? "Todo" : "All") : r === "YTD" && isES ? "Año" : r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Gráfico (TTM) */}
      {view.hasData ? (
        <div className="h-[280px] sm:h-[340px] -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={view.rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={lineColor} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={lineColor} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={gridColor} />
              <XAxis dataKey="t" type="number" scale="time" domain={[t0, t1]} ticks={ticks} tickFormatter={tickFmt} tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={20} />
              <YAxis
                domain={["auto", "auto"]}
                tickFormatter={(v) => (def.pct ? `${Number(v).toFixed(1)}%` : Number(v).toFixed(v >= 100 ? 0 : 1))}
                tick={{ fill: axisColor, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              {view.avg !== null && (
                <ReferenceLine
                  y={view.avg}
                  stroke={axisColor}
                  strokeDasharray="4 4"
                  strokeOpacity={0.8}
                  label={{ value: `${isES ? "Media" : "Avg"} ${fmtVal(view.avg, def.pct)}`, position: "insideTopRight", fill: axisColor, fontSize: 10 }}
                />
              )}
              <Tooltip content={<TooltipBox />} cursor={{ stroke: axisColor, strokeWidth: 1, strokeDasharray: "3 3" }} />
              <Area type="monotone" dataKey="v" stroke={lineColor} strokeWidth={2} fill={`url(#${gradId})`} connectNulls={false} isAnimationActive={false} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: light ? "#fff" : "#0f111a" }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="text-center py-12 text-sm text-theme-text-muted">
          {isES ? "No hay datos de este múltiplo para la empresa (p. ej. beneficio o flujo de caja negativos)." : "No data for this multiple (e.g. negative earnings or cash flow)."}
        </div>
      )}

      <p className="text-[11px] text-theme-text-muted flex items-start gap-1.5">
        <Info size={12} className="mt-0.5 shrink-0" />
        {isES
          ? "Fundamentales de los 4 últimos trimestres (TTM) de los 10-Q/10-K de la SEC, cada uno desde la fecha en que se presentó el informe (sin ver el futuro). Ajustado por splits. Los tramos sin línea son periodos con beneficio, flujo o patrimonio negativos."
          : "Fundamentals of the last 4 quarters (TTM) from SEC 10-Q/10-K filings, each counted from the date the report was filed (no look-ahead). Split-adjusted. Gaps are periods with negative earnings, cash flow or equity."}
      </p>
    </div>
    {/* Valor razonable: cifra por acción × múltiplo mediano histórico (mismos datos) */}
    <FairValueGraph ticker={ticker} points={data.points} forwardPE={data.forwardPE} currency={data.currency} language={language} theme={theme} />
    </div>
  );
}
