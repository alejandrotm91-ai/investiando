// Sincronización de la capa 2 (segmentos) con D1, tabla sec_segments.
// Lee el XBRL de los últimos 6 informes 10-K/10-Q (la primera vez) y después solo los nuevos.
// Con 6 informes hay unos 10 trimestres y 3-4 ejercicios: cada 10-Q trae su trimestre y el mismo
// del año anterior, y el 10-K tres ejercicios. Para unos 10 años de segmentos anuales se leen además
// los 10-K de hace 3, 6 y 9 ejercicios (cada uno trae 3 ejercicios); su número de registro sale de
// la capa 1, que guarda el 10-K original de cada ejercicio.

import { buildSegments, membersIn, parseLabels, parseSegmentFacts, TOTAL, type SegFact, type SegmentData } from "./segments";
import { fetchFilingText, getSecFinancials, isBudgetError, normTicker, recentFilings, type Filing } from "./sync";
import { fetchBudgetLeft } from "./client";
import { acceptedRecasts, detectReorgs, registerReorgs } from "./recast";
import { SEC_UNIVERSE } from "./universe";

// CIK anteriores (ExxonMobil y BlackRock pasaron a una sociedad holding nueva: sus informes antiguos
// siguen en el CIK de antes)
const PREV_CIKS = new Map(SEC_UNIVERSE.filter((u) => u.prev).map((u) => [u.ticker, u.prev!]));

const KEEP_FILINGS = 6;
// Versión del lector de cada informe: 2 = total sin dimensiones por informe + gastos por segmento
const READ_VERSION = "2";
const YEARS_KEPT = 4.5; // cifras trimestrales y acumuladas
const YEARS_KEPT_ANNUAL = 12.5; // ejercicios completos
const HISTORY_10K = [3, 6, 9]; // posiciones en la lista de ejercicios de la capa 1

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
  // Si el lector ha cambiado (READ_VERSION), los informes se vuelven a leer una vez. `labels.__ver`
  // guarda la versión y `labels.__totals` vale "0" mientras dura la relectura (puede repartirse
  // entre ejecuciones) y "1" al terminarla
  const fresh = labels.__ver === READ_VERSION;
  const done = new Set(fresh ? parse<string[]>(row?.accns ?? null, []) : []);
  if (!fresh) {
    labels.__ver = READ_VERSION;
    labels.__totals = "0";
  }

  try {
    const prevCiks = PREV_CIKS.get(t) ?? [];
    let filings = (await recentFilings(fin.cik, ua)).slice(0, KEEP_FILINGS);
    if (filings.length < KEEP_FILINGS)
      for (const c of prevCiks) filings = [...filings, ...(await recentFilings(c, ua))];
    filings = filings.sort((a, b) => b.filed.localeCompare(a.filed)).slice(0, KEEP_FILINGS);
    // Cada informe en el CIK con que se presentó: se prueba el actual y después los anteriores
    const fetchText = async (f: Filing, kind: "instance" | "labels") => {
      for (const c of [fin.cik, ...prevCiks]) {
        const x = await fetchFilingText(c, f, kind, ua);
        if (x) return x;
      }
      return null;
    };
    // 10-K antiguos para la historia anual (sin nombre de documento: se busca en el índice)
    const history: Filing[] = HISTORY_10K.map((i) => fin.annual[i])
      .filter((a) => a?.accn && /^10-K/.test(a.form) && !filings.some((f) => f.accn === a.accn))
      .map((a) => ({ accn: a.accn, form: a.form, filed: a.filed, period: a.date, doc: "" }));
    const todo = [...filings, ...history].filter((f) => !done.has(f.accn)).slice(0, maxFilings);
    for (const f of todo) {
      const xml = await fetchText(f, "instance");
      if (xml) facts.push(...parseSegmentFacts(xml, f.filed));
      done.add(f.accn); // si no tiene XBRL tampoco se reintenta
      // Nombres de los segmentos antiguos (los del informe más reciente no se tocan)
      if (xml && history.includes(f)) {
        const own = new Set([...membersIn(parseSegmentFacts(xml, f.filed))].filter((m) => !labels[m]));
        if (own.size) {
          const lab = await fetchText(f, "labels").catch(() => null);
          if (lab) labels = { ...parseLabels(lab, own), ...labels };
        }
      }
    }
    // Nombres según el informe más reciente: si se acaba de leer, si aún no hay o si a algún miembro
    // de ese informe le falta el nombre (una lectura fallida). `labels.__accn` evita repetirlo.
    const newest = filings[0];
    const missing = newest && [...membersIn(facts.filter((f) => f[6] === newest.filed))].some((m) => !labels[m]);
    if (newest && (todo.some((f) => f.accn === newest.accn) || Object.keys(labels).length === 0 || (missing && labels.__accn !== newest.accn))) {
      const lab = await fetchText(newest, "labels").catch(() => null);
      if (lab) {
        labels = { ...labels, ...parseLabels(lab, membersIn(facts)) };
        labels.__accn = newest.accn;
      }
    }

    // Poda: la cifra más reciente de cada miembro y periodo, y solo los últimos años
    const cutoff = new Date(Date.now() - YEARS_KEPT * 365 * 86400000).toISOString().slice(0, 10);
    const cutoffAnnual = new Date(Date.now() - YEARS_KEPT_ANNUAL * 365 * 86400000).toISOString().slice(0, 10);
    const isAnnual = (f: SegFact) => new Date(f[4]).getTime() - new Date(f[3]).getTime() > 300 * 86400000;
    const latest = new Map<string, SegFact>();
    for (const f of facts) {
      if (f[4] < (isAnnual(f) ? cutoffAnnual : cutoff)) continue;
      // Totales: uno por informe (se compara cada desglose con el total de su propio informe)
      const k = `${f[0]}|${f[1]}|${f[2]}|${f[3]}|${f[4]}${f[0] === TOTAL ? `|${f[6]}` : ""}`;
      const cur = latest.get(k);
      if (!cur || f[6] >= cur[6]) latest.set(k, f);
    }
    facts = [...latest.values()];
    const used = membersIn(facts);
    labels = Object.fromEntries(Object.entries(labels).filter(([k]) => used.has(k) || k === "__accn" || k === "__totals" || k === "__ver"));

    // Capa 4: cifras rehechas de los 8-K de reorganización aceptados (no se guardan en `facts`)
    const rc = await acceptedRecasts(db, t);
    const data = buildSegments(rc.facts.length ? [...facts, ...rc.facts] : facts, fin.annual, fin.quarterly, labels, filings[0]?.filed ?? null, rc.refs);
    // Reorganizaciones con periodos aún sin rehacer: se buscará su 8-K (recast.ts)
    await registerReorgs(db, t, fin.cik, detectReorgs(facts, labels, data)).catch(() => {});
    const keepAccns = [...done].filter((a) => filings.some((f) => f.accn === a) || history.some((f) => f.accn === a));
    // Si quedaron informes por leer (límite de la ejecución), updated_at = 0 para que el cron siga
    const pending = [...filings, ...history].some((f) => !done.has(f.accn));
    if (!pending) labels.__totals = "1";
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
       ORDER BY COALESCE(s.updated_at, -1), c.in_universe DESC
       LIMIT 40`
    )
    .bind(Date.now() - 60 * 86400000, Date.now() - 86400000)
    .all<{ ticker: string }>();
  let left = budget;
  for (const { ticker } of results) {
    // Conexiones: lista de informes + hasta 3 por informe (índice, XBRL, etiquetas) + etiquetas
    const room = Math.floor((fetchBudgetLeft() - 3) / 3);
    if (left <= 0 || room < 1) break;
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
