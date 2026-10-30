import React, { useState, useEffect, useMemo } from "react";
import { buildBogleInputs, computeBogle, defaultHurdle, BogleInputs, EXIT_PE_CAP_BASE } from "../utils/bogleEngine";
import { PortfolioData, Position } from "../types";
import {
  Compass,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShieldAlert,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Copy,
  Check,
  Search,
  Sliders,
  Info,
  BarChart3,
  Layers,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Briefcase,
  Layers as FactorsIcon,
  Percent,
  HelpCircle,
  Zap,
  Activity,
  Flame,
  Award,
  FileSpreadsheet
} from "lucide-react";
import { TICKER_CLASSIFICATION } from "../data/tickerClassification";
import ThreeStatementModel from "./ThreeStatementModel";

interface BogleAnalysisDashboardProps {
  portfolio: PortfolioData;
  language?: "EN" | "ES";
  theme?: "dark" | "light";
}


export default function BogleAnalysisDashboard({
  portfolio,
  language = "ES",
  theme = "dark"
}: BogleAnalysisDashboardProps) {
  // Tabs: 3-Statement Model vs. Single Stock Analysis vs. Portfolio-Wide 3 Engines Rollup
  const [viewMode, setViewMode] = useState<"three-statement" | "single" | "portfolio">("three-statement");

  // Selected Ticker for single analysis
  const initialTicker = portfolio.positions.find(p => !p.isCash)?.ticker || "NVDA";
  const [selectedTicker, setSelectedTicker] = useState<string>(initialTicker);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeScenario, setActiveScenario] = useState<"bear" | "base" | "bull">("base");
  const [loading, setLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  // Datos del valor seleccionado (entradas del motor Bogle compartido)
  const [stockMetrics, setStockMetrics] = useState<BogleInputs | null>(null);

  // Model parameters (Customizable)
  const [horizonYears, setHorizonYears] = useState<number>(5);
  const [hurdleRate, setHurdleRate] = useState<number>(10);
  const [modelCagrOverride, setModelCagrOverride] = useState<number | null>(null);
  const [peExitBearOverride, setPeExitBearOverride] = useState<number | null>(null);
  const [peExitBaseOverride, setPeExitBaseOverride] = useState<number | null>(null);
  const [peExitBullOverride, setPeExitBullOverride] = useState<number | null>(null);

  // Multi-stock cache for portfolio rollup
  const [portfolioMetricsMap, setPortfolioMetricsMap] = useState<Record<string, BogleInputs>>({});
  const [loadingPortfolioMap, setLoadingPortfolioMap] = useState<boolean>(false);

  // Fetch single stock metrics
  useEffect(() => {
    let isMounted = true;
    async function fetchStock() {
      if (!selectedTicker) return;
      setLoading(true);

      try {
        // Fetch quote & summary from server API
        const stockRes = await fetch(`/api/stock/${selectedTicker}`);
        let sData: any = null;
        if (stockRes.ok) {
          sData = await stockRes.json();
        }

        // Estados financieros: BPA diluido histórico, acciones e histórico de PER
        let finData: any = null;
        try {
          const finRes = await fetch("/api/portfolio/financials", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tickers: [selectedTicker] })
          });
          if (finRes.ok) {
            const allFins = await finRes.json();
            finData = allFins[selectedTicker] || null;
          }
        } catch (e) {
          console.warn("Could not load financials for Bogle calculation:", e);
        }

        if (!isMounted) return;

        // Entradas del modelo sin valores de relleno (utils/bogleEngine.ts)
        const inputs = buildBogleInputs(selectedTicker.toUpperCase(), sData, finData);
        setStockMetrics(inputs);
        setModelCagrOverride(null);
        setPeExitBearOverride(null);
        setPeExitBaseOverride(null);
        setPeExitBullOverride(null);
        // Tasa exigida por defecto: coste del capital por CAPM (mínimo 8%)
        setHurdleRate(defaultHurdle(inputs.beta));

      } catch (err) {
        console.error("Error loading stock for Bogle analysis:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchStock();
    return () => {
      isMounted = false;
    };
  }, [selectedTicker]);

  // Load all portfolio holdings for rollup
  useEffect(() => {
    let isMounted = true;
    async function loadPortfolioData() {
      const activePositions = portfolio.positions.filter(p => !p.isCash && p.shares > 0);
      if (activePositions.length === 0) return;

      setLoadingPortfolioMap(true);
      const tickers = activePositions.map(p => p.ticker);

      try {
        // 1. Fetch financials and single stock endpoints in parallel for all holdings
        const [finRes, ...stockResponses] = await Promise.all([
          fetch("/api/portfolio/financials", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tickers })
          }).catch(() => null),
          ...activePositions.map(pos => fetch(`/api/stock/${pos.ticker}`).catch(() => null))
        ]);

        const fins = (finRes && finRes.ok) ? await finRes.json() : {};
        // Si alguna cotización falla (Yahoo o red), se reintenta una vez antes de excluirla.
        const stockDataList = await Promise.all(
          stockResponses.map(async (res, i) => {
            if (res && res.ok) return await res.json().catch(() => null);
            const retry = await fetch(`/api/stock/${activePositions[i].ticker}`).catch(() => null);
            return retry && retry.ok ? await retry.json().catch(() => null) : null;
          })
        );

        const map: Record<string, BogleInputs> = {};
        activePositions.forEach((pos, idx) => {
          const sData = stockDataList[idx];
          const sym = pos.ticker.toUpperCase();
          const finData = fins[pos.ticker] || fins[sym] || fins[pos.ticker.replace(/\./g, "-")] || null;
          const inputs = buildBogleInputs(pos.ticker, sData, finData, pos.price || null);
          if (!inputs.sector) inputs.sector = TICKER_CLASSIFICATION[sym]?.sector || "";
          if (!inputs.industry) inputs.industry = TICKER_CLASSIFICATION[sym]?.subsector || "";
          if (!sData?.name && pos.name) inputs.name = pos.name;
          map[pos.ticker] = inputs;
        });

        if (isMounted) setPortfolioMetricsMap(map);
      } catch (err) {
        console.error("Error loading portfolio metrics for Bogle rollup:", err);
      } finally {
        if (isMounted) setLoadingPortfolioMap(false);
      }
    }

    if (viewMode === "portfolio") {
      loadPortfolioData();
    }
  }, [portfolio, viewMode]);

  // Cálculo individual con el motor compartido
  const calc = useMemo(() => {
    if (!stockMetrics) return null;
    const res = computeBogle(stockMetrics, {
      horizon: horizonYears,
      hurdle: hurdleRate,
      growth: modelCagrOverride,
      peExitBear: peExitBearOverride,
      peExitBase: peExitBaseOverride,
      peExitBull: peExitBullOverride,
    });
    if (!res) return null;
    const m = stockMetrics;
    const PE0 = m.pe0 as number;
    const contribE1 = res.g;
    const contribE2 = res.DY;
    const netDebt = (m.totalDebt ?? 0) - (m.totalCash ?? 0);

    // Veredicto por TIR frente a la tasa exigida (equivale a valor justo vs. precio)
    let verdict: "UNDERVALUED" | "FAIRLY VALUED" | "OVERVALUED" = "FAIRLY VALUED";
    if (res.base.retorno_total >= hurdleRate + 3) verdict = "UNDERVALUED";
    else if (res.base.retorno_total < hurdleRate - 2) verdict = "OVERVALUED";
    const robustThesis = contribE1 + contribE2 >= hurdleRate;

    const normalized = m.growthNotes.some(n => n.includes("recorte") || n.includes("tope") || n.includes("descartado"));
    const flags = [
      {
        id: "eps_growth_normalized",
        condition: normalized,
        type: "warning",
        label: language === "EN" ? "EPS growth normalized" : "Crecimiento del BPA normalizado",
        desc: m.growthNotes.join(" · ")
      },
      {
        id: "payout_ratio",
        condition: m.payoutRatio !== null && m.payoutRatio > 80,
        type: "warning",
        label: language === "EN" ? "High Payout Ratio (>80%)" : "Payout Ratio Elevado (>80%)",
        desc: language === "EN" ? "Dividend capacity may be constrained; monitor cash coverage." : "Capacidad de dividendo ajustada; vigilar la cobertura con caja."
      },
      {
        id: "high_leverage",
        condition: m.debtToEquity !== null && m.debtToEquity > 2.0 && m.marketCap !== null && m.marketCap > 0 && netDebt / m.marketCap > 0.15,
        type: "warning",
        label: language === "EN" ? "High Financial Leverage" : "Apalancamiento Elevado",
        desc: language === "EN" ? "Net debt > 15% of market cap and Debt/Equity > 2x: equity returns are more volatile." : "Deuda neta > 15% de la capitalización y Deuda/Patrimonio > 2x: el retorno del accionista es más volátil."
      },
      {
        id: "value_trap",
        condition: PE0 < 15 && m.debtToEquity !== null && m.debtToEquity > 1.5,
        type: "warning",
        label: language === "EN" ? "Potential Value Trap" : "Posible Trampa de Valor",
        desc: language === "EN" ? "Low P/E coupled with substantial debt load. Verify FCF stability." : "Múltiplo bajo acompañado de deuda sustancial. Verificar estabilidad de FCF."
      },
      {
        id: "fcf_quality",
        condition: m.freeCashFlow !== null && m.netIncome !== null && m.netIncome > 0 && m.freeCashFlow < m.netIncome * 0.7,
        type: "warning",
        label: language === "EN" ? "Earnings Quality Flag" : "Alerta Calidad de Beneficios",
        desc: language === "EN" ? "Free Cash Flow lags GAAP Net Income. Working capital or CapEx drag." : "El Free Cash Flow es inferior al Beneficio Neto. Revisar intensidad de CapEx."
      },
      {
        id: "peg_undervalued",
        condition: m.pegRatio !== null && m.pegRatio > 0 && m.pegRatio < 1.0,
        type: "positive",
        label: language === "EN" ? "Attractive PEG Ratio (< 1.0)" : "PEG Ratio Atractivo (< 1.0)",
        desc: language === "EN" ? "Growth-adjusted valuation provides margin of safety for Engine 3." : "Valoración ajustada por crecimiento ofrece margen de seguridad para el Motor 3."
      },
      {
        id: "piotroski_strength",
        condition: m.piotroskiScore !== null && m.piotroskiScore >= 8,
        type: "positive",
        label: language === "EN" ? "Elite Financial Health (F-Score 8-9)" : "Salud Financiera Élite (F-Score 8-9)",
        desc: language === "EN" ? "Top-tier operational efficiency and balance sheet resilience." : "Máxima resiliencia de balance y rentabilidad operativa."
      },
      {
        id: "high_beta",
        condition: m.beta !== null && m.beta > 1.5,
        type: "warning",
        label: language === "EN" ? `High Volatility Beta (${(m.beta ?? 0).toFixed(2)})` : `Beta de Alta Volatilidad (${(m.beta ?? 0).toFixed(2)})`,
        desc: language === "EN" ? `Default hurdle already uses the CAPM cost of equity (${defaultHurdle(m.beta)}%).` : `La tasa exigida por defecto ya usa el coste del capital por CAPM (${defaultHurdle(m.beta)}%).`
      }
    ].filter(f => f.condition);

    return {
      P0: m.price as number,
      EPS_TTM: m.epsTTM as number,
      EPS_fwd: m.epsFwd,
      PE0,
      PE_fwd: m.peFwd,
      EPS_CAGR_hist: m.epsCagrHist,
      EPS_CAGR_fwd_1Y: m.epsGrowthFwd1Y,
      EPS_CAGR_modelo: res.g,
      EPS_H: res.base.EPS_H,
      contribE1,
      SY: res.DY,
      DY: m.dividendYield,
      BBY: m.buybackYield,
      contribE2,
      PE_avg10Y: m.peMedianHist ?? PE0,
      PE_min10Y: res.defaults.bear,
      avgPe: m.peMedianHist ?? PE0,
      peHistory: m.peHistory || [],
      peExitBear: res.bear.peExit,
      peExitBase: res.base.peExit,
      peExitBull: res.bull.peExit,
      netDebt,
      r: res.r,
      H: res.H,
      bear: res.bear,
      base: res.base,
      bull: res.bull,
      verdict,
      robustThesis,
      flags,
      growthNotes: m.growthNotes
    };
  }, [stockMetrics, horizonYears, hurdleRate, modelCagrOverride, peExitBearOverride, peExitBaseOverride, peExitBullOverride, language]);

  // Agregado de cartera: mismo motor y mismos criterios por posición (sin datos → se excluye)
  const portfolioRollup = useMemo(() => {
    const activePositions = portfolio.positions.filter(p => !p.isCash && p.shares > 0);
    const excluded: { ticker: string; reason: string }[] = [];

    const computed = activePositions.map(pos => {
      const m = portfolioMetricsMap[pos.ticker];
      const mktVal = pos.mktValue || (pos.shares * (pos.price || pos.avgCost));
      if (!m) return null;
      const res = computeBogle(m, { horizon: 5, hurdle: defaultHurdle(m.beta) });
      if (!res) {
        excluded.push({ ticker: pos.ticker, reason: m.issues.join(", ") || "sin datos" });
        return null;
      }
      const sc = (x: typeof res.base) => ({ e3: x.contribE3, totalReturn: x.retorno_total, fairValue: x.P_star, upside: x.upside });
      return {
        ticker: pos.ticker,
        name: m.name,
        mktVal,
        weight: 0,
        e1: res.g,
        rawE1: m.epsCagrHist ?? res.g,
        isE1Capped: m.growthNotes.some(n => n.includes("recorte") || n.includes("tope") || n.includes("descartado")),
        growthNotes: m.growthNotes,
        hurdle: res.r * 100,
        e2: res.DY,
        avgPe: m.peMedianHist ?? (m.pe0 as number),
        peTrailing: Number((m.pe0 as number).toFixed(1)),
        peHistory: m.peHistory || [],
        scenarios: { bear: sc(res.bear), base: sc(res.base), bull: sc(res.bull) }
      };
    });
    const rows = computed.filter((r): r is NonNullable<typeof r> => r !== null);
    const totalInvested = rows.reduce((acc, r) => acc + r.mktVal, 0) || 1;
    rows.forEach(r => { r.weight = (r.mktVal / totalInvested) * 100; });

    const wavg = (f: (r: typeof rows[number]) => number) => rows.reduce((acc, r) => acc + (r.weight / 100) * f(r), 0);
    const scen = (k: "bear" | "base" | "bull") => ({
      e3: wavg(r => r.scenarios[k].e3),
      totalReturn: wavg(r => r.scenarios[k].totalReturn),
      upside: wavg(r => r.scenarios[k].upside),
    });

    return {
      totalInvested,
      weightedE1: wavg(r => r.e1),
      weightedE2: wavg(r => r.e2),
      weightedAvgPe: wavg(r => r.avgPe),
      weightedCurrentPe: wavg(r => r.peTrailing),
      weightedScenarios: { bear: scen("bear"), base: scen("base"), bull: scen("bull") },
      hasCappedHoldings: rows.some(r => r.isE1Capped),
      rows,
      excluded
    };
  }, [portfolio, portfolioMetricsMap]);

  // Formatted ASCII / Text standard output table from Section 6
  const standardTextOutput = useMemo(() => {
    if (!calc || !stockMetrics) return "";

    const dateStr = new Date().toLocaleDateString(language === "EN" ? "en-US" : "es-ES", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });

    const pct = (v: number | null | undefined, d = 1) => (typeof v === "number" && Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${v.toFixed(d)}%` : "—");
    const m = stockMetrics;
    return `ANÁLISIS BOGLE (3 MOTORES DE RETORNO) — ${m.symbol}
Precio Actual: $${calc.P0.toFixed(2)}  |  Fecha: ${dateStr}  |  Horizonte: ${calc.H} años  |  Tasa exigida: ${(calc.r * 100).toFixed(1)}%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INPUTS (investiando.app)
  BPA últimos 12 meses (contable): $${calc.EPS_TTM.toFixed(2)}
  BPA consenso próximo ejercicio:  ${calc.EPS_fwd !== null ? `$${calc.EPS_fwd.toFixed(2)}` : "—"}
  PER actual (precio / BPA TTM):    ${calc.PE0.toFixed(1)}×
  PER forward:                      ${calc.PE_fwd !== null ? `${calc.PE_fwd.toFixed(1)}×` : "—"}
  PER mediano histórico:            ${m.peMedianHist !== null ? `${m.peMedianHist.toFixed(1)}×` : "— (sin histórico)"}
  Beta (5Y):                        ${m.beta !== null ? m.beta.toFixed(2) : "—"}

MOTOR 1 — CRECIMIENTO DEL BPA
  Histórico (BPA diluido):          ${pct(calc.EPS_CAGR_hist)} / año
  Consenso a 1 año:                 ${pct(calc.EPS_CAGR_fwd_1Y)}
  Crecimiento del modelo:           ${pct(calc.EPS_CAGR_modelo)} / año
    ${calc.growthNotes.join("\n    ")}
  BPA proyectado (año ${calc.H}):        $${calc.EPS_H.toFixed(2)}

MOTOR 2 — DIVIDENDO
  Rentabilidad por dividendo:       ${calc.DY.toFixed(2)}% (crece con el BPA)
  Recompras:                        ${(calc.BBY || 0).toFixed(2)}% / año (ya incluidas en el BPA por acción; no se suman)

MOTOR 3 — CAMBIO DEL PER
                          Bajista         Base          Alcista
  PER de salida:           ${calc.bear.peExit.toFixed(1)}×           ${calc.base.peExit.toFixed(1)}×          ${calc.bull.peExit.toFixed(1)}×
  Precio año ${calc.H}:            $${calc.bear.P_H.toFixed(1)}        $${calc.base.P_H.toFixed(1)}       $${calc.bull.P_H.toFixed(1)}
  Motor 3 (anual):        ${pct(calc.bear.contribE3)}          ${pct(calc.base.contribE3)}         ${pct(calc.bull.contribE3)}

RETORNO TOTAL (TIR con dividendos y venta al final)
                         Bajista         Base          Alcista
  TIR:                    ${pct(calc.bear.retorno_total)}          ${pct(calc.base.retorno_total)}         ${pct(calc.bull.retorno_total)}
  Valor justo:           $${calc.bear.P_star.toFixed(1)}        $${calc.base.P_star.toFixed(1)}       $${calc.bull.P_star.toFixed(1)}
  vs. precio:            ${pct(calc.bear.upside)}         ${pct(calc.base.upside)}        ${pct(calc.bull.upside)}

VEREDICTO (tasa exigida ${(calc.r * 100).toFixed(1)}%)
  Escenario base: TIR ${pct(calc.base.retorno_total)} → [${calc.verdict}]
  Tesis robusta sin el Motor 3 (M1 + M2 = ${(calc.contribE1 + calc.contribE2).toFixed(1)}%): [${calc.robustThesis ? "SÍ" : "NO"}]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
No constituye asesoría de inversión.`;
  }, [calc, stockMetrics, language]);

  const handleCopyReport = () => {
    if (!standardTextOutput) return;
    navigator.clipboard.writeText(standardTextOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-6 w-full max-w-[1580px] mx-auto pb-12">
      {/* Top Banner Header */}
      <div className="bg-[#0f111a]/70 border border-slate-900/60 p-6 sm:p-8 rounded-3xl flex flex-col md:flex-row md:items-center md:justify-between gap-6 shadow-xl backdrop-blur-md relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-500/20 via-emerald-500/70 to-emerald-500/20" />
        
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono font-bold uppercase tracking-wider">
            <Compass size={16} className="animate-spin-slow" />
            <span>{language === "EN" ? "JOHN BOGLE VALUATION FRAMEWORK" : "FRAMEWORK DE VALORACIÓN JOHN BOGLE"}</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-display font-extrabold text-white tracking-wide flex items-center gap-3">
            {language === "EN" ? "The 3 Engines of Return Analysis" : "Análisis de los 3 Motores de Retorno"}
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 max-w-2xl">
            {language === "EN" 
              ? "Decompose long-term expected returns into EPS growth (buybacks included), dividend yield and speculative multiple repricing (Δ P/E). Total return is the IRR of the investment."
              : "Descompone el retorno esperado a largo plazo en crecimiento del BPA (incluye recompras), rentabilidad por dividendo y cambio especulativo del múltiplo (Δ PER). El retorno total es la TIR de la inversión."}
          </p>
        </div>

        {/* View Mode Switcher: 3-Statement vs. Single Stock Bogle vs. Portfolio Rollup */}
        <div className="flex items-center flex-wrap bg-[#0f111a]/90 backdrop-blur-md p-1.5 rounded-2xl border border-slate-800/90 shadow-lg shrink-0 self-start md:self-center gap-1">
          <button
            onClick={() => setViewMode("three-statement")}
            className={`px-3.5 py-2 rounded-xl text-xs uppercase tracking-wider transition-all duration-200 flex items-center gap-2 cursor-pointer border ${
              viewMode === "three-statement"
                ? "bg-emerald-500 text-slate-950 border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.35)] font-extrabold"
                : "text-slate-400 border-transparent hover:text-white hover:bg-slate-800/80 font-bold"
            }`}
          >
            <FileSpreadsheet size={14} />
            <span>{language === "EN" ? "3-Statement & DCF Model" : "Modelo 3 Estados & DCF"}</span>
          </button>
          <button
            onClick={() => setViewMode("single")}
            className={`px-3.5 py-2 rounded-xl text-xs uppercase tracking-wider transition-all duration-200 flex items-center gap-2 cursor-pointer border ${
              viewMode === "single"
                ? "bg-white text-slate-950 border-white shadow-[0_0_20px_rgba(255,255,255,0.22)] font-extrabold"
                : "text-slate-400 border-transparent hover:text-white hover:bg-slate-800/80 font-bold"
            }`}
          >
            <BarChart3 size={14} />
            <span>{language === "EN" ? "Bogle 3 Engines" : "Motores de Bogle"}</span>
          </button>
          <button
            onClick={() => setViewMode("portfolio")}
            className={`px-3.5 py-2 rounded-xl text-xs uppercase tracking-wider transition-all duration-200 flex items-center gap-2 cursor-pointer border ${
              viewMode === "portfolio"
                ? "bg-white text-slate-950 border-white shadow-[0_0_20px_rgba(255,255,255,0.22)] font-extrabold"
                : "text-slate-400 border-transparent hover:text-white hover:bg-slate-800/80 font-bold"
            }`}
          >
            <Layers size={14} />
            <span>{language === "EN" ? "Portfolio Rollup" : "Agregado Portafolio"}</span>
          </button>
        </div>
      </div>

      {/* ========================================================
          VIEW 0: 3-STATEMENT MODEL & DCF VALUATION (INTEGRATED)
          ======================================================== */}
      {viewMode === "three-statement" && (
        <ThreeStatementModel
          portfolioTickers={portfolio.positions.filter(p => !p.isCash).map(p => p.ticker)}
          initialTicker={selectedTicker}
          language={language}
          theme={theme}
        />
      )}

      {/* ========================================================
          VIEW 1: SINGLE STOCK DEEP DIVE (BOGLE)
          ======================================================== */}
      {viewMode === "single" && (
        <div className="space-y-6">
          {/* Ticker Selector Bar & Quick Presets */}
          <div className="bg-[#0f111a]/40 border border-slate-900/50 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4 backdrop-blur-sm shadow-md">
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400">
                {language === "EN" ? "SELECT TICKER:" : "SELECCIONAR ACCIÓN:"}
              </span>

              {/* Portfolio Holdings Chips */}
              <div className="flex flex-wrap gap-1.5">
                {portfolio.positions.filter(p => !p.isCash).map(pos => (
                  <button
                    key={pos.ticker}
                    onClick={() => setSelectedTicker(pos.ticker)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer border ${
                      selectedTicker === pos.ticker
                        ? "bg-emerald-500 text-slate-950 border-emerald-400 shadow-md"
                        : "bg-slate-950/60 text-slate-300 border-slate-800 hover:border-slate-700 hover:text-white"
                    }`}
                  >
                    {pos.ticker}
                  </button>
                ))}
              </div>

              {/* Verified Examples (NVDA / MA / AAPL) */}
              <div className="hidden lg:flex items-center gap-1.5 pl-2 border-l border-slate-800 text-[11px]">
                <span className="text-slate-500 text-[10px] uppercase font-mono">{language === "EN" ? "Benchmarks:" : "Ejemplos:"}</span>
                {["NVDA", "MA", "AAPL", "MSFT"].map(tkr => (
                  <button
                    key={tkr}
                    onClick={() => setSelectedTicker(tkr)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold cursor-pointer transition-colors ${
                      selectedTicker === tkr ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {tkr}
                  </button>
                ))}
              </div>
            </div>

            {/* Direct Ticker Search Input */}
          </div>

          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
              <RefreshCw size={24} className="animate-spin text-emerald-400" />
              <span className="text-xs font-mono">{language === "EN" ? "Computing 3 Engines of Return & Financials..." : "Calculando los 3 Motores de Retorno y Estados Financieros..."}</span>
            </div>
          ) : stockMetrics && !calc ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-center text-slate-400">
              <Info size={22} className="text-amber-400" />
              <span className="text-sm font-bold text-slate-200">
                {language === "EN" ? "The 3 Engines model cannot be computed for" : "El modelo de los 3 motores no se puede calcular para"} {stockMetrics.symbol}
              </span>
              <span className="text-xs font-mono">{stockMetrics.issues.join(" · ")}</span>
              <span className="text-[11px] text-slate-500 max-w-md">
                {language === "EN" ? "It needs a price and positive trailing EPS. No placeholder values are used." : "Necesita precio y un BPA positivo de los últimos 12 meses. No se usan valores de relleno."}
              </span>
            </div>
          ) : calc && stockMetrics ? (
            <div className="space-y-6">
              
              {/* Scenario Toggle */}
              <div className="flex items-center justify-end">
                <div className="flex bg-[#0f111a]/80 border border-slate-800 rounded-xl p-1 shadow-inner backdrop-blur-sm">
                  {(["bear", "base", "bull"] as const).map((scenario) => (
                    <button
                      key={scenario}
                      onClick={() => setActiveScenario(scenario)}
                      className={`px-4 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                        activeScenario === scenario
                          ? scenario === "bear" ? "bg-rose-500/20 text-rose-400 border border-rose-500/30 shadow-sm"
                            : scenario === "bull" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-sm"
                            : "bg-slate-700 text-white border border-slate-600 shadow-sm"
                          : "text-slate-500 hover:text-slate-300 border border-transparent"
                      }`}
                    >
                      {scenario === "bear" ? (language === "EN" ? "Bearish" : "Bajista")
                        : scenario === "bull" ? (language === "EN" ? "Bullish" : "Alcista")
                        : "Base"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Top KPI Cards: The 3 Engines Summary */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                
                {/* Engine 1 Card */}
                <div className="bg-[#0f111a]/60 border border-slate-900/60 p-5 rounded-2xl backdrop-blur-sm relative overflow-hidden group hover:border-emerald-500/30 transition-all">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <TrendingUp size={14} />
                      {language === "EN" ? "ENGINE 1 · INVESTMENT" : "MOTOR 1 · CRECIMIENTO"}
                    </span>
                    <span className="font-mono text-[10px] bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-slate-400">
                      EPS CAGR
                    </span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-mono font-extrabold text-white">
                    {calc.contribE1 >= 0 ? "+" : ""}{calc.contribE1.toFixed(1)}%
                    <span className="text-xs font-sans font-medium text-slate-400 ml-1.5">{language === "EN" ? "/ yr" : "/ año"}</span>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between border-t border-slate-800/60 pt-2 font-mono">
                    <span>{language === "EN" ? `EPS ${calc.H}Y Projection:` : `EPS Proyectado ${calc.H}A:`}</span>
                    <span className="text-emerald-400 font-bold">${calc.EPS_H.toFixed(2)}</span>
                  </div>
                </div>

                {/* Engine 2 Card */}
                <div className="bg-[#0f111a]/60 border border-slate-900/60 p-5 rounded-2xl backdrop-blur-sm relative overflow-hidden group hover:border-emerald-500/30 transition-all">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                    <span className="flex items-center gap-1.5 text-blue-400">
                      <DollarSign size={14} />
                      {language === "EN" ? "ENGINE 2 · DIVIDEND" : "MOTOR 2 · DIVIDENDO"}
                    </span>
                    <span className="font-mono text-[10px] bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-slate-400">
                      DIV
                    </span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-mono font-extrabold text-white">
                    {calc.contribE2 >= 0 ? "+" : ""}{calc.contribE2.toFixed(2)}%
                    <span className="text-xs font-sans font-medium text-slate-400 ml-1.5">{language === "EN" ? "/ yr" : "/ año"}</span>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between border-t border-slate-800/60 pt-2 font-mono">
                    <span title={language === "EN" ? "Buybacks raise EPS per share: already in Engine 1" : "Las recompras suben el BPA por acción: ya están en el Motor 1"} className="cursor-help">{language === "EN" ? "Buybacks (in EPS):" : "Recompras (en el BPA):"}</span>
                    <span className="text-blue-400 font-bold">{(calc.BBY || 0).toFixed(1)}%</span>
                  </div>
                </div>

                {/* Engine 3 Card (Dynamic Scenario) */}
                <div className={`bg-[#0f111a]/60 border ${
                  activeScenario === "bear" ? "border-rose-900/60 hover:border-rose-500/30" : 
                  activeScenario === "bull" ? "border-emerald-900/60 hover:border-emerald-500/30" : 
                  "border-slate-900/60 hover:border-slate-500/30"
                } p-5 rounded-2xl backdrop-blur-sm relative overflow-hidden group transition-all`}>
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                    <span className="flex items-center gap-1.5 text-purple-400">
                      <Activity size={14} />
                      {language === "EN" ? "ENGINE 3 · SPECULATIVE" : "MOTOR 3 · MÚLTIPLO"}
                    </span>
                    <span className="font-mono text-[10px] bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-slate-400">
                      Δ P/E ({activeScenario.toUpperCase()})
                    </span>
                  </div>
                  <div className={`text-2xl sm:text-3xl font-mono font-extrabold ${calc[activeScenario].contribE3 >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {calc[activeScenario].contribE3 >= 0 ? "+" : ""}{calc[activeScenario].contribE3.toFixed(1)}%
                    <span className="text-xs font-sans font-medium text-slate-400 ml-1.5">{language === "EN" ? "/ yr" : "/ año"}</span>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between border-t border-slate-800/60 pt-2 font-mono">
                    <span>{language === "EN" ? "P/E Trailing → Exit:" : "P/E Trailing → Salida:"}</span>
                    <span className="text-purple-300 font-bold">{calc.PE0.toFixed(1)}× → {calc[activeScenario].peExit.toFixed(1)}×</span>
                  </div>
                </div>

                {/* Total Expected Return Card */}
                <div className={`bg-[#0f111a]/90 border ${
                  activeScenario === "bear" ? "border-rose-500/40 shadow-rose-950/20" : 
                  activeScenario === "bull" ? "border-emerald-500/40 shadow-emerald-950/20" : 
                  "border-slate-500/40 shadow-slate-950/20"
                } p-5 rounded-2xl backdrop-blur-sm relative overflow-hidden shadow-lg`}>
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                    <span className={`flex items-center gap-1.5 ${
                      activeScenario === "bear" ? "text-rose-300" : 
                      activeScenario === "bull" ? "text-emerald-300" : 
                      "text-slate-300"
                    }`}>
                      <Zap size={14} />
                      {language === "EN" ? "TOTAL EXPECTED RETURN" : "RETORNO TOTAL ESPERADO"}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                      calc[activeScenario].retorno_total >= calc.r * 100 + 3 ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40" :
                      calc[activeScenario].retorno_total < calc.r * 100 - 2 ? "bg-rose-500/20 text-rose-400 border border-rose-500/40" :
                      "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    }`}>
                      {calc[activeScenario].retorno_total >= calc.r * 100 + 3 ? "UNDERVALUED" :
                       calc[activeScenario].retorno_total < calc.r * 100 - 2 ? "OVERVALUED" : "FAIRLY VALUED"}
                    </span>
                  </div>
                  <div className={`text-2xl sm:text-3xl font-mono font-extrabold ${
                    activeScenario === "bear" ? "text-rose-400" : 
                    activeScenario === "bull" ? "text-emerald-400" : 
                    "text-white"
                  }`}>
                    {calc[activeScenario].retorno_total >= 0 ? "+" : ""}{calc[activeScenario].retorno_total.toFixed(1)}%
                    <span className="text-xs font-sans font-medium text-slate-400 ml-1.5">{language === "EN" ? `/ yr (${activeScenario})` : `/ año (${activeScenario})`}</span>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-300 flex items-center justify-between border-t border-slate-800/60 pt-2 font-mono">
                    <span>{language === "EN" ? `Fair Value (${(calc.r * 100).toFixed(1)}% Hurdle):` : `Valor Razonable (tasa ${(calc.r * 100).toFixed(1)}%):`}</span>
                    <span className="text-white font-extrabold">${calc[activeScenario].P_star_ajustado.toFixed(1)} ({calc[activeScenario].upside >= 0 ? "+" : ""}{calc[activeScenario].upside.toFixed(1)}%)</span>
                  </div>
                </div>

              </div>

              {/* Interactive Scenario Tuning Controls */}
              <div className="bg-[#0f111a]/40 border border-slate-900/60 p-5 rounded-2xl backdrop-blur-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-200 uppercase tracking-wider">
                    <Sliders size={14} className="text-emerald-400" />
                    <span>{language === "EN" ? "INTERACTIVE MODEL TUNING & ASSUMPTIONS" : "AJUSTE INTERACTIVO DE SUPUESTOS DEL MODELO"}</span>
                  </div>
                  <button
                    onClick={() => {
                      setModelCagrOverride(null);
                      setPeExitBearOverride(null);
                      setPeExitBaseOverride(null);
                      setPeExitBullOverride(null);
                      setHorizonYears(5);
                      setHurdleRate(defaultHurdle(stockMetrics.beta));
                    }}
                    className="text-[11px] font-mono text-slate-400 hover:text-emerald-400 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw size={11} />
                    {language === "EN" ? "Reset to Formula Defaults" : "Restablecer Valores por Defecto"}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
                  
                  {/* Horizon Slider */}
                  <div className="bg-slate-950/60 border border-slate-900 p-3.5 rounded-xl space-y-2">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-slate-400">{language === "EN" ? "Horizon (Years):" : "Horizonte (Años):"}</span>
                      <span className="font-mono text-emerald-400">{horizonYears} Y</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      step={1}
                      value={horizonYears}
                      onChange={(e) => setHorizonYears(Number(e.target.value))}
                      className="w-full accent-emerald-500 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] font-mono text-slate-500">
                      <span>1Y</span>
                      <span>5Y (Bogle)</span>
                      <span>10Y</span>
                    </div>
                  </div>

                  {/* Hurdle Rate Slider */}
                  <div className="bg-slate-950/60 border border-slate-900 p-3.5 rounded-xl space-y-2">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-slate-400">{language === "EN" ? "Hurdle Rate (r):" : "Tasa Exigida (r):"}</span>
                      <span className="font-mono text-emerald-400">{hurdleRate.toFixed(1)}%</span>
                    </div>
                    <input
                      type="range"
                      min={6}
                      max={18}
                      step={0.5}
                      value={hurdleRate}
                      onChange={(e) => setHurdleRate(Number(e.target.value))}
                      className="w-full accent-emerald-500 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] font-mono text-slate-500">
                      <span>8%</span>
                      <span>10% (Std)</span>
                      <span>14% (High Beta)</span>
                    </div>
                  </div>

                  {/* Model EPS CAGR Input */}
                  <div className="bg-slate-950/60 border border-slate-900 p-3.5 rounded-xl space-y-2">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-slate-400">{language === "EN" ? "Assumed EPS CAGR:" : "EPS CAGR Asumido:"}</span>
                      <span className="font-mono text-emerald-400">+{calc.EPS_CAGR_modelo.toFixed(1)}%</span>
                    </div>
                    <input
                      type="number"
                      step={0.5}
                      value={calc.EPS_CAGR_modelo}
                      onChange={(e) => setModelCagrOverride(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                    />
                    <div className="text-[10px] font-mono text-slate-500 truncate">
                      <span title={calc.growthNotes.join("\n")} className="cursor-help">
                        {`Hist: ${calc.EPS_CAGR_hist !== null ? `${calc.EPS_CAGR_hist.toFixed(1)}%` : "—"} | ${language === "EN" ? "Cons. 1Y" : "Cons. 1A"}: ${calc.EPS_CAGR_fwd_1Y !== null ? `${calc.EPS_CAGR_fwd_1Y.toFixed(1)}%` : "—"} ⓘ`}
                      </span>
                    </div>
                  </div>

                  {/* Deuda neta: informativo (un PER ya valora solo las acciones) */}
                  <div className="bg-slate-950/60 border border-slate-900 p-3.5 rounded-xl space-y-2 flex flex-col justify-between">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-slate-400">{language === "EN" ? "Net Debt:" : "Deuda Neta:"}</span>
                      <span className="font-mono text-slate-300">
                        {calc.netDebt >= 0 ? `$${(calc.netDebt / 1e9).toFixed(1)}B` : `${language === "EN" ? "Net cash" : "Caja neta"} $${(Math.abs(calc.netDebt) / 1e9).toFixed(1)}B`}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-slate-500 leading-relaxed">
                      {language === "EN"
                        ? "Not deducted: a P/E already values equity only (debt is reflected in EPS through interest)."
                        : "No se resta: un PER ya valora solo las acciones (la deuda está en el BPA vía intereses)."}
                    </div>
                  </div>

                </div>
              </div>

              {/* 3 SCENARIOS COMPARISON MATRIX */}
              <div className="bg-[#0f111a]/60 border border-slate-900/60 rounded-2xl overflow-hidden backdrop-blur-sm shadow-md">
                <div className="p-4 sm:p-5 border-b border-slate-900/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wide flex items-center gap-2">
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
                    <div className="flex items-center gap-1.5">
                      <span>{language === "EN" ? "Current Price:" : "Precio Actual:"}</span>
                      <span className="font-bold text-white">${calc.P0.toFixed(2)}</span>
                    </div>
                    <span className="text-slate-700">|</span>
                    <div className="flex items-center gap-1.5">
                      <span>{language === "EN" ? "Current P/E:" : "P/E Actual:"}</span>
                      <span className="font-bold text-purple-400">{calc.PE0 > 0 ? `${calc.PE0.toFixed(1)}×` : "N/A"}</span>
                    </div>
                    <span className="text-slate-700">|</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-purple-300 font-semibold">{language === "EN" ? "Median hist. P/E:" : "PER mediano hist.:"}</span>
                      <span
                        className="font-bold text-purple-300 bg-purple-500/15 px-2 py-0.5 rounded border border-purple-500/25 cursor-help"
                        title={
                          calc.peHistory && calc.peHistory.length > 0
                            ? `${language === "EN" ? "Median historical P/E" : "PER mediano histórico"}: ${calc.avgPe.toFixed(1)}×\n` +
                              calc.peHistory.map(h => `${h.isCurrentYear ? (language === "EN" ? "Current P/E" : "P/E Actual") : `Año ${h.year}`}: ${h.pe.toFixed(1)}×${h.isCurrentYear ? "" : ` (Cierre: $${h.price} / EPS: $${h.eps})`}`).join("\n")
                            : (language === "EN" ? "No P/E history: current P/E used" : "Sin histórico de PER: se usa el actual")
                        }
                      >
                        {calc.avgPe > 0 ? `${calc.avgPe.toFixed(1)}×` : `${calc.PE0.toFixed(1)}×`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Annual P/E Breakdown bar if history is available */}
                {calc.peHistory && calc.peHistory.length > 0 && (
                  <div className="px-4 sm:px-5 py-2.5 bg-purple-950/20 border-b border-purple-900/30 flex items-center justify-between flex-wrap gap-2 text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <span className="text-purple-300 font-bold uppercase text-[11px] flex items-center gap-1">
                        <Activity size={13} />
                        {language === "EN" ? "P/E history" : "Histórico de PER"} ({calc.peHistory.length} {language === "EN" ? "periods" : "datos"}):
                      </span>
                      <span className="text-slate-400 text-[11px] hidden md:inline">
                        ({language === "EN" ? "4 annual P/Es (Year Close / Diluted EPS) + Current P/E" : "4 P/E anuales (Cierre / BPA diluido) + P/E Actual"}):
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {calc.peHistory.map((h, idx) => (
                        <div
                          key={`${h.year}-${h.isCurrentYear ? "curr" : "hist"}-${idx}`}
                          className={`px-2 py-0.5 rounded text-[11px] border ${h.isCurrentYear ? "bg-purple-500/20 border-purple-400/40 text-purple-200 font-bold" : "bg-slate-900/80 border-slate-800 text-slate-300"}`}
                          title={`${h.isCurrentYear ? (language === "EN" ? "Current P/E" : "P/E Actual") : `Año ${h.year}`}: ${h.isCurrentYear ? `Current P/E: ${h.pe.toFixed(1)}×` : `Cierre $${h.price} ÷ EPS $${h.eps} = ${h.pe.toFixed(1)}×`}`}
                        >
                          <span className="text-slate-400 mr-1">{h.isCurrentYear ? (language === "EN" ? "Current" : "Actual") : h.year}:</span>
                          <span className="font-bold text-white">{h.pe.toFixed(1)}×</span>
                        </div>
                      ))}
                      <div className="px-2 py-0.5 rounded text-[11px] bg-purple-500/30 border border-purple-400/60 text-purple-100 font-extrabold ml-1">
                        <span className="mr-1">{language === "EN" ? "Median:" : "Mediana:"}</span>
                        <span>{calc.avgPe.toFixed(1)}×</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-slate-950/80 text-slate-400 uppercase text-[11px] border-b border-slate-900">
                      <tr>
                        <th className="py-3 px-4 font-bold">{language === "EN" ? "Metric / Component" : "Métrica / Componente"}</th>
                        <th className="py-3 px-4 text-rose-300 font-bold bg-rose-950/10 border-l border-slate-900">
                          {language === "EN" ? "Bearish (Bajista)" : "Bajista"}
                          <div className="text-[10px] font-normal text-rose-400/80 font-mono">{language === "EN" ? "−20% on lower P/E" : "−20% s/ menor PER"}</div>
                        </th>
                        <th className="py-3 px-4 text-emerald-300 font-bold bg-emerald-950/10 border-l border-slate-900">
                          {language === "EN" ? "Base Case (Base)" : "Caso Base"}
                          <div className="text-[10px] font-normal text-emerald-400/80 font-mono">{language === "EN" ? `Midpoint current–median (≤ ${EXIT_PE_CAP_BASE}×)` : `Punto medio actual–mediana (≤ ${EXIT_PE_CAP_BASE}×)`}</div>
                        </th>
                        <th className="py-3 px-4 text-blue-300 font-bold bg-blue-950/10 border-l border-slate-900">
                          {language === "EN" ? "Bullish (Alcista)" : "Alcista"}
                          <div className="text-[10px] font-normal text-blue-400/80 font-mono">{language === "EN" ? "Higher P/E (≤ 40×)" : "Mayor PER (≤ 40×)"}</div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900/60 text-slate-300">
                      {/* P/E Exit */}
                      <tr>
                        <td className="py-2.5 px-4 font-sans font-medium text-slate-400">
                          {language === "EN" ? "Exit P/E Multiple (PE_exit)" : "Múltiplo P/E de Salida (PE_exit)"}
                        </td>
                        <td className="py-2.5 px-4 bg-rose-950/5 border-l border-slate-900 font-bold">
                          <input
                            type="number"
                            step={0.5}
                            value={calc.bear.peExit}
                            onChange={(e) => setPeExitBearOverride(Number(e.target.value))}
                            className="w-16 bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-xs text-white"
                          /> ×
                        </td>
                        <td className="py-2.5 px-4 bg-emerald-950/5 border-l border-slate-900 font-bold">
                          <input
                            type="number"
                            step={0.5}
                            value={calc.base.peExit}
                            onChange={(e) => setPeExitBaseOverride(Number(e.target.value))}
                            className="w-16 bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-xs text-white"
                          /> ×
                        </td>
                        <td className="py-2.5 px-4 bg-blue-950/5 border-l border-slate-900 font-bold">
                          <input
                            type="number"
                            step={0.5}
                            value={calc.bull.peExit}
                            onChange={(e) => setPeExitBullOverride(Number(e.target.value))}
                            className="w-16 bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-xs text-white"
                          /> ×
                        </td>
                      </tr>

                      {/* Projected EPS */}
                      <tr>
                        <td className="py-2.5 px-4 font-sans font-medium text-slate-400">
                          {language === "EN" ? `EPS at Year ${calc.H}` : `EPS en el Año ${calc.H}`}
                        </td>
                        <td className="py-2.5 px-4 bg-rose-950/5 border-l border-slate-900 font-bold">${calc.EPS_H.toFixed(2)}</td>
                        <td className="py-2.5 px-4 bg-emerald-950/5 border-l border-slate-900 font-bold">${calc.EPS_H.toFixed(2)}</td>
                        <td className="py-2.5 px-4 bg-blue-950/5 border-l border-slate-900 font-bold">${calc.EPS_H.toFixed(2)}</td>
                      </tr>

                      {/* Future Target Price */}
                      <tr>
                        <td className="py-2.5 px-4 font-sans font-medium text-slate-400">
                          {language === "EN" ? `Gross Target Price (Year ${calc.H})` : `Precio Objetivo Bruto (Año ${calc.H})`}
                        </td>
                        <td className="py-2.5 px-4 bg-rose-950/5 border-l border-slate-900 font-bold text-slate-200">${calc.bear.P_H.toFixed(2)}</td>
                        <td className="py-2.5 px-4 bg-emerald-950/5 border-l border-slate-900 font-bold text-white">${calc.base.P_H.toFixed(2)}</td>
                        <td className="py-2.5 px-4 bg-blue-950/5 border-l border-slate-900 font-bold text-slate-200">${calc.bull.P_H.toFixed(2)}</td>
                      </tr>

                      {/* Engine 1 Contribution */}
                      <tr>
                        <td className="py-2.5 px-4 font-sans font-medium text-slate-400">
                          {language === "EN" ? "Engine 1 Contribution (EPS CAGR)" : "Contribución Motor 1 (EPS CAGR)"}
                        </td>
                        <td className="py-2.5 px-4 bg-rose-950/5 border-l border-slate-900 font-bold text-emerald-400">+{calc.contribE1.toFixed(1)}%</td>
                        <td className="py-2.5 px-4 bg-emerald-950/5 border-l border-slate-900 font-bold text-emerald-400">+{calc.contribE1.toFixed(1)}%</td>
                        <td className="py-2.5 px-4 bg-blue-950/5 border-l border-slate-900 font-bold text-emerald-400">+{calc.contribE1.toFixed(1)}%</td>
                      </tr>

                      {/* Engine 2 Contribution */}
                      <tr>
                        <td className="py-2.5 px-4 font-sans font-medium text-slate-400">
                          {language === "EN" ? "Engine 2 Contribution (dividends)" : "Contribución Motor 2 (dividendos)"}
                        </td>
                        <td className="py-2.5 px-4 bg-rose-950/5 border-l border-slate-900 font-bold text-blue-400">+{calc.contribE2.toFixed(2)}%</td>
                        <td className="py-2.5 px-4 bg-emerald-950/5 border-l border-slate-900 font-bold text-blue-400">+{calc.contribE2.toFixed(2)}%</td>
                        <td className="py-2.5 px-4 bg-blue-950/5 border-l border-slate-900 font-bold text-blue-400">+{calc.contribE2.toFixed(2)}%</td>
                      </tr>

                      {/* Engine 3 Contribution */}
                      <tr>
                        <td className="py-2.5 px-4 font-sans font-medium text-slate-400">
                          {language === "EN" ? "Engine 3 Contribution (Δ P/E)" : "Contribución Motor 3 (Δ P/E)"}
                          <span className="block text-[10px] text-slate-500 font-mono">
                            {language === "EN" ? "Annualized multiple expansion/contraction" : "Expansión/contracción anualizada de múltiplo"}
                          </span>
                        </td>
                        <td className={`py-2.5 px-4 bg-rose-950/5 border-l border-slate-900 font-bold ${calc.bear.contribE3 >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {calc.bear.contribE3 >= 0 ? "+" : ""}{calc.bear.contribE3.toFixed(1)}%
                        </td>
                        <td className={`py-2.5 px-4 bg-emerald-950/5 border-l border-slate-900 font-bold ${calc.base.contribE3 >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {calc.base.contribE3 >= 0 ? "+" : ""}{calc.base.contribE3.toFixed(1)}%
                        </td>
                        <td className={`py-2.5 px-4 bg-blue-950/5 border-l border-slate-900 font-bold ${calc.bull.contribE3 >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          <div>
                            <span>{calc.bull.contribE3 >= 0 ? "+" : ""}{calc.bull.contribE3.toFixed(1)}%</span>
                            {calc.PE0 > 0 && calc.bull.peExit !== calc.PE0 && (
                              <span className="block text-[10px] font-mono text-blue-300 font-normal">
                                (Δ total: {((calc.bull.peExit - calc.PE0) / calc.PE0 * 100) >= 0 ? "+" : ""}{((calc.bull.peExit - calc.PE0) / calc.PE0 * 100).toFixed(1)}%)
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Total Expected Return Annualized */}
                      <tr className="bg-slate-950/60 font-bold">
                        <td className="py-3 px-4 font-sans text-white text-xs uppercase tracking-wide">
                          {language === "EN" ? "TOTAL EXPECTED RETURN (E1+E2+E3)" : "RETORNO TOTAL ANUALIZADO (E1+E2+E3)"}
                        </td>
                        <td className="py-3 px-4 bg-rose-950/20 border-l border-slate-900 text-sm font-extrabold text-rose-300">
                          {calc.bear.retorno_total >= 0 ? "+" : ""}{calc.bear.retorno_total.toFixed(1)}% / yr
                        </td>
                        <td className="py-3 px-4 bg-emerald-950/30 border-l border-slate-900 text-sm font-extrabold text-emerald-400">
                          +{calc.base.retorno_total.toFixed(1)}% / yr
                        </td>
                        <td className="py-3 px-4 bg-blue-950/20 border-l border-slate-900 text-sm font-extrabold text-blue-300">
                          +{calc.bull.retorno_total.toFixed(1)}% / yr
                        </td>
                      </tr>

                      {/* Fair Value Today */}
                      <tr>
                        <td className="py-3 px-4 font-sans font-medium text-slate-300">
                          {language === "EN" ? `Fair Value Today (r = ${(calc.r * 100).toFixed(0)}%)` : `Valor Razonable Hoy (r = ${(calc.r * 100).toFixed(0)}%)`}
                        </td>
                        <td className="py-3 px-4 bg-rose-950/5 border-l border-slate-900 font-bold text-slate-200">${calc.bear.P_star_ajustado.toFixed(2)}</td>
                        <td className="py-3 px-4 bg-emerald-950/10 border-l border-slate-900 font-bold text-white">${calc.base.P_star_ajustado.toFixed(2)}</td>
                        <td className="py-3 px-4 bg-blue-950/5 border-l border-slate-900 font-bold text-slate-200">${calc.bull.P_star_ajustado.toFixed(2)}</td>
                      </tr>

                      {/* Implied Upside */}
                      <tr>
                        <td className="py-3 px-4 font-sans font-medium text-slate-300">
                          {language === "EN" ? "Upside / Downside vs Current Price" : "Upside / Downside vs Precio Actual"}
                        </td>
                        <td className={`py-3 px-4 bg-rose-950/5 border-l border-slate-900 font-extrabold ${calc.bear.upside >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {calc.bear.upside >= 0 ? "+" : ""}{calc.bear.upside.toFixed(1)}%
                        </td>
                        <td className={`py-3 px-4 bg-emerald-950/10 border-l border-slate-900 font-extrabold ${calc.base.upside >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {calc.base.upside >= 0 ? "+" : ""}{calc.base.upside.toFixed(1)}%
                        </td>
                        <td className={`py-3 px-4 bg-blue-950/5 border-l border-slate-900 font-extrabold ${calc.bull.upside >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {calc.bull.upside >= 0 ? "+" : ""}{calc.bull.upside.toFixed(1)}%
                        </td>
                      </tr>

                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          ) : null}
        </div>
      )}

      {/* ========================================================
          VIEW 2: PORTFOLIO 3 ENGINES ROLLUP
          ======================================================== */}
      {viewMode === "portfolio" && (
        <div className="space-y-6">
          
          {/* Scenario Toggle */}
          <div className="flex items-center justify-end">
            <div className="flex bg-[#0f111a]/80 border border-slate-800 rounded-xl p-1 shadow-inner backdrop-blur-sm">
              {(["bear", "base", "bull"] as const).map((scenario) => (
                <button
                  key={scenario}
                  onClick={() => setActiveScenario(scenario)}
                  className={`px-4 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                    activeScenario === scenario
                      ? scenario === "bear" ? "bg-rose-500/20 text-rose-400 border border-rose-500/30 shadow-sm"
                        : scenario === "bull" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-sm"
                        : "bg-slate-700 text-white border border-slate-600 shadow-sm"
                      : "text-slate-500 hover:text-slate-300 border border-transparent"
                  }`}
                >
                  {scenario === "bear" ? (language === "EN" ? "Bearish" : "Bajista")
                    : scenario === "bull" ? (language === "EN" ? "Bullish" : "Alcista")
                    : "Base"}
                </button>
              ))}
            </div>
          </div>

          {/* Portfolio Aggregated Rollup KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            
            {/* Weighted Engine 1 */}
            <div className="bg-[#0f111a]/70 border border-slate-900/60 p-5 rounded-2xl backdrop-blur-sm relative overflow-hidden">
              <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <TrendingUp size={14} />
                {language === "EN" ? "WEIGHTED ENGINE 1 (EPS)" : "MOTOR 1 PONDERADO (EPS)"}
              </div>
              <div className="text-2xl sm:text-3xl font-mono font-extrabold text-white">
                {portfolioRollup.weightedE1 >= 0 ? "+" : ""}{portfolioRollup.weightedE1.toFixed(1)}%
                <span className="text-xs font-sans font-medium text-slate-400 ml-1.5">{language === "EN" ? "/ yr" : "/ año"}</span>
              </div>
              <div className="mt-2 text-[11px] text-slate-400 font-mono border-t border-slate-800/60 pt-2 flex items-center justify-between">
                <span>{language === "EN" ? "Fundamental portfolio EPS growth" : "Crecimiento fundamental ponderado"}</span>
                {portfolioRollup.hasCappedHoldings && (
                  <span 
                    className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-bold tracking-tight"
                    title={language === "EN" ? "Some EPS growth rates were normalized (30% haircut above 40%, 25% cap, or adjusted consensus discarded). Hover each row for details." : "Algunos crecimientos del BPA se normalizaron (recorte del 30% por encima del 40%, tope del 25% o consenso ajustado descartado). Pasa el ratón por cada fila para ver el detalle."}
                  >
                    {language === "EN" ? "Normalized" : "Normalizado"}
                  </span>
                )}
              </div>
            </div>

            {/* Weighted Engine 2 */}
            <div className="bg-[#0f111a]/70 border border-slate-900/60 p-5 rounded-2xl backdrop-blur-sm relative overflow-hidden">
              <div className="text-[11px] font-bold text-blue-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <DollarSign size={14} />
                {language === "EN" ? "WEIGHTED ENGINE 2 (DIVIDEND)" : "MOTOR 2 PONDERADO (DIVIDENDO)"}
              </div>
              <div className="text-2xl sm:text-3xl font-mono font-extrabold text-white">
                {portfolioRollup.weightedE2 >= 0 ? "+" : ""}{portfolioRollup.weightedE2.toFixed(2)}%
                <span className="text-xs font-sans font-medium text-slate-400 ml-1.5">{language === "EN" ? "/ yr" : "/ año"}</span>
              </div>
              <div className="mt-2 text-[11px] text-slate-400 font-mono border-t border-slate-800/60 pt-2">
                {language === "EN" ? "Weighted dividend yield" : "Dividendo ponderado"}
              </div>
            </div>

            {/* Weighted Engine 3 */}
            <div className={`bg-[#0f111a]/70 border ${
              activeScenario === "bear" ? "border-rose-900/60" : 
              activeScenario === "bull" ? "border-emerald-900/60" : 
              "border-slate-900/60"
            } p-5 rounded-2xl backdrop-blur-sm relative overflow-hidden transition-all`}>
              <div className="text-[11px] font-bold text-purple-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Activity size={14} />
                {language === "EN" ? "WEIGHTED ENGINE 3 (Δ P/E)" : "MOTOR 3 PONDERADO (MÚLTIPLO)"}
              </div>
              <div className={`text-2xl sm:text-3xl font-mono font-extrabold ${portfolioRollup.weightedScenarios[activeScenario].e3 >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {portfolioRollup.weightedScenarios[activeScenario].e3 >= 0 ? "+" : ""}{portfolioRollup.weightedScenarios[activeScenario].e3.toFixed(1)}%
                <span className="text-xs font-sans font-medium text-slate-400 ml-1.5">{language === "EN" ? "/ yr" : "/ año"}</span>
              </div>
              <div className="mt-2 text-[11px] text-slate-400 font-mono border-t border-slate-800/60 pt-2 flex justify-between items-center">
                <span>{language === "EN" ? `Multiple reversion (${activeScenario})` : `Reversión múltiplo (${activeScenario})`}</span>
                <span className="text-purple-300 font-bold" title="PER actual ponderado vs. PER mediano histórico ponderado">
                  {portfolioRollup.weightedCurrentPe.toFixed(1)}× → {portfolioRollup.weightedAvgPe.toFixed(1)}×
                </span>
              </div>
            </div>

            {/* Total Weighted Return */}
            <div className={`bg-[#0f111a]/90 border ${
              activeScenario === "bear" ? "border-rose-500/40 shadow-rose-950/20" : 
              activeScenario === "bull" ? "border-emerald-500/40 shadow-emerald-950/20" : 
              "border-slate-500/40 shadow-slate-950/20"
            } p-5 rounded-2xl backdrop-blur-sm relative overflow-hidden shadow-lg`}>
              <div className={`text-[11px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5 ${
                activeScenario === "bear" ? "text-rose-300" : 
                activeScenario === "bull" ? "text-emerald-300" : 
                "text-slate-300"
              }`}>
                <Zap size={14} />
                {language === "EN" ? "WEIGHTED TOTAL RETURN" : "RETORNO TOTAL PONDERADO"}
              </div>
              <div className={`text-2xl sm:text-3xl font-mono font-extrabold ${
                activeScenario === "bear" ? "text-rose-400" : 
                activeScenario === "bull" ? "text-emerald-400" : 
                "text-white"
              }`}>
                {portfolioRollup.weightedScenarios[activeScenario].totalReturn >= 0 ? "+" : ""}{portfolioRollup.weightedScenarios[activeScenario].totalReturn.toFixed(1)}%
                <span className="text-xs font-sans font-medium text-slate-400 ml-1.5">{language === "EN" ? "/ yr" : "/ año"}</span>
              </div>
              <div className="mt-2 text-[11px] text-slate-300 font-mono border-t border-slate-800/60 pt-2 flex justify-between">
                <span>{language === "EN" ? "Portfolio upside (CAPM hurdles):" : "Upside cartera (tasas CAPM):"}</span>
                <span className="font-bold text-white">{portfolioRollup.weightedScenarios[activeScenario].upside >= 0 ? "+" : ""}{portfolioRollup.weightedScenarios[activeScenario].upside.toFixed(1)}%</span>
              </div>
            </div>

          </div>

          {/* Portfolio Holdings Breakdown Table */}
          <div className="bg-[#0f111a]/60 border border-slate-900/60 rounded-2xl overflow-hidden backdrop-blur-sm shadow-md">
            <div className="p-4 sm:p-5 border-b border-slate-900/80 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wide flex items-center gap-2">
                  <Briefcase size={16} className="text-emerald-400" />
                  {language === "EN" ? "PORTFOLIO HOLDINGS 3 ENGINES BREAKDOWN" : "DESGLOSE DE LOS 3 MOTORES POR POSICIÓN"}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {language === "EN" 
                    ? `Individual contributions and fair value for every asset in your portfolio (${activeScenario} scenario). Each holding uses its own CAPM hurdle; amber growth rates were normalized.` 
                    : `Contribuciones individuales y valor razonable para cada posición de tu portafolio (escenario ${activeScenario}). Cada posición usa su tasa exigida por CAPM; los crecimientos en ámbar se normalizaron.`}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-950/80 text-slate-400 uppercase text-[11px] border-b border-slate-900">
                  <tr>
                    <th className="py-3 px-4 font-bold">{language === "EN" ? "Asset / Company" : "Activo / Empresa"}</th>
                    <th className="py-3 px-3 text-right font-bold">{language === "EN" ? "Weight" : "Peso"}</th>
                    <th className="py-3 px-3 text-right text-emerald-400 font-bold">{language === "EN" ? "E1 (EPS)" : "E1 (EPS)"}</th>
                    <th className="py-3 px-3 text-right text-blue-400 font-bold">{language === "EN" ? "E2 (DIV)" : "E2 (DIV)"}</th>
                    <th className="py-3 px-3 text-right text-purple-400 font-bold cursor-help" title={language === "EN" ? "Average annual P/E (Year-end close / Diluted EPS, ongoing year uses current price)" : "Promedio P/E anual (Cierre de año / BPA diluido, año en curso con precio actual)"}>
                      {language === "EN" ? "Median P/E" : "PER mediano"}
                    </th>
                    <th className="py-3 px-3 text-right text-purple-400 font-bold">{language === "EN" ? "E3 (ΔP/E)" : "E3 (ΔP/E)"}</th>
                    <th className="py-3 px-3 text-right text-white font-bold">{language === "EN" ? "Total Return" : "Retorno Total"}</th>
                    <th className="py-3 px-3 text-right font-bold">{language === "EN" ? "Fair Value" : "Valor Razonable"}</th>
                    <th className="py-3 px-3 text-right font-bold">{language === "EN" ? "Upside" : "Upside"}</th>
                    <th className="py-3 px-4 text-center font-bold">{language === "EN" ? "Action" : "Acción"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/60 text-slate-300">
                  {portfolioRollup.rows.map(row => (
                    <tr key={row.ticker} className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-3 px-4 font-bold text-white flex items-center gap-2 font-sans">
                        <span className="font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded text-[11px]">
                          {row.ticker}
                        </span>
                        <span className="truncate max-w-[150px] text-slate-300">{row.name}</span>
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-slate-300">{row.weight.toFixed(1)}%</td>
                      <td className={`py-3 px-3 text-right font-bold ${row.isE1Capped ? "text-amber-400" : row.e1 >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        <span
                          title={row.growthNotes.join("\n")}
                        >
                          {row.e1 >= 0 ? "+" : ""}{row.e1.toFixed(1)}%
                        </span>
                      </td>
                      <td className={`py-3 px-3 text-right font-bold ${row.e2 >= 0 ? "text-blue-400" : "text-rose-400"}`}>
                        {row.e2 >= 0 ? "+" : ""}{row.e2.toFixed(2)}%
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-purple-300">
                        <span
                          className="hover:underline cursor-help"
                          title={
                            row.peHistory && row.peHistory.length > 0
                              ? `${language === "EN" ? "Median P/E" : "PER mediano"}: ${row.avgPe.toFixed(1)}×\n` +
                                row.peHistory.map(h => `${h.isCurrentYear ? (language === "EN" ? "Current P/E" : "P/E Actual") : `Año ${h.year}`}: ${h.pe.toFixed(1)}×${h.isCurrentYear ? "" : ` (Cierre: $${h.price} / EPS: $${h.eps})`}`).join("\n")
                              : `${language === "EN" ? "No P/E history; current" : "Sin histórico de PER; actual"}: ${row.peTrailing.toFixed(1)}×`
                          }
                        >
                          {row.avgPe > 0 ? `${row.avgPe.toFixed(1)}×` : `${row.peTrailing.toFixed(1)}×`}
                        </span>
                      </td>
                      <td className={`py-3 px-3 text-right font-bold ${row.scenarios[activeScenario].e3 >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {row.scenarios[activeScenario].e3 >= 0 ? "+" : ""}{row.scenarios[activeScenario].e3.toFixed(1)}%
                      </td>
                      <td className={`py-3 px-3 text-right font-extrabold ${row.scenarios[activeScenario].totalReturn >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {row.scenarios[activeScenario].totalReturn >= 0 ? "+" : ""}{row.scenarios[activeScenario].totalReturn.toFixed(1)}%
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-slate-200">${row.scenarios[activeScenario].fairValue.toFixed(2)}</td>
                      <td className={`py-3 px-3 text-right font-bold ${row.scenarios[activeScenario].upside >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {row.scenarios[activeScenario].upside >= 0 ? "+" : ""}{row.scenarios[activeScenario].upside.toFixed(1)}%
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => {
                            setSelectedTicker(row.ticker);
                            setViewMode("single");
                          }}
                          className="px-2.5 py-1 bg-slate-900 hover:bg-emerald-500 hover:text-slate-950 text-slate-300 rounded-lg text-[11px] font-mono transition-colors cursor-pointer border border-slate-800"
                        >
                          {language === "EN" ? "Drilldown →" : "Ver Detalle →"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {portfolioRollup.excluded.length > 0 && (
              <div className="px-4 py-3 border-t border-slate-900/80 text-[11px] font-mono text-amber-300/90">
                {language === "EN" ? "Excluded (missing data, weights recomputed without them): " : "Excluidos por falta de datos (pesos recalculados sin ellos): "}
                {portfolioRollup.excluded.map(e => `${e.ticker} (${e.reason})`).join(" · ")}
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
}
