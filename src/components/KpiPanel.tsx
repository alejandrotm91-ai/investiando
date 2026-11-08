import React, { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Activity, Info, ExternalLink, Loader2 } from "lucide-react";

// KPIs operativos de cada empresa (capa 5 de la SEC): viajes y reservas de Uber, suscriptores y
// ARM de Netflix… Salen de los comunicados de resultados (8-K) leídos con Claude y validados con los
// ingresos de la SEC. Datos: GET /api/sec/kpis/:ticker (src/worker/sec/kpis.ts).

interface KpiMeta { key: string; en: string; es: string; unit: "M" | "$M" | "$" | "%"; kind: "flow" | "stock" | "avg" }
interface KpiChart { id: string; en: string; es: string; type: "bar" | "stack" | "line"; keys: string[]; derived?: "per_user_month" | "take_rate" }
interface KpiPoint { date: string; values: Record<string, number>; confirmed: Record<string, boolean> }
interface KpiData {
  ticker: string;
  kpis: KpiMeta[];
  charts: KpiChart[];
  note: { en: string; es: string } | null;
  points: KpiPoint[];
  releases: Record<string, number>;
  latestRelease: { filed: string; url: string | null } | null;
}

interface Props { ticker: string; language: "EN" | "ES"; theme: "dark" | "light" }

// Misma paleta categórica validada que la pestaña Segmentos
const PALETTE = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9"],
};
const MAX_QUARTERS = 16;

const quarterLabel = (date: string) => {
  const [y, m] = date.split("-").map(Number);
  return `Q${Math.ceil(m / 3)}'${String(y).slice(2)}`;
};

function fmt(v: number | undefined | null, unitIn: KpiMeta["unit"] | "x" | "frac"): string {
  // Los KPIs en % llegan ya en puntos (9 = 9 %); la comisión calculada, en fracción (0,2 = 20 %)
  const unit = unitIn === "%" ? "pct" : unitIn === "frac" ? "%" : unitIn;
  if (v === undefined || v === null || !Number.isFinite(v)) return "—";
  const a = Math.abs(v), sign = v < 0 ? "−" : "";
  if (unit === "%") return `${(v * 100).toFixed(1)}%`;
  if (unit === "pct") return `${v > 0 ? "+" : ""}${v.toFixed(v % 1 ? 1 : 0)}%`;
  if (unit === "x") return v.toFixed(1);
  if (unit === "$") return `${sign}$${a.toFixed(2)}`;
  if (unit === "$M") return a >= 1e6 ? `${sign}$${(a / 1e6).toFixed(2)}T` : a >= 1000 ? `${sign}$${(a / 1000).toFixed(a >= 100000 ? 0 : 1)}B` : `${sign}$${a.toFixed(0)}M`;
  return a >= 1000 ? `${sign}${(a / 1000).toFixed(2)}B` : `${sign}${a.toFixed(a >= 100 ? 0 : a >= 10 ? 1 : 2)}M`;
}

export default function KpiPanel({ ticker, language, theme }: Props) {
  const isES = language === "ES";
  const [data, setData] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setData(null);
    fetch(`/api/sec/kpis/${encodeURIComponent(ticker)}`)
      .then(async (r) => (r.ok ? r.json() : null))
      .then((j) => alive && setData(j))
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [ticker]);

  const meta = useMemo(() => Object.fromEntries((data?.kpis ?? []).map((k) => [k.key, k])), [data]);
  const points = useMemo(() => (data?.points ?? []).slice(-MAX_QUARTERS), [data]);

  if (loading) return null;
  if (!data) return null; // empresa sin KPIs definidos

  const card = "bg-theme-card border border-theme-border rounded-3xl p-5 sm:p-6";
  const pending = (data.releases.pending ?? 0) + (data.releases.error ?? 0);
  const gridColor = theme === "light" ? "#e7e3da" : "#1e2230";
  const axisColor = theme === "light" ? "#6b675e" : "#8b90a0";
  // Nombre corto en leyendas: la parte tras "·" ("Reservas · Mobility" → "Mobility"); el total, "Global"
  const name = (k: string) => (!meta[k] ? k : /·/.test(meta[k].en) ? (isES ? meta[k].es : meta[k].en).replace(/^.*· /, "") : c0(k));
  const c0 = (k: string) => (k === "arm" || k === "memberships" ? "Global" : isES ? meta[k].es : meta[k].en);

  // Serie de un gráfico: valores por trimestre (con los calculados)
  const seriesOf = (c: KpiChart) =>
    points
      .map((p) => {
        const row: Record<string, any> = { name: quarterLabel(p.date), date: p.date, confirmed: p.confirmed };
        if (c.derived === "per_user_month") {
          const t = p.values.trips, m = p.values.mapcs;
          if (t !== undefined && m) row.value = t / (m * 3);
        } else if (c.derived === "take_rate") {
          const r = p.values.revenue, g = p.values.gross_bookings;
          if (r !== undefined && g) row.value = r / g;
        } else {
          for (const k of c.keys) if (p.values[k] !== undefined) row[k] = p.values[k];
          if (c.type === "stack") {
            const present = c.keys.filter((k) => row[k] !== undefined);
            if (present.length === c.keys.length) row.total = present.reduce((a, k) => a + row[k], 0);
          }
        }
        return row;
      })
      .filter((r) => r.value !== undefined || c.keys.some((k) => r[k] !== undefined));

  const headline = (c: KpiChart, rows: Record<string, any>[]) => {
    const unit: any = c.derived === "per_user_month" ? "x" : c.derived === "take_rate" ? "frac" : meta[c.keys[0]]?.unit ?? "M";
    const val = (r: Record<string, any>) => (c.derived ? r.value : c.type === "stack" ? r.total : c.type === "bar" ? r[c.keys[0]] : undefined);
    const last = [...rows].reverse().find((r) => val(r) !== undefined);
    if (!last) return null;
    const prevYear = rows.find((r) => r.date.slice(0, 4) === String(Number(last.date.slice(0, 4)) - 1) && r.date.slice(5, 7) === last.date.slice(5, 7));
    const v = val(last), pv = prevYear ? val(prevYear) : undefined;
    // Comisión y frecuencia: diferencia en puntos/unidades; el resto, crecimiento %
    const change = pv === undefined || v === undefined ? null : c.derived === "take_rate" ? { text: `${((v - pv) * 100).toFixed(1)} pp`, up: v >= pv } : pv > 0 && v >= 0 ? { text: `${v >= pv ? "+" : ""}${((v / pv - 1) * 100).toFixed(1)}%`, up: v >= pv } : null;
    return { label: last.name, value: fmt(v, unit), change };
  };

  const growthColor = (up: boolean) => (up ? (theme === "light" ? "#15803d" : "#34d399") : theme === "light" ? "#b91c1c" : "#fb7185");

  const Tip = ({ active, payload, label, chart }: any) => {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    const c: KpiChart = chart;
    const unit: any = c.derived === "per_user_month" ? "x" : c.derived === "take_rate" ? "frac" : null;
    const items = [...payload].filter((p: any) => p.value !== undefined && p.value !== null).reverse();
    const allConfirmed = c.keys.every((k) => row.confirmed?.[k] !== false);
    return (
      <div className="bg-theme-sidebar border border-theme-border rounded-xl px-3 py-2 shadow-xl text-xs min-w-[170px]">
        <div className="font-bold text-theme-text-bright mb-1.5">{label}</div>
        {items.map((p: any) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-3 py-0.5">
            <span className="flex items-center gap-1.5 text-theme-text-muted">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: p.color }} />
              {p.dataKey === "value" ? (isES ? c.es : c.en) : name(p.dataKey)}
            </span>
            <span className="font-mono text-theme-text-bright">{fmt(p.value, unit ?? meta[p.dataKey]?.unit ?? "M")}</span>
          </div>
        ))}
        {c.type === "stack" && row.total !== undefined && (
          <div className="flex justify-between gap-3 pt-1.5 mt-1 border-t border-theme-border font-semibold text-theme-text-bright">
            <span>Total</span>
            <span className="font-mono">{fmt(row.total, meta[c.keys[0]]?.unit ?? "M")}</span>
          </div>
        )}
        <div className="text-[10px] text-theme-text-muted mt-1">
          {allConfirmed ? (isES ? "✓ Coincide en dos comunicados" : "✓ Matches in two releases") : isES ? "De un solo comunicado" : "From a single release"}
        </div>
      </div>
    );
  };

  return (
    <div className={`${card} space-y-5`}>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-black uppercase tracking-wider text-theme-text-bright flex items-center gap-2">
            <Activity size={15} className="text-emerald-500" />
            {isES ? "Métricas operativas (KPIs)" : "Operating metrics (KPIs)"} · {data.ticker}
          </h3>
          <p className="text-[11px] text-theme-text-muted mt-0.5">
            {isES
              ? "Fuente: comunicados de resultados (8-K), leídos con IA y validados con los ingresos de la SEC"
              : "Source: earnings releases (8-K), read with AI and checked against SEC revenue"}
            {data.latestRelease?.url && (
              <>
                {" · "}
                <a href={data.latestRelease.url} target="_blank" rel="noreferrer" className="underline hover:text-theme-text-bright inline-flex items-center gap-0.5">
                  {isES ? "último" : "latest"} {new Date(`${data.latestRelease.filed}T12:00:00Z`).toLocaleDateString(isES ? "es-ES" : "en-US")}
                  <ExternalLink size={10} />
                </a>
              </>
            )}
          </p>
        </div>
        {pending > 0 && (
          <span className="flex items-center gap-1.5 text-[11px] text-theme-text-muted shrink-0">
            <Loader2 size={12} className="animate-spin" />
            {isES ? `${pending} comunicados por leer` : `${pending} releases to read`}
          </span>
        )}
      </div>

      {points.length === 0 ? (
        <p className="text-xs text-theme-text-muted py-6 text-center">
          {isES ? "Leyendo los comunicados de resultados… vuelve en unos minutos." : "Reading the earnings releases… check back in a few minutes."}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.charts.map((c) => {
            const rows = seriesOf(c);
            if (!rows.length) return null;
            const h = headline(c, rows);
            const unit: any = c.derived === "per_user_month" ? "x" : c.derived === "take_rate" ? "frac" : meta[c.keys[0]]?.unit ?? "M";
            const keys = c.derived ? ["value"] : c.keys.filter((k) => rows.some((r) => r[k] !== undefined));
            return (
              <div key={c.id} className="border border-theme-border rounded-2xl p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-theme-text-muted">{isES ? c.es : c.en}</span>
                  {h && (
                    <span className="text-right shrink-0">
                      <span className="font-mono font-bold text-theme-text-bright text-sm">{h.value}</span>
                      {h.change && (
                        <span className="block text-[10px] font-mono" style={{ color: growthColor(h.change.up) }}>
                          {h.change.text} {isES ? "interanual" : "YoY"} · {h.label}
                        </span>
                      )}
                    </span>
                  )}
                </div>
                {keys.length > 1 && (
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {keys.map((k, i) => (
                      <span key={k} className="flex items-center gap-1 text-[10px] text-theme-text-bright">
                        <span className={c.type === "line" ? "w-3 h-0.5 rounded" : "w-2 h-2 rounded-sm"} style={{ background: PALETTE[theme][i] }} />
                        {name(k)}
                      </span>
                    ))}
                  </div>
                )}
                <div className="h-[150px] -ml-2">
                  <ResponsiveContainer width="100%" height="100%">
                    {c.type === "line" ? (
                      <LineChart data={rows} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke={gridColor} />
                        <XAxis dataKey="name" tick={{ fill: axisColor, fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={16} />
                        <YAxis tickFormatter={(v) => fmt(v, unit)} tick={{ fill: axisColor, fontSize: 10 }} axisLine={false} tickLine={false} width={50} domain={["auto", "auto"]} />
                        <Tooltip content={<Tip chart={c} />} />
                        {keys.map((k, i) => (
                          <Line key={k} dataKey={k} stroke={PALETTE[theme][i]} strokeWidth={2} dot={{ r: 2.5, strokeWidth: 0, fill: PALETTE[theme][i] }} activeDot={{ r: 4 }} isAnimationActive={false} connectNulls={false} />
                        ))}
                      </LineChart>
                    ) : (
                      <BarChart data={rows} margin={{ top: 6, right: 6, left: 0, bottom: 0 }} barCategoryGap="22%" stackOffset="sign">
                        <CartesianGrid vertical={false} stroke={gridColor} />
                        <XAxis dataKey="name" tick={{ fill: axisColor, fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={16} />
                        <YAxis tickFormatter={(v) => fmt(v, unit)} tick={{ fill: axisColor, fontSize: 10 }} axisLine={false} tickLine={false} width={50} />
                        <Tooltip content={<Tip chart={c} />} cursor={{ fill: theme === "light" ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)" }} />
                        {keys.map((k, i) => (
                          <Bar
                            key={k}
                            dataKey={k}
                            stackId={c.type === "stack" ? "s" : undefined}
                            fill={PALETTE[theme][i]}
                            stroke={theme === "light" ? "#ffffff" : "#0f111a"}
                            strokeWidth={c.type === "stack" ? 1 : 0}
                            radius={i === keys.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                            isAnimationActive={false}
                          />
                        ))}
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {data.note && (
        <p className="text-[11px] text-theme-text-muted flex items-start gap-1.5">
          <Info size={12} className="mt-0.5 shrink-0" />
          {isES ? data.note.es : data.note.en}
        </p>
      )}
    </div>
  );
}
