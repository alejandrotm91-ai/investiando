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

interface SingleStockBogleAnalysisProps {
  ticker: string;
  language?: "EN" | "ES";
  theme?: "dark" | "light";
}

interface StockMetrics {
  symbol: string;
  name: string;
  price: number;
  marketCap: number;
  peTrailing: number | null;
  peForward: number | null;
  pegRatio: number | null;
  priceToSales: number | null;
  priceToBook: number | null;
  evToEbitda: number | null;
  trailingEps: number | null;
  forwardEps: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  roe: number | null;
  roa: number | null;
  totalCash: number | null;
  totalDebt: number | null;
  freeCashFlow: number | null;
  currentRatio: number | null;
  debtToEquity: number | null;
  sharesOutstanding: number | null;
  dividendRate: number | null;
  dividendYield: number | null;
  payoutRatio: number | null;
  beta: number | null;
  basicEpsCagrAnnual: number | null;
  shareholderYield: number | null;
  buybackYield: number | null;
  fScore?: number | null;
  netIncome?: number | null;
  avgPe?: number | null;
  peHistory?: Array<{ year: number | string; eps: number; price: number; pe: number; isCurrentYear?: boolean; quarterDate?: string; date?: string }> | null;
}

export default function SingleStockBogleAnalysis({
  ticker,
  language = "ES",
  theme = "dark"
}: SingleStockBogleAnalysisProps) {
  const [loading, setLoading] = useState<boolean>(false);
  const [stockMetrics, setStockMetrics] = useState<StockMetrics | null>(null);

  // Model parameters (Customizable)
  const [horizonYears, setHorizonYears] = useState<number>(5);
  const [hurdleRate, setHurdleRate] = useState<number>(10); // IRR target
  const [modelCagrOverride, setModelCagrOverride] = useState<number | null>(null);
  const [shareholderYieldOverride, setShareholderYieldOverride] = useState<number | null>(null);
  const [peExitBearOverride, setPeExitBearOverride] = useState<number | null>(null);
  const [peExitBaseOverride, setPeExitBaseOverride] = useState<number | null>(null);
  const [peExitBullOverride, setPeExitBullOverride] = useState<number | null>(null);
  const [applyNetDebtAdjustment, setApplyNetDebtAdjustment] = useState<boolean>(true);

  // Re-fetch when ticker changes
  useEffect(() => {
    let isMounted = true;
    async function fetchStock() {
      if (!ticker) return;
      
      if (isMounted) setLoading(true);
      
      try {
        const [stockRes, finRes] = await Promise.all([
          fetch(`/api/stock/${ticker}`),
          fetch("/api/portfolio/financials", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ticker })
          })
        ]);

        const stockData = stockRes.ok ? await stockRes.json() : null;
        const fins = finRes.ok ? await finRes.json() : {};
        const finData = fins?.annual ? fins : (fins?.[ticker] || null);

        if (stockData) {
          const price = stockData.price || 100;
          const trailingEps = stockData.trailingEps ?? (stockData.eps || 4.0);
          const forwardEps = stockData.forwardEps ?? (trailingEps * 1.1);
          const peTrailing = stockData.pe ?? (trailingEps > 0 ? price / trailingEps : 24);
          const peForward = stockData.forwardPE ?? (forwardEps > 0 ? price / forwardEps : 20);
          const divYield = stockData.dividendYield ? (stockData.dividendYield > 1 ? stockData.dividendYield : stockData.dividendYield * 100) : 0;
          
          // Calculate historical metrics strictly from Annual Financials (Diluted EPS CAGR)
          let epsCagr = 12.0;
          let buybackYield = 1.0;
          
          if (finData?.annual && Array.isArray(finData.annual) && finData.annual.length >= 2) {
            const sorted = [...finData.annual].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
            
            // Diluted EPS CAGR from annual data (matching Financials Income Statement Annual CAGR column)
            const valid = sorted
              .map((c: any, i: number) => ({
                val: (c.dilutedEPS !== undefined && c.dilutedEPS !== null) ? c.dilutedEPS : c.basicEPS,
                idx: i
              }))
              .filter(x => typeof x.val === "number" && !isNaN(x.val) && x.val > 0);

            if (valid.length >= 2) {
              const latest = valid[0];
              const oldestPositive = [...valid].reverse().find(item => item.val > 0 && item.idx > latest.idx);
              if (oldestPositive) {
                const n = oldestPositive.idx - latest.idx;
                if (n > 0) {
                  epsCagr = (Math.pow(latest.val / oldestPositive.val, 1 / n) - 1) * 100;
                }
              }
            }

            // Share reduction yield (Buybacks)
            const validS = sorted.map((c, i) => ({ val: c.ordinarySharesNumber ?? c.shareIssued, idx: i })).filter(x => typeof x.val === "number" && x.val > 0);
            if (validS.length >= 2) {
              const latest = validS[0];
              const oldest = validS[validS.length - 1];
              const n = oldest.idx - latest.idx;
              if (n > 0) {
                const shareReduction = (Math.pow(latest.val / oldest.val, 1 / n) - 1) * 100;
                buybackYield = shareReduction < 0 ? Math.abs(shareReduction) : 0; // Only positive yield if shares decreased
              }
            }
          }

          if (isMounted) {
            setStockMetrics({
              symbol: ticker,
              name: stockData.name || ticker,
              price,
              marketCap: stockData.marketCap || 50000000000,
              peTrailing,
              peForward,
              pegRatio: stockData.pegRatio ?? 1.5,
              priceToSales: stockData.priceToSales ?? 5.0,
              priceToBook: stockData.priceToBook ?? 6.0,
              evToEbitda: stockData.evToEbitda ?? 16.0,
              trailingEps,
              forwardEps,
              operatingMargin: 30, // Mock fallback
              netMargin: 20, // Mock fallback
              roe: 25, // Mock fallback
              roa: 12, // Mock fallback
              totalCash: stockData.totalCash || 10000000000,
              totalDebt: stockData.totalDebt || 5000000000,
              freeCashFlow: stockData.freeCashFlow || 4000000000,
              currentRatio: 1.5,
              debtToEquity: 0.5,
              sharesOutstanding: stockData.sharesOutstanding || 1000000000,
              dividendRate: stockData.dividendRate ?? 0,
              dividendYield: divYield,
              payoutRatio: stockData.payoutRatio ? stockData.payoutRatio * 100 : 0,
              beta: stockData.beta ?? 1.0,
              basicEpsCagrAnnual: epsCagr,
              shareholderYield: divYield + buybackYield,
              buybackYield,
              fScore: 7, // Mock fallback
              netIncome: stockData.netIncome || 5000000000,
              avgPe: finData?.avgPe ?? stockData.avgPe ?? null,
              peHistory: finData?.peHistory ?? stockData.peHistory ?? null
            });
            
            // Reset overrides when changing ticker
            setModelCagrOverride(null);
            setShareholderYieldOverride(null);
            setPeExitBearOverride(null);
            setPeExitBaseOverride(null);
            setPeExitBullOverride(null);
          }
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

  // Calculations
  const calc = useMemo(() => {
    if (!stockMetrics) return null;

    const {
      price: P0,
      trailingEps: EPS_TTM_raw,
      forwardEps: EPS_fwd_raw,
      peTrailing: PE0_raw,
      peForward: PE_fwd_raw,
      basicEpsCagrAnnual,
      shareholderYield: SY_raw,
      dividendYield: DY,
      buybackYield: BBY,
      totalCash,
      totalDebt,
      sharesOutstanding,
      marketCap
    } = stockMetrics;

    const EPS_TTM = EPS_TTM_raw && EPS_TTM_raw > 0 ? EPS_TTM_raw : 1;
    const EPS_fwd = EPS_fwd_raw && EPS_fwd_raw > 0 ? EPS_fwd_raw : EPS_TTM * 1.1;
    const PE0 = PE0_raw && PE0_raw > 0 ? PE0_raw : P0 / EPS_TTM;
    const PE_fwd = PE_fwd_raw && PE_fwd_raw > 0 ? PE_fwd_raw : P0 / EPS_fwd;

    // 1. ENGINE 1 — EPS CAGR (Strictly Diluted EPS CAGR from Annual Financials)
    const EPS_CAGR_hist = basicEpsCagrAnnual ?? 12.0;
    const EPS_CAGR_fwd_1Y = ((EPS_fwd / EPS_TTM) - 1) * 100;

    const defaultModelCagr = Number(EPS_CAGR_hist.toFixed(1));
    const EPS_CAGR_modelo = modelCagrOverride !== null ? modelCagrOverride : defaultModelCagr;

    const H = horizonYears;
    const EPS_H = EPS_TTM * Math.pow(1 + EPS_CAGR_modelo / 100, H);
    const contribE1 = EPS_CAGR_modelo;

    // 2. ENGINE 2 — Shareholder Yield
    const defaultSY = Number((SY_raw ?? ((DY || 0) + (BBY || 0))).toFixed(2));
    const SY = shareholderYieldOverride !== null ? shareholderYieldOverride : defaultSY;
    const contribE2 = SY;

    // 3. ENGINE 3 — P/E Multiple Change & Scenarios
    // Base exit assumes multiple unchanged at Current P/E (PE0, E3 = 0%)
    // Bull exit assumes mean reversion to historical AVG P/E (avgPe), so E3 is the expansion/change from current P/E to AVG P/E
    // Bear exit assumes multiple compression (-20% from current P/E)
    const avgPe = (typeof stockMetrics.avgPe === "number" && !isNaN(stockMetrics.avgPe) && stockMetrics.avgPe > 0)
      ? stockMetrics.avgPe
      : Number(PE0.toFixed(1));
    const defaultPeExitBase = Number(PE0.toFixed(1));
    const defaultPeExitBull = Number(avgPe.toFixed(1));
    const defaultPeExitBear = Math.max(8, Number((defaultPeExitBase * 0.80).toFixed(1)));

    const peExitBear = peExitBearOverride !== null ? peExitBearOverride : defaultPeExitBear;
    const peExitBase = peExitBaseOverride !== null ? peExitBaseOverride : defaultPeExitBase;
    const peExitBull = peExitBullOverride !== null ? peExitBullOverride : defaultPeExitBull;

    // Net Debt Adjustment
    const netDebt = (totalDebt || 0) - (totalCash || 0);
    const shares = sharesOutstanding && sharesOutstanding > 0 ? sharesOutstanding : (marketCap / P0);
    const netDebtPerShare = shares > 0 ? netDebt / shares : 0;
    const isNetDebtMaterial = marketCap > 0 ? Math.abs(netDebt) / marketCap > 0.05 : false;

    const r = hurdleRate / 100;

    const computeScenario = (peExit: number) => {
      let P_H: number;
      let retorno_precio_anual: number;
      let contribE3: number;

      // When multiple stays flat at Current P/E (Base Case with default peExitBase), E3 is strictly 0%
      if (Math.abs(peExit - PE0) < 0.05 || peExit === defaultPeExitBase) {
        retorno_precio_anual = contribE1;
        contribE3 = 0;
        P_H = P0 * Math.pow(1 + contribE1 / 100, H);
      } else {
        P_H = EPS_H * peExit;
        retorno_precio_anual = (Math.pow(P_H / P0, 1 / H) - 1) * 100;
        contribE3 = retorno_precio_anual - contribE1;
      }
      const retorno_total = retorno_precio_anual + SY;

      const target_upside = ((P_H - P0) / P0) * 100;
      const P_star = P_H / Math.pow(1 + r, H);
      const P_star_ajustado = (applyNetDebtAdjustment && isNetDebtMaterial) ? P_star - netDebtPerShare : P_star;
      const upside = ((P_star_ajustado - P0) / P0) * 100;

      return { peExit, P_H, retorno_precio_anual, contribE3, retorno_total, target_upside, P_star, P_star_ajustado, upside };
    };

    const bear = computeScenario(peExitBear);
    const base = computeScenario(peExitBase);
    const bull = computeScenario(peExitBull);

    const formatCurrency = (val: number) => `$${val.toFixed(2)}`;
    const formatPct = (val: number) => `${val > 0 ? '+' : ''}${val.toFixed(1)}%`;

    // Chart Data Generation
    const chartData = [];
    for (let yr = 0; yr <= H; yr++) {
      const eps = EPS_TTM * Math.pow(1 + EPS_CAGR_modelo / 100, yr);
      
      const pBear = yr === 0 ? P0 : eps * (PE0 + (peExitBear - PE0) * (yr / H));
      const pBase = yr === 0 ? P0 : eps * (PE0 + (peExitBase - PE0) * (yr / H));
      const pBull = yr === 0 ? P0 : eps * (PE0 + (peExitBull - PE0) * (yr / H));
      
      chartData.push({
        year: `Year ${yr}`,
        bear: Number(pBear.toFixed(2)),
        base: Number(pBase.toFixed(2)),
        bull: Number(pBull.toFixed(2)),
        eps: Number(eps.toFixed(2))
      });
    }

    return {
      P0, EPS_TTM, EPS_fwd, PE0, PE_fwd,
      EPS_CAGR_hist, EPS_CAGR_fwd_1Y, EPS_CAGR_modelo, defaultModelCagr,
      SY, DY, BBY, contribE1, contribE2,
      H, r, EPS_H,
      netDebtPerShare, isNetDebtMaterial, netDebt,
      bear, base, bull,
      chartData,
      avgPe,
      peHistory: stockMetrics.peHistory || [],
      formatCurrency, formatPct
    };
  }, [stockMetrics, horizonYears, hurdleRate, modelCagrOverride, shareholderYieldOverride, peExitBearOverride, peExitBaseOverride, peExitBullOverride, applyNetDebtAdjustment]);

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
        <RefreshCw size={24} className="animate-spin text-emerald-400" />
        <span className="text-xs font-mono">{language === "EN" ? "Computing 3 Engines of Return & Financials..." : "Calculando Motores de Retorno..."}</span>
      </div>
    );
  }

  if (!calc || !stockMetrics) return null;

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
                  <h2 className="text-lg font-black font-sans tracking-tight leading-none">{stockMetrics.name}</h2>
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
                  <span className="text-sm font-mono font-bold text-emerald-400">{calc.formatCurrency(calc.EPS_fwd)}</span>
                </div>
                <div className="flex justify-between items-end border-b border-slate-800/50 pb-2">
                  <span className="text-xs text-slate-400">{language === "EN" ? "Trailing P/E" : "P/E Actual"}</span>
                  <span className="text-sm font-mono font-bold">{calc.PE0.toFixed(1)}x</span>
                </div>
                <div className="flex justify-between items-end border-b border-slate-800/50 pb-2">
                  <span className="text-xs text-slate-400">{language === "EN" ? "Forward P/E" : "P/E Forward"}</span>
                  <span className="text-sm font-mono font-bold text-emerald-400">{calc.PE_fwd.toFixed(1)}x</span>
                </div>
                <div className="flex justify-between items-end pb-2">
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-400">{language === "EN" ? "Shareholder Yield (Engine 2)" : "Retorno Accionista (Motor 2)"}</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {language === "EN" ? `Div: ${calc.DY.toFixed(2)}% | Buyback: ${calc.BBY.toFixed(2)}%` : `Div: ${calc.DY.toFixed(2)}% | Recompras: ${calc.BBY.toFixed(2)}%`}
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
                  {calc.formatPct(calc.base.upside)} {language === "EN" ? "Margin of Safety" : "Margen de Seguridad"}
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
                    <span className="font-mono text-emerald-400">r = {(calc.r * 100).toFixed(0)}% / {calc.H} {language === "EN" ? "yrs" : "años"}</span>
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
                    <span className="flex items-center gap-1.5">
                      <span className="text-purple-300 font-semibold">{language === "EN" ? "AVG P/E:" : "AVG P/E:"}</span>
                      <span
                        className="font-bold text-purple-200 bg-purple-500/20 px-2 py-0.5 rounded border border-purple-400/30 cursor-help"
                        title={
                          calc.peHistory && calc.peHistory.length > 0
                            ? `AVG P/E: ${calc.avgPe.toFixed(1)}×\n` +
                              calc.peHistory.map(h => `${h.isCurrentYear ? (language === "EN" ? "Current P/E" : "P/E Actual") : `Año ${h.year}`}: ${h.pe.toFixed(1)}×${h.isCurrentYear ? "" : ` (Cierre: $${h.price} / EPS: $${h.eps})`}`).join("\n")
                            : `AVG P/E: ${calc.avgPe.toFixed(1)}×`
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
                      AVG P/E Breakdown ({calc.peHistory.length} {language === "EN" ? "periods" : "datos"}):
                    </span>
                    <span className="text-slate-400 text-[10px] hidden md:inline">
                      ({language === "EN" ? "4 annual P/Es (Year Close / Diluted EPS) + Current P/E" : "4 P/E anuales (Cierre / BPA diluido) + P/E Actual"}):
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
                      <span className="mr-1">AVG P/E:</span>
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
                    <label className="text-[11px] font-mono text-slate-400 block font-semibold">
                      {language === "EN" ? "EPS CAGR (E1)" : "EPS CAGR (M1)"}
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
                      value={calc.EPS_CAGR_modelo}
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
                      {language === "EN" ? "Shareholder Yld" : "Retorno Accionista"}
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
                      value={calc.SY}
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
                      <th className="pb-3 px-4 font-bold text-xs uppercase tracking-wider text-slate-500">{language === "EN" ? "Target EPS" : "Target EPS"}</th>
                      <th className="pb-3 px-4 font-bold text-xs uppercase tracking-wider text-slate-500">
                        {language === "EN" ? "Target Price" : "Precio Objetivo"}
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
                            <span className="block text-[10px] text-rose-400/80 font-mono">-20% P/E</span>
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
                      <td className="py-4 px-4 font-mono text-sm font-bold text-rose-400">{calc.formatCurrency(calc.EPS_H)}</td>
                      <td className="py-4 px-4 font-mono text-sm">{calc.formatCurrency(calc.bear.P_H)}</td>
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
                            <span className="block text-[10px] text-emerald-400/80 font-mono">E3 = 0% ({language === "EN" ? "Current P/E" : "P/E Actual"})</span>
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
                      <td className="py-4 px-4 font-mono text-sm font-bold text-emerald-400">
                        {calc.base.contribE3 >= 0 ? "+" : ""}{calc.base.contribE3.toFixed(1)}%
                      </td>
                      <td className="py-4 px-4 font-mono text-sm font-bold text-emerald-400">{calc.formatCurrency(calc.EPS_H)}</td>
                      <td className="py-4 px-4 font-mono text-sm font-bold text-emerald-400">{calc.formatCurrency(calc.base.P_H)}</td>
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
                            <span className="block text-[10px] text-blue-400 font-mono">{language === "EN" ? "Mean Reversion to AVG P/E" : "Retorno a AVG P/E"}</span>
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
                      <td className="py-4 px-4 font-mono text-sm font-bold text-emerald-400">{calc.formatCurrency(calc.EPS_H)}</td>
                      <td className="py-4 px-4 font-mono text-sm">{calc.formatCurrency(calc.bull.P_H)}</td>
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
                {language === "EN" ? "Model Formula: Total Return = EPS Growth + Shareholder Yield + Multiple Expansion" : "Fórmula: Retorno Total = Crecimiento EPS + Retorno Accionista + Expansión Múltiplo"}
              </span>
              <span className="font-mono text-slate-500">Bogle Model Engine</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
