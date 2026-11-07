// Sincronización de la capa 2 (segmentos) con D1, tabla sec_segments.
// Lee el XBRL de los últimos 6 informes 10-K/10-Q (la primera vez) y después solo los nuevos.
// Con 6 informes hay unos 10 trimestres y 3-4 ejercicios: cada 10-Q trae su trimestre y el mismo
// del año anterior, y el 10-K tres ejercicios.

import { buildSegments, membersIn, parseLabels, parseSegmentFacts, type SegFact, type SegmentData } from "./segments";
import { fetchFilingText, getSecFinancials, isBudgetError, normTicker, recentFilings } from "./sync";
import { fetchBudgetLeft } from "./client";
import { acceptedRecasts, detectReorgs, registerReorgs } from "./recast";

const KEEP_FILINGS = 6;
const YEARS_KEPT = 4.5;

interface SegRow {
  data: string | null;
  facts: string | null;
  labels: string | null;
  accns: string | null;
  updated_at: number | null;
  error: string | null;
}

const parse = <T>(s: string | null, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

/** Lee los informes que falten (como mucho `maxFilings`) y recalcula los segmentos. Devuelve cuántos leyó. */
export async function syncSegments(db: D1Database, ticker: string, ua?: string, maxFilings = KEEP_FILINGS): Promise<{ read: number; data: SegmentData | null }> {
  const t = normTicker(ticker);
  const fin = await getSecFinancials(db, t, { syncIfMissing: false });
  if (!fin) return { read: 0, data: null };
  const row = await db.prepare("SELECT * FROM sec_segments WHERE ticker = ?").bind(t).first<SegRow>();
  let facts = parse<SegFact[]>(row?.facts ?? null, []);
  let labels = parse<Record<string, string>>(row?.labels ?? null, {});
  const done = new Set(parse<string[]>(row?.accns ?? null, []));

  try {
    const filings = (await recentFilings(fin.cik, ua)).slice(0, KEEP_FILINGS);
    const todo = filings.filter((f) => !done.has(f.accn)).slice(0, maxFilings);
    for (const f of todo) {
      const xml = await fetchFilingText(fin.cik, f, "instance", ua);
      if (xml) facts.push(...parseSegmentFacts(xml, f.filed));
      done.add(f.accn); // si no tiene XBRL tampoco se reintenta
    }
    // Nombres según el informe más reciente: si se acaba de leer, si aún no hay o si a algún miembro
    // de ese informe le falta el nombre (una lectura fallida). `labels.__accn` evita repetirlo.
    const newest = filings[0];
    const missing = newest && [...membersIn(facts.filter((f) => f[6] === newest.filed))].some((m) => !labels[m]);
    if (newest && (todo.some((f) => f.accn === newest.accn) || Object.keys(labels).length === 0 || (missing && labels.__accn !== newest.accn))) {
      const lab = await fetchFilingText(fin.cik, newest, "labels", ua).catch(() => null);
      if (lab) labels = { ...labels, ...parseLabels(lab, membersIn(facts)) };
      labels.__accn = newest.accn;
    }

    // Poda: la cifra más reciente de cada miembro y periodo, y solo los últimos años
    const cutoff = new Date(Date.now() - YEARS_KEPT * 365 * 86400000).toISOString().slice(0, 10);
    const latest = new Map<string, SegFact>();
    for (const f of facts) {
      if (f[4] < cutoff) continue;
      const k = `${f[0]}|${f[1]}|${f[2]}|${f[3]}|${f[4]}`;
      const cur = latest.get(k);
      if (!cur || f[6] >= cur[6]) latest.set(k, f);
    }
    facts = [...latest.values()];
    const used = membersIn(facts);
    labels = Object.fromEntries(Object.entries(labels).filter(([k]) => used.has(k) || k === "__accn"));

    // Capa 4: cifras rehechas de los 8-K de reorganización aceptados (no se guardan en `facts`)
    const rc = await acceptedRecasts(db, t);
    const data = buildSegments(rc.facts.length ? [...facts, ...rc.facts] : facts, fin.annual, fin.quarterly, labels, filings[0]?.filed ?? null, rc.refs);
    // Reorganizaciones con periodos aún sin rehacer: se buscará su 8-K (recast.ts)
    await registerReorgs(db, t, fin.cik, detectReorgs(facts, labels, data)).catch(() => {});
    const keepAccns = [...done].filter((a) => filings.some((f) => f.accn === a));
    // Si quedaron informes por leer (límite de la ejecución), updated_at = 0 para que el cron siga
    const pending = filings.some((f) => !done.has(f.accn));
    await db
      .prepare(
        `INSERT INTO sec_segments (ticker, data, facts, labels, accns, updated_at, error) VALUES (?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(ticker) DO UPDATE SET data = excluded.data, facts = excluded.facts, labels = excluded.labels,
           accns = excluded.accns, updated_at = excluded.updated_at, error = NULL`
      )
      .bind(t, JSON.stringify(data), JSON.stringify(facts), JSON.stringify(labels), JSON.stringify(keepAccns), pending ? 0 : Date.now())
      .run();
    return { read: todo.length, data };
  } catch (e: any) {
    if (isBudgetError(e)) throw e; // se reintenta en la próxima ejecución, sin marcar error
    await db
      .prepare(
        `INSERT INTO sec_segments (ticker, updated_at, error) VALUES (?, ?, ?)
         ON CONFLICT(ticker) DO UPDATE SET updated_at = excluded.updated_at, error = excluded.error`
      )
      .bind(t, Date.now(), String(e?.message || e).slice(0, 500))
      .run();
    throw e;
  }
}

/** Segmentos guardados; si no hay y la empresa tiene datos de la SEC, se cargan en el momento. */
export async function getSegments(db: D1Database, ticker: string, ua?: string): Promise<SegmentData | null> {
  const t = normTicker(ticker);
  const row = await db.prepare("SELECT data, error, updated_at FROM sec_segments WHERE ticker = ?").bind(t).first<SegRow>();
  if (row?.data) return JSON.parse(row.data);
  if (row?.error && row.updated_at && Date.now() - row.updated_at < 86400000) return null;
  try {
    return (await syncSegments(db, t, ua)).data;
  } catch {
    return null;
  }
}

/**
 * Cron: segmentos de las empresas cuyos estados se han recargado (puede haber informe nuevo) o
 * que aún no los tienen. Como mucho `budget` informes por ejecución.
 */
export async function runSegmentsCron(db: D1Database, ua?: string, budget = 60): Promise<{ synced: string[]; failed: string[] }> {
  const out = { synced: [] as string[], failed: [] as string[] };
  const { results } = await db
    .prepare(
      `SELECT c.ticker FROM sec_companies c LEFT JOIN sec_segments s ON s.ticker = c.ticker
       WHERE c.annual IS NOT NULL AND (c.in_universe = 1 OR c.requested_at > ?)
         AND (s.ticker IS NULL OR (s.updated_at < c.synced_at) OR (s.error IS NOT NULL AND s.updated_at < ?))
       ORDER BY s.updated_at IS NOT NULL, c.in_universe DESC
       LIMIT 40`
    )
    .bind(Date.now() - 60 * 86400000, Date.now() - 86400000)
    .all<{ ticker: string }>();
  let left = budget;
  for (const { ticker } of results) {
    // Conexiones: lista de informes + uno por informe + etiquetas
    const room = fetchBudgetLeft() - 3;
    if (left <= 0 || room < 2) break;
    try {
      const r = await syncSegments(db, ticker, ua, Math.min(KEEP_FILINGS, left, room));
      left -= Math.max(1, r.read);
      out.synced.push(ticker);
    } catch (e) {
      if (isBudgetError(e)) break;
      left -= 1;
      out.failed.push(ticker);
    }
  }
  return out;
}
