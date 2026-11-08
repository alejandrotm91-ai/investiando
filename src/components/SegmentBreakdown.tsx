import React, { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, LabelList } from "recharts";
import { Loader2, PieChart as PieIcon, Info, ExternalLink, RotateCcw } from "lucide-react";

// Capa 2 de la SEC: ingresos por segmento, producto y geografía (XBRL de los 10-Q/10-K).
// Datos: GET /api/sec/segments/:ticker (src/worker/sec/segments.ts). Los periodos con "†" vienen
// rehechos del 8-K de reorganización (capa 4, src/worker/sec/recast.ts).

type AxisKey = "segment" | "product" | "geography";
interface SegPeriod {
  date: string;
  start: string;
  kind: "Q" | "FY";
  fiscalYear: number;
  fiscalQuarter: number | null;
  revenue: Record<string, number>;
  operatingIncome: Record<string, number>;
  total: number | null;
  matched: boolean;
  recast?: boolean; // rehecho con la estructura actual a partir del 8-K de reorganización (capa 4)
}
interface SegAxis {
  tag: string;
  members: { id: string; label: string }[];
  periods: SegPeriod[];
  recast?: { filed: string; accn: string; url: string | null };
}
interface SegmentData { asOf: string | null; axes: Partial<Record<AxisKey, SegAxis>> }

interface Props {
  ticker: string;
  language: "EN" | "ES";
  theme: "dark" | "light";
}

// Paleta categórica validada (dataviz: CVD y contraste) para cada modo, en orden fijo.
// Más de 7 líneas: el resto se agrupa en "Otros" (gris neutro).
const PALETTE = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9"],
};
const OTHER_COLOR = { light: "#8f8b82", dark: "#6b6a63" };
const MAX_SERIES = 7;
const OTHER = "__other__";
const POS = "__pos__"; // barra transparente con la altura de la pila positiva (ancla del crecimiento)

const fmtMoney = (v: number | undefined | null) => {
  if (v === undefined || v === null || !Number.isFinite(v)) return "—";
  if (v === 0) return "$0";
  const a = Math.abs(v);
  const s = a >= 1e9 ? `${(a / 1e9).toFixed(a >= 1e11 ? 0 : a >= 1e10 ? 1 : 2)}B` : `${(a / 1e6).toFixed(0)}M`;
  return `${v < 0 ? "−" : ""}$${s}`;
};
const fmtPct = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(digits)}%`;

export default function SegmentBreakdown({ ticker, language, theme }: Props) {
  const isES = language === "ES";
  const [data, setData] = useState<SegmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [axis, setAxis] = useState<AxisKey>("segment");
  const [kind, setKind] = useState<"Q" | "FY">("Q");
  // Líneas seleccionadas en la leyenda: las barras muestran solo esas (vacío = todas).
  // Se reinicia al cambiar de empresa o de eje.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => setSelected(new Set()), [ticker, axis]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setData(null);
    fetch(`/api/sec/segments/${encodeURIComponent(ticker)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!alive) return;
        if (!r.ok || !j?.axes) {
          setError(j?.error || (isES ? "Sin desglose disponible." : "No breakdown available."));
          return;
        }
        setData(j);
        const first = (["segment", "product", "geography"] as AxisKey[]).find((a) => j.axes[a]);
        if (first) setAxis(first);
      })
      .catch(() => alive && setError(isES ? "No se pudo cargar el desglose." : "Could not load the breakdown."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [ticker]);

  const axisData = data?.axes[axis];
  const hasQuarterly = !!axisData?.periods.some((p) => p.kind === "Q");
  const activeKind: "Q" | "FY" = kind === "Q" && !hasQuarterly ? "FY" : kind;

  const view = useMemo(() => {
    if (!axisData) return null;
    const periods = axisData.periods
      .filter((p) => p.kind === activeKind)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(activeKind === "Q" ? -8 : -11);
    if (!periods.length) return null;
    const latest = periods[periods.length - 1];
    // Líneas con datos en lo que se muestra, en el orden del eje (por ingresos del último periodo)
    const present = axisData.members.filter((m) => periods.some((p) => p.revenue[m.id] !== undefined));
    const top = present.slice(0, present.length > MAX_SERIES + 1 ? MAX_SERIES : present.length);
    const rest = present.slice(top.length);
    const series = [
      ...top.map((m, i) => ({ id: m.id, label: m.label, color: PALETTE[theme][i] })),
      ...(rest.length ? [{ id: OTHER, label: isES ? `Otros (${rest.length})` : `Other (${rest.length})`, color: OTHER_COLOR[theme] }] : []),
    ];
    const valueOf = (p: SegPeriod, id: string, field: "revenue" | "operatingIncome") => {
      if (id !== OTHER) return p[field][id];
      const vals = rest.map((m) => p[field][m.id]).filter((v): v is number => v !== undefined);
      return vals.length ? vals.reduce((a, b) => a + b, 0) : undefined;
    };
    const label = (p: SegPeriod) =>
      p.kind === "Q" ? `${isES ? "T" : "Q"}${p.fiscalQuarter} FY${String(p.fiscalYear).slice(2)}` : `FY${p.fiscalYear}`;
    // Crecimiento de lo visible: trimestral frente al trimestre anterior (QoQ), anual frente al año anterior (YoY)
    const visible = selected.size ? series.filter((s) => selected.has(s.id)) : series;
    const isVisible = (id: string) => !selected.size || selected.has(id);
    const all = axisData.periods.filter((p) => p.kind === activeKind).sort((a, b) => a.date.localeCompare(b.date));
    const previousOf = (p: SegPeriod) =>
      all.find((q) =>
        activeKind === "Q"
          ? p.fiscalQuarter === 1
            ? q.fiscalYear === p.fiscalYear - 1 && q.fiscalQuarter === 4
            : q.fiscalYear === p.fiscalYear && q.fiscalQuarter === (p.fiscalQuarter ?? 0) - 1
          : q.fiscalYear === p.fiscalYear - 1
      );
    // Líneas visibles con dato en el periodo (tras una reorganización no son las mismas cada año)
    const presentIn = (p: SegPeriod) => visible.filter((s) => valueOf(p, s.id, "revenue") !== undefined).map((s) => s.id);
    const sumOf = (p: SegPeriod, ids: string[]) => (ids.length ? ids.reduce((a, id) => a + (valueOf(p, id, "revenue") ?? 0), 0) : null);
    const visibleSum = (p: SegPeriod) => sumOf(p, presentIn(p));
    const rows = periods.map((p, rowIndex) => {
      const row: Record<string, any> = { name: `${label(p)}${p.recast ? " †" : ""}`, date: p.date, total: p.total, matched: p.matched, recast: !!p.recast };
      for (const s of series) row[s.id] = isVisible(s.id) ? valueOf(p, s.id, "revenue") : undefined;
      // Crecimiento solo si el periodo anterior tiene las mismas líneas (si no, compararía estructuras distintas)
      const prev = previousOf(p);
      const ids = presentIn(p);
      const same = !!prev && ids.length > 0 && ids.every((id) => valueOf(prev, id, "revenue") !== undefined);
      const cur = sumOf(p, ids), before = same && prev ? sumOf(prev, ids) : null;
      row.visibleSum = cur;
      row.rowIndex = rowIndex;
      row.growth = cur !== null && before !== null && before > 0 && cur >= 0 ? cur / before - 1 : null;
      // Altura de la parte positiva de la pila: ahí va la etiqueta de crecimiento
      row[POS] = visible.reduce((a, s) => a + Math.max(0, row[s.id] ?? 0), 0);
      return row;
    });
    // Mismo periodo del año anterior (para el crecimiento de la tabla)
    const prior = all.find((p) =>
      activeKind === "Q" ? p.fiscalQuarter === latest.fiscalQuarter && p.fiscalYear === latest.fiscalYear - 1 : p.fiscalYear === latest.fiscalYear - 1
    );
    const sumLatest = series.reduce((a, s) => a + (valueOf(latest, s.id, "revenue") ?? 0), 0);
    const table = series.map((s) => {
      const v = valueOf(latest, s.id, "revenue");
      const pv = prior ? valueOf(prior, s.id, "revenue") : undefined;
      const oi = valueOf(latest, s.id, "operatingIncome");
      return {
        ...s,
        value: v,
        share: v !== undefined && latest.total ? v / latest.total : v !== undefined && sumLatest ? v / sumLatest : null,
        // Crecimiento también para partidas negativas (incentivos de Visa): mismo signo en ambos años
        yoy: v !== undefined && pv !== undefined && pv !== 0 && Math.sign(v) === Math.sign(pv) ? v / pv - 1 : null,
        oi,
        margin: oi !== undefined && v ? oi / v : null,
      };
    });
    const gap = latest.total !== null && !latest.matched ? latest.total - sumLatest : null;
    const hasOI = table.some((r) => r.oi !== undefined);
    const anyRecast = periods.some((p) => p.recast) || !!prior?.recast;
    // CAGR de cada línea visible: de su primer a su último periodo con dato positivo en el gráfico
    // (un segmento que empieza más tarde lleva su propio rango). Menos de ~1 año: no se calcula.
    const cagr = visible.map((s) => {
      const pts = periods.filter((p) => (valueOf(p, s.id, "revenue") ?? 0) > 0);
      const last = pts[pts.length - 1];
      // Trimestral: mismo trimestre de otro año (comparar T1 con T4 mezclaría la estacionalidad)
      const first = activeKind === "Q" ? pts.find((p) => p.fiscalQuarter === last?.fiscalQuarter) : pts[0];
      const years = first && last ? (new Date(last.date).getTime() - new Date(first.date).getTime()) / (365.25 * 86400000) : 0;
      const value = years >= 0.9 ? Math.pow(valueOf(last, s.id, "revenue")! / valueOf(first, s.id, "revenue")!, 1 / years) - 1 : null;
      const range = first && last ? `${label(first)} → ${label(last)}` : null;
      return { ...s, value, range, points: pts.length };
    });
    // Rango más común: va en el título; cada línea solo muestra el suyo si es distinto
    const counts = new Map<string, number>();
    for (const c of cagr) if (c.value !== null && c.range) counts.set(c.range, (counts.get(c.range) ?? 0) + 1);
    const cagrRange = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return { periods, latest, prior, series, visible, rows, table, gap, hasOI, label, anyRecast, cagr, cagrRange };
  }, [axisData, activeKind, theme, isES, selected]);

  const toggleSeries = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      // Todas seleccionadas = sin filtro
      return view && next.size === view.series.length ? new Set() : next;
    });
  const growthName = activeKind === "Q" ? "QoQ" : "YoY";

  const axisNames: Record<AxisKey, string> = isES
    ? { segment: "Segmentos", product: "Productos", geography: "Geografía" }
    : { segment: "Segments", product: "Products", geography: "Geography" };

  const card = "bg-theme-card border border-theme-border rounded-3xl p-5 sm:p-6";
  if (loading)
    return (
      <div className={`${card} flex items-center justify-center gap-2 py-16 text-theme-text-muted text-sm`}>
        <Loader2 size={16} className="animate-spin" /> {isES ? "Leyendo los 10-Q/10-K…" : "Reading the 10-Q/10-K filings…"}
      </div>
    );
  if (error || !data || !view)
    return (
      <div className={`${card} text-center py-14`}>
        <PieIcon size={28} className="mx-auto mb-3 text-theme-text-muted" />
        <p className="text-sm text-theme-text-bright font-semibold">{error || (isES ? "Sin desglose disponible." : "No breakdown available.")}</p>
        <p className="text-xs text-theme-text-muted mt-1 max-w-md mx-auto">
          {isES
            ? "Algunas empresas (aseguradoras, gestoras, filiales extranjeras) no publican el desglose en los ejes estándar de la SEC."
            : "Some companies (insurers, asset managers, foreign filers) don't report the breakdown on the SEC's standard axes."}
        </p>
      </div>
    );

  const gridColor = theme === "light" ? "#e7e3da" : "#1e2230";
  const axisColor = theme === "light" ? "#6b675e" : "#8b90a0";
  const asOf = data.asOf ? new Date(`${data.asOf}T12:00:00Z`).toLocaleDateString(isES ? "es-ES" : "en-US") : "—";

  const growthColor = (g: number) => (g >= 0 ? (theme === "light" ? "#15803d" : "#34d399") : theme === "light" ? "#b91c1c" : "#fb7185");
  // Muchas barras o pantalla estrecha: etiquetas sin decimales para que no se pisen
  const narrow = view.rows.length > 8 || (typeof window !== "undefined" && window.innerWidth < 640);
  // Recharts 3: la posición de la barra llega en viewBox
  // `value` es el número de fila: el índice de Recharts salta las barras vacías (años sin datos)
  const GrowthLabel = ({ viewBox, value }: any) => {
    const { x, y, width } = viewBox ?? {};
    const g = view.rows[value]?.growth;
    if (g === null || g === undefined || x === undefined || y === undefined) return null;
    return (
      <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={narrow ? 9.5 : 10.5} fontWeight={700} fill={growthColor(g)} style={{ fontVariantNumeric: "tabular-nums" }}>
        {fmtPct(g, Math.abs(g) >= 0.995 || narrow ? 0 : 1)}
      </text>
    );
  };

  const TooltipBox = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    const items = [...payload].filter((p: any) => p.dataKey !== POS && p.value !== undefined && p.value !== null).reverse();
    return (
      <div className="bg-theme-sidebar border border-theme-border rounded-xl px-3 py-2 shadow-xl text-xs min-w-[190px]">
        <div className="font-bold text-theme-text-bright mb-1.5">{label}</div>
        {items.map((p: any) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-3 py-0.5">
            <span className="flex items-center gap-1.5 text-theme-text-muted truncate">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: p.color }} />
              {view.series.find((s) => s.id === p.dataKey)?.label}
            </span>
            <span className="font-mono text-theme-text-bright">{fmtMoney(p.value)}</span>
          </div>
        ))}
        {row.recast && (
          <div className="text-[10px] text-theme-text-muted mt-1">
            {isES ? "† Rehecho con la estructura actual (8-K)" : "† Recast to the current structure (8-K)"}
          </div>
        )}
        {selected.size > 0 && row.visibleSum !== null && (
          <div className="flex justify-between gap-3 pt-1.5 mt-1 border-t border-theme-border text-theme-text-bright">
            <span>{isES ? "Suma de lo seleccionado" : "Selected total"}</span>
            <span className="font-mono">{fmtMoney(row.visibleSum)}</span>
          </div>
        )}
        {row.growth !== null && (
          <div className="flex justify-between gap-3 py-0.5 text-theme-text-muted">
            <span>{isES ? `Crecimiento ${growthName}` : `${growthName} growth`}</span>
            <span className="font-mono" style={{ color: growthColor(row.growth) }}>{fmtPct(row.growth)}</span>
          </div>
        )}
        {row.total !== null && (
          <div className="flex justify-between gap-3 pt-1.5 mt-1 border-t border-theme-border text-theme-text-bright font-semibold">
            <span>{isES ? "Total consolidado" : "Consolidated total"}</span>
            <span className="font-mono">{fmtMoney(row.total)}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`${card} space-y-5`}>
      {/* Cabecera y controles en una fila */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-black uppercase tracking-wider text-theme-text-bright flex items-center gap-2">
            <PieIcon size={15} className="text-emerald-500" />
            {isES ? "Ingresos por segmento" : "Revenue breakdown"} · {ticker}
          </h3>
          <p className="text-[11px] text-theme-text-muted mt-0.5">
            {isES ? `Fuente: XBRL de los 10-Q/10-K de la SEC · último informe ${asOf}` : `Source: SEC 10-Q/10-K XBRL · latest filing ${asOf}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-theme-input border border-theme-border rounded-xl p-0.5">
            {(["segment", "product", "geography"] as AxisKey[]).filter((a) => data.axes[a]).map((a) => (
              <button
                key={a}
                onClick={() => setAxis(a)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${axis === a ? "bg-emerald-500 text-slate-950" : "text-theme-text-muted hover:text-theme-text-bright"}`}
              >
                {axisNames[a]}
              </button>
            ))}
          </div>
          <div className="flex bg-theme-input border border-theme-border rounded-xl p-0.5">
            {(["Q", "FY"] as const).map((k) => (
              <button
                key={k}
                disabled={k === "Q" && !hasQuarterly}
                onClick={() => setKind(k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${activeKind === k ? "bg-theme-border text-theme-text-bright" : "text-theme-text-muted hover:text-theme-text-bright"}`}
              >
                {k === "Q" ? (isES ? "Trimestral" : "Quarterly") : isES ? "Anual" : "Annual"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Leyenda = filtro: al seleccionar líneas, las barras muestran solo esas (la tabla repite los nombres) */}
      <div className="flex flex-wrap items-center gap-1.5">
        {view.series.map((s) => {
          const on = selected.has(s.id);
          const dim = selected.size > 0 && !on;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => toggleSeries(s.id)}
              aria-pressed={on}
              title={on ? (isES ? "Quitar del filtro" : "Remove from the filter") : isES ? "Ver solo lo seleccionado" : "Show only the selection"}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] cursor-pointer transition-all ${
                on
                  ? "border-emerald-500 bg-theme-input text-theme-text-bright font-semibold"
                  : dim
                    ? "border-theme-border text-theme-text-muted opacity-60 hover:opacity-100"
                    : "border-theme-border bg-theme-input text-theme-text-bright hover:border-emerald-500/60"
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
              {s.label}
            </button>
          );
        })}
        {selected.size > 0 && (
          <button type="button" onClick={() => setSelected(new Set())} className="flex items-center gap-1 px-2 py-1 text-[11px] text-theme-text-muted hover:text-theme-text-bright cursor-pointer">
            <RotateCcw size={11} /> {isES ? "Ver todo" : "Show all"}
          </button>
        )}
        <span className="ml-auto text-[10px] text-theme-text-muted">
          {isES
            ? `Clic para filtrar · sobre cada barra: crecimiento ${growthName}`
            : `Click to filter · above each bar: ${growthName} growth`}
        </span>
      </div>

      <div className="h-[280px] sm:h-[320px] -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={view.rows} stackOffset="sign" barCategoryGap="28%" margin={{ top: 18, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={gridColor} strokeDasharray="0" />
            <XAxis dataKey="name" tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(v) => fmtMoney(v)} tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} width={62} />
            <ReferenceLine y={0} stroke={axisColor} strokeOpacity={0.5} />
            <Tooltip content={<TooltipBox />} cursor={{ fill: theme === "light" ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)" }} />
            {/* Todas las barras siempre montadas (las no seleccionadas sin datos): Recharts apila en orden
                de alta, y volver a montar una la pondría arriba del todo */}
            {view.series.map((s) => (
              <Bar
                key={s.id}
                dataKey={s.id}
                stackId="rev"
                fill={s.color}
                stroke={theme === "light" ? "#ffffff" : "#0f111a"}
                strokeWidth={1}
                radius={s.id === view.visible[view.visible.length - 1]?.id ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                isAnimationActive={false}
              />
            ))}
            {/* Etiquetas de crecimiento: barra transparente con la altura de la pila positiva, en un eje X
                propio (oculto) para que no ocupe sitio junto a las de verdad ni dependa del orden de apilado */}
            <XAxis xAxisId="growth" dataKey="name" hide />
            <Bar xAxisId="growth" dataKey={POS} fill="transparent" isAnimationActive={false} legendType="none" activeBar={false}>
              <LabelList dataKey="rowIndex" content={<GrowthLabel />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Bajo el eje X: cada línea visible con su crecimiento anual compuesto (CAGR) en lo que muestra el gráfico */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 sm:pl-[60px] -mt-1">
        <span className="w-full text-[10px] uppercase tracking-wider text-theme-text-muted font-bold">
          {isES ? "Crecimiento anual compuesto (CAGR)" : "Compound annual growth (CAGR)"}{view.cagrRange ? ` · ${view.cagrRange}` : ""}
        </span>
        {view.cagr.filter((c) => c.points > 0).map((c) => (
          <span key={c.id} className="flex items-baseline gap-1.5 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0 self-center" style={{ background: c.color }} />
            <span className="text-theme-text-bright font-semibold">{c.label}</span>
            <span className="font-mono font-bold" style={{ color: c.value === null ? undefined : growthColor(c.value) }}>
              {c.value === null ? "—" : fmtPct(c.value)}
            </span>
            {c.value !== null && c.range && c.range !== view.cagrRange && <span className="text-[10px] text-theme-text-muted">({c.range})</span>}
          </span>
        ))}
      </div>

      {view.anyRecast && axisData?.recast && (
        <p className="text-[11px] text-theme-text-muted flex items-start gap-1.5">
          <Info size={12} className="mt-0.5 shrink-0" />
          <span>
            {isES
              ? "† Periodos rehechos con la estructura actual de la empresa, según el histórico que publicó tras reorganizar sus segmentos ("
              : "† Periods recast to the company's current structure, from the history it published after reorganizing its segments ("}
            <a
              href={axisData.recast.url ?? `https://www.sec.gov/edgar/search/#/q=%22${axisData.recast.accn}%22`}
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-theme-text-bright inline-flex items-center gap-0.5"
            >
              {isES ? "8-K del " : "8-K filed "}
              {new Date(`${axisData.recast.filed}T12:00:00Z`).toLocaleDateString(isES ? "es-ES" : "en-US")}
              <ExternalLink size={10} />
            </a>
            {isES ? "). El 10-Q/10-K original los presentó con la estructura anterior." : "). The original 10-Q/10-K reported them under the previous structure."}
          </span>
        </p>
      )}

      {!view.latest.matched && (
        <p className="text-[11px] text-theme-text-muted flex items-start gap-1.5">
          <Info size={12} className="mt-0.5 shrink-0" />
          {isES
            ? "La suma de los segmentos no coincide con el total consolidado: la diferencia son ventas entre segmentos, partidas corporativas o una medida distinta (p. ej. bancos con ingresos 'gestionados')."
            : "Segments don't add up to the consolidated total: the gap is intersegment sales, corporate items or a different measure (e.g. banks' 'managed' revenue)."}
        </p>
      )}
    </div>
  );
}
