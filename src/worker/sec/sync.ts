// Sincronización de los estados financieros de la SEC con D1 (tabla sec_companies).
//
// Por empresa: API "companyfacts" (todas las cifras XBRL de sus 10-K/10-Q) → normalize.ts →
// D1. Si esa API aún no recoge algún 10-K/10-Q ya presentado (lista "submissions"), se lee el
// XBRL de ese informe directamente (xbrl.ts).
//
// Mantenimiento (cron, ver runSecCron):
//  - Índice diario de EDGAR: las empresas con un 10-K/10-Q nuevo se marcan para resincronizar.
//  - Cola: universo sin cargar, marcadas y las que llevan más de 7 días sin revisar.

import { secFetch, cik10 } from "./client";
import { mergeCompanyFacts, normalizeCompanyFacts, type CompanyFacts, type SecPeriod } from "./normalize";
import { parseXbrlInstance } from "./xbrl";
import { SEC_UNIVERSE } from "./universe";

export interface SecFinancials {
  ticker: string;
  cik: number;
  name: string | null;
  annual: SecPeriod[];
  quarterly: SecPeriod[];
  lastFiled: string | null;
  lastForm: string | null;
  lastPeriod: string | null;
  syncedAt: number | null;
}

interface Row {
  ticker: string;
  cik: number;
  name: string | null;
  in_universe: number;
  annual: string | null;
  quarterly: string | null;
  last_filed: string | null;
  last_form: string | null;
  last_period: string | null;
  synced_at: number | null;
  error: string | null;
  requested_at: number | null;
}

const DAY = 24 * 60 * 60 * 1000;
const REVIEW_EVERY = 7 * DAY;
const FORMS = new Set(["10-K", "10-K/A", "10-Q", "10-Q/A", "10-KT", "10-KT/A"]);
const PREV_CIKS = new Map(SEC_UNIVERSE.filter((u) => u.prev).map((u) => [u.ticker, u.prev!]));

export const normTicker = (t: string) => t.toUpperCase().trim().replace(/\./g, "-");

function toFinancials(r: Row): SecFinancials {
  return {
    ticker: r.ticker,
    cik: r.cik,
    name: r.name,
    annual: r.annual ? JSON.parse(r.annual) : [],
    quarterly: r.quarterly ? JSON.parse(r.quarterly) : [],
    lastFiled: r.last_filed,
    lastForm: r.last_form,
    lastPeriod: r.last_period,
    syncedAt: r.synced_at,
  };
}

// ---------------------------------------------------------------- ticker → CIK

/** CIK de un ticker: universo, D1 o el listado oficial de la SEC (se guarda una semana). */
export async function resolveCik(db: D1Database, ticker: string, ua?: string): Promise<{ cik: number; name: string | null } | null> {
  const t = normTicker(ticker);
  const u = SEC_UNIVERSE.find((x) => x.ticker === t);
  if (u) return { cik: u.cik, name: null };
  const row = await db.prepare("SELECT cik, name FROM sec_companies WHERE ticker = ?").bind(t).first<{ cik: number; name: string | null }>();
  if (row) return row;

  let map: Record<string, [number, string]> | null = null;
  const meta = await db.prepare("SELECT value, updated_at FROM sec_meta WHERE key = 'tickers'").first<{ value: string; updated_at: number }>();
  if (meta && Date.now() - meta.updated_at < REVIEW_EVERY) map = JSON.parse(meta.value);
  if (!map || !map[t]) {
    const r = await secFetch("https://www.sec.gov/files/company_tickers.json", ua);
    if (!r.ok) return map?.[t] ? { cik: map[t][0], name: map[t][1] } : null;
    const all = (await r.json()) as Record<string, { cik_str: number; ticker: string; title: string }>;
    map = {};
    for (const x of Object.values(all)) {
      const k = normTicker(x.ticker);
      if (!map[k]) map[k] = [x.cik_str, x.title]; // la primera es la clase principal
    }
    await db
      .prepare("INSERT INTO sec_meta (key, value, updated_at) VALUES ('tickers', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
      .bind(JSON.stringify(map), Date.now())
      .run();
  }
  return map[t] ? { cik: map[t][0], name: map[t][1] } : null;
}

// ---------------------------------------------------------------- sincronización

async function fetchFacts(cik: number, ua?: string): Promise<CompanyFacts | null> {
  const r = await secFetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik10(cik)}.json`, ua);
  if (r.status === 404) return null;
  return (await r.json()) as CompanyFacts;
}

interface Filing { accn: string; form: string; filed: string; period: string; doc: string }

/** 10-K/10-Q de los últimos 2 años según la lista oficial de informes de la empresa. */
async function recentFilings(cik: number, ua?: string): Promise<Filing[]> {
  const r = await secFetch(`https://data.sec.gov/submissions/CIK${cik10(cik)}.json`, ua);
  if (!r.ok) return [];
  const s = (await r.json()) as any;
  const rec = s?.filings?.recent;
  if (!rec?.form) return [];
  const since = new Date(Date.now() - 730 * DAY).toISOString().slice(0, 10);
  const out: Filing[] = [];
  for (let i = 0; i < rec.form.length; i++) {
    if (!FORMS.has(rec.form[i]) || rec.filingDate[i] < since) continue;
    out.push({ accn: rec.accessionNumber[i], form: rec.form[i], filed: rec.filingDate[i], period: rec.reportDate[i], doc: rec.primaryDocument[i] });
  }
  return out;
}

/** XBRL de un informe concreto (si companyfacts no lo trae). */
async function fetchFilingFacts(cik: number, f: Filing, ua?: string): Promise<CompanyFacts["facts"] | null> {
  const base = `https://www.sec.gov/Archives/edgar/data/${cik}/${f.accn.replace(/-/g, "")}`;
  let name = f.doc?.endsWith(".htm") ? f.doc.replace(/\.htm$/, "_htm.xml") : null;
  let r = name ? await secFetch(`${base}/${name}`, ua) : null;
  if (!r || !r.ok) {
    // Nombre no estándar: se busca el XML de instancia en el índice del informe.
    const idx = await secFetch(`${base}/index.json`, ua);
    if (!idx.ok) return null;
    const items: { name: string }[] = ((await idx.json()) as any)?.directory?.item ?? [];
    name = items.map((x) => x.name).find((n) => /_htm\.xml$/.test(n))
      ?? items.map((x) => x.name).find((n) => /\.xml$/.test(n) && !/(_cal|_def|_lab|_pre|FilingSummary)/.test(n)) ?? null;
    if (!name) return null;
    r = await secFetch(`${base}/${name}`, ua);
    if (!r.ok) return null;
  }
  return parseXbrlInstance(await r.text(), { accn: f.accn, form: f.form, filed: f.filed });
}

function accnsIn(cf: CompanyFacts): Set<string> {
  const s = new Set<string>();
  for (const ns of Object.values(cf.facts || {}))
    for (const node of Object.values(ns))
      for (const list of Object.values(node.units || {}))
        for (const f of list) s.add(f.accn);
  return s;
}

/** Descarga, normaliza y guarda una empresa. */
export async function syncCompany(db: D1Database, ticker: string, ua?: string): Promise<SecFinancials> {
  const t = normTicker(ticker);
  const id = await resolveCik(db, t, ua);
  if (!id) throw new Error(`${t}: no figura en EDGAR`);
  const inUniverse = SEC_UNIVERSE.some((u) => u.ticker === t) ? 1 : 0;
  try {
    const ciks = [id.cik, ...(PREV_CIKS.get(t) ?? [])];
    const all = (await Promise.all(ciks.map((c) => fetchFacts(c, ua)))).filter((x): x is CompanyFacts => !!x);
    if (all.length === 0) throw new Error(`${t}: sin datos XBRL en la SEC`);

    // Informes ya presentados que companyfacts aún no recoge (como mucho los 3 más recientes)
    const have = new Set(all.flatMap((cf) => [...accnsIn(cf)]));
    const missing = (await recentFilings(id.cik, ua)).filter((f) => !have.has(f.accn)).slice(0, 3);
    for (const f of missing) {
      const facts = await fetchFilingFacts(id.cik, f, ua).catch(() => null);
      if (facts) all.push({ cik: id.cik, entityName: all[0].entityName, facts });
    }

    const merged = mergeCompanyFacts(all);
    const { annual, quarterly } = normalizeCompanyFacts(merged);
    if (annual.length === 0 && quarterly.length === 0) throw new Error(`${t}: sin 10-K/10-Q normalizables`);
    const latest = [...annual, ...quarterly].sort((a, b) => (b.filed || "").localeCompare(a.filed || ""))[0];
    const lastPeriod = [quarterly[0]?.date, annual[0]?.date].filter(Boolean).sort().pop() ?? null;
    const now = Date.now();
    await db
      .prepare(
        `INSERT INTO sec_companies (ticker, cik, name, in_universe, annual, quarterly, last_filed, last_form, last_period, synced_at, error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(ticker) DO UPDATE SET cik = excluded.cik, name = excluded.name, in_universe = MAX(sec_companies.in_universe, excluded.in_universe),
           annual = excluded.annual, quarterly = excluded.quarterly, last_filed = excluded.last_filed, last_form = excluded.last_form,
           last_period = excluded.last_period, synced_at = excluded.synced_at, error = NULL`
      )
      .bind(t, id.cik, all[0].entityName ?? id.name, inUniverse, JSON.stringify(annual), JSON.stringify(quarterly),
        latest?.filed ?? null, latest?.form ?? null, lastPeriod, now)
      .run();
    return { ticker: t, cik: id.cik, name: all[0].entityName ?? id.name, annual, quarterly, lastFiled: latest?.filed ?? null, lastForm: latest?.form ?? null, lastPeriod, syncedAt: now };
  } catch (e: any) {
    await db
      .prepare(
        `INSERT INTO sec_companies (ticker, cik, name, in_universe, synced_at, error) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(ticker) DO UPDATE SET synced_at = excluded.synced_at, error = excluded.error`
      )
      .bind(t, id.cik, id.name, inUniverse, Date.now(), String(e?.message || e).slice(0, 500))
      .run();
    throw e;
  }
}

// ---------------------------------------------------------------- lectura

/**
 * Estados de la SEC guardados para un ticker. Si no hay y el ticker existe en EDGAR, se cargan en
 * el momento (unos segundos la primera vez). Devuelve null si no hay datos (ETF, empresa extranjera
 * que presenta 20-F…).
 */
export async function getSecFinancials(db: D1Database, ticker: string, opts: { syncIfMissing?: boolean; ua?: string } = {}): Promise<SecFinancials | null> {
  const t = normTicker(ticker);
  const row = await db.prepare("SELECT * FROM sec_companies WHERE ticker = ?").bind(t).first<Row>();
  if (row) {
    // Marca de uso (como mucho una vez al día) para mantener al día las que se consultan
    if (!row.requested_at || Date.now() - row.requested_at > DAY) {
      await db.prepare("UPDATE sec_companies SET requested_at = ? WHERE ticker = ?").bind(Date.now(), t).run().catch(() => {});
    }
    if (row.annual || row.quarterly) return toFinancials(row);
    // Falló hace poco: no se reintenta en cada petición
    if (row.error && row.synced_at && Date.now() - row.synced_at < DAY) return null;
  }
  if (!opts.syncIfMissing) return null;
  try {
    const f = await syncCompany(db, t, opts.ua);
    await db.prepare("UPDATE sec_companies SET requested_at = ? WHERE ticker = ?").bind(Date.now(), t).run().catch(() => {});
    return f;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- cron

/** Índice diario de EDGAR (master.YYYYMMDD.idx): CIK de quienes presentaron 10-K/10-Q ese día. */
async function dailyFilers(date: Date, ua?: string): Promise<Set<number> | null> {
  const y = date.getUTCFullYear();
  const q = Math.floor(date.getUTCMonth() / 3) + 1;
  const ymd = date.toISOString().slice(0, 10).replace(/-/g, "");
  const r = await secFetch(`https://www.sec.gov/Archives/edgar/daily-index/${y}/QTR${q}/master.${ymd}.idx`, ua);
  if (r.status === 404 || r.status === 403) {
    await r.body?.cancel();
    return null;
  }
  if (!r.ok) return null;
  const out = new Set<number>();
  for (const line of (await r.text()).split("\n")) {
    const p = line.split("|"); // CIK|Company Name|Form Type|Date Filed|Filename
    if (p.length >= 5 && FORMS.has(p[2])) out.add(Number(p[0]));
  }
  return out;
}

export interface CronReport {
  indexed: string[];
  flagged: string[];
  synced: string[];
  failed: { ticker: string; error: string }[];
}

/**
 * Tarea programada: alta del universo, revisión de los índices diarios de los últimos días y
 * sincronización de hasta `max` empresas pendientes.
 */
export async function runSecCron(db: D1Database, ua?: string, max = 12): Promise<CronReport> {
  const report: CronReport = { indexed: [], flagged: [], synced: [], failed: [] };

  // 1. Universo (alta sin datos: la cola los carga)
  const inU = await db.prepare("SELECT COUNT(*) AS n FROM sec_companies WHERE in_universe = 1").first<{ n: number }>();
  if ((inU?.n ?? 0) < SEC_UNIVERSE.length) await db.batch(
    SEC_UNIVERSE.map((u) =>
      db.prepare("INSERT INTO sec_companies (ticker, cik, in_universe) VALUES (?, ?, 1) ON CONFLICT(ticker) DO UPDATE SET in_universe = 1, cik = excluded.cik").bind(u.ticker, u.cik)
    )
  );

  // 2. Índices diarios de los últimos 5 días aún no revisados
  const tracked = (await db.prepare("SELECT ticker, cik FROM sec_companies").all<{ ticker: string; cik: number }>()).results;
  const byCik = new Map<number, string[]>();
  for (const r of tracked) byCik.set(r.cik, [...(byCik.get(r.cik) ?? []), r.ticker]);
  for (const u of SEC_UNIVERSE) for (const p of u.prev ?? []) byCik.set(p, [...(byCik.get(p) ?? []), u.ticker]);
  const done = new Set(
    (await db.prepare("SELECT key FROM sec_meta WHERE key LIKE 'index:%'").all<{ key: string }>()).results.map((r) => r.key)
  );
  for (let back = 1; back <= 5; back++) {
    const d = new Date(Date.now() - back * DAY);
    const key = `index:${d.toISOString().slice(0, 10)}`;
    if (done.has(key)) continue;
    const dow = d.getUTCDay();
    const filers = dow === 0 || dow === 6 ? new Set<number>() : await dailyFilers(d, ua).catch(() => null);
    // Sin índice: festivo (si ya pasaron 3 días) o aún no publicado (se reintenta luego)
    if (!filers && back < 3) continue;
    for (const cik of filers ?? []) {
      for (const t of byCik.get(cik) ?? []) {
        await db.prepare("UPDATE sec_companies SET synced_at = 0 WHERE ticker = ?").bind(t).run();
        report.flagged.push(t);
      }
    }
    await db.prepare("INSERT OR REPLACE INTO sec_meta (key, value, updated_at) VALUES (?, ?, ?)").bind(key, String(filers?.size ?? 0), Date.now()).run();
    report.indexed.push(key);
  }
  await db.prepare("DELETE FROM sec_meta WHERE key LIKE 'index:%' AND updated_at < ?").bind(Date.now() - 30 * DAY).run();

  // 3. Cola: sin cargar o marcadas primero; luego revisión semanal (universo y consultadas en 60 días)
  const queue = (
    await db
      .prepare(
        `SELECT ticker FROM sec_companies
         WHERE (in_universe = 1 OR requested_at > ?)
           AND (synced_at IS NULL OR synced_at = 0 OR synced_at < ? OR (error IS NOT NULL AND synced_at < ?))
         ORDER BY COALESCE(synced_at, 0) ASC, in_universe DESC
         LIMIT ?`
      )
      .bind(Date.now() - 60 * DAY, Date.now() - REVIEW_EVERY, Date.now() - DAY, max)
      .all<{ ticker: string }>()
  ).results;
  for (const { ticker } of queue) {
    try {
      await syncCompany(db, ticker, ua);
      report.synced.push(ticker);
    } catch (e: any) {
      report.failed.push({ ticker, error: String(e?.message || e) });
    }
  }
  return report;
}

// ---------------------------------------------------------------- para las rutas antiguas

/**
 * Estados de la SEC para los modelos sin hacer esperar a la petición: si el ticker aún no está
 * cargado, la carga se lanza en segundo plano (`background`) y esta vez se devuelve null.
 */
export async function secForModels(db: D1Database | null, ticker: string, background: (p: Promise<unknown>) => void, ua?: string): Promise<SecFinancials | null> {
  if (!db || !ticker || ticker === "CASH") return null;
  try {
    const f = await getSecFinancials(db, ticker, { syncIfMissing: false });
    if (f) return f;
    const t = normTicker(ticker);
    const row = await db.prepare("SELECT error, synced_at FROM sec_companies WHERE ticker = ?").bind(t).first<{ error: string | null; synced_at: number | null }>();
    const recentlyFailed = row?.error && row.synced_at && Date.now() - row.synced_at < DAY;
    if (!recentlyFailed && !inFlight.has(t)) {
      inFlight.add(t);
      background(syncCompany(db, t, ua).catch(() => null).finally(() => inFlight.delete(t)));
    }
  } catch (e) {
    console.warn("SEC", ticker, e);
  }
  return null;
}
const inFlight = new Set<string>();
