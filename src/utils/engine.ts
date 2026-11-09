/**
 * engine.ts — Sector-relative factor scoring (Growth/Quality/Stability/Valuation)
 * PURE: sin dependencias, corre en browser, node, deno o edge. No hace fetch.
 * Es el port directo de sp500_engine.py (capas 3, 4 y 5).
 */

import { computeScoreMetrics, gicsSector } from "./scoreMetrics";
import { getAllBenchmarks, getBenchmark } from "./scoreBenchmarks";

export type Metric =
  | "revenue_cagr" | "eps_cagr" | "fcf_cagr"
  | "roic" | "gross_margin" | "operating_margin" | "fcf_conversion"
  | "beta" | "rev_growth_vol" | "margin_vol" | "interest_cov"
  | "trailing_pe" | "forward_pe" | "ev_ebitda" | "fcf_yield";

export type Factor = "growth" | "quality" | "stability" | "valuation";
export type StrategyId = "balanced" | "garp" | "quality_def" | "deep_value";
export type Mode = "percentile" | "zscore";

/** direction: "up" => raw alto mejor ; "down" => raw bajo mejor (multiplos) */
export const METRICS: Record<Metric, "up" | "down"> = {
  revenue_cagr: "up", eps_cagr: "up", fcf_cagr: "up",
  roic: "up", gross_margin: "up", operating_margin: "up", fcf_conversion: "up",
  beta: "down", rev_growth_vol: "down", margin_vol: "down", interest_cov: "up",
  trailing_pe: "down", forward_pe: "down", ev_ebitda: "down", fcf_yield: "up",
};

export const FACTOR_METRICS: Record<Factor, Partial<Record<Metric, number>>> = {
  growth:    { revenue_cagr: 0.35, eps_cagr: 0.40, fcf_cagr: 0.25 },
  quality:   { roic: 0.40, gross_margin: 0.20, operating_margin: 0.30, fcf_conversion: 0.10 },
  stability: { beta: 0.30, rev_growth_vol: 0.25, margin_vol: 0.25, interest_cov: 0.20 },
  valuation: { trailing_pe: 0.25, forward_pe: 0.25, ev_ebitda: 0.30, fcf_yield: 0.20 },
};

export const STRATEGIES: Record<StrategyId, Record<Factor, number>> = {
  balanced:    { growth: 0.25, quality: 0.25, stability: 0.25, valuation: 0.25 },
  garp:        { growth: 0.30, quality: 0.25, stability: 0.10, valuation: 0.35 },
  quality_def: { growth: 0.15, quality: 0.35, stability: 0.30, valuation: 0.20 },
  deep_value:  { growth: 0.10, quality: 0.20, stability: 0.20, valuation: 0.50 },
};

export const MIN_SECTOR_N = 6;
const HI = 65, LO = 40, VHI = 75; // umbrales de tipificacion (tunables)

export type RawFeatures = { symbol: string; name: string; sector: string }
  & Partial<Record<Metric, number | null>> & Record<string, any>;

export interface ScoredRow {
  symbol: string; name: string; sector: string;
  sub: Record<Metric, number | null>;
  raw: RawFeatures;
  factors: Record<Factor, number | null>;
  scores: Record<StrategyId, number | null>;
  archetype: string;
  type: string;
  valuationMethod: string;
  note: string;
}

// ---------- helpers de normalizacion -----------------------------------------
const isNum = (x: unknown): x is number => typeof x === "number" && isFinite(x);

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q, base = Math.floor(pos), rest = pos - base;
  return sorted[base + 1] !== undefined
    ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}
function normalCdf(z: number): number {
  // Abramowitz-Stegun 7.1.26
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

/** rank 0..100 de un grupo. winsoriza, luego percentil o zscore. direction-aware. */
function groupSubscores(
  pairs: { symbol: string; value: number | null }[],
  direction: "up" | "down", mode: Mode,
  winsor: [number, number] = [0.05, 0.95],
): Map<string, number | null> {
  const out = new Map<string, number | null>();
  pairs.forEach(p => out.set(p.symbol, null));
  const valid = pairs.filter(p => isNum(p.value)) as { symbol: string; value: number }[];
  if (valid.length < 3) return out;

  const sortedVals = valid.map(v => v.value).sort((a, b) => a - b);
  const lo = quantile(sortedVals, winsor[0]), hi = quantile(sortedVals, winsor[1]);
  const w = valid.map(v => ({ symbol: v.symbol, value: Math.min(Math.max(v.value, lo), hi) }));

  if (mode === "zscore") {
    const mean = w.reduce((s, v) => s + v.value, 0) / w.length;
    const sd = Math.sqrt(w.reduce((s, v) => s + (v.value - mean) ** 2, 0) / w.length) || 1;
    w.forEach(v => {
      let z = (v.value - mean) / sd;
      if (direction === "down") z = -z;
      // Return raw z-score for aggregation
      out.set(v.symbol, z);
    });
  } else {
    const n = w.length;
    w.forEach(v => {
      const below = w.filter(o => o.value < v.value).length;
      const equal = w.filter(o => o.value === v.value).length;
      let pr = ((below + (equal - 1) / 2 + 0.5) / n) * 100; // rango medio
      if (direction === "down") pr = 100 - pr;
      out.set(v.symbol, pr); // 0-100
    });
  }
  return out;
}

/** Sector GICS de un nombre de sector o subindustria; "Unknown" si no se reconoce (se compara con todo el mercado). */
export function normalizeSectorName(sector: string): string {
  return gicsSector(sector) ?? "Unknown";
}

// ---------- buildScores: sector-relativo estricto S&P 500 ---------------------
export function buildScores(
  rows: RawFeatures[],
  mode: Mode = "zscore",
  financialsMap?: Record<string, any>
): ScoredRow[] {
  if (!rows || rows.length === 0) return [];

  // Group input rows by normalized sector
  const inputBySector = new Map<string, RawFeatures[]>();
  rows.forEach(r => {
    const normSector = normalizeSectorName(r.sector);
    if (!inputBySector.has(normSector)) {
      inputBySector.set(normSector, []);
    }
    inputBySector.get(normSector)!.push(r);
  });

  const subByMetric: Record<Metric, Map<string, number | null>> =
    Object.fromEntries((Object.keys(METRICS) as Metric[]).map(m => [m, new Map()])) as any;

  // Compute metric scores sector by sector using full S&P 500 benchmark universe
  for (const normSector of inputBySector.keys()) {
    const inputGroup = inputBySector.get(normSector)!;

    // Empresas de referencia con datos reales (scoreBenchmarks) del mismo sector; si hay menos de
    // MIN_SECTOR_N, todo el mercado
    const allBench = getAllBenchmarks();
    const sameSector = allBench.filter((b) => normalizeSectorName(b.sector || "") === normSector);
    const peers = sameSector.length >= MIN_SECTOR_N ? sameSector : allBench;
    const benchmarkMap = new Map<string, RawFeatures>();
    peers.forEach((b) => {
      benchmarkMap.set(b.symbol.toUpperCase(), { symbol: b.symbol, name: b.symbol, sector: b.sector || normSector, ...b.metrics });
    });

    // Merge or override input rows for this sector
    inputGroup.forEach(r => {
      const symUpper = r.symbol.toUpperCase();
      if (!benchmarkMap.has(symUpper)) {
        benchmarkMap.set(symUpper, r);
      } else {
        benchmarkMap.set(symUpper, { ...benchmarkMap.get(symUpper)!, ...r });
      }
    });

    const fullSectorUniverse = Array.from(benchmarkMap.values());

    for (const m of Object.keys(METRICS) as Metric[]) {
      const dir = METRICS[m];
      const acc = subByMetric[m];

      const pairs = fullSectorUniverse.map(r => ({
        symbol: r.symbol.toUpperCase(),
        value: (r[m] ?? null) as number | null
      }));

      const sectorSubscores = groupSubscores(pairs, dir, mode);

      inputGroup.forEach(r => {
        acc.set(r.symbol, sectorSubscores.get(r.symbol.toUpperCase()) ?? null);
      });
    }
  }

  // Fallback for unmapped rows if any
  for (const m of Object.keys(METRICS) as Metric[]) {
    const dir = METRICS[m];
    const acc = subByMetric[m];
    const need = rows.filter(r => acc.get(r.symbol) == null && isNum(r[m] as number));
    if (need.length) {
      const uni = groupSubscores(
        rows.map(r => ({ symbol: r.symbol, value: (r[m] ?? null) as number | null })), dir, mode);
      need.forEach(r => acc.set(r.symbol, uni.get(r.symbol) ?? null));
    }
  }

  // agregacion factores + estrategias + tipificacion
  return rows.map(r => {
    // sub holds 0-100 mapped scores for UI display
    const sub = {} as Record<Metric, number | null>;
    // rawSub holds raw z-scores (or percentiles) for accurate factor aggregation
    const rawSub = {} as Record<Metric, number | null>;

    for (const m of Object.keys(METRICS) as Metric[]) {
      const val = subByMetric[m].get(r.symbol) ?? null;
      rawSub[m] = val;
      if (val !== null) {
        sub[m] = mode === "zscore" ? +(normalCdf(val) * 100).toFixed(1) : +(val).toFixed(1);
      } else {
        sub[m] = null;
      }
    }

    const factors = {} as Record<Factor, number | null>;
    for (const f of Object.keys(FACTOR_METRICS) as Factor[]) {
      let num = 0, den = 0;
      for (const [m, w] of Object.entries(FACTOR_METRICS[f]) as [Metric, number][]) {
        const v = rawSub[m]; if (isNum(v)) { num += v * w; den += w; }
      }
      if (den > 0) {
        const aggRaw = num / den;
        // Si usamos z-score, el agregado de z-scores se vuelve a mapear a 0-100 (distribución normal)
        factors[f] = mode === "zscore" ? +(normalCdf(aggRaw) * 100).toFixed(1) : +(aggRaw).toFixed(1);
      } else {
        factors[f] = null;
      }
    }

    const scores = {} as Record<StrategyId, number | null>;
    for (const s of Object.keys(STRATEGIES) as StrategyId[]) {
      let num = 0, den = 0;
      for (const [f, w] of Object.entries(STRATEGIES[s]) as [Factor, number][]) {
        // Here we aggregate the 0-100 scores because factors are already mapped to 0-100, 
        // or we could aggregate raw factor Z-scores. Averaging 0-100 is typical for final strategy scores.
        const v = factors[f]; if (isNum(v)) { num += v * w; den += w; }
      }
      scores[s] = den ? +(num / den).toFixed(1) : null;
    }

    const { archetype, note } = typify(factors.growth, factors.quality, factors.stability, factors.valuation);
    const { type, valuationMethod } = determineType(r, factors);
    return { symbol: r.symbol, name: r.name, sector: r.sector, sub, raw: r, factors, scores, archetype, note, type, valuationMethod };
  });
}

// ---------- tipificacion ------------------------------------------------------
export function typify(
  G: number | null, Q: number | null, S: number | null, V: number | null,
): { archetype: string;
  type: string;
  valuationMethod: string; note: string } {
  const g = G ?? 50, q = Q ?? 50, s = S ?? 50, v = V ?? 50;
  if (q >= HI && v >= HI) return { archetype: "Wonderful Co. @ Fair Price", type: "Calidad / Valor", valuationMethod: "DCF / Múltiplos", note: "calidad alta y barata: el sweet spot tipo Buffett" };
  if (q >= HI && g >= LO && v < HI) return { archetype: "High-Quality Compounder", type: "Calidad", valuationMethod: "DCF / ROIC", note: "negocio excelente que cotiza con prima; pagas calidad" };
  if (g >= VHI && v < LO) return { archetype: "Hyper-Growth / Story", type: "Crecimiento", valuationMethod: "EV/Ventas", note: "crecimiento muy alto, valuacion exigente" };
  if (g >= HI && v >= LO && q >= LO) return { archetype: "GARP", type: "GARP", valuationMethod: "PEG / P/E", note: "crecimiento bueno a precio razonable con calidad decente" };
  if (s >= HI && g < LO && q >= LO) return { archetype: "Defensive / Bond-Proxy", type: "Defensivo", valuationMethod: "Dividend Yield", note: "estable y predecible, poco crecimiento" };
  if (v >= HI && q >= LO) return { archetype: "Deep Value", type: "Valor Profundo", valuationMethod: "P/E / EV/EBITDA", note: "barata con calidad aceptable; mean-reversion play" };
  if (v >= HI && q < LO) return { archetype: "Value Trap", type: "Trampa de Valor", valuationMethod: "P/E", note: "barata por una razon: calidad debil" };
  if (s < LO && q >= LO && v >= LO) return { archetype: "Cyclical / Volatile", type: "Cíclico", valuationMethod: "P/B / EV/EBITDA", note: "earnings ciclicos; el score oscila con el ciclo" };
  if (g >= HI && q < LO) return { archetype: "Speculative / Story", type: "Especulativo", valuationMethod: "EV/Ventas", note: "crece pero sin calidad/rentabilidad probada" };
  if (q < LO && s < LO) return { archetype: "Distressed / Falling Knife", type: "Riesgo Elevado", valuationMethod: "Valor de Liquidación", note: "calidad y estabilidad bajas: alto riesgo" };
  return { archetype: "Solid but Unremarkable", type: "Promedio", valuationMethod: "P/E Relativo", note: "perfil promedio sin un factor dominante" };
}

// ---------- utilidades de consulta -------------------------------------------
export function rankInSector(rows: ScoredRow[], symbol: string, strat: StrategyId = "balanced") {
  const r = rows.find(x => x.symbol === symbol);
  if (!r) return null;
  const peers = rows.filter(x => x.sector === r.sector)
    .sort((a, b) => (b.scores[strat] ?? 0) - (a.scores[strat] ?? 0));
  return { rank: peers.findIndex(x => x.symbol === symbol) + 1, total: peers.length };
}

// ---------- métricas reales ---------------------------------------------------
/**
 * Completa las métricas que falten con los estados financieros de la empresa (misma definición que la
 * referencia del servidor, scoreMetrics.ts). Las que ya vienen de la referencia no se tocan, para que
 * la empresa y sus comparables se midan igual.
 */
export function overrideFeaturesWithFinancials(raw: RawFeatures, fin: { annual: any[]; quarterly: any[]; [key: string]: any } | null): RawFeatures {
  if (!fin) return raw;
  const annual = Array.isArray(fin.annualAll) && fin.annualAll.length ? fin.annualAll : fin.annual;
  const quarterly = Array.isArray(fin.quarterlyAll) && fin.quarterlyAll.length ? fin.quarterlyAll : fin.quarterly;
  const { metrics, flags } = computeScoreMetrics(annual, quarterly, {
    trailingPE: fin.trailingPE ?? fin.stockData?.trailingPE ?? null,
    forwardPE: fin.forwardPE ?? fin.stockData?.forwardPE ?? null,
    price: fin.currentPrice ?? fin.stockData?.price ?? null,
    marketCap: fin.marketCap ?? fin.stockData?.marketCap ?? null,
    beta: fin.beta ?? fin.stockData?.beta ?? null,
    sector: raw.sector || null,
  });
  for (const [k, v] of Object.entries(metrics)) {
    if ((raw[k] === null || raw[k] === undefined) && v !== null && v !== undefined) raw[k] = v;
  }
  for (const [k, v] of Object.entries(flags)) {
    if (raw[k] === undefined && v !== undefined) raw[k] = v;
  }
  return raw;
}

/** Métricas de la empresa en la referencia (datos reales) o vacías. Nunca valores inventados. */
export function getRawFeatures(symbol: string, name: string, sector: string): RawFeatures {
  const ticker = symbol.toUpperCase();
  const b = getBenchmark(ticker);
  if (b) return { symbol: ticker, name, sector: sector || b.sector || "", ...b.metrics, ...(b.flags || {}) };
  return { symbol: ticker, name, sector };
}

// ---------- tipificacion de tipo y metodo -------------------------------------------
export function determineType(r: RawFeatures, factors: Record<Factor, number | null>): { type: string; valuationMethod: string } {
  const g = factors.growth ?? 0;
  const q = factors.quality ?? 0;
  const s = factors.stability ?? 0;
  
  // Sector GICS normalizado (la clasificación trae a veces la subindustria)
  const sec = normalizeSectorName(r.sector || "");
  const isFinancial = sec === "Financials";
  const isUtilityOrRealEstate = sec === "Utilities" || sec === "Real Estate";
  const commodityExposure = sec === "Energy" || sec === "Materials";
  
  const negativeFcf = r.negativeFcf ?? false;
  const heavyDilution = r.shareDilution3y != null && r.shareDilution3y > 5;
  const revenueDecline = r.revenueDecline ?? false;
  const capexRatio = r.capexRatio ?? 0;
  const revenueCagr3y = r.revenue_cagr ?? 0;
  const earningsVolatility = r.earningsVolatility ?? 0;
  // El tipo depende del crecimiento real (CAGR a 3 años), no del score de Growth, que es relativo al
  // sector: un 77 entre empresas de consumo básico no es "hipercrecimiento". Sin datos, el score.
  const revG = r.revenue_cagr;
  const epsG = r.eps_cagr;
  const hyper = revG != null ? revG >= 20 : g >= 75;
  const growing = revG != null ? revG >= 8 || (epsG != null && epsG >= 12) : g >= 50;
  const someGrowth = revG != null ? revG >= 5 : g >= 40;

  if (isFinancial) return { type: "Financial / Fintech", valuationMethod: "P/B + Earnings Power" };

  if (revenueDecline && r.marginsImproving && r.epsRevisionPositive) 
    return { type: "Turnaround", valuationMethod: "Normalized DCF + Sum of Parts" };

  // Speculative: Negative FCF + Dilution or Low Stability
  if (negativeFcf && (heavyDilution || s < 40)) 
    return { type: "Speculative", valuationMethod: "Revenue Multiple + Scenario Analysis" };

  // Utilities / Heavy Infrastructure
  if (isUtilityOrRealEstate || (capexRatio > 20 && revenueCagr3y < 10 && !commodityExposure)) 
    return { type: "Infrastructure / Utility", valuationMethod: "EV/EBITDA + FCF" };

  // Cyclicals - pure commodity plays
  if (commodityExposure) 
    return { type: "Cyclical", valuationMethod: "Normalized Earnings + EV/EBITDA" };

  // Top Tier Growth
  if (hyper && !negativeFcf) 
    return { type: "Hypergrowth", valuationMethod: "DCF + PEG + Revenue Multiple" };
  
  if (growing && q >= 50 && !negativeFcf) 
    return { type: "Growth Compounder", valuationMethod: "DCF + PEG" };

  // Top Tier Quality / Stalwarts
  if (q >= 60 && s >= 60 && !negativeFcf) 
    return { type: "Mature Compounder", valuationMethod: "DCF + Dividend Discount" };
  
  if (someGrowth && q >= 40 && !negativeFcf) 
    return { type: "Growth Compounder", valuationMethod: "DCF + PEG" };
  
  if (s >= 50 && !negativeFcf) 
    return { type: "Mature Compounder", valuationMethod: "DCF + Dividend Discount" };

  // Secondary Cyclical check (Volatile earnings but not top tier compounders)
  if (earningsVolatility > 0.35) 
    return { type: "Cyclical", valuationMethod: "Normalized Earnings + EV/EBITDA" };
    
  if (negativeFcf) 
    return { type: "Speculative", valuationMethod: "Revenue Multiple + Scenario Analysis" };
    
  if (someGrowth)
    return { type: "Growth Compounder", valuationMethod: "DCF + PEG" };
    
  return { type: "Mature Compounder", valuationMethod: "DCF + Dividend Discount" };
}
