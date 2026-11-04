import { Hono } from "hono";
import type { AppEnv } from "../env";
import { requireAdmin } from "../admin/routes";
import { getSecFinancials, runSecCron, syncCompany } from "./sync";
import { SEC_UNIVERSE, SEC_UNIVERSE_AS_OF } from "./universe";
import { getSegments, syncSegments } from "./segmentSync";

// /api/sec/*: estados financieros oficiales (10-K/10-Q) normalizados.
export const secRoutes = new Hono<AppEnv>();

secRoutes.get("/financials/:ticker", async (c) => {
  const f = await getSecFinancials(c.env.DB, c.req.param("ticker"), { syncIfMissing: true, ua: c.env.SEC_USER_AGENT });
  if (!f) return c.json({ error: "Sin 10-K/10-Q en la SEC para este ticker." }, 404);
  return c.json(f);
});

// Capa 2: ingresos por segmento, producto y geografía
secRoutes.get("/segments/:ticker", async (c) => {
  const d = await getSegments(c.env.DB, c.req.param("ticker"), c.env.SEC_USER_AGENT);
  if (!d || Object.keys(d.axes).length === 0) return c.json({ error: "Sin desglose por segmentos en la SEC para este ticker." }, 404);
  return c.json(d);
});

// Estado de la carga: qué empresas tienen datos y de qué informe.
secRoutes.get("/status", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT c.ticker, c.name, c.in_universe, c.last_filed, c.last_form, c.last_period, c.synced_at, c.error,
            json_array_length(c.annual) AS years, json_array_length(c.quarterly) AS quarters,
            CASE WHEN s.data IS NOT NULL THEN (SELECT group_concat(key) FROM json_each(s.data, '$.axes')) END AS segment_axes,
            s.error AS segment_error
     FROM sec_companies c LEFT JOIN sec_segments s ON s.ticker = c.ticker
     ORDER BY c.in_universe DESC, c.ticker`
  ).all();
  const loaded = results.filter((r: any) => r.years || r.quarters).length;
  const withSegments = results.filter((r: any) => r.segment_axes).length;
  return c.json({ universe: SEC_UNIVERSE.length, universeAsOf: SEC_UNIVERSE_AS_OF, loaded, withSegments, companies: results });
});

// Sincronización manual (solo admin): {tickers: [...]} o {cron: true, max}
secRoutes.post("/sync", requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}) as any);
  const ua = c.env.SEC_USER_AGENT;
  if (Array.isArray(body.tickers) && body.tickers.length) {
    const out: Record<string, string> = {};
    for (const t of body.tickers.slice(0, 15)) {
      try {
        const f = await syncCompany(c.env.DB, String(t), ua);
        const s = await syncSegments(c.env.DB, f.ticker, ua).catch(() => null);
        out[f.ticker] = `ok ${f.lastForm} ${f.lastFiled}; segmentos: ${s ? `${s.read} informes` : "error"}`;
      } catch (e: any) {
        out[String(t)] = `error: ${e?.message || e}`;
      }
    }
    return c.json(out);
  }
  return c.json(await runSecCron(c.env.DB, ua, Math.min(25, Number(body.max) || 12)));
});
