import { SP500_SECTORS_TOP20 } from "../data/sp500Sectors";
import { SUPERINVESTORS } from "../superinvestors";
import { 
  buildScores, 
  getRawFeatures, 
  overrideFeaturesWithFinancials, 
  normalizeSectorName, 
  ScoredRow, 
  Factor, 
  StrategyId 
} from "./engine";
import { TICKER_CLASSIFICATION } from "../data/tickerClassification";

export interface UnifiedStockScore {
  symbol: string;
  name: string;
  sector: string;
  sector_es?: string;
  score: number; // 0-100 (Balanced strategy default)
  grade: "A+" | "A" | "B+" | "B" | "C" | "D";
  labelEN: string;
  labelES: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  colorHex: string;
  factors: {
    growth: number;
    quality: number;
    stability: number;
    valuation: number;
  };
  strategyScores: {
    balanced: number;
    garp: number;
    quality_def: number;
    deep_value: number;
  };
  archetype: string;
  type: string;
  valuationMethod: string;
  note: string;
  subscores?: Record<string, number | null>;
}

export function getScoreGrade(score: number): "A+" | "A" | "B+" | "B" | "C" | "D" {
  if (score >= 80) return "A+";
  if (score >= 72) return "A";
  if (score >= 64) return "B+";
  if (score >= 55) return "B";
  if (score >= 45) return "C";
  return "D";
}

export function getScoreStyleConfig(score: number) {
  if (score >= 80) {
    return {
      grade: "A+" as const,
      labelEN: "Exceptional / Compounder",
      labelES: "Excelente / Compounder",
      badgeBg: "bg-emerald-500/15",
      badgeBorder: "border-emerald-500/40",
      badgeText: "text-emerald-400",
      colorHex: "#10b981",
    };
  }
  if (score >= 72) {
    return {
      grade: "A" as const,
      labelEN: "High Quality",
      labelES: "Alta Calidad",
      badgeBg: "bg-emerald-500/10",
      badgeBorder: "border-emerald-500/30",
      badgeText: "text-emerald-400",
      colorHex: "#10b981",
    };
  }
  if (score >= 64) {
    return {
      grade: "B+" as const,
      labelEN: "Solid Quality",
      labelES: "Calidad Sólida",
      badgeBg: "bg-teal-500/10",
      badgeBorder: "border-teal-500/30",
      badgeText: "text-teal-400",
      colorHex: "#14b8a6",
    };
  }
  if (score >= 55) {
    return {
      grade: "B" as const,
      labelEN: "Balanced / Value",
      labelES: "Equilibrado / Valor",
      badgeBg: "bg-sky-500/10",
      badgeBorder: "border-sky-500/30",
      badgeText: "text-sky-400",
      colorHex: "#38bdf8",
    };
  }
  if (score >= 45) {
    return {
      grade: "C" as const,
      labelEN: "Cyclical / Opportunistic",
      labelES: "Cíclico / Oportunista",
      badgeBg: "bg-amber-500/10",
      badgeBorder: "border-amber-500/30",
      badgeText: "text-amber-400",
      colorHex: "#fbbf24",
    };
  }
  return {
    grade: "D" as const,
    labelEN: "Speculative / Turnaround",
    labelES: "Especulativo / Turnaround",
    badgeBg: "bg-rose-500/10",
    badgeBorder: "border-rose-500/30",
    badgeText: "text-rose-400",
    colorHex: "#f43f5e",
  };
}

export function normalizeTicker(sym: string): string {
  if (!sym) return "";
  let clean = sym.trim().toUpperCase();
  if (clean === "BRK.B") clean = "BRK-B";
  if (clean === "BF.B") clean = "BF-B";
  return clean;
}

export function getSectorForTicker(ticker: string, fallbackSector?: string): string {
  const norm = normalizeTicker(ticker);
  if (TICKER_CLASSIFICATION[norm]) {
    return TICKER_CLASSIFICATION[norm].sector;
  }
  const altKey = norm.replace("-", ".");
  if (TICKER_CLASSIFICATION[altKey]) {
    return TICKER_CLASSIFICATION[altKey].sector;
  }
  if (fallbackSector) {
    return normalizeSectorName(fallbackSector);
  }
  // Search in S&P 500 sectors
  for (const [sectorName, sectorData] of Object.entries(SP500_SECTORS_TOP20)) {
    if (sectorData.tickers.some((t) => normalizeTicker(t.symbol) === norm || t.symbol === norm)) {
      return sectorName;
    }
  }
  return "Technology";
}

/** In-memory Master Scores Matrix Map (Singleton) */
const MATRIX_STORE = new Map<string, UnifiedStockScore>();

/** Map ScoredRow to UnifiedStockScore */
function mapRowToUnifiedScore(row: ScoredRow): UnifiedStockScore {
  const balancedScore = Math.ceil(row.scores.balanced ?? 55);
  const cfg = getScoreStyleConfig(balancedScore);

  const growth = Math.ceil(row.factors.growth ?? 50);
  const quality = Math.ceil(row.factors.quality ?? 50);
  const stability = Math.ceil(row.factors.stability ?? 50);
  const valuation = Math.ceil(row.factors.valuation ?? 50);

  const garp = Math.ceil(row.scores.garp ?? 50);
  const quality_def = Math.ceil(row.scores.quality_def ?? 50);
  const deep_value = Math.ceil(row.scores.deep_value ?? 50);

  const sectorClass = TICKER_CLASSIFICATION[normalizeTicker(row.symbol)] || TICKER_CLASSIFICATION[row.symbol];

  return {
    symbol: normalizeTicker(row.symbol),
    name: row.name || row.symbol,
    sector: row.sector,
    sector_es: sectorClass?.sector_es,
    score: balancedScore,
    grade: cfg.grade,
    labelEN: cfg.labelEN,
    labelES: cfg.labelES,
    badgeBg: cfg.badgeBg,
    badgeBorder: cfg.badgeBorder,
    badgeText: cfg.badgeText,
    colorHex: cfg.colorHex,
    factors: {
      growth,
      quality,
      stability,
      valuation,
    },
    strategyScores: {
      balanced: balancedScore,
      garp,
      quality_def,
      deep_value,
    },
    archetype: row.archetype,
    type: row.type,
    valuationMethod: row.valuationMethod,
    note: row.note,
    subscores: row.sub,
  };
}

/** Pre-initialize the entire universe of stocks on startup */
function initializeMasterMatrix() {
  const allRawFeatures: any[] = [];
  const registeredSymbols = new Set<string>();

  // 1. S&P 500 benchmark sector constituents
  Object.entries(SP500_SECTORS_TOP20).forEach(([sectorName, secData]) => {
    secData.tickers.forEach((t) => {
      const sym = normalizeTicker(t.symbol);
      if (!registeredSymbols.has(sym)) {
        registeredSymbols.add(sym);
        allRawFeatures.push(getRawFeatures(sym, t.name, sectorName));
      }
    });
  });

  // 2. All Superinvestors holdings
  Object.values(SUPERINVESTORS).forEach((fund) => {
    fund.holdings.forEach((h) => {
      if (h.ticker && h.ticker.toUpperCase() !== "CASH" && h.ticker.toUpperCase() !== "USD") {
        const sym = normalizeTicker(h.ticker);
        if (!registeredSymbols.has(sym)) {
          registeredSymbols.add(sym);
          const sec = getSectorForTicker(sym, h.sector);
          allRawFeatures.push(getRawFeatures(sym, h.company || sym, sec));
        }
      }
    });
  });

  // 3. Known classifications
  Object.keys(TICKER_CLASSIFICATION).forEach((tick) => {
    const sym = normalizeTicker(tick);
    if (!registeredSymbols.has(sym)) {
      registeredSymbols.add(sym);
      const sec = TICKER_CLASSIFICATION[tick].sector;
      allRawFeatures.push(getRawFeatures(sym, `${sym} Corporation`, sec));
    }
  });

  // Run initial sector-relative scoring
  const scoredUniverse = buildScores(allRawFeatures, "zscore");
  scoredUniverse.forEach((row) => {
    const unified = mapRowToUnifiedScore(row);
    MATRIX_STORE.set(unified.symbol, unified);
    // Also save dot-variant if hyphenated (e.g., BRK.B -> BRK-B)
    if (unified.symbol.includes("-")) {
      MATRIX_STORE.set(unified.symbol.replace("-", "."), unified);
    }
  });
}

// Run precomputation once
initializeMasterMatrix();

/**
 * Get the standardized, sector-normalized score for ANY stock.
 * Guaranteed to be 100% identical regardless of which tab or component calls it.
 */
export function getStockScore(
  ticker: string,
  fallbackSector?: string,
  customName?: string
): UnifiedStockScore {
  if (!ticker) {
    return createDefaultScore("UNKNOWN", "Unknown", "Technology");
  }

  const norm = normalizeTicker(ticker);
  if (MATRIX_STORE.has(norm)) {
    return MATRIX_STORE.get(norm)!;
  }
  const dotNorm = norm.replace("-", ".");
  if (MATRIX_STORE.has(dotNorm)) {
    return MATRIX_STORE.get(dotNorm)!;
  }

  // Not in matrix yet: dynamically evaluate against sector universe and cache
  const sector = getSectorForTicker(norm, fallbackSector);
  const name = customName || `${norm} Corporation`;
  const raw = getRawFeatures(norm, name, sector);

  const scoredList = buildScores([raw], "zscore");
  if (scoredList.length > 0) {
    const unified = mapRowToUnifiedScore(scoredList[0]);
    MATRIX_STORE.set(norm, unified);
    if (norm.includes("-")) {
      MATRIX_STORE.set(norm.replace("-", "."), unified);
    }
    return unified;
  }

  const def = createDefaultScore(norm, name, sector);
  MATRIX_STORE.set(norm, def);
  return def;
}

/** Default fallback if calculation is impossible */
function createDefaultScore(symbol: string, name: string, sector: string): UnifiedStockScore {
  const cfg = getScoreStyleConfig(55);
  return {
    symbol,
    name,
    sector,
    score: 55,
    grade: "B",
    labelEN: cfg.labelEN,
    labelES: cfg.labelES,
    badgeBg: cfg.badgeBg,
    badgeBorder: cfg.badgeBorder,
    badgeText: cfg.badgeText,
    colorHex: cfg.colorHex,
    factors: {
      growth: 50,
      quality: 55,
      stability: 55,
      valuation: 50,
    },
    strategyScores: {
      balanced: 55,
      garp: 52,
      quality_def: 56,
      deep_value: 50,
    },
    archetype: "Solid but Unremarkable",
    type: "Promedio / Equilibrado",
    valuationMethod: "DCF / Múltiplos",
    note: "Perfil promedio balanceado respecto a su sector",
  };
}

/** Update a single stock in the matrix with verified financial statements */
export function updateStockScoreWithFinancials(
  ticker: string,
  financials: { annual: any[]; quarterly: any[] }
): UnifiedStockScore {
  const norm = normalizeTicker(ticker);
  const current = getStockScore(norm);
  const sector = current.sector;
  
  let raw = getRawFeatures(norm, current.name, sector);
  raw = overrideFeaturesWithFinancials(raw, financials);

  const scoredList = buildScores([raw], "zscore", { [norm]: financials });
  if (scoredList.length > 0) {
    const updated = mapRowToUnifiedScore(scoredList[0]);
    MATRIX_STORE.set(norm, updated);
    if (norm.includes("-")) {
      MATRIX_STORE.set(norm.replace("-", "."), updated);
    }
    return updated;
  }
  return current;
}

/** Batch lookup of stock scores */
export function getBatchStockScores(tickers: string[]): Record<string, UnifiedStockScore> {
  const result: Record<string, UnifiedStockScore> = {};
  tickers.forEach((t) => {
    const norm = normalizeTicker(t);
    result[norm] = getStockScore(norm);
    result[t.toUpperCase()] = result[norm];
  });
  return result;
}

/** Get the entire master scores matrix as a dictionary */
export function getAllStockScoresMatrix(): Record<string, UnifiedStockScore> {
  const result: Record<string, UnifiedStockScore> = {};
  MATRIX_STORE.forEach((val, key) => {
    result[key] = val;
  });
  return result;
}

/** Get all stock scores as a sorted array */
export function getAllStockScoresList(): UnifiedStockScore[] {
  const seen = new Set<string>();
  const list: UnifiedStockScore[] = [];
  MATRIX_STORE.forEach((score) => {
    if (!seen.has(score.symbol)) {
      seen.add(score.symbol);
      list.push(score);
    }
  });
  return list.sort((a, b) => b.score - a.score);
}

/**
 * Standardized portfolio score calculation using the unified Matrix.
 * Guarantees that any portfolio (User, Superinvestor, Watchlist, Summary, Holdings)
 * gets calculated consistently and reproducibly, taking financials into account when loaded.
 */
export function calculatePortfolioScoreFromMatrix(
  positions: Array<{
    ticker: string;
    weight?: number;
    mktValue?: number;
    shares?: number;
    price?: number;
    avgCost?: number;
    valueM?: number;
    isCash?: boolean;
    portfolioWeight?: number;
    pe?: number | null;
    fwdPe?: number | null;
    evEbitda?: number | null;
    name?: string;
  }>,
  financialsMap?: Record<string, any> | null
) {
  const stockPositions = positions.filter(
    (p) => !p.isCash && p.ticker && p.ticker.toUpperCase() !== "CASH" && p.ticker.toUpperCase() !== "USD"
  );

  if (stockPositions.length === 0) {
    return {
      score: 50,
      roundedScore: 50,
      grade: "B" as const,
      labelEN: "Balanced / Quality",
      labelES: "Equilibrado / Calidad",
      dominantType: "Mature Compounder",
      factors: { growth: 50, quality: 50, stability: 50, valuation: 50 },
      drivers: [],
    };
  }

  let totalWeight = 0;
  let weightedScoreSum = 0;
  let weightedGrowth = 0;
  let weightedQuality = 0;
  let weightedStability = 0;
  let weightedValuation = 0;
  const typeWeights = new Map<string, number>();
  const drivers: Array<{ ticker: string; weight: number; score: number }> = [];

  stockPositions.forEach((pos) => {
    const sym = normalizeTicker(pos.ticker);
    const sector = getSectorForTicker(pos.ticker);
    const unified = getStockScore(sym, sector, pos.name);
    
    // Check if financials are provided
    const finData = financialsMap
      ? (financialsMap[pos.ticker] || financialsMap[sym] || financialsMap[pos.ticker.toUpperCase()])
      : null;

    let score = unified.strategyScores?.balanced ?? unified.score ?? 50;
    let growth = unified.factors?.growth ?? 50;
    let quality = unified.factors?.quality ?? 50;
    let stability = unified.factors?.stability ?? 50;
    let valuation = unified.factors?.valuation ?? 50;
    let dominantItemType = unified.type;

    if (finData) {
      let raw = { ...getRawFeatures(pos.ticker, pos.name || unified.name, sector) };
      raw = overrideFeaturesWithFinancials(raw, finData);
      if (pos.pe !== null && pos.pe !== undefined) {
        raw.trailing_pe = pos.pe;
      }
      if (pos.fwdPe !== null && pos.fwdPe !== undefined) {
        raw.forward_pe = pos.fwdPe;
      }
      if (pos.evEbitda !== null && pos.evEbitda !== undefined) {
        raw.ev_ebitda = pos.evEbitda;
      }

      const finMap: Record<string, any> = { [sym]: finData };
      const scoredList = buildScores([raw], "zscore", finMap);
      if (scoredList && scoredList.length > 0) {
        score = scoredList[0].scores?.balanced ?? (scoredList[0] as any).score ?? score;
        growth = scoredList[0].factors?.growth ?? growth;
        quality = scoredList[0].factors?.quality ?? quality;
        stability = scoredList[0].factors?.stability ?? stability;
        valuation = scoredList[0].factors?.valuation ?? valuation;
        if (scoredList[0].type) {
          dominantItemType = scoredList[0].type;
        }
      }
    }

    const w =
      pos.portfolioWeight ??
      pos.weight ??
      pos.mktValue ??
      pos.valueM ??
      (pos.shares && pos.price ? pos.shares * pos.price : (pos.shares && pos.avgCost ? pos.shares * pos.avgCost : 1));

    totalWeight += w;
    weightedScoreSum += score * w;
    weightedGrowth += growth * w;
    weightedQuality += quality * w;
    weightedStability += stability * w;
    weightedValuation += valuation * w;

    if (dominantItemType) {
      typeWeights.set(dominantItemType, (typeWeights.get(dominantItemType) || 0) + w);
    }

    drivers.push({ ticker: sym, weight: w, score });
  });

  const finalScore = totalWeight > 0 ? (weightedScoreSum / totalWeight) : 55;
  const growth = totalWeight > 0 ? (weightedGrowth / totalWeight) : 50;
  const quality = totalWeight > 0 ? (weightedQuality / totalWeight) : 50;
  const stability = totalWeight > 0 ? (weightedStability / totalWeight) : 50;
  const valuation = totalWeight > 0 ? (weightedValuation / totalWeight) : 50;

  let dominantType = "Mature Compounder";
  let maxW = 0;
  typeWeights.forEach((w, type) => {
    if (w > maxW) {
      maxW = w;
      dominantType = type;
    }
  });

  const roundedScore = Math.ceil(finalScore);
  const cfg = getScoreStyleConfig(roundedScore);
  drivers.sort((a, b) => b.weight - a.weight);

  return {
    score: roundedScore,
    roundedScore,
    grade: cfg.grade,
    labelEN: cfg.labelEN,
    labelES: cfg.labelES,
    badgeBg: cfg.badgeBg,
    badgeBorder: cfg.badgeBorder,
    badgeText: cfg.badgeText,
    colorHex: cfg.colorHex,
    dominantType,
    factors: {
      growth: Math.ceil(growth),
      quality: Math.ceil(quality),
      stability: Math.ceil(stability),
      valuation: Math.ceil(valuation),
    },
    drivers: drivers.slice(0, 5),
  };
}
