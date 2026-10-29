import React from "react";
import { SidebarTabType } from "../types";
import { 
  TrendingUp, 
  Briefcase, 
  BarChart3, 
  Search,
  Eye, 
  Calendar, 
  HelpCircle, 
  User, 
  LogOut, 
  DollarSign,
  Sun, 
  Moon,
  X
} from "lucide-react";

// Custom high-resolution vector logo for investiando.ai
function InvestiandoLogo({ theme = "dark" }: { theme?: "dark" | "light" }) {
  const isLight = theme === "light";

  return (
    <div 
      className={`relative w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-xl p-0.5 transition-all duration-300 group hover:scale-105 ${
        isLight 
          ? "bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-100/80 border border-emerald-300/80 shadow-md shadow-emerald-700/10 hover:border-emerald-500/80" 
          : "bg-gradient-to-br from-slate-900 via-[#131927] to-[#0a0f1d] border border-emerald-500/30 shadow-lg shadow-emerald-500/10 hover:border-emerald-400/60"
      }`}
    >
      {/* Background ambient glow */}
      <div 
        className={`absolute inset-0 rounded-xl blur-sm opacity-50 group-hover:opacity-100 transition-opacity pointer-events-none ${
          isLight ? "bg-emerald-400/25" : "bg-emerald-500/15"
        }`} 
      />
      
      <img 
        src="/mascot.png" 
        onError={(e) => {
          const target = e.currentTarget;
          if (target.src.endsWith('/mascot.png')) {
            target.src = '/logo.png';
          } else if (target.src.endsWith('/logo.png')) {
            target.src = '/image.png';
          } else if (target.src.endsWith('/image.png')) {
            target.src = '/favicon.svg';
          }
        }}
        alt="investiando logo" 
        className="w-full h-full relative z-10 rounded-lg object-cover" 
      />
    </div>
  );
}

interface SidebarProps {
  activeTab: SidebarTabType;
  onTabChange: (tab: SidebarTabType) => void;
  language: "EN" | "ES";
  onLanguageChange: (lang: "EN" | "ES") => void;
  theme: "dark" | "light";
  onThemeChange: (theme: "dark" | "light") => void;
  onCloseMobile?: () => void;
  selectedPortfolioId?: string;
  onPortfolioSelect?: (id: string) => void;
  onStartWalkthrough?: () => void;
}

export default function Sidebar({
  activeTab,
  onTabChange,
  language,
  onLanguageChange,
  theme,
  onThemeChange,
  onCloseMobile,
  selectedPortfolioId = "user",
  onPortfolioSelect,
  onStartWalkthrough
}: SidebarProps) {

  // Dictionary of labels in EN and ES
  const t = {
    EN: {
      market: "Market",
      stocks: "Stock Explorer",
      watchlist: "Watchlist",
      earnings: "Earnings",
      support: "Help and Support",
      account: "Account",
      logout: "Logout",
      logoTitle: "investiando.ai",
      yourPortfolio: "Your Portfolio",
      superinvestors: "Superinvestors"
    },
    ES: {
      market: "Mercado",
      stocks: "Buscador de Acciones",
      watchlist: "Lista de Seguimiento",
      earnings: "Resultados",
      support: "Ayuda y Soporte",
      account: "Mi Cuenta",
      logout: "Cerrar Sesión",
      logoTitle: "investiando.ai",
      yourPortfolio: "Tu Portafolio",
      superinvestors: "Superinversores"
    }
  }[language];

  const handleItemClick = (id: SidebarTabType) => {
    onTabChange(id);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  const navItems = [
    {
      id: "market",
      label: t.market,
      icon: TrendingUp,
      isActive: activeTab === "market",
      onClick: () => handleItemClick("market")
    },
    {
      id: "userPortfolio",
      label: t.yourPortfolio,
      icon: Briefcase,
      isActive: activeTab === "portfolios" && selectedPortfolioId === "user",
      onClick: () => {
        if (onPortfolioSelect) onPortfolioSelect("user");
        handleItemClick("portfolios");
      }
    },
    {
      id: "superinvestors",
      label: t.superinvestors,
      icon: DollarSign,
      isActive: activeTab === "portfolios" && selectedPortfolioId !== "user",
      onClick: () => {
        if (onPortfolioSelect) onPortfolioSelect("superinvestors");
        handleItemClick("portfolios");
      }
    },
    {
      id: "stocks",
      label: t.stocks,
      icon: Search,
      isActive: activeTab === "stocks",
      onClick: () => handleItemClick("stocks")
    },
    {
      id: "watchlist",
      label: t.watchlist,
      icon: Eye,
      isActive: activeTab === "watchlist",
      onClick: () => handleItemClick("watchlist")
    },
    {
      id: "earnings",
      label: t.earnings,
      icon: Calendar,
      isActive: activeTab === "earnings",
      onClick: () => handleItemClick("earnings")
    },
    {
      id: "support",
      label: t.support,
      icon: HelpCircle,
      isActive: activeTab === "support",
      onClick: () => handleItemClick("support")
    },
    {
      id: "account",
      label: t.account,
      icon: User,
      isActive: activeTab === "account",
      onClick: () => handleItemClick("account")
    },
    {
      id: "logout",
      label: t.logout,
      icon: LogOut,
      isActive: activeTab === "logout",
      onClick: () => handleItemClick("logout")
    },
  ];

  return (
    <div className="flex flex-col h-full bg-theme-sidebar text-theme-text-muted border-r border-theme-border w-full">
      {/* Sidebar Header / Logo */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-theme-border">
        <div className="flex items-center gap-3">
          <InvestiandoLogo theme={theme} />
          <div className="flex items-center gap-0.5 font-display text-sm md:text-base font-black tracking-tight leading-none">
            <span className={theme === "light"
              ? "bg-gradient-to-r from-emerald-700 via-teal-700 to-cyan-800 bg-clip-text text-transparent"
              : "bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent"
            }>
              investiando
            </span>
            <span className={theme === "light"
              ? "text-emerald-700 font-mono font-bold text-xs lowercase"
              : "text-emerald-400/90 font-mono font-bold text-xs lowercase"
            }>
              .app
            </span>
          </div>
        </div>
        
        {/* Mobile close button */}
        {onCloseMobile && (
          <button 
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 rounded-lg text-theme-text-muted hover:text-theme-text-bright hover:bg-theme-card-hover transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Navigation Links */}
      <div className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto scrollbar-thin">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.isActive;

          return (
            <button
              key={item.id}
              onClick={item.onClick}
              className={`w-full flex items-center justify-between px-3 py-3 rounded-xl transition-all duration-150 cursor-pointer group ${
                isActive 
                  ? "bg-theme-input text-theme-text-bright font-semibold shadow-sm" 
                  : "hover:bg-theme-card-hover hover:text-theme-text-bright"
              }`}
            >
              <div className="flex items-center gap-3.5">
                <Icon 
                  size={18} 
                  className={`transition-colors ${
                    isActive ? "text-theme-accent" : "text-theme-text-muted group-hover:text-theme-text-bright"
                  }`} 
                />
                <span className="text-[13px] leading-none tracking-wide">
                  {item.label}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Sidebar Footer (Language + Theme selectors matching mockup perfectly) */}
      <div className="p-4 border-t border-theme-border flex items-center justify-between gap-4 bg-theme-sidebar">
        {/* Language selector: EN vs ES */}
        <div className="flex bg-theme-bg p-1 rounded-xl border border-theme-border text-[11px] font-bold">
          <button
            onClick={() => onLanguageChange("EN")}
            className={`px-3 py-1.5 rounded-lg transition-all duration-150 cursor-pointer ${
              language === "EN" 
                ? "bg-theme-card text-theme-text-bright shadow-inner" 
                : "text-theme-text-muted hover:text-theme-text-bright"
            }`}
          >
            EN
          </button>
          <button
            onClick={() => onLanguageChange("ES")}
            className={`px-3 py-1.5 rounded-lg transition-all duration-150 cursor-pointer ${
              language === "ES" 
                ? "bg-theme-card text-theme-text-bright shadow-inner" 
                : "text-theme-text-muted hover:text-theme-text-bright"
            }`}
          >
            ES
          </button>
        </div>

        {/* Theme selector: Light vs Dark */}
        <div className="flex bg-theme-bg p-1 rounded-xl border border-theme-border">
          <button
            onClick={() => onThemeChange("light")}
            className={`p-1.5 rounded-lg transition-all duration-150 cursor-pointer ${
              theme === "light" 
                ? "bg-theme-card text-amber-500 shadow-inner" 
                : "text-theme-text-muted hover:text-theme-text-bright"
            }`}
            title="Light Mode"
          >
            <Sun size={14} />
          </button>
          <button
            onClick={() => onThemeChange("dark")}
            className={`p-1.5 rounded-lg transition-all duration-150 cursor-pointer ${
              theme === "dark" 
                ? "bg-theme-card text-sky-400 shadow-inner" 
                : "text-theme-text-muted hover:text-theme-text-bright"
            }`}
            title="Dark Mode"
          >
            <Moon size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
