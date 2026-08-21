import React, { useState, useEffect, useMemo } from "react";
import { Position } from "../types";
import { 
  buildScores, 
  getRawFeatures, 
  overrideFeaturesWithFinancials,
  ScoredRow, 
  StrategyId, 
  Mode, 
  STRATEGIES, 
  FACTOR_METRICS 
} from "../utils/engine";
import { getStockScore, calculatePortfolioScoreFromMatrix } from "../utils/stockScoresMatrix";
import { 
  getTickerSector, 
  getSectorSpanish, 
  getSectorColor 
} from "./HoldingsTable";
import { 
  Award, 
  TrendingUp, 
  Shield, 
  Activity, 
  Sparkles, 
  Info, 
  ChevronDown, 
  ChevronUp, 
  Scale, 
  Dribbble, 
  CheckCircle,
  HelpCircle,
  Layers
} from "lucide-react";

interface StockScorecardProps {
  positions: Position[];
}

export default function StockScorecard({ positions }: StockScorecardProps) {
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyId>("balanced");
  const [selectedMode, setSelectedMode] = useState<Mode>("percentile");
  const [expandedTickers, setExpandedTickers] = useState<Record<string, boolean>>({});
  const [allowMultipleExpand, setAllowMultipleExpand] = useState<boolean>(true);

  const toggleExpanded = (symbol: string) => {
    setExpandedTickers((prev) => {
      const isCurrentlyExpanded = !!prev[symbol];
      if (allowMultipleExpand) {
        return {
          ...prev,
          [symbol]: !isCurrentlyExpanded,
        };
      } else {
        return {
          [symbol]: !isCurrentlyExpanded,
        };
      }
    });
  };

  // Filter out cash position since cash doesn't have stock factor scoring
  const stockPositions = useMemo(() => {
    return positions.filter((p) => !p.isCash);
  }, [positions]);

  const [financialsMap, setFinancialsMap] = useState<Record<string, { annual: any[]; quarterly: any[] }>>({});

  useEffect(() => {
    const fetchAllFinancials = async () => {
      const tickersToFetch = Array.from(new Set(stockPositions.map(p => p.ticker)));
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
      results.forEach((r: any) => {
        if (r.data && !r.data.error) {
          if (Array.isArray(r.data.annual)) r.data.annual.sort(sortFn);
          if (Array.isArray(r.data.quarterly)) r.data.quarterly.sort(sortFn);
          newMap[r.ticker] = r.data;
          newMap[r.ticker.toUpperCase()] = r.data;
        }
      });
      setFinancialsMap(newMap);
    };
    if (stockPositions.length > 0) {
      fetchAllFinancials();
    }
  }, [stockPositions]);

  // Generate a map of raw features for accurate UI rendering (aligned with the scoredRows)
  const rawFeaturesMap = useMemo(() => {
    const map: Record<string, any> = {};
    stockPositions.forEach((pos) => {
      const sector = getTickerSector(pos.ticker, pos.isCash);
      let raw = { ...getRawFeatures(pos.ticker, pos.name, sector) };
      const finData = financialsMap[pos.ticker] || financialsMap[pos.ticker.toUpperCase()];
      if (finData) {
        raw = overrideFeaturesWithFinancials(raw, finData);
      }
      if (pos.pe !== null && pos.pe !== undefined) {
        raw.trailing_pe = pos.pe;
      }
      if (pos.fwdPe !== null && pos.fwdPe !== undefined) {
        raw.forward_pe = pos.fwdPe;
      }
      if (pos.evEbitda !== null && pos.evEbitda !== undefined) {
        raw.ev_ebitda = pos.evEbitda;
      }
      map[pos.ticker.toUpperCase()] = raw;
    });
    return map;
  }, [stockPositions, financialsMap]);

  // Generate scored rows using the unified Master Stock Score Matrix
  const scoredRows = useMemo(() => {
    return stockPositions.map((pos) => {
      const sym = pos.ticker.toUpperCase();
      const sector = getTickerSector(pos.ticker, pos.isCash);
      const unified = getStockScore(sym, sector, pos.name);
      const raw = rawFeaturesMap[sym] || getRawFeatures(pos.ticker, pos.name, sector);

      return {
        symbol: unified.symbol,
        name: unified.name,
        sector: unified.sector,
        scores: unified.strategyScores,
        factors: unified.factors,
        archetype: unified.archetype,
        type: unified.type,
        valuationMethod: unified.valuationMethod,
        note: unified.note,
        sub: unified.subscores || {},
        raw,
      } as ScoredRow;
    });
  }, [stockPositions, rawFeaturesMap]);

  // Calculo de Score General del Portafolio (Ponderado por el peso de cada ticker activo)
  const portfolioScores = useMemo(() => {
    if (stockPositions.length === 0) return { percentile: 0, zscore: 0, totalWeight: 0 };

    let sumPct = 0;
    let sumZ = 0;
    let totalWeight = 0;

    // Crear un mapa de pesos por ticker (pesos de posiciones sin efectivo)
    const weightMap: Record<string, number> = {};
    positions.forEach((p) => {
      if (!p.isCash) {
        weightMap[p.ticker.toUpperCase()] = p.weight;
      }
    });

    scoredRows.forEach((row) => {
      const w = weightMap[row.symbol.toUpperCase()] || 0;
      const score = row.scores[selectedStrategy] || 0;
      sumPct += score * w;
      sumZ += score * w;
      totalWeight += w;
    });

    const finalPercentile = totalWeight > 0 ? sumPct / totalWeight : 0;
    const finalZScore = totalWeight > 0 ? sumZ / totalWeight : 0;

    return {
      percentile: finalPercentile,
      zscore: finalZScore,
      totalWeight,
    };
  }, [stockPositions, scoredRows, selectedStrategy, positions]);

  const getDisplayFeatures = (symbol: string, name: string, sector: string) => {
    return rawFeaturesMap[symbol.toUpperCase()] || getRawFeatures(symbol, name, sector);
  };

  // Find rank in sector
  const getRankInfo = (symbol: string, sector: string) => {
    const peers = scoredRows
      .filter((x) => x.sector === sector)
      .sort((a, b) => {
        const scoreA = a.scores[selectedStrategy] ?? 0;
        const scoreB = b.scores[selectedStrategy] ?? 0;
        return scoreB - scoreA;
      });
    const rank = peers.findIndex((x) => x.symbol === symbol) + 1;
    return { rank, total: peers.length };
  };

  const getScoreColorClass = (score: number | null) => {
    if (score === null) return "text-slate-500";
    if (score >= 75) return "text-emerald-400 font-bold";
    if (score >= 50) return "text-blue-400 font-semibold";
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

  const strategyNames: Record<StrategyId, string> = {
    balanced: "Balanced / Balanceado",
    garp: "GARP (Growth at Reasonable Price)",
    quality_def: "Quality Defensive / Defensivo de Calidad",
    deep_value: "Deep Value / Valor Profundo",
  };

  const strategyDescriptions: Record<StrategyId, string> = {
    balanced: "Ponderación equitativa (25% cada factor) para un perfil balanceado y robusto.",
    garp: "Enfocado en crecimiento sólido con valoraciones atractivas (30% Crecimiento, 35% Valuación).",
    quality_def: "Focalizado en alta rentabilidad y baja volatilidad (35% Calidad, 30% Estabilidad).",
    deep_value: "Máximo énfasis en activos infravalorados con fundamentos aceptables (50% Valuación).",
  };

  const sectorTextColors: Record<string, string> = {
    "Technology": "text-emerald-400",
    "Communication Services": "text-blue-400",
    "Consumer Discretionary": "text-amber-400",
    "Healthcare": "text-rose-400",
    "Financials": "text-indigo-400",
    "Industrials": "text-cyan-400",
    "Consumer Staples": "text-pink-400",
    "Energy": "text-orange-400",
    "Utilities": "text-purple-400",
    "Materials": "text-teal-400",
    "Cash / USD": "text-slate-400",
  };

  const getSectorTextClass = (sector: string): string => {
    return sectorTextColors[sector] || "text-emerald-400";
  };

  return (
    <div className="space-y-6" id="scorecard-section">
      {/* 1. COMPONENT HEADER / CONTROL PANEL */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[#0a0c14]/40 border border-slate-900/40 p-6 rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-500/20 to-teal-500/20 flex items-center justify-center border border-emerald-500/30">
            <Award className="text-emerald-400" size={16} />
          </div>
          <div>
            <h2 className="text-sm font-display font-bold text-white tracking-wider uppercase flex items-center gap-2">
              SISTEMA DE FACTOR SCORING (SECTOR-RELATIVO)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 leading-none">
              Análisis cuantitativo de activos comparados exclusivamente contra sus pares de sector • Valores en tiempo real de Yahoo Finance
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-3">
          {/* Embedded Circular Scores (Swapped here, scaled beautifully) */}
          <div className="flex items-center gap-4 bg-[#0a0c14]/40 border border-slate-900/40 rounded-full px-3.5 py-1 shadow-inner">
            {/* Percentiles Circle */}
            <div className="flex items-center gap-2">
              <div className="relative w-12 h-12 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    className="stroke-slate-900/80 fill-transparent"
                    strokeWidth="3.5"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    className="stroke-emerald-400 fill-transparent transition-all duration-700 ease-out"
                    strokeWidth="3.5"
                    strokeDasharray="94.2"
                    strokeDashoffset={94.2 - (portfolioScores.totalWeight > 0 ? Math.min(100, portfolioScores.percentile) : 0) / 100 * 94.2}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-display font-black text-white leading-none">
                    {portfolioScores.totalWeight > 0 ? portfolioScores.percentile.toFixed(0) : "—"}
                  </span>
                </div>
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Percentiles
              </span>
            </div>

            {/* Divider */}
            <div className="w-[1px] h-6 bg-slate-800" />

            {/* Z-Score Circle */}
            <div className="flex items-center gap-2">
              <div className="relative w-12 h-12 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    className="stroke-slate-900/80 fill-transparent"
                    strokeWidth="3.5"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    className="stroke-blue-400 fill-transparent transition-all duration-700 ease-out"
                    strokeWidth="3.5"
                    strokeDasharray="94.2"
                    strokeDashoffset={94.2 - (portfolioScores.totalWeight > 0 ? Math.min(100, portfolioScores.zscore) : 0) / 100 * 94.2}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-display font-black text-white leading-none">
                    {portfolioScores.totalWeight > 0 ? portfolioScores.zscore.toFixed(0) : "—"}
                  </span>
                </div>
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Z-Score
              </span>
            </div>
          </div>
        </div>
      </div>

      {stockPositions.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center text-slate-400 shadow-2xl">
          <p className="font-medium">Agrega acciones comunes a tu cartera para calcular sus scores factoriales.</p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl overflow-hidden">
          {/* Controls for expanding multiple tickers */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 mb-4 border-b border-slate-800">
            <div className="flex items-center">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Score
              </span>
            </div>

            {/* Mode Selector Toggle (Swapped here) */}
            <div className="inline-flex bg-[#0a0c14] border border-slate-800 rounded-full p-1 text-[11px] font-bold shadow-inner" id="scorecard-mode-toggle">
              <button
                onClick={() => setSelectedMode("percentile")}
                className={`px-3.5 py-1.5 rounded-full transition-all duration-300 cursor-pointer flex items-center gap-1.5 uppercase font-bold text-[10px] tracking-wider ${
                  selectedMode === "percentile"
                    ? "bg-gradient-to-r from-[#8da2f8] via-[#5c6dfd] to-[#bbf246] text-[#0a0d1a] font-extrabold shadow-md"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                <Layers size={10} />
                Percentiles
              </button>
              <button
                onClick={() => setSelectedMode("zscore")}
                className={`px-3.5 py-1.5 rounded-full transition-all duration-300 cursor-pointer flex items-center gap-1.5 uppercase font-bold text-[10px] tracking-wider ${
                  selectedMode === "zscore"
                    ? "bg-gradient-to-r from-[#8da2f8] via-[#5c6dfd] to-[#bbf246] text-[#0a0d1a] font-extrabold shadow-md"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                <Scale size={10} />
                Z-Score (CDF)
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[850px]">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-[10px] md:text-xs font-semibold uppercase tracking-wider">
                  <th className="py-3 px-2">Ticker / Activo</th>
                  <th className="py-3 px-2 text-center">Growth (Crecimiento)</th>
                  <th className="py-3 px-2 text-center">Quality (Calidad)</th>
                  <th className="py-3 px-2 text-center">Stability (Estabilidad)</th>
                  <th className="py-3 px-2 text-center">Valuation (Valuación)</th>
                  <th className="py-3 px-2 text-center bg-slate-950/20 border-x border-slate-800">Score Global</th>
                  <th className="py-3 px-2">Clasificación / Arquetipo</th>
                  <th className="py-3 px-2 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {scoredRows.map((row, idx) => {
                  const isExpanded = !!expandedTickers[row.symbol];
                  const rankInfo = getRankInfo(row.symbol, row.sector);
                  const globalScore = row.scores[selectedStrategy];

                  return (
                    <React.Fragment key={`${row.symbol}-${idx}`}>
                      {/* Main Row */}
                      <tr
                        onClick={() => toggleExpanded(row.symbol)}
                        className={`text-xs md:text-sm hover:bg-slate-800/30 transition-all cursor-pointer ${
                          isExpanded ? "bg-slate-800/20" : ""
                        }`}
                      >
                        {/* Symbol & Name */}
                        <td className="py-4 px-2">
                          <div className="flex items-center gap-2.5">
                            <span className="font-display font-bold text-white tracking-wide text-sm">
                              {row.symbol}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-medium truncate max-w-[150px] mt-0.5">
                            {row.name}
                          </div>
                        </td>

                        {/* Factor Growth */}
                        <td className="py-4 px-2 text-center font-mono">
                          <div className="flex flex-col items-center">
                            <span className={`text-xs font-bold ${getScoreColorClass(row.factors.growth)}`}>
                              {row.factors.growth !== null ? `${row.factors.growth.toFixed(1)}` : "—"}
                            </span>
                            <div className="w-16 h-1 bg-slate-900 rounded-full overflow-hidden mt-1.5">
                              <div 
                                className="bg-emerald-500 h-full rounded-full" 
                                style={{ width: `${row.factors.growth ?? 0}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Factor Quality */}
                        <td className="py-4 px-2 text-center font-mono">
                          <div className="flex flex-col items-center">
                            <span className={`text-xs font-bold ${getScoreColorClass(row.factors.quality)}`}>
                              {row.factors.quality !== null ? `${row.factors.quality.toFixed(1)}` : "—"}
                            </span>
                            <div className="w-16 h-1 bg-slate-900 rounded-full overflow-hidden mt-1.5">
                              <div 
                                className="bg-blue-500 h-full rounded-full" 
                                style={{ width: `${row.factors.quality ?? 0}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Factor Stability */}
                        <td className="py-4 px-2 text-center font-mono">
                          <div className="flex flex-col items-center">
                            <span className={`text-xs font-bold ${getScoreColorClass(row.factors.stability)}`}>
                              {row.factors.stability !== null ? `${row.factors.stability.toFixed(1)}` : "—"}
                            </span>
                            <div className="w-16 h-1 bg-slate-900 rounded-full overflow-hidden mt-1.5">
                              <div 
                                className="bg-amber-500 h-full rounded-full" 
                                style={{ width: `${row.factors.stability ?? 0}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Factor Valuation */}
                        <td className="py-4 px-2 text-center font-mono">
                          <div className="flex flex-col items-center">
                            <span className={`text-xs font-bold ${getScoreColorClass(row.factors.valuation)}`}>
                              {row.factors.valuation !== null ? `${row.factors.valuation.toFixed(1)}` : "—"}
                            </span>
                            <div className="w-16 h-1 bg-slate-900 rounded-full overflow-hidden mt-1.5">
                              <div 
                                className="bg-purple-500 h-full rounded-full" 
                                style={{ width: `${row.factors.valuation ?? 0}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Strategy Overall Score */}
                        <td className="py-4 px-2 text-center bg-slate-950/10 border-x border-slate-800/30">
                          <span className={`inline-flex items-center justify-center px-3 py-1 rounded-xl text-xs font-black border font-mono ${getScoreBgClass(globalScore)}`}>
                            {globalScore !== null ? `${globalScore.toFixed(1)}` : "—"}
                          </span>
                        </td>

                        {/* Archetype */}
                        <td className="py-4 px-2">
                          <span className="text-xs font-bold text-slate-100 block">
                            {row.archetype}
                          </span>
                          <span className="text-[10px] text-slate-400 mt-0.5 block italic leading-none">
                            {row.note}
                          </span>
                        </td>

                        {/* Rank info and Expand Icon */}
                        <td className="py-4 px-2 text-right">
                          <div className="flex items-center justify-end gap-3 pr-2">
                            <span className="font-mono text-[10px] text-slate-500 font-bold bg-[#121420] border border-slate-850 px-2 py-0.5 rounded">
                              Sector Rank: {rankInfo.rank}/{rankInfo.total}
                            </span>
                            {isExpanded ? (
                              <ChevronUp size={14} className="text-slate-400 shrink-0" />
                            ) : (
                              <ChevronDown size={14} className="text-slate-400 shrink-0" />
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Sub-Metrics Details Row */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={8} className="bg-slate-950/40 p-5 border-y border-slate-800">
                            <div className="space-y-4 max-w-5xl mx-auto">
                              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                                <h4 className="text-xs font-bold text-slate-200 tracking-wider uppercase font-mono flex items-center gap-1.5">
                                  <Sparkles size={12} className="text-[#bbf246]" />
                                  Desglose de Métricas Fundamentales & Percentiles de Sector ({row.symbol})
                                </h4>
                                <span className="text-[10px] text-slate-500 uppercase font-bold">
                                  Clasificación: <span className="text-white font-extrabold">{row.archetype}</span>
                                </span>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                {/* Growth Factor Metrics */}
                                <div className="space-y-2 bg-[#121420]/30 border border-slate-800/60 p-3 rounded-2xl">
                                  <span className="text-[10px] font-black uppercase text-emerald-400 tracking-wider flex items-center gap-1.5 border-b border-slate-800 pb-1 mb-1">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    Crecimiento (Growth)
                                  </span>
                                  <div className="space-y-2 text-xs">
                                    <div className="flex justify-between items-center py-0.5">
                                      <span className="text-slate-400 font-medium">Revenue AGR:</span>
                                      <div className="text-right">
                                        <span className="font-mono text-white font-bold block">
                                          {(getDisplayFeatures(row.symbol, row.name, row.sector).revenue_cagr ?? 0).toFixed(1)}%
                                        </span>
                                        <span className="text-[9px] text-emerald-400 font-mono font-bold">
                                          Score: {row.sub.revenue_cagr !== null ? Math.round(row.sub.revenue_cagr) : "—"}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex justify-between items-center py-0.5 border-t border-slate-800/30">
                                      <span className="text-slate-400 font-medium">EPS AGR:</span>
                                      <div className="text-right">
                                        <span className="font-mono text-white font-bold block">
                                          {(getDisplayFeatures(row.symbol, row.name, row.sector).eps_cagr ?? 0).toFixed(1)}%
                                        </span>
                                        <span className="text-[9px] text-emerald-400 font-mono font-bold">
                                          Score: {row.sub.eps_cagr !== null ? Math.round(row.sub.eps_cagr) : "—"}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex justify-between items-center py-0.5 border-t border-slate-800/30">
                                      <span className="text-slate-400 font-medium">FCF AGR:</span>
                                      <div className="text-right">
                                        <span className="font-mono text-white font-bold block">
                                          {(getDisplayFeatures(row.symbol, row.name, row.sector).fcf_cagr ?? 0).toFixed(1)}%
                                        </span>
                                        <span className="text-[9px] text-emerald-400 font-mono font-bold">
                                          Score: {row.sub.fcf_cagr !== null ? Math.round(row.sub.fcf_cagr) : "—"}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {/* Quality Factor Metrics */}
                                <div className="space-y-2 bg-[#121420]/30 border border-slate-800/60 p-3 rounded-2xl">
                                  <span className="text-[10px] font-black uppercase text-blue-400 tracking-wider flex items-center gap-1.5 border-b border-slate-800 pb-1 mb-1">
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                    Calidad (Quality)
                                  </span>
                                  <div className="space-y-2 text-xs">
                                    <div className="flex justify-between items-center py-0.5">
                                      <span className="text-slate-400 font-medium">ROIC:</span>
                                      <div className="text-right">
                                        <span className="font-mono text-white font-bold block">
                                          {(getDisplayFeatures(row.symbol, row.name, row.sector).roic ?? 0).toFixed(1)}%
                                        </span>
                                        <span className="text-[9px] text-blue-400 font-mono font-bold">
                                          Score: {row.sub.roic !== null ? Math.round(row.sub.roic) : "—"}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex justify-between items-center py-0.5 border-t border-slate-800/30">
                                      <span className="text-slate-400 font-medium">Margen Bruto:</span>
                                      <div className="text-right">
                                        <span className="font-mono text-white font-bold block">
                                          {(getDisplayFeatures(row.symbol, row.name, row.sector).gross_margin ?? 0).toFixed(1)}%
                                        </span>
                                        <span className="text-[9px] text-blue-400 font-mono font-bold">
                                          Score: {row.sub.gross_margin !== null ? Math.round(row.sub.gross_margin) : "—"}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex justify-between items-center py-0.5 border-t border-slate-800/30">
                                      <span className="text-slate-400 font-medium">Margen Operativo:</span>
                                      <div className="text-right">
                                        <span className="font-mono text-white font-bold block">
                                          {(getDisplayFeatures(row.symbol, row.name, row.sector).operating_margin ?? 0).toFixed(1)}%
                                        </span>
                                        <span className="text-[9px] text-blue-400 font-mono font-bold">
                                          Score: {row.sub.operating_margin !== null ? Math.round(row.sub.operating_margin) : "—"}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex justify-between items-center py-0.5 border-t border-slate-800/30">
                                      <span className="text-slate-400 font-medium">FCF Conversion:</span>
                                      <div className="text-right">
                                        <span className="font-mono text-white font-bold block">
                                          {(getDisplayFeatures(row.symbol, row.name, row.sector).fcf_conversion ?? 0).toFixed(1)}%
                                        </span>
                                        <span className="text-[9px] text-blue-400 font-mono font-bold">
                                          Score: {row.sub.fcf_conversion !== null ? Math.round(row.sub.fcf_conversion) : "—"}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {/* Stability Factor Metrics */}
                                <div className="space-y-2 bg-[#121420]/30 border border-slate-800/60 p-3 rounded-2xl">
                                  <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider flex items-center gap-1.5 border-b border-slate-800 pb-1 mb-1">
                                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                    Estabilidad (Stability)
                                  </span>
                                  <div className="space-y-2 text-xs">
                                    <div className="flex justify-between items-center py-0.5">
                                      <span className="text-slate-400 font-medium">Beta:</span>
                                      <div className="text-right">
                                        <span className="font-mono text-white font-bold block">
                                          {(getDisplayFeatures(row.symbol, row.name, row.sector).beta ?? 0).toFixed(2)}
                                        </span>
                                        <span className="text-[9px] text-amber-400 font-mono font-bold">
                                          Score: {row.sub.beta !== null ? Math.round(row.sub.beta) : "—"}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex justify-between items-center py-0.5 border-t border-slate-800/30">
                                      <span className="text-slate-400 font-medium">Volatilidad Ingresos:</span>
                                      <div className="text-right">
                                        <span className="font-mono text-white font-bold block">
                                          {(getDisplayFeatures(row.symbol, row.name, row.sector).rev_growth_vol ?? 0).toFixed(1)}%
                                        </span>
                                        <span className="text-[9px] text-amber-400 font-mono font-bold">
                                          Score: {row.sub.rev_growth_vol !== null ? Math.round(row.sub.rev_growth_vol) : "—"}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex justify-between items-center py-0.5 border-t border-slate-800/30">
                                      <span className="text-slate-400 font-medium">Volatilidad Margen:</span>
                                      <div className="text-right">
                                        <span className="font-mono text-white font-bold block">
                                          {(getDisplayFeatures(row.symbol, row.name, row.sector).margin_vol ?? 0).toFixed(1)}%
                                        </span>
                                        <span className="text-[9px] text-amber-400 font-mono font-bold">
                                          Score: {row.sub.margin_vol !== null ? Math.round(row.sub.margin_vol) : "—"}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex justify-between items-center py-0.5 border-t border-slate-800/30">
                                      <span className="text-slate-400 font-medium">Intereses (Cov.):</span>
                                      <div className="text-right">
                                        <span className="font-mono text-white font-bold block">
                                          {(getDisplayFeatures(row.symbol, row.name, row.sector).interest_cov ?? 0).toFixed(1)}x
                                        </span>
                                        <span className="text-[9px] text-amber-400 font-mono font-bold">
                                          Score: {row.sub.interest_cov !== null ? Math.round(row.sub.interest_cov) : "—"}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {/* Valuation Factor Metrics */}
                                <div className="space-y-2 bg-[#121420]/30 border border-slate-800/60 p-3 rounded-2xl">
                                  <span className="text-[10px] font-black uppercase text-purple-400 tracking-wider flex items-center gap-1.5 border-b border-slate-800 pb-1 mb-1">
                                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                                    Valuación (Valuation)
                                  </span>
                                  <div className="space-y-2 text-xs">
                                    <div className="flex justify-between items-center py-0.5">
                                      <span className="text-slate-400 font-medium">P/E Trailing:</span>
                                      <div className="text-right">
                                        <span className="font-mono text-white font-bold block">
                                          {(getDisplayFeatures(row.symbol, row.name, row.sector).trailing_pe ?? 0).toFixed(1)}x
                                        </span>
                                        <span className="text-[9px] text-purple-400 font-mono font-bold">
                                          Score: {row.sub.trailing_pe !== null ? Math.round(row.sub.trailing_pe) : "—"}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex justify-between items-center py-0.5 border-t border-slate-800/30">
                                      <span className="text-slate-400 font-medium">P/E Forward:</span>
                                      <div className="text-right">
                                        <span className="font-mono text-white font-bold block">
                                          {(getDisplayFeatures(row.symbol, row.name, row.sector).forward_pe ?? 0).toFixed(1)}x
                                        </span>
                                        <span className="text-[9px] text-purple-400 font-mono font-bold">
                                          Score: {row.sub.forward_pe !== null ? Math.round(row.sub.forward_pe) : "—"}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex justify-between items-center py-0.5 border-t border-slate-800/30">
                                      <span className="text-slate-400 font-medium">EV / EBITDA:</span>
                                      <div className="text-right">
                                        <span className="font-mono text-white font-bold block">
                                          {(getDisplayFeatures(row.symbol, row.name, row.sector).ev_ebitda ?? 0).toFixed(1)}x
                                        </span>
                                        <span className="text-[9px] text-purple-400 font-mono font-bold">
                                          Score: {row.sub.ev_ebitda !== null ? Math.round(row.sub.ev_ebitda) : "—"}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex justify-between items-center py-0.5 border-t border-slate-800/30">
                                      <span className="text-slate-400 font-medium">FCF Yield:</span>
                                      <div className="text-right">
                                        <span className="font-mono text-white font-bold block">
                                          {(getDisplayFeatures(row.symbol, row.name, row.sector).fcf_yield ?? 0).toFixed(1)}%
                                        </span>
                                        <span className="text-[9px] text-purple-400 font-mono font-bold">
                                          Score: {row.sub.fcf_yield !== null ? Math.round(row.sub.fcf_yield) : "—"}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
