// src/utils/bogleEngine.ts
// Modelo de los 3 motores de retorno de John Bogle, compartido por Stock Explorer y Analysis.
//
//   Retorno total ≈ Motor 1 (crecimiento del BPA) + Motor 2 (rentabilidad por dividendo)
//                   + Motor 3 (cambio del PER)
//
// Criterios:
//  - El BPA es por acción: ya recoge el efecto de las recompras. Por eso el Motor 2 es solo el
//    dividendo; sumar también las recompras las contaría dos veces. Las recompras se muestran
//    como dato informativo.
//  - El crecimiento del BPA se normaliza: media del CAGR histórico y del crecimiento esperado a
//    1 año (consenso), recorte del 30 % si supera el 40 % y tope del 25 % (AGENTS.md §2.3).
//  - El retorno total es la TIR de: comprar hoy a P0, cobrar dividendos que crecen con el BPA y
//    vender al final a BPA_H × PER de salida. El valor justo descuenta esos mismos flujos a la
//    tasa exigida, así que valor justo ≥ precio ⇔ TIR ≥ tasa exigida.
//  - Un PER ya valora solo las acciones: no se resta la deuda neta.
//  - Si falta un dato clave (precio o BPA positivo), el modelo no se calcula: nada inventado.

export interface PeHistoryPoint {
  year: number | string;
  date?: string;
  eps: number;
  price: number;
  pe: number;
  isCurrentYear?: boolean;
  quarterDate?: string;
}

export interface BogleInputs {
  symbol: string;
  name: string;
  price: number | null;
  epsTTM: number | null;
  epsFwd: number | null;
  pe0: number | null; // precio / BPA TTM
  peFwd: number | null;
  epsCagrHist: number | null; // %
  epsCagrYears: number;
  epsGrowthFwd1Y: number | null; // %
  epsGrowthModel: number | null; // % normalizado
  growthNotes: string[];
  dividendYield: number; // %
  buybackYield: number; // % (informativo)
  peMedianHist: number | null;
  peHistory: PeHistoryPoint[];
  marketCap: number | null;
  totalDebt: number | null;
  totalCash: number | null;
  sharesOutstanding: number | null;
  beta: number | null;
  payoutRatio: number | null; // %
  freeCashFlow: number | null;
  netIncome: number | null;
  pegRatio: number | null;
  debtToEquity: number | null; // veces
  piotroskiScore: number | null;
  sector: string;
  industry: string;
  issues: string[];
  valid: boolean;
}

export interface BogleScenario {
  peExit: number;
  EPS_H: number;
  P_H: number;
  retorno_precio_anual: number; // % anual (Motor 1 + Motor 3)
  contribE1: number; // %
  contribE2: number; // % aportado por dividendos a la TIR
  contribE3: number; // % anual por cambio de PER
  retorno_total: number; // TIR en %
  target_upside: number; // % precio objetivo vs. precio actual
  dividendsPV: number;
  P_star: number; // valor justo hoy
  P_star_ajustado: number; // igual que P_star (se mantiene por compatibilidad)
  upside: number; // % valor justo vs. precio
}

export interface BogleParams {
  horizon: number; // años
  hurdle: number; // %
  growth?: number | null; // % (si se edita)
  dividendYield?: number | null; // %
  peExitBear?: number | null;
  peExitBase?: number | null;
  peExitBull?: number | null;
}

export interface BogleResult {
  inputs: BogleInputs;
  H: number;
  r: number;
  g: number; // %
  DY: number; // %
  defaults: { bear: number; base: number; bull: number };
  bear: BogleScenario;
  base: BogleScenario;
  bull: BogleScenario;
  chartData: { year: string; bear: number; base: number; bull: number; eps: number }[];
}

const num = (v: any): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const round1 = (v: number) => Math.round(v * 10) / 10;

function cleanAnnual(rows: any[] | undefined): any[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((p) => p && p.date && (num(p.totalRevenue) ?? 0) > 0)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/** Normaliza un crecimiento (AGENTS.md §2.3): recorte del 30 % si > 40 %, tope 25 %, suelo −10 %. */
export function normalizeEpsGrowth(raw: number, notes: string[]): number {
  let g = raw;
  if (g > 40) {
    notes.push(`${round1(raw)}% > 40%: recorte del 30% por efecto base → ${round1(g * 0.7)}%`);
    g *= 0.7;
  }
  if (g > 25) {
    notes.push(`tope del 25% anual sostenido (${round1(g)}% → 25%)`);
    g = 25;
  }
  if (g < -10) {
    notes.push(`suelo del −10% (${round1(g)}% → −10%)`);
    g = -10;
  }
  return round1(g);
}

/** Mediana de los PER anuales históricos (sin el actual), descartando valores sin sentido. */
export function medianHistoricalPe(history: PeHistoryPoint[] | undefined | null): number | null {
  const vals = (history || [])
    .filter((h) => !h.isCurrentYear && Number.isFinite(h.pe) && h.pe > 0 && h.pe <= 80)
    .map((h) => h.pe)
    .sort((a, b) => a - b);
  if (vals.length < 2) return null;
  const m = Math.floor(vals.length / 2);
  return round1(vals.length % 2 ? vals[m] : (vals[m - 1] + vals[m]) / 2);
}

/** Construye las entradas del modelo a partir de /api/stock y /api/portfolio/financials. */
export function buildBogleInputs(symbol: string, stock: any, fin: any, priceOverride?: number | null): BogleInputs {
  const issues: string[] = [];
  const notes: string[] = [];
  const price = num(priceOverride) ?? num(stock?.price);
  const epsTTM = num(stock?.trailingEps);
  const epsFwd = num(stock?.forwardEps);
  if (price === null || price <= 0) issues.push("sin precio");
  const stale = stock?.isFallback === true && priceOverride == null;
  if (stale) issues.push("Yahoo no respondió: precio de respaldo, posiblemente desfasado (vuelve a intentarlo)");
  if (epsTTM === null) issues.push("sin BPA de los últimos 12 meses");
  else if (epsTTM <= 0) issues.push("BPA negativo: el modelo de PER no aplica");

  const pe0 = price && epsTTM && epsTTM > 0 ? price / epsTTM : null;
  const peFwd = price && epsFwd && epsFwd > 0 ? price / epsFwd : null;

  // Motor 1: CAGR del BPA diluido entre el ejercicio más reciente y el más antiguo positivos.
  const annual = cleanAnnual(fin?.annual);
  const eps = annual.map((p) => num(p.dilutedEPS) ?? num(p.basicEPS));
  let epsCagrHist: number | null = null;
  let epsCagrYears = 0;
  const li = eps.findIndex((v) => v !== null);
  if (li >= 0 && (eps[li] as number) > 0) {
    for (let i = eps.length - 1; i > li; i--) {
      const v = eps[i];
      if (v !== null && v > 0) {
        epsCagrYears = i - li;
        epsCagrHist = round1((Math.pow((eps[li] as number) / v, 1 / epsCagrYears) - 1) * 100);
        break;
      }
    }
  }
  const epsGrowthFwd1Y = epsTTM && epsTTM > 0 && epsFwd && epsFwd > 0 ? round1((epsFwd / epsTTM - 1) * 100) : null;

  // Recompras (dato informativo y parte del ancla fundamental).
  let buybackYield = 0;
  const shares = annual.map((p) => num(p.ordinarySharesNumber) ?? num(p.shareIssued)).filter((v): v is number => v !== null && v > 0);
  if (shares.length >= 2) {
    const n = shares.length - 1;
    const change = (Math.pow(shares[0] / shares[n], 1 / n) - 1) * 100;
    buybackYield = change < 0 ? round1(-change) : 0;
  }

  // Ancla fundamental: a largo plazo el BPA crece como las ventas más las recompras.
  const revs = annual.map((p) => num(p.totalRevenue) as number);
  const revCagr = revs.length >= 2 ? (Math.pow(revs[0] / revs[revs.length - 1], 1 / (revs.length - 1)) - 1) * 100 : null;
  const revYoY = revs.length >= 2 ? (revs[0] / revs[1] - 1) * 100 : null;
  const qYoY = num(stock?.revenueGrowth);
  const revParts = [revCagr, revYoY, qYoY !== null && Math.abs(qYoY) < 5 ? qYoY * 100 : null].filter((v): v is number => v !== null);
  const fundamental = revParts.length ? round1(revParts.reduce((s, v) => s + v, 0) / revParts.length + buybackYield) : null;

  // Crecimiento del modelo: mediana de las lecturas disponibles (robusta a valores atípicos).
  // El consenso a 1 año compara BPA ajustado con BPA contable: se descarta si supera el 40 %.
  const candidates: { label: string; v: number }[] = [];
  if (epsCagrHist !== null) candidates.push({ label: `histórico ${epsCagrHist}% (${epsCagrYears} años)`, v: epsCagrHist });
  if (epsGrowthFwd1Y !== null) {
    if (epsGrowthFwd1Y <= 40) candidates.push({ label: `consenso a 1 año ${epsGrowthFwd1Y}%`, v: epsGrowthFwd1Y });
    else notes.push(`consenso a 1 año ${epsGrowthFwd1Y}% descartado: compara BPA ajustado con BPA contable`);
  }
  if (fundamental !== null) candidates.push({ label: `ventas + recompras ${fundamental}%`, v: fundamental });
  let epsGrowthModel: number | null = null;
  if (candidates.length) {
    const vals = candidates.map((c) => c.v).sort((a, b) => a - b);
    const m = Math.floor(vals.length / 2);
    const raw = vals.length % 2 ? vals[m] : (vals[m - 1] + vals[m]) / 2;
    notes.unshift(`${vals.length === 1 ? "única lectura" : vals.length === 2 ? "media" : "mediana"} de ${candidates.map((c) => c.label).join(", ")} = ${round1(raw)}%`);
    epsGrowthModel = normalizeEpsGrowth(raw, notes);
  } else {
    issues.push("sin histórico ni previsión de BPA para estimar el crecimiento");
  }

  // Motor 2: dividendo. Las recompras se calculan solo como dato (ya están en el BPA).
  const dyRaw = num(stock?.dividendYield);
  const dividendYield = dyRaw === null ? 0 : dyRaw > 1 ? dyRaw : dyRaw * 100;
  const peHistory: PeHistoryPoint[] = Array.isArray(fin?.peHistory) ? fin.peHistory : [];
  const payout = num(stock?.payoutRatio);
  const dte = num(stock?.debtToEquity);

  return {
    symbol,
    name: stock?.name || symbol,
    price,
    epsTTM,
    epsFwd,
    pe0,
    peFwd,
    epsCagrHist,
    epsCagrYears,
    epsGrowthFwd1Y,
    epsGrowthModel,
    growthNotes: notes,
    dividendYield: round1(dividendYield * 100) / 100,
    buybackYield,
    peMedianHist: medianHistoricalPe(peHistory),
    peHistory,
    marketCap: num(stock?.marketCap),
    totalDebt: num(stock?.totalDebt),
    totalCash: num(stock?.totalCash),
    sharesOutstanding: num(stock?.sharesOutstanding),
    beta: num(stock?.beta),
    payoutRatio: payout === null ? null : payout > 1 ? payout : payout * 100,
    freeCashFlow: num(stock?.freeCashflow) ?? num(stock?.freeCashFlow),
    netIncome: num(annual[0]?.netIncomeCommonStockholders) ?? num(annual[0]?.netIncome),
    pegRatio: num(stock?.pegRatio),
    debtToEquity: dte === null ? null : dte / 100, // Yahoo lo da en %
    piotroskiScore: num(stock?.piotroskiScore),
    sector: stock?.profile?.sector || "",
    industry: stock?.profile?.industry || "",
    issues,
    valid: !stale && price !== null && price > 0 && epsTTM !== null && epsTTM > 0 && epsGrowthModel !== null,
  };
}

/**
 * PER de salida por defecto:
 *  - Base: punto medio entre el PER actual y la mediana histórica (reversión parcial a la media),
 *    con un máximo de 30×: tras 5 años de crecimiento, pagar más exige suponer otra década de
 *    crecimiento alto.
 *  - Alcista: el mayor de los dos, con un máximo de 40× (nunca por debajo del base).
 *  - Bajista: −20 % sobre el menor (mínimo 8×).
 * Sin histórico de PER se usa el actual como referencia.
 */
export const EXIT_PE_CAP_BASE = 30;
export const EXIT_PE_CAP_BULL = 40;

export function defaultExitMultiples(inputs: BogleInputs): { bear: number; base: number; bull: number } {
  const pe0 = inputs.pe0 ?? 0;
  const med = inputs.peMedianHist ?? pe0;
  const lo = Math.min(pe0, med);
  const hi = Math.max(pe0, med);
  const base = Math.min(EXIT_PE_CAP_BASE, (pe0 + med) / 2);
  const bull = Math.max(base, Math.min(hi, EXIT_PE_CAP_BULL), inputs.peMedianHist ? 0 : Math.min(pe0 * 1.1, EXIT_PE_CAP_BULL));
  const bear = Math.max(8, Math.min(lo, base) * 0.8);
  return { bear: round1(bear), base: round1(base), bull: round1(bull) };
}

/** TIR de un flujo [−P0, D1, …, DH + PH] por bisección. */
function irr(p0: number, flows: number[]): number {
  const npv = (x: number) => flows.reduce((s, f, i) => s + f / Math.pow(1 + x, i + 1), 0) - p0;
  let lo = -0.99;
  let hi = 5;
  if (npv(lo) * npv(hi) > 0) return NaN;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (npv(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function computeBogle(inputs: BogleInputs, params: BogleParams): BogleResult | null {
  if (!inputs.valid || !inputs.price || !inputs.epsTTM || inputs.pe0 === null) return null;
  const P0 = inputs.price;
  const EPS0 = inputs.epsTTM;
  const PE0 = inputs.pe0;
  const H = Math.max(1, Math.round(params.horizon));
  const r = params.hurdle / 100;
  const g = (params.growth ?? inputs.epsGrowthModel ?? 0) / 100;
  const DY = params.dividendYield ?? inputs.dividendYield;
  const d0 = (DY / 100) * P0; // dividendo por acción actual; crece con el BPA (payout constante)
  const defaults = defaultExitMultiples(inputs);
  const EPS_H = EPS0 * Math.pow(1 + g, H);

  const scenario = (peExit: number): BogleScenario => {
    const P_H = EPS_H * peExit;
    const divs = Array.from({ length: H }, (_, i) => d0 * Math.pow(1 + g, i + 1));
    const flows = divs.map((d, i) => (i === H - 1 ? d + P_H : d));
    const priceReturn = P_H > 0 ? Math.pow(P_H / P0, 1 / H) - 1 : -1;
    const e3 = peExit > 0 ? Math.pow(peExit / PE0, 1 / H) - 1 : -1;
    const tir = irr(P0, flows);
    const dividendsPV = divs.reduce((s, d, i) => s + d / Math.pow(1 + r, i + 1), 0);
    const fair = dividendsPV + P_H / Math.pow(1 + r, H);
    return {
      peExit,
      EPS_H,
      P_H,
      retorno_precio_anual: priceReturn * 100,
      contribE1: g * 100,
      contribE2: Number.isFinite(tir) ? (tir - priceReturn) * 100 : DY,
      contribE3: e3 * 100,
      retorno_total: Number.isFinite(tir) ? tir * 100 : NaN,
      target_upside: (P_H / P0 - 1) * 100,
      dividendsPV,
      P_star: fair,
      P_star_ajustado: fair,
      upside: (fair / P0 - 1) * 100,
    };
  };

  const peBear = params.peExitBear ?? defaults.bear;
  const peBase = params.peExitBase ?? defaults.base;
  const peBull = params.peExitBull ?? defaults.bull;

  const chartData = Array.from({ length: H + 1 }, (_, yr) => {
    const eps = EPS0 * Math.pow(1 + g, yr);
    const path = (exit: number) => (yr === 0 ? P0 : eps * (PE0 + (exit - PE0) * (yr / H)));
    return {
      year: `Year ${yr}`,
      bear: Number(path(peBear).toFixed(2)),
      base: Number(path(peBase).toFixed(2)),
      bull: Number(path(peBull).toFixed(2)),
      eps: Number(eps.toFixed(2)),
    };
  });

  return {
    inputs,
    H,
    r,
    g: g * 100,
    DY,
    defaults,
    bear: scenario(peBear),
    base: scenario(peBase),
    bull: scenario(peBull),
    chartData,
  };
}

/**
 * Tasa exigida por defecto: coste del capital por CAPM con beta ajustada (Rf 4,3 %, prima 5,5 %),
 * con un mínimo del 8 %. Así el modelo Bogle y el DCF descuentan con el mismo criterio de riesgo.
 */
export function defaultHurdle(beta: number | null | undefined, riskFreeRate = 4.3, erp = 5.5): number {
  const b = typeof beta === "number" && Number.isFinite(beta) ? 0.67 * beta + 0.33 : 1;
  return Math.max(8, Math.round((riskFreeRate + b * erp) * 2) / 2);
}
