import React, { useState, useMemo } from "react";
import { Sparkles, Sliders, RefreshCw, Plus, Check, Search, TrendingUp, AlertCircle, ChevronDown, ChevronUp, Cpu, Award, Zap, Layers } from "lucide-react";
import { buildScores, getRawFeatures, overrideFeaturesWithFinancials } from "../utils/engine";
import { CompanyLogo } from "./HoldingsTable";
import { SP500_SECTORS_TOP20 } from "../data/sp500Sectors";

export interface ScannedItem {
  symbol: string;
  name: string;
  sector: string;
  scoreGeneral: number;
  scoreGrowth: number;
  scoreQuality: number;
  scoreStability: number;
  scoreValuation: number;
  activeScore: number;
  inWatchlist: boolean;
}

interface WatchlistSectorScannerProps {
  language: "EN" | "ES";
  watchlist: string[];
  financialsMap?: Record<string, any>;
  onAddToWatchlist: (symbol: string) => void;
}

export function WatchlistSectorScanner({
  language,
  watchlist,
  financialsMap = {},
  onAddToWatchlist
}: WatchlistSectorScannerProps) {
  const [selectedSector, setSelectedSector] = useState<string>("Technology");
  const [scoreType, setScoreType] = useState<"general" | "growth" | "quality" | "stability" | "valuation">("general");
  const [minScore, setMinScore] = useState<number>(70);
  const [isOpen, setIsOpen] = useState<boolean>(true);

  // AI state
  const [loadingAi, setLoadingAi] = useState<boolean>(false);
  const [aiAnalysisText, setAiAnalysisText] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const isSpanish = language === "ES";

  // Calculate quantitative matching tickers for top 20 of selected sector
  const scanResults = useMemo<ScannedItem[]>(() => {
    const sectorData = SP500_SECTORS_TOP20[selectedSector];
    if (!sectorData) return [];

    const rawList = sectorData.tickers.map((t) => {
      const raw = getRawFeatures(t.symbol, t.name, selectedSector);
      if (financialsMap[t.symbol.toUpperCase()]) {
        overrideFeaturesWithFinancials(raw, financialsMap[t.symbol.toUpperCase()]);
      }
      return raw;
    });

    const scoredList = buildScores(rawList, "zscore", financialsMap);

    const evaluated = scoredList.map((row) => {
      const scoreGeneral = Math.round(row.scores.balanced ?? 0);
      const scoreGrowth = Math.round(row.factors.growth ?? 0);
      const scoreQuality = Math.round(row.factors.quality ?? 0);
      const scoreStability = Math.round(row.factors.stability ?? 0);
      const scoreValuation = Math.round(row.factors.valuation ?? 0);

      let activeScore = scoreGeneral;
      if (scoreType === "growth") activeScore = scoreGrowth;
      if (scoreType === "quality") activeScore = scoreQuality;
      if (scoreType === "stability") activeScore = scoreStability;
      if (scoreType === "valuation") activeScore = scoreValuation;

      return {
        symbol: row.symbol,
        name: row.name,
        sector: row.sector,
        scoreGeneral,
        scoreGrowth,
        scoreQuality,
        scoreStability,
        scoreValuation,
        activeScore,
        inWatchlist: watchlist.includes(row.symbol.toUpperCase()),
      };
    });

    return evaluated
      .filter((item) => item.activeScore >= minScore)
      .sort((a, b) => b.activeScore - a.activeScore);
  }, [selectedSector, scoreType, minScore, watchlist, financialsMap]);

  // Handle AI analysis triggering
  const handleRunAiAnalysis = async () => {
    setLoadingAi(true);
    setAiError(null);
    setAiAnalysisText(null);

    try {
      const response = await fetch("/api/watchlist/scan-sector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sector: selectedSector,
          sectorEs: SP500_SECTORS_TOP20[selectedSector]?.nameEs,
          scoreType,
          minScore,
          language,
          matchedTickers: scanResults,
          totalScanned: 20,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to analyze sector");
      }
      setAiAnalysisText(data.text);
    } catch (err: any) {
      console.error("Error in AI sector scanner:", err);
      setAiError(err.message || "Error al conectar con el motor de IA");
    } finally {
      setLoadingAi(false);
    }
  };

  const getScoreBadgeClass = (score: number) => {
    if (score >= 75) return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    if (score >= 50) return "bg-blue-500/10 text-blue-400 border-blue-500/20";
    if (score >= 35) return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    return "bg-rose-500/10 text-rose-400 border-rose-500/20";
  };

  const renderFormattedMarkdown = (text: string) => {
    if (!text) return null;
    const lines = text.split("\n");

    return lines.map((line, idx) => {
      const trimmed = line.trim();

      if (trimmed.startsWith("# ")) {
        return (
          <h2 key={idx} className="text-base md:text-lg font-display font-extrabold text-white tracking-wide uppercase border-b border-slate-800 pb-2 mt-6 mb-4 first:mt-0 flex items-center gap-2">
            <Sparkles size={16} className="text-blue-400" />
            {trimmed.substring(2)}
          </h2>
        );
      }

      if (trimmed.startsWith("## ")) {
        return (
          <h3 key={idx} className="text-xs md:text-sm font-display font-bold text-blue-300 tracking-wider uppercase bg-blue-500/5 border border-blue-500/10 px-3.5 py-2 rounded-xl mt-6 mb-3 flex items-center gap-2">
            <span className="w-1.5 h-3 bg-blue-400 rounded-sm" />
            {trimmed.substring(3)}
          </h3>
        );
      }

      if (trimmed.startsWith("### ")) {
        return (
          <h4 key={idx} className="text-xs font-bold text-slate-200 tracking-wider uppercase mt-4 mb-2 flex items-center gap-1.5">
            <span className="w-1 h-1 bg-blue-400 rounded-full" />
            {trimmed.substring(4)}
          </h4>
        );
      }

      if (trimmed.startsWith("- ")) {
        const content = trimmed.substring(2);
        // Replace **bold**
        const parts = content.split(/(\*\*.*?\*\*)/g);
        return (
          <div key={idx} className="flex items-start gap-2 ml-1 my-1.5 text-xs text-slate-300 leading-relaxed">
            <span className="text-blue-400 shrink-0 mt-1 text-[8px]">■</span>
            <span className="flex-1">
              {parts.map((part, pIdx) => {
                if (part.startsWith("**") && part.endsWith("**")) {
                  return <strong key={pIdx} className="font-bold text-white">{part.slice(2, -2)}</strong>;
                }
                return part;
              })}
            </span>
          </div>
        );
      }

      if (!trimmed) return <div key={idx} className="h-2" />;

      // Normal paragraph
      const parts = trimmed.split(/(\*\*.*?\*\*)/g);
      return (
        <p key={idx} className="text-xs text-slate-300 leading-relaxed my-1.5">
          {parts.map((part, pIdx) => {
            if (part.startsWith("**") && part.endsWith("**")) {
              return <strong key={pIdx} className="font-bold text-white">{part.slice(2, -2)}</strong>;
            }
            return part;
          })}
        </p>
      );
    });
  };

  return (
    <div className="bg-[#0e111d]/90 backdrop-blur-md border border-slate-800/80 rounded-2xl p-5 shadow-2xl space-y-4">
      {/* Header Bar */}
      <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => setIsOpen(!isOpen)}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500/20 via-indigo-500/15 to-purple-500/10 border border-blue-500/30 text-blue-400 shadow-md">
            <Sparkles size={18} className="animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm md:text-base font-display font-extrabold text-white tracking-wide uppercase">
                {isSpanish ? "Escáner Sectorial S&P 500 con IA" : "AI S&P 500 Sector Scanner"}
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-blue-300 border border-blue-500/30 uppercase tracking-widest">
                Top 20 {isSpanish ? "por Sector" : "per Sector"}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {isSpanish 
                ? "Filtra cuantitativamente las top 20 acciones del sector deseado por Score General, Growth o Quality y genera tesis con IA" 
                : "Filter top 20 stocks by sector & scores (General, Growth, Quality) and generate AI investment theses"}
            </p>
          </div>
        </div>
        <button className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors">
          {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
      </div>

      {isOpen && (
        <div className="space-y-5 pt-2 border-t border-slate-800/60">
          {/* Controls Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Sector Selector */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Layers size={11} className="text-blue-400" />
                {isSpanish ? "Sector del S&P 500" : "S&P 500 Sector"}
              </label>
              <select
                value={selectedSector}
                onChange={(e) => {
                  setSelectedSector(e.target.value);
                  setAiAnalysisText(null);
                }}
                className="w-full bg-slate-900 border border-slate-800 text-white rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-blue-500 transition-all cursor-pointer"
              >
                {Object.keys(SP500_SECTORS_TOP20).map((secKey) => (
                  <option key={secKey} value={secKey}>
                    {isSpanish ? SP500_SECTORS_TOP20[secKey].nameEs : SP500_SECTORS_TOP20[secKey].nameEn}
                  </option>
                ))}
              </select>
            </div>

            {/* Score Type Selector */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Award size={11} className="text-emerald-400" />
                {isSpanish ? "Métrica de Score" : "Score Metric"}
              </label>
              <select
                value={scoreType}
                onChange={(e) => {
                  setScoreType(e.target.value as any);
                  setAiAnalysisText(null);
                }}
                className="w-full bg-slate-900 border border-slate-800 text-white rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-blue-500 transition-all cursor-pointer"
              >
                <option value="general">{isSpanish ? "Score General (Global)" : "Overall Score"}</option>
                <option value="growth">{isSpanish ? "Score Growth (Crecimiento)" : "Growth Score"}</option>
                <option value="quality">{isSpanish ? "Score Quality (Calidad)" : "Quality Score"}</option>
                <option value="stability">{isSpanish ? "Score Stability (Estabilidad)" : "Stability Score"}</option>
                <option value="valuation">{isSpanish ? "Score Valuation (Valoración)" : "Valuation Score"}</option>
              </select>
            </div>

            {/* Min Score Threshold Slider */}
            <div className="space-y-1 sm:col-span-2 lg:col-span-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Sliders size={11} className="text-amber-400" />
                  {isSpanish ? "Score Mínimo (≥)" : "Minimum Score (≥)"}
                </label>
                <span className="text-xs font-extrabold text-blue-400 font-mono bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                  {minScore} / 100
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={minScore}
                onChange={(e) => {
                  setMinScore(Number(e.target.value));
                  setAiAnalysisText(null);
                }}
                className="w-full accent-blue-500 bg-slate-800 h-1.5 rounded-lg cursor-pointer mt-2"
              />
            </div>

            {/* AI Scan Button */}
            <div className="flex items-end">
              <button
                onClick={handleRunAiAnalysis}
                disabled={loadingAi}
                className="w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-extrabold text-xs py-2.5 px-4 rounded-xl shadow-lg shadow-blue-500/20 border border-blue-400/30 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {loadingAi ? (
                  <>
                    <RefreshCw size={14} className="animate-spin text-blue-300" />
                    <span>{isSpanish ? "Escaneando con IA..." : "AI Scanning..."}</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={14} className="text-amber-300" />
                    <span>{isSpanish ? "Analizar Escaneo con IA" : "AI Analyze Scan"}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Scanned Quantitative Results Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-400 px-1">
              <span>
                {isSpanish ? "Resultados del Escaneo" : "Scan Results"}:{" "}
                <span className="text-white font-extrabold">{scanResults.length}</span> / 20{" "}
                <span className="text-slate-500 font-normal">
                  ({isSpanish ? "Top 20 en" : "Top 20 in"} {isSpanish ? SP500_SECTORS_TOP20[selectedSector]?.nameEs : selectedSector})
                </span>
              </span>
              <span className="text-[10px] text-slate-500">
                {isSpanish ? "Filtro activo" : "Active filter"}: <strong className="text-blue-400 uppercase">{scoreType} ≥ {minScore}</strong>
              </span>
            </div>

            {scanResults.length === 0 ? (
              <div className="py-8 text-center bg-slate-950/40 border border-slate-800/60 rounded-xl p-4 text-xs text-slate-400 space-y-1">
                <AlertCircle size={20} className="mx-auto text-amber-400" />
                <p className="font-bold text-white">
                  {isSpanish 
                    ? `Ninguna de las Top 20 empresas de ${SP500_SECTORS_TOP20[selectedSector]?.nameEs} alcanza el score de ${minScore}` 
                    : `No Top 20 companies in ${selectedSector} reached the score of ${minScore}`}
                </p>
                <p className="text-[11px] text-slate-500">
                  {isSpanish ? "Intenta reducir el score mínimo usando el control arriba." : "Try lowering the minimum score using the slider above."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[360px] overflow-y-auto pr-1">
                {scanResults.map((item, idx) => (
                  <div
                    key={`${item.symbol}-${idx}`}
                    className="bg-slate-900/80 border border-slate-800/80 hover:border-blue-500/40 rounded-xl p-3 transition-all flex flex-col justify-between gap-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="text-[10px] font-mono font-bold text-slate-500 w-4 text-center">
                          #{idx + 1}
                        </span>
                        <CompanyLogo ticker={item.symbol} size="sm" />
                        <div>
                          <span className="font-extrabold text-white text-xs block font-mono">{item.symbol}</span>
                          <span className="text-[10px] text-slate-400 block truncate max-w-[120px]">{item.name}</span>
                        </div>
                      </div>

                      {/* Add to Watchlist Button */}
                      {item.inWatchlist ? (
                        <span className="px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold flex items-center gap-1">
                          <Check size={11} />
                          {isSpanish ? "En Watchlist" : "In Watchlist"}
                        </span>
                      ) : (
                        <button
                          onClick={() => onAddToWatchlist(item.symbol)}
                          className="px-2 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Plus size={11} />
                          {isSpanish ? "Agregar" : "Add"}
                        </button>
                      )}
                    </div>

                    {/* Compact Scores Pill Badges */}
                    <div className="grid grid-cols-5 gap-1 pt-1.5 border-t border-slate-800/50 text-[10px]">
                      <div
                        title={isSpanish ? "Score General / Balanceado" : "Overall Score"}
                        className={`p-1 rounded text-center border transition-all ${scoreType === "general" ? "ring-2 ring-blue-400 font-extrabold" : ""} ${getScoreBadgeClass(item.scoreGeneral)}`}
                      >
                        <span className="block text-[8px] text-slate-400 font-bold uppercase tracking-tighter truncate">{isSpanish ? "GRAL" : "OVR"}</span>
                        <span className="font-extrabold font-mono text-xs">{item.scoreGeneral}</span>
                      </div>
                      <div
                        title={isSpanish ? "Score de Crecimiento (Growth)" : "Growth Score"}
                        className={`p-1 rounded text-center border transition-all ${scoreType === "growth" ? "ring-2 ring-blue-400 font-extrabold" : ""} ${getScoreBadgeClass(item.scoreGrowth)}`}
                      >
                        <span className="block text-[8px] text-slate-400 font-bold uppercase tracking-tighter truncate">{isSpanish ? "GROW" : "GROW"}</span>
                        <span className="font-extrabold font-mono text-xs">{item.scoreGrowth}</span>
                      </div>
                      <div
                        title={isSpanish ? "Score de Calidad (Quality)" : "Quality Score"}
                        className={`p-1 rounded text-center border transition-all ${scoreType === "quality" ? "ring-2 ring-blue-400 font-extrabold" : ""} ${getScoreBadgeClass(item.scoreQuality)}`}
                      >
                        <span className="block text-[8px] text-slate-400 font-bold uppercase tracking-tighter truncate">{isSpanish ? "QUAL" : "QUAL"}</span>
                        <span className="font-extrabold font-mono text-xs">{item.scoreQuality}</span>
                      </div>
                      <div
                        title={isSpanish ? "Score de Estabilidad (Stability)" : "Stability Score"}
                        className={`p-1 rounded text-center border transition-all ${scoreType === "stability" ? "ring-2 ring-blue-400 font-extrabold" : ""} ${getScoreBadgeClass(item.scoreStability)}`}
                      >
                        <span className="block text-[8px] text-slate-400 font-bold uppercase tracking-tighter truncate">{isSpanish ? "STAB" : "STAB"}</span>
                        <span className="font-extrabold font-mono text-xs">{item.scoreStability}</span>
                      </div>
                      <div
                        title={isSpanish ? "Score de Valoración (Valuation)" : "Valuation Score"}
                        className={`p-1 rounded text-center border transition-all ${scoreType === "valuation" ? "ring-2 ring-blue-400 font-extrabold" : ""} ${getScoreBadgeClass(item.scoreValuation)}`}
                      >
                        <span className="block text-[8px] text-slate-400 font-bold uppercase tracking-tighter truncate">{isSpanish ? "VALU" : "VALU"}</span>
                        <span className="font-extrabold font-mono text-xs">{item.scoreValuation}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AI Analysis Result Section */}
          {aiError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle size={14} />
              <span>{aiError}</span>
            </div>
          )}

          {aiAnalysisText && (
            <div className="bg-[#0b0d18] border border-blue-500/30 rounded-2xl p-4 md:p-5 shadow-2xl relative overflow-hidden space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <Cpu size={16} className="text-blue-400" />
                  <h4 className="text-xs md:text-sm font-extrabold text-white uppercase tracking-wider">
                    {isSpanish ? "Informe de Inteligencia Artificial del Sector" : "AI Sector Intelligence Report"}
                  </h4>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">
                  Gemini 3.6 Flash
                </span>
              </div>

              <div className="prose prose-invert max-w-none text-xs">
                {renderFormattedMarkdown(aiAnalysisText)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
