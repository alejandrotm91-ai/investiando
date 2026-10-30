// src/utils/threeStatementModel.ts
// Motor del modelo de 3 estados (resultados, balance y flujo de caja) y de la valoración DCF.
// Metodología: AGENTS.md (memoria de cálculo DCF).
//
// Principios:
//  - Solo datos reportados. Los periodos vacíos de Yahoo (ingresos 0 o nulos) se descartan y las
//    partidas que faltan valen 0; nunca se inventan como % de ventas.
//  - Las proyecciones dependen de las ventas: margen operativo, capex, D&A y circulante son % de
//    ingresos que evolucionan de forma lineal desde el último dato (TTM) hasta el objetivo del año 5.
//  - El crecimiento se normaliza (AGENTS.md §2.3): recorte del 30 % si supera el 40 %, tope del 25 %.
//  - El balance proyectado cuadra por construcción: caja = caja anterior + flujo operativo − capex −
//    remuneración al accionista ± deuda, y el patrimonio crece con el beneficio retenido.
//  - El DCF descuenta el flujo de caja libre NO apalancado (FCFF = EBIT·(1−t) + D&A − capex − ΔNWC)
//    al WACC por CAPM; la deuda se resta después, en el equity bridge.
//  - La compensación en acciones (SBC) no se suma al flujo operativo proyectado: es un coste real.

export interface StatementPeriod {
  yearLabel: string;
  isHistorical: boolean;
  isTTM?: boolean;
  periodType?: "annual" | "quarterly" | "ttm";
  date?: string;

  // Estado de resultados
  revenue: number;
  revenueGrowth: number; // decimal
  costOfRevenue: number;
  grossProfit: number;
  grossMargin: number;
  operatingExpenses: number;
  operatingIncome: number; // EBIT
  operatingMargin: number;
  depreciationAmortization: number;
  netInterestExpense: number;
  preTaxIncome: number;
  taxExpense: number;
  taxRate: number;
  netIncome: number;
  netMargin: number;

  // Balance
  cashAndEquivalents: number;
  accountsReceivable: number;
  inventory: number;
  otherCurrentAssets: number;
  totalCurrentAssets: number;
  netPPE: number;
  goodwillAndIntangibles: number;
  otherNonCurrentAssets: number;
  totalAssets: number;

  accountsPayable: number;
  shortTermDebt: number;
  otherCurrentLiabilities: number;
  totalCurrentLiabilities: number;
  longTermDebt: number;
  totalDebt: number;
  otherNonCurrentLiabilities: number;
  totalLiabilities: number;
  stockholdersEquity: number;
  totalLiabilitiesAndEquity: number;
  balanceDiscrepancy: number; // Activos − (Pasivos + Patrimonio + minoritarios)

  // Flujo de caja
  netIncomeCF: number;
  depreciationCF: number;
  changeInWorkingCapital: number; // aumento del circulante (resta caja)
  operatingCashFlow: number;
  capitalExpenditures: number; // en positivo
  freeCashFlow: number; // FCF apalancado = OCF − capex
  investingCashFlow: number;
  debtNetIssuance: number;
  equityRepurchaseDividends: number; // dividendos + recompras (en positivo)
  financingCashFlow: number;
  netChangeInCash: number;
  endingCash: number;

  // Ratios
  currentRatio: number;
  netDebt: number;
  netDebtToEbitda: number;
  interestCoverage: number;
  debtToEquity: number;
  fcfConversion: number; // FCF / beneficio neto

  // Extras
  fcff?: number; // flujo de caja libre no apalancado
  stockBasedCompensation?: number;
  minorityInterest?: number;
}

export interface CurrentYearStatus {
  hasPartialYear: boolean;
  quartersReportedCount: number;
  quartersRemainingCount: number;
  currentFiscalYearLabel: string;
  latestAnnualDate: string;
  latestQuarterDate: string;
  quartersReportedLabels: string[];
  ytdRevenue: number;
  ytdOperatingIncome: number;
  ytdNetIncome: number;
  ytdOcf: number;
  ytdCapex: number;
  ytdFcf: number;
  ttmRevenue: number;
  ttmOperatingIncome: number;
  ttmNetIncome: number;
  ttmOcf: number;
  ttmCapex: number;
  ttmFcf: number;
  ttmCash: number;
  ttmDebt: number;
  estimatedFullYearRevenue: number;
  estimatedFullYearFcf: number;
}

/** CAGR históricos en %. NaN cuando no hay datos suficientes. */
export interface HistoricalCAGRs {
  revenueCAGR: number;
  costOfRevenueCAGR: number;
  grossProfitCAGR: number;
  operatingExpensesCAGR: number;
  operatingIncomeCAGR: number;
  netIncomeCAGR: number;
  depreciationCAGR: number;
  capexCAGR: number;
  fcfCAGR: number;
  operatingCashFlowCAGR: number;
}

export interface ModelAssumptions {
  scenario: "base" | "bull" | "bear" | "custom";
  historicalCAGRs?: HistoricalCAGRs;
  revenueGrowthRate: number; // % crecimiento de ventas en la fase 1 (años 1–5)
  operatingMarginTarget: number; // % margen EBIT que se alcanza en el año 5
  grossMarginTarget: number; // % (informativo: el gasto operativo se mantiene en % de ventas)
  taxRateTarget: number; // % tipo efectivo
  capexPercentRevenue: number; // % capex/ventas en el año 5
  deprecPercentRevenue: number; // % D&A/ventas en el año 5
  nwcPercentRevenue: number; // % circulante operativo / ventas (informativo, sale del balance)
  costOfDebtInterestRate: number; // % coste bruto de la deuda
  annualDebtRepaymentPct?: number; // obsoleto: la deuda se mantiene
  dividendPayoutRatio: number; // % del beneficio que se reparte (dividendos + recompras)

  discountRateWacc: number; // %
  terminalGrowthRate: number; // %
  dilutedShares: number;
  riskFreeRate: number; // %
  equityRiskPremium: number; // %
  beta: number; // beta usada en el CAPM (ajustada)
}

export interface DCFFlag {
  level: "ok" | "warn" | "bad";
  text: string;
}

export interface DCFValuationResult {
  pvFcfList: { year: number; fcf: number; growth: number; discountFactor: number; pv: number }[];
  sumPvFcf: number;
  terminalFcf: number;
  terminalValueGross: number;
  pvTerminalValue: number;
  pctTerminalValue: number;
  enterpriseValue: number;
  totalDebt: number;
  totalCash: number;
  netDebt: number;
  minorityInterest: number;
  equityValue: number;
  fairValuePerShare: number;
  currentPrice: number;
  upsideDownsidePct: number;
  calculatedWacc: number;
  costOfEquity: number;
  costOfDebtNet: number;
  weightEquity: number;
  weightDebt: number;
  terminalGrowthUsed: number; // %
  phase2Growth: { start: number; end: number }; // %
  impliedEvEbitda: number | null;
  marketEvEbitda: number | null;
  terminalExitMultiple: number | null; // VT / EBITDA del año 10
  sensitivityMatrix: { wacc: number; terminalGrowth: number; fairValue: number; valid: boolean }[][];
  isTerminalValid: boolean;
  flags: DCFFlag[];
}

export interface ModelCalibration {
  revenueCagr: number | null; // %
  latestYoY: number | null; // %
  latestQuarterYoY: number | null; // %
  growthRaw: number | null; // %
  growthNormalized: number; // %
  growthNotes: string[];
  grossMargin: number; // %
  opMargin: number; // %
  daPct: number; // % (último dato)
  daTarget: number; // % (año 5)
  capexPct: number; // % (último dato)
  capexHistAvg: number; // %
  capexTarget: number; // % (año 5)
  nwcPct: number; // %
  taxRate: number; // %
  taxSource: string;
  costOfDebt: number; // %
  payoutRatio: number; // %
  sbcPct: number; // % SBC / ventas
  beta: number | null;
  betaAdjusted: number;
  riskFreeRate: number; // %
  equityRiskPremium: number; // %
  costOfEquity: number; // %
  costOfDebtNet: number; // %
  weightEquity: number; // %
  weightDebt: number; // %
  waccRaw: number; // %
  wacc: number; // %
  waccNote: string | null;
  dilutedShares: number;
  sharesSource: string;
  terminalGrowth: number; // %
  minorityInterest: number;
  marketCap: number;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000;

function num(v: any): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round1 = (v: number) => Math.round(v * 10) / 10;
const time = (d: any) => new Date(d).getTime();

/** Periodos válidos (con ingresos), sin fechas repetidas, del más reciente al más antiguo. */
export function cleanPeriods(rows: any[] | undefined | null): any[] {
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  return rows
    .filter((p) => p && p.date && !isNaN(time(p.date)) && (num(p.totalRevenue) ?? 0) > 0)
    .sort((a, b) => time(b.date) - time(a.date))
    .filter((p) => {
      const key = String(p.date).slice(0, 10);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function fiscalYearOf(dateStr: string): number {
  const d = new Date(dateStr);
  return d.getUTCFullYear();
}

function monthLabel(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return `${months[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(-2)}`;
}

function quarterLabel(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "Qtr";
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `Q${q}'${String(d.getUTCFullYear()).slice(-2)} (${monthLabel(dateStr)})`;
}

/** Convierte un periodo de Yahoo en un StatementPeriod sin inventar partidas. */
function statementFromRaw(
  p: any,
  prevRevenue: number | undefined,
  yearLabel: string,
  periodType: "annual" | "quarterly",
  prevCash?: number
): StatementPeriod {
  const rev = num(p.totalRevenue) ?? 0;
  const reportedGross = num(p.grossProfit);
  const reportedCost = num(p.costOfRevenue);
  const costOfRevenue = reportedCost ?? (reportedGross !== undefined ? rev - reportedGross : 0);
  const grossProfit = reportedGross ?? rev - costOfRevenue;
  const opInc = num(p.operatingIncome) ?? num(p.EBIT) ?? 0;
  const opEx = num(p.operatingExpense) ?? grossProfit - opInc;
  const da = Math.abs(num(p.reconciledDepreciation) ?? num(p.depreciationAndAmortization) ?? 0);
  const interest = Math.abs(num(p.interestExpense) ?? 0);
  const preTax = num(p.pretaxIncome) ?? opInc - interest;
  const taxExp = num(p.taxProvision) ?? 0;
  const netInc = num(p.netIncomeCommonStockholders) ?? num(p.netIncome) ?? preTax - taxExp;

  const cash = num(p.cashAndCashEquivalents) ?? 0;
  const ar = num(p.accountsReceivable) ?? num(p.receivables) ?? 0;
  const inv = num(p.inventory) ?? 0;
  const totalCA = num(p.currentAssets) ?? cash + ar + inv;
  const otherCA = Math.max(0, totalCA - cash - ar - inv);
  const netPPE = num(p.netPPE) ?? 0;
  const gw = num(p.goodwillAndOtherIntangibleAssets) ?? 0;
  const totalAssets = num(p.totalAssets) ?? totalCA + netPPE + gw;
  const otherNCA = totalAssets - totalCA - netPPE - gw;

  const ap = num(p.accountsPayable) ?? num(p.payables) ?? 0;
  const stDebt = num(p.currentDebt) ?? num(p.currentDebtAndCapitalLeaseObligation) ?? 0;
  const totalDebt = num(p.totalDebt) ?? stDebt + (num(p.longTermDebt) ?? 0);
  const ltDebt = Math.max(0, totalDebt - stDebt);
  const totalCL = num(p.currentLiabilities) ?? ap + stDebt;
  const otherCL = Math.max(0, totalCL - ap - stDebt);
  const equity = num(p.stockholdersEquity) ?? num(p.commonStockEquity) ?? 0;
  const minority = num(p.minorityInterest) ?? 0;
  const totalLiab = num(p.totalLiabilitiesNetMinorityInterest) ?? totalAssets - equity - minority;
  const otherNCL = totalLiab - totalCL - ltDebt;

  const ocf = num(p.operatingCashFlow) ?? netInc + da;
  const capex = Math.abs(num(p.capitalExpenditure) ?? 0);
  const fcf = num(p.freeCashFlow) ?? ocf - capex;
  const cfi = num(p.investingCashFlow) ?? -capex;
  const cff = num(p.financingCashFlow) ?? 0;
  const distributions = Math.abs(num(p.cashDividendsPaid) ?? 0) + Math.abs(num(p.repurchaseOfCapitalStock) ?? 0);
  const changeWC = -(num(p.changeInWorkingCapital) ?? 0); // Yahoo: negativo = consume caja
  const netChange = num(p.changesInCash) ?? (prevCash !== undefined ? cash - prevCash : ocf + cfi + cff);
  const sbc = num(p.stockBasedCompensation) ?? 0;

  const taxRate = preTax > 0 ? clamp(taxExp / preTax, 0, 0.5) : 0;
  const netDebt = totalDebt - cash;
  const ebitda = opInc + da;

  return {
    yearLabel,
    isHistorical: true,
    periodType,
    date: p.date,
    revenue: rev,
    revenueGrowth: prevRevenue && prevRevenue > 0 ? rev / prevRevenue - 1 : NaN,
    costOfRevenue,
    grossProfit,
    grossMargin: rev > 0 ? grossProfit / rev : 0,
    operatingExpenses: opEx,
    operatingIncome: opInc,
    operatingMargin: rev > 0 ? opInc / rev : 0,
    depreciationAmortization: da,
    netInterestExpense: interest,
    preTaxIncome: preTax,
    taxExpense: taxExp,
    taxRate,
    netIncome: netInc,
    netMargin: rev > 0 ? netInc / rev : 0,

    cashAndEquivalents: cash,
    accountsReceivable: ar,
    inventory: inv,
    otherCurrentAssets: otherCA,
    totalCurrentAssets: totalCA,
    netPPE,
    goodwillAndIntangibles: gw,
    otherNonCurrentAssets: otherNCA,
    totalAssets,

    accountsPayable: ap,
    shortTermDebt: stDebt,
    otherCurrentLiabilities: otherCL,
    totalCurrentLiabilities: totalCL,
    longTermDebt: ltDebt,
    totalDebt,
    otherNonCurrentLiabilities: otherNCL,
    totalLiabilities: totalLiab,
    stockholdersEquity: equity,
    totalLiabilitiesAndEquity: totalLiab + equity,
    balanceDiscrepancy: Math.round(totalAssets - totalLiab - equity - minority),

    netIncomeCF: netInc,
    depreciationCF: da,
    changeInWorkingCapital: changeWC,
    operatingCashFlow: ocf,
    capitalExpenditures: capex,
    freeCashFlow: fcf,
    investingCashFlow: cfi,
    debtNetIssuance: num(p.netIssuancePaymentsOfDebt) ?? 0,
    equityRepurchaseDividends: distributions,
    financingCashFlow: cff,
    netChangeInCash: netChange,
    endingCash: cash,

    currentRatio: totalCL > 0 ? totalCA / totalCL : 0,
    netDebt,
    netDebtToEbitda: ebitda > 0 ? netDebt / (periodType === "quarterly" ? ebitda * 4 : ebitda) : 0,
    interestCoverage: interest > 0 ? opInc / interest : Infinity,
    debtToEquity: equity > 0 ? totalDebt / equity : 0,
    fcfConversion: netInc > 0 ? fcf / netInc : 0,

    fcff: opInc * (1 - (taxRate || 0.21)) + da - capex - changeWC,
    stockBasedCompensation: sbc,
    minorityInterest: minority,
  };
}

// ---------------------------------------------------------------------------
// Históricos, TTM y año en curso
// ---------------------------------------------------------------------------

export function buildHistoricalStatements(annualData: any[], _shares = 1): StatementPeriod[] {
  const clean = cleanPeriods(annualData).reverse(); // del más antiguo al más reciente
  return clean.map((p, idx) => {
    const prev = idx > 0 ? clean[idx - 1] : undefined;
    return statementFromRaw(
      p,
      prev ? num(prev.totalRevenue) : undefined,
      `FY${fiscalYearOf(p.date)}`,
      "annual",
      prev ? num(prev.cashAndCashEquivalents) : undefined
    );
  });
}

export function buildQuarterlyHistoricalStatements(quarterlyData: any[], _shares = 1): StatementPeriod[] {
  const clean = cleanPeriods(quarterlyData).reverse();
  return clean.map((p, idx) => {
    // Crecimiento interanual (mismo trimestre del año anterior) si existe; si no, trimestral.
    const yearAgo = clean.slice(0, idx).find((q) => Math.abs(time(p.date) - time(q.date) - 365 * DAY) < 45 * DAY);
    const prev = yearAgo ?? (idx > 0 ? clean[idx - 1] : undefined);
    return statementFromRaw(
      p,
      prev ? num(prev.totalRevenue) : undefined,
      quarterLabel(p.date),
      "quarterly",
      idx > 0 ? num(clean[idx - 1].cashAndCashEquivalents) : undefined
    );
  });
}

/**
 * Últimos doce meses: suma de los 4 últimos trimestres válidos y balance del más reciente.
 * Devuelve null si no hay 4 trimestres o si el último trimestre coincide con el cierre anual
 * (en ese caso el último ejercicio ya es el TTM).
 */
export function buildTTMStatementPeriod(quarterlyData: any[], annualData: any[]): StatementPeriod | null {
  const q = cleanPeriods(quarterlyData);
  const a = cleanPeriods(annualData);
  if (q.length < 4) return null;
  const last4 = q.slice(0, 4);
  // Los 4 trimestres deben ser consecutivos (aprox. 1 año entre el primero y el último).
  const span = time(last4[0].date) - time(last4[3].date);
  if (span > 300 * DAY || span < 240 * DAY) return null;
  if (a[0] && time(q[0].date) <= time(a[0].date) + 20 * DAY) return null;

  const sum = (k: string, abs = false) =>
    last4.reduce((s, p) => {
      const v = num(p[k]);
      return s + (v === undefined ? 0 : abs ? Math.abs(v) : v);
    }, 0);
  const has = (k: string) => last4.every((p) => num(p[k]) !== undefined);

  const latest = { ...q[0] };
  const flowKeys = [
    "totalRevenue", "costOfRevenue", "grossProfit", "operatingIncome", "operatingExpense", "pretaxIncome",
    "taxProvision", "netIncomeCommonStockholders", "netIncome", "operatingCashFlow", "freeCashFlow",
    "investingCashFlow", "financingCashFlow", "changeInWorkingCapital", "stockBasedCompensation",
    "netIssuancePaymentsOfDebt", "changesInCash",
  ];
  for (const k of flowKeys) latest[k] = has(k) ? sum(k) : undefined;
  latest.reconciledDepreciation = has("reconciledDepreciation") ? sum("reconciledDepreciation", true)
    : has("depreciationAndAmortization") ? sum("depreciationAndAmortization", true) : undefined;
  latest.depreciationAndAmortization = undefined;
  latest.interestExpense = has("interestExpense") ? sum("interestExpense", true) : undefined;
  latest.capitalExpenditure = has("capitalExpenditure") ? -sum("capitalExpenditure", true) : undefined;
  latest.cashDividendsPaid = sum("cashDividendsPaid", true);
  latest.repurchaseOfCapitalStock = sum("repurchaseOfCapitalStock", true);
  if (latest.freeCashFlow === undefined && latest.operatingCashFlow !== undefined && latest.capitalExpenditure !== undefined) {
    latest.freeCashFlow = latest.operatingCashFlow + latest.capitalExpenditure;
  }

  const period = statementFromRaw(latest, a[0] ? num(a[0].totalRevenue) : undefined, "TTM (LTM)", "annual",
    a[0] ? num(a[0].cashAndCashEquivalents) : undefined);
  return { ...period, isTTM: true, periodType: "ttm" };
}

export function detectCurrentYearStatus(annualData: any[], quarterlyData: any[]): CurrentYearStatus {
  const a = cleanPeriods(annualData);
  const q = cleanPeriods(quarterlyData);
  const lastFY = a[0];
  const empty: CurrentYearStatus = {
    hasPartialYear: false, quartersReportedCount: 0, quartersRemainingCount: 0,
    currentFiscalYearLabel: lastFY ? `FY${fiscalYearOf(lastFY.date) + 1}` : "", latestAnnualDate: lastFY?.date || "",
    latestQuarterDate: q[0]?.date || "", quartersReportedLabels: [], ytdRevenue: 0, ytdOperatingIncome: 0,
    ytdNetIncome: 0, ytdOcf: 0, ytdCapex: 0, ytdFcf: 0, ttmRevenue: 0, ttmOperatingIncome: 0, ttmNetIncome: 0,
    ttmOcf: 0, ttmCapex: 0, ttmFcf: 0, ttmCash: 0, ttmDebt: 0, estimatedFullYearRevenue: 0, estimatedFullYearFcf: 0,
  };
  if (q.length === 0 || !lastFY) return empty;

  const fyEnd = time(lastFY.date);
  const inFY = q.filter((p) => time(p.date) > fyEnd + 20 * DAY).slice(0, 3).reverse(); // Q1, Q2, Q3
  const sum = (rows: any[], k: string, abs = false) =>
    rows.reduce((s, p) => s + (abs ? Math.abs(num(p[k]) ?? 0) : num(p[k]) ?? 0), 0);
  const fcfOf = (rows: any[]) => sum(rows, "operatingCashFlow") - sum(rows, "capitalExpenditure", true);

  // TTM: 4 últimos trimestres válidos; si no hay 4, el último ejercicio cerrado.
  const last4 = q.length >= 4 ? q.slice(0, 4) : null;
  const src = last4 ?? [lastFY];
  const ttmRevenue = sum(src, "totalRevenue");

  // Estimación del cierre: último ejercicio × (acumulado del año / mismos trimestres del año anterior).
  const ytdRevenue = sum(inFY, "totalRevenue");
  const ytdFcf = fcfOf(inFY);
  const priorSame = inFY
    .map((p) => q.find((x) => Math.abs(time(p.date) - time(x.date) - 365 * DAY) < 45 * DAY))
    .filter(Boolean) as any[];
  let estRevenue = 0;
  let estFcf = 0;
  if (inFY.length > 0) {
    const priorRev = sum(priorSame, "totalRevenue");
    if (priorSame.length === inFY.length && priorRev > 0) {
      estRevenue = Math.round((num(lastFY.totalRevenue) ?? 0) * (ytdRevenue / priorRev));
      const priorFcf = fcfOf(priorSame);
      const fyFcf = num(lastFY.freeCashFlow) ?? 0;
      estFcf = priorFcf > 0 ? Math.round(fyFcf * (ytdFcf / priorFcf)) : Math.round((ytdFcf / inFY.length) * 4);
    } else {
      estRevenue = Math.round((ytdRevenue / inFY.length) * 4);
      estFcf = Math.round((ytdFcf / inFY.length) * 4);
    }
  }

  const fyLabelYear = fiscalYearOf(lastFY.date) + 1;
  return {
    hasPartialYear: inFY.length > 0,
    quartersReportedCount: inFY.length,
    quartersRemainingCount: inFY.length > 0 ? 4 - inFY.length : 0,
    currentFiscalYearLabel: `FY${fyLabelYear}`,
    latestAnnualDate: lastFY.date,
    latestQuarterDate: q[0].date,
    quartersReportedLabels: inFY.map((p, i) => `Q${i + 1} FY${String(fyLabelYear).slice(-2)} (${monthLabel(p.date)})`),
    ytdRevenue,
    ytdOperatingIncome: sum(inFY, "operatingIncome"),
    ytdNetIncome: sum(inFY, "netIncomeCommonStockholders"),
    ytdOcf: sum(inFY, "operatingCashFlow"),
    ytdCapex: sum(inFY, "capitalExpenditure", true),
    ytdFcf,
    ttmRevenue,
    ttmOperatingIncome: sum(src, "operatingIncome"),
    ttmNetIncome: sum(src, "netIncomeCommonStockholders"),
    ttmOcf: sum(src, "operatingCashFlow"),
    ttmCapex: sum(src, "capitalExpenditure", true),
    ttmFcf: fcfOf(src),
    ttmCash: num(q[0].cashAndCashEquivalents) ?? num(lastFY.cashAndCashEquivalents) ?? 0,
    ttmDebt: num(q[0].totalDebt) ?? num(lastFY.totalDebt) ?? 0,
    estimatedFullYearRevenue: estRevenue,
    estimatedFullYearFcf: estFcf,
  };
}

// ---------------------------------------------------------------------------
// CAGR históricos
// ---------------------------------------------------------------------------

/** CAGR entre el dato más reciente y el más antiguo positivos (en %). NaN si no se puede calcular. */
function cagrOf(values: (number | undefined)[]): number {
  // values: del más reciente al más antiguo
  const latestIdx = values.findIndex((v) => v !== undefined);
  if (latestIdx < 0) return NaN;
  const latest = values[latestIdx]!;
  if (latest <= 0) return NaN;
  for (let i = values.length - 1; i > latestIdx; i--) {
    const v = values[i];
    if (v !== undefined && v > 0) return (Math.pow(latest / v, 1 / (i - latestIdx)) - 1) * 100;
  }
  return NaN;
}

export function computeHistoricalCAGRs(annualData: any[]): HistoricalCAGRs {
  const a = cleanPeriods(annualData);
  const col = (k: string, abs = false) => a.map((p) => {
    const v = num(p[k]);
    return v === undefined ? undefined : abs ? Math.abs(v) : v;
  });
  const fcf = a.map((p) => {
    const v = num(p.freeCashFlow);
    if (v !== undefined) return v;
    const ocf = num(p.operatingCashFlow);
    const capex = num(p.capitalExpenditure);
    return ocf !== undefined ? ocf - Math.abs(capex ?? 0) : undefined;
  });
  const r = (v: number) => (Number.isFinite(v) ? round1(v) : NaN);
  return {
    revenueCAGR: r(cagrOf(col("totalRevenue"))),
    costOfRevenueCAGR: r(cagrOf(col("costOfRevenue"))),
    grossProfitCAGR: r(cagrOf(col("grossProfit"))),
    operatingExpensesCAGR: r(cagrOf(col("operatingExpense"))),
    operatingIncomeCAGR: r(cagrOf(col("operatingIncome"))),
    netIncomeCAGR: r(cagrOf(col("netIncomeCommonStockholders"))),
    depreciationCAGR: r(cagrOf(col("reconciledDepreciation", true))),
    capexCAGR: r(cagrOf(col("capitalExpenditure", true))),
    fcfCAGR: r(cagrOf(fcf)),
    operatingCashFlowCAGR: r(cagrOf(col("operatingCashFlow"))),
  };
}

// ---------------------------------------------------------------------------
// Calibración (escenario base)
// ---------------------------------------------------------------------------

/**
 * Normaliza un crecimiento histórico para proyectarlo (AGENTS.md §2.3):
 * recorte del 30 % si supera el 40 % (efecto base), tope del 25 % y suelo del −10 %.
 */
export function normalizeGrowth(raw: number, notes: string[], label = "crecimiento"): number {
  let g = raw;
  if (g > 40) {
    notes.push(`${label} histórico ${round1(raw)}% > 40%: recorte del 30% por efecto base → ${round1(g * 0.7)}%`);
    g = g * 0.7;
  }
  if (g > 25) {
    notes.push(`tope del 25% anual sostenido a 5 años (${round1(g)}% → 25%)`);
    g = 25;
  }
  if (g < -10) {
    notes.push(`suelo del −10% (${round1(g)}% → −10%)`);
    g = -10;
  }
  return round1(g);
}

export function calibrateModel(
  annualData: any[],
  quarterlyData: any[],
  quote: any,
  anchor: StatementPeriod | undefined,
  opts: { riskFreeRate?: number; equityRiskPremium?: number } = {}
): ModelCalibration {
  const a = cleanPeriods(annualData);
  const q = cleanPeriods(quarterlyData);
  const rf = opts.riskFreeRate ?? 4.3;
  const erp = opts.equityRiskPremium ?? 5.5;
  const notes: string[] = [];

  // Crecimiento: media de tres lecturas, de la más estructural a la más reciente: CAGR de ventas
  // de los ejercicios disponibles, crecimiento del último ejercicio y crecimiento interanual del
  // último trimestre (Yahoo revenueGrowth).
  const cagrs = computeHistoricalCAGRs(a);
  const revenueCagr = Number.isFinite(cagrs.revenueCAGR) ? cagrs.revenueCAGR : null;
  const r0 = num(a[0]?.totalRevenue);
  const r1 = num(a[1]?.totalRevenue);
  const latestYoY = r0 && r1 && r1 > 0 ? round1((r0 / r1 - 1) * 100) : null;
  const qYoY = num(quote?.revenueGrowth);
  const latestQuarterYoY = qYoY !== undefined && Math.abs(qYoY) < 5 ? round1(qYoY * 100) : null;
  const parts = [revenueCagr, latestYoY, latestQuarterYoY].filter((v): v is number => v !== null);
  const growthRaw = parts.length ? round1(parts.reduce((s, v) => s + v, 0) / parts.length) : null;
  if (growthRaw === null) notes.push("sin histórico de ventas suficiente: se usa 5%");
  const growthNormalized = normalizeGrowth(growthRaw ?? 5, notes, "crecimiento de ventas");

  const rev = anchor?.revenue || r0 || 0;
  const pct = (v: number) => (rev > 0 ? (v / rev) * 100 : 0);
  const opMargin = round1(anchor ? anchor.operatingMargin * 100 : 0);
  const grossMargin = round1(anchor ? anchor.grossMargin * 100 : 0);
  const daPct = round1(anchor ? pct(anchor.depreciationAmortization) : 0);
  const capexPct = round1(anchor ? pct(anchor.capitalExpenditures) : 0);

  // Intensidad de capex media (ejercicios cerrados + TTM): normaliza picos de inversión.
  const capexRatios = a.slice(0, 4).map((p) => {
    const rv = num(p.totalRevenue) ?? 0;
    return rv > 0 ? (Math.abs(num(p.capitalExpenditure) ?? 0) / rv) * 100 : undefined;
  }).filter((v): v is number => v !== undefined);
  if (anchor?.isTTM) capexRatios.unshift(capexPct);
  const capexHistAvg = round1(capexRatios.length ? capexRatios.reduce((s, v) => s + v, 0) / capexRatios.length : capexPct);
  // Capex objetivo: punto medio entre el nivel actual y la media; la D&A converge hacia el capex
  // (los activos nuevos se amortizan) y en una empresa que crece el capex no baja de la D&A.
  const daTarget = round1(Math.max(daPct, ((capexPct + capexHistAvg) / 2) * 0.75));
  const capexTarget = round1(Math.max((capexPct + capexHistAvg) / 2, daTarget));

  const nwcPct = round1(anchor ? pct(anchor.accountsReceivable + anchor.inventory - anchor.accountsPayable) : 0);

  // Tipo efectivo: impuestos / beneficio antes de impuestos de los 3 últimos ejercicios.
  let taxRate = 21;
  let taxSource = "estándar EE. UU. (21%)";
  const taxRows = a.slice(0, 3).filter((p) => (num(p.pretaxIncome) ?? 0) > 0 && num(p.taxProvision) !== undefined);
  if (taxRows.length) {
    const t = taxRows.reduce((s, p) => s + num(p.taxProvision)!, 0) / taxRows.reduce((s, p) => s + num(p.pretaxIncome)!, 0);
    taxRate = round1(clamp(t * 100, 5, 35));
    taxSource = `efectivo medio ${taxRows.length} ejercicios`;
  } else if (num(a[0]?.taxRateForCalcs) !== undefined) {
    taxRate = round1(clamp(num(a[0].taxRateForCalcs)! * 100, 5, 35));
    taxSource = "Tax Rate for Calcs";
  }

  // Coste de la deuda: intereses / deuda total.
  const debt = num(quote?.totalDebt) ?? anchor?.totalDebt ?? 0;
  const interest = anchor?.netInterestExpense ?? 0;
  const costOfDebt = debt > 0 && interest > 0 ? round1(clamp((interest / debt) * 100, 2, 10)) : 5;

  // Remuneración al accionista: (dividendos + recompras) / beneficio neto de los 3 últimos ejercicios.
  const payRows = a.slice(0, 3);
  const niSum = payRows.reduce((s, p) => s + (num(p.netIncomeCommonStockholders) ?? num(p.netIncome) ?? 0), 0);
  const distSum = payRows.reduce((s, p) => s + Math.abs(num(p.cashDividendsPaid) ?? 0) + Math.abs(num(p.repurchaseOfCapitalStock) ?? 0), 0);
  const payoutRatio = niSum > 0 ? round1(clamp((distSum / niSum) * 100, 0, 100)) : 0;

  const sbcPct = round1(anchor ? pct(anchor.stockBasedCompensation ?? 0) : 0);

  // Acciones diluidas: acciones en circulación × factor de dilución del último trimestre.
  const latestQ = q[0] ?? a[0];
  const dil = num(latestQ?.dilutedAverageShares);
  const basic = num(latestQ?.basicAverageShares);
  const so = num(quote?.sharesOutstanding);
  let dilutedShares = 0;
  let sharesSource = "";
  if (so && dil && basic && dil >= basic && dil / basic < 1.15) {
    dilutedShares = so * (dil / basic);
    sharesSource = `acciones en circulación × dilución (${((dil / basic - 1) * 100).toFixed(1)}%)`;
  } else if (so) {
    dilutedShares = so;
    sharesSource = "acciones en circulación";
  } else if (dil) {
    dilutedShares = dil;
    sharesSource = "media diluida del último periodo";
  } else {
    dilutedShares = num(latestQ?.ordinarySharesNumber) ?? 0;
    sharesSource = "Ordinary Shares Number";
  }

  // WACC por CAPM con beta ajustada (Blume: 0,67·β + 0,33), AGENTS.md §3.
  const price = num(quote?.price) ?? 0;
  const beta = num(quote?.beta) ?? null;
  const betaAdjusted = Math.round((beta !== null ? 0.67 * beta + 0.33 : 1) * 100) / 100;
  const costOfEquity = rf + betaAdjusted * erp;
  const costOfDebtNet = costOfDebt * (1 - taxRate / 100);
  const marketCap = num(quote?.marketCap) ?? price * dilutedShares;
  const V = marketCap + debt;
  const we = V > 0 ? marketCap / V : 1;
  const wd = V > 0 ? debt / V : 0;
  const waccRaw = we * costOfEquity + wd * costOfDebtNet;
  let wacc = round1(waccRaw);
  let waccNote: string | null = beta === null
    ? "sin beta en los datos: se usa β = 1"
    : beta < 0.3 || beta > 2.5
    ? `beta ${beta.toFixed(2)} anómala: la beta ajustada (${betaAdjusted.toFixed(2)}) la acerca a 1`
    : null;
  if (waccRaw > 14) {
    wacc = 14;
    waccNote = `WACC calculado ${waccRaw.toFixed(1)}% > 14%: se limita al techo del rango sectorial (AGENTS.md §3.4)`;
  } else if (waccRaw < 6) {
    wacc = 6;
    waccNote = `WACC calculado ${waccRaw.toFixed(1)}% < 6%: se eleva al suelo prudente`;
  }

  const terminalGrowth = Math.min(growthNormalized >= 5 ? 3 : 2.5, round1(wacc - 3));
  const minorityInterest = num(latestQ?.minorityInterest) ?? num(a[0]?.minorityInterest) ?? 0;

  return {
    revenueCagr, latestYoY, latestQuarterYoY, growthRaw, growthNormalized, growthNotes: notes,
    grossMargin, opMargin, daPct, daTarget, capexPct, capexHistAvg, capexTarget, nwcPct,
    taxRate, taxSource, costOfDebt, payoutRatio, sbcPct,
    beta, betaAdjusted, riskFreeRate: rf, equityRiskPremium: erp,
    costOfEquity: round1(costOfEquity), costOfDebtNet: round1(costOfDebtNet),
    weightEquity: round1(we * 100), weightDebt: round1(wd * 100),
    waccRaw: round1(waccRaw), wacc, waccNote,
    dilutedShares, sharesSource, terminalGrowth, minorityInterest, marketCap,
  };
}

// ---------------------------------------------------------------------------
// Proyección
// ---------------------------------------------------------------------------

interface PathOptions {
  periodsToTarget: number; // periodos hasta alcanzar los objetivos del año 5
  annualize: number; // 1 anual, 4 trimestral (para ratios de balance sobre ventas anuales)
  labels: string[];
  dates: (string | undefined)[];
  periodType: "annual" | "quarterly";
  growthShown: number[]; // crecimiento mostrado por periodo (decimal)
}

/** Proyecta los 3 estados a partir del ancla y de una senda de ingresos ya calculada. */
function projectPath(anchor: StatementPeriod, revenues: number[], a: ModelAssumptions, o: PathOptions): StatementPeriod[] {
  const out: StatementPeriod[] = [];
  const k = o.annualize;
  const rev0 = anchor.revenue || 1;
  const annualRev0 = rev0 * k;

  // Ratios de partida (último dato) y objetivos (año 5).
  const opM0 = anchor.operatingMargin;
  const opexPct = Math.max(0, anchor.grossMargin - anchor.operatingMargin);
  const da0 = anchor.depreciationAmortization / rev0;
  const capex0 = anchor.capitalExpenditures / rev0;
  const opMT = a.operatingMarginTarget / 100;
  const daT = a.deprecPercentRevenue / 100;
  const capexT = a.capexPercentRevenue / 100;
  const tax = a.taxRateTarget / 100;
  const kd = a.costOfDebtInterestRate / 100 / k;
  const payout = clamp(a.dividendPayoutRatio / 100, 0, 1);

  // Circulante operativo en % de ventas anuales.
  const arPct = anchor.accountsReceivable / annualRev0;
  const invPct = anchor.inventory / annualRev0;
  const apPct = anchor.accountsPayable / annualRev0;

  // Partidas que se mantienen constantes; las "otras" absorben cualquier diferencia del dato de
  // partida para que el ancla cuadre exactamente.
  const otherCA = anchor.otherCurrentAssets;
  const gw = anchor.goodwillAndIntangibles;
  const otherNCA = anchor.totalAssets - anchor.cashAndEquivalents - anchor.accountsReceivable - anchor.inventory - otherCA - anchor.netPPE - gw;
  const otherCL = anchor.otherCurrentLiabilities;
  const stShare = anchor.totalDebt > 0 ? anchor.shortTermDebt / anchor.totalDebt : 0.15;
  const otherNCL = anchor.totalAssets - anchor.stockholdersEquity - anchor.accountsPayable - otherCL - anchor.totalDebt;

  let prev = {
    revenue: rev0,
    cash: anchor.cashAndEquivalents,
    debt: anchor.totalDebt,
    ppe: anchor.netPPE,
    equity: anchor.stockholdersEquity,
    ar: anchor.accountsReceivable,
    inv: anchor.inventory,
    ap: anchor.accountsPayable,
  };

  revenues.forEach((revenue, i) => {
    const w = Math.min(1, (i + 1) / o.periodsToTarget);
    const opM = opM0 + (opMT - opM0) * w;
    const daPctT = da0 + (daT - da0) * w;
    const capexPctT = capex0 + (capexT - capex0) * w;

    const grossMargin = Math.min(0.98, opM + opexPct);
    const grossProfit = revenue * grossMargin;
    const operatingIncome = revenue * opM;
    const operatingExpenses = grossProfit - operatingIncome;
    const da = revenue * daPctT;
    const capex = revenue * capexPctT;

    const interest = prev.debt * kd;
    const preTax = operatingIncome - interest;
    const taxExpense = Math.max(0, preTax * tax);
    const netIncome = preTax - taxExpense;

    const annualRev = revenue * k;
    const ar = annualRev * arPct;
    const inv = annualRev * invPct;
    const ap = annualRev * apPct;
    const deltaNWC = (ar + inv - ap) - (prev.ar + prev.inv - prev.ap);

    const ocf = netIncome + da - deltaNWC;
    const fcf = ocf - capex;
    const fcff = operatingIncome * (1 - tax) + da - capex - deltaNWC;

    // Remuneración al accionista sin dejar la caja por debajo del 2 % de las ventas anuales;
    // si aun así falta caja, se dispone de deuda (revolving).
    const minCash = annualRev * 0.02;
    const cashBefore = prev.cash + ocf - capex;
    const distributions = Math.max(0, Math.min(payout * Math.max(0, netIncome), cashBefore - minCash));
    let cash = cashBefore - distributions;
    let debt = prev.debt;
    let newDebt = 0;
    if (cash < minCash) {
      newDebt = minCash - cash;
      debt += newDebt;
      cash = minCash;
    }

    const ppe = prev.ppe + capex - da;
    const equity = prev.equity + netIncome - distributions;
    const shortTermDebt = debt * stShare;
    const longTermDebt = debt - shortTermDebt;

    const totalCurrentAssets = cash + ar + inv + otherCA;
    const totalAssets = totalCurrentAssets + ppe + gw + otherNCA;
    const totalCurrentLiabilities = ap + otherCL + shortTermDebt;
    const totalLiabilities = totalCurrentLiabilities + longTermDebt + otherNCL;
    const ebitda = operatingIncome + da;
    const netDebt = debt - cash;

    const period: StatementPeriod = {
      yearLabel: o.labels[i],
      isHistorical: false,
      periodType: o.periodType,
      date: o.dates[i],
      revenue,
      revenueGrowth: o.growthShown[i],
      costOfRevenue: revenue - grossProfit,
      grossProfit,
      grossMargin,
      operatingExpenses,
      operatingIncome,
      operatingMargin: opM,
      depreciationAmortization: da,
      netInterestExpense: interest,
      preTaxIncome: preTax,
      taxExpense,
      taxRate: tax,
      netIncome,
      netMargin: revenue > 0 ? netIncome / revenue : 0,

      cashAndEquivalents: cash,
      accountsReceivable: ar,
      inventory: inv,
      otherCurrentAssets: otherCA,
      totalCurrentAssets,
      netPPE: ppe,
      goodwillAndIntangibles: gw,
      otherNonCurrentAssets: otherNCA,
      totalAssets,

      accountsPayable: ap,
      shortTermDebt,
      otherCurrentLiabilities: otherCL,
      totalCurrentLiabilities,
      longTermDebt,
      totalDebt: debt,
      otherNonCurrentLiabilities: otherNCL,
      totalLiabilities,
      stockholdersEquity: equity,
      totalLiabilitiesAndEquity: totalLiabilities + equity,
      balanceDiscrepancy: Math.round(totalAssets - totalLiabilities - equity),

      netIncomeCF: netIncome,
      depreciationCF: da,
      changeInWorkingCapital: deltaNWC,
      operatingCashFlow: ocf,
      capitalExpenditures: capex,
      freeCashFlow: fcf,
      investingCashFlow: -capex,
      debtNetIssuance: newDebt,
      equityRepurchaseDividends: distributions,
      financingCashFlow: newDebt - distributions,
      netChangeInCash: cash - prev.cash,
      endingCash: cash,

      currentRatio: totalCurrentLiabilities > 0 ? totalCurrentAssets / totalCurrentLiabilities : 0,
      netDebt,
      netDebtToEbitda: ebitda > 0 ? netDebt / (ebitda * k) : 0,
      interestCoverage: interest > 0 ? operatingIncome / interest : Infinity,
      debtToEquity: equity > 0 ? debt / equity : 0,
      fcfConversion: netIncome > 0 ? fcf / netIncome : 0,
      fcff,
      stockBasedCompensation: 0,
    };
    out.push(period);
    prev = { revenue, cash, debt, ppe, equity, ar, inv, ap };
  });
  return out;
}

/** Proyección anual a N años: crecimiento constante de la fase 1 (AGENTS.md §2.4). */
export function projectStatements(anchor: StatementPeriod, assumptions: ModelAssumptions, projectionYears = 5): StatementPeriod[] {
  const g = assumptions.revenueGrowthRate / 100;
  const baseYear = anchor.date ? new Date(anchor.date).getUTCFullYear() : new Date().getUTCFullYear();
  const revenues: number[] = [];
  let r = anchor.revenue;
  for (let i = 0; i < projectionYears; i++) {
    r = r * (1 + g);
    revenues.push(r);
  }
  return projectPath(anchor, revenues, assumptions, {
    periodsToTarget: 5,
    annualize: 1,
    labels: revenues.map((_, i) => `Y+${i + 1} (${baseYear + i + 1}E)`),
    dates: revenues.map(() => undefined),
    periodType: "annual",
    growthShown: revenues.map(() => g),
  });
}

/**
 * Proyección trimestral con estacionalidad: cada trimestre = mismo trimestre del año anterior ×
 * (1 + crecimiento anual). Si no hay 4 trimestres de historia, crecimiento trimestral equivalente.
 */
export function projectQuarterlyStatements(
  latestQuarter: StatementPeriod,
  assumptions: ModelAssumptions,
  quartersCount = 8,
  historicalQuarters: StatementPeriod[] = []
): StatementPeriod[] {
  const g = assumptions.revenueGrowthRate / 100;
  const hist = historicalQuarters.length ? historicalQuarters : [latestQuarter];
  const series = hist.map((h) => h.revenue);
  const seasonal = series.length >= 4;
  const qg = Math.pow(1 + g, 0.25) - 1;
  const revenues: number[] = [];
  const growthShown: number[] = [];
  for (let i = 0; i < quartersCount; i++) {
    const all = [...series, ...revenues];
    const r = seasonal ? all[all.length - 4] * (1 + g) : all[all.length - 1] * (1 + qg);
    revenues.push(r);
    growthShown.push(seasonal ? g : qg);
  }
  const base = latestQuarter.date ? new Date(latestQuarter.date) : new Date();
  const dates = revenues.map((_, i) => {
    const d = new Date(base);
    d.setUTCMonth(d.getUTCMonth() + (i + 1) * 3);
    return d.toISOString();
  });
  return projectPath(latestQuarter, revenues, assumptions, {
    periodsToTarget: 20,
    annualize: 4,
    labels: dates.map((d, i) => `Q+${i + 1} ${quarterLabel(d)}E`),
    dates,
    periodType: "quarterly",
    growthShown,
  });
}

// ---------------------------------------------------------------------------
// DCF
// ---------------------------------------------------------------------------

export interface DCFExtras {
  minorityInterest?: number;
  marketEvEbitda?: number | null;
  reportedFcf?: number | null; // FCF de la terminal (TTM)
  historicalFcf?: number[]; // FCF históricos para detectar años negativos
  staleQuote?: boolean; // Yahoo no respondió: precio y datos de mercado de respaldo
}

/** Senda de crecimiento de la fase 2 (años 6–10), AGENTS.md §2.3. Valores decimales. */
function phase2Path(g1: number, gT: number): { start: number; end: number } {
  if (g1 < 0) return { start: g1 + (gT - g1) * 0.2, end: gT };
  if (g1 < 0.10) return { start: Math.max(g1, gT), end: Math.max(g1, gT) };
  let start = g1 * 0.6;
  if (g1 > 0.25) start = Math.min(start, g1 * 0.5);
  const end = Math.max(gT, g1 * 0.3);
  return { start: Math.max(start, end), end };
}

function valueFromFcff(fcff10: number[], wacc: number, g: number, netDebt: number, minority: number, shares: number) {
  const pv = fcff10.reduce((s, f, i) => s + f / Math.pow(1 + wacc, i + 1), 0);
  const tv = (fcff10[9] * (1 + g)) / (wacc - g);
  const ev = pv + tv / Math.pow(1 + wacc, 10);
  return (ev - netDebt - minority) / shares;
}

export function computeDCFValuation(
  anchor: StatementPeriod | undefined,
  projectedPeriods: StatementPeriod[],
  assumptions: ModelAssumptions,
  currentPrice: number,
  marketCap: number,
  reportedDebt?: number | null,
  reportedCash?: number | null,
  extras: DCFExtras = {}
): DCFValuationResult {
  const flags: DCFFlag[] = [];
  const wacc = assumptions.discountRateWacc / 100;
  let gT = assumptions.terminalGrowthRate / 100;
  const isTerminalValid = gT <= wacc - 0.03 + 1e-9;
  if (!isTerminalValid) {
    flags.push({ level: "bad", text: `g terminal ${(gT * 100).toFixed(1)}% no cumple g < WACC − 3%: se usa ${((wacc - 0.03) * 100).toFixed(1)}%` });
    gT = wacc - 0.03;
  }

  // Años 1–5: FCFF de la proyección. Años 6–10: desaceleración lineal (fase 2).
  const g1 = assumptions.revenueGrowthRate / 100;
  const p2 = phase2Path(g1, gT);
  const fcff: number[] = projectedPeriods.slice(0, 5).map((p) => p.fcff ?? p.freeCashFlow);
  const growths: number[] = projectedPeriods.slice(0, 5).map((p) => p.revenueGrowth);
  while (fcff.length < 5) {
    fcff.push((fcff[fcff.length - 1] ?? 0) * (1 + g1));
    growths.push(g1);
  }
  for (let yr = 6; yr <= 10; yr++) {
    const g = p2.start - ((yr - 6) * (p2.start - p2.end)) / 4;
    fcff.push(fcff[fcff.length - 1] * (1 + g));
    growths.push(g);
  }

  const pvFcfList = fcff.map((f, i) => {
    const df = 1 / Math.pow(1 + wacc, i + 1);
    return { year: i + 1, fcf: f, growth: growths[i], discountFactor: df, pv: f * df };
  });
  const sumPvFcf = pvFcfList.reduce((s, x) => s + x.pv, 0);
  const fcf10 = fcff[9];
  const terminalValueGross = (fcf10 * (1 + gT)) / (wacc - gT);
  const pvTerminalValue = terminalValueGross / Math.pow(1 + wacc, 10);
  const enterpriseValue = sumPvFcf + pvTerminalValue;
  const pctTerminalValue = enterpriseValue > 0 ? (pvTerminalValue / enterpriseValue) * 100 : NaN;

  // Equity bridge: deuda y caja de la terminal; si faltan, las del último balance.
  const totalDebt = typeof reportedDebt === "number" && Number.isFinite(reportedDebt) ? reportedDebt : anchor?.totalDebt ?? 0;
  const totalCash = typeof reportedCash === "number" && Number.isFinite(reportedCash) ? reportedCash : anchor?.cashAndEquivalents ?? 0;
  const netDebt = totalDebt - totalCash;
  const minority = extras.minorityInterest ?? 0;
  const equityValue = enterpriseValue - netDebt - minority;
  const shares = assumptions.dilutedShares > 0 ? assumptions.dilutedShares : NaN;
  const fairRaw = equityValue / shares;
  const fairValuePerShare = Number.isFinite(fairRaw) ? Math.max(0, fairRaw) : 0;
  const upsideDownsidePct = currentPrice > 0 ? (fairValuePerShare / currentPrice - 1) * 100 : 0;

  // CAPM (informativo: el WACC aplicado es assumptions.discountRateWacc)
  const costOfEquity = assumptions.riskFreeRate + assumptions.beta * assumptions.equityRiskPremium;
  const costOfDebtNet = assumptions.costOfDebtInterestRate * (1 - assumptions.taxRateTarget / 100);
  const V = marketCap + totalDebt;
  const weightEquity = V > 0 ? (marketCap / V) * 100 : 100;
  const weightDebt = V > 0 ? (totalDebt / V) * 100 : 0;
  const calculatedWacc = (weightEquity * costOfEquity + weightDebt * costOfDebtNet) / 100;

  // Comprobaciones de coherencia (AGENTS.md §4.3, §6 y §9)
  const ebitda0 = anchor ? anchor.operatingIncome + anchor.depreciationAmortization : 0;
  const impliedEvEbitda = ebitda0 > 0 ? enterpriseValue / ebitda0 : null;
  const p5 = projectedPeriods[4];
  const ebitda5 = p5 ? p5.operatingIncome + p5.depreciationAmortization : 0;
  const growth6to10 = growths.slice(5).reduce((m, g) => m * (1 + g), 1);
  const ebitda10 = ebitda5 * growth6to10;
  const terminalExitMultiple = ebitda10 > 0 ? terminalValueGross / ebitda10 : null;
  const marketEvEbitda = extras.marketEvEbitda ?? null;

  if (extras.staleQuote) flags.push({ level: "bad", text: "Yahoo no respondió: el precio y los datos de mercado son de respaldo y pueden estar desfasados. Recarga en unos minutos." });
  if (!Number.isFinite(shares)) flags.push({ level: "bad", text: "Sin número de acciones: no se puede calcular el valor por acción" });
  if (fcff.slice(0, 5).some((f) => f <= 0)) flags.push({ level: "bad", text: "FCFF negativo en algún año proyectado: el DCF es poco fiable (negocio en inversión intensiva)" });
  if (fairRaw < 0) flags.push({ level: "bad", text: "El valor del equity sale negativo (deuda neta superior al valor de la empresa)" });
  if (Number.isFinite(pctTerminalValue)) {
    if (pctTerminalValue > 80) flags.push({ level: "warn", text: `El valor terminal pesa ${pctTerminalValue.toFixed(0)}% del EV (> 80%): el modelo depende demasiado del largo plazo` });
    else if (pctTerminalValue < 40) flags.push({ level: "warn", text: `El valor terminal pesa ${pctTerminalValue.toFixed(0)}% del EV (< 40%): revisar si la fase 1 está sobreestimada` });
    else flags.push({ level: "ok", text: `Peso del valor terminal ${pctTerminalValue.toFixed(0)}% del EV (rango sano 40–80%)` });
  }
  if (impliedEvEbitda !== null && marketEvEbitda && marketEvEbitda > 0) {
    const diff = impliedEvEbitda / marketEvEbitda - 1;
    flags.push({
      level: Math.abs(diff) > 0.3 ? "warn" : "ok",
      text: `EV/EBITDA implícito ${impliedEvEbitda.toFixed(1)}× vs. mercado ${marketEvEbitda.toFixed(1)}× (${diff >= 0 ? "+" : ""}${(diff * 100).toFixed(0)}%)`,
    });
  }
  if (terminalExitMultiple !== null) {
    flags.push({
      level: terminalExitMultiple > 25 ? "warn" : "ok",
      text: `El valor terminal equivale a ${terminalExitMultiple.toFixed(1)}× el EBITDA del año 10${terminalExitMultiple > 25 ? " (exigente)" : ""}`,
    });
  }
  if (anchor && extras.reportedFcf && extras.reportedFcf !== 0) {
    const verified = anchor.operatingCashFlow - anchor.capitalExpenditures;
    const d = Math.abs(verified - extras.reportedFcf) / Math.abs(extras.reportedFcf);
    if (d > 0.05) flags.push({ level: "warn", text: `FCF verificado (OCF − capex) difiere ${(d * 100).toFixed(0)}% del FCF de la terminal` });
  }
  if (extras.historicalFcf?.some((f) => f < 0)) flags.push({ level: "warn", text: "Hay años históricos con FCF negativo: negocio en transición" });
  if (anchor && anchor.revenue > 0 && anchor.freeCashFlow / anchor.revenue > 0.5) flags.push({ level: "ok", text: "Margen FCF > 50%: negocio tipo red/software" });
  if (netDebt < 0) flags.push({ level: "ok", text: "Caja neta positiva: se suma al valor de la empresa" });
  if (anchor && (anchor.stockBasedCompensation ?? 0) > 0) {
    flags.push({ level: "ok", text: `La SBC (${((anchor.stockBasedCompensation! / anchor.revenue) * 100).toFixed(1)}% de ventas) se trata como coste: el FCF proyectado no la suma` });
  }

  // Matriz de sensibilidad WACC × g terminal
  const waccSteps = [-0.02, -0.01, 0, 0.01, 0.02].map((d) => wacc + d);
  const gSteps = [0.02, 0.025, 0.03, 0.035, 0.04];
  const sensitivityMatrix = waccSteps.map((w) =>
    gSteps.map((g) => {
      const valid = g <= w - 0.03 + 1e-9 && w > 0;
      const fv = valid ? valueFromFcff(fcff, w, g, netDebt, minority, shares) : NaN;
      return {
        wacc: round1(w * 100),
        terminalGrowth: round1(g * 100),
        fairValue: Number.isFinite(fv) ? Math.max(0, fv) : NaN,
        valid: valid && Number.isFinite(fv),
      };
    })
  );

  return {
    pvFcfList,
    sumPvFcf,
    terminalFcf: fcf10,
    terminalValueGross,
    pvTerminalValue,
    pctTerminalValue,
    enterpriseValue,
    totalDebt,
    totalCash,
    netDebt,
    minorityInterest: minority,
    equityValue,
    fairValuePerShare,
    currentPrice,
    upsideDownsidePct,
    calculatedWacc,
    costOfEquity,
    costOfDebtNet,
    weightEquity,
    weightDebt,
    terminalGrowthUsed: gT * 100,
    phase2Growth: { start: p2.start * 100, end: p2.end * 100 },
    impliedEvEbitda,
    marketEvEbitda,
    terminalExitMultiple,
    sensitivityMatrix,
    isTerminalValid,
    flags,
  };
}

// ---------------------------------------------------------------------------
// Escenarios
// ---------------------------------------------------------------------------

export interface ModelDrivers {
  revGrowth: number; // %
  opMargin: number; // % margen EBIT objetivo (año 5)
  taxRate: number; // %
  capexPct: number; // % capex/ventas objetivo (año 5)
  wacc: number; // %
  gTerminal: number; // %
}

/** Drivers del escenario base: salen de la calibración. */
export function baseDrivers(c: ModelCalibration): ModelDrivers {
  return {
    revGrowth: c.growthNormalized,
    opMargin: c.opMargin,
    taxRate: c.taxRate,
    capexPct: c.capexTarget,
    wacc: c.wacc,
    gTerminal: c.terminalGrowth,
  };
}

/**
 * Supuestos de cada escenario. Alcista y bajista parten siempre del base calibrado:
 *  - Alcista: crecimiento ×1,25 (tope 30%), margen +2 pp, WACC −0,5 pp, g terminal +0,5 pp.
 *  - Bajista: crecimiento ×0,6 (o −2 pp si es negativo), margen −3 pp, WACC +1 pp, g terminal −0,5 pp.
 *  - Personalizado: los valores de los controles.
 * La g terminal siempre respeta g ≤ WACC − 3% (AGENTS.md §4.1).
 */
export function buildScenarioAssumptions(
  c: ModelCalibration,
  scenario: ModelAssumptions["scenario"],
  custom: ModelDrivers,
  historicalCAGRs?: HistoricalCAGRs
): ModelAssumptions {
  const b = baseDrivers(c);
  let d: ModelDrivers = scenario === "custom" ? custom : b;
  if (scenario === "bull") {
    d = {
      ...b,
      revGrowth: round1(Math.min(30, b.revGrowth >= 0 ? b.revGrowth * 1.25 : b.revGrowth + 2)),
      opMargin: round1(b.opMargin + 2),
      wacc: round1(Math.max(5, b.wacc - 0.5)),
      gTerminal: round1(b.gTerminal + 0.5),
    };
  } else if (scenario === "bear") {
    d = {
      ...b,
      revGrowth: round1(b.revGrowth >= 0 ? b.revGrowth * 0.6 : b.revGrowth - 2),
      opMargin: round1(b.opMargin - 3),
      wacc: round1(b.wacc + 1),
      gTerminal: round1(Math.max(1.5, b.gTerminal - 0.5)),
    };
  }
  const gTerminal = Math.min(d.gTerminal, round1(d.wacc - 3));
  const daTarget = Math.min(c.daTarget, d.capexPct); // en estado estable, D&A ≤ capex
  return {
    scenario,
    historicalCAGRs,
    revenueGrowthRate: d.revGrowth,
    operatingMarginTarget: d.opMargin,
    grossMarginTarget: round1(c.grossMargin + (d.opMargin - c.opMargin)),
    taxRateTarget: d.taxRate,
    capexPercentRevenue: d.capexPct,
    deprecPercentRevenue: daTarget,
    nwcPercentRevenue: c.nwcPct,
    costOfDebtInterestRate: c.costOfDebt,
    dividendPayoutRatio: c.payoutRatio,
    discountRateWacc: d.wacc,
    terminalGrowthRate: gTerminal,
    dilutedShares: c.dilutedShares,
    riskFreeRate: c.riskFreeRate,
    equityRiskPremium: c.equityRiskPremium,
    beta: c.betaAdjusted,
  };
}
