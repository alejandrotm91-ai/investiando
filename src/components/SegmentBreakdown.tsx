import React, { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Loader2, PieChart as PieIcon, Info, ExternalLink } from "lucide-react";

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
      .slice(activeKind === "Q" ? -8 : -4);
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
    const rows = periods.map((p) => {
      const row: Record<string, any> = { name: `${label(p)}${p.recast ? " †" : ""}`, date: p.date, total: p.total, matched: p.matched, recast: !!p.recast };
      for (const s of series) row[s.id] = valueOf(p, s.id, "revenue");
      return row;
    });
    // Mismo periodo del año anterior (para el crecimiento)
    const all = axisData.periods.filter((p) => p.kind === activeKind);
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
    return { periods, latest, prior, series, rows, table, gap, hasOI, label, anyRecast };
  }, [axisData, activeKind, theme, isES]);

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

  const TooltipBox = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    const items = [...payload].filter((p: any) => p.value !== undefined && p.value !== null).reverse();
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

      {/* Leyenda (identidad nunca solo por color: la tabla repite los nombres) */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {view.series.map((s) => (
          <span key={s.id} className="flex items-center gap-1.5 text-[11px] text-theme-text-muted">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>

      <div className="h-[280px] sm:h-[320px] -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={view.rows} stackOffset="sign" barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke={gridColor} strokeDasharray="0" />
            <XAxis dataKey="name" tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(v) => fmtMoney(v)} tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} width={62} />
            <ReferenceLine y={0} stroke={axisColor} strokeOpacity={0.5} />
            <Tooltip content={<TooltipBox />} cursor={{ fill: theme === "light" ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)" }} />
            {view.series.map((s, i) => (
              <Bar
                key={s.id}
                dataKey={s.id}
                stackId="rev"
                fill={s.color}
                stroke={theme === "light" ? "#ffffff" : "#0f111a"}
                strokeWidth={1}
                radius={i === view.series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tabla del último periodo */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-theme-text-muted border-b border-theme-border">
              <th className="text-left font-bold py-2 pr-3">{axisNames[axis]} · {view.label(view.latest)}</th>
              <th className="text-right font-bold py-2 px-3">{isES ? "Ingresos" : "Revenue"}</th>
              <th className="text-right font-bold py-2 px-3">{isES ? "Peso" : "Share"}</th>
              <th className="text-right font-bold py-2 px-3">{isES ? "Crec. interanual" : "YoY"}</th>
              {view.hasOI && <th className="text-right font-bold py-2 px-3">{isES ? "Bº operativo" : "Op. income"}</th>}
              {view.hasOI && <th className="text-right font-bold py-2 pl-3">{isES ? "Margen" : "Margin"}</th>}
            </tr>
          </thead>
          <tbody>
            {view.table.filter((r) => r.value !== undefined).map((r) => (
              <tr key={r.id} className="border-b border-theme-border/50">
                <td className="py-2 pr-3 text-theme-text-bright font-semibold">
                  <span className="inline-flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: r.color }} />
                    {r.label}
                  </span>
                </td>
                <td className="py-2 px-3 text-right font-mono text-theme-text-bright">{fmtMoney(r.value)}</td>
                <td className="py-2 px-3 text-right font-mono text-theme-text-muted">{r.share === null ? "—" : `${(r.share * 100).toFixed(1)}%`}</td>
                <td
                  className="py-2 px-3 text-right font-mono"
                  style={{ color: r.yoy === null ? undefined : r.yoy >= 0 ? (theme === "light" ? "#15803d" : "#34d399") : theme === "light" ? "#b91c1c" : "#fb7185" }}
                >
                  {fmtPct(r.yoy)}
                </td>
                {view.hasOI && <td className="py-2 px-3 text-right font-mono text-theme-text-bright">{fmtMoney(r.oi)}</td>}
                {view.hasOI && <td className="py-2 pl-3 text-right font-mono text-theme-text-muted">{r.margin === null ? "—" : `${(r.margin * 100).toFixed(1)}%`}</td>}
              </tr>
            ))}
            {view.gap !== null && Math.abs(view.gap) > 0 && (
              <tr className="border-b border-theme-border/50 text-theme-text-muted italic">
                <td className="py-2 pr-3">{isES ? "Corporativo y eliminaciones" : "Corporate & eliminations"}</td>
                <td className="py-2 px-3 text-right font-mono">{fmtMoney(view.gap)}</td>
                <td colSpan={view.hasOI ? 4 : 2} />
              </tr>
            )}
            {view.latest.total !== null && (
              <tr className="text-theme-text-bright font-bold">
                <td className="py-2 pr-3">{isES ? "Total consolidado" : "Consolidated total"}</td>
                <td className="py-2 px-3 text-right font-mono">{fmtMoney(view.latest.total)}</td>
                <td colSpan={view.hasOI ? 4 : 2} />
              </tr>
            )}
          </tbody>
        </table>
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
