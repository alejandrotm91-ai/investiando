import { Hono } from "hono";
import type { Env } from "./env";
import { getYahoo } from "./yahoo";

// API de investiando en Cloudflare Workers. Las rutas de server.ts se migran aquí por fases;
// mientras tanto, las que faltan responden 404 en JSON.
const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", async (c) => {
  // Comprueba también que la base D1 responde.
  const db = await c.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>().catch(() => null);
  return c.json({ status: "ok", d1: db?.ok === 1 });
});

// Cotización simple: primera ruta real migrada.
app.get("/api/quote/:symbol", async (c) => {
  const symbol = c.req.param("symbol").toUpperCase().replace(/\./g, "-");
  try {
    const q: any = await getYahoo().quote(symbol, {}, { validateResult: false });
    if (!q) return c.json({ error: `Sin datos para ${symbol}` }, 404);
    return c.json({
      symbol: q.symbol,
      name: q.longName || q.shortName || q.symbol,
      price: q.regularMarketPrice,
      previousClose: q.regularMarketPreviousClose,
      change: q.regularMarketChange,
      changePercent: q.regularMarketChangePercent,
      currency: q.currency,
      marketState: q.marketState,
    });
  } catch (err: any) {
    return c.json({ error: err?.message || "Error consultando Yahoo Finance" }, 502);
  }
});

// Diagnóstico de la Fase 1: prueba cada función de Yahoo que usa server.ts
// y dice cuáles responden desde Cloudflare. Se elimina al terminar la Fase 2.
app.get("/api/_probe/yahoo", async (c) => {
  const symbol = (c.req.query("symbol") || "AAPL").toUpperCase();
  const yf = getYahoo();
  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const yearsAgo = new Date(now.getTime() - 4 * 365 * 24 * 3600 * 1000);

  const tests: Record<string, () => Promise<any>> = {
    quote: async () => (await yf.quote(symbol, {}, { validateResult: false }))?.regularMarketPrice,
    quoteMultiple: async () => (await yf.quote([symbol, "MSFT", "^GSPC"], {}, { validateResult: false }))?.length,
    quoteSummary: async () =>
      Object.keys((await yf.quoteSummary(symbol, { modules: ["price", "summaryDetail", "financialData"] }, { validateResult: false })) || {}),
    chart: async () => (await yf.chart(symbol, { period1: monthAgo, period2: now, interval: "1d" }, { validateResult: false }))?.quotes?.length,
    search: async () => (await yf.search(symbol, {}, { validateResult: false }))?.quotes?.length,
    fundamentalsTimeSeries: async () =>
      (await yf.fundamentalsTimeSeries(symbol, { period1: yearsAgo, type: "annual", module: "financials" }, { validateResult: false }))?.length,
  };

  const results: Record<string, { ok: boolean; ms: number; value?: unknown; error?: string }> = {};
  for (const [name, run] of Object.entries(tests)) {
    const t0 = Date.now();
    try {
      results[name] = { ok: true, ms: Date.now() - t0, value: await run() };
      results[name].ms = Date.now() - t0;
    } catch (err: any) {
      results[name] = { ok: false, ms: Date.now() - t0, error: String(err?.message || err).slice(0, 300) };
    }
  }
  const okCount = Object.values(results).filter((r) => r.ok).length;
  return c.json({ symbol, ok: `${okCount}/${Object.keys(tests).length}`, colo: (c.req.raw as any).cf?.colo ?? "local", results });
});

app.all("/api/*", (c) => c.json({ error: `API route ${c.req.method} ${c.req.path} not found` }, 404));

// Todo lo demás: la app React compilada en dist/ (la sirve Cloudflare).
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
