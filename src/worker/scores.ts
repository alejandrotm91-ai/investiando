import { Hono } from "hono";
import { env as cfEnv } from "cloudflare:workers";
import type { AppEnv } from "./env";
import { getYahoo } from "./yahoo";
import { rememberPayload, recallPayload } from "./quoteCache";
import { computeScoreMetrics, gicsSector, type ScoreMarket } from "../utils/scoreMetrics";
import { setScoreBenchmarks, type BenchmarkRow } from "../utils/scoreBenchmarks";
import { TICKER_CLASSIFICATION } from "../data/tickerClassification";

// Referencia del score de salud: las 15 métricas (scoreMetrics.ts) de todas las empresas con estados de
// la SEC en D1, con precio, capitalización y PER de Yahoo y beta de 5 años de rentabilidades mensuales
// frente al SPY. El navegador compara cada empresa con las de su sector (engine.ts).

const TTL = 6 * 60 * 60 * 1000;
const KEY = "SCOREBENCH";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const SKIP = new Set(["GOOG", "BRK-A"]); // misma empresa que GOOGL / BRK-B

// Solo los campos que usan las métricas (D1 hace el trabajo: no se analizan los JSON completos aquí)
const FIELDS = [
  "date", "totalRevenue", "grossProfit", "operatingIncome", "netIncome", "netIncomeCommonStockholders", "dilutedEPS", "basicEPS",
  "freeCashFlow", "operatingCashFlow", "capitalExpenditure", "EBITDA", "reconciledDepreciation", "interestExpense", "taxProvision",
  "pretaxIncome", "stockholdersEquity", "totalDebt", "cashAndCashEquivalents", "dilutedAverageShares", "basicAverageShares",
];
const obj = FIELDS.map((f) => `'${f}', json_extract(value, '$.${f}')`).join(", ");
const SQL = `SELECT ticker,
  (SELECT json_group_array(json_object(${obj})) FROM json_each(annual)) AS a,
  (SELECT json_group_array(json_object(${obj})) FROM json_each(quarterly) WHERE CAST(key AS INTEGER) < 8) AS q
  FROM sec_companies WHERE quarterly IS NOT NULL AND annual IS NOT NULL`;

let cache: { rows: BenchmarkRow[]; asOf: string; at: number } | null = null;
let inflight: Promise<void> | null = null;

/** Beta de cada ticker con 5 años de rentabilidades mensuales frente al SPY, como Yahoo (endpoint spark, 20 por llamada). */
async function betas(tickers: string[]): Promise<Record<string, number>> {
  const series: Record<string, Map<number, number>> = {};
  const all = ["SPY", ...tickers];
  const chunks: string[][] = [];
  for (let i = 0; i < all.length; i += 20) chunks.push(all.slice(i, i + 20));
  await Promise.all(
    chunks.map(async (c) => {
      try {
        const r = await fetch(`https://query1.finance.yahoo.com/v7/finance/spark?symbols=${encodeURIComponent(c.join(","))}&range=5y&interval=1mo`, { headers: { "User-Agent": UA } });
        if (!r.ok) return;
        const j: any = await r.json();
        for (const res of j?.spark?.result ?? []) {
          const resp = res?.response?.[0];
          const ts: number[] = resp?.timestamp ?? [];
          const cl: (number | null)[] = resp?.indicators?.quote?.[0]?.close ?? [];
          const m = new Map<number, number>();
          ts.forEach((t, i) => {
            const v = cl[i];
            if (typeof v !== "number" || !(v > 0)) return;
            const d = new Date(t * 1000);
            m.set(d.getUTCFullYear() * 12 + d.getUTCMonth(), v); // mes (el último punto, del mes en curso, manda)
          });
          series[String(res.symbol).toUpperCase()] = m;
        }
      } catch {
        // ese grupo queda sin beta
      }
    })
  );
  const spy = series.SPY;
  const out: Record<string, number> = {};
  if (!spy) return out;
  const rets = (m: Map<number, number>) => {
    const r = new Map<number, number>();
    for (const [w, v] of m) {
      const p = m.get(w - 1);
      if (p) r.set(w, v / p - 1);
    }
    return r;
  };
  const mr = rets(spy);
  for (const t of tickers) {
    const s = series[t];
    if (!s) continue;
    const sr = rets(s);
    const pairs: [number, number][] = [];
    for (const [w, x] of sr) {
      const y = mr.get(w);
      if (y !== undefined) pairs.push([x, y]);
    }
    if (pairs.length < 36) continue;
    const mx = pairs.reduce((a, p) => a + p[0], 0) / pairs.length;
    const my = pairs.reduce((a, p) => a + p[1], 0) / pairs.length;
    let cov = 0;
    let vm = 0;
    for (const [x, y] of pairs) {
      cov += (x - mx) * (y - my);
      vm += (y - my) ** 2;
    }
    if (vm > 0) out[t] = Number((cov / vm).toFixed(2));
  }
  return out;
}

async function build(db: D1Database): Promise<void> {
  const res = await db.prepare(SQL).all<{ ticker: string; a: string; q: string }>();
  const comp = (res.results ?? []).filter((r) => !SKIP.has(r.ticker));
  const tickers = comp.map((r) => r.ticker);

  // Precio, capitalización y PER (Yahoo, grupos de 100)
  const quotes: Record<string, any> = {};
  const yf = getYahoo();
  await Promise.all(
    Array.from({ length: Math.ceil(tickers.length / 100) }, (_, i) => tickers.slice(i * 100, i * 100 + 100)).map(async (chunk) => {
      try {
        const r: any = await Promise.race([yf.quote(chunk, {}, { validateResult: false }), new Promise((ok) => setTimeout(() => ok(null), 9000))]);
        for (const q of Array.isArray(r) ? r : []) if (q?.symbol) quotes[String(q.symbol).toUpperCase()] = q;
      } catch {
        // sin cotización: quedan sin las métricas de valoración
      }
    })
  );
  const beta = await betas(tickers);

  const rows: BenchmarkRow[] = comp.map((r) => {
    const q = quotes[r.ticker];
    const cls = TICKER_CLASSIFICATION[r.ticker] || TICKER_CLASSIFICATION[r.ticker.replace("-", ".")];
    const market: ScoreMarket = {
      sector: cls?.sector ?? null,
      price: q?.regularMarketPrice ?? null,
      marketCap: q?.marketCap ?? null,
      trailingPE: q?.trailingPE ?? null,
      forwardPE: q?.forwardPE ?? null,
      beta: beta[r.ticker] ?? null,
    };
    const { metrics, flags } = computeScoreMetrics(JSON.parse(r.a || "[]"), JSON.parse(r.q || "[]"), market);
    const divYield = typeof q?.trailingAnnualDividendYield === "number" ? Number((q.trailingAnnualDividendYield * 100).toFixed(2)) : null;
    return {
      symbol: r.ticker,
      sector: gicsSector(cls?.sector) ?? null,
      metrics,
      flags,
      quote: { name: q?.longName || q?.shortName || null, price: q?.regularMarketPrice ?? null, marketCap: q?.marketCap ?? null, divYield },
    };
  });
  const asOf = new Date().toISOString();
  cache = { rows, asOf, at: Date.now() };
  setScoreBenchmarks(rows, asOf);
  // Solo se guarda si la mayoría tiene cotización (si Yahoo falla, se sigue sirviendo lo guardado)
  if (Object.keys(quotes).length > tickers.length / 2) await rememberPayload(KEY, { rows, asOf }, 60 * 60 * 1000).catch(() => {});
}

function refreshOnce(db: D1Database) {
  if (!inflight) inflight = build(db).catch((e) => console.error("score benchmarks", e)).finally(() => (inflight = null));
  return inflight;
}

/** Deja la referencia cargada en el servidor (para los scores de superinversores, por ejemplo). */
export async function ensureServerScoreBenchmarks(waitUntil?: (p: Promise<unknown>) => void): Promise<void> {
  const db = (cfEnv as any)?.DB as D1Database | undefined;
  if (!db) return;
  if (!cache) {
    const saved = await recallPayload<{ rows: BenchmarkRow[]; asOf: string }>(KEY);
    if (saved?.data?.rows?.length) {
      cache = { rows: saved.data.rows, asOf: saved.data.asOf, at: 0 };
      setScoreBenchmarks(cache.rows, cache.asOf);
      const p = refreshOnce(db);
      if (waitUntil) waitUntil(p);
    } else {
      await refreshOnce(db);
    }
  } else if (Date.now() - cache.at > TTL) {
    const p = refreshOnce(db);
    if (waitUntil) waitUntil(p);
  }
}

/** Filas de la referencia con cotización (el generador de carteras las necesita); si las guardadas son
 *  de antes de incluir la cotización, espera a recalcularlas. */
export async function getServerBenchmarkRows(waitUntil?: (p: Promise<unknown>) => void): Promise<BenchmarkRow[]> {
  await ensureServerScoreBenchmarks(waitUntil);
  const db = (cfEnv as any)?.DB as D1Database | undefined;
  if (db && cache && !cache.rows.some((r) => r.quote?.price)) await refreshOnce(db);
  return cache?.rows ?? [];
}

export const scoreRoutes = new Hono<AppEnv>();

scoreRoutes.get("/benchmarks", async (c) => {
  await ensureServerScoreBenchmarks((p) => c.executionCtx.waitUntil(p));
  c.header("Cache-Control", "public, max-age=600");
  return c.json(cache ? { asOf: cache.asOf, rows: cache.rows } : { asOf: null, rows: [] });
});
