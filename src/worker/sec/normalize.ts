// Normaliza los datos XBRL de la SEC (API "companyfacts") en estados financieros por periodo.
//
// Fuente: 10-K (anual, auditado) y 10-Q (trimestral, revisado) de EDGAR. Los 8-K no entran aquí.
// La salida usa los mismos nombres de campo que Yahoo (totalRevenue, operatingIncome…) para que
// los modelos (src/utils/threeStatementModel.ts, bogleEngine.ts) funcionen sin cambios.
//
// Reglas:
//  - Para cada dato y periodo se toma el valor del informe más reciente (recoge reexpresiones).
//  - Trimestres: el 10-Q da 3 meses en la cuenta de resultados, pero el flujo de caja es acumulado
//    del año (6 y 9 meses). El trimestre se obtiene como acumulado − acumulado anterior.
//  - No hay 10-Q del 4º trimestre: se calcula como ejercicio − 9 meses (flujos). El balance es una
//    foto a fecha de cierre y se toma tal cual. El BPA del T4 = beneficio T4 / acciones medias T4.
//  - Cada concepto tiene una lista de etiquetas alternativas (las empresas no etiquetan igual).

export interface SecFact {
  start?: string;
  end: string;
  val: number;
  accn: string;
  fy?: number;
  fp?: string;
  form: string;
  filed: string;
  frame?: string;
}

export interface CompanyFacts {
  cik: number;
  entityName: string;
  facts: Record<string, Record<string, { units: Record<string, SecFact[]> }>>;
}

export interface SecPeriod {
  [key: string]: any;
  date: string; // fin del periodo (YYYY-MM-DD)
  startDate: string;
  periodType: "annual" | "quarterly";
  fiscalYear: number;
  fiscalQuarter: number | null; // 1–4 en trimestres
  form: string; // informe del que sale (10-K / 10-Q)
  filed: string;
  accn: string;
  source: "sec";
  derived: string[]; // campos calculados (T4 o trimestre desde acumulados)
}

type Kind = "duration" | "instant" | "perShare" | "shares";

interface ConceptDef {
  key: string; // nombre de campo de salida (estilo Yahoo)
  tags: string[]; // etiquetas us-gaap por prioridad
  kind: Kind;
  sign?: 1 | -1; // -1: Yahoo los guarda en negativo (pagos)
  // "max": el mayor valor entre las etiquetas (ingresos: hay empresas que usan "Revenues" para un
  // subtotal, p. ej. BlackRock, o para ingresos sin intereses, p. ej. American Express)
  pick?: "max";
  maxExclude?: string[]; // etiquetas que solo valen si no hay otra
}

// Capex con etiqueta propia de la empresa (nvda:, cop:…): companyfacts no la trae y capex.ts la
// lee de cada informe y la guarda bajo este nombre
export const EXT_CAPEX_TAG = "ExtensionCapitalExpenditure";

// Conceptos y etiquetas alternativas, por prioridad.
const CONCEPTS: ConceptDef[] = [
  // Cuenta de resultados
  // Ingresos con impuestos especiales incluidos (tabaco) solo si no hay cifra neta
  { key: "totalRevenue", kind: "duration", pick: "max", maxExclude: ["RevenueFromContractWithCustomerIncludingAssessedTax"], tags: ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "RevenuesNetOfInterestExpense", "SalesRevenueNet", "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueGoodsNet", "SalesRevenueServicesNet"] },
  { key: "costOfRevenue", kind: "duration", tags: ["CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsSold", "CostOfServices", "CostOfGoodsAndServiceExcludingDepreciationDepletionAndAmortization"] },
  { key: "grossProfit", kind: "duration", tags: ["GrossProfit"] },
  { key: "researchAndDevelopment", kind: "duration", tags: ["ResearchAndDevelopmentExpense", "ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost"] },
  { key: "sellingGeneralAndAdministration", kind: "duration", tags: ["SellingGeneralAndAdministrativeExpense", "GeneralAndAdministrativeExpense"] },
  { key: "operatingExpense", kind: "duration", tags: ["OperatingExpenses"] },
  { key: "operatingIncome", kind: "duration", tags: ["OperatingIncomeLoss"] },
  { key: "nonOperatingIncome", kind: "duration", tags: ["NonoperatingIncomeExpense"] },
  { key: "interestExpense", kind: "duration", tags: ["InterestExpense", "InterestExpenseNonoperating", "InterestExpenseDebt", "InterestAndDebtExpense"] },
  { key: "pretaxIncome", kind: "duration", tags: ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest", "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments", "IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic"] },
  { key: "taxProvision", kind: "duration", tags: ["IncomeTaxExpenseBenefit", "IncomeTaxExpenseBenefitContinuingOperations"] },
  { key: "netIncome", kind: "duration", tags: ["NetIncomeLoss", "ProfitLoss", "NetIncomeLossAvailableToCommonStockholdersBasic"] },
  { key: "netIncomeCommonStockholders", kind: "duration", tags: ["NetIncomeLossAvailableToCommonStockholdersBasic", "NetIncomeLoss"] },
  { key: "dilutedEPS", kind: "perShare", tags: ["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted"] },
  { key: "basicEPS", kind: "perShare", tags: ["EarningsPerShareBasic", "EarningsPerShareBasicAndDiluted"] },
  { key: "dilutedAverageShares", kind: "shares", tags: ["WeightedAverageNumberOfDilutedSharesOutstanding"] },
  { key: "basicAverageShares", kind: "shares", tags: ["WeightedAverageNumberOfSharesOutstandingBasic"] },
  { key: "reconciledDepreciation", kind: "duration", tags: ["DepreciationDepletionAndAmortization", "DepreciationAmortizationAndAccretionNet", "DepreciationAndAmortization", "Depreciation"] },
  { key: "stockBasedCompensation", kind: "duration", tags: ["ShareBasedCompensation", "AllocatedShareBasedCompensationExpense"] },

  // Flujo de caja
  { key: "operatingCashFlow", kind: "duration", tags: ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"] },
  { key: "capitalExpenditure", kind: "duration", sign: -1, tags: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets", "PaymentsForCapitalImprovements", "PaymentsToAcquireOtherPropertyPlantAndEquipment", "PaymentsToAcquireOtherProductiveAssets", EXT_CAPEX_TAG] },
  // Software desarrollado o comprado (Mastercard…) y compras de intangibles (software de ADP,
  // activos de programas de RTX, espectro de T-Mobile): inversión recurrente, entra en capex como
  // hace Yahoo. No entran las adquisiciones de empresas ni los equipos para arrendar (CAT, DE).
  { key: "capitalizedSoftware", kind: "duration", sign: -1, tags: ["PaymentsToDevelopSoftware", "PaymentsForSoftware", "PaymentsToAcquireSoftware"] },
  { key: "intangiblePurchases", kind: "duration", sign: -1, tags: ["PaymentsToAcquireIntangibleAssets"] },
  { key: "investingCashFlow", kind: "duration", tags: ["NetCashProvidedByUsedInInvestingActivities", "NetCashProvidedByUsedInInvestingActivitiesContinuingOperations"] },
  { key: "financingCashFlow", kind: "duration", tags: ["NetCashProvidedByUsedInFinancingActivities", "NetCashProvidedByUsedInFinancingActivitiesContinuingOperations"] },
  { key: "cashDividendsPaid", kind: "duration", sign: -1, tags: ["PaymentsOfDividendsCommonStock", "PaymentsOfDividends", "PaymentsOfOrdinaryDividends"] },
  { key: "repurchaseOfCapitalStock", kind: "duration", sign: -1, tags: ["PaymentsForRepurchaseOfCommonStock", "PaymentsForRepurchaseOfEquity"] },
  { key: "changesInCash", kind: "duration", tags: ["CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseExcludingExchangeRateEffect", "CashAndCashEquivalentsPeriodIncreaseDecrease"] },

  // Balance (a fecha de cierre)
  { key: "cashAndCashEquivalents", kind: "instant", tags: ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents", "Cash", "CashAndDueFromBanks"] },
  { key: "shortTermInvestments", kind: "instant", tags: ["ShortTermInvestments", "MarketableSecuritiesCurrent", "AvailableForSaleSecuritiesDebtSecuritiesCurrent"] },
  { key: "accountsReceivable", kind: "instant", tags: ["AccountsReceivableNetCurrent", "ReceivablesNetCurrent", "AccountsNotesAndLoansReceivableNetCurrent"] },
  { key: "inventory", kind: "instant", tags: ["InventoryNet", "InventoryFinishedGoodsNetOfReserves"] },
  { key: "currentAssets", kind: "instant", tags: ["AssetsCurrent"] },
  { key: "netPPE", kind: "instant", tags: ["PropertyPlantAndEquipmentNet", "PropertyPlantAndEquipmentAndFinanceLeaseRightOfUseAssetAfterAccumulatedDepreciationAndAmortization"] },
  { key: "goodwill", kind: "instant", tags: ["Goodwill"] },
  { key: "otherIntangibleAssets", kind: "instant", tags: ["IntangibleAssetsNetExcludingGoodwill", "FiniteLivedIntangibleAssetsNet"] },
  { key: "totalAssets", kind: "instant", tags: ["Assets"] },
  { key: "accountsPayable", kind: "instant", tags: ["AccountsPayableCurrent", "AccountsPayableAndAccruedLiabilitiesCurrent", "AccountsPayableTradeCurrent"] },
  { key: "currentLiabilities", kind: "instant", tags: ["LiabilitiesCurrent"] },
  { key: "longTermDebtCurrent", kind: "instant", tags: ["LongTermDebtCurrent", "LongTermDebtAndCapitalLeaseObligationsCurrent"] },
  // DebtCurrent ya incluye préstamos a corto y papel comercial: no se suma a ellos
  { key: "debtCurrent", kind: "instant", tags: ["DebtCurrent"] },
  { key: "shortTermBorrowings", kind: "instant", tags: ["ShortTermBorrowings", "CommercialPaper"] },
  { key: "longTermDebtNoncurrent", kind: "instant", tags: ["LongTermDebtNoncurrent", "LongTermDebtAndCapitalLeaseObligations", "LongTermNotesPayable"] },
  { key: "longTermDebtTotal", kind: "instant", tags: ["LongTermDebt", "DebtInstrumentCarryingAmount"] },
  { key: "totalLiabilitiesNetMinorityInterest", kind: "instant", tags: ["Liabilities"] },
  { key: "liabilitiesAndEquity", kind: "instant", tags: ["LiabilitiesAndStockholdersEquity"] },
  { key: "stockholdersEquity", kind: "instant", tags: ["StockholdersEquity"] },
  { key: "totalEquityWithMinority", kind: "instant", tags: ["StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"] },
  { key: "minorityInterest", kind: "instant", tags: ["MinorityInterest"] },
  { key: "temporaryEquity", kind: "instant", tags: ["RedeemableNoncontrollingInterestEquityCarryingAmount", "TemporaryEquityCarryingAmountIncludingPortionAttributableToNoncontrollingInterests", "TemporaryEquityCarryingAmountAttributableToParent"] },
  { key: "ordinarySharesNumber", kind: "instant", tags: ["CommonStockSharesOutstanding"] },
];

const DAY = 86400000;
const t = (d: string) => Date.parse(d + "T00:00:00Z");
const days = (a: string, b: string) => Math.round((t(b) - t(a)) / DAY);
const nextDay = (d: string) => new Date(t(d) + DAY).toISOString().slice(0, 10);
const ALLOWED = new Set(["10-K", "10-K/A", "10-Q", "10-Q/A", "10-KT", "10-KT/A"]);

interface Picked { val: number; filed: string; form: string; accn: string }

/** Último valor presentado para cada (inicio, fin) o (fin) de una etiqueta. */
function indexTag(facts: SecFact[] | undefined, instant: boolean): Map<string, Picked> {
  const m = new Map<string, Picked>();
  for (const f of facts || []) {
    if (!ALLOWED.has(f.form) || typeof f.val !== "number") continue;
    if (instant ? f.start : !f.start) continue;
    const k = instant ? f.end : `${f.start}|${f.end}`;
    const prev = m.get(k);
    if (!prev || f.filed > prev.filed) m.set(k, { val: f.val, filed: f.filed, form: f.form, accn: f.accn });
  }
  return m;
}

function unitFacts(cf: CompanyFacts, tag: string, kind: Kind): SecFact[] | undefined {
  const node = cf.facts["us-gaap"]?.[tag];
  if (!node) return undefined;
  const units = node.units || {};
  if (kind === "perShare") return units["USD/shares"];
  if (kind === "shares") return units["shares"];
  return units["USD"];
}

interface FiscalYear { start: string; end: string; quarterEnds: string[] }

/** Ejercicios fiscales (duración ~1 año en 10-K) y cierres de trimestre (10-Q) de cada uno. */
function detectFiscalYears(cf: CompanyFacts): FiscalYear[] {
  const years = new Map<string, FiscalYear>();
  const anchorTags = ["NetIncomeLoss", "Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "NetCashProvidedByUsedInOperatingActivities", "ProfitLoss"];
  const qEnds = new Set<string>();
  for (const tag of anchorTags) {
    for (const f of unitFacts(cf, tag, "duration") || []) {
      if (!f.start || !ALLOWED.has(f.form)) continue;
      const d = days(f.start, f.end);
      if (d >= 350 && d <= 380 && f.form.startsWith("10-K")) years.set(f.end, { start: f.start, end: f.end, quarterEnds: [] });
      if (f.form.startsWith("10-Q") && d >= 80) qEnds.add(f.end);
    }
  }
  const list = [...years.values()].sort((a, b) => a.end.localeCompare(b.end));
  // Ejercicio en curso (aún sin 10-K): se infiere a partir del último cierre conocido.
  const last = list[list.length - 1];
  if (last) {
    const nextEnd = new Date(t(last.end) + 364 * DAY).toISOString().slice(0, 10);
    const pending = [...qEnds].some((e) => e > last.end);
    if (pending && !years.has(nextEnd)) list.push({ start: nextDay(last.end), end: nextEnd, quarterEnds: [] });
  }
  for (const fy of list) {
    fy.quarterEnds = [...qEnds]
      .filter((e) => t(e) > t(fy.start) + 60 * DAY && t(e) < t(fy.end) - 30 * DAY)
      .sort()
      // un único cierre por trimestre (descarta cierres a pocos días de otro)
      .filter((e, i, arr) => i === 0 || days(arr[i - 1], e) > 60)
      .slice(0, 3);
  }
  return list;
}

export interface NormalizeOptions {
  annualYears?: number; // ejercicios a devolver (por defecto 11: unos 10 años para los segmentos anuales)
  quarters?: number; // trimestres a devolver (por defecto 14)
}

export function normalizeCompanyFacts(cf: CompanyFacts, opts: NormalizeOptions = {}): { annual: SecPeriod[]; quarterly: SecPeriod[] } {
  const fys = detectFiscalYears(cf);
  const annualYears = opts.annualYears ?? 11;
  // ~11 años de trimestres (los modelos reciben 14, MODEL_QUARTERS en legacy/routes.ts; la pestaña
  // Valoración y la tabla de Estados financieros, todos)
  const nQuarters = opts.quarters ?? 44;

  // Índices por etiqueta
  const idx = new Map<string, Map<string, Picked>>();
  for (const c of CONCEPTS) {
    for (const tag of c.tags) {
      const key = `${c.kind}:${tag}`;
      if (!idx.has(key)) idx.set(key, indexTag(unitFacts(cf, tag, c.kind), c.kind === "instant"));
    }
  }
  const getDur = (c: ConceptDef, start: string, end: string): Picked | undefined => {
    if (c.pick === "max") {
      let best: Picked | undefined;
      for (const tag of c.tags) {
        if (c.maxExclude?.includes(tag)) continue;
        const v = idx.get(`${c.kind}:${tag}`)!.get(`${start}|${end}`);
        if (v && (!best || v.val > best.val)) best = v;
      }
      if (best) return best;
    }
    for (const tag of c.tags) {
      const v = idx.get(`${c.kind}:${tag}`)!.get(`${start}|${end}`);
      if (v) return v;
    }
    return undefined;
  };
  const getInst = (c: ConceptDef, end: string): Picked | undefined => {
    for (const tag of c.tags) {
      const v = idx.get(`instant:${tag}`)!.get(end);
      if (v) return v;
    }
    return undefined;
  };

  const annual: SecPeriod[] = [];
  const quarterly: SecPeriod[] = [];

  for (const fy of fys) {
    const fiscalYear = Number(fy.end.slice(0, 4));
    const isComplete = fys.indexOf(fy) < fys.length - 1 || getDur(CONCEPTS[0], fy.start, fy.end) !== undefined || getDur(CONCEPTS.find((c) => c.key === "netIncome")!, fy.start, fy.end) !== undefined;

    // --- Ejercicio completo ---
    if (isComplete) {
      const p: SecPeriod = { date: fy.end, startDate: fy.start, periodType: "annual", fiscalYear, fiscalQuarter: null, form: "", filed: "", accn: "", source: "sec", derived: [] };
      for (const c of CONCEPTS) {
        const v = c.kind === "instant" ? getInst(c, fy.end) : getDur(c, fy.start, fy.end);
        if (!v) continue;
        p[c.key] = c.sign === -1 ? -Math.abs(v.val) : v.val;
        if (v.filed > p.filed && v.form.startsWith("10-K")) Object.assign(p, { filed: v.filed, form: v.form, accn: v.accn });
        if ((c.kind === "perShare" || c.kind === "shares") && v.filed > (p.perShareFiled ?? "")) p.perShareFiled = v.filed;
      }
      if (p.totalRevenue !== undefined || p.netIncome !== undefined) annual.push(finish(p));
    }

    // --- Trimestres ---
    const ends = [...fy.quarterEnds, ...(isComplete ? [fy.end] : [])];
    let prevEnd: string | null = null;
    const qVals: Record<string, number>[] = [];
    ends.forEach((qEnd, qi) => {
      const qStart = prevEnd ? nextDay(prevEnd) : fy.start;
      const isQ4 = qEnd === fy.end;
      const p: SecPeriod = { date: qEnd, startDate: qStart, periodType: "quarterly", fiscalYear, fiscalQuarter: qi + 1, form: "", filed: "", accn: "", source: "sec", derived: [] };
      for (const c of CONCEPTS) {
        if (c.kind === "instant") {
          const v = getInst(c, qEnd);
          if (v) { p[c.key] = v.val; track(p, v); }
          continue;
        }
        // Valor directo de 3 meses
        let direct = c.kind !== "perShare" || !isQ4 ? getDur(c, qStart, qEnd) : undefined;
        if (direct) {
          p[c.key] = c.sign === -1 ? -Math.abs(direct.val) : direct.val;
          track(p, direct);
          if ((c.kind === "perShare" || c.kind === "shares") && direct.filed > (p.perShareFiled ?? "")) p.perShareFiled = direct.filed;
          continue;
        }
        if (c.kind === "perShare") continue; // el BPA del T4 se calcula en finishQuarter
        if (c.kind === "shares") {
          // Acciones medias del T4: 4 × anual − (T1 + T2 + T3), si están los tres.
          if (isQ4 && qi === 3) {
            const fyV = getDur(c, fy.start, fy.end);
            const prev = qVals.map((q) => q[c.key]);
            if (fyV && prev.length === 3 && prev.every((x) => typeof x === "number")) {
              // Con un split por medio, los trimestres pueden venir en unidades distintas que el año
              // (Nvidia FY2024: unos antes y otros después del 10:1); entonces, la media anual
              const sameUnits = prev.every((x) => x > fyV.val * 0.67 && x < fyV.val * 1.5);
              const q4 = 4 * fyV.val - prev.reduce((s, x) => s + x, 0);
              p[c.key] = sameUnits && q4 > fyV.val * 0.67 && q4 < fyV.val * 1.5 ? q4 : fyV.val;
              p.derived.push(c.key);
              if (fyV.filed > (p.perShareFiled ?? "")) p.perShareFiled = fyV.filed;
            }
          }
          continue;
        }
        // Acumulado del ejercicio hasta este cierre − acumulado hasta el cierre anterior
        const cum = getDur(c, fy.start, qEnd);
        if (!cum) continue;
        if (!prevEnd) {
          p[c.key] = c.sign === -1 ? -Math.abs(cum.val) : cum.val;
          track(p, cum);
          continue;
        }
        const cumPrev = getDur(c, fy.start, prevEnd);
        if (cumPrev) {
          const v = cum.val - cumPrev.val;
          p[c.key] = c.sign === -1 ? -Math.abs(v) : v;
          p.derived.push(c.key);
          track(p, cum);
        } else if (qVals.length === qi) {
          // sin acumulado previo: suma de los trimestres anteriores ya calculados
          const prevSum = qVals.reduce((s, q) => s + (typeof q[c.key] === "number" ? (c.sign === -1 ? Math.abs(q[c.key]) : q[c.key]) : NaN), 0);
          if (Number.isFinite(prevSum)) {
            const v = (c.sign === -1 ? Math.abs(cum.val) : cum.val) - prevSum;
            p[c.key] = c.sign === -1 ? -Math.abs(v) : v;
            p.derived.push(c.key);
            track(p, cum);
          }
        }
      }
      // BPA del trimestre calculado (T4): beneficio / acciones medias del trimestre
      // Sin "beneficio para accionistas comunes" trimestral (Broadcom), el beneficio neto
      const niCommon = typeof p.netIncomeCommonStockholders === "number" ? p.netIncomeCommonStockholders : typeof p.netIncome === "number" ? p.netIncome : undefined;
      if (p.dilutedEPS === undefined && niCommon !== undefined && p.dilutedAverageShares > 0) {
        p.dilutedEPS = round4(niCommon / p.dilutedAverageShares);
        p.derived.push("dilutedEPS");
      }
      if (p.basicEPS === undefined && niCommon !== undefined && p.basicAverageShares > 0) {
        p.basicEPS = round4(niCommon / p.basicAverageShares);
        p.derived.push("basicEPS");
      }
      qVals.push({ ...p });
      if (p.totalRevenue !== undefined || p.netIncome !== undefined) quarterly.push(finish(p));
      prevEnd = qEnd;
    });
  }

  // Informe de origen de cada periodo: el primero que lo publicó (10-Q del trimestre, o el 10-K
  // para el ejercicio y su T4). Los informes posteriores lo repiten como comparativo; si cambian
  // alguna cifra (reexpresión), esa cifra manda y su fecha queda en lastFiled.
  const origin = originalFilings(cf);
  for (const p of [...annual, ...quarterly]) {
    p.lastFiled = p.filed;
    const o = origin.get(p.date);
    if (o) Object.assign(p, o);
  }

  annual.sort((a, b) => b.date.localeCompare(a.date));
  quarterly.sort((a, b) => b.date.localeCompare(a.date));
  return { annual: annual.slice(0, annualYears), quarterly: quarterly.slice(0, nQuarters) };
}

function originalFilings(cf: CompanyFacts): Map<string, { form: string; filed: string; accn: string }> {
  const out = new Map<string, { form: string; filed: string; accn: string }>();
  for (const tag of ["NetIncomeLoss", "ProfitLoss", "Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "Assets"]) {
    for (const f of cf.facts["us-gaap"]?.[tag]?.units?.USD ?? []) {
      if (!ALLOWED.has(f.form)) continue;
      const cur = out.get(f.end);
      if (!cur || f.filed < cur.filed) out.set(f.end, { form: f.form, filed: f.filed, accn: f.accn });
    }
  }
  return out;
}

function track(p: SecPeriod, v: Picked) {
  if (v.filed > p.filed) Object.assign(p, { filed: v.filed, form: v.form, accn: v.accn });
}

const round4 = (x: number) => Math.round(x * 10000) / 10000;

/** Campos derivados comunes (deuda total, márgenes de Yahoo…). */
function finish(p: SecPeriod): SecPeriod {
  const n = (k: string) => (typeof p[k] === "number" ? (p[k] as number) : undefined);
  if (p.grossProfit === undefined && n("totalRevenue") !== undefined && n("costOfRevenue") !== undefined) {
    p.grossProfit = n("totalRevenue")! - n("costOfRevenue")!;
    p.derived.push("grossProfit");
  }
  // Deuda: corriente (vencimientos a corto + préstamos a corto) y no corriente
  // Lo habitual son dos líneas (vencimientos a corto de la deuda + préstamos a corto). DebtCurrent
  // (que ya suma ambas) solo si la empresa no publica ninguna de las dos (Lilly).
  const hasLines = n("longTermDebtCurrent") !== undefined || n("shortTermBorrowings") !== undefined;
  const cur = hasLines ? (n("longTermDebtCurrent") ?? 0) + (n("shortTermBorrowings") ?? 0) : n("debtCurrent") ?? 0;
  const hasCur = n("debtCurrent") !== undefined || n("longTermDebtCurrent") !== undefined || n("shortTermBorrowings") !== undefined;
  if (hasCur) p.currentDebt = cur;
  if (n("longTermDebtNoncurrent") !== undefined) {
    p.longTermDebt = n("longTermDebtNoncurrent");
    p.totalDebt = (p.longTermDebt as number) + cur;
  } else if (n("longTermDebtTotal") !== undefined) {
    // LongTermDebt incluye su parte corriente; se suman los préstamos a corto
    p.totalDebt = n("longTermDebtTotal")! + (n("shortTermBorrowings") ?? (n("debtCurrent") !== undefined ? Math.max(0, n("debtCurrent")! - (n("longTermDebtCurrent") ?? 0)) : 0));
    p.longTermDebt = Math.max(0, n("longTermDebtTotal")! - (n("longTermDebtCurrent") ?? 0));
  }
  if (p.totalDebt !== undefined) p.derived.push("totalDebt");
  // Pasivo total si la empresa no lo publica: pasivo + patrimonio − patrimonio (con minoritarios)
  if (p.totalLiabilitiesNetMinorityInterest === undefined && n("liabilitiesAndEquity") !== undefined) {
    const eq = n("totalEquityWithMinority") ?? ((n("stockholdersEquity") ?? NaN) + (n("minorityInterest") ?? 0));
    if (Number.isFinite(eq)) {
      p.totalLiabilitiesNetMinorityInterest = n("liabilitiesAndEquity")! - eq;
      p.derived.push("totalLiabilitiesNetMinorityInterest");
    }
  }
  if (n("goodwill") !== undefined || n("otherIntangibleAssets") !== undefined) {
    p.goodwillAndOtherIntangibleAssets = (n("goodwill") ?? 0) + (n("otherIntangibleAssets") ?? 0);
  }
  if (n("capitalExpenditure") !== undefined && (n("capitalizedSoftware") !== undefined || n("intangiblePurchases") !== undefined)) {
    p.capitalExpenditure = n("capitalExpenditure")! + (n("capitalizedSoftware") ?? 0) + (n("intangiblePurchases") ?? 0); // en negativo
    p.derived.push("capitalExpenditure");
  }
  if (n("operatingCashFlow") !== undefined && n("capitalExpenditure") !== undefined) {
    p.freeCashFlow = n("operatingCashFlow")! + n("capitalExpenditure")!; // capex en negativo
    p.derived.push("freeCashFlow");
  }
  if (n("pretaxIncome") && n("taxProvision") !== undefined && n("pretaxIncome")! > 0) {
    p.taxRateForCalcs = round4(n("taxProvision")! / n("pretaxIncome")!);
  }
  // Patrimonio de la dominante si solo se publica con minoritarios incluidos (P&G, Visa, UnitedHealth)
  if (p.stockholdersEquity === undefined && n("totalEquityWithMinority") !== undefined) {
    p.stockholdersEquity = n("totalEquityWithMinority")! - (n("minorityInterest") ?? 0);
    p.derived.push("stockholdersEquity");
  }
  // Capital "temporal" (minoritarios rescatables, UnitedHealth): ni pasivo ni patrimonio en el
  // balance. Se suma a minoritarios, que el DCF resta del valor de empresa como los demás.
  if (n("temporaryEquity") && !p.derived.includes("totalLiabilitiesNetMinorityInterest")) {
    p.minorityInterest = (n("minorityInterest") ?? 0) + n("temporaryEquity")!;
    p.derived.push("minorityInterest");
  }
  // Beneficio operativo si no se publica (Lilly): antes de impuestos − resultado no operativo
  if (p.operatingIncome === undefined && n("pretaxIncome") !== undefined && n("nonOperatingIncome") !== undefined) {
    p.operatingIncome = n("pretaxIncome")! - n("nonOperatingIncome")!;
    p.derived.push("operatingIncome");
  }
  if (n("operatingIncome") !== undefined) p.EBIT = n("operatingIncome");
  if (n("operatingIncome") !== undefined && n("reconciledDepreciation") !== undefined) {
    p.EBITDA = n("operatingIncome")! + n("reconciledDepreciation")!;
  }
  return p;
}

/**
 * Une los datos de varios CIK de una misma empresa (p. ej. ExxonMobil: holding nueva + sociedad
 * anterior). Las cifras se juntan por etiqueta y unidad; al normalizar manda el informe más
 * reciente de cada periodo, así que los solapes se resuelven solos.
 */
export function mergeCompanyFacts(list: CompanyFacts[]): CompanyFacts {
  if (list.length === 1) return list[0];
  const out: CompanyFacts = { cik: list[0].cik, entityName: list[0].entityName, facts: {} };
  for (const cf of list) {
    for (const [ns, tags] of Object.entries(cf.facts || {})) {
      const dst = (out.facts[ns] ||= {});
      for (const [tag, node] of Object.entries(tags)) {
        const d = (dst[tag] ||= { units: {} });
        for (const [unit, facts] of Object.entries(node.units || {})) {
          d.units[unit] = (d.units[unit] || []).concat(facts);
        }
      }
    }
  }
  return out;
}
