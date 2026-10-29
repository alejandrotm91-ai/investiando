import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Holding, Position, PortfolioData, TabType, SidebarTabType, UserPortfolio } from "./types";
import { getMarketStatus } from "./utils/market";
import SummaryDashboard from "./components/SummaryDashboard";
import HoldingsTable from "./components/HoldingsTable";
import HedgeFundReport from "./components/HedgeFundReport";
import AnalystInsights from "./components/AnalystInsights";
import StockScorecard from "./components/StockScorecard";
import WhatIfSimulator from "./components/WhatIfSimulator";
import AskAIAnalyst from "./components/AskAIAnalyst";
import EditHoldingsModal from "./components/EditHoldingsModal";
import CreatePortfolioAIModal from "./components/CreatePortfolioAIModal";
import Sidebar from "./components/Sidebar";
import MarketDashboard from "./components/MarketDashboard";
import WatchlistDashboard from "./components/WatchlistDashboard";
import EarningsCalendar from "./components/EarningsCalendar";
import SupportDashboard from "./components/SupportDashboard";
import AccountSettings from "./components/AccountSettings";
import LandingPage from "./components/LandingPage";
import SuperinvestorsCardsPage from "./components/SuperinvestorsCardsPage";
import StockSearchExplorer from "./components/StockSearchExplorer";
import BogleAnalysisDashboard from "./components/BogleAnalysisDashboard";
import { TopTickersMarquee } from "./components/TopTickersMarquee";
import EducationalDisclaimerModal from "./components/EducationalDisclaimerModal";
import WelcomePlatformModal from "./components/WelcomePlatformModal";
import AppWalkthrough from "./components/AppWalkthrough";
import { saveUserCloudData, subscribeUserCloudData } from "./lib/firebase";
import { fetchFinancialsForTickers, getAllCachedFinancials } from "./utils/financialsCache";
import { 
  BarChart3, 
  Briefcase, 
  Award, 
  Sparkles, 
  BrainCircuit, 
  Activity, 
  RefreshCw, 
  Layers, 
  Menu,
  ShieldAlert,
  LogIn,
  ArrowLeft,
  ArrowRight,
  FileText,
  Compass,
  Scale,
  Edit2,
  Trash2,
  Plus,
  PlusCircle,
  Check,
  X,
  Calculator,
  HelpCircle,
  Sliders
} from "lucide-react";


const LOCAL_STORAGE_KEY = "stock_tracker_user_holdings";

// Default 12-position High-Quality Compounders portfolio (max 14% single-position weight)
export const DEFAULT_COMPOUNDERS_HOLDINGS: Holding[] = [
  { ticker: "MSFT", shares: 31.82, avgCost: 440.00 }, // 14% weight (~$14,000)
  { ticker: "AAPL", shares: 53.33, avgCost: 225.00 }, // 12% weight (~$12,000)
  { ticker: "NVDA", shares: 88.00, avgCost: 125.00 }, // 11% weight (~$11,000)
  { ticker: "GOOGL", shares: 55.56, avgCost: 180.00 }, // 10% weight (~$10,000)
  { ticker: "META", shares: 19.23, avgCost: 520.00 },  // 10% weight (~$10,000)
  { ticker: "MA", shares: 16.49, avgCost: 485.00 },    // 8%  weight (~$8,000)
  { ticker: "COST", shares: 9.04, avgCost: 885.00 },   // 8%  weight (~$8,000)
  { ticker: "NFLX", shares: 10.29, avgCost: 680.00 },  // 7%  weight (~$7,000)
  { ticker: "LLY", shares: 6.67, avgCost: 900.00 },    // 6%  weight (~$6,000)
  { ticker: "MELI", shares: 2.56, avgCost: 1950.00 },  // 5%  weight (~$5,000)
  { ticker: "UBER", shares: 66.67, avgCost: 75.00 },   // 5%  weight (~$5,000)
  { ticker: "NU", shares: 275.86, avgCost: 14.50 }     // 4%  weight (~$4,000)
];
const DEFAULT_HOLDINGS: Holding[] = DEFAULT_COMPOUNDERS_HOLDINGS;

import { SUPERINVESTORS } from "./superinvestors";

function sanitizeUserPortfolios(ports: any[], fallbackLanguage: "EN" | "ES" = "ES"): UserPortfolio[] {
  if (!Array.isArray(ports)) return [];
  const result: UserPortfolio[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < Math.min(ports.length, 2); i++) {
    const p = ports[i];
    if (!p) continue;
    let id = typeof p.id === "string" && p.id.trim() ? p.id.trim() : "";
    if (!id || seenIds.has(id)) {
      if (!seenIds.has("portfolio-1")) {
        id = "portfolio-1";
      } else if (!seenIds.has("portfolio-2")) {
        id = "portfolio-2";
      } else {
        id = `portfolio-${Date.now()}-${i + 1}`;
      }
    }
    seenIds.add(id);

    const defaultName = id === "portfolio-1"
      ? (fallbackLanguage === "EN" ? "High-Quality Compounders" : "Compounders de Alta Calidad")
      : (fallbackLanguage === "EN" ? "Portfolio 2" : "Portafolio 2");

    result.push({
      id,
      name: typeof p.name === "string" && p.name.trim() ? p.name.trim() : defaultName,
      holdings: Array.isArray(p.holdings) ? p.holdings : [],
      createdAt: p.createdAt || new Date().toISOString(),
      updatedAt: p.updatedAt
    });
  }

  return result;
}

function getUnusedPortfolioId(existingPorts: UserPortfolio[]): string {
  const existingIds = new Set(existingPorts.map(p => p.id));
  if (!existingIds.has("portfolio-1")) return "portfolio-1";
  if (!existingIds.has("portfolio-2")) return "portfolio-2";
  return `portfolio-${Date.now()}`;
}

export default function App() {
  const [sidebarTab, setSidebarTab] = useState<SidebarTabType>("market");
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>("user");
  const [language, setLanguage] = useState<"EN" | "ES">("EN");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState<boolean>(false);
  const [selectedStockTicker, setSelectedStockTicker] = useState<string>("NVDA");
  
  const [activeTab, setActiveTab] = useState<TabType>("summary");
  const [hedgeFundSubTab, setHedgeFundSubTab] = useState<"memo" | "stress" | "factors" | "ai_analyst">("memo");
  const [holdingsTabMode, setHoldingsTabMode] = useState<"basis" | "valuation" | "health" | "financials">("basis");

  // User Portfolios (Maximum 2 portfolios per user)
  const [userPortfolios, setUserPortfolios] = useState<UserPortfolio[]>([]);
  const [activeUserPortfolioId, setActiveUserPortfolioId] = useState<string>("");
  const [editingPortfolioNameId, setEditingPortfolioNameId] = useState<string | null>(null);
  const [tempPortfolioName, setTempPortfolioName] = useState<string>("");

  const [portfolioData, setPortfolioData] = useState<PortfolioData | null>(null);
  const [userPortfolioData, setUserPortfolioData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [showAddPortfolioModal, setShowAddPortfolioModal] = useState<boolean>(false);
  const [newPortfolioName, setNewPortfolioName] = useState<string>("");
  const [showCreateAIModal, setShowCreateAIModal] = useState<boolean>(false);
  const [showNoPortfoliosModal, setShowNoPortfoliosModal] = useState<boolean>(false);
  const [portfolioToDelete, setPortfolioToDelete] = useState<UserPortfolio | null>(null);
  const [deleteConfirmChecked, setDeleteConfirmChecked] = useState<boolean>(false);
  const [selectedChartTicker, setSelectedChartTicker] = useState<string>("PORTFOLIO");
  const [marketOpen, setMarketOpen] = useState<boolean>(getMarketStatus().isOpen);
  const [headerIndices, setHeaderIndices] = useState<any[]>([
    { nameEN: "S&P 500 Index", nameES: "Índice S&P 500", symbol: "^GSPC", price: "7,743.41", change: "+39.28", changePct: 0.51 },
    { nameEN: "Nasdaq Composite", nameES: "Nasdaq Composite", symbol: "^IXIC", price: "27,068.72", change: "+129.34", changePct: 0.48 }
  ]);
  const [indicesLoading, setIndicesLoading] = useState<boolean>(false);
  const [financialsMap, setFinancialsMap] = useState<Record<string, { annual: any[]; quarterly: any[] }>>(() => getAllCachedFinancials());

  useEffect(() => {
    if (!portfolioData?.positions) return;
    const tickers = portfolioData.positions
      .filter((p) => !p.isCash && p.ticker && p.ticker.toUpperCase() !== "CASH" && p.ticker.toUpperCase() !== "USD")
      .map((p) => p.ticker);
    if (tickers.length === 0) return;

    fetchFinancialsForTickers(tickers).then((map) => {
      setFinancialsMap({ ...map });
    });
  }, [portfolioData?.positions]);

  const displayPositions = useMemo(() => {
    return portfolioData?.positions?.filter(p => p.ticker !== "MARGIN_PAID") || [];
  }, [portfolioData?.positions]);

  const displayPortfolioData = useMemo(() => {
    if (!portfolioData) return null;
    return {
      ...portfolioData,
      positions: displayPositions,
    };
  }, [portfolioData, displayPositions]);

  const activeUserPortfolio = useMemo(() => {
    return userPortfolios.find(p => p.id === activeUserPortfolioId) || userPortfolios[0] || {
      id: "portfolio-1",
      name: language === "EN" ? "High-Quality Compounders" : "Compounders de Alta Calidad",
      holdings: DEFAULT_COMPOUNDERS_HOLDINGS
    };
  }, [userPortfolios, activeUserPortfolioId, language]);

  const fetchHeaderIndices = useCallback(async () => {
    setIndicesLoading(true);
    try {
      const res = await fetch("/api/market/indices");
      if (res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setHeaderIndices(data);
          }
        }
      }
    } catch (err) {
      console.warn("Notice: could not load header indices:", err);
    } finally {
      setIndicesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHeaderIndices();
    const interval = setInterval(fetchHeaderIndices, 30000);
    return () => clearInterval(interval);
  }, [fetchHeaderIndices]);

  const [superinvestorWeights, setSuperinvestorWeights] = useState<Record<string, number>>({
    buffett: 30,
    hohn: 10,
    gates: 15,
    ackman: 10,
    klarman: 10,
    tepper: 5,
    einhorn: 5,
    lilu: 5,
    gerstner: 5,
    aschenbrenner: 5,
    wood: 0,
    laffont: 0,
  });

  useEffect(() => {
    const checkMarket = () => {
      setMarketOpen(getMarketStatus().isOpen);
    };
    checkMarket();
    const interval = setInterval(checkMarket, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (theme === "light") {
      document.documentElement.classList.add("light");
      document.documentElement.classList.remove("dark");
    } else {
      document.documentElement.classList.remove("light");
      document.documentElement.classList.add("dark");
    }
  }, [theme]);

  // User session state variables
  const [user, setUser] = useState<{ id: string; name: string; email: string } | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState<boolean>(true);
  const [showWelcomeModal, setShowWelcomeModal] = useState<boolean>(false);
  const [isManualWelcome, setIsManualWelcome] = useState<boolean>(false);
  const [showDisclaimerModal, setShowDisclaimerModal] = useState<boolean>(false);
  const [showWalkthrough, setShowWalkthrough] = useState<boolean>(false);

  // Check auth session on startup
  useEffect(() => {
    const savedToken = localStorage.getItem("stock_tracker_user_token");
    if (!savedToken) {
      setCheckingAuth(false);
      const hasSeenWelcome = localStorage.getItem("investiando_welcome_seen") === "true";
      if (!hasSeenWelcome) {
        setIsManualWelcome(false);
        setShowWelcomeModal(true);
      } else if (sessionStorage.getItem("investiando_disclaimer_accepted_session") !== "true") {
        setShowDisclaimerModal(true);
      } else if (localStorage.getItem("investiando_walkthrough_completed") !== "true") {
        setShowWalkthrough(true);
      }
      return;
    }

    const checkToken = async () => {
      try {
        const res = await fetch("/api/auth/me", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: savedToken })
        });
        if (res.ok && res.headers.get("content-type")?.includes("application/json")) {
          const data = await res.json();
          setUser(data.user);
          setToken(savedToken);
          
          const hasSeenWelcome = localStorage.getItem("investiando_welcome_seen") === "true" || 
            (data.user?.email ? localStorage.getItem(`investiando_welcome_seen_${data.user.email}`) === "true" : false);

          if (!hasSeenWelcome) {
            setIsManualWelcome(false);
            setShowWelcomeModal(true);
          } else if (sessionStorage.getItem("investiando_disclaimer_accepted_session") !== "true") {
            setShowDisclaimerModal(true);
          } else if (localStorage.getItem("investiando_walkthrough_completed") !== "true") {
            setShowWalkthrough(true);
          }
        } else {
          localStorage.removeItem("stock_tracker_user_token");
        }
      } catch (err) {
        console.error("Auth check failed:", err);
      } finally {
        setCheckingAuth(false);
      }
    };

    checkToken();
  }, []);

  const getPortfoliosStorageKey = useCallback(() => {
    return user ? `stock_tracker_user_portfolios_${user.email}` : "stock_tracker_user_portfolios";
  }, [user]);

  const getActivePortfolioStorageKey = useCallback(() => {
    return user ? `stock_tracker_active_portfolio_id_${user.email}` : "stock_tracker_active_portfolio_id";
  }, [user]);

  const getLegacyStorageKey = useCallback(() => {
    return user ? `stock_tracker_user_holdings_${user.email}` : LOCAL_STORAGE_KEY;
  }, [user]);

  // Load portfolios on mount or when user changes + real-time Firestore sync
  useEffect(() => {
    if (checkingAuth) return;

    const portKey = getPortfoliosStorageKey();
    const activeKey = getActivePortfolioStorageKey();
    const legacyKey = getLegacyStorageKey();

    const storedPorts = localStorage.getItem(portKey);
    const storedActiveId = localStorage.getItem(activeKey);
    const storedLegacy = localStorage.getItem(legacyKey);

    let initialPortfolios: UserPortfolio[] = [];

    if (storedPorts) {
      try {
        const parsed = JSON.parse(storedPorts);
        if (Array.isArray(parsed) && parsed.length > 0) {
          initialPortfolios = sanitizeUserPortfolios(parsed, language);
        }
      } catch (e) {
        console.error("Error parsing stored portfolios:", e);
      }
    }

    if (initialPortfolios.length === 0 && storedLegacy) {
      try {
        const parsedLegacy = JSON.parse(storedLegacy);
        if (Array.isArray(parsedLegacy) && parsedLegacy.length > 0) {
          initialPortfolios = [
            {
              id: "portfolio-1",
              name: language === "EN" ? "High-Quality Compounders" : "Compounders de Alta Calidad",
              holdings: parsedLegacy
            }
          ];
        }
      } catch (e) {
        console.error("Error parsing stored legacy holdings:", e);
      }
    }

    // Default portfolio for new users (or empty state): 8 High-Quality Compounders
    if (initialPortfolios.length === 0) {
      initialPortfolios = [
        {
          id: "portfolio-1",
          name: language === "EN" ? "High-Quality Compounders" : "Compounders de Alta Calidad",
          holdings: DEFAULT_COMPOUNDERS_HOLDINGS,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];
    }

    // Persist sanitized version if different or present to ensure no duplicate keys exist in local storage
    if (initialPortfolios.length > 0) {
      localStorage.setItem(portKey, JSON.stringify(initialPortfolios));
      const validActiveId = storedActiveId && initialPortfolios.some(p => p.id === storedActiveId)
        ? storedActiveId
        : initialPortfolios[0].id;
      setActiveUserPortfolioId(validActiveId);
      localStorage.setItem(activeKey, validActiveId);
    } else {
      setActiveUserPortfolioId("");
    }

    setUserPortfolios(initialPortfolios);

    // If logged in, subscribe to Firebase Firestore for cloud synchronization across devices
    if (user?.email) {
      const unsubscribe = subscribeUserCloudData(user.email, (cloudData) => {
        if (cloudData && Array.isArray(cloudData.portfolios)) {
          if (cloudData.portfolios.length > 0) {
            let cloudPorts = sanitizeUserPortfolios(cloudData.portfolios, language);
            const hasAnyHoldings = cloudPorts.some(p => p.holdings && p.holdings.length > 0);
            if (!hasAnyHoldings) {
              cloudPorts = [
                {
                  id: "portfolio-1",
                  name: language === "EN" ? "High-Quality Compounders" : "Compounders de Alta Calidad",
                  holdings: DEFAULT_COMPOUNDERS_HOLDINGS,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString()
                }
              ];
              saveUserCloudData(user.email, {
                portfolios: cloudPorts,
                activePortfolioId: "portfolio-1",
                holdings: DEFAULT_COMPOUNDERS_HOLDINGS
              });
            }
            setUserPortfolios(cloudPorts);
            localStorage.setItem(portKey, JSON.stringify(cloudPorts));
            const nextActive = cloudData.activePortfolioId && cloudPorts.some(p => p.id === cloudData.activePortfolioId)
              ? cloudData.activePortfolioId
              : cloudPorts[0].id;
            setActiveUserPortfolioId(nextActive);
            localStorage.setItem(activeKey, nextActive);
          } else {
            const defaultPorts: UserPortfolio[] = [
              {
                id: "portfolio-1",
                name: language === "EN" ? "High-Quality Compounders" : "Compounders de Alta Calidad",
                holdings: DEFAULT_COMPOUNDERS_HOLDINGS,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              }
            ];
            setUserPortfolios(defaultPorts);
            localStorage.setItem(portKey, JSON.stringify(defaultPorts));
            setActiveUserPortfolioId("portfolio-1");
            localStorage.setItem(activeKey, "portfolio-1");
            saveUserCloudData(user.email, {
              portfolios: defaultPorts,
              activePortfolioId: "portfolio-1",
              holdings: DEFAULT_COMPOUNDERS_HOLDINGS
            });
          }
        } else if (cloudData && Array.isArray(cloudData.holdings) && cloudData.holdings.length > 0) {
          // Push legacy cloud holdings into portfolio-1 locally only; never mutate Firestore inside a listener
          const migrated: UserPortfolio[] = [
            {
              id: "portfolio-1",
              name: language === "EN" ? "High-Quality Compounders" : "Compounders de Alta Calidad",
              holdings: cloudData.holdings
            }
          ];
          setUserPortfolios(migrated);
          localStorage.setItem(portKey, JSON.stringify(migrated));
        } else {
          // Fresh account without saved portfolios in cloud
          const defaultPorts: UserPortfolio[] = [
            {
              id: "portfolio-1",
              name: language === "EN" ? "High-Quality Compounders" : "Compounders de Alta Calidad",
              holdings: DEFAULT_COMPOUNDERS_HOLDINGS,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          ];
          setUserPortfolios(defaultPorts);
          localStorage.setItem(portKey, JSON.stringify(defaultPorts));
          setActiveUserPortfolioId("portfolio-1");
          localStorage.setItem(activeKey, "portfolio-1");
          saveUserCloudData(user.email, {
            portfolios: defaultPorts,
            activePortfolioId: "portfolio-1",
            holdings: DEFAULT_COMPOUNDERS_HOLDINGS
          });
        }
      });
      return () => unsubscribe();
    }
  }, [user, checkingAuth, getPortfoliosStorageKey, getActivePortfolioStorageKey, getLegacyStorageKey, language]);

  // Fetch portfolio quotes & calculations with retry & fallback
  const fetchQuotesAndCalculations = useCallback(async (currentHoldings: Holding[], isRefresh = false) => {
    if (!currentHoldings || currentHoldings.length === 0) {
      setPortfolioData(null);
      setLoading(false);
      return;
    }
    
    if (isRefresh) setRefreshing(true);
    else {
      setLoading(true);
      setPortfolioData(null);
    }

    const executeFetch = async () => {
      let lastErr: any = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const response = await fetch("/api/portfolio/quotes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ holdings: currentHoldings }),
          });
          if (response.ok && response.headers.get("content-type")?.includes("application/json")) {
            const data = await response.json();
            return data;
          }
        } catch (e) {
          lastErr = e;
          if (attempt < 2) {
            await new Promise(r => setTimeout(r, 600));
          }
        }
      }
      if (lastErr) throw lastErr;
      return null;
    };

    try {
      const data = await executeFetch();
      if (data && Array.isArray(data.positions)) {
        setPortfolioData(data);
        if (selectedPortfolioId === "user") {
          setUserPortfolioData(data);
        }
      }
    } catch (err) {
      console.warn("Portfolio quotes API unavailable, calculating offline fallback:", err);
      // Construct fallback portfolio data so the UI remains interactive
      const fallbackPositions: Position[] = currentHoldings.map(h => {
        const shares = Number(h.shares) || 0;
        const avgCost = Number(h.avgCost) || 0;
        const price = avgCost > 0 ? avgCost : 100;
        const mktValue = shares * price;
        return {
          ticker: h.ticker,
          name: h.ticker,
          price,
          shares,
          avgCost,
          mktValue,
          weight: 0,
          pe: null,
          fwdPe: null,
          peg: null,
          dailyPnL: 0,
          chgPct: 0,
          returnAmt: 0,
          returnPct: 0,
          isCash: h.ticker.toUpperCase() === "CASH" || Boolean(h.isCash),
          isMargin: Boolean(h.isMargin),
        };
      });
      const totalMktValue = fallbackPositions.reduce((s, p) => s + p.mktValue, 0);
      const totalCostBasis = fallbackPositions.reduce((s, p) => s + (p.shares * p.avgCost), 0);
      fallbackPositions.forEach(p => {
        p.weight = totalMktValue > 0 ? (p.mktValue / totalMktValue) * 100 : 0;
      });
      const fallbackData: PortfolioData = {
        positions: fallbackPositions,
        totals: {
          mktValue: totalMktValue,
          costBasis: totalCostBasis,
          dailyPnL: 0,
          dailyPnLPercent: 0,
          totalReturn: totalMktValue - totalCostBasis,
          totalReturnPercent: totalCostBasis > 0 ? ((totalMktValue - totalCostBasis) / totalCostBasis) * 100 : 0,
        }
      };
      setPortfolioData(fallbackData);
      if (selectedPortfolioId === "user") {
        setUserPortfolioData(fallbackData);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedPortfolioId]);

  const getActiveHoldings = useCallback(() => {
    if (selectedPortfolioId === "user") {
      const active = userPortfolios.find(p => p.id === activeUserPortfolioId) || userPortfolios[0];
      return active?.holdings || [];
    }
    return SUPERINVESTORS[selectedPortfolioId]?.holdings || [];
  }, [selectedPortfolioId, userPortfolios, activeUserPortfolioId]);

  // Reset activeTab if superinvestor view is selected and current tab is not available
  useEffect(() => {
    if (selectedPortfolioId !== "user" && activeTab !== "summary" && activeTab !== "holdings") {
      setActiveTab("summary");
    }
  }, [selectedPortfolioId, activeTab]);

  // Sync holdings to backend calculations
  useEffect(() => {
    if (selectedPortfolioId === "combined") {
      const fetchCombined = async () => {
        setLoading(true);
        setPortfolioData(null);
        try {
          const response = await fetch("/api/superinvestors/combined", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ weights: superinvestorWeights }),
          });
          if (response.ok && response.headers.get("content-type")?.includes("application/json")) {
            const data = await response.json();
            setPortfolioData(data);
          } else {
            console.warn("Notice: combined superinvestors not ready yet");
          }
        } catch (err) {
          console.warn("Notice fetching combined superinvestors:", err);
        } finally {
          setLoading(false);
        }
      };
      fetchCombined();
    } else {
      const currentActiveHoldings = getActiveHoldings();
      if (currentActiveHoldings.length > 0) {
        fetchQuotesAndCalculations(currentActiveHoldings);
      } else {
        setPortfolioData(null);
        if (selectedPortfolioId === "user") {
          setUserPortfolioData(null);
        }
        setLoading(false);
      }
    }
  }, [selectedPortfolioId, userPortfolios, activeUserPortfolioId, fetchQuotesAndCalculations, getActiveHoldings, superinvestorWeights]);

  const handleSelectUserPortfolio = (portfolioId: string) => {
    setActiveUserPortfolioId(portfolioId);
    const activeKey = getActivePortfolioStorageKey();
    localStorage.setItem(activeKey, portfolioId);
    if (user?.email) {
      saveUserCloudData(user.email, { activePortfolioId: portfolioId });
    }
  };

  const handleSaveHoldings = async (newHoldings: Holding[], portfolioName?: string, targetPortfolioId?: string) => {
    let updatedPortfolios = sanitizeUserPortfolios(userPortfolios, language);
    let nextActiveId = activeUserPortfolioId;

    if (updatedPortfolios.length === 0) {
      const newId = "portfolio-1";
      const newPort: UserPortfolio = {
        id: newId,
        name: portfolioName ? portfolioName.trim() : (language === "EN" ? "Main Portfolio" : "Portafolio Principal"),
        holdings: newHoldings,
        createdAt: new Date().toISOString()
      };
      updatedPortfolios = [newPort];
      nextActiveId = newId;
    } else if (targetPortfolioId === "new") {
      // Create 2nd portfolio with guaranteed unique unused ID
      const newId = getUnusedPortfolioId(updatedPortfolios);
      const newPort: UserPortfolio = {
        id: newId,
        name: portfolioName ? portfolioName.trim() : (language === "EN" ? "Second Portfolio" : "Segundo Portafolio"),
        holdings: newHoldings,
        createdAt: new Date().toISOString()
      };
      if (updatedPortfolios.length >= 2) {
        updatedPortfolios[1] = newPort;
      } else {
        updatedPortfolios.push(newPort);
      }
      nextActiveId = newId;
    } else {
      const targetId = targetPortfolioId || activeUserPortfolioId || updatedPortfolios[0].id;
      const idx = updatedPortfolios.findIndex(p => p.id === targetId);
      if (idx >= 0) {
        updatedPortfolios[idx] = {
          ...updatedPortfolios[idx],
          name: portfolioName ? portfolioName.trim() : updatedPortfolios[idx].name,
          holdings: newHoldings,
          updatedAt: new Date().toISOString()
        };
        nextActiveId = targetId;
      } else if (updatedPortfolios.length < 2) {
        const newId = getUnusedPortfolioId(updatedPortfolios);
        const newPort: UserPortfolio = {
          id: newId,
          name: portfolioName ? portfolioName.trim() : (language === "EN" ? `Portfolio 2` : `Portafolio 2`),
          holdings: newHoldings,
          createdAt: new Date().toISOString()
        };
        updatedPortfolios.push(newPort);
        nextActiveId = newPort.id;
      }
    }

    updatedPortfolios = sanitizeUserPortfolios(updatedPortfolios, language);

    setUserPortfolios(updatedPortfolios);
    setActiveUserPortfolioId(nextActiveId);

    const portKey = getPortfoliosStorageKey();
    localStorage.setItem(portKey, JSON.stringify(updatedPortfolios));
    const activeKey = getActivePortfolioStorageKey();
    localStorage.setItem(activeKey, nextActiveId);

    const currentPort = updatedPortfolios.find(p => p.id === nextActiveId) || updatedPortfolios[0];
    const legacyKey = getLegacyStorageKey();
    if (currentPort) {
      localStorage.setItem(legacyKey, JSON.stringify(currentPort.holdings));
    }

    // Optimistically update positions and dashboard metrics immediately
    if (portfolioData && Array.isArray(portfolioData.positions)) {
      const currentPositions = portfolioData.positions;
      const updatedPositions = newHoldings.map((h) => {
        const existing = currentPositions.find(
          (p) => p.ticker.toUpperCase() === h.ticker.toUpperCase()
        );
        const shares = Number(h.shares) || 0;
        const avgCost = Number(h.avgCost) || existing?.avgCost || 0;
        let price = existing?.price || avgCost || 1;
        let mktValue = h.isCash || h.ticker.toUpperCase() === "CASH" ? shares : shares * price;
        let costBasis = shares * avgCost;
        let returnAmt = mktValue - costBasis;
        let returnPct = costBasis > 0 ? (returnAmt / costBasis) * 100 : 0;
        
        if (h.ticker.toUpperCase() === "MARGIN_PAID") {
          price = 0;
          mktValue = 0;
          costBasis = 0;
          returnAmt = 0;
          returnPct = 0;
        }

        return {
          ticker: h.ticker.toUpperCase(),
          name: existing?.name || h.ticker.toUpperCase(),
          price,
          shares,
          avgCost,
          mktValue,
          weight: 0,
          pe: existing?.pe ?? null,
          fwdPe: existing?.fwdPe ?? null,
          peg: existing?.peg ?? null,
          evEbitda: existing?.evEbitda ?? null,
          dividendRate: existing?.dividendRate ?? null,
          dailyPnL: existing?.dailyPnL ?? 0,
          chgPct: existing?.chgPct ?? 0,
          returnAmt,
          returnPct,
          isCash: Boolean(h.isCash || h.ticker.toUpperCase() === "CASH"),
          isMargin: Boolean(h.isMargin),
          isAfterHoursPrice: existing?.isAfterHoursPrice ?? false,
          postMarketPrice: existing?.postMarketPrice ?? null,
          preMarketPrice: existing?.preMarketPrice ?? null,
          marketState: existing?.marketState ?? "REGULAR",
          fiftyTwoWeekHigh: existing?.fiftyTwoWeekHigh ?? null,
          targetMeanPrice: existing?.targetMeanPrice ?? null,
        };
      });

      const totalMktValue = updatedPositions.reduce((s, p) => s + p.mktValue, 0);
      const totalCostBasis = updatedPositions.reduce((s, p) => s + (p.shares * p.avgCost), 0);
      updatedPositions.forEach((p) => {
        p.weight = totalMktValue > 0 ? (p.mktValue / totalMktValue) * 100 : 0;
      });

      const optimisticData: PortfolioData = {
        ...portfolioData,
        positions: updatedPositions,
        totals: {
          ...portfolioData.totals,
          mktValue: totalMktValue,
          costBasis: totalCostBasis,
          totalReturn: totalMktValue - totalCostBasis,
          totalReturnPercent: totalCostBasis > 0 ? ((totalMktValue - totalCostBasis) / totalCostBasis) * 100 : 0,
        },
      };

      setPortfolioData(optimisticData);
      if (selectedPortfolioId === "user") {
        setUserPortfolioData(optimisticData);
      }
    }

    if (user?.email) {
      await saveUserCloudData(user.email, {
        portfolios: updatedPortfolios,
        activePortfolioId: nextActiveId,
        holdings: currentPort?.holdings || []
      });
    }

    // Refresh live market quotes in background without blanking screen
    fetchQuotesAndCalculations(newHoldings, true);
  };

  const handleRenamePortfolio = (portfolioId: string, newName: string) => {
    const clean = newName.trim();
    if (!clean) return;
    const updated = userPortfolios.map(p => p.id === portfolioId ? { ...p, name: clean, updatedAt: new Date().toISOString() } : p);
    setUserPortfolios(updated);
    const portKey = getPortfoliosStorageKey();
    localStorage.setItem(portKey, JSON.stringify(updated));
    if (user?.email) {
      saveUserCloudData(user.email, { portfolios: updated });
    }
    setEditingPortfolioNameId(null);
  };

  const handleDeletePortfolio = (portfolioId: string) => {
    const remaining = sanitizeUserPortfolios(userPortfolios.filter(p => p.id !== portfolioId), language);
    setUserPortfolios(remaining);
    const nextId = remaining.length > 0 ? remaining[0].id : "";
    setActiveUserPortfolioId(nextId);

    const portKey = getPortfoliosStorageKey();
    localStorage.setItem(portKey, JSON.stringify(remaining));
    const activeKey = getActivePortfolioStorageKey();
    localStorage.setItem(activeKey, nextId);

    const legacyKey = getLegacyStorageKey();
    if (remaining.length > 0) {
      localStorage.setItem(legacyKey, JSON.stringify(remaining[0].holdings));
    } else {
      localStorage.removeItem(legacyKey);
    }

    if (user?.email) {
      saveUserCloudData(user.email, {
        portfolios: remaining,
        activePortfolioId: nextId,
        holdings: remaining.length > 0 ? remaining[0].holdings : []
      });
    }
    setPortfolioToDelete(null);
  };

  const handleCreatePortfolioManual = () => {
    setShowAddPortfolioModal(false);

    let updatedPortfolios = sanitizeUserPortfolios(userPortfolios, language);
    const newId = getUnusedPortfolioId(updatedPortfolios);
    const defaultFallback = newId === "portfolio-1"
      ? (language === "EN" ? "High-Quality Compounders" : "Compounders de Alta Calidad")
      : (language === "EN" ? "Portfolio 2" : "Portafolio 2");

    const finalName = newPortfolioName.trim() || defaultFallback;
    const newPort: UserPortfolio = {
      id: newId,
      name: finalName,
      holdings: [],
      createdAt: new Date().toISOString()
    };

    if (updatedPortfolios.length === 0) {
      updatedPortfolios = [newPort];
    } else if (updatedPortfolios.length === 1) {
      updatedPortfolios = [updatedPortfolios[0], newPort];
    } else {
      updatedPortfolios[1] = newPort;
    }

    updatedPortfolios = sanitizeUserPortfolios(updatedPortfolios, language);
    setUserPortfolios(updatedPortfolios);
    setActiveUserPortfolioId(newId);

    const portKey = getPortfoliosStorageKey();
    localStorage.setItem(portKey, JSON.stringify(updatedPortfolios));
    const activeKey = getActivePortfolioStorageKey();
    localStorage.setItem(activeKey, newId);

    if (user?.email) {
      saveUserCloudData(user.email, {
        portfolios: updatedPortfolios,
        activePortfolioId: newId,
        holdings: []
      });
    }

    // Reset temporary name and open holdings editor
    setNewPortfolioName("");
    setShowEditModal(true);
  };

  const triggerManualRefresh = () => {
    fetchHeaderIndices();
    if (selectedPortfolioId === "combined") {
      setRefreshing(true);
      fetch("/api/superinvestors/combined", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weights: superinvestorWeights }),
      })
        .then((res) => (res.ok && res.headers.get("content-type")?.includes("application/json") ? res.json() : null))
        .then((data) => {
          if (data) setPortfolioData(data);
        })
        .catch((err) => console.warn("Notice fetching combined superinvestors:", err))
        .finally(() => setRefreshing(false));
    } else {
      const activeHoldings = getActiveHoldings();
      if (activeHoldings.length > 0) {
        fetchQuotesAndCalculations(activeHoldings, true);
      }
    }
  };

  const handleAuthSuccess = (authUser: { id: string; name: string; email: string }, authToken: string) => {
    localStorage.setItem("stock_tracker_user_token", authToken);
    setUser(authUser);
    setToken(authToken);

    const hasSeenWelcome = localStorage.getItem("investiando_welcome_seen") === "true" || 
      (authUser?.email ? localStorage.getItem(`investiando_welcome_seen_${authUser.email}`) === "true" : false);

    if (!hasSeenWelcome) {
      setIsManualWelcome(false);
      setShowWelcomeModal(true);
    } else if (sessionStorage.getItem("investiando_disclaimer_accepted_session") !== "true") {
      setShowDisclaimerModal(true);
    } else if (localStorage.getItem("investiando_walkthrough_completed") !== "true") {
      setShowWalkthrough(true);
    }
  };

  const handleContinueFromWelcome = () => {
    localStorage.setItem("investiando_welcome_seen", "true");
    if (user?.email) {
      localStorage.setItem(`investiando_welcome_seen_${user.email}`, "true");
    }
    sessionStorage.setItem("investiando_welcome_session", "true");
    setShowWelcomeModal(false);
    setIsManualWelcome(false);
    if (sessionStorage.getItem("investiando_disclaimer_accepted_session") !== "true") {
      setShowDisclaimerModal(true);
    } else if (localStorage.getItem("investiando_walkthrough_completed") !== "true") {
      setShowWalkthrough(true);
    }
  };

  const handleCloseWelcome = () => {
    localStorage.setItem("investiando_welcome_seen", "true");
    if (user?.email) {
      localStorage.setItem(`investiando_welcome_seen_${user.email}`, "true");
    }
    setShowWelcomeModal(false);
    setIsManualWelcome(false);
    if (sessionStorage.getItem("investiando_disclaimer_accepted_session") !== "true") {
      setShowDisclaimerModal(true);
    } else if (localStorage.getItem("investiando_walkthrough_completed") !== "true") {
      setShowWalkthrough(true);
    }
  };

  const handleAcceptDisclaimer = () => {
    sessionStorage.setItem("investiando_disclaimer_accepted_session", "true");
    setShowDisclaimerModal(false);
    if (localStorage.getItem("investiando_walkthrough_completed") !== "true") {
      setShowWalkthrough(true);
    }
  };

  const handleWalkthroughStepChange = (stepIndex: number) => {
    switch (stepIndex) {
      case 0: // Estadísticas del mercado general
        setSidebarTab("market");
        break;
      case 1: // Creación y gestión de portafolios
        setSidebarTab("portfolios");
        setSelectedPortfolioId("user");
        break;
      case 2: // Pestaña real: Basis
        setSidebarTab("portfolios");
        setActiveTab("holdings");
        setHoldingsTabMode("basis");
        {
          const active = userPortfolios.find(p => p.id === activeUserPortfolioId) || userPortfolios[0];
          if (active && active.holdings && active.holdings.length > 0) {
            setSelectedPortfolioId("user");
          } else {
            setSelectedPortfolioId("buffett");
          }
        }
        break;
      case 3: // Pestaña real: Valuation
        setSidebarTab("portfolios");
        setActiveTab("holdings");
        setHoldingsTabMode("valuation");
        {
          const active = userPortfolios.find(p => p.id === activeUserPortfolioId) || userPortfolios[0];
          if (active && active.holdings && active.holdings.length > 0) {
            setSelectedPortfolioId("user");
          } else {
            setSelectedPortfolioId("buffett");
          }
        }
        break;
      case 4: // Pestaña real: Health / Salud
        setSidebarTab("portfolios");
        setActiveTab("holdings");
        setHoldingsTabMode("health");
        {
          const active = userPortfolios.find(p => p.id === activeUserPortfolioId) || userPortfolios[0];
          if (active && active.holdings && active.holdings.length > 0) {
            setSelectedPortfolioId("user");
          } else {
            setSelectedPortfolioId("buffett");
          }
        }
        break;
      case 5: // Pestaña real: Financials / Financieros
        setSidebarTab("portfolios");
        setActiveTab("holdings");
        setHoldingsTabMode("financials");
        {
          const active = userPortfolios.find(p => p.id === activeUserPortfolioId) || userPortfolios[0];
          if (active && active.holdings && active.holdings.length > 0) {
            setSelectedPortfolioId("user");
          } else {
            setSelectedPortfolioId("buffett");
          }
        }
        break;
      case 6: // Superinversores
        setSidebarTab("portfolios");
        setSelectedPortfolioId("superinvestors");
        break;
      case 7: // Buscador y análisis de acciones (Stock Research)
        setSidebarTab("stocks");
        break;
    }
  };

  const handleCloseWalkthrough = () => {
    setShowWalkthrough(false);
    if (selectedPortfolioId === "buffett" && sidebarTab === "portfolios") {
      setSelectedPortfolioId("user");
    }
  };

  const handleSidebarTabChange = (tab: SidebarTabType) => {
    if (tab === "logout") {
      localStorage.removeItem("stock_tracker_user_token");
      sessionStorage.removeItem("investiando_disclaimer_accepted_session");
      sessionStorage.removeItem("investiando_welcome_session");
      setUser(null);
      setToken(null);
      setShowWelcomeModal(false);
      setShowDisclaimerModal(false);
      setSidebarTab("market");
    } else {
      setSidebarTab(tab);
      if (tab === "portfolios") {
        setActiveTab("summary");
      }
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center gap-4">
        <Activity className="animate-pulse text-emerald-400" size={36} />
        <span className="text-xs font-mono font-bold uppercase tracking-widest text-slate-500">
          {language === "EN" ? "Loading Terminal..." : "Cargando Terminal..."}
        </span>
      </div>
    );
  }

  if (!user) {
    return (
      <LandingPage 
        onAuthSuccess={handleAuthSuccess} 
        language={language} 
      />
    );
  }

  return (
    <div className="min-h-screen bg-theme-bg text-theme-text flex flex-col lg:flex-row overflow-x-hidden overflow-y-auto lg:overflow-hidden w-full max-w-full">
      
      {/* 1. DESKTOP SIDEBAR */}
      <div className="hidden lg:block w-64 h-screen sticky top-0 flex-shrink-0">
        <Sidebar
          activeTab={sidebarTab}
          onTabChange={handleSidebarTabChange}
          language={language}
          onLanguageChange={setLanguage}
          theme={theme}
          onThemeChange={setTheme}
          selectedPortfolioId={selectedPortfolioId}
          onPortfolioSelect={setSelectedPortfolioId}
          onStartWalkthrough={() => setShowWalkthrough(true)}
        />
      </div>

      {/* 2. MOBILE SIDEBAR OVERLAY DRAWER */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          {/* Backdrop overlay */}
          <div 
            className="fixed inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => setMobileSidebarOpen(false)}
          />
          {/* Sidebar container */}
          <div className="relative flex flex-col w-64 max-w-[85vw] h-full shadow-2xl">
            <Sidebar
              activeTab={sidebarTab}
              onTabChange={handleSidebarTabChange}
              language={language}
              onLanguageChange={setLanguage}
              theme={theme}
              onThemeChange={setTheme}
              onCloseMobile={() => setMobileSidebarOpen(false)}
              selectedPortfolioId={selectedPortfolioId}
              onPortfolioSelect={setSelectedPortfolioId}
              onStartWalkthrough={() => setShowWalkthrough(true)}
            />
          </div>
        </div>
      )}

      {/* 3. CONTENT FRAME (RIGHT PANELS) */}
      <div id="main-content-scroll-container" className="flex-1 flex flex-col h-screen overflow-y-auto min-w-0">
        
        {/* GLOBAL HEADER/NAVBAR */}
        <header className="border-b border-theme-border bg-theme-card/80 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4 shadow-md min-w-0">
          {/* Mobile menu button */}
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="lg:hidden p-2 rounded-xl border border-theme-border bg-theme-input text-theme-text-muted hover:text-theme-text-bright transition-all cursor-pointer flex-shrink-0"
            title="Open Menu"
          >
            <Menu size={18} />
          </button>

          {/* Top 50 Market Cap Tickers Scrolling Marquee */}
          <TopTickersMarquee />



          {/* Market open & User settings */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="hidden sm:flex items-center gap-2 bg-theme-input border border-theme-border px-3 py-1.5 rounded-full">
              <div className={`w-1.5 h-1.5 rounded-full ${marketOpen ? "bg-theme-green animate-pulse" : "bg-theme-red"}`}></div>
              <span className={`text-[9px] font-bold tracking-wider uppercase ${marketOpen ? "text-theme-green" : "text-theme-red"}`}>
                {marketOpen 
                  ? (language === "EN" ? "MARKET OPEN" : "MERCADO ABIERTO") 
                  : (language === "EN" ? "MARKET CLOSED" : "MERCADO CERRADO")}
              </span>
            </div>

            <button
              onClick={() => {
                setShowWalkthrough(true);
              }}
              className="p-2 rounded-xl border border-theme-border bg-theme-input hover:bg-theme-card-hover text-theme-text-muted hover:text-theme-text-bright transition-all cursor-pointer flex items-center gap-1.5"
              title={language === "EN" ? "Interactive Tour" : "Tour Guiado"}
            >
              <Sparkles size={14} className="text-emerald-400" />
              <span className="hidden xl:inline text-[11px] font-bold text-slate-300">
                {language === "EN" ? "Tour" : "Tour"}
              </span>
            </button>

            <button
              onClick={() => {
                setIsManualWelcome(true);
                setShowWelcomeModal(true);
              }}
              className="p-2 rounded-xl border border-theme-border bg-theme-input hover:bg-theme-card-hover text-theme-text-muted hover:text-theme-text-bright transition-all cursor-pointer"
              title={language === "EN" ? "Platform Guide & Mission" : "Guía y Propósito de la Plataforma"}
            >
              <HelpCircle size={14} className="text-emerald-400" />
            </button>

            <button
              onClick={triggerManualRefresh}
              disabled={refreshing || loading}
              className="p-2 rounded-xl border border-theme-border bg-theme-input hover:bg-theme-card-hover text-theme-text-muted hover:text-theme-text-bright transition-all cursor-pointer disabled:opacity-50"
              title={language === "EN" ? "Sync quotes" : "Sincronizar cotizaciones"}
            >
              <RefreshCw size={14} className={`${refreshing ? "animate-spin text-theme-green" : ""}`} />
            </button>

            <div className="flex items-center gap-2.5">
              <span className="text-xs font-semibold text-theme-text-muted hidden md:block">{user?.name || user?.email || "Investor"}</span>
              <div className="w-8 h-8 rounded-full border border-theme-border bg-theme-green/10 flex items-center justify-center shadow-md text-theme-green font-mono text-xs font-bold" title={user?.email || ""}>
                {(user?.name || user?.email || "IN").split(" ").map((n: string) => n ? n[0] : "").filter(Boolean).join("").substring(0, 2).toUpperCase() || "IN"}
              </div>
            </div>
          </div>
        </header>

        {/* CORE CONTAINER */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-5 sm:py-6 w-full max-w-[1580px] mx-auto">
          <div>
            {/* 1. VIEW PORTFOLIOS */}
            {sidebarTab === "portfolios" && (
              selectedPortfolioId === "superinvestors" ? (
                <SuperinvestorsCardsPage
                  onSelect={(id) => setSelectedPortfolioId(id)}
                  language={language}
                  theme={theme}
                />
              ) : selectedPortfolioId === "user" ? (
                <div className="space-y-6">
                  {/* USER MULTI-PORTFOLIO TABS (UP TO 2 PORTFOLIOS) */}
                  <div id="portfolio-management-bar" className="bg-[#0f111a]/40 border border-slate-900/40 p-4 sm:p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-lg backdrop-blur-md">
                    <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                      <span className={`text-[11px] font-bold uppercase tracking-wider mr-1 hidden sm:inline ${
                        theme === "light" ? "text-[#787366]" : "text-slate-400"
                      }`}>
                        {language === "EN" ? "Your Portfolios:" : "Tus Portafolios:"}
                      </span>
                          
                        {userPortfolios.map((portfolio, idx) => {
                          const isActive = portfolio.id === activeUserPortfolioId;
                          const isEditingThis = editingPortfolioNameId === portfolio.id;

                          return (
                            <div
                              key={`${portfolio.id || "portfolio"}-${idx}`}
                              className={`flex items-center rounded-xl p-1 transition-all border ${
                                isActive
                                  ? theme === "light"
                                    ? "bg-white border-emerald-600 shadow-md shadow-emerald-500/10 text-[#1b1917]"
                                    : "bg-slate-900/90 border-emerald-500/60 shadow-md shadow-emerald-500/10 text-white"
                                  : theme === "light"
                                    ? "bg-[#ebe8df] border-[#ded9cb] text-[#787366] hover:text-[#1b1917] hover:border-slate-300"
                                    : "bg-slate-950/50 border-slate-800/80 text-slate-400 hover:text-white hover:border-slate-700"
                              }`}
                            >
                              {isEditingThis ? (
                                <div className="flex items-center gap-1 px-2 py-0.5">
                                  <input
                                    type="text"
                                    value={tempPortfolioName}
                                    onChange={(e) => setTempPortfolioName(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") handleRenamePortfolio(portfolio.id, tempPortfolioName);
                                      if (e.key === "Escape") setEditingPortfolioNameId(null);
                                    }}
                                    autoFocus
                                    className={`text-xs rounded px-2 py-1 font-bold focus:outline-none w-36 border ${
                                      theme === "light"
                                        ? "bg-white text-[#1b1917] border-emerald-600"
                                        : "bg-slate-950 text-white border-emerald-500"
                                    }`}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleRenamePortfolio(portfolio.id, tempPortfolioName)}
                                    className={`p-1 cursor-pointer ${theme === "light" ? "text-emerald-700 hover:text-emerald-800" : "text-emerald-400 hover:text-emerald-300"}`}
                                    title={language === "EN" ? "Save name" : "Guardar nombre"}
                                  >
                                    <Check size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingPortfolioNameId(null)}
                                    className={`p-1 cursor-pointer ${theme === "light" ? "text-[#787366] hover:text-[#1b1917]" : "text-slate-500 hover:text-slate-400"}`}
                                    title={language === "EN" ? "Cancel" : "Cancelar"}
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center">
                                  <button
                                    type="button"
                                    onClick={() => handleSelectUserPortfolio(portfolio.id)}
                                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold cursor-pointer"
                                  >
                                    <span className={`w-2 h-2 rounded-full ${
                                      isActive 
                                        ? theme === "light" ? "bg-emerald-600" : "bg-emerald-400 animate-pulse" 
                                        : "bg-slate-400"
                                    }`} />
                                    <span className="truncate max-w-[130px] sm:max-w-[180px]">
                                      {idx + 1}. {portfolio.name}
                                    </span>
                                    <span className={`text-[10px] font-mono font-medium px-1.5 py-0.5 rounded border ${
                                      theme === "light"
                                        ? "bg-[#f7f5ef] text-[#787366] border-[#ded9cb]"
                                        : "bg-slate-950/80 text-slate-400 border-slate-800"
                                    }`}>
                                      {portfolio.holdings.length} {language === "EN" ? "pos" : "activos"}
                                    </span>
                                  </button>

                                  {/* Actions for Active Portfolio */}
                                  {isActive && (
                                    <div className={`flex items-center gap-0.5 pr-1.5 border-l pl-1.5 ${
                                      theme === "light" ? "border-[#ded9cb]" : "border-slate-800/80"
                                    }`}>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingPortfolioNameId(portfolio.id);
                                          setTempPortfolioName(portfolio.name);
                                        }}
                                        className={`p-1 rounded transition-colors cursor-pointer ${
                                          theme === "light" ? "text-[#787366] hover:text-emerald-700" : "text-slate-400 hover:text-emerald-400"
                                        }`}
                                        title={language === "EN" ? "Rename portfolio" : "Renombrar portafolio"}
                                      >
                                        <Edit2 size={12} />
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => {
                                          setPortfolioToDelete(portfolio);
                                          setDeleteConfirmChecked(false);
                                        }}
                                        className={`p-1 rounded transition-colors cursor-pointer ${
                                          theme === "light" ? "text-[#787366] hover:text-rose-600" : "text-slate-500 hover:text-rose-400"
                                        }`}
                                        title={language === "EN" ? "Delete portfolio" : "Eliminar portafolio"}
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {/* Option to create Portfolio if fewer than 2 exist */}
                        {userPortfolios.length < 2 && (
                          <button
                            id="add-portfolio-btn"
                            type="button"
                            onClick={() => {
                              const defaultName = userPortfolios.length === 0
                                ? (language === "EN" ? "Main Portfolio" : "Portafolio Principal")
                                : (language === "EN" ? `Portfolio ${userPortfolios.length + 1}` : `Portafolio ${userPortfolios.length + 1}`);
                              setNewPortfolioName(defaultName);
                              setShowAddPortfolioModal(true);
                            }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-dashed transition-all cursor-pointer shadow-sm ${
                              theme === "light"
                                ? "text-emerald-800 hover:text-emerald-900 bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-600/50 hover:border-emerald-600"
                                : "text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/40 hover:border-emerald-500/70"
                            }`}
                            title="+ Add Portfolio"
                            aria-label="+ Add Portfolio"
                          >
                            <Plus size={14} className="shrink-0" />
                            <span>+ Add Portfolio</span>
                          </button>
                        )}
                      </div>

                      <div className={`text-[11px] font-mono flex items-center gap-1.5 self-end md:self-center ${
                        theme === "light" ? "text-[#787366]" : "text-slate-500"
                      }`}>
                        <span>{language === "EN" ? "Capacity:" : "Capacidad:"}</span>
                        <span className={`font-bold ${theme === "light" ? "text-[#1b1917]" : "text-slate-300"}`}>
                          {userPortfolios.length} / 2 {language === "EN" ? "Portfolios" : "Portafolios"}
                        </span>
                      </div>
                    </div>

                    {/* EMPTY STATE OR TABS DASHBOARD */}
                    {loading && !portfolioData && activeUserPortfolio.holdings.length > 0 ? (
                      <div className="py-24 flex flex-col items-center justify-center gap-4 text-theme-text-muted">
                        <Activity className="animate-pulse text-theme-green" size={36} />
                        <span className="text-xs font-bold uppercase tracking-widest pulse-subtle">
                          {language === "EN" ? "SYNCING INVESTIANDO TERMINAL..." : "SINCRONIZANDO TERMINAL..."}
                        </span>
                      </div>
                    ) : userPortfolios.length === 0 || activeUserPortfolio.holdings.length === 0 || !portfolioData ? (
                      <div className={`p-8 sm:p-14 rounded-3xl border text-center flex flex-col items-center justify-center max-w-2xl mx-auto my-6 ${
                        theme === "light"
                          ? "bg-white/90 border-[#ded9cb] shadow-lg text-[#1b1917]"
                          : "bg-[#0b0f19]/90 border-slate-850 shadow-2xl text-white backdrop-blur-md"
                      }`}>
                        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-5 shadow-inner">
                          <Briefcase size={32} />
                        </div>

                        <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight mb-2">
                          {userPortfolios.length === 0
                            ? (language === "EN" ? "No Investment Portfolios Created Yet" : "Aún no tienes ningún portafolio creado")
                            : (language === "EN" ? `Portfolio "${activeUserPortfolio.name}" is Empty` : `El portafolio "${activeUserPortfolio.name}" está vacío`)}
                        </h3>

                        <p className={`text-xs sm:text-sm max-w-md mx-auto mb-8 leading-relaxed ${
                          theme === "light" ? "text-[#787366]" : "text-slate-400"
                        }`}>
                          {userPortfolios.length === 0
                            ? (language === "EN" 
                                ? "Create your first portfolio using AI-driven intelligent capital allocation, or add your stocks and cash manually to start monitoring."
                                : "Crea tu primer portafolio usando asignación inteligente con IA, o añade tus acciones y efectivo manualmente para empezar a monitorear.")
                            : (language === "EN"
                                ? "Add your positions with purchase prices and share counts to track real-time valuations, fundamentals, Warren Buffett & Bogle scores, and projections."
                                : "Añade tus posiciones con precios de compra y número de acciones para ver valuaciones en tiempo real, fundamentales, métricas Bogle y proyecciones.")}
                        </p>

                        <div className="flex flex-col sm:flex-row items-center gap-3 w-full justify-center max-w-md">
                          <button
                            onClick={() => setShowCreateAIModal(true)}
                            className="w-full sm:w-auto px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer hover:scale-[1.02]"
                          >
                            <Sparkles size={16} />
                            <span>{language === "EN" ? "Create with AI Allocation" : "Crear Portafolio con IA"}</span>
                          </button>

                          <button
                            onClick={() => setShowEditModal(true)}
                            className={`w-full sm:w-auto px-5 py-3 rounded-xl border font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                              theme === "light"
                                ? "bg-[#f7f5ef] hover:bg-[#ebe8df] border-[#ded9cb] text-[#1b1917]"
                                : "bg-slate-900/90 hover:bg-slate-800 border-slate-700 text-white"
                            }`}
                          >
                            <Plus size={16} />
                            <span>{language === "EN" ? "Add Holdings Manually" : "Añadir Manualmente"}</span>
                          </button>
                        </div>

                        <div className="mt-8 pt-6 border-t border-slate-800/40 w-full flex items-center justify-center gap-2">
                          <button
                            onClick={() => setSelectedPortfolioId("superinvestors")}
                            className={`text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                              theme === "light" ? "text-emerald-700 hover:text-emerald-800" : "text-emerald-400 hover:text-emerald-300"
                            }`}
                          >
                            <Compass size={14} />
                            <span>{language === "EN" ? "Or explore Warren Buffett & Superinvestor Portfolios" : "O explora portafolios de Warren Buffett y Superinversores"}</span>
                            <ArrowRight size={13} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* CORE INTERACTIVE TABS BAR */}
                        <div className={`pb-2 border-b ${theme === "light" ? "border-[#ded9cb]/80" : "border-slate-900/60"} flex justify-center w-full mb-5 sm:mb-6`}>
                          <div 
                            className={`${
                              theme === "light"
                                ? "bg-[#eae6db]/90 border-[#ded9cb] shadow-sm"
                                : "bg-[#0b0d13]/90 border-slate-800/80 shadow-xl"
                            } backdrop-blur-md p-1.5 rounded-2xl flex items-center justify-between sm:justify-center gap-1 sm:gap-2 border w-full max-w-xl overflow-x-auto scrollbar-none`}
                          >
                            {[
                              { id: "summary", label: language === "EN" ? "Summary" : "Resumen", icon: BarChart3, available: true },
                              { id: "holdings", label: language === "EN" ? "Holdings" : "Posiciones", icon: Briefcase, available: true },
                              { id: "whatif", label: language === "EN" ? "Simulation" : "Simulación", icon: Sparkles, available: true },
                              { id: "analysis", label: language === "EN" ? "Analysis" : "Análisis", icon: Compass, available: true },
                            ].map(tab => {
                              const IconComponent = tab.icon;
                              const isActive = activeTab === tab.id;
                              return (
                                <button
                                  key={tab.id}
                                  onClick={() => setActiveTab(tab.id as TabType)}
                                  className={`flex-1 sm:flex-initial px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl flex items-center justify-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs font-bold uppercase tracking-wider transition-all duration-300 cursor-pointer shrink-0 border ${
                                    isActive
                                      ? theme === "light"
                                        ? "bg-white text-[#1b1917] border-[#ded9cb] shadow-sm"
                                        : "bg-[#1e2230] text-white border-slate-700/50 shadow-md"
                                      : theme === "light"
                                        ? "bg-transparent text-[#787366] border-transparent hover:bg-black/5 hover:text-[#1b1917]"
                                        : "bg-transparent text-slate-400 border-transparent hover:bg-white/5 hover:text-white"
                                  }`}
                                >
                                  <IconComponent size={14} className={`shrink-0 transition-colors ${isActive ? (theme === "light" ? "text-emerald-600" : "text-emerald-400") : "opacity-80"}`} />
                                  <span className="truncate">{tab.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* View Render Router */}
                        {activeTab === "summary" && (
                          <SummaryDashboard 
                            portfolio={displayPortfolioData || portfolioData} 
                            onSelectTickerForChart={(t) => setSelectedChartTicker(t)}
                            onNavigateToHealth={() => {
                              setActiveTab("holdings");
                              setHoldingsTabMode("health");
                            }}
                            language={language} 
                            portfolioName={activeUserPortfolio.name}
                            isReadOnly={false}
                            theme={theme}
                            financialsMap={financialsMap}
                          />
                        )}

                        {activeTab === "holdings" && (
                          <HoldingsTable
                            positions={displayPositions}
                            loading={loading}
                            onEditHoldings={() => setShowEditModal(true)}
                            language={language}
                            isReadOnly={false}
                            initialTabMode={holdingsTabMode}
                            onTabModeChange={(mode) => setHoldingsTabMode(mode)}
                            financialsMap={financialsMap}
                          />
                        )}

                        {activeTab === "analyst" && (
                          <AnalystInsights positions={displayPositions} language={language} />
                        )}

                        {activeTab === "whatif" && (
                          <WhatIfSimulator portfolio={displayPortfolioData || portfolioData} language={language} userEmail={user?.email} />
                        )}

                        {activeTab === "analysis" && (
                          <BogleAnalysisDashboard 
                            portfolio={displayPortfolioData || portfolioData} 
                            language={language}
                            theme={theme}
                          />
                        )}
                      </>
                    )}
                  </div>
                ) : loading && !portfolioData ? (
                  <div className="py-24 flex flex-col items-center justify-center gap-4 text-theme-text-muted">
                    <Activity className="animate-pulse text-theme-green" size={36} />
                    <span className="text-xs font-bold uppercase tracking-widest pulse-subtle">
                      {language === "EN" ? "SYNCING SUPERINVESTOR DATA..." : "SINCRONIZANDO DATOS..."}
                    </span>
                  </div>
                ) : portfolioData ? (
                  <div className="space-y-6">
                    {/* BACK BUTTON FOR INDIVIDUAL SUPERINVESTOR */}
                    <button
                      onClick={() => setSelectedPortfolioId("superinvestors")}
                      className="flex items-center gap-2 text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer mb-2 group w-fit"
                    >
                      <ArrowLeft size={14} className="transform group-hover:-translate-x-1 transition-transform" />
                      {language === "EN" ? "BACK TO SUPERINVESTORS" : "VOLVER A SUPERINVERSORES"}
                    </button>

                    {/* CORE INTERACTIVE TABS BAR FOR SUPERINVESTOR */}
                    <div className={`pb-2 border-b ${theme === "light" ? "border-[#ded9cb]/80" : "border-slate-900/60"} flex justify-center w-full mb-5 sm:mb-6`}>
                      <div 
                        className={`${
                          theme === "light"
                            ? "bg-[#eae6db]/90 border-[#ded9cb] shadow-sm"
                            : "bg-[#0b0d13]/90 border-slate-800/80 shadow-xl"
                        } backdrop-blur-md p-1.5 rounded-2xl flex items-center justify-between sm:justify-center gap-1 sm:gap-2 border w-full max-w-md overflow-x-auto scrollbar-none`}
                      >
                        {[
                          { id: "summary", label: language === "EN" ? "Summary" : "Resumen", icon: BarChart3 },
                          { id: "holdings", label: language === "EN" ? "Holdings" : "Posiciones", icon: Briefcase },
                          { id: "analysis", label: language === "EN" ? "Analysis" : "Análisis", icon: Compass },
                        ].map(tab => {
                          const IconComponent = tab.icon;
                          const isActive = activeTab === tab.id;
                          return (
                            <button
                              key={tab.id}
                              onClick={() => setActiveTab(tab.id as TabType)}
                              className={`flex-1 sm:flex-initial px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl flex items-center justify-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs font-bold uppercase tracking-wider transition-all duration-300 cursor-pointer shrink-0 border ${
                                isActive
                                  ? theme === "light"
                                    ? "bg-white text-[#1b1917] border-[#ded9cb] shadow-sm"
                                    : "bg-[#1e2230] text-white border-slate-700/50 shadow-md"
                                  : theme === "light"
                                    ? "bg-transparent text-[#787366] border-transparent hover:bg-black/5 hover:text-[#1b1917]"
                                    : "bg-transparent text-slate-400 border-transparent hover:bg-white/5 hover:text-white"
                              }`}
                            >
                              <IconComponent size={14} className={`shrink-0 transition-colors ${isActive ? (theme === "light" ? "text-emerald-600" : "text-emerald-400") : "opacity-80"}`} />
                              <span className="truncate">{tab.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* STATIC COMBINED WEIGHTS COMPACT PANEL */}
                    {selectedPortfolioId === "combined" && (
                      <div className="bg-[#0f111a]/40 border border-slate-900/40 p-4 rounded-2xl mb-6 backdrop-blur-sm space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Compass className="text-emerald-400 animate-spin-slow" size={14} />
                            <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                              {language === "EN" ? "Combined Portfolio Composition" : "Composición del Portafolio Combinado"}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono font-medium text-slate-500">
                            {language === "EN" ? "Static Current Market Allocation" : "Asignación Estática Actual del Mercado"}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(SUPERINVESTORS).map(([key, si]) => {
                            const val = superinvestorWeights[key] ?? 0;
                            const sumOfWeights = Object.keys(superinvestorWeights).reduce((sum, k) => sum + (superinvestorWeights[k] ?? 0), 0) || 1;
                            const pct = ((val / sumOfWeights) * 100).toFixed(1);
                            if (val === 0) return null;
                            
                            const lastName = (si?.name || key).split(" ").pop() || si?.name || key;
                            
                            return (
                              <div key={key} className="bg-slate-950/60 border border-slate-900/60 px-3 py-1.5 rounded-xl flex items-center gap-2 text-[10px] shadow-sm hover:border-emerald-500/20 transition-all">
                                <span className="font-bold text-slate-300">{lastName}</span>
                                <span className="font-mono font-extrabold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-md">
                                  {pct}%
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* View Render Router for Superinvestor */}
                    {activeTab === "summary" && (
                      <SummaryDashboard 
                        portfolio={displayPortfolioData || portfolioData} 
                        onSelectTickerForChart={(t) => setSelectedChartTicker(t)}
                        onNavigateToHealth={() => {
                          setActiveTab("holdings");
                          setHoldingsTabMode("health");
                        }}
                        language={language} 
                        portfolioName={SUPERINVESTORS[selectedPortfolioId]?.name}
                        isReadOnly={true}
                        theme={theme}
                        financialsMap={financialsMap}
                      />
                    )}

                    {activeTab === "holdings" && (
                      <HoldingsTable
                        positions={displayPositions}
                        loading={loading}
                        onEditHoldings={() => setShowEditModal(true)}
                        language={language}
                        isReadOnly={true}
                        initialTabMode={holdingsTabMode}
                        onTabModeChange={(mode) => setHoldingsTabMode(mode)}
                        financialsMap={financialsMap}
                      />
                    )}

                    {activeTab === "analysis" && (
                      <BogleAnalysisDashboard 
                        portfolio={displayPortfolioData || portfolioData} 
                        language={language}
                        theme={theme}
                      />
                    )}
                  </div>
                ) : null
              )}

              {/* 2. VIEW MARKET */}
              {sidebarTab === "market" && (
                <MarketDashboard 
                  language={language} 
                  theme={theme}
                  portfolioData={selectedPortfolioId === "user" ? (displayPortfolioData || portfolioData) : userPortfolioData}
                  holdings={activeUserPortfolio.holdings}
                  onNavigateToPortfolio={() => {
                    setSelectedPortfolioId("user");
                    setSidebarTab("portfolios");
                    setActiveTab("summary");
                  }}
                  onOpenEditHoldings={() => {
                    setSelectedPortfolioId("user");
                    setShowEditModal(true);
                  }}
                  onOpenGetStarted={() => {
                    setShowNoPortfoliosModal(true);
                  }}
                  onSelectTicker={(ticker) => {
                    setSelectedStockTicker(ticker);
                    setSidebarTab("stocks");
                  }}
                />
              )}

              {/* 3. VIEW STOCKS (STOCK SEARCH & FUNDAMENTALS EXPLORER) */}
              {sidebarTab === "stocks" && (
                <StockSearchExplorer 
                  language={language} 
                  theme={theme} 
                  userEmail={user?.email}
                  initialTicker={selectedStockTicker}
                />
              )}

              {/* 4. VIEW WATCHLIST */}
              {sidebarTab === "watchlist" && (
                <WatchlistDashboard 
                  language={language} 
                  portfolioPositions={displayPositions}
                  userEmail={user?.email}
                />
              )}

              {/* 5. VIEW EARNINGS */}
              {sidebarTab === "earnings" && (
                <EarningsCalendar 
                  language={language} 
                  positions={displayPositions} 
                />
              )}

              {/* 6. VIEW SUPPORT */}
              {sidebarTab === "support" && (
                <SupportDashboard language={language} />
              )}

              {/* 7. VIEW ACCOUNT */}
              {sidebarTab === "account" && (
                <AccountSettings language={language} user={user} />
              )}

              {/* 8. VIEW LOGOUT */}
              {sidebarTab === "logout" && (
                <div className="py-20 flex flex-col items-center justify-center text-center max-w-sm mx-auto">
                  <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-850 flex items-center justify-center text-rose-500 mb-6 shadow-lg shadow-rose-500/5 animate-pulse">
                    <ShieldAlert size={28} />
                  </div>
                  <h3 className="text-lg font-bold text-white uppercase tracking-wider">
                    {language === "EN" ? "Session Disconnected" : "Sesión Finalizada"}
                  </h3>
                  <p className="text-xs text-slate-500 mt-2 font-sans leading-relaxed">
                    {language === "EN" 
                      ? "Your local stock terminal credentials have been safely cleared from current memory. Reconnect to resume."
                      : "Las credenciales locales de tu terminal se han cerrado de forma segura. Conéctate de nuevo para reanudar."}
                  </p>
                  <button
                    onClick={() => setSidebarTab("portfolios")}
                    className="mt-6 px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <LogIn size={15} />
                    {language === "EN" ? "Reconnect Terminal" : "Reconectar Terminal"}
                  </button>
                </div>
              )}
            </div>
        </main>

        {/* PERSISTENT FOOTER */}
        <footer className="border-t border-slate-900/60 bg-[#0f111a]/40 py-5 px-6 flex flex-col sm:flex-row items-center justify-between text-[10px] text-slate-600 font-medium tracking-wide uppercase mt-auto">
          <div className="flex gap-4">
            <span>investiando.ai Terminal API v2.4.1</span>
            <span>Latency: 35ms</span>
          </div>
          <div className="flex gap-4 mt-2 sm:mt-0">
            <span>Session ID: 4920-XF-22</span>
            <span className="text-emerald-500 font-bold">System Stable</span>
          </div>
        </footer>

      </div>

      {/* EDIT MODAL DIALOG */}
      {showEditModal && (
        <EditHoldingsModal
          holdings={activeUserPortfolio.holdings}
          positions={displayPositions}
          onClose={() => setShowEditModal(false)}
          onSave={(newHoldings) => handleSaveHoldings(newHoldings, activeUserPortfolio.name, activeUserPortfolio.id)}
          language={language}
        />
      )}

      {/* ADD PORTFOLIO CHOICE MODAL (MANUAL VS AI) */}
      {showAddPortfolioModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setShowAddPortfolioModal(false)}
        >
          <div 
            className={`relative w-full max-w-lg p-6 sm:p-7 rounded-3xl border shadow-2xl backdrop-blur-xl ${
              theme === "light"
                ? "bg-[#fcfbf9] border-[#ded9cb] text-[#1b1917]"
                : "bg-[#0b0f19] border-slate-800 shadow-emerald-950/20 text-white"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              type="button"
              onClick={() => setShowAddPortfolioModal(false)}
              className={`absolute top-5 right-5 p-2 rounded-xl transition-colors cursor-pointer ${
                theme === "light"
                  ? "text-[#787366] hover:text-[#1b1917] hover:bg-black/5"
                  : "text-slate-500 hover:text-white hover:bg-white/5"
              }`}
              title={language === "EN" ? "Close" : "Cerrar"}
            >
              <X size={18} />
            </button>

            {/* Header */}
            <div className="flex items-center gap-3.5 mb-5">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 shadow-inner">
                <Briefcase size={22} />
              </div>
              <div>
                <h3 className={`text-xl font-extrabold tracking-tight ${theme === "light" ? "text-[#1b1917]" : "text-white"}`}>
                  + Add Portfolio
                </h3>
                <p className={`text-xs mt-0.5 ${theme === "light" ? "text-[#787366]" : "text-slate-400"}`}>
                  {language === "EN" 
                    ? "Choose how you want to build this portfolio" 
                    : "¿Cómo deseas crear tu nuevo portafolio?"}
                </p>
              </div>
            </div>

            {/* Optional Portfolio Name Input */}
            <div className="mb-5">
              <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${
                theme === "light" ? "text-[#787366]" : "text-slate-400"
              }`}>
                {language === "EN" ? "Portfolio Name (Optional)" : "Nombre del portafolio (Opcional)"}
              </label>
              <input
                type="text"
                value={newPortfolioName}
                onChange={(e) => setNewPortfolioName(e.target.value)}
                placeholder={
                  userPortfolios.length === 0
                    ? (language === "EN" ? "Main Portfolio" : "Portafolio Principal")
                    : (language === "EN" ? `Portfolio ${userPortfolios.length + 1}` : `Portafolio ${userPortfolios.length + 1}`)
                }
                className={`w-full px-4 py-2.5 rounded-xl text-sm font-medium border focus:outline-none transition-all ${
                  theme === "light"
                    ? "bg-[#f7f5ef] border-[#ded9cb] text-[#1b1917] focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                    : "bg-slate-900/80 border-slate-700 text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                }`}
              />
            </div>

            {/* Two Choices: Using AI or Manual */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-5">
              {/* Choice 1: Using AI */}
              <button
                type="button"
                onClick={() => {
                  setShowAddPortfolioModal(false);
                  setShowCreateAIModal(true);
                }}
                className={`text-left p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between group hover:scale-[1.02] ${
                  theme === "light"
                    ? "bg-emerald-50/50 hover:bg-emerald-50 border-emerald-300/80 hover:border-emerald-500 shadow-sm"
                    : "bg-gradient-to-b from-emerald-950/20 to-slate-900/60 hover:from-emerald-950/40 hover:to-slate-900/90 border-emerald-500/30 hover:border-emerald-500/60 shadow-lg shadow-emerald-950/20"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                      <Sparkles size={20} />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      {language === "EN" ? "AI Smart" : "Con IA"}
                    </span>
                  </div>
                  <h4 className={`text-base font-bold mb-1.5 ${theme === "light" ? "text-emerald-950" : "text-white"}`}>
                    {language === "EN" ? "Using AI" : "Usando IA"}
                  </h4>
                  <p className={`text-xs leading-relaxed ${theme === "light" ? "text-[#5a554a]" : "text-slate-400"}`}>
                    {language === "EN"
                      ? "Automated capital allocation based on fundamental analysis, Warren Buffett filters and Bogle models."
                      : "Asignación inteligente con análisis fundamental, filtros de Warren Buffett y modelos Bogle."}
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-emerald-500/20 flex items-center justify-between text-xs font-bold text-emerald-500 group-hover:text-emerald-400">
                  <span>{language === "EN" ? "Start with AI" : "Comenzar con IA"}</span>
                  <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                </div>
              </button>

              {/* Choice 2: Manual */}
              <button
                type="button"
                onClick={handleCreatePortfolioManual}
                className={`text-left p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between group hover:scale-[1.02] ${
                  theme === "light"
                    ? "bg-[#f7f5ef] hover:bg-[#ebe8df] border-[#ded9cb] hover:border-slate-400 shadow-sm"
                    : "bg-gradient-to-b from-slate-900/60 to-slate-950/80 hover:from-slate-800/80 hover:to-slate-900 border-slate-800 hover:border-slate-700 shadow-lg shadow-black/40"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                      <Sliders size={20} />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                      {language === "EN" ? "Manual" : "Manual"}
                    </span>
                  </div>
                  <h4 className={`text-base font-bold mb-1.5 ${theme === "light" ? "text-[#1b1917]" : "text-white"}`}>
                    {language === "EN" ? "Manual" : "Hacerlo Manual"}
                  </h4>
                  <p className={`text-xs leading-relaxed ${theme === "light" ? "text-[#787366]" : "text-slate-400"}`}>
                    {language === "EN"
                      ? "Start with a clean blank portfolio to search tickers, input cost basis, share quantities and cash."
                      : "Inicia un portafolio en blanco para buscar tickers, precios de compra, acciones y efectivo."}
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs font-bold text-blue-400 group-hover:text-blue-300">
                  <span>{language === "EN" ? "Start Manually" : "Comenzar Manual"}</span>
                  <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                </div>
              </button>
            </div>

            {/* Footer slot capacity */}
            <div className={`text-[11px] font-mono flex items-center justify-between pt-3 border-t ${
              theme === "light" ? "border-[#ded9cb] text-[#787366]" : "border-slate-800/80 text-slate-500"
            }`}>
              <span>{language === "EN" ? "Portfolio Capacity:" : "Capacidad de portafolios:"}</span>
              <span className="font-bold text-emerald-400">
                {userPortfolios.length} / 2 {language === "EN" ? "Slots Used" : "Ocupados"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* CREATE PORTFOLIO WITH AI MODAL */}
      <CreatePortfolioAIModal
        isOpen={showCreateAIModal}
        onClose={() => setShowCreateAIModal(false)}
        onApplyPortfolio={handleSaveHoldings}
        language={language}
        theme={theme}
        userPortfolios={userPortfolios}
        activePortfolioId={activeUserPortfolioId}
        initialPortfolioName={newPortfolioName.trim() || undefined}
      />

      {/* DELETE PORTFOLIO CONFIRMATION POPUP MODAL */}
      {portfolioToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className={`w-full max-w-md rounded-2xl p-6 shadow-2xl relative border ${
            theme === "light"
              ? "bg-[#fcfbf9] border-rose-300 shadow-rose-900/10 text-[#1b1917]"
              : "bg-[#0f111a] border-rose-500/30 shadow-rose-950/40 text-white"
          }`}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-500 shrink-0">
                <Trash2 size={20} />
              </div>
              <div className="flex-1">
                <h3 className={`text-base font-bold ${theme === "light" ? "text-[#1b1917]" : "text-white"}`}>
                  {language === "EN" ? "Delete Portfolio" : "Eliminar Portafolio"}
                </h3>
                <p className={`text-xs mt-1 ${theme === "light" ? "text-[#787366]" : "text-slate-400"}`}>
                  {language === "EN"
                    ? `Are you sure you want to delete "${portfolioToDelete.name}"?`
                    : `¿Estás seguro de que deseas eliminar el portafolio "${portfolioToDelete.name}"?`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPortfolioToDelete(null);
                  setDeleteConfirmChecked(false);
                }}
                className={`p-1 rounded-lg transition-colors cursor-pointer ${
                  theme === "light" ? "text-[#787366] hover:text-[#1b1917]" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                <X size={18} />
              </button>
            </div>

            <div className={`my-5 p-3.5 border rounded-xl text-xs leading-relaxed ${
              theme === "light"
                ? "bg-rose-50 border-rose-200 text-rose-800"
                : "bg-rose-950/20 border-rose-900/40 text-rose-300/90"
            }`}>
              <span className={`font-bold block mb-0.5 ${theme === "light" ? "text-rose-900" : "text-rose-300"}`}>
                {language === "EN" ? "⚠️ Irreversible Action" : "⚠️ Acción Irreversible"}
              </span>
              {language === "EN"
                ? `All ${portfolioToDelete.holdings.length} stock positions and weights associated with this portfolio will be permanently deleted.`
                : `Se eliminarán permanentemente las ${portfolioToDelete.holdings.length} posiciones y ponderaciones asociadas a este portafolio.`}
            </div>

            {/* Confirmation Checkbox */}
            <label className={`flex items-start gap-3 p-3 border rounded-xl cursor-pointer transition-colors select-none ${
              theme === "light"
                ? "bg-[#f5f2eb] border-[#ded9cb] hover:bg-[#ede9df]"
                : "bg-slate-900/60 border-slate-800 hover:bg-slate-900"
            }`}>
              <input
                type="checkbox"
                checked={deleteConfirmChecked}
                onChange={(e) => setDeleteConfirmChecked(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-400 text-rose-600 focus:ring-rose-500 accent-rose-600 cursor-pointer"
              />
              <span className={`text-xs font-medium ${theme === "light" ? "text-[#3a3730]" : "text-slate-300"}`}>
                {language === "EN"
                  ? "I understand and confirm that I want to delete this portfolio permanently."
                  : "Entiendo las consecuencias y confirmo que deseo eliminar este portafolio definitivamente."}
              </span>
            </label>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => {
                  setPortfolioToDelete(null);
                  setDeleteConfirmChecked(false);
                }}
                className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  theme === "light"
                    ? "text-[#787366] hover:text-[#1b1917] bg-[#ebe8df] hover:bg-[#ded9cb] border-[#ded9cb]"
                    : "text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border-slate-800"
                }`}
              >
                {language === "EN" ? "Cancel" : "Cancelar"}
              </button>
              <button
                type="button"
                disabled={!deleteConfirmChecked}
                onClick={() => {
                  if (portfolioToDelete && deleteConfirmChecked) {
                    handleDeletePortfolio(portfolioToDelete.id);
                    setPortfolioToDelete(null);
                    setDeleteConfirmChecked(false);
                  }
                }}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  deleteConfirmChecked
                    ? "bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30"
                    : theme === "light"
                      ? "bg-[#ded9cb] text-slate-400 cursor-not-allowed border border-[#ded9cb]"
                      : "bg-slate-800/80 text-slate-500 cursor-not-allowed border border-slate-800"
                }`}
              >
                <Trash2 size={14} />
                <span>{language === "EN" ? "Confirm Delete" : "Confirmar y Eliminar"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* WELCOME PLATFORM INTRO MODAL */}
      <WelcomePlatformModal
        isOpen={showWelcomeModal}
        onContinue={handleContinueFromWelcome}
        onClose={handleCloseWelcome}
        isManualOpen={isManualWelcome}
        language={language}
        onLanguageChange={setLanguage}
      />
      {/* EDUCATIONAL DISCLAIMER MODAL */}
      <EducationalDisclaimerModal
        isOpen={showDisclaimerModal}
        onAccept={handleAcceptDisclaimer}
        language={language}
        onLanguageChange={setLanguage}
      />

      {/* NEW USER APPLICATION WALKTHROUGH */}
      <AppWalkthrough
        isOpen={showWalkthrough}
        onClose={handleCloseWalkthrough}
        language={language}
        theme={theme}
        onStepChange={handleWalkthroughStepChange}
        currentHoldingsMode={holdingsTabMode}
        onHoldingsModeChange={(mode) => setHoldingsTabMode(mode)}
      />

      {/* NO INVESTMENT PORTFOLIOS CREATED YET POPUP MODAL */}
      {showNoPortfoliosModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setShowNoPortfoliosModal(false)}
        >
          <div 
            className={`relative w-full max-w-lg p-7 sm:p-10 rounded-3xl border shadow-2xl text-center backdrop-blur-xl ${
              theme === "light"
                ? "bg-white/95 border-[#ded9cb] text-[#1b1917]"
                : "bg-[#0b0f19]/95 border-slate-800 shadow-emerald-950/20 text-white"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              type="button"
              onClick={() => setShowNoPortfoliosModal(false)}
              className={`absolute top-4 right-4 p-2 rounded-xl transition-colors cursor-pointer ${
                theme === "light"
                  ? "text-[#787366] hover:text-[#1b1917] hover:bg-black/5"
                  : "text-slate-500 hover:text-white hover:bg-white/5"
              }`}
              title={language === "EN" ? "Close" : "Cerrar"}
            >
              <X size={18} />
            </button>

            {/* Briefcase Icon matching image.png */}
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-5 shadow-inner mx-auto">
              <Briefcase size={32} />
            </div>

            {/* Heading */}
            <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight mb-2.5">
              {userPortfolios.length === 0
                ? (language === "EN" ? "No Investment Portfolios Created Yet" : "Aún no tienes ningún portafolio creado")
                : (language === "EN" ? `Portfolio "${activeUserPortfolio.name}" is Empty` : `El portafolio "${activeUserPortfolio.name}" está vacío`)}
            </h3>

            {/* Description */}
            <p className={`text-xs sm:text-sm max-w-md mx-auto mb-8 leading-relaxed ${
              theme === "light" ? "text-[#787366]" : "text-slate-400"
            }`}>
              {userPortfolios.length === 0
                ? (language === "EN"
                    ? "Create your first portfolio using AI-driven intelligent capital allocation, or add your stocks and cash manually to start monitoring."
                    : "Crea tu primer portafolio usando asignación inteligente con IA, o añade tus acciones y efectivo manualmente para empezar a monitorear.")
                : (language === "EN"
                    ? "Add your positions with purchase prices and share counts to track real-time valuations, fundamentals, Warren Buffett & Bogle scores, and projections."
                    : "Añade tus posiciones con precios de compra y número de acciones para ver valuaciones en tiempo real, fundamentales, métricas Bogle y proyecciones.")}
            </p>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full justify-center">
              <button
                type="button"
                onClick={() => {
                  setShowNoPortfoliosModal(false);
                  setShowCreateAIModal(true);
                }}
                className="w-full sm:w-auto flex-1 px-5 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition-all cursor-pointer hover:scale-[1.02]"
              >
                <Sparkles size={16} />
                <span>{language === "EN" ? "Create with AI Allocation" : "Crear Portafolio con IA"}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowNoPortfoliosModal(false);
                  setSelectedPortfolioId("user");
                  setShowEditModal(true);
                }}
                className={`w-full sm:w-auto flex-1 px-5 py-3.5 rounded-xl border font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer hover:scale-[1.02] ${
                  theme === "light"
                    ? "bg-[#f7f5ef] hover:bg-[#ebe8df] border-[#ded9cb] text-[#1b1917]"
                    : "bg-slate-900/90 hover:bg-slate-800 border-slate-700 text-white"
                }`}
              >
                <Plus size={16} />
                <span>{language === "EN" ? "Add Holdings Manually" : "Añadir Manualmente"}</span>
              </button>
            </div>

            {/* Footer Superinvestors Navigation */}
            <div className="mt-8 pt-6 border-t border-slate-800/40 w-full flex items-center justify-center">
              <button
                type="button"
                onClick={() => {
                  setShowNoPortfoliosModal(false);
                  setSelectedPortfolioId("superinvestors");
                  setSidebarTab("portfolios");
                }}
                className={`text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer group ${
                  theme === "light" ? "text-emerald-700 hover:text-emerald-800" : "text-emerald-400 hover:text-emerald-300"
                }`}
              >
                <Compass size={14} />
                <span>{language === "EN" ? "Or explore Warren Buffett & Superinvestor Portfolios" : "O explora portafolios de Warren Buffett y Superinversores"}</span>
                <ArrowRight size={13} className="transform group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
