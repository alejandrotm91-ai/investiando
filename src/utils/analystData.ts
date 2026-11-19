// Datos de analistas de una posición, de Yahoo (/api/portfolio/quotes o /api/stock): precio objetivo
// medio y máximo y recomendación. Sin dato → null (la vista muestra "—"). Antes había tres copias de
// esta función con una tabla fija y, para el resto de tickers, cifras generadas con un hash del ticker.

import type { Position } from "../types";

const REC_LABEL: Record<string, string> = {
  strong_buy: "Strong Buy",
  buy: "Buy",
  hold: "Hold",
  underperform: "Underperform",
  sell: "Sell",
  strong_sell: "Strong Sell",
};

export interface AnalystData {
  avgTarget: number | null;
  highTarget: number | null;
  recommendation: string | null;
}

type AnalystSource = Pick<Position, "ticker"> & Partial<Pick<Position, "isCash" | "targetMeanPrice" | "targetHighPrice" | "recommendationKey">>;

const positive = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);

export function getAnalystData(pos: AnalystSource): AnalystData {
  const t = (pos.ticker || "").toUpperCase();
  if (pos.isCash || t === "CASH" || t === "USD" || t === "MARGIN_PAID") return { avgTarget: null, highTarget: null, recommendation: null };
  const key = (pos.recommendationKey || "").toLowerCase();
  return {
    avgTarget: positive(pos.targetMeanPrice),
    highTarget: positive(pos.targetHighPrice),
    recommendation: key ? REC_LABEL[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : null,
  };
}
