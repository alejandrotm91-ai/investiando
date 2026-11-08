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
//  - Crecimiento del BPA (Motor 1): mediana del CAGR histórico robusto (hasta 10 ejercicios, entre
//    la mediana de los 3 primeros y la de los 3 últimos, para que un año atípico —COVID, un cargo
//    puntual— no lo distorsione), el consenso a 1 año y ventas + recompras; recorte del 30 % si
//    supera el 40 % y tope del 25 % (AGENTS.md §2.3).
//  - Perfil por tipo de empresa: cíclicas (energía, materiales, maquinaria, automóvil, aerolíneas,
//    construcción residencial) con BPA normalizado (media de 5 ejercicios) y crecimiento = ventas +
//    recompras (0-8 %); REIT con aviso (el BPA contable no es su medida, sería el FFO); el resto,
//    método general. Si el BPA de 12 meses se aparta más de un 30 % del último ejercicio, se usa la
//    mediana de los dos y del previsto (resultados extraordinarios).
//  - PER histórico (Motor 3): mediana a 10 años del PER mensual (precio / BPA de 12 meses), que
//    calcula /api/portfolio/financials; sin ella, la de los cierres de ejercicio.
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
  /** BPA de partida del modelo: el de 12 meses, o normalizado (cíclicas, resultados extraordinarios) */
  epsBase: number | null;
  pe0: number | null; // precio / BPA de partida
  peFwd: number | null;
  epsCagrHist: number | null; // %
  epsCagrYears: number;
  epsGrowthFwd1Y: number | null; // %
  epsGrowthModel: number | null; // % normalizado
  growthNotes: string[];
  dividendYield: number; // %
  buybackYield: number; // % (informativo)
  peMedianHist: number | null;
  /** De dónde sale la mediana del PER: 10 años de PER mensual, o los cierres de ejercicio */
  peMedianSource: "monthly10y" | "normalized10y" | "yearEnd" | null;
  peHistory: PeHistoryPoint[];
  /** Tipo de empresa para el modelo */
  profile: "general" | "cyclical" | "reit";
  /** Avisos del perfil y del BPA de partida, en los dos idiomas */
  profileNotes: { en: string; es: string }[];
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
  /** Si Yahoo no respondió y se usan los últimos datos guardados: su fecha (ISO) */
  dataAsOf: string | null;
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

/** Tipo de empresa según el sector y la industria de Yahoo. */
export function companyProfile(sector: string, industry: string): BogleInputs["profile"] {
  if (/^REIT\b/i.test(industry) || (/real estate/i.test(sector) && /REIT/i.test(industry))) return "reit";
  if (/^(Energy|Basic Materials)$/i.test(sector)) return "cyclical";
  if (/Machinery|Auto Manufacturers|Auto Parts|Airlines|Residential Construction|Steel|Aluminum|Copper|Agricultural Inputs|Trucking|Marine Shipping/i.test(industry)) return "cyclical";
  return "general";
}

/**
 * CAGR robusto del BPA: entre la mediana de los 3 primeros ejercicios y la de los 3 últimos (con 5 o
 * más), para que un año atípico en un extremo no lo distorsione. Si la mediana inicial no es positiva,
 * la ventana avanza mientras queden al menos 3 años entre ambas. Con menos de 5 ejercicios, entre el
 * primero y el último positivos. `epsDesc` va del más reciente al más antiguo.
 */
export function robustEpsCagr(epsDesc: (number | null)[]): { cagr: number; years: number; label: string } | null {
  const asc = [...epsDesc].reverse();
  const med3 = (a: (number | null)[]) => {
    const v = a.filter((x): x is number => x !== null).sort((x, y) => x - y);
    return v.length === 3 ? v[1] : v.length ? v[Math.floor(v.length / 2)] : null;
  };
  const n = asc.length;
  if (n >= 5) {
    const end = med3(asc.slice(n - 3));
    if (end !== null && end > 0) {
      for (let k = 0; k + 1 <= n - 2 - 3; k++) {
        const start = med3(asc.slice(k, k + 3));
        const years = n - 2 - (k + 1);
        if (start !== null && start > 0) {
          return { cagr: round1((Math.pow(end / start, 1 / years) - 1) * 100), years, label: `${years} años, mediana de 3 ejercicios en cada extremo` };
        }
      }
    }
  }
  // Pocos ejercicios: entre el primero y el último positivos
  const li = n - 1;
  const last = asc[li];
  if (last === null || last <= 0) return null;
  for (let i = 0; i < li; i++) {
    const v = asc[i];
    if (v !== null && v > 0) {
      const years = li - i;
      return { cagr: round1((Math.pow(last / v, 1 / years) - 1) * 100), years, label: `${years} años` };
    }
  }
  return null;
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

  const peFwd = price && epsFwd && epsFwd > 0 ? price / epsFwd : null;

  // Hasta 10-11 ejercicios de la SEC (annualAll); si no, los 6 de los modelos
  const annual = cleanAnnual(Array.isArray(fin?.annualAll) && fin.annualAll.length ? fin.annualAll : fin?.annual);
  const epsDesc = annual.map((p) => num(p.dilutedEPS) ?? num(p.basicEPS));
  const fyEps = epsDesc[0] ?? null;
  const robust = robustEpsCagr(epsDesc);
  const epsCagrHist = robust?.cagr ?? null;
  const epsCagrYears = robust?.years ?? 0;
  const epsGrowthFwd1Y = epsTTM && epsTTM > 0 && epsFwd && epsFwd > 0 ? round1((epsFwd / epsTTM - 1) * 100) : null;

  // Recompras (dato informativo y parte del ancla fundamental).
  let buybackYield = 0;
  const shares = annual
    .map((p) => num(p.ordinarySharesNumber) ?? num(p.dilutedAverageShares) ?? num(p.shareIssued))
    .filter((v): v is number => v !== null && v > 0);
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

  // Perfil por tipo de empresa
  const sector: string = stock?.profile?.sector || "";
  const industry: string = stock?.profile?.industry || "";
  const profile = companyProfile(sector, industry);
  const profileNotes: { en: string; es: string }[] = [];

  // BPA de partida
  let epsBase: number | null = epsTTM;
  if (epsTTM !== null && epsTTM > 0) {
    if (profile === "cyclical") {
      const last5 = epsDesc.slice(0, 5).filter((v): v is number => v !== null);
      const avg = last5.length >= 3 ? last5.reduce((a, v) => a + v, 0) / last5.length : null;
      if (avg !== null && avg > 0) {
        epsBase = avg;
        profileNotes.push({
          en: `Cyclical company: the model starts from normalized EPS (average of the last ${last5.length} fiscal years, $${avg.toFixed(2)}) instead of the last 12 months ($${epsTTM.toFixed(2)}), and growth follows revenue + buybacks.`,
          es: `Empresa cíclica: el modelo parte del BPA normalizado (media de los últimos ${last5.length} ejercicios, $${avg.toFixed(2)}) en vez del de 12 meses ($${epsTTM.toFixed(2)}), y el crecimiento sigue a ventas + recompras.`,
        });
      }
    } else if (fyEps !== null && fyEps > 0 && Math.abs(epsTTM / fyEps - 1) > 0.3) {
      const vals = [epsTTM, fyEps, ...(epsFwd && epsFwd > 0 ? [epsFwd] : [])].sort((a, b) => a - b);
      const m = Math.floor(vals.length / 2);
      const mid = vals.length % 2 ? vals[m] : (vals[m - 1] + vals[m]) / 2;
      if (Math.abs(mid / epsTTM - 1) > 0.02) {
        epsBase = mid;
        profileNotes.push({
          en: `12-month EPS ($${epsTTM.toFixed(2)}) is more than 30% away from the last fiscal year ($${fyEps.toFixed(2)}), likely due to one-off items: the model starts from $${mid.toFixed(2)} (median of the two and the forecast).`,
          es: `El BPA de 12 meses ($${epsTTM.toFixed(2)}) se aparta más de un 30 % del último ejercicio ($${fyEps.toFixed(2)}), probablemente por partidas extraordinarias: el modelo parte de $${mid.toFixed(2)} (mediana de los dos y del previsto).`,
        });
      }
    }
  }
  if (profile === "reit") {
    profileNotes.push({
      en: "REIT: accounting EPS includes depreciation and gains on property sales, so P/E is not its usual yardstick (FFO is). Read the result with caution.",
      es: "REIT: el BPA contable incluye amortizaciones y plusvalías por venta de inmuebles, así que el PER no es su medida habitual (lo es el FFO). Toma el resultado con cautela.",
    });
  }
  const pe0 = price && epsBase && epsBase > 0 ? price / epsBase : null;

  // Crecimiento del modelo
  let epsGrowthModel: number | null = null;
  if (profile === "cyclical" && revCagr !== null) {
    // El BPA de una cíclica va y viene con el ciclo: a largo plazo crece como sus ventas + recompras
    const raw = revCagr + buybackYield;
    epsGrowthModel = round1(Math.max(0, Math.min(8, raw)));
    notes.push(`cíclica: ventas ${round1(revCagr)}% anual (${revs.length - 1} años) + recompras ${buybackYield}% = ${round1(raw)}%, acotado a 0-8% → ${epsGrowthModel}%`);
  } else {
    // Mediana de las lecturas disponibles (robusta a valores atípicos). El consenso a 1 año compara
    // BPA ajustado con BPA contable: se descarta si supera el 40 %.
    const candidates: { label: string; v: number }[] = [];
    if (epsCagrHist !== null) candidates.push({ label: `histórico ${epsCagrHist}% (${robust?.label})`, v: epsCagrHist });
    if (epsGrowthFwd1Y !== null) {
      if (epsGrowthFwd1Y <= 40) candidates.push({ label: `consenso a 1 año ${epsGrowthFwd1Y}%`, v: epsGrowthFwd1Y });
      else notes.push(`consenso a 1 año ${epsGrowthFwd1Y}% descartado: compara BPA ajustado con BPA contable`);
    }
    if (fundamental !== null) candidates.push({ label: `ventas + recompras ${fundamental}%`, v: fundamental });
    if (candidates.length) {
      const vals = candidates.map((c) => c.v).sort((a, b) => a - b);
      const m = Math.floor(vals.length / 2);
      const raw = vals.length % 2 ? vals[m] : (vals[m - 1] + vals[m]) / 2;
      notes.unshift(`${vals.length === 1 ? "única lectura" : vals.length === 2 ? "media" : "mediana"} de ${candidates.map((c) => c.label).join(", ")} = ${round1(raw)}%`);
      epsGrowthModel = normalizeEpsGrowth(raw, notes);
    }
  }
  if (epsGrowthModel === null) issues.push("sin histórico ni previsión de BPA para estimar el crecimiento");

  // Motor 2: dividendo. Las recompras se calculan solo como dato (ya están en el BPA).
  const dyRaw = num(stock?.dividendYield);
  const dividendYield = dyRaw === null ? 0 : dyRaw > 1 ? dyRaw : dyRaw * 100;
  const peHistory: PeHistoryPoint[] = Array.isArray(fin?.peHistory) ? fin.peHistory : [];
  // Cíclicas: su PER actual va sobre el BPA normalizado, así que se compara con la mediana histórica
  // del mismo PER normalizado (precio / BPA medio de 5 ejercicios); sin ella, la del PER de 12 meses
  const peMonthly = (profile === "cyclical" && pe0 !== null && epsBase !== epsTTM ? num(fin?.peNormMedian10Y) : null) ?? num(fin?.peMedian10Y);
  const peYearEnd = medianHistoricalPe(peHistory);
  const peMedianHist = peMonthly ?? peYearEnd;
  const peMedianSource: BogleInputs["peMedianSource"] =
    peMonthly !== null ? (profile === "cyclical" && epsBase !== epsTTM && num(fin?.peNormMedian10Y) !== null ? "normalized10y" : "monthly10y") : peYearEnd !== null ? "yearEnd" : null;
  const payout = num(stock?.payoutRatio);
  const dte = num(stock?.debtToEquity);

  return {
    symbol,
    name: stock?.name || symbol,
    price,
    epsTTM,
    epsFwd,
    epsBase,
    pe0,
    peFwd,
    epsCagrHist,
    epsCagrYears,
    epsGrowthFwd1Y,
    epsGrowthModel,
    growthNotes: notes,
    dividendYield: round1(dividendYield * 100) / 100,
    buybackYield,
    peMedianHist,
    peMedianSource,
    peHistory,
    profile,
    profileNotes,
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
    sector,
    industry,
    issues,
    dataAsOf: stock?.stale ? (stock?.quoteAsOf ?? null) : fin?.stale ? (fin?.asOf ?? null) : null,
    valid: !stale && price !== null && price > 0 && epsTTM !== null && epsTTM > 0 && pe0 !== null && epsGrowthModel !== null,
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
  const base = Math.min(EXIT_PE_CAP_BASE, inputs.profile === "cyclical" && inputs.peMedianHist ? med : (pe0 + med) / 2);
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
  const EPS0 = inputs.epsBase ?? inputs.epsTTM;
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
