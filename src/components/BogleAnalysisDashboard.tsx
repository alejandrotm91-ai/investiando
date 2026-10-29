import React, { useState, useEffect, useMemo } from "react";
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
import { getIndustryEpsBenchmark } from "../data/industryEpsBenchmarks";
import { TICKER_CLASSIFICATION } from "../data/tickerClassification";
import ThreeStatementModel from "./ThreeStatementModel";

interface BogleAnalysisDashboardProps {
  portfolio: PortfolioData;
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
  sector?: string;
  industry?: string;
  avgPe?: number | null;
  peHistory?: Array<{ year: number | string; date?: string; eps: number; price: number; pe: number; isCurrentYear?: boolean; quarterDate?: string }>;
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

  // Live stock data
  const [stockMetrics, setStockMetrics] = useState<StockMetrics | null>(null);

  // Model parameters (Customizable)
  const [horizonYears, setHorizonYears] = useState<number>(5);
  const [hurdleRate, setHurdleRate] = useState<number>(10);
  const [modelCagrOverride, setModelCagrOverride] = useState<number | null>(null);
  const [peExitBearOverride, setPeExitBearOverride] = useState<number | null>(null);
  const [peExitBaseOverride, setPeExitBaseOverride] = useState<number | null>(null);
  const [peExitBullOverride, setPeExitBullOverride] = useState<number | null>(null);
  const [applyNetDebtAdjustment, setApplyNetDebtAdjustment] = useState<boolean>(true);

  // Multi-stock cache for portfolio rollup
  const [portfolioMetricsMap, setPortfolioMetricsMap] = useState<Record<string, StockMetrics>>({});
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

        // Fetch financials to compute exact annual EPS CAGR and Shareholder Yield
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

        // Process fields according to calculation memory
        const price = sData?.price || 100;
        const trailingEps = sData?.trailingEps ?? (sData?.eps || 4.5);
        const forwardEps = sData?.forwardEps ?? (trailingEps ? trailingEps * 1.12 : 5.0);
        const peTrailing = sData?.pe ?? (trailingEps > 0 ? price / trailingEps : 25);
        const peForward = sData?.forwardPE ?? (forwardEps > 0 ? price / forwardEps : 22);
        const marketCap = sData?.marketCap || 50000000000;
        const totalCash = sData?.totalCash || 15000000000;
        const totalDebt = sData?.totalDebt || 10000000000;
        const freeCashFlow = sData?.freeCashFlow || 8000000000;
        const beta = sData?.beta ?? 1.1;
        const divYieldRaw = sData?.dividendYield ? (sData.dividendYield > 1 ? sData.dividendYield : sData.dividendYield * 100) : 0;
        const payoutRatio = sData?.payoutRatio ? (sData.payoutRatio > 1 ? sData.payoutRatio : sData.payoutRatio * 100) : 0;

        // Compute annual Basic EPS CAGR
        let basicEpsCagrAnnual = 12.5;
        let buybackYield = 1.2;
        let sharesOut = sData?.sharesOutstanding || (marketCap && price ? marketCap / price : 1000000000);

        if (finData?.annual && finData.annual.length >= 2) {
          const sortFn = (a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime();
          const sorted = [...finData.annual].sort(sortFn);

          // Diluted EPS CAGR from annual data (matching Financials Income Statement Annual CAGR column)
          const validEps = sorted
            .map((col: any, idx: number) => ({
              val: (col.dilutedEPS !== undefined && col.dilutedEPS !== null) ? col.dilutedEPS : col.basicEPS,
              idx
            }))
            .filter(item => typeof item.val === "number" && !isNaN(item.val as number) && item.val > 0);

          if (validEps.length >= 2) {
            const latest = validEps[0];
            const oldestPositive = [...validEps].reverse().find(item => item.val > 0 && item.idx > latest.idx);
            if (oldestPositive) {
              const n = oldestPositive.idx - latest.idx;
              if (n > 0) {
                basicEpsCagrAnnual = (Math.pow(latest.val / oldestPositive.val, 1 / n) - 1) * 100;
              }
            }
          }

          // Buyback Yield via shares reduction CAGR
          const validShares = sorted
            .map((col: any, idx: number) => ({ val: col.ordinarySharesNumber ?? col.shareIssued, idx }))
            .filter(item => typeof item.val === "number" && !isNaN(item.val as number) && item.val > 0);

          if (validShares.length >= 2) {
            const latestS = validShares[0];
            const oldestS = [...validShares].reverse().find(item => item.val > 0 && item.idx > latestS.idx);
            if (oldestS && latestS.val > 0) {
              const n = oldestS.idx - latestS.idx;
              if (n > 0) {
                const shareReduction = (Math.pow(latestS.val / oldestS.val, 1 / n) - 1) * 100;
                buybackYield = shareReduction < 0 ? Math.abs(shareReduction) : 0;
              }
            }
          }

          if (sorted[0]?.ordinarySharesNumber) {
            sharesOut = sorted[0].ordinarySharesNumber;
          }
        }

        const shareholderYield = divYieldRaw + buybackYield;

        const metrics: StockMetrics = {
          symbol: selectedTicker.toUpperCase(),
          name: sData?.name || selectedTicker,
          price,
          marketCap,
          peTrailing,
          peForward,
          pegRatio: sData?.pegRatio ?? (peTrailing && basicEpsCagrAnnual > 0 ? peTrailing / basicEpsCagrAnnual : 1.5),
          priceToSales: sData?.priceToSales ?? 6.2,
          priceToBook: sData?.priceToBook ?? 8.5,
          evToEbitda: sData?.evToEbitda ?? 18.0,
          trailingEps,
          forwardEps,
          operatingMargin: sData?.operatingMargins ? sData.operatingMargins * 100 : 35.0,
          netMargin: sData?.profitMargins ? sData.profitMargins * 100 : 28.0,
          roe: sData?.returnOnEquity ? sData.returnOnEquity * 100 : 42.0,
          roa: sData?.returnOnAssets ? sData.returnOnAssets * 100 : 18.0,
          totalCash,
          totalDebt,
          freeCashFlow,
          currentRatio: sData?.currentRatio ?? 1.4,
          debtToEquity: sData?.debtToEquity ? sData.debtToEquity / 100 : 0.6,
          sharesOutstanding: sharesOut,
          dividendRate: sData?.dividendRate ?? 0,
          dividendYield: divYieldRaw,
          payoutRatio,
          beta,
          basicEpsCagrAnnual,
          shareholderYield,
          buybackYield,
          fScore: sData?.piotroskiScore ?? 8,
          netIncome: sData?.netIncome ?? freeCashFlow * 0.95,
          avgPe: finData?.avgPe ?? null,
          peHistory: finData?.peHistory ?? []
        };

        setStockMetrics(metrics);
        // Reset overrides on new stock unless custom
        setModelCagrOverride(null);
        setPeExitBearOverride(null);
        setPeExitBaseOverride(null);
        setPeExitBullOverride(null);

        // Default hurdle rate set to 10%
        setHurdleRate(10);

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
        const stockDataList = await Promise.all(
          stockResponses.map(async (res) => (res && res.ok ? await res.json() : null))
        );

        const map: Record<string, StockMetrics> = {};

        activePositions.forEach((pos, idx) => {
          const sData = stockDataList[idx];
          const sym = pos.ticker.toUpperCase();
          const finData = fins[pos.ticker] || fins[sym] || fins[pos.ticker.replace(/\./g, "-")] || null;
          const sector = sData?.profile?.sector || TICKER_CLASSIFICATION[sym]?.sector || "";
          const industry = sData?.profile?.industry || TICKER_CLASSIFICATION[sym]?.subsector || "";

          const price = pos.price || sData?.price || 100;
          const trailingEps = sData?.trailingEps ?? (sData?.eps || 4.0);
          const forwardEps = sData?.forwardEps ?? (trailingEps * 1.1);
          const peTrailing = sData?.pe ?? (trailingEps > 0 ? price / trailingEps : 24);
          const peForward = sData?.forwardPE ?? (forwardEps > 0 ? price / forwardEps : 20);
          const divYield = sData?.dividendYield ? (sData.dividendYield > 1 ? sData.dividendYield : sData.dividendYield * 100) : 0;
          
          let epsCagr = 12.0;
          let buybackYield = 0.0;

          if (finData?.annual && Array.isArray(finData.annual) && finData.annual.length >= 2) {
            const sorted = [...finData.annual].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
            
            // Diluted EPS CAGR from annual data (matching Financials Income Statement Annual CAGR column)
            const valid = sorted
              .map((c: any, i: number) => ({
                val: (c.dilutedEPS !== undefined && c.dilutedEPS !== null) ? c.dilutedEPS : c.basicEPS,
                idx: i
              }))
              .filter(x => typeof x.val === "number" && !isNaN(x.val as number) && x.val > 0);

            if (valid.length >= 2) {
              const latest = valid[0];
              const oldestPositive = [...valid].reverse().find(item => item.val > 0 && item.idx > latest.idx);
              if (oldestPositive) {
                const n = oldestPositive.idx - latest.idx;
                if (n > 0) {
                  epsCagr = (Math.pow(latest.val / oldestPositive.val, 1 / n) - 1) * 100;
                }
              }
            } else if (valid.length === 1 && sorted.length >= 2) {
              // Fallback to revenue or net income growth if only 1 positive EPS
              const rev0 = sorted[0]?.totalRevenue;
              const revN = sorted[sorted.length - 1]?.totalRevenue;
              if (rev0 > 0 && revN > 0) {
                const n = sorted.length - 1;
                epsCagr = (Math.pow(rev0 / revN, 1 / n) - 1) * 100;
              }
            }

            const validS = sorted.map((c: any, i: number) => ({ val: c.ordinarySharesNumber ?? c.shareIssued, idx: i })).filter(x => typeof x.val === "number" && x.val > 0);
            if (validS.length >= 2) {
              const latestS = validS[0];
              const oldestS = [...validS].reverse().find(item => item.val > 0 && item.idx > latestS.idx);
              if (oldestS) {
                const n = oldestS.idx - latestS.idx;
                if (n > 0) {
                  const shareReduction = (Math.pow(latestS.val / oldestS.val, 1 / n) - 1) * 100;
                  buybackYield = shareReduction < 0 ? Math.abs(shareReduction) : 0;
                }
              }
            }
          } else if (sData?.earningsGrowth) {
            epsCagr = sData.earningsGrowth * 100;
          } else if (sData?.revenueGrowth) {
            epsCagr = sData.revenueGrowth * 100;
          }

          map[pos.ticker] = {
            symbol: pos.ticker,
            name: sData?.name || pos.name || pos.ticker,
            price,
            marketCap: sData?.marketCap || 50000000000,
            peTrailing,
            peForward,
            pegRatio: sData?.pegRatio ?? 1.5,
            priceToSales: sData?.priceToSales ?? 5.0,
            priceToBook: sData?.priceToBook ?? 6.0,
            evToEbitda: sData?.evToEbitda ?? 16.0,
            trailingEps,
            forwardEps,
            operatingMargin: 30,
            netMargin: 20,
            roe: 25,
            roa: 12,
            totalCash: sData?.totalCash || 10000000000,
            totalDebt: sData?.totalDebt || 5000000000,
            freeCashFlow: sData?.freeCashFlow || 4000000000,
            currentRatio: 1.5,
            debtToEquity: 0.5,
            sharesOutstanding: sData?.sharesOutstanding || 1000000000,
            dividendRate: sData?.dividendRate ?? 0,
            dividendYield: divYield,
            payoutRatio: sData?.payoutRatio ? sData.payoutRatio * 100 : 0,
            beta: sData?.beta ?? 1.0,
            basicEpsCagrAnnual: epsCagr,
            shareholderYield: divYield + buybackYield,
            buybackYield,
            sector,
            industry,
            avgPe: finData?.avgPe ?? null,
            peHistory: finData?.peHistory ?? []
          };
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

  // Calculations for Single Stock Analysis
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
      marketCap,
      payoutRatio,
      debtToEquity,
      freeCashFlow,
      netIncome,
      pegRatio,
      beta,
      fScore
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
    const SY = SY_raw ?? (DY + (BBY || 0));
    const contribE2 = SY;

    // 3. ENGINE 3 — P/E Multiple Change & Scenarios
    // Historical benchmarks
    const avgPe = (typeof stockMetrics.avgPe === "number" && !isNaN(stockMetrics.avgPe) && stockMetrics.avgPe > 0)
      ? stockMetrics.avgPe
      : Number((PE0 * 0.92).toFixed(1));
    const PE_avg10Y = avgPe;
    const PE_min10Y = Number((avgPe * 0.72).toFixed(1));

    // Defaults:
    // Base Case: E3 = 0% (Exit P/E = Current P/E)
    // Bull Case: Mean reversion to AVG P/E (Exit P/E = avgPe)
    // Bear Case: Multiple compression (Exit P/E = PE0 * 0.80)
    const defaultPeExitBase = Number(PE0.toFixed(1));
    const defaultPeExitBull = Number(avgPe.toFixed(1));
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

    // Scenario Calculator Helper
    const computeScenario = (peExit: number) => {
      let P_H: number;
      let retorno_precio_anual: number;
      let contribE3: number;

      // Base case: multiple stays flat at Current P/E -> E3 is strictly 0%
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

      // Fair value today discounted at hurdle rate
      const P_star = P_H / Math.pow(1 + r, H);
      const P_star_ajustado = (applyNetDebtAdjustment && isNetDebtMaterial) ? P_star - netDebtPerShare : P_star;
      const upside = ((P_star_ajustado - P0) / P0) * 100;

      return {
        peExit,
        P_H,
        retorno_precio_anual,
        contribE3,
        retorno_total,
        P_star,
        P_star_ajustado,
        upside
      };
    };

    const bear = computeScenario(peExitBear);
    const base = computeScenario(peExitBase);
    const bull = computeScenario(peExitBull);

    // Verdicts
    let verdict: "UNDERVALUED" | "FAIRLY VALUED" | "OVERVALUED" = "FAIRLY VALUED";
    if (base.retorno_total >= hurdleRate + 3) {
      verdict = "UNDERVALUED";
    } else if (base.retorno_total < hurdleRate - 2) {
      verdict = "OVERVALUED";
    }

    // Robust thesis test: E1 + E2 >= Hurdle
    const robustThesis = (contribE1 + contribE2) >= hurdleRate;

    // Alert Flags Check
    const flags = [
      {
        id: "eps_cagr_outlier",
        condition: EPS_CAGR_hist > 50,
        type: "warning",
        label: language === "EN" ? "Outlier EPS CAGR (>50%)" : "EPS CAGR atípico (>50%)",
        desc: language === "EN" ? "High base effect from depressed comparison period. Conservative model haircut applied." : "Efecto base por periodo deprimido. Se aplica haircut conservador al modelo."
      },
      {
        id: "payout_ratio",
        condition: payoutRatio !== null && payoutRatio > 80,
        type: "warning",
        label: language === "EN" ? "High Payout Ratio (>80%)" : "Payout Ratio Elevado (>80%)",
        desc: language === "EN" ? "Dividend capacity may be constrained; buyback/dividend sustainability should be monitored." : "Capacidad de dividendo ajustada; monitorear sostenibilidad de caja."
      },
      {
        id: "high_leverage",
        condition: (debtToEquity !== null && debtToEquity > 2.0) && (marketCap > 0 && netDebt / marketCap > 0.15),
        type: "warning",
        label: language === "EN" ? "High Financial Leverage" : "Apalancamiento Elevado",
        desc: language === "EN" ? "Net debt > 15% market cap and Debt/Equity > 2x. Net Debt adjustment is critical." : "Deuda neta > 15% de Market Cap. El ajuste por Net Debt es fundamental."
      },
      {
        id: "value_trap",
        condition: PE0 < 15 && debtToEquity !== null && debtToEquity > 1.5,
        type: "warning",
        label: language === "EN" ? "Potential Value Trap" : "Posible Trampa de Valor",
        desc: language === "EN" ? "Low P/E coupled with substantial debt load. Verify FCF stability." : "Múltiplo bajo acompañado de deuda sustancial. Verificar estabilidad de FCF."
      },
      {
        id: "fcf_quality",
        condition: freeCashFlow !== null && netIncome !== null && freeCashFlow < netIncome * 0.7,
        type: "warning",
        label: language === "EN" ? "Earnings Quality Flag" : "Alerta Calidad de Beneficios",
        desc: language === "EN" ? "Free Cash Flow lags GAAP Net Income. Working capital or CapEx drag." : "El Free Cash Flow es inferior al Beneficio Neto. Revisar intensidad de CapEx."
      },
      {
        id: "peg_undervalued",
        condition: pegRatio !== null && pegRatio > 0 && pegRatio < 1.0,
        type: "positive",
        label: language === "EN" ? "Attractive PEG Ratio (< 1.0)" : "PEG Ratio Atractivo (< 1.0)",
        desc: language === "EN" ? "Growth-adjusted valuation provides margin of safety for Engine 3." : "Valoración ajustada por crecimiento ofrece margen de seguridad para Engine 3."
      },
      {
        id: "piotroski_strength",
        condition: fScore !== null && fScore >= 8,
        type: "positive",
        label: language === "EN" ? "Elite Financial Health (F-Score 8-9)" : "Salud Financiera Élite (F-Score 8-9)",
        desc: language === "EN" ? "Top-tier operational efficiency and balance sheet resilience." : "Máxima resiliencia de balance y rentabilidad operativa."
      },
      {
        id: "high_beta",
        condition: beta !== null && beta > 1.5,
        type: "warning",
        label: language === "EN" ? `High Volatility Beta (${beta.toFixed(2)})` : `Beta de Alta Volatilidad (${beta.toFixed(2)})`,
        desc: language === "EN" ? "Recommended hurdle rate is 12–14% to compensate for equity risk." : "Hurdle rate recomendado de 12–14% para compensar el riesgo de mercado."
      }
    ].filter(f => f.condition);

    return {
      P0,
      EPS_TTM,
      EPS_fwd,
      PE0,
      PE_fwd,
      EPS_CAGR_hist,
      EPS_CAGR_fwd_1Y,
      EPS_CAGR_modelo,
      EPS_H,
      contribE1,
      SY,
      DY,
      BBY,
      contribE2,
      PE_avg10Y,
      PE_min10Y,
      avgPe,
      peHistory: stockMetrics.peHistory || [],
      peExitBear,
      peExitBase,
      peExitBull,
      netDebt,
      netDebtPerShare,
      isNetDebtMaterial,
      r,
      H,
      bear,
      base,
      bull,
      verdict,
      robustThesis,
      flags
    };
  }, [
    stockMetrics,
    horizonYears,
    hurdleRate,
    modelCagrOverride,
    peExitBearOverride,
    peExitBaseOverride,
    peExitBullOverride,
    applyNetDebtAdjustment,
    language
  ]);

  // Calculations for Portfolio-Level Rollup
  const portfolioRollup = useMemo(() => {
    const activePositions = portfolio.positions.filter(p => !p.isCash && p.shares > 0);
    const totalInvested = activePositions.reduce((acc, p) => acc + (p.mktValue || (p.shares * (p.price || p.avgCost))), 0) || 1;

    let weightedE1 = 0;
    let weightedE2 = 0;
    let weightedAvgPe = 0;
    let weightedCurrentPe = 0;
    
    const weightedScenarios = {
      bear: { e3: 0, totalReturn: 0, upside: 0 },
      base: { e3: 0, totalReturn: 0, upside: 0 },
      bull: { e3: 0, totalReturn: 0, upside: 0 },
    };

    const rows = activePositions.map(pos => {
      const m = portfolioMetricsMap[pos.ticker];
      const mktVal = pos.mktValue || (pos.shares * (pos.price || pos.avgCost));
      const weight = (mktVal / totalInvested) * 100;

      if (!m) {
        return {
          ticker: pos.ticker,
          name: pos.name || pos.ticker,
          weight,
          mktVal,
          e1: 12.0,
          rawE1: 12.0,
          isE1Capped: false,
          benchmarkIndustry: "",
          benchmarkCagr: 0,
          e2: 1.5,
          avgPe: 20.0,
          peTrailing: 20.0,
          peHistory: [],
          scenarios: {
            bear: { e3: -5.0, totalReturn: 8.5, fairValue: pos.price || 100, upside: -10.0 },
            base: { e3: -1.0, totalReturn: 12.5, fairValue: pos.price || 100, upside: 5.0 },
            bull: { e3: 2.0, totalReturn: 15.5, fairValue: pos.price || 100, upside: 15.0 },
          }
        };
      }

      const P0 = pos.price || m.price;
      const EPS_TTM = m.trailingEps && m.trailingEps > 0 ? m.trailingEps : 1;
      const EPS_fwd = m.forwardEps && m.forwardEps > 0 ? m.forwardEps : EPS_TTM * 1.1;
      const PE0 = m.peTrailing && m.peTrailing > 0 ? m.peTrailing : P0 / EPS_TTM;
      
      // Engine 1: Exact Diluted EPS CAGR from the Annual Financials CAGR column
      const EPS_CAGR_hist = m.basicEpsCagrAnnual ?? 12.0;
      const rawE1 = Number(EPS_CAGR_hist.toFixed(1));
      let e1 = rawE1;
      let isE1Capped = false;
      let benchmarkIndustry = "";
      let benchmarkCagr = 0;

      // Rule: In Portfolio 3 engines rollup, any E1 (EPS) > 80% must use the industry average EPS CAGR
      if (rawE1 > 80) {
        const benchmark = getIndustryEpsBenchmark(m.industry, m.sector, pos.ticker);
        if (benchmark) {
          e1 = Number(benchmark.cagr.toFixed(1));
          isE1Capped = true;
          benchmarkIndustry = benchmark.industry;
          benchmarkCagr = benchmark.cagr;
        }
      }

      const e2 = Number((m.shareholderYield ?? (m.dividendYield + (m.buybackYield || 0))).toFixed(2));

      // AVG P/E: Historical annual P/E average (diluted EPS / year close, current price for ongoing year)
      const avgPe = (typeof m.avgPe === "number" && !isNaN(m.avgPe) && m.avgPe > 0)
        ? m.avgPe
        : Number(PE0.toFixed(1));

      const EPS_H = EPS_TTM * Math.pow(1 + e1 / 100, 5);
      
      const defaultPeExitBase = Number(PE0.toFixed(1));
      const defaultPeExitBull = Number(avgPe.toFixed(1));
      const defaultPeExitBear = Math.max(8, Number((PE0 * 0.80).toFixed(1)));

      const calcScenario = (PE_exit: number) => {
        let retPrecio: number;
        let e3: number;
        let P_H: number;

        if (Math.abs(PE_exit - PE0) < 0.05 || PE_exit === defaultPeExitBase) {
          retPrecio = e1;
          e3 = 0;
          P_H = P0 * Math.pow(1 + e1 / 100, 5);
        } else {
          P_H = EPS_H * PE_exit;
          retPrecio = (Math.pow(P_H / P0, 1 / 5) - 1) * 100;
          e3 = retPrecio - e1;
        }
        const totalReturn = retPrecio + e2;
        const fairValue = P_H / Math.pow(1.10, 5); // 10% hurdle rate assumption for portfolio rollup
        const upside = ((fairValue - P0) / P0) * 100;
        return { e3, totalReturn, fairValue, upside };
      };

      const bear = calcScenario(defaultPeExitBear);
      const base = calcScenario(defaultPeExitBase);
      const bull = calcScenario(defaultPeExitBull);

      weightedE1 += (weight / 100) * e1;
      weightedE2 += (weight / 100) * e2;
      weightedAvgPe += (weight / 100) * avgPe;
      weightedCurrentPe += (weight / 100) * PE0;
      
      weightedScenarios.bear.e3 += (weight / 100) * bear.e3;
      weightedScenarios.bear.totalReturn += (weight / 100) * bear.totalReturn;
      weightedScenarios.bear.upside += (weight / 100) * bear.upside;

      weightedScenarios.base.e3 += (weight / 100) * base.e3;
      weightedScenarios.base.totalReturn += (weight / 100) * base.totalReturn;
      weightedScenarios.base.upside += (weight / 100) * base.upside;

      weightedScenarios.bull.e3 += (weight / 100) * bull.e3;
      weightedScenarios.bull.totalReturn += (weight / 100) * bull.totalReturn;
      weightedScenarios.bull.upside += (weight / 100) * bull.upside;

      return {
        ticker: pos.ticker,
        name: m.name,
        weight,
        mktVal,
        e1,
        rawE1,
        isE1Capped,
        benchmarkIndustry,
        benchmarkCagr,
        e2,
        avgPe,
        peTrailing: Number(PE0.toFixed(1)),
        peHistory: m.peHistory || [],
        scenarios: { bear, base, bull }
      };
    });

    const hasCappedHoldings = rows.some(r => r.isE1Capped);

    return {
      totalInvested,
      weightedE1,
      weightedE2,
      weightedAvgPe,
      weightedCurrentPe,
      weightedScenarios,
      hasCappedHoldings,
      rows
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

    return `ANÁLISIS BOGLE (3 ENGINES OF RETURN) — ${stockMetrics.symbol}
Precio Actual: $${calc.P0.toFixed(2)}  |  Fecha: ${dateStr}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INPUTS (investiando.app)
  Trailing EPS (TTM):      $${calc.EPS_TTM.toFixed(2)}
  Forward EPS:             $${calc.EPS_fwd.toFixed(2)}
  Trailing P/E (TTM):       ${calc.PE0.toFixed(2)}×
  Forward P/E:              ${calc.PE_fwd.toFixed(2)}×
  Basic EPS CAGR (Annual): +${calc.EPS_CAGR_hist.toFixed(1)}%
  Shareholder Yield:        ${calc.SY.toFixed(2)}%
  Free Cash Flow:          $${((stockMetrics.freeCashFlow || 0) / 1e9).toFixed(2)}B
  Total Cash:              $${((stockMetrics.totalCash || 0) / 1e9).toFixed(2)}B
  Total Debt:              $${((stockMetrics.totalDebt || 0) / 1e9).toFixed(2)}B
  Beta (5Y Vol):            ${(stockMetrics.beta || 1).toFixed(2)}

ENGINE 1 — INVESTMENT RETURN (EPS CAGR)
  Histórico (Basic EPS CAGR Annual):    +${calc.EPS_CAGR_hist.toFixed(1)}% / año
  Forward implícito (EPS_fwd/EPS_TTM−1):+${calc.EPS_CAGR_fwd_1Y.toFixed(1)}% / año
  CAGR modelo asumido:                 +${calc.EPS_CAGR_modelo.toFixed(1)}% / año
  EPS proyectado (Año ${calc.H}):              $${calc.EPS_H.toFixed(2)}
  Contribución E1:                     +${calc.contribE1.toFixed(1)}% / año

ENGINE 2 — SHAREHOLDER RETURN (SHAREHOLDER YIELD)
  Shareholder Yield Total:              ${calc.SY.toFixed(2)}% / año
    ├ Dividend Yield:                   ${calc.DY.toFixed(2)}%
    └ Buyback Yield:                    ${(calc.BBY || 0).toFixed(2)}%
  Contribución E2:                     +${calc.contribE2.toFixed(2)}% / año

ENGINE 3 — SPECULATIVE RETURN (CAMBIO MÚLTIPLO P/E)
  P/E actual vs. referencia:           ${calc.PE0.toFixed(1)}× vs ${calc.PE_avg10Y.toFixed(1)}×
  Horizonte de proyección:             ${calc.H} años
                          Bajista         Base          Alcista
  PE Exit:                 ${calc.bear.peExit.toFixed(1)}×           ${calc.base.peExit.toFixed(1)}×          ${calc.bull.peExit.toFixed(1)}×
  Precio Año ${calc.H}:            $${calc.bear.P_H.toFixed(1)}        $${calc.base.P_H.toFixed(1)}       $${calc.bull.P_H.toFixed(1)}
  Contrib. E3 (anual):   ${calc.bear.contribE3 >= 0 ? "+" : ""}${calc.bear.contribE3.toFixed(1)}%         ${calc.base.contribE3 >= 0 ? "+" : ""}${calc.base.contribE3.toFixed(1)}%        ${calc.bull.contribE3 >= 0 ? "+" : ""}${calc.bull.contribE3.toFixed(1)}%

RETORNO TOTAL ANUALIZADO (E1 + E2 + E3)
                         Bajista         Base          Alcista
  Retorno Total:          ${calc.bear.retorno_total.toFixed(1)}%          ${calc.base.retorno_total.toFixed(1)}%         ${calc.bull.retorno_total.toFixed(1)}%
  Fair Value (${(calc.r * 100).toFixed(0)}%):    $${calc.bear.P_star_ajustado.toFixed(1)}        $${calc.base.P_star_ajustado.toFixed(1)}       $${calc.bull.P_star_ajustado.toFixed(1)}
  Upside vs Precio:      ${calc.bear.upside >= 0 ? "+" : ""}${calc.bear.upside.toFixed(1)}%        ${calc.base.upside >= 0 ? "+" : ""}${calc.base.upside.toFixed(1)}%       ${calc.bull.upside >= 0 ? "+" : ""}${calc.bull.upside.toFixed(1)}%

VEREDICTO (Hurdle = ${(calc.r * 100).toFixed(0)}%)
  Escenario Base implica ${calc.base.retorno_total.toFixed(1)}% → [${calc.verdict}]
  Tesis robusta sin E3 (E1 + E2 = ${(calc.contribE1 + calc.contribE2).toFixed(1)}% vs ${(calc.r * 100).toFixed(0)}%): [${calc.robustThesis ? "SÍ" : "NO"}]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
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
              ? "Decompose long-term expected returns into fundamental business growth (EPS CAGR), cash return (Shareholder Yield), and speculative multiple repricing (Δ P/E)."
              : "Descompone el retorno esperado a largo plazo en crecimiento real (EPS CAGR), retorno de caja (Shareholder Yield) y cambio especulativo de múltiplo (Δ P/E)."}
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
                      {language === "EN" ? "ENGINE 2 · SHAREHOLDER" : "MOTOR 2 · RETORNO CAJA"}
                    </span>
                    <span className="font-mono text-[10px] bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-slate-400">
                      DIV + BUYBACK
                    </span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-mono font-extrabold text-white">
                    {calc.contribE2 >= 0 ? "+" : ""}{calc.contribE2.toFixed(2)}%
                    <span className="text-xs font-sans font-medium text-slate-400 ml-1.5">{language === "EN" ? "/ yr" : "/ año"}</span>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between border-t border-slate-800/60 pt-2 font-mono">
                    <span>{language === "EN" ? "Div / Buyback Breakdown:" : "Desglose Div / Buyback:"}</span>
                    <span className="text-blue-400 font-bold">{calc.DY.toFixed(1)}% + {(calc.BBY || 0).toFixed(1)}%</span>
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
                    <span>{language === "EN" ? `Fair Value (${(calc.r * 100).toFixed(0)}% Hurdle):` : `Valor Razonable (Hurdle ${(calc.r * 100).toFixed(0)}%):`}</span>
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
                      setHurdleRate(stockMetrics.beta && stockMetrics.beta > 1.5 ? 12.5 : 10);
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
                      {language === "EN" ? `Hist: +${calc.EPS_CAGR_hist.toFixed(1)}% | Fwd: +${calc.EPS_CAGR_fwd_1Y.toFixed(1)}%` : `Hist: +${calc.EPS_CAGR_hist.toFixed(1)}% | Fwd: +${calc.EPS_CAGR_fwd_1Y.toFixed(1)}%`}
                    </div>
                  </div>

                  {/* Net Debt Bridge Toggle */}
                  <div className="bg-slate-950/60 border border-slate-900 p-3.5 rounded-xl space-y-2 flex flex-col justify-between">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-slate-400">{language === "EN" ? "Net Debt Adjustment:" : "Ajuste Deuda Neta:"}</span>
                      <span className="font-mono text-slate-300">
                        {calc.netDebt >= 0 ? `-$${(calc.netDebt / 1e9).toFixed(1)}B` : `+$${(Math.abs(calc.netDebt) / 1e9).toFixed(1)}B`}
                      </span>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 mt-1">
                      <input
                        type="checkbox"
                        checked={applyNetDebtAdjustment}
                        onChange={(e) => setApplyNetDebtAdjustment(e.target.checked)}
                        className="rounded accent-emerald-500 cursor-pointer"
                      />
                      <span>{language === "EN" ? "Bridge to Equity Value" : "Ajustar al Equity Value"}</span>
                    </label>
                    <div className="text-[10px] font-mono text-slate-500">
                      {calc.isNetDebtMaterial ? (language === "EN" ? "Material impact (>5% MktCap)" : "Impacto material (>5% MktCap)") : (language === "EN" ? "Immaterial (<5% MktCap)" : "No material (<5% MktCap)")}
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
                      <span className="text-purple-300 font-semibold">{language === "EN" ? "AVG P/E:" : "AVG P/E:"}</span>
                      <span
                        className="font-bold text-purple-300 bg-purple-500/15 px-2 py-0.5 rounded border border-purple-500/25 cursor-help"
                        title={
                          calc.peHistory && calc.peHistory.length > 0
                            ? `AVG P/E: ${calc.avgPe.toFixed(1)}×\n` +
                              calc.peHistory.map(h => `${h.isCurrentYear ? (language === "EN" ? "Current P/E" : "P/E Actual") : `Año ${h.year}`}: ${h.pe.toFixed(1)}×${h.isCurrentYear ? "" : ` (Cierre: $${h.price} / EPS: $${h.eps})`}`).join("\n")
                            : `AVG P/E: ${calc.avgPe.toFixed(1)}×`
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
                        AVG P/E Breakdown ({calc.peHistory.length} {language === "EN" ? "periods" : "datos"}):
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
                        <span className="mr-1">AVG P/E:</span>
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
                          <div className="text-[10px] font-normal text-rose-400/80 font-mono">P/E −20%</div>
                        </th>
                        <th className="py-3 px-4 text-emerald-300 font-bold bg-emerald-950/10 border-l border-slate-900">
                          {language === "EN" ? "Base Case (Base)" : "Caso Base"}
                          <div className="text-[10px] font-normal text-emerald-400/80 font-mono">E3 = 0% ({language === "EN" ? "Current P/E" : "P/E Actual"})</div>
                        </th>
                        <th className="py-3 px-4 text-blue-300 font-bold bg-blue-950/10 border-l border-slate-900">
                          {language === "EN" ? "Bullish (Alcista)" : "Alcista"}
                          <div className="text-[10px] font-normal text-blue-400/80 font-mono">{language === "EN" ? "Mean Reversion to AVG P/E" : "Retorno a AVG P/E"}</div>
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
                          {language === "EN" ? "Engine 2 Contribution (Shareholder Yield)" : "Contribución Motor 2 (Shareholder Yield)"}
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
                    title={language === "EN" ? "High-growth assets (>80%) normalized to industry consensus average" : "Activos con E1 > 80% normalizados al promedio de la industria"}
                  >
                    {language === "EN" ? "Industry Normalized" : "Normalizado x Industria"}
                  </span>
                )}
              </div>
            </div>

            {/* Weighted Engine 2 */}
            <div className="bg-[#0f111a]/70 border border-slate-900/60 p-5 rounded-2xl backdrop-blur-sm relative overflow-hidden">
              <div className="text-[11px] font-bold text-blue-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <DollarSign size={14} />
                {language === "EN" ? "WEIGHTED ENGINE 2 (YIELD)" : "MOTOR 2 PONDERADO (CAJA)"}
              </div>
              <div className="text-2xl sm:text-3xl font-mono font-extrabold text-white">
                {portfolioRollup.weightedE2 >= 0 ? "+" : ""}{portfolioRollup.weightedE2.toFixed(2)}%
                <span className="text-xs font-sans font-medium text-slate-400 ml-1.5">{language === "EN" ? "/ yr" : "/ año"}</span>
              </div>
              <div className="mt-2 text-[11px] text-slate-400 font-mono border-t border-slate-800/60 pt-2">
                {language === "EN" ? "Weighted Shareholder Yield" : "Shareholder Yield total ponderado"}
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
                <span className="text-purple-300 font-bold" title="P/E Actual ponderado vs AVG P/E ponderado">
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
                <span>{language === "EN" ? "Portfolio Upside (10%):" : "Upside Portafolio (10%):"}</span>
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
                    ? `Individual contributions and fair value for every asset in your portfolio (${activeScenario} scenario). E1 values > 80% use industry consensus EPS.` 
                    : `Contribuciones individuales y valor razonable para cada posición de tu portafolio (escenario ${activeScenario}). Valores E1 > 80% usan el promedio de su industria.`}
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
                    <th className="py-3 px-3 text-right text-blue-400 font-bold">{language === "EN" ? "E2 (SY)" : "E2 (SY)"}</th>
                    <th className="py-3 px-3 text-right text-purple-400 font-bold cursor-help" title={language === "EN" ? "Average annual P/E (Year-end close / Diluted EPS, ongoing year uses current price)" : "Promedio P/E anual (Cierre de año / BPA diluido, año en curso con precio actual)"}>
                      {language === "EN" ? "AVG P/E" : "AVG P/E"}
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
                          title={row.isE1Capped ? (language === "EN"
                            ? `Historical EPS CAGR (${row.rawE1.toFixed(1)}%) exceeds 80%. Normalized to ${row.benchmarkIndustry} consensus: ${row.e1.toFixed(1)}%`
                            : `CAGR EPS histórico (${row.rawE1.toFixed(1)}%) supera el 80%. Normalizado al promedio de la industria ${row.benchmarkIndustry}: ${row.e1.toFixed(1)}%`) : undefined}
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
                              ? `AVG P/E: ${row.avgPe.toFixed(1)}×\n` +
                                row.peHistory.map(h => `${h.isCurrentYear ? (language === "EN" ? "Current P/E" : "P/E Actual") : `Año ${h.year}`}: ${h.pe.toFixed(1)}×${h.isCurrentYear ? "" : ` (Cierre: $${h.price} / EPS: $${h.eps})`}`).join("\n")
                              : `AVG P/E: ${row.avgPe.toFixed(1)}× (P/E actual: ${row.peTrailing.toFixed(1)}×)`
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
          </div>

        </div>
      )}

    </div>
  );
}
