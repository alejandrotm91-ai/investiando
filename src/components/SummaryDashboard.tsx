import React, { useState, useEffect } from "react";
import { PortfolioData, ChartDataPoint, Position } from "../types";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { TrendingUp, TrendingDown, DollarSign, Wallet, ArrowUpRight, ArrowDownRight, Activity, Calendar, Loader2, PieChart as PieChartIcon, ChevronDown, ChevronRight, BarChart3, Rocket, Eye, EyeOff, X } from "lucide-react";
import { getTickerSector, getSectorSpanish, getSectorColor, getTickerBeta, getTickerSubsector, getDividendPerShare } from "./HoldingsTable";
import { PortfolioDistributionDonut } from "./PortfolioDistributionDonut";
import { getRawFeatures, buildScores, overrideFeaturesWithFinancials } from "../utils/engine";
import { calculatePortfolioScoreFromMatrix, getStockScore } from "../utils/stockScoresMatrix";
import { getCachedFinancials, getAllCachedFinancials, setCachedFinancials } from "../utils/financialsCache";

const BENCHMARK_METRICS = {
  SP500: {
    pe: 25.2,
    fwdPe: 21.4,
    peg: 1.80,
    beta: 1.00,
    top50Concentration: 45
  },
  QQQ: {
    pe: 32.5,
    fwdPe: 26.2,
    peg: 1.55,
    beta: 1.18,
    top50Concentration: 11
  }
};


function generateFallbackChartData(symbol: string, timeframe: string, positions: Position[] = []): ChartDataPoint[] {
  const pointsCount = timeframe === "1D" ? 12 : timeframe === "1W" ? 7 : timeframe === "1M" ? 30 : 60;
  const result: ChartDataPoint[] = [];
  const now = new Date();

  // Determine an overall trend baseline from portfolio return
  const posReturn = positions.reduce((acc, p) => acc + (p.returnPct || 0) * (p.weight || 0), 0) / 100;
  const totalTrend = Math.max(-15, Math.min(25, posReturn * 100));

  for (let i = pointsCount - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dateStr = timeframe === "1D"
      ? `${(now.getHours() - i + 24) % 24}:00`
      : d.toISOString().split("T")[0];

    const progress = (pointsCount - 1 - i) / Math.max(1, pointsCount - 1);
    const wave = Math.sin(progress * Math.PI * 2) * 0.8 + Math.cos(progress * Math.PI * 3) * 0.4;

    const selVal = +(progress * (totalTrend || 3.2) + wave).toFixed(2);
    const vooVal = +(progress * 2.5 + wave * 0.6).toFixed(2);
    const qqqVal = +(progress * 3.8 + wave * 1.1).toFixed(2);

    result.push({
      date: dateStr,
      selection: selVal,
      voo: vooVal,
      qqq: qqqVal,
    });
  }

  return result;
}

interface SummaryDashboardProps {
  portfolio: PortfolioData;
  onSelectTickerForChart: (ticker: string) => void;
  onNavigateToHealth?: () => void;
  language?: "EN" | "ES";
  portfolioName?: string;
  isReadOnly?: boolean;
  theme?: "dark" | "light";
  financialsMap?: Record<string, { annual: any[]; quarterly: any[] }>;
}

export default function SummaryDashboard({ 
  portfolio, 
  onSelectTickerForChart, 
  onNavigateToHealth, 
  language = "ES", 
  portfolioName, 
  isReadOnly = false, 
  theme = "dark",
  financialsMap: propFinancialsMap,
}: SummaryDashboardProps) {
  const [chartSymbol, setChartSymbol] = useState<string>("PORTFOLIO");
  
  const validPositions = React.useMemo(() => {
    return portfolio?.positions ? portfolio.positions.filter(p => p.ticker !== "MARGIN_PAID") : [];
  }, [portfolio?.positions]);
  const [timeframe, setTimeframe] = useState<string>("YTD");
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loadingChart, setLoadingChart] = useState<boolean>(false);
  const [expandedSectors, setExpandedSectors] = useState<Record<string, boolean>>({});
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [benchmarkToggle, setBenchmarkToggle] = useState<"SP500" | "QQQ">("SP500");
  const [showPortfolioTotal, setShowPortfolioTotal] = useState<boolean>(true);
  const [mobileDynamicsModal, setMobileDynamicsModal] = useState<"up" | "down" | null>(null);
  
  const [years, setYears] = useState<number>(10);
  const [monthlyAddition, setMonthlyAddition] = useState<number>(500);
  const [cagr, setCagr] = useState<number>(10);

  const handleSelectTicker = (ticker: string | null) => {
    setSelectedTicker(ticker);
    const nextSymbol = ticker || "PORTFOLIO";
    setChartSymbol(nextSymbol);
    if (onSelectTickerForChart) {
      onSelectTickerForChart(nextSymbol);
    }
  };

  const [localFinancialsMap, setLocalFinancialsMap] = useState<Record<string, { annual: any[]; quarterly: any[] }>>(() => getAllCachedFinancials());

  const effectiveFinancialsMap = React.useMemo(() => {
    return {
      ...getAllCachedFinancials(),
      ...(propFinancialsMap || {}),
      ...localFinancialsMap,
    };
  }, [propFinancialsMap, localFinancialsMap]);

  useEffect(() => {
    const fetchAllFinancials = async () => {
      if (!portfolio || !validPositions) return;
      const tickersToFetch: string[] = Array.from(new Set(validPositions.filter(p => !p.isCash && p.ticker && p.ticker.toUpperCase() !== "CASH" && p.ticker.toUpperCase() !== "USD").map(p => p.ticker)));
      if (tickersToFetch.length === 0) return;

      const missing = tickersToFetch.filter((t: string) => !getCachedFinancials(t));
      if (missing.length > 0) {
        const results = await Promise.all(missing.map(async t => {
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
        const sortFn = (a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime();
        results.forEach(r => {
          if (r.data && !r.data.error) {
            if (Array.isArray(r.data.annual)) r.data.annual.sort(sortFn);
            if (Array.isArray(r.data.quarterly)) r.data.quarterly.sort(sortFn);
            setCachedFinancials(r.ticker, r.data);
          }
        });
      }
      setLocalFinancialsMap(getAllCachedFinancials());
    };
    fetchAllFinancials();
  }, [portfolio]);

  const portfolioWeightedHealth = React.useMemo(() => {
    if (!portfolio || !validPositions) return null;
    const stockPositions = validPositions.filter(p => !p.isCash);
    if (stockPositions.length === 0) return null;
    
    return calculatePortfolioScoreFromMatrix(stockPositions, effectiveFinancialsMap);
  }, [portfolio, effectiveFinancialsMap]);

  const portfolioWeightedScore = portfolioWeightedHealth ? portfolioWeightedHealth.score : 0;
  const portfolioWeightedType = portfolioWeightedHealth ? portfolioWeightedHealth.dominantType : null;

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

  const toggleSector = (sectorName: string) => {
    setExpandedSectors(prev => ({
      ...prev,
      [sectorName]: !prev[sectorName]
    }));
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);
  };

  const formatValuation = (val: number | null) => {
    if (val === null) return "—";
    if (isReadOnly || Math.abs(val) >= 1000000) {
      const abs = Math.abs(val);
      if (abs >= 1000000000) {
        const billions = val / 1000000000;
        return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(billions) + "Bn";
      }
      if (abs >= 1000000) {
        const millions = val / 1000000;
        return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(millions) + "M";
      }
      if (abs === 0) return "$0.00";
    }
    return formatCurrency(val);
  };

  const formatKValue = (val: number | null) => {
    if (val === null) return "—";
    const thousands = val / 1000;
    const formatted = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(thousands);
    return `$${formatted}K`;
  };

  const formatStockValue = (val: number | null) => {
    if (val === null) return "—";
    if (isReadOnly || Math.abs(val) >= 1000000) {
      const abs = Math.abs(val);
      if (abs >= 1000000000) {
        const billions = val / 1000000000;
        return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(billions) + "Bn";
      }
      if (abs >= 1000000) {
        const millions = val / 1000000;
        return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(millions) + "M";
      }
      if (abs === 0) return "$0.00";
    }
    return formatCurrency(val);
  };

  const formatPercent = (val: number) => {
    return `${val >= 0 ? "+" : ""}${val.toFixed(2)}%`;
  };

  const getScoreHex = (score: number | null) => {
    if (score === null || isNaN(score) || score === 0) return "#64748b";
    if (score >= 75) return "#34d399";
    if (score >= 50) return "#60a5fa";
    if (score >= 35) return "#fbbf24";
    return "#fb7185";
  };

  const getScoreColorClass = (score: number | null) => {
    if (score === null || isNaN(score) || score === 0) return "text-slate-500";
    if (score >= 75) return "text-emerald-400";
    if (score >= 50) return "text-blue-400";
    if (score >= 35) return "text-amber-400";
    return "text-rose-400";
  };

  const formatXAxis = (tickItem: string) => {
    try {
      const date = new Date(tickItem + "T00:00:00");
      if (isNaN(date.getTime())) return tickItem;
      
      const isGreaterOrEqual5Y = timeframe === "5Y" || timeframe === "10Y" || timeframe === "ALL";
      
      if (isGreaterOrEqual5Y) {
        // Greater than 1Y: adjust by years
        return date.getFullYear().toString();
      } else if (timeframe === "1Y" || timeframe === "YTD" || timeframe === "6M" || timeframe === "3M") {
        // Adjust by months
        const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
        return months[date.getMonth()];
      } else {
        // 1M and below: adjust by days
        const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
        return `${date.getDate()} ${months[date.getMonth()]}`;
      }
    } catch {
      return tickItem;
    }
  };

  const customTicks = React.useMemo(() => {
    if (!chartData || chartData.length === 0) return undefined;

    if (timeframe === "1W") {
      return undefined;
    }

    if (timeframe === "1M") {
      const step = Math.max(1, Math.floor(chartData.length / 5));
      const result: string[] = [];
      for (let i = 0; i < chartData.length; i += step) {
        result.push(chartData[i].date);
      }
      if (chartData.length > 0 && result[result.length - 1] !== chartData[chartData.length - 1].date) {
        result.push(chartData[chartData.length - 1].date);
      }
      return result;
    }

    if (timeframe === "3M" || timeframe === "6M" || timeframe === "YTD" || timeframe === "1Y") {
      // Pick exactly one tick per month (last available date of each month)
      const monthLastDateMap = new Map<string, string>();
      for (const item of chartData) {
        if (!item.date) continue;
        const monthKey = item.date.substring(0, 7); // "YYYY-MM"
        monthLastDateMap.set(monthKey, item.date);
      }
      return Array.from(monthLastDateMap.values());
    }

    if (timeframe === "5Y" || timeframe === "10Y" || timeframe === "ALL") {
      // Pick exactly one tick per year (last available date of each year)
      const yearLastDateMap = new Map<string, string>();
      for (const item of chartData) {
        if (!item.date) continue;
        const yearKey = item.date.substring(0, 4); // "YYYY"
        yearLastDateMap.set(yearKey, item.date);
      }
      return Array.from(yearLastDateMap.values());
    }

    return undefined;
  }, [chartData, timeframe]);

  const latestReturns = React.useMemo(() => {
    if (!chartData || chartData.length === 0) return null;
    const lastPoint = chartData[chartData.length - 1];
    return {
      selection: typeof lastPoint.selection === "number" ? lastPoint.selection : null,
      voo: typeof lastPoint.voo === "number" ? lastPoint.voo : null,
      qqq: typeof lastPoint.qqq === "number" ? lastPoint.qqq : null,
    };
  }, [chartData]);

  const sortedLegendItems = React.useMemo(() => {
    const items = [
      {
        id: "selection",
        name: chartSymbol === "PORTFOLIO" ? ((!portfolioName || portfolioName === "Mi Portafolio" || portfolioName === "My Portfolio") ? (language === "EN" ? "My Portfolio" : "Mi Portafolio") : portfolioName) : `${chartSymbol}`,
        returnVal: latestReturns?.selection,
        dotClass: theme === "light" ? "bg-[#0e6245]" : "bg-white",
        textClass: "text-slate-300",
        valueColorClass: latestReturns?.selection !== null && latestReturns?.selection !== undefined && latestReturns.selection >= 0 ? "text-emerald-400" : "text-rose-400",
      },
      {
        id: "voo",
        name: "S&P 500",
        returnVal: latestReturns?.voo,
        dotClass: "bg-sky-400",
        textClass: "text-sky-400",
        valueColorClass: latestReturns?.voo !== null && latestReturns?.voo !== undefined && latestReturns.voo >= 0 ? "text-sky-300" : "text-rose-400",
      },
      {
        id: "qqq",
        name: "NASDAQ-100",
        returnVal: latestReturns?.qqq,
        dotClass: "bg-emerald-400",
        textClass: "text-emerald-400",
        valueColorClass: latestReturns?.qqq !== null && latestReturns?.qqq !== undefined && latestReturns.qqq >= 0 ? "text-emerald-400" : "text-rose-400",
      },
    ];

    return [...items].sort((a, b) => {
      const valA = a.returnVal ?? -Infinity;
      const valB = b.returnVal ?? -Infinity;
      return valB - valA;
    });
  }, [latestReturns, chartSymbol, portfolioName, language, theme]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      // Sort payload by value descending (highest to lowest)
      const sortedPayload = [...payload].sort((a, b) => {
        const valA = Number(a.value ?? 0);
        const valB = Number(b.value ?? 0);
        return valB - valA;
      });

      // Format date beautifully
      let formattedDate = label;
      try {
        const date = new Date(label + "T00:00:00");
        if (!isNaN(date.getTime())) {
          const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
          formattedDate = `${date.getDate()} ${months[date.getMonth()]}, ${date.getFullYear()}`;
        }
      } catch (e) {
        // ignore
      }

      return (
        <div className="bg-slate-955/95 backdrop-blur-md border border-slate-800 p-4 rounded-2xl shadow-2xl min-w-[210px] flex flex-col gap-2.5 z-50">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-800/60 pb-2">
            {language === "EN" ? "Date:" : "Fecha:"} {formattedDate}
          </p>
          <div className="flex flex-col gap-2">
            {sortedPayload.map((item: any, idx: number) => {
              const isSelection = item.name === "selection";
              const labelName = isSelection
                ? (chartSymbol === "PORTFOLIO" ? ((!portfolioName || portfolioName === "Mi Portafolio" || portfolioName === "My Portfolio") ? (language === "EN" ? "My Portfolio" : "Mi Portafolio") : portfolioName) : chartSymbol)
                : item.name === "voo" ? "S&P 500" : "NASDAQ-100";

              const textClass = isSelection
                ? "text-white font-extrabold"
                : item.name === "voo" ? "text-sky-400 font-semibold" : "text-emerald-400 font-semibold";

              const val = Number(item.value ?? 0);
              return (
                <div key={idx} className="flex items-center justify-between gap-5 text-xs">
                  <div className="flex items-center gap-2">
                    <span 
                      className="w-2.5 h-2.5 rounded-full" 
                      style={{ 
                        backgroundColor: isSelection 
                          ? "#ffffff" 
                          : item.name === "voo" ? "#0ea5e9" : "#10b981" 
                      }} 
                    />
                    <span className="text-slate-300 font-medium">{labelName}</span>
                  </div>
                  <span className={textClass}>
                    {val >= 0 ? "+" : ""}{val.toFixed(2)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    return null;
  };

  // Fetch chart data when timeframe or symbol changes
  useEffect(() => {
    let active = true;
    const fetchChart = async () => {
      setLoadingChart(true);
      try {
        const response = await fetch("/api/portfolio/chart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbol: chartSymbol,
            timeframe: timeframe,
            positions: validPositions,
          }),
        });
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }
        const data = await response.json();
        if (active) {
          if (Array.isArray(data) && data.length > 0) {
            setChartData(data);
          } else {
            setChartData(generateFallbackChartData(chartSymbol, timeframe, validPositions));
          }
        }
      } catch (err) {
        if (active) {
          setChartData(generateFallbackChartData(chartSymbol, timeframe, validPositions));
        }
      } finally {
        if (active) setLoadingChart(false);
      }
    };

    fetchChart();
    return () => {
      active = false;
    };
  }, [chartSymbol, timeframe, validPositions]);

  // Identify top gainer and top loser in portfolio (excluding Cash)
  const stockPositions = validPositions.filter((p) => !p.isCash);
  const sortedByDailyChg = [...stockPositions].sort((a, b) => b.chgPct - a.chgPct);
  const topGainer = sortedByDailyChg[0];
  const topLoser = sortedByDailyChg[sortedByDailyChg.length - 1];

  // Auto-expand sector when a ticker is selected
  useEffect(() => {
    if (selectedTicker) {
      const pos = validPositions.find(p => p.ticker === selectedTicker);
      if (pos) {
        const sector = getTickerSector(pos.ticker, pos.isCash);
        setExpandedSectors(prev => ({
          ...prev,
          [sector]: true
        }));
      }
    }
  }, [selectedTicker, validPositions]);

  // Allocation pie chart data
  const pieData = validPositions.map((pos) => ({
    name: pos.ticker,
    value: Number(pos.mktValue.toFixed(2)),
    weight: pos.weight,
  }));

  // Filter positions for pie chart if a sector is selected
  const filteredPositionsForPie = selectedSector
    ? validPositions.filter(pos => getTickerSector(pos.ticker, pos.isCash) === selectedSector)
    : validPositions;

  // Pie chart total value
  const pieTotalValue = selectedSector
    ? filteredPositionsForPie.reduce((sum, p) => sum + p.mktValue, 0)
    : portfolio.totals.mktValue;

  const sortedForPie = [...filteredPositionsForPie].sort((a, b) => b.weight - a.weight);
  
  // Filter positions with weight >= 1% (or all positions if a sector filter is active)
  const individualPositions = selectedSector
    ? sortedForPie
    : sortedForPie.filter((pos) => pos.weight >= 1);
  const otherPositions = selectedSector
    ? []
    : sortedForPie.filter((pos) => pos.weight < 1);

  const effectiveIndividual = individualPositions.length > 0 ? individualPositions : sortedForPie.slice(0, 5);
  const effectiveOthers = individualPositions.length > 0 ? otherPositions : sortedForPie.slice(5);
  
  const pieDataDisplay = effectiveIndividual.map((pos) => ({
    name: pos.ticker,
    value: Number(pos.mktValue.toFixed(2)),
    weight: pos.weight,
  }));
  
  if (effectiveOthers.length > 0) {
    const othersMktValue = effectiveOthers.reduce((sum, p) => sum + p.mktValue, 0);
    const othersWeight = effectiveOthers.reduce((sum, p) => sum + p.weight, 0);
    pieDataDisplay.push({
      name: language === "ES" ? "Otros (<1%)" : "Other (<1%)",
      value: Number(othersMktValue.toFixed(2)),
      weight: othersWeight,
    });
  }

  const COLORS = [
    "#10b981", // emerald-500
    "#06b6d4", // cyan-500
    "#3b82f6", // blue-500
    "#6366f1", // indigo-500
    "#8b5cf6", // violet-500
    "#d946ef", // fuchsia-500
    "#ec4899", // pink-500
    "#f43f5e", // rose-500
    "#f97316", // orange-500
    "#f59e0b", // amber-500
    "#eab308", // yellow-500
    "#84cc16", // lime-500
    "#14b8a6", // teal-500
    "#0ea5e9", // sky-500
    "#a855f7", // purple-500
    "#fb7185", // rose-400
    "#38bdf8", // sky-400
    "#4ade80", // green-400
    "#fb923c", // orange-400
    "#818cf8", // indigo-400
    "#64748b", // slate-500
  ];

  const cashPosition = validPositions.find((p) => p.isCash);
  const cashAmount = cashPosition ? cashPosition.mktValue : 0;

  const formatNumber = (val: number | null, decimals = 2) => {
    if (val === null || isNaN(val)) return "—";
    return val.toFixed(decimals);
  };

  // Sort positions: Stocks first (by market value desc), Cash last
  const sortedPositions = [...validPositions].sort((a, b) => {
    if (a.isCash) return 1;
    if (b.isCash) return -1;
    return b.mktValue - a.mktValue;
  });

  const sectorSubsectors = sortedPositions.reduce((acc, pos) => {
    const sector = getTickerSector(pos.ticker, pos.isCash);
    const subsector = getTickerSubsector(pos.ticker, pos.isCash, language === "EN" ? "EN" : "ES");
    if (!acc[sector]) {
      acc[sector] = {};
    }
    if (!acc[sector][subsector]) {
      acc[sector][subsector] = { mktValue: 0, weight: 0 };
    }
    acc[sector][subsector].mktValue += pos.mktValue;
    acc[sector][subsector].weight += pos.weight;
    return acc;
  }, {} as Record<string, Record<string, { mktValue: number; weight: number }>>);

  // 1. Sector distribution calculations
  const sectorWeights = sortedPositions.reduce((acc, pos) => {
    const sector = getTickerSector(pos.ticker, pos.isCash);
    acc[sector] = (acc[sector] || 0) + pos.weight;
    return acc;
  }, {} as Record<string, number>);

  const sectorMktValues = sortedPositions.reduce((acc, pos) => {
    const sector = getTickerSector(pos.ticker, pos.isCash);
    acc[sector] = (acc[sector] || 0) + pos.mktValue;
    return acc;
  }, {} as Record<string, number>);

  // Sort sectors by weight descending
  const sortedSectors = (Object.entries(sectorWeights) as [string, number][])
    .map(([name, weight]) => ({
      name,
      weight,
      mktValue: sectorMktValues[name] || 0
    }))
    .sort((a, b) => b.weight - a.weight);

  // Filter sectors if a specific position is selected
  const filteredSectors = selectedTicker
    ? sortedSectors.filter(s => 
        validPositions.some(pos => 
          pos.ticker === selectedTicker && getTickerSector(pos.ticker, pos.isCash) === s.name
        )
      )
    : sortedSectors;

  // 2. Weighted Multiples & Metrics
  const selectedPosition = selectedTicker
    ? validPositions.find((p) => p.ticker === selectedTicker)
    : null;

  const totalWeight = sortedPositions.reduce((sum, p) => sum + p.weight, 0);

  // Weighted Beta
  const weightedBeta = totalWeight > 0
    ? sortedPositions.reduce((sum, p) => sum + (getTickerBeta(p.ticker, p.isCash) * p.weight), 0) / totalWeight
    : 0;

  // Weighted PE (only include positions with valid pe > 0)
  const pePositions = sortedPositions.filter(p => p.pe !== null && p.pe > 0);
  const totalWeightForPe = pePositions.reduce((sum, p) => sum + p.weight, 0);
  const weightedPe = totalWeightForPe > 0
    ? pePositions.reduce((sum, p) => sum + (p.pe! * p.weight), 0) / totalWeightForPe
    : null;

  // Weighted Forward PE
  const fwdPePositions = sortedPositions.filter(p => p.fwdPe !== null && p.fwdPe > 0);
  const totalWeightForFwdPe = fwdPePositions.reduce((sum, p) => sum + p.weight, 0);
  const weightedFwdPe = totalWeightForFwdPe > 0
    ? fwdPePositions.reduce((sum, p) => sum + (p.fwdPe! * p.weight), 0) / totalWeightForFwdPe
    : null;

  // Weighted PEG
  const pegPositions = sortedPositions.filter(p => p.peg !== null && p.peg > 0);
  const totalWeightForPeg = pegPositions.reduce((sum, p) => sum + p.weight, 0);
  const weightedPeg = totalWeightForPeg > 0
    ? pegPositions.reduce((sum, p) => sum + (p.peg! * p.weight), 0) / totalWeightForPeg
    : null;

  // 3. Concentration of first 3 positions
  const sortedByWeight = [...sortedPositions].sort((a, b) => b.weight - a.weight);
  const top3Concentration = sortedByWeight.slice(0, 3).reduce((sum, p) => sum + p.weight, 0);
  const top3Positions = sortedByWeight.slice(0, 3);

  // 4. Concentration for 50% of portfolio
  const validPositionsByWeight = sortedByWeight.filter(p => p.mktValue > 0 || p.weight > 0);
  let cumulativeWeight50 = 0;
  let positionsCountFor50 = 0;
  const topPositionsFor50: typeof sortedPositions = [];

  for (const pos of validPositionsByWeight) {
    if (cumulativeWeight50 >= 50 && positionsCountFor50 > 0) {
      break;
    }
    cumulativeWeight50 += pos.weight;
    positionsCountFor50++;
    topPositionsFor50.push(pos);
  }

  // Daily P&L dynamics calculations
  const stockPositionsForPnL = validPositions.filter(p => !p.isCash);
  const upPositions = stockPositionsForPnL.filter(p => p.dailyPnL > 0);
  const downPositions = stockPositionsForPnL.filter(p => p.dailyPnL < 0);

  const totalUpValue = upPositions.reduce((sum, p) => sum + p.dailyPnL, 0);
  const totalDownValue = downPositions.reduce((sum, p) => sum + p.dailyPnL, 0);

  const upCount = upPositions.length;
  const downCount = downPositions.length;

  const totalUpAbs = Math.abs(totalUpValue);
  const totalDownAbs = Math.abs(totalDownValue);
  const sumAbs = totalUpAbs + totalDownAbs || 1;
  const upPct = (totalUpAbs / sumAbs) * 100;
  const downPct = (totalDownAbs / sumAbs) * 100;

  const previousValue = portfolio.totals.mktValue - portfolio.totals.dailyPnL;
  const baseValue = previousValue !== 0 ? previousValue : (portfolio.totals.mktValue || 1);
  const totalUpPercent = (totalUpValue / baseValue) * 100;
  const totalDownPercent = (totalDownValue / baseValue) * 100;
  const dailyPnLPercent = portfolio.totals.dailyPnLPercent ?? (baseValue !== 0 ? (portfolio.totals.dailyPnL / baseValue) * 100 : 0);

  const sortedUpPositions = [...upPositions].sort((a, b) => b.dailyPnL - a.dailyPnL);
  const sortedDownPositions = [...downPositions].sort((a, b) => a.dailyPnL - b.dailyPnL);

  const portfolioCost = portfolio.totals.costBasis ?? validPositions.reduce(
    (sum, pos) => sum + pos.shares * pos.avgCost,
    0
  );

  const totalDividendIncome = (validPositions || []).reduce((acc, pos) => {
    if (pos.isCash) return acc;
    const rate = getDividendPerShare(pos);
    return acc + (rate !== null ? rate * pos.shares : 0);
  }, 0);

  // Portfolio Projections Logic
  const formatAbbreviatedK = (val: number) => {
    if (val >= 1000000) return `$${(val / 1000000).toFixed(2)}M`;
    if (val >= 1000) return `$${(val / 1000).toFixed(0)}k`;
    return `$${val.toFixed(0)}`;
  };
  const effectiveGrowthRate = cagr / 100;
  const currentYear = new Date().getFullYear();
  const projectionsMktValue = portfolio.totals.mktValue || 0;

  const projectionsChartData = React.useMemo(() => {
    let currentValue = projectionsMktValue;
    const data = [];
    data.push({
      year: String(currentYear),
      value: Math.round(currentValue),
    });

    const totalMonths = years * 12;
    const monthlyRate = Math.pow(1 + effectiveGrowthRate, 1 / 12) - 1;

    for (let m = 1; m <= totalMonths; m++) {
      currentValue = currentValue * (1 + monthlyRate) + monthlyAddition;
      if (m % 12 === 0) {
        const yearNum = currentYear + (m / 12);
        data.push({
          year: String(yearNum),
          value: Math.round(currentValue),
        });
      }
    }
    return data;
  }, [projectionsMktValue, years, effectiveGrowthRate, monthlyAddition, currentYear]);

  const projectedTotalValue = React.useMemo(() => {
    if (projectionsChartData.length === 0) return 0;
    return projectionsChartData[projectionsChartData.length - 1].value;
  }, [projectionsChartData]);

  const portfolioTargets = React.useMemo(() => {
    let fiftyTwoWkHigh = 0;
    let avgTarget = 0;
    let highTarget = 0;

    validPositions.forEach(p => {
      if (p.isCash) {
        fiftyTwoWkHigh += p.mktValue || 0;
        avgTarget += p.mktValue || 0;
        highTarget += p.mktValue || 0;
      } else {
        const h52 = p.fiftyTwoWeekHigh || p.price || 0;
        const meanT = p.targetMeanPrice || p.price || 0;
        const highT = p.targetHighPrice || p.price || 0;
        
        fiftyTwoWkHigh += p.shares * h52;
        avgTarget += p.shares * meanT;
        highTarget += p.shares * highT;
      }
    });

    return { fiftyTwoWkHigh, avgTarget, highTarget };
  }, [validPositions]);

  const marginMetrics = React.useMemo(() => {
    const marginPositions = validPositions.filter(p => p.isMargin && !p.isCash);
    const costBasis = marginPositions.reduce((sum, p) => sum + (p.shares * p.avgCost), 0);
    const mktValue = marginPositions.reduce((sum, p) => sum + (p.mktValue || (p.shares * p.price)), 0);
    const gain = mktValue - costBasis;
    const gainPct = costBasis > 0 ? (gain / costBasis) * 100 : 0;
    return { gain, gainPct, costBasis, mktValue };
  }, [validPositions]);

  const val5y = React.useMemo(() => {
    let currentValue = projectionsMktValue;
    const rate = cagr / 100;
    const monthlyRate = Math.pow(1 + rate, 1 / 12) - 1;
    for (let m = 1; m <= 5 * 12; m++) {
      currentValue = currentValue * (1 + monthlyRate) + monthlyAddition;
    }
    return currentValue;
  }, [projectionsMktValue, cagr, monthlyAddition]);

  const val10y = React.useMemo(() => {
    let currentValue = projectionsMktValue;
    const rate = cagr / 100;
    const monthlyRate = Math.pow(1 + rate, 1 / 12) - 1;
    for (let m = 1; m <= 10 * 12; m++) {
      currentValue = currentValue * (1 + monthlyRate) + monthlyAddition;
    }
    return currentValue;
  }, [projectionsMktValue, cagr, monthlyAddition]);

  return (
    <div className="space-y-6" id="summary-section">
      <div className="flex flex-col lg:flex-row gap-4 items-stretch">
        {/* Card 1: Combined Portfolio Value & Daily Dynamics (Stacked Vertically) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 sm:p-4 hover:border-slate-700 transition-all shadow-xl flex flex-col justify-between w-full lg:w-[320px] xl:w-[340px] 2xl:w-[360px] shrink-0">
          <div>
            {/* Top Part: Portfolio Valuation */}
            <div>
              <div className="flex items-center justify-between h-7 text-slate-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 truncate">
                  {language === "ES" ? "Valor del Portafolio" : "Portfolio Value"}
                </span>
                <span className="p-1.5 bg-sky-500/10 text-sky-400 rounded-xl shrink-0 flex items-center justify-center">
                  <Wallet size={14} />
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xl sm:text-2xl font-display font-bold text-white tracking-wide truncate">
                  {formatValuation(portfolio.totals.mktValue)}
                </h3>
              </div>
              <div className="text-[11px] sm:text-xs text-slate-400 mt-0.5 flex items-center justify-between font-medium">
                <span>{language === "ES" ? "Costo del Portafolio:" : "Portfolio Cost:"}</span>
                <span className="font-mono text-slate-300 font-semibold">{formatValuation(portfolioCost)}</span>
              </div>
              
              {/* Informative metrics breakdown - ultra compact */}
              <div className="grid grid-cols-2 sm:flex sm:flex-col gap-1 sm:gap-1.5 mt-2 sm:mt-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-1.5 sm:p-0 rounded-xl sm:rounded-none bg-slate-950/40 sm:bg-transparent border border-slate-800/40 sm:border-0 text-xs sm:text-sm">
                  <span className="text-[10px] sm:text-xs text-slate-400 font-medium">{language === "ES" ? "Histórico:" : "Historic:"}</span>
                  <span className={`font-semibold flex items-center gap-0.5 sm:gap-1 text-xs sm:text-sm ${portfolio.totals.totalReturn >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {portfolio.totals.totalReturn >= 0 ? <ArrowUpRight size={12} className="sm:w-3.5 sm:h-3.5 shrink-0" /> : <ArrowDownRight size={12} className="sm:w-3.5 sm:h-3.5 shrink-0" />}
                    <span className="truncate">
                      {portfolio.totals.totalReturn >= 0 ? "+" : ""}
                      {formatStockValue(portfolio.totals.totalReturn)} ({formatPercent(portfolio.totals.totalReturnPercent)})
                    </span>
                  </span>
                </div>
                
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-1.5 sm:p-0 rounded-xl sm:rounded-none bg-slate-950/40 sm:bg-transparent border border-slate-800/40 sm:border-0 text-xs sm:text-sm">
                  <span className="text-[10px] sm:text-xs text-slate-400 font-medium">{language === "ES" ? "Efectivo:" : "Cash:"}</span>
                  <span className="font-mono font-bold text-slate-200 text-xs sm:text-sm truncate">
                    {formatValuation(cashAmount)}
                    <span className="text-slate-400 ml-1 font-sans font-medium text-[10px] sm:text-[11px]">
                      ({((cashAmount / (portfolio.totals.mktValue || 1)) * 100).toFixed(0)}%)
                    </span>
                  </span>
                </div>

                {(portfolio.totals.marginCostBasis ?? 0) > 0 && (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-1.5 sm:p-0 rounded-xl sm:rounded-none bg-slate-950/40 sm:bg-transparent border border-slate-800/40 sm:border-0 text-xs sm:text-sm">
                    <span className="text-[10px] sm:text-xs text-amber-400 font-medium flex items-center gap-1">
                      {language === "ES" ? "Margen:" : "Margin:"}
                    </span>
                    <span className="font-mono font-bold text-amber-300 text-xs sm:text-sm truncate" title={language === "ES" ? `Costo estimado: ~$${(portfolio.totals.marginMonthlyCost ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mes (6.25% anual)` : `Estimated cost: ~$${(portfolio.totals.marginMonthlyCost ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/month (6.25% annual)`}>
                      {formatValuation(portfolio.totals.marginCostBasis ?? 0)}
                      <span className="text-amber-400/80 ml-1 font-sans font-medium text-[10px] sm:text-[11px]">
                        ({(((portfolio.totals.marginCostBasis ?? 0) / (portfolio.totals.mktValue || 1)) * 100).toFixed(1)}%)
                      </span>
                    </span>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-1.5 sm:p-0 rounded-xl sm:rounded-none bg-slate-950/40 sm:bg-transparent border border-slate-800/40 sm:border-0 text-xs sm:text-sm">
                  <span className="text-[10px] sm:text-xs text-slate-400 font-medium">{language === "ES" ? "Dividendos:" : "Dividend:"}</span>
                  <span className="font-mono font-bold text-emerald-400 text-xs sm:text-sm truncate">
                    {formatValuation(totalDividendIncome)}
                  </span>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-slate-800/60 my-2.5 sm:my-3" />

            {/* Bottom Part: Daily Dynamics */}
            <div>
              <div className="flex items-center justify-between text-slate-400 mb-1.5">
                <span className="text-[11px] font-extrabold uppercase text-slate-400 tracking-wider">
                  {language === "ES" ? "Dinámica del Día" : "Daily Dynamics"}
                </span>
                <span className={`font-mono font-black text-xs px-2 py-0.5 rounded-md leading-none flex items-center gap-1 ${
                  portfolio.totals.dailyPnL >= 0 
                    ? "text-emerald-400 bg-emerald-500/10" 
                    : "text-rose-400 bg-rose-500/10"
                }`}>
                  <span>
                    {portfolio.totals.dailyPnL >= 0 ? "+" : ""}
                    {formatStockValue(portfolio.totals.dailyPnL)}
                  </span>
                  <span>
                    ({formatPercent(dailyPnLPercent)})
                  </span>
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5 mt-2.5 divide-x divide-slate-800/40 relative">
                {/* Up positions */}
                <div 
                  id="daily-dynamics-up-btn"
                  className="space-y-0.5 relative group/up cursor-pointer select-none active:scale-[0.98] transition-transform rounded-xl p-1.5 -m-1 hover:bg-slate-800/20 touch-manipulation min-h-[44px]"
                  onClick={() => setMobileDynamicsModal("up")}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setMobileDynamicsModal("up"); } }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                      <ArrowUpRight size={12} />
                      <span>{language === "ES" ? "Suben" : "Gains"}</span>
                    </div>
                    <span className="sm:hidden text-[9px] text-emerald-400/80 font-medium bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.2 rounded-md">
                      {language === "ES" ? "Toca" : "Tap"}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-extrabold font-mono text-emerald-400 leading-tight">
                      {totalUpValue > 0 ? "+" : ""}{formatStockValue(totalUpValue)}
                    </span>
                    <span className="text-[10px] font-bold text-emerald-500/90 font-sans leading-tight">
                      ({totalUpPercent >= 0 ? "+" : ""}{totalUpPercent.toFixed(2)}%)
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium leading-none pt-0.5">
                    {upCount} {upCount === 1 ? (language === "ES" ? "posic." : "pos.") : (language === "ES" ? "posic." : "pos.")}
                  </p>

                  {/* Hover Popover for Up Positions (Desktop) */}
                  <div className={`daily-dynamics-popover absolute left-0 bottom-full mb-2 p-3 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-2xl shadow-2xl opacity-0 invisible group-hover/up:opacity-100 group-hover/up:visible transition-all duration-200 pointer-events-none group-hover/up:pointer-events-auto z-50 hidden sm:block ${sortedUpPositions.length > 5 ? "w-[290px] sm:w-[330px]" : "w-72 sm:w-80"}`}>
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                        <ArrowUpRight size={14} />
                        <span>{language === "ES" ? "Posiciones que Suben" : "Gaining Positions"} ({upCount})</span>
                      </div>
                      <span className="text-[11px] font-mono font-extrabold text-emerald-400">
                        +{formatStockValue(totalUpValue)}
                      </span>
                    </div>

                    {upPositions.length === 0 ? (
                      <p className="text-[11px] text-slate-400 italic py-2 text-center">
                        {language === "ES" ? "Sin posiciones en verde hoy" : "No gaining positions today"}
                      </p>
                    ) : (
                      <div className={`max-h-64 overflow-y-auto custom-scrollbar pr-0.5 ${sortedUpPositions.length > 5 ? "grid grid-cols-2 gap-1.5 text-xs" : "space-y-1.5 text-xs"}`}>
                        {sortedUpPositions.map((p, idx) => {
                          return (
                            <div key={`${p.ticker}-${idx}`} className="daily-dynamics-popover-item flex items-center justify-between p-1.5 sm:p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800/80 transition-colors">
                              <span className="font-bold font-mono text-slate-100 text-[11px] pr-1.5 truncate">
                                {p.ticker}
                              </span>
                              <div className="flex items-center font-mono text-[11px] font-extrabold text-emerald-400 shrink-0">
                                <span>+{formatStockValue(p.dailyPnL)}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Down positions */}
                <div 
                  id="daily-dynamics-down-btn"
                  className="space-y-0.5 pl-2.5 relative group/down cursor-pointer select-none active:scale-[0.98] transition-transform rounded-xl p-1.5 -m-1 hover:bg-slate-800/20 touch-manipulation min-h-[44px]"
                  onClick={() => setMobileDynamicsModal("down")}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setMobileDynamicsModal("down"); } }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-[10px] text-rose-400 font-bold uppercase tracking-wider">
                      <ArrowDownRight size={12} />
                      <span>{language === "ES" ? "Bajan" : "Losses"}</span>
                    </div>
                    <span className="sm:hidden text-[9px] text-rose-400/80 font-medium bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.2 rounded-md">
                      {language === "ES" ? "Toca" : "Tap"}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-extrabold font-mono text-rose-400 leading-tight">
                      {formatStockValue(totalDownValue)}
                    </span>
                    <span className="text-[10px] font-bold text-rose-500/90 font-sans leading-tight">
                      ({totalDownPercent.toFixed(2)}%)
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium leading-none pt-0.5">
                    {downCount} {downCount === 1 ? (language === "ES" ? "posic." : "pos.") : (language === "ES" ? "posic." : "pos.")}
                  </p>

                  {/* Hover Popover for Down Positions (Desktop) */}
                  <div className={`daily-dynamics-popover absolute right-0 bottom-full mb-2 p-3 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-2xl shadow-2xl opacity-0 invisible group-hover/down:opacity-100 group-hover/down:visible transition-all duration-200 pointer-events-none group-hover/down:pointer-events-auto z-50 hidden sm:block ${sortedDownPositions.length > 5 ? "w-[290px] sm:w-[330px]" : "w-72 sm:w-80"}`}>
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-rose-400">
                        <ArrowDownRight size={14} />
                        <span>{language === "ES" ? "Posiciones que Bajan" : "Losing Positions"} ({downCount})</span>
                      </div>
                      <span className="text-[11px] font-mono font-extrabold text-rose-400">
                        {formatStockValue(totalDownValue)}
                      </span>
                    </div>

                    {downPositions.length === 0 ? (
                      <p className="text-[11px] text-slate-400 italic py-2 text-center">
                        {language === "ES" ? "Sin posiciones en rojo hoy" : "No losing positions today"}
                      </p>
                    ) : (
                      <div className={`max-h-64 overflow-y-auto custom-scrollbar pr-0.5 ${sortedDownPositions.length > 5 ? "grid grid-cols-2 gap-1.5 text-xs" : "space-y-1.5 text-xs"}`}>
                        {sortedDownPositions.map((p, idx) => {
                          return (
                            <div key={`${p.ticker}-${idx}`} className="daily-dynamics-popover-item flex items-center justify-between p-1.5 sm:p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800/80 transition-colors">
                              <span className="font-bold font-mono text-slate-100 text-[11px] pr-1.5 truncate">
                                {p.ticker}
                              </span>
                              <div className="flex items-center font-mono text-[11px] font-extrabold text-rose-400 shrink-0">
                                <span>{formatStockValue(p.dailyPnL)}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Proportion Bar */}
              <div className="mt-2.5">
                <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden flex">
                  {totalUpValue === 0 && totalDownValue === 0 ? (
                    <div className="h-full w-full bg-slate-800" />
                  ) : (
                    <>
                      <div style={{ width: `${upPct}%` }} className="h-full bg-emerald-500 transition-all duration-300" />
                      <div style={{ width: `${downPct}%` }} className="h-full bg-rose-500 transition-all duration-300" />
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Distribución de Activos (Modern Interactive Donut with Pills & Classic Toggle) */}
        <PortfolioDistributionDonut
          portfolio={portfolio}
          selectedTicker={selectedTicker}
          onSelectTicker={handleSelectTicker}
          selectedSector={selectedSector}
          onClearSector={() => setSelectedSector(null)}
          language={language}
          isReadOnly={isReadOnly}
          theme={theme}
          showPortfolioTotal={showPortfolioTotal}
          onToggleShowPortfolioTotal={() => setShowPortfolioTotal(prev => !prev)}
          portfolioWeightedType={portfolioWeightedType}
          portfolioWeightedScore={portfolioWeightedScore}
          onNavigateToHealth={onNavigateToHealth}
          getTypeBadgeConfig={getTypeBadgeConfig}
          getScoreHex={getScoreHex}
          getScoreColorClass={getScoreColorClass}
        />

        {/* Card 2.5: Portfolio Future Value & Targets */}
        <div id="portfolio-projections-card" className="metrics-container-card bg-slate-900 border border-slate-800 rounded-2xl p-3.5 sm:p-4 hover:border-slate-700 transition-all shadow-xl flex flex-col justify-between w-full lg:w-[260px] xl:w-[280px] 2xl:w-[300px] shrink-0">
          <div>
            {/* Header */}
            <div className="flex items-center justify-between h-7 text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 truncate">
                {language === "ES" ? "Valor Futuro Cartera" : "Portfolio Future Value"}
              </span>
              <span className="p-1.5 bg-pink-500/10 text-pink-400 rounded-xl shrink-0 flex items-center justify-center">
                <Rocket size={14} />
              </span>
            </div>

            {/* List Rows */}
            <div className="space-y-4 pt-1">
              {/* Row 1: 52wk High */}
              <div className="flex items-center justify-between border-b border-slate-900 pb-3">
                <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-slate-400">
                  <span>
                    {language === "ES" ? "Máximo 52 Semanas" : "52wk High"}
                  </span>
                </div>
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="relative">
                    <span className="text-[13px] sm:text-sm font-mono font-bold text-white">
                      {formatValuation(portfolioTargets.fiftyTwoWkHigh)}
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-0.5 text-[9px] sm:text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 sm:px-2 py-0.5 rounded font-mono">
                    +{portfolio.totals.mktValue > 0 ? ((portfolioTargets.fiftyTwoWkHigh - portfolio.totals.mktValue) / portfolio.totals.mktValue * 100).toFixed(1) : "0.0"}%
                  </span>
                </div>
              </div>

              {/* Row 2: Analyst Avg Target */}
              <div className="flex items-center justify-between border-b border-slate-900 pb-3">
                <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-slate-400">
                  <span>{language === "ES" ? "Target Promedio" : "Avg Target Value"}</span>
                </div>
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="relative">
                    <span className="text-[13px] sm:text-sm font-mono font-bold text-white">
                      {formatValuation(portfolioTargets.avgTarget)}
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-0.5 text-[9px] sm:text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 sm:px-2 py-0.5 rounded font-mono">
                    +{portfolio.totals.mktValue > 0 ? ((portfolioTargets.avgTarget - portfolio.totals.mktValue) / portfolio.totals.mktValue * 100).toFixed(1) : "0.0"}%
                  </span>
                </div>
              </div>

              {/* Row 3: Analyst High Target */}
              <div className="flex items-center justify-between border-b border-slate-900 pb-3">
                <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-slate-400">
                  <span>{language === "ES" ? "High Target" : "High Target Value"}</span>
                </div>
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="relative">
                    <span className="text-[13px] sm:text-sm font-mono font-bold text-white">
                      {formatValuation(portfolioTargets.highTarget)}
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-0.5 text-[9px] sm:text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 sm:px-2 py-0.5 rounded font-mono">
                    +{portfolio.totals.mktValue > 0 ? ((portfolioTargets.highTarget - portfolio.totals.mktValue) / portfolio.totals.mktValue * 100).toFixed(1) : "0.0"}%
                  </span>
                </div>
              </div>
            </div>

            {/* Margin Analysis Box */}
            {(portfolio.totals.marginCostBasis ?? 0) > 0 ? (
              <div className="bg-[#121420]/60 border border-slate-900 rounded-2xl p-3 sm:p-4 mt-2">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[9px] text-amber-400 font-bold uppercase tracking-wider block font-mono">
                    {language === "ES" ? "ANÁLISIS DE MARGEN (6.25%)" : "MARGIN ANALYSIS (6.25%)"}
                  </span>
                </div>
                                    
                <div className="space-y-2.5 text-[11px] sm:text-xs">
                  <div className="flex justify-between items-center text-slate-400">
                    <span className="flex items-center gap-1 text-rose-400">
                      {language === "ES" ? "Préstamo (Deuda)" : "Loan (Debt)"}
                    </span>
                    <span className="font-mono font-semibold text-rose-400">
                      -{formatValuation(portfolio.totals.marginCostBasis ?? 0)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-400">
                    <span>{language === "ES" ? "Costo Mensual Estimado" : "Estimated Monthly Cost"}</span>
                    <span className="font-mono font-semibold text-amber-300">
                      -{formatValuation(portfolio.totals.marginMonthlyCost ?? 0)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-400">
                    <span>{language === "ES" ? "Costo Anual Estimado" : "Estimated Annual Cost"}</span>
                    <span className="font-mono font-semibold text-amber-300">
                      -{formatValuation((portfolio.totals.marginMonthlyCost ?? 0) * 12)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-400">
                    <span className="flex items-center gap-1 text-emerald-400">
                      {language === "ES" ? "Ganancia de Inversión" : "Investment Gains"}
                    </span>
                    <div className="text-right">
                      <span className={`font-mono font-bold ${marginMetrics.gain >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {marginMetrics.gain >= 0 ? "+" : ""}{formatValuation(marginMetrics.gain)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-[#121420]/60 border border-slate-900 rounded-2xl p-3 sm:p-4 mt-2 flex items-center justify-center min-h-[100px]">
                <span className="text-xs text-slate-500 font-mono italic">
                  {language === "ES" ? "Sin deuda de margen" : "No margin debt"}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Card 3: Portfolio Metrics */}
        <div id="summary-metrics-card" className="metrics-container-card bg-slate-900 border border-slate-800 rounded-2xl p-3.5 sm:p-4 hover:border-slate-700 transition-all shadow-xl flex flex-col justify-between w-full lg:w-[260px] xl:w-[280px] 2xl:w-[300px] shrink-0">
          <div>
            <div className="flex items-center justify-between h-7 text-slate-400 mb-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 truncate">
                  {language === "ES" ? "Métricas" : "Metrics"}
                </span>
                {selectedPosition && (
                  <button
                    onClick={() => handleSelectTicker(null)}
                    className="text-[9px] font-mono font-bold text-sky-400 bg-sky-500/15 hover:bg-sky-500/25 px-1.5 py-0.5 rounded-md border border-sky-500/30 transition-all flex items-center gap-1 cursor-pointer shrink-0"
                    title={language === "ES" ? "Volver a portafolio ponderado" : "Reset to weighted portfolio"}
                  >
                    <span>{selectedPosition.ticker}</span>
                    <span className="font-extrabold text-sky-300">×</span>
                  </button>
                )}
              </div>
              <span className="p-1.5 bg-[#6366f1]/10 text-[#6366f1] rounded-xl shrink-0 flex items-center justify-center">
                <BarChart3 size={14} />
              </span>
            </div>
            
            {/* Benchmark Toggle */}
            <div className="bg-slate-950/80 p-0.5 border border-slate-800/60 rounded-xl flex items-center justify-between w-full mb-2">
              <button
                onClick={() => setBenchmarkToggle("SP500")}
                className={`flex-1 py-0.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer text-center ${
                  benchmarkToggle === "SP500"
                    ? "bg-sky-500 text-slate-950 font-extrabold shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                S&P 500
              </button>
              <button
                onClick={() => setBenchmarkToggle("QQQ")}
                className={`flex-1 py-0.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer text-center ${
                  benchmarkToggle === "QQQ"
                    ? "bg-violet-500 text-slate-950 font-extrabold shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                QQQ
              </button>
            </div>
            
            <div className="flex flex-col gap-1.5 mt-1">
              {/* P/E Ratio */}
              <div className="metrics-subcard bg-slate-950/60 border border-slate-800/60 rounded-xl p-2 px-2.5 hover:border-slate-700/80 transition-colors">
                <div className="flex flex-col gap-1">
                  <span className="text-[9.5px] text-slate-400 font-bold uppercase tracking-wider">
                    {selectedPosition
                      ? `P/E (${selectedPosition.ticker})`
                      : (language === "ES" ? "P/E Ponderado" : "Weighted P/E")}
                  </span>
                  <div className="flex items-center justify-between text-xs font-mono">
                    <div className="flex items-baseline gap-1">
                      <span className="text-[9px] font-sans font-medium text-slate-400">
                        {selectedPosition ? selectedPosition.ticker : (language === "ES" ? "Port" : "Port")}:
                      </span>
                      <span className="font-bold text-white text-xs">
                        {selectedPosition
                          ? (selectedPosition.pe !== null && selectedPosition.pe > 0 ? formatNumber(selectedPosition.pe, 1) : "—")
                          : (weightedPe !== null ? formatNumber(weightedPe, 1) : "—")}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-[9px] font-sans font-medium text-slate-400">{benchmarkToggle === "SP500" ? "S&P" : "QQQ"}:</span>
                      <span className={`font-bold text-xs ${benchmarkToggle === "SP500" ? "text-sky-400" : "text-violet-400"}`}>
                        {formatNumber(BENCHMARK_METRICS[benchmarkToggle].pe, 1)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Forward P/E */}
              <div className="metrics-subcard bg-slate-950/60 border border-slate-800/60 rounded-xl p-2 px-2.5 hover:border-slate-700/80 transition-colors">
                <div className="flex flex-col gap-1">
                  <span className="text-[9.5px] text-slate-400 font-bold uppercase tracking-wider">
                    {selectedPosition
                      ? `FWD P/E (${selectedPosition.ticker})`
                      : (language === "ES" ? "FWD P/E Ponderado" : "Weighted FWD P/E")}
                  </span>
                  <div className="flex items-center justify-between text-xs font-mono">
                    <div className="flex items-baseline gap-1">
                      <span className="text-[9px] font-sans font-medium text-slate-400">
                        {selectedPosition ? selectedPosition.ticker : (language === "ES" ? "Port" : "Port")}:
                      </span>
                      <span className="font-bold text-white text-xs">
                        {selectedPosition
                          ? (selectedPosition.fwdPe !== null && selectedPosition.fwdPe > 0 ? formatNumber(selectedPosition.fwdPe, 1) : "—")
                          : (weightedFwdPe !== null ? formatNumber(weightedFwdPe, 1) : "—")}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-[9px] font-sans font-medium text-slate-400">{benchmarkToggle === "SP500" ? "S&P" : "QQQ"}:</span>
                      <span className={`font-bold text-xs ${benchmarkToggle === "SP500" ? "text-sky-400" : "text-violet-400"}`}>
                        {formatNumber(BENCHMARK_METRICS[benchmarkToggle].fwdPe, 1)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* PEG */}
              <div className="metrics-subcard bg-slate-950/60 border border-slate-800/60 rounded-xl p-2 px-2.5 hover:border-slate-700/80 transition-colors">
                <div className="flex flex-col gap-1">
                  <span className="text-[9.5px] text-slate-400 font-bold uppercase tracking-wider">
                    {selectedPosition
                      ? `PEG (${selectedPosition.ticker})`
                      : (language === "ES" ? "PEG Ponderado" : "Weighted PEG")}
                  </span>
                  <div className="flex items-center justify-between text-xs font-mono">
                    <div className="flex items-baseline gap-1">
                      <span className="text-[9px] font-sans font-medium text-slate-400">
                        {selectedPosition ? selectedPosition.ticker : (language === "ES" ? "Port" : "Port")}:
                      </span>
                      <span className="font-bold text-white text-xs">
                        {selectedPosition
                          ? (selectedPosition.peg !== null && selectedPosition.peg > 0 ? formatNumber(selectedPosition.peg, 2) : "—")
                          : (weightedPeg !== null ? formatNumber(weightedPeg, 2) : "—")}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-[9px] font-sans font-medium text-slate-400">{benchmarkToggle === "SP500" ? "S&P" : "QQQ"}:</span>
                      <span className={`font-bold text-xs ${benchmarkToggle === "SP500" ? "text-sky-400" : "text-violet-400"}`}>
                        {formatNumber(BENCHMARK_METRICS[benchmarkToggle].peg, 2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Beta */}
              <div className="metrics-subcard bg-slate-950/60 border border-slate-800/60 rounded-xl p-2 px-2.5 hover:border-slate-700/80 transition-colors">
                <div className="flex flex-col gap-1">
                  <span className="text-[9.5px] text-slate-400 font-bold uppercase tracking-wider">
                    {selectedPosition
                      ? `Beta (${selectedPosition.ticker})`
                      : (language === "ES" ? "Beta Ponderado" : "Weighted Beta")}
                  </span>
                  <div className="flex items-center justify-between text-xs font-mono">
                    <div className="flex items-baseline gap-1">
                      <span className="text-[9px] font-sans font-medium text-slate-400">
                        {selectedPosition ? selectedPosition.ticker : (language === "ES" ? "Port" : "Port")}:
                      </span>
                      <span className="font-bold text-white text-xs">
                        {selectedPosition
                          ? formatNumber(getTickerBeta(selectedPosition.ticker, selectedPosition.isCash), 2)
                          : formatNumber(weightedBeta, 2)}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-[9px] font-sans font-medium text-slate-400">{benchmarkToggle === "SP500" ? "S&P" : "QQQ"}:</span>
                      <span className={`font-bold text-xs ${benchmarkToggle === "SP500" ? "text-sky-400" : "text-violet-400"}`}>
                        {formatNumber(BENCHMARK_METRICS[benchmarkToggle].beta, 2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Concentración (50%) / Peso de Posición */}
              <div
                className="metrics-subcard bg-slate-950/60 border border-slate-800/60 rounded-xl p-2 px-2.5 hover:border-slate-700/80 transition-colors cursor-help"
                title={
                  selectedPosition
                    ? `${selectedPosition.ticker}: ${selectedPosition.name} (${selectedPosition.weight.toFixed(1)}% ${language === "ES" ? "del portafolio" : "of portfolio"})`
                    : positionsCountFor50 > 0
                    ? `${language === "ES" ? "50% concentrado en" : "50% concentrated in"}: ${topPositionsFor50.map(p => `${p.ticker} (${p.weight.toFixed(1)}%)`).join(", ")} ≈ ${cumulativeWeight50.toFixed(1)}%`
                    : undefined
                }
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[9.5px] text-slate-400 font-bold uppercase tracking-wider">
                      {selectedPosition
                        ? (language === "ES" ? "Peso en Portafolio" : "Portfolio Weight")
                        : (language === "ES" ? "Concentración (50%)" : "Concentration (50%)")}
                    </span>
                    {!selectedPosition && cumulativeWeight50 > 0 && (
                      <span className="text-[8.5px] font-mono font-medium text-slate-400">
                        {cumulativeWeight50.toFixed(1)}%
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs font-mono">
                    <div className="flex items-baseline gap-1">
                      <span className="text-[9px] font-sans font-medium text-slate-400">
                        {selectedPosition ? selectedPosition.ticker : (language === "ES" ? "Port" : "Port")}:
                      </span>
                      <span className="font-bold text-white text-xs">
                        {selectedPosition
                          ? `${formatNumber(selectedPosition.weight, 1)}%`
                          : positionsCountFor50 > 0
                          ? `${positionsCountFor50} ${language === "ES" ? "pos" : "pos"}`
                          : "—"}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-[9px] font-sans font-medium text-slate-400">{benchmarkToggle === "SP500" ? "S&P" : "QQQ"}:</span>
                      <span className={`font-bold text-xs ${benchmarkToggle === "SP500" ? "text-sky-400" : "text-violet-400"}`}>
                        {`${BENCHMARK_METRICS[benchmarkToggle].top50Concentration} pos`}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Performance & Metrics Panel */}
      {sortedPositions.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="performance-metrics-panel">
          <div className="lg:col-span-8 flex flex-col gap-6">
            {/* Performance Area Chart */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 flex flex-col justify-between shadow-2xl">
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-5 sm:mb-6">
                <div>
                  <h3 className="text-base sm:text-lg font-display font-semibold text-white tracking-wide">
                    BENCHMARK
                  </h3>
                </div>

                {/* Chart selectors */}
                <div className="flex items-center justify-between sm:justify-end gap-1.5 sm:gap-3 w-full sm:w-auto">
                  <select
                    value={chartSymbol}
                    onChange={(e) => {
                      const val = e.target.value;
                      handleSelectTicker(val === "PORTFOLIO" || val === "CASH" ? null : val);
                      if (val === "CASH") {
                        setChartSymbol("CASH");
                        if (onSelectTickerForChart) onSelectTickerForChart("CASH");
                      }
                    }}
                    className="bg-slate-800 border border-slate-700 rounded-xl text-[10px] sm:text-xs font-semibold px-2 sm:px-3 py-1 sm:py-1.5 text-white outline-none focus:border-emerald-500 transition-all cursor-pointer w-24 sm:w-auto sm:max-w-[190px] truncate shrink-0"
                  >
                    <option value="PORTFOLIO">{(!portfolioName || portfolioName === "Mi Portafolio" || portfolioName === "My Portfolio") ? (language === "EN" ? "My Portfolio" : "Mi Portafolio") : portfolioName}</option>
                    <option value="CASH">{language === "EN" ? "Cash" : "Efectivo (Cash)"}</option>
                    {stockPositions.map((pos, idx) => (
                      <option key={`${pos.ticker}-${idx}`} value={pos.ticker}>
                        {pos.ticker} ({pos.name})
                      </option>
                    ))}
                  </select>

                  <div className="bg-slate-800 p-0.5 rounded-lg flex items-center border border-slate-700 shrink-0">
                    {["1W", "1M", "3M", "YTD", "1Y", "5Y", "10Y", "ALL"].map((tf) => (
                      <button
                        key={tf}
                        onClick={() => setTimeframe(tf)}
                        className={`px-1.5 py-0.5 rounded-md text-[8.5px] font-bold transition-all cursor-pointer shrink-0 leading-tight ${
                          timeframe === tf
                            ? "bg-emerald-500 text-slate-950 font-black shadow-lg shadow-emerald-500/10"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        {tf}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {loadingChart ? (
                <div className="h-[280px] flex flex-col items-center justify-center gap-3 text-slate-500">
                  <Loader2 className="animate-spin text-emerald-400" size={28} />
                  <span className="text-xs">
                    {language === "EN" ? "Loading historical performance data..." : "Cargando datos históricos de rendimiento..."}
                  </span>
                </div>
              ) : chartData.length === 0 ? (
                <div className="h-[280px] flex items-center justify-center text-slate-500 text-xs">
                  {language === "EN" ? "No data available for this timeframe." : "No hay datos disponibles para este periodo."}
                </div>
              ) : (
                <div className="h-[280px] w-full flex flex-col justify-between">
                  <div className="h-[240px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                        <defs>
                          <linearGradient id="selectionColor" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={theme === "light" ? "#0e6245" : "#ffffff"} stopOpacity={0.15} />
                            <stop offset="95%" stopColor={theme === "light" ? "#0e6245" : "#ffffff"} stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={theme === "light" ? "#d5d2c8" : "#334155"} opacity={0.2} />
                        <XAxis
                          dataKey="date"
                          stroke={theme === "light" ? "#73706b" : "#64748b"}
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                          dy={10}
                          ticks={customTicks}
                          interval={0}
                          tickFormatter={formatXAxis}
                        />
                        <YAxis
                          stroke={theme === "light" ? "#73706b" : "#64748b"}
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(value) => `${value >= 0 ? "+" : ""}${value}%`}
                          dx={-5}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Area
                          type="monotone"
                          dataKey="selection"
                          stroke={theme === "light" ? "#0e6245" : "#ffffff"}
                          strokeWidth={2.5}
                          fillOpacity={1}
                          fill="url(#selectionColor)"
                          name="selection"
                          className={theme === "light" ? "drop-shadow-[0_0_10px_rgba(14,98,69,0.15)]" : "drop-shadow-[0_0_10px_rgba(255,255,255,0.15)]"}
                        />
                        <Area
                          type="monotone"
                          dataKey="voo"
                          stroke="#0ea5e9"
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          fill="none"
                          name="voo"
                        />
                        <Area
                          type="monotone"
                          dataKey="qqq"
                          stroke="#10b981"
                          strokeWidth={2}
                          strokeDasharray="3 3"
                          fill="none"
                          name="qqq"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Custom Legend */}
                  <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6 pt-3 sm:pt-4 border-t border-slate-800/40">
                    {sortedLegendItems.map((item) => (
                      <div key={item.id} className="flex items-center gap-1.5 sm:gap-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${item.dotClass}`} />
                        <span className={`text-[11px] font-semibold ${item.textClass}`}>
                          {item.name}
                        </span>
                        {item.returnVal !== null && item.returnVal !== undefined && (
                          <span className={`text-[11px] font-mono font-bold ${item.valueColorClass}`}>
                            {item.returnVal >= 0 ? "+" : ""}{item.returnVal.toFixed(2)}%
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
          {/* Card 2: Distribución por Sectores (S&P 500) */}
          <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-3xl p-5 hover:border-slate-700 transition-all shadow-xl flex flex-col justify-between" id="portfolio-sectors-card">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                  <PieChartIcon className="text-blue-400" size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-display font-bold text-xs text-slate-400 tracking-wider uppercase flex items-center gap-2">
                    {language === "ES" ? "Distribución Sectorial" : "Sector Distribution"}
                    {selectedTicker && (
                      <button 
                        onClick={() => handleSelectTicker(null)}
                        className="text-[10px] text-sky-400 normal-case bg-sky-500/15 hover:bg-sky-500/25 px-2 py-0.5 rounded-full border border-sky-500/30 transition-all flex items-center gap-1 cursor-pointer"
                        title={language === "ES" ? "Limpiar filtro de posición" : "Clear position filter"}
                      >
                        <span>{language === "EN" ? "Position:" : "Posición:"} {selectedTicker}</span>
                        <span className="font-extrabold text-sky-300">×</span>
                      </button>
                    )}
                  </h3>
                  <p className="text-[10px] text-slate-500">
                    {language === "ES" ? "Haz clic en un sector para filtrar el gráfico de distribución" : "Click on a sector to filter the distribution chart"}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {filteredSectors.map((sector, index) => {
                  const isExpanded = !!expandedSectors[sector.name];
                  const subsectors = sectorSubsectors[sector.name]
                    ? (Object.entries(sectorSubsectors[sector.name]) as [string, { mktValue: number; weight: number }][]).sort((a, b) => b[1].weight - a[1].weight)
                    : [];

                  const sectorDisplayName = language === "EN" ? sector.name : getSectorSpanish(sector.name);

                  return (
                    <div key={`${sector.name}-${index}`} className="border-b border-slate-800/20 pb-2.5 last:border-0 last:pb-0">
                      <div
                        onClick={() => {
                          setSelectedSector(prev => prev === sector.name ? null : sector.name);
                          toggleSector(sector.name);
                        }}
                        className={`flex justify-between items-center text-xs cursor-pointer group p-1.5 px-2.5 -mx-2.5 rounded-xl transition-all border border-transparent ${
                          selectedSector === sector.name
                            ? "bg-slate-800/80 border-blue-500/30 shadow-md ring-1 ring-blue-500/20"
                            : "hover:bg-slate-800/30"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-slate-500 group-hover:text-slate-300 shrink-0">
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </span>
                          <span className={`w-2 h-2 rounded-full shrink-0 ${getSectorColor(sector.name)}`} />
                          <span className="font-semibold text-slate-300 group-hover:text-white truncate text-xs" title={sectorDisplayName}>
                            {sectorDisplayName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2.5 font-mono shrink-0 text-xs">
                          <span className="text-slate-400 font-medium">{formatValuation(sector.mktValue)}</span>
                          <span className="text-white font-extrabold">{formatNumber(sector.weight, 1)}%</span>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="pl-6 pr-1 mt-1">
                        <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
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
                                <span className="text-slate-500">{formatValuation(subData.mktValue)}</span>
                                <span className="text-slate-300 font-bold">{formatNumber(subData.weight, 1)}%</span>
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
      )}

      {/* Mobile / Tap Dynamics Modal for Daily Dynamics (Suben / Bajan) */}
      {mobileDynamicsModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
          onClick={() => setMobileDynamicsModal(null)}
        >
          <div 
            className={`w-full max-w-md rounded-t-3xl sm:rounded-3xl border shadow-2xl p-5 max-h-[85vh] flex flex-col transition-all animate-in slide-in-from-bottom duration-200 ${
              theme === "light" 
                ? "bg-white border-slate-200 text-slate-900" 
                : "bg-slate-900 border-slate-700/80 text-white"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-700/50 mb-3">
              <div className="flex items-center gap-2.5">
                {mobileDynamicsModal === "up" ? (
                  <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <ArrowUpRight size={20} />
                  </div>
                ) : (
                  <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                    <ArrowDownRight size={20} />
                  </div>
                )}
                <div>
                  <h4 className="font-bold text-sm leading-tight flex items-center gap-1.5">
                    <span>
                      {mobileDynamicsModal === "up" 
                        ? (language === "ES" ? "Posiciones que Suben" : "Gaining Positions")
                        : (language === "ES" ? "Posiciones que Bajan" : "Losing Positions")}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-mono font-bold ${
                      mobileDynamicsModal === "up" 
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                        : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                    }`}>
                      {mobileDynamicsModal === "up" ? upCount : downCount}
                    </span>
                  </h4>
                  <span className={`text-xs font-mono font-bold ${mobileDynamicsModal === "up" ? "text-emerald-400" : "text-rose-400"}`}>
                    {mobileDynamicsModal === "up"
                      ? `${totalUpValue > 0 ? "+" : ""}${formatStockValue(totalUpValue)} (${totalUpPercent >= 0 ? "+" : ""}${totalUpPercent.toFixed(2)}%)`
                      : `${formatStockValue(totalDownValue)} (${totalDownPercent.toFixed(2)}%)`}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setMobileDynamicsModal(null)}
                className={`p-2 rounded-xl border transition-colors ${
                  theme === "light" 
                    ? "bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-600" 
                    : "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300"
                }`}
                aria-label={language === "ES" ? "Cerrar" : "Close"}
              >
                <X size={16} />
              </button>
            </div>

            {/* Positions List */}
            <div className="overflow-y-auto flex-1 custom-scrollbar space-y-2 pr-1 py-1">
              {(mobileDynamicsModal === "up" ? sortedUpPositions : sortedDownPositions).length === 0 ? (
                <p className="text-xs text-slate-400 italic py-8 text-center">
                  {mobileDynamicsModal === "up"
                    ? (language === "ES" ? "Sin posiciones en verde hoy" : "No gaining positions today")
                    : (language === "ES" ? "Sin posiciones en rojo hoy" : "No losing positions today")}
                </p>
              ) : (
                (mobileDynamicsModal === "up" ? sortedUpPositions : sortedDownPositions).map((p, idx) => {
                  return (
                    <div 
                      key={`${p.ticker}-${idx}`}
                      onClick={() => {
                        handleSelectTicker(p.ticker);
                        setMobileDynamicsModal(null);
                      }}
                      className={`flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer ${
                        theme === "light"
                          ? "bg-slate-50 hover:bg-slate-100/80 border-slate-200/80"
                          : "bg-slate-950/60 hover:bg-slate-800/80 border-slate-800/80"
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold font-mono text-sm truncate">
                            {p.ticker}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium px-1.5 py-0.5 rounded bg-slate-800/40 border border-slate-700/30">
                            {p.shares} {language === "ES" ? "acc." : "shs."}
                          </span>
                        </div>
                        {p.name && (
                          <p className="text-[11px] text-slate-400 truncate max-w-[180px] sm:max-w-[220px]">
                            {p.name}
                          </p>
                        )}
                      </div>

                      <div className="text-right shrink-0 font-mono">
                        <div className={`text-sm font-extrabold ${mobileDynamicsModal === "up" ? "text-emerald-400" : "text-rose-400"}`}>
                          {mobileDynamicsModal === "up" ? "+" : ""}{formatStockValue(p.dailyPnL)}
                        </div>
                        <div className={`text-[11px] font-bold ${mobileDynamicsModal === "up" ? "text-emerald-500/90" : "text-rose-500/90"}`}>
                          {p.chgPct !== undefined ? `${p.chgPct >= 0 ? "+" : ""}${p.chgPct.toFixed(2)}%` : ""}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-slate-700/40 mt-2 flex items-center justify-between text-[11px] text-slate-400">
              <span>{language === "ES" ? "Toca una acción para ver su gráfico" : "Tap a stock to view its chart"}</span>
              <button
                onClick={() => setMobileDynamicsModal(null)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold ${
                  theme === "light"
                    ? "bg-slate-900 text-white hover:bg-slate-800"
                    : "bg-white text-slate-900 hover:bg-slate-100"
                }`}
              >
                {language === "ES" ? "Cerrar" : "Close"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
