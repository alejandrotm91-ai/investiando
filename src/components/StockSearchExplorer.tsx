import React, { useState, useEffect, useMemo, useRef } from "react";
import { 
  Search, 
  TrendingUp, 
  TrendingDown, 
  Building2, 
  Globe, 
  Users, 
  MapPin, 
  DollarSign, 
  BarChart3, 
  Activity, 
  Award, 
  ExternalLink, 
  RefreshCw, 
  Plus, 
  Check, 
  Calendar, 
  FileText, 
  Layers, 
  ShieldCheck, 
  AlertCircle, 
  Briefcase, 
  Info,
  Clock,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  ChevronDown,
  ChevronUp,
  X,
  Scale,
  SlidersHorizontal,
  Flame,
  FileSpreadsheet
} from "lucide-react";
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  Line,
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  ReferenceLine,
  Legend
} from "recharts";
import { CompanyLogo, getTickerSector, getSectorSpanish, getSectorColor, getTypeBadgeConfig } from "./HoldingsTable";
import { CompanyFinancials } from "./CompanyFinancials";
import SingleStockBogleAnalysis from "./SingleStockBogleAnalysis";
import ThreeStatementModel from "./ThreeStatementModel";
import { SearchResult } from "../types";
import { saveUserCloudData, subscribeUserCloudData } from "../lib/cloudData";
import { getRawFeatures, buildScores, overrideFeaturesWithFinancials, ScoredRow } from "../utils/engine";

interface StockDetails {
  symbol: string;
  yahooSymbol?: string;
  name: string;
  exchange: string;
  currency: string;
  price: number;
  previousClose: number;
  change: number;
  changePct: number;
  open: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  avgVolume: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  fiftyDayAverage?: number | null;
  twoHundredDayAverage?: number | null;
  marketCap: number;
  enterpriseValue?: number | null;
  beta: number;
  trailingPE?: number | null;
  forwardPE?: number | null;
  pegRatio?: number | null;
  priceToSales?: number | null;
  priceToBook?: number | null;
  evEbitda?: number | null;
  enterpriseToEbitda?: number | null;
  grossMargins?: number | null;
  operatingMargins?: number | null;
  profitMargins?: number | null;
  returnOnEquity?: number | null;
  returnOnAssets?: number | null;
  debtToEquity?: number | null;
  currentRatio?: number | null;
  quickRatio?: number | null;
  totalCash?: number | null;
  totalDebt?: number | null;
  freeCashflow?: number | null;
  operatingCashflow?: number | null;
  totalRevenue?: number | null;
  revenueGrowth?: number | null;
  earningsGrowth?: number | null;
  dividendRate?: number | null;
  dividendYield?: number | null;
  payoutRatio?: number | null;
  exDividendDate?: string | null;
  trailingEps?: number | null;
  forwardEps?: number | null;
  targetLowPrice?: number | null;
  targetMeanPrice?: number | null;
  targetHighPrice?: number | null;
  recommendationKey?: string;
  numberOfAnalystOpinions?: number | null;
  recommendationTrends?: any[];
  nextEarningsDate?: string | null;
  piotroskiScore?: number | null;
  sharesOutstanding?: number | null;
  floatShares?: number | null;
  shortPercentOfFloat?: number | null;
  isAfterHoursPrice?: boolean;
  postMarketPrice?: number | null;
  preMarketPrice?: number | null;
  marketState?: string | null;
  profile: {
    sector: string;
    industry: string;
    description: string;
    website: string;
    country: string;
    city: string;
    employees: number | null;
    officers: Array<{ name: string; title: string; totalPay: number | null; yearBorn: number | null }>;
  };
}

interface NewsItem {
  id: string;
  ticker: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
  sentiment?: "positive" | "negative" | "neutral";
  category?: string;
  impactScore?: number;
}

interface StockSearchExplorerProps {
  language: "EN" | "ES";
  theme: "dark" | "light";
  userEmail?: string;
  initialTicker?: string;
}

// Benchmark indices
interface BenchmarkIndexInfo {
  symbol: string;
  name: string;
  shortName: string;
  fullNameEN: string;
  fullNameES: string;
  descEN: string;
  descES: string;
  color: string;
  price: number;
  change: number;
  changePct: number;
  trailingPE: number;
  forwardPE: number;
  beta: number;
  profitMargin: number;
  dividendYield: number;
}

const DEFAULT_BENCHMARKS: BenchmarkIndexInfo[] = [
  {
    symbol: "SPY",
    name: "S&P 500",
    shortName: "S&P 500",
    fullNameEN: "S&P 500 Index (SPDR SPY)",
    fullNameES: "Índice S&P 500 (SPDR SPY)",
    descEN: "500 largest US public companies",
    descES: "500 mayores empresas cotizadas de EE.UU.",
    color: "#f59e0b",
    price: 562.40,
    change: 3.10,
    changePct: 0.55,
    trailingPE: 27.8,
    forwardPE: 22.1,
    beta: 1.00,
    profitMargin: 12.4,
    dividendYield: 1.25,
  },
  {
    symbol: "QQQ",
    name: "NASDAQ-100",
    shortName: "NASDAQ-100",
    fullNameEN: "NASDAQ-100 Index (Invesco QQQ)",
    fullNameES: "Índice NASDAQ-100 (Invesco QQQ)",
    descEN: "Top 100 non-financial tech leaders",
    descES: "100 líderes globales en innovación tecnológica",
    color: "#38bdf8",
    price: 488.20,
    change: 3.50,
    changePct: 0.72,
    trailingPE: 33.4,
    forwardPE: 26.8,
    beta: 1.18,
    profitMargin: 18.2,
    dividendYield: 0.58,
  },
];

// Popular tickers for quick discovery
const POPULAR_TICKERS = [
  { symbol: "SPY", name: "S&P 500 (SPDR)", isIndex: true },
  { symbol: "QQQ", name: "NASDAQ-100 (QQQ)", isIndex: true },
  { symbol: "NVDA", name: "NVIDIA Corp." },
  { symbol: "AAPL", name: "Apple Inc." },
  { symbol: "MSFT", name: "Microsoft Corp." },
  { symbol: "AMZN", name: "Amazon.com" },
  { symbol: "GOOGL", name: "Alphabet Inc." },
  { symbol: "META", name: "Meta Platforms" },
  { symbol: "TSLA", name: "Tesla Inc." },
  { symbol: "BRK-B", name: "Berkshire Hathaway" },
  { symbol: "LLY", name: "Eli Lilly & Co." },
  { symbol: "PLTR", name: "Palantir Tech" },
  { symbol: "AVGO", name: "Broadcom Inc." },
];

const STORAGE_RECENT_SEARCHES_KEY = "investiando_recent_searches";
const STORAGE_WATCHLIST_KEY = "investiando_watchlist";

export default function StockSearchExplorer({
  language,
  theme,
  userEmail,
  initialTicker = "NVDA"
}: StockSearchExplorerProps) {
  const [selectedTicker, setSelectedTicker] = useState<string>(initialTicker.toUpperCase());
  const [searchInput, setSearchInput] = useState<string>("");

  useEffect(() => {
    if (initialTicker && initialTicker.trim().toUpperCase() !== selectedTicker) {
      setSelectedTicker(initialTicker.trim().toUpperCase());
    }
  }, [initialTicker]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  
  // Stock details state
  const [stockData, setStockData] = useState<StockDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(true);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  // Benchmarks live quotes state
  const [benchmarksData, setBenchmarksData] = useState<BenchmarkIndexInfo[]>(DEFAULT_BENCHMARKS);
  const [loadingBenchmarks, setLoadingBenchmarks] = useState<boolean>(false);

  // Benchmark overlay toggles in chart
  const [compareSP500, setCompareSP500] = useState<boolean>(false);
  const [compareNasdaq, setCompareNasdaq] = useState<boolean>(false);
  const [sp500ChartData, setSp500ChartData] = useState<Array<{ date: string; close: number }>>([]);
  const [nasdaqChartData, setNasdaqChartData] = useState<Array<{ date: string; close: number }>>([]);
  const [loadingBenchmarkChart, setLoadingBenchmarkChart] = useState<boolean>(false);

  // Active sub-tab in Stock View
  const [activeSubTab, setActiveSubTab] = useState<"overview" | "financials" | "threestatements" | "bogle">("overview");

  // Chart timeframe state
  const [chartRange, setChartRange] = useState<"1W" | "1M" | "6M" | "YTD" | "1Y" | "5Y" | "ALL">("1M");
  const [chartData, setChartData] = useState<Array<{ date: string; close: number }>>([]);
  const [loadingChart, setLoadingChart] = useState<boolean>(false);

  // News state
  const [newsList, setNewsList] = useState<NewsItem[]>([]);
  const [loadingNews, setLoadingNews] = useState<boolean>(false);

  // Watchlist state
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [isInWatchlist, setIsInWatchlist] = useState<boolean>(false);

  // Expand company bio toggle
  const [isBioExpanded, setIsBioExpanded] = useState<boolean>(false);

  // Financials data for sector scoring
  const [financialsData, setFinancialsData] = useState<{ annual: any[]; quarterly: any[] } | null>(null);

  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Score color helper functions matching holdings
  const getScoreColorClass = (score: number | null) => {
    if (score === null || isNaN(score) || score === 0) return "text-slate-400";
    if (score >= 75) return "text-emerald-400";
    if (score >= 50) return "text-blue-400";
    if (score >= 35) return "text-amber-400";
    return "text-rose-400";
  };

  const getScoreBgClass = (score: number | null) => {
    if (score === null || isNaN(score) || score === 0) return "bg-slate-800 text-slate-400 border-slate-700";
    if (score >= 75) return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
    if (score >= 50) return "bg-blue-500/10 text-blue-400 border-blue-500/30";
    if (score >= 35) return "bg-amber-500/10 text-amber-400 border-amber-500/30";
    return "bg-rose-500/10 text-rose-400 border-rose-500/30";
  };

  const getScoreHex = (score: number | null) => {
    if (score === null || isNaN(score) || score === 0) return "#64748b";
    if (score >= 75) return "#34d399";
    if (score >= 50) return "#60a5fa";
    if (score >= 35) return "#fbbf24";
    return "#f87171";
  };

  // Load recent searches from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_RECENT_SEARCHES_KEY);
      if (saved) {
        setRecentSearches(JSON.parse(saved));
      } else {
        setRecentSearches(["NVDA", "AAPL", "MSFT", "TSLA"]);
      }
    } catch (e) {
      setRecentSearches(["NVDA", "AAPL", "MSFT", "TSLA"]);
    }
  }, []);

  // Sync Watchlist from Firebase / localStorage
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    if (userEmail) {
      unsubscribe = subscribeUserCloudData(userEmail, (data) => {
        if (data && Array.isArray(data.watchlist)) {
          setWatchlist(data.watchlist);
        }
      });
    } else {
      try {
        const saved = localStorage.getItem(STORAGE_WATCHLIST_KEY);
        if (saved) setWatchlist(JSON.parse(saved));
      } catch (e) {
        // ignore
      }
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [userEmail]);

  // Check if current selectedTicker is in watchlist
  useEffect(() => {
    setIsInWatchlist(watchlist.includes(selectedTicker.toUpperCase()));
  }, [watchlist, selectedTicker]);

  // Handle outside click to close search dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced search query handler
  useEffect(() => {
    if (!searchInput.trim() || searchInput.trim().length < 1) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const query = searchInput.trim();
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
          setIsDropdownOpen(true);
        }
      } catch (err) {
        console.error("Search query failed:", err);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchInput]);

  // Fetch full stock details
  const fetchStockDetails = async (ticker: string) => {
    if (!ticker) return;
    setLoadingDetails(true);
    setErrorDetails(null);
    try {
      const cleanTicker = ticker.trim().toUpperCase();
      const res = await fetch(`/api/stock/${cleanTicker}`);
      if (!res.ok) {
        throw new Error(`Failed to load stock data for ${cleanTicker}`);
      }
      const data: StockDetails = await res.json();
      setStockData(data);
      
      // Update recent searches
      setRecentSearches((prev) => {
        const filtered = prev.filter((s) => s.toUpperCase() !== cleanTicker);
        const updated = [cleanTicker, ...filtered].slice(0, 8);
        try {
          localStorage.setItem(STORAGE_RECENT_SEARCHES_KEY, JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });
    } catch (err: any) {
      console.error("Error loading stock details:", err);
      setErrorDetails(err.message || "Error al cargar la información de la acción");
    } finally {
      setLoadingDetails(false);
    }
  };

  // Fetch chart data
  const fetchChartData = async (ticker: string, range: string) => {
    if (!ticker) return;
    setLoadingChart(true);
    try {
      const cleanTicker = ticker.trim().toUpperCase();
      const res = await fetch(`/api/chart/${cleanTicker}?range=${range}`);
      if (res.ok) {
        const data = await res.json();
        setChartData(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Error loading chart data:", err);
      setChartData([]);
    } finally {
      setLoadingChart(false);
    }
  };

  // Fetch news for the ticker
  const fetchStockNews = async (ticker: string) => {
    if (!ticker) return;
    setLoadingNews(true);
    try {
      const cleanTicker = ticker.trim().toUpperCase();
      const res = await fetch("/api/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tickers: [cleanTicker],
          language,
          filterTicker: cleanTicker
        })
      });
      if (res.ok) {
        const data = await res.json();
        // La API devuelve { news: [...], liveGrounded }; se acepta también una lista directa.
        setNewsList(Array.isArray(data) ? data : Array.isArray(data?.news) ? data.news : []);
      }
    } catch (err) {
      console.error("Error loading stock news:", err);
      setNewsList([]);
    } finally {
      setLoadingNews(false);
    }
  };

  // Fetch live benchmark quotes on mount
  useEffect(() => {
    const fetchLiveBenchmarks = async () => {
      setLoadingBenchmarks(true);
      try {
        const [spyRes, qqqRes] = await Promise.allSettled([
          fetch("/api/stock/SPY"),
          fetch("/api/stock/QQQ"),
        ]);
        
        const updated = [...DEFAULT_BENCHMARKS];
        
        if (spyRes.status === "fulfilled" && spyRes.value.ok) {
          const spyData = await spyRes.value.json();
          if (spyData && spyData.price) {
            updated[0] = {
              ...updated[0],
              price: spyData.price,
              change: spyData.change,
              changePct: spyData.changePct,
              trailingPE: spyData.trailingPE ?? 27.8,
              forwardPE: spyData.forwardPE ?? 22.1,
              beta: spyData.beta ?? 1.0,
              profitMargin: spyData.profitMargins ? spyData.profitMargins * 100 : 12.4,
              dividendYield: spyData.dividendYield ? spyData.dividendYield * 100 : 1.25,
            };
          }
        }

        if (qqqRes.status === "fulfilled" && qqqRes.value.ok) {
          const qqqData = await qqqRes.value.json();
          if (qqqData && qqqData.price) {
            updated[1] = {
              ...updated[1],
              price: qqqData.price,
              change: qqqData.change,
              changePct: qqqData.changePct,
              trailingPE: qqqData.trailingPE ?? 33.4,
              forwardPE: qqqData.forwardPE ?? 26.8,
              beta: qqqData.beta ?? 1.18,
              profitMargin: qqqData.profitMargins ? qqqData.profitMargins * 100 : 18.2,
              dividendYield: qqqData.dividendYield ? qqqData.dividendYield * 100 : 0.58,
            };
          }
        }

        setBenchmarksData(updated);
      } catch (err) {
        console.error("Failed to load live benchmarks:", err);
      } finally {
        setLoadingBenchmarks(false);
      }
    };

    fetchLiveBenchmarks();
  }, []);

  // Fetch benchmark chart data when comparison is active or range changes
  useEffect(() => {
    const fetchBenchmarkCharts = async () => {
      if (!compareSP500 && !compareNasdaq) return;
      setLoadingBenchmarkChart(true);
      try {
        const promises: Promise<any>[] = [];
        if (compareSP500) {
          promises.push(
            fetch(`/api/chart/SPY?range=${chartRange}`)
              .then((r) => r.json())
              .then((data) => setSp500ChartData(Array.isArray(data) ? data : []))
              .catch(() => setSp500ChartData([]))
          );
        } else {
          setSp500ChartData([]);
        }

        if (compareNasdaq) {
          promises.push(
            fetch(`/api/chart/QQQ?range=${chartRange}`)
              .then((r) => r.json())
              .then((data) => setNasdaqChartData(Array.isArray(data) ? data : []))
              .catch(() => setNasdaqChartData([]))
          );
        } else {
          setNasdaqChartData([]);
        }

        await Promise.all(promises);
      } catch (err) {
        console.error("Error loading benchmark charts:", err);
      } finally {
        setLoadingBenchmarkChart(false);
      }
    };

    fetchBenchmarkCharts();
  }, [compareSP500, compareNasdaq, chartRange]);

  // Trigger data loads whenever selectedTicker changes
  useEffect(() => {
    if (selectedTicker) {
      fetchStockDetails(selectedTicker);
      fetchChartData(selectedTicker, chartRange);
      fetchStockNews(selectedTicker);

      // Fetch financials for sector-normalized score
      let isMounted = true;
      const fetchFin = async () => {
        try {
          const res = await fetch("/api/portfolio/financials", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ticker: selectedTicker })
          });
          if (res.ok) {
            const data = await res.json();
            if (isMounted && data && !data.error) {
              const sortFn = (a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime();
              if (Array.isArray(data.annual)) data.annual.sort(sortFn);
              if (Array.isArray(data.quarterly)) data.quarterly.sort(sortFn);
              setFinancialsData(data);
            } else if (isMounted) {
              setFinancialsData(null);
            }
          } else if (isMounted) {
            setFinancialsData(null);
          }
        } catch (e) {
          if (isMounted) setFinancialsData(null);
        }
      };
      fetchFin();

      return () => {
        isMounted = false;
      };
    }
  }, [selectedTicker]);

  // Compute Sector-Normalized Fundamental Score matching holdings and simulator implementation
  const scoredRow = useMemo<ScoredRow | null>(() => {
    if (!stockData) return null;
    const sym = stockData.symbol.toUpperCase();
    const sector = getTickerSector(sym, false) || stockData.profile?.sector || "Technology";
    let raw = { ...getRawFeatures(sym, stockData.name, sector) };

    if (financialsData) {
      raw = overrideFeaturesWithFinancials(raw, financialsData);
    }
    if (stockData.trailingPE !== undefined && stockData.trailingPE !== null) {
      raw.trailing_pe = stockData.trailingPE;
    }
    if (stockData.forwardPE !== undefined && stockData.forwardPE !== null) {
      raw.forward_pe = stockData.forwardPE;
    }
    if (stockData.evEbitda !== undefined && stockData.evEbitda !== null) {
      raw.ev_ebitda = stockData.evEbitda;
    }

    const finMap: Record<string, any> = {};
    if (financialsData) {
      finMap[sym] = financialsData;
    }

    const scored = buildScores([raw], "zscore", finMap);
    return scored[0] || null;
  }, [stockData, financialsData]);

  // Diluted EPS CAGR for Annual Financials (matching Financials Income Statement)
  const basicEpsAnnualCagr = useMemo(() => {
    if (!financialsData?.annual || financialsData.annual.length < 2) {
      return scoredRow?.raw?.eps_cagr ?? null;
    }

    const sortFn = (a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime();
    const sortedAnnual = [...financialsData.annual].sort(sortFn);

    const validCols = sortedAnnual
      .map((col, idx) => ({ col, val: col.dilutedEPS ?? col.basicEPS, idx }))
      .filter(item => typeof item.val === "number" && !isNaN(item.val as number));

    if (validCols.length >= 2) {
      const latestItem = validCols[0];
      if (latestItem.val > 0) {
        const oldestPositive = [...validCols].reverse().find(item => item.val > 0 && item.idx > latestItem.idx);
        if (oldestPositive) {
          const n = oldestPositive.idx - latestItem.idx;
          if (n > 0) {
            return (Math.pow(latestItem.val / oldestPositive.val, 1 / n) - 1) * 100;
          }
        }
      }
    }

    return scoredRow?.raw?.eps_cagr ?? null;
  }, [financialsData, scoredRow]);

  // Shareholder Yield: Dividend Yield (%) + CAGR of Ordinary Shares Number for "Annual" statements in absolute value
  const shareholderYieldData = useMemo(() => {
    if (!stockData) return { total: null, dividendYield: 0, buybackYield: null, sharesCagr: null };

    const divYieldPct = stockData.dividendYield !== undefined && stockData.dividendYield !== null
      ? (stockData.dividendYield > 1 ? stockData.dividendYield : stockData.dividendYield * 100)
      : 0;

    let sharesCagr: number | null = null;
    let buybackYield: number | null = null;

    if (financialsData?.annual && financialsData.annual.length >= 2) {
      const sortFn = (a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime();
      const sortedAnnual = [...financialsData.annual].sort(sortFn);

      const validCols = sortedAnnual
        .map((col, idx) => {
          const val = col.ordinarySharesNumber ?? col.shareIssued;
          return { val, idx };
        })
        .filter(item => typeof item.val === "number" && !isNaN(item.val as number) && item.val > 0);

      if (validCols.length >= 2) {
        const latestItem = validCols[0];
        const oldestPositive = [...validCols].reverse().find(item => item.val > 0 && item.idx > latestItem.idx);
        if (oldestPositive && latestItem.val > 0) {
          const n = oldestPositive.idx - latestItem.idx;
          if (n > 0) {
            sharesCagr = (Math.pow(latestItem.val / oldestPositive.val, 1 / n) - 1) * 100;
            buybackYield = Math.abs(sharesCagr);
          }
        }
      }
    }

    const total = buybackYield !== null ? divYieldPct + buybackYield : (divYieldPct > 0 ? divYieldPct : null);

    return {
      total,
      dividendYield: divYieldPct,
      buybackYield,
      sharesCagr
    };
  }, [stockData, financialsData]);

  // Reload chart on range change
  useEffect(() => {
    if (selectedTicker) {
      fetchChartData(selectedTicker, chartRange);
    }
  }, [chartRange]);

  const handleSelectTicker = (ticker: string) => {
    const upper = ticker.trim().toUpperCase();
    setSelectedTicker(upper);
    setSearchInput("");
    setSearchResults([]);
    setIsDropdownOpen(false);
  };

  const handleToggleWatchlist = async () => {
    if (!selectedTicker) return;
    const ticker = selectedTicker.toUpperCase();
    let updated: string[];
    if (watchlist.includes(ticker)) {
      updated = watchlist.filter((t) => t !== ticker);
    } else {
      updated = [...watchlist, ticker];
    }
    setWatchlist(updated);
    try {
      localStorage.setItem(STORAGE_WATCHLIST_KEY, JSON.stringify(updated));
    } catch (e) {}

    if (userEmail) {
      await saveUserCloudData(userEmail, { watchlist: updated });
    }
  };

  // Calculations for chart return and trends
  const chartPerformance = useMemo(() => {
    if (!chartData || chartData.length < 2) return { changePct: 0, isPositive: true, startVal: 0, endVal: 0 };
    const firstClose = chartData[0]?.close || 0;
    const lastClose = chartData[chartData.length - 1]?.close || 0;
    if (firstClose === 0) return { changePct: 0, isPositive: true, startVal: firstClose, endVal: lastClose };
    const change = lastClose - firstClose;
    const changePct = Number(((change / firstClose) * 100).toFixed(2));
    return {
      change,
      changePct,
      isPositive: changePct >= 0,
      startVal: firstClose,
      endVal: lastClose
    };
  }, [chartData]);

  // Combined chart data when comparing with S&P 500 and/or NASDAQ-100
  const isComparing = compareSP500 || compareNasdaq;

  const combinedChartData = useMemo(() => {
    if (!chartData || chartData.length === 0) return [];
    
    if (!isComparing) {
      return chartData.map((d) => ({
        date: d.date,
        close: d.close,
        stockPrice: d.close,
      }));
    }

    const baseStock = chartData[0]?.close || 1;
    const baseSP500 = sp500ChartData.length > 0 ? sp500ChartData[0]?.close || 1 : 1;
    const baseNasdaq = nasdaqChartData.length > 0 ? nasdaqChartData[0]?.close || 1 : 1;

    const sp500Map = new Map<string, number>();
    sp500ChartData.forEach((d) => sp500Map.set(d.date, d.close));

    const nasdaqMap = new Map<string, number>();
    nasdaqChartData.forEach((d) => nasdaqMap.set(d.date, d.close));

    return chartData.map((d, index) => {
      const stockReturn = baseStock > 0 ? Number((((d.close - baseStock) / baseStock) * 100).toFixed(2)) : 0;
      
      // Look up SPY price by date or relative index fallback
      const spClose = sp500Map.get(d.date) ?? sp500ChartData[index]?.close;
      const sp500Return = compareSP500 && spClose && baseSP500 > 0 
        ? Number((((spClose - baseSP500) / baseSP500) * 100).toFixed(2)) 
        : undefined;

      // Look up QQQ price by date or relative index fallback
      const ndxClose = nasdaqMap.get(d.date) ?? nasdaqChartData[index]?.close;
      const nasdaqReturn = compareNasdaq && ndxClose && baseNasdaq > 0 
        ? Number((((ndxClose - baseNasdaq) / baseNasdaq) * 100).toFixed(2)) 
        : undefined;

      return {
        date: d.date,
        close: d.close,
        stockPrice: d.close,
        stockReturn,
        sp500Return,
        nasdaqReturn,
      };
    });
  }, [chartData, sp500ChartData, nasdaqChartData, compareSP500, compareNasdaq, isComparing]);

  // Relative benchmark alpha performance calculations
  const benchmarkAlpha = useMemo(() => {
    const stockReturn = chartPerformance.changePct;
    let sp500Return = 0;
    let nasdaqReturn = 0;

    if (sp500ChartData.length >= 2) {
      const first = sp500ChartData[0]?.close || 1;
      const last = sp500ChartData[sp500ChartData.length - 1]?.close || 1;
      sp500Return = Number((((last - first) / first) * 100).toFixed(2));
    } else {
      sp500Return = benchmarksData[0]?.changePct || 0.55;
    }

    if (nasdaqChartData.length >= 2) {
      const first = nasdaqChartData[0]?.close || 1;
      const last = nasdaqChartData[nasdaqChartData.length - 1]?.close || 1;
      nasdaqReturn = Number((((last - first) / first) * 100).toFixed(2));
    } else {
      nasdaqReturn = benchmarksData[1]?.changePct || 0.72;
    }

    return {
      stockReturn,
      sp500Return,
      nasdaqReturn,
      alphaVsSP500: Number((stockReturn - sp500Return).toFixed(2)),
      alphaVsNasdaq: Number((stockReturn - nasdaqReturn).toFixed(2)),
    };
  }, [chartPerformance, sp500ChartData, nasdaqChartData, benchmarksData]);

  // Clean, non-repetitive X-axis ticks for month and year displays
  const chartTicks = useMemo(() => {
    if (!combinedChartData || combinedChartData.length === 0) return undefined;
    const isLongRange = ["6M", "YTD", "1Y", "5Y", "ALL"].includes(chartRange);

    if (isLongRange) {
      if (chartRange === "5Y" || chartRange === "ALL") {
        const monthMap = new Map<string, string>();
        for (const item of combinedChartData) {
          if (!item.date) continue;
          const monthKey = item.date.substring(0, 7); // "YYYY-MM"
          monthMap.set(monthKey, item.date);
        }
        const values = Array.from(monthMap.values());
        const step = Math.max(1, Math.floor(values.length / 7));
        return values.filter((_, idx) => idx % step === 0 || idx === values.length - 1);
      } else {
        // 6M, YTD, 1Y: pick exactly one date per month
        const monthMap = new Map<string, string>();
        for (const item of combinedChartData) {
          if (!item.date) continue;
          const monthKey = item.date.substring(0, 7); // "YYYY-MM"
          monthMap.set(monthKey, item.date);
        }
        return Array.from(monthMap.values());
      }
    }

    return undefined;
  }, [combinedChartData, chartRange]);

  // 52-Week Range & Ath Recovery Calculation: 1 - ((high - price) / price)
  const athProgressMetrics = useMemo(() => {
    if (!stockData) return { athScorePct: 50, distToHighPct: 0, high: 0, low: 0 };
    const low = stockData.fiftyTwoWeekLow ?? 0;
    const high = stockData.fiftyTwoWeekHigh ?? stockData.price;
    const cur = stockData.price ?? 0;

    // Dist to high: (high - price) / price
    const distToHighRatio = cur > 0 && high >= cur ? (high - cur) / cur : 0;
    // Score: 1 - ((high - price) / price)
    const score = Math.max(0, 1 - distToHighRatio);

    return {
      athScorePct: Number((score * 100).toFixed(1)),
      distToHighPct: Number((distToHighRatio * 100).toFixed(1)),
      high,
      low,
    };
  }, [stockData]);

  // Formatters
  const formatCurrency = (val?: number | null, decimals = 2) => {
    if (val === undefined || val === null || isNaN(val)) return "—";
    return `$${val.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
  };

  const formatNumber = (val?: number | null, decimals = 2) => {
    if (val === undefined || val === null || isNaN(val)) return "—";
    return val.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  const formatPercent = (val?: number | null, isRatio = false) => {
    if (val === undefined || val === null || isNaN(val)) return "—";
    const actual = isRatio ? val * 100 : val;
    return `${actual >= 0 ? "+" : ""}${actual.toFixed(2)}%`;
  };

  const formatLargeNumber = (val?: number | null) => {
    if (val === undefined || val === null || isNaN(val) || val === 0) return "—";
    const abs = Math.abs(val);
    if (abs >= 1e12) {
      return `$${(val / 1e12).toFixed(2)}T`;
    }
    if (abs >= 1e9) {
      return `$${(val / 1e9).toFixed(2)}B`;
    }
    if (abs >= 1e6) {
      return `$${(val / 1e6).toFixed(2)}M`;
    }
    return `$${val.toLocaleString()}`;
  };

  const formatVolume = (val?: number | null) => {
    if (val === undefined || val === null || isNaN(val) || val === 0) return "—";
    const abs = Math.abs(val);
    if (abs >= 1e9) return `${(val / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${(val / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${(val / 1e3).toFixed(1)}K`;
    return val.toLocaleString();
  };

  const formatDate = (dateStr?: string | number | null) => {
    if (!dateStr || dateStr === "—" || dateStr === "null" || dateStr === "undefined") return "—";
    try {
      let date: Date;
      if (typeof dateStr === "number") {
        date = new Date(dateStr > 1e11 ? dateStr : dateStr * 1000);
      } else if (typeof dateStr === "string" && /^\d+$/.test(dateStr)) {
        const num = Number(dateStr);
        date = new Date(num > 1e11 ? num : num * 1000);
      } else if (typeof dateStr === "string" && dateStr.includes("-")) {
        const parts = dateStr.split("T")[0].split("-").map(Number);
        if (parts.length === 3) {
          if (parts[0] > 3000) {
            // Timestamp was mistakenly multiplied by 1000 before serializing to ISO
            const rawDate = new Date(dateStr);
            const corrected = new Date(rawDate.getTime() / 1000);
            if (corrected.getFullYear() >= 1990 && corrected.getFullYear() <= 2100) {
              date = corrected;
            } else {
              date = new Date(parts[0], parts[1] - 1, parts[2]);
            }
          } else {
            date = new Date(parts[0], parts[1] - 1, parts[2]);
          }
        } else {
          date = new Date(dateStr);
        }
      } else {
        date = new Date(dateStr);
      }

      // Check if resulting date has an inflated year (e.g. 58661)
      if (date.getFullYear() > 3000) {
        const corrected = new Date(date.getTime() / 1000);
        if (corrected.getFullYear() >= 1990 && corrected.getFullYear() <= 2100) {
          date = corrected;
        }
      }

      if (isNaN(date.getTime())) return String(dateStr);

      return date.toLocaleDateString(language === "EN" ? "en-US" : "es-ES", {
        day: "numeric",
        month: "short",
        year: "numeric"
      });
    } catch {
      return String(dateStr);
    }
  };

  const isPositive = (stockData?.change ?? 0) >= 0;

  return (
    <div id="stock-explorer-container" className="space-y-6">
      
      {/* 1. TOP HERO & SEARCH BAR */}
      <div className="bg-theme-card border border-theme-border p-6 rounded-2xl shadow-lg relative z-30">
        {/* Subtle background ambient glow (contained so it doesn't cause overflow on viewport) */}
        <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
          <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl -mr-20 -mt-20" />
        </div>
        
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <Search size={18} />
              </div>
              <h2 className="text-xl md:text-2xl font-display font-black tracking-wide uppercase text-theme-text-bright">
                {language === "EN" ? "STOCK FINDER & VALUATION ENGINE" : "BUSCADOR DE ACCIONES & ANÁLISIS FUNDAMENTAL"}
              </h2>
            </div>
            <p className="text-xs text-theme-text-muted">
              {language === "EN"
                ? "Search any public ticker worldwide for real-time quotes, deep fundamental ratios, and financial statements."
                : "Busca cualquier acción global para ver cotizaciones en tiempo real, múltiplos de valoración y estados financieros."}
            </p>
          </div>

          {/* Quick Stats Pill */}
          <div className="flex items-center gap-2 bg-theme-input px-3.5 py-1.5 rounded-xl border border-theme-border text-xs">
            <Sparkles size={14} className="text-emerald-400 animate-pulse" />
            <span className="font-semibold text-theme-text-bright">
              {language === "EN" ? "Live Market Connect" : "Conexión en Vivo"}
            </span>
          </div>
        </div>

        {/* SEARCH INPUT BAR */}
        <div className="mt-5 relative z-40" ref={searchContainerRef}>
          <div className="relative flex items-center">
            <div className="absolute left-4 text-theme-text-muted pointer-events-none">
              <Search size={18} />
            </div>
            <input
              id="stock-search-input-field"
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onFocus={() => {
                if (searchResults.length > 0) setIsDropdownOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (searchResults.length > 0) {
                    handleSelectTicker(searchResults[0].symbol);
                  } else if (searchInput.trim()) {
                    handleSelectTicker(searchInput.trim());
                  }
                } else if (e.key === "Escape") {
                  setIsDropdownOpen(false);
                }
              }}
              placeholder={language === "EN" ? "Search ticker or company name (e.g. NVDA, Apple, MSFT, Amazon, SPY)..." : "Buscar acción o empresa (ej. NVDA, Apple, MSFT, Amazon, SPY)..."}
              className="w-full pl-11 pr-12 py-3.5 bg-theme-input border border-theme-border focus:border-emerald-500 rounded-xl text-sm font-medium text-theme-text-bright placeholder-theme-text-muted/60 outline-none transition-all shadow-inner"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  setSearchResults([]);
                  setIsDropdownOpen(false);
                }}
                className="absolute right-4 p-1 rounded-lg text-theme-text-muted hover:text-theme-text-bright cursor-pointer"
              >
                <X size={16} />
              </button>
            )}
            {isSearching && (
              <div className="absolute right-10">
                <RefreshCw size={15} className="animate-spin text-emerald-400" />
              </div>
            )}
          </div>

          {/* AUTO-SUGGEST DROPDOWN */}
          {isDropdownOpen && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-theme-sidebar border border-theme-border rounded-xl shadow-2xl z-50 max-h-80 overflow-y-auto divide-y divide-theme-border/50">
              {searchResults.map((item) => (
                <button
                  key={`${item.symbol}-${item.exchange}`}
                  type="button"
                  onClick={() => handleSelectTicker(item.symbol)}
                  className="w-full px-4 py-3 text-left hover:bg-theme-card-hover flex items-center justify-between transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <CompanyLogo ticker={item.symbol} name={item.name} size="sm" />
                    <div className="truncate">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-theme-text-bright group-hover:text-emerald-400 transition-colors">
                          {item.symbol}
                        </span>
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-theme-input text-theme-text-muted border border-theme-border">
                          {item.exchange}
                        </span>
                      </div>
                      <p className="text-xs text-theme-text-muted truncate mt-0.5">{item.name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-theme-text-muted font-semibold group-hover:text-emerald-400">
                    <span>{language === "EN" ? "View Details" : "Ver Ficha"}</span>
                    <ArrowUpRight size={14} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>



        {/* Recent searches history */}
        {recentSearches.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 pt-2 border-t border-theme-border/60">
            <span className="text-[10px] font-bold uppercase tracking-wider text-theme-text-muted flex items-center gap-1 mr-1">
              <Clock size={11} />
              {language === "EN" ? "Recent:" : "Recientes:"}
            </span>
            {recentSearches.map((sym) => (
              <button
                key={`recent-${sym}`}
                onClick={() => handleSelectTicker(sym)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-all cursor-pointer ${
                  selectedTicker === sym 
                    ? "bg-theme-border text-theme-text-bright font-bold" 
                    : "text-theme-text-muted hover:text-theme-text-bright hover:underline"
                }`}
              >
                {sym}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 2. LOADING OR ERROR STATE */}
      {loadingDetails && !stockData ? (
        <div className="py-24 bg-theme-card border border-theme-border rounded-2xl flex flex-col items-center justify-center gap-4 text-theme-text-muted shadow-md">
          <RefreshCw size={36} className="animate-spin text-emerald-400" />
          <span className="text-xs font-bold uppercase tracking-widest text-theme-text-bright">
            {language === "EN" ? `LOADING METRICS FOR ${selectedTicker}...` : `CARGANDO DATOS DE ${selectedTicker}...`}
          </span>
        </div>
      ) : errorDetails && !stockData ? (
        <div className="p-8 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center gap-4 text-rose-400">
          <AlertCircle size={24} className="flex-shrink-0" />
          <div>
            <h4 className="font-bold text-sm">{language === "EN" ? "Could not retrieve ticker data" : "No se pudo cargar la acción"}</h4>
            <p className="text-xs mt-1 text-rose-300">{errorDetails}</p>
          </div>
        </div>
      ) : stockData ? (
        <>
          {/* 3. STOCK HEADER BANNER (Price, Info & Watchlist Action) */}
          <div className="bg-theme-card border border-theme-border p-6 rounded-2xl shadow-md">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              
              {/* Left Column: Logo, Name, Sector Badges */}
              <div className="flex items-start gap-4 min-w-0">
                <CompanyLogo ticker={stockData.symbol} name={stockData.name} size="lg" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl sm:text-3xl font-display font-black tracking-tight text-theme-text-bright">
                      {stockData.symbol}
                    </h1>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-theme-input border border-theme-border text-theme-text-muted">
                      {stockData.exchange} • {stockData.currency}
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white shadow-sm ${getSectorColor(stockData.profile.sector)}`}>
                      {language === "EN" ? stockData.profile.sector : getSectorSpanish(stockData.profile.sector)}
                    </span>
                  </div>
                  <h2 className="text-sm sm:text-base font-semibold text-theme-text-muted truncate mt-1">
                    {stockData.name}
                  </h2>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-theme-text-muted mt-2">
                    <span className="flex items-center gap-1">
                      <Briefcase size={12} className="text-emerald-400" />
                      {stockData.profile.industry}
                    </span>
                    {stockData.profile.country && (
                      <span className="flex items-center gap-1">
                        <MapPin size={12} className="text-blue-400" />
                        {stockData.profile.city ? `${stockData.profile.city}, ` : ""}{stockData.profile.country}
                      </span>
                    )}
                    {stockData.profile.website && (
                      <a
                        href={stockData.profile.website}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-emerald-400 hover:underline"
                      >
                        <Globe size={12} />
                        <span>{language === "EN" ? "Official Website" : "Sitio Web"}</span>
                        <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Real-Time Price & Actions */}
              <div className="flex flex-wrap items-center justify-between lg:justify-end gap-4 sm:gap-5 border-t lg:border-t-0 pt-4 lg:pt-0 border-theme-border">
                
                {/* Price Display & Daily Change */}
                <div className="text-left lg:text-right">
                  <div className="text-3xl sm:text-4xl font-mono font-black tracking-tight text-theme-text-bright">
                    {formatCurrency(stockData.price)}
                  </div>
                  <div className="flex items-center lg:justify-end gap-2 mt-1">
                    <div className={`flex items-center gap-1 font-mono font-bold text-sm ${isPositive ? "text-emerald-400" : "text-rose-400"}`}>
                      {isPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                      <span>{stockData.change >= 0 ? `+${stockData.change.toFixed(2)}` : stockData.change.toFixed(2)}</span>
                      <span>({formatPercent(stockData.changePct)})</span>
                    </div>
                    <span className="text-[10px] uppercase font-bold text-theme-text-muted">
                      {language === "EN" ? "TODAY" : "HOY"}
                    </span>
                  </div>

                  {/* After-hours / Extended price note */}
                  {stockData.isAfterHoursPrice && stockData.postMarketPrice && (
                    <div className="mt-1 text-[11px] font-mono text-amber-400 flex items-center lg:justify-end gap-1">
                      <Clock size={11} />
                      <span>
                        {language === "EN" ? "After-Hours:" : "Post-Mercado:"} {formatCurrency(stockData.postMarketPrice)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Actions: Watchlist & Refresh (Positioned directly beside price) */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleToggleWatchlist}
                    className={`px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer border ${
                      isInWatchlist
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-rose-500/10 hover:border-rose-500/30 hover:text-rose-400"
                        : "bg-emerald-500 hover:bg-emerald-600 text-slate-950 border-emerald-400 shadow-md font-extrabold"
                    }`}
                  >
                    {isInWatchlist ? (
                      <>
                        <Check size={15} />
                        <span>{language === "EN" ? "In Watchlist" : "En Seguimiento"}</span>
                      </>
                    ) : (
                      <>
                        <Plus size={15} />
                        <span>{language === "EN" ? "Add to Watchlist" : "Añadir a Seguimiento"}</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      fetchStockDetails(selectedTicker);
                      fetchChartData(selectedTicker, chartRange);
                    }}
                    className="p-2 sm:p-2.5 rounded-xl border border-theme-border bg-theme-input hover:bg-theme-card-hover text-theme-text-muted hover:text-theme-text-bright transition-all cursor-pointer"
                    title={language === "EN" ? "Refresh Data" : "Actualizar Datos"}
                  >
                    <RefreshCw size={15} className={loadingDetails ? "animate-spin text-emerald-400" : ""} />
                  </button>
                </div>
              </div>
            </div>

            {/* 52-WEEK RANGE VISUAL PROGRESS BAR */}
            <div className="mt-6 pt-5 border-t border-theme-border/60">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs mb-2">
                <span className="font-bold text-theme-text-muted uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                  <Activity size={12} className="text-emerald-400" />
                  {language === "EN" ? "52-Week Trading Channel" : "Canal de 52 Semanas"}
                </span>
                <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                  <span className="text-theme-text-muted">
                    {language === "EN" ? "Low:" : "Mín:"} <strong className="text-theme-text-bright">{formatCurrency(stockData.fiftyTwoWeekLow)}</strong>
                  </span>
                  <span className="text-theme-text-muted">
                    {language === "EN" ? "High (ATH):" : "Máx (ATH):"} <strong className="text-theme-text-bright">{formatCurrency(stockData.fiftyTwoWeekHigh)}</strong>
                  </span>
                  <div className="flex items-center gap-1.5 pl-2 border-l border-theme-border">
                    <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      {athProgressMetrics.athScorePct}%
                    </span>
                    <span className="text-[11px] text-amber-400 font-medium">
                      ({language === "EN" ? "To high:" : "Por recuperar:"} <strong className="text-rose-400">-{athProgressMetrics.distToHighPct}%</strong>)
                    </span>
                  </div>
                </div>
              </div>

              {/* Progress bar track representing 1 - ((high - price) / price) */}
              <div className="relative w-full h-2.5 bg-theme-input rounded-full overflow-hidden border border-theme-border">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400 rounded-full transition-all duration-700"
                  style={{ width: `${Math.max(0, Math.min(100, athProgressMetrics.athScorePct))}%` }}
                />
              </div>
            </div>
          </div>

          {/* 4. INTERACTIVE PRICE CHART SECTION & BENCHMARK COMPARISON */}
          <div className="bg-theme-card border border-theme-border p-6 rounded-2xl shadow-md">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
              <div>
                <div className="flex items-center gap-2">
                  <BarChart3 size={18} className="text-emerald-400" />
                  <h3 className="text-base font-bold text-theme-text-bright uppercase tracking-wider">
                    {isComparing 
                      ? (language === "EN" ? "Comparative Performance vs Benchmarks" : "Rendimiento Comparativo vs Índices") 
                      : (language === "EN" ? "Price Performance Chart" : "Gráfico de Rendimiento Histórico")}
                  </h3>
                </div>
                
                {/* Performance & Alpha Pills */}
                <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs font-mono">
                  <div className="flex items-center gap-1">
                    <span className="text-theme-text-muted">
                      {stockData.symbol}:
                    </span>
                    <span className={`font-bold flex items-center gap-0.5 ${chartPerformance.isPositive ? "text-emerald-400" : "text-rose-400"}`}>
                      {chartPerformance.isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {formatPercent(chartPerformance.changePct)}
                    </span>
                  </div>

                  {compareSP500 && (
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400">
                      <span className="font-bold">S&P 500:</span>
                      <span>{formatPercent(benchmarkAlpha.sp500Return)}</span>
                      <span className={`font-black text-[11px] ${benchmarkAlpha.alphaVsSP500 >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        ({benchmarkAlpha.alphaVsSP500 >= 0 ? "+" : ""}{benchmarkAlpha.alphaVsSP500}% Alpha)
                      </span>
                    </div>
                  )}

                  {compareNasdaq && (
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/30 text-sky-400">
                      <span className="font-bold">NASDAQ-100:</span>
                      <span>{formatPercent(benchmarkAlpha.nasdaqReturn)}</span>
                      <span className={`font-black text-[11px] ${benchmarkAlpha.alphaVsNasdaq >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        ({benchmarkAlpha.alphaVsNasdaq >= 0 ? "+" : ""}{benchmarkAlpha.alphaVsNasdaq}% Alpha)
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Controls: Range Toggles & Benchmark Overlays */}
              <div className="flex flex-wrap items-center gap-3">
                
                {/* Benchmark Overlays Toggles */}
                <div className="flex items-center gap-1.5 bg-theme-input p-1 rounded-xl border border-theme-border text-xs font-mono">
                  <span className="text-[10px] text-theme-text-muted px-1.5 uppercase font-bold flex items-center gap-1">
                    <Scale size={11} />
                    {language === "EN" ? "Compare:" : "Comparar:"}
                  </span>
                  
                  <button
                    onClick={() => setCompareSP500(!compareSP500)}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      compareSP500
                        ? "bg-amber-500 text-slate-950 font-black shadow-xs"
                        : "text-amber-400 hover:bg-amber-500/10"
                    }`}
                  >
                    <span>S&P 500</span>
                  </button>

                  <button
                    onClick={() => setCompareNasdaq(!compareNasdaq)}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      compareNasdaq
                        ? "bg-sky-500 text-slate-950 font-black shadow-xs"
                        : "text-sky-400 hover:bg-sky-500/10"
                    }`}
                  >
                    <span>NASDAQ-100</span>
                  </button>
                </div>

                {/* Range Toggle Buttons */}
                <div className="inline-flex bg-theme-input p-1 rounded-xl border border-theme-border text-xs font-mono font-bold">
                  {(["1W", "1M", "6M", "YTD", "1Y", "5Y", "ALL"] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => setChartRange(r)}
                      className={`px-2.5 sm:px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                        chartRange === r
                          ? "bg-emerald-500 text-slate-950 font-black shadow-sm"
                          : "text-theme-text-muted hover:text-theme-text-bright hover:bg-theme-card-hover"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Chart Canvas */}
            <div className="h-72 sm:h-80 w-full relative">
              {(loadingChart || loadingBenchmarkChart) && (
                <div className="absolute inset-0 bg-theme-card/60 backdrop-blur-xs flex items-center justify-center z-10">
                  <RefreshCw size={24} className="animate-spin text-emerald-400" />
                </div>
              )}
              
              {combinedChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={combinedChartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <defs>
                      <linearGradient id="stockChartGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={chartPerformance.isPositive ? "#10b981" : "#f43f5e"} stopOpacity={isComparing ? 0.15 : 0.35} />
                        <stop offset="95%" stopColor={chartPerformance.isPositive ? "#10b981" : "#f43f5e"} stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme === "light" ? "#e2e8f0" : "#1e293b"} vertical={false} />
                    <XAxis 
                      dataKey="date" 
                      ticks={chartTicks}
                      tickLine={false} 
                      axisLine={false} 
                      tick={{ fill: theme === "light" ? "#64748b" : "#94a3b8", fontSize: 10 }}
                      tickFormatter={(d) => {
                        try {
                          const parts = typeof d === "string" && d.includes("-") ? d.split("-").map(Number) : null;
                          const dateObj = parts && parts.length === 3 
                            ? new Date(parts[0], parts[1] - 1, parts[2]) 
                            : new Date(d);
                          
                          const isLongRange = ["6M", "YTD", "1Y", "5Y", "ALL"].includes(chartRange);
                          
                          if (isLongRange) {
                            const esMonths = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
                            const enMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                            const m = language === "ES" ? esMonths[dateObj.getMonth()] : enMonths[dateObj.getMonth()];
                            
                            if (chartRange === "5Y" || chartRange === "ALL") {
                              return `${m} '${dateObj.getFullYear().toString().slice(-2)}`;
                            }
                            return m;
                          }
                          
                          return dateObj.toLocaleDateString(language === "EN" ? "en-US" : "es-ES", { month: "short", day: "numeric" });
                        } catch (e) {
                          return d;
                        }
                      }}
                    />
                    <YAxis 
                      domain={["auto", "auto"]} 
                      tickLine={false} 
                      axisLine={false} 
                      tick={{ fill: theme === "light" ? "#64748b" : "#94a3b8", fontSize: 10 }}
                      tickFormatter={(v) => isComparing ? `${v >= 0 ? "+" : ""}${v.toFixed(0)}%` : `$${v.toFixed(0)}`}
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: theme === "light" ? "#ffffff" : "#0f172a",
                        borderColor: theme === "light" ? "#e2e8f0" : "#334155",
                        borderRadius: "0.75rem",
                        boxShadow: "0 10px 15px -3px rgba(0,0,0,0.2)",
                        color: theme === "light" ? "#0f172a" : "#f8fafc",
                        fontSize: "12px",
                        fontWeight: "600",
                        fontFamily: "monospace"
                      }}
                      formatter={(val: any, name: any) => {
                        if (name === "stockReturn" || name === "close") {
                          if (isComparing) {
                            return [`${val >= 0 ? "+" : ""}${val}%`, stockData.symbol];
                          }
                          return [`$${Number(val).toFixed(2)}`, stockData.symbol];
                        }
                        if (name === "sp500Return") {
                          return [`${val >= 0 ? "+" : ""}${val}%`, "S&P 500 (SPY)"];
                        }
                        if (name === "nasdaqReturn") {
                          return [`${val >= 0 ? "+" : ""}${val}%`, "NASDAQ-100 (QQQ)"];
                        }
                        return [val, name];
                      }}
                      labelFormatter={(label) => {
                        try {
                          const parts = typeof label === "string" && label.includes("-") ? label.split("-").map(Number) : null;
                          const dateObj = parts && parts.length === 3 
                            ? new Date(parts[0], parts[1] - 1, parts[2]) 
                            : new Date(label);
                          const dateText = dateObj.toLocaleDateString(language === "EN" ? "en-US" : "es-ES", {
                            day: "numeric",
                            month: "short",
                            year: "numeric"
                          });
                          return `${language === "EN" ? "Date:" : "Fecha:"} ${dateText}`;
                        } catch {
                          return `${language === "EN" ? "Date:" : "Fecha:"} ${label}`;
                        }
                      }}
                    />
                    {isComparing && (
                      <ReferenceLine y={0} stroke={theme === "light" ? "#94a3b8" : "#475569"} strokeDasharray="3 3" />
                    )}
                    <Area 
                      type="monotone" 
                      dataKey={isComparing ? "stockReturn" : "close"} 
                      name={isComparing ? "stockReturn" : "close"}
                      stroke={chartPerformance.isPositive ? "#10b981" : "#f43f5e"} 
                      strokeWidth={2.5} 
                      fillOpacity={1} 
                      fill="url(#stockChartGrad)" 
                    />
                    {compareSP500 && (
                      <Line 
                        type="monotone" 
                        dataKey="sp500Return" 
                        name="sp500Return"
                        stroke="#f59e0b" 
                        strokeWidth={2.2} 
                        strokeDasharray="4 4"
                        dot={false}
                      />
                    )}
                    {compareNasdaq && (
                      <Line 
                        type="monotone" 
                        dataKey="nasdaqReturn" 
                        name="nasdaqReturn"
                        stroke="#38bdf8" 
                        strokeWidth={2.2} 
                        strokeDasharray="4 4"
                        dot={false}
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-theme-text-muted">
                  {language === "EN" ? "No historical chart points available" : "Sin datos de gráfico disponibles"}
                </div>
              )}
            </div>
          </div>

          {/* 5. SUB-TABS NAVIGATION (Overview / Financials / Bogle) */}
          <div className="flex border-b border-theme-border gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setActiveSubTab("overview")}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 cursor-pointer transition-all shrink-0 border ${
                activeSubTab === "overview"
                  ? "bg-emerald-500 text-slate-950 border-emerald-400 font-extrabold shadow-md"
                  : "text-theme-text-muted border-transparent hover:text-theme-text-bright hover:bg-theme-card-hover"
              }`}
            >
              <Layers size={14} />
              <span>{language === "EN" ? "Fundamental Overview" : "Resumen Fundamental"}</span>
            </button>

            <button
              onClick={() => setActiveSubTab("financials")}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 cursor-pointer transition-all shrink-0 border ${
                activeSubTab === "financials"
                  ? "bg-emerald-500 text-slate-950 border-emerald-400 font-extrabold shadow-md"
                  : "text-theme-text-muted border-transparent hover:text-theme-text-bright hover:bg-theme-card-hover"
              }`}
            >
              <FileText size={14} />
              <span>{language === "EN" ? "Financial Statements" : "Estados Financieros"}</span>
            </button>

            <button
              onClick={() => setActiveSubTab("threestatements")}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 cursor-pointer transition-all shrink-0 border ${
                activeSubTab === "threestatements"
                  ? "bg-emerald-500 text-slate-950 border-emerald-400 font-extrabold shadow-md"
                  : "text-theme-text-muted border-transparent hover:text-theme-text-bright hover:bg-theme-card-hover"
              }`}
            >
              <FileSpreadsheet size={14} />
              <span>{language === "EN" ? "3-Statement & DCF Model" : "Modelo 3 Estados & DCF"}</span>
            </button>

            <button
              onClick={() => setActiveSubTab("bogle")}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 cursor-pointer transition-all shrink-0 border ${
                activeSubTab === "bogle"
                  ? "bg-emerald-500 text-slate-950 border-emerald-400 font-extrabold shadow-md"
                  : "text-theme-text-muted border-transparent hover:text-theme-text-bright hover:bg-theme-card-hover"
              }`}
            >
              <BarChart3 size={14} />
              <span>{language === "EN" ? "Engines of Return" : "Motores de Retorno"}</span>
            </button>
          </div>

          {/* 6. TAB CONTENT: OVERVIEW */}
          {activeSubTab === "overview" && (
            <div className="space-y-6">
              
              {/* 4 THEMATIC KEY METRIC BLOCKS */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                
                {/* 1. Valuation Metrics */}
                <div className="bg-theme-card border border-theme-border p-5 rounded-2xl shadow-sm space-y-3">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
                    <DollarSign size={15} />
                    <span>{language === "EN" ? "Valuation Multiples" : "Múltiplos de Valoración"}</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-center py-1 border-b border-theme-border/40">
                      <span className="text-theme-text-muted">{language === "EN" ? "Market Cap" : "Cap. Bursátil"}</span>
                      <span className="font-mono font-bold text-theme-text-bright">{formatLargeNumber(stockData.marketCap)}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-theme-border/40">
                      <span className="text-theme-text-muted">{language === "EN" ? "Trailing P/E (TTM)" : "P/E Trailing (TTM)"}</span>
                      <span className="font-mono font-bold text-emerald-400">{formatNumber(stockData.trailingPE)}x</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-theme-border/40">
                      <span className="text-theme-text-muted">{language === "EN" ? "Forward P/E" : "Forward P/E (1A)"}</span>
                      <span className="font-mono font-bold text-theme-text-bright">{formatNumber(stockData.forwardPE)}x</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-theme-border/40">
                      <span className="text-theme-text-muted">{language === "EN" ? "PEG Ratio" : "Ratio PEG"}</span>
                      <span className="font-mono font-bold text-theme-text-bright">{formatNumber(stockData.pegRatio)}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-theme-border/40">
                      <span className="text-theme-text-muted">{language === "EN" ? "Price / Sales" : "Precio / Ventas (P/S)"}</span>
                      <span className="font-mono font-bold text-theme-text-bright">{formatNumber(stockData.priceToSales)}x</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-theme-border/40">
                      <span className="text-theme-text-muted">{language === "EN" ? "Price / Book" : "Precio / Libro (P/B)"}</span>
                      <span className="font-mono font-bold text-theme-text-bright">{formatNumber(stockData.priceToBook)}x</span>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <span className="text-theme-text-muted">{language === "EN" ? "EV / EBITDA" : "EV / EBITDA"}</span>
                      <span className="font-mono font-bold text-theme-text-bright">{formatNumber(stockData.evEbitda || stockData.enterpriseToEbitda)}x</span>
                    </div>
                  </div>
                </div>

                {/* 2. Profitability & Margins */}
                <div className="bg-theme-card border border-theme-border p-5 rounded-2xl shadow-sm space-y-3">
                  <div className="flex items-center gap-2 text-blue-400 font-bold text-xs uppercase tracking-wider">
                    <TrendingUp size={15} />
                    <span>{language === "EN" ? "Profitability & Margins" : "Rentabilidad & Márgenes"}</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-center py-1 border-b border-theme-border/40">
                      <span className="text-theme-text-muted">{language === "EN" ? "Gross Margin" : "Margen Bruto"}</span>
                      <span className="font-mono font-bold text-theme-text-bright">{formatPercent(stockData.grossMargins, true)}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-theme-border/40">
                      <span className="text-theme-text-muted">{language === "EN" ? "Operating Margin" : "Margen Operativo"}</span>
                      <span className="font-mono font-bold text-theme-text-bright">{formatPercent(stockData.operatingMargins, true)}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-theme-border/40">
                      <span className="text-theme-text-muted">{language === "EN" ? "Net Profit Margin" : "Margen Neto"}</span>
                      <span className="font-mono font-bold text-emerald-400">{formatPercent(stockData.profitMargins, true)}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-theme-border/40">
                      <span className="text-theme-text-muted">{language === "EN" ? "Return on Equity (ROE)" : "Retorno Fondos Propios (ROE)"}</span>
                      <span className="font-mono font-bold text-theme-text-bright">{formatPercent(stockData.returnOnEquity, true)}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-theme-border/40">
                      <span className="text-theme-text-muted">{language === "EN" ? "Return on Assets (ROA)" : "Retorno Activos (ROA)"}</span>
                      <span className="font-mono font-bold text-theme-text-bright">{formatPercent(stockData.returnOnAssets, true)}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-theme-border/40">
                      <span className="text-theme-text-muted">{language === "EN" ? "Trailing EPS" : "EPS Trailing (BPA)"}</span>
                      <span className="font-mono font-bold text-theme-text-bright">{formatCurrency(stockData.trailingEps)}</span>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <span className="text-theme-text-muted">{language === "EN" ? "Forward EPS" : "EPS Proyectado"}</span>
                      <span className="font-mono font-bold text-theme-text-bright">{formatCurrency(stockData.forwardEps)}</span>
                    </div>
                  </div>
                </div>

                {/* 3. Financial Health & Balance Sheet */}
                <div className="bg-theme-card border border-theme-border p-5 rounded-2xl shadow-sm space-y-3">
                  <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
                    <ShieldCheck size={15} />
                    <span>{language === "EN" ? "Health & Liquidity" : "Salud Financiera & Balance"}</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-center py-1 border-b border-theme-border/40">
                      <span className="text-theme-text-muted">{language === "EN" ? "Current Ratio" : "Ratio Corriente"}</span>
                      <span className="font-mono font-bold text-theme-text-bright">{formatNumber(stockData.currentRatio)}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-theme-border/40">
                      <span className="text-theme-text-muted">{language === "EN" ? "Quick Ratio" : "Test Ácido (Quick Ratio)"}</span>
                      <span className="font-mono font-bold text-theme-text-bright">{formatNumber(stockData.quickRatio)}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-theme-border/40">
                      <span className="text-theme-text-muted">{language === "EN" ? "Debt / Equity" : "Deuda / Fondos Propios"}</span>
                      <span className="font-mono font-bold text-theme-text-bright">{formatNumber(stockData.debtToEquity)}%</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-theme-border/40">
                      <span className="text-theme-text-muted">{language === "EN" ? "Total Cash" : "Efectivo Total"}</span>
                      <span className="font-mono font-bold text-emerald-400">{formatLargeNumber(stockData.totalCash)}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-theme-border/40">
                      <span className="text-theme-text-muted">{language === "EN" ? "Total Debt" : "Deuda Total"}</span>
                      <span className="font-mono font-bold text-theme-text-bright">{formatLargeNumber(stockData.totalDebt)}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-theme-border/40">
                      <span className="text-theme-text-muted">{language === "EN" ? "Free Cash Flow" : "Flujo Libre Caja (FCF)"}</span>
                      <span className="font-mono font-bold text-emerald-400">{formatLargeNumber(stockData.freeCashflow)}</span>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <span className="text-theme-text-muted">{language === "EN" ? "Piotroski F-Score" : "Puntaje Piotroski"}</span>
                      <span className="font-mono font-bold text-amber-400">{stockData.piotroskiScore ?? 7}/9</span>
                    </div>
                  </div>
                </div>

                {/* 4. Dividends & Trading Stats */}
                <div className="bg-theme-card border border-theme-border p-5 rounded-2xl shadow-sm space-y-3">
                  <div className="flex items-center gap-2 text-purple-400 font-bold text-xs uppercase tracking-wider">
                    <Activity size={15} />
                    <span>{language === "EN" ? "Dividends & Trading" : "Dividendos & Operativa"}</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-center py-1 border-b border-theme-border/40">
                      <span className="text-theme-text-muted">{language === "EN" ? "Dividend Rate" : "Dividendo Anual"}</span>
                      <span className="font-mono font-bold text-theme-text-bright">{formatCurrency(stockData.dividendRate)}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-theme-border/40">
                      <span className="text-theme-text-muted">{language === "EN" ? "Dividend Yield" : "Rentabilidad Div."}</span>
                      <span className="font-mono font-bold text-emerald-400">{formatPercent(stockData.dividendYield, true)}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-theme-border/40">
                      <span className="text-theme-text-muted">{language === "EN" ? "Payout Ratio" : "Ratio Payout"}</span>
                      <span className="font-mono font-bold text-theme-text-bright">{formatPercent(stockData.payoutRatio, true)}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-theme-border/40">
                      <span className="text-theme-text-muted">{language === "EN" ? "Ex-Dividend Date" : "Fecha Ex-Dividendo"}</span>
                      <span className="font-mono font-bold text-theme-text-bright">{formatDate(stockData.exDividendDate)}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-theme-border/40">
                      <span className="text-theme-text-muted">{language === "EN" ? "Beta (5Y Vol)" : "Beta (Volatilidad 5A)"}</span>
                      <span className="font-mono font-bold text-theme-text-bright">{formatNumber(stockData.beta)}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-theme-border/40">
                      <span className="text-theme-text-muted">{language === "EN" ? "Diluted EPS CAGR (Annual)" : "CAGR BPA Diluido (Anual)"}</span>
                      <span className={`font-mono font-bold ${basicEpsAnnualCagr !== null ? (basicEpsAnnualCagr > 0 ? "text-emerald-400" : basicEpsAnnualCagr < 0 ? "text-rose-400" : "text-theme-text-bright") : "text-theme-text-muted"}`}>
                        {basicEpsAnnualCagr !== null ? `${basicEpsAnnualCagr > 0 ? "+" : ""}${basicEpsAnnualCagr.toFixed(1)}%` : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <span className="text-theme-text-muted" title={language === "EN" ? "Dividend Yield + Annual Shares Reduction CAGR (Buyback Yield)" : "Dividend Yield + CAGR anual de reducción de acciones (Buyback Yield)"}>
                        {language === "EN" ? "Shareholder Yield" : "Shareholder Yield"}
                      </span>
                      <span className="font-mono font-bold text-emerald-400">
                        {shareholderYieldData.total !== null ? `${shareholderYieldData.total.toFixed(2)}%` : "—"}
                      </span>
                    </div>
                  </div>
                </div>

              </div>

              {/* BENCHMARK COMPARISON MATRIX (S&P 500 & NASDAQ-100) */}
              <div className="bg-theme-card border border-theme-border p-6 rounded-2xl shadow-md space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Scale size={18} className="text-amber-400" />
                    <h4 className="font-bold text-sm text-theme-text-bright uppercase tracking-wider">
                      {language === "EN" ? "Benchmark Relative Comparison (S&P 500 & NASDAQ-100)" : "Comparativa vs Índices de Referencia (S&P 500 & NASDAQ-100)"}
                    </h4>
                  </div>
                  <span className="text-xs text-theme-text-muted font-medium">
                    {language === "EN" ? "Evaluation against broad market & tech indices" : "Evaluación relativa frente al mercado general y tecnológico"}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-theme-border/60 text-theme-text-muted uppercase text-[10px] font-bold">
                        <th className="py-2.5 px-3">{language === "EN" ? "Metric / Ratio" : "Métrica / Ratio"}</th>
                        <th className="py-2.5 px-3 font-mono text-emerald-400 bg-emerald-500/5 rounded-t-lg">{stockData.symbol} ({language === "EN" ? "Active" : "Actual"})</th>
                        <th className="py-2.5 px-3 font-mono text-amber-400">S&P 500 (SPY)</th>
                        <th className="py-2.5 px-3 font-mono text-sky-400">NASDAQ-100 (QQQ)</th>
                        <th className="py-2.5 px-3">{language === "EN" ? "Relative Assessment" : "Evaluación Relativa"}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-theme-border/30">
                      
                      {/* Trailing P/E */}
                      <tr className="hover:bg-theme-input/40 transition-colors">
                        <td className="py-2.5 px-3 font-medium text-theme-text-bright">
                          {language === "EN" ? "Trailing P/E Ratio" : "Múltiplo P/E Trailing"}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-theme-text-bright bg-emerald-500/5">
                          {stockData.trailingPE ? `${stockData.trailingPE.toFixed(1)}x` : "—"}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-theme-text-muted">
                          {benchmarksData[0]?.trailingPE ? `${benchmarksData[0].trailingPE.toFixed(1)}x` : "27.8x"}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-theme-text-muted">
                          {benchmarksData[1]?.trailingPE ? `${benchmarksData[1].trailingPE.toFixed(1)}x` : "33.4x"}
                        </td>
                        <td className="py-2.5 px-3">
                          {stockData.trailingPE ? (
                            stockData.trailingPE < (benchmarksData[0]?.trailingPE || 27.8) ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
                                {language === "EN" ? "Attractive Valuation" : "Valoración Atractiva vs S&P"}
                              </span>
                            ) : stockData.trailingPE > (benchmarksData[1]?.trailingPE || 33.4) ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400">
                                {language === "EN" ? "Growth Premium" : "Prima de Crecimiento"}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-theme-input text-theme-text-muted">
                                {language === "EN" ? "In Line with Tech" : "En línea con Nasdaq"}
                              </span>
                            )
                          ) : (
                            <span className="text-theme-text-muted">—</span>
                          )}
                        </td>
                      </tr>

                      {/* Forward P/E */}
                      <tr className="hover:bg-theme-input/40 transition-colors">
                        <td className="py-2.5 px-3 font-medium text-theme-text-bright">
                          {language === "EN" ? "Forward P/E Ratio" : "Múltiplo P/E Proyectado"}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-theme-text-bright bg-emerald-500/5">
                          {stockData.forwardPE ? `${stockData.forwardPE.toFixed(1)}x` : "—"}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-theme-text-muted">
                          {benchmarksData[0]?.forwardPE ? `${benchmarksData[0].forwardPE.toFixed(1)}x` : "22.1x"}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-theme-text-muted">
                          {benchmarksData[1]?.forwardPE ? `${benchmarksData[1].forwardPE.toFixed(1)}x` : "26.8x"}
                        </td>
                        <td className="py-2.5 px-3">
                          {stockData.forwardPE ? (
                            stockData.forwardPE < (stockData.trailingPE || 999) ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
                                <TrendingUp size={10} />
                                {language === "EN" ? "Earnings Expansion" : "Expansión de Beneficios"}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-theme-input text-theme-text-muted">
                                {language === "EN" ? "Stable Projection" : "Proyección Estable"}
                              </span>
                            )
                          ) : (
                            <span className="text-theme-text-muted">—</span>
                          )}
                        </td>
                      </tr>

                      {/* Beta / Market Volatility */}
                      <tr className="hover:bg-theme-input/40 transition-colors">
                        <td className="py-2.5 px-3 font-medium text-theme-text-bright">
                          {language === "EN" ? "Market Beta (5Y Volatility)" : "Beta (Volatilidad vs Mercado)"}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-theme-text-bright bg-emerald-500/5">
                          {stockData.beta ? stockData.beta.toFixed(2) : "—"}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-theme-text-muted">1.00 (Base)</td>
                        <td className="py-2.5 px-3 font-mono text-theme-text-muted">1.18</td>
                        <td className="py-2.5 px-3">
                          {stockData.beta !== undefined && stockData.beta !== null ? (
                            stockData.beta > 1.2 ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400">
                                {language === "EN" ? "Higher Volatility" : "Mayor Volatilidad"}
                              </span>
                            ) : stockData.beta < 0.9 ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400">
                                {language === "EN" ? "Defensive Profile" : "Perfil Defensivo"}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
                                {language === "EN" ? "Market Neutral" : "Volatilidad Moderada"}
                              </span>
                            )
                          ) : (
                            <span className="text-theme-text-muted">—</span>
                          )}
                        </td>
                      </tr>

                      {/* Profit Margin */}
                      <tr className="hover:bg-theme-input/40 transition-colors">
                        <td className="py-2.5 px-3 font-medium text-theme-text-bright">
                          {language === "EN" ? "Net Profit Margin" : "Margen de Beneficio Neto"}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-emerald-400 bg-emerald-500/5">
                          {stockData.profitMargins ? `${(stockData.profitMargins * 100).toFixed(1)}%` : "—"}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-theme-text-muted">12.4%</td>
                        <td className="py-2.5 px-3 font-mono text-theme-text-muted">18.2%</td>
                        <td className="py-2.5 px-3">
                          {stockData.profitMargins ? (
                            stockData.profitMargins * 100 > 18.2 ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
                                <Award size={10} />
                                {language === "EN" ? "Industry Leader Margin" : "Supera al NASDAQ-100"}
                              </span>
                            ) : stockData.profitMargins * 100 > 12.4 ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400">
                                {language === "EN" ? "Above S&P 500" : "Supera al S&P 500"}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/10 text-rose-400">
                                {language === "EN" ? "Below Market Avg" : "Inferior a la media"}
                              </span>
                            )
                          ) : (
                            <span className="text-theme-text-muted">—</span>
                          )}
                        </td>
                      </tr>

                      {/* Dividend Yield */}
                      <tr className="hover:bg-theme-input/40 transition-colors">
                        <td className="py-2.5 px-3 font-medium text-theme-text-bright">
                          {language === "EN" ? "Dividend Yield" : "Rentabilidad por Dividendo"}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-theme-text-bright bg-emerald-500/5">
                          {stockData.dividendYield ? `${(stockData.dividendYield * 100).toFixed(2)}%` : "0.00%"}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-theme-text-muted">1.25%</td>
                        <td className="py-2.5 px-3 font-mono text-theme-text-muted">0.58%</td>
                        <td className="py-2.5 px-3">
                          {stockData.dividendYield && stockData.dividendYield * 100 > 1.25 ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
                              {language === "EN" ? "High Dividend Yield" : "Alto Dividendo vs S&P"}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-theme-input text-theme-text-muted">
                              {language === "EN" ? "Capital Growth Oriented" : "Enfocado en Revalorización"}
                            </span>
                          )}
                        </td>
                      </tr>

                    </tbody>
                  </table>
                </div>
              </div>

              {/* SIDE-BY-SIDE: WALL STREET ANALYST TARGETS & COMPANY PROFILE */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                
                {/* WALL STREET ANALYST TARGETS & SECTOR-NORMALIZED SCORE */}
                <div className="bg-theme-card border border-theme-border p-6 rounded-2xl shadow-md space-y-5 h-full flex flex-col justify-between">
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Award size={18} className="text-amber-400" />
                        <h4 className="font-bold text-sm text-theme-text-bright uppercase tracking-wider">
                          {language === "EN" ? "Fundamental Score & Wall Street Consensus" : "Score Fundamental & Consenso de Analistas"}
                        </h4>
                      </div>
                      {stockData.numberOfAnalystOpinions && (
                        <span className="text-xs text-theme-text-muted font-semibold">
                          {stockData.numberOfAnalystOpinions} {language === "EN" ? "Analysts Coverage" : "Cobertura de Analistas"}
                        </span>
                      )}
                    </div>

                    {/* SECTOR-NORMALIZED FUNDAMENTAL SCORE HERO */}
                    {scoredRow && typeof scoredRow.scores?.balanced === "number" && (
                      <div className="bg-theme-input p-4 rounded-xl border border-theme-border space-y-3">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div className="flex items-center gap-3">
                            {/* Circular Gauge */}
                            <div className="relative w-12 h-12 flex items-center justify-center shrink-0">
                              <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                                <path
                                  className="text-theme-sidebar"
                                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="3.5"
                                />
                                <path
                                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                  fill="none"
                                  stroke={getScoreHex(scoredRow.scores.balanced)}
                                  strokeWidth="3.5"
                                  strokeDasharray={`${Math.min(100, Math.max(0, scoredRow.scores.balanced))}, 100`}
                                  className="drop-shadow-sm transition-all duration-700 ease-out"
                                />
                              </svg>
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className={`text-sm font-black font-mono ${getScoreColorClass(scoredRow.scores.balanced)}`}>
                                  {scoredRow.scores.balanced.toFixed(0)}
                                </span>
                              </div>
                            </div>

                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-theme-text-bright">
                                  {language === "EN" ? "Sector-Relative Score" : "Score Sectorial Normalizado"}
                                </span>
                                {scoredRow.type && (
                                  <span 
                                    className={`text-[10px] font-bold px-2 py-0.5 rounded-md border inline-flex items-center shadow-sm ${getTypeBadgeConfig(scoredRow.type).className}`}
                                    title={scoredRow.valuationMethod ? `${scoredRow.type}\n${language === 'ES' ? 'Método:' : 'Method:'} ${scoredRow.valuationMethod}` : scoredRow.type}
                                  >
                                    <span className="mr-1 opacity-90">{getTypeBadgeConfig(scoredRow.type).icon}</span>
                                    {scoredRow.type}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Recommendation Badge at the height of Sector-Relative Score */}
                          {stockData.recommendationKey && stockData.recommendationKey !== "none" && (
                            <div className="flex items-center gap-1.5 text-xs shrink-0">
                              <span className="text-theme-text-muted text-[11px] font-medium">
                                {language === "EN" ? "Recommendation:" : "Recomendación:"}
                              </span>
                              <span className={`font-mono font-bold uppercase px-2 py-0.5 rounded-md text-[11px] border ${
                                stockData.recommendationKey.includes("buy")
                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                  : stockData.recommendationKey.includes("sell")
                                  ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                  : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                              }`}>
                                {stockData.recommendationKey.replace(/_/g, " ")}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* 4 Factor Sub-Scores in Donut Gauges */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2.5 border-t border-theme-border/60">
                          {/* Growth */}
                          <div className="bg-theme-card/70 p-2.5 rounded-xl border border-theme-border/50 flex items-center gap-2.5">
                            <div className="relative w-9 h-9 flex items-center justify-center shrink-0">
                              <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                                <path
                                  className="text-theme-sidebar"
                                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="3.5"
                                />
                                <path
                                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                  fill="none"
                                  stroke={getScoreHex(scoredRow.factors.growth)}
                                  strokeWidth="3.5"
                                  strokeDasharray={`${Math.min(100, Math.max(0, scoredRow.factors.growth ?? 0))}, 100`}
                                  className="transition-all duration-700 ease-out"
                                />
                              </svg>
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className={`text-[11px] font-black font-mono ${getScoreColorClass(scoredRow.factors.growth)}`}>
                                  {scoredRow.factors.growth !== null ? scoredRow.factors.growth.toFixed(0) : "—"}
                                </span>
                              </div>
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="text-[10px] uppercase font-bold text-theme-text-muted block truncate">
                                {language === "EN" ? "Growth" : "Crecimiento"}
                              </span>
                              <span className={`text-[10px] font-mono font-bold ${getScoreColorClass(scoredRow.factors.growth)} block truncate`}>
                                {scoredRow.factors.growth !== null 
                                  ? (scoredRow.factors.growth >= 75 
                                      ? (language === "EN" ? "Strong" : "Fuerte") 
                                      : scoredRow.factors.growth >= 50 
                                      ? (language === "EN" ? "Healthy" : "Saludable") 
                                      : scoredRow.factors.growth >= 35 
                                      ? (language === "EN" ? "Neutral" : "Neutro") 
                                      : (language === "EN" ? "Weak" : "Débil")) 
                                  : "—"}
                              </span>
                            </div>
                          </div>

                          {/* Quality */}
                          <div className="bg-theme-card/70 p-2.5 rounded-xl border border-theme-border/50 flex items-center gap-2.5">
                            <div className="relative w-9 h-9 flex items-center justify-center shrink-0">
                              <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                                <path
                                  className="text-theme-sidebar"
                                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="3.5"
                                />
                                <path
                                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                  fill="none"
                                  stroke={getScoreHex(scoredRow.factors.quality)}
                                  strokeWidth="3.5"
                                  strokeDasharray={`${Math.min(100, Math.max(0, scoredRow.factors.quality ?? 0))}, 100`}
                                  className="transition-all duration-700 ease-out"
                                />
                              </svg>
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className={`text-[11px] font-black font-mono ${getScoreColorClass(scoredRow.factors.quality)}`}>
                                  {scoredRow.factors.quality !== null ? scoredRow.factors.quality.toFixed(0) : "—"}
                                </span>
                              </div>
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="text-[10px] uppercase font-bold text-theme-text-muted block truncate">
                                {language === "EN" ? "Quality" : "Calidad"}
                              </span>
                              <span className={`text-[10px] font-mono font-bold ${getScoreColorClass(scoredRow.factors.quality)} block truncate`}>
                                {scoredRow.factors.quality !== null 
                                  ? (scoredRow.factors.quality >= 75 
                                      ? (language === "EN" ? "High" : "Alta") 
                                      : scoredRow.factors.quality >= 50 
                                      ? (language === "EN" ? "Solid" : "Sólida") 
                                      : scoredRow.factors.quality >= 35 
                                      ? (language === "EN" ? "Medium" : "Media") 
                                      : (language === "EN" ? "Low" : "Baja")) 
                                  : "—"}
                              </span>
                            </div>
                          </div>

                          {/* Stability */}
                          <div className="bg-theme-card/70 p-2.5 rounded-xl border border-theme-border/50 flex items-center gap-2.5">
                            <div className="relative w-9 h-9 flex items-center justify-center shrink-0">
                              <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                                <path
                                  className="text-theme-sidebar"
                                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="3.5"
                                />
                                <path
                                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                  fill="none"
                                  stroke={getScoreHex(scoredRow.factors.stability)}
                                  strokeWidth="3.5"
                                  strokeDasharray={`${Math.min(100, Math.max(0, scoredRow.factors.stability ?? 0))}, 100`}
                                  className="transition-all duration-700 ease-out"
                                />
                              </svg>
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className={`text-[11px] font-black font-mono ${getScoreColorClass(scoredRow.factors.stability)}`}>
                                  {scoredRow.factors.stability !== null ? scoredRow.factors.stability.toFixed(0) : "—"}
                                </span>
                              </div>
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="text-[10px] uppercase font-bold text-theme-text-muted block truncate">
                                {language === "EN" ? "Stability" : "Estabilidad"}
                              </span>
                              <span className={`text-[10px] font-mono font-bold ${getScoreColorClass(scoredRow.factors.stability)} block truncate`}>
                                {scoredRow.factors.stability !== null 
                                  ? (scoredRow.factors.stability >= 75 
                                      ? (language === "EN" ? "Secure" : "Segura") 
                                      : scoredRow.factors.stability >= 50 
                                      ? (language === "EN" ? "Stable" : "Estable") 
                                      : scoredRow.factors.stability >= 35 
                                      ? (language === "EN" ? "Fair" : "Aceptable") 
                                      : (language === "EN" ? "Volatile" : "Volátil")) 
                                  : "—"}
                              </span>
                            </div>
                          </div>

                          {/* Valuation */}
                          <div className="bg-theme-card/70 p-2.5 rounded-xl border border-theme-border/50 flex items-center gap-2.5">
                            <div className="relative w-9 h-9 flex items-center justify-center shrink-0">
                              <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                                <path
                                  className="text-theme-sidebar"
                                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="3.5"
                                />
                                <path
                                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                  fill="none"
                                  stroke={getScoreHex(scoredRow.factors.valuation)}
                                  strokeWidth="3.5"
                                  strokeDasharray={`${Math.min(100, Math.max(0, scoredRow.factors.valuation ?? 0))}, 100`}
                                  className="transition-all duration-700 ease-out"
                                />
                              </svg>
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className={`text-[11px] font-black font-mono ${getScoreColorClass(scoredRow.factors.valuation)}`}>
                                  {scoredRow.factors.valuation !== null ? scoredRow.factors.valuation.toFixed(0) : "—"}
                                </span>
                              </div>
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="text-[10px] uppercase font-bold text-theme-text-muted block truncate">
                                {language === "EN" ? "Valuation" : "Valoración"}
                              </span>
                              <span className={`text-[10px] font-mono font-bold ${getScoreColorClass(scoredRow.factors.valuation)} block truncate`}>
                                {scoredRow.factors.valuation !== null 
                                  ? (scoredRow.factors.valuation >= 75 
                                      ? (language === "EN" ? "Cheap" : "Atractiva") 
                                      : scoredRow.factors.valuation >= 50 
                                      ? (language === "EN" ? "Fair" : "Razonable") 
                                      : scoredRow.factors.valuation >= 35 
                                      ? (language === "EN" ? "Premium" : "Exigente") 
                                      : (language === "EN" ? "Expensive" : "Cara")) 
                                  : "—"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Price Targets Sub-section */}
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-theme-text-muted block mb-2">
                        {language === "EN" ? "Wall Street Price Targets" : "Precios Objetivo de Analistas"}
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {/* Low Target */}
                        <div className="bg-theme-input p-3.5 rounded-xl border border-theme-border">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] uppercase font-bold text-theme-text-muted">
                              {language === "EN" ? "Low Target" : "Obj. Mínimo"}
                            </span>
                            {stockData.targetLowPrice && stockData.price && (
                              <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full ${
                                stockData.targetLowPrice >= stockData.price
                                  ? "bg-emerald-500/10 text-emerald-400"
                                  : "bg-rose-500/10 text-rose-400"
                              }`}>
                                {stockData.targetLowPrice >= stockData.price ? "+" : ""}
                                {(((stockData.targetLowPrice - stockData.price) / stockData.price) * 100).toFixed(1)}%
                              </span>
                            )}
                          </div>
                          <div className="text-base sm:text-lg font-mono font-bold text-rose-400 mt-1">
                            {formatCurrency(stockData.targetLowPrice)}
                          </div>
                        </div>

                        {/* Mean Target */}
                        <div className="bg-theme-input p-3.5 rounded-xl border border-emerald-500/30 shadow-inner">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] uppercase font-bold text-emerald-400">
                              {language === "EN" ? "Avg Target" : "Obj. Medio"}
                            </span>
                            {stockData.targetMeanPrice && stockData.price && (
                              <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full ${
                                stockData.targetMeanPrice >= stockData.price
                                  ? "bg-emerald-500/10 text-emerald-400"
                                  : "bg-rose-500/10 text-rose-400"
                              }`}>
                                {stockData.targetMeanPrice >= stockData.price ? "+" : ""}
                                {(((stockData.targetMeanPrice - stockData.price) / stockData.price) * 100).toFixed(1)}%
                              </span>
                            )}
                          </div>
                          <div className="text-lg sm:text-xl font-mono font-black text-theme-text-bright mt-1">
                            {formatCurrency(stockData.targetMeanPrice)}
                          </div>
                        </div>

                        {/* High Target */}
                        <div className="bg-theme-input p-3.5 rounded-xl border border-theme-border">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] uppercase font-bold text-theme-text-muted">
                              {language === "EN" ? "High Target" : "Obj. Máximo"}
                            </span>
                            {stockData.targetHighPrice && stockData.price && (
                              <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full ${
                                stockData.targetHighPrice >= stockData.price
                                  ? "bg-emerald-500/10 text-emerald-400"
                                  : "bg-rose-500/10 text-rose-400"
                              }`}>
                                {stockData.targetHighPrice >= stockData.price ? "+" : ""}
                                {(((stockData.targetHighPrice - stockData.price) / stockData.price) * 100).toFixed(1)}%
                              </span>
                            )}
                          </div>
                          <div className="text-base sm:text-lg font-mono font-bold text-emerald-400 mt-1">
                            {formatCurrency(stockData.targetHighPrice)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* COMPANY PROFILE & DESCRIPTION */}
                <div className="bg-theme-card border border-theme-border p-6 rounded-2xl shadow-md space-y-4 h-full flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Building2 size={18} className="text-blue-400" />
                      <h4 className="font-bold text-sm text-theme-text-bright uppercase tracking-wider">
                        {language === "EN" ? "About the Company" : "Perfil Corporativo & Negocio"}
                      </h4>
                    </div>

                    {stockData.profile.description && (
                      <div>
                        <p className={`text-xs text-theme-text-muted leading-relaxed ${isBioExpanded ? "" : "line-clamp-4"}`}>
                          {stockData.profile.description}
                        </p>
                        {stockData.profile.description.length > 220 && (
                          <button
                            onClick={() => setIsBioExpanded(!isBioExpanded)}
                            className="mt-2 text-xs font-bold text-emerald-400 hover:underline cursor-pointer flex items-center gap-1"
                          >
                            <span>{isBioExpanded ? (language === "EN" ? "Show Less" : "Mostrar Menos") : (language === "EN" ? "Read Full Description" : "Leer Descripción Completa")}</span>
                            {isBioExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Key Executives */}
                  {stockData.profile.officers && stockData.profile.officers.length > 0 && (
                    <div className="pt-3 border-t border-theme-border/60 mt-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-theme-text-muted block mb-2.5 flex items-center gap-1.5">
                        <Users size={13} className="text-emerald-400" />
                        {language === "EN" ? "Key Company Executives" : "Principales Directivos"}
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {stockData.profile.officers.slice(0, 4).map((off, idx) => (
                          <div key={idx} className="bg-theme-input p-2.5 rounded-xl border border-theme-border">
                            <div className="font-bold text-xs text-theme-text-bright truncate">{off.name}</div>
                            <div className="text-[10.5px] text-theme-text-muted truncate mt-0.5">{off.title}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

              </div>

            </div>
          )}

          {/* 7. TAB CONTENT: FINANCIAL STATEMENTS */}
          {activeSubTab === "financials" && (
            <div className="space-y-4">
              <CompanyFinancials language={language} tickers={[stockData.symbol]} />
            </div>
          )}

          {/* 8. TAB CONTENT: 3-STATEMENT MODEL & DCF VALUATION */}
          {activeSubTab === "threestatements" && stockData && (
            <div className="space-y-4">
              <ThreeStatementModel 
                initialTicker={stockData.symbol}
                portfolioTickers={[stockData.symbol]}
                language={language}
                theme={theme}
              />
            </div>
          )}

          {/* 9. TAB CONTENT: BOGLE */}
          {activeSubTab === "bogle" && stockData && (
            <div className="bg-theme-card border border-theme-border rounded-3xl p-6">
              <SingleStockBogleAnalysis 
                ticker={stockData.symbol} 
                language={language}
                theme={theme}
              />
            </div>
          )}

        </>
      ) : null}

    </div>
  );
}
