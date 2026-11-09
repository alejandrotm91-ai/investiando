// Rentabilidad anual esperada de una posición, para proyectar el valor de la cartera (Holdings →
// Portfolio Projection):
// - Acciones: TIR del escenario base del modelo de Bogle a 5 años (dividendo + crecimiento del BPA
//   normalizado + cambio de PER hacia su mediana histórica), el mismo cálculo que la pestaña Analysis.
// - Fondos y ETF (sin estados financieros propios): rentabilidad anualizada del precio en los últimos
//   10 años (al menos 3 de historia), entre −10 % y 25 %, el mismo tope que el modelo pone al
//   crecimiento del BPA.
// Sin datos: null (la posición no cuenta en la media).

import { buildBogleInputs, computeBogle, defaultHurdle } from "./bogleEngine";
import { TICKER_CLASSIFICATION } from "../data/tickerClassification";

export type ReturnSource = "bogle" | "history";
export interface ExpectedReturn {
  rate: number; // % anual
  source: ReturnSource;
  years?: number; // años de historia (fondos)
  capped?: boolean;
}

const YEAR = 365.25 * 86400000;
export const FUND_RETURN_CAP = 25;
export const FUND_RETURN_FLOOR = -10;

/** Rentabilidad anualizada del precio en los últimos maxYears años (null con menos de minYears). */
export function historicalCagr(points: { d: string; p: number }[] | undefined, maxYears = 10, minYears = 3): { rate: number; years: number } | null {
  const pts = (points || []).filter((x) => typeof x.p === "number" && x.p > 0);
  if (pts.length < 2) return null;
  const last = pts[pts.length - 1];
  const tEnd = new Date(last.d).getTime();
  const first = pts.find((x) => new Date(x.d).getTime() >= tEnd - maxYears * YEAR) ?? pts[0];
  const years = (tEnd - new Date(first.d).getTime()) / YEAR;
  if (years < minYears) return null;
  return { rate: (Math.pow(last.p / first.p, 1 / years) - 1) * 100, years };
}

export function expectedAnnualReturn(ticker: string, fin: any, stock: any, points: { d: string; p: number }[] | undefined, price?: number | null): ExpectedReturn | null {
  const sym = ticker.toUpperCase();
  const hasStatements = Array.isArray(fin?.annual) && fin.annual.length > 0;
  if (hasStatements && stock) {
    try {
      const inputs = buildBogleInputs(sym, stock, fin, price ?? stock?.price ?? null);
      // Igual que la pestaña Analysis: sector de la clasificación si Yahoo no lo da (perfil cíclico/REIT)
      if (!inputs.sector) inputs.sector = TICKER_CLASSIFICATION[sym]?.sector || "";
      if (!inputs.industry) inputs.industry = TICKER_CLASSIFICATION[sym]?.subsector || "";
      const res = computeBogle(inputs, { horizon: 5, hurdle: defaultHurdle(inputs.beta) });
      if (res && Number.isFinite(res.base.retorno_total)) return { rate: res.base.retorno_total, source: "bogle" };
    } catch {
      // sin modelo: se prueba con la historia del precio
    }
  }
  if (!hasStatements) {
    const h = historicalCagr(points);
    if (h) {
      const rate = Math.max(FUND_RETURN_FLOOR, Math.min(FUND_RETURN_CAP, h.rate));
      return { rate, source: "history", years: h.years, capped: rate !== h.rate };
    }
  }
  return null;
}
