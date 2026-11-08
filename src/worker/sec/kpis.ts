// Capa 5 de la SEC: KPIs operativos propios de cada empresa (viajes y reservas de Uber, suscriptores
// y ARM de Netflix…). No están en el XBRL: salen de las tablas del comunicado de resultados (anexo
// 99.1 del 8-K con Item 2.02), que Claude lee con salida JSON por esquema.
//
// - Cada empresa tiene su lista de KPIs (KPI_DEFS) con unidad y rango plausible.
// - De cada comunicado se extraen todos los trimestres de sus tablas (Uber: trimestre y mismo del
//   año anterior; Netflix: cinco trimestres), así un mismo trimestre suele venir de dos comunicados.
// - Validación: los ingresos de cada trimestre que trae el comunicado deben coincidir con los de la
//   SEC (capa 1). Un trimestre que no cuadra se descarta (unidades o periodo mal leídos, o ingresos
//   rehechos después); si no cuadra la mayoría, se rechaza el comunicado entero. Un KPI fuera de su
//   rango plausible se descarta.
// - Al leer: por trimestre y KPI manda el comunicado más reciente; "confirmado" si dos coinciden.

import { fetchBudgetLeft } from "./client";
import { askClaudeJson, SEC_MODEL, type ClaudeEnv } from "./claude";
import { fetchPressRelease } from "./earnings";
import { getSecFinancials, isBudgetError, normTicker, recentEarnings8K } from "./sync";

export interface KpiDef {
  key: string;
  en: string;
  es: string;
  unit: "M" | "$M" | "$"; // millones (personas, viajes), millones de dólares, dólares
  kind: "flow" | "stock" | "avg"; // suma del trimestre, saldo al cierre, media del trimestre
  range: [number, number]; // en su unidad; fuera de él se descarta
  hint: string; // cómo lo llama el comunicado (para Claude)
}
export interface KpiChart {
  id: string;
  en: string;
  es: string;
  type: "bar" | "stack" | "line";
  keys: string[];
  // KPIs calculados: viajes por usuario al mes, comisión sobre reservas (ingresos ÷ reservas)
  derived?: "per_user_month" | "take_rate";
}
export interface CompanyKpis {
  kpis: KpiDef[];
  charts: KpiChart[];
  from?: string; // comunicados presentados desde esta fecha
  until?: string; // y hasta esta (Netflix dejó de publicar suscriptores en 2025)
  note?: { en: string; es: string };
}

export const KPI_DEFS: Record<string, CompanyKpis> = {
  UBER: {
    from: "2022-01-01",
    kpis: [
      { key: "mapcs", en: "Monthly active platform consumers", es: "Usuarios activos mensuales", unit: "M", kind: "avg", range: [50, 1000], hint: "Monthly Active Platform Consumers (MAPCs), in millions" },
      { key: "trips", en: "Trips", es: "Viajes y pedidos", unit: "M", kind: "flow", range: [300, 30000], hint: "Trips, in millions" },
      { key: "gross_bookings", en: "Gross bookings", es: "Reservas brutas", unit: "$M", kind: "flow", range: [5000, 500000], hint: "Gross Bookings total, in millions of USD" },
      { key: "gb_mobility", en: "Gross bookings · Mobility", es: "Reservas · Mobility", unit: "$M", kind: "flow", range: [1000, 300000], hint: "Gross Bookings of the Mobility segment, in millions of USD" },
      { key: "gb_delivery", en: "Gross bookings · Delivery", es: "Reservas · Delivery", unit: "$M", kind: "flow", range: [1000, 300000], hint: "Gross Bookings of the Delivery segment, in millions of USD" },
      { key: "gb_freight", en: "Gross bookings · Freight", es: "Reservas · Freight", unit: "$M", kind: "flow", range: [100, 50000], hint: "Gross Bookings of the Freight segment, in millions of USD" },
    ],
    charts: [
      { id: "gb", en: "Gross bookings by segment", es: "Reservas brutas por segmento", type: "stack", keys: ["gb_mobility", "gb_delivery", "gb_freight"] },
      { id: "trips", en: "Trips", es: "Viajes y pedidos", type: "bar", keys: ["trips"] },
      { id: "mapcs", en: "Monthly active consumers", es: "Usuarios activos mensuales", type: "bar", keys: ["mapcs"] },
      { id: "freq", en: "Trips per user per month", es: "Viajes por usuario al mes", type: "line", keys: ["trips", "mapcs"], derived: "per_user_month" },
      { id: "take", en: "Take rate (revenue ÷ gross bookings)", es: "Comisión (ingresos ÷ reservas)", type: "line", keys: ["revenue", "gross_bookings"], derived: "take_rate" },
    ],
  },
  NFLX: {
    from: "2020-01-01",
    until: "2025-02-28",
    note: {
      en: "Netflix stopped reporting paid memberships and ARM every quarter in 2025.",
      es: "Netflix dejó de publicar cada trimestre los suscriptores y el ARM en 2025.",
    },
    kpis: [
      { key: "memberships", en: "Paid memberships", es: "Suscripciones de pago", unit: "M", kind: "stock", range: [100, 1000], hint: "Global streaming paid memberships at end of quarter, in millions" },
      { key: "net_adds", en: "Paid net additions", es: "Altas netas", unit: "M", kind: "flow", range: [-30, 60], hint: "Global streaming paid net additions, in millions (negative if losses)" },
      { key: "arm", en: "Average revenue per membership (monthly)", es: "Ingreso medio por suscripción (mensual)", unit: "$", kind: "avg", range: [5, 40], hint: "Global average revenue per membership (ARM) per month, in USD; omit if only regional ARM is shown" },
      { key: "mem_ucan", en: "Memberships · US & Canada", es: "Suscripciones · EE. UU. y Canadá", unit: "M", kind: "stock", range: [20, 300], hint: "UCAN (United States and Canada) paid memberships, in millions" },
      { key: "mem_emea", en: "Memberships · EMEA", es: "Suscripciones · EMEA", unit: "M", kind: "stock", range: [20, 400], hint: "EMEA paid memberships, in millions" },
      { key: "mem_latam", en: "Memberships · LATAM", es: "Suscripciones · LATAM", unit: "M", kind: "stock", range: [10, 300], hint: "LATAM paid memberships, in millions" },
      { key: "mem_apac", en: "Memberships · APAC", es: "Suscripciones · APAC", unit: "M", kind: "stock", range: [5, 400], hint: "APAC (Asia-Pacific) paid memberships, in millions" },
      { key: "arm_ucan", en: "ARM · US & Canada", es: "ARM · EE. UU. y Canadá", unit: "$", kind: "avg", range: [5, 40], hint: "UCAN average revenue per membership per month, in USD" },
      { key: "arm_emea", en: "ARM · EMEA", es: "ARM · EMEA", unit: "$", kind: "avg", range: [3, 30], hint: "EMEA average revenue per membership per month, in USD" },
      { key: "arm_latam", en: "ARM · LATAM", es: "ARM · LATAM", unit: "$", kind: "avg", range: [2, 30], hint: "LATAM average revenue per membership per month, in USD" },
      { key: "arm_apac", en: "ARM · APAC", es: "ARM · APAC", unit: "$", kind: "avg", range: [2, 30], hint: "APAC average revenue per membership per month, in USD" },
    ],
    charts: [
      { id: "mem", en: "Paid memberships by region", es: "Suscripciones de pago por región", type: "stack", keys: ["mem_ucan", "mem_emea", "mem_latam", "mem_apac"] },
      { id: "adds", en: "Paid net additions", es: "Altas netas", type: "bar", keys: ["net_adds"] },
      { id: "arm", en: "Average revenue per membership (monthly)", es: "Ingreso medio por suscripción (mensual)", type: "line", keys: ["arm", "arm_ucan", "arm_emea", "arm_latam", "arm_apac"] },
    ],
  },
};

const MAX_TEXT = 120_000;
const DAY = 86400000;

// ---------------------------------------------------------------- extracción

interface Extract { quarters: { period_end: string; revenue?: number; values: Record<string, number> }[] }

function schemaFor(defs: KpiDef[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["quarters"],
    properties: {
      quarters: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["period_end", "values"],
          properties: {
            period_end: { type: "string", description: "Cierre del trimestre, AAAA-MM-DD (último día del mes)" },
            revenue: { type: "number", description: "Ingresos totales del trimestre, en millones de USD" },
            values: {
              type: "object",
              additionalProperties: false,
              properties: Object.fromEntries(defs.map((d) => [d.key, { type: "number", description: d.hint }])),
            },
          },
        },
      },
    },
  };
}

const SYSTEM = `Extraes métricas operativas (KPIs) de comunicados de resultados trimestrales de empresas cotizadas de EE. UU. (anexo 99.1 de un 8-K).
Reglas:
- Devuelve un elemento por cada trimestre que aparezca en las tablas del comunicado (actual, mismo trimestre del año anterior y, si hay una tabla de varios trimestres, todos ellos).
- Solo cifras de un trimestre (tres meses). Nunca acumulados del año, cifras anuales ni previsiones.
- period_end: último día del último mes del trimestre (p. ej. Q4'23 → 2023-12-31; "three months ended September 30, 2026" → 2026-09-30).
- Respeta la unidad indicada en cada campo: si la tabla está en miles o en miles de millones, conviértelo.
- revenue: ingresos totales GAAP del trimestre en millones de USD (para comprobar las unidades).
- Si un KPI no aparece para ese trimestre, omítelo. No calcules ni estimes cifras que no estén en el texto.`;

// ---------------------------------------------------------------- cola y proceso

/** Encola los 8-K de resultados de la empresa en su ventana de fechas. */
async function queueReleases(db: D1Database, ticker: string, cik: number, def: CompanyKpis, ua?: string) {
  const days = def.from ? Math.ceil((Date.now() - new Date(def.from).getTime()) / DAY) + 1 : 365 * 3;
  const list = (await recentEarnings8K(cik, ua, days)).filter((f) => (!def.from || f.filed >= def.from) && (!def.until || f.filed <= def.until));
  for (const f of list)
    await db
      .prepare("INSERT OR IGNORE INTO sec_kpis (accn, ticker, cik, filed, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', ?, ?)")
      .bind(f.accn, ticker, cik, f.filed, Date.now(), Date.now())
      .run();
  await db
    .prepare("INSERT INTO sec_meta (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(`kpis_queue:${ticker}`, String(list.length), Date.now())
    .run();
}

/** Fecha del trimestre de la capa 1 más cercana (±10 días): las empresas cierran a fin de mes o en sábado. */
function matchQuarter(date: string, quarterly: { date: string }[]): string | null {
  const t = new Date(date + "T00:00:00Z").getTime();
  let best: string | null = null, gap = Infinity;
  for (const q of quarterly) {
    const g = Math.abs(new Date(q.date + "T00:00:00Z").getTime() - t);
    if (g < gap) (gap = g), (best = q.date);
  }
  return gap <= 10 * DAY ? best : null;
}

export interface KpiCheck { name: string; ok: boolean; detail: string }

/** Valida lo extraído: ingresos frente a la SEC y rangos plausibles. Devuelve los trimestres limpios. */
export function validateKpis(x: Extract, defs: KpiDef[], quarterly: { date: string; totalRevenue?: number | null }[]) {
  const checks: KpiCheck[] = [];
  const out: { date: string; revenue?: number; values: Record<string, number> }[] = [];
  let matched = 0, mismatched = 0;
  for (const q of x.quarters ?? []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(q.period_end)) continue;
    const date = matchQuarter(q.period_end, quarterly) ?? q.period_end;
    const sec = quarterly.find((p) => p.date === date)?.totalRevenue;
    if (typeof q.revenue === "number" && typeof sec === "number" && sec > 0) {
      const ok = Math.abs(q.revenue * 1e6 - sec) <= sec * 0.005 + 1e6;
      checks.push({ name: `ingresos ${date}`, ok, detail: `comunicado ${q.revenue} M; SEC ${(sec / 1e6).toFixed(0)} M${ok ? "" : ": trimestre descartado"}` });
      if (!ok) {
        mismatched++;
        continue;
      }
      matched++;
    }
    const values: Record<string, number> = {};
    for (const d of defs) {
      const v = q.values?.[d.key];
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      if (v < d.range[0] || v > d.range[1]) {
        checks.push({ name: `rango ${d.key} ${date}`, ok: false, detail: `${v} fuera de [${d.range.join(", ")}]: descartado` });
        continue;
      }
      values[d.key] = v;
    }
    if (Object.keys(values).length) out.push({ date, revenue: q.revenue, values });
  }
  // Rechazo: ningún trimestre comprobable, o no cuadra la mayoría
  const ok = matched > 0 && matched > mismatched && out.length > 0;
  if (matched + mismatched === 0) checks.push({ name: "ingresos", ok: false, detail: "ningún trimestre con ingresos comparables con la SEC" });
  return { ok, checks, quarters: out };
}

export async function processKpiRelease(db: D1Database, env: ClaudeEnv & { SEC_USER_AGENT?: string }, accn: string): Promise<string> {
  const row = await db.prepare("SELECT * FROM sec_kpis WHERE accn = ?").bind(accn).first<any>();
  if (!row) return "missing";
  const def = KPI_DEFS[row.ticker];
  if (!def) return "no-defs";
  const set = (fields: Record<string, unknown>) => {
    const keys = Object.keys(fields);
    return db
      .prepare(`UPDATE sec_kpis SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE accn = ?`)
      .bind(...keys.map((k) => fields[k] as any), Date.now(), accn)
      .run();
  };
  try {
    const pr = await fetchPressRelease(row.cik, accn, env.SEC_USER_AGENT);
    if (!pr) {
      await set({ status: "error", error: "sin anexo 99.1" });
      return "error";
    }
    const r = await askClaudeJson<Extract>(env, {
      system: SYSTEM,
      user: `Empresa: ${row.ticker}\nKPIs a extraer: ${def.kpis.map((d) => `${d.key} = ${d.hint}`).join("; ")}\n\nComunicado (8-K del ${row.filed}):\n${pr.text.slice(0, MAX_TEXT)}`,
      schema: schemaFor(def.kpis),
      maxTokens: 6000,
      effort: "low",
    });
    const fin = await getSecFinancials(db, row.ticker, { syncIfMissing: false });
    const v = validateKpis(r.data, def.kpis, fin?.quarterly ?? []);
    await set({
      status: v.ok ? "done" : "rejected",
      data: JSON.stringify({ quarters: v.quarters, model: SEC_MODEL }),
      checks: JSON.stringify(v.checks),
      doc_url: pr.url,
      usage: JSON.stringify({ ...r.usage, chars: Math.min(pr.text.length, MAX_TEXT) }),
      error: v.ok ? null : v.checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`).join(" | ").slice(0, 500),
    });
    return v.ok ? "done" : "rejected";
  } catch (e: any) {
    if (isBudgetError(e)) return "budget";
    await set({ status: "error", error: String(e?.message || e).slice(0, 500) });
    return "error";
  }
}

/** Tarea programada: encola comunicados nuevos (cada 12 h por empresa) y procesa hasta `max`. */
export async function runKpisCron(db: D1Database, env: ClaudeEnv & { SEC_USER_AGENT?: string }, max = 3): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const ticker of Object.keys(KPI_DEFS)) {
    if (fetchBudgetLeft() < 10) break;
    const meta = await db.prepare("SELECT updated_at FROM sec_meta WHERE key = ?").bind(`kpis_queue:${ticker}`).first<{ updated_at: number }>();
    if (meta && Date.now() - meta.updated_at < DAY / 2) continue;
    const c = await db.prepare("SELECT cik FROM sec_companies WHERE ticker = ?").bind(ticker).first<{ cik: number }>();
    if (!c) continue;
    await queueReleases(db, ticker, c.cik, KPI_DEFS[ticker], env.SEC_USER_AGENT).catch((e) => {
      if (isBudgetError(e)) throw e;
    });
    out[`queued:${ticker}`] = true;
  }
  // Errores pasajeros: se reintentan al cabo de un día
  const { results } = await db
    .prepare("SELECT accn FROM sec_kpis WHERE status = 'pending' OR (status = 'error' AND updated_at < ?) ORDER BY filed DESC LIMIT ?")
    .bind(Date.now() - DAY, max)
    .all<{ accn: string }>();
  for (const { accn } of results) {
    // Índice + comunicado (+ 99.2) + Claude con un reintento
    if (fetchBudgetLeft() < 8) break;
    out[accn] = await processKpiRelease(db, env, accn);
    if (out[accn] === "budget") break;
  }
  return out;
}

// ---------------------------------------------------------------- lectura

export interface KpiPoint { date: string; values: Record<string, number>; confirmed: Record<string, boolean> }

export async function getKpis(db: D1Database, ticker: string) {
  const t = normTicker(ticker);
  const def = KPI_DEFS[t];
  if (!def) return null;
  const { results } = await db
    .prepare("SELECT accn, filed, status, data, doc_url FROM sec_kpis WHERE ticker = ? ORDER BY filed DESC")
    .bind(t)
    .all<{ accn: string; filed: string; status: string; data: string | null; doc_url: string | null }>();
  // Por trimestre y KPI: el comunicado más reciente manda; confirmado si otro da la misma cifra (±0,5 %)
  const byDate = new Map<string, { values: Record<string, number>; seen: Record<string, number[]> }>();
  for (const r of results) {
    if (r.status !== "done" || !r.data) continue;
    for (const q of (JSON.parse(r.data).quarters ?? []) as { date: string; revenue?: number; values: Record<string, number> }[]) {
      const cur = byDate.get(q.date) ?? { values: {}, seen: {} };
      const vals = { ...q.values, ...(typeof q.revenue === "number" ? { revenue: q.revenue } : {}) };
      for (const [k, v] of Object.entries(vals)) {
        if (cur.values[k] === undefined) cur.values[k] = v;
        (cur.seen[k] ||= []).push(v);
      }
      byDate.set(q.date, cur);
    }
  }
  const points: KpiPoint[] = [...byDate]
    .map(([date, x]) => ({
      date,
      values: x.values,
      confirmed: Object.fromEntries(Object.entries(x.seen).map(([k, vs]) => [k, vs.filter((v) => Math.abs(v - x.values[k]) <= Math.abs(x.values[k]) * 0.005 + 0.01).length >= 2])),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const counts = results.reduce<Record<string, number>>((acc, r) => ((acc[r.status] = (acc[r.status] ?? 0) + 1), acc), {});
  return {
    ticker: t,
    kpis: def.kpis.map(({ key, en, es, unit, kind }) => ({ key, en, es, unit, kind })),
    charts: def.charts,
    note: def.note ?? null,
    points,
    releases: counts,
    latestRelease: results.find((r) => r.status === "done") ? { filed: results.find((r) => r.status === "done")!.filed, url: results.find((r) => r.status === "done")!.doc_url } : null,
  };
}
