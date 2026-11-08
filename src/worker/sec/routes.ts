import { Hono } from "hono";
import type { AppEnv } from "../env";
import { requireAdmin } from "../admin/routes";
import { getSecFinancials, runSecCron, syncCompany } from "./sync";
import { SEC_UNIVERSE, SEC_UNIVERSE_AS_OF } from "./universe";
import { getSegments, syncSegments } from "./segmentSync";
import { getPreview, processPreview, queueFromSubmissions } from "./earnings";
import { processRecast } from "./recast";
import { getKpis, processKpiRelease } from "./kpis";

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

// Capa 3: avance de resultados del 8-K (provisional hasta que llega el 10-Q/10-K)
secRoutes.get("/preview/:ticker", async (c) => {
  const p = await getPreview(c.env.DB, c.req.param("ticker"));
  return p ? c.json(p) : c.json({ preview: null });
});

// Procesar a mano los 8-K de resultados de un ticker (solo admin)
secRoutes.post("/preview/process", requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}) as any);
  const t = String(body.ticker || "").toUpperCase();
  const row = await c.env.DB.prepare("SELECT cik FROM sec_companies WHERE ticker = ?").bind(t).first<{ cik: number }>();
  if (!row) return c.json({ error: "ticker sin datos de la SEC" }, 404);
  await queueFromSubmissions(c.env.DB, t, row.cik, c.env.SEC_USER_AGENT);
  const { results } = await c.env.DB.prepare("SELECT accn FROM sec_previews WHERE ticker = ? AND status IN ('pending','error') ORDER BY filed DESC LIMIT 2").bind(t).all<{ accn: string }>();
  const out: Record<string, string> = {};
  for (const r of results) out[r.accn] = await processPreview(c.env.DB, c.env, r.accn);
  return c.json(out);
});

// Capa 5: KPIs operativos de los comunicados de resultados (Uber, Netflix…)
secRoutes.get("/kpis/:ticker", async (c) => {
  const k = await getKpis(c.env.DB, c.req.param("ticker"));
  if (!k) return c.json({ error: "Sin KPIs definidos para este ticker." }, 404);
  return c.json(k);
});

// Procesar a mano comunicados pendientes de KPIs (solo admin): {ticker?, max?, reset?}
secRoutes.post("/kpis/process", requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}) as any);
  const t = body.ticker ? String(body.ticker).toUpperCase() : null;
  if (body.reset && t) await c.env.DB.prepare("UPDATE sec_kpis SET status = 'pending' WHERE ticker = ?").bind(t).run();
  const { results } = await c.env.DB.prepare(`SELECT accn FROM sec_kpis WHERE status IN ('pending','error') ${t ? "AND ticker = ?" : ""} ORDER BY filed DESC LIMIT ?`)
    .bind(...(t ? [t] : []), Math.min(6, Number(body.max) || 3))
    .all<{ accn: string }>();
  const out: Record<string, string> = {};
  for (const r of results) out[r.accn] = await processKpiRelease(c.env.DB, c.env, r.accn);
  return c.json(out);
});

// Capa 4: reorganizaciones de segmentos detectadas y su histórico rehecho (sin las cifras)
secRoutes.get("/recasts", async (c) => {
  const t = c.req.query("ticker")?.toUpperCase();
  const { results } = await c.env.DB.prepare(
    `SELECT id, ticker, axis, status, accn, filed, doc_url, checks, error, updated_at,
            json_extract(info, '$.oldPeriods') AS old_periods, json_extract(info, '$.best.score') AS score,
            json_extract(data, '$.source') AS source
     FROM sec_recasts ${t ? "WHERE ticker = ?" : ""} ORDER BY ticker, axis`
  )
    .bind(...(t ? [t] : []))
    .all();
  return c.json(results.map((r: any) => ({ ...r, checks: r.checks ? JSON.parse(r.checks) : null, old_periods: r.old_periods ? JSON.parse(r.old_periods) : null })));
});

// Procesar a mano una reorganización (solo admin): {id}
secRoutes.post("/recast/process", requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}) as any);
  const id = String(body.id || "");
  if (body.reset) await c.env.DB.prepare("UPDATE sec_recasts SET status = 'searching', info = json_remove(info, '$.checked', '$.best'), accn = NULL, updated_at = 0 WHERE id = ?").bind(id).run();
  return c.json({ id, result: await processRecast(c.env.DB, c.env, id) });
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
