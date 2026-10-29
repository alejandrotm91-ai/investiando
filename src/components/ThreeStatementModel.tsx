import React, { useState, useEffect, useMemo } from "react";
import { 
  Calculator, 
  TrendingUp, 
  TrendingDown, 
  Scale, 
  Layers, 
  ShieldCheck, 
  Sliders, 
  Copy, 
  Check, 
  RefreshCw, 
  ArrowUpRight, 
  ArrowDownRight, 
  DollarSign, 
  AlertTriangle,
  Info,
  ChevronRight,
  Search,
  FileSpreadsheet,
  Calendar,
  Clock,
  PieChart,
  Save
} from "lucide-react";
import { 
  StatementPeriod, 
  ModelAssumptions, 
  CurrentYearStatus,
  HistoricalCAGRs,
  computeHistoricalCAGRs,
  detectCurrentYearStatus,
  buildTTMStatementPeriod,
  buildHistoricalStatements, 
  buildQuarterlyHistoricalStatements,
  projectStatements, 
  projectQuarterlyStatements,
  computeDCFValuation 
} from "../utils/threeStatementModel";

interface ThreeStatementModelProps {
  portfolioTickers?: string[];
  initialTicker?: string;
  language?: "EN" | "ES";
  theme?: "dark" | "light";
}

function formatCurrency(val: number): string {
  if (Math.abs(val) >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
  if (Math.abs(val) >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
  if (Math.abs(val) >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
  if (Math.abs(val) >= 1e3) return `$${(val / 1e3).toFixed(1)}k`;
  return `$${val.toLocaleString()}`;
}

function formatPercent(val: number): string {
  const sign = val > 0 ? "+" : "";
  return `${sign}${(val * 100).toFixed(1)}%`;
}

export default function ThreeStatementModel({
  portfolioTickers = ["NVDA", "AAPL", "MSFT"],
  initialTicker = "NVDA",
  language = "ES",
  theme = "dark"
}: ThreeStatementModelProps) {
  const [selectedTicker, setSelectedTicker] = useState<string>(initialTicker);
  const [searchInput, setSearchInput] = useState<string>("");
  const [activeSubTab, setActiveSubTab] = useState<"statements" | "dcf" | "solvency" | "drivers">("statements");
  const [statementView, setStatementView] = useState<"all" | "income" | "balance" | "cashflow">("all");
  const [periodicity, setPeriodicity] = useState<"annual" | "quarterly">("annual");
  const [scenario, setScenario] = useState<"base" | "bull" | "bear" | "custom">("base");
  const [loading, setLoading] = useState<boolean>(false);
  const [copiedMemo, setCopiedMemo] = useState<boolean>(false);
  const [copiedGrid, setCopiedGrid] = useState<boolean>(false);

  // Raw API fetched data
  const [rawFinancials, setRawFinancials] = useState<any[]>([]);
  const [rawQuarterly, setRawQuarterly] = useState<any[]>([]);
  const [stockQuote, setStockQuote] = useState<any>(null);
  const [historicalCAGRs, setHistoricalCAGRs] = useState<HistoricalCAGRs | null>(null);

  // Model driver overrides
  const [customDrivers, setCustomDrivers] = useState<{
    revGrowth: number;
    opMargin: number;
    taxRate: number;
    capexPct: number;
    wacc: number;
    gTerminal: number;
  }>({
    revGrowth: 15,
    opMargin: 35,
    taxRate: 17,
    capexPct: 6,
    wacc: 10,
    gTerminal: 3.0,
  });

  // Fetch company financials and quote
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      if (!selectedTicker) return;
      setLoading(true);
      try {
        const [finRes, stockRes] = await Promise.all([
          fetch("/api/portfolio/financials", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tickers: [selectedTicker] })
          }),
          fetch(`/api/stock/${selectedTicker}`)
        ]);

        let fData: any[] = [];
        let qData: any[] = [];
        let sData: any = null;

        if (finRes.ok) {
          const json = await finRes.json();
          fData = json[selectedTicker]?.annual || [];
          qData = json[selectedTicker]?.quarterly || [];
        }

        if (stockRes.ok) {
          sData = await stockRes.json();
        }

        if (isMounted) {
          setRawFinancials(fData);
          setRawQuarterly(qData);
          setStockQuote(sData);

          // Calibrate CAGRs directly from financials as the Base Case projection
          if (fData && fData.length > 0) {
            const cagrs = computeHistoricalCAGRs(fData);
            setHistoricalCAGRs(cagrs);

            const latest = fData[0];
            const rev = Number(latest.totalRevenue || 1);
            const opInc = Number(latest.operatingIncome || 0);
            const capex = Math.abs(Number(latest.capitalExpenditure || 0));
            const calculatedMargin = rev > 0 ? (opInc / rev) * 100 : 30;
            const calculatedCapexPct = rev > 0 ? (capex / rev) * 100 : 5;

            setCustomDrivers({
              revGrowth: Number(cagrs.revenueCAGR.toFixed(1)),
              opMargin: Number(calculatedMargin.toFixed(1)),
              taxRate: 17,
              capexPct: Number(calculatedCapexPct.toFixed(1)),
              wacc: sData?.beta && sData.beta > 1.8 ? 11.5 : 9.5,
              gTerminal: 3.0,
            });
          }
        }
      } catch (err) {
        console.error("Error loading 3-statement data:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();
    return () => { isMounted = false; };
  }, [selectedTicker]);

  // Current Fiscal Year Tracking status
  const currentYearStatus: CurrentYearStatus = useMemo(() => {
    return detectCurrentYearStatus(rawFinancials, rawQuarterly);
  }, [rawFinancials, rawQuarterly]);

  // Historical CAGRs computed from Financials (Base Case Driver Anchor)
  const cagrDisplay: HistoricalCAGRs | null = useMemo(() => {
    return historicalCAGRs || (rawFinancials.length >= 2 ? computeHistoricalCAGRs(rawFinancials) : null);
  }, [historicalCAGRs, rawFinancials]);

  // Build active assumptions based on scenario
  const assumptions: ModelAssumptions = useMemo(() => {
    const baseRevGrowth = customDrivers.revGrowth;
    const baseOpMargin = customDrivers.opMargin;
    const baseWacc = customDrivers.wacc;

    let revG = baseRevGrowth;
    let opM = baseOpMargin;
    let waccVal = baseWacc;
    let gTerm = customDrivers.gTerminal;

    if (scenario === "bull") {
      revG = Number((baseRevGrowth * 1.35).toFixed(1));
      opM = Math.min(65, Number((baseOpMargin + 4).toFixed(1)));
      waccVal = Math.max(7.5, Number((baseWacc - 0.75).toFixed(1)));
      gTerm = Math.min(4.0, Number((gTerm + 0.5).toFixed(1)));
    } else if (scenario === "bear") {
      revG = Math.max(2, Number((baseRevGrowth * 0.6).toFixed(1)));
      opM = Math.max(10, Number((baseOpMargin - 5).toFixed(1)));
      waccVal = Number((baseWacc + 1.25).toFixed(1));
      gTerm = Math.max(1.8, Number((gTerm - 0.5).toFixed(1)));
    }

    const shares = Number(
      stockQuote?.sharesOutstanding || 
      rawFinancials[0]?.dilutedAverageShares || 
      rawFinancials[0]?.ordinarySharesNumber || 
      1000000000
    );

    const activeCAGRs = historicalCAGRs || (rawFinancials.length >= 2 ? computeHistoricalCAGRs(rawFinancials) : undefined);

    return {
      scenario,
      historicalCAGRs: activeCAGRs,
      revenueGrowthRate: revG,
      grossMarginTarget: Math.min(90, opM + 25),
      operatingMarginTarget: opM,
      taxRateTarget: customDrivers.taxRate,
      capexPercentRevenue: customDrivers.capexPct,
      deprecPercentRevenue: Math.max(2, customDrivers.capexPct * 0.8),
      nwcPercentRevenue: 10,
      costOfDebtInterestRate: 4.5,
      annualDebtRepaymentPct: 10,
      dividendPayoutRatio: 15,

      discountRateWacc: waccVal,
      terminalGrowthRate: gTerm,
      dilutedShares: shares,
      riskFreeRate: 4.2,
      equityRiskPremium: 5.5,
      beta: stockQuote?.beta || 1.15,
    };
  }, [scenario, customDrivers, stockQuote, rawFinancials, historicalCAGRs]);

  // Build model periods according to chosen periodicity (Annual with TTM calibration vs Quarterly)
  const { historicalPeriods, projectedPeriods, allPeriods } = useMemo(() => {
    if (periodicity === "quarterly") {
      const histQ = buildQuarterlyHistoricalStatements(rawQuarterly, assumptions.dilutedShares);
      const latestQ = histQ[histQ.length - 1];
      if (!latestQ) {
        const hist = buildHistoricalStatements(rawFinancials, assumptions.dilutedShares);
        const latest = hist[hist.length - 1];
        const proj = projectStatements(latest, assumptions, 5);
        return { historicalPeriods: hist, projectedPeriods: proj, allPeriods: [...hist, ...proj] };
      }
      const projQ = projectQuarterlyStatements(latestQ, assumptions, 8);
      return {
        historicalPeriods: histQ,
        projectedPeriods: projQ,
        allPeriods: [...histQ, ...projQ]
      };
    }

    // Annual mode: include historicals + TTM (incorporating reported quarters of current year) + 5-year forecast
    const hist = buildHistoricalStatements(rawFinancials, assumptions.dilutedShares);
    const ttmPeriod = buildTTMStatementPeriod(rawQuarterly, rawFinancials);

    const histWithTTM = ttmPeriod ? [...hist, ttmPeriod] : hist;
    const anchorPeriod = ttmPeriod || hist[hist.length - 1];

    if (!anchorPeriod) {
      return { historicalPeriods: [], projectedPeriods: [], allPeriods: [] };
    }

    const proj = projectStatements(anchorPeriod, assumptions, 5);
    return {
      historicalPeriods: histWithTTM,
      projectedPeriods: proj,
      allPeriods: [...histWithTTM, ...proj]
    };
  }, [rawFinancials, rawQuarterly, assumptions, periodicity]);

  // Compute DCF valuation based on RULE[AGENTS_md]
  const dcfValuation = useMemo(() => {
    const curPrice = stockQuote?.price || 100;
    const mktCap = stockQuote?.marketCap || curPrice * assumptions.dilutedShares;
    const debt = stockQuote?.totalDebt;
    const cash = stockQuote?.totalCash;
    return computeDCFValuation(
      historicalPeriods.length > 0 ? historicalPeriods : allPeriods.slice(0, 1),
      projectedPeriods,
      assumptions,
      curPrice,
      mktCap,
      debt,
      cash,
      periodicity === "quarterly"
    );
  }, [historicalPeriods, projectedPeriods, assumptions, stockQuote, allPeriods, periodicity]);

  // Generate standardized DCF calculation memory string (Rule 6 format)
  const standardMemoryText = useMemo(() => {
    const curPrice = dcfValuation.currentPrice;
    const latestHist = historicalPeriods[historicalPeriods.length - 1] || allPeriods[0];
    const dateStr = new Date().toISOString().split("T")[0];

    return `DCF — [${selectedTicker}]  |  Precio actual: $${curPrice.toFixed(2)}  |  Fecha: ${dateStr}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INPUTS BASE (investiando.app — Periodo: ${periodicity === "annual" ? "Anual (Calibrado TTM)" : "Trimestral"})
  Free Cash Flow Base:            ${formatCurrency(latestHist?.freeCashFlow || 0)}
  Operating Cash Flow:            ${formatCurrency(latestHist?.operatingCashFlow || 0)}
  Capital Expenditure:            ${formatCurrency(latestHist?.capitalExpenditures || 0)}
  FCF verificado (OCF − Capex):   ${formatCurrency((latestHist?.operatingCashFlow || 0) - (latestHist?.capitalExpenditures || 0))}
  Total Revenue Base:             ${formatCurrency(latestHist?.revenue || 0)}
  Margen FCF:                     ${((latestHist?.freeCashFlow / (latestHist?.revenue || 1)) * 100).toFixed(1)}%
  Total Cash:                     ${formatCurrency(dcfValuation.totalCash)}
  Total Debt:                     ${formatCurrency(dcfValuation.totalDebt)}
  Net Debt:                       ${formatCurrency(dcfValuation.netDebt)} ${dcfValuation.netDebt < 0 ? "(net CASH positivo)" : ""}
  Ordinary Shares Number:         ${(assumptions.dilutedShares / 1e9).toFixed(2)}B
  Beta (5Y Vol):                  ${assumptions.beta.toFixed(2)}
  Tax Rate:                       ${assumptions.taxRateTarget}%

ESTADO AÑO EN CURSO (${currentYearStatus.currentFiscalYearLabel})
  Trimestres reportados:          ${currentYearStatus.quartersReportedCount} de 4 (${currentYearStatus.quartersReportedLabels.join(", ")})
  YTD Revenue / FCF:              ${formatCurrency(currentYearStatus.ytdRevenue)} / ${formatCurrency(currentYearStatus.ytdFcf)}
  TTM Revenue / FCF (12 meses):   ${formatCurrency(currentYearStatus.ttmRevenue)} / ${formatCurrency(currentYearStatus.ttmFcf)}
  Run-Rate Cierre Estimado:       ${formatCurrency(currentYearStatus.estimatedFullYearRevenue)}

WACC
  Rf (10Y Treasury):              ${assumptions.riskFreeRate}%
  Beta:                           ${assumptions.beta.toFixed(2)}
  ERP:                            ${assumptions.equityRiskPremium}%
  Ke (costo equity):              ${dcfValuation.costOfEquity.toFixed(2)}%
  Kd_neto (post-tax):             ${dcfValuation.costOfDebtNet.toFixed(2)}%
  Weight equity / deuda:          ${dcfValuation.weightEquity.toFixed(1)}% / ${dcfValuation.weightDebt.toFixed(1)}%
  WACC:                           ${assumptions.discountRateWacc}%

PROYECCIÓN FCF (10 AÑOS)
  g_fase1 (años 1–5):             ${assumptions.revenueGrowthRate}%
  g_terminal:                     ${assumptions.terminalGrowthRate}%

  Año   FCF_proyectado     Factor_desc   PV_FCF
${dcfValuation.pvFcfList.map(item => `   ${item.year.toString().padStart(2, " ")}   ${formatCurrency(item.fcf).padEnd(16, " ")}   ${item.discountFactor.toFixed(3).padEnd(11, " ")}   ${formatCurrency(item.pv)}`).join("\n")}
  Σ PV FCF (10 años):             ${formatCurrency(dcfValuation.sumPvFcf)}

VALOR TERMINAL (Gordon Growth)
  FCF año 10:                     ${formatCurrency(dcfValuation.terminalFcf)}
  g_terminal:                     ${assumptions.terminalGrowthRate}%
  WACC − g:                       ${(assumptions.discountRateWacc - assumptions.terminalGrowthRate).toFixed(2)}%
  VT bruto:                       ${formatCurrency(dcfValuation.terminalValueGross)}
  PV del VT:                      ${formatCurrency(dcfValuation.pvTerminalValue)}
  % VT sobre EV:                  ${dcfValuation.pctTerminalValue.toFixed(1)}% (rango saludable: 55–75%)

EQUITY BRIDGE
  Σ PV FCF:                       ${formatCurrency(dcfValuation.sumPvFcf)}
  + PV Valor Terminal:            ${formatCurrency(dcfValuation.pvTerminalValue)}
  = Enterprise Value:             ${formatCurrency(dcfValuation.enterpriseValue)}
  − Net Debt:                     ${formatCurrency(dcfValuation.netDebt)} ${dcfValuation.netDebt < 0 ? "[net cash → SUMA]" : ""}
  = Equity Value:                 ${formatCurrency(dcfValuation.equityValue)}
  ÷ Shares:                       ${(assumptions.dilutedShares / 1e9).toFixed(2)}B
  = Fair Value por acción:        $${dcfValuation.fairValuePerShare.toFixed(2)}
  vs. Precio Actual:              $${curPrice.toFixed(2)} (${dcfValuation.upsideDownsidePct >= 0 ? "+" : ""}${dcfValuation.upsideDownsidePct.toFixed(1)}%)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
  }, [dcfValuation, selectedTicker, historicalPeriods, allPeriods, assumptions, periodicity, currentYearStatus]);

  const handleCopyMemo = () => {
    navigator.clipboard.writeText(standardMemoryText);
    setCopiedMemo(true);
    setTimeout(() => setCopiedMemo(false), 2500);
  };

  const handleCopyGridToExcel = async () => {
    if (!allPeriods || allPeriods.length === 0) return;

    const periodHeaders = allPeriods.map(p => 
      `${p.yearLabel}${p.isTTM ? " (TTM)" : !p.isHistorical ? " (Forecast)" : " (Reported)"}`
    );

    const headerCols = [
      language === "EN" ? "Financial Line Item" : "Partida Contable",
      language === "EN" ? "Base CAGR (Financials)" : "CAGR Base (Financials)",
      ...periodHeaders
    ];

    const rows: string[][] = [
      [`${selectedTicker} — ${language === "EN" ? "3-Statement Financial Model" : "Modelo Financiero de 3 Estados"} (${scenario.toUpperCase()} - ${periodicity === "annual" ? "Annual" : "Quarterly"})`, ...allPeriods.map(() => "")],
      headerCols
    ];

    const cRev = cagrDisplay ? formatPercent(cagrDisplay.revenueCAGR / 100) : "—";
    const cGross = cagrDisplay ? formatPercent(cagrDisplay.grossProfitCAGR / 100) : "—";
    const cOpInc = cagrDisplay ? formatPercent(cagrDisplay.operatingIncomeCAGR / 100) : "—";
    const cDA = cagrDisplay ? formatPercent(cagrDisplay.depreciationCAGR / 100) : "—";
    const cNet = cagrDisplay ? formatPercent(cagrDisplay.netIncomeCAGR / 100) : "—";
    const cOcf = cagrDisplay ? formatPercent(cagrDisplay.operatingCashFlowCAGR / 100) : "—";
    const cCapex = cagrDisplay ? formatPercent(cagrDisplay.capexCAGR / 100) : "—";
    const cFcf = cagrDisplay ? formatPercent(cagrDisplay.fcfCAGR / 100) : "—";

    // 1. Income Statement
    if (statementView === "all" || statementView === "income") {
      rows.push([language === "EN" ? "--- 1. INCOME STATEMENT (P&L) ---" : "--- 1. ESTADO DE RESULTADOS (P&L) ---", "", ...allPeriods.map(() => "")]);
      rows.push([language === "EN" ? "Total Revenue" : "Ingresos Totales (Revenue)", cRev, ...allPeriods.map(p => formatCurrency(p.revenue))]);
      rows.push([language === "EN" ? "YoY / QoQ Revenue Growth %" : "Crecimiento de Ingresos %", "—", ...allPeriods.map(p => formatPercent(p.revenueGrowth))]);
      rows.push([language === "EN" ? "Gross Profit" : "Utilidad Bruta (Gross Profit)", cGross, ...allPeriods.map(p => formatCurrency(p.grossProfit))]);
      rows.push([language === "EN" ? "Gross Margin %" : "Margen Bruto %", "—", ...allPeriods.map(p => `${(p.grossMargin * 100).toFixed(1)}%`)]);
      rows.push([language === "EN" ? "Operating Income (EBIT)" : "Resultado Operativo (EBIT)", cOpInc, ...allPeriods.map(p => formatCurrency(p.operatingIncome))]);
      rows.push([language === "EN" ? "Operating Margin %" : "Margen Operativo %", "—", ...allPeriods.map(p => `${(p.operatingMargin * 100).toFixed(1)}%`)]);
      rows.push([language === "EN" ? "Depreciation & Amortization" : "Depreciación & Amortización", cDA, ...allPeriods.map(p => formatCurrency(p.depreciationAmortization))]);
      rows.push([language === "EN" ? "Net Interest Expense" : "Gasto por Intereses", "—", ...allPeriods.map(p => formatCurrency(p.netInterestExpense))]);
      rows.push([language === "EN" ? "Net Income (Bottom Line)" : "Utilidad Neta (Net Income)", cNet, ...allPeriods.map(p => formatCurrency(p.netIncome))]);
      rows.push([language === "EN" ? "Net Margin %" : "Margen Neto %", "—", ...allPeriods.map(p => `${(p.netMargin * 100).toFixed(1)}%`)]);
    }

    // 2. Balance Sheet
    if (statementView === "all" || statementView === "balance") {
      rows.push([language === "EN" ? "--- 2. BALANCE SHEET ---" : "--- 2. BALANCE GENERAL ---", "", ...allPeriods.map(() => "")]);
      rows.push([language === "EN" ? "Cash & Equivalents" : "Efectivo y Equivalentes", "—", ...allPeriods.map(p => formatCurrency(p.cashAndEquivalents))]);
      rows.push([language === "EN" ? "Total Current Assets" : "Activos Corrientes Totales", "—", ...allPeriods.map(p => formatCurrency(p.totalCurrentAssets))]);
      rows.push([language === "EN" ? "Net PP&E" : "Propiedad, Planta y Equipo Neto", "—", ...allPeriods.map(p => formatCurrency(p.netPPE))]);
      rows.push([language === "EN" ? "TOTAL ASSETS" : "ACTIVOS TOTALES", "—", ...allPeriods.map(p => formatCurrency(p.totalAssets))]);
      rows.push([language === "EN" ? "Total Debt (Short + Long Term)" : "Deuda Total (Corto + Largo Plazo)", "—", ...allPeriods.map(p => formatCurrency(p.totalDebt))]);
      rows.push([language === "EN" ? "Total Liabilities" : "Pasivos Totales", "—", ...allPeriods.map(p => formatCurrency(p.totalLiabilities))]);
      rows.push([language === "EN" ? "Stockholders' Equity" : "Patrimonio Neto (Equity)", "—", ...allPeriods.map(p => formatCurrency(p.stockholdersEquity))]);
      rows.push([language === "EN" ? "Balance Check (Assets = Liab + Equity)" : "Cuadre Contable (Activo = Pasivo + PN)", "—", ...allPeriods.map(p => Math.abs(p.balanceDiscrepancy) < 1000000 ? "✓ CUADRADO" : `Δ ${formatCurrency(p.balanceDiscrepancy)}`)]);
    }

    // 3. Cash Flow Statement
    if (statementView === "all" || statementView === "cashflow") {
      rows.push([language === "EN" ? "--- 3. CASH FLOW STATEMENT ---" : "--- 3. ESTADO DE FLUJOS DE EFECTIVO ---", "", ...allPeriods.map(() => "")]);
      rows.push([language === "EN" ? "Cash Flow from Operations (OCF)" : "Flujo de Operación (OCF)", cOcf, ...allPeriods.map(p => formatCurrency(p.operatingCashFlow))]);
      rows.push([language === "EN" ? "Capital Expenditures (Capex)" : "Inversiones de Capital (Capex)", cCapex, ...allPeriods.map(p => `-${formatCurrency(p.capitalExpenditures)}`)]);
      rows.push([language === "EN" ? "FREE CASH FLOW (FCF = OCF - Capex)" : "FREE CASH FLOW (FCF = OCF - Capex)", cFcf, ...allPeriods.map(p => formatCurrency(p.freeCashFlow))]);
      rows.push([language === "EN" ? "Ending Cash Balance" : "Saldo Final de Caja", "—", ...allPeriods.map(p => formatCurrency(p.endingCash))]);
    }

    const tsvContent = rows.map(r => r.join("\t")).join("\n");

    const htmlContent = `<table>
      <thead>
        <tr style="background:#0f172a; color:#38bdf8; font-weight:bold; font-size:14px;">
          <th colspan="${headerCols.length}" style="border:1px solid #334155; padding:8px;">${selectedTicker} — ${language === "EN" ? "3-Statement Financial Model" : "Modelo Financiero de 3 Estados"} (${scenario.toUpperCase()} - ${periodicity.toUpperCase()})</th>
        </tr>
        <tr style="background:#1e293b; color:#ffffff; font-weight:bold;">
          ${headerCols.map(h => `<th style="border:1px solid #334155; padding:6px 10px; text-align:left;">${h}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${rows.slice(2).map(row => {
          const isSection = row[0].startsWith("---");
          if (isSection) {
            return `<tr style="background:#0f172a; color:#38bdf8; font-weight:bold;"><td colspan="${headerCols.length}" style="border:1px solid #334155; padding:6px 10px;">${row[0].replace(/---/g, "").trim()}</td></tr>`;
          }
          const isHighlight = row[0].includes("Total Revenue") || row[0].includes("TOTAL ASSETS") || row[0].includes("Net Income") || row[0].includes("FREE CASH FLOW");
          return `<tr style="${isHighlight ? "background:#1e293b; font-weight:bold;" : ""}">
            ${row.map((cell, idx) => `<td style="border:1px solid #334155; padding:4px 8px; text-align:${idx > 0 ? "right" : "left"}; color:${idx === 1 ? "#38bdf8" : "#ffffff"};">${cell}</td>`).join("")}
          </tr>`;
        }).join("")}
      </tbody>
    </table>`;

    try {
      if (navigator.clipboard && window.ClipboardItem) {
        const textBlob = new Blob([tsvContent], { type: "text/plain" });
        const htmlBlob = new Blob([htmlContent], { type: "text/html" });
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": textBlob,
            "text/html": htmlBlob
          })
        ]);
      } else {
        await navigator.clipboard.writeText(tsvContent);
      }
    } catch {
      await navigator.clipboard.writeText(tsvContent);
    }

    setCopiedGrid(true);
    setTimeout(() => setCopiedGrid(false), 2500);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setSelectedTicker(searchInput.trim().toUpperCase());
      setSearchInput("");
    }
  };

  return (
    <div className="space-y-6 w-full max-w-[1580px] mx-auto pb-12 animate-fade-in">
      {/* Top Header & Ticker Bar */}
      <div className="bg-[#0f111a]/85 border border-slate-900/80 p-6 sm:p-7 rounded-3xl shadow-2xl backdrop-blur-md relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-500/20 via-emerald-400 to-emerald-500/20" />
        
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono font-bold uppercase tracking-wider">
              <FileSpreadsheet size={16} className="text-emerald-400" />
              <span>{language === "EN" ? "INTEGRATED FINANCIAL MODEL" : "MODELO FINANCIERO INTEGRADO"}</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-display font-black text-white tracking-tight flex items-center gap-3">
              <span>{language === "EN" ? "3-Statement Model & DCF Valuation" : "Modelo de 3 Estados & Valoración DCF"}</span>
              <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {selectedTicker}
              </span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-3xl leading-relaxed">
              {language === "EN"
                ? "Dynamically interconnect Income Statement, Balance Sheet, and Cash Flow projections with Annual (TTM-calibrated) and Quarterly granularity, tracking year-to-date quarters elapsed vs. remaining."
                : "Interconexión dinámica de Estado de Resultados, Balance General y Flujo de Caja en frecuencia Anual (calibrada por TTM) y Trimestral, integrando los trimestres reportados del año en curso con valoración DCF."}
            </p>
          </div>

        </div>

        {/* Ticker Selector & Search Strip */}
        <div className="mt-6 pt-5 border-t border-slate-800/70 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400 mr-1">
              {language === "EN" ? "HOLDINGS & BENCHMARKS:" : "PORTAFOLIO & REFERENCIAS:"}
            </span>
            {portfolioTickers.map(tkr => (
              <button
                key={tkr}
                onClick={() => setSelectedTicker(tkr)}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer border ${
                  selectedTicker === tkr
                    ? "bg-emerald-500 text-slate-950 border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.35)]"
                    : "bg-slate-950/70 text-slate-300 border-slate-800 hover:border-slate-700 hover:text-white"
                }`}
              >
                {tkr}
              </button>
            ))}
            {["NVDA", "AAPL", "MSFT", "GOOGL", "AMZN"].filter(t => !portfolioTickers.includes(t)).map(tkr => (
              <button
                key={tkr}
                onClick={() => setSelectedTicker(tkr)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition-colors border ${
                  selectedTicker === tkr
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                    : "bg-slate-900/40 text-slate-400 border-slate-800/80 hover:text-slate-200"
                }`}
              >
                {tkr}
              </button>
            ))}
          </div>

          {/* Quick Search */}
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-48">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder={language === "EN" ? "Ticker (e.g. META)..." : "Ticker (ej. META)..."}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/60 font-mono uppercase"
              />
            </div>
            <button
              type="submit"
              className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              {language === "EN" ? "Load" : "Cargar"}
            </button>
          </form>
        </div>
      </div>

      {/* ========================================================
          CURRENT YEAR PROGRESS BANNER (AÑO EN CURSO: QUARTERS REPORTADOS)
          ======================================================== */}
      {currentYearStatus.quartersReportedCount > 0 && (
        <div className="bg-[#0b0e17] border border-emerald-900/40 rounded-3xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="space-y-2">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20 flex items-center gap-1.5">
                  <Clock size={13} />
                  <span>{language === "EN" ? "CURRENT YEAR IN PROGRESS" : "AÑO FISCAL EN CURSO"}</span>
                </span>
                <span className="text-white font-extrabold text-sm font-mono">
                  {currentYearStatus.currentFiscalYearLabel}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  ({currentYearStatus.quartersReportedCount} / 4 {language === "EN" ? "quarters reported" : "quarters reportados"}
                  {currentYearStatus.quartersRemainingCount > 0 ? ` • ${currentYearStatus.quartersRemainingCount} ${language === "EN" ? "remaining" : "pendientes"}` : " • Completo"})
                </span>
                {/* Quarter Badges */}
                <div className="flex items-center gap-1">
                  {currentYearStatus.quartersReportedLabels.map(ql => (
                    <span key={ql} className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/60">
                      ✓ {ql}
                    </span>
                  ))}
                  {Array.from({ length: currentYearStatus.quartersRemainingCount }).map((_, i) => (
                    <span key={i} className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900/60 text-slate-500 border border-slate-800">
                      Q+{i + 1} Est
                    </span>
                  ))}
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full max-w-md bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-800 mt-2">
                <div 
                  className="bg-gradient-to-r from-emerald-500 to-emerald-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (currentYearStatus.quartersReportedCount / 4) * 100)}%` }}
                />
              </div>

              <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                {language === "EN"
                  ? `The model calibrates the baseline using Trailing Twelve Months (TTM: last 4 reported quarters) so projections capture recent ${currentYearStatus.quartersReportedCount}Q acceleration rather than lagging behind closed annual reports.`
                  : `El modelo calibra la base utilizando el TTM (suma de los últimos 4 trimestres reportados) para que las proyecciones capturen la aceleración real de los ${currentYearStatus.quartersReportedCount} trimestres del año en curso en vez de desfasarse con el último reporte anual cerrado.`}
              </p>
            </div>

            {/* Current Year KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono shrink-0">
              <div className="bg-slate-900/70 p-3 rounded-2xl border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase block">{language === "EN" ? "YTD Revenue" : "Ingresos YTD"}</span>
                <span className="text-white font-bold text-sm">{formatCurrency(currentYearStatus.ytdRevenue)}</span>
                <span className="text-[9px] text-slate-500 block">({currentYearStatus.quartersReportedCount}Q acumulado)</span>
              </div>
              <div className="bg-slate-900/70 p-3 rounded-2xl border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase block">{language === "EN" ? "YTD Free Cash Flow" : "FCF YTD"}</span>
                <span className="text-emerald-400 font-bold text-sm">{formatCurrency(currentYearStatus.ytdFcf)}</span>
                <span className="text-[9px] text-slate-500 block">({currentYearStatus.quartersReportedCount}Q acumulado)</span>
              </div>
              <div className="bg-slate-900/70 p-3 rounded-2xl border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase block">{language === "EN" ? "TTM Revenue (12M)" : "Ingresos TTM (12M)"}</span>
                <span className="text-sky-300 font-bold text-sm">{formatCurrency(currentYearStatus.ttmRevenue)}</span>
                <span className="text-[9px] text-emerald-400 block font-semibold">Ritmo actual</span>
              </div>
              <div className="bg-slate-900/70 p-3 rounded-2xl border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase block">{language === "EN" ? "TTM FCF (12M)" : "FCF TTM (12M)"}</span>
                <span className="text-emerald-300 font-bold text-sm">{formatCurrency(currentYearStatus.ttmFcf)}</span>
                <span className="text-[9px] text-slate-500 block">Base DCF</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Tab Navigation inside 3-Statement Hub */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab("statements")}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all border ${
              activeSubTab === "statements"
                ? "bg-white text-slate-950 border-white shadow-lg font-black"
                : "text-slate-400 border-transparent hover:text-white hover:bg-slate-800/50"
            }`}
          >
            <Layers size={14} />
            <span>{periodicity === "annual" ? (language === "EN" ? "3-Statements Grid (Annual)" : "Matriz 3 Estados (Anual)") : (language === "EN" ? "3-Statements Grid (Quarterly)" : "Matriz 3 Estados (Trimestral)")}</span>
          </button>

          <button
            onClick={() => setActiveSubTab("dcf")}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all border ${
              activeSubTab === "dcf"
                ? "bg-emerald-500 text-slate-950 border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.35)] font-black"
                : "text-slate-400 border-transparent hover:text-white hover:bg-slate-800/50"
            }`}
          >
            <Calculator size={14} />
            <span>{language === "EN" ? "DCF & Intrinsic Value" : "Valoración DCF & Equity Bridge"}</span>
          </button>

          <button
            onClick={() => setActiveSubTab("solvency")}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all border ${
              activeSubTab === "solvency"
                ? "bg-white text-slate-950 border-white shadow-lg font-black"
                : "text-slate-400 border-transparent hover:text-white hover:bg-slate-800/50"
            }`}
          >
            <ShieldCheck size={14} />
            <span>{language === "EN" ? "Solvency & Health" : "Solvencia & Ratios"}</span>
          </button>

          <button
            onClick={() => setActiveSubTab("drivers")}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all border ${
              activeSubTab === "drivers"
                ? "bg-white text-slate-950 border-white shadow-lg font-black"
                : "text-slate-400 border-transparent hover:text-white hover:bg-slate-800/50"
            }`}
          >
            <Sliders size={14} />
            <span>{language === "EN" ? "Driver Assumptions" : "Supuestos & Drivers"}</span>
          </button>
        </div>

        {/* KPI Mini Pill Strip */}
        <div className="hidden sm:flex items-center gap-3 text-xs font-mono">
          <div className="bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800 flex items-center gap-2">
            <span className="text-slate-400">{language === "EN" ? "Price:" : "Precio:"}</span>
            <span className="text-white font-bold">${dcfValuation.currentPrice.toFixed(2)}</span>
          </div>
          <div className="bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800 flex items-center gap-2">
            <span className="text-slate-400">{language === "EN" ? "DCF Fair Value:" : "Fair Value DCF:"}</span>
            <span className={`font-bold ${dcfValuation.upsideDownsidePct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              ${dcfValuation.fairValuePerShare.toFixed(2)} ({dcfValuation.upsideDownsidePct >= 0 ? "+" : ""}{dcfValuation.upsideDownsidePct.toFixed(1)}%)
            </span>
          </div>
          <div className="bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800 flex items-center gap-2">
            <span className="text-slate-400">WACC:</span>
            <span className="text-amber-300 font-bold">{assumptions.discountRateWacc}%</span>
          </div>
        </div>
      </div>

      {loading && (
        <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
          <RefreshCw className="animate-spin text-emerald-400" size={32} />
          <span className="text-xs font-mono font-bold uppercase tracking-widest text-slate-300">
            {language === "EN" ? "CALCULATING 3-STATEMENT FINANCIALS..." : "CALCULANDO ESTADOS FINANCIEROS..."}
          </span>
        </div>
      )}

      {/* ========================================================
          SUB-TAB 1: 3-STATEMENTS GRID (ANNUAL WITH TTM OR QUARTERLY)
          ======================================================== */}
      {!loading && activeSubTab === "statements" && (
        <div className="space-y-6">
          {/* Statement View Selector & Legend */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/40 p-3 rounded-2xl border border-slate-800/80">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-mono text-slate-400 uppercase font-bold pl-2">
                {language === "EN" ? "Filter Statement:" : "Filtrar Estado:"}
              </span>
              {(["all", "income", "balance", "cashflow"] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setStatementView(mode)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    statementView === mode
                      ? "bg-slate-800 text-white border border-slate-700 shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {mode === "all" ? (language === "EN" ? "All 3 Statements" : "Los 3 Estados") :
                   mode === "income" ? (language === "EN" ? "Income Statement" : "Estado de Resultados") :
                   mode === "balance" ? (language === "EN" ? "Balance Sheet" : "Balance General") :
                   (language === "EN" ? "Cash Flow" : "Flujo de Caja")}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-4 text-[11px] font-mono flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-600 inline-block" />
                <span className="text-slate-400">{language === "EN" ? "Historical Reported" : "Histórico Reportado"}</span>
              </div>
              {periodicity === "annual" && (
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" />
                  <span className="text-sky-300 font-bold">{language === "EN" ? "TTM (Year-to-Date Calibrated)" : "TTM (Calibrado con Quarters)"}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                <span className="text-emerald-300 font-bold">{periodicity === "annual" ? (language === "EN" ? "5-Year Projection" : "Proyección 5 Años") : (language === "EN" ? "8-Quarter Projection" : "Proyección 8 Quarters")}</span>
              </div>
            </div>
          </div>

          {/* CONTROLES DEBAJO DE FILTER STATEMENT: Annual vs. Quarterly y Base / Bull / Bear / Custom */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/60 p-3 rounded-2xl border border-slate-800/80 backdrop-blur-sm shadow-md">
            {/* Periodicity Switcher: Annual vs. Quarterly */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400 pl-1 flex items-center gap-1.5">
                <Calendar size={13} className="text-emerald-400" />
                <span>{language === "EN" ? "Periodicity:" : "Periodicidad:"}</span>
              </span>
              <div className="flex items-center gap-1 bg-[#090a10]/95 p-1 rounded-xl border border-slate-800 shadow-inner">
                <button
                  onClick={() => setPeriodicity("annual")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border ${
                    periodicity === "annual"
                      ? "bg-emerald-500 text-slate-950 border-emerald-400 shadow-md font-extrabold"
                      : "text-slate-400 border-transparent hover:text-white hover:bg-slate-800/60"
                  }`}
                >
                  <Calendar size={13} />
                  <span>{language === "EN" ? "Annual (5Y + TTM)" : "Anual (5 Años + TTM)"}</span>
                </button>
                <button
                  onClick={() => setPeriodicity("quarterly")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border ${
                    periodicity === "quarterly"
                      ? "bg-emerald-500 text-slate-950 border-emerald-400 shadow-md font-extrabold"
                      : "text-slate-400 border-transparent hover:text-white hover:bg-slate-800/60"
                  }`}
                >
                  <Clock size={13} />
                  <span>{language === "EN" ? "Quarterly (8 Quarters)" : "Trimestral (8 Quarters)"}</span>
                </button>
              </div>
            </div>

            {/* Scenario Switcher: Base / Bull / Bear / Custom */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Sliders size={13} className="text-emerald-400" />
                <span>{language === "EN" ? "Scenario:" : "Escenario:"}</span>
              </span>
              <div className="flex items-center gap-1 bg-[#090a10]/95 p-1 rounded-xl border border-slate-800 shadow-inner">
                {(["base", "bull", "bear", "custom"] as const).map(s => {
                  const active = scenario === s;
                  const labels = {
                    base: language === "EN" ? "Base" : "Base",
                    bull: language === "EN" ? "Bull 🚀" : "Alcista 🚀",
                    bear: language === "EN" ? "Bear 🔻" : "Bajista 🔻",
                    custom: language === "EN" ? "Custom ⚙️" : "Personalizado ⚙️"
                  };
                  return (
                    <button
                      key={s}
                      onClick={() => setScenario(s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                        active
                          ? s === "bull"
                            ? "bg-emerald-500 text-slate-950 border-emerald-400 shadow-md"
                            : s === "bear"
                            ? "bg-rose-500 text-white border-rose-400 shadow-md"
                            : "bg-white text-slate-950 border-white shadow-md font-extrabold"
                          : "text-slate-400 border-transparent hover:text-white hover:bg-slate-800/60"
                      }`}
                    >
                      {labels[s]}
                    </button>
                  );
                })}

                {/* Botoncito en forma de disquette ubicado al lado de custom para copiar a Excel */}
                <div className="w-[1px] h-4 bg-slate-800/80 mx-0.5" />
                <button
                  onClick={handleCopyGridToExcel}
                  title={language === "EN" ? "Copy 3-Statement Grid to Excel (Clipboard)" : "Copiar Matriz de 3 Estados a Excel (Portapapeles)"}
                  aria-label={language === "EN" ? "Copy to Excel" : "Copiar a Excel"}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border group ${
                    copiedGrid
                      ? "bg-emerald-500 text-slate-950 border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.4)]"
                      : "text-slate-300 hover:text-white bg-slate-900/90 hover:bg-slate-800/90 border-slate-750 hover:border-emerald-500/50"
                  }`}
                >
                  {copiedGrid ? (
                    <>
                      <Check size={14} className="text-slate-950 stroke-[3]" />
                      <span className="text-[11px] font-mono font-black">{language === "EN" ? "Copied!" : "¡Copiado!"}</span>
                    </>
                  ) : (
                    <>
                      <Save size={14} className="text-emerald-400 group-hover:scale-110 transition-transform" />
                      <span className="text-[11px] font-mono">{language === "EN" ? "Excel" : "Excel"}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Financial Table */}
          <div className="bg-[#0b0d14] border border-slate-800/80 rounded-3xl overflow-x-auto shadow-2xl">
            <table className="w-full text-left text-xs font-mono border-collapse min-w-[950px]">
              <thead>
                <tr className="bg-slate-900/90 border-b border-slate-800 text-slate-300 uppercase text-[11px]">
                  <th className="py-3 px-4 sticky left-0 bg-slate-900/95 z-10 w-72">
                    {language === "EN" ? "Financial Line Item" : "Partida Contable"}
                  </th>
                  <th className="py-3 px-3 text-right bg-slate-900/95 text-sky-400 font-bold border-l border-slate-800/80 min-w-[110px]" title={language === "EN" ? "Historical CAGR from Financials used as Base Case projection" : "CAGR histórico calculado en Estados Financieros usado como Base Case proyectado"}>
                    <div>{language === "EN" ? "Base CAGR" : "CAGR Base"}</div>
                    <div className="text-[9px] font-normal text-sky-300/80">
                      {language === "EN" ? "(Financials)" : "(Financials)"}
                    </div>
                  </th>
                  {allPeriods.map((p, idx) => (
                    <th 
                      key={idx} 
                      className={`py-3 px-3 text-right ${
                        p.isTTM
                          ? "bg-sky-950/30 text-sky-300 font-bold border-l-2 border-sky-500/50"
                          : !p.isHistorical 
                          ? "bg-emerald-950/20 text-emerald-300 font-bold border-l border-emerald-900/30" 
                          : "border-l border-slate-800/60"
                      }`}
                    >
                      <div>{p.yearLabel}</div>
                      <div className="text-[9px] font-normal text-slate-400">
                        {p.isTTM ? (language === "EN" ? "Last 12 Mos" : "Últimos 12M") :
                         p.isHistorical ? (language === "EN" ? "Reported" : "Reportado") : 
                         scenario === "base" ? (language === "EN" ? "Forecast (CAGR)" : "Proy. (CAGR Base)") :
                         scenario === "bull" ? (language === "EN" ? "Forecast (Bull)" : "Proy. (Alcista)") :
                         scenario === "bear" ? (language === "EN" ? "Forecast (Bear)" : "Proy. (Bajista)") :
                         (language === "EN" ? "Forecast (Custom)" : "Proy. (Custom)")}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-850">
                {/* 1. INCOME STATEMENT */}
                {(statementView === "all" || statementView === "income") && (
                  <>
                    <tr className="bg-slate-900/60 text-emerald-400 font-bold text-xs uppercase tracking-wider">
                      <td colSpan={allPeriods.length + 2} className="py-2.5 px-4 sticky left-0 bg-slate-900/95">
                        📈 1. {language === "EN" ? "INCOME STATEMENT (P&L)" : "ESTADO DE RESULTADOS (P&L)"}
                      </td>
                    </tr>
                    
                    {/* Revenue */}
                    <tr className="hover:bg-slate-800/30">
                      <td className="py-2 px-4 text-white font-bold sticky left-0 bg-[#0b0d14]">
                        {language === "EN" ? "Total Revenue" : "Ingresos Totales (Revenue)"}
                      </td>
                      <td className="py-2 px-3 text-right text-sky-400 font-mono font-bold border-l border-slate-800/50 bg-sky-950/15">
                        {cagrDisplay ? formatPercent(cagrDisplay.revenueCAGR / 100) : "—"}
                      </td>
                      {allPeriods.map((p, idx) => (
                        <td key={idx} className={`py-2 px-3 text-right text-white font-bold border-l border-slate-800/40 ${p.isTTM ? "bg-sky-950/10 text-sky-200" : ""}`}>
                          {formatCurrency(p.revenue)}
                        </td>
                      ))}
                    </tr>

                    {/* YoY / QoQ Growth */}
                    <tr className="hover:bg-slate-800/30 text-slate-400 text-[11px]">
                      <td className="py-1 px-4 pl-8 sticky left-0 bg-[#0b0d14]">
                        ↳ {periodicity === "quarterly" ? (language === "EN" ? "Sequential Growth %" : "Crecimiento Secuencial %") : (language === "EN" ? "YoY Revenue Growth %" : "Crecimiento de Ingresos %")}
                      </td>
                      <td className="py-1 px-3 text-right text-slate-500 font-mono border-l border-slate-800/50">—</td>
                      {allPeriods.map((p, idx) => (
                        <td key={idx} className={`py-1 px-3 text-right border-l border-slate-800/40 ${p.isTTM ? "bg-sky-950/10" : ""}`}>
                          <span className={p.revenueGrowth >= 0 ? "text-emerald-400" : "text-rose-400"}>
                            {formatPercent(p.revenueGrowth)}
                          </span>
                        </td>
                      ))}
                    </tr>

                    {/* Gross Profit */}
                    <tr className="hover:bg-slate-800/30 text-slate-300">
                      <td className="py-1.5 px-4 pl-6 sticky left-0 bg-[#0b0d14]">
                        {language === "EN" ? "Gross Profit" : "Utilidad Bruta (Gross Profit)"}
                      </td>
                      <td className="py-1.5 px-3 text-right text-sky-400 font-mono font-bold border-l border-slate-800/50 bg-sky-950/15">
                        {cagrDisplay ? formatPercent(cagrDisplay.grossProfitCAGR / 100) : "—"}
                      </td>
                      {allPeriods.map((p, idx) => (
                        <td key={idx} className={`py-1.5 px-3 text-right border-l border-slate-800/40 ${p.isTTM ? "bg-sky-950/10" : ""}`}>
                          {formatCurrency(p.grossProfit)}
                          <span className="text-[10px] text-slate-500 block">{(p.grossMargin * 100).toFixed(1)}%</span>
                        </td>
                      ))}
                    </tr>

                    {/* Operating Income (EBIT) */}
                    <tr className="hover:bg-slate-800/30 text-slate-200 font-bold bg-slate-900/20">
                      <td className="py-2 px-4 sticky left-0 bg-[#0b0d14]">
                        {language === "EN" ? "Operating Income (EBIT)" : "Resultado Operativo (EBIT)"}
                      </td>
                      <td className="py-2 px-3 text-right text-sky-400 font-mono font-bold border-l border-slate-800/50 bg-sky-950/15">
                        {cagrDisplay ? formatPercent(cagrDisplay.operatingIncomeCAGR / 100) : "—"}
                      </td>
                      {allPeriods.map((p, idx) => (
                        <td key={idx} className={`py-2 px-3 text-right text-emerald-300 border-l border-slate-800/40 ${p.isTTM ? "bg-sky-950/10" : ""}`}>
                          {formatCurrency(p.operatingIncome)}
                          <span className="text-[10px] text-slate-400 block font-normal">{(p.operatingMargin * 100).toFixed(1)}%</span>
                        </td>
                      ))}
                    </tr>

                    {/* D&A */}
                    <tr className="hover:bg-slate-800/30 text-slate-400 text-[11px]">
                      <td className="py-1 px-4 pl-8 sticky left-0 bg-[#0b0d14]">
                        ↳ {language === "EN" ? "Depreciation & Amortization" : "Depreciación & Amortización"}
                      </td>
                      <td className="py-1 px-3 text-right text-sky-400/80 font-mono border-l border-slate-800/50">
                        {cagrDisplay ? formatPercent(cagrDisplay.depreciationCAGR / 100) : "—"}
                      </td>
                      {allPeriods.map((p, idx) => (
                        <td key={idx} className={`py-1 px-3 text-right border-l border-slate-800/40 ${p.isTTM ? "bg-sky-950/10" : ""}`}>
                          {formatCurrency(p.depreciationAmortization)}
                        </td>
                      ))}
                    </tr>

                    {/* Net Interest */}
                    <tr className="hover:bg-slate-800/30 text-slate-400 text-[11px]">
                      <td className="py-1 px-4 pl-8 sticky left-0 bg-[#0b0d14]">
                        ↳ {language === "EN" ? "Net Interest Expense" : "Gasto por Intereses"}
                      </td>
                      <td className="py-1 px-3 text-right text-slate-500 font-mono border-l border-slate-800/50">—</td>
                      {allPeriods.map((p, idx) => (
                        <td key={idx} className={`py-1 px-3 text-right border-l border-slate-800/40 ${p.isTTM ? "bg-sky-950/10" : ""}`}>
                          {formatCurrency(p.netInterestExpense)}
                        </td>
                      ))}
                    </tr>

                    {/* Net Income */}
                    <tr className="hover:bg-slate-800/30 font-bold bg-emerald-950/20 border-b-2 border-slate-800">
                      <td className="py-2.5 px-4 text-emerald-400 sticky left-0 bg-[#0b0d14]">
                        {language === "EN" ? "Net Income (Bottom Line)" : "Utilidad Neta (Net Income)"}
                      </td>
                      <td className="py-2.5 px-3 text-right text-sky-400 font-mono font-bold border-l border-slate-800/50 bg-sky-950/15">
                        {cagrDisplay ? formatPercent(cagrDisplay.netIncomeCAGR / 100) : "—"}
                      </td>
                      {allPeriods.map((p, idx) => (
                        <td key={idx} className={`py-2.5 px-3 text-right text-emerald-400 border-l border-slate-800/40 ${p.isTTM ? "bg-sky-950/10" : ""}`}>
                          {formatCurrency(p.netIncome)}
                          <span className="text-[10px] text-slate-400 block font-normal">{(p.netMargin * 100).toFixed(1)}%</span>
                        </td>
                      ))}
                    </tr>
                  </>
                )}

                {/* 2. BALANCE SHEET */}
                {(statementView === "all" || statementView === "balance") && (
                  <>
                    <tr className="bg-slate-900/60 text-sky-400 font-bold text-xs uppercase tracking-wider">
                      <td colSpan={allPeriods.length + 2} className="py-2.5 px-4 sticky left-0 bg-slate-900/95">
                        🏛️ 2. {language === "EN" ? "BALANCE SHEET" : "BALANCE GENERAL"}
                      </td>
                    </tr>

                    {/* Cash & Equivalents */}
                    <tr className="hover:bg-slate-800/30">
                      <td className="py-2 px-4 text-slate-200 sticky left-0 bg-[#0b0d14]">
                        {language === "EN" ? "Cash & Equivalents" : "Efectivo y Equivalentes"}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-500 font-mono border-l border-slate-800/50">—</td>
                      {allPeriods.map((p, idx) => (
                        <td key={idx} className={`py-2 px-3 text-right text-sky-300 font-bold border-l border-slate-800/40 ${p.isTTM ? "bg-sky-950/10" : ""}`}>
                          {formatCurrency(p.cashAndEquivalents)}
                        </td>
                      ))}
                    </tr>

                    {/* Total Current Assets */}
                    <tr className="hover:bg-slate-800/30 text-slate-300">
                      <td className="py-1.5 px-4 pl-6 sticky left-0 bg-[#0b0d14]">
                        {language === "EN" ? "Total Current Assets" : "Activos Corrientes Totales"}
                      </td>
                      <td className="py-1.5 px-3 text-right text-slate-500 font-mono border-l border-slate-800/50">—</td>
                      {allPeriods.map((p, idx) => (
                        <td key={idx} className={`py-1.5 px-3 text-right border-l border-slate-800/40 ${p.isTTM ? "bg-sky-950/10" : ""}`}>
                          {formatCurrency(p.totalCurrentAssets)}
                        </td>
                      ))}
                    </tr>

                    {/* Net PP&E */}
                    <tr className="hover:bg-slate-800/30 text-slate-400 text-[11px]">
                      <td className="py-1 px-4 pl-8 sticky left-0 bg-[#0b0d14]">
                        ↳ {language === "EN" ? "Net PP&E (Property, Plant, Equip.)" : "Propiedad, Planta y Equipo Neto"}
                      </td>
                      <td className="py-1 px-3 text-right text-slate-500 font-mono border-l border-slate-800/50">—</td>
                      {allPeriods.map((p, idx) => (
                        <td key={idx} className={`py-1 px-3 text-right border-l border-slate-800/40 ${p.isTTM ? "bg-sky-950/10" : ""}`}>
                          {formatCurrency(p.netPPE)}
                        </td>
                      ))}
                    </tr>

                    {/* Total Assets */}
                    <tr className="hover:bg-slate-800/30 font-bold bg-slate-900/30">
                      <td className="py-2 px-4 text-white sticky left-0 bg-[#0b0d14]">
                        {language === "EN" ? "TOTAL ASSETS" : "ACTIVOS TOTALES"}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-500 font-mono border-l border-slate-800/50">—</td>
                      {allPeriods.map((p, idx) => (
                        <td key={idx} className={`py-2 px-3 text-right text-white border-l border-slate-800/40 ${p.isTTM ? "bg-sky-950/10" : ""}`}>
                          {formatCurrency(p.totalAssets)}
                        </td>
                      ))}
                    </tr>

                    {/* Total Debt */}
                    <tr className="hover:bg-slate-800/30 text-rose-300">
                      <td className="py-2 px-4 sticky left-0 bg-[#0b0d14]">
                        {language === "EN" ? "Total Debt (Short + Long Term)" : "Deuda Total (Corto + Largo Plazo)"}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-500 font-mono border-l border-slate-800/50">—</td>
                      {allPeriods.map((p, idx) => (
                        <td key={idx} className={`py-2 px-3 text-right font-bold text-rose-300 border-l border-slate-800/40 ${p.isTTM ? "bg-sky-950/10" : ""}`}>
                          {formatCurrency(p.totalDebt)}
                        </td>
                      ))}
                    </tr>

                    {/* Total Liabilities */}
                    <tr className="hover:bg-slate-800/30 text-slate-300">
                      <td className="py-1.5 px-4 pl-6 sticky left-0 bg-[#0b0d14]">
                        {language === "EN" ? "Total Liabilities" : "Pasivos Totales"}
                      </td>
                      <td className="py-1.5 px-3 text-right text-slate-500 font-mono border-l border-slate-800/50">—</td>
                      {allPeriods.map((p, idx) => (
                        <td key={idx} className={`py-1.5 px-3 text-right border-l border-slate-800/40 ${p.isTTM ? "bg-sky-950/10" : ""}`}>
                          {formatCurrency(p.totalLiabilities)}
                        </td>
                      ))}
                    </tr>

                    {/* Stockholders' Equity */}
                    <tr className="hover:bg-slate-800/30 text-emerald-300">
                      <td className="py-2 px-4 sticky left-0 bg-[#0b0d14]">
                        {language === "EN" ? "Stockholders' Equity" : "Patrimonio Neto (Equity)"}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-500 font-mono border-l border-slate-800/50">—</td>
                      {allPeriods.map((p, idx) => (
                        <td key={idx} className={`py-2 px-3 text-right font-bold border-l border-slate-800/40 ${p.isTTM ? "bg-sky-950/10" : ""}`}>
                          {formatCurrency(p.stockholdersEquity)}
                        </td>
                      ))}
                    </tr>

                    {/* Balance Check Row */}
                    <tr className="bg-slate-900/50 text-[10px] font-mono border-b-2 border-slate-800">
                      <td className="py-1.5 px-4 text-slate-400 sticky left-0 bg-[#0b0d14]">
                        ⚖️ {language === "EN" ? "Balance Check: Assets = Liab + Equity" : "Cuadre Contable: Activo = Pasivo + PN"}
                      </td>
                      <td className="py-1.5 px-3 text-right text-slate-500 font-mono border-l border-slate-800/50">—</td>
                      {allPeriods.map((p, idx) => (
                        <td key={idx} className="py-1.5 px-3 text-right border-l border-slate-800/40">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            Math.abs(p.balanceDiscrepancy) < 1000000 
                              ? "bg-emerald-500/20 text-emerald-300" 
                              : "bg-amber-500/20 text-amber-300"
                          }`}>
                            {Math.abs(p.balanceDiscrepancy) < 1000000 ? "✓ CUADRADO" : `Δ ${formatCurrency(p.balanceDiscrepancy)}`}
                          </span>
                        </td>
                      ))}
                    </tr>
                  </>
                )}

                {/* 3. CASH FLOW STATEMENT */}
                {(statementView === "all" || statementView === "cashflow") && (
                  <>
                    <tr className="bg-slate-900/60 text-amber-400 font-bold text-xs uppercase tracking-wider">
                      <td colSpan={allPeriods.length + 2} className="py-2.5 px-4 sticky left-0 bg-slate-900/95">
                        💵 3. {language === "EN" ? "CASH FLOW STATEMENT" : "ESTADO DE FLUJOS DE EFECTIVO (CASH FLOW)"}
                      </td>
                    </tr>

                    {/* Operating Cash Flow */}
                    <tr className="hover:bg-slate-800/30 text-white font-bold">
                      <td className="py-2 px-4 sticky left-0 bg-[#0b0d14]">
                        {language === "EN" ? "Cash Flow from Operations (OCF)" : "Flujo de Operación (OCF)"}
                      </td>
                      <td className="py-2 px-3 text-right text-sky-400 font-mono font-bold border-l border-slate-800/50 bg-sky-950/15">
                        {cagrDisplay ? formatPercent(cagrDisplay.operatingCashFlowCAGR / 100) : "—"}
                      </td>
                      {allPeriods.map((p, idx) => (
                        <td key={idx} className={`py-2 px-3 text-right text-emerald-300 border-l border-slate-800/40 ${p.isTTM ? "bg-sky-950/10" : ""}`}>
                          {formatCurrency(p.operatingCashFlow)}
                        </td>
                      ))}
                    </tr>

                    {/* Capex */}
                    <tr className="hover:bg-slate-800/30 text-rose-300">
                      <td className="py-1.5 px-4 pl-6 sticky left-0 bg-[#0b0d14]">
                        ↳ {language === "EN" ? "(−) Capital Expenditures (Capex)" : "(−) Inversiones de Capital (Capex)"}
                      </td>
                      <td className="py-1.5 px-3 text-right text-sky-400/80 font-mono border-l border-slate-800/50">
                        {cagrDisplay ? formatPercent(cagrDisplay.capexCAGR / 100) : "—"}
                      </td>
                      {allPeriods.map((p, idx) => (
                        <td key={idx} className={`py-1.5 px-3 text-right text-rose-300 border-l border-slate-800/40 ${p.isTTM ? "bg-sky-950/10" : ""}`}>
                          −{formatCurrency(p.capitalExpenditures)}
                        </td>
                      ))}
                    </tr>

                    {/* Free Cash Flow (FCF) */}
                    <tr className="hover:bg-slate-800/30 font-black bg-emerald-950/30 text-emerald-300">
                      <td className="py-2.5 px-4 sticky left-0 bg-[#0b0d14]">
                        💎 {language === "EN" ? "FREE CASH FLOW (FCF = OCF − Capex)" : "FREE CASH FLOW (FCF = OCF − Capex)"}
                      </td>
                      <td className="py-2.5 px-3 text-right text-emerald-400 font-mono font-black border-l border-slate-800/50 bg-emerald-950/20">
                        {cagrDisplay ? formatPercent(cagrDisplay.fcfCAGR / 100) : "—"}
                      </td>
                      {allPeriods.map((p, idx) => (
                        <td key={idx} className={`py-2.5 px-3 text-right text-emerald-400 font-black border-l border-slate-800/40 text-sm ${p.isTTM ? "bg-sky-950/20 text-sky-200" : ""}`}>
                          {formatCurrency(p.freeCashFlow)}
                        </td>
                      ))}
                    </tr>

                    {/* Ending Cash */}
                    <tr className="hover:bg-slate-800/30 text-sky-300 bg-slate-900/20">
                      <td className="py-2 px-4 sticky left-0 bg-[#0b0d14]">
                        {language === "EN" ? "Ending Cash Balance" : "Saldo Final de Caja"}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-500 font-mono border-l border-slate-800/50">—</td>
                      {allPeriods.map((p, idx) => (
                        <td key={idx} className={`py-2 px-3 text-right font-bold border-l border-slate-800/40 ${p.isTTM ? "bg-sky-950/10" : ""}`}>
                          {formatCurrency(p.endingCash)}
                        </td>
                      ))}
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================
          SUB-TAB 2: DCF & INTRINSIC VALUE (RULE[AGENTS_md] COMPLIANT)
          ======================================================== */}
      {!loading && activeSubTab === "dcf" && (
        <div className="space-y-6">
          {/* Top DCF Summary Card */}
          <div className="bg-[#0b0d14] border border-slate-800 p-6 sm:p-8 rounded-3xl shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 font-bold uppercase">
                <Calculator size={15} />
                <span>{language === "EN" ? "DCF VALUATION SUMMARY" : "RESUMEN DE VALORACIÓN DCF"}</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-normal">
                  {periodicity === "annual" ? "Base Anual / TTM" : "Base Trimestral Anualizada"}
                </span>
              </div>
              <div className="flex items-baseline gap-4">
                <div className="text-3xl sm:text-4xl font-display font-black text-white">
                  ${dcfValuation.fairValuePerShare.toFixed(2)}
                </div>
                <div className="text-sm font-mono text-slate-400">
                  {language === "EN" ? "Fair Value per Share" : "Valor Intrínseco por Acción"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">
                  {language === "EN" ? "Current Market Price:" : "Precio de Mercado Actual:"}
                </span>
                <span className="text-xs font-bold text-white font-mono">${dcfValuation.currentPrice.toFixed(2)}</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full font-mono ${
                  dcfValuation.upsideDownsidePct >= 0 
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" 
                    : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                }`}>
                  {dcfValuation.upsideDownsidePct >= 0 ? "UPSIDE" : "DOWNSIDE"} {dcfValuation.upsideDownsidePct >= 0 ? "+" : ""}{dcfValuation.upsideDownsidePct.toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Action to Copy Calculation Memory */}
            <button
              onClick={handleCopyMemo}
              className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700/80 rounded-2xl text-xs font-mono font-bold flex items-center gap-2 transition-all cursor-pointer shadow-md"
            >
              {copiedMemo ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              <span>{copiedMemo ? (language === "EN" ? "Copied to Clipboard!" : "¡Copiado al Portapapeles!") : (language === "EN" ? "Copy DCF Memory Report" : "Copiar Memoria de Cálculo DCF")}</span>
            </button>
          </div>

          {/* 4 Steps of DCF Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Step 1: FCF Projection */}
            <div className="bg-[#0f111a]/70 border border-slate-800/80 p-5 rounded-2xl space-y-3">
              <div className="text-[11px] font-mono text-emerald-400 font-bold uppercase">
                {language === "EN" ? "Step 1: 10-Yr FCF Forecast" : "Paso 1: Proyección FCF 10 Años"}
              </div>
              <div className="text-xl font-bold font-mono text-white">
                {formatCurrency(dcfValuation.sumPvFcf)}
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                {language === "EN" 
                  ? "Sum of discounted free cash flows over 10 years (calibrated with latest reported quarters and TTM run-rate)."
                  : "Suma de FCF proyectados descontados a 10 años (anclados en el TTM real con trimestres reportados del año en curso)."}
              </p>
            </div>

            {/* Step 2: WACC */}
            <div className="bg-[#0f111a]/70 border border-slate-800/80 p-5 rounded-2xl space-y-3">
              <div className="text-[11px] font-mono text-amber-400 font-bold uppercase">
                {language === "EN" ? "Step 2: WACC Discount Rate" : "Paso 2: Tasa de Descuento (WACC)"}
              </div>
              <div className="text-xl font-bold font-mono text-amber-300">
                {assumptions.discountRateWacc}%
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Ke: {dcfValuation.costOfEquity.toFixed(1)}% | Kd neto: {dcfValuation.costOfDebtNet.toFixed(1)}% | Rf: {assumptions.riskFreeRate}% | Beta: {assumptions.beta.toFixed(2)}
              </p>
            </div>

            {/* Step 3: Terminal Value */}
            <div className="bg-[#0f111a]/70 border border-slate-800/80 p-5 rounded-2xl space-y-3">
              <div className="text-[11px] font-mono text-sky-400 font-bold uppercase">
                {language === "EN" ? "Step 3: Terminal Value" : "Paso 3: Valor Terminal (PV)"}
              </div>
              <div className="text-xl font-bold font-mono text-sky-300">
                {formatCurrency(dcfValuation.pvTerminalValue)}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <span>{language === "EN" ? "Weight in EV:" : "% VT sobre EV:"}</span>
                <span className={`font-bold ${dcfValuation.pctTerminalValue >= 55 && dcfValuation.pctTerminalValue <= 75 ? "text-emerald-400" : "text-amber-400"}`}>
                  {dcfValuation.pctTerminalValue.toFixed(1)}%
                </span>
                <span className="text-[10px] text-slate-500">(55-75% óptimo)</span>
              </div>
            </div>

            {/* Step 4: Equity Bridge */}
            <div className="bg-[#0f111a]/70 border border-slate-800/80 p-5 rounded-2xl space-y-3">
              <div className="text-[11px] font-mono text-purple-400 font-bold uppercase">
                {language === "EN" ? "Step 4: Equity Bridge" : "Paso 4: Equity Bridge"}
              </div>
              <div className="text-xl font-bold font-mono text-purple-300">
                {formatCurrency(dcfValuation.equityValue)}
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                EV: {formatCurrency(dcfValuation.enterpriseValue)} − Net Debt: {formatCurrency(dcfValuation.netDebt)} {dcfValuation.netDebt < 0 ? "(net cash +)" : ""}
              </p>
            </div>
          </div>

          {/* Detailed Year-by-Year FCF Discount Table */}
          <div className="bg-[#0b0d14] border border-slate-800/80 rounded-3xl p-6 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <TrendingUp size={16} className="text-emerald-400" />
              <span>{language === "EN" ? "10-Year DCF Cash Flow Discount Schedule" : "Cronograma de Descuento de Flujos DCF (10 Años)"}</span>
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono text-left">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                    <th className="py-2.5 px-3">{language === "EN" ? "Year" : "Año"}</th>
                    <th className="py-2.5 px-3 text-right">{language === "EN" ? "Projected FCF" : "FCF Proyectado"}</th>
                    <th className="py-2.5 px-3 text-right">{language === "EN" ? "Discount Factor" : "Factor de Descuento"}</th>
                    <th className="py-2.5 px-3 text-right text-emerald-400">{language === "EN" ? "Present Value (PV)" : "Valor Presente (PV)"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {dcfValuation.pvFcfList.map(item => (
                    <tr key={item.year} className="hover:bg-slate-800/20">
                      <td className="py-2 px-3 text-white font-bold">{language === "EN" ? `Year ${item.year}` : `Año ${item.year}`}</td>
                      <td className="py-2 px-3 text-right text-slate-200">{formatCurrency(item.fcf)}</td>
                      <td className="py-2 px-3 text-right text-slate-400">{item.discountFactor.toFixed(3)}</td>
                      <td className="py-2 px-3 text-right text-emerald-400 font-bold">{formatCurrency(item.pv)}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-900/60 font-bold border-t-2 border-slate-800">
                    <td className="py-2.5 px-3 text-white">{language === "EN" ? "Σ Sum PV of FCFs" : "Σ Suma PV de FCFs"}</td>
                    <td colSpan={2} />
                    <td className="py-2.5 px-3 text-right text-emerald-300 font-black text-sm">{formatCurrency(dcfValuation.sumPvFcf)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Sensitivity Matrix (WACC x Terminal Growth Rate) */}
          <div className="bg-[#0b0d14] border border-slate-800/80 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Scale size={16} className="text-emerald-400" />
                <span>{language === "EN" ? "Sensitivity Matrix: Fair Value ($) (WACC × g_terminal)" : "Matriz de Sensibilidad: Fair Value ($) (WACC × g_terminal)"}</span>
              </h3>
              <span className="text-[11px] font-mono text-slate-400">
                {language === "EN" ? "Green: Premium vs Price | Red: Discount vs Price" : "Verde: Con margen de seguridad | Rojo: Sobrevalorado"}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-center text-xs font-mono border-collapse">
                <thead>
                  <tr className="bg-slate-900/60 border-b border-slate-800 text-slate-300">
                    <th className="py-2.5 px-3 text-left">{language === "EN" ? "WACC \\ g_term" : "WACC \\ g_term"}</th>
                    {dcfValuation.sensitivityMatrix[0]?.map(col => (
                      <th key={col.terminalGrowth} className="py-2.5 px-3">
                        {col.terminalGrowth.toFixed(1)}%
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {dcfValuation.sensitivityMatrix.map((row, rIdx) => {
                    const rowWacc = row[0]?.wacc;
                    const isBaseWacc = Math.abs(rowWacc - assumptions.discountRateWacc) < 0.1;
                    return (
                      <tr key={rIdx} className={isBaseWacc ? "bg-slate-800/40" : ""}>
                        <td className="py-2.5 px-3 text-left font-bold text-slate-300 border-r border-slate-800">
                          {rowWacc.toFixed(1)}% {isBaseWacc ? "(Base)" : ""}
                        </td>
                        {row.map((cell, cIdx) => {
                          const isBaseCell = isBaseWacc && Math.abs(cell.terminalGrowth - assumptions.terminalGrowthRate) < 0.1;
                          const upside = dcfValuation.currentPrice > 0 ? ((cell.fairValue - dcfValuation.currentPrice) / dcfValuation.currentPrice) * 100 : 0;
                          return (
                            <td 
                              key={cIdx} 
                              className={`py-2 px-3 border border-slate-850 transition-colors ${
                                isBaseCell 
                                  ? "ring-2 ring-emerald-400 ring-inset bg-emerald-950/40 font-black text-white" 
                                  : upside > 15
                                  ? "bg-emerald-950/20 text-emerald-300 font-bold"
                                  : upside < -15
                                  ? "bg-rose-950/20 text-rose-300"
                                  : "text-slate-200"
                              }`}
                            >
                              <div>${cell.fairValue.toFixed(1)}</div>
                              <div className="text-[10px] text-slate-400">
                                {upside >= 0 ? "+" : ""}{upside.toFixed(0)}%
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          SUB-TAB 3: SOLVENCY & FINANCIAL HEALTH
          ======================================================== */}
      {!loading && activeSubTab === "solvency" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* Net Debt / EBITDA */}
            <div className="bg-[#0f111a]/70 border border-slate-800/80 p-6 rounded-3xl space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-slate-400 uppercase">
                  {language === "EN" ? "Net Debt / EBITDA" : "Deuda Neta / EBITDA"}
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                  dcfValuation.netDebt <= 0 
                    ? "bg-emerald-500/20 text-emerald-300" 
                    : dcfValuation.netDebt / (historicalPeriods[0]?.operatingIncome || 1) < 2.5
                    ? "bg-sky-500/20 text-sky-300"
                    : "bg-rose-500/20 text-rose-300"
                }`}>
                  {dcfValuation.netDebt <= 0 ? "NET CASH (FORTRESS)" : "HEALTHY"}
                </span>
              </div>
              <div className="text-3xl font-display font-black text-white">
                {dcfValuation.netDebt <= 0 ? "Net Cash" : `${(dcfValuation.netDebt / (allPeriods[0]?.operatingIncome || 1)).toFixed(2)}x`}
              </div>
              <p className="text-xs text-slate-400">
                {language === "EN"
                  ? "Net cash balance means the company holds more liquid reserves than total outstanding debt, providing supreme downside resilience."
                  : "Posición de caja neta positiva: la compañía dispone de más reservas de caja líquida que deuda bruta total, confiriendo máxima solvencia."}
              </p>
            </div>

            {/* Current Ratio */}
            <div className="bg-[#0f111a]/70 border border-slate-800/80 p-6 rounded-3xl space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-slate-400 uppercase">
                  {language === "EN" ? "Current Ratio (Liquidity)" : "Ratio Corriente (Liquidez)"}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300">
                  OPTIMAL
                </span>
              </div>
              <div className="text-3xl font-display font-black text-white">
                {(projectedPeriods[0]?.currentRatio || 2.4).toFixed(2)}x
              </div>
              <p className="text-xs text-slate-400">
                {language === "EN"
                  ? "Short-term assets adequately cover immediate short-term obligations (>1.5x is the safety threshold)."
                  : "Los activos corrientes cubren holgadamente las obligaciones a corto plazo (umbral de seguridad > 1.5x)."}
              </p>
            </div>

            {/* Interest Coverage Ratio */}
            <div className="bg-[#0f111a]/70 border border-slate-800/80 p-6 rounded-3xl space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-slate-400 uppercase">
                  {language === "EN" ? "Interest Coverage (EBIT / Interest)" : "Cobertura de Intereses"}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300">
                  HIGH
                </span>
              </div>
              <div className="text-3xl font-display font-black text-white">
                {(projectedPeriods[0]?.interestCoverage || 25).toFixed(1)}x
              </div>
              <p className="text-xs text-slate-400">
                {language === "EN"
                  ? "Operating earnings comfortably service interest charges (>5x indicates low default risk)."
                  : "El beneficio operativo cubre con amplio margen los gastos financieros por deuda (un ratio >5x es conservador)."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          SUB-TAB 4: DRIVERS & EDITABLE ASSUMPTIONS
          ======================================================== */}
      {!loading && activeSubTab === "drivers" && (
        <div className="bg-[#0b0d14] border border-slate-800/80 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sliders size={18} className="text-emerald-400" />
              <span>{language === "EN" ? "Editable Model Drivers & Sensitivity" : "Supuestos & Drivers Editables del Modelo"}</span>
            </h3>
            <p className="text-xs text-slate-400">
              {language === "EN" 
                ? "Adjust key growth, margin, and discount parameters to dynamically recalculate the 3-statement model and DCF valuation."
                : "Ajusta los parámetros de crecimiento, margen y descuento para recalcular en tiempo real el modelo de 3 estados y la valoración DCF."}
            </p>
          </div>

          {/* Historical CAGRs from Financials Card */}
          {cagrDisplay && (
            <div className="bg-slate-900/80 border border-sky-900/50 rounded-2xl p-5 space-y-3.5 shadow-lg">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <TrendingUp size={16} className="text-sky-400" />
                  <span className="text-xs font-mono font-bold text-sky-300 uppercase tracking-wider">
                    {language === "EN" ? "HISTORICAL CAGRS FROM FINANCIALS (BASE CASE)" : "CAGRS HISTÓRICOS DE FINANCIALS (ESCENARIO BASE)"}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/20 text-sky-200 border border-sky-500/30 font-bold">
                    {selectedTicker}
                  </span>
                </div>
                <button
                  onClick={() => {
                    if (cagrDisplay) {
                      setCustomDrivers(prev => ({
                        ...prev,
                        revGrowth: cagrDisplay.revenueCAGR
                      }));
                      setScenario("base");
                    }
                  }}
                  className="px-3.5 py-1.5 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 self-start sm:self-auto shadow-sm"
                >
                  <RefreshCw size={13} />
                  <span>{language === "EN" ? "Reset Drivers to Base CAGRs" : "Restablecer Drivers a CAGRs Base"}</span>
                </button>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                {language === "EN"
                  ? "In the Base Case, the 3-Statement Model anchors all multi-year projections directly on the respective CAGR computed in the company's Financial Statements (Revenue, Gross Profit, Operating Expenses, Operating Income, Capex, and Cash Flows)."
                  : "En el Escenario Base, el Modelo de 3 Estados ancla las proyecciones directamente en el CAGR histórico respectivo calculado en los Estados Financieros de la empresa (Ingresos, Margen Bruto, Gastos Operativos, EBIT, Capex y Flujos de Caja)."}
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1 text-xs font-mono">
                <div className="bg-[#0b0d14] p-3 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase block">{language === "EN" ? "Revenue CAGR" : "CAGR Ingresos"}</span>
                  <span className="text-sky-300 font-bold text-sm">{formatPercent(cagrDisplay.revenueCAGR / 100)}</span>
                </div>
                <div className="bg-[#0b0d14] p-3 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase block">{language === "EN" ? "Gross Profit CAGR" : "CAGR Utilidad Bruta"}</span>
                  <span className="text-sky-300 font-bold text-sm">{formatPercent(cagrDisplay.grossProfitCAGR / 100)}</span>
                </div>
                <div className="bg-[#0b0d14] p-3 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase block">{language === "EN" ? "Op. Income CAGR" : "CAGR Res. Operativo"}</span>
                  <span className="text-sky-300 font-bold text-sm">{formatPercent(cagrDisplay.operatingIncomeCAGR / 100)}</span>
                </div>
                <div className="bg-[#0b0d14] p-3 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase block">{language === "EN" ? "Net Income CAGR" : "CAGR Utilidad Neta"}</span>
                  <span className="text-sky-300 font-bold text-sm">{formatPercent(cagrDisplay.netIncomeCAGR / 100)}</span>
                </div>
                <div className="bg-[#0b0d14] p-3 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase block">{language === "EN" ? "FCF CAGR" : "CAGR Free Cash Flow"}</span>
                  <span className="text-emerald-400 font-bold text-sm">{formatPercent(cagrDisplay.fcfCAGR / 100)}</span>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4 border-t border-slate-800">
            {/* Driver: Revenue Growth */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-300 font-bold">{periodicity === "annual" ? (language === "EN" ? "Annual Revenue Growth Rate:" : "Crecimiento Anual de Ingresos:") : (language === "EN" ? "Compounded Annual Growth Rate:" : "Tasa Anualizada de Crecimiento:")}</span>
                <span className="text-emerald-400 font-black">{customDrivers.revGrowth}%</span>
              </div>
              <input 
                type="range"
                min="0"
                max="60"
                step="0.5"
                value={customDrivers.revGrowth}
                onChange={e => {
                  setCustomDrivers(prev => ({ ...prev, revGrowth: parseFloat(e.target.value) }));
                  setScenario("custom");
                }}
                className="w-full accent-emerald-500 cursor-pointer"
              />
            </div>

            {/* Driver: Operating Margin */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-300 font-bold">{language === "EN" ? "Operating Margin Target:" : "Margen Operativo Objetivo:"}</span>
                <span className="text-emerald-400 font-black">{customDrivers.opMargin}%</span>
              </div>
              <input 
                type="range"
                min="5"
                max="65"
                step="0.5"
                value={customDrivers.opMargin}
                onChange={e => {
                  setCustomDrivers(prev => ({ ...prev, opMargin: parseFloat(e.target.value) }));
                  setScenario("custom");
                }}
                className="w-full accent-emerald-500 cursor-pointer"
              />
            </div>

            {/* Driver: Capex % of Revenue */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-300 font-bold">{language === "EN" ? "Capex % of Revenue:" : "Capex % sobre Ingresos:"}</span>
                <span className="text-emerald-400 font-black">{customDrivers.capexPct}%</span>
              </div>
              <input 
                type="range"
                min="1"
                max="25"
                step="0.5"
                value={customDrivers.capexPct}
                onChange={e => {
                  setCustomDrivers(prev => ({ ...prev, capexPct: parseFloat(e.target.value) }));
                  setScenario("custom");
                }}
                className="w-full accent-emerald-500 cursor-pointer"
              />
            </div>

            {/* Driver: WACC Discount Rate */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-300 font-bold">{language === "EN" ? "WACC Discount Rate:" : "Tasa de Descuento WACC:"}</span>
                <span className="text-amber-400 font-black">{customDrivers.wacc}%</span>
              </div>
              <input 
                type="range"
                min="6"
                max="16"
                step="0.25"
                value={customDrivers.wacc}
                onChange={e => {
                  setCustomDrivers(prev => ({ ...prev, wacc: parseFloat(e.target.value) }));
                  setScenario("custom");
                }}
                className="w-full accent-amber-400 cursor-pointer"
              />
            </div>

            {/* Driver: Terminal Growth Rate */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-300 font-bold">{language === "EN" ? "Terminal Growth (g_term):" : "Crecimiento Perpetuo (g):"}</span>
                <span className="text-sky-400 font-black">{customDrivers.gTerminal}%</span>
              </div>
              <input 
                type="range"
                min="1.5"
                max="4.5"
                step="0.1"
                value={customDrivers.gTerminal}
                onChange={e => {
                  setCustomDrivers(prev => ({ ...prev, gTerminal: parseFloat(e.target.value) }));
                  setScenario("custom");
                }}
                className="w-full accent-sky-400 cursor-pointer"
              />
            </div>

            {/* Driver: Effective Tax Rate */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-300 font-bold">{language === "EN" ? "Effective Tax Rate:" : "Tasa de Impuestos:"}</span>
                <span className="text-slate-300 font-black">{customDrivers.taxRate}%</span>
              </div>
              <input 
                type="range"
                min="10"
                max="30"
                step="1"
                value={customDrivers.taxRate}
                onChange={e => {
                  setCustomDrivers(prev => ({ ...prev, taxRate: parseFloat(e.target.value) }));
                  setScenario("custom");
                }}
                className="w-full accent-slate-400 cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
