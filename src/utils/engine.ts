/**
 * engine.ts — Sector-relative factor scoring (Growth/Quality/Stability/Valuation)
 * PURE: sin dependencias, corre en browser, node, deno o edge. No hace fetch.
 * Es el port directo de sp500_engine.py (capas 3, 4 y 5).
 */

import { SP500_SECTORS_TOP20 } from "../data/sp500Sectors";

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

export function normalizeSectorName(sector: string): string {
  if (!sector) return "Technology";
  const s = sector.trim();
  if (s === "Financial Services") return "Financials";
  if (s === "Information Technology") return "Technology";
  if (s === "Basic Materials") return "Materials";
  if (SP500_SECTORS_TOP20[s]) return s;
  const match = Object.keys(SP500_SECTORS_TOP20).find(k => k.toLowerCase() === s.toLowerCase());
  return match || "Technology";
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

    // Load S&P 500 top 20 sector benchmark group
    const sectorInfo = SP500_SECTORS_TOP20[normSector] || SP500_SECTORS_TOP20["Technology"];
    const benchmarkMap = new Map<string, RawFeatures>();

    sectorInfo.tickers.forEach(t => {
      const raw = getRawFeatures(t.symbol, t.name, normSector);
      if (financialsMap && financialsMap[t.symbol.toUpperCase()]) {
        overrideFeaturesWithFinancials(raw, financialsMap[t.symbol.toUpperCase()]);
      }
      benchmarkMap.set(t.symbol.toUpperCase(), raw);
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

// ---------- generador determinista de metricas -------------------------------
export function overrideFeaturesWithFinancials(raw: RawFeatures, fin: { annual: any[]; quarterly: any[] } | null): RawFeatures {
  if (!fin) return raw;

  let sortedAnnual: any[] = [];
  if (fin.annual && fin.annual.length > 0) {
    sortedAnnual = [...fin.annual].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  let sortedQuarterly: any[] = [];
  if (fin.quarterly && fin.quarterly.length > 0) {
    sortedQuarterly = [...fin.quarterly].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  const calculateGrowth = (key: string): number | null => {
    // Prioritize quarterly YoY (latest quarter vs same quarter 1 year ago, idx + 4) for the most up-to-date AGR
    if (sortedQuarterly.length >= 2) {
      const validCols = sortedQuarterly
        .map((col, idx) => ({ val: col[key], idx }))
        .filter(item => typeof item.val === "number" && !isNaN(item.val));

      if (validCols.length >= 2) {
        const latestItem = validCols[0];
        let priorYearItem = validCols.find(item => item.idx === latestItem.idx + 4);
        if (!priorYearItem && validCols.length > 1) {
          priorYearItem = validCols[1];
        }

        if (priorYearItem && priorYearItem.val !== 0 && latestItem.val !== undefined) {
          return ((latestItem.val - priorYearItem.val) / Math.abs(priorYearItem.val)) * 100;
        }
      }
    }

    // Fallback to Annual YoY (latest annual vs previous annual)
    if (sortedAnnual.length >= 2) {
      const validCols = sortedAnnual
        .map((col, idx) => ({ val: col[key], idx }))
        .filter(item => typeof item.val === "number" && !isNaN(item.val));

      if (validCols.length >= 2) {
        const latestItem = validCols[0];
        const priorYearItem = validCols[1];
        if (priorYearItem && priorYearItem.val !== 0 && latestItem.val !== undefined) {
          return ((latestItem.val - priorYearItem.val) / Math.abs(priorYearItem.val)) * 100;
        }
      }
    }

    return null;
  };

  const revCagr = calculateGrowth("totalRevenue");
  if (revCagr !== null) {
    raw.revenue_cagr = revCagr;
  }

  const epsCagr = calculateGrowth("dilutedEPS") ?? calculateGrowth("basicEPS");
  if (epsCagr !== null) {
    raw.eps_cagr = epsCagr;
  }

  const fcfCagr = calculateGrowth("freeCashFlow");
  if (fcfCagr !== null) {
    raw.fcf_cagr = fcfCagr;
  }

  const latest = sortedAnnual[0];

  if (latest) {
    raw.positiveFcf = (latest.freeCashFlow ?? 0) > 0;
    raw.negativeFcf = (latest.freeCashFlow ?? 0) < 0;
    if (latest.totalRevenue && latest.capitalExpenditure) {
      raw.capexRatio = Math.abs(latest.capitalExpenditure) / latest.totalRevenue * 100;
    }
  }

  const sharesCagr = calculateGrowth("dilutedAverageShares") ?? calculateGrowth("basicAverageShares");
  if (sharesCagr !== null) raw.shareDilution3y = sharesCagr;

  if (sortedAnnual.length >= 4) {
    const rev1 = sortedAnnual[0].totalRevenue;
    const rev4 = sortedAnnual[3].totalRevenue;
    if (rev1 && rev4) raw.revenueDecline = rev1 < rev4;
  }

  if (sortedAnnual.length >= 3) {
    const m1 = sortedAnnual[0].netIncomeCommonStockholders && sortedAnnual[0].totalRevenue ? sortedAnnual[0].netIncomeCommonStockholders / sortedAnnual[0].totalRevenue : null;
    const m3 = sortedAnnual[2].netIncomeCommonStockholders && sortedAnnual[2].totalRevenue ? sortedAnnual[2].netIncomeCommonStockholders / sortedAnnual[2].totalRevenue : null;
    if (m1 !== null && m3 !== null) raw.marginsImproving = m1 > m3;

    let earnChanges = [];
    for (let i = 0; i < sortedAnnual.length - 1; i++) {
       const cur = sortedAnnual[i].netIncomeCommonStockholders;
       const prior = sortedAnnual[i+1].netIncomeCommonStockholders;
       if (cur !== undefined && prior !== undefined && prior !== 0) earnChanges.push((cur - prior) / Math.abs(prior));
    }
    if (earnChanges.length > 0) {
      const avg = earnChanges.reduce((a, b) => a + b, 0) / earnChanges.length;
      raw.earningsVolatility = Math.sqrt(earnChanges.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / earnChanges.length);
    }
  }
  raw.epsRevisionPositive = true;

  if (latest) {
    if (latest.netIncomeCommonStockholders && latest.investedCapital && latest.investedCapital !== 0) {
      raw.roic = (latest.netIncomeCommonStockholders / latest.investedCapital) * 100;
    }
    if (latest.grossProfit && latest.totalRevenue && latest.totalRevenue !== 0) {
      raw.gross_margin = (latest.grossProfit / latest.totalRevenue) * 100;
    }
    if (latest.operatingIncome && latest.totalRevenue && latest.totalRevenue !== 0) {
      raw.operating_margin = (latest.operatingIncome / latest.totalRevenue) * 100;
    }
    if (latest.freeCashFlow && latest.netIncomeCommonStockholders && latest.netIncomeCommonStockholders !== 0) {
      raw.fcf_conversion = (latest.freeCashFlow / latest.netIncomeCommonStockholders) * 100;
    }
    if (latest.operatingIncome && latest.interestExpense && latest.interestExpense !== 0) {
      raw.interest_cov = latest.operatingIncome / Math.abs(latest.interestExpense);
    }
  }

  if (sortedAnnual.length >= 3) {
    let revGrowths = [];
    let margins = [];
    for (let i = 0; i < sortedAnnual.length - 1; i++) {
      const currentVal = sortedAnnual[i].totalRevenue;
      const priorVal = sortedAnnual[i + 1].totalRevenue;
      if (currentVal && priorVal && priorVal !== 0) {
        revGrowths.push(((currentVal - priorVal) / Math.abs(priorVal)) * 100);
      }
      if (sortedAnnual[i].grossProfit && sortedAnnual[i].totalRevenue && sortedAnnual[i].totalRevenue !== 0) {
        margins.push((sortedAnnual[i].grossProfit / sortedAnnual[i].totalRevenue) * 100);
      }
    }
    if (revGrowths.length > 0) {
      const avg = revGrowths.reduce((a, b) => a + b, 0) / revGrowths.length;
      raw.rev_growth_vol = Math.sqrt(revGrowths.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / revGrowths.length);
    }
    if (margins.length > 0) {
      const avg = margins.reduce((a, b) => a + b, 0) / margins.length;
      raw.margin_vol = Math.sqrt(margins.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / margins.length);
    }
  }

  return raw;
}

export function getRawFeatures(symbol: string, name: string, sector: string): RawFeatures {
  const ticker = symbol.toUpperCase();
  
  // Custom baseline for known tickers
  const baselines: Record<string, Partial<Record<Metric, number>>> = {
    MSFT: {
      revenue_cagr: 14.5, eps_cagr: 18.2, fcf_cagr: 15.1,
      roic: 28.5, gross_margin: 69.2, operating_margin: 44.6, fcf_conversion: 95.0,
      beta: 1.10, rev_growth_vol: 3.2, margin_vol: 2.1, interest_cov: 45.0,
      trailing_pe: 35.2, forward_pe: 31.0, ev_ebitda: 25.4, fcf_yield: 2.8,
    },
    NVDA: {
      revenue_cagr: 65.4, eps_cagr: 85.2, fcf_cagr: 72.1,
      roic: 58.5, gross_margin: 76.2, operating_margin: 54.6, fcf_conversion: 110.0,
      beta: 1.68, rev_growth_vol: 18.2, margin_vol: 6.5, interest_cov: 95.0,
      trailing_pe: 29.48, forward_pe: 21.93, ev_ebitda: 23.81, fcf_yield: 1.8,
    },
    AAPL: {
      revenue_cagr: 8.5, eps_cagr: 11.2, fcf_cagr: 9.8,
      roic: 45.5, gross_margin: 45.2, operating_margin: 30.6, fcf_conversion: 105.0,
      beta: 1.05, rev_growth_vol: 4.2, margin_vol: 1.8, interest_cov: 38.0,
      trailing_pe: 30.2, forward_pe: 27.0, ev_ebitda: 22.4, fcf_yield: 3.2,
    },
    META: {
      revenue_cagr: 18.5, eps_cagr: 24.2, fcf_cagr: 22.1,
      roic: 24.5, gross_margin: 80.2, operating_margin: 38.6, fcf_conversion: 92.0,
      beta: 1.25, rev_growth_vol: 7.5, margin_vol: 4.1, interest_cov: 52.0,
      trailing_pe: 28.2, forward_pe: 24.0, ev_ebitda: 18.4, fcf_yield: 3.8,
    },
    GOOGL: {
      revenue_cagr: 12.5, eps_cagr: 16.2, fcf_cagr: 14.1,
      roic: 22.5, gross_margin: 56.2, operating_margin: 28.6, fcf_conversion: 88.0,
      beta: 1.08, rev_growth_vol: 3.8, margin_vol: 2.2, interest_cov: 60.0,
      trailing_pe: 25.2, forward_pe: 21.0, ev_ebitda: 15.4, fcf_yield: 4.2,
    },
    AMZN: {
      revenue_cagr: 11.5, eps_cagr: 35.2, fcf_cagr: 42.1,
      roic: 14.5, gross_margin: 46.2, operating_margin: 9.6, fcf_conversion: 120.0,
      beta: 1.15, rev_growth_vol: 5.1, margin_vol: 3.2, interest_cov: 15.0,
      trailing_pe: 40.2, forward_pe: 32.0, ev_ebitda: 19.4, fcf_yield: 2.5,
    },
    AVGO: {
      revenue_cagr: 19.2, eps_cagr: 22.4, fcf_cagr: 18.5,
      roic: 18.5, gross_margin: 65.4, operating_margin: 35.2, fcf_conversion: 98.0,
      beta: 1.20, rev_growth_vol: 6.5, margin_vol: 3.1, interest_cov: 12.5,
      trailing_pe: 38.5, forward_pe: 28.2, ev_ebitda: 21.2, fcf_yield: 4.5,
    },
    MAGS: {
      revenue_cagr: 20.5, eps_cagr: 25.2, fcf_cagr: 22.1,
      roic: 25.0, gross_margin: 60.2, operating_margin: 32.0, fcf_conversion: 95.0,
      beta: 1.22, rev_growth_vol: 8.0, margin_vol: 4.0, interest_cov: 40.0,
      trailing_pe: 32.2, forward_pe: 28.0, ev_ebitda: 20.4, fcf_yield: 3.0,
    },
    IREN: {
      revenue_cagr: 45.2, eps_cagr: 5.2, fcf_cagr: -12.5,
      roic: 2.5, gross_margin: 28.4, operating_margin: -1.5, fcf_conversion: 45.0,
      beta: 2.20, rev_growth_vol: 35.2, margin_vol: 18.4, interest_cov: 1.5,
      trailing_pe: 85.0, forward_pe: 45.0, ev_ebitda: 38.0, fcf_yield: -4.2,
    },
    CRWV: {
      revenue_cagr: 8.2, eps_cagr: 6.4, fcf_cagr: 5.1,
      roic: 6.5, gross_margin: 34.2, operating_margin: 8.5, fcf_conversion: 75.0,
      beta: 1.15, rev_growth_vol: 10.2, margin_vol: 5.4, interest_cov: 4.5,
      trailing_pe: 18.5, forward_pe: 15.2, ev_ebitda: 11.2, fcf_yield: 2.4,
    },
    NBIS: {
      revenue_cagr: 125.0, eps_cagr: 45.0, fcf_cagr: -15.0,
      roic: 3.5, gross_margin: 48.5, operating_margin: -8.5, fcf_conversion: -25.0,
      beta: 1.85, rev_growth_vol: 28.5, margin_vol: 16.2, interest_cov: 25.0,
      trailing_pe: 55.0, forward_pe: 32.0, ev_ebitda: 26.5, fcf_yield: -2.8,
    }
  };
  
  if (baselines[ticker]) {
    return { symbol: ticker, name, sector, ...baselines[ticker] };
  }
  
  // Deterministic fallback based on hash
  let hash = 0;
  for (let i = 0; i < ticker.length; i++) {
    hash = ticker.charCodeAt(i) + ((hash << 5) - hash);
  }
  const absHash = Math.abs(hash);
  
  return {
    symbol: ticker,
    name,
    sector,
    revenue_cagr: 5 + (absHash % 30),
    eps_cagr: 4 + (absHash % 40),
    fcf_cagr: 3 + (absHash % 35),
    roic: 5 + (absHash % 25),
    gross_margin: 20 + (absHash % 60),
    operating_margin: 5 + (absHash % 40),
    fcf_conversion: 60 + (absHash % 50),
    beta: parseFloat((0.8 + (absHash % 150) / 100).toFixed(2)),
    rev_growth_vol: 2 + (absHash % 20),
    margin_vol: 1 + (absHash % 15),
    interest_cov: 2 + (absHash % 50),
    trailing_pe: 10 + (absHash % 60),
    forward_pe: 8 + (absHash % 50),
    ev_ebitda: 6 + (absHash % 35),
    fcf_yield: parseFloat((-2 + (absHash % 10)).toFixed(1)),
  };
}

// ---------- tipificacion de tipo y metodo -------------------------------------------
export function determineType(r: RawFeatures, factors: Record<Factor, number | null>): { type: string; valuationMethod: string } {
  const g = factors.growth ?? 0;
  const q = factors.quality ?? 0;
  const s = factors.stability ?? 0;
  
  const isFinancial = r.sector === "Financials" || r.sector === "Financial Services";
  const isUtilityOrRealEstate = ["Utilities", "Real Estate"].includes(r.sector || "");
  const commodityExposure = ["Energy", "Basic Materials", "Materials"].includes(r.sector || "");
  
  const negativeFcf = r.negativeFcf ?? false;
  const heavyDilution = r.shareDilution3y != null && r.shareDilution3y > 5;
  const revenueDecline = r.revenueDecline ?? false;
  const capexRatio = r.capexRatio ?? 0;
  const revenueCagr3y = r.revenue_cagr ?? 0;
  const earningsVolatility = r.earningsVolatility ?? 0;

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
  if (g >= 75 && !negativeFcf) 
    return { type: "Hypergrowth", valuationMethod: "DCF + PEG + Revenue Multiple" };
  
  if (g >= 50 && q >= 50 && !negativeFcf) 
    return { type: "Growth Compounder", valuationMethod: "DCF + PEG" };

  // Top Tier Quality / Stalwarts
  if (q >= 60 && s >= 60 && !negativeFcf) 
    return { type: "Mature Compounder", valuationMethod: "DCF + Dividend Discount" };
  
  if (g >= 40 && q >= 40 && !negativeFcf) 
    return { type: "Growth Compounder", valuationMethod: "DCF + PEG" };
  
  if (s >= 50 && !negativeFcf) 
    return { type: "Mature Compounder", valuationMethod: "DCF + Dividend Discount" };

  // Secondary Cyclical check (Volatile earnings but not top tier compounders)
  if (earningsVolatility > 0.35) 
    return { type: "Cyclical", valuationMethod: "Normalized Earnings + EV/EBITDA" };
    
  if (negativeFcf) 
    return { type: "Speculative", valuationMethod: "Revenue Multiple + Scenario Analysis" };
    
  if (g >= 30)
    return { type: "Growth Compounder", valuationMethod: "DCF + PEG" };
    
  return { type: "Mature Compounder", valuationMethod: "DCF + Dividend Discount" };
}
