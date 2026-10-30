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

  return (
    <div className={`space-y-6 ${theme === "light" ? "text-slate-900" : "text-white"}`}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Core Metrics Summary */}
        <div className="col-span-1 space-y-4">
          <div className={`p-5 rounded-2xl border ${theme === "light" ? "bg-white border-slate-200 shadow-sm" : "bg-[#0f111a]/60 border-slate-800/80 backdrop-blur-md shadow-lg"} h-full flex flex-col justify-between`}>
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center font-bold text-white shadow-lg text-sm">
                  {ticker}
                </div>
                <div>
                  <h2 className="text-lg font-black font-sans tracking-tight leading-none">{inputs.name}</h2>
                  <span className="text-xs font-mono text-emerald-500 font-bold">{calc.formatCurrency(calc.P0)}</span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-end border-b border-slate-800/50 pb-2">
                  <span className="text-xs text-slate-400">{language === "EN" ? "Current EPS (TTM)" : "EPS Actual (TTM)"}</span>
                  <span className="text-sm font-mono font-bold">{calc.formatCurrency(calc.EPS_TTM)}</span>
                </div>
                <div className="flex justify-between items-end border-b border-slate-800/50 pb-2">
                  <span className="text-xs text-slate-400">{language === "EN" ? "Forward EPS (1Y)" : "EPS Estimado (1Y)"}</span>
                  <span className="text-sm font-mono font-bold text-emerald-400">{calc.EPS_fwd !== null ? calc.formatCurrency(calc.EPS_fwd) : "—"}</span>
                </div>
                <div className="flex justify-between items-end border-b border-slate-800/50 pb-2">
                  <span className="text-xs text-slate-400">{language === "EN" ? "Trailing P/E" : "P/E Actual"}</span>
                  <span className="text-sm font-mono font-bold">{calc.PE0.toFixed(1)}x</span>
                </div>
                <div className="flex justify-between items-end border-b border-slate-800/50 pb-2">
                  <span className="text-xs text-slate-400">{language === "EN" ? "Forward P/E" : "P/E Forward"}</span>
                  <span className="text-sm font-mono font-bold text-emerald-400">{calc.PE_fwd !== null ? `${calc.PE_fwd.toFixed(1)}x` : "—"}</span>
                </div>
                <div className="flex justify-between items-end pb-2">
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-400">{language === "EN" ? "Dividend Yield (Engine 2)" : "Rentabilidad por dividendo (Motor 2)"}</span>
                    <span className="text-[10px] text-slate-500 font-mono" title={language === "EN" ? "Buybacks raise EPS per share, so they are already inside Engine 1." : "Las recompras suben el BPA por acción: ya están dentro del Motor 1."}>
                      {language === "EN" ? `Buybacks ${calc.BBY.toFixed(2)}%/yr: already in EPS` : `Recompras ${calc.BBY.toFixed(2)}%/año: ya en el BPA`}
                    </span>
                  </div>
                  <span className="text-sm font-mono font-bold text-blue-400">+{calc.SY.toFixed(2)}%</span>
                </div>
              </div>
            </div>

            <div className="mt-8 bg-slate-950/50 p-4 rounded-xl border border-slate-800">
              <div className="text-center">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">
                  {language === "EN" ? `Intrinsic Fair Value (Base Case)` : `Fair Value Intrínseco (Caso Base)`}
                </span>
                <span className={`text-3xl font-black font-mono tracking-tighter ${calc.base.upside > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {calc.formatCurrency(calc.base.P_star_ajustado)}
                </span>
                <div className={`text-xs font-bold mt-1.5 ${calc.base.upside > 0 ? "text-emerald-500" : "text-rose-500"}`}>
                  {calc.formatPct(calc.base.upside)} {language === "EN" ? "vs. price" : "vs. precio"}
                </div>
                <div className="text-[11px] text-slate-400 mt-1 font-mono">
                  {language === "EN" ? "Expected IRR (base):" : "TIR esperada (base):"} <strong className={calc.base.retorno_total >= calc.r * 100 ? "text-emerald-400" : "text-rose-400"}>{calc.base.retorno_total.toFixed(1)}%</strong> {language === "EN" ? "vs. hurdle" : "vs. exigida"} {(calc.r * 100).toFixed(1)}%
                </div>

                <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-1.5 text-xs px-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-medium">
                      {language === "EN" ? `Target Price (${calc.H}Y):` : `Precio Objetivo (${calc.H}A):`}
                    </span>
                    <span className="font-mono font-bold text-white">
                      {calc.formatCurrency(calc.base.P_H)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>{language === "EN" ? "Discounted at:" : "Descontado al:"}</span>
                    <span className="font-mono text-emerald-400">r = {(calc.r * 100).toFixed(1)}% / {calc.H} {language === "EN" ? "yrs" : "años"}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 3-Scenarios Valuation & Return Matrix (Right Column) */}
        <div className="col-span-1 lg:col-span-2">
          <div className={`border rounded-2xl p-6 h-full flex flex-col justify-between ${theme === "light" ? "bg-white border-slate-200 shadow-sm" : "bg-[#0f111a]/60 border-slate-800/80 backdrop-blur-md shadow-lg"}`}>
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
                <div>
                  <h3 className="text-lg font-black tracking-tight flex items-center gap-2">
                    <BarChart3 size={18} className="text-emerald-400" />
                    {language === "EN" ? "3-SCENARIOS VALUATION & RETURN MATRIX" : "MATRIZ DE VALORACIÓN Y RETORNO (3 ESCENARIOS)"}
                  </h3>
                  <div className="flex items-center gap-2.5 mt-1 font-mono text-xs text-slate-400 flex-wrap">
                    <span>{language === "EN" ? "Current Price:" : "Precio Actual:"} <strong className="text-white">${calc.P0.toFixed(2)}</strong></span>
                    <span className="text-slate-700">|</span>
                    <span>{language === "EN" ? "Current P/E:" : "P/E Actual:"} <strong className="text-purple-400">{calc.PE0 > 0 ? `${calc.PE0.toFixed(1)}×` : "N/A"}</strong></span>
                    <span className="text-slate-700">|</span>
                    <span>{language === "EN" ? `EPS year ${calc.H}:` : `BPA año ${calc.H}:`} <strong className="text-emerald-400">{calc.formatCurrency(calc.EPS_H)}</strong></span>
                    <span className="text-slate-700">|</span>
                    <span className="flex items-center gap-1.5">
                      <span className="text-purple-300 font-semibold">{language === "EN" ? "Median hist. P/E:" : "PER mediano hist.:"}</span>
                      <span
                        className="font-bold text-purple-200 bg-purple-500/20 px-2 py-0.5 rounded border border-purple-400/30 cursor-help"
                        title={
                          calc.peHistory && calc.peHistory.length > 0
                            ? `${language === "EN" ? "Median historical P/E" : "PER mediano histórico"}: ${calc.avgPe.toFixed(1)}×\n` +
                              calc.peHistory.map(h => `${h.isCurrentYear ? (language === "EN" ? "Current P/E" : "P/E Actual") : `Año ${h.year}`}: ${h.pe.toFixed(1)}×${h.isCurrentYear ? "" : ` (Cierre: $${h.price} / EPS: $${h.eps})`}`).join("\n")
                            : `${language === "EN" ? "No P/E history: current P/E used" : "Sin histórico de PER: se usa el actual"}`
                        }
                      >
                        {calc.avgPe.toFixed(1)}×
                      </span>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {(peExitBearOverride !== null || peExitBaseOverride !== null || peExitBullOverride !== null || modelCagrOverride !== null || shareholderYieldOverride !== null) && (
                    <button
                      onClick={() => {
                        setPeExitBearOverride(null);
                        setPeExitBaseOverride(null);
                        setPeExitBullOverride(null);
                        setModelCagrOverride(null);
                        setShareholderYieldOverride(null);
                      }}
                      className="text-xs text-emerald-400 hover:text-emerald-300 font-mono underline"
                    >
                      {language === "EN" ? "Reset All" : "Resetear Todo"}
                    </button>
                  )}
                </div>
              </div>

              {/* Annual P/E Breakdown bar */}
              {calc.peHistory && calc.peHistory.length > 0 && (
                <div className="mb-4 px-3.5 py-2 bg-purple-950/20 border border-purple-900/40 rounded-xl flex items-center justify-between flex-wrap gap-2 text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span className="text-purple-300 font-bold uppercase text-[10px] flex items-center gap-1">
                      <Activity size={12} />
                      {language === "EN" ? "P/E history" : "Histórico de PER"} ({calc.peHistory.length} {language === "EN" ? "periods" : "datos"}):
                    </span>
                    <span className="text-slate-400 text-[10px] hidden md:inline">
                      ({language === "EN" ? "Year close / diluted EPS; median excludes current and values > 80×" : "Cierre / BPA diluido; la mediana excluye el actual y valores > 80×"}):
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {calc.peHistory.map((h, idx) => (
                      <div
                        key={`${h.year}-${h.isCurrentYear ? "curr" : "hist"}-${idx}`}
                        className={`px-1.5 py-0.5 rounded text-[10px] border ${h.isCurrentYear ? "bg-purple-500/20 border-purple-400/40 text-purple-200 font-bold" : "bg-slate-900/80 border-slate-800 text-slate-300"}`}
                        title={`${h.isCurrentYear ? (language === "EN" ? "Current P/E" : "P/E Actual") : `Año ${h.year}`}: ${h.isCurrentYear ? `Current P/E: ${h.pe.toFixed(1)}×` : `Cierre $${h.price} ÷ EPS $${h.eps} = ${h.pe.toFixed(1)}×`}`}
                      >
                        <span className="text-slate-400 mr-1">{h.isCurrentYear ? (language === "EN" ? "Current" : "Actual") : h.year}:</span>
                        <span className="font-bold text-white">{h.pe.toFixed(1)}×</span>
                      </div>
                    ))}
                    <div className="px-2 py-0.5 rounded text-[10px] bg-purple-500/30 border border-purple-400/60 text-purple-100 font-extrabold ml-1">
                      <span className="mr-1">{language === "EN" ? "Median:" : "Mediana:"}</span>
                      <span>{calc.avgPe.toFixed(1)}×</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Editable Parameters Bar: Horizon, Hurdle Rate, EPS CAGR, Shareholder Yield */}
              <div className={`mb-6 p-4 rounded-xl border grid grid-cols-2 sm:grid-cols-4 gap-4 ${theme === "light" ? "bg-slate-50 border-slate-200" : "bg-slate-950/60 border-slate-800/80"}`}>
                {/* Horizon */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-mono text-slate-400 block font-semibold">
                    {language === "EN" ? "Horizon (Years)" : "Horizonte (Años)"}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="1"
                      max="15"
                      step="1"
                      value={horizonYears}
                      onChange={e => setHorizonYears(Math.max(1, Math.min(15, Number(e.target.value))))}
                      className="w-16 bg-slate-900/90 border border-slate-700 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:border-emerald-500 text-white font-bold"
                    />
                    <span className="text-xs font-mono text-slate-400">{language === "EN" ? "yrs" : "años"}</span>
                  </div>
                </div>

                {/* Hurdle Rate */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-mono text-slate-400 block font-semibold">
                    {language === "EN" ? "Hurdle Rate (r)" : "Tasa Exigida (r)"}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="1"
                      max="50"
                      step="0.5"
                      value={hurdleRate}
                      onChange={e => setHurdleRate(Math.max(0, Number(e.target.value)))}
                      className="w-16 bg-slate-900/90 border border-slate-700 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:border-emerald-500 text-emerald-400 font-bold"
                    />
                    <span className="text-xs font-mono text-slate-400">%</span>
                  </div>
                </div>

                {/* EPS CAGR */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-mono text-slate-400 block font-semibold cursor-help" title={calc.growthNotes.join("\n")}>
                      {language === "EN" ? "EPS growth (E1) ⓘ" : "Crec. BPA (M1) ⓘ"}
                    </label>
                    {modelCagrOverride !== null && (
                      <button
                        onClick={() => setModelCagrOverride(null)}
                        className="text-[10px] text-emerald-400 hover:underline"
                      >
                        {language === "EN" ? "Reset" : "Reset"}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      step="0.5"
                      value={Number(calc.EPS_CAGR_modelo.toFixed(1))}
                      onChange={e => setModelCagrOverride(Number(e.target.value))}
                      className="w-16 bg-slate-900/90 border border-slate-700 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:border-emerald-500 text-emerald-400 font-bold"
                    />
                    <span className="text-xs font-mono text-slate-400">%</span>
                  </div>
                </div>

                {/* Shareholder Yield */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-mono text-slate-400 block font-semibold">
                      {language === "EN" ? "Div. yield (E2)" : "Dividendo (M2)"}
                    </label>
                    {shareholderYieldOverride !== null && (
                      <button
                        onClick={() => setShareholderYieldOverride(null)}
                        className="text-[10px] text-blue-400 hover:underline"
                      >
                        {language === "EN" ? "Reset" : "Reset"}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      step="0.1"
                      value={Number(calc.SY.toFixed(2))}
                      onChange={e => setShareholderYieldOverride(Number(e.target.value))}
                      className="w-16 bg-slate-900/90 border border-slate-700 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:border-blue-500 text-blue-400 font-bold"
                    />
                    <span className="text-xs font-mono text-slate-400">%</span>
                  </div>
                </div>
              </div>

              {/* Scenarios Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[700px]">
                  <thead>
                    <tr className="border-b border-slate-800">
                      <th className="pb-3 px-4 font-bold text-xs uppercase tracking-wider text-slate-500">{language === "EN" ? "Scenario" : "Escenario"}</th>
                      <th className="pb-3 px-4 font-bold text-xs uppercase tracking-wider text-slate-500">
                        {language === "EN" ? "Exit P/E" : "P/E Salida"}
                        <span className="block text-[10px] lowercase font-mono font-normal text-emerald-400">editable</span>
                      </th>
                      <th className="pb-3 px-4 font-bold text-xs uppercase tracking-wider text-purple-400">
                        {language === "EN" ? "E3 (Δ P/E)" : "E3 (Δ P/E)"}
                      </th>
                      <th className="pb-3 px-4 font-bold text-xs uppercase tracking-wider text-slate-500">
                        {language === "EN" ? "Target Price" : "Precio Objetivo"}
                      </th>
                      <th className="pb-3 px-4 font-bold text-xs uppercase tracking-wider text-slate-500">
                        {language === "EN" ? "IRR" : "TIR"}
                      </th>
                      <th className="pb-3 px-4 font-bold text-xs uppercase tracking-wider text-slate-500">
                        {language === "EN" ? "Fair Value" : "Valor Justo"}
                      </th>
                      <th className="pb-3 px-4 font-bold text-xs uppercase tracking-wider text-slate-500 text-right">
                        {language === "EN" ? "Upside / Downside" : "Upside / Downside"}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {/* Bear */}
                    <tr className="hover:bg-white/5 transition-colors group">
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                          <div>
                            <span className="font-bold text-sm">Bear</span>
                            <span className="block text-[10px] text-rose-400/80 font-mono">{language === "EN" ? "−20% on lower P/E" : "−20% s/ menor PER"}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.1"
                            value={calc.bear.peExit}
                            onChange={e => setPeExitBearOverride(Number(e.target.value))}
                            className="w-16 bg-slate-900/80 border border-slate-700 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:border-rose-500 text-rose-400 font-bold"
                          />
                          <span className="text-xs font-mono text-slate-400">x</span>
                        </div>
                      </td>
                      <td className={`py-4 px-4 font-mono text-sm font-bold ${calc.bear.contribE3 >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {calc.bear.contribE3 >= 0 ? "+" : ""}{calc.bear.contribE3.toFixed(1)}%
                      </td>
                      <td className="py-4 px-4 font-mono text-sm">{calc.formatCurrency(calc.bear.P_H)}</td>
                      <td className={`py-4 px-4 font-mono text-sm font-bold ${calc.bear.retorno_total >= calc.r * 100 ? "text-emerald-400" : "text-rose-400"}`}>{calc.bear.retorno_total.toFixed(1)}%</td>
                      <td className="py-4 px-4 font-mono text-sm">{calc.formatCurrency(calc.bear.P_star_ajustado)}</td>
                      <td className="py-4 px-4 text-right">
                        <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-bold font-mono ${calc.bear.upside > 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"}`}>
                          {calc.formatPct(calc.bear.upside)}
                        </span>
                      </td>
                    </tr>
                    {/* Base */}
                    <tr className="hover:bg-white/5 transition-colors bg-white/5">
                      <td className="py-4 px-4 border-l-2 border-emerald-500">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                          <div>
                            <span className="font-bold text-sm text-emerald-400">Base</span>
                            <span className="block text-[10px] text-emerald-400/80 font-mono">{language === "EN" ? `Midpoint current–median (≤ ${EXIT_PE_CAP_BASE}×)` : `Punto medio actual–mediana (≤ ${EXIT_PE_CAP_BASE}×)`}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.1"
                            value={calc.base.peExit}
                            onChange={e => setPeExitBaseOverride(Number(e.target.value))}
                            className="w-16 bg-slate-900/80 border border-slate-700 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:border-emerald-500 text-emerald-400 font-bold"
                          />
                          <span className="text-xs font-mono text-slate-400">x</span>
                        </div>
                      </td>
                      <td className={`py-4 px-4 font-mono text-sm font-bold ${calc.base.contribE3 >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {calc.base.contribE3 >= 0 ? "+" : ""}{calc.base.contribE3.toFixed(1)}%
                      </td>
                      <td className="py-4 px-4 font-mono text-sm font-bold text-emerald-400">{calc.formatCurrency(calc.base.P_H)}</td>
                      <td className={`py-4 px-4 font-mono text-sm font-bold ${calc.base.retorno_total >= calc.r * 100 ? "text-emerald-400" : "text-rose-400"}`}>{calc.base.retorno_total.toFixed(1)}%</td>
                      <td className="py-4 px-4 font-mono text-sm font-bold text-emerald-400">{calc.formatCurrency(calc.base.P_star_ajustado)}</td>
                      <td className="py-4 px-4 text-right">
                        <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-bold font-mono ${calc.base.upside > 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"}`}>
                          {calc.formatPct(calc.base.upside)}
                        </span>
                      </td>
                    </tr>
                    {/* Bull */}
                    <tr className="hover:bg-white/5 transition-colors group">
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                          <div>
                            <span className="font-bold text-sm">Bull</span>
                            <span className="block text-[10px] text-blue-400 font-mono">{language === "EN" ? `Higher P/E (≤ ${EXIT_PE_CAP_BULL}×)` : `Mayor PER (≤ ${EXIT_PE_CAP_BULL}×)`}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.1"
                            value={calc.bull.peExit}
                            onChange={e => setPeExitBullOverride(Number(e.target.value))}
                            className="w-16 bg-slate-900/80 border border-slate-700 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:border-emerald-500 text-emerald-300 font-bold"
                          />
                          <span className="text-xs font-mono text-slate-400">x</span>
                        </div>
                      </td>
                      <td className={`py-4 px-4 font-mono text-sm font-bold ${calc.bull.contribE3 >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        <div title={calc.PE0 > 0 ? `Δ total P/E: ${((calc.bull.peExit - calc.PE0) / calc.PE0 * 100) >= 0 ? "+" : ""}${((calc.bull.peExit - calc.PE0) / calc.PE0 * 100).toFixed(1)}% (${calc.PE0.toFixed(1)}× → ${calc.bull.peExit.toFixed(1)}×)` : undefined}>
                          <span>{calc.bull.contribE3 >= 0 ? "+" : ""}{calc.bull.contribE3.toFixed(1)}%</span>
                          {calc.PE0 > 0 && calc.bull.peExit !== calc.PE0 && (
                            <span className="block text-[10px] font-normal text-slate-400">
                              (Δ {((calc.bull.peExit - calc.PE0) / calc.PE0 * 100) >= 0 ? "+" : ""}{((calc.bull.peExit - calc.PE0) / calc.PE0 * 100).toFixed(0)}%)
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-4 font-mono text-sm">{calc.formatCurrency(calc.bull.P_H)}</td>
                      <td className={`py-4 px-4 font-mono text-sm font-bold ${calc.bull.retorno_total >= calc.r * 100 ? "text-emerald-400" : "text-rose-400"}`}>{calc.bull.retorno_total.toFixed(1)}%</td>
                      <td className="py-4 px-4 font-mono text-sm">{calc.formatCurrency(calc.bull.P_star_ajustado)}</td>
                      <td className="py-4 px-4 text-right">
                        <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-bold font-mono ${calc.bull.upside > 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"}`}>
                          {calc.formatPct(calc.bull.upside)}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="pt-4 mt-6 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                {language === "EN" ? "IRR of: buy at today's price, collect dividends growing with EPS, sell at EPS × exit P/E. Fair value discounts the same flows at the hurdle rate (default: CAPM cost of equity, min. 8%)." : "TIR de: comprar al precio actual, cobrar dividendos que crecen con el BPA y vender a BPA × PER de salida. El valor justo descuenta esos flujos a la tasa exigida (por defecto, coste del capital por CAPM, mínimo 8%)."}
              </span>
              <span className="font-mono text-slate-500">Bogle Model Engine</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
