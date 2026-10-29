import { SuperinvestorMeta, SUPERINVESTORS } from "../superinvestors";
import { calculatePortfolioScoreFromMatrix, getStockScore, UnifiedStockScore } from "./stockScoresMatrix";

export interface SuperinvestorScoreInfo {
  score: number; // 0 to 100
  grade: "A+" | "A" | "B+" | "B" | "C" | "D";
  labelEN: string;
  labelES: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  colorHex: string;
  dominantType: string;
  topDrivers: Array<{ ticker: string; weight: number; score: number }>;
}

export function calculateFundScore(si: SuperinvestorMeta): SuperinvestorScoreInfo {
  const stockHoldings = si.holdings.filter((h) => h.ticker && h.ticker.toUpperCase() !== "CASH");
  if (stockHoldings.length === 0) {
    return {
      score: 50,
      grade: "B",
      labelEN: "Balanced",
      labelES: "Equilibrado",
      badgeBg: "bg-slate-500/10",
      badgeBorder: "border-slate-500/30",
      badgeText: "text-slate-400",
      colorHex: "#94a3b8",
      dominantType: "Balanced",
      topDrivers: [],
    };
  }

  const result = calculatePortfolioScoreFromMatrix(stockHoldings);

  return {
    score: Math.ceil(result.score),
    grade: result.grade,
    labelEN: result.labelEN,
    labelES: result.labelES,
    badgeBg: result.badgeBg,
    badgeBorder: result.badgeBorder,
    badgeText: result.badgeText,
    colorHex: result.colorHex,
    dominantType: result.dominantType,
    topDrivers: result.drivers.slice(0, 3),
  };
}

/** Precomputed scores for all superinvestors for instant synchronous access */
export const SUPERINVESTOR_SCORES: Record<string, SuperinvestorScoreInfo> = Object.keys(SUPERINVESTORS).reduce((acc, key) => {
  acc[key] = calculateFundScore(SUPERINVESTORS[key]);
  return acc;
}, {} as Record<string, SuperinvestorScoreInfo>);

/** Combined portfolio score */
export const COMBINED_SUPERINVESTOR_SCORE: SuperinvestorScoreInfo = (() => {
  const allScores = Object.values(SUPERINVESTOR_SCORES);
  const avg = Math.ceil(allScores.reduce((sum, s) => sum + s.score, 0) / (allScores.length || 1));
  return {
    score: avg,
    grade: avg >= 75 ? "A" : avg >= 65 ? "B+" : "B",
    labelEN: "Diversified Multi-Legend Factor",
    labelES: "Multifactor Diversificado Legendario",
    badgeBg: "bg-emerald-500/15",
    badgeBorder: "border-emerald-500/40",
    badgeText: "text-emerald-400",
    colorHex: "#34d399",
    dominantType: "Balanced Legend Compounder",
    topDrivers: [],
  };
})();
