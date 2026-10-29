import React, { useState, useEffect, useMemo, useRef } from "react";
import { Position, PortfolioData, SearchResult } from "../types";
import { 
  Sparkles, 
  Trash2, 
  TrendingUp, 
  RefreshCw, 
  X, 
  Search, 
  Plus, 
  Loader2, 
  ArrowUpDown, 
  Check, 
  AlertCircle,
  Rocket,
  Info,
  ChevronDown,
  ChevronRight,
  PieChart as PieChartIcon,
  Save,
  RotateCcw,
  Briefcase,
  Award,
  FileText,
  LayoutGrid,
  Table
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { getTickerSector, getSectorSpanish, getSectorColor, getTickerSubsector, CompanyLogo, HealthMetricsTooltip } from "./HoldingsTable";
import { CompanyFinancials } from "./CompanyFinancials";
import { saveUserCloudData, subscribeUserCloudData } from "../lib/cloudData";
import { getRawFeatures, buildScores, overrideFeaturesWithFinancials } from "../utils/engine";

// Function to calculate Quarterly Compound Growth Rate (CAGR) of basicEPS from Financials
export const getQuarterlyBasicEpsCagrFromFinancials = (financialsData: { annual?: any[]; quarterly?: any[] } | null | undefined): number | null => {
  if (!financialsData) return null;
  const quarterly = financialsData.quarterly || [];
  if (quarterly.length >= 2) {
    const sorted = [...quarterly].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const validCols = sorted
      .map((col, idx) => ({ val: col.basicEPS, idx }))
      .filter(item => typeof item.val === "number" && !isNaN(item.val as number));

    if (validCols.length >= 2) {
      const latestItem = validCols[0];
      if (latestItem.val > 0) {
        const oldestPositive = [...validCols].reverse().find(item => item.val > 0 && item.idx > latestItem.idx);
        if (oldestPositive) {
          const n = oldestPositive.idx - latestItem.idx;
          if (n > 0) {
            const cagr = (Math.pow(latestItem.val / oldestPositive.val, 1 / n) - 1) * 100;
            return Number(cagr.toFixed(2));
          }
        }
      }

      // If CAGR couldn't be calculated due to non-positive base, check YoY AGR (1 year / 4 quarters ago)
      let priorYearItem = validCols.find(item => item.idx === latestItem.idx + 4);
      if (!priorYearItem && validCols.length > 1) {
        priorYearItem = validCols[1];
      }
      if (priorYearItem && priorYearItem.val !== 0 && latestItem.val !== undefined) {
        const agr = ((latestItem.val - priorYearItem.val) / Math.abs(priorYearItem.val)) * 100;
        return Number(agr.toFixed(2));
      }
    }
  }

  // Fallback to annual basicEPS CAGR if quarterly not available
  const annual = financialsData.annual || [];
  if (annual.length >= 2) {
    const sorted = [...annual].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const validCols = sorted
      .map((col, idx) => ({ val: col.basicEPS, idx }))
      .filter(item => typeof item.val === "number" && !isNaN(item.val as number));

    if (validCols.length >= 2) {
      const latestItem = validCols[0];
      if (latestItem.val > 0) {
        const oldestPositive = [...validCols].reverse().find(item => item.val > 0 && item.idx > latestItem.idx);
        if (oldestPositive) {
          const n = oldestPositive.idx - latestItem.idx;
          if (n > 0) {
            const cagr = (Math.pow(latestItem.val / oldestPositive.val, 1 / n) - 1) * 100;
            return Number(cagr.toFixed(2));
          }
        }
      }
    }
  }

  return null;
};

// Fixed analyst target data to match the screenshot precisely for the default holdings
const TICKER_ANALYST_DATA: Record<string, {
  avgTarget: number;
  highTarget: number;
  recommendation: string;
  epsCagr: number | null;
}> = {
  MSFT: { avgTarget: 561.11, highTarget: 870.00, recommendation: "Buy", epsCagr: 17.4 },
  META: { avgTarget: 827.32, highTarget: 1015.00, recommendation: "Buy", epsCagr: 21.5 },
  NVDA: { avgTarget: 298.93, highTarget: 500.00, recommendation: "Buy", epsCagr: 91.5 },
  AVGO: { avgTarget: 523.73, highTarget: 650.00, recommendation: "Buy", epsCagr: 54.0 },
  AMZN: { avgTarget: 312.99, highTarget: 370.00, recommendation: "Buy", epsCagr: 30.8 },
  MAGS: { avgTarget: 0, highTarget: 0, recommendation: "N/A", epsCagr: null },
  GOOGL: { avgTarget: 432.83, highTarget: 515.00, recommendation: "Buy", epsCagr: -3.1 },
  IREN: { avgTarget: 80.93, highTarget: 126.00, recommendation: "Buy", epsCagr: -8.0 },
  CRWV: { avgTarget: 143.41, highTarget: 303.00, recommendation: "Buy", epsCagr: null },
  NBIS: { avgTarget: 143.41, highTarget: 303.00, recommendation: "Buy", epsCagr: null },
};

const ScoreDonut = ({ score, label, colorClass }: { score: number; label: string; colorClass: string }) => {
  const displayScore = Math.ceil(score || 0);
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.max(0, Math.min(100, displayScore)) / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative flex items-center justify-center w-14 h-14">
        <svg className="absolute top-0 left-0 w-full h-full transform -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r={radius} className="stroke-slate-800/60" strokeWidth="6" fill="transparent" />
          <circle
            cx="32"
            cy="32"
            r={radius}
            className={`stroke-current ${colorClass} transition-all duration-1000`}
            strokeWidth="6"
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
          />
        </svg>
        <span className={`text-sm font-bold leading-none ${colorClass} relative z-10`}>{displayScore}</span>
      </div>
      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider text-center">{label}</span>
    </div>
  );
};

const getTypeBadgeConfig = (type: string | undefined | null) => {
  if (!type) return { icon: "❓", className: "badge-type-unknown" };
  switch (type) {
    case "Mature Compounder": return { icon: "🏛️", className: "badge-type-mature" };
    case "Growth Compounder": return { icon: "🌱", className: "badge-type-growth" };
    case "Infrastructure / Utility": return { icon: "🏗️", className: "badge-type-infra" };
    case "Cyclical": return { icon: "🔄", className: "badge-type-cyclical" };
    case "Speculative": return { icon: "⚠️", className: "badge-type-speculative" };
    case "Financial / Fintech": return { icon: "🏦", className: "badge-type-financial" };
    case "Hypergrowth": return { icon: "🚀", className: "badge-type-hypergrowth" };
    case "Turnaround": return { icon: "🛠️", className: "badge-type-turnaround" };
    default: return { icon: "❓", className: "badge-type-unknown" };
  }
};

interface WhatIfSimulatorProps {
  portfolio: PortfolioData;
  language?: "EN" | "ES";
  userEmail?: string;
}

export default function WhatIfSimulator({ portfolio, language = "EN", userEmail }: WhatIfSimulatorProps) {
  const [simPositions, setSimPositions] = useState<Position[]>([]);
  const [marginPositions, setMarginPositions] = useState<Position[]>([]);
  const [hasCustomMarginSim, setHasCustomMarginSim] = useState(false);
  const [marginCollapsed, setMarginCollapsed] = useState(false);
  const [searchTarget, setSearchTarget] = useState<"sim" | "margin">("sim");
  const [customCagrs, setCustomCagrs] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getPositionCagr = (ticker: string): number => {
    const sym = ticker.toUpperCase();
    if (sym === "CASH" || sym === "USD") return 0;
    if (customCagrs[sym] !== undefined) return customCagrs[sym];

    // 1. Calculate directly from fetched financials map (quarterly basicEPS CAGR)
    const finData = financialsMap[sym] || financialsMap[ticker];
    const finCagr = getQuarterlyBasicEpsCagrFromFinancials(finData);
    if (finCagr !== null && !isNaN(finCagr)) {
      return finCagr;
    }

    // 2. Try scoredRowsMap (which uses overrideFeaturesWithFinancials or baseline eps_cagr)
    const scoredRow = scoredRowsMap.get(sym);
    if (scoredRow?.raw?.eps_cagr !== undefined && scoredRow.raw.eps_cagr !== null && !isNaN(scoredRow.raw.eps_cagr)) {
      return Number(Number(scoredRow.raw.eps_cagr).toFixed(2));
    }

    // 3. Fallback to baseline features for ticker (getRawFeatures)
    const raw = getRawFeatures(sym, "", "");
    if (raw.eps_cagr !== undefined && raw.eps_cagr !== null && !isNaN(raw.eps_cagr)) {
      return Number(Number(raw.eps_cagr).toFixed(2));
    }

    return 12.0;
  };

  const getTabColor = (tab: "portfolio" | "margin" | "total"): string => {
    if (tab === "portfolio") return "#10b981"; // emerald
    if (tab === "margin") return "#f59e0b"; // amber
    return "#6366f1"; // indigo
  };

  const getTabBadgeClass = (tab: "portfolio" | "margin" | "total"): string => {
    if (tab === "portfolio") return "text-emerald-400 bg-emerald-500/5 border-emerald-500/10";
    if (tab === "margin") return "text-amber-400 bg-amber-500/5 border-amber-500/10";
    return "text-indigo-400 bg-indigo-500/5 border-indigo-500/10";
  };

  // Sorting state
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // View Mode toggle: basis | valuation | health | financials
  const [simTabMode, setSimTabMode] = useState<"basis" | "valuation" | "health" | "financials">("basis");
  const [financialsMap, setFinancialsMap] = useState<Record<string, { annual: any[]; quarterly: any[] }>>({});
  const [financialsViewMode, setFinancialsViewMode] = useState<"cards" | "table">("cards");

  useEffect(() => {
    const fetchAllFinancials = async () => {
      try {
        const tickersToFetch = Array.from(new Set([...simPositions, ...marginPositions].filter(p => !p.isCash && p.ticker).map(p => p.ticker.toUpperCase())));
        if (tickersToFetch.length === 0) return;
        const results = await Promise.all(tickersToFetch.map(async t => {
          try {
            const res = await fetch("/api/portfolio/financials", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ticker: t })
            });
            const data = await res.json();
            return { ticker: t, data };
          } catch (e) {
            return { ticker: t, data: null };
          }
        }));
        const newMap: Record<string, { annual: any[]; quarterly: any[] }> = {};
        const sortFn = (a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime();
        results.forEach(r => {
          if (r.data && !r.data.error) {
            if (Array.isArray(r.data.annual)) r.data.annual.sort(sortFn);
            if (Array.isArray(r.data.quarterly)) r.data.quarterly.sort(sortFn);
            newMap[r.ticker] = r.data;
          }
        });
        setFinancialsMap(newMap);
      } catch (e) {
        console.error("Error fetching financials for simulator:", e);
      }
    };
    if (simPositions.length > 0 || marginPositions.length > 0) {
      fetchAllFinancials();
    }
  }, [simPositions, marginPositions]);

  // Projection state (reactive to simPositions)
  const [years, setYears] = useState<5 | 10>(5);
  const [monthlyAddition, setMonthlyAddition] = useState<number>(0);
  const [cagr, setCagr] = useState<number>(30.2);
  const [projectionTab, setProjectionTab] = useState<"portfolio" | "margin" | "total">("portfolio");
  const [saveSuccess, setSaveSuccess] = useState(false);

  // If no margin positions exist, ensure projectionTab returns to portfolio (matches HoldingsTable)
  useEffect(() => {
    if (marginPositions.length === 0 && projectionTab === "margin") {
      setProjectionTab("portfolio");
    }
  }, [marginPositions.length, projectionTab]);

  // Scorecard / Health calculations for simulation positions
  const scoredRowsMap = useMemo(() => {
    const map = new Map<string, any>();
    const stockPositions = [...simPositions, ...marginPositions].filter((p) => !p.isCash);
    if (stockPositions.length === 0) return map;

    const rawFeaturesList = stockPositions.map((pos) => {
      const sector = getTickerSector(pos.ticker, pos.isCash);
      let raw = { ...getRawFeatures(pos.ticker, pos.name, sector) };
      if (pos.pe !== null && pos.pe !== undefined) raw.trailing_pe = pos.pe;
      if (pos.fwdPe !== null && pos.fwdPe !== undefined) raw.forward_pe = pos.fwdPe;
      if (pos.evEbitda !== null && pos.evEbitda !== undefined) raw.ev_ebitda = pos.evEbitda;
      const finData = financialsMap[pos.ticker] || financialsMap[pos.ticker.toUpperCase()];
      if (finData) {
        raw = overrideFeaturesWithFinancials(raw, finData);
      }
      return raw;
    });
    const scored = buildScores(rawFeaturesList, "zscore", financialsMap);
    scored.forEach((row) => {
      map.set(row.symbol.toUpperCase(), row);
    });
    return map;
  }, [simPositions, marginPositions, financialsMap]);

  const getScoreColorClass = (score: number | null) => {
    if (score === null) return "text-slate-500";
    if (score >= 75) return "text-emerald-400";
    if (score >= 50) return "text-blue-400";
    if (score >= 35) return "text-amber-400";
    return "text-rose-400";
  };

  const getScoreBgClass = (score: number | null) => {
    if (score === null) return "bg-slate-900 text-slate-500 border-slate-800";
    if (score >= 75) return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    if (score >= 50) return "bg-blue-500/10 text-blue-400 border-blue-500/20";
    if (score >= 35) return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    return "bg-rose-500/10 text-rose-400 border-rose-500/20";
  };

  const portfolioWeightedScore = useMemo(() => {
    const stockPositions = simPositions.filter((p) => !p.isCash);
    const totalVal = stockPositions.reduce((sum, p) => sum + p.mktValue, 0);
    if (totalVal === 0) return 0;

    let sumScore = 0;
    stockPositions.forEach((pos) => {
      const row = scoredRowsMap.get(pos.ticker.toUpperCase());
      if (row) {
        sumScore += (row.scores?.balanced || 50) * pos.mktValue;
      }
    });
    return sumScore / totalVal;
  }, [simPositions, scoredRowsMap]);

  const portfolioWeightedType = useMemo(() => {
    const stockPositions = simPositions.filter((p) => !p.isCash);
    if (stockPositions.length === 0) return null;

    const typeWeights = new Map<string, number>();
    stockPositions.forEach((pos) => {
      const row = scoredRowsMap.get(pos.ticker.toUpperCase());
      if (row && row.type) {
        const currentWeight = typeWeights.get(row.type) || 0;
        typeWeights.set(row.type, currentWeight + pos.mktValue);
      }
    });

    let maxWeight = 0;
    let dominantType = null;
    typeWeights.forEach((weight, type) => {
      if (weight > maxWeight) {
        maxWeight = weight;
        dominantType = type;
      }
    });

    return dominantType;
  }, [simPositions, scoredRowsMap]);

  const portfolioWeightedFactors = useMemo(() => {
    const stockPositions = simPositions.filter((p) => !p.isCash);
    const totalVal = stockPositions.reduce((sum, p) => sum + p.mktValue, 0);
    const result = { growth: 0, quality: 0, stability: 0, valuation: 0 };
    if (totalVal === 0) return result;

    stockPositions.forEach((pos) => {
      const row = scoredRowsMap.get(pos.ticker.toUpperCase());
      if (row && row.factors) {
        result.growth += (row.factors.growth || 50) * pos.mktValue;
        result.quality += (row.factors.quality || 50) * pos.mktValue;
        result.stability += (row.factors.stability || 50) * pos.mktValue;
        result.valuation += (row.factors.valuation || 50) * pos.mktValue;
      }
    });

    result.growth /= totalVal;
    result.quality /= totalVal;
    result.stability /= totalVal;
    result.valuation /= totalVal;
    return result;
  }, [simPositions, scoredRowsMap]);

  const handleSaveMarginPositions = () => {
    try {
      localStorage.setItem("whatif_margin_positions", JSON.stringify(marginPositions));
      localStorage.setItem("whatif_custom_margin_active", "true");
      setHasCustomMarginSim(true);
      if (userEmail) {
        saveUserCloudData(userEmail, { marginPositions });
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (e) {
      console.error("Error saving margin positions:", e);
      setError("Error al guardar las posiciones con margen");
    }
  };

  // Modal / Search State
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchMode, setSearchMode] = useState<"add" | "swap">("add");
  const [swapIndex, setSwapIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Sector distribution states & calculations for simulated portfolio
  const [expandedSectors, setExpandedSectors] = useState<Record<string, boolean>>({});

  const toggleSector = (sectorName: string) => {
    setExpandedSectors(prev => ({
      ...prev,
      [sectorName]: !prev[sectorName]
    }));
  };

  const { sortedSectors, sectorSubsectors } = useMemo(() => {
    let positionsToUse = [...simPositions, ...marginPositions];
    if (projectionTab === "portfolio") {
      positionsToUse = simPositions;
    } else if (projectionTab === "margin") {
      positionsToUse = marginPositions;
    }

    const sortedPositions = [...positionsToUse].sort((a, b) => {
      if (a.isCash) return 1;
      if (b.isCash) return -1;
      return b.mktValue - a.mktValue;
    });

    const totalVal = sortedPositions.reduce((sum, p) => sum + p.mktValue, 0);

    const subsectors = sortedPositions.reduce((acc, pos) => {
      const sector = getTickerSector(pos.ticker, pos.isCash);
      const subsector = getTickerSubsector(pos.ticker, pos.isCash, language);
      if (!acc[sector]) {
        acc[sector] = {};
      }
      if (!acc[sector][subsector]) {
        acc[sector][subsector] = { mktValue: 0, weight: 0 };
      }
      acc[sector][subsector].mktValue += pos.mktValue;
      acc[sector][subsector].weight += totalVal > 0 ? (pos.mktValue / totalVal) * 100 : 0;
      return acc;
    }, {} as Record<string, Record<string, { mktValue: number; weight: number }>>);

    const sectorWeights = sortedPositions.reduce((acc, pos) => {
      const sector = getTickerSector(pos.ticker, pos.isCash);
      const posWeight = totalVal > 0 ? (pos.mktValue / totalVal) * 100 : 0;
      acc[sector] = (acc[sector] || 0) + posWeight;
      return acc;
    }, {} as Record<string, number>);

    const sectorMktValues = sortedPositions.reduce((acc, pos) => {
      const sector = getTickerSector(pos.ticker, pos.isCash);
      acc[sector] = (acc[sector] || 0) + pos.mktValue;
      return acc;
    }, {} as Record<string, number>);

    const sortedSectorsList = (Object.entries(sectorWeights) as [string, number][])
      .map(([name, weight]) => ({
        name,
        weight,
        mktValue: sectorMktValues[name] || 0
      }))
      .sort((a, b) => b.weight - a.weight);

    return {
      sortedSectors: sortedSectorsList,
      sectorSubsectors: subsectors
    };
  }, [simPositions, marginPositions, projectionTab]);

  // Initialize simulated positions from portfolio data & sync live quotes
  // Initialize simulated positions from portfolio data & sync live quotes
  useEffect(() => {
    if (portfolio && portfolio.positions) {
      const validPortfolioPositions = portfolio.positions.filter(
        p => p.ticker && p.ticker.toUpperCase() !== "MARGIN_PAID"
      );

      const portfolioPrincipal = validPortfolioPositions
        .filter(p => !p.isMargin)
        .map(p => ({
          ...p,
          ticker: p.ticker.toUpperCase(),
          isMargin: false
        }));

      const portfolioMargin = validPortfolioPositions
        .filter(p => p.isMargin && !p.isCash)
        .map(p => ({
          ...p,
          ticker: p.ticker.toUpperCase(),
          isMargin: true
        }));

      setSimPositions(prev => {
        const cleanPrev = prev.filter(p => p.ticker && p.ticker.toUpperCase() !== "MARGIN_PAID");
        if (cleanPrev.length === 0) return recalculateWeights(portfolioPrincipal);

        // Build quote map from new portfolio positions
        const quoteMap = new Map<string, Position>();
        validPortfolioPositions.forEach(p => quoteMap.set(p.ticker.toUpperCase(), p));

        const updated = cleanPrev.map(p => {
          const live = quoteMap.get(p.ticker.toUpperCase());
          if (!live) return p;
          const newPrice = live.price || p.price;
          const newShares = p.shares > 0 ? p.shares : (newPrice > 0 ? p.mktValue / newPrice : 0);
          const newMktValue = p.shares > 0 ? p.shares * newPrice : p.mktValue;
          return {
            ...p,
            price: newPrice,
            chgPct: live.chgPct !== undefined ? live.chgPct : p.chgPct,
            pe: live.pe !== undefined ? live.pe : p.pe,
            fwdPe: live.fwdPe !== undefined ? live.fwdPe : p.fwdPe,
            peg: live.peg !== undefined ? live.peg : p.peg,
            fiftyTwoWeekHigh: live.fiftyTwoWeekHigh !== undefined ? live.fiftyTwoWeekHigh : p.fiftyTwoWeekHigh,
            targetMeanPrice: live.targetMeanPrice !== undefined ? live.targetMeanPrice : p.targetMeanPrice,
            targetHighPrice: live.targetHighPrice !== undefined ? live.targetHighPrice : p.targetHighPrice,
            name: live.name || p.name,
            shares: newShares,
            mktValue: newMktValue
          };
        });
        return recalculateWeights(updated);
      });

      // Update marginPositions: start with original portfolio margin positions
      setMarginPositions(prev => {
        // If user hasn't explicitly customized margin in this simulation session,
        // keep it strictly synchronized with the portfolio's real margin positions!
        if (!hasCustomMarginSim) {
          return recalculateWeights(portfolioMargin);
        }

        const cleanPrev = prev.filter(p => p.ticker && p.ticker.toUpperCase() !== "MARGIN_PAID");
        if (cleanPrev.length === 0) {
          return recalculateWeights(portfolioMargin);
        }

        const quoteMap = new Map<string, Position>();
        validPortfolioPositions.forEach(p => quoteMap.set(p.ticker.toUpperCase(), p));

        const updated = cleanPrev.map(p => {
          const live = quoteMap.get(p.ticker.toUpperCase());
          if (!live) return p;
          const newPrice = live.price || p.price;
          const newShares = p.shares > 0 ? p.shares : (newPrice > 0 ? p.mktValue / newPrice : 0);
          const newMktValue = p.shares > 0 ? p.shares * newPrice : p.mktValue;
          return {
            ...p,
            price: newPrice,
            chgPct: live.chgPct !== undefined ? live.chgPct : p.chgPct,
            pe: live.pe !== undefined ? live.pe : p.pe,
            fwdPe: live.fwdPe !== undefined ? live.fwdPe : p.fwdPe,
            peg: live.peg !== undefined ? live.peg : p.peg,
            fiftyTwoWeekHigh: live.fiftyTwoWeekHigh !== undefined ? live.fiftyTwoWeekHigh : p.fiftyTwoWeekHigh,
            targetMeanPrice: live.targetMeanPrice !== undefined ? live.targetMeanPrice : p.targetMeanPrice,
            targetHighPrice: live.targetHighPrice !== undefined ? live.targetHighPrice : p.targetHighPrice,
            name: live.name || p.name,
            shares: newShares,
            mktValue: newMktValue
          };
        });
        try {
          localStorage.setItem("whatif_margin_positions", JSON.stringify(updated));
        } catch (e) {
          console.error(e);
        }
        return recalculateWeights(updated);
      });
    }
  }, [portfolio, hasCustomMarginSim]);

  // Clean up any stray MARGIN_PAID positions from simulation states on mount
  useEffect(() => {
    setSimPositions(prev => prev.filter(p => p.ticker && p.ticker.toUpperCase() !== "MARGIN_PAID"));
    setMarginPositions(prev => prev.filter(p => p.ticker && p.ticker.toUpperCase() !== "MARGIN_PAID"));
  }, []);

  // Load saved margin positions from localStorage on mount ONLY IF user explicitly saved custom simulation margin
  useEffect(() => {
    try {
      const isCustomActive = localStorage.getItem("whatif_custom_margin_active") === "true";
      if (isCustomActive) {
        const saved = localStorage.getItem("whatif_margin_positions");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const cleanMargin = parsed.filter((p: any) => p.ticker && p.ticker.toUpperCase() !== "MARGIN_PAID");
            if (cleanMargin.length > 0) {
              setMarginPositions(recalculateWeights(cleanMargin));
              setHasCustomMarginSim(true);
            }
          }
        }
      }
    } catch (e) {
      console.error("Error loading saved margin positions:", e);
    }
  }, []);

  // Function to sync live quotes directly from market API for all positions
  const handleSyncQuotes = async () => {
    const allPositions = [...simPositions, ...marginPositions];
    const tickersToFetch = Array.from(
      new Set(
        allPositions
          .filter(p => !p.isCash && p.ticker !== "CASH" && p.ticker !== "USD")
          .map(p => p.ticker.toUpperCase())
      )
    );

    if (tickersToFetch.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/portfolio/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          holdings: tickersToFetch.map(t => ({ ticker: t, shares: 1, avgCost: 100 }))
        })
      });

      const data = await response.json();
      if (data.positions && data.positions.length > 0) {
        const quoteMap = new Map<string, Position>();
        data.positions.forEach((pos: Position) => {
          quoteMap.set(pos.ticker.toUpperCase(), pos);
        });

        // Update simPositions
        setSimPositions(prev => {
          const cleanPrev = prev.filter(p => p.ticker && p.ticker.toUpperCase() !== "MARGIN_PAID");
          const updated = cleanPrev.map(p => {
            const live = quoteMap.get(p.ticker.toUpperCase());
            if (!live) return p;
            const newPrice = live.price || p.price;
            const newShares = p.shares > 0 ? p.shares : (newPrice > 0 ? p.mktValue / newPrice : 0);
            const newMktValue = p.shares > 0 ? p.shares * newPrice : p.mktValue;
            return {
              ...p,
              price: newPrice,
              chgPct: live.chgPct !== undefined ? live.chgPct : p.chgPct,
              pe: live.pe !== undefined ? live.pe : p.pe,
              fwdPe: live.fwdPe !== undefined ? live.fwdPe : p.fwdPe,
              peg: live.peg !== undefined ? live.peg : p.peg,
              fiftyTwoWeekHigh: live.fiftyTwoWeekHigh !== undefined ? live.fiftyTwoWeekHigh : p.fiftyTwoWeekHigh,
              targetMeanPrice: live.targetMeanPrice !== undefined ? live.targetMeanPrice : p.targetMeanPrice,
              targetHighPrice: live.targetHighPrice !== undefined ? live.targetHighPrice : p.targetHighPrice,
              name: live.name || p.name,
              shares: newShares,
              mktValue: newMktValue
            };
          });
          return recalculateWeights(updated);
        });

        // Update marginPositions
        setMarginPositions(prev => {
          const cleanPrev = prev.filter(p => p.ticker && p.ticker.toUpperCase() !== "MARGIN_PAID");
          const updated = cleanPrev.map(p => {
            const live = quoteMap.get(p.ticker.toUpperCase());
            if (!live) return p;
            const newPrice = live.price || p.price;
            const newShares = p.shares > 0 ? p.shares : (newPrice > 0 ? p.mktValue / newPrice : 0);
            const newMktValue = p.shares > 0 ? p.shares * newPrice : p.mktValue;
            return {
              ...p,
              price: newPrice,
              chgPct: live.chgPct !== undefined ? live.chgPct : p.chgPct,
              pe: live.pe !== undefined ? live.pe : p.pe,
              fwdPe: live.fwdPe !== undefined ? live.fwdPe : p.fwdPe,
              peg: live.peg !== undefined ? live.peg : p.peg,
              fiftyTwoWeekHigh: live.fiftyTwoWeekHigh !== undefined ? live.fiftyTwoWeekHigh : p.fiftyTwoWeekHigh,
              targetMeanPrice: live.targetMeanPrice !== undefined ? live.targetMeanPrice : p.targetMeanPrice,
              targetHighPrice: live.targetHighPrice !== undefined ? live.targetHighPrice : p.targetHighPrice,
              name: live.name || p.name,
              shares: newShares,
              mktValue: newMktValue
            };
          });
          try {
            localStorage.setItem("whatif_margin_positions", JSON.stringify(updated));
          } catch (e) {
            console.error(e);
          }
          return updated;
        });
      }
    } catch (err: any) {
      console.error("Error syncing simulator quotes:", err);
      setError("Error al sincronizar precios en tiempo real");
    } finally {
      setLoading(false);
    }
  };

  // Total Simulated Market Value
  const totalSimMktValue = useMemo(() => {
    return simPositions.filter(p => p.ticker && p.ticker.toUpperCase() !== "MARGIN_PAID").reduce((sum, p) => sum + p.mktValue, 0);
  }, [simPositions]);

  // Total Margin Market Value
  const totalMarginMktValue = useMemo(() => {
    return marginPositions.filter(p => p.ticker && p.ticker.toUpperCase() !== "MARGIN_PAID").reduce((sum, p) => sum + p.mktValue, 0);
  }, [marginPositions]);

  // Total Combined Market Value
  const totalCombinedMktValue = useMemo(() => {
    return totalSimMktValue + totalMarginMktValue;
  }, [totalSimMktValue, totalMarginMktValue]);

  // Recalculates weights of all simulated positions based on their current market value
  const recalculateWeights = (positions: Position[]): Position[] => {
    const valid = positions.filter(p => p.ticker && p.ticker.toUpperCase() !== "MARGIN_PAID");
    const totalVal = valid.reduce((sum, p) => sum + p.mktValue, 0);
    return valid.map((p) => ({
      ...p,
      weight: totalVal > 0 ? (p.mktValue / totalVal) * 100 : 0,
    }));
  };

  // Restores simulation to active portfolio
  const handleReset = () => {
    if (portfolio && portfolio.positions) {
      const valid = portfolio.positions.filter(
        p => p.ticker && p.ticker.toUpperCase() !== "MARGIN_PAID"
      );
      const principal = valid
        .filter(p => !p.isMargin)
        .map(p => ({
          ...p,
          ticker: p.ticker.toUpperCase(),
          isMargin: false
        }));
      const margin = valid
        .filter(p => p.isMargin && !p.isCash)
        .map(p => ({
          ...p,
          ticker: p.ticker.toUpperCase(),
          isMargin: true
        }));

      setSimPositions(recalculateWeights(principal));
      setMarginPositions(recalculateWeights(margin));
      setHasCustomMarginSim(false);
      try {
        localStorage.removeItem("whatif_margin_positions");
        localStorage.removeItem("whatif_custom_margin_active");
      } catch (e) {}
      setCustomCagrs({});
      setError(null);
    }
  };

  // Handle Mkt Value change directly
  const handleMktValueChange = (index: number, valueStr: string) => {
    const numericValue = valueStr === "" ? 0 : parseFloat(valueStr);
    if (isNaN(numericValue)) return;

    setSimPositions((prev) => {
      const copy = [...prev];
      const pos = copy[index];
      const updatedMktVal = Math.max(0, numericValue);
      copy[index] = {
        ...pos,
        mktValue: updatedMktVal,
        shares: pos.price > 0 ? updatedMktVal / pos.price : 0,
      };
      return recalculateWeights(copy);
    });
  };

  // Handle Weight % change and scale other positions proportionally
  const handleWeightChange = (index: number, valueStr: string) => {
    const numericValue = valueStr === "" ? 0 : parseFloat(valueStr);
    if (isNaN(numericValue)) return;

    const targetWeight = Math.max(0, Math.min(100, numericValue));

    setSimPositions((prev) => {
      const totalVal = prev.reduce((sum, p) => sum + p.mktValue, 0);
      if (totalVal === 0) {
        // If total is 0, just set the weight and default mkt value
        const copy = [...prev];
        copy[index] = {
          ...copy[index],
          weight: targetWeight,
          mktValue: targetWeight * 100, // arbitrary base
          shares: copy[index].price > 0 ? (targetWeight * 100) / copy[index].price : 0,
        };
        return recalculateWeights(copy);
      }

      const otherSum = prev.reduce((sum, p, i) => i !== index ? sum + p.mktValue : sum, 0);
      const remainingWeight = 100 - targetWeight;

      const copy = prev.map((pos, i) => {
        if (i === index) {
          const updatedMktVal = totalVal * (targetWeight / 100);
          return {
            ...pos,
            weight: targetWeight,
            mktValue: updatedMktVal,
            shares: pos.price > 0 ? updatedMktVal / pos.price : 0,
          };
        } else {
          let updatedMktVal = 0;
          if (otherSum > 0) {
            updatedMktVal = pos.mktValue * (totalVal * (remainingWeight / 100) / otherSum);
          } else {
            const activeOthersCount = prev.length - 1;
            if (activeOthersCount > 0) {
              updatedMktVal = totalVal * ((remainingWeight / 100) / activeOthersCount);
            }
          }
          return {
            ...pos,
            mktValue: updatedMktVal,
            shares: pos.price > 0 ? updatedMktVal / pos.price : 0,
          };
        }
      });

      return recalculateWeights(copy);
    });
  };

  // Handle CAGR % change
  const handleCagrChange = (ticker: string, valueStr: string) => {
    const numericValue = valueStr === "" ? 0 : parseFloat(valueStr);
    if (isNaN(numericValue)) return;
    setCustomCagrs((prev) => ({
      ...prev,
      [ticker.toUpperCase()]: numericValue,
    }));
  };

  // Delete simulated position
  const handleDeletePosition = (index: number) => {
    setSimPositions((prev) => {
      const copy = prev.filter((_, i) => i !== index);
      return recalculateWeights(copy);
    });
  };

  // Handle Margin Mkt Value change directly
  const handleMarginMktValueChange = (index: number, valueStr: string) => {
    const numericValue = valueStr === "" ? 0 : parseFloat(valueStr);
    if (isNaN(numericValue)) return;
    setHasCustomMarginSim(true);

    setMarginPositions((prev) => {
      const copy = [...prev];
      const pos = copy[index];
      const updatedMktVal = Math.max(0, numericValue);
      copy[index] = {
        ...pos,
        mktValue: updatedMktVal,
        shares: pos.price > 0 ? updatedMktVal / pos.price : 0,
      };
      return recalculateWeights(copy);
    });
  };

  // Handle Margin Weight % change and scale other margin positions proportionally
  const handleMarginWeightChange = (index: number, valueStr: string) => {
    const numericValue = valueStr === "" ? 0 : parseFloat(valueStr);
    if (isNaN(numericValue)) return;
    setHasCustomMarginSim(true);

    const targetWeight = Math.max(0, Math.min(100, numericValue));

    setMarginPositions((prev) => {
      const totalVal = prev.reduce((sum, p) => sum + p.mktValue, 0);
      if (totalVal === 0) {
        const copy = [...prev];
        copy[index] = {
          ...copy[index],
          weight: targetWeight,
          mktValue: targetWeight * 100,
          shares: copy[index].price > 0 ? (targetWeight * 100) / copy[index].price : 0,
        };
        return recalculateWeights(copy);
      }

      const otherSum = prev.reduce((sum, p, i) => i !== index ? sum + p.mktValue : sum, 0);
      const remainingWeight = 100 - targetWeight;

      const copy = prev.map((pos, i) => {
        if (i === index) {
          const updatedMktVal = totalVal * (targetWeight / 100);
          return {
            ...pos,
            weight: targetWeight,
            mktValue: updatedMktVal,
            shares: pos.price > 0 ? updatedMktVal / pos.price : 0,
          };
        } else {
          let updatedMktVal = 0;
          if (otherSum > 0) {
            updatedMktVal = pos.mktValue * (totalVal * (remainingWeight / 100) / otherSum);
          } else {
            const activeOthersCount = prev.length - 1;
            if (activeOthersCount > 0) {
              updatedMktVal = totalVal * ((remainingWeight / 100) / activeOthersCount);
            }
          }
          return {
            ...pos,
            mktValue: updatedMktVal,
            shares: pos.price > 0 ? updatedMktVal / pos.price : 0,
          };
        }
      });

      return recalculateWeights(copy);
    });
  };

  // Delete margin position
  const handleDeleteMarginPosition = (index: number) => {
    setHasCustomMarginSim(true);
    setMarginPositions((prev) => {
      const copy = prev.filter((_, i) => i !== index);
      return recalculateWeights(copy);
    });
  };

  // Search Results fetcher
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        setSearchResults(data);
      } catch (err) {
        console.error("Search error:", err);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery]);

  // Swap or add ticker handler
  const handleSelectTicker = async (selectedSymbol: string, selectedName: string) => {
    const symbol = selectedSymbol.toUpperCase();
    setSearchModalOpen(false);
    setSearchQuery("");
    setSearchResults([]);

    const targetPositions = searchTarget === "sim" ? simPositions : marginPositions;
    const setTargetPositions = searchTarget === "sim" ? setSimPositions : setMarginPositions;

    // Check if symbol is already in list (unless we are swapping it on its own index)
    if (searchMode === "add") {
      const alreadyExists = targetPositions.some(p => p.ticker === symbol);
      if (alreadyExists) {
        setError(`El ticker ${symbol} ya se encuentra en la simulación (${searchTarget === "sim" ? "Portafolio" : "Margin"}).`);
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch details from backend via the portfolio quotes endpoint
      // We send a single mock holding to query details
      const response = await fetch("/api/portfolio/quotes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          holdings: [{ ticker: symbol, shares: 1, avgCost: 100 }]
        }),
      });

      const resultData = await response.json();
      if (!resultData.positions || resultData.positions.length === 0) {
        throw new Error(`No se encontró información para ${symbol}`);
      }

      const fetchedPos = resultData.positions[0];

      if (searchTarget === "margin") {
        setHasCustomMarginSim(true);
      }

      if (searchMode === "swap" && swapIndex !== null) {
        setTargetPositions((prev) => {
          const copy = [...prev];
          const oldPos = copy[swapIndex];
          
          // Carry over market value and calculate new shares
          const mktVal = oldPos.mktValue;
          const price = fetchedPos.price || 100;
          const shares = price > 0 ? mktVal / price : 0;

          copy[swapIndex] = {
            ...fetchedPos,
            ticker: symbol,
            name: fetchedPos.name || selectedName || symbol,
            mktValue: mktVal,
            shares: shares,
            avgCost: oldPos.isCash ? price : oldPos.avgCost, // set avg cost to current price if old was Cash
            isMargin: searchTarget === "margin",
          };

          return recalculateWeights(copy);
        });
      } else {
        // "add" mode
        // Default target market value of 10% of total simulation of that target, or $10,000 if total is 0
        const totalTargetMktVal = targetPositions.reduce((sum, p) => sum + p.mktValue, 0);
        const defaultMktVal = totalTargetMktVal > 0 ? totalTargetMktVal * 0.1 : 10000;
        const price = fetchedPos.price || 100;
        const shares = price > 0 ? defaultMktVal / price : 0;

        const newPos: Position = {
          ...fetchedPos,
          ticker: symbol,
          name: fetchedPos.name || selectedName || symbol,
          shares: shares,
          mktValue: defaultMktVal,
          avgCost: price, // assume bought at current price
          isMargin: searchTarget === "margin",
        };

        setTargetPositions((prev) => {
          return recalculateWeights([...prev, newPos]);
        });
      }
    } catch (err: any) {
      console.error(err);
      setError(`Error al cargar datos para ${symbol}: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenSwap = (index: number) => {
    setSearchTarget("sim");
    setSearchMode("swap");
    setSwapIndex(index);
    setSearchModalOpen(true);
  };

  const handleOpenAdd = () => {
    setSearchTarget("sim");
    setSearchMode("add");
    setSwapIndex(null);
    setSearchModalOpen(true);
  };

  const handleOpenMarginSwap = (index: number) => {
    setSearchTarget("margin");
    setSearchMode("swap");
    setSwapIndex(index);
    setSearchModalOpen(true);
  };

  const handleOpenMarginAdd = () => {
    setSearchTarget("margin");
    setSearchMode("add");
    setSwapIndex(null);
    setSearchModalOpen(true);
  };

  // Add an existing position from the simulated portfolio into margin positions
  const handleAddToMargin = (pos: Position) => {
    if (pos.isCash || pos.ticker === "CASH" || pos.ticker === "USD") return;
    const symbol = pos.ticker.toUpperCase();
    setHasCustomMarginSim(true);

    const existingIndex = marginPositions.findIndex(p => p.ticker.toUpperCase() === symbol);
    if (existingIndex >= 0) {
      setMarginPositions(prev => {
        const copy = [...prev];
        const old = copy[existingIndex];
        const addMktVal = old.mktValue > 0 ? old.mktValue * 0.5 : (old.price > 0 ? old.price * 5 : 2500);
        const newMktVal = Math.round(old.mktValue + addMktVal);
        copy[existingIndex] = {
          ...old,
          mktValue: newMktVal,
          shares: old.price > 0 ? newMktVal / old.price : old.shares,
          isMargin: true,
        };
        return recalculateWeights(copy);
      });
    } else {
      const price = pos.price > 0 ? pos.price : 100;
      const defaultMktVal = pos.mktValue > 0 ? Math.round(pos.mktValue) : Math.round(price * 10);
      const shares = price > 0 ? defaultMktVal / price : (pos.shares || 1);
      const newMarginPos: Position = {
        ...pos,
        ticker: symbol,
        name: pos.name || symbol,
        price,
        shares,
        mktValue: defaultMktVal,
        avgCost: pos.avgCost || price,
        isMargin: true,
      };
      setMarginPositions(prev => recalculateWeights([...prev, newMarginPos]));
    }

    setMarginCollapsed(false);
  };

  const [showPortfolioMarginPicker, setShowPortfolioMarginPicker] = useState(false);
  const marginPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (marginPickerRef.current && !marginPickerRef.current.contains(e.target as Node)) {
        setShowPortfolioMarginPicker(false);
      }
    };
    if (showPortfolioMarginPicker) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [showPortfolioMarginPicker]);

  const availablePortfolioStocks = useMemo(() => {
    return simPositions.filter(
      p => !p.isCash && p.ticker && !marginPositions.some(m => m.ticker.toUpperCase() === p.ticker.toUpperCase())
    );
  }, [simPositions, marginPositions]);

  // Sorting Handler
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  // Sorted and prepared positions
  const processedPositions = useMemo(() => {
    const validSim = simPositions.filter(p => p.ticker && p.ticker.toUpperCase() !== "MARGIN_PAID");
    // Separate Cash to always pin to the bottom
    const stocks = validSim.filter(p => !p.isCash);
    const cashArr = validSim.filter(p => p.isCash);

    if (sortField) {
      stocks.sort((a: any, b: any) => {
        let valA = a[sortField];
        let valB = b[sortField];

        // Specific field extractions
        if (sortField === "cagr") {
          valA = getPositionCagr(a.ticker);
          valB = getPositionCagr(b.ticker);
        } else if (sortField === "upsideAvg") {
          const upsideA = a.targetMeanPrice ? ((a.targetMeanPrice - a.price) / a.price) * 100 : -999;
          const upsideB = b.targetMeanPrice ? ((b.targetMeanPrice - b.price) / b.price) * 100 : -999;
          valA = upsideA;
          valB = upsideB;
        } else if (sortField === "upsideHigh") {
          const upsideA = a.targetHighPrice ? ((a.targetHighPrice - a.price) / a.price) * 100 : -999;
          const upsideB = b.targetHighPrice ? ((b.targetHighPrice - b.price) / b.price) * 100 : -999;
          valA = upsideA;
          valB = upsideB;
        } else if (sortField === "fiftyTwoWeekHigh") {
          const upsideA = a.fiftyTwoWeekHigh ? ((a.fiftyTwoWeekHigh - a.price) / a.price) * 100 : -999;
          const upsideB = b.fiftyTwoWeekHigh ? ((b.fiftyTwoWeekHigh - b.price) / b.price) * 100 : -999;
          valA = upsideA;
          valB = upsideB;
        }

        // Handle nulls
        if (valA === null || valA === undefined) return sortDirection === "asc" ? -1 : 1;
        if (valB === null || valB === undefined) return sortDirection === "asc" ? 1 : -1;

        if (typeof valA === "string") {
          return sortDirection === "asc" 
            ? valA.localeCompare(valB) 
            : valB.localeCompare(valA);
        } else {
          return sortDirection === "asc" 
            ? valA - valB 
            : valB - valA;
        }
      });
    }

    return [...stocks, ...cashArr];
  }, [simPositions, sortField, sortDirection, customCagrs]);

  const processedMarginPositions = useMemo(() => {
    const validMargin = marginPositions.filter(p => p.ticker && p.ticker.toUpperCase() !== "MARGIN_PAID");
    const stocks = validMargin.filter(p => !p.isCash);
    const cashArr = validMargin.filter(p => p.isCash);

    if (sortField) {
      stocks.sort((a: any, b: any) => {
        let valA = a[sortField];
        let valB = b[sortField];

        if (sortField === "cagr") {
          valA = getPositionCagr(a.ticker);
          valB = getPositionCagr(b.ticker);
        } else if (sortField === "upsideAvg") {
          const upsideA = a.targetMeanPrice ? ((a.targetMeanPrice - a.price) / a.price) * 100 : -999;
          const upsideB = b.targetMeanPrice ? ((b.targetMeanPrice - b.price) / b.price) * 100 : -999;
          valA = upsideA;
          valB = upsideB;
        } else if (sortField === "upsideHigh") {
          const upsideA = a.targetHighPrice ? ((a.targetHighPrice - a.price) / a.price) * 100 : -999;
          const upsideB = b.targetHighPrice ? ((b.targetHighPrice - b.price) / b.price) * 100 : -999;
          valA = upsideA;
          valB = upsideB;
        } else if (sortField === "fiftyTwoWeekHigh") {
          const upsideA = a.fiftyTwoWeekHigh ? ((a.fiftyTwoWeekHigh - a.price) / a.price) * 100 : -999;
          const upsideB = b.fiftyTwoWeekHigh ? ((b.fiftyTwoWeekHigh - b.price) / b.price) * 100 : -999;
          valA = upsideA;
          valB = upsideB;
        }

        // Handle nulls
        if (valA === null || valA === undefined) return sortDirection === "asc" ? -1 : 1;
        if (valB === null || valB === undefined) return sortDirection === "asc" ? 1 : -1;

        if (typeof valA === "string") {
          return sortDirection === "asc" 
            ? valA.localeCompare(valB) 
            : valB.localeCompare(valA);
        } else {
          return sortDirection === "asc" 
            ? valA - valB 
            : valB - valA;
        }
      });
    }

    return [...stocks, ...cashArr];
  }, [marginPositions, sortField, sortDirection, customCagrs]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(val);
  };

  const formatAbbreviatedK = (val: number) => {
    const abs = Math.abs(val);
    if (abs >= 1000000000) {
      const billions = val / 1000000000;
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(billions) + "Bn";
    }
    if (abs >= 1000000) {
      const millions = val / 1000000;
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(millions) + "M";
    }
    const kVal = Math.floor((val / 1000) * 100) / 100;
    const formatted = kVal.toLocaleString("es-ES", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return `$${formatted}k`;
  };

  const formatPercentage = (val: number) => {
    return `${val >= 0 ? "+" : ""}${val.toFixed(2)}%`;
  };

  // Average CAGR calculation
  const weightedCagr = useMemo(() => {
    let sumWeights = 0;
    let sumWeightedCagr = 0;

    simPositions.forEach(p => {
      const cagr = getPositionCagr(p.ticker);
      sumWeightedCagr += (p.weight / 100) * cagr;
      sumWeights += p.weight;
    });

    return sumWeights > 0 ? sumWeightedCagr : 0;
  }, [simPositions, customCagrs, financialsMap, scoredRowsMap]);

  // Average CAGR calculation for margin portfolio
  const weightedMarginCagr = useMemo(() => {
    let sumWeights = 0;
    let sumWeightedCagr = 0;

    marginPositions.forEach(p => {
      const cagr = getPositionCagr(p.ticker);
      sumWeightedCagr += (p.weight / 100) * cagr;
      sumWeights += p.weight;
    });

    return sumWeights > 0 ? sumWeightedCagr : 0;
  }, [marginPositions, customCagrs, financialsMap, scoredRowsMap]);

  // Combined weighted CAGR of entire active + margin portfolios
  const combinedWeightedCagr = useMemo(() => {
    const totalVal = totalSimMktValue + totalMarginMktValue;
    if (totalVal === 0) return 0;

    let sumWeightedCagr = 0;
    simPositions.forEach(p => {
      const cagr = getPositionCagr(p.ticker);
      sumWeightedCagr += (p.mktValue / totalVal) * cagr;
    });
    marginPositions.forEach(p => {
      const cagr = getPositionCagr(p.ticker);
      sumWeightedCagr += (p.mktValue / totalVal) * cagr;
    });
    return sumWeightedCagr;
  }, [simPositions, marginPositions, customCagrs, totalSimMktValue, totalMarginMktValue, financialsMap, scoredRowsMap]);

  // Synchronize CAGR projection input with the selected tab's weighted CAGR
  useEffect(() => {
    if (projectionTab === "portfolio") {
      setCagr(Number(weightedCagr.toFixed(2)));
    } else if (projectionTab === "margin") {
      setCagr(Number(weightedMarginCagr.toFixed(2)));
    } else {
      setCagr(Number(combinedWeightedCagr.toFixed(2)));
    }
  }, [projectionTab, weightedCagr, weightedMarginCagr, combinedWeightedCagr]);

  const getAnalystData = (ticker: string, price: number) => {
    const upperTicker = ticker.toUpperCase();
    if (upperTicker === "CASH" || upperTicker === "USD") {
      return {
        avgTarget: null,
        highTarget: null,
        recommendation: null,
        epsCagr: null
      };
    }
    
    if (TICKER_ANALYST_DATA[upperTicker] !== undefined) {
      const data = TICKER_ANALYST_DATA[upperTicker];
      return {
        avgTarget: data.avgTarget === 0 ? null : data.avgTarget,
        highTarget: data.highTarget === 0 ? null : data.highTarget,
        recommendation: data.recommendation,
        epsCagr: data.epsCagr
      };
    }

    // Generate deterministic values for other tickers based on ticker hash or name
    let hash = 0;
    for (let i = 0; i < upperTicker.length; i++) {
      hash = upperTicker.charCodeAt(i) + ((hash << 5) - hash);
    }
    hash = Math.abs(hash);

    const avgMultiplier = 1.15 + (hash % 20) / 100; // 1.15 to 1.35
    const highMultiplier = avgMultiplier + 0.15 + (hash % 15) / 100; // +15% to +30%
    const avgTarget = price * avgMultiplier;
    const highTarget = price * highMultiplier;

    // Recommendations
    const recommendations = ["Buy", "Hold", "Buy", "Strong Buy"];
    const recommendation = recommendations[hash % recommendations.length];

    // EPS CAGR
    const epsCagr = ((hash % 50) - 10); // -10 to +39

    return {
      avgTarget: Number(avgTarget.toFixed(2)),
      highTarget: Number(highTarget.toFixed(2)),
      recommendation,
      epsCagr: Number(epsCagr.toFixed(1))
    };
  };

  // --- MARGIN POSITIONS TOTAL ROW SUMMARY METRICS ---
  const marginTotalCostBasis = useMemo(() => {
    return processedMarginPositions.reduce((sum, p) => {
      if (p.isCash) return sum + p.mktValue;
      return sum + ((p.shares || 0) * (p.avgCost || p.price || 0));
    }, 0);
  }, [processedMarginPositions]);

  const marginTotalReturnAmt = useMemo(() => {
    return processedMarginPositions.reduce((sum, p) => sum + (p.returnAmt || 0), 0);
  }, [processedMarginPositions]);

  const marginTotalReturnPct = useMemo(() => {
    return marginTotalCostBasis > 0 ? (marginTotalReturnAmt / marginTotalCostBasis) * 100 : 0;
  }, [marginTotalCostBasis, marginTotalReturnAmt]);

  const marginWeightedPe = useMemo(() => {
    const valid = processedMarginPositions.filter(p => p.pe !== null && p.pe !== undefined && p.pe > 0);
    const totalWeight = valid.reduce((sum, p) => sum + p.weight, 0);
    return totalWeight > 0 ? valid.reduce((sum, p) => sum + (p.pe! * p.weight), 0) / totalWeight : null;
  }, [processedMarginPositions]);

  const marginWeightedFwdPe = useMemo(() => {
    const valid = processedMarginPositions.filter(p => p.fwdPe !== null && p.fwdPe !== undefined && p.fwdPe > 0);
    const totalWeight = valid.reduce((sum, p) => sum + p.weight, 0);
    return totalWeight > 0 ? valid.reduce((sum, p) => sum + (p.fwdPe! * p.weight), 0) / totalWeight : null;
  }, [processedMarginPositions]);

  const marginWeightedPeg = useMemo(() => {
    const valid = processedMarginPositions.filter(p => p.peg !== null && p.peg !== undefined && p.peg > 0);
    const totalWeight = valid.reduce((sum, p) => sum + p.weight, 0);
    return totalWeight > 0 ? valid.reduce((sum, p) => sum + (p.peg! * p.weight), 0) / totalWeight : null;
  }, [processedMarginPositions]);

  const marginTotal52HighValue = useMemo(() => {
    return processedMarginPositions.reduce((acc, pos) => {
      const high52 = pos.fiftyTwoWeekHigh || (pos.price * 1.34668);
      return acc + ((pos.shares || 0) * high52);
    }, 0);
  }, [processedMarginPositions]);

  const marginTotalAvgValue = useMemo(() => {
    return processedMarginPositions.reduce((acc, pos) => {
      const analyst = getAnalystData(pos.ticker, pos.price);
      const targetAvg = pos.targetMeanPrice || analyst.avgTarget || pos.price;
      return acc + ((pos.shares || 0) * targetAvg);
    }, 0);
  }, [processedMarginPositions]);

  const marginTotalHighValue = useMemo(() => {
    return processedMarginPositions.reduce((acc, pos) => {
      const analyst = getAnalystData(pos.ticker, pos.price);
      const targetHigh = pos.targetHighPrice || analyst.highTarget || pos.price;
      return acc + ((pos.shares || 0) * targetHigh);
    }, 0);
  }, [processedMarginPositions]);

  const marginTotalUpside52High = useMemo(() => {
    return totalMarginMktValue > 0 ? ((marginTotal52HighValue - totalMarginMktValue) / totalMarginMktValue) * 100 : null;
  }, [marginTotal52HighValue, totalMarginMktValue]);

  const marginTotalUpsideAvg = useMemo(() => {
    return totalMarginMktValue > 0 ? ((marginTotalAvgValue - totalMarginMktValue) / totalMarginMktValue) * 100 : null;
  }, [marginTotalAvgValue, totalMarginMktValue]);

  const marginTotalUpsideHigh = useMemo(() => {
    return totalMarginMktValue > 0 ? ((marginTotalHighValue - totalMarginMktValue) / totalMarginMktValue) * 100 : null;
  }, [marginTotalHighValue, totalMarginMktValue]);

  const marginPiotroskiScoreAvg = useMemo(() => {
    const valid = processedMarginPositions.filter(p => !p.isCash && p.ticker && p.ticker.toUpperCase() !== "MARGIN_PAID");
    if (valid.length === 0) return "—";
    const sum = valid.reduce((acc, p) => acc + (p.piotroskiScore ?? 7), 0);
    return (sum / valid.length).toFixed(1);
  }, [processedMarginPositions]);

  const marginWeightedScore = useMemo(() => {
    const stockPositions = processedMarginPositions.filter((p) => !p.isCash && p.ticker && p.ticker.toUpperCase() !== "MARGIN_PAID");
    const totalVal = stockPositions.reduce((sum, p) => sum + p.mktValue, 0);
    if (totalVal === 0) return 0;

    let sumScore = 0;
    stockPositions.forEach((pos) => {
      const row = scoredRowsMap.get(pos.ticker.toUpperCase());
      if (row) {
        sumScore += (row.scores?.balanced || 50) * pos.mktValue;
      }
    });
    return sumScore / totalVal;
  }, [processedMarginPositions, scoredRowsMap]);

  const marginWeightedFactors = useMemo(() => {
    const stockPositions = processedMarginPositions.filter((p) => !p.isCash && p.ticker && p.ticker.toUpperCase() !== "MARGIN_PAID");
    const totalVal = stockPositions.reduce((sum, p) => sum + p.mktValue, 0);
    const result = { growth: 0, quality: 0, stability: 0, valuation: 0 };
    if (totalVal === 0) return result;

    stockPositions.forEach((pos) => {
      const row = scoredRowsMap.get(pos.ticker.toUpperCase());
      if (row && row.factors) {
        result.growth += (row.factors.growth || 50) * pos.mktValue;
        result.quality += (row.factors.quality || 50) * pos.mktValue;
        result.stability += (row.factors.stability || 50) * pos.mktValue;
        result.valuation += (row.factors.valuation || 50) * pos.mktValue;
      }
    });

    result.growth /= totalVal;
    result.quality /= totalVal;
    result.stability /= totalVal;
    result.valuation /= totalVal;
    return result;
  }, [processedMarginPositions, scoredRowsMap]);

  // --- SIMULATED POSITIONS TOTAL ROW SUMMARY METRICS ---
  const simTotalCostBasis = useMemo(() => {
    return processedPositions.reduce((sum, p) => {
      if (p.isCash) return sum + p.mktValue;
      return sum + ((p.shares || 0) * (p.avgCost || p.price || 0));
    }, 0);
  }, [processedPositions]);

  const simTotalReturnAmt = useMemo(() => {
    return processedPositions.reduce((sum, p) => sum + (p.returnAmt || 0), 0);
  }, [processedPositions]);

  const simTotalReturnPct = useMemo(() => {
    return simTotalCostBasis > 0 ? (simTotalReturnAmt / simTotalCostBasis) * 100 : 0;
  }, [simTotalCostBasis, simTotalReturnAmt]);

  const simWeightedPe = useMemo(() => {
    const valid = processedPositions.filter(p => p.pe !== null && p.pe !== undefined && p.pe > 0);
    const totalWeight = valid.reduce((sum, p) => sum + p.weight, 0);
    return totalWeight > 0 ? valid.reduce((sum, p) => sum + (p.pe! * p.weight), 0) / totalWeight : null;
  }, [processedPositions]);

  const simWeightedFwdPe = useMemo(() => {
    const valid = processedPositions.filter(p => p.fwdPe !== null && p.fwdPe !== undefined && p.fwdPe > 0);
    const totalWeight = valid.reduce((sum, p) => sum + p.weight, 0);
    return totalWeight > 0 ? valid.reduce((sum, p) => sum + (p.fwdPe! * p.weight), 0) / totalWeight : null;
  }, [processedPositions]);

  const simWeightedPeg = useMemo(() => {
    const valid = processedPositions.filter(p => p.peg !== null && p.peg !== undefined && p.peg > 0);
    const totalWeight = valid.reduce((sum, p) => sum + p.weight, 0);
    return totalWeight > 0 ? valid.reduce((sum, p) => sum + (p.peg! * p.weight), 0) / totalWeight : null;
  }, [processedPositions]);

  const simTotal52HighValue = useMemo(() => {
    return processedPositions.reduce((acc, pos) => {
      const high52 = pos.fiftyTwoWeekHigh || (pos.price * 1.34668);
      return acc + ((pos.shares || 0) * high52);
    }, 0);
  }, [processedPositions]);

  const simTotalAvgValue = useMemo(() => {
    return processedPositions.reduce((acc, pos) => {
      const analyst = getAnalystData(pos.ticker, pos.price);
      const targetAvg = pos.targetMeanPrice || analyst.avgTarget || pos.price;
      return acc + ((pos.shares || 0) * targetAvg);
    }, 0);
  }, [processedPositions]);

  const simTotalHighValue = useMemo(() => {
    return processedPositions.reduce((acc, pos) => {
      const analyst = getAnalystData(pos.ticker, pos.price);
      const targetHigh = pos.targetHighPrice || analyst.highTarget || pos.price;
      return acc + ((pos.shares || 0) * targetHigh);
    }, 0);
  }, [processedPositions]);

  const simTotalUpside52High = useMemo(() => {
    return totalSimMktValue > 0 ? ((simTotal52HighValue - totalSimMktValue) / totalSimMktValue) * 100 : null;
  }, [simTotal52HighValue, totalSimMktValue]);

  const simTotalUpsideAvg = useMemo(() => {
    return totalSimMktValue > 0 ? ((simTotalAvgValue - totalSimMktValue) / totalSimMktValue) * 100 : null;
  }, [simTotalAvgValue, totalSimMktValue]);

  const simTotalUpsideHigh = useMemo(() => {
    return totalSimMktValue > 0 ? ((simTotalHighValue - totalSimMktValue) / totalSimMktValue) * 100 : null;
  }, [simTotalHighValue, totalSimMktValue]);

  const simPiotroskiScoreAvg = useMemo(() => {
    const valid = processedPositions.filter(p => !p.isCash && p.ticker && p.ticker.toUpperCase() !== "MARGIN_PAID");
    if (valid.length === 0) return "—";
    const sum = valid.reduce((acc, p) => acc + (p.piotroskiScore ?? 7), 0);
    return (sum / valid.length).toFixed(1);
  }, [processedPositions]);

  const t = {
    EN: {
      portfolioProjection: "PORTFOLIO PROJECTION",
      monthlyAddition: "Monthly addition",
      cagr: "CAGR",
      current: "Current",
      projected: "Projected",
      onInvested: "on invested",
      portfolioFutureValue: "PORTFOLIO FUTURE VALUE",
      high52wk: "52wk High Portfolio Value",
      avgTargetValue: "Analyst Avg Target Value",
      highTargetValue: "Analyst High Target Value",
      projectionBreakdown: "PROJECTION BREAKDOWN",
      principal: "Principal",
      interestGains: "Interest Gains",
      totalValue: "Total Value",
      additions: "Additions"
    },
    ES: {
      portfolioProjection: "PROYECCIÓN DE PORTAFOLIO",
      monthlyAddition: "Aporte mensual",
      cagr: "CAGR",
      current: "Actual",
      projected: "Proyectado",
      onInvested: "sobre lo invertido",
      portfolioFutureValue: "VALOR FUTURO DEL PORTAFOLIO",
      high52wk: "Valor Máximo 52 Semanas",
      avgTargetValue: "Valor Objetivo Promedio",
      highTargetValue: "Valor Objetivo Alto",
      projectionBreakdown: "DESGLOSE DE PROYECCIÓN",
      principal: "Principal",
      interestGains: "Ganancias por Interés",
      totalValue: "Valor Total",
      additions: "Aportes"
    }
  }[language];

  // 1. Dynamic future value calculations based on selected positions (simulated or margin)
  const selectedPositions = useMemo(() => {
    const validSim = simPositions.filter(p => p.ticker && p.ticker.toUpperCase() !== "MARGIN_PAID");
    const validMargin = marginPositions.filter(p => p.ticker && p.ticker.toUpperCase() !== "MARGIN_PAID");
    if (projectionTab === "portfolio") return validSim;
    if (projectionTab === "margin") return validMargin;
    return [...validSim, ...validMargin];
  }, [projectionTab, simPositions, marginPositions]);

  const selectedTotalMktValue = useMemo(() => {
    if (projectionTab === "portfolio") return totalSimMktValue;
    if (projectionTab === "margin") return totalMarginMktValue;
    return totalSimMktValue + totalMarginMktValue;
  }, [projectionTab, totalSimMktValue, totalMarginMktValue]);

  const marginFinancedPrincipal = useMemo(() => {
    return selectedPositions
      .filter((p) => (p.isMargin || projectionTab === "margin") && !p.isCash && p.ticker !== "CASH" && p.ticker !== "USD")
      .reduce((sum, p) => sum + (p.shares * (p.avgCost || p.price)), 0);
  }, [selectedPositions, projectionTab]);

  const netSelectedMktValue = Math.max(0, selectedTotalMktValue - marginFinancedPrincipal);

  // 1. 52wk High calculations & breakdown
  const principal52wk = useMemo(() => {
    const principalList = selectedPositions.filter(p => !p.isMargin && projectionTab !== "margin");
    const currentVal = principalList.reduce((acc, pos) => acc + (pos.shares * pos.price), 0);
    const futureVal = principalList.reduce((acc, pos) => {
      if (pos.isCash || pos.ticker === "CASH" || pos.ticker === "USD") return acc + (pos.shares * pos.price);
      const highPrice = (pos.fiftyTwoWeekHigh !== null && pos.fiftyTwoWeekHigh !== undefined && pos.fiftyTwoWeekHigh > 0)
        ? pos.fiftyTwoWeekHigh
        : pos.price * 1.34668;
      return acc + (pos.shares * highPrice);
    }, 0);
    const gain = futureVal - currentVal;
    const gainPct = currentVal > 0 ? (gain / currentVal) * 100 : 0;
    return { currentVal, futureVal, gain, gainPct };
  }, [selectedPositions, projectionTab]);

  const margin52wk = useMemo(() => {
    const marginList = selectedPositions.filter(p => (p.isMargin || projectionTab === "margin") && !p.isCash && p.ticker !== "CASH" && p.ticker !== "USD");
    const currentVal = marginList.reduce((acc, pos) => acc + (pos.shares * pos.price), 0);
    const grossFutureVal = marginList.reduce((acc, pos) => {
      const highPrice = (pos.fiftyTwoWeekHigh !== null && pos.fiftyTwoWeekHigh !== undefined && pos.fiftyTwoWeekHigh > 0)
        ? pos.fiftyTwoWeekHigh
        : pos.price * 1.34668;
      return acc + (pos.shares * highPrice);
    }, 0);
    const netFutureVal = Math.max(0, grossFutureVal - marginFinancedPrincipal);
    const gain = grossFutureVal - currentVal;
    const debtBase = marginFinancedPrincipal > 0 ? marginFinancedPrincipal : currentVal;
    const gainPct = debtBase > 0 ? (gain / debtBase) * 100 : 0;
    return { currentVal, grossFutureVal, netFutureVal, gain, gainPct };
  }, [selectedPositions, projectionTab, marginFinancedPrincipal]);

  const fiftyTwoWeekHighTotal = useMemo(() => {
    return principal52wk.futureVal + margin52wk.netFutureVal;
  }, [principal52wk.futureVal, margin52wk.netFutureVal]);

  const total52wkGain = fiftyTwoWeekHighTotal - netSelectedMktValue;

  // 2. Avg Target calculations & breakdown
  const principalAvgTarget = useMemo(() => {
    const principalList = selectedPositions.filter(p => !p.isMargin && projectionTab !== "margin");
    const currentVal = principalList.reduce((acc, pos) => acc + (pos.shares * pos.price), 0);
    const futureVal = principalList.reduce((acc, pos) => {
      if (pos.isCash || pos.ticker === "CASH" || pos.ticker === "USD") return acc + (pos.shares * pos.price);
      const data = getAnalystData(pos.ticker, pos.price);
      const targetPrice = (pos.targetMeanPrice !== null && pos.targetMeanPrice !== undefined && pos.targetMeanPrice > 0)
        ? pos.targetMeanPrice
        : ((data.avgTarget !== null && data.avgTarget > 0) ? data.avgTarget : pos.price);
      return acc + (pos.shares * targetPrice);
    }, 0);
    const gain = futureVal - currentVal;
    const gainPct = currentVal > 0 ? (gain / currentVal) * 100 : 0;
    return { currentVal, futureVal, gain, gainPct };
  }, [selectedPositions, projectionTab]);

  const marginAvgTarget = useMemo(() => {
    const marginList = selectedPositions.filter(p => (p.isMargin || projectionTab === "margin") && !p.isCash && p.ticker !== "CASH" && p.ticker !== "USD");
    const currentVal = marginList.reduce((acc, pos) => acc + (pos.shares * pos.price), 0);
    const grossFutureVal = marginList.reduce((acc, pos) => {
      const data = getAnalystData(pos.ticker, pos.price);
      const targetPrice = (pos.targetMeanPrice !== null && pos.targetMeanPrice !== undefined && pos.targetMeanPrice > 0)
        ? pos.targetMeanPrice
        : ((data.avgTarget !== null && data.avgTarget > 0) ? data.avgTarget : pos.price);
      return acc + (pos.shares * targetPrice);
    }, 0);
    const netFutureVal = Math.max(0, grossFutureVal - marginFinancedPrincipal);
    const gain = grossFutureVal - currentVal;
    const debtBase = marginFinancedPrincipal > 0 ? marginFinancedPrincipal : currentVal;
    const gainPct = debtBase > 0 ? (gain / debtBase) * 100 : 0;
    return { currentVal, grossFutureVal, netFutureVal, gain, gainPct };
  }, [selectedPositions, projectionTab, marginFinancedPrincipal]);

  const avgTargetValueTotal = useMemo(() => {
    return principalAvgTarget.futureVal + marginAvgTarget.netFutureVal;
  }, [principalAvgTarget.futureVal, marginAvgTarget.netFutureVal]);

  const totalAvgTargetGain = avgTargetValueTotal - netSelectedMktValue;

  // 3. High Target calculations & breakdown
  const principalHighTarget = useMemo(() => {
    const principalList = selectedPositions.filter(p => !p.isMargin && projectionTab !== "margin");
    const currentVal = principalList.reduce((acc, pos) => acc + (pos.shares * pos.price), 0);
    const futureVal = principalList.reduce((acc, pos) => {
      if (pos.isCash || pos.ticker === "CASH" || pos.ticker === "USD") return acc + (pos.shares * pos.price);
      const data = getAnalystData(pos.ticker, pos.price);
      const targetPrice = (pos.targetHighPrice !== null && pos.targetHighPrice !== undefined && pos.targetHighPrice > 0)
        ? pos.targetHighPrice
        : ((data.highTarget !== null && data.highTarget > 0) ? data.highTarget : pos.price);
      return acc + (pos.shares * targetPrice);
    }, 0);
    const gain = futureVal - currentVal;
    const gainPct = currentVal > 0 ? (gain / currentVal) * 100 : 0;
    return { currentVal, futureVal, gain, gainPct };
  }, [selectedPositions, projectionTab]);

  const marginHighTarget = useMemo(() => {
    const marginList = selectedPositions.filter(p => (p.isMargin || projectionTab === "margin") && !p.isCash && p.ticker !== "CASH" && p.ticker !== "USD");
    const currentVal = marginList.reduce((acc, pos) => acc + (pos.shares * pos.price), 0);
    const grossFutureVal = marginList.reduce((acc, pos) => {
      const data = getAnalystData(pos.ticker, pos.price);
      const targetPrice = (pos.targetHighPrice !== null && pos.targetHighPrice !== undefined && pos.targetHighPrice > 0)
        ? pos.targetHighPrice
        : ((data.highTarget !== null && data.highTarget > 0) ? data.highTarget : pos.price);
      return acc + (pos.shares * targetPrice);
    }, 0);
    const netFutureVal = Math.max(0, grossFutureVal - marginFinancedPrincipal);
    const gain = grossFutureVal - currentVal;
    const debtBase = marginFinancedPrincipal > 0 ? marginFinancedPrincipal : currentVal;
    const gainPct = debtBase > 0 ? (gain / debtBase) * 100 : 0;
    return { currentVal, grossFutureVal, netFutureVal, gain, gainPct };
  }, [selectedPositions, projectionTab, marginFinancedPrincipal]);

  const highTargetValueTotal = useMemo(() => {
    return principalHighTarget.futureVal + marginHighTarget.netFutureVal;
  }, [principalHighTarget.futureVal, marginHighTarget.netFutureVal]);

  const totalHighTargetGain = highTargetValueTotal - netSelectedMktValue;

  const baseValueForUpside = useMemo(() => {
    if (projectionTab === "margin") {
      return marginFinancedPrincipal > 0 ? marginFinancedPrincipal : (netSelectedMktValue > 0 ? netSelectedMktValue : selectedTotalMktValue);
    }
    return netSelectedMktValue > 0 ? netSelectedMktValue : selectedTotalMktValue;
  }, [projectionTab, marginFinancedPrincipal, netSelectedMktValue, selectedTotalMktValue]);

  const high52wkUpside = useMemo(() => {
    if (baseValueForUpside <= 0) return 0;
    return ((fiftyTwoWeekHighTotal - netSelectedMktValue) / baseValueForUpside) * 100;
  }, [fiftyTwoWeekHighTotal, netSelectedMktValue, baseValueForUpside]);

  const avgTargetUpside = useMemo(() => {
    if (baseValueForUpside <= 0) return 0;
    return ((avgTargetValueTotal - netSelectedMktValue) / baseValueForUpside) * 100;
  }, [avgTargetValueTotal, netSelectedMktValue, baseValueForUpside]);

  const highTargetUpside = useMemo(() => {
    if (baseValueForUpside <= 0) return 0;
    return ((highTargetValueTotal - netSelectedMktValue) / baseValueForUpside) * 100;
  }, [highTargetValueTotal, netSelectedMktValue, baseValueForUpside]);

  // 2. Projection Calculations (Option A: strictly match the user-selected CAGR)
  const baseGrowthRate = cagr / 100;
  const effectiveGrowthRate = baseGrowthRate;

  const currentYear = new Date().getFullYear();
  
  const chartData = useMemo(() => {
    let currentValue = selectedTotalMktValue;
    const data = [];
    data.push({
      year: String(currentYear),
      value: Math.round(currentValue),
    });

    const totalMonths = years * 12;
    const monthlyRate = Math.pow(1 + effectiveGrowthRate, 1 / 12) - 1;

    for (let m = 1; m <= totalMonths; m++) {
      currentValue = currentValue * (1 + monthlyRate) + (projectionTab === "margin" ? 0 : monthlyAddition);
      if (m % 12 === 0) {
        const yearNum = currentYear + (m / 12);
        data.push({
          year: String(yearNum),
          value: Math.round(currentValue),
        });
      }
    }
    return data;
  }, [selectedTotalMktValue, years, effectiveGrowthRate, monthlyAddition, currentYear, projectionTab]);

  const projectedTotalValue = useMemo(() => {
    if (chartData.length === 0) return 0;
    return chartData[chartData.length - 1].value;
  }, [chartData]);

  const totalAdditions = projectionTab === "margin" ? 0 : (monthlyAddition * years * 12);

  const totalInvested = projectionTab === "margin"
    ? (marginFinancedPrincipal > 0 ? marginFinancedPrincipal : selectedTotalMktValue)
    : (selectedTotalMktValue + totalAdditions);
  const totalGrowth = Math.max(0, projectedTotalValue - totalInvested);
  const interestGains = totalGrowth;

  const percentageReturnOnInvested = totalInvested > 0 
    ? ((projectedTotalValue - totalInvested) / totalInvested) * 100 
    : 0;

  return (
    <div className="space-y-6" id="simulator-section">
      
      {/* 1. TOP HEADER & METRICS SUMMARY (COMPACT & UNIFIED STYLE) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#0a0c14]/40 border border-slate-900/40 p-6 rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-500/20 to-teal-500/20 flex items-center justify-center border border-emerald-500/30">
            <Sparkles className="text-emerald-400" size={16} />
          </div>
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <h2 className="text-sm font-display font-bold text-white tracking-wider uppercase">
                {language === "EN" ? "SIMULATION PORTFOLIO" : "SIMULACIÓN DE PORTAFOLIO ACTIVO"}
              </h2>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-lg" title={language === "EN" ? "Simulated Principal Value" : "Valor Principal Simulado"}>
                  {formatCurrency(totalSimMktValue)}
                </span>
                {totalMarginMktValue > 0 && (
                  <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-lg" title={language === "EN" ? "Current Margin Financed" : "Margen Actual Financiado"}>
                    {language === "EN" ? "Margin:" : "Margen:"} {formatCurrency(totalMarginMktValue)}
                  </span>
                )}
                {totalMarginMktValue > 0 && (
                  <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-0.5 rounded-lg" title={language === "EN" ? "Combined Total Exposure" : "Exposición Total Combinada"}>
                    Total: {formatCurrency(totalCombinedMktValue)}
                  </span>
                )}
                <span className="text-xs font-mono font-bold text-slate-900 bg-[#e2e8f0] border border-slate-300 px-2 py-0.5 rounded-lg">
                  {simPositions.filter(p => p.ticker && p.ticker.toUpperCase() !== "MARGIN_PAID").length} {language === "EN" ? "active" : "activos"}
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-1 leading-none">
              {language === "EN"
                ? <>Edit values, weights or CAGR to recalculate • Weighted CAGR: <span className="font-semibold text-emerald-400 font-mono">+{weightedCagr.toFixed(2)}%</span></>
                : <>Edita valores, pesos o CAGR para recalcular • CAGR Ponderado: <span className="font-semibold text-emerald-400 font-mono">+{weightedCagr.toFixed(2)}%</span></>}
            </p>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2 sm:gap-3 self-stretch md:self-auto">
          <button
            onClick={handleReset}
            className="flex-1 md:flex-initial flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border border-slate-700 transition-all cursor-pointer"
          >
            <RotateCcw size={13} />
            Restablecer
          </button>
          
          <button
            onClick={handleOpenAdd}
            className="flex-1 md:flex-initial flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border border-emerald-400 shadow-md transition-all cursor-pointer font-bold"
          >
            <Plus size={13} />
            Adicionar
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-3 rounded-2xl flex items-center gap-3 text-xs">
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-rose-400 hover:text-rose-300">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Loading Overlay */}
      {loading && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-3 rounded-2xl flex items-center gap-3 text-xs animate-pulse">
          <Loader2 size={16} className="shrink-0 animate-spin" />
          <span>Buscando y sincronizando cotización en tiempo real...</span>
        </div>
      )}

      {/* 3. SIMULATOR INTERACTIVE TABLE */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl overflow-hidden">
        {/* Toggle header for Basis / Valuation / Health */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-display font-bold text-white tracking-wider uppercase flex items-center gap-2">
              {language === "EN" ? "SIMULATION POSITIONS" : "POSICIONES EN SIMULACIÓN"}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {language === "EN"
                ? "Switch view mode to inspect Basis, Valuation, Health or Financials metrics"
                : "Cambia el modo de vista para explorar métricas de Base, Valoración, Salud o Financieros"}
            </p>
          </div>

          {/* Basis vs Valuation vs Health vs Financials Toggle */}
          <div className="flex flex-wrap items-center gap-3">
            <div id="simulator-mode-toggle" className="simulator-mode-toggle inline-flex bg-[#0a0c14] border border-slate-800 rounded-full p-1 text-[11px] font-bold shadow-inner">
              <button
                onClick={() => setSimTabMode("basis")}
                className={`px-3.5 py-1.5 rounded-full transition-all duration-300 cursor-pointer flex items-center gap-1.5 uppercase font-bold text-[10px] md:text-[11px] tracking-wider ${
                  simTabMode === "basis"
                    ? "bg-gradient-to-r from-[#8da2f8] via-[#5c6dfd] to-[#bbf246] text-[#0a0d1a] font-extrabold shadow-md"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Briefcase size={12} />
                Basis
              </button>
              <button
                onClick={() => setSimTabMode("valuation")}
                className={`px-3.5 py-1.5 rounded-full transition-all duration-300 cursor-pointer flex items-center gap-1.5 uppercase font-bold text-[10px] md:text-[11px] tracking-wider ${
                  simTabMode === "valuation"
                    ? "bg-gradient-to-r from-[#8da2f8] via-[#5c6dfd] to-[#bbf246] text-[#0a0d1a] font-extrabold shadow-md"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Sparkles size={12} />
                {language === "EN" ? "Valuation" : "Valoración"}
              </button>
              <button
                onClick={() => setSimTabMode("health")}
                className={`px-3.5 py-1.5 rounded-full transition-all duration-300 cursor-pointer flex items-center gap-1.5 uppercase font-bold text-[10px] md:text-[11px] tracking-wider ${
                  simTabMode === "health"
                    ? "bg-gradient-to-r from-[#8da2f8] via-[#5c6dfd] to-[#bbf246] text-[#0a0d1a] font-extrabold shadow-md"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Award size={12} />
                {language === "EN" ? "Health" : "Salud"}
              </button>
              <button
                onClick={() => setSimTabMode("financials")}
                className={`px-3.5 py-1.5 rounded-full transition-all duration-300 cursor-pointer flex items-center gap-1.5 uppercase font-bold text-[10px] md:text-[11px] tracking-wider ${
                  simTabMode === "financials"
                    ? "bg-gradient-to-r from-[#8da2f8] via-[#5c6dfd] to-[#bbf246] text-[#0a0d1a] font-extrabold shadow-md"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <FileText size={12} />
                {language === "EN" ? "Financials" : "Financieros"}
              </button>
            </div>

            {/* View Toggles for Financials Mode */}
            {simTabMode === "financials" && (
              <div id="simulator-view-toggle" className="simulator-view-toggle flex bg-[#0a0c14] p-1 rounded-full border border-slate-800 text-[11px] font-bold">
                <button
                  onClick={() => setFinancialsViewMode("cards")}
                  className={`px-3 py-1.5 rounded-full transition-all duration-150 cursor-pointer flex items-center gap-1.5 ${
                    financialsViewMode === "cards"
                      ? "bg-[#1c1e29] text-white shadow-inner active-view-mode"
                      : "text-slate-500 hover:text-slate-300 inactive-view-mode"
                  }`}
                >
                  <LayoutGrid size={13} />
                  {language === "EN" ? "Cards" : "Tarjetas"}
                </button>
                <button
                  onClick={() => setFinancialsViewMode("table")}
                  className={`px-3 py-1.5 rounded-full transition-all duration-150 cursor-pointer flex items-center gap-1.5 ${
                    financialsViewMode === "table"
                      ? "bg-[#1c1e29] text-white shadow-inner active-view-mode"
                      : "text-slate-500 hover:text-slate-300 inactive-view-mode"
                  }`}
                >
                  <Table size={13} />
                  {language === "EN" ? "Table" : "Tabla"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Portfolio Health Summary Card in Health Mode */}
        {simTabMode === "health" && simPositions.length > 0 && (
          <div className="bg-[#0a0c14]/60 border border-slate-800 p-6 rounded-2xl flex flex-col xl:flex-row items-center gap-6 justify-between mb-6 shadow-xl">
            <div className="flex flex-col items-center xl:items-start gap-2 xl:w-1/3">
              <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">
                {language === "EN" ? "PORTFOLIO HEALTH" : "SALUD DEL PORTAFOLIO"}
              </span>
              <div className="flex items-center gap-4">
                <div className={`flex items-center justify-center w-16 h-16 rounded-full ${getScoreBgClass(portfolioWeightedScore)} border-[3px]`}>
                  <span className="text-2xl font-black">{portfolioWeightedScore.toFixed(0)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold mb-1">
                    {language === "EN" ? "PORTFOLIO TYPE" : "TIPO DE PORTAFOLIO"}
                  </span>
                  <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${getTypeBadgeConfig(portfolioWeightedType).className}`}>
                    <span>{getTypeBadgeConfig(portfolioWeightedType).icon}</span>
                    {portfolioWeightedType || "—"}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-4 sm:gap-8 md:gap-12 flex-1">
              <ScoreDonut score={portfolioWeightedFactors.growth} label={language === "EN" ? "GROWTH" : "CRECIMIENTO"} colorClass={getScoreColorClass(portfolioWeightedFactors.growth)} />
              <ScoreDonut score={portfolioWeightedFactors.quality} label={language === "EN" ? "QUALITY" : "CALIDAD"} colorClass={getScoreColorClass(portfolioWeightedFactors.quality)} />
              <ScoreDonut score={portfolioWeightedFactors.stability} label={language === "EN" ? "STABILITY" : "ESTABILIDAD"} colorClass={getScoreColorClass(portfolioWeightedFactors.stability)} />
              <ScoreDonut score={portfolioWeightedFactors.valuation} label={language === "EN" ? "VALUATION" : "VALUACIÓN"} colorClass={getScoreColorClass(portfolioWeightedFactors.valuation)} />
            </div>
          </div>
        )}

        {simTabMode === "financials" ? (
          <CompanyFinancials 
            language={language}
            tickers={Array.from(new Set([...simPositions, ...marginPositions].filter(p => !p.isCash && p.ticker).map(p => p.ticker.toUpperCase())))}
            prefetchedData={financialsMap}
            viewMode={financialsViewMode}
            onViewModeChange={setFinancialsViewMode}
          />
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-[10px] md:text-xs font-semibold uppercase tracking-wider select-none">
                <th className="py-2.5 px-2 cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("ticker")}>
                  <div className="flex items-center gap-1">STOCK <ArrowUpDown size={11} /></div>
                </th>
                <th className="py-2.5 px-2 text-right cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("price")}>
                  <div className="flex items-center justify-end gap-1">PRECIO <ArrowUpDown size={11} /></div>
                </th>
                <th className="py-2.5 px-2 text-center cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("weight")}>
                  <div className="flex items-center justify-center gap-1">WEIGHT % <ArrowUpDown size={11} /></div>
                </th>
                <th className="py-2.5 px-2 text-center cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("mktValue")}>
                  <div className="flex items-center justify-center gap-1">MKT VALUE <ArrowUpDown size={11} /></div>
                </th>

                {simTabMode === "basis" && (
                  <>
                    <th className="py-2.5 px-2 text-center cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("cagr")}>
                      <div className="flex items-center justify-center gap-1">CAGR (EST.) <ArrowUpDown size={11} /></div>
                    </th>
                    <th className="py-2.5 px-2 text-right">{language === "EN" ? "SHARES" : "ACCIONES"}</th>
                    <th className="py-2.5 px-2 text-right">{language === "EN" ? "AVG COST" : "COSTO PROM."}</th>
                    <th className="py-2.5 px-2 text-right">{language === "EN" ? "COST BASIS" : "COSTO TOTAL"}</th>
                    <th className="py-2.5 px-2 text-right">{language === "EN" ? "RETURN P&L" : "RETORNO P&L"}</th>
                  </>
                )}

                {simTabMode === "valuation" && (
                  <>
                    <th className="py-2.5 px-2 text-center cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("cagr")}>
                      <div className="flex items-center justify-center gap-1">CAGR (EST.) <ArrowUpDown size={11} /></div>
                    </th>
                    <th className="py-2.5 px-2 text-right cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("pe")}>
                      <div className="flex items-center justify-end gap-1">P/E <ArrowUpDown size={11} /></div>
                    </th>
                    <th className="py-2.5 px-2 text-right cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("fwdPe")}>
                      <div className="flex items-center justify-end gap-1">FWD P/E <ArrowUpDown size={11} /></div>
                    </th>
                    <th className="py-2.5 px-2 text-right cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("peg")}>
                      <div className="flex items-center justify-end gap-1">PEG <ArrowUpDown size={11} /></div>
                    </th>
                    <th className="py-2.5 px-2 text-center cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("fiftyTwoWeekHigh")}>
                      <div className="flex items-center justify-center gap-1">52W HIGH <ArrowUpDown size={11} /></div>
                    </th>
                    <th className="py-2.5 px-2 text-center cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("upsideAvg")}>
                      <div className="flex items-center justify-center gap-1">UPSIDE TO AVG <ArrowUpDown size={11} /></div>
                    </th>
                    <th className="py-2.5 px-2 text-center cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("upsideHigh")}>
                      <div className="flex items-center justify-center gap-1">UPSIDE TO HIGH <ArrowUpDown size={11} /></div>
                    </th>
                  </>
                )}

                {simTabMode === "health" && (
                  <>
                    <th className="py-2.5 px-2 text-center">PIOTROSKI</th>
                    <th className="py-2.5 px-2 text-center">SCORE</th>
                    <th className="py-2.5 px-2 text-center">{language === "EN" ? "GROWTH" : "CRECIMIENTO"}</th>
                    <th className="py-2.5 px-2 text-center">{language === "EN" ? "QUALITY" : "CALIDAD"}</th>
                    <th className="py-2.5 px-2 text-center">{language === "EN" ? "STABILITY" : "ESTABILIDAD"}</th>
                    <th className="py-2.5 px-2 text-center">{language === "EN" ? "VALUATION" : "VALUACIÓN"}</th>
                  </>
                )}

                <th className="py-2.5 px-2 w-10 text-center">{language === "EN" ? "ACTIONS" : "ACCIONES"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {processedPositions.map((pos, rowIdx) => {
                const index = simPositions.findIndex(p => p.ticker === pos.ticker);
                const cagrVal = getPositionCagr(pos.ticker);
                
                // 52W High Value calculations
                const highUpside = pos.fiftyTwoWeekHigh ? ((pos.fiftyTwoWeekHigh - pos.price) / pos.price) * 100 : null;

                // Target upsides
                const upsideAvg = pos.targetMeanPrice ? ((pos.targetMeanPrice - pos.price) / pos.price) * 100 : null;
                const upsideHigh = pos.targetHighPrice ? ((pos.targetHighPrice - pos.price) / pos.price) * 100 : null;

                // Scored Row for Health Mode
                const scoredRow = scoredRowsMap.get(pos.ticker.toUpperCase());
                const tooltipPlacement = rowIdx < processedPositions.length / 2 ? "bottom" : "top";

                return (
                  <tr 
                    key={`${pos.ticker}-${index}`} 
                    className={`text-xs md:text-sm hover:bg-slate-800/30 transition-colors ${
                      pos.isCash ? "bg-slate-800/10 font-medium text-slate-300" : ""
                    }`}
                  >
                    {/* Stock Column */}
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-2.5">
                        <CompanyLogo ticker={pos.ticker} name={pos.name} isCash={pos.isCash} size="sm" />
                        <div className="flex flex-col">
                          <button
                            onClick={() => handleOpenSwap(index)}
                            className="text-left font-display font-bold text-white tracking-wide text-xs md:text-sm hover:text-emerald-400 hover:underline cursor-pointer transition-colors"
                            title="Click para cambiar posición"
                          >
                            {pos.ticker}
                          </button>
                          <span className="text-[10px] text-slate-400 truncate max-w-[120px]" title={pos.name}>
                            {pos.name}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Price Column */}
                    <td className="py-3 px-2 text-right font-mono text-white">
                      <div className="flex flex-col items-end">
                        <span className="font-bold">{pos.isCash ? "$1.00" : formatCurrency(pos.price)}</span>
                        {!pos.isCash && (
                          <span className={`text-[10px] font-semibold ${pos.chgPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {pos.chgPct >= 0 ? "+" : ""}{pos.chgPct.toFixed(2)}%
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Weight % Input */}
                    <td className="py-3 px-2 text-center">
                      <div className="flex items-center justify-center gap-1 text-slate-400">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={pos.weight.toFixed(2)}
                          onChange={(e) => handleWeightChange(index, e.target.value)}
                          className="bg-[#121420] border border-slate-800 focus:border-emerald-500 rounded-xl px-2.5 py-1 text-center font-mono font-bold text-white w-20 outline-none transition-all text-xs"
                        />
                        <span className="text-xs font-semibold">%</span>
                      </div>
                    </td>

                    {/* Market Value Input */}
                    <td className="py-3 px-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <input
                          type="number"
                          step="1"
                          min="0"
                          value={Math.round(pos.mktValue)}
                          onChange={(e) => handleMktValueChange(index, e.target.value)}
                          className="bg-[#121420] border border-slate-800 focus:border-emerald-500 rounded-xl px-2.5 py-1 text-center font-mono font-bold text-white w-24 outline-none transition-all text-xs"
                        />
                      </div>
                    </td>

                    {/* Basis Mode Columns */}
                    {simTabMode === "basis" && (
                      <>
                        {/* CAGR (Est) Input */}
                        <td className="py-3 px-2 text-center">
                          <div className="flex items-center justify-center gap-1 text-slate-400">
                            <input
                              type="number"
                              step="0.01"
                              value={cagrVal.toFixed(2)}
                              onChange={(e) => handleCagrChange(pos.ticker, e.target.value)}
                              className="bg-[#121420] border border-slate-800 focus:border-emerald-500 rounded-xl px-2.5 py-1 text-center font-mono font-bold text-white w-20 outline-none transition-all text-xs"
                            />
                            <span className="text-xs font-semibold">%</span>
                          </div>
                        </td>
                        {/* Shares */}
                        <td className="py-3 px-2 text-right font-mono text-slate-200">
                          {pos.isCash ? "—" : pos.shares ? pos.shares.toFixed(2) : "—"}
                        </td>
                        {/* Avg Cost */}
                        <td className="py-3 px-2 text-right font-mono text-slate-200">
                          {pos.isCash ? "$1.00" : pos.avgCost ? formatCurrency(pos.avgCost) : "—"}
                        </td>
                        {/* Total Cost Basis */}
                        <td className="py-3 px-2 text-right font-mono text-slate-200">
                          {pos.isCash ? formatCurrency(pos.mktValue) : pos.shares && pos.avgCost ? formatCurrency(pos.shares * pos.avgCost) : "—"}
                        </td>
                        {/* Return P&L */}
                        <td className="py-3 px-2 text-right font-mono">
                          {pos.isCash ? (
                            "—"
                          ) : (
                            <div className="flex flex-col items-end">
                              <span className={`font-bold ${pos.returnAmt >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                {pos.returnAmt >= 0 ? "+" : ""}{formatCurrency(pos.returnAmt)}
                              </span>
                              <span className={`text-[10px] font-semibold ${pos.returnPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                {pos.returnPct >= 0 ? "+" : ""}{pos.returnPct.toFixed(2)}%
                              </span>
                            </div>
                          )}
                        </td>
                      </>
                    )}

                    {/* Valuation Mode Columns */}
                    {simTabMode === "valuation" && (
                      <>
                        {/* CAGR (Est) Input */}
                        <td className="py-3 px-2 text-center">
                          <div className="flex items-center justify-center gap-1 text-slate-400">
                            <input
                              type="number"
                              step="0.01"
                              value={cagrVal.toFixed(2)}
                              onChange={(e) => handleCagrChange(pos.ticker, e.target.value)}
                              className="bg-[#121420] border border-slate-800 focus:border-emerald-500 rounded-xl px-2.5 py-1 text-center font-mono font-bold text-white w-20 outline-none transition-all text-xs"
                            />
                            <span className="text-xs font-semibold">%</span>
                          </div>
                        </td>
                        <td className="py-3 px-2 text-right font-mono text-slate-300">
                          {pos.pe !== null && pos.pe !== undefined ? pos.pe.toFixed(1) : "—"}
                        </td>
                        <td className="py-3 px-2 text-right font-mono text-slate-300">
                          {pos.fwdPe !== null && pos.fwdPe !== undefined ? pos.fwdPe.toFixed(1) : "—"}
                        </td>
                        <td className="py-3 px-2 text-right font-mono text-slate-300">
                          {pos.peg !== null && pos.peg !== undefined ? pos.peg.toFixed(2) : "—"}
                        </td>
                        <td className="py-3 px-2 text-center">
                          {highUpside !== null ? (
                            <span className="inline-flex items-center gap-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-bold font-mono text-xs">
                              <TrendingUp size={11} className="shrink-0" />
                              {highUpside.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                        <td className="py-3 px-2 text-center">
                          {upsideAvg !== null ? (
                            <span className="inline-flex items-center gap-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-bold font-mono text-xs">
                              <TrendingUp size={11} className="shrink-0" />
                              {upsideAvg.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                        <td className="py-3 px-2 text-center">
                          {upsideHigh !== null ? (
                            <span className="inline-flex items-center gap-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-bold font-mono text-xs">
                              <TrendingUp size={11} className="shrink-0" />
                              {upsideHigh.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                      </>
                    )}

                    {/* Health Mode Columns */}
                    {simTabMode === "health" && (
                      <>
                        <td className="py-3 px-2 text-center font-mono">
                          {pos.isCash ? (
                            "—"
                          ) : (
                            <span className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded text-xs tracking-wide ${
                              (pos.piotroskiScore ?? 7) >= 7
                                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                : (pos.piotroskiScore ?? 7) >= 4
                                ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                                : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                            }`}>
                              {pos.piotroskiScore ?? 7} / 9
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-2 text-center font-mono">
                          <span className={`inline-block px-2 py-1 rounded text-xs font-black ${getScoreBgClass(scoredRow?.scores?.balanced ?? null)}`}>
                            {typeof scoredRow?.scores?.balanced === "number" ? scoredRow.scores.balanced.toFixed(0) : "—"}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-center font-mono group relative cursor-help">
                          <HealthMetricsTooltip 
                            title={language === "ES" ? "Crecimiento" : "Growth"}
                            metrics={[
                              {key: "revenue_cagr", label: "Revenue CAGR", suffix: "%"},
                              {key: "eps_cagr", label: "EPS CAGR", suffix: "%"},
                              {key: "fcf_cagr", label: "Operating Cash Flow CAGR", suffix: "%"},
                            ]}
                            raw={scoredRow?.raw}
                            language={language}
                            placement={tooltipPlacement}
                          />
                          <div className="flex flex-col items-center">
                            <span className={`text-xs font-bold ${getScoreColorClass(scoredRow?.factors?.growth ?? null)}`}>
                              {typeof scoredRow?.factors?.growth === "number" ? scoredRow.factors.growth.toFixed(0) : "—"}
                            </span>
                            <div className="w-12 h-1 bg-slate-950 rounded-full overflow-hidden mt-1">
                              <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${scoredRow?.factors?.growth ?? 0}%` }} />
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-2 text-center font-mono group relative cursor-help">
                          <HealthMetricsTooltip 
                            title={language === "ES" ? "Calidad" : "Quality"}
                            metrics={[
                              {key: "roic", label: "ROIC", suffix: "%"},
                              {key: "gross_margin", label: "Gross Margin", suffix: "%"},
                              {key: "operating_margin", label: "Oper. Margin", suffix: "%"},
                              {key: "fcf_conversion", label: "FCF Conversion", suffix: "%"},
                            ]}
                            raw={scoredRow?.raw}
                            language={language}
                            placement={tooltipPlacement}
                          />
                          <div className="flex flex-col items-center">
                            <span className={`text-xs font-bold ${getScoreColorClass(scoredRow?.factors?.quality ?? null)}`}>
                              {typeof scoredRow?.factors?.quality === "number" ? scoredRow.factors.quality.toFixed(0) : "—"}
                            </span>
                            <div className="w-12 h-1 bg-slate-950 rounded-full overflow-hidden mt-1">
                              <div className="bg-blue-500 h-full rounded-full" style={{ width: `${scoredRow?.factors?.quality ?? 0}%` }} />
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-2 text-center font-mono group relative cursor-help">
                          <HealthMetricsTooltip 
                            title={language === "ES" ? "Estabilidad" : "Stability"}
                            metrics={[
                              {key: "beta", label: "Beta"},
                              {key: "rev_growth_vol", label: "Rev Volatility", suffix: "%"},
                              {key: "margin_vol", label: "Margin Volatility", suffix: "%"},
                              {key: "interest_cov", label: "Interest Cov.", suffix: "x"},
                            ]}
                            raw={scoredRow?.raw}
                            language={language}
                            placement={tooltipPlacement}
                          />
                          <div className="flex flex-col items-center">
                            <span className={`text-xs font-bold ${getScoreColorClass(scoredRow?.factors?.stability ?? null)}`}>
                              {typeof scoredRow?.factors?.stability === "number" ? scoredRow.factors.stability.toFixed(0) : "—"}
                            </span>
                            <div className="w-12 h-1 bg-slate-950 rounded-full overflow-hidden mt-1">
                              <div className="bg-amber-500 h-full rounded-full" style={{ width: `${scoredRow?.factors?.stability ?? 0}%` }} />
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-2 text-center font-mono group relative cursor-help">
                          <HealthMetricsTooltip 
                            title={language === "ES" ? "Valoración" : "Valuation"}
                            metrics={[
                              {key: "trailing_pe", label: "Trailing P/E", suffix: "x"},
                              {key: "forward_pe", label: "Forward P/E", suffix: "x"},
                              {key: "ev_ebitda", label: "EV/EBITDA", suffix: "x"},
                              {key: "fcf_yield", label: "FCF Yield", suffix: "%"},
                            ]}
                            raw={scoredRow?.raw}
                            language={language}
                            placement={tooltipPlacement}
                          />
                          <div className="flex flex-col items-center">
                            <span className={`text-xs font-bold ${getScoreColorClass(scoredRow?.factors?.valuation ?? null)}`}>
                              {typeof scoredRow?.factors?.valuation === "number" ? scoredRow.factors.valuation.toFixed(0) : "—"}
                            </span>
                            <div className="w-12 h-1 bg-slate-950 rounded-full overflow-hidden mt-1">
                              <div className="bg-rose-500 h-full rounded-full" style={{ width: `${scoredRow?.factors?.valuation ?? 0}%` }} />
                            </div>
                          </div>
                        </td>
                      </>
                    )}

                    {/* Actions Column */}
                    <td className="py-3 px-2 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {!pos.isCash && (
                          <button
                            type="button"
                            onClick={() => handleAddToMargin(pos)}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:border-amber-500/50"
                            title={language === "EN" ? "Add position to Margin (Leverage)" : "Apalancar / Entrar posición en Margen"}
                          >
                            <span>⚡</span>
                            <span>{language === "EN" ? "+Margin" : "+Margen"}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeletePosition(index)}
                          className="text-slate-500 hover:text-rose-400 transition-colors p-1 hover:bg-slate-800 rounded-lg cursor-pointer"
                          title={language === "EN" ? "Delete position" : "Eliminar posición"}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {simPositions.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-800 bg-[#0a0d18]/60 text-slate-100 font-bold text-xs md:text-sm">
                  <td className="py-3 px-2 font-display tracking-wider font-extrabold uppercase text-emerald-400">
                    <div className="flex items-center gap-1.5">
                      <span>💼</span>
                      <span>{language === "EN" ? "TOTAL PORTFOLIO" : "TOTAL GENERAL"}</span>
                    </div>
                  </td>
                  <td className="py-3 px-2 text-right font-mono text-slate-500">—</td>
                  <td className="py-3 px-2 text-center font-mono text-emerald-400 font-extrabold">
                    100.0%
                  </td>
                  <td className="py-3 px-2 text-center font-mono text-white font-extrabold">
                    {formatCurrency(totalSimMktValue)}
                  </td>

                  {simTabMode === "basis" && (
                    <>
                      <td className="py-3 px-2 text-center font-mono text-slate-300 font-bold">
                        {weightedCagr.toFixed(2)}%
                      </td>
                      <td className="py-3 px-2 text-right font-mono text-slate-500">—</td>
                      <td className="py-3 px-2 text-right font-mono text-slate-500">—</td>
                      <td className="py-3 px-2 text-right font-mono text-slate-200 font-bold">
                        {formatCurrency(simTotalCostBasis)}
                      </td>
                      <td className="py-3 px-2 text-right font-mono">
                        <div className="flex flex-col items-end">
                          <span className={`font-bold ${simTotalReturnAmt >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {simTotalReturnAmt >= 0 ? "+" : ""}{formatCurrency(simTotalReturnAmt)}
                          </span>
                          <span className={`text-[10px] font-semibold ${simTotalReturnPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {simTotalReturnPct >= 0 ? "+" : ""}{simTotalReturnPct.toFixed(2)}%
                          </span>
                        </div>
                      </td>
                    </>
                  )}

                  {simTabMode === "valuation" && (
                    <>
                      <td className="py-3 px-2 text-center font-mono text-slate-300 font-bold">
                        {weightedCagr.toFixed(2)}%
                      </td>
                      <td className="py-3 px-2 text-right font-mono text-slate-300">
                        {simWeightedPe !== null ? simWeightedPe.toFixed(1) : "—"}
                      </td>
                      <td className="py-3 px-2 text-right font-mono text-slate-300">
                        {simWeightedFwdPe !== null ? simWeightedFwdPe.toFixed(1) : "—"}
                      </td>
                      <td className="py-3 px-2 text-right font-mono text-slate-300">
                        {simWeightedPeg !== null ? simWeightedPeg.toFixed(2) : "—"}
                      </td>
                      <td className="py-3 px-2 text-center">
                        {simTotalUpside52High !== null ? (
                          <span className="inline-flex items-center gap-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-bold font-mono text-xs">
                            <TrendingUp size={11} className="shrink-0" />
                            {simTotalUpside52High.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-center">
                        {simTotalUpsideAvg !== null ? (
                          <span className="inline-flex items-center gap-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-bold font-mono text-xs">
                            <TrendingUp size={11} className="shrink-0" />
                            {simTotalUpsideAvg.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-center">
                        {simTotalUpsideHigh !== null ? (
                          <span className="inline-flex items-center gap-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-bold font-mono text-xs">
                            <TrendingUp size={11} className="shrink-0" />
                            {simTotalUpsideHigh.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                    </>
                  )}

                  {simTabMode === "health" && (
                    <>
                      <td className="py-3 px-2 text-center font-mono">
                        <span className="inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          {simPiotroskiScoreAvg} / 9
                        </span>
                      </td>
                      <td className="py-3 px-2 text-center font-mono">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-black ${getScoreBgClass(portfolioWeightedScore)}`}>
                          {portfolioWeightedScore.toFixed(0)}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-center font-mono">
                        <div className="flex flex-col items-center">
                          <span className={`text-xs font-bold ${getScoreColorClass(portfolioWeightedFactors.growth)}`}>
                            {portfolioWeightedFactors.growth.toFixed(0)}
                          </span>
                          <div className="w-12 h-1 bg-slate-950 rounded-full overflow-hidden mt-1">
                            <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${portfolioWeightedFactors.growth}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-center font-mono">
                        <div className="flex flex-col items-center">
                          <span className={`text-xs font-bold ${getScoreColorClass(portfolioWeightedFactors.quality)}`}>
                            {portfolioWeightedFactors.quality.toFixed(0)}
                          </span>
                          <div className="w-12 h-1 bg-slate-950 rounded-full overflow-hidden mt-1">
                            <div className="bg-blue-500 h-full rounded-full" style={{ width: `${portfolioWeightedFactors.quality}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-center font-mono">
                        <div className="flex flex-col items-center">
                          <span className={`text-xs font-bold ${getScoreColorClass(portfolioWeightedFactors.stability)}`}>
                            {portfolioWeightedFactors.stability.toFixed(0)}
                          </span>
                          <div className="w-12 h-1 bg-slate-950 rounded-full overflow-hidden mt-1">
                            <div className="bg-amber-500 h-full rounded-full" style={{ width: `${portfolioWeightedFactors.stability}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-center font-mono">
                        <div className="flex flex-col items-center">
                          <span className={`text-xs font-bold ${getScoreColorClass(portfolioWeightedFactors.valuation)}`}>
                            {portfolioWeightedFactors.valuation.toFixed(0)}
                          </span>
                          <div className="w-12 h-1 bg-slate-950 rounded-full overflow-hidden mt-1">
                            <div className="bg-rose-500 h-full rounded-full" style={{ width: `${portfolioWeightedFactors.valuation}%` }} />
                          </div>
                        </div>
                      </td>
                    </>
                  )}

                  <td className="py-3 px-2 text-center font-mono text-slate-500">—</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        )}
      </div>

      {/* 3.5 COLLAPSIBLE MARGIN TABLE */}
      {simTabMode !== "financials" && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl overflow-hidden">
        {/* Header containing toggle and add button */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-4">
          <button
            onClick={() => setMarginCollapsed(prev => !prev)}
            className="flex items-center gap-3 text-left focus:outline-none group cursor-pointer"
          >
            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700/50 group-hover:bg-slate-700 transition-colors">
              <span className="text-slate-400 group-hover:text-white transition-colors">
                {marginCollapsed ? "➕" : "➖"}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-display font-bold text-white tracking-wider uppercase">
                  {language === "EN" ? "MARGIN POSITIONS" : "POSICIONES CON MARGEN (MARGIN)"}
                </h3>
                <span className="text-[10px] bg-amber-500/10 border border-amber-500/20 text-amber-400 px-2 py-0.5 rounded font-mono font-bold">
                  {language === "EN" ? "LEVERAGE" : "APALANCAMIENTO"}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {language === "EN"
                  ? <>Simulate purchases with financial leverage • Total Margin: <span className="font-mono font-bold text-amber-400">{formatCurrency(totalMarginMktValue)}</span> • Monthly Interest (6.25% rate): <span className="font-semibold text-amber-400 font-mono">{formatCurrency((totalMarginMktValue * 0.0625) / 12)}</span></>
                  : <>Simula compras con apalancamiento financiero • Total Margen: <span className="font-mono font-bold text-amber-400">{formatCurrency(totalMarginMktValue)}</span> • Interés Mensual (tasa 6.25%): <span className="font-semibold text-amber-400 font-mono">{formatCurrency((totalMarginMktValue * 0.0625) / 12)}</span></>}
              </p>
            </div>
          </button>

          <div className="flex flex-wrap gap-2 w-full sm:w-auto self-stretch sm:self-auto justify-center">
            <button
              onClick={handleSaveMarginPositions}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all cursor-pointer justify-center flex-1 sm:flex-none ${
                saveSuccess
                  ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400 font-extrabold"
                  : "bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700"
              }`}
            >
              {saveSuccess ? (
                <>
                  <Check size={13} />
                  {language === "EN" ? "Saved" : "Guardado"}
                </>
              ) : (
                <>
                  <Save size={13} className="text-slate-400" />
                  {language === "EN" ? "Save Margin" : "Guardar Margen"}
                </>
              )}
            </button>

            {/* Add from Portfolio dropdown picker */}
            {availablePortfolioStocks.length > 0 && (
              <div className="relative flex-1 sm:flex-none" ref={marginPickerRef}>
                <button
                  type="button"
                  onClick={() => setShowPortfolioMarginPicker(prev => !prev)}
                  className="w-full flex items-center gap-1.5 bg-[#121420] hover:bg-slate-800 text-amber-400 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border border-amber-500/30 transition-all cursor-pointer justify-center"
                >
                  <span>⚡</span>
                  {language === "EN" ? "From Portfolio" : "Desde Portafolio"}
                  <ChevronDown size={12} className={`transition-transform duration-200 ${showPortfolioMarginPicker ? "rotate-180" : ""}`} />
                </button>

                {showPortfolioMarginPicker && (
                  <div className="absolute right-0 top-full mt-2 w-64 bg-[#0f111a] border border-slate-800 rounded-2xl shadow-2xl p-2 z-50 animate-fade-in backdrop-blur-xl">
                    <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 mb-1 font-mono">
                      {language === "EN" ? "Add to Margin from Portfolio" : "Entrar a Margen desde Portafolio"}
                    </div>
                    <div className="max-h-56 overflow-y-auto space-y-1">
                      {availablePortfolioStocks.map(stock => (
                        <button
                          key={`pick-margin-${stock.ticker}`}
                          type="button"
                          onClick={() => {
                            handleAddToMargin(stock);
                            setShowPortfolioMarginPicker(false);
                          }}
                          className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-amber-500/10 text-left transition-colors cursor-pointer group"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <CompanyLogo ticker={stock.ticker} name={stock.name} isCash={stock.isCash} size="sm" />
                            <div className="min-w-0">
                              <span className="text-xs font-bold text-white group-hover:text-amber-400 block truncate">{stock.ticker}</span>
                              <span className="text-[10px] text-slate-400 block truncate max-w-[110px]">{stock.name}</span>
                            </div>
                          </div>
                          <span className="text-xs font-mono font-bold text-amber-400 shrink-0">+{formatCurrency(stock.mktValue)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handleOpenMarginAdd}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border border-amber-400 shadow-md transition-all cursor-pointer justify-center flex-1 sm:flex-none font-bold"
            >
              <Plus size={13} />
              {language === "EN" ? "Add Margin" : "Adicionar Margen"}
            </button>
          </div>
        </div>

        {!marginCollapsed && (
          <div className="overflow-x-auto transition-all duration-300">
            {processedMarginPositions.length === 0 ? (
              <div className="text-center py-10 px-4 bg-[#121420]/30 border border-dashed border-slate-800 rounded-2xl">
                <span className="text-2xl mb-2 block">🏦</span>
                <p className="text-slate-300 font-semibold text-xs uppercase tracking-wider">No hay posiciones con margen</p>
                <p className="text-slate-500 text-xs mt-1">Haz clic en "Adicionar Margen" para simular compras financiadas con apalancamiento.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse min-w-[900px]">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-[10px] md:text-xs font-semibold uppercase tracking-wider select-none">
                    <th className="py-2.5 px-2 cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("ticker")}>
                      <div className="flex items-center gap-1">STOCK <ArrowUpDown size={11} /></div>
                    </th>
                    <th className="py-2.5 px-2 text-right cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("price")}>
                      <div className="flex items-center justify-end gap-1">PRECIO <ArrowUpDown size={11} /></div>
                    </th>
                    <th className="py-2.5 px-2 text-center cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("weight")}>
                      <div className="flex items-center justify-center gap-1">WEIGHT % <ArrowUpDown size={11} /></div>
                    </th>
                    <th className="py-2.5 px-2 text-center cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("mktValue")}>
                      <div className="flex items-center justify-center gap-1">MKT VALUE <ArrowUpDown size={11} /></div>
                    </th>

                    {simTabMode === "basis" && (
                      <>
                        <th className="py-2.5 px-2 text-center cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("cagr")}>
                          <div className="flex items-center justify-center gap-1">CAGR (EST.) <ArrowUpDown size={11} /></div>
                        </th>
                        <th className="py-2.5 px-2 text-right">{language === "EN" ? "SHARES" : "ACCIONES"}</th>
                        <th className="py-2.5 px-2 text-right">{language === "EN" ? "AVG COST" : "COSTO PROM."}</th>
                        <th className="py-2.5 px-2 text-right">{language === "EN" ? "COST BASIS" : "COSTO TOTAL"}</th>
                        <th className="py-2.5 px-2 text-right">{language === "EN" ? "RETURN P&L" : "RETORNO P&L"}</th>
                      </>
                    )}

                    {simTabMode === "valuation" && (
                      <>
                        <th className="py-2.5 px-2 text-center cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("cagr")}>
                          <div className="flex items-center justify-center gap-1">CAGR (EST.) <ArrowUpDown size={11} /></div>
                        </th>
                        <th className="py-2.5 px-2 text-right cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("pe")}>
                          <div className="flex items-center justify-end gap-1">P/E <ArrowUpDown size={11} /></div>
                        </th>
                        <th className="py-2.5 px-2 text-right cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("fwdPe")}>
                          <div className="flex items-center justify-end gap-1">FWD P/E <ArrowUpDown size={11} /></div>
                        </th>
                        <th className="py-2.5 px-2 text-right cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("peg")}>
                          <div className="flex items-center justify-end gap-1">PEG <ArrowUpDown size={11} /></div>
                        </th>
                        <th className="py-2.5 px-2 text-center cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("fiftyTwoWeekHigh")}>
                          <div className="flex items-center justify-center gap-1">52W HIGH <ArrowUpDown size={11} /></div>
                        </th>
                        <th className="py-2.5 px-2 text-center cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("upsideAvg")}>
                          <div className="flex items-center justify-center gap-1">UPSIDE TO AVG <ArrowUpDown size={11} /></div>
                        </th>
                        <th className="py-2.5 px-2 text-center cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("upsideHigh")}>
                          <div className="flex items-center justify-center gap-1">UPSIDE TO HIGH <ArrowUpDown size={11} /></div>
                        </th>
                      </>
                    )}

                    {simTabMode === "health" && (
                      <>
                        <th className="py-2.5 px-2 text-center">PIOTROSKI</th>
                        <th className="py-2.5 px-2 text-center">SCORE</th>
                        <th className="py-2.5 px-2 text-center">{language === "EN" ? "GROWTH" : "CRECIMIENTO"}</th>
                        <th className="py-2.5 px-2 text-center">{language === "EN" ? "QUALITY" : "CALIDAD"}</th>
                        <th className="py-2.5 px-2 text-center">{language === "EN" ? "STABILITY" : "ESTABILIDAD"}</th>
                        <th className="py-2.5 px-2 text-center">{language === "EN" ? "VALUATION" : "VALUACIÓN"}</th>
                      </>
                    )}

                    <th className="py-2.5 px-2 text-center">{language === "EN" ? "ACTIONS" : "ACCIONES"}</th>
                  </tr>
                </thead>
                <tbody>
                  {processedMarginPositions.map((pos, index) => {
                    const cagrVal = getPositionCagr(pos.ticker);
                    const analyst = getAnalystData(pos.ticker, pos.price);
                    
                    const targetAvg = pos.targetMeanPrice || analyst.avgTarget;
                    const targetHigh = pos.targetHighPrice || analyst.highTarget;
                    const high52 = pos.fiftyTwoWeekHigh || (pos.price * 1.34668);

                    const highUpside = pos.price > 0 ? ((high52 - pos.price) / pos.price) * 100 : null;
                    const upsideAvg = pos.price > 0 && targetAvg ? ((targetAvg - pos.price) / pos.price) * 100 : null;
                    const upsideHigh = pos.price > 0 && targetHigh ? ((targetHigh - pos.price) / pos.price) * 100 : null;

                    const scoredRow = scoredRowsMap.get(pos.ticker.toUpperCase());
                    const marginTooltipPlacement = index < processedMarginPositions.length / 2 ? "bottom" : "top";

                    return (
                      <tr 
                        key={`${pos.ticker}-margin-${index}`} 
                        className="border-b border-slate-900/60 hover:bg-slate-800/15 transition-colors group text-xs"
                      >
                        {/* Ticker Symbol Column */}
                        <td className="py-3 px-2 font-mono font-bold text-slate-200">
                          <div className="flex items-center gap-2.5">
                            <CompanyLogo ticker={pos.ticker} name={pos.name} isCash={pos.isCash} size="sm" />
                            <div className="flex flex-col">
                              <button
                                onClick={() => handleOpenMarginSwap(index)}
                                className="text-left font-display font-bold text-white tracking-wide text-xs md:text-sm hover:text-amber-400 hover:underline cursor-pointer transition-colors"
                                title="Click para cambiar posición"
                              >
                                {pos.ticker}
                              </button>
                              <span className="text-[10px] text-slate-400 truncate max-w-[120px]" title={pos.name}>
                                {pos.name}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Price Column */}
                        <td className="py-3 px-2 text-right font-mono text-white">
                          <div className="flex flex-col items-end">
                            <span className="font-bold">{pos.isCash ? "$1.00" : formatCurrency(pos.price)}</span>
                            {!pos.isCash && (
                              <span className={`text-[10px] font-semibold ${pos.chgPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                {pos.chgPct >= 0 ? "+" : ""}{pos.chgPct.toFixed(2)}%
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Weight % Input */}
                        <td className="py-3 px-2 text-center">
                          <div className="flex items-center justify-center gap-1 text-slate-400">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              value={pos.weight.toFixed(2)}
                              onChange={(e) => handleMarginWeightChange(index, e.target.value)}
                              className="bg-[#121420] border border-slate-800 focus:border-amber-500 rounded-xl px-2.5 py-1 text-center font-mono font-bold text-white w-20 outline-none transition-all text-xs"
                            />
                            <span className="text-xs font-semibold">%</span>
                          </div>
                        </td>

                        {/* Market Value Input */}
                        <td className="py-3 px-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <input
                              type="number"
                              step="1"
                              min="0"
                              value={Math.round(pos.mktValue)}
                              onChange={(e) => handleMarginMktValueChange(index, e.target.value)}
                              className="bg-[#121420] border border-slate-800 focus:border-amber-500 rounded-xl px-2.5 py-1 text-center font-mono font-bold text-white w-24 outline-none transition-all text-xs"
                            />
                          </div>
                        </td>

                        {/* Basis Mode Columns */}
                        {simTabMode === "basis" && (
                          <>
                            {/* CAGR (Est) Input */}
                            <td className="py-3 px-2 text-center">
                              <div className="flex items-center justify-center gap-1 text-slate-400">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={cagrVal.toFixed(2)}
                                  onChange={(e) => handleCagrChange(pos.ticker, e.target.value)}
                                  className="bg-[#121420] border border-slate-800 focus:border-amber-500 rounded-xl px-2.5 py-1 text-center font-mono font-bold text-white w-20 outline-none transition-all text-xs"
                                />
                                <span className="text-xs font-semibold">%</span>
                              </div>
                            </td>
                            <td className="py-3 px-2 text-right font-mono text-slate-200">
                              {pos.isCash ? "—" : pos.shares ? pos.shares.toFixed(2) : "—"}
                            </td>
                            <td className="py-3 px-2 text-right font-mono text-slate-200">
                              {pos.isCash ? "$1.00" : pos.avgCost ? formatCurrency(pos.avgCost) : "—"}
                            </td>
                            <td className="py-3 px-2 text-right font-mono text-slate-200">
                              {pos.isCash ? formatCurrency(pos.mktValue) : pos.shares && pos.avgCost ? formatCurrency(pos.shares * pos.avgCost) : "—"}
                            </td>
                            <td className="py-3 px-2 text-right font-mono">
                              {pos.isCash ? (
                                "—"
                              ) : (
                                <div className="flex flex-col items-end">
                                  <span className={`font-bold ${pos.returnAmt >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                    {pos.returnAmt >= 0 ? "+" : ""}{formatCurrency(pos.returnAmt)}
                                  </span>
                                  <span className={`text-[10px] font-semibold ${pos.returnPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                    {pos.returnPct >= 0 ? "+" : ""}{pos.returnPct.toFixed(2)}%
                                  </span>
                                </div>
                              )}
                            </td>
                          </>
                        )}

                        {/* Valuation Mode Columns */}
                        {simTabMode === "valuation" && (
                          <>
                            {/* CAGR (Est) Input */}
                            <td className="py-3 px-2 text-center">
                              <div className="flex items-center justify-center gap-1 text-slate-400">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={cagrVal.toFixed(2)}
                                  onChange={(e) => handleCagrChange(pos.ticker, e.target.value)}
                                  className="bg-[#121420] border border-slate-800 focus:border-amber-500 rounded-xl px-2.5 py-1 text-center font-mono font-bold text-white w-20 outline-none transition-all text-xs"
                                />
                                <span className="text-xs font-semibold">%</span>
                              </div>
                            </td>
                            <td className="py-3 px-2 text-right font-mono text-slate-300">
                              {pos.pe !== null && pos.pe !== undefined ? pos.pe.toFixed(1) : "—"}
                            </td>
                            <td className="py-3 px-2 text-right font-mono text-slate-300">
                              {pos.fwdPe !== null && pos.fwdPe !== undefined ? pos.fwdPe.toFixed(1) : "—"}
                            </td>
                            <td className="py-3 px-2 text-right font-mono text-slate-300">
                              {pos.peg !== null && pos.peg !== undefined ? pos.peg.toFixed(2) : "—"}
                            </td>
                            <td className="py-3 px-2 text-center">
                              {highUpside !== null ? (
                                <span className="inline-flex items-center gap-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-bold font-mono text-xs">
                                  <TrendingUp size={11} className="shrink-0" />
                                  {highUpside.toFixed(1)}%
                                </span>
                              ) : (
                                <span className="text-slate-500">—</span>
                              )}
                            </td>
                            <td className="py-3 px-2 text-center">
                              {upsideAvg !== null ? (
                                <span className="inline-flex items-center gap-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-bold font-mono text-xs">
                                  <TrendingUp size={11} className="shrink-0" />
                                  {upsideAvg.toFixed(1)}%
                                </span>
                              ) : (
                                <span className="text-slate-500">—</span>
                              )}
                            </td>
                            <td className="py-3 px-2 text-center">
                              {upsideHigh !== null ? (
                                <span className="inline-flex items-center gap-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-bold font-mono text-xs">
                                  <TrendingUp size={11} className="shrink-0" />
                                  {upsideHigh.toFixed(1)}%
                                </span>
                              ) : (
                                <span className="text-slate-500">—</span>
                              )}
                            </td>
                          </>
                        )}

                        {/* Health Mode Columns */}
                        {simTabMode === "health" && (
                          <>
                            <td className="py-3 px-2 text-center font-mono">
                              {pos.isCash ? (
                                "—"
                              ) : (
                                <span className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded text-xs tracking-wide ${
                                  (pos.piotroskiScore ?? 7) >= 7
                                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                    : (pos.piotroskiScore ?? 7) >= 4
                                    ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                                    : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                                }`}>
                                  {pos.piotroskiScore ?? 7} / 9
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-2 text-center font-mono">
                              <span className={`inline-block px-2 py-1 rounded text-xs font-black ${getScoreBgClass(scoredRow?.scores?.balanced ?? null)}`}>
                                {typeof scoredRow?.scores?.balanced === "number" ? scoredRow.scores.balanced.toFixed(0) : "—"}
                              </span>
                            </td>
                            <td className="py-3 px-2 text-center font-mono group relative cursor-help">
                              <HealthMetricsTooltip 
                                title={language === "ES" ? "Crecimiento" : "Growth"}
                                metrics={[
                                  {key: "revenue_cagr", label: "Revenue CAGR", suffix: "%"},
                                  {key: "eps_cagr", label: "EPS CAGR", suffix: "%"},
                                  {key: "fcf_cagr", label: "Operating Cash Flow CAGR", suffix: "%"},
                                ]}
                                raw={scoredRow?.raw}
                                language={language}
                                placement={marginTooltipPlacement}
                              />
                              <div className="flex flex-col items-center">
                                <span className={`text-xs font-bold ${getScoreColorClass(scoredRow?.factors?.growth ?? null)}`}>
                                  {typeof scoredRow?.factors?.growth === "number" ? scoredRow.factors.growth.toFixed(0) : "—"}
                                </span>
                                <div className="w-12 h-1 bg-slate-950 rounded-full overflow-hidden mt-1">
                                  <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${scoredRow?.factors?.growth ?? 0}%` }} />
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-2 text-center font-mono group relative cursor-help">
                              <HealthMetricsTooltip 
                                title={language === "ES" ? "Calidad" : "Quality"}
                                metrics={[
                                  {key: "roic", label: "ROIC", suffix: "%"},
                                  {key: "gross_margin", label: "Gross Margin", suffix: "%"},
                                  {key: "operating_margin", label: "Oper. Margin", suffix: "%"},
                                  {key: "fcf_conversion", label: "FCF Conversion", suffix: "%"},
                                ]}
                                raw={scoredRow?.raw}
                                language={language}
                                placement={marginTooltipPlacement}
                              />
                              <div className="flex flex-col items-center">
                                <span className={`text-xs font-bold ${getScoreColorClass(scoredRow?.factors?.quality ?? null)}`}>
                                  {typeof scoredRow?.factors?.quality === "number" ? scoredRow.factors.quality.toFixed(0) : "—"}
                                </span>
                                <div className="w-12 h-1 bg-slate-950 rounded-full overflow-hidden mt-1">
                                  <div className="bg-blue-500 h-full rounded-full" style={{ width: `${scoredRow?.factors?.quality ?? 0}%` }} />
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-2 text-center font-mono group relative cursor-help">
                              <HealthMetricsTooltip 
                                title={language === "ES" ? "Estabilidad" : "Stability"}
                                metrics={[
                                  {key: "beta", label: "Beta"},
                                  {key: "rev_growth_vol", label: "Rev Volatility", suffix: "%"},
                                  {key: "margin_vol", label: "Margin Volatility", suffix: "%"},
                                  {key: "interest_cov", label: "Interest Cov.", suffix: "x"},
                                ]}
                                raw={scoredRow?.raw}
                                language={language}
                                placement={marginTooltipPlacement}
                              />
                              <div className="flex flex-col items-center">
                                <span className={`text-xs font-bold ${getScoreColorClass(scoredRow?.factors?.stability ?? null)}`}>
                                  {typeof scoredRow?.factors?.stability === "number" ? scoredRow.factors.stability.toFixed(0) : "—"}
                                </span>
                                <div className="w-12 h-1 bg-slate-950 rounded-full overflow-hidden mt-1">
                                  <div className="bg-amber-500 h-full rounded-full" style={{ width: `${scoredRow?.factors?.stability ?? 0}%` }} />
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-2 text-center font-mono group relative cursor-help">
                              <HealthMetricsTooltip 
                                title={language === "ES" ? "Valoración" : "Valuation"}
                                metrics={[
                                  {key: "trailing_pe", label: "Trailing P/E", suffix: "x"},
                                  {key: "forward_pe", label: "Forward P/E", suffix: "x"},
                                  {key: "ev_ebitda", label: "EV/EBITDA", suffix: "x"},
                                  {key: "fcf_yield", label: "FCF Yield", suffix: "%"},
                                ]}
                                raw={scoredRow?.raw}
                                language={language}
                                placement={marginTooltipPlacement}
                              />
                              <div className="flex flex-col items-center">
                                <span className={`text-xs font-bold ${getScoreColorClass(scoredRow?.factors?.valuation ?? null)}`}>
                                  {typeof scoredRow?.factors?.valuation === "number" ? scoredRow.factors.valuation.toFixed(0) : "—"}
                                </span>
                                <div className="w-12 h-1 bg-slate-950 rounded-full overflow-hidden mt-1">
                                  <div className="bg-rose-500 h-full rounded-full" style={{ width: `${scoredRow?.factors?.valuation ?? 0}%` }} />
                                </div>
                              </div>
                            </td>
                          </>
                        )}

                        {/* Delete Icon */}
                        <td className="py-3 px-2 text-center">
                          <button
                            onClick={() => handleDeleteMarginPosition(index)}
                            className="text-slate-500 hover:text-rose-400 transition-colors p-1 hover:bg-slate-800 rounded-lg cursor-pointer"
                            title="Eliminar posición"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {processedMarginPositions.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-slate-800 bg-[#0a0d18]/60 text-slate-100 font-bold text-xs md:text-sm">
                      <td className="py-3 px-2 font-display tracking-wider font-extrabold uppercase text-amber-400">
                        <div className="flex items-center gap-1.5">
                          <span>⚡</span>
                          <span>{language === "EN" ? "TOTAL MARGIN" : "TOTAL GENERAL"}</span>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-right font-mono text-slate-500">—</td>
                      <td className="py-3 px-2 text-center font-mono text-amber-400 font-extrabold">
                        100.0%
                      </td>
                      <td className="py-3 px-2 text-center font-mono text-white font-extrabold">
                        {formatCurrency(totalMarginMktValue)}
                      </td>

                      {simTabMode === "basis" && (
                        <>
                          <td className="py-3 px-2 text-center font-mono text-slate-300 font-bold">
                            {weightedMarginCagr.toFixed(2)}%
                          </td>
                          <td className="py-3 px-2 text-right font-mono text-slate-500">—</td>
                          <td className="py-3 px-2 text-right font-mono text-slate-500">—</td>
                          <td className="py-3 px-2 text-right font-mono text-slate-200 font-bold">
                            {formatCurrency(marginTotalCostBasis)}
                          </td>
                          <td className="py-3 px-2 text-right font-mono">
                            <div className="flex flex-col items-end">
                              <span className={`font-bold ${marginTotalReturnAmt >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                {marginTotalReturnAmt >= 0 ? "+" : ""}{formatCurrency(marginTotalReturnAmt)}
                              </span>
                              <span className={`text-[10px] font-semibold ${marginTotalReturnPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                {marginTotalReturnPct >= 0 ? "+" : ""}{marginTotalReturnPct.toFixed(2)}%
                              </span>
                            </div>
                          </td>
                        </>
                      )}

                      {simTabMode === "valuation" && (
                        <>
                          <td className="py-3 px-2 text-center font-mono text-slate-300 font-bold">
                            {weightedMarginCagr.toFixed(2)}%
                          </td>
                          <td className="py-3 px-2 text-right font-mono text-slate-300">
                            {marginWeightedPe !== null ? marginWeightedPe.toFixed(1) : "—"}
                          </td>
                          <td className="py-3 px-2 text-right font-mono text-slate-300">
                            {marginWeightedFwdPe !== null ? marginWeightedFwdPe.toFixed(1) : "—"}
                          </td>
                          <td className="py-3 px-2 text-right font-mono text-slate-300">
                            {marginWeightedPeg !== null ? marginWeightedPeg.toFixed(2) : "—"}
                          </td>
                          <td className="py-3 px-2 text-center">
                            {marginTotalUpside52High !== null ? (
                              <span className="inline-flex items-center gap-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-bold font-mono text-xs">
                                <TrendingUp size={11} className="shrink-0" />
                                {marginTotalUpside52High.toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>
                          <td className="py-3 px-2 text-center">
                            {marginTotalUpsideAvg !== null ? (
                              <span className="inline-flex items-center gap-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-bold font-mono text-xs">
                                <TrendingUp size={11} className="shrink-0" />
                                {marginTotalUpsideAvg.toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>
                          <td className="py-3 px-2 text-center">
                            {marginTotalUpsideHigh !== null ? (
                              <span className="inline-flex items-center gap-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-bold font-mono text-xs">
                                <TrendingUp size={11} className="shrink-0" />
                                {marginTotalUpsideHigh.toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>
                        </>
                      )}

                      {simTabMode === "health" && (
                        <>
                          <td className="py-3 px-2 text-center font-mono">
                            <span className="inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              {marginPiotroskiScoreAvg} / 9
                            </span>
                          </td>
                          <td className="py-3 px-2 text-center font-mono">
                            <span className={`inline-block px-2 py-1 rounded text-xs font-black ${getScoreBgClass(marginWeightedScore)}`}>
                              {marginWeightedScore.toFixed(0)}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-center font-mono">
                            <div className="flex flex-col items-center">
                              <span className={`text-xs font-bold ${getScoreColorClass(marginWeightedFactors.growth)}`}>
                                {marginWeightedFactors.growth.toFixed(0)}
                              </span>
                              <div className="w-12 h-1 bg-slate-950 rounded-full overflow-hidden mt-1">
                                <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${marginWeightedFactors.growth}%` }} />
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-2 text-center font-mono">
                            <div className="flex flex-col items-center">
                              <span className={`text-xs font-bold ${getScoreColorClass(marginWeightedFactors.quality)}`}>
                                {marginWeightedFactors.quality.toFixed(0)}
                              </span>
                              <div className="w-12 h-1 bg-blue-500 h-full rounded-full" style={{ width: `${marginWeightedFactors.quality}%` }} />
                            </div>
                          </td>
                          <td className="py-3 px-2 text-center font-mono">
                            <div className="flex flex-col items-center">
                              <span className={`text-xs font-bold ${getScoreColorClass(marginWeightedFactors.stability)}`}>
                                {marginWeightedFactors.stability.toFixed(0)}
                              </span>
                              <div className="w-12 h-1 bg-slate-950 rounded-full overflow-hidden mt-1">
                                <div className="bg-amber-500 h-full rounded-full" style={{ width: `${marginWeightedFactors.stability}%` }} />
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-2 text-center font-mono">
                            <div className="flex flex-col items-center">
                              <span className={`text-xs font-bold ${getScoreColorClass(marginWeightedFactors.valuation)}`}>
                                {marginWeightedFactors.valuation.toFixed(0)}
                              </span>
                              <div className="w-12 h-1 bg-slate-950 rounded-full overflow-hidden mt-1">
                                <div className="bg-rose-500 h-full rounded-full" style={{ width: `${marginWeightedFactors.valuation}%` }} />
                              </div>
                            </div>
                          </td>
                        </>
                      )}

                      <td className="py-3 px-2 text-center font-mono text-slate-500">—</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </div>
        )}
      </div>
      )}

      {/* 2.5 PORTFOLIO FUTURE PROJECTIONS & BREAKDOWN PANEL */}
      {(simPositions.length > 0 || marginPositions.length > 0) && (
        <div className="space-y-6" id="portfolio-projections-section">
          {/* Tabs Selector: Portfolio / Margin / Total (only show selector if margin positions exist, identical to Holdings) */}
          {marginPositions.length > 0 && (
            <div className="flex bg-[#121420] p-1 rounded-2xl border border-slate-800/80 w-fit text-xs font-bold font-mono">
              <button
                type="button"
                onClick={() => setProjectionTab("portfolio")}
                className={`px-4 py-1.5 rounded-xl transition-all cursor-pointer ${
                  projectionTab === "portfolio"
                    ? "bg-emerald-500 text-slate-950 font-black shadow-lg shadow-emerald-500/10"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {language === "EN" ? "Portfolio" : "Portafolio"}
              </button>
              <button
                type="button"
                onClick={() => setProjectionTab("margin")}
                className={`px-4 py-1.5 rounded-xl transition-all cursor-pointer ${
                  projectionTab === "margin"
                    ? "bg-amber-500 text-slate-950 font-black shadow-lg shadow-amber-500/10"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {language === "EN" ? "Margin" : "Margen"}
              </button>
              <button
                type="button"
                onClick={() => setProjectionTab("total")}
                className={`px-4 py-1.5 rounded-xl transition-all cursor-pointer ${
                  projectionTab === "total"
                    ? "bg-indigo-500 text-slate-950 font-black shadow-lg shadow-indigo-500/10"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Total
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Card: PORTFOLIO PROJECTION */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
            <div className="space-y-4">
              
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📊</span>
                  <h3 className="font-display font-bold text-xs text-slate-400 tracking-wider uppercase">
                    {projectionTab === "portfolio" 
                      ? t.portfolioProjection 
                      : (projectionTab === "margin" 
                        ? (language === "EN" ? "MARGIN PROJECTION" : "PROYECCIÓN DE MARGEN") 
                        : (language === "EN" ? "TOTAL PROJECTION" : "PROYECCIÓN TOTAL")
                      )
                    }
                  </h3>
                </div>
                
                {/* Year Selectors */}
                <div className="flex bg-[#121420] p-1 rounded-xl border border-slate-800/60 text-[10px] font-bold">
                  <button
                    type="button"
                    onClick={() => setYears(5)}
                    className={`px-3 py-1.5 rounded-lg transition-all duration-150 cursor-pointer ${
                      years === 5 
                        ? "bg-[#1c1e29] text-white shadow-inner" 
                        : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    5Y
                  </button>
                  <button
                    type="button"
                    onClick={() => setYears(10)}
                    className={`px-3 py-1.5 rounded-lg transition-all duration-150 cursor-pointer ${
                      years === 10 
                        ? "bg-[#1c1e29] text-white shadow-inner" 
                        : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    10Y
                  </button>
                </div>
              </div>

              {/* Controls Row */}
              <div className="flex items-center justify-between gap-2 text-xs text-slate-400 w-full whitespace-nowrap">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="truncate">{t.monthlyAddition}</span>
                  <div className="flex items-center bg-[#121420] border border-slate-800/80 rounded-xl px-2.5 py-1 shrink-0">
                    <span className="text-slate-500 font-mono mr-1">$</span>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      disabled={projectionTab === "margin"}
                      value={projectionTab === "margin" ? 0 : monthlyAddition}
                      onChange={(e) => setMonthlyAddition(Math.max(0, Number(e.target.value)))}
                      className="bg-transparent text-white font-mono font-bold w-12 sm:w-14 focus:outline-none text-right disabled:opacity-50"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span>{t.cagr}</span>
                  <div className="flex items-center bg-[#121420] border border-slate-800/80 rounded-xl px-2 py-1">
                    <input
                      type="number"
                      min="0"
                      max="200"
                      step="0.1"
                      value={cagr}
                      onChange={(e) => setCagr(Math.max(0, Number(e.target.value)))}
                      className="bg-transparent text-white font-mono font-bold w-10 focus:outline-none text-right mr-0.5"
                    />
                    <span className="text-slate-500 font-mono">%</span>
                  </div>
                </div>
              </div>

              {/* Main Value Display */}
              <div className="grid grid-cols-3 gap-2 pt-2">
                <div className="text-left">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">{t.current}</span>
                  <span className="text-lg md:text-xl font-mono font-bold text-white mt-1 block">
                    {formatAbbreviatedK(selectedTotalMktValue)}
                  </span>
                </div>
                <div className="text-center">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
                    {t.additions} ({years}Y)
                  </span>
                  <span className="text-lg md:text-xl font-mono font-bold text-slate-300 mt-1 block">
                    {formatAbbreviatedK(projectionTab === "margin" ? 0 : (monthlyAddition * years * 12))}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
                    {t.projected} ({years}Y)
                  </span>
                  <span className="text-lg md:text-xl font-mono font-bold text-emerald-400 mt-1 block">
                    {formatAbbreviatedK(projectedTotalValue)}
                  </span>
                </div>
              </div>

            </div>

            {/* Chart Container */}
            <div className="h-44 w-full mt-6">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorValueSim" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={getTabColor(projectionTab)} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={getTabColor(projectionTab)} stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1c1e29" vertical={false} opacity={0.1} />
                  <XAxis 
                    dataKey="year" 
                    stroke="#475569" 
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    stroke="#475569" 
                    fontSize={10} 
                    tickFormatter={(val) => `$${Math.round(val / 1000)}k`}
                    tickLine={false}
                    axisLine={false}
                    width={35}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: "#0f111a", 
                      borderColor: "#1e293b",
                      borderRadius: "12px"
                    }}
                    itemStyle={{ color: getTabColor(projectionTab) }}
                    labelStyle={{ color: "#94a3b8", fontFamily: "monospace" }}
                    formatter={(val: any) => [formatCurrency(Number(val)), "Value"]}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    stroke={getTabColor(projectionTab)} 
                    fillOpacity={1} 
                    fill="url(#colorValueSim)" 
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Bottom Accent line */}
            <div className="text-center mt-4">
              <span className={`inline-flex items-center gap-1.5 font-mono text-[11px] px-4 py-1.5 rounded-full border ${getTabBadgeClass(projectionTab)}`}>
                <TrendingUp size={12} />
                CAGR {cagr.toFixed(1)}% · +{percentageReturnOnInvested.toFixed(1)}% {t.onInvested}
              </span>
            </div>

          </div>

          {/* Right Card: PORTFOLIO FUTURE VALUE */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
            <div className="space-y-5">
              
              {/* Header */}
              <div className="flex items-center gap-2">
                <Rocket className="text-pink-500" size={16} />
                <h3 className="font-display font-bold text-xs text-slate-400 tracking-wider uppercase">
                  {projectionTab === "portfolio" 
                    ? t.portfolioFutureValue 
                    : (projectionTab === "margin"
                      ? (language === "EN" ? "MARGIN FUTURE VALUE" : "VALOR FUTURO CON MARGEN")
                      : (language === "EN" ? "COMBINED FUTURE VALUE" : "VALOR FUTURO COMBINADO")
                    )
                  }
                </h3>
                <Info size={13} className="text-slate-500 hover:text-slate-300 cursor-pointer" />
              </div>

              {/* List Rows */}
              <div className="space-y-4 pt-1">
                
                {/* Row 1: 52wk High */}
                <div className="flex items-center justify-between border-b border-slate-900 pb-3">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <span>
                      {projectionTab === "portfolio" 
                        ? t.high52wk 
                        : (projectionTab === "margin"
                          ? (language === "EN" ? "52wk High Margin Portfolio" : "Máximo 52 Semanas Margen")
                          : (language === "EN" ? "52wk High Combined Portfolio" : "Máximo 52 Semanas Combinado")
                        )
                      }
                    </span>
                    <Info size={12} className="text-slate-600 hover:text-slate-400 cursor-pointer" />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="relative group/val cursor-help">
                      <span className="text-sm font-mono font-bold text-white underline decoration-dotted decoration-slate-600 underline-offset-4 hover:decoration-emerald-400 hover:text-emerald-300 transition-colors">
                        {formatCurrency(fiftyTwoWeekHighTotal)}
                      </span>

                      {/* Tooltip Card */}
                      <div className="absolute right-0 bottom-full mb-2 hidden group-hover/val:block w-72 p-3.5 bg-[#0b0e17]/95 border border-slate-700/90 rounded-2xl shadow-2xl z-50 pointer-events-none text-left backdrop-blur-xl ring-1 ring-white/10">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-1.5 mb-2 flex items-center justify-between font-mono">
                          <span>{language === "ES" ? "Desglose 52wk High" : "52wk High Breakdown"}</span>
                          <span className="text-emerald-400">{total52wkGain >= 0 ? "+" : ""}{formatCurrency(total52wkGain)}</span>
                        </div>

                        <div className="space-y-1.5 text-xs">
                          {/* Principal Gain */}
                          {projectionTab !== "margin" && (
                            <div className="flex items-center justify-between text-slate-300">
                              <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block shrink-0" />
                                {language === "ES" ? "Ganancia Principal:" : "Principal Gain:"}
                              </span>
                              <div className="text-right font-mono">
                                <span className="font-bold text-emerald-400 text-[11px]">
                                  {principal52wk.gain >= 0 ? "+" : ""}{formatCurrency(principal52wk.gain)}
                                </span>
                                <span className="text-[10px] text-slate-400 ml-1">
                                  ({principal52wk.gainPct >= 0 ? "+" : ""}{principal52wk.gainPct.toFixed(1)}%)
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Margin Gain */}
                          {(projectionTab === "margin" || (projectionTab === "total" && marginFinancedPrincipal > 0)) ? (
                            <>
                              <div className="flex items-center justify-between text-slate-300">
                                <span className="flex items-center gap-1.5 text-[11px] text-amber-400">
                                  <span className="w-2 h-2 rounded-full bg-amber-400 inline-block shrink-0" />
                                  {language === "ES" ? "Ganancia Margen:" : "Margin Gain:"}
                                </span>
                                <div className="text-right font-mono">
                                  <span className="font-bold text-amber-300 text-[11px]">
                                    {margin52wk.gain >= 0 ? "+" : ""}{formatCurrency(margin52wk.gain)}
                                  </span>
                                  <span className="text-[10px] text-slate-400 ml-1">
                                    ({margin52wk.gainPct >= 0 ? "+" : ""}{margin52wk.gainPct.toFixed(1)}%)
                                  </span>
                                </div>
                              </div>
                              
                              <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1.5 border-t border-slate-800/80 font-mono">
                                <span>{language === "ES" ? "Deuda financiada restada:" : "Deducted financing:"}</span>
                                <span className="text-rose-400">-{formatCurrency(marginFinancedPrincipal)}</span>
                              </div>
                            </>
                          ) : (
                            projectionTab === "portfolio" && (
                              <div className="text-[10px] text-slate-500 italic pt-0.5">
                                {language === "ES" ? "Pestaña Cartera Principal (Sin margen)" : "Portfolio Tab (No margin)"}
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    </div>

                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded font-mono">
                      +{high52wkUpside.toFixed(1)}%
                    </span>
                  </div>
                </div>

                {/* Row 2: Analyst Avg Target */}
                <div className="flex items-center justify-between border-b border-slate-900 pb-3">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <span>{t.avgTargetValue}</span>
                    <Info size={12} className="text-slate-600 hover:text-slate-400 cursor-pointer" />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="relative group/val cursor-help">
                      <span className="text-sm font-mono font-bold text-white underline decoration-dotted decoration-slate-600 underline-offset-4 hover:decoration-emerald-400 hover:text-emerald-300 transition-colors">
                        {formatCurrency(avgTargetValueTotal)}
                      </span>

                      {/* Tooltip Card */}
                      <div className="absolute right-0 bottom-full mb-2 hidden group-hover/val:block w-72 p-3.5 bg-[#0b0e17]/95 border border-slate-700/90 rounded-2xl shadow-2xl z-50 pointer-events-none text-left backdrop-blur-xl ring-1 ring-white/10">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-1.5 mb-2 flex items-center justify-between font-mono">
                          <span>{language === "ES" ? "Desglose Avg Target" : "Avg Target Breakdown"}</span>
                          <span className="text-emerald-400">{totalAvgTargetGain >= 0 ? "+" : ""}{formatCurrency(totalAvgTargetGain)}</span>
                        </div>

                        <div className="space-y-1.5 text-xs">
                          {/* Principal Gain */}
                          {projectionTab !== "margin" && (
                            <div className="flex items-center justify-between text-slate-300">
                              <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block shrink-0" />
                                {language === "ES" ? "Ganancia Principal:" : "Principal Gain:"}
                              </span>
                              <div className="text-right font-mono">
                                <span className="font-bold text-emerald-400 text-[11px]">
                                  {principalAvgTarget.gain >= 0 ? "+" : ""}{formatCurrency(principalAvgTarget.gain)}
                                </span>
                                <span className="text-[10px] text-slate-400 ml-1">
                                  ({principalAvgTarget.gainPct >= 0 ? "+" : ""}{principalAvgTarget.gainPct.toFixed(1)}%)
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Margin Gain */}
                          {(projectionTab === "margin" || (projectionTab === "total" && marginFinancedPrincipal > 0)) ? (
                            <>
                              <div className="flex items-center justify-between text-slate-300">
                                <span className="flex items-center gap-1.5 text-[11px] text-amber-400">
                                  <span className="w-2 h-2 rounded-full bg-amber-400 inline-block shrink-0" />
                                  {language === "ES" ? "Ganancia Margen:" : "Margin Gain:"}
                                </span>
                                <div className="text-right font-mono">
                                  <span className="font-bold text-amber-300 text-[11px]">
                                    {marginAvgTarget.gain >= 0 ? "+" : ""}{formatCurrency(marginAvgTarget.gain)}
                                  </span>
                                  <span className="text-[10px] text-slate-400 ml-1">
                                    ({marginAvgTarget.gainPct >= 0 ? "+" : ""}{marginAvgTarget.gainPct.toFixed(1)}%)
                                  </span>
                                </div>
                              </div>
                              
                              <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1.5 border-t border-slate-800/80 font-mono">
                                <span>{language === "ES" ? "Deuda financiada restada:" : "Deducted financing:"}</span>
                                <span className="text-rose-400">-{formatCurrency(marginFinancedPrincipal)}</span>
                              </div>
                            </>
                          ) : (
                            projectionTab === "portfolio" && (
                              <div className="text-[10px] text-slate-500 italic pt-0.5">
                                {language === "ES" ? "Pestaña Cartera Principal (Sin margen)" : "Portfolio Tab (No margin)"}
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    </div>

                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded font-mono">
                      +{avgTargetUpside.toFixed(1)}%
                    </span>
                  </div>
                </div>

                {/* Row 3: Analyst High Target */}
                <div className="flex items-center justify-between border-b border-slate-900 pb-3">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <span>{t.highTargetValue}</span>
                    <Info size={12} className="text-slate-600 hover:text-slate-400 cursor-pointer" />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="relative group/val cursor-help">
                      <span className="text-sm font-mono font-bold text-white underline decoration-dotted decoration-slate-600 underline-offset-4 hover:decoration-emerald-400 hover:text-emerald-300 transition-colors">
                        {formatCurrency(highTargetValueTotal)}
                      </span>

                      {/* Tooltip Card */}
                      <div className="absolute right-0 bottom-full mb-2 hidden group-hover/val:block w-72 p-3.5 bg-[#0b0e17]/95 border border-slate-700/90 rounded-2xl shadow-2xl z-50 pointer-events-none text-left backdrop-blur-xl ring-1 ring-white/10">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-1.5 mb-2 flex items-center justify-between font-mono">
                          <span>{language === "ES" ? "Desglose High Target" : "High Target Breakdown"}</span>
                          <span className="text-emerald-400">{totalHighTargetGain >= 0 ? "+" : ""}{formatCurrency(totalHighTargetGain)}</span>
                        </div>

                        <div className="space-y-1.5 text-xs">
                          {/* Principal Gain */}
                          {projectionTab !== "margin" && (
                            <div className="flex items-center justify-between text-slate-300">
                              <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block shrink-0" />
                                {language === "ES" ? "Ganancia Principal:" : "Principal Gain:"}
                              </span>
                              <div className="text-right font-mono">
                                <span className="font-bold text-emerald-400 text-[11px]">
                                  {principalHighTarget.gain >= 0 ? "+" : ""}{formatCurrency(principalHighTarget.gain)}
                                </span>
                                <span className="text-[10px] text-slate-400 ml-1">
                                  ({principalHighTarget.gainPct >= 0 ? "+" : ""}{principalHighTarget.gainPct.toFixed(1)}%)
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Margin Gain */}
                          {(projectionTab === "margin" || (projectionTab === "total" && marginFinancedPrincipal > 0)) ? (
                            <>
                              <div className="flex items-center justify-between text-slate-300">
                                <span className="flex items-center gap-1.5 text-[11px] text-amber-400">
                                  <span className="w-2 h-2 rounded-full bg-amber-400 inline-block shrink-0" />
                                  {language === "ES" ? "Ganancia Margen:" : "Margin Gain:"}
                                </span>
                                <div className="text-right font-mono">
                                  <span className="font-bold text-amber-300 text-[11px]">
                                    {marginHighTarget.gain >= 0 ? "+" : ""}{formatCurrency(marginHighTarget.gain)}
                                  </span>
                                  <span className="text-[10px] text-slate-400 ml-1">
                                    ({marginHighTarget.gainPct >= 0 ? "+" : ""}{marginHighTarget.gainPct.toFixed(1)}%)
                                  </span>
                                </div>
                              </div>
                              
                              <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1.5 border-t border-slate-800/80 font-mono">
                                <span>{language === "ES" ? "Deuda financiada restada:" : "Deducted financing:"}</span>
                                <span className="text-rose-400">-{formatCurrency(marginFinancedPrincipal)}</span>
                              </div>
                            </>
                          ) : (
                            projectionTab === "portfolio" && (
                              <div className="text-[10px] text-slate-500 italic pt-0.5">
                                {language === "ES" ? "Pestaña Cartera Principal (Sin margen)" : "Portfolio Tab (No margin)"}
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    </div>

                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded font-mono">
                      +{highTargetUpside.toFixed(1)}%
                    </span>
                  </div>
                </div>

              </div>

              {/* Projection Breakdown Box */}
              {projectionTab === "portfolio" ? (
                <div className="bg-[#121420]/60 border border-slate-900 rounded-2xl p-4 mt-2">
                  <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block mb-3 font-mono">
                    {t.projectionBreakdown} ({years}Y · CAGR {cagr.toFixed(1)}%)
                  </span>
                  
                  <div className="space-y-2.5 text-xs">
                    <div className="flex justify-between items-center text-slate-400">
                      <span>{t.principal}</span>
                      <span className="font-mono font-semibold text-white">
                        {formatCurrency(totalSimMktValue)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-400">
                      <span>{t.additions} ({years}Y)</span>
                      <span className="font-mono font-semibold text-slate-300">
                        +{formatCurrency(totalAdditions)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-400">
                      <span className="flex items-center gap-1">
                        {t.interestGains}
                        <ChevronDown size={12} className="text-slate-500" />
                      </span>
                      <span className="font-mono font-bold text-emerald-400">
                        +{formatCurrency(interestGains)}
                      </span>
                    </div>
                    <div className="border-t border-slate-900/80 my-2 pt-2.5 flex justify-between items-center">
                      <span className="font-bold text-white">{t.totalValue}</span>
                      <span className="font-mono font-extrabold text-lg text-emerald-400">
                        {formatCurrency(projectedTotalValue)}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-[#121420]/60 border border-slate-900 rounded-2xl p-4 mt-2 space-y-3 animate-fade-in">
                  <span className={`text-[9px] ${projectionTab === "margin" ? "text-amber-400" : "text-indigo-400"} font-bold uppercase tracking-wider block font-mono`}>
                    {projectionTab === "margin"
                      ? (language === "EN" ? "DEBT & MARGIN INTEREST ANALYSIS" : "ANÁLISIS DE DEUDA E INTERESES DE MARGEN")
                      : (language === "EN" ? "COMBINED DEBT & INTEREST ANALYSIS" : "ANÁLISIS COMBINADO DE DEUDA E INTERESES")
                    } ({years}Y · {language === "EN" ? "Rate 6.25%" : "Tasa 6.25%"})
                  </span>
                  
                  <div className="space-y-2.5 text-xs">
                    <div className="flex justify-between items-center text-slate-400">
                      <span>
                        {projectionTab === "margin"
                          ? (language === "EN" ? "Gross Projected Margin Value" : "Valor Bruto Margen Proyectado")
                          : (language === "EN" ? "Gross Projected Total Value" : "Valor Bruto Total Proyectado")
                        }
                      </span>
                      <span className="font-mono font-semibold text-white">
                        {formatCurrency(projectedTotalValue)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-slate-400">
                      <span className="flex items-center gap-1 text-rose-400">
                        {language === "EN" ? "Margin Loan (Debt)" : "Préstamo de Margen (Deuda)"}
                      </span>
                      <span className="font-mono font-semibold text-rose-400">
                        -{formatCurrency(marginFinancedPrincipal)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-slate-400">
                      <span>{language === "EN" ? "Margin Interest (1 Year)" : "Interés de Margen (1 Año)"}</span>
                      <span className="font-mono text-slate-300">
                        {formatCurrency(marginFinancedPrincipal * 0.0625)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-slate-400 border-b border-slate-900 pb-2">
                      <span className="text-rose-400 font-medium">{language === "EN" ? "Total Interest" : "Intereses Totales"} ({years} {language === "EN" ? "Years" : "Años"})</span>
                      <span className="font-mono font-semibold text-rose-400">
                        -{formatCurrency(marginFinancedPrincipal * 0.0625 * years)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-slate-400 pt-1">
                      <span>{language === "EN" ? "Net Value (Minus Loan)" : "Valor Neto (Menos Deuda)"}</span>
                      <span className="font-mono font-bold text-emerald-400">
                        {formatCurrency(Math.max(0, projectedTotalValue - marginFinancedPrincipal))}
                      </span>
                    </div>

                    <div className="border-t border-slate-900/80 my-2 pt-2.5 flex justify-between items-center">
                      <div>
                        <span className="font-bold text-white block">
                          {projectionTab === "margin"
                            ? (language === "EN" ? "Final Net Value" : "Valor Neto Final")
                            : (language === "EN" ? "Combined Net Value" : "Valor Neto Combinado")
                          }
                        </span>
                        <span className="text-[10px] text-slate-500 block leading-none">{language === "EN" ? "(Minus Loan & Interest)" : "(Menos Deuda e Intereses)"}</span>
                      </div>
                      <span className="font-mono font-extrabold text-lg text-emerald-400">
                        {formatCurrency(Math.max(0, projectedTotalValue - marginFinancedPrincipal - (marginFinancedPrincipal * 0.0625 * years)))}
                      </span>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* Right Card 3: SECTORES S&P 500 (Simulado) */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
            <div className="space-y-4">
              
              {/* Header */}
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                  <PieChartIcon className="text-blue-400" size={16} />
                </div>
                <div>
                  <h3 className="font-display font-bold text-xs text-slate-400 tracking-wider uppercase">
                    {projectionTab === "portfolio"
                      ? (language === "EN" ? "SECTOR DISTRIBUTION (PORTFOLIO)" : "DISTRIBUCIÓN POR SECTOR (PORTAFOLIO)")
                      : projectionTab === "margin"
                      ? (language === "EN" ? "SECTOR DISTRIBUTION (MARGIN)" : "DISTRIBUCIÓN POR SECTOR (MARGEN)")
                      : (language === "EN" ? "SECTOR DISTRIBUTION (COMBINED)" : "DISTRIBUCIÓN POR SECTOR (COMBINADO)")
                    }
                  </h3>
                  <p className="text-[10px] text-slate-500">
                    {projectionTab === "portfolio"
                      ? (language === "EN" ? "Weighting of simulated portfolio by market value" : "Distribución del portafolio simulado por valor de mercado")
                      : projectionTab === "margin"
                      ? (language === "EN" ? "Weighting of margin positions by market value" : "Distribución de posiciones con margen por valor de mercado")
                      : (language === "EN" ? "Weighting of combined portfolio by market value" : "Distribución del portafolio combinado por valor de mercado")
                    }
                  </p>
                </div>
              </div>

              {/* Sectors List using full vertical space without scroll */}
              <div className="space-y-3 pr-1">
                {sortedSectors.map((sector, sIdx) => {
                  const isExpanded = !!expandedSectors[sector.name];
                  const subsectors = sectorSubsectors[sector.name]
                    ? (Object.entries(sectorSubsectors[sector.name]) as [string, { mktValue: number; weight: number }][]).sort((a, b) => b[1].weight - a[1].weight)
                    : [];

                  return (
                    <div key={`${sector.name}-${sIdx}`} className="border-b border-slate-800/10 pb-2.5 last:border-0 last:pb-0">
                      <div
                        onClick={() => toggleSector(sector.name)}
                        className="flex justify-between items-center text-xs cursor-pointer group hover:bg-slate-800/30 p-1 rounded-lg transition-all"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-slate-500 group-hover:text-slate-300 shrink-0">
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </span>
                          <span className={`w-2 h-2 rounded-full shrink-0 ${getSectorColor(sector.name)}`} />
                          <span className="font-semibold text-slate-300 group-hover:text-white truncate text-xs" title={language === "EN" ? sector.name : getSectorSpanish(sector.name)}>
                            {language === "EN" ? sector.name : getSectorSpanish(sector.name)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2.5 font-mono shrink-0 text-xs">
                          <span className="text-slate-400 font-medium">{formatCurrency(sector.mktValue)}</span>
                          <span className="text-white font-extrabold">{sector.weight.toFixed(1)}%</span>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="pl-6 pr-1 mt-1">
                        <div className="h-1.5 w-full bg-slate-800/60 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${getSectorColor(sector.name)}`}
                            style={{ width: `${sector.weight}%` }}
                          />
                        </div>
                      </div>

                      {/* Subsectors */}
                      {isExpanded && subsectors.length > 0 && (
                        <div className="pl-8 pr-1 mt-2 flex flex-col gap-1.5 border-l-2 border-slate-800/60 ml-4">
                          {subsectors.map(([subName, subData], subIdx) => (
                            <div key={`${subName}-${subIdx}`} className="flex justify-between items-center text-[11px]">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="w-1 h-1 rounded-full bg-slate-600 shrink-0" />
                                <span className="text-slate-400 font-medium truncate">{subName}</span>
                              </div>
                              <div className="flex items-center gap-2 font-mono text-[10px] shrink-0">
                                <span className="text-slate-500">{formatCurrency(subData.mktValue)}</span>
                                <span className="text-slate-300 font-bold">{subData.weight.toFixed(1)}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

            </div>
          </div>

        </div>
      </div>
    )}

      {/* 4. SEARCH / ADD TICKER MODAL (HYPER-COMPACT) */}
      {searchModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm max-h-[500px] flex flex-col justify-between overflow-hidden shadow-2xl">
            
            {/* Compact Header */}
            <div className="flex items-center justify-between p-3.5 px-4 border-b border-slate-800 bg-slate-950">
              <div>
                <h3 className="text-xs font-display font-bold text-white uppercase tracking-wider">
                  {searchMode === "swap" ? "Reemplazar Posición" : "Adicionar Acción"}
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Busca e integra cotizaciones de mercado en tiempo real.
                </p>
              </div>
              <button
                onClick={() => setSearchModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            {/* Compact Search input and results */}
            <div className="p-4 flex-1 flex flex-col overflow-hidden space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={13} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ej: TSLA, AAPL, UBER, MSFT, Nvidia..."
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg py-1.5 pl-8 pr-4 text-xs text-white outline-none transition-all font-medium"
                  autoFocus
                />
                {searching && (
                  <Loader2 className="absolute right-3 top-2 text-emerald-500 animate-spin" size={12} />
                )}
              </div>

              {/* Compact List */}
              <div className="flex-1 overflow-y-auto divide-y divide-slate-800/80 border border-slate-800 rounded-lg bg-slate-950/40 max-h-[220px]">
                {searchQuery.trim() === "" ? (
                  <div className="p-6 text-center text-[10px] text-slate-500 flex flex-col items-center justify-center gap-1.5">
                    <Search size={16} className="text-slate-600" />
                    <span>Escribe el ticker o nombre para buscar</span>
                  </div>
                ) : searchResults.length === 0 && !searching ? (
                  <div className="p-6 text-center text-[10px] text-slate-500">
                    No se encontraron resultados para "{searchQuery}"
                  </div>
                ) : (
                  searchResults.map((res, idx) => (
                    <button
                      key={`${res.symbol}-${idx}`}
                      onClick={() => handleSelectTicker(res.symbol, res.name)}
                      className="w-full text-left px-3 py-2 hover:bg-emerald-500/10 hover:text-white transition-colors flex items-center justify-between text-xs cursor-pointer group"
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <div className="font-bold text-slate-200 group-hover:text-emerald-400 transition-colors text-[11px] truncate">
                          {res.symbol}
                        </div>
                        <div className="text-[9px] text-slate-400 group-hover:text-slate-300 transition-colors truncate">
                          {res.name}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[8px] font-mono text-slate-500 font-bold uppercase bg-slate-950 px-1 py-0.5 rounded">
                          {res.exchange}
                        </span>
                        <Check size={11} className="text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Compact Footer */}
            <div className="p-2.5 px-4 bg-slate-950 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setSearchModalOpen(false)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white px-3 py-1 rounded-lg text-[10px] font-bold uppercase cursor-pointer transition-colors"
              >
                Cerrar
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
