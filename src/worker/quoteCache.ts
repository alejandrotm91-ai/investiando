import { env } from "cloudflare:workers";

// Último precio real conocido por ticker (tabla quote_cache de D1).
// Sustituye a la tabla fija FALLBACK_QUOTES como respaldo cuando Yahoo no responde: un precio
// real de hace unos minutos u horas es mucho mejor que uno escrito a mano hace meses (p. ej.
// NFLX a 595 $ antes de su split 10:1).

export interface CachedQuote {
  data: any;
  updatedAt: string;
}

// Para no escribir en D1 en cada refresco: como mucho una escritura por ticker cada 10 minutos
// y aislamiento del Worker.
const WRITE_EVERY_MS = 10 * 60 * 1000;
const lastWrite = new Map<string, number>();

function db(): D1Database | null {
  return ((env as any)?.DB as D1Database) ?? null;
}

/** Guarda cotizaciones reales recién obtenidas. Pensado para ir dentro de bg(). */
export async function rememberQuotes(rows: { ticker: string; data: any }[]): Promise<void> {
  const d = db();
  if (!d) return;
  const now = Date.now();
  const fresh = rows.filter((r) => {
    const t = r.ticker.toUpperCase();
    const price = r.data?.regularMarketPrice;
    if (!(typeof price === "number" && price > 0)) return false;
    if (now - (lastWrite.get(t) ?? 0) < WRITE_EVERY_MS) return false;
    lastWrite.set(t, now);
    return true;
  });
  if (fresh.length === 0) return;
  const iso = new Date(now).toISOString();
  const stmt = d.prepare(
    "INSERT INTO quote_cache (ticker, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(ticker) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at"
  );
  await d.batch(fresh.map((r) => stmt.bind(r.ticker.toUpperCase(), JSON.stringify(r.data), iso)));
}

/** Últimas cotizaciones reales guardadas para esos tickers. */
export async function recallQuotes(tickers: string[]): Promise<Record<string, CachedQuote>> {
  const d = db();
  const out: Record<string, CachedQuote> = {};
  const list = Array.from(new Set(tickers.map((t) => t.toUpperCase()))).filter(Boolean);
  if (!d || list.length === 0) return out;
  try {
    const { results } = await d
      .prepare(`SELECT ticker, data, updated_at FROM quote_cache WHERE ticker IN (${list.map(() => "?").join(",")})`)
      .bind(...list)
      .all<{ ticker: string; data: string; updated_at: string }>();
    for (const r of results) {
      try {
        out[r.ticker] = { data: JSON.parse(r.data), updatedAt: r.updated_at };
      } catch {
        // fila corrupta: se ignora
      }
    }
  } catch (err: any) {
    console.error("[quote_cache] lectura fallida:", err?.message || err);
  }
  return out;
}
