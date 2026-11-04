// Capa 3 de la SEC: avance de resultados a partir del 8-K de resultados (Item 2.02).
//
// El comunicado (anexo 99.1) sale el mismo día que los resultados; el 10-Q/10-K, días o semanas
// después. No trae XBRL y cada empresa lo maqueta a su manera, así que las cifras principales las
// extrae Claude con una salida JSON forzada por esquema. Es provisional: la app solo lo muestra
// mientras el 10-Q/10-K de ese trimestre no esté cargado (capa 1), y entonces deja de mostrarse solo.
//
// Validación (si falla algo, el avance se guarda como "rejected" y no se muestra):
//  - Las cifras del mismo trimestre del año anterior que trae el comunicado deben coincidir con las
//    de la SEC. Detecta unidades mal leídas (miles/millones) y cifras "ajustadas" en vez de GAAP.
//  - BPA ≈ beneficio neto ÷ acciones diluidas.
//  - El trimestre anunciado es posterior al último 10-Q/10-K y los ingresos son plausibles.

import Anthropic from "@anthropic-ai/sdk";
import { secFetch } from "./client";
import { getSecFinancials, normTicker, recentEarnings8K, type Filing } from "./sync";

export const PREVIEW_MODEL = "claude-opus-5-5";
const MAX_TEXT = 180_000; // caracteres del comunicado que se envían (los habituales tienen 20-80 mil)

// ---------------------------------------------------------------- detección

/** 8-K de resultados recientes según el feed "últimos informes" de la SEC (casi en tiempo real). */
async function latestEarnings8KFeed(ua?: string): Promise<{ cik: number; accn: string; filed: string }[]> {
  const r = await secFetch("https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&company=&dateb=&owner=include&start=0&count=100&output=atom", ua);
  if (!r.ok) return [];
  const xml = await r.text();
  const out: { cik: number; accn: string; filed: string }[] = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    if (!/Item 2\.02/.test(e)) continue;
    const cik = Number(e.match(/\((\d{10})\)\s*\(Filer\)/)?.[1]);
    const accn = e.match(/accession-number=([\d-]+)/)?.[1];
    const filed = e.match(/Filed:&lt;\/b&gt;\s*([\d-]+)/)?.[1] ?? new Date().toISOString().slice(0, 10);
    if (cik && accn) out.push({ cik, accn, filed });
  }
  return out;
}

async function queue(db: D1Database, ticker: string, cik: number, accn: string, filed: string) {
  await db
    .prepare("INSERT OR IGNORE INTO sec_previews (accn, ticker, cik, filed, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', ?, ?)")
    .bind(accn, ticker, cik, filed, Date.now(), Date.now())
    .run();
}

/** Encola los 8-K de resultados de una empresa (desde su lista oficial de informes). */
export async function queueFromSubmissions(db: D1Database, ticker: string, cik: number, ua?: string): Promise<number> {
  const list: Filing[] = await recentEarnings8K(cik, ua);
  for (const f of list) await queue(db, ticker, cik, f.accn, f.filed);
  return list.length;
}

// ---------------------------------------------------------------- comunicado

/**
 * Anexo 99.1 del 8-K (el comunicado de resultados) en texto plano, con las tablas en filas.
 * Los nombres de archivo no siguen ninguna regla (q2fy27pr.htm, earningsrelease3q26unh.htm…):
 * el tipo de cada documento se lee del índice del informe. Si cabe, se añade el 99.2 (algunas
 * empresas ponen ahí las tablas).
 */
export async function fetchPressRelease(cik: number, accn: string, ua?: string): Promise<{ url: string; text: string } | null> {
  const dir = `https://www.sec.gov/Archives/edgar/data/${cik}/${accn.replace(/-/g, "")}`;
  const r = await secFetch(`${dir}/${accn}-index.htm`, ua);
  if (!r.ok) return null;
  const html = await r.text();
  const docs: { type: string; href: string }[] = [];
  for (const m of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1]);
    const href = m[1].match(/href="([^"]+\.html?)"/i)?.[1];
    if (cells.length >= 4 && href) docs.push({ type: cells[3].replace(/<[^>]+>/g, "").trim().toUpperCase(), href: href.replace(/^\/ix\?doc=/, "") });
  }
  const ex1 = docs.find((d) => d.type === "EX-99.1") ?? docs.find((d) => d.type.startsWith("EX-99"));
  if (!ex1) return null;
  const abs = (h: string) => (h.startsWith("http") ? h : `https://www.sec.gov${h}`);
  const r1 = await secFetch(abs(ex1.href), ua);
  if (!r1.ok) return null;
  let text = htmlToText(await r1.text());
  const ex2 = docs.find((d) => d.type === "EX-99.2");
  if (ex2 && text.length < MAX_TEXT / 2) {
    const r2 = await secFetch(abs(ex2.href), ua);
    if (r2.ok) {
      const t2 = htmlToText(await r2.text());
      if (text.length + t2.length <= MAX_TEXT) text += `\n\n--- Anexo 99.2 ---\n${t2}`;
    }
  }
  return { url: abs(ex1.href), text };
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(td|th)>/gi, " | ")
    .replace(/<\/(tr|p|div|h\d|li)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;|&#xa0;/gi, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&#8217;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/( \| )+\s*\n/g, "\n")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

// ---------------------------------------------------------------- extracción con Claude

const num = { type: ["number", "null"] };
const FIGURES = {
  type: "object",
  additionalProperties: false,
  required: ["revenue", "gross_profit", "operating_income", "net_income", "diluted_eps", "diluted_shares", "operating_cash_flow", "capital_expenditures"],
  properties: {
    revenue: num, gross_profit: num, operating_income: num, net_income: num, diluted_eps: num,
    diluted_shares: num, operating_cash_flow: num, capital_expenditures: num,
  },
};
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["is_earnings_release", "period_end", "fiscal_year", "fiscal_quarter", "currency", "quarter", "prior_year_quarter", "non_gaap_diluted_eps", "guidance", "notes"],
  properties: {
    is_earnings_release: { type: "boolean" },
    period_end: { type: ["string", "null"] },
    fiscal_year: { type: ["integer", "null"] },
    fiscal_quarter: { type: ["integer", "null"] },
    currency: { type: ["string", "null"] },
    quarter: FIGURES,
    prior_year_quarter: FIGURES,
    non_gaap_diluted_eps: num,
    guidance: { type: ["string", "null"] },
    notes: { type: ["string", "null"] },
  },
};

const SYSTEM = `Extraes cifras de comunicados de resultados de empresas cotizadas de EE. UU. (anexo 99.1 de un 8-K).
Reglas:
- Cifras del trimestre de tres meses que anuncia el comunicado ("quarter") y del mismo trimestre del año anterior ("prior_year_quarter"), tal como aparecen en las tablas. Si el comunicado anuncia el cuarto trimestre y el año completo, usa las columnas de tres meses, no las del año.
- Solo cifras GAAP (las de la cuenta de resultados y el flujo de caja oficiales). Nunca cifras "adjusted", "non-GAAP", "core" u "operating" ajustadas; el BPA ajustado va solo en non_gaap_diluted_eps.
- Convierte todo a unidades: si la tabla dice "in millions", 1.234 = 1234000000. El BPA y las acciones por acción quedan como están (BPA en dólares por acción; acciones en número de acciones, aplicando "in millions" si corresponde).
- net_income: beneficio neto atribuible a los accionistas de la empresa (sin minoritarios). capital_expenditures en positivo.
- Si una cifra no aparece para ese periodo, null. No calcules cifras que no estén en el texto.
- period_end: fecha de cierre del trimestre anunciado (YYYY-MM-DD). fiscal_year y fiscal_quarter según el ejercicio fiscal de la empresa.
- guidance: una frase en español con la previsión para el siguiente periodo si la hay; si no, null.
- is_earnings_release = false si el documento no es un comunicado de resultados trimestrales.`;

interface Figures {
  revenue: number | null; gross_profit: number | null; operating_income: number | null; net_income: number | null;
  diluted_eps: number | null; diluted_shares: number | null; operating_cash_flow: number | null; capital_expenditures: number | null;
}
export interface Extracted {
  is_earnings_release: boolean;
  period_end: string | null;
  fiscal_year: number | null;
  fiscal_quarter: number | null;
  currency: string | null;
  quarter: Figures;
  prior_year_quarter: Figures;
  non_gaap_diluted_eps: number | null;
  guidance: string | null;
  notes: string | null;
}

async function extractWithClaude(env: { ANTHROPIC_API_KEY?: string; ANTHROPIC_WORKSPACE_ID?: string }, ticker: string, text: string): Promise<{ data: Extracted; usage: { input: number; output: number } }> {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY");
  const workspaceId = env.ANTHROPIC_WORKSPACE_ID?.trim();
  const client = new Anthropic({ apiKey, maxRetries: 3, ...(workspaceId ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } } : {}) });
  const body = text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) : text;
  const msg = await client.beta.messages.create({
    model: PREVIEW_MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    // Tarea de extracción: esfuerzo bajo basta y abarata. Salida JSON validada contra el esquema.
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    // Si los filtros de seguridad rechazan la solicitud, Anthropic la reintenta con otro modelo.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{ role: "user", content: `Empresa: ${ticker}\n\nComunicado:\n${body}` }],
  } as any);
  if (msg.stop_reason === "refusal") throw new Error("El modelo rechazó la solicitud");
  if (msg.stop_reason === "max_tokens") throw new Error("Respuesta incompleta (max_tokens)");
  const txt = msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  return { data: JSON.parse(txt) as Extracted, usage: { input: msg.usage.input_tokens, output: msg.usage.output_tokens } };
}

// ---------------------------------------------------------------- validación

const close = (a: number | null | undefined, b: number | null | undefined, rel: number, abs = 0) =>
  typeof a === "number" && typeof b === "number" ? Math.abs(a - b) <= Math.max(Math.abs(b) * rel, abs) : null;

export interface Check { name: string; ok: boolean | null; detail: string }

/** Comprueba lo extraído contra los datos oficiales de la SEC (capa 1). */
export function validate(x: Extracted, quarterly: any[]): { ok: boolean; checks: Check[] } {
  const checks: Check[] = [];
  const q = x.quarter;
  checks.push({ name: "es comunicado de resultados", ok: x.is_earnings_release && !!x.period_end, detail: x.period_end ?? "sin fecha" });
  checks.push({ name: "ingresos o beneficio presentes", ok: q.revenue !== null || q.net_income !== null, detail: "" });

  const latest = quarterly[0];
  if (latest && x.period_end) {
    checks.push({ name: "trimestre posterior al último 10-Q/10-K", ok: x.period_end > latest.date, detail: `${x.period_end} vs ${latest.date}` });
  }
  // Mismo trimestre del año anterior en la SEC (fecha ±10 días un año antes)
  if (x.period_end) {
    const target = new Date(x.period_end).getTime() - 365 * 86400000;
    const prior = quarterly.find((p) => Math.abs(new Date(p.date).getTime() - target) <= 12 * 86400000);
    if (prior) {
      const py = x.prior_year_quarter;
      const rev = close(py.revenue, prior.totalRevenue, 0.015);
      const ni = close(py.net_income, prior.netIncomeCommonStockholders ?? prior.netIncome, 0.03, 5e6);
      const eps = close(py.diluted_eps, prior.dilutedEPS, 0.03, 0.02);
      checks.push({ name: "ingresos año anterior = SEC", ok: rev, detail: `${py.revenue} vs ${prior.totalRevenue}` });
      checks.push({ name: "beneficio año anterior = SEC", ok: ni, detail: `${py.net_income} vs ${prior.netIncomeCommonStockholders ?? prior.netIncome}` });
      checks.push({ name: "BPA año anterior = SEC", ok: eps, detail: `${py.diluted_eps} vs ${prior.dilutedEPS}` });
      if (prior.totalRevenue && q.revenue) {
        const g = q.revenue / prior.totalRevenue;
        checks.push({ name: "crecimiento de ingresos plausible", ok: g > 0.4 && g < 3, detail: g.toFixed(2) });
      }
    }
  }
  if (q.net_income !== null && q.diluted_shares && q.diluted_eps !== null && Math.abs(q.net_income) > 1e6) {
    checks.push({ name: "BPA ≈ beneficio / acciones", ok: close(q.net_income / q.diluted_shares, q.diluted_eps, 0.04, 0.02), detail: `${(q.net_income / q.diluted_shares).toFixed(3)} vs ${q.diluted_eps}` });
  }
  const ok = checks.every((c) => c.ok !== false) && checks.filter((c) => c.name.endsWith("= SEC")).some((c) => c.ok === true);
  return { ok, checks };
}

// ---------------------------------------------------------------- proceso

/** Procesa un 8-K pendiente: descarga, extrae, valida y guarda. */
export async function processPreview(db: D1Database, env: any, accn: string): Promise<string> {
  const row = await db.prepare("SELECT * FROM sec_previews WHERE accn = ?").bind(accn).first<any>();
  if (!row) return "no existe";
  const set = (fields: Record<string, unknown>) => {
    const keys = Object.keys(fields);
    return db
      .prepare(`UPDATE sec_previews SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE accn = ?`)
      .bind(...keys.map((k) => fields[k] as any), Date.now(), accn)
      .run();
  };
  const fin = await getSecFinancials(db, row.ticker, { syncIfMissing: false });
  if (!fin) {
    await set({ status: "skipped", error: "sin datos de la SEC (capa 1)" });
    return "skipped";
  }
  // Ya hay 10-Q/10-K presentado el mismo día o después: el avance no aporta nada (no se gasta en Claude)
  if (fin.lastFiled && fin.lastFiled >= row.filed) {
    await set({ status: "skipped", error: "el 10-Q/10-K ya está presentado" });
    return "skipped";
  }
  try {
    const pr = await fetchPressRelease(row.cik, accn, env.SEC_USER_AGENT);
    if (!pr) {
      await set({ status: "error", error: "sin anexo 99.1" });
      return "error";
    }
    const { data, usage } = await extractWithClaude(env, row.ticker, pr.text);
    const v = validate(data, fin.quarterly);
    await set({
      status: v.ok ? "done" : "rejected",
      period_end: data.period_end,
      fiscal_year: data.fiscal_year,
      fiscal_quarter: data.fiscal_quarter,
      data: JSON.stringify({ ...data, model: PREVIEW_MODEL, usage, textChars: pr.text.length }),
      checks: JSON.stringify(v.checks),
      doc_url: pr.url,
      error: null,
    });
    return v.ok ? "done" : "rejected";
  } catch (e: any) {
    await set({ status: "error", error: String(e?.message || e).slice(0, 500) });
    return "error";
  }
}

/**
 * Cron: encola los 8-K de resultados del feed de la SEC (y, la primera vez, los de los últimos
 * meses del universo) y procesa como mucho `max` pendientes.
 */
export async function runPreviewsCron(db: D1Database, env: any, max = 4): Promise<Record<string, unknown>> {
  const ua = env.SEC_USER_AGENT;
  const report: Record<string, unknown> = {};
  const tracked = (await db.prepare("SELECT ticker, cik, in_universe FROM sec_companies WHERE annual IS NOT NULL").all<{ ticker: string; cik: number; in_universe: number }>()).results;
  const byCik = new Map(tracked.map((t) => [t.cik, t.ticker]));

  // 1. Feed en tiempo casi real
  const feed = await latestEarnings8KFeed(ua).catch(() => []);
  let queued = 0;
  for (const f of feed) {
    const t = byCik.get(f.cik);
    if (t) {
      await queue(db, t, f.cik, f.accn, f.filed);
      queued++;
    }
  }
  report.feed = queued;

  // 2. Repaso inicial (una vez): 8-K de resultados recientes del universo, 15 empresas por ejecución
  const done = await db.prepare("SELECT value FROM sec_meta WHERE key = 'previews_backfill'").first<{ value: string }>();
  const offset = Number(done?.value ?? 0);
  const universe = tracked.filter((t) => t.in_universe);
  if (offset >= 0 && offset < universe.length) {
    const slice = universe.slice(offset, offset + 15);
    for (const t of slice) await queueFromSubmissions(db, t.ticker, t.cik, ua).catch(() => 0);
    const next = slice.length < 15 ? -1 : offset + 15;
    await db.prepare("INSERT OR REPLACE INTO sec_meta (key, value, updated_at) VALUES ('previews_backfill', ?, ?)").bind(String(next), Date.now()).run();
    report.backfill = slice.length;
  }

  // 3. Pendientes (los más recientes primero)
  // Los descartados (ya hay 10-Q) no llaman a Claude y no cuentan para el cupo de `max` extracciones
  const pending = (await db.prepare("SELECT accn FROM sec_previews WHERE status = 'pending' ORDER BY filed DESC LIMIT 60").all<{ accn: string }>()).results;
  const results: Record<string, string> = {};
  let extracted = 0;
  for (const p of pending) {
    if (extracted >= max) break;
    const r = await processPreview(db, env, p.accn);
    results[p.accn] = r;
    if (r !== "skipped") extracted++;
  }
  report.processed = results;
  return report;
}

// ---------------------------------------------------------------- lectura

/** Avance vigente de un ticker: el más reciente que pasó la validación y aún no tiene 10-Q/10-K. */
export async function getPreview(db: D1Database, ticker: string): Promise<any | null> {
  const t = normTicker(ticker);
  const fin = await getSecFinancials(db, t, { syncIfMissing: false });
  const row = await db
    .prepare("SELECT * FROM sec_previews WHERE ticker = ? AND status = 'done' ORDER BY period_end DESC LIMIT 1")
    .bind(t)
    .first<any>();
  if (!row || !fin) return null;
  const latestSec = fin.quarterly[0]?.date ?? "";
  if (!row.period_end || row.period_end <= latestSec) return null; // ya llegó el 10-Q/10-K
  const data = JSON.parse(row.data);
  const target = new Date(row.period_end).getTime() - 365 * 86400000;
  const prior = fin.quarterly.find((p: any) => Math.abs(new Date(p.date).getTime() - target) <= 12 * 86400000);
  const yoy = (a: number | null, b: number | null | undefined) => (typeof a === "number" && typeof b === "number" && b > 0 ? a / b - 1 : null);
  const q = data.quarter as Figures;
  return {
    ticker: t,
    accn: row.accn,
    filed: row.filed,
    url: row.doc_url,
    filingIndex: `https://www.sec.gov/Archives/edgar/data/${row.cik}/${String(row.accn).replace(/-/g, "")}/`,
    periodEnd: row.period_end,
    fiscalYear: row.fiscal_year,
    fiscalQuarter: row.fiscal_quarter,
    quarter: q,
    priorYear: prior
      ? { date: prior.date, revenue: prior.totalRevenue ?? null, operatingIncome: prior.operatingIncome ?? null, netIncome: prior.netIncomeCommonStockholders ?? prior.netIncome ?? null, dilutedEPS: prior.dilutedEPS ?? null }
      : null,
    yoy: prior
      ? { revenue: yoy(q.revenue, prior.totalRevenue), operatingIncome: yoy(q.operating_income, prior.operatingIncome), netIncome: yoy(q.net_income, prior.netIncomeCommonStockholders ?? prior.netIncome), dilutedEPS: yoy(q.diluted_eps, prior.dilutedEPS) }
      : null,
    nonGaapEps: data.non_gaap_diluted_eps,
    guidance: data.guidance,
    checks: JSON.parse(row.checks || "[]"),
    model: data.model,
  };
}
