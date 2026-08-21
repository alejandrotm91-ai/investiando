import React, { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, RefreshCw, Activity, ArrowUpRight, ArrowDownRight, Globe, Zap, Award, Coins, ArrowUp, ArrowDown, Briefcase, Plus } from "lucide-react";
import { getMarketStatus } from "../utils/market";
import { PortfolioData, Holding } from "../types";

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
              {isPositive ? "+" : ""}{change}
            </span>
            <span className={`inline-flex items-center gap-0.5 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
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
}

function PortfolioIndexCard({
  portfolioData,
  holdings,
  language,
  theme,
  onNavigate,
  onOpenEdit
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
          if (onOpenEdit) onOpenEdit();
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
}

export default function MarketDashboard({ 
  language, 
  theme,
  portfolioData,
  holdings,
  onNavigateToPortfolio,
  onOpenEditHoldings
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
    pct: number;
    rsi14: number;
    sentiment: string;
    sentimentES: string;
  }

  const [sectors, setSectors] = useState<SectorItem[]>([
    { key: "technology", ticker: "XLK", nameEN: "Technology", nameES: "Tecnología", pct: 1.85, rsi14: 68.4, sentiment: "Bullish", sentimentES: "Alcista" },
    { key: "communications", ticker: "XLC", nameEN: "Communications", nameES: "Comunicaciones", pct: 1.20, rsi14: 62.1, sentiment: "Bullish", sentimentES: "Alcista" },
    { key: "healthcare", ticker: "XLV", nameEN: "Healthcare", nameES: "Salud", pct: 0.45, rsi14: 51.3, sentiment: "Neutral", sentimentES: "Neutral" },
    { key: "financials", ticker: "XLF", nameEN: "Financials", nameES: "Finanzas", pct: -0.12, rsi14: 48.7, sentiment: "Neutral", sentimentES: "Neutral" },
    { key: "energy", ticker: "XLE", nameEN: "Energy", nameES: "Energía", pct: -0.82, rsi14: 38.5, sentiment: "Bearish", sentimentES: "Bajista" },
    { key: "utilities", ticker: "XLU", nameEN: "Utilities", nameES: "Servicios Públicos", pct: -1.35, rsi14: 28.2, sentiment: "Oversold", sentimentES: "Sobrevendido" },
    { key: "discretionary", ticker: "XLY", nameEN: "Consumer Discretionary", nameES: "Consumo Discrecional", pct: 0.95, rsi14: 58.1, sentiment: "Bullish", sentimentES: "Alcista" },
    { key: "staples", ticker: "XLP", nameEN: "Consumer Staples", nameES: "Consumo Básico", pct: -0.25, rsi14: 44.2, sentiment: "Bearish", sentimentES: "Bajista" },
    { key: "industrials", ticker: "XLI", nameEN: "Industrials", nameES: "Industriales", pct: 0.70, rsi14: 56.4, sentiment: "Bullish", sentimentES: "Alcista" },
    { key: "materials", ticker: "XLB", nameEN: "Materials", nameES: "Materiales", pct: -0.40, rsi14: 41.9, sentiment: "Bearish", sentimentES: "Bajista" },
    { key: "realestate", ticker: "XLRE", nameEN: "Real Estate", nameES: "Bienes Raíces", pct: -1.10, rsi14: 32.1, sentiment: "Bearish", sentimentES: "Bajista" }
  ]);
  const [sectorsLoading, setSectorsLoading] = useState(false);

  const [indices, setIndices] = useState<any[]>([
    { 
      nameEN: "VIX", 
      nameES: "VIX", 
      symbol: "^VIX", 
      price: "14.95", 
      change: "-0.63", 
      changePct: -3.39, 
      highFormatted: "35.00",
      athScorePct: 42.7,
      distToHighPct: 57.3,
      sparkline: [40, 38, 35, 30, 28, 32, 35, 38, 30, 25, 22] 
    },
    { 
      nameEN: "S&P500", 
      nameES: "S&P500", 
      symbol: "^GSPC", 
      price: "5,842.48", 
      change: "+40.50", 
      changePct: 0.55, 
      highFormatted: "6,100.00",
      athScorePct: 95.8,
      distToHighPct: 4.2,
      sparkline: [10, 15, 12, 18, 25, 20, 30, 42, 38, 48, 50] 
    },
    { 
      nameEN: "NASDAQ", 
      nameES: "NASDAQ", 
      symbol: "^IXIC", 
      price: "18,419.21", 
      change: "+143.38", 
      changePct: 0.57, 
      highFormatted: "20,200.00",
      athScorePct: 91.2,
      distToHighPct: 8.8,
      sparkline: [5, 12, 18, 15, 28, 24, 38, 42, 35, 52, 60] 
    },
    { 
      nameEN: "DOW", 
      nameES: "DOW", 
      symbol: "^DJI", 
      price: "42,452.74", 
      change: "+505.49", 
      changePct: 0.97, 
      highFormatted: "45,200.00",
      athScorePct: 93.9,
      distToHighPct: 6.1,
      sparkline: [20, 22, 18, 25, 22, 28, 24, 32, 28, 30, 35] 
    },
  ]);
  const [indicesLoading, setIndicesLoading] = useState(false);

  const [marketData, setMarketData] = useState<{ commodities: any[]; cryptos: any[] }>({
    commodities: [
      { nameEN: "Gold", nameES: "Oro", symbol: "GC=F", price: "2,432.10", pct: 0.45 },
      { nameEN: "Silver", nameES: "Plata", symbol: "SI=F", price: "29.50", pct: 0.85 },
      { nameEN: "Copper", nameES: "Cobre", symbol: "HG=F", price: "4.45", pct: 0.15 },
      { nameEN: "Crude Oil", nameES: "Petróleo Crudo", symbol: "CL=F", price: "78.25", pct: -1.25 },
      { nameEN: "Natural Gas", nameES: "Gas Natural", symbol: "NG=F", price: "2.15", pct: 3.40 },
    ],
    cryptos: [
      { nameEN: "Bitcoin", nameES: "Bitcoin", symbol: "BTC-USD", price: "64,281.00", pct: 2.26 },
      { nameEN: "Ethereum", nameES: "Ethereum", symbol: "ETH-USD", price: "3,492.30", pct: 3.71 },
    ]
  });
  const [marketDataLoading, setMarketDataLoading] = useState(false);

  const fetchSectors = async () => {
    setSectorsLoading(true);
    try {
      const response = await fetch("/api/market/sectors");
      const data = await response.json();
      if (Array.isArray(data)) {
        setSectors(data);
      }
    } catch (err) {
      console.error("Error loading sectors:", err);
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
      const data = await response.json();
      if (Array.isArray(data)) {
        setIndices(data);
      }
    } catch (err) {
      console.error("Error loading indices:", err);
    } finally {
      setIndicesLoading(false);
    }
  };

  const fetchMarketData = async () => {
    setMarketDataLoading(true);
    try {
      const response = await fetch("/api/market/commodities-crypto");
      const data = await response.json();
      if (data && data.commodities && data.cryptos) {
        setMarketData(data);
      }
    } catch (err) {
      console.error("Error loading commodities and crypto:", err);
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
    const interval = setInterval(updateMarketState, 30000);
    return () => clearInterval(interval);
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
    await Promise.all([fetchSectors(), fetchIndices(), fetchMarketData()]);
    setRefreshing(false);
  };

  return (
    <div className="space-y-6">
      {/* Title block */}
      <div className="market-header-card flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-2xl">
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
        {/* Sector Health (Col-span-2) */}
        <div className="market-panel-card lg:col-span-2 bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-2xl flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-5 border-b border-slate-800/60 pb-4">
              <div className="w-9 h-9 rounded-full bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                <Zap className="text-amber-400" size={18} />
              </div>
              <div>
                <h3 className="font-display font-bold text-xs sm:text-sm text-white tracking-wide uppercase">
                  {t.sectorHealth}
                </h3>
                <p className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5">
                  {language === "ES" ? "Ordenados por rendimiento acumulado diario y niveles de sobrecompra o sobreventa" : "Sorted by daily cumulative returns and oversold/overbought levels"}
                </p>
              </div>
            </div>
            
            <div className="space-y-6">
              {/* Green Group */}
              <div>
                <div className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-3 px-1 flex items-center gap-1.5 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {language === "ES" ? "Sectores en Alza" : "Sectors in Green"}
                </div>
                <div className="space-y-1">
                  {sectors
                    .filter((s) => s.pct >= 0)
                    .sort((a, b) => b.pct - a.pct)
                    .map((sec) => {
                      const barWidth = Math.min(Math.abs(sec.pct) * 20, 100);
                      const rsiVal = sec.rsi14;

                      // Style based on RSI thresholds
                      let rsiBadgeColor = "text-slate-400 bg-slate-900/40 border-slate-800/40";
                      let rsiTextColor = "text-slate-400";
                      if (rsiVal > 70) {
                        rsiBadgeColor = "text-amber-400 bg-amber-500/10 border-amber-500/20";
                        rsiTextColor = "text-amber-400 font-bold";
                      } else if (rsiVal < 30) {
                        rsiBadgeColor = "text-purple-400 bg-purple-500/10 border-purple-500/20";
                        rsiTextColor = "text-purple-400 font-bold";
                      } else if (rsiVal > 55) {
                        rsiBadgeColor = "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
                        rsiTextColor = "text-emerald-400 font-bold";
                      } else if (rsiVal < 45) {
                        rsiBadgeColor = "text-rose-400 bg-rose-500/10 border-rose-500/20";
                        rsiTextColor = "text-rose-400 font-bold";
                      }

                      return (
                        <div key={sec.key} className="flex items-center justify-between gap-2 sm:gap-3 text-xs py-2.5 border-b border-slate-800/20 last:border-0 hover:bg-slate-800/20 px-2 rounded-xl transition-colors">
                          <div className="flex items-center gap-2 min-w-0 flex-1 sm:flex-initial sm:w-36 flex-shrink-0">
                            {/* Mobile green arrow indicator */}
                            <span className="sm:hidden flex items-center justify-center w-5 h-5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex-shrink-0">
                              <ArrowUp size={12} className="stroke-[3]" />
                            </span>
                            <span className="text-slate-200 font-semibold block truncate text-xs">
                              {language === "ES" ? sec.nameES : sec.nameEN}
                            </span>
                          </div>

                          {/* Desktop Bar Visualizer */}
                          <div className="hidden sm:flex flex-1 h-2 bg-slate-950 rounded-full overflow-hidden relative border border-slate-800/40">
                            <div 
                              className="h-full rounded-full transition-all duration-500 bg-emerald-500/85 ml-auto"
                              style={{ 
                                width: `${barWidth}%`,
                                transform: `scaleX(1)`
                              }}
                            />
                          </div>

                          {/* Metrics on the right side */}
                          <div className="w-auto sm:w-44 flex items-center justify-end gap-2 sm:gap-3 flex-shrink-0">
                            <span className="font-mono font-bold w-12 sm:w-14 text-right text-xs text-emerald-400">
                              +{sec.pct.toFixed(2)}%
                            </span>

                            {/* RSI 14D Badge */}
                            <div className="flex items-center gap-1">
                              <span className="text-[9px] text-slate-500 font-mono uppercase">RSI</span>
                              <span className={`font-mono font-bold text-[10px] px-1.5 sm:px-2 py-0.5 rounded border leading-none ${rsiBadgeColor}`}>
                                {rsiVal.toFixed(1)}
                              </span>
                            </div>

                            <span className={`text-[10px] font-black uppercase tracking-wider font-mono w-14 text-right hidden sm:inline-block ${rsiTextColor}`}>
                              {language === "ES" ? sec.sentimentES : sec.sentiment}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Red Group */}
              <div>
                <div className="text-[10px] font-bold text-rose-500 uppercase tracking-wider mb-3 pt-4 border-t border-slate-800/30 px-1 flex items-center gap-1.5 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  {language === "ES" ? "Sectores en Baja" : "Sectors in Red"}
                </div>
                <div className="space-y-1">
                  {sectors
                    .filter((s) => s.pct < 0)
                    .sort((a, b) => a.pct - b.pct)
                    .map((sec) => {
                      const barWidth = Math.min(Math.abs(sec.pct) * 20, 100);
                      const rsiVal = sec.rsi14;

                      // Style based on RSI thresholds
                      let rsiBadgeColor = "text-slate-400 bg-slate-900/40 border-slate-800/40";
                      let rsiTextColor = "text-slate-400";
                      if (rsiVal > 70) {
                        rsiBadgeColor = "text-amber-400 bg-amber-500/10 border-amber-500/20";
                        rsiTextColor = "text-amber-400 font-bold";
                      } else if (rsiVal < 30) {
                        rsiBadgeColor = "text-purple-400 bg-purple-500/10 border-purple-500/20";
                        rsiTextColor = "text-purple-400 font-bold";
                      } else if (rsiVal > 55) {
                        rsiBadgeColor = "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
                        rsiTextColor = "text-emerald-400 font-bold";
                      } else if (rsiVal < 45) {
                        rsiBadgeColor = "text-rose-400 bg-rose-500/10 border-rose-500/20";
                        rsiTextColor = "text-rose-400 font-bold";
                      }

                      return (
                        <div key={sec.key} className="flex items-center justify-between gap-2 sm:gap-3 text-xs py-2.5 border-b border-slate-800/20 last:border-0 hover:bg-slate-800/20 px-2 rounded-xl transition-colors">
                          <div className="flex items-center gap-2 min-w-0 flex-1 sm:flex-initial sm:w-36 flex-shrink-0">
                            {/* Mobile red arrow indicator */}
                            <span className="sm:hidden flex items-center justify-center w-5 h-5 rounded-md bg-rose-500/15 text-rose-400 border border-rose-500/30 flex-shrink-0">
                              <ArrowDown size={12} className="stroke-[3]" />
                            </span>
                            <span className="text-slate-200 font-semibold block truncate text-xs">
                              {language === "ES" ? sec.nameES : sec.nameEN}
                            </span>
                          </div>

                          {/* Desktop Bar Visualizer */}
                          <div className="hidden sm:flex flex-1 h-2 bg-slate-950 rounded-full overflow-hidden relative border border-slate-800/40">
                            <div 
                              className="h-full rounded-full transition-all duration-500 bg-rose-500/85 mr-auto"
                              style={{ 
                                width: `${barWidth}%`,
                                transform: `scaleX(1)`
                              }}
                            />
                          </div>

                          {/* Metrics on the right side */}
                          <div className="w-auto sm:w-44 flex items-center justify-end gap-2 sm:gap-3 flex-shrink-0">
                            <span className="font-mono font-bold w-12 sm:w-14 text-right text-xs text-rose-400">
                              {sec.pct.toFixed(2)}%
                            </span>

                            {/* RSI 14D Badge */}
                            <div className="flex items-center gap-1">
                              <span className="text-[9px] text-slate-500 font-mono uppercase">RSI</span>
                              <span className={`font-mono font-bold text-[10px] px-1.5 sm:px-2 py-0.5 rounded border leading-none ${rsiBadgeColor}`}>
                                {rsiVal.toFixed(1)}
                              </span>
                            </div>

                            <span className={`text-[10px] font-black uppercase tracking-wider font-mono w-14 text-right hidden sm:inline-block ${rsiTextColor}`}>
                              {language === "ES" ? sec.sentimentES : sec.sentiment}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
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
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3 px-1 flex items-center gap-1.5 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                {language === "ES" ? "Materias Primas" : "Commodities"}
              </div>
              <div className="space-y-1">
                {marketData.commodities.map((item, idx) => {
                  const isPos = item.pct >= 0;
                  return (
                    <div key={`${item.symbol}-${idx}`} className="flex items-center justify-between text-xs py-2.5 border-b border-slate-800/20 last:border-0 px-2 hover:bg-slate-800/20 rounded-xl transition-colors">
                      <div>
                        <span className="text-slate-200 font-semibold block text-xs leading-tight">
                          {language === "ES" ? item.nameES : item.nameEN}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono mt-1 block">{item.symbol}</span>
                      </div>
                      <div className="text-right font-mono">
                        <span className="text-slate-200 font-bold block text-xs leading-none">{item.price}</span>
                        <span className={`text-[11px] font-bold mt-1.5 block ${isPos ? "text-emerald-400" : "text-rose-400"}`}>
                          {isPos ? "+" : ""}{item.pct.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Crypto Sub-group */}
            <div>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3 pt-4 border-t border-slate-800/30 px-1 flex items-center gap-1.5 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                {language === "ES" ? "Criptomonedas" : "Cryptocurrencies"}
              </div>
              <div className="space-y-1">
                {marketData.cryptos.map((item, idx) => {
                  const isPos = item.pct >= 0;
                  return (
                    <div key={`${item.symbol}-${idx}`} className="flex items-center justify-between text-xs py-2.5 border-b border-slate-800/20 last:border-0 px-2 hover:bg-slate-800/20 rounded-xl transition-colors">
                      <div>
                        <span className="text-slate-200 font-semibold block text-xs leading-tight">
                          {language === "ES" ? item.nameES : item.nameEN}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono mt-1 block">{item.symbol}</span>
                      </div>
                      <div className="text-right font-mono">
                        <span className="text-slate-200 font-bold block text-xs leading-none">
                          {item.symbol.includes("USD") ? "$" : ""}{item.price}
                        </span>
                        <span className={`text-[11px] font-bold mt-1.5 block ${isPos ? "text-emerald-400" : "text-rose-400"}`}>
                          {isPos ? "+" : ""}{item.pct.toFixed(2)}%
                        </span>
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
