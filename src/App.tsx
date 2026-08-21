import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Holding, PortfolioData, TabType, SidebarTabType, UserPortfolio } from "./types";
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
import { saveUserCloudData, subscribeUserCloudData } from "./lib/firebase";
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
  FileText,
  Compass,
  Scale,
  Edit2,
  Trash2,
  Plus,
  PlusCircle,
  Check,
  X,
  Calculator
} from "lucide-react";


const LOCAL_STORAGE_KEY = "stock_tracker_user_holdings";

// Seed holdings matching the user's screenshot exactly
const DEFAULT_HOLDINGS: Holding[] = [
  { ticker: "MSFT", shares: 48.12, avgCost: 422.32 },
  { ticker: "META", shares: 31.62, avgCost: 622.48 },
  { ticker: "NVDA", shares: 124.82, avgCost: 185.60 },
  { ticker: "AVGO", shares: 60.31, avgCost: 325.30 },
  { ticker: "AMZN", shares: 63.50, avgCost: 259.70 },
  { ticker: "MAGS", shares: 22.65, avgCost: 57.92 },
  { ticker: "GOOGL", shares: 41.62, avgCost: 350.49 },
  { ticker: "IREN", shares: 204.92, avgCost: 59.49 },
  { ticker: "CRWV", shares: 111.11, avgCost: 103.81 },
  { ticker: "CASH", shares: 14000.00, avgCost: 1, isCash: true },
];

import { SUPERINVESTORS } from "./superinvestors";

export default function App() {
  const [sidebarTab, setSidebarTab] = useState<SidebarTabType>("market");
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>("user");
  const [language, setLanguage] = useState<"EN" | "ES">("EN");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState<boolean>(false);
  
  const [activeTab, setActiveTab] = useState<TabType>("summary");
  const [hedgeFundSubTab, setHedgeFundSubTab] = useState<"memo" | "stress" | "factors" | "ai_analyst">("memo");
  const [holdingsTabMode, setHoldingsTabMode] = useState<"basis" | "valuation" | "health" | "financials">("basis");

  // User Portfolios (Maximum 2 portfolios per user)
  const [userPortfolios, setUserPortfolios] = useState<UserPortfolio[]>([
    {
      id: "portfolio-1",
      name: "Main Portfolio",
      holdings: DEFAULT_HOLDINGS
    }
  ]);
  const [activeUserPortfolioId, setActiveUserPortfolioId] = useState<string>("portfolio-1");
  const [editingPortfolioNameId, setEditingPortfolioNameId] = useState<string | null>(null);
  const [tempPortfolioName, setTempPortfolioName] = useState<string>("");

  const [portfolioData, setPortfolioData] = useState<PortfolioData | null>(null);
  const [userPortfolioData, setUserPortfolioData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [showCreateAIModal, setShowCreateAIModal] = useState<boolean>(false);
  const [portfolioToDelete, setPortfolioToDelete] = useState<UserPortfolio | null>(null);
  const [deleteConfirmChecked, setDeleteConfirmChecked] = useState<boolean>(false);
  const [selectedChartTicker, setSelectedChartTicker] = useState<string>("PORTFOLIO");
  const [marketOpen, setMarketOpen] = useState<boolean>(getMarketStatus().isOpen);
  const [headerIndices, setHeaderIndices] = useState<any[]>([
    { nameEN: "S&P 500 Index", nameES: "Índice S&P 500", symbol: "^GSPC", price: "7,452.48", change: "+40.50", changePct: 0.55 },
    { nameEN: "Nasdaq Composite", nameES: "Nasdaq Composite", symbol: "^IXIC", price: "25,119.21", change: "+143.38", changePct: 0.57 }
  ]);
  const [indicesLoading, setIndicesLoading] = useState<boolean>(false);

  const activeUserPortfolio = useMemo(() => {
    return userPortfolios.find(p => p.id === activeUserPortfolioId) || userPortfolios[0] || {
      id: "portfolio-1",
      name: language === "EN" ? "Main Portfolio" : "Portafolio Principal",
      holdings: DEFAULT_HOLDINGS
    };
  }, [userPortfolios, activeUserPortfolioId, language]);

  const fetchHeaderIndices = useCallback(async () => {
    setIndicesLoading(true);
    try {
      const res = await fetch("/api/market/indices");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setHeaderIndices(data);
        }
      }
    } catch (err) {
      console.error("Error loading header indices:", err);
    } finally {
      setIndicesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHeaderIndices();
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
    } else {
      document.documentElement.classList.remove("light");
    }
  }, [theme]);

  // User session state variables
  const [user, setUser] = useState<{ id: string; name: string; email: string } | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState<boolean>(true);

  // Check auth session on startup
  useEffect(() => {
    const savedToken = localStorage.getItem("stock_tracker_user_token");
    if (!savedToken) {
      setCheckingAuth(false);
      return;
    }

    const checkToken = async () => {
      try {
        const res = await fetch("/api/auth/me", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: savedToken })
        });
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          setToken(savedToken);
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
          initialPortfolios = parsed.slice(0, 2);
        }
      } catch (e) {
        console.error("Error parsing stored portfolios:", e);
      }
    }

    if (initialPortfolios.length === 0) {
      let legacyHoldings = DEFAULT_HOLDINGS;
      if (storedLegacy) {
        try {
          legacyHoldings = JSON.parse(storedLegacy);
        } catch (e) {
          legacyHoldings = DEFAULT_HOLDINGS;
        }
      }
      initialPortfolios = [
        {
          id: "portfolio-1",
          name: language === "EN" ? "Main Portfolio" : "Portafolio Principal",
          holdings: legacyHoldings
        }
      ];
    }

    setUserPortfolios(initialPortfolios);
    const validActiveId = storedActiveId && initialPortfolios.some(p => p.id === storedActiveId)
      ? storedActiveId
      : initialPortfolios[0].id;
    setActiveUserPortfolioId(validActiveId);

    // If logged in, subscribe to Firebase Firestore for cloud synchronization across devices
    if (user?.email) {
      const unsubscribe = subscribeUserCloudData(user.email, (cloudData) => {
        if (cloudData && Array.isArray(cloudData.portfolios) && cloudData.portfolios.length > 0) {
          const cloudPorts = cloudData.portfolios.slice(0, 2);
          setUserPortfolios(cloudPorts);
          localStorage.setItem(portKey, JSON.stringify(cloudPorts));
          if (cloudData.activePortfolioId && cloudPorts.some(p => p.id === cloudData.activePortfolioId)) {
            setActiveUserPortfolioId(cloudData.activePortfolioId);
            localStorage.setItem(activeKey, cloudData.activePortfolioId);
          }
        } else if (cloudData && Array.isArray(cloudData.holdings) && cloudData.holdings.length > 0) {
          // Push legacy cloud holdings into portfolio-1
          const migrated: UserPortfolio[] = [
            {
              id: "portfolio-1",
              name: language === "EN" ? "Main Portfolio" : "Portafolio Principal",
              holdings: cloudData.holdings
            }
          ];
          setUserPortfolios(migrated);
          localStorage.setItem(portKey, JSON.stringify(migrated));
          saveUserCloudData(user.email, { portfolios: migrated, activePortfolioId: "portfolio-1" });
        }
      });
      return () => unsubscribe();
    }
  }, [user, checkingAuth, getPortfoliosStorageKey, getActivePortfolioStorageKey, getLegacyStorageKey, language]);

  // Fetch portfolio quotes & calculations
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

    try {
      const response = await fetch("/api/portfolio/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdings: currentHoldings }),
      });
      const data = await response.json();
      setPortfolioData(data);
      if (selectedPortfolioId === "user") {
        setUserPortfolioData(data);
      }
    } catch (err) {
      console.error("Error fetching portfolio stats:", err);
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
          if (response.ok) {
            const data = await response.json();
            setPortfolioData(data);
          } else {
            console.error("Failed to fetch combined superinvestors:", response.statusText);
          }
        } catch (err) {
          console.error("Error fetching combined superinvestors:", err);
        } finally {
          setLoading(false);
        }
      };
      fetchCombined();
    } else {
      const currentActiveHoldings = getActiveHoldings();
      if (currentActiveHoldings.length > 0) {
        fetchQuotesAndCalculations(currentActiveHoldings);
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

  const handleSaveHoldings = (newHoldings: Holding[], portfolioName?: string, targetPortfolioId?: string) => {
    let updatedPortfolios = [...userPortfolios];
    let nextActiveId = activeUserPortfolioId;

    if (targetPortfolioId === "new") {
      // Create 2nd portfolio
      const newId = `portfolio-2`;
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
      const targetId = targetPortfolioId || activeUserPortfolioId;
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
        const newPort: UserPortfolio = {
          id: targetId || `portfolio-${updatedPortfolios.length + 1}`,
          name: portfolioName ? portfolioName.trim() : (language === "EN" ? `Portfolio ${updatedPortfolios.length + 1}` : `Portafolio ${updatedPortfolios.length + 1}`),
          holdings: newHoldings,
          createdAt: new Date().toISOString()
        };
        updatedPortfolios.push(newPort);
        nextActiveId = newPort.id;
      }
    }

    if (updatedPortfolios.length > 2) {
      updatedPortfolios = updatedPortfolios.slice(0, 2);
    }

    setUserPortfolios(updatedPortfolios);
    setActiveUserPortfolioId(nextActiveId);

    const portKey = getPortfoliosStorageKey();
    localStorage.setItem(portKey, JSON.stringify(updatedPortfolios));
    const activeKey = getActivePortfolioStorageKey();
    localStorage.setItem(activeKey, nextActiveId);

    const currentPort = updatedPortfolios.find(p => p.id === nextActiveId) || updatedPortfolios[0];
    const legacyKey = getLegacyStorageKey();
    localStorage.setItem(legacyKey, JSON.stringify(currentPort.holdings));

    if (user?.email) {
      saveUserCloudData(user.email, {
        portfolios: updatedPortfolios,
        activePortfolioId: nextActiveId,
        holdings: currentPort.holdings
      });
    }

    setShowEditModal(false);
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
    if (userPortfolios.length <= 1) return;
    const remaining = userPortfolios.filter(p => p.id !== portfolioId);
    setUserPortfolios(remaining);
    const nextId = remaining[0].id;
    setActiveUserPortfolioId(nextId);

    const portKey = getPortfoliosStorageKey();
    localStorage.setItem(portKey, JSON.stringify(remaining));
    const activeKey = getActivePortfolioStorageKey();
    localStorage.setItem(activeKey, nextId);

    const legacyKey = getLegacyStorageKey();
    localStorage.setItem(legacyKey, JSON.stringify(remaining[0].holdings));

    if (user?.email) {
      saveUserCloudData(user.email, {
        portfolios: remaining,
        activePortfolioId: nextId,
        holdings: remaining[0].holdings
      });
    }
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
        .then((res) => res.json())
        .then((data) => setPortfolioData(data))
        .catch((err) => console.error("Error fetching combined superinvestors:", err))
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
  };

  const handleSidebarTabChange = (tab: SidebarTabType) => {
    if (tab === "logout") {
      localStorage.removeItem("stock_tracker_user_token");
      setUser(null);
      setToken(null);
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
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-theme-sidebar border-r border-theme-border">
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
            />
          </div>
        </div>
      )}

      {/* 3. CONTENT FRAME (RIGHT PANELS) */}
      <div className="flex-1 flex flex-col h-screen overflow-y-auto min-w-0">
        
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
              onClick={triggerManualRefresh}
              disabled={refreshing || loading}
              className="p-2 rounded-xl border border-theme-border bg-theme-input hover:bg-theme-card-hover text-theme-text-muted hover:text-theme-text-bright transition-all cursor-pointer disabled:opacity-50"
              title={language === "EN" ? "Sync quotes" : "Sincronizar cotizaciones"}
            >
              <RefreshCw size={14} className={`${refreshing ? "animate-spin text-theme-green" : ""}`} />
            </button>

            <div className="flex items-center gap-2.5">
              <span className="text-xs font-semibold text-theme-text-muted hidden md:block">{user.name}</span>
              <div className="w-8 h-8 rounded-full border border-theme-border bg-theme-green/10 flex items-center justify-center shadow-md text-theme-green font-mono text-xs font-bold" title={user.email}>
                {user.name.split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        {/* CORE CONTAINER */}
        <main className="flex-1 px-4 sm:px-6 py-6 w-full max-w-7xl mx-auto">
          {loading && !portfolioData ? (
            <div className="py-32 flex flex-col items-center justify-center gap-4 text-theme-text-muted">
              <Activity className="animate-pulse text-theme-green" size={40} />
              <span className="text-xs font-bold uppercase tracking-widest pulse-subtle">
                {language === "EN" ? "SYNCING INVESTIANDO TERMINAL..." : "SINCRONIZANDO TERMINAL..."}
              </span>
            </div>
          ) : (
            <div>
              {/* 1. VIEW PORTFOLIOS */}
              {sidebarTab === "portfolios" && (
                selectedPortfolioId === "superinvestors" ? (
                  <SuperinvestorsCardsPage
                    onSelect={(id) => setSelectedPortfolioId(id)}
                    language={language}
                    theme={theme}
                  />
                ) : portfolioData ? (
                  <div className="space-y-6">
                    {/* BACK BUTTON FOR INDIVIDUAL SUPERINVESTOR */}
                    {selectedPortfolioId !== "user" && (
                      <button
                        onClick={() => setSelectedPortfolioId("superinvestors")}
                        className="flex items-center gap-2 text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer mb-2 group w-fit"
                      >
                        <ArrowLeft size={14} className="transform group-hover:-translate-x-1 transition-transform" />
                        {language === "EN" ? "BACK TO SUPERINVESTORS" : "VOLVER A SUPERINVERSORES"}
                      </button>
                    )}

                    {/* USER MULTI-PORTFOLIO TABS (UP TO 2 PORTFOLIOS) */}
                    {selectedPortfolioId === "user" && (
                      <div className="bg-[#0f111a]/40 border border-slate-900/40 p-4 sm:p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-lg backdrop-blur-md">
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
                                  key={portfolio.id}
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

                                          {userPortfolios.length > 1 && (
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
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}

                            {/* Option to create 2nd Portfolio if only 1 exists */}
                            {userPortfolios.length < 2 && (
                              <button
                                type="button"
                                onClick={() => setShowCreateAIModal(true)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-dashed transition-all cursor-pointer ${
                                  theme === "light"
                                    ? "text-emerald-800 hover:text-emerald-900 bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-600/50"
                                    : "text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/40"
                                }`}
                                title={language === "EN" ? "Create a 2nd portfolio" : "Crear un 2º portafolio"}
                              >
                                <Plus size={14} />
                                <span>{language === "EN" ? "Add" : "Añadir"}</span>
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
                      )}

                  {/* CORE INTERACTIVE TABS BAR */}
                  <div className={`pb-2 border-b ${theme === "light" ? "border-[#ded9cb]/80" : "border-slate-900/60"} flex justify-center w-full mb-5 sm:mb-6`}>
                    <div 
                      className={`${
                        theme === "light"
                          ? "bg-[#eae6db]/90 border-[#ded9cb] shadow-sm"
                          : "bg-[#0b0d13]/90 border-slate-800/80 shadow-xl"
                      } backdrop-blur-md p-1.5 rounded-2xl flex items-center justify-between sm:justify-center gap-1 sm:gap-2 border w-full ${selectedPortfolioId === "user" ? "max-w-xl" : "max-w-xs sm:max-w-sm"} overflow-x-auto scrollbar-none`}
                    >
                      {[
                        { id: "summary", label: language === "EN" ? "Summary" : "Resumen", icon: BarChart3, available: true },
                        { id: "holdings", label: language === "EN" ? "Holdings" : "Posiciones", icon: Briefcase, available: true },
                        { id: "whatif", label: language === "EN" ? "Simulation" : "Simulación", icon: Sparkles, available: selectedPortfolioId === "user" },
                        { id: "analysis", label: language === "EN" ? "Analysis" : "Análisis", icon: Compass, available: selectedPortfolioId === "user" },
                      ].filter(tab => tab.available).map(tab => {
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
                          if (val === 0) return null; // Keep it compact by only displaying active combined allocations
                          
                          const lastName = si.name.split(" ").pop() || si.name;
                          
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

                  {/* View Render Router */}
                  {activeTab === "summary" && (
                    <SummaryDashboard 
                      portfolio={portfolioData} 
                      onSelectTickerForChart={(t) => setSelectedChartTicker(t)}
                      onNavigateToHealth={() => {
                        setActiveTab("holdings");
                        setHoldingsTabMode("health");
                      }}
                      language={language} 
                      portfolioName={selectedPortfolioId === "user" ? activeUserPortfolio.name : SUPERINVESTORS[selectedPortfolioId]?.name}
                      isReadOnly={selectedPortfolioId !== "user"}
                      theme={theme}
                    />
                  )}

                  {activeTab === "holdings" && (
                    <HoldingsTable
                      positions={portfolioData.positions}
                      loading={loading}
                      onEditHoldings={() => setShowEditModal(true)}
                      language={language}
                      isReadOnly={selectedPortfolioId !== "user"}
                      initialTabMode={holdingsTabMode}
                      onTabModeChange={(mode) => setHoldingsTabMode(mode)}
                    />
                  )}

                  {activeTab === "analyst" && (
                    <AnalystInsights positions={portfolioData.positions} language={language} />
                  )}

                  {activeTab === "whatif" && (
                    <WhatIfSimulator portfolio={portfolioData} language={language} userEmail={user?.email} />
                  )}

                  {activeTab === "analysis" && (
                    <BogleAnalysisDashboard 
                      portfolio={portfolioData} 
                      language={language}
                      theme={theme}
                    />
                  )}
                </div>
              ) : null)}

              {/* 2. VIEW MARKET */}
              {sidebarTab === "market" && (
                <MarketDashboard 
                  language={language} 
                  theme={theme}
                  portfolioData={selectedPortfolioId === "user" ? portfolioData : userPortfolioData}
                  holdings={activeUserPortfolio.holdings}
                  onNavigateToPortfolio={() => {
                    setSelectedPortfolioId("user");
                    setSidebarTab("portfolios");
                    setActiveTab("holdings");
                  }}
                  onOpenEditHoldings={() => {
                    setSelectedPortfolioId("user");
                    setShowEditModal(true);
                  }}
                />
              )}

              {/* 3. VIEW STOCKS (STOCK SEARCH & FUNDAMENTALS EXPLORER) */}
              {sidebarTab === "stocks" && (
                <StockSearchExplorer 
                  language={language} 
                  theme={theme} 
                  userEmail={user?.email}
                  initialTicker="NVDA"
                />
              )}

              {/* 4. VIEW WATCHLIST */}
              {sidebarTab === "watchlist" && (
                <WatchlistDashboard 
                  language={language} 
                  portfolioPositions={portfolioData?.positions || []}
                  userEmail={user?.email}
                />
              )}

              {/* 5. VIEW EARNINGS */}
              {sidebarTab === "earnings" && (
                <EarningsCalendar 
                  language={language} 
                  positions={portfolioData?.positions || []} 
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
          )}
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
          positions={portfolioData?.positions}
          onClose={() => setShowEditModal(false)}
          onSave={(newHoldings) => handleSaveHoldings(newHoldings, activeUserPortfolio.name, activeUserPortfolio.id)}
          language={language}
        />
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
    </div>
  );
}
