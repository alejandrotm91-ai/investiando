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
import { TrendingUp, TrendingDown, DollarSign, Wallet, ArrowUpRight, ArrowDownRight, Activity, Calendar, Loader2, PieChart as PieChartIcon, ChevronDown, ChevronRight, BarChart3 } from "lucide-react";
import { getTickerSector, getSectorSpanish, getSectorColor, getTickerBeta, getTickerSubsector, getDividendPerShare } from "./HoldingsTable";
import { getRawFeatures, buildScores, overrideFeaturesWithFinancials } from "../utils/engine";
import { calculatePortfolioScoreFromMatrix, getStockScore } from "../utils/stockScoresMatrix";

const BENCHMARK_METRICS = {
  SP500: {
    pe: 25.2,
    fwdPe: 21.4,
    peg: 1.80,
    beta: 1.00
  },
  QQQ: {
    pe: 32.5,
    fwdPe: 26.2,
    peg: 1.55,
    beta: 1.18
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
}

export default function SummaryDashboard({ portfolio, onSelectTickerForChart, onNavigateToHealth, language = "ES", portfolioName, isReadOnly = false, theme = "dark" }: SummaryDashboardProps) {
  const [chartSymbol, setChartSymbol] = useState<string>("PORTFOLIO");
  const [timeframe, setTimeframe] = useState<string>("1M");
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loadingChart, setLoadingChart] = useState<boolean>(false);
  const [expandedSectors, setExpandedSectors] = useState<Record<string, boolean>>({});
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [benchmarkToggle, setBenchmarkToggle] = useState<"SP500" | "QQQ">("SP500");

  const [financialsMap, setFinancialsMap] = useState<Record<string, { annual: any[]; quarterly: any[] }>>({});

  useEffect(() => {
    const fetchAllFinancials = async () => {
      if (!portfolio || !portfolio.positions) return;
      const tickersToFetch = Array.from(new Set(portfolio.positions.filter(p => !p.isCash).map(p => p.ticker)));
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
      const newMap: any = {};
      const sortFn = (a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime();
      results.forEach(r => {
        if (r.data && !r.data.error) {
          if (Array.isArray(r.data.annual)) r.data.annual.sort(sortFn);
          if (Array.isArray(r.data.quarterly)) r.data.quarterly.sort(sortFn);
          newMap[r.ticker] = r.data;
        }
      });
      setFinancialsMap(newMap);
    };
    fetchAllFinancials();
  }, [portfolio]);

  const portfolioWeightedScore = React.useMemo(() => {
    if (!portfolio || !portfolio.positions) return 0;
    const stockPositions = portfolio.positions.filter(p => !p.isCash);
    if (stockPositions.length === 0) return 0;
    
    const result = calculatePortfolioScoreFromMatrix(stockPositions);
    return result.score;
  }, [portfolio]);

  const portfolioWeightedType = React.useMemo(() => {
    if (!portfolio || !portfolio.positions) return null;
    const stockPositions = portfolio.positions.filter(p => !p.isCash);
    if (stockPositions.length === 0) return null;
    
    const result = calculatePortfolioScoreFromMatrix(stockPositions);
    return result.dominantType;
  }, [portfolio]);

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
        name: chartSymbol === "PORTFOLIO" ? (portfolioName || (language === "EN" ? "My Portfolio" : "Mi Portafolio")) : `${chartSymbol}`,
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
            Fecha: {formattedDate}
          </p>
          <div className="flex flex-col gap-2">
            {sortedPayload.map((item: any, idx: number) => {
              const isSelection = item.name === "selection";
              const labelName = isSelection
                ? (chartSymbol === "PORTFOLIO" ? (portfolioName || (language === "EN" ? "My Portfolio" : "Mi Portafolio")) : chartSymbol)
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
            positions: portfolio.positions,
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
            setChartData(generateFallbackChartData(chartSymbol, timeframe, portfolio.positions));
          }
        }
      } catch (err) {
        if (active) {
          setChartData(generateFallbackChartData(chartSymbol, timeframe, portfolio.positions));
        }
      } finally {
        if (active) setLoadingChart(false);
      }
    };

    fetchChart();
    return () => {
      active = false;
    };
  }, [chartSymbol, timeframe, portfolio.positions]);

  // Identify top gainer and top loser in portfolio (excluding Cash)
  const stockPositions = portfolio.positions.filter((p) => !p.isCash);
  const sortedByDailyChg = [...stockPositions].sort((a, b) => b.chgPct - a.chgPct);
  const topGainer = sortedByDailyChg[0];
  const topLoser = sortedByDailyChg[sortedByDailyChg.length - 1];

  // Auto-expand sector when a ticker is selected
  useEffect(() => {
    if (selectedTicker) {
      const pos = portfolio.positions.find(p => p.ticker === selectedTicker);
      if (pos) {
        const sector = getTickerSector(pos.ticker, pos.isCash);
        setExpandedSectors(prev => ({
          ...prev,
          [sector]: true
        }));
      }
    }
  }, [selectedTicker, portfolio.positions]);

  // Allocation pie chart data
  const pieData = portfolio.positions.map((pos) => ({
    name: pos.ticker,
    value: Number(pos.mktValue.toFixed(2)),
    weight: pos.weight,
  }));

  // Filter positions for pie chart if a sector is selected
  const filteredPositionsForPie = selectedSector
    ? portfolio.positions.filter(pos => getTickerSector(pos.ticker, pos.isCash) === selectedSector)
    : portfolio.positions;

  // Pie chart total value
  const pieTotalValue = selectedSector
    ? filteredPositionsForPie.reduce((sum, p) => sum + p.mktValue, 0)
    : portfolio.totals.mktValue;

  const sortedForPie = [...filteredPositionsForPie].sort((a, b) => b.weight - a.weight);
  
  // If filtered by sector, list all positions individually without bundling in "Otros"
  const individualPositions = selectedSector
    ? sortedForPie
    : sortedForPie.filter((pos, idx) => idx < 5 || pos.weight >= 5);
  const otherPositions = selectedSector
    ? []
    : sortedForPie.filter((pos, idx) => idx >= 5 && pos.weight < 5);
  
  const pieDataDisplay = individualPositions.map((pos) => ({
    name: pos.ticker,
    value: Number(pos.mktValue.toFixed(2)),
    weight: pos.weight,
  }));
  
  if (otherPositions.length > 0) {
    const othersMktValue = otherPositions.reduce((sum, p) => sum + p.mktValue, 0);
    const othersWeight = otherPositions.reduce((sum, p) => sum + p.weight, 0);
    pieDataDisplay.push({
      name: language === "ES" ? "Otros" : "Other",
      value: Number(othersMktValue.toFixed(2)),
      weight: othersWeight,
    });
  }

  const COLORS = [
    "#10b981", // emerald-500
    "#06b6d4", // cyan-500
    "#3b82f6", // blue-500
    "#14b8a6", // teal-500
    "#8b5cf6", // violet-500
    "#f59e0b", // amber-500
    "#ec4899", // pink-500
    "#ef4444", // red-500
    "#f97316", // orange-500
    "#64748b", // slate-500
  ];

  const cashPosition = portfolio.positions.find((p) => p.isCash);
  const cashAmount = cashPosition ? cashPosition.mktValue : 0;

  const formatNumber = (val: number | null, decimals = 2) => {
    if (val === null || isNaN(val)) return "—";
    return val.toFixed(decimals);
  };

  // Sort positions: Stocks first (by market value desc), Cash last
  const sortedPositions = [...portfolio.positions].sort((a, b) => {
    if (a.isCash) return 1;
    if (b.isCash) return -1;
    return b.mktValue - a.mktValue;
  });

  const sectorSubsectors = sortedPositions.reduce((acc, pos) => {
    const sector = getTickerSector(pos.ticker, pos.isCash);
    const subsector = getTickerSubsector(pos.ticker, pos.isCash);
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
  const sortedSectors = Object.entries(sectorWeights)
    .map(([name, weight]) => ({
      name,
      weight,
      mktValue: sectorMktValues[name] || 0
    }))
    .sort((a, b) => b.weight - a.weight);

  // Filter sectors if a specific position is selected
  const filteredSectors = selectedTicker
    ? sortedSectors.filter(s => 
        portfolio.positions.some(pos => 
          pos.ticker === selectedTicker && getTickerSector(pos.ticker, pos.isCash) === s.name
        )
      )
    : sortedSectors;

  // 2. Weighted Multiples & Metrics
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

  // Daily P&L dynamics calculations
  const stockPositionsForPnL = portfolio.positions.filter(p => !p.isCash);
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

  const portfolioCost = portfolio.totals.costBasis ?? portfolio.positions.reduce(
    (sum, pos) => sum + pos.shares * pos.avgCost,
    0
  );

  const totalDividendIncome = (portfolio.positions || []).reduce((acc, pos) => {
    if (pos.isCash) return acc;
    const rate = getDividendPerShare(pos);
    return acc + (rate !== null ? rate * pos.shares : 0);
  }, 0);

  return (
    <div className="space-y-6" id="summary-section">
      <div className="flex flex-col lg:flex-row gap-4 items-stretch">
        {/* Card 1: Combined Portfolio Value & Daily Dynamics (Stacked Vertically) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-all shadow-xl flex flex-col justify-between w-full lg:w-[320px] shrink-0">
          <div>
            {/* Top Part: Portfolio Valuation */}
            <div>
              <div className="flex items-start justify-between text-slate-400 mb-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider mt-1">
                  {language === "ES" ? "Valor del Portafolio" : "Portfolio Value"}
                </span>

              </div>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xl font-display font-bold text-white tracking-wide truncate">
                  {formatValuation(portfolio.totals.mktValue)}
                </h3>

              </div>
              <div className="text-xs text-slate-400 mt-1 flex items-center justify-between font-medium">
                <span>{language === "ES" ? "Costo del Portafolio:" : "Portfolio Cost:"}</span>
                <span className="font-mono text-slate-300 font-semibold">{formatValuation(portfolioCost)}</span>
              </div>
              
              <div className="flex flex-col gap-2 mt-3.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 font-medium">{language === "ES" ? "Histórico:" : "Historic:"}</span>
                  <span className={`font-semibold flex items-center gap-1 text-sm ${portfolio.totals.totalReturn >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {portfolio.totals.totalReturn >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    <span>
                      {portfolio.totals.totalReturn >= 0 ? "+" : ""}
                      {formatStockValue(portfolio.totals.totalReturn)} ({formatPercent(portfolio.totals.totalReturnPercent)})
                    </span>
                  </span>
                </div>
                
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 font-medium">{language === "ES" ? "Efectivo:" : "Cash:"}</span>
                  <span className="font-mono font-bold text-slate-200">
                    {formatValuation(cashAmount)}
                    <span className="text-slate-400 ml-1 font-sans font-medium text-[11px]">
                      ({((cashAmount / (portfolio.totals.mktValue || 1)) * 100).toFixed(0)}%)
                    </span>
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 font-medium">{language === "ES" ? "Dividendos:" : "Dividend:"}</span>
                  <span className="font-mono font-bold text-emerald-400">
                    {formatValuation(totalDividendIncome)}
                  </span>
                </div>

                {(portfolio.totals.marginCostBasis ?? 0) > 0 && (
                  <div className="flex items-center justify-between text-sm pt-1 border-t border-slate-800/50">
                    <span className="text-amber-400 font-medium flex items-center gap-1">
                      {language === "ES" ? "Costo Margen (6.25%):" : "Margin Cost (6.25%):"}
                    </span>
                    <span className="font-mono font-bold text-amber-300" title={language === "ES" ? `Interés anual: $${(portfolio.totals.marginAnnualCost ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/año` : `Annual interest: $${(portfolio.totals.marginAnnualCost ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/year`}>
                      ~${(portfolio.totals.marginMonthlyCost ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/m
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-slate-800/60 my-6" />

            {/* Bottom Part: Daily Dynamics */}
            <div>
              <div className="flex items-center justify-between text-slate-400 mb-2.5">
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

              <div className="grid grid-cols-2 gap-3 mt-3.5 divide-x divide-slate-800/40 relative">
                {/* Up positions */}
                <div className="space-y-1 relative group/up">
                  <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-bold uppercase tracking-wider cursor-pointer">
                    <ArrowUpRight size={12} />
                    <span>{language === "ES" ? "Suben" : "Gains"}</span>
                  </div>
                  <div className="flex flex-col cursor-pointer">
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

                  {/* Hover Popover for Up Positions */}
                  <div className={`daily-dynamics-popover absolute left-0 bottom-full mb-2 p-3 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-2xl shadow-2xl opacity-0 invisible group-hover/up:opacity-100 group-hover/up:visible transition-all duration-200 pointer-events-none group-hover/up:pointer-events-auto z-50 ${sortedUpPositions.length > 5 ? "w-[290px] sm:w-[330px]" : "w-72 sm:w-80"}`}>
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
                <div className="space-y-1 pl-3 relative group/down">
                  <div className="flex items-center gap-1 text-[10px] text-rose-400 font-bold uppercase tracking-wider cursor-pointer">
                    <ArrowDownRight size={12} />
                    <span>{language === "ES" ? "Bajan" : "Losses"}</span>
                  </div>
                  <div className="flex flex-col cursor-pointer">
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

                  {/* Hover Popover for Down Positions */}
                  <div className={`daily-dynamics-popover absolute right-0 bottom-full mb-2 p-3 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-2xl shadow-2xl opacity-0 invisible group-hover/down:opacity-100 group-hover/down:visible transition-all duration-200 pointer-events-none group-hover/down:pointer-events-auto z-50 ${sortedDownPositions.length > 5 ? "w-[290px] sm:w-[330px]" : "w-72 sm:w-80"}`}>
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
              <div className="mt-4">
                <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden flex">
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
          
          <div className="text-[9px] text-slate-500 font-semibold mt-3.5 pt-2 border-t border-slate-800/40 text-center uppercase tracking-wider">
            {language === "ES" ? "Valor y P&L Diario" : "Value & Daily P&L"}
          </div>
        </div>

        {/* Card 2: Portfolio Metrics */}
        <div id="summary-metrics-card" className="metrics-container-card bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-all shadow-xl flex flex-col justify-between w-full lg:w-[260px] shrink-0">
          <div>
            <div className="flex flex-col gap-2.5 mb-3.5">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-semibold uppercase tracking-wider">
                  {language === "ES" ? "Métricas" : "Metrics"}
                </span>
                <span className="p-1.5 bg-[#6366f1]/10 text-[#6366f1] rounded-lg">
                  <BarChart3 size={14} />
                </span>
              </div>
              
              {/* Benchmark Toggle */}
              <div className="bg-slate-950/80 p-0.5 border border-slate-800/60 rounded-xl flex items-center justify-between w-full">
                <button
                  onClick={() => setBenchmarkToggle("SP500")}
                  className={`flex-1 py-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer text-center ${
                    benchmarkToggle === "SP500"
                      ? "bg-sky-500 text-slate-950 font-extrabold shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  S&P 500
                </button>
                <button
                  onClick={() => setBenchmarkToggle("QQQ")}
                  className={`flex-1 py-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer text-center ${
                    benchmarkToggle === "QQQ"
                      ? "bg-violet-500 text-slate-950 font-extrabold shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  QQQ
                </button>
              </div>
            </div>
            
            <div className="flex flex-col gap-2 mt-1.5">
              {/* P/E Ratio */}
              <div className="metrics-subcard bg-white dark:bg-[#121420]/30 border border-slate-200 dark:border-slate-800/60 rounded-xl p-2.5 px-3 hover:border-slate-300 dark:hover:border-slate-800 transition-colors">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                    {language === "ES" ? "P/E Ponderado" : "Weighted P/E"}
                  </span>
                  <div className="flex items-center justify-between text-xs font-mono">
                    <div className="flex items-baseline gap-1">
                      <span className="text-[9px] font-sans font-medium text-slate-500">{language === "ES" ? "Port" : "Port"}:</span>
                      <span className="font-bold text-white text-xs">
                        {weightedPe !== null ? formatNumber(weightedPe, 1) : "—"}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-[9px] font-sans font-medium text-slate-500">{benchmarkToggle === "SP500" ? "S&P" : "QQQ"}:</span>
                      <span className={`font-bold text-xs ${benchmarkToggle === "SP500" ? "text-sky-400" : "text-violet-400"}`}>
                        {formatNumber(BENCHMARK_METRICS[benchmarkToggle].pe, 1)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Forward P/E */}
              <div className="metrics-subcard bg-white dark:bg-[#121420]/30 border border-slate-200 dark:border-slate-800/60 rounded-xl p-2.5 px-3 hover:border-slate-300 dark:hover:border-slate-800 transition-colors">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                    {language === "ES" ? "FWD P/E Ponderado" : "Weighted FWD P/E"}
                  </span>
                  <div className="flex items-center justify-between text-xs font-mono">
                    <div className="flex items-baseline gap-1">
                      <span className="text-[9px] font-sans font-medium text-slate-500">{language === "ES" ? "Port" : "Port"}:</span>
                      <span className="font-bold text-white text-xs">
                        {weightedFwdPe !== null ? formatNumber(weightedFwdPe, 1) : "—"}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-[9px] font-sans font-medium text-slate-500">{benchmarkToggle === "SP500" ? "S&P" : "QQQ"}:</span>
                      <span className={`font-bold text-xs ${benchmarkToggle === "SP500" ? "text-sky-400" : "text-violet-400"}`}>
                        {formatNumber(BENCHMARK_METRICS[benchmarkToggle].fwdPe, 1)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* PEG */}
              <div className="metrics-subcard bg-white dark:bg-[#121420]/30 border border-slate-200 dark:border-slate-800/60 rounded-xl p-2.5 px-3 hover:border-slate-300 dark:hover:border-slate-800 transition-colors">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                    {language === "ES" ? "PEG Ponderado" : "Weighted PEG"}
                  </span>
                  <div className="flex items-center justify-between text-xs font-mono">
                    <div className="flex items-baseline gap-1">
                      <span className="text-[9px] font-sans font-medium text-slate-500">{language === "ES" ? "Port" : "Port"}:</span>
                      <span className="font-bold text-white text-xs">
                        {weightedPeg !== null ? formatNumber(weightedPeg, 2) : "—"}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-[9px] font-sans font-medium text-slate-500">{benchmarkToggle === "SP500" ? "S&P" : "QQQ"}:</span>
                      <span className={`font-bold text-xs ${benchmarkToggle === "SP500" ? "text-sky-400" : "text-violet-400"}`}>
                        {formatNumber(BENCHMARK_METRICS[benchmarkToggle].peg, 2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Beta */}
              <div className="metrics-subcard bg-white dark:bg-[#121420]/30 border border-slate-200 dark:border-slate-800/60 rounded-xl p-2.5 px-3 hover:border-slate-300 dark:hover:border-slate-800 transition-colors">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                    {language === "ES" ? "Beta Ponderado" : "Weighted Beta"}
                  </span>
                  <div className="flex items-center justify-between text-xs font-mono">
                    <div className="flex items-baseline gap-1">
                      <span className="text-[9px] font-sans font-medium text-slate-500">{language === "ES" ? "Port" : "Port"}:</span>
                      <span className="font-bold text-white text-xs">
                        {formatNumber(weightedBeta, 2)}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-[9px] font-sans font-medium text-slate-500">{benchmarkToggle === "SP500" ? "S&P" : "QQQ"}:</span>
                      <span className={`font-bold text-xs ${benchmarkToggle === "SP500" ? "text-sky-400" : "text-violet-400"}`}>
                        {formatNumber(BENCHMARK_METRICS[benchmarkToggle].beta, 2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="text-[9px] text-slate-500 font-semibold mt-3 pt-2 border-t border-slate-800/40 text-center uppercase tracking-wider">
            {language === "ES" ? "Comparación Ponderada" : "Weighted Comparison"}
          </div>
        </div>

        {/* Card 3: Distribución de Activos (Enhanced Donut) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 hover:border-slate-700 transition-all shadow-xl flex flex-col justify-between w-full lg:flex-1 min-w-0">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-slate-400 mb-3">
              <div className="flex items-center justify-between gap-2 min-w-0">
                <span className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2 truncate">
                  {language === "ES" ? "Distribución de Portafolio" : "Portfolio Distribution"}
                  {selectedSector && (
                    <button 
                      onClick={() => setSelectedSector(null)}
                      className="text-[10px] text-emerald-400 normal-case bg-emerald-500/15 hover:bg-emerald-500/25 px-2 py-0.5 rounded-full border border-emerald-500/30 transition-all flex items-center gap-1 cursor-pointer shrink-0"
                      title={language === "ES" ? "Limpiar filtro de sector" : "Clear sector filter"}
                    >
                      <span className="truncate max-w-[110px] sm:max-w-none">Sector: {getSectorSpanish(selectedSector)}</span>
                      <span className="font-extrabold text-emerald-300">×</span>
                    </button>
                  )}
                </span>
                <span className="sm:hidden p-1.5 bg-emerald-500/10 text-emerald-400 rounded-xl shrink-0">
                  <PieChartIcon size={14} />
                </span>
              </div>

              <div className="flex items-center justify-center sm:justify-end gap-2 sm:gap-3 flex-wrap w-full sm:w-auto">
                {portfolioWeightedType && (
                  <button
                    onClick={onNavigateToHealth}
                    className={`inline-flex shrink-0 items-center gap-1 sm:gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl text-[11px] sm:text-xs font-extrabold cursor-pointer hover:scale-105 active:scale-95 transition-all shadow-md border border-emerald-500/30 ${getTypeBadgeConfig(portfolioWeightedType).className}`}
                    title={language === "ES" ? "Ir al toggle de Salud (Health) en la pestaña Holdings" : "Go to Health toggle in Holdings tab"}
                  >
                    <span className="text-xs sm:text-sm">{getTypeBadgeConfig(portfolioWeightedType).icon}</span>
                    <span>{portfolioWeightedType}</span>
                  </button>
                )}
                
                {portfolioWeightedScore > 0 && (
                  <button
                    onClick={onNavigateToHealth}
                    className="flex items-center gap-1.5 sm:gap-2 group cursor-pointer hover:scale-105 active:scale-95 transition-all p-1 sm:p-1.5 rounded-xl hover:bg-slate-800/80 border border-transparent hover:border-slate-700/60 shrink-0"
                    title={language === "ES" ? "Ir al toggle de Salud (Health) en la pestaña Holdings" : "Go to Health toggle in Holdings tab"}
                  >
                    <div className="flex flex-col items-end mr-0.5">
                      <span className="text-[9px] sm:text-[10px] uppercase tracking-wider font-extrabold text-slate-400 group-hover:text-emerald-400 transition-colors leading-none">
                        Score
                      </span>
                    </div>
                    <div className="relative w-9 h-9 sm:w-12 sm:h-12 flex items-center justify-center shrink-0">
                      <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                        {/* Background Track */}
                        <path
                          className="text-slate-800"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3.5"
                        />
                        {/* Progress */}
                        <path
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke={getScoreHex(portfolioWeightedScore)}
                          strokeWidth="3.5"
                          strokeDasharray={`${portfolioWeightedScore}, 100`}
                          className="drop-shadow-sm transition-all duration-1000 ease-out"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className={`text-[11px] sm:text-[13px] font-extrabold font-mono ${getScoreColorClass(portfolioWeightedScore)}`}>
                          {portfolioWeightedScore.toFixed(0)}
                        </span>
                      </div>
                    </div>
                  </button>
                )}
                
                <span className="hidden sm:inline-flex p-2 bg-emerald-500/10 text-emerald-400 rounded-xl ml-1 shrink-0">
                  <PieChartIcon size={16} />
                </span>
              </div>
            </div>

            {portfolio.positions.length === 0 ? (
              <div className="h-[150px] flex items-center justify-center text-slate-500 text-[11px]">
                {language === "ES" ? "No hay activos." : "No assets."}
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center gap-8 mt-4">
                {/* Large Donut Chart */}
                <div className="w-[260px] h-[260px] relative flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieDataDisplay}
                        cx="50%"
                        cy="50%"
                        innerRadius={85}
                        outerRadius={115}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {pieDataDisplay.map((entry, index) => {
                          const isSelected = selectedTicker === entry.name;
                          const hasSelection = selectedTicker !== null;
                          const opacity = hasSelection ? (isSelected ? 1 : 0.3) : 1;
                          return (
                            <Cell 
                              key={`cell-mini-${index}`} 
                              fill={COLORS[index % COLORS.length]} 
                              fillOpacity={opacity}
                              className="cursor-pointer outline-none transition-all duration-300"
                              onClick={() => {
                                if (entry.name !== "Otros" && entry.name !== "Other") {
                                  setSelectedTicker(prev => prev === entry.name ? null : entry.name);
                                }
                              }}
                            />
                          );
                        })}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center text */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider leading-none">
                      {selectedSector ? (language === "ES" ? "SECTOR" : "SECTOR") : (language === "ES" ? "TOTAL" : "TOTAL")}
                    </span>
                    <span className="text-2xl font-mono font-black text-white mt-1 leading-none tracking-tight">
                      {isReadOnly ? formatStockValue(pieTotalValue) : formatKValue(pieTotalValue)}
                    </span>
                  </div>
                </div>

                {/* Right legend (stylish ultra-compact text grid in two columns) */}
                <div className="flex-1 min-w-0 grid grid-cols-2 gap-x-5 gap-y-1.5 w-full max-h-[220px] overflow-y-auto pr-1">
                  {pieDataDisplay.map((pos, index) => {
                    const isSelected = selectedTicker === pos.name;
                    const hasSelection = selectedTicker !== null;
                    const isOther = pos.name === "Otros" || pos.name === "Other";
                    return (
                      <button 
                        key={`${pos.name}-${index}`} 
                        disabled={isOther}
                        onClick={() => {
                          setSelectedTicker(prev => prev === pos.name ? null : pos.name);
                        }}
                        className={`flex items-center gap-1.5 text-xs font-mono py-1 px-2 rounded-lg border border-transparent transition-all min-w-0 text-left w-full ${
                          isOther 
                            ? "cursor-default opacity-60" 
                            : isSelected 
                              ? "bg-slate-800 border-emerald-500/30 shadow-md scale-[1.02] cursor-pointer" 
                              : hasSelection 
                                ? "opacity-30 hover:opacity-100 hover:bg-slate-800/20 cursor-pointer" 
                                : "hover:bg-slate-800/30 cursor-pointer"
                        }`}
                      >
                        {/* Dot indicator */}
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        />
                        {/* Ticker Name */}
                        <span className={`font-bold uppercase transition-colors truncate ${isSelected ? "text-emerald-400 font-extrabold" : "text-slate-300 group-hover:text-white"}`}>
                          {pos.name}
                        </span>
                        {/* Bullet separator */}
                        <span className="text-slate-600 font-semibold select-none">•</span>
                        {/* Weight Percentage */}
                        <span className="text-white font-extrabold shrink-0">
                          {pos.weight.toFixed(1)}%
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="text-[9px] text-slate-500 font-semibold mt-4 pt-2 border-t border-slate-800/40 text-center uppercase tracking-wider">
            {language === "ES" ? "Distribución de Cartera" : "Portfolio Distribution"}
          </div>
        </div>
      </div>

      {/* Performance & Metrics Panel */}
      {sortedPositions.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="performance-metrics-panel">
          {/* Performance Area Chart */}
          <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 flex flex-col justify-between shadow-2xl">
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
                      setChartSymbol(e.target.value);
                      onSelectTickerForChart(e.target.value);
                    }}
                    className="bg-slate-800 border border-slate-700 rounded-xl text-[10px] sm:text-xs font-semibold px-2 sm:px-3 py-1 sm:py-1.5 text-white outline-none focus:border-emerald-500 transition-all cursor-pointer w-24 sm:w-auto sm:max-w-[190px] truncate shrink-0"
                  >
                    <option value="PORTFOLIO">{portfolioName || (language === "EN" ? "Complete Portfolio" : "Portafolio Completo")}</option>
                    <option value="CASH">Efectivo (Cash)</option>
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
                  <span className="text-xs">Cargando datos históricos de rendimiento...</span>
                </div>
              ) : chartData.length === 0 ? (
                <div className="h-[280px] flex items-center justify-center text-slate-500 text-xs">
                  No hay datos disponibles para este periodo.
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
                        onClick={() => setSelectedTicker(null)}
                        className="text-[10px] text-sky-400 normal-case bg-sky-500/15 hover:bg-sky-500/25 px-2 py-0.5 rounded-full border border-sky-500/30 transition-all flex items-center gap-1 cursor-pointer"
                        title={language === "ES" ? "Limpiar filtro de posición" : "Clear position filter"}
                      >
                        <span>Posición: {selectedTicker}</span>
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
                    ? Object.entries(sectorSubsectors[sector.name]).sort((a, b) => b[1].weight - a[1].weight)
                    : [];

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
                          <span className="font-semibold text-slate-300 group-hover:text-white truncate text-xs" title={getSectorSpanish(sector.name)}>
                            {getSectorSpanish(sector.name)}
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


    </div>
  );
}
