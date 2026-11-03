import { Hono } from "hono";
import type { AppEnv } from "../env";
import { requireAdmin } from "../admin/routes";
import { getSecFinancials, runSecCron, syncCompany } from "./sync";
import { SEC_UNIVERSE, SEC_UNIVERSE_AS_OF } from "./universe";

// /api/sec/*: estados financieros oficiales (10-K/10-Q) normalizados.
export const secRoutes = new Hono<AppEnv>();

secRoutes.get("/financials/:ticker", async (c) => {
  const f = await getSecFinancials(c.env.DB, c.req.param("ticker"), { syncIfMissing: true, ua: c.env.SEC_USER_AGENT });
  if (!f) return c.json({ error: "Sin 10-K/10-Q en la SEC para este ticker." }, 404);
  return c.json(f);
});

// Estado de la carga: qué empresas tienen datos y de qué informe.
secRoutes.get("/status", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT ticker, name, in_universe, last_filed, last_form, last_period, synced_at, error,
            json_array_length(annual) AS years, json_array_length(quarterly) AS quarters
     FROM sec_companies ORDER BY in_universe DESC, ticker`
  ).all();
  const loaded = results.filter((r: any) => r.years || r.quarters).length;
  return c.json({ universe: SEC_UNIVERSE.length, universeAsOf: SEC_UNIVERSE_AS_OF, loaded, companies: results });
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
        out[f.ticker] = `ok ${f.lastForm} ${f.lastFiled}`;
      } catch (e: any) {
        out[String(t)] = `error: ${e?.message || e}`;
      }
    }
    return c.json(out);
  }
  return c.json(await runSecCron(c.env.DB, ua, Math.min(25, Number(body.max) || 12)));
});
