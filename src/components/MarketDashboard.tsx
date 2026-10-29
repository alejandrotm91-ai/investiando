import React, { useState, useEffect, useMemo, useCallback } from "react";
import { 
  TrendingUp, 
  TrendingDown, 
  RefreshCw, 
  Activity, 
  ArrowUpRight, 
  ArrowDownRight, 
  Globe, 
  Zap, 
  Award, 
  Coins, 
  ArrowUp, 
  ArrowDown, 
  Briefcase, 
  Plus, 
  Layers, 
  CheckCircle2, 
  ChevronRight,
  ChevronDown,
  ChevronUp,
  X,
  ExternalLink,
  Flame,
  Gauge,
  Clock
} from "lucide-react";
import { getMarketStatus } from "../utils/market";
import { PortfolioData, Holding } from "../types";
import { SECTOR_TOP_HOLDINGS, SectorHoldingsConfig, SectorTopHolding } from "../data/sp500SectorHoldings";

interface IndexCardProps {
  key?: any;
  name: string;
  symbol: string;
  price: string;
  change: string;
  changePct: number;
  sparkline: number[];
  theme?: "dark" | "light";
}

function IndexCard({ 
  name, 
  symbol, 
  price, 
  change, 
  changePct, 
  sparkline, 
  theme 
}: IndexCardProps) {
  const isPositive = changePct >= 0;
  const strokeColor = isPositive 
    ? (theme === "light" ? "#0c5c3e" : "#10b981") 
    : (theme === "light" ? "#b82e2e" : "#f43f5e");
  
  // Sanitize change string to avoid duplicate signs (e.g. '++' or '--')
  const rawChangeStr = String(change ?? "").trim();
  const cleanChange = rawChangeStr.replace(/^[+\-\s]+/, "");
  const displayChange = cleanChange ? `${isPositive ? "+" : "-"}${cleanChange}` : "";

  const absPct = Math.abs(changePct).toFixed(2);
  const displayPct = `${isPositive ? "+" : "-"}${absPct}%`;

  return (
    <div 
      id={`index-card-${symbol.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()}`} 
      className="index-card bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between hover:border-slate-700 hover:shadow-xl transition-all shadow-md group"
    >
      <div className="flex justify-between items-start gap-1">
        <div className="min-w-0">
          <span className="text-xs sm:text-sm font-semibold text-slate-300 block truncate leading-tight">{name}</span>
        </div>
      </div>

      <div className="flex items-end justify-between mt-4">
        <div>
          <span className="text-lg sm:text-xl font-display font-bold text-white leading-none tracking-tight">{price}</span>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span className={`text-[11px] font-mono font-medium ${
              isPositive 
                ? (theme === "light" ? "text-[#0c5c3e]" : "text-emerald-400") 
                : (theme === "light" ? "text-[#b82e2e]" : "text-rose-400")
            }`}>
              {displayChange}
            </span>
            <span className={`inline-flex items-center gap-0.5 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
              isPositive 
                ? "bg-emerald-500/10 text-emerald-400" 
                : "bg-rose-500/10 text-rose-400"
            }`}>
              {isPositive ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
              {displayPct}
            </span>
          </div>
        </div>

        {/* Dynamic SVG Mini Sparkline */}
        <div className="w-16 h-8 flex items-end flex-shrink-0">
          <svg className="w-full h-full" viewBox="0 0 100 30">
            <polyline
              fill="none"
              stroke={strokeColor}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={sparkline.map((val, idx) => `${(idx / (sparkline.length - 1)) * 100},${30 - (val / 100) * 30}`).join(" ")}
              className="group-hover:stroke-[3]"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

interface PortfolioIndexCardProps {
  portfolioData?: PortfolioData | null;
  holdings?: Holding[];
  language: "EN" | "ES";
  theme?: "dark" | "light";
  onNavigate?: () => void;
  onOpenEdit?: () => void;
  onOpenGetStarted?: () => void;
}

function PortfolioIndexCard({
  portfolioData,
  holdings,
  language,
  theme,
  onNavigate,
  onOpenEdit,
  onOpenGetStarted
}: PortfolioIndexCardProps) {
  const hasHoldings = Boolean(
    holdings && holdings.length > 0 && holdings.some(h => (!h.isCash && h.shares > 0) || (h.isCash && h.shares > 0))
  );
  const hasValidData = Boolean(
    portfolioData &&
    portfolioData.totals &&
    portfolioData.totals.mktValue > 0 &&
    portfolioData.positions &&
    portfolioData.positions.length > 0
  );

  const hasPortfolio = hasHoldings && hasValidData;

  if (!hasPortfolio) {
    return (
      <div 
        id="index-card-portfolio"
        onClick={() => {
          if (onOpenGetStarted) onOpenGetStarted();
          else if (onOpenEdit) onOpenEdit();
          else if (onNavigate) onNavigate();
        }}
        className="index-card bg-slate-900/90 border border-dashed border-emerald-500/40 hover:border-emerald-400 p-5 rounded-2xl flex flex-col justify-between hover:bg-slate-850 hover:shadow-xl transition-all shadow-md group cursor-pointer"
      >
        <div className="flex justify-between items-start gap-1">
          <div className="min-w-0 flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
              <Briefcase size={11} />
            </div>
            <span className="text-xs sm:text-sm font-semibold text-slate-300 block truncate leading-tight">
              {language === "ES" ? "Portafolio" : "Portfolio"}
            </span>
          </div>
          <span className="flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 group-hover:bg-emerald-500/25 transition-colors">
            <Plus size={10} />
            {language === "ES" ? "Nuevo" : "New"}
          </span>
        </div>

        <div className="flex items-center gap-3 mt-4">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500 group-hover:text-slate-950 transition-all flex-shrink-0 shadow-sm">
            <Plus size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs font-bold text-emerald-400 group-hover:text-emerald-300 block leading-tight truncate">
              {language === "ES" ? "Crea tu primer portafolio" : "Create your first portfolio"}
            </span>
            <span className="text-[10px] text-slate-400 block mt-1 leading-tight truncate">
              {language === "ES" ? "Empieza a monitorear activos" : "Start tracking your assets"}
            </span>
          </div>
        </div>
      </div>
    );
  }

  const totals = portfolioData.totals;
  const changePct = totals.dailyPnLPercent || 0;
  const isPositive = changePct >= 0;
  const strokeColor = isPositive 
    ? (theme === "light" ? "#0c5c3e" : "#10b981") 
    : (theme === "light" ? "#b82e2e" : "#f43f5e");

  // Generate a clean mini sparkline curve representing portfolio momentum
  const sparkline = isPositive
    ? [20, 24, 22, 30, 28, 35, 42, 38, 48, 55, 60]
    : [60, 55, 58, 48, 45, 38, 35, 30, 28, 22, 20];

  // Format numbers abbreviating thousands (k) with 1 decimal
  const formatCompact = (val: number) => {
    const abs = Math.abs(val);
    if (abs >= 1_000_000) {
      return `${(val / 1_000_000).toFixed(1)}M`;
    }
    if (abs >= 1_000) {
      return `${(val / 1_000).toFixed(1)}k`;
    }
    return val.toFixed(1);
  };

  const priceStr = `$${formatCompact(totals.mktValue)}`;
  const changeSign = isPositive ? "+" : "-";
  const changeStr = `${changeSign}$${formatCompact(Math.abs(totals.dailyPnL))}`;

  return (
    <div 
      id="index-card-portfolio"
      onClick={onNavigate}
      className="index-card bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl flex flex-col justify-between hover:border-emerald-500/50 hover:shadow-xl transition-all shadow-md group cursor-pointer"
    >
      <div className="flex justify-between items-start gap-1">
        <div className="min-w-0 flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform">
            <Briefcase size={11} />
          </div>
          <span className="text-xs sm:text-sm font-semibold text-slate-300 block truncate leading-tight">
            {language === "ES" ? "Mi Portafolio" : "My Portfolio"}
          </span>
        </div>
      </div>

      <div className="flex items-end justify-between mt-3">
        <div className="min-w-0 pr-1 flex-1">
          <span className="text-base sm:text-lg font-display font-bold text-white leading-none tracking-tight block whitespace-nowrap">
            {priceStr}
          </span>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className={`text-[11px] font-mono font-medium whitespace-nowrap ${
              isPositive 
                ? (theme === "light" ? "text-[#0c5c3e]" : "text-emerald-400") 
                : (theme === "light" ? "text-[#b82e2e]" : "text-rose-400")
            }`}>
              {changeStr}
            </span>
            <span className={`inline-flex items-center gap-0.5 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap ${
              isPositive 
                ? "bg-emerald-500/10 text-emerald-400" 
                : "bg-rose-500/10 text-rose-400"
            }`}>
              {isPositive ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
              {isPositive ? "+" : ""}{changePct.toFixed(2)}%
            </span>
          </div>
        </div>

        {/* Dynamic SVG Mini Sparkline */}
        <div className="w-14 h-7 flex items-end flex-shrink-0">
          <svg className="w-full h-full" viewBox="0 0 100 30">
            <polyline
              fill="none"
              stroke={strokeColor}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={sparkline.map((val, idx) => `${(idx / (sparkline.length - 1)) * 100},${30 - (val / 100) * 30}`).join(" ")}
              className="group-hover:stroke-[3]"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

interface MarketDashboardProps {
  language: "EN" | "ES";
  theme?: "dark" | "light";
  portfolioData?: PortfolioData | null;
  holdings?: Holding[];
  onNavigateToPortfolio?: () => void;
  onOpenEditHoldings?: () => void;
  onOpenGetStarted?: () => void;
  onSelectTicker?: (ticker: string) => void;
}

export default function MarketDashboard({ 
  language, 
  theme,
  portfolioData,
  holdings,
  onNavigateToPortfolio,
  onOpenEditHoldings,
  onOpenGetStarted,
  onSelectTicker
}: MarketDashboardProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [marketState, setMarketState] = useState<"OPEN" | "CLOSED">(
    getMarketStatus().isOpen ? "OPEN" : "CLOSED"
  );

  interface SectorItem {
    key: string;
    ticker: string;
    nameEN: string;
    nameES: string;
    category?: "growth" | "defensive" | "cyclical";
    price?: number;
    pct: number;
    pct1W?: number;
    pct1M?: number;
    pctYTD?: number;
    pct1Y?: number;
    rsi14: number;
    sparkline?: number[];
    sentiment: string;
    sentimentES: string;
  }

  const [sectorTimeframe, setSectorTimeframe] = useState<"1D" | "1W" | "1M" | "YTD" | "1Y">("1D");
  const [expandedSectorTicker, setExpandedSectorTicker] = useState<string | null>(null);
  const [sectorHoldingsData, setSectorHoldingsData] = useState<Record<string, SectorHoldingsConfig>>(SECTOR_TOP_HOLDINGS);
  const [top10SortBy, setTop10SortBy] = useState<"weight" | "perf" | "upside">("weight");

  // Fetch real-time sector top 10 holdings
  const fetchTop10 = useCallback(async () => {
    try {
      const response = await fetch("/api/market/sector-top10");
      if (response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data = await response.json();
          if (data && typeof data === "object") {
            setSectorHoldingsData((prev) => ({ ...prev, ...data }));
          }
        }
      }
    } catch (err) {
      console.warn("Sector top 10 fetch notice:", err);
    }
  }, []);

  useEffect(() => {
    fetchTop10();
  }, [fetchTop10]);

  const [sectors, setSectors] = useState<SectorItem[]>([
    { key: "technology", ticker: "XLK", nameEN: "Technology", nameES: "Tecnología", category: "growth", price: 195.75, pct: 0.64, pct1W: 0.21, pct1M: 7.06, pctYTD: 12.71, pct1Y: 22.59, rsi14: 65.1, sparkline: [12, 31, 4, 0, 2, 34, 47, 89, 100, 93, 88, 100, 86, 86, 96], sentiment: "Bullish", sentimentES: "Alcista" },
    { key: "communications", ticker: "XLC", nameEN: "Communications", nameES: "Comunicaciones", category: "growth", price: 110.97, pct: -0.45, pct1W: -1.41, pct1M: -1.46, pctYTD: -2.62, pct1Y: -4.66, rsi14: 48.1, sparkline: [30, 35, 40, 42, 50, 52, 58, 62, 60, 68], sentiment: "Neutral", sentimentES: "Neutral" },
    { key: "discretionary", ticker: "XLY", nameEN: "Consumer Discretionary", nameES: "Consumo Discrecional", category: "growth", price: 108.84, pct: -0.28, pct1W: -1.64, pct1M: -7.10, pctYTD: -12.78, pct1Y: -22.72, rsi14: 52.1, sparkline: [40, 42, 38, 45, 48, 52, 50, 55, 58, 62], sentiment: "Neutral", sentimentES: "Neutral" },
    { key: "financials", ticker: "XLF", nameEN: "Financials", nameES: "Finanzas", category: "cyclical", price: 53.40, pct: -1.13, pct1W: -2.09, pct1M: -8.34, pctYTD: -15.02, pct1Y: -26.69, rsi14: 55.7, sparkline: [50, 52, 48, 46, 52, 54, 50, 48, 49, 48], sentiment: "Bullish", sentimentES: "Alcista" },
    { key: "industrials", ticker: "XLI", nameEN: "Industrials", nameES: "Industriales", category: "cyclical", price: 166.98, pct: -1.27, pct1W: -1.83, pct1M: -7.41, pctYTD: -13.33, pct1Y: -23.71, rsi14: 58.4, sparkline: [35, 38, 42, 40, 48, 50, 54, 52, 56, 60], sentiment: "Bullish", sentimentES: "Alcista" },
    { key: "materials", ticker: "XLB", nameEN: "Materials", nameES: "Materiales", category: "cyclical", price: 48.70, pct: -0.81, pct1W: -3.14, pct1M: -9.26, pctYTD: -16.67, pct1Y: -29.63, rsi14: 48.9, sparkline: [48, 46, 45, 42, 44, 40, 42, 38, 40, 39], sentiment: "Neutral", sentimentES: "Neutral" },
    { key: "energy", ticker: "XLE", nameEN: "Energy", nameES: "Energía", category: "cyclical", price: 61.50, pct: -0.06, pct1W: -1.39, pct1M: -1.49, pctYTD: -2.68, pct1Y: -4.77, rsi14: 43.8, sparkline: [77, 82, 68, 100, 57, 67, 63, 22, 6, 20, 25, 12, 14, 1, 0], sentiment: "Bearish", sentimentES: "Bajista" },
    { key: "realestate", ticker: "XLRE", nameEN: "Real Estate", nameES: "Bienes Raíces", category: "cyclical", price: 40.91, pct: -1.04, pct1W: -2.22, pct1M: -9.27, pctYTD: -16.69, pct1Y: -29.67, rsi14: 46.1, sparkline: [50, 48, 44, 42, 38, 35, 34, 30, 28, 26], sentiment: "Neutral", sentimentES: "Neutral" },
    { key: "healthcare", ticker: "XLV", nameEN: "Healthcare", nameES: "Salud", category: "defensive", price: 168.42, pct: -1.35, pct1W: -0.23, pct1M: -2.95, pctYTD: -5.31, pct1Y: -9.44, rsi14: 53.3, sparkline: [45, 46, 44, 48, 50, 49, 52, 51, 53, 55], sentiment: "Neutral", sentimentES: "Neutral" },
    { key: "staples", ticker: "XLP", nameEN: "Consumer Staples", nameES: "Consumo Básico", category: "defensive", price: 80.60, pct: -1.53, pct1W: -2.22, pct1M: -6.57, pctYTD: -11.83, pct1Y: -21.03, rsi14: 51.2, sparkline: [52, 50, 48, 46, 45, 47, 44, 46, 43, 42], sentiment: "Neutral", sentimentES: "Neutral" },
    { key: "utilities", ticker: "XLU", nameEN: "Utilities", nameES: "Servicios Públicos", category: "defensive", price: 39.44, pct: -0.68, pct1W: -0.78, pct1M: -9.35, pctYTD: -16.84, pct1Y: -29.93, rsi14: 51.2, sparkline: [45, 42, 38, 36, 32, 30, 28, 25, 22, 20], sentiment: "Neutral", sentimentES: "Neutral" }
  ]);
  const [sectorsLoading, setSectorsLoading] = useState(false);

  // Centralized, synchronized sector performance calculator by global timeframe
  const getSectorPct = useCallback(
    (sec: SectorItem): number => {
      let val: number | undefined;
      switch (sectorTimeframe) {
        case "1W": val = sec.pct1W; break;
        case "1M": val = sec.pct1M; break;
        case "YTD": val = sec.pctYTD; break;
        case "1Y": val = sec.pct1Y; break;
        case "1D":
        default: val = sec.pct; break;
      }
      return typeof val === "number" && !isNaN(val) ? val : (sec.pct || 0);
    },
    [sectorTimeframe]
  );

  const [indices, setIndices] = useState<any[]>([
    { 
      nameEN: "VIX", 
      nameES: "VIX", 
      symbol: "^VIX", 
      price: "14.87", 
      change: "-0.80", 
      changePct: -5.11, 
      highFormatted: "35.30",
      athScorePct: 42.1,
      distToHighPct: 57.9,
      sparkline: [40, 38, 35, 30, 28, 32, 35, 38, 30, 25, 22] 
    },
    { 
      nameEN: "S&P500", 
      nameES: "S&P500", 
      symbol: "^GSPC", 
      price: "7,743.41", 
      change: "+39.28", 
      changePct: 0.51, 
      highFormatted: "7,816.70",
      athScorePct: 99.1,
      distToHighPct: 0.9,
      sparkline: [10, 15, 12, 18, 25, 20, 30, 42, 38, 48, 50] 
    },
    { 
      nameEN: "NASDAQ", 
      nameES: "NASDAQ", 
      symbol: "^IXIC", 
      price: "27,068.72", 
      change: "+129.34", 
      changePct: 0.48, 
      highFormatted: "27,288.79",
      athScorePct: 99.2,
      distToHighPct: 0.8,
      sparkline: [5, 12, 18, 15, 28, 24, 38, 42, 35, 52, 60] 
    },
    { 
      nameEN: "DOW", 
      nameES: "DOW", 
      symbol: "^DJI", 
      price: "51,828.62", 
      change: "+478.64", 
      changePct: 0.93, 
      highFormatted: "54,744.33",
      athScorePct: 94.7,
      distToHighPct: 5.3,
      sparkline: [20, 22, 18, 25, 22, 28, 24, 32, 28, 30, 35] 
    },
  ]);
  const [indicesLoading, setIndicesLoading] = useState(false);

  const [marketData, setMarketData] = useState<{ commodities: any[]; cryptos: any[] }>({
    commodities: [
      { nameEN: "Gold", nameES: "Oro", symbol: "GC=F", price: "4,320.50", rawPrice: 4320.50, highFormatted: "5,586.20", pct: 0.52, athScorePct: 77.3, distToHighPct: 22.7 },
      { nameEN: "Silver", nameES: "Plata", symbol: "SI=F", price: "64.71", rawPrice: 64.71, highFormatted: "121.30", pct: 1.11, athScorePct: 53.3, distToHighPct: 46.7 },
      { nameEN: "Copper", nameES: "Cobre", symbol: "HG=F", price: "6.78", rawPrice: 6.78, highFormatted: "6.83", pct: -0.16, athScorePct: 99.3, distToHighPct: 0.7 },
      { nameEN: "Crude Oil", nameES: "Petróleo Crudo", symbol: "CL=F", price: "92.44", rawPrice: 92.44, highFormatted: "119.48", pct: -2.29, athScorePct: 77.4, distToHighPct: 22.6 },
      { nameEN: "Natural Gas", nameES: "Gas Natural", symbol: "NG=F", price: "3.25", rawPrice: 3.25, highFormatted: "7.83", pct: -3.53, athScorePct: 41.5, distToHighPct: 58.5 },
    ],
    cryptos: [
      { nameEN: "Bitcoin", nameES: "Bitcoin", symbol: "BTC-USD", price: "83,814.00", rawPrice: 83814.00, highFormatted: "126,198.00", pct: -0.55, athScorePct: 66.4, distToHighPct: 33.6 },
      { nameEN: "Ethereum", nameES: "Ethereum", symbol: "ETH-USD", price: "2,680.00", rawPrice: 2680.00, highFormatted: "4,755.00", pct: -0.14, athScorePct: 56.4, distToHighPct: 43.6 },
    ]
  });
  const [marketDataLoading, setMarketDataLoading] = useState(false);

  const fetchSectors = async () => {
    setSectorsLoading(true);
    try {
      const response = await fetch("/api/market/sectors");
      if (response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data = await response.json();
          if (Array.isArray(data) && data.length > 0) {
            setSectors(data);
          }
        }
      }
    } catch (err) {
      console.warn("Market sectors fetch notice:", err);
    } finally {
      setSectorsLoading(false);
    }
  };

  const getIndexDisplayName = (item: any) => {
    const sym = item.symbol?.toUpperCase();
    if (sym === "^GSPC") return "S&P500";
    if (sym === "^IXIC") return "NASDAQ";
    if (sym === "^DJI") return "DOW";
    if (sym === "^VIX") return "VIX";
    return language === "ES" ? (item.nameES || item.nameEN) : item.nameEN;
  };

  const fetchIndices = async () => {
    setIndicesLoading(true);
    try {
      const response = await fetch("/api/market/indices");
      if (response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data = await response.json();
          if (Array.isArray(data) && data.length > 0) {
            setIndices(data);
          }
        }
      }
    } catch (err) {
      console.warn("Market indices fetch notice:", err);
    } finally {
      setIndicesLoading(false);
    }
  };

  const fetchMarketData = async () => {
    setMarketDataLoading(true);
    try {
      const response = await fetch("/api/market/commodities-crypto");
      if (response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data = await response.json();
          if (data && data.commodities && data.cryptos) {
            setMarketData(data);
          }
        }
      }
    } catch (err) {
      console.warn("Commodities & crypto fetch notice:", err);
    } finally {
      setMarketDataLoading(false);
    }
  };

  useEffect(() => {
    fetchSectors();
    fetchIndices();
    fetchMarketData();

    const updateMarketState = () => {
      setMarketState(getMarketStatus().isOpen ? "OPEN" : "CLOSED");
    };

    updateMarketState();
    const stateInterval = setInterval(updateMarketState, 30000);

    // Auto-refresh market indices, commodities & crypto, and sector health periodically
    const dataInterval = setInterval(() => {
      fetchIndices();
      fetchMarketData();
      fetchSectors();
    }, 25000);

    return () => {
      clearInterval(stateInterval);
      clearInterval(dataInterval);
    };
  }, []);
  
  // Translation dictionary
  const t = {
    EN: {
      title: "MARKET WATCH",
      desc: "Real-time global indices, cryptocurrency performance and sector sentiment",
      marketOpen: "MARKET OPEN",
      marketClosed: "MARKET CLOSED",
      indexes: "Global Indices",
      crypto: "Cryptocurrency",
      sectors: "Sectors",
      sectorHealth: "Market Sector Performance & RSI (14D)",
      colSector: "Sector (ETF)",
      colChange: "Change 24h",
      colRsi: "RSI (14D) Gauge",
      colSentiment: "Sentiment",
      refresh: "Refreshing live feeds...",
    },
    ES: {
      title: "MERCADO EN VIVO",
      desc: "Índices globales en tiempo real, rendimiento de criptomonedas y sentimiento de sectores",
      marketOpen: "MERCADO ABIERTO",
      marketClosed: "MERCADO CERRADO",
      indexes: "Índices Globales",
      crypto: "Criptomonedas",
      sectors: "Sectores",
      sectorHealth: "Rendimiento de Sectores de Mercado y RSI (14D)",
      colSector: "Sector (ETF)",
      colChange: "Cambio 24h",
      colRsi: "Indicador RSI (14D)",
      colSentiment: "Sentimiento",
      refresh: "Actualizando datos de mercado...",
    }
  }[language];

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchSectors(), fetchIndices(), fetchMarketData(), fetchTop10()]);
    setRefreshing(false);
  };

  return (
    <div id="market-dashboard-view" className="space-y-6">
      {/* Title block */}
      <div id="market-header-card" className="market-header-card flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-2xl">
        <div>
          <h2 className="text-lg font-display font-semibold text-white tracking-wide uppercase flex items-center gap-2">
            <Activity className="text-blue-500 animate-pulse" size={20} />
            {t.title}
          </h2>
          <p className="text-xs text-slate-400 mt-1">{t.desc}</p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          {/* Market Status pill */}
          <div className="market-status-pill flex items-center gap-2 bg-slate-800 border border-slate-700 py-1.5 px-3 rounded-xl">
            <div className={`w-2 h-2 rounded-full ${marketState === "OPEN" ? "bg-emerald-500 animate-ping" : "bg-rose-500"}`} />
            <span className={`text-[10px] font-bold tracking-wider ${marketState === "OPEN" ? "text-emerald-400" : "text-rose-400"}`}>
              {marketState === "OPEN" ? t.marketOpen : t.marketClosed}
            </span>
          </div>

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="market-refresh-btn p-2.5 rounded-xl border border-slate-700 hover:border-slate-600 bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-white transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={15} className={`${refreshing ? "animate-spin text-blue-400" : ""}`} />
          </button>
        </div>
      </div>

      {refreshing && (
        <div className="text-xs font-mono text-center text-blue-400 animate-pulse bg-blue-500/5 py-2 rounded-xl border border-blue-500/10">
          {t.refresh}
        </div>
      )}

      {/* Grid of indices & portfolio in a responsive layout */}
      <div>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
          <Globe size={13} className="text-slate-500" />
          {t.indexes}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <PortfolioIndexCard
            portfolioData={portfolioData}
            holdings={holdings}
            language={language}
            theme={theme}
            onNavigate={onNavigateToPortfolio}
            onOpenEdit={onOpenEditHoldings}
            onOpenGetStarted={onOpenGetStarted}
          />
          {indices.map((item, idx) => (
            <IndexCard 
              key={idx} 
              name={getIndexDisplayName(item)}
              symbol={item.symbol}
              price={item.price}
              change={item.change}
              changePct={item.changePct}
              sparkline={item.sparkline}
              theme={theme}
            />
          ))}
        </div>
      </div>

      {/* Sectors and Sentiment */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sector Health (Col-span-2) - Redesigned Interactive Panel */}
        <div id="sector-health-panel" className="market-panel-card lg:col-span-2 bg-slate-900 border border-slate-800 p-5 sm:p-6 rounded-3xl shadow-2xl flex flex-col justify-between">
          <div>
            {/* Header with Title, Timeframe selector and View mode buttons */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3.5 pb-4 border-b border-slate-800/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20 shadow-inner flex-shrink-0">
                  <Zap className="text-amber-400" size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-display font-bold text-sm sm:text-base text-white tracking-wide uppercase">
                      {language === "ES" ? "Rendimiento Sectorial & Salud de Mercado" : "Sector Performance & Market Breadth"}
                    </h3>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
                      S&P 500 ETFs
                    </span>
                    <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300">
                      {sectorTimeframe}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {language === "ES" 
                      ? "Fuerza relativa, flujo de capital y niveles de sobrecompra/sobreventa (RSI 14D)" 
                      : "Relative strength, capital flow rotation and RSI 14D overbought/oversold levels"}
                  </p>
                </div>
              </div>

              {/* Controls: Global Timeframe Selector */}
              <div className="flex items-center gap-2.5 self-start md:self-auto flex-wrap">
                <span className="text-[11px] font-mono text-slate-400 font-semibold flex items-center gap-1.5">
                  <Clock size={12} className="text-amber-400" />
                  {language === "ES" ? "Escala global:" : "Global timeframe:"}
                </span>
                <div className="flex items-center bg-slate-950/90 p-1 rounded-xl border border-slate-800 shadow-inner">
                  {(["1D", "1W", "1M", "YTD", "1Y"] as const).map((tf) => {
                    const active = sectorTimeframe === tf;
                    return (
                      <button
                        key={tf}
                        onClick={() => setSectorTimeframe(tf)}
                        className={`px-3 py-1 text-[11px] font-mono font-bold rounded-lg transition-all cursor-pointer ${
                          active
                            ? "bg-amber-500 text-slate-950 font-black shadow-md shadow-amber-500/30"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                        }`}
                      >
                        {tf}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Quick Breadth & Leaders Summary Strip */}
            {(() => {
              const sorted = [...sectors].sort((a, b) => getSectorPct(b) - getSectorPct(a));
              const top = sorted[0];
              const laggard = sorted[sorted.length - 1];
              const posCount = sectors.filter((s) => getSectorPct(s) >= 0).length;
              const negCount = sectors.length - posCount;
              const posPct = Math.round((posCount / (sectors.length || 1)) * 100);
              const avg = sectors.reduce((acc, s) => acc + getSectorPct(s), 0) / (sectors.length || 1);

              return (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 py-3.5 my-3.5 px-3 bg-slate-950/60 border border-slate-800/70 rounded-2xl">
                  {/* Top Gainer */}
                  <div className="flex flex-col">
                    <span className="text-[9px] font-mono uppercase tracking-wider text-slate-500 flex items-center gap-1">
                      <Flame size={10} className="text-emerald-400" />
                      {language === "ES" ? "Líder" : "Leader"} ({sectorTimeframe})
                    </span>
                    {top && (
                      <div className="flex items-baseline gap-1.5 mt-0.5">
                        <span className="text-xs font-bold text-white font-mono">{top.ticker}</span>
                        <span className="text-[11px] font-mono font-bold text-emerald-400">
                          +{getSectorPct(top).toFixed(2)}%
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Top Laggard */}
                  <div className="flex flex-col">
                    <span className="text-[9px] font-mono uppercase tracking-wider text-slate-500 flex items-center gap-1">
                      <TrendingDown size={10} className="text-rose-400" />
                      {language === "ES" ? "Rezago" : "Laggard"} ({sectorTimeframe})
                    </span>
                    {laggard && (
                      <div className="flex items-baseline gap-1.5 mt-0.5">
                        <span className="text-xs font-bold text-white font-mono">{laggard.ticker}</span>
                        <span className="text-[11px] font-mono font-bold text-rose-400">
                          {getSectorPct(laggard) > 0 ? "+" : ""}{getSectorPct(laggard).toFixed(2)}%
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Market Breadth */}
                  <div className="flex flex-col">
                    <div className="flex items-center justify-between text-[9px] font-mono uppercase text-slate-500">
                      <span>{language === "ES" ? "Amplitud" : "Breadth"}</span>
                      <span className="text-slate-300 font-bold">{posCount}/{sectors.length} ({posPct}%)</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden flex mt-1.5 border border-slate-800">
                      <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${posPct}%` }} />
                      <div className="bg-rose-500 h-full transition-all duration-500" style={{ width: `${100 - posPct}%` }} />
                    </div>
                  </div>

                  {/* Average Sector Return */}
                  <div className="flex flex-col">
                    <span className="text-[9px] font-mono uppercase tracking-wider text-slate-500 flex items-center gap-1">
                      <Gauge size={10} className="text-blue-400" />
                      {language === "ES" ? "Retorno Medio" : "Mean Return"}
                    </span>
                    <div className="flex items-baseline gap-1 mt-0.5">
                      <span className={`text-xs font-mono font-bold ${avg >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {avg >= 0 ? "+" : ""}{avg.toFixed(2)}%
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">({sectors.length} ETFs)</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Main Interactive Views */}
            {(() => {
              const displayed = sectors;

              const maxAbsPct = Math.max(...displayed.map((s) => Math.abs(getSectorPct(s))), 0.1);

              const getRsiConfig = (rsiVal: number) => {
                if (rsiVal > 70) {
                  return {
                    badge: "text-amber-400 bg-amber-500/10 border-amber-500/20",
                    text: "text-amber-400",
                    dot: "bg-amber-400",
                    label: language === "ES" ? "Sobrecompra" : "Overbought"
                  };
                }
                if (rsiVal < 30) {
                  return {
                    badge: "text-purple-400 bg-purple-500/10 border-purple-500/20",
                    text: "text-purple-400",
                    dot: "bg-purple-400",
                    label: language === "ES" ? "Sobrevendido" : "Oversold"
                  };
                }
                if (rsiVal > 55) {
                  return {
                    badge: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
                    text: "text-emerald-400",
                    dot: "bg-emerald-400",
                    label: language === "ES" ? "Alcista" : "Bullish"
                  };
                }
                if (rsiVal < 45) {
                  return {
                    badge: "text-rose-400 bg-rose-500/10 border-rose-500/20",
                    text: "text-rose-400",
                    dot: "bg-rose-400",
                    label: language === "ES" ? "Bajista" : "Bearish"
                  };
                }
                return {
                  badge: "text-slate-400 bg-slate-800/50 border-slate-700/50",
                  text: "text-slate-400",
                  dot: "bg-slate-400",
                  label: language === "ES" ? "Neutral" : "Neutral"
                };
              };

              // Top 10 by Weight expandable card for any clicked sector
              const renderSectorTop10Box = (sec: SectorItem) => {
                const holdingsConfig = sectorHoldingsData[sec.ticker] || SECTOR_TOP_HOLDINGS[sec.ticker];
                if (!holdingsConfig || !holdingsConfig.holdings || holdingsConfig.holdings.length === 0) {
                  return null;
                }

                let list = [...holdingsConfig.holdings];
                if (top10SortBy === "perf") {
                  list.sort((a, b) => (b.returns[sectorTimeframe] ?? 0) - (a.returns[sectorTimeframe] ?? 0));
                } else if (top10SortBy === "upside") {
                  list.sort((a, b) => {
                    const highA = a.fiftyTwoWeekHigh || a.price * 1.08;
                    const upA = a.upside52WHighPct !== undefined ? a.upside52WHighPct : (a.price > 0 && highA > a.price ? ((highA - a.price) / a.price) * 100 : 0);
                    const highB = b.fiftyTwoWeekHigh || b.price * 1.08;
                    const upB = b.upside52WHighPct !== undefined ? b.upside52WHighPct : (b.price > 0 && highB > b.price ? ((highB - b.price) / b.price) * 100 : 0);
                    return upB - upA;
                  });
                } else {
                  list.sort((a, b) => b.weight - a.weight);
                }

                const top10 = list.slice(0, 10);
                const maxWeight = Math.max(...top10.map((h) => h.weight), 1);
                const totalTop10Weight = top10.reduce((sum, h) => sum + h.weight, 0);
                const avgReturn = top10.reduce((sum, h) => sum + (h.returns[sectorTimeframe] ?? 0), 0) / (top10.length || 1);

                const avgUpside = top10.reduce((sum, h) => {
                  const high52 = h.fiftyTwoWeekHigh || Math.round(h.price * 1.08 * 100) / 100;
                  const up = h.upside52WHighPct !== undefined ? h.upside52WHighPct : (h.price > 0 && high52 > h.price ? ((high52 - h.price) / h.price) * 100 : 0);
                  return sum + up;
                }, 0) / (top10.length || 1);

                const byPerf = [...top10].sort((a, b) => (b.returns[sectorTimeframe] ?? 0) - (a.returns[sectorTimeframe] ?? 0));
                const leader = byPerf[0];
                const laggard = byPerf[byPerf.length - 1];

                return (
                  <div className="my-2 p-3 sm:p-4 bg-slate-900/95 border border-amber-500/40 rounded-2xl shadow-2xl relative overflow-hidden transition-all backdrop-blur-md">
                    {/* Top accent glow line */}
                    <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-amber-500/10 via-amber-400 to-amber-500/10" />

                    {/* Header bar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-800/80">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span className="font-mono text-xs font-black px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-xs">
                          {sec.ticker}
                        </span>
                        <span className="text-white font-bold text-xs sm:text-sm truncate">
                          {language === "ES" ? sec.nameES : sec.nameEN}
                        </span>
                        <span className="text-[10px] font-mono font-semibold text-slate-300 px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700">
                          {language === "ES" ? "Top 10 por Ponderación (Weight)" : "Top 10 Holdings by Weight"}
                        </span>
                        <span className="text-[10px] font-mono text-amber-400/90 font-medium">
                          ~{totalTop10Weight.toFixed(1)}% {language === "ES" ? "del ETF" : "of ETF"}
                        </span>
                      </div>

                      {/* Controls: Sort toggle + Close */}
                      <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
                        {/* Sort toggle */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setTop10SortBy((prev) => (prev === "weight" ? "perf" : prev === "perf" ? "upside" : "weight"));
                          }}
                          className="px-2 py-0.5 text-[9px] font-mono text-slate-300 bg-slate-800/80 hover:bg-slate-700 border border-slate-700 rounded-md transition-colors cursor-pointer"
                          title={language === "ES" ? "Alternar orden: Peso, Retorno o Upside a Máx 52S" : "Toggle sort: Weight, Return or 52W Upside"}
                        >
                          {language === "ES"
                            ? top10SortBy === "weight"
                              ? "Orden: Peso"
                              : top10SortBy === "perf"
                              ? "Orden: Retorno"
                              : "Orden: Upside 52S"
                            : top10SortBy === "weight"
                              ? "Sort: Weight"
                              : top10SortBy === "perf"
                              ? "Sort: Return"
                              : "Sort: 52W Upside"}
                        </button>

                        {/* Close button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedSectorTicker(null);
                          }}
                          className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                          title={language === "ES" ? "Cerrar panel" : "Close panel"}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Top 10 Table */}
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-800/80 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                            <th className="py-1.5 px-2 w-7 text-center">#</th>
                            <th className="py-1.5 px-2">{language === "ES" ? "Ticker & Empresa" : "Ticker & Company"}</th>
                            <th className="py-1.5 px-2 text-right">{language === "ES" ? "Ponderación (Weight)" : "Weight"}</th>
                            <th className="py-1.5 px-2 text-right">{language === "ES" ? "Precio" : "Price"}</th>
                            <th className="py-1.5 px-2 text-right">
                              {language === "ES" ? `Rendimiento (${sectorTimeframe})` : `Performance (${sectorTimeframe})`}
                            </th>
                            <th className="py-1.5 px-2 text-right hidden sm:table-cell">
                              52wk High
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                          {top10.map((h, idx) => {
                            const ret = h.returns[sectorTimeframe] ?? 0;
                            const isPos = ret >= 0;
                            const weightRatio = Math.min((h.weight / maxWeight) * 100, 100);

                            const high52 = h.fiftyTwoWeekHigh || Math.round(h.price * 1.08 * 100) / 100;
                            const upsideToHighPct = h.upside52WHighPct !== undefined 
                              ? h.upside52WHighPct 
                              : (h.price > 0 && high52 > h.price ? Number((((high52 - h.price) / h.price) * 100).toFixed(1)) : 0);
                            const isAtAth = h.price >= high52 || upsideToHighPct <= 0;

                            return (
                              <tr
                                key={h.symbol}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onSelectTicker) onSelectTicker(h.symbol);
                                }}
                                className="hover:bg-slate-800/40 transition-colors group/row cursor-pointer"
                                title={language === "ES" ? `Explorar fundamentales de ${h.symbol}` : `Explore fundamentals for ${h.symbol}`}
                              >
                                <td className="py-1.5 px-2 font-mono text-[10px] text-slate-500 text-center font-bold">
                                  #{idx + 1}
                                </td>
                                <td className="py-1.5 px-2">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-[11px] font-black text-white bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 group-hover/row:border-amber-500/50 group-hover/row:text-amber-300 transition-colors">
                                      {h.symbol}
                                    </span>
                                    <span className="text-[11px] text-slate-300 truncate max-w-[120px] sm:max-w-[200px]">
                                      {h.name}
                                    </span>
                                    {onSelectTicker && (
                                      <ExternalLink size={10} className="text-slate-500 opacity-0 group-hover/row:opacity-100 transition-opacity" />
                                    )}
                                  </div>
                                </td>
                                <td className="py-1.5 px-2 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <div className="hidden sm:block w-14 h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800/60">
                                      <div
                                        className="h-full bg-gradient-to-r from-amber-500/50 to-amber-400 rounded-full"
                                        style={{ width: `${weightRatio}%` }}
                                      />
                                    </div>
                                    <span className="font-mono text-[11px] font-bold text-slate-200">
                                      {h.weight.toFixed(1)}%
                                    </span>
                                  </div>
                                </td>
                                <td className="py-1.5 px-2 text-right font-mono text-[11px] text-slate-300">
                                  <div className="flex flex-col items-end">
                                    <span>${h.price.toFixed(2)}</span>
                                    {!isAtAth && (
                                      <span className="block sm:hidden text-[9px] text-emerald-400 font-mono mt-0.5 font-semibold">
                                        +{upsideToHighPct.toFixed(1)}%
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-1.5 px-2 text-right font-mono">
                                  <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md font-bold text-[10px] sm:text-[11px] ${
                                    isPos
                                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                      : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                  }`}>
                                    {isPos ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                                    {isPos ? "+" : ""}{ret.toFixed(2)}%
                                  </span>
                                </td>
                                <td className="py-1.5 px-2 text-right font-mono hidden sm:table-cell">
                                  <div className="flex flex-col items-end leading-tight">
                                    <span className="text-[11px] font-bold text-slate-200">
                                      ${high52.toFixed(2)}
                                    </span>
                                    {!isAtAth && (
                                      <span 
                                        className="text-[10px] font-semibold text-emerald-400 mt-0.5"
                                        title={language === "ES" ? `Upside para alcanzar el 52wk High: +${upsideToHighPct.toFixed(1)}%` : `Upside to reach 52wk High: +${upsideToHighPct.toFixed(1)}%`}
                                      >
                                        +{upsideToHighPct.toFixed(1)}%
                                      </span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Summary Footer */}
                    <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2.5 text-[10px] font-mono text-slate-400">
                      <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
                        <div>
                          <span>{language === "ES" ? "Promedio Top 10" : "Top 10 Mean"}: </span>
                          <span className={`font-bold ${avgReturn >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {avgReturn >= 0 ? "+" : ""}{avgReturn.toFixed(2)}%
                          </span>
                        </div>
                        <div>
                          <span>{language === "ES" ? "Upside medio (52S)" : "Avg Upside (52W)"}: </span>
                          <span className="font-bold text-emerald-400">
                            +{avgUpside.toFixed(1)}%
                          </span>
                        </div>
                        {leader && (
                          <div className="flex items-center gap-1">
                            <Flame size={11} className="text-emerald-400" />
                            <span>{language === "ES" ? "Líder" : "Leader"}: </span>
                            <span className="font-bold text-white">{leader.symbol}</span>
                            <span className="text-emerald-400 font-bold">
                              +{(leader.returns[sectorTimeframe] ?? 0).toFixed(2)}%
                            </span>
                          </div>
                        )}
                        {laggard && (
                          <div className="flex items-center gap-1">
                            <TrendingDown size={11} className="text-rose-400" />
                            <span>{language === "ES" ? "Rezago" : "Laggard"}: </span>
                            <span className="font-bold text-white">{laggard.symbol}</span>
                            <span className="text-rose-400 font-bold">
                              {(laggard.returns[sectorTimeframe] ?? 0) >= 0 ? "+" : ""}{(laggard.returns[sectorTimeframe] ?? 0).toFixed(2)}%
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="text-[9px] text-slate-500 flex items-center gap-1">
                        <span>{language === "ES" ? "Fuente: SPDR S&P 500 ETF" : "Source: SPDR S&P 500 ETF"}</span>
                        <span>•</span>
                        <span>{sec.ticker}</span>
                      </div>
                    </div>
                  </div>
                );
              };

              // Reusable Sector Row Renderer
              const renderSectorRow = (sec: SectorItem, isPositive: boolean) => {
                const val = getSectorPct(sec);
                // Scaled to max 65% of track with safe margin to guarantee it never overlaps percentage
                const barWidth = Math.max(Math.min((Math.abs(val) / maxAbsPct) * 65, 65), 3);
                const rsiConfig = getRsiConfig(sec.rsi14);
                const isExpanded = expandedSectorTicker === sec.ticker;

                return (
                  <React.Fragment key={sec.key}>
                    <div
                      onClick={() => setExpandedSectorTicker(isExpanded ? null : sec.ticker)}
                      className={`group flex items-center justify-between gap-2.5 sm:gap-3 text-xs py-2 px-2.5 rounded-xl transition-all cursor-pointer ${
                        isExpanded
                          ? "bg-slate-900 border border-amber-500/50 shadow-lg ring-1 ring-amber-500/20"
                          : "bg-slate-950/30 hover:bg-slate-800/40 border border-slate-800/40 hover:border-slate-700/60"
                      }`}
                    >
                      {/* Left Info: Ticker badge + Sector Name + ETF Price */}
                      <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 sm:w-56 flex-shrink-0">
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedSectorTicker(isExpanded ? null : sec.ticker);
                          }}
                          className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 transition-transform group-hover:scale-105 cursor-pointer ${
                            isPositive
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          }`}
                          title={language === "ES" ? `Click para ver Top 10 tickers de ${sec.ticker}` : `Click to view Top 10 tickers of ${sec.ticker}`}
                        >
                          {sec.ticker}
                        </span>
                        <div className="min-w-0 flex-1 truncate">
                          <span className="text-slate-200 font-semibold block truncate text-xs group-hover:text-white transition-colors">
                            {language === "ES" ? sec.nameES : sec.nameEN}
                          </span>
                        </div>
                        {sec.price && (
                          <span className="hidden sm:inline-block font-mono text-[10px] text-slate-500 text-right">
                            ${sec.price.toFixed(2)}
                          </span>
                        )}
                      </div>

                      {/* Desktop Progress Bar (adjusted max-width and margin to prevent overlap) */}
                      <div className="hidden sm:flex flex-1 max-w-[160px] md:max-w-[210px] lg:max-w-[260px] mx-3 sm:mx-4 h-2 bg-slate-950 rounded-full overflow-hidden relative border border-slate-800/40">
                        <div
                          className={`h-full rounded-full transition-all duration-500 shadow-sm ${
                            isPositive
                              ? "bg-gradient-to-r from-emerald-500/40 to-emerald-400 ml-auto"
                              : "bg-gradient-to-r from-rose-400 to-rose-500/40 mr-auto"
                          }`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>

                      {/* Metrics right: % Return + RSI Gauge + Sentiment + Top 10 indicator */}
                      <div className="w-auto sm:w-60 flex items-center justify-end gap-2 sm:gap-2.5 flex-shrink-0 pl-1">
                        <span className={`font-mono font-bold min-w-[56px] text-right text-xs ${isPositive ? "text-emerald-400" : "text-rose-400"}`}>
                          {isPositive ? "+" : ""}{val.toFixed(2)}%
                        </span>

                        {/* RSI Badge */}
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] text-slate-500 font-mono">RSI</span>
                          <span className={`font-mono font-bold text-[10px] px-1.5 py-0.5 rounded border leading-none ${rsiConfig.badge}`}>
                            {sec.rsi14.toFixed(1)}
                          </span>
                        </div>

                        <span className={`text-[10px] font-bold uppercase tracking-wider font-mono w-16 text-right hidden sm:inline-block ${rsiConfig.text}`}>
                          {rsiConfig.label}
                        </span>

                        {/* Top 10 Expand/Collapse indicator */}
                        <div className="pl-1 flex-shrink-0">
                          <span className={`inline-flex items-center gap-0.5 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border transition-all ${
                            isExpanded
                              ? "bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-xs"
                              : "bg-slate-900/60 text-slate-400 border-slate-800 group-hover:text-slate-200 group-hover:border-slate-700"
                          }`}>
                            <span>Top 10</span>
                            {isExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Expandable Top 10 Box */}
                    {isExpanded && renderSectorTop10Box(sec)}
                  </React.Fragment>
                );
              };

              // VIEW: BARS (RANKING)
              const positiveSectors = displayed.filter((s) => getSectorPct(s) >= 0).sort((a, b) => getSectorPct(b) - getSectorPct(a));
              const negativeSectors = displayed.filter((s) => getSectorPct(s) < 0).sort((a, b) => getSectorPct(a) - getSectorPct(b));

              return (
                <div className="space-y-5">
                  {/* Positive Sectors */}
                  {positiveSectors.length > 0 && (
                    <div>
                      <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-2.5 px-1 flex items-center gap-1.5 font-mono">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
                        <span>{language === "ES" ? "Sectores en Alza" : "Advancing Sectors"}</span>
                        <span className="text-slate-500 font-normal">({positiveSectors.length})</span>
                      </div>
                      <div className="space-y-1.5">
                        {positiveSectors.map((sec) => renderSectorRow(sec, true))}
                      </div>
                    </div>
                  )}

                  {/* Negative Sectors */}
                  {negativeSectors.length > 0 && (
                    <div className="pt-2">
                      <div className="text-[10px] font-bold text-rose-400 uppercase tracking-wider mb-2.5 px-1 flex items-center gap-1.5 font-mono">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-sm shadow-rose-500/50" />
                        <span>{language === "ES" ? "Sectores en Baja" : "Declining Sectors"}</span>
                        <span className="text-slate-500 font-normal">({negativeSectors.length})</span>
                      </div>
                      <div className="space-y-1.5">
                        {negativeSectors.map((sec) => renderSectorRow(sec, false))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Commodities & Crypto */}
        <div className="market-panel-card bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-2xl flex flex-col justify-between hover:border-slate-800 transition-all">
          <div>
            <div className="flex items-center gap-2.5 mb-5 border-b border-slate-800/60 pb-4">
              <div className="w-9 h-9 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                <Coins className="text-blue-400" size={18} />
              </div>
              <div>
                <h3 className="font-display font-bold text-xs sm:text-sm text-white tracking-wide uppercase">
                  {language === "ES" ? "Materias Primas y Crypto" : "Commodities & Crypto"}
                </h3>
                <p className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5">
                  {language === "ES" ? "Activos alternativos globales" : "Global alternative assets"}
                </p>
              </div>
            </div>
            
            {/* Commodities Sub-group */}
            <div className="mb-6">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3 px-1 flex items-center justify-between font-mono">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span className="text-slate-300">{language === "ES" ? "Materias Primas" : "Commodities"}</span>
                </div>
                <span className="text-[9px] text-slate-500 font-normal">
                  {language === "ES" ? "% ATH / Máx 52S" : "% of ATH / 52W"}
                </span>
              </div>
              <div className="space-y-1.5">
                {marketData.commodities.map((item, idx) => {
                  const isPos = item.pct >= 0;
                  const athPct = item.athScorePct ?? 85;
                  return (
                    <div 
                      key={`${item.symbol}-${idx}`} 
                      className="py-2 px-2.5 bg-slate-950/30 hover:bg-slate-800/40 border border-slate-800/40 hover:border-slate-700/60 rounded-xl transition-all group"
                    >
                      <div className="flex items-center justify-between text-xs gap-2">
                        <div className="min-w-0 flex-1 flex items-center gap-2">
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 flex-shrink-0">
                            {item.symbol}
                          </span>
                          <span className="text-slate-200 font-semibold block text-xs leading-tight truncate group-hover:text-white transition-colors">
                            {language === "ES" ? item.nameES : item.nameEN}
                          </span>
                        </div>
                        <div className="text-right font-mono flex items-center gap-2 flex-shrink-0">
                          <span className="text-slate-200 font-bold block text-xs leading-none">${item.price}</span>
                          <span className={`text-[11px] font-bold min-w-[52px] text-right ${isPos ? "text-emerald-400" : "text-rose-400"}`}>
                            {isPos ? "+" : ""}{item.pct.toFixed(2)}%
                          </span>
                        </div>
                      </div>

                      {/* ATH Visual Progress Bar */}
                      <div className="mt-1.5 pt-1 flex items-center justify-between gap-2.5 text-[10px] font-mono">
                        <div className="flex-1 h-1.5 bg-slate-950 rounded-full overflow-hidden relative border border-slate-800/50 shadow-inner">
                          <div
                            className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400 shadow-sm"
                            style={{ width: `${Math.max(4, Math.min(100, athPct))}%` }}
                          />
                        </div>
                        <div className="flex items-center gap-1 text-[9px] text-slate-400 flex-shrink-0">
                          <span className="text-slate-500 font-medium">ATH:</span>
                          <span className="text-emerald-400 font-bold">{athPct}%</span>
                          {item.highFormatted && (
                            <span className="text-slate-500 hidden sm:inline">(${item.highFormatted})</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Crypto Sub-group */}
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3 pt-4 border-t border-slate-800/30 px-1 flex items-center justify-between font-mono">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  <span className="text-slate-300">{language === "ES" ? "Criptomonedas" : "Cryptocurrencies"}</span>
                </div>
                <span className="text-[9px] text-slate-500 font-normal">
                  {language === "ES" ? "% ATH / Máx 52S" : "% of ATH / 52W"}
                </span>
              </div>
              <div className="space-y-1.5">
                {marketData.cryptos.map((item, idx) => {
                  const isPos = item.pct >= 0;
                  const athPct = item.athScorePct ?? 80;
                  return (
                    <div 
                      key={`${item.symbol}-${idx}`} 
                      className="py-2 px-2.5 bg-slate-950/30 hover:bg-slate-800/40 border border-slate-800/40 hover:border-slate-700/60 rounded-xl transition-all group"
                    >
                      <div className="flex items-center justify-between text-xs gap-2">
                        <div className="min-w-0 flex-1 flex items-center gap-2">
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 flex-shrink-0">
                            {item.symbol}
                          </span>
                          <span className="text-slate-200 font-semibold block text-xs leading-tight truncate group-hover:text-white transition-colors">
                            {language === "ES" ? item.nameES : item.nameEN}
                          </span>
                        </div>
                        <div className="text-right font-mono flex items-center gap-2 flex-shrink-0">
                          <span className="text-slate-200 font-bold block text-xs leading-none">
                            {item.symbol.includes("USD") ? "$" : ""}{item.price}
                          </span>
                          <span className={`text-[11px] font-bold min-w-[52px] text-right ${isPos ? "text-emerald-400" : "text-rose-400"}`}>
                            {isPos ? "+" : ""}{item.pct.toFixed(2)}%
                          </span>
                        </div>
                      </div>

                      {/* ATH Visual Progress Bar */}
                      <div className="mt-1.5 pt-1 flex items-center justify-between gap-2.5 text-[10px] font-mono">
                        <div className="flex-1 h-1.5 bg-slate-950 rounded-full overflow-hidden relative border border-slate-800/50 shadow-inner">
                          <div
                            className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400 shadow-sm"
                            style={{ width: `${Math.max(4, Math.min(100, athPct))}%` }}
                          />
                        </div>
                        <div className="flex items-center gap-1 text-[9px] text-slate-400 flex-shrink-0">
                          <span className="text-slate-500 font-medium">ATH:</span>
                          <span className="text-emerald-400 font-bold">{athPct}%</span>
                          {item.highFormatted && (
                            <span className="text-slate-500 hidden sm:inline">(${item.highFormatted})</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>

          <div className="text-[10px] text-slate-500 font-mono border-t border-slate-800/40 pt-3 mt-6 text-center">
            Updated: {new Date().toLocaleTimeString()}
          </div>
        </div>
      </div>
    </div>
  );
}
