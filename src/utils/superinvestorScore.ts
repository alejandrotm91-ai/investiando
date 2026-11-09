import { SuperinvestorMeta, SUPERINVESTORS } from "../superinvestors";
import { calculatePortfolioScoreFromMatrix, getStockScore, UnifiedStockScore } from "./stockScoresMatrix";
import { getScoreBenchmarkVersion } from "./scoreBenchmarks";

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

// Se recalculan cuando cambia la referencia de datos reales (scoreBenchmarks): antes se calculaban
// una sola vez al cargar, con datos inventados
let cache: { v: number; scores: Record<string, SuperinvestorScoreInfo>; combined: SuperinvestorScoreInfo } | null = null;
function current() {
  const v = getScoreBenchmarkVersion();
  if (cache && cache.v === v) return cache;
  const scores = Object.keys(SUPERINVESTORS).reduce((acc, key) => {
    acc[key] = calculateFundScore(SUPERINVESTORS[key]);
    return acc;
  }, {} as Record<string, SuperinvestorScoreInfo>);
  const all = Object.values(scores);
  const avg = Math.ceil(all.reduce((sum, s) => sum + s.score, 0) / (all.length || 1));
  const combined: SuperinvestorScoreInfo = {
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
  cache = { v, scores, combined };
  return cache;
}

/** Scores de cada superinversor (se leen como un objeto; se recalculan con la referencia vigente) */
export const SUPERINVESTOR_SCORES: Record<string, SuperinvestorScoreInfo> = new Proxy({} as Record<string, SuperinvestorScoreInfo>, {
  get: (_t, k) => (typeof k === "string" ? current().scores[k] : undefined),
  has: (_t, k) => typeof k === "string" && k in current().scores,
  ownKeys: () => Reflect.ownKeys(current().scores),
  getOwnPropertyDescriptor: (_t, k) => (typeof k === "string" && k in current().scores ? { enumerable: true, configurable: true, value: current().scores[k] } : undefined),
});

/** Score combinado de todos los superinversores */
export const COMBINED_SUPERINVESTOR_SCORE: SuperinvestorScoreInfo = new Proxy({} as SuperinvestorScoreInfo, {
  get: (_t, k) => (current().combined as any)[k],
});
