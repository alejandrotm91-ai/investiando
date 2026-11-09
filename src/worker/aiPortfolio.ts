import { getServerBenchmarkRows } from "./scores";
import { generateContent } from "./llm";
import { getYahoo } from "./yahoo";
import type { BenchmarkRow } from "../utils/scoreBenchmarks";

// Generador de carteras (POST /api/portfolio/generate-ai, "Crear portafolio con IA").
//
// 1. Universo: empresas de la referencia del score (estados de la SEC en D1 + cotización de Yahoo).
//    Reglas: capitalización > 20.000 M$ y BPA diluido con CAGR a 3 años > 15 % (> 0 % si la única
//    estrategia es Hypergrowth), el mismo CAGR robusto que el score de salud.
// 2. Cada estrategia ordena a los candidatos con sus métricas (percentil dentro del universo).
// 3. Claude elige las posiciones y los pesos entre los mejores candidatos, con sus cifras reales. Lo
//    que no esté en la lista se descarta y, si faltan posiciones, se completan con las siguientes del
//    ranking.
// 4. Sin IA (sin saldo o error), la cartera sale del ranking cuantitativo y la respuesta lo indica
//    (aiUsed = false). Siempre con el número de posiciones pedido si hay candidatos suficientes.

type Metric = keyof NonNullable<BenchmarkRow["metrics"]> | "div_yield";
type Spec = { titleEN: string; titleES: string; descEN: string; descES: string; rank: Array<[Metric, number, "up" | "down"]>; require?: (r: BenchmarkRow) => boolean };

const STRATEGIES: Record<string, Spec> = {
  balanced: {
    titleEN: "Balanced All-Weather Core Portfolio",
    titleES: "Portafolio Equilibrado Todo-Terreno",
    descEN: "Multi-sector allocation balancing growth, quality, stability and valuation (Diluted EPS CAGR > 15%).",
    descES: "Diversificación multisectorial equilibrando crecimiento, calidad, estabilidad y valoración (CAGR BPA diluido > 15 %).",
    rank: [["eps_cagr", 0.2, "up"], ["revenue_cagr", 0.1, "up"], ["roic", 0.2, "up"], ["operating_margin", 0.1, "up"], ["beta", 0.1, "down"], ["rev_growth_vol", 0.1, "down"], ["forward_pe", 0.1, "down"], ["fcf_yield", 0.1, "up"]],
  },
  compounders: {
    titleEN: "High-Quality Compounders & Wide Moats",
    titleES: "Compounders de Alta Calidad & Fosos Defensivos",
    descEN: "Market leaders with high ROIC, durable margins and Diluted EPS CAGR > 15%.",
    descES: "Líderes con ROIC alto, márgenes duraderos y CAGR de BPA diluido superior al 15 %.",
    rank: [["roic", 0.35, "up"], ["operating_margin", 0.2, "up"], ["gross_margin", 0.1, "up"], ["eps_cagr", 0.2, "up"], ["fcf_conversion", 0.15, "up"]],
  },
  hypergrowth: {
    titleEN: "Hyper-Growth & AI Leaders (> $20B Large-Cap)",
    titleES: "Hipercrecimiento & Líderes de IA (> $20B Large-Cap)",
    descEN: "Fastest-growing large caps by revenue and earnings (exempt from the 15% EPS CAGR threshold; EPS growth must be positive).",
    descES: "Las grandes empresas que más crecen en ventas y beneficios (exento del umbral del 15 %; el BPA debe crecer).",
    rank: [["revenue_cagr", 0.5, "up"], ["eps_cagr", 0.3, "up"], ["gross_margin", 0.2, "up"]],
  },
  garp: {
    titleEN: "Growth at a Reasonable Price (GARP)",
    titleES: "Crecimiento a Precio Razonable (GARP)",
    descEN: "Double-digit earnings growth (Diluted EPS CAGR > 15%) at moderate valuation multiples.",
    descES: "Crecimiento de beneficios superior al 15 % (CAGR BPA diluido) con múltiplos moderados.",
    rank: [["eps_cagr", 0.35, "up"], ["forward_pe", 0.35, "down"], ["roic", 0.15, "up"], ["revenue_cagr", 0.15, "up"]],
  },
  buffett: {
    titleEN: "Buffett Style - Wonderful Companies @ Fair Price",
    titleES: "Estilo Buffett - Negocios Extraordinarios a Precio Justo",
    descEN: "High returns on capital, strong free cash flow, stable margins and fair prices (Diluted EPS CAGR > 15%).",
    descES: "Alto retorno sobre el capital, flujo de caja libre, márgenes estables y precio justo (CAGR BPA diluido > 15 %).",
    rank: [["roic", 0.3, "up"], ["fcf_yield", 0.2, "up"], ["margin_vol", 0.15, "down"], ["interest_cov", 0.1, "up"], ["forward_pe", 0.15, "down"], ["beta", 0.1, "down"]],
  },
  dividends: {
    titleEN: "Dividend Growth & Defensive Champions",
    titleES: "Dividendos Crecientes & Campeones Defensivos",
    descEN: "Dividend payers with growing earnings (Diluted EPS CAGR > 15%), low volatility and covered payouts.",
    descES: "Empresas con dividendo, beneficios crecientes (CAGR BPA diluido > 15 %), baja volatilidad y pago cubierto.",
    rank: [["div_yield", 0.35, "up"], ["eps_cagr", 0.2, "up"], ["beta", 0.15, "down"], ["fcf_conversion", 0.15, "up"], ["interest_cov", 0.15, "up"]],
    // Solo empresas que pagan dividendo
    require: (r) => (r.quote?.divYield ?? 0) > 0,
  },
  deepvalue: {
    titleEN: "Deep Value & High Cash Flow Yield",
    titleES: "Valor Profundo & Rendimiento de Flujo de Caja",
    descEN: "Large caps at the cheapest multiples and highest free-cash-flow yields (Diluted EPS CAGR > 15%).",
    descES: "Grandes empresas con los múltiplos más bajos y mayor rentabilidad por flujo libre (CAGR BPA diluido > 15 %).",
    rank: [["fcf_yield", 0.3, "up"], ["forward_pe", 0.25, "down"], ["ev_ebitda", 0.25, "down"], ["trailing_pe", 0.2, "down"]],
  },
};

const MIN_CAP = 20e9;

const val = (r: BenchmarkRow, m: Metric): number | null => {
  const v = m === "div_yield" ? r.quote?.divYield ?? 0 : (r.metrics as any)?.[m];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};

/** Puntuación 0-100 de cada empresa para las estrategias elegidas (media de percentiles ponderada). */
function rankScores(rows: BenchmarkRow[], keys: string[]): Map<string, number> {
  const pct = new Map<Metric, Map<string, number>>();
  const metrics = new Set<Metric>(keys.flatMap((k) => STRATEGIES[k].rank.map(([m]) => m)));
  for (const m of metrics) {
    const vals = rows.map((r) => ({ s: r.symbol, v: val(r, m) })).filter((x) => x.v !== null) as { s: string; v: number }[];
    vals.sort((a, b) => a.v - b.v);
    const map = new Map<string, number>();
    vals.forEach((x, i) => map.set(x.s, vals.length > 1 ? (i / (vals.length - 1)) * 100 : 50));
    pct.set(m, map);
  }
  const out = new Map<string, number>();
  for (const r of rows) {
    let total = 0;
    for (const k of keys) {
      let num = 0;
      let den = 0;
      for (const [m, w, dir] of STRATEGIES[k].rank) {
        const p = pct.get(m)?.get(r.symbol);
        if (p === undefined) continue;
        num += (dir === "up" ? p : 100 - p) * w;
        den += w;
      }
      total += den ? num / den : 0;
    }
    out.set(r.symbol, total / keys.length);
  }
  return out;
}

/** Pesos entre min y 25 % que suman 100. */
function capWeights(raw: number[]): number[] {
  const n = raw.length;
  const lo = Math.min(5, 100 / n);
  let w = raw.map((x) => Math.max(x, 0.01));
  for (let k = 0; k < 6; k++) {
    const s = w.reduce((a, b) => a + b, 0);
    w = w.map((x) => Math.min(25, Math.max(lo, (x / s) * 100)));
  }
  const s = w.reduce((a, b) => a + b, 0);
  return w.map((x) => (x / s) * 100);
}

const fmt = (v: number | null | undefined, d = 1) => (typeof v === "number" ? v.toFixed(d) : "n/d");

function metricLine(r: BenchmarkRow, isES: boolean): string {
  const m = r.metrics as any;
  const parts = [
    `${isES ? "BPA" : "EPS"} ${m.eps_cagr >= 0 ? "+" : ""}${fmt(m.eps_cagr)}%/${isES ? "año" : "yr"}`,
    m.roic != null ? `ROIC ${fmt(m.roic, 0)}%` : null,
    m.forward_pe != null ? `${isES ? "PER previsto" : "fwd P/E"} ${fmt(m.forward_pe)}×` : null,
    m.fcf_yield != null ? `FCF yield ${fmt(m.fcf_yield)}%` : null,
    r.quote?.divYield ? `${isES ? "dividendo" : "dividend"} ${fmt(r.quote.divYield, 2)}%` : null,
  ].filter(Boolean);
  return parts.join(", ");
}

export interface AiPortfolioRequest {
  amount?: number;
  strategyType?: string;
  strategyTypes?: string[];
  holdingsCount?: number;
  customNotes?: string;
  language?: string;
}

export async function generateAiPortfolio(body: AiPortfolioRequest, waitUntil?: (p: Promise<unknown>) => void) {
  const language = body.language === "EN" ? "EN" : "ES";
  const isES = language === "ES";
  const numAmount = Math.max(1000, Number(body.amount) || 50000);
  const numHoldings = Math.min(15, Math.max(4, Number(body.holdingsCount) || 8));
  const customNotes = String(body.customNotes || "").slice(0, 600);

  let keys = (Array.isArray(body.strategyTypes) && body.strategyTypes.length ? body.strategyTypes : String(body.strategyType || "").split(","))
    .map((s) => String(s).trim())
    .filter((k) => STRATEGIES[k]);
  if (!keys.length) keys = ["balanced"];
  const hyperOnly = keys.length === 1 && keys[0] === "hypergrowth";
  const minEps = hyperOnly ? 0 : 15;

  const specs = keys.map((k) => STRATEGIES[k]);
  const title = specs.length === 1 ? (isES ? specs[0].titleES : specs[0].titleEN) : specs.map((s) => (isES ? s.titleES : s.titleEN)).join(" & ");
  const desc = specs.map((s) => (isES ? s.descES : s.descEN)).join(" ");

  // Universo y ranking
  const rows = (await getServerBenchmarkRows(waitUntil)).filter(
    (r) => (r.quote?.marketCap ?? 0) > MIN_CAP && (r.quote?.price ?? 0) > 0 && specs.every((s) => !s.require || s.require(r))
  );
  const scores = rankScores(rows, keys);
  const byScore = (a: BenchmarkRow, b: BenchmarkRow) => (scores.get(b.symbol) ?? 0) - (scores.get(a.symbol) ?? 0);
  const strict = rows.filter((r) => (r.metrics.eps_cagr ?? -Infinity) > minEps).sort(byScore);
  // Si no hay suficientes que cumplan la regla, se completan con BPA creciente (> 0 %) y se avisa
  const relaxedPool = rows.filter((r) => !strict.includes(r) && (r.metrics.eps_cagr ?? -Infinity) > 0).sort(byScore);
  const pool = [...strict, ...relaxedPool];
  if (!pool.length) throw new Error(isES ? "No hay datos de mercado disponibles para construir la cartera." : "No market data available to build the portfolio.");
  const bySymbol = new Map(pool.map((r) => [r.symbol, r]));

  // Candidatos para la IA: los mejores del ranking (con margen para que elija y diversifique)
  const shortlist = pool.slice(0, Math.max(numHoldings * 2 + 6, 30));

  let picks: { symbol: string; weight: number; rationale: string; archetype?: string }[] = [];
  let summary = "";
  let aiUsed = false;
  let aiError: string | null = null;
  try {
    const table = shortlist
      .map((r) => {
        const m = r.metrics as any;
        return [r.symbol, r.quote?.name ?? r.symbol, r.sector ?? "?", `${fmt((r.quote?.marketCap ?? 0) / 1e9, 0)}B`, fmt(m.eps_cagr), fmt(m.revenue_cagr), fmt(m.roic), fmt(m.operating_margin), fmt(m.forward_pe), fmt(m.fcf_yield), fmt(r.quote?.divYield, 2), fmt(m.beta, 2), fmt(scores.get(r.symbol), 0)].join(" | ");
      })
      .join("\n");
    const prompt = `You are the CIO of an institutional asset manager. Build a ${numHoldings}-stock portfolio for a client investing $${numAmount.toLocaleString("en-US")}.

Strategy: ${title}
Directives: ${desc}
Client preference: ${customNotes || "none"}

CANDIDATES (real data: SEC filings + market quotes). You MUST choose ONLY from this list, exactly ${numHoldings} different tickers. The list is ordered by our quantitative strategy score (last column, 0-100); you may deviate from the order for diversification or the client preference, but never pick a ticker that is not listed. If the client preference names companies not listed, ignore those names.
Columns: ticker | name | sector | market cap | diluted EPS CAGR 3y % | revenue CAGR 3y % | ROIC % | operating margin % | forward P/E | FCF yield % | dividend yield % | beta 5y | strategy score
${table}

Rules: weights between 5 and 25 (percent), summing to 100; avoid putting more than about 35% in one sector unless the strategy requires it; each rationale is one sentence in ${isES ? "Spanish" : "English"} that cites the real figures above (do not invent numbers).

Respond with JSON only:
{"strategySummary": "2 sentences in ${isES ? "Spanish" : "English"} on the portfolio and its risk/reward", "holdings": [{"ticker": "XXX", "weight": 10, "archetype": "short label", "rationale": "..."}]}`;
    const ai = await generateContent({ contents: prompt, config: { temperature: 0.4, responseMimeType: "application/json" }, effort: "low" });
    const parsed = JSON.parse(String(ai.text || "").trim());
    const seen = new Set<string>();
    for (const h of Array.isArray(parsed?.holdings) ? parsed.holdings : []) {
      const t = String(h?.ticker || "").toUpperCase().trim().replace(".", "-");
      if (!bySymbol.has(t) || seen.has(t)) continue; // fuera de la lista o repetido: se descarta
      seen.add(t);
      picks.push({ symbol: t, weight: Number(h.weight) || 0, rationale: String(h.rationale || ""), archetype: h.archetype ? String(h.archetype) : undefined });
      if (picks.length >= numHoldings) break;
    }
    if (picks.length) {
      aiUsed = true;
      summary = String(parsed?.strategySummary || "");
    }
  } catch (e: any) {
    aiError = String(e?.message || e);
    console.warn("[Portfolio AI] Claude no disponible, cartera cuantitativa:", aiError.slice(0, 300));
    picks = [];
  }

  // Completar con el ranking (o construir entera sin IA), con un tope por sector
  if (picks.length < numHoldings) {
    const sectorCap = Math.max(2, Math.ceil(numHoldings * 0.35));
    const perSector = new Map<string, number>();
    picks.forEach((p) => {
      const s = bySymbol.get(p.symbol)?.sector ?? "?";
      perSector.set(s, (perSector.get(s) ?? 0) + 1);
    });
    const fill = (respectCap: boolean) => {
      for (const r of pool) {
        if (picks.length >= numHoldings) return;
        if (picks.some((p) => p.symbol === r.symbol)) continue;
        const s = r.sector ?? "?";
        if (respectCap && (perSector.get(s) ?? 0) >= sectorCap) continue;
        perSector.set(s, (perSector.get(s) ?? 0) + 1);
        picks.push({ symbol: r.symbol, weight: 0, rationale: "" });
      }
    };
    fill(true);
    fill(false);
  }

  // Pesos: los de la IA; los añadidos, con la mediana de los de la IA o según su puntuación
  const aiWeights = picks.map((p) => p.weight).filter((w) => w > 0).sort((a, b) => a - b);
  const medW = aiWeights.length ? aiWeights[Math.floor(aiWeights.length / 2)] : 0;
  const weights = capWeights(picks.map((p) => (p.weight > 0 ? p.weight : medW || 40 + (scores.get(p.symbol) ?? 0))));

  // Precio actual (una sola consulta a Yahoo; si falla, el de la referencia, también de Yahoo)
  const live: Record<string, any> = {};
  try {
    const r: any = await Promise.race([getYahoo().quote(picks.map((p) => p.symbol), {}, { validateResult: false }), new Promise((ok) => setTimeout(() => ok(null), 8000))]);
    for (const q of Array.isArray(r) ? r : []) if (q?.symbol) live[String(q.symbol).toUpperCase()] = q;
  } catch {
    // se usa el precio de la referencia
  }

  let allocated = 0;
  const holdings = picks.map((p, i) => {
    const r = bySymbol.get(p.symbol)!;
    const q = live[p.symbol];
    const price = Number(q?.regularMarketPrice) > 0 ? Number(q.regularMarketPrice) : Number(r.quote?.price);
    const marketCap = Number(q?.marketCap) > 0 ? Number(q.marketCap) : Number(r.quote?.marketCap);
    const weight = weights[i];
    const target = (weight / 100) * numAmount;
    let shares = Math.max(1, Math.round(target / price));
    if (price > target && numAmount < 50000) shares = Number((target / price).toFixed(2));
    const mktValue = Math.round(shares * price * 100) / 100;
    allocated += mktValue;
    const m = r.metrics as any;
    const relaxed = (m.eps_cagr ?? -Infinity) <= minEps;
    return {
      ticker: p.symbol,
      name: q?.longName || q?.shortName || r.quote?.name || p.symbol,
      shares,
      avgCost: Math.round(price * 100) / 100,
      currentPrice: Math.round(price * 100) / 100,
      mktValue,
      weight,
      sector: r.sector ?? "Large Cap",
      marketCap,
      marketCapFormatted: marketCap >= 1e12 ? `$${(marketCap / 1e12).toFixed(2)}T` : `$${(marketCap / 1e9).toFixed(1)}B`,
      pe: typeof m.trailing_pe === "number" ? m.trailing_pe : null,
      dividendYield: r.quote?.divYield ?? null,
      dilutedEpsCagr: typeof m.eps_cagr === "number" ? Number(m.eps_cagr.toFixed(1)) : null,
      isDilutedEpsCagrPositive: (m.eps_cagr ?? 0) > 0,
      relaxedEpsRule: relaxed,
      rationale: p.rationale || `${isES ? "Seleccionada por el ranking de la estrategia" : "Selected by the strategy ranking"}: ${metricLine(r, isES)}.`,
      archetype: p.archetype || (isES ? specs[0].titleES.split(" ")[0] : specs[0].titleEN.split(" ")[0]),
      strategyScore: Math.round(scores.get(p.symbol) ?? 0),
    };
  });

  const relaxedCount = holdings.filter((h) => h.relaxedEpsRule).length;
  const sectorWeights: Record<string, number> = {};
  let peSum = 0;
  let peW = 0;
  let divSum = 0;
  holdings.forEach((h) => {
    sectorWeights[h.sector] = (sectorWeights[h.sector] || 0) + h.weight;
    if (h.pe && h.pe > 0 && h.pe < 150) {
      peSum += h.pe * h.weight;
      peW += h.weight;
    }
    if (h.dividendYield) divSum += (h.dividendYield * h.weight) / 100;
  });

  const notices: string[] = [];
  if (!aiUsed) {
    notices.push(
      isES
        ? "La IA no está disponible en este momento: la cartera sale del ranking cuantitativo de la estrategia con datos de la SEC y precios de mercado."
        : "AI is unavailable right now: the portfolio comes from the strategy's quantitative ranking using SEC data and market prices."
    );
  }
  if (relaxedCount) {
    notices.push(
      isES
        ? `${relaxedCount} posición(es) no llegan al ${minEps} % de CAGR del BPA: no había suficientes empresas que lo cumplan; tienen BPA creciente.`
        : `${relaxedCount} holding(s) are below the ${minEps}% EPS CAGR rule: not enough companies qualified; they still have growing EPS.`
    );
  }

  return {
    success: true,
    strategyTitle: title,
    strategyDescription: desc,
    totalTargetAmount: numAmount,
    totalAllocatedAmount: Math.round(allocated * 100) / 100,
    cashRemaining: Math.max(0, Math.round((numAmount - allocated) * 100) / 100),
    isHypergrowthExempt: hyperOnly,
    epsCagrFilterApplied: !hyperOnly,
    dilutedEpsCagrPositiveVerified: holdings.every((h) => h.isDilutedEpsCagrPositive),
    aiUsed,
    notice: notices.join(" ") || null,
    universeSize: rows.length,
    qualifiedCount: strict.length,
    holdings,
    summaryMetrics: {
      weightedPe: peW > 0 ? Math.round((peSum / peW) * 10) / 10 : null,
      weightedDivYield: Math.round(divSum * 100) / 100,
      sectorWeights,
      topHolding: holdings[0]?.ticker ?? null,
    },
    aiRationale: summary || desc,
  };
}
