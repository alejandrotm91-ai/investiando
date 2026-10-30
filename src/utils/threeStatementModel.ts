// src/utils/threeStatementModel.ts
// Financial engine for 3-Statement Model with Annual & Quarterly projections,
// current fiscal year tracking (quarters reported vs remaining), TTM calibration,
// scenarios, and DCF valuation according to RULE[AGENTS_md].

export interface StatementPeriod {
  yearLabel: string;
  isHistorical: boolean;
  isTTM?: boolean;
  periodType?: "annual" | "quarterly" | "ttm";
  date?: string;

  // Income Statement
  revenue: number;
  revenueGrowth: number; // decimal (e.g. 0.15 for 15%)
  costOfRevenue: number;
  grossProfit: number;
  grossMargin: number;
  operatingExpenses: number;
  operatingIncome: number; // EBIT
  operatingMargin: number;
  depreciationAmortization: number;
  netInterestExpense: number;
  preTaxIncome: number; // EBT
  taxExpense: number;
  taxRate: number;
  netIncome: number;
  netMargin: number;

  // Balance Sheet
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
  balanceDiscrepancy: number; // Assets - (Liabilities + Equity)

  // Cash Flow Statement
  netIncomeCF: number;
  depreciationCF: number;
  changeInWorkingCapital: number;
  operatingCashFlow: number;
  capitalExpenditures: number;
  freeCashFlow: number;
  investingCashFlow: number;
  debtNetIssuance: number;
  equityRepurchaseDividends: number;
  financingCashFlow: number;
  netChangeInCash: number;
  endingCash: number;

  // Solvency & Ratios
  currentRatio: number;
  netDebt: number;
  netDebtToEbitda: number;
  interestCoverage: number;
  debtToEquity: number;
  fcfConversion: number; // FCF / Net Income
}

export interface CurrentYearStatus {
  hasPartialYear: boolean;
  quartersReportedCount: number; // e.g. 1, 2, 3
  quartersRemainingCount: number; // e.g. 3, 2, 1
  currentFiscalYearLabel: string; // e.g. "FY2026"
  latestAnnualDate: string;
  latestQuarterDate: string;
  quartersReportedLabels: string[]; // e.g. ["Q1'26", "Q2'26"]
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
  estimatedFullYearRevenue: number; // Run-rate or projected FY
  estimatedFullYearFcf: number;
}

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
  // Drivers (percentages as 0-100 for display, handled as decimals in calculations)
  revenueGrowthRate: number; // % annual
  costGrowthRate?: number;
  grossProfitGrowthRate?: number;
  opexGrowthRate?: number;
  opIncomeGrowthRate?: number;
  capexGrowthRate?: number;
  deprecGrowthRate?: number;
  grossMarginTarget: number; // %
  operatingMarginTarget: number; // %
  taxRateTarget: number; // %
  capexPercentRevenue: number; // %
  deprecPercentRevenue: number; // %
  nwcPercentRevenue: number; // %
  costOfDebtInterestRate: number; // %
  annualDebtRepaymentPct: number; // % of total debt
  dividendPayoutRatio: number; // % of net income

  // DCF Valuation Drivers
  discountRateWacc: number; // %
  terminalGrowthRate: number; // % (2.0 - 3.5%)
  dilutedShares: number; // raw share count
  riskFreeRate: number; // % (typically 4.2%)
  equityRiskPremium: number; // % (typically 5.5%)
  beta: number;
}

export interface DCFValuationResult {
  pvFcfList: { year: number; fcf: number; discountFactor: number; pv: number }[];
  sumPvFcf: number;
  terminalFcf: number;
  terminalValueGross: number;
  pvTerminalValue: number;
  pctTerminalValue: number; // sanity check 55-75%
  enterpriseValue: number;
  totalDebt: number;
  totalCash: number;
  netDebt: number;
  equityValue: number;
  fairValuePerShare: number;
  currentPrice: number;
  upsideDownsidePct: number;
  calculatedWacc: number;
  costOfEquity: number;
  costOfDebtNet: number;
  weightEquity: number;
  weightDebt: number;
  sensitivityMatrix: {
    wacc: number;
    terminalGrowth: number;
    fairValue: number;
  }[][];
  isTerminalValid: boolean; // terminalGrowth < wacc - 0.02
}

function getQuarterShortLabel(dateStr: string): string {
  if (!dateStr) return "Qtr";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "Qtr";
  const m = d.getUTCMonth(); // 0-11
  const y = d.getUTCFullYear();
  const q = Math.floor(m / 3) + 1;
  const shortYear = y.toString().slice(-2);
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return `Q${q}'${shortYear} (${months[m]} ${shortYear})`;
}

export function detectCurrentYearStatus(annualData: any[], quarterlyData: any[]): CurrentYearStatus {
  if (!quarterlyData || quarterlyData.length === 0) {
    return {
      hasPartialYear: false,
      quartersReportedCount: 0,
      quartersRemainingCount: 0,
      currentFiscalYearLabel: "FY2026",
      latestAnnualDate: "",
      latestQuarterDate: "",
      quartersReportedLabels: [],
      ytdRevenue: 0,
      ytdOperatingIncome: 0,
      ytdNetIncome: 0,
      ytdOcf: 0,
      ytdCapex: 0,
      ytdFcf: 0,
      ttmRevenue: 0,
      ttmOperatingIncome: 0,
      ttmNetIncome: 0,
      ttmOcf: 0,
      ttmCapex: 0,
      ttmFcf: 0,
      ttmCash: 0,
      ttmDebt: 0,
      estimatedFullYearRevenue: 0,
      estimatedFullYearFcf: 0,
    };
  }

  const sortedQuarterly = [...quarterlyData].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const sortedAnnual = [...(annualData || [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const latestAnnualDate = sortedAnnual[0]?.date || "";
  const latestAnnualTime = latestAnnualDate ? new Date(latestAnnualDate).getTime() : 0;
  const latestQuarterDate = sortedQuarterly[0]?.date || "";

  // Quarters reported since the last closed annual period
  const quartersInCurrentFY = sortedQuarterly.filter(q => {
    if (!latestAnnualTime) return false;
    return new Date(q.date).getTime() > latestAnnualTime;
  });

  const quartersReportedCount = quartersInCurrentFY.length > 0 && quartersInCurrentFY.length < 4
    ? quartersInCurrentFY.length 
    : (quartersInCurrentFY.length === 0 && sortedQuarterly.length >= 1 ? 1 : quartersInCurrentFY.length % 4 || 4);

  const quartersRemainingCount = Math.max(0, 4 - quartersReportedCount);

  // Compute TTM from the most recent 4 quarters
  const last4Q = sortedQuarterly.slice(0, 4);
  const ttmRevenue = last4Q.reduce((sum, q) => sum + Number(q.totalRevenue || 0), 0);
  const ttmOperatingIncome = last4Q.reduce((sum, q) => sum + Number(q.operatingIncome || 0), 0);
  const ttmNetIncome = last4Q.reduce((sum, q) => sum + Number(q.netIncomeCommonStockholders ?? q.netIncome ?? 0), 0);
  const ttmOcf = last4Q.reduce((sum, q) => sum + Number(q.operatingCashFlow || 0), 0);
  const ttmCapex = last4Q.reduce((sum, q) => sum + Math.abs(Number(q.capitalExpenditure || 0)), 0);
  const ttmFcf = ttmOcf - ttmCapex;
  const ttmCash = Number(sortedQuarterly[0]?.cashAndCashEquivalents || 0);
  const ttmDebt = Number(sortedQuarterly[0]?.totalDebt || 0);

  // YTD sums
  const activeYTDQuarters = quartersInCurrentFY.length > 0 ? quartersInCurrentFY : sortedQuarterly.slice(0, 1);
  const ytdRevenue = activeYTDQuarters.reduce((sum, q) => sum + Number(q.totalRevenue || 0), 0);
  const ytdOperatingIncome = activeYTDQuarters.reduce((sum, q) => sum + Number(q.operatingIncome || 0), 0);
  const ytdNetIncome = activeYTDQuarters.reduce((sum, q) => sum + Number(q.netIncomeCommonStockholders ?? q.netIncome ?? 0), 0);
  const ytdOcf = activeYTDQuarters.reduce((sum, q) => sum + Number(q.operatingCashFlow || 0), 0);
  const ytdCapex = activeYTDQuarters.reduce((sum, q) => sum + Math.abs(Number(q.capitalExpenditure || 0)), 0);
  const ytdFcf = ytdOcf - ytdCapex;

  const ytdCount = activeYTDQuarters.length || 1;
  const estimatedFullYearRevenue = Math.round((ytdRevenue / ytdCount) * 4);
  const estimatedFullYearFcf = Math.round((ytdFcf / ytdCount) * 4);

  // Determine current fiscal year label
  const latestQDate = new Date(latestQuarterDate);
  const currentFiscalYearNum = !isNaN(latestQDate.getFullYear()) ? latestQDate.getFullYear() : 2026;

  return {
    hasPartialYear: quartersRemainingCount > 0,
    quartersReportedCount,
    quartersRemainingCount,
    currentFiscalYearLabel: `FY${currentFiscalYearNum}`,
    latestAnnualDate,
    latestQuarterDate,
    quartersReportedLabels: activeYTDQuarters.map(q => getQuarterShortLabel(q.date)).reverse(),
    ytdRevenue,
    ytdOperatingIncome,
    ytdNetIncome,
    ytdOcf,
    ytdCapex,
    ytdFcf,
    ttmRevenue: ttmRevenue || sortedAnnual[0]?.totalRevenue || 0,
    ttmOperatingIncome: ttmOperatingIncome || sortedAnnual[0]?.operatingIncome || 0,
    ttmNetIncome: ttmNetIncome || sortedAnnual[0]?.netIncome || 0,
    ttmOcf: ttmOcf || sortedAnnual[0]?.operatingCashFlow || 0,
    ttmCapex: ttmCapex || Math.abs(sortedAnnual[0]?.capitalExpenditure || 0),
    ttmFcf: ttmFcf || sortedAnnual[0]?.freeCashFlow || 0,
    ttmCash: ttmCash || sortedAnnual[0]?.cashAndCashEquivalents || 0,
    ttmDebt: ttmDebt || sortedAnnual[0]?.totalDebt || 0,
    estimatedFullYearRevenue,
    estimatedFullYearFcf,
  };
}

export function computeHistoricalCAGRs(annualData: any[]): HistoricalCAGRs {
  if (!annualData || annualData.length < 2) {
    return {
      revenueCAGR: 15.0,
      costOfRevenueCAGR: 12.0,
      grossProfitCAGR: 16.0,
      operatingExpensesCAGR: 10.0,
      operatingIncomeCAGR: 18.0,
      netIncomeCAGR: 18.0,
      depreciationCAGR: 10.0,
      capexCAGR: 8.0,
      fcfCAGR: 15.0,
      operatingCashFlowCAGR: 15.0,
    };
  }

  // Sorted newest to oldest
  const sorted = [...annualData].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  function getFieldValue(col: any, key: string): number | undefined | null {
    if (!col) return undefined;
    if (col[key] !== undefined && col[key] !== null) return col[key];
    if (key === "freeCashFlow") {
      const ocf = col.operatingCashFlow;
      const capex = col.capitalExpenditure;
      if (typeof ocf === "number") {
        if (typeof capex === "number") {
          return capex < 0 ? ocf + capex : ocf - capex;
        }
        return ocf;
      }
    }
    return undefined;
  }

  const calcRowCAGR = (key: string, isAbsolute = false, fallback = 10.0): number => {
    const valid = sorted
      .map((p, idx) => {
        let v = getFieldValue(p, key);
        if (typeof v === "number" && isAbsolute) v = Math.abs(v);
        return { val: v, idx };
      })
      .filter(item => typeof item.val === "number" && !isNaN(item.val as number));

    if (valid.length < 2) return fallback;
    const latestItem = valid[0];
    if (latestItem.val !== undefined && latestItem.val > 0) {
      const oldestPositive = [...valid].reverse().find(item => item.val !== undefined && item.val > 0 && item.idx > latestItem.idx);
      if (oldestPositive && oldestPositive.val !== undefined && oldestPositive.val > 0) {
        const n = oldestPositive.idx - latestItem.idx;
        if (n > 0) {
          const cagr = (Math.pow(latestItem.val / oldestPositive.val, 1 / n) - 1) * 100;
          return Number(cagr.toFixed(1));
        }
      }
    }
    return fallback;
  };

  const revenueCAGR = calcRowCAGR("totalRevenue", false, 15.0);
  const costOfRevenueCAGR = calcRowCAGR("costOfRevenue", false, Math.round(revenueCAGR * 0.9 * 10) / 10);
  const grossProfitCAGR = calcRowCAGR("grossProfit", false, Math.round(revenueCAGR * 1.05 * 10) / 10);
  const operatingExpensesCAGR = calcRowCAGR("operatingExpense", false, Math.round(revenueCAGR * 0.8 * 10) / 10);
  const operatingIncomeCAGR = calcRowCAGR("operatingIncome", false, Math.round(revenueCAGR * 1.1 * 10) / 10);
  const netIncomeCAGR = calcRowCAGR("netIncomeCommonStockholders", false, Math.round(revenueCAGR * 1.1 * 10) / 10);
  const depreciationCAGR = calcRowCAGR("reconciledDepreciation", true, 8.0);
  const capexCAGR = calcRowCAGR("capitalExpenditure", true, 8.0);
  const fcfCAGR = calcRowCAGR("freeCashFlow", false, revenueCAGR);
  const operatingCashFlowCAGR = calcRowCAGR("operatingCashFlow", false, revenueCAGR);

  return {
    revenueCAGR,
    costOfRevenueCAGR,
    grossProfitCAGR,
    operatingExpensesCAGR,
    operatingIncomeCAGR,
    netIncomeCAGR,
    depreciationCAGR,
    capexCAGR,
    fcfCAGR,
    operatingCashFlowCAGR,
  };
}

export function buildTTMStatementPeriod(quarterlyData: any[], annualData: any[]): StatementPeriod | null {
  if (!quarterlyData || quarterlyData.length < 2) return null;
  const sortedQ = [...quarterlyData].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const last4Q = sortedQ.slice(0, 4);
  const latestQ = sortedQ[0];

  // Flow items sum across 4 quarters (or normalized if only 2-3 available)
  const mult = 4 / last4Q.length;
  const rev = Math.round(last4Q.reduce((sum, q) => sum + Number(q.totalRevenue || 0), 0) * mult);
  const grossProfit = Math.round(last4Q.reduce((sum, q) => sum + Number(q.grossProfit ?? (q.totalRevenue || 0) * 0.55), 0) * mult);
  const costOfRevenue = rev - grossProfit;
  const opInc = Math.round(last4Q.reduce((sum, q) => sum + Number(q.operatingIncome || 0), 0) * mult);
  const opEx = Math.max(0, grossProfit - opInc);
  const da = Math.round(last4Q.reduce((sum, q) => sum + Math.abs(Number(q.reconciledDepreciation ?? q.depreciationAndAmortization ?? (q.totalRevenue || 0) * 0.04)), 0) * mult);
  const interest = Math.round(last4Q.reduce((sum, q) => sum + Math.abs(Number(q.interestExpense ?? (q.totalRevenue || 0) * 0.01)), 0) * mult);
  const preTax = opInc - interest;
  const taxExp = Math.round(last4Q.reduce((sum, q) => sum + Math.abs(Number(q.taxProvision ?? preTax * 0.17)), 0) * mult);
  const netInc = preTax - taxExp;

  // Balance sheet from latest quarter
  const cash = Number(latestQ.cashAndCashEquivalents ?? rev * 0.2);
  const ar = Number(latestQ.accountsReceivable ?? rev * 0.12);
  const inv = Number(latestQ.inventory ?? rev * 0.05);
  const otherCA = Number(latestQ.otherCurrentAssets ?? rev * 0.03);
  const totalCA = Number(latestQ.currentAssets ?? (cash + ar + inv + otherCA));
  const netPPE = Number(latestQ.netPPE ?? rev * 0.15);
  const gw = Number(latestQ.goodwillAndOtherIntangibleAssets ?? rev * 0.08);
  const otherNCA = Number(latestQ.otherNonCurrentAssets ?? rev * 0.05);
  const totalAssets = Number(latestQ.totalAssets ?? (totalCA + netPPE + gw + otherNCA));

  const ap = Number(latestQ.accountsPayable ?? rev * 0.08);
  const stDebt = Number(latestQ.currentDebt ?? 0);
  const otherCL = Number(latestQ.otherCurrentLiabilities ?? rev * 0.05);
  const totalCL = Number(latestQ.currentLiabilities ?? (ap + stDebt + otherCL));
  const ltDebt = Number(latestQ.longTermDebt ?? rev * 0.10);
  const totalDebt = Number(latestQ.totalDebt ?? (stDebt + ltDebt));
  const otherNCL = Number(latestQ.otherNonCurrentLiabilities ?? rev * 0.03);
  const totalLiab = Number(latestQ.totalLiabilitiesNetMinorityInterest ?? (totalCL + ltDebt + otherNCL));
  const equity = Number(latestQ.stockholdersEquity ?? (totalAssets - totalLiab));

  // Cash flow TTM
  const ocf = Math.round(last4Q.reduce((sum, q) => sum + Number(q.operatingCashFlow ?? 0), 0) * mult);
  const capex = Math.round(last4Q.reduce((sum, q) => sum + Math.abs(Number(q.capitalExpenditure ?? 0)), 0) * mult);
  const fcf = ocf - capex;
  const cfi = -capex;
  const cff = Math.round(last4Q.reduce((sum, q) => sum + Number(q.financingCashFlow ?? -(netInc * 0.2)), 0) * mult);

  const prevAnnualRev = Number(annualData?.[0]?.totalRevenue || rev);
  const revGrowth = prevAnnualRev > 0 ? (rev - prevAnnualRev) / prevAnnualRev : 0.12;

  const netDebt = totalDebt - cash;
  const ebitda = opInc + da;

  return {
    yearLabel: `TTM (LTM Actual)`,
    isHistorical: true,
    isTTM: true,
    periodType: "ttm",
    date: latestQ.date,
    revenue: rev,
    revenueGrowth: revGrowth,
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
    taxRate: preTax > 0 ? taxExp / preTax : 0.17,
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
    balanceDiscrepancy: Math.round(totalAssets - (totalLiab + equity)),

    netIncomeCF: netInc,
    depreciationCF: da,
    changeInWorkingCapital: Math.round((ar + inv - ap) * 0.05),
    operatingCashFlow: ocf,
    capitalExpenditures: capex,
    freeCashFlow: fcf,
    investingCashFlow: cfi,
    debtNetIssuance: 0,
    equityRepurchaseDividends: Math.abs(cff),
    financingCashFlow: cff,
    netChangeInCash: ocf + cfi + cff,
    endingCash: cash,

    currentRatio: totalCL > 0 ? totalCA / totalCL : 1.5,
    netDebt,
    netDebtToEbitda: ebitda > 0 ? netDebt / ebitda : 0,
    interestCoverage: interest > 0 ? opInc / interest : 20,
    debtToEquity: equity > 0 ? totalDebt / equity : 0,
    fcfConversion: netInc > 0 ? fcf / netInc : 1.0,
  };
}

export function buildHistoricalStatements(annualData: any[], shares = 1): StatementPeriod[] {
  if (!annualData || annualData.length === 0) return [];
  
  // Sort chronological ascending (oldest first)
  const sorted = [...annualData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  return sorted.map((p, idx, arr) => {
    const rev = Number(p.totalRevenue ?? 0);
    const prevRev = idx > 0 ? Number(arr[idx - 1].totalRevenue ?? 0) : rev;
    const revGrowth = prevRev > 0 && idx > 0 ? (rev - prevRev) / prevRev : 0.10;
    const grossProfit = Number(p.grossProfit ?? rev * 0.55);
    const costOfRevenue = Number(p.costOfRevenue ?? (rev - grossProfit));
    const opInc = Number(p.operatingIncome ?? rev * 0.25);
    const opEx = Number(p.operatingExpense ?? Math.max(0, grossProfit - opInc));
    const da = Math.abs(Number(p.reconciledDepreciation ?? p.depreciationAndAmortization ?? rev * 0.04));
    const interest = Math.abs(Number(p.interestExpense ?? rev * 0.01));
    const preTax = Number(p.pretaxIncome ?? (opInc - interest));
    const taxExp = Math.abs(Number(p.taxProvision ?? preTax * 0.17));
    const netInc = Number(p.netIncomeCommonStockholders ?? p.netIncome ?? (preTax - taxExp));

    // Balance Sheet
    const cash = Number(p.cashAndCashEquivalents ?? rev * 0.2);
    const ar = Number(p.accountsReceivable ?? rev * 0.12);
    const inv = Number(p.inventory ?? rev * 0.05);
    const otherCA = Number(p.otherCurrentAssets ?? rev * 0.03);
    const totalCA = Number(p.currentAssets ?? (cash + ar + inv + otherCA));
    const netPPE = Number(p.netPPE ?? rev * 0.15);
    const gw = Number(p.goodwillAndOtherIntangibleAssets ?? rev * 0.08);
    const otherNCA = Number(p.otherNonCurrentAssets ?? rev * 0.05);
    const totalAssets = Number(p.totalAssets ?? (totalCA + netPPE + gw + otherNCA));

    const ap = Number(p.accountsPayable ?? rev * 0.08);
    const stDebt = Number(p.currentDebt ?? 0);
    const otherCL = Number(p.otherCurrentLiabilities ?? rev * 0.05);
    const totalCL = Number(p.currentLiabilities ?? (ap + stDebt + otherCL));
    const ltDebt = Number(p.longTermDebt ?? rev * 0.10);
    const totalDebt = Number(p.totalDebt ?? (stDebt + ltDebt));
    const otherNCL = Number(p.otherNonCurrentLiabilities ?? rev * 0.03);
    const totalLiab = Number(p.totalLiabilitiesNetMinorityInterest ?? (totalCL + ltDebt + otherNCL));
    const equity = Number(p.stockholdersEquity ?? (totalAssets - totalLiab));

    // Cash flow
    const ocf = Number(p.operatingCashFlow ?? netInc + da);
    const capexRaw = Number(p.capitalExpenditure ?? -(rev * 0.05));
    const capex = Math.abs(capexRaw);
    const fcf = Number(p.freeCashFlow ?? (ocf - capex));
    const cfi = Number(p.investingCashFlow ?? -capex);
    const cff = Number(p.financingCashFlow ?? -(netInc * 0.2));

    const dateObj = new Date(p.date);
    const yearLabel = !isNaN(dateObj.getFullYear()) ? `FY${dateObj.getFullYear()}` : `Hist ${idx + 1}`;

    const netDebt = totalDebt - cash;
    const ebitda = opInc + da;

    return {
      yearLabel,
      isHistorical: true,
      periodType: "annual",
      date: p.date,
      revenue: rev,
      revenueGrowth: revGrowth,
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
      taxRate: preTax > 0 ? taxExp / preTax : 0.17,
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
      balanceDiscrepancy: Math.round(totalAssets - (totalLiab + equity)),

      netIncomeCF: netInc,
      depreciationCF: da,
      changeInWorkingCapital: Math.round((ar + inv - ap) * 0.05),
      operatingCashFlow: ocf,
      capitalExpenditures: capex,
      freeCashFlow: fcf,
      investingCashFlow: cfi,
      debtNetIssuance: 0,
      equityRepurchaseDividends: Math.abs(cff),
      financingCashFlow: cff,
      netChangeInCash: cash - (idx > 0 ? (annualData[idx-1]?.cashAndCashEquivalents || cash) : cash),
      endingCash: cash,

      currentRatio: totalCL > 0 ? totalCA / totalCL : 1.5,
      netDebt,
      netDebtToEbitda: ebitda > 0 ? netDebt / ebitda : 0,
      interestCoverage: interest > 0 ? opInc / interest : 20,
      debtToEquity: equity > 0 ? totalDebt / equity : 0,
      fcfConversion: netInc > 0 ? fcf / netInc : 1.0,
    };
  });
}

export function buildQuarterlyHistoricalStatements(quarterlyData: any[], shares = 1): StatementPeriod[] {
  if (!quarterlyData || quarterlyData.length === 0) return [];
  // Sort chronological ascending (oldest first)
  const sorted = [...quarterlyData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return sorted.map((p, idx, arr) => {
    const rev = Number(p.totalRevenue ?? 0);
    const prevRev = idx > 0 ? Number(arr[idx - 1].totalRevenue ?? 0) : rev;
    const revGrowth = prevRev > 0 && idx > 0 ? (rev - prevRev) / prevRev : 0.03;
    const grossProfit = Number(p.grossProfit ?? rev * 0.55);
    const costOfRevenue = Number(p.costOfRevenue ?? (rev - grossProfit));
    const opInc = Number(p.operatingIncome ?? rev * 0.25);
    const opEx = Number(p.operatingExpense ?? Math.max(0, grossProfit - opInc));
    const da = Math.abs(Number(p.reconciledDepreciation ?? p.depreciationAndAmortization ?? rev * 0.04));
    const interest = Math.abs(Number(p.interestExpense ?? rev * 0.01));
    const preTax = Number(p.pretaxIncome ?? (opInc - interest));
    const taxExp = Math.abs(Number(p.taxProvision ?? preTax * 0.17));
    const netInc = Number(p.netIncomeCommonStockholders ?? p.netIncome ?? (preTax - taxExp));

    // Balance sheet
    const cash = Number(p.cashAndCashEquivalents ?? rev * 0.2);
    const ar = Number(p.accountsReceivable ?? rev * 0.12);
    const inv = Number(p.inventory ?? rev * 0.05);
    const otherCA = Number(p.otherCurrentAssets ?? rev * 0.03);
    const totalCA = Number(p.currentAssets ?? (cash + ar + inv + otherCA));
    const netPPE = Number(p.netPPE ?? rev * 0.15);
    const gw = Number(p.goodwillAndOtherIntangibleAssets ?? rev * 0.08);
    const otherNCA = Number(p.otherNonCurrentAssets ?? rev * 0.05);
    const totalAssets = Number(p.totalAssets ?? (totalCA + netPPE + gw + otherNCA));

    const ap = Number(p.accountsPayable ?? rev * 0.08);
    const stDebt = Number(p.currentDebt ?? 0);
    const otherCL = Number(p.otherCurrentLiabilities ?? rev * 0.05);
    const totalCL = Number(p.currentLiabilities ?? (ap + stDebt + otherCL));
    const ltDebt = Number(p.longTermDebt ?? rev * 0.10);
    const totalDebt = Number(p.totalDebt ?? (stDebt + ltDebt));
    const otherNCL = Number(p.otherNonCurrentLiabilities ?? rev * 0.03);
    const totalLiab = Number(p.totalLiabilitiesNetMinorityInterest ?? (totalCL + ltDebt + otherNCL));
    const equity = Number(p.stockholdersEquity ?? (totalAssets - totalLiab));

    // Cash flow
    const ocf = Number(p.operatingCashFlow ?? netInc + da);
    const capex = Math.abs(Number(p.capitalExpenditure ?? -(rev * 0.05)));
    const fcf = Number(p.freeCashFlow ?? (ocf - capex));
    const cfi = Number(p.investingCashFlow ?? -capex);
    const cff = Number(p.financingCashFlow ?? -(netInc * 0.2));

    const yearLabel = getQuarterShortLabel(p.date);
    const netDebt = totalDebt - cash;
    const ebitda = opInc + da;

    return {
      yearLabel,
      isHistorical: true,
      periodType: "quarterly",
      date: p.date,
      revenue: rev,
      revenueGrowth: revGrowth,
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
      taxRate: preTax > 0 ? taxExp / preTax : 0.17,
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
      balanceDiscrepancy: Math.round(totalAssets - (totalLiab + equity)),

      netIncomeCF: netInc,
      depreciationCF: da,
      changeInWorkingCapital: Math.round((ar + inv - ap) * 0.05),
      operatingCashFlow: ocf,
      capitalExpenditures: capex,
      freeCashFlow: fcf,
      investingCashFlow: cfi,
      debtNetIssuance: 0,
      equityRepurchaseDividends: Math.abs(cff),
      financingCashFlow: cff,
      netChangeInCash: ocf + cfi + cff,
      endingCash: cash,

      currentRatio: totalCL > 0 ? totalCA / totalCL : 1.5,
      netDebt,
      netDebtToEbitda: ebitda > 0 ? netDebt / ebitda : 0,
      interestCoverage: interest > 0 ? opInc / interest : 20,
      debtToEquity: equity > 0 ? totalDebt / equity : 0,
      fcfConversion: netInc > 0 ? fcf / netInc : 1.0,
    };
  });
}

export function projectStatements(
  latestHist: StatementPeriod,
  assumptions: ModelAssumptions,
  projectionYears = 5
): StatementPeriod[] {
  const result: StatementPeriod[] = [];
  let prev = latestHist;
  const currentYearNum = parseInt(latestHist.yearLabel.replace(/[^0-9]/g, "")) || 2026;

  const cagr = assumptions.historicalCAGRs || {
    revenueCAGR: assumptions.revenueGrowthRate,
    costOfRevenueCAGR: assumptions.revenueGrowthRate * 0.9,
    grossProfitCAGR: assumptions.revenueGrowthRate * 1.05,
    operatingExpensesCAGR: assumptions.revenueGrowthRate * 0.8,
    operatingIncomeCAGR: assumptions.revenueGrowthRate * 1.1,
    netIncomeCAGR: assumptions.revenueGrowthRate * 1.1,
    depreciationCAGR: 8.0,
    capexCAGR: 8.0,
    fcfCAGR: assumptions.revenueGrowthRate,
    operatingCashFlowCAGR: assumptions.revenueGrowthRate,
  };

  // Determine line item growth rates based on scenario:
  let gRev = (cagr.revenueCAGR || assumptions.revenueGrowthRate) / 100;
  let gCost = (cagr.costOfRevenueCAGR || (gRev * 100 * 0.9)) / 100;
  let gOpEx = (cagr.operatingExpensesCAGR || (gRev * 100 * 0.8)) / 100;
  let gCapex = (cagr.capexCAGR || 8.0) / 100;
  let gDA = (cagr.depreciationCAGR || 8.0) / 100;

  if (assumptions.scenario === "bull") {
    gRev = gRev * 1.30;
    gCost = gCost * 1.10;
    gOpEx = gOpEx * 1.15;
    gCapex = gCapex * 1.20;
    gDA = gDA * 1.15;
  } else if (assumptions.scenario === "bear") {
    gRev = gRev * 0.60;
    gCost = gCost * 0.85;
    gOpEx = gOpEx * 0.85;
    gCapex = gCapex * 0.70;
    gDA = gDA * 0.80;
  } else if (assumptions.scenario === "custom") {
    gRev = assumptions.revenueGrowthRate / 100;
  }

  const opMargin = assumptions.operatingMarginTarget / 100;
  const grossMarginTarget = assumptions.grossMarginTarget / 100;
  const taxRate = assumptions.taxRateTarget / 100;
  const capexPct = assumptions.capexPercentRevenue / 100;
  const daPct = assumptions.deprecPercentRevenue / 100;
  const nwcPct = assumptions.nwcPercentRevenue / 100;
  const costDebt = assumptions.costOfDebtInterestRate / 100;
  const debtRepaymentPct = assumptions.annualDebtRepaymentPct / 100;
  const payoutRatio = assumptions.dividendPayoutRatio / 100;

  for (let yr = 1; yr <= projectionYears; yr++) {
    // Project Income Statement with historical CAGR base case
    const stepDecay = yr > 3 ? 0.90 : 1.0;
    const yearGrowth = gRev * Math.pow(stepDecay, yr - 1);
    const revenue = Math.round(prev.revenue * (1 + yearGrowth));

    let costOfRevenue: number;
    let grossProfit: number;
    if (assumptions.scenario === "custom") {
      grossProfit = Math.round(revenue * grossMarginTarget);
      costOfRevenue = revenue - grossProfit;
    } else {
      costOfRevenue = Math.round(prev.costOfRevenue * (1 + gCost * Math.pow(stepDecay, yr - 1)));
      if (costOfRevenue >= revenue * 0.92) {
        costOfRevenue = Math.round(revenue * 0.75);
      }
      grossProfit = revenue - costOfRevenue;
    }
    const grossMargin = revenue > 0 ? grossProfit / revenue : 0.5;

    let operatingExpenses: number;
    let operatingIncome: number;
    if (assumptions.scenario === "custom") {
      operatingIncome = Math.round(revenue * opMargin);
      operatingExpenses = Math.max(0, grossProfit - operatingIncome);
    } else {
      operatingExpenses = Math.round(prev.operatingExpenses * (1 + gOpEx * Math.pow(stepDecay, yr - 1)));
      operatingIncome = grossProfit - operatingExpenses;
    }

    const depreciation = assumptions.scenario === "custom"
      ? Math.round(revenue * daPct)
      : Math.max(1000000, Math.round(prev.depreciationAmortization * (1 + gDA * Math.pow(stepDecay, yr - 1))));

    // Dynamic Balance Sheet & Debt Schedule
    const prevDebt = prev.totalDebt;
    const debtRepaid = Math.round(prevDebt * debtRepaymentPct);
    const projectedTotalDebt = Math.max(0, prevDebt - debtRepaid);
    const projectedSTDebt = Math.round(projectedTotalDebt * 0.15);
    const projectedLTDebt = projectedTotalDebt - projectedSTDebt;
    const interestExpense = Math.round(projectedTotalDebt * costDebt);

    const preTaxIncome = operatingIncome - interestExpense;
    const taxExpense = Math.max(0, Math.round(preTaxIncome * taxRate));
    const netIncome = preTaxIncome - taxExpense;

    // Working Capital & Assets
    const ar = Math.round(revenue * 0.12);
    const inv = Math.round(revenue * 0.06);
    const ap = Math.round(revenue * 0.08);
    const otherCA = Math.round(revenue * 0.04);
    const otherCL = Math.round(revenue * 0.05);

    const targetNWC = Math.round(revenue * nwcPct);
    const prevNWC = Math.round(prev.revenue * nwcPct);
    const deltaNWC = targetNWC - prevNWC;

    // Cash Flow calculations
    const capex = assumptions.scenario === "custom"
      ? Math.round(revenue * capexPct)
      : Math.max(1000000, Math.round(prev.capitalExpenditures * (1 + gCapex * Math.pow(stepDecay, yr - 1))));
    const ocf = netIncome + depreciation - deltaNWC;
    const fcf = ocf - capex;
    const cfi = -capex;

    const dividendsAndBuybacks = Math.max(0, Math.round(netIncome * payoutRatio));
    const cff = -debtRepaid - dividendsAndBuybacks;
    const netChangeInCash = ocf + cfi + cff;

    // Balance Sheet Integration
    const cash = Math.max(1000000, prev.cashAndEquivalents + netChangeInCash);
    const totalCA = cash + ar + inv + otherCA;
    const netPPE = Math.max(0, prev.netPPE + capex - depreciation);
    const gw = prev.goodwillAndIntangibles;
    const otherNCA = Math.round(revenue * 0.05);
    const totalAssets = totalCA + netPPE + gw + otherNCA;

    const totalCL = ap + projectedSTDebt + otherCL;
    const totalLiab = totalCL + projectedLTDebt + Math.round(revenue * 0.04);
    const retainedEarningsAddition = netIncome - dividendsAndBuybacks;
    const equity = prev.stockholdersEquity + retainedEarningsAddition;

    const totalLiabAndEquity = totalLiab + equity;
    const discrepancy = totalAssets - totalLiabAndEquity;

    const netDebt = projectedTotalDebt - cash;
    const ebitda = operatingIncome + depreciation;

    const currentYearRecord: StatementPeriod = {
      yearLabel: `Y+${yr} (${currentYearNum + yr})`,
      isHistorical: false,
      periodType: "annual",
      revenue,
      revenueGrowth: yearGrowth,
      costOfRevenue,
      grossProfit,
      grossMargin,
      operatingExpenses,
      operatingIncome,
      operatingMargin: revenue > 0 ? operatingIncome / revenue : 0,
      depreciationAmortization: depreciation,
      netInterestExpense: interestExpense,
      preTaxIncome,
      taxExpense,
      taxRate,
      netIncome,
      netMargin: revenue > 0 ? netIncome / revenue : 0,

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
      shortTermDebt: projectedSTDebt,
      otherCurrentLiabilities: otherCL,
      totalCurrentLiabilities: totalCL,
      longTermDebt: projectedLTDebt,
      totalDebt: projectedTotalDebt,
      otherNonCurrentLiabilities: Math.round(revenue * 0.04),
      totalLiabilities: totalLiab,
      stockholdersEquity: equity,
      totalLiabilitiesAndEquity: totalLiabAndEquity,
      balanceDiscrepancy: discrepancy,

      netIncomeCF: netIncome,
      depreciationCF: depreciation,
      changeInWorkingCapital: deltaNWC,
      operatingCashFlow: ocf,
      capitalExpenditures: capex,
      freeCashFlow: fcf,
      investingCashFlow: cfi,
      debtNetIssuance: -debtRepaid,
      equityRepurchaseDividends: dividendsAndBuybacks,
      financingCashFlow: cff,
      netChangeInCash,
      endingCash: cash,

      currentRatio: totalCL > 0 ? totalCA / totalCL : 2.0,
      netDebt,
      netDebtToEbitda: ebitda > 0 ? netDebt / ebitda : 0,
      interestCoverage: interestExpense > 0 ? operatingIncome / interestExpense : 25,
      debtToEquity: equity > 0 ? projectedTotalDebt / equity : 0,
      fcfConversion: netIncome > 0 ? fcf / netIncome : 1.0,
    };

    result.push(currentYearRecord);
    prev = currentYearRecord;
  }

  return result;
}

export function projectQuarterlyStatements(
  latestQuarter: StatementPeriod,
  assumptions: ModelAssumptions,
  quartersCount = 8
): StatementPeriod[] {
  const result: StatementPeriod[] = [];
  let prev = latestQuarter;

  // Quarterly driver conversion using historical CAGRs for Base / Bull / Bear or custom targets
  const cagr = assumptions.historicalCAGRs;
  const gRevAnnual = cagr ? cagr.revenueCAGR : assumptions.revenueGrowthRate;
  const gCostAnnual = cagr?.costOfRevenueCAGR ?? (gRevAnnual * 0.9);
  const gOpExAnnual = cagr?.operatingExpensesCAGR ?? (gRevAnnual * 0.8);
  const gDAAnnual = cagr?.depreciationCAGR ?? 8.0;
  const gCapexAnnual = cagr?.capexCAGR ?? 8.0;

  let multScenario = 1.0;
  if (assumptions.scenario === "bull") multScenario = 1.30;
  else if (assumptions.scenario === "bear") multScenario = 0.60;

  const toQuarterlyComp = (annualPct: number) => {
    const rate = (annualPct * multScenario) / 100;
    if (rate >= 0) return Math.pow(1 + rate, 0.25) - 1;
    return -(Math.pow(1 + Math.abs(rate), 0.25) - 1);
  };

  const qRevGrowth = toQuarterlyComp(gRevAnnual);
  const qCostGrowth = toQuarterlyComp(gCostAnnual);
  const qOpExGrowth = toQuarterlyComp(gOpExAnnual);
  const qDAGrowth = toQuarterlyComp(gDAAnnual);
  const qCapexGrowth = toQuarterlyComp(gCapexAnnual);

  const opMargin = assumptions.operatingMarginTarget / 100;
  const grossMargin = assumptions.grossMarginTarget / 100;
  const taxRate = assumptions.taxRateTarget / 100;
  const capexPct = assumptions.capexPercentRevenue / 100;
  const daPct = assumptions.deprecPercentRevenue / 100;
  const nwcPct = assumptions.nwcPercentRevenue / 100;
  const costDebtQ = (assumptions.costOfDebtInterestRate / 100) / 4;

  const baseDate = latestQuarter.date ? new Date(latestQuarter.date) : new Date();

  for (let q = 1; q <= quartersCount; q++) {
    const projDate = new Date(baseDate);
    projDate.setUTCMonth(projDate.getUTCMonth() + q * 3);
    const yearLabel = `Q+${q} ${getQuarterShortLabel(projDate.toISOString())}E`;

    const revenue = Math.round(prev.revenue * (1 + qRevGrowth));
    let costOfRevenue: number;
    let grossProfit: number;
    if (assumptions.scenario === "custom") {
      grossProfit = Math.round(revenue * grossMargin);
      costOfRevenue = revenue - grossProfit;
    } else {
      costOfRevenue = Math.round(prev.costOfRevenue * (1 + qCostGrowth));
      if (costOfRevenue >= revenue * 0.92) costOfRevenue = Math.round(revenue * 0.75);
      grossProfit = revenue - costOfRevenue;
    }
    const currentGrossMargin = revenue > 0 ? grossProfit / revenue : 0.5;

    let operatingExpenses: number;
    let operatingIncome: number;
    if (assumptions.scenario === "custom") {
      operatingIncome = Math.round(revenue * opMargin);
      operatingExpenses = Math.max(0, grossProfit - operatingIncome);
    } else {
      operatingExpenses = Math.round(prev.operatingExpenses * (1 + qOpExGrowth));
      operatingIncome = grossProfit - operatingExpenses;
    }

    const depreciation = assumptions.scenario === "custom"
      ? Math.round(revenue * daPct)
      : Math.max(250000, Math.round(prev.depreciationAmortization * (1 + qDAGrowth)));

    const capex = assumptions.scenario === "custom"
      ? Math.round(revenue * capexPct)
      : Math.max(250000, Math.round(prev.capitalExpenditures * (1 + qCapexGrowth)));

    const prevDebt = prev.totalDebt;
    const debtRepaid = Math.round(prevDebt * 0.025);
    const projectedTotalDebt = Math.max(0, prevDebt - debtRepaid);
    const projectedSTDebt = Math.round(projectedTotalDebt * 0.15);
    const projectedLTDebt = projectedTotalDebt - projectedSTDebt;
    const interestExpense = Math.round(projectedTotalDebt * costDebtQ);

    const preTaxIncome = operatingIncome - interestExpense;
    const taxExpense = Math.max(0, Math.round(preTaxIncome * taxRate));
    const netIncome = preTaxIncome - taxExpense;

    const ar = Math.round(revenue * 0.12);
    const inv = Math.round(revenue * 0.06);
    const ap = Math.round(revenue * 0.08);
    const otherCA = Math.round(revenue * 0.04);
    const otherCL = Math.round(revenue * 0.05);

    const targetNWC = Math.round(revenue * nwcPct);
    const prevNWC = Math.round(prev.revenue * nwcPct);
    const deltaNWC = targetNWC - prevNWC;

    const ocf = netIncome + depreciation - deltaNWC;
    const fcf = ocf - capex;
    const cfi = -capex;

    const dividendsAndBuybacks = Math.max(0, Math.round(netIncome * 0.15));
    const cff = -debtRepaid - dividendsAndBuybacks;
    const netChangeInCash = ocf + cfi + cff;

    const cash = Math.max(1000000, prev.cashAndEquivalents + netChangeInCash);
    const totalCA = cash + ar + inv + otherCA;
    const netPPE = Math.max(0, prev.netPPE + capex - depreciation);
    const gw = prev.goodwillAndIntangibles;
    const otherNCA = Math.round(revenue * 0.05);
    const totalAssets = totalCA + netPPE + gw + otherNCA;

    const totalCL = ap + projectedSTDebt + otherCL;
    const totalLiab = totalCL + projectedLTDebt + Math.round(revenue * 0.04);
    const equity = prev.stockholdersEquity + (netIncome - dividendsAndBuybacks);

    const totalLiabAndEquity = totalLiab + equity;
    const discrepancy = totalAssets - totalLiabAndEquity;

    const netDebt = projectedTotalDebt - cash;
    const ebitda = operatingIncome + depreciation;

    const qRecord: StatementPeriod = {
      yearLabel,
      isHistorical: false,
      periodType: "quarterly",
      date: projDate.toISOString(),
      revenue,
      revenueGrowth: qRevGrowth,
      costOfRevenue,
      grossProfit,
      grossMargin: currentGrossMargin,
      operatingExpenses,
      operatingIncome,
      operatingMargin: revenue > 0 ? operatingIncome / revenue : 0,
      depreciationAmortization: depreciation,
      netInterestExpense: interestExpense,
      preTaxIncome,
      taxExpense,
      taxRate,
      netIncome,
      netMargin: revenue > 0 ? netIncome / revenue : 0,

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
      shortTermDebt: projectedSTDebt,
      otherCurrentLiabilities: otherCL,
      totalCurrentLiabilities: totalCL,
      longTermDebt: projectedLTDebt,
      totalDebt: projectedTotalDebt,
      otherNonCurrentLiabilities: Math.round(revenue * 0.04),
      totalLiabilities: totalLiab,
      stockholdersEquity: equity,
      totalLiabilitiesAndEquity: totalLiabAndEquity,
      balanceDiscrepancy: discrepancy,

      netIncomeCF: netIncome,
      depreciationCF: depreciation,
      changeInWorkingCapital: deltaNWC,
      operatingCashFlow: ocf,
      capitalExpenditures: capex,
      freeCashFlow: fcf,
      investingCashFlow: cfi,
      debtNetIssuance: -debtRepaid,
      equityRepurchaseDividends: dividendsAndBuybacks,
      financingCashFlow: cff,
      netChangeInCash,
      endingCash: cash,

      currentRatio: totalCL > 0 ? totalCA / totalCL : 2.0,
      netDebt,
      netDebtToEbitda: ebitda > 0 ? (netDebt / (ebitda * 4)) : 0,
      interestCoverage: interestExpense > 0 ? operatingIncome / interestExpense : 25,
      debtToEquity: equity > 0 ? projectedTotalDebt / equity : 0,
      fcfConversion: netIncome > 0 ? fcf / netIncome : 1.0,
    };

    result.push(qRecord);
    prev = qRecord;
  }

  return result;
}

export function computeDCFValuation(
  historicalPeriods: StatementPeriod[],
  projectedPeriods: StatementPeriod[],
  assumptions: ModelAssumptions,
  currentPrice: number,
  marketCap: number,
  reportedDebt?: number,
  reportedCash?: number,
  isQuarterlyMode?: boolean
): DCFValuationResult {
  const latestHist = historicalPeriods[historicalPeriods.length - 1];
  const wacc = assumptions.discountRateWacc / 100;
  const gTerm = assumptions.terminalGrowthRate / 100;
  const isTerminalValid = gTerm < wacc - 0.015;

  // In quarterly mode, aggregate 4-quarter chunks or annualize projected FCF
  const fcfList10: number[] = [];

  if (isQuarterlyMode) {
    // Group projected quarters by 4 into annual equivalents
    const annualFcfFromQuarters: number[] = [];
    for (let i = 0; i < projectedPeriods.length; i += 4) {
      const chunk = projectedPeriods.slice(i, i + 4);
      const sumQ = chunk.reduce((sum, q) => sum + q.freeCashFlow, 0);
      const annualEquiv = chunk.length === 4 ? sumQ : Math.round((sumQ / chunk.length) * 4);
      annualFcfFromQuarters.push(annualEquiv);
    }

    annualFcfFromQuarters.forEach(f => fcfList10.push(f));
    const lastAnnualFcf = fcfList10[fcfList10.length - 1] || 1;
    const remainingYears = Math.max(1, 10 - fcfList10.length);
    const gFase2Start = (assumptions.revenueGrowthRate / 100) * 0.60;
    const gFase2End = Math.max(gTerm, (assumptions.revenueGrowthRate / 100) * 0.30);

    let curFcf = lastAnnualFcf;
    for (let yr = 1; yr <= remainingYears; yr++) {
      const fadeGrowth = gFase2Start - (yr * (gFase2Start - gFase2End)) / Math.max(1, remainingYears);
      curFcf = Math.round(curFcf * (1 + fadeGrowth));
      fcfList10.push(curFcf);
    }
  } else {
    // Phase 1: Years 1-5 from projectedPeriods
    projectedPeriods.forEach(p => fcfList10.push(p.freeCashFlow));

    const fcfYr5 = fcfList10[fcfList10.length - 1] || 1;
    const gPhase1 = projectedPeriods[projectedPeriods.length - 1]?.revenueGrowth || 0.15;
    const gFase2Start = gPhase1 * 0.60;
    const gFase2End = Math.max(gTerm, gPhase1 * 0.30);

    let currentFcf = fcfYr5;
    for (let yr = 6; yr <= 10; yr++) {
      const fadeGrowth = gFase2Start - ((yr - 6) * (gFase2Start - gFase2End)) / 4;
      currentFcf = Math.round(currentFcf * (1 + fadeGrowth));
      fcfList10.push(currentFcf);
    }
  }

  // Ensure exactly 10 years of cash flows
  while (fcfList10.length < 10) {
    const last = fcfList10[fcfList10.length - 1] || 1;
    fcfList10.push(Math.round(last * (1 + gTerm)));
  }

  // Discount cash flows
  const pvFcfList = fcfList10.slice(0, 10).map((fcf, idx) => {
    const yr = idx + 1;
    const discountFactor = Math.pow(1 + wacc, yr);
    const pv = Math.round(fcf / discountFactor);
    return { year: yr, fcf, discountFactor, pv };
  });

  const sumPvFcf = pvFcfList.reduce((acc, item) => acc + item.pv, 0);

  // Terminal Value (Gordon Growth)
  const fcf10 = fcfList10[9];
  const denom = Math.max(0.005, wacc - gTerm);
  const terminalValueGross = isTerminalValid ? Math.round((fcf10 * (1 + gTerm)) / denom) : 0;
  const discountFactorYr10 = Math.pow(1 + wacc, 10);
  const pvTerminalValue = Math.round(terminalValueGross / discountFactorYr10);

  // Enterprise Value
  const enterpriseValue = sumPvFcf + pvTerminalValue;
  const pctTerminalValue = enterpriseValue > 0 ? (pvTerminalValue / enterpriseValue) * 100 : 60;

  // Equity Bridge
  // Yahoo a veces devuelve null: entonces se usa el último balance.
  const totalDebt = typeof reportedDebt === "number" && Number.isFinite(reportedDebt) ? reportedDebt : (latestHist?.totalDebt || 0);
  const totalCash = typeof reportedCash === "number" && Number.isFinite(reportedCash) ? reportedCash : (latestHist?.cashAndEquivalents || 0);
  const netDebt = totalDebt - totalCash;

  // Rule 5.2: if netDebt is negative (more cash than debt), it is added to EV
  const equityValue = enterpriseValue - netDebt;
  const shares = assumptions.dilutedShares > 0 ? assumptions.dilutedShares : 1;
  const fairValuePerShare = Math.max(0, Number((equityValue / shares).toFixed(2)));
  const upsideDownsidePct = currentPrice > 0 ? ((fairValuePerShare - currentPrice) / currentPrice) * 100 : 0;

  // CAPM breakdown
  const rf = assumptions.riskFreeRate / 100;
  const erp = assumptions.equityRiskPremium / 100;
  const beta = assumptions.beta || 1.1;
  const costOfEquity = rf + beta * erp;
  const costOfDebtGross = assumptions.costOfDebtInterestRate / 100;
  const costOfDebtNet = costOfDebtGross * (1 - assumptions.taxRateTarget / 100);

  const totalCap = marketCap + totalDebt;
  const weightEquity = totalCap > 0 ? marketCap / totalCap : 0.9;
  const weightDebt = totalCap > 0 ? totalDebt / totalCap : 0.1;
  const calculatedWacc = weightEquity * costOfEquity + weightDebt * costOfDebtNet;

  // Sensitivity Matrix (WACC x g_terminal)
  const waccSteps = [wacc - 0.02, wacc - 0.01, wacc, wacc + 0.01, wacc + 0.02];
  const gSteps = [0.02, 0.025, 0.03, 0.035, 0.04];

  const sensitivityMatrix = waccSteps.map(w => {
    return gSteps.map(g => {
      if (g >= w - 0.005) {
        return { wacc: w * 100, terminalGrowth: g * 100, fairValue: 0 };
      }
      const pvFcfMatrix = fcfList10.reduce((acc, fcf, i) => acc + fcf / Math.pow(1 + w, i + 1), 0);
      const tvGrossMatrix = (fcf10 * (1 + g)) / (w - g);
      const pvTvMatrix = tvGrossMatrix / Math.pow(1 + w, 10);
      const evMatrix = pvFcfMatrix + pvTvMatrix;
      const eqMatrix = evMatrix - netDebt;
      const fvMatrix = Math.max(0, Number((eqMatrix / shares).toFixed(2)));
      return {
        wacc: Number((w * 100).toFixed(1)),
        terminalGrowth: Number((g * 100).toFixed(1)),
        fairValue: fvMatrix,
      };
    });
  });

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
    equityValue,
    fairValuePerShare,
    currentPrice,
    upsideDownsidePct,
    calculatedWacc: calculatedWacc * 100,
    costOfEquity: costOfEquity * 100,
    costOfDebtNet: costOfDebtNet * 100,
    weightEquity: weightEquity * 100,
    weightDebt: weightDebt * 100,
    sensitivityMatrix,
    isTerminalValid,
  };
}
