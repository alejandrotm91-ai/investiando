import React, { useState, useEffect, useMemo } from "react";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea
} from "recharts";
import { 
  TrendingUp, 
  TrendingDown, 
  RefreshCw, 
  Calculator,
  Info,
  Scale,
  Settings2,
  BarChart3,
  Activity,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { buildBogleInputs, computeBogle, defaultHurdle, BogleInputs, EXIT_PE_CAP_BASE, EXIT_PE_CAP_BULL } from "../utils/bogleEngine";

interface SingleStockBogleAnalysisProps {
  ticker: string;
  language?: "EN" | "ES";
  theme?: "dark" | "light";
}

export default function SingleStockBogleAnalysis({
  ticker,
  language = "ES",
  theme = "dark"
}: SingleStockBogleAnalysisProps) {
  const [loading, setLoading] = useState<boolean>(false);
  const [inputs, setInputs] = useState<BogleInputs | null>(null);

  // Parámetros editables
  const [horizonYears, setHorizonYears] = useState<number>(5);
  const [hurdleRate, setHurdleRate] = useState<number>(10);
  const [modelCagrOverride, setModelCagrOverride] = useState<number | null>(null);
  const [shareholderYieldOverride, setShareholderYieldOverride] = useState<number | null>(null);
  const [peExitBearOverride, setPeExitBearOverride] = useState<number | null>(null);
  const [peExitBaseOverride, setPeExitBaseOverride] = useState<number | null>(null);
  const [peExitBullOverride, setPeExitBullOverride] = useState<number | null>(null);
  const [scenarioSel, setScenarioSel] = useState<"bear" | "base" | "bull">("base");

  useEffect(() => {
    let isMounted = true;
    async function fetchStock() {
      if (!ticker) return;
      setLoading(true);
      try {
        const [stockRes, finRes] = await Promise.all([
          fetch(`/api/stock/${ticker}`),
          fetch("/api/portfolio/financials", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tickers: [ticker] })
          })
        ]);
        const stockData = stockRes.ok ? await stockRes.json() : null;
        const fins = finRes.ok ? await finRes.json() : {};
        const finData = fins?.[ticker] || fins?.[ticker.toUpperCase()] || (fins?.annual ? fins : null);
        if (isMounted) {
          const built = buildBogleInputs(ticker, stockData, finData);
          setInputs(built);
          setHurdleRate(defaultHurdle(built.beta));
          setModelCagrOverride(null);
          setShareholderYieldOverride(null);
          setPeExitBearOverride(null);
          setPeExitBaseOverride(null);
          setPeExitBullOverride(null);
        }
      } catch (err) {
        console.error("Error loading stock metrics:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchStock();
    return () => { isMounted = false; };
  }, [ticker]);

  // Cálculo con el motor compartido (utils/bogleEngine.ts)
  const calc = useMemo(() => {
    if (!inputs) return null;
    const res = computeBogle(inputs, {
      horizon: horizonYears,
      hurdle: hurdleRate,
      growth: modelCagrOverride,
      dividendYield: shareholderYieldOverride,
      peExitBear: peExitBearOverride,
      peExitBase: peExitBaseOverride,
      peExitBull: peExitBullOverride,
    });
    if (!res) return null;
    const PE0 = inputs.pe0 as number;
    return {
      P0: inputs.price as number,
      EPS_TTM: inputs.epsTTM as number,
      EPS_fwd: inputs.epsFwd,
      PE0,
      PE_fwd: inputs.peFwd,
      EPS_CAGR_hist: inputs.epsCagrHist,
      EPS_CAGR_fwd_1Y: inputs.epsGrowthFwd1Y,
      EPS_CAGR_modelo: res.g,
      SY: res.DY,
      DY: inputs.dividendYield,
      BBY: inputs.buybackYield,
      H: res.H,
      r: res.r,
      EPS_H: res.base.EPS_H,
      bear: res.bear,
      base: res.base,
      bull: res.bull,
      defaults: res.defaults,
      chartData: res.chartData,
      avgPe: inputs.peMedianHist ?? PE0,
      peHistory: inputs.peHistory,
      growthNotes: inputs.growthNotes,
      formatCurrency: (val: number) => `$${val.toFixed(2)}`,
      formatPct: (val: number) => `${val > 0 ? "+" : ""}${val.toFixed(1)}%`,
    };
  }, [inputs, horizonYears, hurdleRate, modelCagrOverride, shareholderYieldOverride, peExitBearOverride, peExitBaseOverride, peExitBullOverride]);

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
        <RefreshCw size={24} className="animate-spin text-emerald-400" />
        <span className="text-xs font-mono">{language === "EN" ? "Computing 3 Engines of Return & Financials..." : "Calculando Motores de Retorno..."}</span>
      </div>
    );
  }

  if (!inputs) return null;
  if (!calc) {
    return (
      <div className="py-12 flex flex-col items-center justify-center gap-2 text-center text-slate-400">
        <Info size={22} className="text-amber-400" />
        <span className="text-sm font-bold text-slate-200">
          {language === "EN" ? "The 3 Engines model cannot be computed for" : "El modelo de los 3 motores no se puede calcular para"} {ticker}
        </span>
        <span className="text-xs font-mono">{inputs.issues.join(" · ")}</span>
        <span className="text-[11px] text-slate-500 max-w-md">
          {language === "EN"
            ? "It needs a price and positive trailing EPS. No placeholder values are used."
            : "Necesita precio y un BPA positivo de los últimos 12 meses. No se usan valores de relleno."}
        </span>
      </div>
    );
  }

  const light = theme === "light";
  const sc = calc[scenarioSel];
  const defaultsHurdle = defaultHurdle(inputs.beta);
  const anyOverride =
    peExitBearOverride !== null || peExitBaseOverride !== null || peExitBullOverride !== null ||
    modelCagrOverride !== null || shareholderYieldOverride !== null || horizonYears !== 5 || hurdleRate !== defaultsHurdle;
  const resetAll = () => {
    setPeExitBearOverride(null);
    setPeExitBaseOverride(null);
    setPeExitBullOverride(null);
    setModelCagrOverride(null);
    setShareholderYieldOverride(null);
    setHorizonYears(5);
    setHurdleRate(defaultsHurdle);
  };
  const setExit = (v: number) =>
    scenarioSel === "bear" ? setPeExitBearOverride(v) : scenarioSel === "bull" ? setPeExitBullOverride(v) : setPeExitBaseOverride(v);
  const scLabel = (k: "bear" | "base" | "bull") =>
    ({ bear: language === "EN" ? "Bear" : "Bajista", base: "Base", bull: language === "EN" ? "Bull" : "Alcista" })[k];
  const beats = sc.retorno_total >= calc.r * 100;
  const up = sc.upside >= 0;
  const pctTxt = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
  const card = "bg-[#0b0d14] border border-slate-800/80 rounded-3xl p-6 shadow-xl";
  const badge = (good: boolean) =>
    light
      ? good ? { background: "#e6f4ec", color: "#047857", borderColor: "#86c9a6" } : { background: "#fde8ec", color: "#be123c", borderColor: "#f5b5c2" }
      : good ? { background: "rgba(16,185,129,0.2)", color: "#6ee7b7", borderColor: "rgba(16,185,129,0.3)" } : { background: "rgba(244,63,94,0.2)", color: "#fda4af", borderColor: "rgba(244,63,94,0.3)" };

  const sliders: { key: string; label: string; value: number; min: number; max: number; step: number; unit: string; base: string; onChange: (v: number) => void; accent: string; text: string; hint?: string }[] = [
    {
      key: "h", label: language === "EN" ? "Horizon" : "Horizonte", value: horizonYears, min: 1, max: 15, step: 1, unit: language === "EN" ? " yrs" : " años",
      base: "5", onChange: (v) => setHorizonYears(v), accent: "accent-slate-400", text: "text-slate-200",
    },
    {
      key: "r", label: language === "EN" ? "Required return (r)" : "Rentabilidad exigida (r)", value: hurdleRate, min: 5, max: 20, step: 0.5, unit: "%",
      base: `${defaultsHurdle}%`, onChange: (v) => setHurdleRate(v), accent: "accent-amber-400", text: "text-amber-400",
      hint: language === "EN" ? "Default: CAPM cost of equity, min. 8%" : "Por defecto: coste del capital por CAPM, mínimo 8 %",
    },
    {
      key: "g", label: language === "EN" ? "EPS growth (engine 1)" : "Crecimiento del BPA (motor 1)", value: Number(calc.EPS_CAGR_modelo.toFixed(1)), min: -10, max: 30, step: 0.5, unit: "%",
      base: `${inputs.epsGrowthModel ?? "—"}%`, onChange: (v) => setModelCagrOverride(v), accent: "accent-emerald-500", text: "text-emerald-400",
      // Las notas del motor están en español; en inglés, un resumen
      hint:
        language === "EN"
          ? inputs.profile === "cyclical"
            ? "Cyclical: revenue + buybacks, 0-8%"
            : "Median of history, 1-year consensus and revenue + buybacks (details below)"
          : calc.growthNotes[0],
    },
    {
      key: "d", label: language === "EN" ? "Dividend yield (engine 2)" : "Dividendo (motor 2)", value: Number(calc.SY.toFixed(2)), min: 0, max: 10, step: 0.1, unit: "%",
      base: `${inputs.dividendYield.toFixed(2)}%`, onChange: (v) => setShareholderYieldOverride(v), accent: "accent-sky-400", text: "text-sky-400",
      hint: language === "EN" ? `Buybacks (${calc.BBY.toFixed(1)}%/yr) are already inside EPS growth` : `Las recompras (${calc.BBY.toFixed(1)} %/año) ya están en el crecimiento del BPA`,
    },
    {
      key: "pe", label: `${language === "EN" ? "Exit P/E" : "PER de salida"} (${scLabel(scenarioSel)})`, value: sc.peExit, min: 5, max: 60, step: 0.5, unit: "×",
      base: `${calc.defaults[scenarioSel]}×`, onChange: (v) => setExit(v), accent: "accent-purple-400", text: "text-purple-300",
      hint:
        scenarioSel === "base"
          ? inputs.profile === "cyclical"
            ? (language === "EN" ? `Base: 10-year median (≤ ${EXIT_PE_CAP_BASE}×)` : `Base: mediana de 10 años (≤ ${EXIT_PE_CAP_BASE}×)`)
            : (language === "EN" ? `Base: midpoint of current P/E and 10-year median (≤ ${EXIT_PE_CAP_BASE}×)` : `Base: punto medio entre el PER actual y la mediana de 10 años (≤ ${EXIT_PE_CAP_BASE}×)`)
          : scenarioSel === "bull"
            ? (language === "EN" ? `Bull: the higher of the two (≤ ${EXIT_PE_CAP_BULL}×)` : `Alcista: el mayor de los dos (≤ ${EXIT_PE_CAP_BULL}×)`)
            : (language === "EN" ? "Bear: −20% on the lower one (min. 8×)" : "Bajista: −20 % sobre el menor (mínimo 8×)"),
    },
  ];

  const engines = [
    { label: language === "EN" ? "Engine 1 · EPS growth" : "Motor 1 · crecimiento del BPA", v: sc.contribE1, color: "#10b981" },
    { label: language === "EN" ? "Engine 2 · dividends" : "Motor 2 · dividendos", v: sc.contribE2, color: "#38bdf8" },
    // Reparto aditivo (como Bogle): motor 3 = rentabilidad del precio − motor 1, así los tres suman la TIR
    { label: language === "EN" ? "Engine 3 · change in P/E" : "Motor 3 · cambio del PER", v: sc.retorno_precio_anual - sc.contribE1, color: "#a78bfa" },
  ];
  const maxAbs = Math.max(1, ...engines.map((e) => Math.abs(e.v)), Math.abs(sc.retorno_total));

  return (
    <div className={`space-y-6 ${light ? "text-slate-900" : "text-white"}`}>
      {inputs?.dataAsOf && (
        <div className="px-3 py-2 rounded-xl border border-amber-500/30 bg-amber-500/10 text-[11px] font-mono text-amber-300">
          {language === "EN"
            ? `Yahoo did not respond: using the last saved data (${new Date(inputs.dataAsOf).toLocaleString("en-US")}).`
            : `Yahoo no respondió: se usan los últimos datos guardados (${new Date(inputs.dataAsOf).toLocaleString("es-ES")}).`}
        </div>
      )}
      {inputs?.profileNotes?.length ? (
        <div className="px-3 py-2 rounded-xl border border-sky-500/30 bg-sky-500/10 text-[11px] text-sky-200 space-y-1">
          {inputs.profileNotes.map((n, i) => (
            <div key={i}>{language === "EN" ? n.en : n.es}</div>
          ))}
        </div>
      ) : null}

      {/* Resultado */}
      <div className="bg-[#0b0d14] border border-slate-800 p-6 sm:p-8 rounded-3xl shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 font-bold uppercase flex-wrap">
            <Calculator size={15} />
            <span>{language === "EN" ? `Expected annual return · ${calc.H} years` : `Rentabilidad anual esperada · ${calc.H} años`}</span>
          </div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="text-4xl sm:text-5xl font-display font-black text-white">{Number.isFinite(sc.retorno_total) ? `${sc.retorno_total.toFixed(1)}%` : "—"}</span>
            <span className="text-sm font-bold px-2.5 py-1 rounded-full font-mono border" style={badge(beats)}>
              {beats ? (language === "EN" ? "beats" : "supera") : (language === "EN" ? "below" : "por debajo de")} r = {(calc.r * 100).toFixed(1)}%
            </span>
          </div>
          <div className="text-xs text-slate-400 font-mono flex items-center gap-2 flex-wrap">
            <span>{language === "EN" ? "Fair value" : "Valor justo"}: <span className="text-white font-bold">{calc.formatCurrency(sc.P_star_ajustado)}</span></span>
            <span className="px-1.5 py-0.5 rounded border text-[11px] font-bold" style={badge(up)}>{pctTxt(sc.upside)} {language === "EN" ? "vs price" : "vs precio"}</span>
            <span className="text-slate-600">·</span>
            <span>{language === "EN" ? "Price" : "Precio"}: <span className="text-white font-bold">{calc.formatCurrency(calc.P0)}</span></span>
          </div>
        </div>
        <div className="flex flex-col items-start lg:items-end gap-3">
          <div data-toggle className="flex items-center gap-1 bg-[#090a10]/95 p-1 rounded-xl border border-slate-800">
            {(["bear", "base", "bull"] as const).map((k) => (
              <button
                key={k}
                aria-pressed={scenarioSel === k}
                onClick={() => setScenarioSel(k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                  scenarioSel === k ? "bg-white text-slate-950 border-white shadow-md" : "text-slate-400 border-transparent hover:text-white hover:bg-slate-800/60"
                }`}
              >
                {scLabel(k)}
              </button>
            ))}
          </div>
          {anyOverride && (
            <button
              onClick={resetAll}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700/80 rounded-xl text-[11px] font-mono font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw size={13} />
              <span>{language === "EN" ? "Reset to defaults" : "Volver a los valores por defecto"}</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-6">
        {/* Supuestos editables */}
        <div className={`${card} space-y-5`}>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Settings2 size={16} className="text-emerald-400" />
              <span>{language === "EN" ? "Assumptions" : "Supuestos"}</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              {language === "EN" ? "Move any assumption to see the return and fair value change." : "Mueve cualquier supuesto y verás cómo cambian la rentabilidad y el valor justo."}
            </p>
          </div>
          <div className="space-y-5">
            {sliders.map((d) => (
              <label key={d.key} className="block space-y-2">
                <span className="flex justify-between gap-3 text-xs font-mono">
                  <span className="text-slate-300 font-bold">{d.label}</span>
                  <span className={`${d.text} font-black`}>{d.value}{d.unit}</span>
                </span>
                <input
                  type="range"
                  min={d.min}
                  max={d.max}
                  step={d.step}
                  value={d.value}
                  onChange={(e) => d.onChange(parseFloat(e.target.value))}
                  className={`w-full ${d.accent} cursor-pointer`}
                />
                <span className="flex justify-between gap-3 text-[10px] font-mono text-slate-500">
                  <span className="truncate" title={d.hint}>{d.hint}</span>
                  <span className="shrink-0">{language === "EN" ? "Default" : "Por defecto"}: {d.base}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* De dónde sale la rentabilidad */}
        <div className={`${card} space-y-5`}>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Scale size={16} className="text-emerald-400" />
            <span>{language === "EN" ? "Where the return comes from" : "De dónde sale la rentabilidad"}</span>
          </h3>
          <div className="space-y-3">
            {engines.map((e) => (
              <div key={e.label} className="space-y-1">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-slate-300">{e.label}</span>
                  <span className="font-bold" style={{ color: e.color }}>{pctTxt(e.v)}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-800/80 relative overflow-hidden">
                  <div
                    className="absolute top-0 h-full rounded-full"
                    style={{ background: e.color, width: `${(Math.abs(e.v) / maxAbs) * 50}%`, left: e.v >= 0 ? "50%" : `${50 - (Math.abs(e.v) / maxAbs) * 50}%` }}
                  />
                  <div className="absolute top-0 left-1/2 w-px h-full bg-slate-600" />
                </div>
              </div>
            ))}
            <div className="flex justify-between pt-2 border-t border-slate-800/70 text-sm font-mono font-black">
              <span className="text-white">{language === "EN" ? "= Annual return (IRR)" : "= Rentabilidad anual (TIR)"}</span>
              <span className={beats ? "text-emerald-300" : "text-rose-300"}>{Number.isFinite(sc.retorno_total) ? `${sc.retorno_total.toFixed(1)}%` : "—"}</span>
            </div>
          </div>

          <div className="divide-y divide-slate-800/70 text-xs font-mono">
            {[
              [language === "EN" ? "EPS" : "BPA", `${calc.formatCurrency(inputs.epsBase ?? calc.EPS_TTM)} → ${calc.formatCurrency(sc.EPS_H)}`, language === "EN" ? `today → year ${calc.H}` : `hoy → año ${calc.H}`],
              [language === "EN" ? "P/E" : "PER", `${calc.PE0.toFixed(1)}× → ${sc.peExit.toFixed(1)}×`, `${language === "EN" ? "10-yr median" : "mediana 10 años"} ${calc.avgPe.toFixed(1)}×`],
              [language === "EN" ? "Price" : "Precio", `${calc.formatCurrency(calc.P0)} → ${calc.formatCurrency(sc.P_H)}`, `${language === "EN" ? "target in year" : "objetivo en el año"} ${calc.H}`],
              [language === "EN" ? "Fair value today" : "Valor justo hoy", calc.formatCurrency(sc.P_star_ajustado), `${language === "EN" ? "flows discounted at" : "flujos descontados al"} ${(calc.r * 100).toFixed(1)}%`],
            ].map(([l, v, sub]) => (
              <div key={l} className="flex items-baseline justify-between gap-3 py-2.5">
                <span className="text-slate-300">
                  {l}
                  <span className="block text-[10px] text-slate-500">{sub}</span>
                </span>
                <span className="text-white font-bold">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Escenarios y trayectoria del precio */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6">
        <div className={`${card} space-y-3`}>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <BarChart3 size={16} className="text-emerald-400" />
            <span>{language === "EN" ? "Three scenarios" : "Tres escenarios"}</span>
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono min-w-[460px]">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                  <th className="py-2 px-2">{language === "EN" ? "Scenario" : "Escenario"}</th>
                  <th className="py-2 px-2 text-right">{language === "EN" ? "Exit P/E" : "PER salida"}</th>
                  <th className="py-2 px-2 text-right">{language === "EN" ? "Target" : "Objetivo"}</th>
                  <th className="py-2 px-2 text-right">{language === "EN" ? "IRR" : "TIR"}</th>
                  <th className="py-2 px-2 text-right">{language === "EN" ? "Fair value" : "Valor justo"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {(["bear", "base", "bull"] as const).map((k) => {
                  const r = calc[k];
                  const sel = k === scenarioSel;
                  return (
                    <tr key={k} onClick={() => setScenarioSel(k)} className={`cursor-pointer ${sel ? "bg-slate-800/40" : "hover:bg-slate-800/20"}`}>
                      <td className={`py-2.5 px-2 font-bold ${sel ? "text-white" : "text-slate-300"}`}>
                        <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: k === "bear" ? "#f43f5e" : k === "base" ? "#f59e0b" : "#10b981" }} />
                        {scLabel(k)}
                      </td>
                      <td className="py-2.5 px-2 text-right text-purple-300">{r.peExit.toFixed(1)}×</td>
                      <td className="py-2.5 px-2 text-right text-slate-200">{calc.formatCurrency(r.P_H)}</td>
                      <td className={`py-2.5 px-2 text-right font-bold ${r.retorno_total >= calc.r * 100 ? "text-emerald-400" : "text-rose-400"}`}>{Number.isFinite(r.retorno_total) ? `${r.retorno_total.toFixed(1)}%` : "—"}</td>
                      <td className="py-2.5 px-2 text-right text-slate-200">
                        {calc.formatCurrency(r.P_star_ajustado)} <span className={r.upside >= 0 ? "text-emerald-400" : "text-rose-400"}>({pctTxt(r.upside)})</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className={`${card} space-y-3`}>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <TrendingUp size={16} className="text-emerald-400" />
            <span>{language === "EN" ? "Price path" : "Trayectoria del precio"}</span>
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={calc.chartData.map((d, i) => ({ ...d, label: i === 0 ? (language === "EN" ? "Today" : "Hoy") : `${language === "EN" ? "Y" : "A"}${i}` }))} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={light ? "#e7e3da" : "#1e2230"} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: light ? "#6b675e" : "#8b90a0", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: light ? "#6b675e" : "#8b90a0", fontSize: 11 }} axisLine={false} tickLine={false} width={56} tickFormatter={(v) => `$${Math.round(v)}`} />
                <Tooltip
                  contentStyle={{ background: light ? "#ffffff" : "#0f111a", border: `1px solid ${light ? "#e4e0d4" : "#262b3a"}`, borderRadius: 12, fontSize: 12 }}
                  formatter={(v: any, n: any) => [`$${Number(v).toFixed(2)}`, n === "bear" ? scLabel("bear") : n === "bull" ? scLabel("bull") : n === "base" ? "Base" : n]}
                />
                <ReferenceLine y={calc.P0} stroke={light ? "#a8a29e" : "#57534e"} strokeDasharray="4 4" />
                <Line type="monotone" dataKey="bear" stroke="#f43f5e" strokeWidth={scenarioSel === "bear" ? 3 : 1.5} dot={false} />
                <Line type="monotone" dataKey="base" stroke="#f59e0b" strokeWidth={scenarioSel === "base" ? 3 : 1.5} dot={false} />
                <Line type="monotone" dataKey="bull" stroke="#10b981" strokeWidth={scenarioSel === "bull" ? 3 : 1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-slate-500 font-mono">
            {language === "EN" ? "Dashed line: today's price. EPS grows at engine 1 and the P/E moves linearly to the exit P/E." : "Línea discontinua: precio de hoy. El BPA crece al ritmo del motor 1 y el PER va en línea recta hasta el de salida."}
          </p>
        </div>
      </div>

      {/* Histórico del PER y notas (plegado) */}
      <details className="group bg-[#0b0d14] border border-slate-800/80 rounded-3xl p-6 shadow-xl">
        <summary className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 cursor-pointer list-none">
          <ChevronDown size={16} className="text-emerald-400 transition-transform -rotate-90 group-open:rotate-0" />
          <span>{language === "EN" ? "P/E history and growth notes" : "Histórico del PER y notas del crecimiento"}</span>
        </summary>
        <div className="mt-4 space-y-3 text-xs font-mono">
          <div className="text-slate-300">
            {language === "EN" ? "Historical median P/E" : "PER mediano histórico"}: <span className="text-purple-300 font-bold">{calc.avgPe.toFixed(1)}×</span>{" "}
            <span className="text-slate-500">
              {inputs.peMedianSource === "normalized10y"
                ? (language === "EN" ? "(10 years of monthly price / average EPS of the last 5 fiscal years)" : "(10 años de precio mensual / BPA medio de los últimos 5 ejercicios)")
                : inputs.peMedianSource === "monthly10y"
                  ? (language === "EN" ? "(10 years of monthly P/E: price / 12-month EPS)" : "(10 años de PER mensual: precio / BPA de 12 meses)")
                  : (language === "EN" ? "(fiscal year-ends)" : "(cierres de ejercicio)")}
            </span>
          </div>
          {calc.peHistory.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {calc.peHistory.map((h, idx) => (
                <span key={`${h.year}-${idx}`} className="px-1.5 py-0.5 rounded text-[10px] border bg-slate-900/80 border-slate-800 text-slate-300">
                  {h.isCurrentYear ? (language === "EN" ? "Current" : "Actual") : h.year}: <span className="font-bold text-white">{h.pe.toFixed(1)}×</span>
                </span>
              ))}
            </div>
          )}
          <ul className="space-y-1 text-slate-400 list-disc pl-4">
            {calc.growthNotes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
          <p className="text-[11px] text-slate-500 font-sans">
            {language === "EN"
              ? "IRR of: buy at today's price, collect dividends growing with EPS, sell at EPS × exit P/E. Fair value discounts the same flows at the required return."
              : "TIR de: comprar al precio actual, cobrar dividendos que crecen con el BPA y vender a BPA × PER de salida. El valor justo descuenta esos flujos a la rentabilidad exigida."}
          </p>
        </div>
      </details>
    </div>
  );
}
