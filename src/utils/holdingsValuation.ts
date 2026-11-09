// Valoración por acción para la vista Valuation de Holdings, con los mismos cálculos que Stock Explorer:
// - DCF: calibración + escenario (Bajista/Base/Alcista) + proyección a 5 años + DCF (threeStatementModel.ts),
//   igual que la pestaña DCF de ThreeStatementModel.tsx con los datos de /api/portfolio/financials y /api/stock.
// - Valor razonable por múltiplos: BPA diluido TTM × PER mediano del rango elegido (un valor por mes), igual
//   que la pestaña EPS de FairValueGraph.tsx con los puntos de /api/valuation.

import {
  buildHistoricalStatements,
  buildTTMStatementPeriod,
  calibrateModel,
  computeHistoricalCAGRs,
  baseDrivers,
  buildScenarioAssumptions,
  projectStatements,
  computeDCFValuation,
} from "./threeStatementModel";

export type DcfScenario = "bear" | "base" | "bull";
export type FvRange = "YTD" | "1Y" | "3Y" | "5Y" | "10Y" | "ALL";
export const FV_RANGES: FvRange[] = ["YTD", "1Y", "3Y", "5Y", "10Y", "ALL"];

const DAY = 86400000;

/** Inicio de la ventana del rango (ms) contando hacia atrás desde la última fecha. */
export function rangeStart(range: FvRange, lastD: string): number {
  if (range === "ALL") return 0;
  if (range === "YTD") return Date.parse(`${lastD.slice(0, 4)}-01-01T00:00:00Z`);
  return new Date(lastD).getTime() - { "1Y": 1, "3Y": 3, "5Y": 5, "10Y": 10 }[range] * 365.25 * DAY;
}

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Mín./mediana/máx. de un múltiplo dentro del rango. La serie es diaria en los 2 últimos años y semanal
 * antes: la mediana usa el último valor de cada mes para que todos los años pesen igual (con menos de 6
 * meses, todos los valores).
 */
export function multipleStats(points: { d: string }[], key: string, range: FvRange): { min: number; max: number; median: number; first: string } | null {
  if (!points.length) return null;
  const from = rangeStart(range, points[points.length - 1].d);
  const win = points.filter((p: any) => new Date(p.d).getTime() >= from && typeof p[key] === "number" && p[key] > 0);
  if (!win.length) return null;
  const vals = win.map((p: any) => p[key] as number);
  const byMonth = new Map<string, number>();
  win.forEach((p: any) => byMonth.set(p.d.slice(0, 7), p[key]));
  const monthly = [...byMonth.values()];
  return { min: Math.min(...vals), max: Math.max(...vals), median: median(monthly.length >= 6 ? monthly : vals), first: win[0].d };
}

/** Valor razonable por múltiplos (BPA diluido TTM × PER mediano del rango). null sin BPA positivo. */
export function epsFairValue(points: { d: string; eps?: number | null; pe?: number | null }[], range: FvRange): { value: number; multiple: number } | null {
  const stats = multipleStats(points, "pe", range);
  if (!stats) return null;
  const last = [...points].reverse().find((p) => typeof p.eps === "number");
  const eps = last?.eps;
  if (typeof eps !== "number" || !(eps > 0)) return null;
  return { value: eps * stats.median, multiple: stats.median };
}

/** Valor por acción del DCF en un escenario (null si faltan estados o el modelo no es válido). */
export function dcfPerShare(annual: any[] | undefined, quarterly: any[] | undefined, stock: any, scenario: DcfScenario): number | null {
  const fData = Array.isArray(annual) ? annual : [];
  const qData = Array.isArray(quarterly) ? quarterly : [];
  if (!fData.length || !stock) return null;
  const hist = buildHistoricalStatements(fData);
  const ttm = buildTTMStatementPeriod(qData, fData);
  const anchor = ttm || hist[hist.length - 1];
  if (!anchor) return null;
  const cal = calibrateModel(fData, qData, stock, anchor);
  const cagrs = computeHistoricalCAGRs(fData);
  const assumptions = buildScenarioAssumptions(cal, scenario, baseDrivers(cal), cagrs);
  const projection = projectStatements(anchor, assumptions, 5);
  const price = Number(stock?.price) || 0;
  const mktCap = cal?.marketCap || price * assumptions.dilutedShares;
  const res = computeDCFValuation(anchor, projection, assumptions, price, mktCap, stock?.totalDebt, stock?.totalCash, {
    minorityInterest: cal?.minorityInterest,
    marketEvEbitda: stock?.evEbitda ?? stock?.enterpriseToEbitda ?? null,
    historicalFcf: hist.map((h) => h.freeCashFlow),
    staleQuote: stock?.isFallback === true,
  });
  const v = res.fairValuePerShare;
  return Number.isFinite(v) && v > 0 ? v : null;
}
