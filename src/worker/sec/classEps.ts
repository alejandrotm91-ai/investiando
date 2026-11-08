// BPA y acciones medias de empresas que solo los publican por clase de acción (companyfacts no trae
// cifras con dimensiones, así que no tienen BPA en ningún periodo y la pestaña Valuation se quedaba
// sin P/E hasta que Yahoo rellenaba los últimos trimestres):
//   - Visa (V cotiza en Clase A): BPA diluido y acciones diluidas de la Clase A "as-converted", que
//     ya incluyen las B y C convertidas (beneficio total ÷ acciones Clase A ≈ BPA Clase A).
//   - Berkshire (BRK-B): BPA básico por "acción equivalente Clase B" (no tiene dilución).
//
// Se lee el XBRL del informe original de los periodos sin BPA (como mucho MAX_FILINGS por
// sincronización, del más reciente al más antiguo; cada 10-Q/10-K trae también el año anterior) y
// las cifras se añaden con las etiquetas estándar sin dimensión, para que normalize.ts las trate
// igual que las del resto. Solo se aceptan los periodos en que BPA × acciones ≈ beneficio neto
// (±3 %) del mismo informe. Lo leído se guarda en sec_meta ("classeps:TICKER").

import { fetchBudgetLeft } from "./client";
import { normalizeCompanyFacts, type CompanyFacts, type SecFact, type SecPeriod } from "./normalize";
import { parseClassFacts, parseXbrlInstance } from "./xbrl";
import type { Filing } from "./sync";

interface ClassDef {
  member: string; // miembro del eje StatementClassOfStockAxis, sin prefijo
  diluted: boolean; // false: solo publica BPA básico (sin dilución), que vale también como diluido
}
export const CLASS_EPS: Record<string, ClassDef> = {
  V: { member: "CommonClassAMember", diluted: true },
  "BRK-B": { member: "EquivalentClassBMember", diluted: false },
};

const MAX_FILINGS = 6;
const NI_TAGS = ["NetIncomeLoss", "NetIncomeLossAvailableToCommonStockholdersBasic", "ProfitLoss"];
const SRC_TAGS = ["EarningsPerShareDiluted", "EarningsPerShareBasic", "WeightedAverageNumberOfDilutedSharesOutstanding", "WeightedAverageNumberOfSharesOutstandingBasic"];

interface Cache { checked: string[]; facts: Record<string, SecFact[]> }

const gapsOf = (periods: SecPeriod[]) =>
  periods.filter((p) => typeof p.netIncome === "number" && typeof p.dilutedEPS !== "number").map((p) => p.date);

function inject(merged: CompanyFacts, facts: Record<string, SecFact[]>) {
  const gaap = (merged.facts["us-gaap"] ||= {});
  for (const [tag, list] of Object.entries(facts)) {
    const unit = tag.startsWith("EarningsPerShare") ? "USD/shares" : "shares";
    const dst = ((gaap[tag] ||= { units: {} }).units[unit] ||= []);
    for (const f of list) if (!dst.some((x) => x.start === f.start && x.end === f.end)) dst.push(f);
  }
}

/** Informe original (el primero presentado) del beneficio neto con cierre en `end`. */
function originalFiling(merged: CompanyFacts, end: string, skip: Set<string>): Filing | null {
  let best: SecFact | null = null;
  for (const tag of NI_TAGS) {
    for (const f of merged.facts["us-gaap"]?.[tag]?.units?.USD ?? []) {
      if (f.end !== end || !f.start || skip.has(f.accn) || !/^10-[KQ]/.test(f.form)) continue;
      if (!best || f.filed < best.filed) best = f;
    }
  }
  return best ? { accn: best.accn, form: best.form, filed: best.filed, period: end, doc: "" } : null;
}

/** Cifras de la clase que cuadran con el beneficio neto del informe, con las etiquetas de destino. */
export function readFiling(xml: string, filing: Filing, def: ClassDef): Record<string, SecFact[]> {
  const byTag = parseClassFacts(xml, filing, def.member, SRC_TAGS);
  const gaap = parseXbrlInstance(xml, filing)["us-gaap"] ?? {};
  const ni = (start: string, end: string) => {
    for (const t of NI_TAGS) {
      const f = gaap[t]?.units?.USD?.find((x) => x.start === start && x.end === end);
      if (f) return f.val;
    }
    return undefined;
  };
  const epsTag = def.diluted ? "EarningsPerShareDiluted" : "EarningsPerShareBasic";
  const shTag = def.diluted ? "WeightedAverageNumberOfDilutedSharesOutstanding" : "WeightedAverageNumberOfSharesOutstandingBasic";
  const out: Record<string, SecFact[]> = {};
  const add = (tag: string, f: SecFact) => (out[tag] ||= []).push(f);
  for (const eps of byTag.get(epsTag) ?? []) {
    const sh = byTag.get(shTag)?.find((x) => x.start === eps.start && x.end === eps.end);
    const n = ni(eps.start!, eps.end);
    if (!sh || !n || sh.val <= 0 || Math.abs((eps.val * sh.val) / n - 1) > 0.03) continue;
    add("EarningsPerShareDiluted", eps);
    add("WeightedAverageNumberOfDilutedSharesOutstanding", sh);
    if (def.diluted) {
      // BPA básico de la clase; sus acciones básicas no (en Visa son solo las de Clase A, sin convertir)
      const b = byTag.get("EarningsPerShareBasic")?.find((x) => x.start === eps.start && x.end === eps.end);
      if (b) add("EarningsPerShareBasic", b);
    } else {
      add("EarningsPerShareBasic", eps);
      add("WeightedAverageNumberOfSharesOutstandingBasic", sh);
    }
  }
  return out;
}

/**
 * Completa el BPA y las acciones de las empresas de CLASS_EPS. Modifica `merged`. Devuelve los
 * estados normalizados de nuevo si añadió algo (si no, null) y si quedan informes por leer.
 */
export async function fillClassEps(
  db: D1Database,
  ticker: string,
  merged: CompanyFacts,
  current: { annual: SecPeriod[]; quarterly: SecPeriod[] },
  fetchInstance: (f: Filing) => Promise<string | null>
): Promise<{ result: { annual: SecPeriod[]; quarterly: SecPeriod[] } | null; more: boolean }> {
  const def = CLASS_EPS[ticker];
  if (!def) return { result: null, more: false };
  const key = `classeps:${ticker}`;
  const row = await db.prepare("SELECT value FROM sec_meta WHERE key = ?").bind(key).first<{ value: string }>().catch(() => null);
  const cache: Cache = row?.value ? JSON.parse(row.value) : { checked: [], facts: {} };
  const hasFacts = () => Object.values(cache.facts).some((l) => l.length);
  inject(merged, cache.facts);
  let out = hasFacts() ? normalizeCompanyFacts(merged) : current;
  let changed = false;
  let more = false;
  const tried = new Set(cache.checked);
  for (let n = 0; ; n++) {
    const gaps = [...new Set(gapsOf([...out.annual, ...out.quarterly]))].sort().reverse();
    let filing: Filing | null = null;
    for (const d of gaps) if ((filing = originalFiling(merged, d, tried))) break;
    if (!filing) break;
    // Quedan informes: se siguen leyendo en la próxima sincronización
    if (n >= MAX_FILINGS || fetchBudgetLeft() < 8) {
      more = true;
      break;
    }
    tried.add(filing.accn);
    cache.checked.push(filing.accn);
    changed = true;
    const xml = await fetchInstance(filing).catch(() => null);
    if (!xml) continue;
    const facts = readFiling(xml, filing, def);
    for (const [tag, list] of Object.entries(facts)) {
      const dst = (cache.facts[tag] ||= []);
      for (const f of list) if (!dst.some((x) => x.start === f.start && x.end === f.end)) dst.push(f);
    }
    inject(merged, facts);
    out = normalizeCompanyFacts(merged);
  }
  if (changed) {
    await db
      .prepare("INSERT INTO sec_meta (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
      .bind(key, JSON.stringify(cache), Date.now())
      .run();
  }
  return { result: hasFacts() ? out : null, more };
}
