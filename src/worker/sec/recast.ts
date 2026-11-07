// Capa 4 de la SEC: histórico rehecho tras una reorganización de segmentos.
//
// Cuando una empresa reorganiza sus segmentos (Microsoft en el ejercicio 2027, Philip Morris en 2026),
// sus 10-Q nuevos solo rehacen el mismo trimestre del año anterior; los periodos más antiguos siguen
// con la estructura vieja y la serie se corta. Muchas empresas publican el histórico rehecho en un
// 8-K (apartado 7.01/8.01, anexo 99.x).
//
// 1. Detección (sin coste, en cada cálculo de la capa 2): un eje cuyo último trimestre tiene
//    miembros que no existen en periodos recientes, y periodos con miembros que ya no existen.
//    Las ventas de negocios (solo desaparece un segmento) no cuentan: su histórico es correcto.
//    Los renombres ya se unifican en segments.ts (memberAliases).
// 2. Búsqueda: se puntúan los 8-K entre el último informe con la estructura antigua y 4 meses
//    después del primero con la nueva. Su anexo debe nombrar los segmentos nuevos; suman las
//    palabras "recast/restated/realignment" (más si están al principio) y el detalle trimestral;
//    restan los comunicados de resultados.
// 3. Cifras: si el 8-K trae XBRL con los segmentos (Microsoft, Caterpillar), se leen directamente;
//    si no, Claude las extrae del anexo, con los nombres limitados a los de la estructura actual.
// 4. Validación (si algo falla, queda "rejected" y no se usa):
//    - el total de cada periodo coincide con los ingresos oficiales de la SEC (capa 1);
//    - las líneas suman ese total (o cubren lo mismo que en los periodos nuevos);
//    - los periodos que el 10-Q nuevo ya publica rehechos coinciden con lo extraído.
// Lo aceptado entra en la capa 2 como un informe más, con la fecha del 8-K + "R": manda sobre los
// informes anteriores (y sobre uno del mismo día) y cede ante los posteriores.

import { secFetch, fetchBudgetLeft } from "./client";
import { askClaudeJson, SEC_MODEL, type ClaudeEnv } from "./claude";
import { htmlToText } from "./earnings";
import { applyAliases, humanize, normLabel, parseSegmentFacts, type AxisKey, type RecastRef, type SegFact, type SegmentData } from "./segments";
import { eightKsBetween, getSecFinancials, isBudgetError, normTicker } from "./sync";
import type { SecPeriod } from "./normalize";

const DAY = 86400000;
const MAX_TEXT = 200_000;
const SEARCH_AFTER_DAYS = 120; // el 8-K de histórico rehecho puede llegar después del primer 10-Q nuevo
const MAX_CANDIDATES = 15;
const MIN_SCORE = 12;

const addDays = (d: string, n: number) => new Date(new Date(d + "T00:00:00Z").getTime() + n * DAY).toISOString().slice(0, 10);
/** Fecha con la que las cifras rehechas entran en la capa 2. */
export const recastKey = (filed: string) => `${filed}R`;

// ---------------------------------------------------------------- detección

interface Candidate { accn: string; filed: string; score: number; docs: string[]; instance: string | null }

export interface ReorgInfo {
  axis: AxisKey;
  tag: string;
  newMembers: { id: string; label: string }[]; // estructura actual (último trimestre)
  addedMembers: string[]; // los que no existían antes
  droppedMembers: string[];
  oldPeriods: string[]; // periodos recientes que siguen con la estructura antigua
  firstNewFiled: string;
  lastOldFiled: string;
  checked?: string[]; // 8-K ya puntuados
  best?: Candidate; // el mejor hasta ahora (la búsqueda puede repartirse entre ejecuciones)
}

export function detectReorgs(facts: SegFact[], labels: Record<string, string>, data: SegmentData): ReorgInfo[] {
  const out: ReorgInfo[] = [];
  const aliased = applyAliases(facts, labels);
  for (const axis of ["segment", "product"] as AxisKey[]) {
    const ax = data.axes[axis];
    if (!ax) continue;
    const qs = ax.periods.filter((p) => p.kind === "Q").sort((a, b) => b.date.localeCompare(a.date));
    const newest = qs[0];
    if (!newest) continue;
    const now = new Set(Object.keys(newest.revenue));
    const since = addDays(newest.date, -3 * 365 - 10);
    const old = ax.periods.filter((p) => p.date >= since && !p.recast && Object.keys(p.revenue).some((m) => !now.has(m)));
    if (old.length === 0) continue;
    const oldIds = new Set(old.flatMap((p) => Object.keys(p.revenue)));
    const added = [...now].filter((m) => !oldIds.has(m));
    if (added.length === 0) continue; // solo desaparece algún segmento (venta, escisión): nada que rehacer
    const dropped = [...oldIds].filter((m) => !now.has(m));
    let firstNew = "9999", lastOld = "";
    for (const f of aliased) {
      if (f[0] !== axis) continue;
      if (added.includes(f[1]) && f[6] < firstNew) firstNew = f[6];
      if (dropped.includes(f[1]) && f[6] > lastOld) lastOld = f[6];
    }
    // En una reorganización los miembros antiguos dejan de usarse antes de que aparezcan los nuevos.
    // Si se solapan, es el desglose elegido el que cambia de detalle según el periodo (productos).
    if (firstNew === "9999" || !lastOld || lastOld >= firstNew) continue;
    out.push({
      axis,
      tag: ax.tag,
      newMembers: [...now].map((id) => ({ id, label: labels[id] || humanize(id) })),
      addedMembers: added,
      droppedMembers: dropped,
      oldPeriods: old.map((p) => `${p.kind}${p.date}`),
      firstNewFiled: firstNew,
      lastOldFiled: lastOld,
    });
  }
  return out;
}

/** Guarda las reorganizaciones detectadas que aún no estén registradas (se buscará su 8-K). */
export async function registerReorgs(db: D1Database, ticker: string, cik: number, list: ReorgInfo[]): Promise<void> {
  for (const r of list) {
    const id = `${ticker}:${r.axis}:${r.firstNewFiled}`;
    await db
      .prepare("INSERT OR IGNORE INTO sec_recasts (id, ticker, cik, axis, status, info, created_at, updated_at) VALUES (?, ?, ?, ?, 'searching', ?, ?, 0)")
      .bind(id, ticker, cik, r.axis, JSON.stringify(r), Date.now())
      .run();
  }
}

/** Históricos rehechos aceptados de una empresa, listos para buildSegments. */
export async function acceptedRecasts(db: D1Database, ticker: string): Promise<{ refs: RecastRef[]; facts: SegFact[] }> {
  const { results } = await db
    .prepare("SELECT axis, accn, filed, doc_url, facts FROM sec_recasts WHERE ticker = ? AND status = 'done' ORDER BY filed")
    .bind(normTicker(ticker))
    .all<{ axis: AxisKey; accn: string; filed: string; doc_url: string | null; facts: string }>();
  const refs: RecastRef[] = [];
  const facts: SegFact[] = [];
  for (const r of results) {
    refs.push({ axis: r.axis, accn: r.accn, filed: r.filed, url: r.doc_url });
    try {
      facts.push(...(JSON.parse(r.facts) as SegFact[]));
    } catch {}
  }
  return { refs, facts };
}

// ---------------------------------------------------------------- búsqueda del 8-K

const STRONG = /\b(recast\w*|restat(ed|ement)\w*|realign\w*|re-?segment\w*)\b/gi;
const QUARTERLY = /\b(Q[1-4]|first|second|third|fourth) quarter\b|\bQ[1-4]\b|three months ended/gi;
const EARNINGS = /^[\s\S]{0,800}\b(reports?|announces?|delivers?)\b[\s\S]{0,120}\b(quarter|results)\b/i;

/** Anexos 99.x (HTML) e instancia XBRL de un 8-K según su índice. */
async function filingDocs(cik: number, accn: string, ua?: string): Promise<{ docs: string[]; instance: string | null }> {
  const dir = `https://www.sec.gov/Archives/edgar/data/${cik}/${accn.replace(/-/g, "")}`;
  const r = await secFetch(`${dir}/${accn}-index.htm`, ua);
  if (!r.ok) return { docs: [], instance: null };
  const html = await r.text();
  const abs = (h: string) => (h.startsWith("http") ? h : `https://www.sec.gov${h}`);
  const docs: string[] = [];
  for (const m of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1]);
    const href = m[1].match(/href="([^"]+\.html?)"/i)?.[1];
    if (cells.length < 4 || !href) continue;
    if (!/^EX-99/.test(cells[3].replace(/<[^>]+>/g, "").trim().toUpperCase())) continue;
    docs.push(abs(href.replace(/^\/ix\?doc=/, "")));
  }
  const inst = html.match(/href="([^"]+_htm\.xml)"/i)?.[1];
  return { docs: docs.slice(0, 3), instance: inst ? abs(inst) : null };
}

async function exhibitTexts(urls: string[], ua?: string): Promise<string> {
  const parts: string[] = [];
  let len = 0;
  for (const u of urls) {
    const r = await secFetch(u, ua);
    if (!r.ok) continue;
    const t = htmlToText(await r.text());
    if (len + t.length > MAX_TEXT) break;
    parts.push(`--- ${u.split("/").pop()} ---\n${t}`);
    len += t.length;
  }
  return parts.join("\n\n");
}

/** Puntuación de un anexo como histórico rehecho (0 si no nombra los segmentos nuevos). */
export function recastScore(text: string, info: ReorgInfo, isEarnings8K: boolean): number {
  if (!/\d{1,3}(,\d{3})+|\d+\.\d/.test(text)) return 0;
  const flat = normLabel(text);
  const labelOf = new Map(info.newMembers.map((m) => [m.id, m.label]));
  // Nombres de 3 letras o más (normalizados): "U.S." no se puede buscar en el texto
  const names = info.addedMembers.map((id) => normLabel(labelOf.get(id) ?? humanize(id))).filter((l) => l.length >= 3);
  if (names.length === 0 || names.some((l) => !flat.includes(l))) return 0;
  const strong = Math.min(text.match(STRONG)?.length ?? 0, 10);
  if (strong === 0) return 0;
  let s = strong * 2;
  if (/\b(recast\w*|restat(ed|ement)\w*|realign\w*|re-?segment\w*)\b/i.test(text.slice(0, 2500))) s += 15;
  s += Math.min(text.match(QUARTERLY)?.length ?? 0, 20) / 2;
  if (isEarnings8K || EARNINGS.test(text)) s -= 12;
  return s;
}

/**
 * Puntúa los 8-K de la ventana (sin repetir los ya puntuados) y guarda el mejor en `info.best`.
 * Devuelve true cuando ya no quedan por puntuar y "budget" si se acabó el límite de conexiones.
 */
export async function scoreCandidates(cik: number, info: ReorgInfo, ua?: string): Promise<true | "budget"> {
  const from = addDays(info.lastOldFiled, -30);
  const to = addDays(info.firstNewFiled, SEARCH_AFTER_DAYS);
  const checked = new Set(info.checked ?? []);
  const list = (await eightKsBetween(cik, from, to, ua))
    .filter((f) => /\b(7\.01|8\.01|2\.02)\b/.test(f.items))
    .sort((a, b) => a.filed.localeCompare(b.filed))
    .slice(0, MAX_CANDIDATES)
    .filter((f) => !checked.has(f.accn));
  for (const f of list) {
    if (fetchBudgetLeft() < 6) return "budget";
    const { docs, instance } = await filingDocs(cik, f.accn, ua);
    // Cada anexo por separado: el histórico rehecho puede ir junto al comunicado de resultados (AT&T)
    for (const d of docs) {
      const text = await exhibitTexts([d], ua);
      const score = text ? recastScore(text, info, /\b2\.02\b/.test(f.items) && docs.length === 1) : 0;
      if (score > (info.best?.score ?? 0)) info.best = { accn: f.accn, filed: f.filed, score, docs: [d], instance };
    }
    checked.add(f.accn);
    info.checked = [...checked];
  }
  return true;
}

// ---------------------------------------------------------------- extracción

interface Line { name: string; revenue: number; operating_income?: number }
interface ExtractedPeriod { fiscal_year: number; fiscal_quarter: number; period_end: string | null; total: number | null; lines: Line[] }
export interface RecastExtract { found: boolean; periods: ExtractedPeriod[]; notes: string | null; source?: "xbrl" | "claude" }

function schemaFor(names: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["found", "periods", "notes"],
    properties: {
      found: { type: "boolean" },
      notes: { type: ["string", "null"] },
      periods: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["fiscal_year", "fiscal_quarter", "period_end", "total", "lines"],
          properties: {
            fiscal_year: { type: "integer" },
            fiscal_quarter: { type: "integer", enum: [0, 1, 2, 3, 4] },
            period_end: { type: ["string", "null"] },
            total: { type: ["number", "null"] },
            lines: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["name", "revenue"],
                properties: { name: { type: "string", enum: names }, revenue: { type: "number" }, operating_income: { type: "number" } },
              },
            },
          },
        },
      },
    },
  };
}

const AXIS_NAME: Record<AxisKey, string> = { segment: "segmentos de negocio", product: "productos y servicios", geography: "zonas geográficas" };

function systemFor(info: ReorgInfo, names: string[]) {
  return `Extraes cifras históricas rehechas de un anexo de 8-K de una empresa cotizada de EE. UU. que ha reorganizado sus ${AXIS_NAME[info.axis]}.
Reglas:
- Solo la estructura NUEVA, cuyas líneas son exactamente: ${names.map((n) => `"${n}"`).join(", ")}. Si el documento usa un nombre algo distinto para una de ellas, usa el de la lista. Nunca cifras "as reported" / "previously reported" (estructura antigua).
- Un elemento de "periods" por cada trimestre de tres meses y cada ejercicio completo que traiga el documento con esa estructura. fiscal_year y fiscal_quarter según el ejercicio fiscal de la empresa, como los rotula el documento; fiscal_quarter = 0 para el ejercicio completo. period_end (YYYY-MM-DD) solo si aparece la fecha de cierre.
- revenue: ingresos de la línea en ese periodo. operating_income: beneficio operativo de la línea si aparece (si no, omítelo).
- total: ingresos totales consolidados del periodo tal como aparecen en el documento (null si no aparecen). Si hay filas de "Corporate", "Other" o eliminaciones fuera de la lista, no las pongas como línea: van solo dentro del total.
- Convierte a unidades: si la tabla dice "in millions", 1,234 = 1234000000.
- No calcules cifras que no estén en el texto. found = false si el documento no trae cifras rehechas con la estructura nueva.`;
}

/** Cifras del XBRL del 8-K (8-K que rehacen el 10-K entero) en el mismo formato que la extracción. */
export function fromXbrl(xml: string, info: ReorgInfo, annual: SecPeriod[], quarterly: SecPeriod[]): { extract: RecastExtract; facts: SegFact[] } | null {
  const label = new Map(info.newMembers.map((m) => [m.id, m.label]));
  const facts = parseSegmentFacts(xml, "").filter((f) => f[0] === info.axis && label.has(f[1]) && (f[2] === info.tag || f[2] === "OperatingIncomeLoss"));
  if (!facts.some((f) => info.addedMembers.includes(f[1]))) return null;
  const byPeriod = new Map<string, SegFact[]>();
  for (const f of facts) byPeriod.set(`${f[3]}|${f[4]}`, [...(byPeriod.get(`${f[3]}|${f[4]}`) ?? []), f]);
  const periods: ExtractedPeriod[] = [];
  for (const [k, list] of byPeriod) {
    const [start, end] = k.split("|");
    const ref = [...quarterly, ...annual].find((r) => r.date === end && r.startDate === start);
    if (!ref) continue; // acumulados de 6/9 meses: entran como cifras pero no se comprueban aquí
    const lines: Line[] = [];
    for (const f of list) {
      if (f[2] !== info.tag) continue;
      const oi = list.find((o) => o[1] === f[1] && o[2] === "OperatingIncomeLoss");
      lines.push({ name: label.get(f[1])!, revenue: f[5], ...(oi ? { operating_income: oi[5] } : {}) });
    }
    if (lines.length) periods.push({ fiscal_year: ref.fiscalYear, fiscal_quarter: ref.fiscalQuarter ?? 0, period_end: end, total: (ref.totalRevenue as number) ?? null, lines });
  }
  return { extract: { found: periods.length > 0, periods, notes: null, source: "xbrl" }, facts };
}

// ---------------------------------------------------------------- validación

export interface RecastCheck { name: string; ok: boolean; detail: string }

const near = (a: number, b: number, rel: number, abs = 1e6) => Math.abs(a - b) <= Math.abs(b) * rel + abs;

/** Comprueba lo extraído y lo convierte en cifras de la capa 2 (con la fecha `key`). */
export function validateRecast(
  x: RecastExtract,
  info: ReorgInfo,
  current: SegmentData,
  annual: SecPeriod[],
  quarterly: SecPeriod[],
  key: string
): { ok: boolean; checks: RecastCheck[]; facts: SegFact[] } {
  const checks: RecastCheck[] = [];
  const facts: SegFact[] = [];
  const idOf = new Map(info.newMembers.map((m) => [m.label, m.id]));
  const newIds = new Set(info.newMembers.map((m) => m.id));
  const ax = current.axes[info.axis];
  // Periodos ya publicados con la estructura nueva. ¿Suman el total? Si no, se compara la cobertura.
  const newPeriods = (ax?.periods ?? []).filter((p) => !p.recast && Object.keys(p.revenue).every((m) => newIds.has(m)));
  const newMatched = newPeriods.length > 0 && newPeriods.every((p) => p.matched);
  const cover = (p: { revenue: Record<string, number>; total: number | null }) =>
    p.total ? Object.values(p.revenue).reduce((s, v) => s + v, 0) / p.total : null;
  const refCover = newPeriods.map(cover).find((c) => c !== null) ?? null;

  if (!x.found || x.periods.length === 0) {
    checks.push({ name: "trae cifras rehechas", ok: false, detail: x.notes ?? "" });
    return { ok: false, checks, facts };
  }
  let mapped = 0, useful = 0;
  for (const p of x.periods) {
    const kind = p.fiscal_quarter === 0 ? "FY" : "Q";
    const label = kind === "FY" ? `FY${p.fiscal_year}` : `T${p.fiscal_quarter} ${p.fiscal_year}`;
    const pool: SecPeriod[] = kind === "FY" ? annual : quarterly;
    const sum = p.lines.reduce((s, l) => s + l.revenue, 0);
    const total = p.total ?? sum;
    // Periodo de la capa 1: mismo ejercicio/trimestre con el mismo total; si no, el único con ese total
    const sameTotal = pool.filter((r) => typeof r.totalRevenue === "number" && near(total, r.totalRevenue, 0.002));
    const ref =
      sameTotal.find((r) => r.fiscalYear === p.fiscal_year && (kind === "FY" || r.fiscalQuarter === p.fiscal_quarter)) ??
      (sameTotal.length === 1 ? sameTotal[0] : undefined);
    if (!ref) {
      // Periodo fuera de lo cargado en la capa 1 (más antiguo): se ignora; si está dentro, es un error
      const inRange = pool.some((r) => r.fiscalYear === p.fiscal_year && (kind === "FY" || r.fiscalQuarter === p.fiscal_quarter));
      if (inRange) checks.push({ name: `${label}: total = ingresos SEC`, ok: false, detail: `${total} sin periodo SEC que coincida` });
      continue;
    }
    mapped++;
    checks.push({ name: `${label}: total = ingresos SEC`, ok: true, detail: `${total} vs ${ref.totalRevenue} (${ref.date})` });
    if (newMatched) {
      checks.push({ name: `${label}: líneas suman el total`, ok: near(sum, ref.totalRevenue as number, 0.003), detail: `${sum} vs ${ref.totalRevenue}` });
    } else if (refCover !== null) {
      const c = sum / (ref.totalRevenue as number);
      checks.push({ name: `${label}: cobertura como en los periodos nuevos`, ok: Math.abs(c - refCover) <= 0.03, detail: `${c.toFixed(3)} vs ${refCover.toFixed(3)}` });
    }
    // Coincidencia con lo que el 10-Q nuevo ya publica rehecho
    const pub = newPeriods.find((q) => q.date === ref.date && q.kind === kind);
    if (pub) {
      const bad = p.lines.filter((l) => {
        const v = pub.revenue[idOf.get(l.name) ?? ""];
        return v !== undefined && !near(l.revenue, v, 0.005);
      });
      checks.push({ name: `${label}: igual que el 10-Q nuevo`, ok: bad.length === 0, detail: bad.map((l) => `${l.name} ${l.revenue} vs ${pub.revenue[idOf.get(l.name)!]}`).join("; ") || "coincide" });
    }
    if (info.oldPeriods.includes(`${kind}${ref.date}`)) useful++;
    for (const l of p.lines) {
      const id = idOf.get(l.name);
      if (!id) continue;
      facts.push([info.axis, id, info.tag, ref.startDate, ref.date, l.revenue, key]);
      if (typeof l.operating_income === "number") facts.push([info.axis, id, "OperatingIncomeLoss", ref.startDate, ref.date, l.operating_income, key]);
    }
  }
  checks.push({ name: "periodos reconocidos", ok: mapped >= 2, detail: String(mapped) });
  checks.push({ name: "rehace periodos con la estructura antigua", ok: useful >= 1, detail: `${useful} de ${info.oldPeriods.length}` });
  return { ok: checks.every((c) => c.ok), checks, facts };
}

// ---------------------------------------------------------------- proceso

/** Avanza una reorganización: puntúa los 8-K candidatos y, con el elegido, obtiene y valida las cifras. */
export async function processRecast(db: D1Database, env: ClaudeEnv & { SEC_USER_AGENT?: string }, id: string, allowClaude = true): Promise<string> {
  const row = await db.prepare("SELECT * FROM sec_recasts WHERE id = ?").bind(id).first<any>();
  if (!row) return "no existe";
  const info = JSON.parse(row.info) as ReorgInfo;
  const ua = env.SEC_USER_AGENT;
  // updated_at = ahora salvo que se indique (0 = volver a intentarlo en la próxima ejecución)
  const set = (fields: Record<string, unknown>) => {
    const all = { updated_at: Date.now(), ...fields };
    const keys = Object.keys(all);
    return db
      .prepare(`UPDATE sec_recasts SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`)
      .bind(...keys.map((k) => (all as any)[k]), id)
      .run();
  };
  try {
    if (row.status === "searching" || (row.status === "error" && !row.accn)) {
      const r = await scoreCandidates(row.cik, info, ua);
      if (r === "budget") {
        await set({ info: JSON.stringify(info), updated_at: 0 });
        return "budget";
      }
      const best = info.best && info.best.score >= MIN_SCORE ? info.best : null;
      if (!best) {
        // Sin 8-K todavía: se sigue buscando (una vez al día) hasta 4 meses después del primer informe nuevo
        const expired = Date.now() > new Date(addDays(info.firstNewFiled, SEARCH_AFTER_DAYS)).getTime();
        await set({ status: expired ? "not_found" : "searching", info: JSON.stringify(info), error: null });
        return expired ? "not_found" : "searching";
      }
      await set({ status: "pending", accn: best.accn, filed: best.filed, doc_url: best.docs[0] ?? null, info: JSON.stringify(info), error: null });
      Object.assign(row, { status: "pending", accn: best.accn, filed: best.filed });
    }
    const best = info.best!;
    const fin = await getSecFinancials(db, row.ticker, { syncIfMissing: false });
    const seg = await db.prepare("SELECT data FROM sec_segments WHERE ticker = ?").bind(row.ticker).first<{ data: string | null }>();
    if (!fin || !seg?.data) throw new Error("Faltan los datos de la capa 1 o 2");
    const key = recastKey(row.filed);

    // 1) XBRL del 8-K, si lo trae (gratis y exacto)
    let extract: RecastExtract | null = null;
    let extra: SegFact[] = [];
    if (best.instance) {
      if (fetchBudgetLeft() < 4) return "budget";
      const r = await secFetch(best.instance, ua);
      if (r.ok) {
        const x = fromXbrl(await r.text(), info, fin.annual, fin.quarterly);
        if (x) {
          extract = x.extract;
          extra = x.facts.map((f) => [f[0], f[1], f[2], f[3], f[4], f[5], key] as SegFact);
        }
      }
    }
    // 2) Si no, Claude con el texto del anexo
    let usage: { input: number; output: number } | null = null;
    let textChars = 0;
    if (!extract) {
      if (!allowClaude) return "pending";
      if (fetchBudgetLeft() < 6) return "budget";
      const text = await exhibitTexts(best.docs, ua);
      if (!text) throw new Error("No se pudo leer el anexo del 8-K");
      textChars = text.length;
      const names = info.newMembers.map((m) => m.label);
      const r = await askClaudeJson<RecastExtract>(env, {
        system: systemFor(info, names),
        user: `Empresa: ${row.ticker}\n\nAnexo del 8-K del ${row.filed}:\n${text}`,
        schema: schemaFor(names),
        maxTokens: 12000,
        effort: "medium",
      });
      extract = { ...r.data, source: "claude" };
      usage = r.usage;
    }
    const v = validateRecast(extract, info, JSON.parse(seg.data), fin.annual, fin.quarterly, key);
    // Con XBRL entran todas sus cifras (también los acumulados, para calcular el T4); con Claude, las validadas
    const facts = extract.source === "xbrl" ? extra : v.facts;
    await set({
      status: v.ok ? "done" : "rejected",
      data: JSON.stringify({ ...extract, ...(usage ? { model: SEC_MODEL, usage, textChars } : {}) }),
      facts: v.ok ? JSON.stringify(facts) : null,
      checks: JSON.stringify(v.checks),
      error: v.ok ? null : v.checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`).join(" | ").slice(0, 500),
    });
    // La capa 2 se recalcula con las cifras rehechas en la próxima ejecución
    if (v.ok) await db.prepare("UPDATE sec_segments SET updated_at = 0 WHERE ticker = ?").bind(row.ticker).run();
    return v.ok ? "done" : "rejected";
  } catch (e: any) {
    if (isBudgetError(e)) {
      await set({ info: JSON.stringify(info), updated_at: 0 });
      return "budget";
    }
    await set({ status: "error", info: JSON.stringify(info), error: String(e?.message || e).slice(0, 500) });
    return "error";
  }
}

/**
 * Cron: reorganizaciones pendientes. La búsqueda se repite una vez al día mientras dure la
 * ventana; como mucho `maxClaude` extracciones con Claude por ejecución; errores cada 6 h.
 */
export async function runRecastsCron(db: D1Database, env: ClaudeEnv & { SEC_USER_AGENT?: string }, maxClaude = 1): Promise<Record<string, string>> {
  const now = Date.now();
  const { results } = await db
    .prepare(
      `SELECT id FROM sec_recasts
       WHERE (status = 'searching' AND updated_at < ?) OR status = 'pending' OR (status = 'error' AND updated_at < ?)
       ORDER BY status = 'pending' DESC, updated_at LIMIT 6`
    )
    .bind(now - DAY, now - 6 * 3600000)
    .all<{ id: string }>();
  const out: Record<string, string> = {};
  let claude = 0;
  for (const { id } of results) {
    if (fetchBudgetLeft() < 8) break;
    const r = await processRecast(db, env, id, claude < maxClaude);
    out[id] = r;
    if (r === "done" || r === "rejected" || r === "error") claude++;
    if (r === "budget") break;
  }
  return out;
}
