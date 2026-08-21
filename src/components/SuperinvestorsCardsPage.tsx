import React from "react";
import { motion } from "motion/react";
import { SUPERINVESTORS } from "../superinvestors";
import { 
  SUPERINVESTOR_SCORES, 
  COMBINED_SUPERINVESTOR_SCORE, 
  SuperinvestorScoreInfo 
} from "../utils/superinvestorScore";
import { 
  Briefcase, 
  ArrowRight, 
  TrendingUp, 
  Compass, 
  Award, 
  LayoutGrid, 
  List, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  Calendar, 
  ShieldCheck, 
  Zap,
  CheckCircle2
} from "lucide-react";

interface SuperinvestorsCardsPageProps {
  onSelect: (id: string) => void;
  language: "EN" | "ES";
  theme?: "dark" | "light";
}

const CATEGORY_COLORS: Record<string, string> = {
  "Value": "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  "Valor": "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  "Activist": "text-sky-400 bg-sky-500/10 border-sky-500/20",
  "Activista": "text-sky-400 bg-sky-500/10 border-sky-500/20",
  "Growth/Tech": "text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/20",
  "Crecimiento/Tecnología": "text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/20",
  "Specialty": "text-amber-400 bg-amber-500/10 border-amber-500/20",
  "Especializado": "text-amber-400 bg-amber-500/10 border-amber-500/20"
};

/** Donut / circular ring indicator with score in center */
function ScoreDonut({
  score,
  colorHex,
  size = 28,
  strokeWidth = 3,
  title,
}: {
  score: number;
  colorHex?: string;
  size?: number;
  strokeWidth?: number;
  title?: string;
}) {
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const safeScore = Math.min(100, Math.max(0, score));
  const strokeDashoffset = circumference - (safeScore / 100) * circumference;
  const color =
    colorHex ||
    (score >= 80
      ? "#34d399"
      : score >= 72
      ? "#10b981"
      : score >= 64
      ? "#14b8a6"
      : score >= 55
      ? "#38bdf8"
      : score >= 45
      ? "#fbbf24"
      : "#f43f5e");

  return (
    <div
      className="relative inline-flex items-center justify-center shrink-0 cursor-help"
      style={{ width: size, height: size }}
      title={title || `Score: ${score}/100`}
    >
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="transparent"
          className="text-slate-800/90 score-donut-track"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="transparent"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span 
          className="font-mono font-black text-white score-donut-text tracking-tighter" 
          style={{ fontSize: size <= 28 ? "9px" : "11px", lineHeight: 1 }}
        >
          {score}
        </span>
      </div>
    </div>
  );
}

export default function SuperinvestorsCardsPage({ onSelect, language, theme }: SuperinvestorsCardsPageProps) {
  const superinvestorKeys = Object.keys(SUPERINVESTORS);
  const [viewMode, setViewMode] = React.useState<"cards" | "table">("cards");
  const [stats, setStats] = React.useState<Record<string, {
    mktValue: number;
    dailyPnL: number;
    dailyPnLPercent: number;
    score?: number;
    grade?: string;
    labelEN?: string;
    labelES?: string;
    dominantType?: string;
  }> | null>(null);
  const [loadingStats, setLoadingStats] = React.useState(true);
  const [sortField, setSortField] = React.useState<"pnl" | "score" | "value">("value");
  const [sortDirection, setSortDirection] = React.useState<"asc" | "desc" | null>("desc");

  const sortedSuperinvestorKeys = React.useMemo(() => {
    const keys = [...superinvestorKeys];
    if (!sortDirection) return keys;

    return keys.sort((a, b) => {
      const statsA = stats ? stats[a] : null;
      const statsB = stats ? stats[b] : null;
      const scoreA = statsA?.score ?? SUPERINVESTOR_SCORES[a]?.score ?? 60;
      const scoreB = statsB?.score ?? SUPERINVESTOR_SCORES[b]?.score ?? 60;
      const pnlA = statsA?.dailyPnLPercent ?? 0;
      const pnlB = statsB?.dailyPnLPercent ?? 0;
      const valA = statsA?.mktValue ?? (SUPERINVESTORS[a]?.aum13F ? SUPERINVESTORS[a].aum13F * 1e9 : 1e9);
      const valB = statsB?.mktValue ?? (SUPERINVESTORS[b]?.aum13F ? SUPERINVESTORS[b].aum13F * 1e9 : 1e9);

      let comparison = 0;
      if (sortField === "score") {
        comparison = scoreA - scoreB;
      } else if (sortField === "pnl") {
        comparison = pnlA - pnlB;
      } else if (sortField === "value") {
        comparison = valA - valB;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [superinvestorKeys, stats, sortField, sortDirection]);

  const toggleSort = (field: "pnl" | "score" | "value") => {
    if (sortField === field) {
      setSortDirection((prev) => {
        if (prev === "desc") return "asc";
        if (prev === "asc") return null;
        return "desc";
      });
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  React.useEffect(() => {
    let isMounted = true;
    async function fetchStats() {
      try {
        const res = await fetch("/api/superinvestors/stats");
        if (res.ok) {
          const contentType = res.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const data = await res.json();
            if (isMounted) {
              setStats(data);
              setLoadingStats(false);
              return;
            }
          }
        }
      } catch (err) {
        console.warn("Could not fetch real-time superinvestor stats, using 13F baseline:", err);
      }

      // Default baseline stats from 13F AUM values
      if (isMounted) {
        const fallbackStats: Record<string, { mktValue: number; dailyPnL: number; dailyPnLPercent: number; score: number; grade: string; labelEN: string; labelES: string; dominantType: string }> = {};
        Object.entries(SUPERINVESTORS).forEach(([key, si]) => {
          const sc = SUPERINVESTOR_SCORES[key];
          fallbackStats[key] = {
            mktValue: (si.aum13F || 1) * 1000000000,
            dailyPnL: 0,
            dailyPnLPercent: 0,
            score: sc?.score ?? 60,
            grade: sc?.grade ?? "B",
            labelEN: sc?.labelEN ?? "Balanced",
            labelES: sc?.labelES ?? "Equilibrado",
            dominantType: sc?.dominantType ?? "Compounder",
          };
        });
        setStats(fallbackStats);
        setLoadingStats(false);
      }
    }
    fetchStats();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Intro Banner */}
      <div className="bg-[#0f111a]/60 border border-slate-900/60 p-6 sm:p-8 rounded-2xl flex flex-col md:flex-row md:items-center md:justify-between gap-6 shadow-xl backdrop-blur-md relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-500/20 via-emerald-500/60 to-emerald-500/20" />
        
        <div className="space-y-3 max-w-3xl">
          <h2 className="text-xl sm:text-2xl font-display font-bold text-white tracking-wide uppercase flex items-center gap-2.5">
            <Compass className="text-emerald-400" size={24} />
            {language === "EN" ? "SUPERINVESTOR PORTFOLIOS & FACTOR SCORES" : "PORTAFOLIOS & SCORES DE SUPERINVERSORES"}
          </h2>
        </div>

        <div className="flex flex-col gap-2 shrink-0 self-start md:self-center">
          <div className="flex items-center gap-2 bg-slate-950/80 px-4 py-2.5 rounded-2xl border border-slate-900/80 text-xs font-semibold text-emerald-400 shadow-inner">
            <Award size={16} />
            <span>{superinvestorKeys.length} {language === "EN" ? "Legendary Funds" : "Fondos Legendarios"}</span>
          </div>
          <div className="text-[10px] font-mono text-slate-500 text-right pr-1">
            {language === "EN" ? "Sources: SEC EDGAR / Dataroma" : "Fuentes: SEC EDGAR / Dataroma"}
          </div>
        </div>
      </div>

      {/* Control / View Toggle Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-[#0f111a]/30 border border-slate-900/40 p-3 rounded-2xl shadow-md backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-2 pl-1">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
            {language === "EN" ? "SORT BY:" : "ORDENAR POR:"}
          </span>
          <button
            onClick={() => toggleSort("value")}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold font-mono transition-all flex items-center gap-1 cursor-pointer ${
              sortField === "value" && sortDirection
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                : "text-slate-400 hover:text-slate-200 border border-slate-850 bg-slate-950/40"
            }`}
          >
            <span>Value</span>
            {sortField === "value" && sortDirection === "asc" && <ArrowUp size={12} />}
            {sortField === "value" && sortDirection === "desc" && <ArrowDown size={12} />}
          </button>
          <button
            onClick={() => toggleSort("score")}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold font-mono transition-all flex items-center gap-1 cursor-pointer ${
              sortField === "score" && sortDirection
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                : "text-slate-400 hover:text-slate-200 border border-slate-850 bg-slate-950/40"
            }`}
          >
            <span>Score</span>
            {sortField === "score" && sortDirection === "asc" && <ArrowUp size={12} />}
            {sortField === "score" && sortDirection === "desc" && <ArrowDown size={12} />}
          </button>

        </div>

        <div className="flex bg-slate-950/80 p-1 rounded-xl border border-slate-900/60 shadow-inner self-end sm:self-auto">
          <button
            onClick={() => setViewMode("cards")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === "cards"
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                : "text-slate-400 hover:text-slate-200 border border-transparent"
            }`}
          >
            <LayoutGrid size={14} />
            <span>{language === "EN" ? "Cards" : "Tarjetas"}</span>
          </button>
          <button
            onClick={() => setViewMode("table")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === "table"
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                : "text-slate-400 hover:text-slate-200 border border-transparent"
            }`}
          >
            <List size={14} />
            <span>{language === "EN" ? "Table" : "Tabla"}</span>
          </button>
        </div>
      </div>

      {viewMode === "cards" ? (
        /* Grid of Cards */
        <div id="superinvestor-cards-grid" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {/* SPECIAL COMBINED PORTFOLIO CARD */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            whileHover={{ y: -4, transition: { duration: 0.15 } }}
            onClick={() => onSelect("combined")}
            className="superinvestor-card bg-gradient-to-br from-emerald-950/20 via-[#0f111a]/80 to-emerald-950/10 hover:bg-[#111322]/80 border-2 border-emerald-500/20 hover:border-emerald-500/40 p-5 rounded-2xl shadow-lg transition-all duration-150 cursor-pointer flex flex-col justify-between group h-full relative overflow-hidden xl:col-span-1"
          >
            {/* Top Accent glow */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-500/0 via-emerald-500/50 to-emerald-500/0 opacity-100" />

            <div className="space-y-3.5">
              {/* Header info */}
              <div className="flex justify-between items-start gap-3">
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-white tracking-tight group-hover:text-emerald-300 transition-colors">
                      {language === "EN" ? "Combined Superinvestors" : "Superinversores Combinados"}
                    </h3>
                    <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
                      {language === "EN" ? "Combination" : "Combinación"}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2 pt-0.5">
                    <p className="text-xs text-slate-400 font-mono font-medium truncate">
                      {language === "EN" ? "All Legend Funds Aggregated" : "Todos los Fondos Legendarios Agregados"}
                    </p>
                    <div 
                      className="flex items-center shrink-0"
                      title={`${language === "EN" ? "Portfolio Score" : "Score de Portafolio"}: ${COMBINED_SUPERINVESTOR_SCORE.score}/100`}
                    >
                      <ScoreDonut
                        score={COMBINED_SUPERINVESTOR_SCORE.score}
                        colorHex={COMBINED_SUPERINVESTOR_SCORE.colorHex}
                        size={26}
                        strokeWidth={3}
                      />
                    </div>
                  </div>
                </div>
                
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center font-mono font-bold text-sm text-emerald-400 shadow-md flex-shrink-0 group-hover:border-emerald-500/60 transition-all">
                  Σ
                </div>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                {language === "EN"
                  ? "Merge and analyze the aggregate portfolio of all superinvestors combined. Adjust individual fund weights to see the combined portfolio value, beta, ratios, and S&P 500 sector distributions in real time."
                  : "Fusiona y analiza el portafolio agregado de todos los superinversores. Ajusta los pesos de cada fondo para ver el valor combinado, beta, ratios y distribución por sectores S&P 500 en tiempo real."}
              </p>
            </div>

            {/* Card Footer action */}
            <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-900/40">
              <div className="flex items-center gap-1.5 text-slate-500 font-mono text-[10px] font-semibold">
                <Briefcase size={12} className="text-emerald-400" />
                <span>
                  {superinvestorKeys.length} {language === "EN" ? "Portfolios" : "Portafolios"}
                </span>
              </div>
              
              <div className="flex items-center gap-1 text-xs font-bold text-emerald-400 group-hover:text-emerald-300 transition-colors">
                <span>{language === "EN" ? "Analyze Combo" : "Analizar Combo"}</span>
                <ArrowRight size={14} className="transform group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </motion.div>

          {sortedSuperinvestorKeys.map((key, index) => {
            const si = SUPERINVESTORS[key];
            const fundName = si.fund;
            const category = language === "EN" ? si.category : si.categoryES;
            const totalPositions = si.holdings.length;
            const topHoldings = si.holdings.slice(0, 4);

            const isQ2 = si.period.includes("Q2 2026");
            const isLiquidated = si.period.includes("LIQUIDADO");

            const s = stats ? stats[key] : null;
            const scoreInfo: SuperinvestorScoreInfo = SUPERINVESTOR_SCORES[key] || {
              score: s?.score ?? 60,
              grade: (s?.grade as any) ?? "B",
              labelEN: s?.labelEN ?? "Balanced",
              labelES: s?.labelES ?? "Equilibrado",
              badgeBg: "bg-blue-500/10",
              badgeBorder: "border-blue-500/30",
              badgeText: "text-blue-400",
              colorHex: "#38bdf8",
              dominantType: s?.dominantType ?? "Compounder",
              topDrivers: [],
            };

            const isPositive = s ? s.dailyPnL >= 0 : false;
            const formattedValue = s
              ? `${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(s.mktValue / 1000000)}M`
              : (si.aum13F ? `$${(si.aum13F * 1000).toLocaleString("en-US", { maximumFractionDigits: 0 })}M` : "—");
            const formattedDailyPnL = s
              ? `${isPositive ? "+" : ""}${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(s.dailyPnL / 1000000)}M (${isPositive ? "+" : ""}${s.dailyPnLPercent.toFixed(2)}%)`
              : "—";

            return (
              <motion.div
                key={key}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.03 }}
                whileHover={{ y: -4, transition: { duration: 0.15 } }}
                onClick={() => onSelect(key)}
                className="superinvestor-card bg-[#0f111a]/60 hover:bg-[#111322]/80 border border-slate-900/60 hover:border-slate-800/80 p-5 rounded-2xl shadow-md transition-all duration-150 cursor-pointer flex flex-col justify-between group h-full relative overflow-hidden"
              >
                {/* Top Accent glow */}
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-500/0 via-emerald-500/20 to-emerald-500/0 opacity-0 group-hover:opacity-100 transition-opacity" />

                <div className="space-y-3.5">
                  {/* Header info with Donut Score next to Fund Name & Type next to Manager */}
                  <div className="flex justify-between items-start gap-3">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {isQ2 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            13F Q2
                          </span>
                        ) : isLiquidated ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                            LIQ. JUL-26
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold uppercase tracking-wider bg-slate-800/60 text-slate-300 border border-slate-700/60 shadow-sm">
                            13F Q1/Q2
                          </span>
                        )}
                      </div>

                      {/* Manager Name + Portfolio Type on same line */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-bold text-white tracking-tight group-hover:text-emerald-300 transition-colors truncate">
                          {si.name}
                        </h3>
                        <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border shrink-0 ${CATEGORY_COLORS[category] || CATEGORY_COLORS["Value"]}`}>
                          {category}
                        </span>
                      </div>

                      {/* Fund name WITH DONUT SCORE (only number) right next to it */}
                      <div className="flex items-center gap-2 pt-0.5">
                        <p className="text-xs text-slate-400 font-mono font-medium truncate">
                          {fundName}
                        </p>
                        <div 
                          className="flex items-center shrink-0"
                          title={`${language === "EN" ? "Portfolio Score" : "Score de Portafolio"}: ${scoreInfo.score}/100`}
                        >
                          <ScoreDonut
                            score={scoreInfo.score}
                            colorHex={scoreInfo.colorHex}
                            size={26}
                            strokeWidth={3}
                          />
                        </div>
                      </div>
                    </div>
                    
                    {/* Circle initial placeholder avatar */}
                    <div className="w-10 h-10 rounded-xl bg-[#121420] border border-slate-900 flex items-center justify-center font-mono font-bold text-sm text-slate-300 shadow-md flex-shrink-0 group-hover:border-emerald-500/30 transition-all">
                      {si.name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase()}
                    </div>
                  </div>

                  {/* Portfolio stats preview (Value & Daily Change) */}
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-500 block">
                        {language === "EN" ? "PORTFOLIO VALUE" : "VALOR PORTAFOLIO"}
                      </span>
                      {loadingStats ? (
                        <div className="h-4 w-20 bg-slate-800/30 rounded animate-pulse mt-1" />
                      ) : (
                        <span className="text-xs font-mono font-bold text-slate-200 mt-0.5 block">
                          {formattedValue}
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-500 block">
                        {language === "EN" ? "DAILY CHANGE" : "VAR. DIARIA"}
                      </span>
                      {loadingStats ? (
                        <div className="h-4 w-24 bg-slate-800/30 rounded animate-pulse mt-1" />
                      ) : (
                        <span className={`text-xs font-mono font-bold mt-0.5 block ${isPositive ? "text-emerald-400" : "text-rose-400"}`}>
                          {formattedDailyPnL}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Top tickers preview with shares in k (1 decimal) */}
                  <div className="space-y-1.5 pt-2 border-t border-slate-900/40">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                      {language === "EN" ? "Top Holdings" : "Principales Posiciones"}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {topHoldings.map((h, idx) => {
                        const sharesK = (h.shares / 1000).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "k";
                        const weightPct = h.portfolioWeight ? `${h.portfolioWeight.toFixed(1)}%` : "";
                        return (
                          <span
                            key={`${h.ticker}-${idx}`}
                            className="text-[10px] font-mono font-bold text-slate-300 bg-[#121420] border border-slate-900 px-2 py-0.5 rounded-md hover:border-slate-800 transition-colors"
                            title={`${h.company || h.ticker} • ${sharesK} ${language === "EN" ? "shares" : "acciones"}`}
                          >
                            {h.ticker}
                            {weightPct ? ` (${weightPct})` : ` (${sharesK})`}
                          </span>
                        );
                      })}
                      {totalPositions > 4 && (
                        <span className="text-[10px] font-mono font-medium text-slate-500 bg-[#121420]/30 border border-slate-900/30 px-1.5 py-0.5 rounded-md">
                          +{totalPositions - 4}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Footer action */}
                <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-900/40">
                  <div className="flex items-center gap-1.5 text-slate-500 font-mono text-[10px] font-semibold">
                    <Briefcase size={12} className="text-slate-500 group-hover:text-emerald-400 transition-colors" />
                    <span>
                      {totalPositions} {language === "EN" ? "Positions" : "Posiciones"}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-1 text-xs font-bold text-emerald-400 group-hover:text-emerald-300 transition-colors">
                    <span>{language === "EN" ? "Analyze" : "Analizar"}</span>
                    <ArrowRight size={14} className="transform group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        /* Table View of Superinvestors */
        <div className="overflow-x-auto rounded-2xl border border-slate-900/40 bg-[#0f111a]/40 shadow-lg backdrop-blur-md">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-900/60 bg-slate-950/40 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                <th className="py-4 px-5">{language === "EN" ? "Investor / Fund" : "Inversor / Fondo"}</th>
                <th className="py-4 px-5">{language === "EN" ? "Period / Filing" : "Período / 13F"}</th>
                <th className="py-4 px-5">{language === "EN" ? "Category" : "Categoría"}</th>
                
                {/* Sortable Portfolio Score Column */}
                <th 
                  className="py-4 px-5 cursor-pointer select-none hover:text-slate-300 transition-colors"
                  onClick={() => toggleSort("score")}
                >
                  <div className="flex items-center gap-1">
                    <Zap size={11} className="text-emerald-400" />
                    <span>{language === "EN" ? "Portfolio Score" : "Score Portafolio"}</span>
                    {sortField === "score" && sortDirection === "asc" ? (
                      <ArrowUp size={12} className="text-emerald-400" />
                    ) : sortField === "score" && sortDirection === "desc" ? (
                      <ArrowDown size={12} className="text-emerald-400" />
                    ) : (
                      <ArrowUpDown size={12} className="text-slate-600" />
                    )}
                  </div>
                </th>

                {/* Sortable Portfolio Value Column */}
                <th 
                  className="py-4 px-5 text-right cursor-pointer select-none hover:text-slate-300 transition-colors"
                  onClick={() => toggleSort("value")}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>{language === "EN" ? "Portfolio Value" : "Valor Portafolio"}</span>
                    {sortField === "value" && sortDirection === "asc" ? (
                      <ArrowUp size={12} className="text-emerald-400" />
                    ) : sortField === "value" && sortDirection === "desc" ? (
                      <ArrowDown size={12} className="text-emerald-400" />
                    ) : (
                      <ArrowUpDown size={12} className="text-slate-600" />
                    )}
                  </div>
                </th>

                {/* Sortable Daily Change Column */}
                <th 
                  className="py-4 px-5 text-right cursor-pointer select-none hover:text-slate-300 transition-colors"
                  onClick={() => toggleSort("pnl")}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>{language === "EN" ? "Daily Change" : "Var. Diaria"}</span>
                    {sortField === "pnl" && sortDirection === "asc" ? (
                      <ArrowUp size={12} className="text-emerald-400" />
                    ) : sortField === "pnl" && sortDirection === "desc" ? (
                      <ArrowDown size={12} className="text-emerald-400" />
                    ) : (
                      <ArrowUpDown size={12} className="text-slate-600" />
                    )}
                  </div>
                </th>

                <th className="py-4 px-5">{language === "EN" ? "Top Holdings" : "Principales Posiciones"}</th>
                <th className="py-4 px-5 text-center">{language === "EN" ? "Positions" : "Posiciones"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/40">
              {/* SPECIAL COMBINED PORTFOLIO ROW */}
              <motion.tr
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25 }}
                onClick={() => onSelect("combined")}
                className="bg-emerald-950/5 hover:bg-emerald-950/10 transition-colors duration-150 cursor-pointer group"
              >
                <td className="py-4 px-5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center font-mono font-bold text-xs text-emerald-400 shadow-md group-hover:border-emerald-500/60 transition-all flex-shrink-0">
                      Σ
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-slate-100 group-hover:text-emerald-300 transition-colors leading-tight">
                          {language === "EN" ? "Combined Superinvestors" : "Superinversores Combinados"}
                        </span>
                        <span className="inline-block px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider border text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
                          {language === "EN" ? "COMBINATION" : "COMBINACIÓN"}
                        </span>
                      </div>
                      <span className="text-xs text-slate-400 font-mono mt-0.5 block leading-tight">
                        {language === "EN" ? "All Legend Funds Aggregated" : "Todos los Fondos Legendarios Agregados"}
                      </span>
                    </div>
                  </div>
                </td>

                <td className="py-4 px-5">
                  <span className="text-xs font-mono text-slate-400">
                    {language === "EN" ? "All Active Filings" : "Todos los 13F Activos"}
                  </span>
                </td>

                {/* Combined Score Cell with Donut (only number) */}
                <td className="py-4 px-5">
                  <div className="flex items-center gap-2">
                    <ScoreDonut
                      score={COMBINED_SUPERINVESTOR_SCORE.score}
                      colorHex={COMBINED_SUPERINVESTOR_SCORE.colorHex}
                      size={26}
                      strokeWidth={3}
                    />
                    <span className="font-mono text-sm font-bold text-emerald-400">
                      {COMBINED_SUPERINVESTOR_SCORE.score}
                    </span>
                  </div>
                </td>

                <td className="py-4 px-5 text-right font-mono text-sm font-semibold text-slate-200">
                  $1,000.00M
                </td>

                <td className="py-4 px-5 text-right font-mono text-sm">
                  <span className="font-bold text-emerald-400">
                    {language === "EN" ? "Interactive" : "Interactivo"}
                  </span>
                </td>

                <td className="py-4 px-5">
                  <span className="text-[9px] font-mono font-medium text-slate-400">
                    {language === "EN" ? "Adjustable Weighted Aggregate" : "Agregado Ponderado Ajustable"}
                  </span>
                </td>

                <td className="py-4 px-5 text-center font-mono text-sm font-medium text-slate-400">
                  {language === "EN" ? "All" : "Todos"}
                </td>
              </motion.tr>

              {sortedSuperinvestorKeys.map((key, index) => {
                const si = SUPERINVESTORS[key];
                const fundName = si.fund;
                const category = language === "EN" ? si.category : si.categoryES;
                const totalPositions = si.holdings.length;
                const topHoldings = si.holdings.slice(0, 4);

                const isQ2 = si.period.includes("Q2 2026");
                const isLiquidated = si.period.includes("LIQUIDADO");

                const s = stats ? stats[key] : null;
                const scoreInfo: SuperinvestorScoreInfo = SUPERINVESTOR_SCORES[key] || {
                  score: s?.score ?? 60,
                  grade: (s?.grade as any) ?? "B",
                  labelEN: s?.labelEN ?? "Balanced",
                  labelES: s?.labelES ?? "Equilibrado",
                  badgeBg: "bg-blue-500/10",
                  badgeBorder: "border-blue-500/30",
                  badgeText: "text-blue-400",
                  colorHex: "#38bdf8",
                  dominantType: s?.dominantType ?? "Compounder",
                  topDrivers: [],
                };

                const isPositive = s ? s.dailyPnL >= 0 : false;
                const formattedValue = s
                  ? `${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(s.mktValue / 1000000)}M`
                  : (si.aum13F ? `$${(si.aum13F * 1000).toLocaleString("en-US", { maximumFractionDigits: 0 })}M` : "—");
                const formattedDailyPnL = s
                  ? `${isPositive ? "+" : ""}${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(s.dailyPnL / 1000000)}M`
                  : "—";
                const formattedDailyPnLPercent = s
                  ? `${isPositive ? "+" : ""}${s.dailyPnLPercent.toFixed(2)}%`
                  : "—";

                return (
                  <motion.tr
                    key={key}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, delay: index * 0.03 }}
                    onClick={() => onSelect(key)}
                    className="hover:bg-[#111322]/60 transition-colors duration-150 cursor-pointer group"
                  >
                    {/* Name & Fund & Portfolio Type */}
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[#121420] border border-slate-900 flex items-center justify-center font-mono font-bold text-xs text-slate-300 shadow-md group-hover:border-emerald-500/30 transition-all flex-shrink-0">
                          {si.name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-slate-100 group-hover:text-emerald-300 transition-colors leading-tight">
                              {si.name}
                            </span>
                            <span className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider border ${CATEGORY_COLORS[category] || CATEGORY_COLORS["Value"]}`}>
                              {category}
                            </span>
                          </div>
                          <span className="text-xs text-slate-400 font-mono mt-0.5 block leading-tight">
                            {fundName}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Period */}
                    <td className="py-4 px-5">
                      <div className="flex flex-col">
                        <span className="text-xs font-mono text-slate-200">
                          {isQ2 ? "Q2 2026 (30-Jun)" : isLiquidated ? "Liq. Jul-2026" : "Q1/Q2 2026"}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">
                          {si.aum13F ? `$${si.aum13F}B AUM` : ""}
                        </span>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="py-4 px-5">
                      <span className={`inline-block px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border ${CATEGORY_COLORS[category] || CATEGORY_COLORS["Value"]}`}>
                        {category}
                      </span>
                    </td>

                    {/* Portfolio Score Column with Donut (only number) */}
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-2">
                        <ScoreDonut
                          score={scoreInfo.score}
                          colorHex={scoreInfo.colorHex}
                          size={26}
                          strokeWidth={3}
                        />
                        <span className="font-mono text-sm font-bold text-slate-100">{scoreInfo.score}</span>
                      </div>
                    </td>

                    {/* Portfolio Value */}
                    <td className="py-4 px-5 text-right font-mono text-sm font-semibold text-slate-200">
                      {loadingStats ? (
                        <div className="h-4 w-16 bg-slate-800/30 rounded animate-pulse ml-auto" />
                      ) : (
                        formattedValue
                      )}
                    </td>

                    {/* Daily Change */}
                    <td className="py-4 px-5 text-right font-mono text-sm">
                      {loadingStats ? (
                        <div className="h-4 w-20 bg-[#1e293b]/30 rounded animate-pulse ml-auto" />
                      ) : (
                        <div className="flex flex-col items-end">
                          <span className={`font-bold ${isPositive ? "text-emerald-400" : "text-rose-400"}`}>
                            {formattedDailyPnL}
                          </span>
                          <span className={`text-[10px] font-semibold ${isPositive ? "text-emerald-400/80" : "text-rose-400/80"}`}>
                            {formattedDailyPnLPercent}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Top Holdings */}
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-1.5 flex-wrap max-w-[280px]">
                        {topHoldings.map((h, idx) => {
                          const sharesK = (h.shares / 1000).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "k";
                          return (
                            <span
                              key={`${h.ticker}-${idx}`}
                              className="text-[9px] font-mono font-bold text-slate-300 bg-[#121420] border border-slate-900 px-1.5 py-0.5 rounded hover:border-slate-800 transition-colors"
                              title={`${h.company || h.ticker} • ${sharesK} ${language === "EN" ? "shares" : "acciones"}`}
                            >
                              {h.ticker}
                              {h.portfolioWeight ? ` (${h.portfolioWeight.toFixed(1)}%)` : ""}
                            </span>
                          );
                        })}
                        {totalPositions > 4 && (
                          <span className="text-[9px] font-mono font-medium text-slate-500 bg-[#121420]/30 border border-slate-900/30 px-1 py-0.5 rounded">
                            +{totalPositions - 4}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Positions Count */}
                    <td className="py-4 px-5 text-center font-mono text-sm font-medium text-slate-400">
                      {totalPositions}
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
