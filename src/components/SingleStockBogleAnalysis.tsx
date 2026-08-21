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
  const [peExitBearOverride, setPeExitBearOverride] = useState<number | null>(null);
  const [peExitBaseOverride, setPeExitBaseOverride] = useState<number | null>(null);
  const [peExitBullOverride, setPeExitBullOverride] = useState<number | null>(null);
  const [applyNetDebtAdjustment, setApplyNetDebtAdjustment] = useState<boolean>(true);
  const [showSettings, setShowSettings] = useState<boolean>(false);

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
            body: JSON.stringify({ tickers: [ticker] })
          })
        ]);

        const stockData = stockRes.ok ? await stockRes.json() : null;
        const fins = finRes.ok ? await finRes.json() : {};
        const finData = fins[ticker] || null;

        if (stockData) {
          const price = stockData.price || 100;
          const trailingEps = stockData.trailingEps ?? (stockData.eps || 4.0);
          const forwardEps = stockData.forwardEps ?? (trailingEps * 1.1);
          const peTrailing = stockData.pe ?? (trailingEps > 0 ? price / trailingEps : 24);
          const peForward = stockData.forwardPE ?? (forwardEps > 0 ? price / forwardEps : 20);
          const divYield = stockData.dividendYield ? (stockData.dividendYield > 1 ? stockData.dividendYield : stockData.dividendYield * 100) : 0;
          
          // Calculate historical metrics from financials
          let epsCagr = 12.0;
          let buybackYield = 1.0;
          
          if (finData?.annual && finData.annual.length >= 2) {
            const sorted = [...finData.annual].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
            
            // Basic EPS CAGR
            const valid = sorted.map((c, i) => ({ val: c.basicEPS ?? c.dilutedEPS, idx: i })).filter(x => typeof x.val === "number" && x.val > 0);
            if (valid.length >= 2) {
              const latest = valid[0];
              const oldest = valid[valid.length - 1];
              const n = oldest.idx - latest.idx;
              if (n > 0) {
                epsCagr = (Math.pow(latest.val / oldest.val, 1 / n) - 1) * 100;
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
              netIncome: stockData.netIncome || 5000000000
            });
            
            // Reset overrides when changing ticker
            setModelCagrOverride(null);
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

    // 1. ENGINE 1 — EPS CAGR
    const EPS_CAGR_hist = basicEpsCagrAnnual ?? 12.0;
    const EPS_CAGR_fwd_1Y = ((EPS_fwd / EPS_TTM) - 1) * 100;

    let defaultModelCagr = (EPS_CAGR_hist + EPS_CAGR_fwd_1Y) / 2;
    if (EPS_CAGR_hist > 50) {
      defaultModelCagr = Math.min(35, (EPS_CAGR_fwd_1Y * 0.7 + 20));
    } else if (EPS_CAGR_hist > 30) {
      defaultModelCagr = (EPS_CAGR_hist * 0.4 + EPS_CAGR_fwd_1Y * 0.6);
    }
    const EPS_CAGR_modelo = modelCagrOverride !== null ? modelCagrOverride : Number(defaultModelCagr.toFixed(1));

    const H = horizonYears;
    const EPS_H = EPS_TTM * Math.pow(1 + EPS_CAGR_modelo / 100, H);
    const contribE1 = EPS_CAGR_modelo;

    // 2. ENGINE 2 — Shareholder Yield
    const SY = SY_raw ?? (DY + (BBY || 0));
    const contribE2 = SY;

    // 3. ENGINE 3 — P/E Multiple Change & Scenarios
    const defaultPeExitBase = Number(PE0.toFixed(1));
    const defaultPeExitBull = Number((defaultPeExitBase * 1.05).toFixed(1));
    const defaultPeExitBear = Math.max(8, Number((PE0 * 0.80).toFixed(1)));

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
      const P_H = EPS_H * peExit;
      const retorno_precio_anual = (Math.pow(P_H / P0, 1 / H) - 1) * 100;
      const contribE3 = retorno_precio_anual - contribE1;
      const retorno_total = retorno_precio_anual + SY;

      const P_star = P_H / Math.pow(1 + r, H);
      const P_star_ajustado = (applyNetDebtAdjustment && isNetDebtMaterial) ? P_star - netDebtPerShare : P_star;
      const upside = ((P_star_ajustado - P0) / P0) * 100;

      return { peExit, P_H, retorno_precio_anual, contribE3, retorno_total, P_star, P_star_ajustado, upside };
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
      formatCurrency, formatPct
    };
  }, [stockMetrics, horizonYears, hurdleRate, modelCagrOverride, peExitBearOverride, peExitBaseOverride, peExitBullOverride, applyNetDebtAdjustment]);

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
      {/* Settings Panel */}
      <div className={`border rounded-2xl overflow-hidden transition-all duration-300 ${theme === "light" ? "border-slate-200 bg-white" : "border-slate-800 bg-slate-900/50"}`}>
        <button 
          onClick={() => setShowSettings(!showSettings)}
          className="w-full flex items-center justify-between p-4 cursor-pointer hover:bg-black/5"
        >
          <div className="flex items-center gap-2">
            <Settings2 size={16} className="text-emerald-500" />
            <span className="font-bold text-sm">{language === "EN" ? "Model Assumptions & Adjustments" : "Parámetros y Ajustes del Modelo"}</span>
          </div>
          {showSettings ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showSettings && (
          <div className={`p-5 border-t grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 ${theme === "light" ? "border-slate-200 bg-slate-50" : "border-slate-800 bg-slate-950"}`}>
            {/* H & R */}
            <div className="space-y-3">
              <label className="text-xs font-mono text-slate-500 block">
                {language === "EN" ? "Horizon & Hurdle Rate" : "Horizonte y Tasa de Retorno"}
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs w-12">{language === "EN" ? "Years" : "Años"}</span>
                <input 
                  type="range" min="1" max="15" step="1" 
                  value={horizonYears} onChange={e => setHorizonYears(Number(e.target.value))}
                  className="flex-1 accent-emerald-500"
                />
                <span className="text-xs font-bold w-6">{horizonYears}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs w-12">Hurdle</span>
                <input 
                  type="range" min="5" max="25" step="0.5" 
                  value={hurdleRate} onChange={e => setHurdleRate(Number(e.target.value))}
                  className="flex-1 accent-emerald-500"
                />
                <span className="text-xs font-bold w-8">{hurdleRate}%</span>
              </div>
            </div>

            {/* EPS CAGR */}
            <div className="space-y-3">
              <label className="text-xs font-mono text-slate-500 block">
                {language === "EN" ? "EPS CAGR (Engine 1)" : "EPS CAGR (Motor 1)"}
              </label>
              <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  value={calc.EPS_CAGR_modelo} 
                  onChange={e => setModelCagrOverride(Number(e.target.value))}
                  className="w-20 bg-transparent border-b border-slate-700 text-sm font-mono focus:outline-none focus:border-emerald-500 py-1"
                />
                <span className="text-xs text-slate-400">%</span>
                <button 
                  onClick={() => setModelCagrOverride(null)}
                  className="ml-auto text-[10px] text-emerald-500 hover:text-emerald-400"
                >
                  {language === "EN" ? "Reset" : "Resetear"}
                </button>
              </div>
              <p className="text-[10px] text-slate-500 leading-tight">
                {language === "EN" ? `Base model defaults to ${calc.defaultModelCagr.toFixed(1)}% blending historic (${calc.EPS_CAGR_hist.toFixed(1)}%) & 1Y fwd (${calc.EPS_CAGR_fwd_1Y.toFixed(1)}%).` : `El modelo base usa ${calc.defaultModelCagr.toFixed(1)}% combinando histórico (${calc.EPS_CAGR_hist.toFixed(1)}%) y est. 1Y (${calc.EPS_CAGR_fwd_1Y.toFixed(1)}%).`}
              </p>
            </div>

            {/* Exit P/E */}
            <div className="space-y-3">
              <label className="text-xs font-mono text-slate-500 block">
                {language === "EN" ? "Exit P/E (Engine 3)" : "P/E de Salida (Motor 3)"}
              </label>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="text-[10px] text-red-400 block mb-1">Bear</span>
                  <input 
                    type="number" value={calc.bear.peExit} onChange={e => setPeExitBearOverride(Number(e.target.value))}
                    className="w-full bg-transparent border-b border-slate-700 text-xs font-mono focus:outline-none py-1"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block mb-1">Base</span>
                  <input 
                    type="number" value={calc.base.peExit} onChange={e => setPeExitBaseOverride(Number(e.target.value))}
                    className="w-full bg-transparent border-b border-slate-700 text-xs font-mono focus:outline-none py-1"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-emerald-400 block mb-1">Bull</span>
                  <input 
                    type="number" value={calc.bull.peExit} onChange={e => setPeExitBullOverride(Number(e.target.value))}
                    className="w-full bg-transparent border-b border-slate-700 text-xs font-mono focus:outline-none py-1"
                  />
                </div>
              </div>
              <button 
                onClick={() => { setPeExitBearOverride(null); setPeExitBaseOverride(null); setPeExitBullOverride(null); }}
                className="text-[10px] text-emerald-500 hover:text-emerald-400 w-full text-left"
              >
                {language === "EN" ? "Reset Multiples" : "Resetear Múltiplos"}
              </button>
            </div>

            {/* Debt */}
            <div className="space-y-3">
              <label className="text-xs font-mono text-slate-500 block">
                {language === "EN" ? "Balance Sheet Adjustments" : "Ajustes de Balance"}
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={applyNetDebtAdjustment}
                  onChange={e => setApplyNetDebtAdjustment(e.target.checked)}
                  className="accent-emerald-500"
                />
                <span>{language === "EN" ? "Deduct Net Debt from Fair Value" : "Deducir Deuda Neta del Fair Value"}</span>
              </label>
              {calc.isNetDebtMaterial ? (
                <p className="text-[10px] text-amber-500 leading-tight">
                  {language === "EN" ? `Net debt is material (>5% of market cap). Adjustment: ${calc.formatCurrency(calc.netDebtPerShare)} per share.` : `La deuda neta es material (>5% cap). Ajuste: ${calc.formatCurrency(calc.netDebtPerShare)} por acción.`}
                </p>
              ) : (
                <p className="text-[10px] text-slate-500 leading-tight">
                  {language === "EN" ? "Net debt is immaterial (<5% of market cap). No strict adjustment needed." : "Deuda neta inmaterial (<5% cap). No requiere ajuste estricto."}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

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
                <div className="flex justify-between items-end pb-2">
                  <span className="text-xs text-slate-400">{language === "EN" ? "Forward P/E" : "P/E Forward"}</span>
                  <span className="text-sm font-mono font-bold text-emerald-400">{calc.PE_fwd.toFixed(1)}x</span>
                </div>
              </div>
            </div>

            <div className="mt-8 bg-slate-950/50 p-4 rounded-xl border border-slate-800">
              <div className="text-center">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">
                  {language === "EN" ? "Intrinsic Fair Value (Base Case)" : "Fair Value Intrínseco (Caso Base)"}
                </span>
                <span className={`text-3xl font-black font-mono tracking-tighter ${calc.base.upside > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {calc.formatCurrency(calc.base.P_star_ajustado)}
                </span>
                <div className={`text-xs font-bold mt-2 ${calc.base.upside > 0 ? "text-emerald-500" : "text-rose-500"}`}>
                  {calc.formatPct(calc.base.upside)} {language === "EN" ? "Margin of Safety" : "Margen de Seguridad"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* The 3 Engines Breakdown */}
        <div className="col-span-1 lg:col-span-2 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 h-full">
            
            {/* ENGINE 1 */}
            <div className={`p-5 rounded-2xl border flex flex-col justify-between ${theme === "light" ? "bg-white border-slate-200" : "bg-[#0f111a]/40 border-slate-800"}`}>
              <div>
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400 mb-3">
                  <TrendingUp size={16} />
                </div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Engine 1</h3>
                <h4 className="text-sm font-bold mb-4">{language === "EN" ? "Earnings Growth" : "Crecimiento de EPS"}</h4>
                
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">{language === "EN" ? "Historic CAGR" : "CAGR Histórico"}</span>
                    <span className="font-mono">{calc.EPS_CAGR_hist.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">{language === "EN" ? "Forward 1Y" : "Proyectado 1Y"}</span>
                    <span className="font-mono">{calc.EPS_CAGR_fwd_1Y.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
              
              <div className="pt-4 border-t border-slate-800 flex justify-between items-end">
                <span className="text-[10px] text-slate-500">{language === "EN" ? "Model Contribution" : "Contribución"}</span>
                <span className="text-xl font-black font-mono text-emerald-400">+{calc.contribE1.toFixed(1)}%</span>
              </div>
            </div>

            {/* ENGINE 2 */}
            <div className={`p-5 rounded-2xl border flex flex-col justify-between ${theme === "light" ? "bg-white border-slate-200" : "bg-[#0f111a]/40 border-slate-800"}`}>
              <div>
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 mb-3">
                  <RefreshCw size={16} />
                </div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Engine 2</h3>
                <h4 className="text-sm font-bold mb-4">{language === "EN" ? "Shareholder Yield" : "Retorno al Accionista"}</h4>
                
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">{language === "EN" ? "Dividend Yield" : "Yield de Div."}</span>
                    <span className="font-mono">{calc.DY.toFixed(2)}%</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">{language === "EN" ? "Buyback Yield" : "Yield Recompras"}</span>
                    <span className="font-mono">{calc.BBY.toFixed(2)}%</span>
                  </div>
                </div>
              </div>
              
              <div className="pt-4 border-t border-slate-800 flex justify-between items-end">
                <span className="text-[10px] text-slate-500">{language === "EN" ? "Model Contribution" : "Contribución"}</span>
                <span className="text-xl font-black font-mono text-blue-400">+{calc.contribE2.toFixed(2)}%</span>
              </div>
            </div>

            {/* ENGINE 3 */}
            <div className={`p-5 rounded-2xl border flex flex-col justify-between ${theme === "light" ? "bg-white border-slate-200" : "bg-[#0f111a]/40 border-slate-800"}`}>
              <div>
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400 mb-3">
                  <Scale size={16} />
                </div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Engine 3</h3>
                <h4 className="text-sm font-bold mb-4">{language === "EN" ? "Multiple Expansion" : "Expansión Múltiplo"}</h4>
                
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">{language === "EN" ? "Current P/E" : "P/E Actual"}</span>
                    <span className="font-mono">{calc.PE0.toFixed(1)}x</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">{language === "EN" ? "Exit P/E (Base)" : "P/E Salida (Base)"}</span>
                    <span className="font-mono">{calc.base.peExit.toFixed(1)}x</span>
                  </div>
                </div>
              </div>
              
              <div className="pt-4 border-t border-slate-800 flex justify-between items-end">
                <span className="text-[10px] text-slate-500">{language === "EN" ? "Model Contribution" : "Contribución"}</span>
                <span className={`text-xl font-black font-mono ${calc.base.contribE3 >= 0 ? "text-amber-400" : "text-rose-400"}`}>
                  {calc.formatPct(calc.base.contribE3)}
                </span>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Scenario Analysis Matrix */}
      <div className={`border rounded-2xl p-6 ${theme === "light" ? "bg-white border-slate-200" : "bg-[#0f111a]/40 border-slate-800/80"}`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div>
            <h3 className="text-lg font-black tracking-tight flex items-center gap-2 mb-1">
              <BarChart3 size={16} className="text-emerald-400" />
              {language === "EN" ? "3-SCENARIOS VALUATION & RETURN MATRIX" : "MATRIZ DE VALORACIÓN Y RETORNO (3 ESCENARIOS)"}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {language === "EN" 
                ? `Projected performance over ${calc.H} years combining Engine 1 (${calc.contribE1.toFixed(1)}%) + Engine 2 (${calc.contribE2.toFixed(2)}%) + Engine 3.`
                : `Rendimiento proyectado a ${calc.H} años combinando Motor 1 (${calc.contribE1.toFixed(1)}%) + Motor 2 (${calc.contribE2.toFixed(2)}%) + Motor 3.`}
            </p>
          </div>

          <div className="flex items-center gap-3 font-mono text-xs text-slate-400 bg-slate-950/80 px-3.5 py-1.5 rounded-xl border border-slate-800/80 self-start sm:self-auto flex-wrap">
            <span>{language === "EN" ? "Target IRR" : "Tasa Desc."}: <strong className="text-white">{calc.r * 100}%</strong></span>
            <span>•</span>
            <span>Horizon: <strong className="text-white">{calc.H} yr</strong></span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="pb-3 px-4 font-bold text-xs uppercase tracking-wider text-slate-500 w-1/5">{language === "EN" ? "Scenario" : "Escenario"}</th>
                <th className="pb-3 px-4 font-bold text-xs uppercase tracking-wider text-slate-500 w-1/5">{language === "EN" ? "Exit P/E" : "P/E Salida"}</th>
                <th className="pb-3 px-4 font-bold text-xs uppercase tracking-wider text-slate-500 w-1/5">{language === "EN" ? "Total Annual Rtn" : "Retorno Anual"}</th>
                <th className="pb-3 px-4 font-bold text-xs uppercase tracking-wider text-slate-500 w-1/5">{language === "EN" ? "Target Price" : "Precio Objetivo"}</th>
                <th className="pb-3 px-4 font-bold text-xs uppercase tracking-wider text-slate-500 text-right w-1/5">Margin of Safety</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {/* Bear */}
              <tr className="hover:bg-white/5 transition-colors group">
                <td className="py-4 px-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                    <span className="font-bold text-sm">Bear</span>
                  </div>
                </td>
                <td className="py-4 px-4 font-mono text-sm">{calc.bear.peExit.toFixed(1)}x</td>
                <td className="py-4 px-4 font-mono text-sm font-bold text-rose-400">{calc.formatPct(calc.bear.retorno_total)}</td>
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
                    <span className="font-bold text-sm text-emerald-400">Base</span>
                  </div>
                </td>
                <td className="py-4 px-4 font-mono text-sm font-bold">{calc.base.peExit.toFixed(1)}x</td>
                <td className="py-4 px-4 font-mono text-sm font-bold text-emerald-400">{calc.formatPct(calc.base.retorno_total)}</td>
                <td className="py-4 px-4 font-mono text-sm font-bold">{calc.formatCurrency(calc.base.P_star_ajustado)}</td>
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
                    <span className="font-bold text-sm">Bull</span>
                  </div>
                </td>
                <td className="py-4 px-4 font-mono text-sm">{calc.bull.peExit.toFixed(1)}x</td>
                <td className="py-4 px-4 font-mono text-sm font-bold text-emerald-400">{calc.formatPct(calc.bull.retorno_total)}</td>
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

      {/* Projection Chart */}
      <div className={`p-6 rounded-2xl border ${theme === "light" ? "bg-white border-slate-200" : "bg-[#0f111a]/40 border-slate-800/80"}`}>
        <h3 className="text-sm font-bold tracking-tight mb-6">
          {language === "EN" ? `10-Year Price Projection (Engines 1 & 3)` : `Proyección de Precio a 10 Años (Motores 1 y 3)`}
        </h3>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={calc.chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme === "light" ? "#e2e8f0" : "#1e293b"} vertical={false} />
              <XAxis 
                dataKey="year" 
                stroke="#64748b" 
                fontSize={10} 
                tickMargin={10}
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                stroke="#64748b" 
                fontSize={10}
                tickFormatter={(val) => `$${val}`}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: theme === "light" ? "#ffffff" : "#020617", 
                  borderColor: theme === "light" ? "#e2e8f0" : "#1e293b",
                  borderRadius: "12px",
                  fontSize: "12px",
                  fontWeight: "bold",
                  boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)"
                }}
                formatter={(value: any, name: string) => {
                  return [`$${Number(value).toFixed(2)}`, name.charAt(0).toUpperCase() + name.slice(1)];
                }}
              />
              <Line type="monotone" dataKey="bull" stroke="#10b981" strokeWidth={2} strokeDasharray="5 5" dot={false} />
              <Line type="monotone" dataKey="base" stroke="#f59e0b" strokeWidth={3} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="bear" stroke="#f43f5e" strokeWidth={2} strokeDasharray="5 5" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
}
