import React, { useEffect, useMemo, useState } from "react";
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Info, Scale, Pencil, RotateCcw } from "lucide-react";

// Valor razonable según la historia de valoración de la empresa: cifra por acción (BPA, dividendo,
// FCF, flujo operativo, ventas, EBITDA o valor contable) × su múltiplo mediano histórico (o el que
// elija el usuario). Datos: los mismos puntos de GET /api/valuation/:ticker (ValuationMultiples),
// con los fundamentales TTM de la SEC por acción y el precio de Yahoo.

export interface FvPoint {
  d: string;
  p: number;
  pe?: number | null; dy?: number | null; pfcf?: number | null; pocf?: number | null; ps?: number | null; ev?: number | null; pb?: number | null;
  eps?: number | null; dps?: number | null; fcfps?: number | null; ocfps?: number | null; sps?: number | null; ebps?: number | null; bvps?: number | null; ndps?: number | null;
}

type BaseKey = "eps" | "div" | "fcf" | "ocf" | "rev" | "ebitda" | "book";
type RangeKey = "1Y" | "3Y" | "5Y" | "10Y" | "ALL";

const BASES: {
  key: BaseKey;
  tab: { EN: string; ES: string };
  mult: "pe" | "dy" | "pfcf" | "pocf" | "ps" | "ev" | "pb";
  multName: { EN: string; ES: string };
  perShare: "eps" | "dps" | "fcfps" | "ocfps" | "sps" | "ebps" | "bvps";
  psName: { EN: string; ES: string };
}[] = [
  { key: "eps", tab: { EN: "EPS", ES: "BPA" }, mult: "pe", multName: { EN: "P/E", ES: "PER" }, perShare: "eps", psName: { EN: "diluted EPS TTM", ES: "BPA diluido TTM" } },
  { key: "div", tab: { EN: "Dividend", ES: "Dividendo" }, mult: "dy", multName: { EN: "dividend yield", ES: "rent. por dividendo" }, perShare: "dps", psName: { EN: "dividend per share TTM", ES: "dividendo por acción TTM" } },
  { key: "fcf", tab: { EN: "FCF", ES: "FCF" }, mult: "pfcf", multName: { EN: "P/FCF", ES: "P/FCF" }, perShare: "fcfps", psName: { EN: "FCF per share TTM", ES: "FCF por acción TTM" } },
  { key: "ocf", tab: { EN: "OCF", ES: "OCF" }, mult: "pocf", multName: { EN: "P/OCF", ES: "P/OCF" }, perShare: "ocfps", psName: { EN: "operating cash flow per share TTM", ES: "flujo operativo por acción TTM" } },
  { key: "rev", tab: { EN: "Revenue", ES: "Ventas" }, mult: "ps", multName: { EN: "P/S", ES: "P/Ventas" }, perShare: "sps", psName: { EN: "revenue per share TTM", ES: "ventas por acción TTM" } },
  { key: "ebitda", tab: { EN: "EBITDA", ES: "EBITDA" }, mult: "ev", multName: { EN: "EV/EBITDA", ES: "EV/EBITDA" }, perShare: "ebps", psName: { EN: "EBITDA per share TTM", ES: "EBITDA por acción TTM" } },
  { key: "book", tab: { EN: "Book", ES: "Valor contable" }, mult: "pb", multName: { EN: "P/B", ES: "P/VC" }, perShare: "bvps", psName: { EN: "book value per share", ES: "valor contable por acción" } },
];
const RANGES: RangeKey[] = ["1Y", "3Y", "5Y", "10Y", "ALL"];
const DAY = 86400000;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Valor razonable por acción con un múltiplo dado (EV/EBITDA descuenta la deuda neta). */
function fairValue(base: (typeof BASES)[number], p: FvPoint, mult: number): number | null {
  const v = p[base.perShare];
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0 || !(mult > 0)) return null;
  if (base.key === "div") return v / (mult / 100);
  if (base.key === "ebitda") {
    const fv = v * mult - (p.ndps ?? 0);
    return fv > 0 ? fv : null;
  }
  return v * mult;
}

interface Props {
  ticker: string;
  points: FvPoint[];
  forwardPE: number | null;
  currency: string;
  language: "EN" | "ES";
  theme: "dark" | "light";
}

export default function FairValueGraph({ ticker, points, forwardPE, currency, language, theme }: Props) {
  const isES = language === "ES";
  const [baseKey, setBaseKey] = useState<BaseKey>("eps");
  const [basis, setBasis] = useState<"GAAP" | "FWD">("GAAP");
  const [range, setRange] = useState<RangeKey>("10Y");
  const [target, setTarget] = useState<number | null>(null); // null = mediana histórica
  const [draft, setDraft] = useState("");
  useEffect(() => setTarget(null), [baseKey, ticker]);

  // Bases con datos (sin dividendos o con beneficios siempre negativos, la pestaña no sale)
  const available = BASES.filter((b) => points.some((p) => typeof p[b.mult] === "number" && (p[b.mult] as number) > 0 && typeof p[b.perShare] === "number" && (p[b.perShare] as number) > 0));
  const base = available.find((b) => b.key === baseKey) ?? available[0];

  const stats = useMemo(() => {
    if (!base) return null;
    const vals = points.map((p) => p[base.mult]).filter((v): v is number => typeof v === "number" && v > 0);
    if (!vals.length) return null;
    const last = points[points.length - 1];
    const cur = [...points].reverse().find((p) => typeof p[base.mult] === "number" && (p[base.mult] as number) > 0);
    const lastPs = [...points].reverse().find((p) => typeof p[base.perShare] === "number");
    return { min: Math.min(...vals), max: Math.max(...vals), median: median(vals), current: cur?.[base.mult] as number | undefined, price: last.p, lastPs, firstYear: points.find((p) => typeof p[base.mult] === "number")?.d.slice(0, 4) };
  }, [points, base]);

  if (!base || !stats) return null;
  const isDiv = base.key === "div";
  const fwd = base.key === "eps" && basis === "FWD" && forwardPE ? stats.price / forwardPE : null; // BPA estimado a 12 meses
  const mult = target ?? stats.median;
  const fvNow = fwd !== null ? (fwd > 0 ? fwd * mult : null) : stats.lastPs ? fairValue(base, stats.lastPs, mult) : null;
  const upside = fvNow ? fvNow / stats.price - 1 : null;
  const gap = fvNow ? stats.price / fvNow - 1 : null;
  const status = gap === null ? null : gap > 0.1 ? "expensive" : gap < -0.1 ? "cheap" : "fair";

  // Serie del gráfico: precio frente a valor razonable (con el múltiplo objetivo) en el rango
  const lastT = new Date(points[points.length - 1].d).getTime();
  const from = range === "ALL" ? 0 : lastT - { "1Y": 1, "3Y": 3, "5Y": 5, "10Y": 10 }[range] * 365.25 * DAY;
  const rows = points
    .filter((p) => new Date(p.d).getTime() >= from)
    .map((p) => {
      const fv = fairValue(base, p, mult);
      const row: Record<string, any> = { d: p.d, t: Date.parse(`${p.d}T12:00:00Z`), p: p.p, fv };
      if (fv !== null) {
        row.base = Math.min(p.p, fv);
        row.over = Math.max(0, p.p - fv); // por encima del valor razonable (cara)
        row.under = Math.max(0, fv - p.p); // por debajo (barata)
      }
      return row;
    });
  const firstFv = rows.findIndex((r) => r.fv !== null);
  const chartRows = firstFv > 0 ? rows.slice(firstFv) : rows;

  const light = theme === "light";
  const red = light ? "#b91c1c" : "#fb7185";
  const green = light ? "#15803d" : "#34d399";
  const priceColor = light ? "#047857" : "#34d399";
  const fvColor = light ? "#57534e" : "#d6d3d1";
  const gridColor = light ? "#e7e3da" : "#1e2230";
  const axisColor = light ? "#6b675e" : "#8b90a0";
  const money = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : `${currency === "USD" ? "$" : ""}${v.toFixed(2)}${currency !== "USD" ? ` ${currency}` : ""}`);
  const fmtMult = (v: number | null | undefined) => (v === null || v === undefined ? "—" : isDiv ? `${v.toFixed(2)}%` : `${v.toFixed(2)}×`);

  const t0 = chartRows[0]?.t ?? 0, t1 = chartRows[chartRows.length - 1]?.t ?? 0;
  const spanDays = (t1 - t0) / DAY;
  const ticks: number[] = [];
  if (spanDays > 2 * 365) {
    const step = spanDays > 12 * 365 ? 2 : 1;
    for (let y = new Date(t0).getUTCFullYear() + 1; Date.UTC(y, 0, 1) <= t1; y += step) ticks.push(Date.UTC(y, 0, 1));
  } else {
    const a = new Date(t0);
    for (let m = a.getUTCMonth() + 1, y = a.getUTCFullYear(); ; m += 2) {
      const t = Date.UTC(y + Math.floor(m / 12), m % 12, 1);
      if (t > t1) break;
      ticks.push(t);
    }
  }
  const tickFmt = (t: number) =>
    spanDays > 2 * 365 ? String(new Date(t).getUTCFullYear()) : new Date(t).toLocaleDateString(isES ? "es-ES" : "en-US", { month: "short", year: "2-digit", timeZone: "UTC" });

  // Posición en el espectro (con dividendo, más rentabilidad = más barata)
  const spread = stats.max - stats.min || 1;
  const posOf = (v: number) => Math.min(1, Math.max(0, (v - stats.min) / spread));
  const curPos = stats.current !== undefined ? posOf(stats.current) : null;
  const gradient = isDiv
    ? "linear-gradient(90deg, #dc2626 0%, #eab308 50%, #16a34a 100%)"
    : "linear-gradient(90deg, #16a34a 0%, #eab308 50%, #dc2626 100%)";

  const statusText = {
    expensive: { EN: "Expensive", ES: "Cara" },
    cheap: { EN: "Cheap", ES: "Barata" },
    fair: { EN: "Fairly valued", ES: "En su valor" },
  };
  const statusColor = status === "expensive" ? red : status === "cheap" ? green : light ? "#a16207" : "#facc15";

  const commitDraft = () => {
    const v = Number(draft.replace(",", "."));
    if (Number.isFinite(v) && v > 0) setTarget(v);
    setDraft("");
  };

  const TooltipBox = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    const diff = row.fv ? row.p / row.fv - 1 : null;
    return (
      <div className="bg-theme-sidebar border border-theme-border rounded-xl px-3 py-2 shadow-xl text-xs min-w-[170px]">
        <div className="font-bold text-theme-text-bright mb-1">
          {new Date(`${row.d}T12:00:00Z`).toLocaleDateString(isES ? "es-ES" : "en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-theme-text-muted">{isES ? "Precio" : "Price"}</span>
          <span className="font-mono text-theme-text-bright font-bold">{money(row.p)}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-theme-text-muted">{isES ? "Valor razonable" : "Fair value"}</span>
          <span className="font-mono text-theme-text-bright">{money(row.fv)}</span>
        </div>
        {diff !== null && (
          <div className="flex justify-between gap-3">
            <span className="text-theme-text-muted">{isES ? "Diferencia" : "Gap"}</span>
            <span className="font-mono font-bold" style={{ color: diff > 0 ? red : green }}>
              {diff > 0 ? "+" : ""}
              {(diff * 100).toFixed(1)}%
            </span>
          </div>
        )}
      </div>
    );
  };

  const card = "bg-theme-card border border-theme-border rounded-3xl p-5 sm:p-6";
  const tile = "bg-theme-input border border-theme-border rounded-2xl p-3.5";
  const tileLabel = "text-[10px] font-bold uppercase tracking-wider text-theme-text-muted";

  return (
    <div className={`${card} space-y-5`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-black uppercase tracking-wider text-theme-text-bright flex items-center gap-2">
          <Scale size={15} className="text-emerald-500" />
          {isES ? "Valor razonable" : "Fair value"} · {ticker}
        </h3>
        <span className="text-[11px] text-theme-text-muted">
          {isES ? `Múltiplo mediano desde ${stats.firstYear}` : `Median multiple since ${stats.firstYear}`}
        </span>
      </div>

      {/* Base de la valoración */}
      <div className="flex gap-1 overflow-x-auto border-b border-theme-border -mx-1 px-1">
        {available.map((b) => (
          <button
            key={b.key}
            onClick={() => setBaseKey(b.key)}
            className={`px-3 py-2 text-sm font-bold whitespace-nowrap cursor-pointer border-b-2 -mb-px transition-colors ${
              base.key === b.key ? "border-emerald-500 text-theme-text-bright" : "border-transparent text-theme-text-muted hover:text-theme-text-bright"
            }`}
          >
            {b.tab[language]}
          </button>
        ))}
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-4 items-center">
        <div>
          {status && (
            <div className="text-3xl font-black tracking-tight" style={{ color: statusColor }}>
              {statusText[status][language]}
            </div>
          )}
          {gap !== null && (
            <p className="text-xs text-theme-text-muted mt-1">
              {isES
                ? `El precio está un ${Math.abs(gap * 100).toFixed(0)}% ${gap >= 0 ? "por encima" : "por debajo"} del valor razonable (el que implica su historial de valoración).`
                : `Price sits ${Math.abs(gap * 100).toFixed(0)}% ${gap >= 0 ? "above" : "below"} fair value (the price its valuation history implies).`}
            </p>
          )}
          {fvNow !== null && (
            <p className="text-[11px] text-theme-text-muted mt-1.5 font-mono">
              {isES ? "Valor razonable" : "Fair value"} {money(fvNow)} ={" "}
              {fwd !== null
                ? `${isES ? "BPA estimado 12m" : "Fwd EPS"} ${money(fwd)} × ${fmtMult(mult)}`
                : isDiv
                  ? `${money(stats.lastPs?.dps)} ÷ ${fmtMult(mult)}`
                  : base.key === "ebitda"
                    ? `(${money(stats.lastPs?.ebps)} × ${fmtMult(mult)}) ${(stats.lastPs?.ndps ?? 0) >= 0 ? `− ${isES ? "deuda neta" : "net debt"} ${money(stats.lastPs?.ndps)}` : `+ ${isES ? "caja neta" : "net cash"} ${money(-(stats.lastPs?.ndps ?? 0))}`}`
                    : `${money(stats.lastPs?.[base.perShare] as number)} × ${fmtMult(mult)}`}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className={tile}>
            <div className={tileLabel}>{isES ? "Precio actual" : "Current price"}</div>
            <div className="text-xl font-black font-mono text-theme-text-bright mt-1">{money(stats.price)}</div>
          </div>
          <div className={tile}>
            <div className={`${tileLabel} flex items-center justify-between gap-1`}>
              <span>
                {isES ? "Objetivo" : "Target"} {base.multName[language]}
              </span>
              {target !== null && (
                <button onClick={() => setTarget(null)} title={isES ? "Volver a la mediana" : "Back to median"} className="cursor-pointer hover:text-theme-text-bright">
                  <RotateCcw size={11} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-1 border border-theme-border rounded-lg px-2 py-1 bg-theme-card focus-within:border-emerald-500">
              <Pencil size={11} className="text-theme-text-muted shrink-0" />
              <input
                value={draft !== "" ? draft : mult.toFixed(2)}
                onChange={(e) => setDraft(e.target.value)}
                onFocus={(e) => {
                  setDraft(mult.toFixed(2));
                  e.target.select();
                }}
                onBlur={commitDraft}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                inputMode="decimal"
                aria-label={isES ? "Múltiplo objetivo" : "Target multiple"}
                className="w-full bg-transparent font-mono font-black text-lg text-theme-text-bright outline-none min-w-0"
              />
              <span className="text-theme-text-muted text-sm">{isDiv ? "%" : "×"}</span>
            </div>
            <div className="text-[10px] text-theme-text-muted mt-1">{target === null ? (isES ? "Mediana histórica" : "Historical median") : isES ? "Personalizado" : "Custom"}</div>
          </div>
          <div className={tile}>
            <div className={tileLabel}>{isES ? "Valor razonable" : "Fair value"}</div>
            <div className="text-xl font-black font-mono mt-1" style={{ color: green }}>
              {money(fvNow)}
            </div>
          </div>
          <div className={tile}>
            <div className={tileLabel}>{isES ? "Potencial" : "Upside"}</div>
            <div className="text-xl font-black font-mono mt-1" style={{ color: upside === null ? undefined : upside >= 0 ? green : red }}>
              {upside === null ? "—" : `${upside >= 0 ? "+" : ""}${(upside * 100).toFixed(1)}%`}
            </div>
            <div className="text-[10px] text-theme-text-muted mt-1">{isES ? "frente al precio actual" : "vs. today's price"}</div>
          </div>
        </div>
      </div>

      {/* Espectro del múltiplo */}
      <div className="space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-theme-text-muted">
          {isES ? "Espectro de" : "Spectrum of"} {base.multName[language]}
        </div>
        <div className="relative h-7 rounded-lg" style={{ background: gradient }}>
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-white/90">{isDiv ? (isES ? "Cara" : "Expensive") : isES ? "Barata" : "Cheap"}</span>
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-white/90">{isDiv ? (isES ? "Barata" : "Cheap") : isES ? "Cara" : "Expensive"}</span>
          {curPos !== null && (
            <div className="absolute top-0 bottom-0" style={{ left: `${curPos * 100}%` }}>
              <div className="w-0.5 h-full bg-white shadow" />
              {/* Etiqueta dentro de la barra, a la izquierda de la marca (a la derecha si no cabe) */}
              <span
                className="absolute top-1/2 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold whitespace-nowrap"
                style={{ background: "#0f111a", color: "#ffffff", transform: `translate(${curPos < 0.2 ? "6px" : "calc(-100% - 6px)"}, -50%)` }}
              >
                {isES ? "Actual" : "Current"} {fmtMult(stats.current)}
              </span>
            </div>
          )}
        </div>
        <div className="relative h-12">
          {[
            { v: stats.min, label: isES ? "Mín" : "Min" },
            { v: stats.median, label: isES ? "Mediana" : "Median" },
            { v: stats.max, label: isES ? "Máx" : "Max" },
          ].map((x, i) => {
            const pos = posOf(x.v);
            return (
              <div
                key={i}
                className="absolute top-0 text-center border border-theme-border rounded-lg px-2.5 py-1 bg-theme-input"
                style={{ left: `${pos * 100}%`, transform: `translateX(${i === 0 ? "0" : i === 2 ? "-100%" : "-50%"})` }}
              >
                <div className="text-[9px] font-bold uppercase tracking-wider text-theme-text-muted">{x.label}</div>
                <div className="text-xs font-mono font-black text-theme-text-bright">{fmtMult(x.v)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Precio frente a valor razonable */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-theme-text-muted">{isES ? "Precio frente a valor razonable" : "Price vs. fair value"}</div>
        <div className="flex flex-wrap items-center gap-2">
          {base.key === "eps" && (
            <div data-toggle className="flex bg-theme-input border border-theme-border rounded-xl p-0.5">
              {(["GAAP", "FWD"] as const).map((b) => (
                <button aria-pressed={!!(basis === b)}
                  key={b}
                  onClick={() => setBasis(b)}
                  disabled={b === "FWD" && !forwardPE}
                  title={b === "FWD" ? (isES ? "BPA estimado por los analistas a 12 meses (solo el valor actual)" : "Analysts' next-12-month EPS (current value only)") : undefined}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed ${basis === b ? "bg-theme-border text-theme-text-bright" : "text-theme-text-muted hover:text-theme-text-bright"}`}
                >
                  {b}
                </button>
              ))}
            </div>
          )}
          <div data-toggle className="flex bg-theme-input border border-theme-border rounded-xl p-0.5">
            {RANGES.map((r) => (
              <button aria-pressed={!!(range === r)}
                key={r}
                onClick={() => setRange(r)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${range === r ? "bg-theme-border text-theme-text-bright" : "text-theme-text-muted hover:text-theme-text-bright"}`}
              >
                {r === "ALL" ? (isES ? "Todo" : "All") : r}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-theme-text-bright -mt-2">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 rounded" style={{ background: priceColor }} />
          {isES ? "Precio" : "Price"}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 border-t-2 border-dashed" style={{ borderColor: fvColor }} />
          {isES ? "Valor razonable" : "Fair value"} ({fmtMult(mult)})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: red, opacity: 0.35 }} />
          {isES ? "Por encima" : "Above"}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: green, opacity: 0.35 }} />
          {isES ? "Por debajo" : "Below"}
        </span>
      </div>
      <div className="h-[300px] sm:h-[360px] -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={gridColor} />
            <XAxis dataKey="t" type="number" scale="time" domain={[t0, t1]} ticks={ticks} tickFormatter={tickFmt} tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={20} />
            <YAxis domain={[0, "auto"]} tickFormatter={(v) => `${currency === "USD" ? "$" : ""}${Number(v).toFixed(0)}`} tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} width={52} />
            <Tooltip content={<TooltipBox />} cursor={{ stroke: axisColor, strokeWidth: 1, strokeDasharray: "3 3" }} />
            {/* Banda entre precio y valor razonable: base transparente + exceso (rojo) o defecto (verde) */}
            <Area dataKey="base" stackId="band" stroke="none" fill="transparent" isAnimationActive={false} activeDot={false} />
            <Area dataKey="over" stackId="band" stroke="none" fill={red} fillOpacity={0.28} isAnimationActive={false} activeDot={false} />
            <Area dataKey="under" stackId="band" stroke="none" fill={green} fillOpacity={0.28} isAnimationActive={false} activeDot={false} />
            <Line dataKey="fv" stroke={fvColor} strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} connectNulls={false} activeDot={false} />
            <Line dataKey="p" stroke={priceColor} strokeWidth={2} dot={false} isAnimationActive={false} activeDot={{ r: 4, strokeWidth: 2, stroke: light ? "#fff" : "#0f111a" }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[11px] text-theme-text-muted flex items-start gap-1.5">
        <Info size={12} className="mt-0.5 shrink-0" />
        {isES
          ? `Valor razonable = ${base.psName.ES} × ${base.multName.ES} objetivo (por defecto, la mediana desde ${stats.firstYear}). Fundamentales de la SEC desde la fecha de cada informe; precio de Yahoo ajustado por splits.${base.key === "ebitda" ? " En EV/EBITDA se resta la deuda neta por acción." : ""}${isDiv ? " Con dividendo, más rentabilidad significa más barata." : ""}${fwd !== null ? " FWD solo cambia el valor actual: no hay histórico de estimaciones." : ""}`
          : `Fair value = ${base.psName.EN} × target ${base.multName.EN} (by default the median since ${stats.firstYear}). SEC fundamentals from each filing date; Yahoo price, split-adjusted.${base.key === "ebitda" ? " EV/EBITDA subtracts net debt per share." : ""}${isDiv ? " For dividends, a higher yield means cheaper." : ""}${fwd !== null ? " FWD only changes today's value: there is no estimate history." : ""}`}
      </p>
    </div>
  );
}
