// Capex con etiqueta propia de la empresa. La API companyfacts solo trae etiquetas estándar, y
// algunas empresas declaran el capex con una suya en ciertos años (Nvidia hasta 2022:
// nvda:PurchasesOfPropertyAndEquipmentAndIntangibleAssets; ConocoPhillips desde 2023:
// cop:PaymentToAcquireProductiveAssetsAndInvestments). Sin capex no hay flujo de caja libre.
//
// Si una empresa tiene capex en unos periodos y en otros no (con flujo operativo), se lee el XBRL
// del informe original de esos periodos y se toma su etiqueta propia de capex, si hay una sola.
// Lo leído se guarda en sec_meta ("capex:TICKER") para no volver a descargarlo.

import { fetchBudgetLeft } from "./client";
import { EXT_CAPEX_TAG, normalizeCompanyFacts, type CompanyFacts, type SecFact, type SecPeriod } from "./normalize";
import { parseExtensionFacts } from "./xbrl";
import type { Filing } from "./sync";

const CAPEX_NAME = /^(?:(?:Payments?(?:To|For)(?:Acquire|Purchase)?|Purchases?(?:Of|RelatedTo)?|AdditionsTo)\w*?(?:PropertyPlant|PropertyAnd|PropertyEquipment|ProductiveAssets|FixedAssets)\w*|CapitalExpenditures?)$/;
const NOT_CAPEX = /Financ|Proceeds|Accru|Incurred|NotYetPaid|Business|Segment|Policy|Sale|Disposi|Deposit|Lease|Increase|Decrease|Capitalized|Noncash|Commitment/;
export const isCapexName = (tag: string) => CAPEX_NAME.test(tag) && !NOT_CAPEX.test(tag);

const MAX_FILINGS = 6; // informes por sincronización (cada uno, 1-3 conexiones)
const OCF_TAGS = ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"];

interface Cache { checked: string[]; facts: SecFact[] }

const gapsOf = (periods: SecPeriod[]) => periods.filter((p) => typeof p.operatingCashFlow === "number" && typeof p.capitalExpenditure !== "number").map((p) => p.date);

function inject(merged: CompanyFacts, facts: SecFact[]) {
  if (!facts.length) return;
  const gaap = (merged.facts["us-gaap"] ||= {});
  const list = ((gaap[EXT_CAPEX_TAG] ||= { units: {} }).units.USD ||= []);
  for (const f of facts) if (!list.some((x) => x.start === f.start && x.end === f.end)) list.push(f);
}

/** Informe original (el primero presentado) del flujo operativo con cierre en `end`. */
function originalFiling(merged: CompanyFacts, end: string, skip: Set<string>): Filing | null {
  let best: SecFact | null = null;
  for (const tag of OCF_TAGS) {
    for (const f of merged.facts["us-gaap"]?.[tag]?.units?.USD ?? []) {
      if (f.end !== end || !f.start || skip.has(f.accn) || !/^10-[KQ]/.test(f.form)) continue;
      if (!best || f.filed < best.filed) best = f;
    }
  }
  return best ? { accn: best.accn, form: best.form, filed: best.filed, period: end, doc: "" } : null;
}

/**
 * Completa el capex que falta con la etiqueta propia de la empresa. Modifica `merged` y devuelve
 * los estados normalizados de nuevo si añadió algo (si no, null).
 */
export async function fillExtensionCapex(
  db: D1Database,
  ticker: string,
  merged: CompanyFacts,
  current: { annual: SecPeriod[]; quarterly: SecPeriod[] },
  fetchInstance: (f: Filing) => Promise<string | null>
): Promise<{ annual: SecPeriod[]; quarterly: SecPeriod[] } | null> {
  const all = [...current.annual, ...current.quarterly];
  // Sin capex en ningún periodo (bancos, aseguradoras): no aplica
  if (!all.some((p) => typeof p.capitalExpenditure === "number")) return null;
  const key = `capex:${ticker}`;
  const row = await db.prepare("SELECT value FROM sec_meta WHERE key = ?").bind(key).first<{ value: string }>().catch(() => null);
  const cache: Cache = row?.value ? JSON.parse(row.value) : { checked: [], facts: [] };
  inject(merged, cache.facts);
  let out = cache.facts.length ? normalizeCompanyFacts(merged) : current;
  let changed = false;
  const tried = new Set(cache.checked);
  for (let n = 0; n < MAX_FILINGS; n++) {
    // Del periodo más reciente al más antiguo: cada informe trae también el año anterior (10-K: dos)
    const gaps = [...new Set(gapsOf([...out.annual, ...out.quarterly]))].sort().reverse();
    let filing: Filing | null = null;
    for (const d of gaps) if ((filing = originalFiling(merged, d, tried))) break;
    if (!filing || fetchBudgetLeft() < 8) break;
    tried.add(filing.accn);
    cache.checked.push(filing.accn);
    changed = true;
    const xml = await fetchInstance(filing).catch(() => null);
    if (!xml) continue;
    const byTag = parseExtensionFacts(xml, filing, isCapexName);
    // Solo si hay una única etiqueta de capex en el informe (si hay varias, no se sabe cuál es el total)
    if (byTag.size !== 1) continue;
    const facts = [...byTag.values()][0];
    cache.facts.push(...facts.filter((f) => !cache.facts.some((x) => x.start === f.start && x.end === f.end)));
    inject(merged, facts);
    out = normalizeCompanyFacts(merged);
  }
  if (changed) {
    await db
      .prepare("INSERT INTO sec_meta (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
      .bind(key, JSON.stringify(cache), Date.now())
      .run();
  }
  return cache.facts.length ? out : null;
}
