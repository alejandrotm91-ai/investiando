// Métricas del score de salud (Growth / Quality / Stability / Valuation), con la misma definición en
// el servidor (empresas de referencia de cada sector, /api/scores/benchmarks) y en el navegador (una
// empresa que aún no está en la referencia). Puro: sin dependencias ni red.
//
// Datos: estados de la SEC (ejercicios y trimestres, del más reciente al más antiguo o en cualquier
// orden) y datos de mercado (precio, capitalización, PER, beta). Lo que no se puede calcular queda
// en null: nunca se rellena con valores inventados.

export type ScoreMetric =
  | "revenue_cagr" | "eps_cagr" | "fcf_cagr"
  | "roic" | "gross_margin" | "operating_margin" | "fcf_conversion"
  | "beta" | "rev_growth_vol" | "margin_vol" | "interest_cov"
  | "trailing_pe" | "forward_pe" | "ev_ebitda" | "fcf_yield";

export interface ScoreMarket {
  price?: number | null;
  marketCap?: number | null;
  trailingPE?: number | null;
  forwardPE?: number | null;
  beta?: number | null;
  /** Sector (cualquier nombre que entienda gicsSector): en Financials sin beneficio operativo se usan ROE y margen antes de impuestos. */
  sector?: string | null;
}

export interface ScoreFlags {
  negativeFcf?: boolean;
  positiveFcf?: boolean;
  capexRatio?: number;
  shareDilution3y?: number;
  revenueDecline?: boolean;
  marginsImproving?: boolean;
  earningsVolatility?: number;
  epsRevisionPositive?: boolean;
}

const num = (v: any): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const DAY = 86400000;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const med = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const std = (a: number[]) => {
  const mean = a.reduce((x, y) => x + y, 0) / a.length;
  return Math.sqrt(a.reduce((x, y) => x + (y - mean) ** 2, 0) / a.length);
};

/** Ejercicios ordenados del más antiguo al más reciente, con ingresos. */
function annualAsc(rows: any[] | undefined): any[] {
  return (Array.isArray(rows) ? rows : []).filter((r) => r?.date).sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/** Suma de los 4 últimos trimestres seguidos (~1 año entre el primero y el último). */
function ttm(qDesc: any[], key: string): number | null {
  if (qDesc.length < 4) return null;
  const w = qDesc.slice(0, 4);
  const span = (new Date(w[0].date).getTime() - new Date(w[3].date).getTime()) / DAY;
  if (span < 250 || span > 300) return null;
  const vals = w.map((q) => num(q[key]));
  return vals.every((v) => v !== null) ? (vals as number[]).reduce((a, b) => a + b, 0) : null;
}

/**
 * Factores de split por ejercicio a partir de las acciones medias diluidas: un salto ≥ 1,8× (o ≤ 0,55×)
 * entre dos ejercicios es un split (los estados de la SEC no se reexpresan). Devuelve, para cada
 * ejercicio, por cuánto multiplicar sus acciones (y dividir su BPA) para expresarlo en acciones de hoy.
 */
function splitFactors(asc: any[]): number[] {
  const f = asc.map(() => 1);
  for (let i = asc.length - 1; i > 0; i--) {
    const cur = num(asc[i].dilutedAverageShares) ?? num(asc[i].basicAverageShares);
    const prev = num(asc[i - 1].dilutedAverageShares) ?? num(asc[i - 1].basicAverageShares);
    let k = 1;
    if (cur && prev) {
      const r = cur / prev;
      if (r >= 1.8) k = Math.round(r);
      else if (r <= 0.55) k = 1 / Math.round(1 / r);
    }
    for (let j = 0; j < i; j++) f[j] *= k;
  }
  return f;
}

/**
 * CAGR a 3 años. robust: entre la mediana de 3 ejercicios de cada extremo (con ≥ 6), para BPA y flujo
 * libre, que tienen partidas puntuales; si no, entre el último ejercicio y el de 3 años antes.
 */
function cagr3(asc: (number | null)[], robust = true): number | null {
  const v = asc.filter((x): x is number => x !== null);
  if (robust && v.length >= 6) {
    const a = med(v.slice(-6, -3));
    const b = med(v.slice(-3));
    if (a > 0 && b > 0) return (Math.pow(b / a, 1 / 3) - 1) * 100;
    return null;
  }
  if (v.length >= 4) {
    const a = v[v.length - 4];
    const b = v[v.length - 1];
    if (a > 0 && b > 0) return (Math.pow(b / a, 1 / 3) - 1) * 100;
  }
  return null;
}

export function computeScoreMetrics(
  annual: any[] | undefined,
  quarterly: any[] | undefined,
  market: ScoreMarket = {}
): { metrics: Partial<Record<ScoreMetric, number | null>>; flags: ScoreFlags } {
  const asc = annualAsc(annual);
  const qDesc = (Array.isArray(quarterly) ? quarterly : []).filter((q) => q?.date).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const last = asc[asc.length - 1];
  const m: Partial<Record<ScoreMetric, number | null>> = {};
  const flags: ScoreFlags = {};
  if (!last && qDesc.length === 0) return { metrics: m, flags };

  // Cifras de 12 meses (TTM) o, si no hay 4 trimestres, del último ejercicio
  const t = (key: string) => ttm(qDesc, key) ?? num(last?.[key]);
  const bal = (key: string) => num(qDesc[0]?.[key]) ?? num(last?.[key]);
  const rev = t("totalRevenue");
  // Banco o aseguradora sin beneficio operativo: sus intereses son coste de explotación, así que no se
  // reconstruye un EBIT (ROE en lugar de ROIC, margen antes de impuestos, sin cobertura ni EV/EBITDA)
  const finCo = gicsSector(market.sector) === "Financials" && t("operatingIncome") === null && num(last?.operatingIncome) === null;
  // EBIT: beneficio operativo o, si la empresa no publica esa línea (ExxonMobil), antes de impuestos + intereses
  const ebitOf = (oi: number | null, pt: number | null, it: number | null) => oi ?? (finCo || pt === null ? null : pt + Math.abs(it ?? 0));
  const ebit = ebitOf(t("operatingIncome"), t("pretaxIncome"), t("interestExpense"));
  const ni = t("netIncomeCommonStockholders") ?? t("netIncome");
  const fcf = t("freeCashFlow") ?? ((): number | null => {
    const ocf = t("operatingCashFlow");
    const capex = t("capitalExpenditure");
    return ocf !== null && capex !== null ? ocf - Math.abs(capex) : null;
  })();
  const gp = t("grossProfit");
  const ebitda = t("EBITDA") ?? (ebit !== null && t("reconciledDepreciation") !== null ? ebit + (t("reconciledDepreciation") as number) : null);
  const interest = t("interestExpense");
  const tax = t("taxProvision");
  const pretax = t("pretaxIncome");
  const equity = bal("stockholdersEquity");
  const debt = bal("totalDebt") ?? 0;
  const cash = bal("cashAndCashEquivalents") ?? 0;

  // ---- Growth: CAGR a 3 años de ventas, BPA (ajustado por splits) y flujo de caja libre
  const sf = splitFactors(asc);
  // Ventas: entre extremos (rara vez tienen partidas puntuales y la mediana retrasa a quien acelera)
  m.revenue_cagr = cagr3(asc.map((r) => num(r.totalRevenue)), false);
  m.eps_cagr = cagr3(asc.map((r, i) => {
    const e = num(r.dilutedEPS) ?? num(r.basicEPS);
    return e === null ? null : e / sf[i];
  }));
  m.fcf_cagr = cagr3(asc.map((r) => num(r.freeCashFlow)));

  // ---- Quality: ROIC (NOPAT / capital invertido), márgenes y conversión de beneficio en caja
  if (finCo) {
    if (ni !== null && equity !== null && equity > 0) m.roic = clamp((ni / equity) * 100, -100, 200);
    if (pretax !== null && rev) m.operating_margin = (pretax / rev) * 100;
  } else if (ebit !== null && equity !== null) {
    const rate = tax !== null && pretax !== null && pretax > 0 ? clamp(tax / pretax, 0, 0.35) : 0.21;
    const ic = equity + debt - cash;
    if (ic > 0) m.roic = clamp((ebit * (1 - rate)) / ic * 100, -100, 200);
  }
  if (gp !== null && rev) m.gross_margin = (gp / rev) * 100;
  if (!finCo && ebit !== null && rev) m.operating_margin = (ebit / rev) * 100;
  if (fcf !== null && ni !== null && ni > 0) m.fcf_conversion = clamp((fcf / ni) * 100, -200, 300);

  // ---- Stability: beta, volatilidad del crecimiento y del margen operativo, cobertura de intereses
  m.beta = num(market.beta);
  const growths: number[] = [];
  const margins: number[] = [];
  asc.forEach((r, i) => {
    const rv = num(r.totalRevenue);
    const prev = i > 0 ? num(asc[i - 1].totalRevenue) : null;
    if (rv && prev && prev > 0) growths.push((rv / prev - 1) * 100);
    const oi = finCo ? num(r.pretaxIncome) : ebitOf(num(r.operatingIncome), num(r.pretaxIncome), num(r.interestExpense));
    if (rv && rv > 0 && oi !== null) margins.push((oi / rv) * 100);
  });
  if (growths.length >= 3) m.rev_growth_vol = std(growths.slice(-10));
  if (margins.length >= 3) m.margin_vol = std(margins.slice(-10));
  if (!finCo && ebit !== null) {
    // Sin gasto financiero y con beneficio operativo positivo: cobertura máxima
    if (interest === null || interest === 0) m.interest_cov = ebit > 0 ? 100 : null;
    else m.interest_cov = clamp(ebit / Math.abs(interest), -50, 100);
  }

  // ---- Valuation: PER (12 meses y previsto), EV/EBITDA y rentabilidad del flujo de caja libre
  const price = num(market.price);
  const mcap = num(market.marketCap);
  const epsTtm = (() => {
    const e = ttm(qDesc, "dilutedEPS") ?? ttm(qDesc, "basicEPS");
    return e;
  })();
  const tpe = num(market.trailingPE);
  m.trailing_pe = tpe !== null && tpe > 0 ? tpe : price && epsTtm && epsTtm > 0 ? price / epsTtm : null;
  const fpe = num(market.forwardPE);
  m.forward_pe = fpe !== null && fpe > 0 ? fpe : null;
  if (!finCo && mcap && ebitda !== null && ebitda > 0) m.ev_ebitda = (mcap + debt - cash) / ebitda;
  if (mcap && fcf !== null) m.fcf_yield = (fcf / mcap) * 100;

  // ---- Indicadores para el tipo de empresa
  const lastFcf = num(last?.freeCashFlow);
  if (lastFcf !== null) {
    flags.negativeFcf = lastFcf < 0;
    flags.positiveFcf = lastFcf > 0;
  }
  const lastRev = num(last?.totalRevenue);
  const lastCapex = num(last?.capitalExpenditure);
  if (lastRev && lastCapex !== null) flags.capexRatio = (Math.abs(lastCapex) / lastRev) * 100;
  if (asc.length >= 4) {
    const s0 = (num(asc[asc.length - 4].dilutedAverageShares) ?? 0) * sf[asc.length - 4];
    const s1 = num(last.dilutedAverageShares) ?? 0;
    if (s0 > 0 && s1 > 0) flags.shareDilution3y = (Math.pow(s1 / s0, 1 / 3) - 1) * 100;
    const r0 = num(asc[asc.length - 4].totalRevenue);
    if (lastRev && r0) flags.revenueDecline = lastRev < r0;
  }
  if (asc.length >= 3) {
    const nm = (r: any) => {
      const n = num(r.netIncomeCommonStockholders) ?? num(r.netIncome);
      const rv = num(r.totalRevenue);
      return n !== null && rv ? n / rv : null;
    };
    const a = nm(asc[asc.length - 3]);
    const b = nm(last);
    if (a !== null && b !== null) flags.marginsImproving = b > a;
    const ch: number[] = [];
    for (let i = 1; i < asc.length; i++) {
      const c = num(asc[i].netIncomeCommonStockholders) ?? num(asc[i].netIncome);
      const p = num(asc[i - 1].netIncomeCommonStockholders) ?? num(asc[i - 1].netIncome);
      if (c !== null && p !== null && p !== 0) ch.push((c - p) / Math.abs(p));
    }
    if (ch.length) flags.earningsVolatility = std(ch.slice(-10));
  }
  if (tpe !== null && fpe !== null && tpe > 0 && fpe > 0) flags.epsRevisionPositive = fpe < tpe;

  for (const k of Object.keys(m) as ScoreMetric[]) {
    const v = m[k];
    m[k] = v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(2));
  }
  return { metrics: m, flags };
}

/**
 * Sector GICS (los 11 del S&P 500) a partir del nombre de sector o de subindustria. La clasificación de
 * tickers mezcla ambos ("Diversified Banks", "Retail REITs"…): sin esto caían en Tecnología.
 */
export function gicsSector(label: string | null | undefined): string | null {
  if (!label) return null;
  const s = label.trim();
  const l = s.toLowerCase();
  const direct: Record<string, string> = {
    technology: "Technology", "information technology": "Technology", healthcare: "Healthcare", "health care": "Healthcare",
    financials: "Financials", "financial services": "Financials", "consumer discretionary": "Consumer Discretionary",
    "consumer cyclical": "Consumer Discretionary", "consumer staples": "Consumer Staples", "consumer defensive": "Consumer Staples",
    energy: "Energy", utilities: "Utilities", industrials: "Industrials", "real estate": "Real Estate", materials: "Materials",
    "basic materials": "Materials", "communication services": "Communication Services", communications: "Communication Services",
  };
  if (direct[l]) return direct[l];
  if (/reit|real estate/.test(l)) return "Real Estate";
  if (/utilit|independent power|renewable electricity/.test(l)) return "Utilities";
  if (/health|pharma|biotech|life sciences/.test(l)) return "Healthcare";
  if (/bank|insurance|reinsurance|asset management|capital markets|investment banking|brokerage|consumer finance|financial exchanges|transaction & payment|multi-sector holdings|mortgage|insurance brokers/.test(l)) return "Financials";
  if (/oil|gas|coal|uranium|energy equipment/.test(l)) return "Energy";
  if (/chemical|gold|copper|steel|aluminum|metals|mining|construction materials|containers|packaging|paper|industrial gases|fertilizers|silver|lithium/.test(l)) return "Materials";
  if (/telecom|wireless|cable|broadcasting|movies|entertainment|interactive media|publishing|advertising/.test(l)) return "Communication Services";
  if (/semiconductor|software|technology hardware|it consulting|communications equipment|electronic|internet services|technology distributors|consumer electronics/.test(l)) return "Technology";
  if (/food|beverage|soft drinks|brewers|distillers|tobacco|household products|personal care|staples|agricultural products/.test(l)) return "Consumer Staples";
  if (/retail|hotel|resort|cruise|restaurant|casino|gaming|leisure|homebuilding|automobile|automotive|auto parts|apparel|footwear|luxury|specialized consumer|distributors|home furnish|homefurnishing/.test(l)) return "Consumer Discretionary";
  if (/aerospace|defense|machinery|building products|construction & engineering|electrical|conglomerate|air freight|rail|cargo|trucking|airline|passenger|environmental|support services|research & consulting|human resource|trading companies|transportation|data processing|outsourced|logistics/.test(l)) return "Industrials";
  return null;
}
