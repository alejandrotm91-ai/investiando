// Une los estados de la SEC con los de Yahoo para los modelos.
//
// - Mandan las cifras de la SEC (10-K/10-Q oficiales).
// - Yahoo solo rellena los campos que la SEC no trae para ese mismo periodo (p. ej. el BPA de Visa
//   o Berkshire, que se publica por clase de acción, o la variación de circulante).
// - Periodos que solo tiene Yahoo: los más recientes (un trimestre que la SEC aún no ha procesado)
//   y los más antiguos que la SEC no cubre. Llevan source: "yahoo".

import type { SecPeriod } from "./normalize";

const TOLERANCE_MS = 10 * 24 * 60 * 60 * 1000;

const ts = (d: any) => new Date(d).getTime();

export function mergeSecWithYahoo(sec: SecPeriod[], yahoo: any[]): any[] {
  if (!sec.length) return yahoo;
  const used = new Set<number>();
  const merged = sec.map((p) => {
    const t = ts(p.date);
    let best = -1;
    let bestDiff = Infinity;
    yahoo.forEach((y, i) => {
      const diff = Math.abs(ts(y.date) - t);
      if (diff <= TOLERANCE_MS && diff < bestDiff && !used.has(i)) {
        best = i;
        bestDiff = diff;
      }
    });
    if (best < 0) return { ...p };
    used.add(best);
    const y = yahoo[best];
    const out: any = { ...p };
    const filled: string[] = [];
    for (const [k, v] of Object.entries(y)) {
      if (k === "date" || k === "periodType" || k === "TYPE") continue;
      if (out[k] === undefined && v !== null && v !== undefined) {
        out[k] = v;
        if (typeof v === "number") filled.push(k);
      }
    }
    // Beneficio bruto: si la empresa no lo publica (aseguradoras, petroleras…), el calculado con su
    // "coste de ventas" puede ser parcial; se usa el de Yahoo con su coste para que cuadren.
    if (p.derived?.includes("grossProfit") && typeof y.grossProfit === "number") {
      out.grossProfit = y.grossProfit;
      if (typeof y.costOfRevenue === "number") out.costOfRevenue = y.costOfRevenue;
      filled.push("grossProfit");
    }
    if (filled.length) out.yahooFilled = filled;
    return out;
  });
  const newest = Math.max(...sec.map((p) => ts(p.date)));
  const oldest = Math.min(...sec.map((p) => ts(p.date)));
  yahoo.forEach((y, i) => {
    if (used.has(i)) return;
    const t = ts(y.date);
    if (t > newest + TOLERANCE_MS || t < oldest - TOLERANCE_MS) merged.push({ ...y, source: "yahoo" });
  });
  return merged.sort((a, b) => ts(b.date) - ts(a.date));
}

export interface Split { date: string | number | Date; numerator: number; denominator: number }

const PER_SHARE = ["dilutedEPS", "basicEPS"];
const SHARES = ["dilutedAverageShares", "basicAverageShares", "ordinarySharesNumber"];

/**
 * Ajusta BPA y número de acciones por los splits posteriores al informe. La SEC guarda las cifras
 * tal como se publicaron: un 10-K presentado antes de un split 25:1 (Booking, 2026) lleva el BPA
 * sin dividir, mientras que el precio actual ya es posterior al split. Los informes nuevos reexpresan
 * los periodos que repiten, así que solo se ajusta lo publicado antes de cada split.
 */
export function adjustForSplits(periods: any[], splits: Split[]): any[] {
  // Solo splits de verdad (2:1, 3:2, 1:10…). Yahoo registra los spin-offs como "splits" de
  // ratio cercano a 1 (S&P Global 1057:1000) para ajustar precios; el BPA no cambia por eso.
  const valid = (splits || []).filter((s) => {
    if (!s || !(s.numerator > 0 && s.denominator > 0)) return false;
    const r = s.numerator / s.denominator;
    return r >= 1.5 || r <= 2 / 3;
  });
  if (!valid.length) return periods;
  return periods.map((p) => {
    if (p.source !== "sec") return p;
    // Fecha del informe del que salen BPA y acciones (no la del balance, que se repite después)
    const filed = ts(p.perShareFiled || p.filed || p.date);
    const end = ts(p.date);
    let factor = 1;
    for (const s of valid) {
      const d = ts(s.date);
      if (d > filed && d > end) factor *= s.numerator / s.denominator;
    }
    if (factor === 1) return p;
    const out = { ...p, splitAdjusted: Number(factor.toFixed(6)) };
    for (const k of PER_SHARE) if (typeof out[k] === "number") out[k] = out[k] / factor;
    for (const k of SHARES) if (typeof out[k] === "number") out[k] = out[k] * factor;
    return out;
  });
}
