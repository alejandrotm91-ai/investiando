import React, { useState, useEffect } from "react";
import { PortfolioData, Position } from "../types";
import {
  FileText,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  AlertCircle,
  RefreshCw,
  Layers,
  DollarSign,
  Activity,
  ArrowUpRight,
  HelpCircle,
  Briefcase,
  Layers as FactorsIcon,
  Percent,
  CheckCircle2,
  Download,
  Printer,
  BrainCircuit
} from "lucide-react";
import { jsPDF } from "jspdf";
import AskAIAnalyst from "./AskAIAnalyst";

interface HedgeFundReportProps {
  portfolio: PortfolioData;
  language?: "EN" | "ES";
  activeSubTab?: "memo" | "stress" | "factors" | "ai_analyst";
  setActiveSubTab?: (tab: "memo" | "stress" | "factors" | "ai_analyst") => void;
}

interface StressScenario {
  id: string;
  name: string;
  description: string;
  impactType: "severe-negative" | "moderate-negative" | "positive" | "highly-positive";
  equityAdjustment: (pos: Position) => number; // factor change
  cashAdjustment: number; // cash change factor
  cioInsight: string;
}

export default function HedgeFundReport({ 
  portfolio, 
  language = "ES",
  activeSubTab: externalActiveSubTab,
  setActiveSubTab: externalSetActiveSubTab
}: HedgeFundReportProps) {
  const [reportText, setReportText] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>("crisis-2008");
  const [localActiveSubTab, setLocalActiveSubTab] = useState<"memo" | "stress" | "factors" | "ai_analyst">("memo");

  const activeSubTab = externalActiveSubTab !== undefined ? externalActiveSubTab : localActiveSubTab;
  const setActiveSubTab = externalSetActiveSubTab !== undefined ? externalSetActiveSubTab : setLocalActiveSubTab;

  // Get portfolio positions string signature to check for updates
  const positionsSignature = JSON.stringify(
    portfolio.positions.map((p) => ({ ticker: p.ticker, shares: p.shares }))
  );

  const fetchReport = async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      // Look for cached report
      const cacheKey = `hedge_fund_report_${positionsSignature}`;
      const cached = localStorage.getItem(cacheKey);

      if (cached && !force) {
        setReportText(cached);
        setLoading(false);
        return;
      }

      const res = await fetch("/api/hedgefund-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portfolio }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          data.details ||
          data.error ||
          (language === "EN"
            ? "Failed to communicate with investment engine"
            : "Error al comunicarse con el motor analítico de inversiones")
        );
      }

      if (data.text) {
        setReportText(data.text);
        localStorage.setItem(cacheKey, data.text);
      } else {
        throw new Error("No report text received");
      }
    } catch (err: any) {
      console.error("Hedge fund analysis error:", err);
      setError(err.message || "Error generating report");
    } finally {
      setLoading(false);
    }
  };

  // Re-fetch when portfolio holdings change
  useEffect(() => {
    fetchReport(false);
  }, [positionsSignature]);

  // STRESS SCENARIOS IMPLEMENTATION
  const STRESS_SCENARIOS: StressScenario[] = [
    {
      id: "crisis-2008",
      name: language === "EN" ? "2008 Systemic Crash" : "Colapso Sistémico Estilo 2008",
      description:
        language === "EN"
          ? "Simulates a massive liquidity freeze & credit crisis triggering a severe equity market capitulation."
          : "Simulación de congelamiento de liquidez global y pánico crediticio, provocando una capitulación masiva en bolsa.",
      impactType: "severe-negative",
      equityAdjustment: (pos) => {
        // High-beta or crypto assets (IREN, CRWV, NVDA) suffer worse
        const ticker = pos.ticker.toUpperCase();
        if (["IREN", "CRWV", "NVDA"].includes(ticker)) return -0.55;
        if (["META", "AVGO", "AMZN"].includes(ticker)) return -0.42;
        return -0.38; // Default equity drop
      },
      cashAdjustment: 0.0, // Stable
      cioInsight:
        language === "EN"
          ? "CIO ALERT: In a 2008 liquidity spiral, correlation goes to 1. All equities sell off indiscriminately. Your cash buffer provides crucial collateral utility to buy distressed assets at deep discounts."
          : "ALERTA DEL CIO: En una espiral de liquidez estilo 2008, la correlación de renta variable tiende a 1. Todos los activos de riesgo capitulan. Su colchón de efectivo actual representa una ventaja táctica invaluable para absorber colaterales en liquidación forzosa.",
    },
    {
      id: "stagflation-70s",
      name: language === "EN" ? "1970s Stagflation" : "Choque Estanflacionario de los 70s",
      description:
        language === "EN"
          ? "High structural inflation paired with aggressive central bank interest rate hikes."
          : "Periodo prolongado de inflación estructural combinado con alzas de tasas agresivas por parte de la Fed.",
      impactType: "moderate-negative",
      equityAdjustment: (pos) => {
        const ticker = pos.ticker.toUpperCase();
        // High valuation tech stocks suffer contraction of multiples
        if (["NVDA", "AVGO", "MSFT", "META"].includes(ticker)) return -0.32;
        if (["IREN", "CRWV"].includes(ticker)) return -0.45; // High cost of debt capital
        return -0.15; // Balanced stocks
      },
      cashAdjustment: -0.08, // Inflation eats 8% purchasing power
      cioInsight:
        language === "EN"
          ? "CIO ASSESSMENT: High-multiple growth equities compress heavily as risk-free discount rates rise. True hedges like physical energy, gold, or short-duration credit are missing to defend real portfolio value."
          : "EVALUACIÓN DEL CIO: Las acciones de crecimiento con múltiplos elevados sufren una fuerte contracción de valoración al aumentar la tasa de descuento de la Fed. Es indispensable introducir coberturas duras como commodities, oro o pagarés de corta duración para preservar el poder adquisitivo real.",
    },
    {
      id: "tech-boom",
      name: language === "EN" ? "Hyper-Growth AI Expansion" : "Expansión Exponencial de I.A. (Bull Run)",
      description:
        language === "EN"
          ? "An acceleration of generative AI productivity leading to massive enterprise CapEx spend."
          : "Aceleración masiva de la adopción de Inteligencia Artificial que impulsa un gasto corporativo récord en infraestructura.",
      impactType: "highly-positive",
      equityAdjustment: (pos) => {
        const ticker = pos.ticker.toUpperCase();
        if (["NVDA", "AVGO", "IREN"].includes(ticker)) return 0.65; // Direct beneficiaries
        if (["MSFT", "META", "AMZN"].includes(ticker)) return 0.45; // Cloud/Software layer
        return 0.15;
      },
      cashAdjustment: 0.0,
      cioInsight:
        language === "EN"
          ? "CIO ASSESSMENT: This portfolio is structurally designed to capture maximum beta from this theme. Under this regime, the portfolio will capture exceptional alpha, outperforming the S&P 500 by a factor of 2.2x."
          : "EVALUACIÓN DEL CIO: Este portafolio está estructuralmente optimizado para extraer el máximo Alfa de este régimen. La alta concentración en semiconductores e infraestructura de nube genera una aceleración de retornos exponencial, superando al S&P 500 por un factor de 2.2x.",
    },
    {
      id: "geopolitical-conflict",
      name: language === "EN" ? "Trade War / Semiconductor Shock" : "Conflicto Comercial / Shock de Microchips",
      description:
        language === "EN"
          ? "Geopolitical friction targeting advanced microchip supply chains (e.g., Taiwan embargo)."
          : "Cierre o bloqueo de cadenas de suministro clave de semiconductores de precisión (ej. embargo tecnológico).",
      impactType: "severe-negative",
      equityAdjustment: (pos) => {
        const ticker = pos.ticker.toUpperCase();
        if (["NVDA", "AVGO"].includes(ticker)) return -0.48; // Critical chip dependencies
        if (["IREN"].includes(ticker)) return -0.38; // Mining hardware disruption
        if (["MSFT", "META", "AMZN"].includes(ticker)) return -0.22; // Tech software impact
        return -0.15;
      },
      cashAdjustment: 0.0,
      cioInsight:
        language === "EN"
          ? "CIO ASSESSMENT: A supply chain bottleneck represents the ultimate tail risk for this portfolio due to the concentrated semiconductor exposure (NVDA/AVGO). Diversification into non-hardware or sovereign defense names is highly recommended."
          : "EVALUACIÓN DEL CIO: Un cuello de botella físico de hardware representa el mayor 'Riesgo de Cola' para esta cartera debido a su alta ponderación en semiconductores (NVDA/AVGO). Recomendamos encarecidamente diversificar hacia sectores defensivos soberanos o software puro no expuestos a Asia Oriental.",
    }
  ];

  // Calculate simulated stress performance
  const selectedScenario = STRESS_SCENARIOS.find((s) => s.id === selectedScenarioId) || STRESS_SCENARIOS[0];

  const calculateStressMetrics = () => {
    let originalTotalValue = portfolio.totals.mktValue;
    let simulatedTotalValue = 0;
    const details = portfolio.positions.map((p) => {
      let change = 0;
      if (p.isCash) {
        change = selectedScenario.cashAdjustment;
      } else {
        change = selectedScenario.equityAdjustment(p);
      }
      const pNewValue = p.mktValue * (1 + change);
      simulatedTotalValue += pNewValue;
      return {
        ticker: p.ticker,
        weight: p.weight,
        originalValue: p.mktValue,
        simulatedValue: pNewValue,
        changePercent: change * 100,
      };
    });

    const netChangeAmt = simulatedTotalValue - originalTotalValue;
    const netChangePct = (netChangeAmt / originalTotalValue) * 100;

    return {
      originalTotalValue,
      simulatedTotalValue,
      netChangeAmt,
      netChangePct,
      details,
    };
  };

  const stressMetrics = calculateStressMetrics();

  // FACTOR EXPOSURE ENGINE (Calculated based on real holdings weights & known factor styles)
  const calculateFactors = () => {
    let growth = 0;
    let quality = 0;
    let momentum = 0;
    let lowVol = 0;
    let value = 0;
    let yields = 0;

    portfolio.positions.forEach((p) => {
      const ticker = p.ticker.toUpperCase();
      const weight = p.weight / 100;

      if (p.isCash) {
        lowVol += weight * 1.0;
        value += weight * 0.5;
        return;
      }

      // Tech Giants (MSFT, META, NVDA, AVGO, AMZN, GOOGL)
      if (["NVDA", "AVGO"].includes(ticker)) {
        growth += weight * 1.0;
        momentum += weight * 0.95;
        quality += weight * 0.9;
        lowVol += weight * 0.15;
        value += weight * 0.1;
      } else if (["MSFT", "META", "AMZN", "GOOGL"].includes(ticker)) {
        growth += weight * 0.85;
        momentum += weight * 0.75;
        quality += weight * 0.95; // Extreme fortress balance sheets
        lowVol += weight * 0.45;
        value += weight * 0.25;
      } else if (["IREN", "CRWV"].includes(ticker)) {
        // High Vol / speculative assets
        growth += weight * 0.9;
        momentum += weight * 0.85;
        quality += weight * 0.2;
        lowVol += weight * 0.0;
        value += weight * 0.15;
      } else {
        // Broad default equities
        growth += weight * 0.6;
        quality += weight * 0.6;
        momentum += weight * 0.5;
        lowVol += weight * 0.4;
        value += weight * 0.3;
      }
    });

    return [
      { name: language === "EN" ? "Growth (Crecimiento)" : "Crecimiento (Growth)", value: Math.min(Math.round(growth * 100), 100), color: "bg-emerald-500", desc: language === "EN" ? "Focus on earnings expansions & premium valuation expansion" : "Enfoque en expansión de utilidades y capturación de primas por innovación tecnológica." },
      { name: language === "EN" ? "Quality (Calidad)" : "Calidad (Quality Fortress)", value: Math.min(Math.round(quality * 100), 100), color: "bg-teal-500", desc: language === "EN" ? "Fortress balance sheets, high return on capital, and high operating leverage" : "Márgenes operativos robustos, balances limpios de deuda excesiva y alto ROIC." },
      { name: language === "EN" ? "Momentum (Tendencia)" : "Tendencia (Momentum Force)", value: Math.min(Math.round(momentum * 100), 100), color: "bg-cyan-500", desc: language === "EN" ? "Riding the waves of trending leaders with strong market relative strength" : "Suscripción activa a las tendencias más fuertes del mercado, capitalizando la inercia del capital." },
      { name: language === "EN" ? "Value (Valor de Descuento)" : "Valor (Value Discount)", value: Math.min(Math.round(value * 100), 100), color: "bg-amber-500", desc: language === "EN" ? "Stocks trading below intrinsic book values or cheap cash flow multiple margins" : "Activos cotizando con descuento sobre su valor intrínseco de flujo de caja libre." },
      { name: language === "EN" ? "Low Volatility (Baja Vol.)" : "Baja Volatilidad (Defensivo)", value: Math.min(Math.round(lowVol * 100), 100), color: "bg-indigo-500", desc: language === "EN" ? "Beta isolation and downside protection during systemic market panics" : "Aislamiento de la beta del S&P 500 y mitigación de fluctuaciones agresivas intradía." }
    ];
  };

  const factorsData = calculateFactors();

  // Helper to format large numbers
  const formatVal = (val: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(val);
  };

  // Helper to format percentage with sign
  const formatChangePct = (val: number) => {
    return `${val >= 0 ? "+" : ""}${val.toFixed(2)}%`;
  };

  // PROGRAMMATIC INSTITUTIONAL PDF GENERATOR
  const exportToPDF = () => {
    try {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      let pageNum = 1;

      // Draw standard institutional letterhead, header, and footer decoration on each page
      const drawPageDecorations = (pdfDoc: typeof doc, pNum: number) => {
        // Top accent line
        pdfDoc.setDrawColor(16, 185, 129); // emerald-500
        pdfDoc.setLineWidth(1);
        pdfDoc.line(15, 15, 195, 15);

        // Header metadata
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.setFontSize(7.5);
        pdfDoc.setTextColor(71, 85, 105); // slate-600
        pdfDoc.text("AETHELGARD ALPHA MANAGEMENT LTD.  |  CIO RESEARCH MEMO", 15, 11);
        
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.setTextColor(16, 185, 129); // emerald-500
        pdfDoc.text("SECURE TRANSMISSION", 195, 11, { align: "right" });

        // Bottom horizontal divider
        pdfDoc.setDrawColor(226, 232, 240); // slate-200
        pdfDoc.setLineWidth(0.5);
        pdfDoc.line(15, 280, 195, 280);

        // Footer confidential disclaimer
        pdfDoc.setFont("helvetica", "normal");
        pdfDoc.setFontSize(7);
        pdfDoc.setTextColor(148, 163, 184); // slate-400
        pdfDoc.text("CONFIDENCIAL // INFORME INSTITUCIONAL GENERADO CON INTELIGENCIA ARTIFICIAL", 15, 285);
        pdfDoc.text(`Página ${pNum}`, 195, 285, { align: "right" });
      };

      // PAGE 1: TITLE BLOCK / LETTERHEAD
      drawPageDecorations(doc, pageNum);

      // Main Title
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(15, 23, 42); // slate-900
      doc.text("MEMORÁNDUM DE INVESTIGACIÓN INSTITUCIONAL", 15, 30);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105); // slate-600
      doc.text("Estación de Análisis de Riesgos y Asimetría Cuantitativa de Carteras", 15, 35);

      // Meta grid box
      doc.setFillColor(248, 250, 252); // slate-50
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.setLineWidth(0.5);
      doc.rect(15, 40, 180, 30, "FD");

      // Grid labels
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139); // slate-500
      doc.text("FECHA:", 20, 46);
      doc.text("PARA:", 20, 53);
      doc.text("DE:", 20, 60);
      doc.text("AUM BAJO GESTIÓN:", 20, 66);

      doc.text("CLASIFICACIÓN:", 115, 46);
      doc.text("ACTIVOS EN CARTERA:", 115, 53);
      doc.text("COJÍN LIQUIDEZ:", 115, 60);
      doc.text("EFICIENCIA ALFA:", 115, 66);

      // Grid values
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42); // slate-900
      doc.text(new Date().toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" }).toUpperCase(), 55, 46);
      doc.text("COMITÉ DE RIESGOS E INVERSIÓN", 55, 53);
      doc.text("CO-CIO DE RECURSOS CUANTITATIVOS", 55, 60);
      doc.setTextColor(5, 150, 105); // emerald-600
      doc.text(formatVal(portfolio.totals.mktValue), 55, 66);

      doc.setTextColor(220, 38, 38); // red-600
      doc.text("ESTRICTAMENTE CONFIDENCIAL", 155, 46);
      doc.setTextColor(15, 23, 42);
      doc.text(`${portfolio.positions.length} ACTIVOS INDEPENDIENTES`, 155, 53);
      doc.text(formatVal(portfolio.positions.find(p => p.isCash)?.mktValue || 0), 155, 60);
      doc.setTextColor(5, 150, 105);
      doc.text("DIVERGENTE POSITIVO", 155, 66);

      // Divider line
      doc.setDrawColor(16, 185, 129); // emerald-500
      doc.setLineWidth(0.5);
      doc.line(15, 76, 195, 76);

      let currentY = 82;

      // PARSING REPORT TEXT
      const lines = reportText.split("\n");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(30, 41, 59); // slate-800

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === "") {
          currentY += 4;
          continue;
        }

        // Check page break threshold
        if (currentY > 260) {
          doc.addPage();
          pageNum++;
          drawPageDecorations(doc, pageNum);
          currentY = 25;
        }

        // H1 header
        if (line.startsWith("# ")) {
          const headerText = line.substring(2).trim();
          if (currentY > 200) {
            doc.addPage();
            pageNum++;
            drawPageDecorations(doc, pageNum);
            currentY = 25;
          } else {
            currentY += 4;
          }
          doc.setFont("helvetica", "bold");
          doc.setFontSize(12);
          doc.setTextColor(4, 120, 87); // emerald-700
          doc.text(headerText.toUpperCase(), 15, currentY);
          currentY += 6;
          
          doc.setDrawColor(16, 185, 129);
          doc.setLineWidth(0.3);
          doc.line(15, currentY - 2, 195, currentY - 2);
          continue;
        }

        // H2 header
        if (line.startsWith("## ")) {
          const headerText = line.substring(3).trim();
          if (currentY > 220) {
            doc.addPage();
            pageNum++;
            drawPageDecorations(doc, pageNum);
            currentY = 25;
          } else {
            currentY += 3;
          }
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10.5);
          doc.setTextColor(5, 150, 105); // emerald-600
          doc.text(headerText, 15, currentY);
          currentY += 5;
          continue;
        }

        // H3 header
        if (line.startsWith("### ")) {
          const headerText = line.substring(4).trim();
          if (currentY > 230) {
            doc.addPage();
            pageNum++;
            drawPageDecorations(doc, pageNum);
            currentY = 25;
          } else {
            currentY += 2;
          }
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9.5);
          doc.setTextColor(51, 65, 85); // slate-700
          doc.text(headerText, 15, currentY);
          currentY += 4;
          continue;
        }

        // Blockquotes or CIO Alerts
        if (line.startsWith("> ")) {
          const quoteText = line.substring(2).trim().replace(/\*\*/g, "");
          const wrappedQuote = doc.splitTextToSize(quoteText, 165);
          const quoteBoxHeight = (wrappedQuote.length * 4.5) + 6;

          if (currentY + quoteBoxHeight > 260) {
            doc.addPage();
            pageNum++;
            drawPageDecorations(doc, pageNum);
            currentY = 25;
          }

          // draw quote box bg
          doc.setFillColor(236, 253, 245); // emerald-50
          doc.setDrawColor(16, 185, 129); // emerald-500
          doc.setLineWidth(0.8);
          doc.rect(15, currentY, 180, quoteBoxHeight, "F");
          doc.line(15, currentY, 15, currentY + quoteBoxHeight);

          doc.setFont("helvetica", "oblique");
          doc.setFontSize(8.5);
          doc.setTextColor(6, 95, 70); // emerald-800

          for (let j = 0; j < wrappedQuote.length; j++) {
            doc.text(wrappedQuote[j], 20, currentY + 5 + (j * 4.5));
          }
          currentY += quoteBoxHeight + 4;
          continue;
        }

        // List item
        if (line.startsWith("- ")) {
          const itemText = line.substring(2).trim().replace(/\*\*/g, "");
          const wrappedItem = doc.splitTextToSize(itemText, 172);

          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.setTextColor(51, 65, 85); // slate-700

          // Draw bullet circle
          doc.setFillColor(16, 185, 129);
          doc.circle(18, currentY + 1.2, 0.8, "F");

          for (let j = 0; j < wrappedItem.length; j++) {
            if (currentY > 260) {
              doc.addPage();
              pageNum++;
              drawPageDecorations(doc, pageNum);
              currentY = 25;
            }
            doc.text(wrappedItem[j], 22, currentY + 2);
            currentY += 4.5;
          }
          currentY += 1.5;
          continue;
        }

        // Markdown tables inside AI response
        if (line.startsWith("|") && i > 0 && lines[i - 1].trim().startsWith("|")) {
          const cells = line.split("|").map(c => c.trim()).filter(c => c !== "");
          if (cells.every(c => c.startsWith("-"))) continue; // skip dividers

          const isHeader = i + 1 < lines.length && lines[i + 1].trim().startsWith("|") && lines[i + 1].includes("---");
          
          if (isHeader) {
            doc.setFillColor(15, 23, 42); // slate-900
            doc.rect(15, currentY, 180, 6, "F");
            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);
            doc.setTextColor(255, 255, 255);
          } else {
            doc.setFillColor(248, 250, 252); // slate-50 alternating
            doc.rect(15, currentY, 180, 5, "F");
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(51, 65, 85);
          }

          const colWidth = 180 / cells.length;
          for (let colIdx = 0; colIdx < cells.length; colIdx++) {
            const align = colIdx === 0 ? "left" : "right";
            const xPos = colIdx === 0 ? 18 : 15 + ((colIdx + 1) * colWidth) - 4;
            const textToPrint = cells[colIdx].replace(/\*\*/g, "");
            doc.text(textToPrint, xPos, currentY + (isHeader ? 4.2 : 3.5), { align });
          }

          currentY += isHeader ? 7 : 5.5;
          continue;
        }

        // Default Paragraph
        const cleanParagraph = line.replace(/\*\*/g, "").replace(/`/g, "");
        const wrappedParagraph = doc.splitTextToSize(cleanParagraph, 180);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(51, 65, 85); // slate-700

        for (let j = 0; j < wrappedParagraph.length; j++) {
          if (currentY > 260) {
            doc.addPage();
            pageNum++;
            drawPageDecorations(doc, pageNum);
            currentY = 25;
          }
          doc.text(wrappedParagraph[j], 15, currentY + 1.5);
          currentY += 4.5;
        }
        currentY += 2;
      }

      // APPENDIX A: STRESS TESTING REPORT
      doc.addPage();
      pageNum++;
      drawPageDecorations(doc, pageNum);
      currentY = 25;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(4, 120, 87);
      doc.text("ANEXO A: SIMULACIÓN DE ESCENARIOS DE ESTRÉS", 15, currentY);
      currentY += 6;
      doc.setDrawColor(16, 185, 129, 0.4);
      doc.setLineWidth(0.3);
      doc.line(15, currentY - 2, 195, currentY - 2);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`ESCENARIO HISTÓRICO: ${selectedScenario.name}`, 15, currentY + 4);
      currentY += 9;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      const wrappedDesc = doc.splitTextToSize(selectedScenario.description, 180);
      for (let j = 0; j < wrappedDesc.length; j++) {
        doc.text(wrappedDesc[j], 15, currentY);
        currentY += 4;
      }
      currentY += 4;

      // Summary table bounding box
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.rect(15, currentY, 180, 16, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text("VALOR INICIAL CARTERA", 20, currentY + 5);
      doc.text("VALOR ESTIMADO POST-CRISIS", 75, currentY + 5);
      doc.text("VARIACIÓN NETO ESTIMADA", 135, currentY + 5);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(formatVal(stressMetrics.originalTotalValue), 20, currentY + 11);
      doc.text(formatVal(stressMetrics.simulatedTotalValue), 75, currentY + 11);
      
      const isNegative = stressMetrics.netChangeAmt < 0;
      if (isNegative) {
        doc.setTextColor(220, 38, 38); // red
      } else {
        doc.setTextColor(5, 150, 105); // emerald
      }
      doc.text(`${isNegative ? "" : "+"}${formatVal(stressMetrics.netChangeAmt)} (${formatChangePct(stressMetrics.netChangePct)})`, 135, currentY + 11);
      currentY += 22;

      // Asset Details Header
      doc.setFillColor(15, 23, 42);
      doc.rect(15, currentY, 180, 6, "F");
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(255, 255, 255);
      doc.text("ACTIVO", 18, currentY + 4.2);
      doc.text("PESO %", 60, currentY + 4.2, { align: "right" });
      doc.text("CAMBIO ESCENARIO", 110, currentY + 4.2, { align: "right" });
      doc.text("VALOR SIMULADO", 192, currentY + 4.2, { align: "right" });
      currentY += 6;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      
      stressMetrics.details.forEach((item, index) => {
        if (index % 2 === 0) {
          doc.setFillColor(248, 250, 252);
        } else {
          doc.setFillColor(255, 255, 255);
        }
        doc.rect(15, currentY, 180, 6.5, "F");
        
        doc.setTextColor(15, 23, 42);
        doc.setFont("helvetica", "bold");
        doc.text(item.ticker, 18, currentY + 4.5);
        
        doc.setFont("helvetica", "normal");
        doc.setTextColor(71, 85, 105);
        doc.text(`${item.weight.toFixed(1)}%`, 60, currentY + 4.5, { align: "right" });
        
        const isChangeNegative = item.changePercent < 0;
        if (isChangeNegative) {
          doc.setTextColor(220, 38, 38);
        } else {
          doc.setTextColor(5, 150, 105);
        }
        doc.setFont("helvetica", "bold");
        doc.text(`${isChangeNegative ? "" : "+"}${item.changePercent.toFixed(0)}%`, 110, currentY + 4.5, { align: "right" });
        
        doc.setTextColor(15, 23, 42);
        doc.text(formatVal(item.simulatedValue), 192, currentY + 4.5, { align: "right" });
        
        currentY += 6.5;
      });
      currentY += 8;

      // CIO Insight Callout
      doc.setFillColor(254, 252, 232); // yellow-50
      doc.setDrawColor(234, 179, 8); // yellow-500
      doc.setLineWidth(0.5);
      
      const wrappedCio = doc.splitTextToSize(`ALERTA DEL CIO: ${selectedScenario.cioInsight}`, 170);
      const cioBoxHeight = (wrappedCio.length * 4.5) + 6;
      doc.rect(15, currentY, 180, cioBoxHeight, "FD");
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(133, 77, 14); // yellow-800
      for (let j = 0; j < wrappedCio.length; j++) {
        doc.text(wrappedCio[j], 20, currentY + 5 + (j * 4.5));
      }
      currentY += cioBoxHeight + 10;

      // APPENDIX B: RISK FACTORSSTYLE
      if (currentY > 160) {
        doc.addPage();
        pageNum++;
        drawPageDecorations(doc, pageNum);
        currentY = 25;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(4, 120, 87);
      doc.text("ANEXO B: ANÁLISIS DE FACTORES DE ESTILO (STYLE TILT)", 15, currentY);
      currentY += 6;
      doc.setDrawColor(16, 185, 129, 0.4);
      doc.setLineWidth(0.3);
      doc.line(15, currentY - 2, 195, currentY - 2);
      currentY += 4;

      // Factor Grid Table
      doc.setFillColor(15, 23, 42);
      doc.rect(15, currentY, 180, 6, "F");
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(255, 255, 255);
      doc.text("FACTOR DE RIESGO", 18, currentY + 4.2);
      doc.text("EXPOSICIÓN ESTIMADA", 75, currentY + 4.2, { align: "right" });
      doc.text("EXPLICACIÓN OPERATIVA", 85, currentY + 4.2);
      currentY += 6;

      factorsData.forEach((f, idx) => {
        if (idx % 2 === 0) {
          doc.setFillColor(248, 250, 252);
        } else {
          doc.setFillColor(255, 255, 255);
        }
        
        const wrappedDesc = doc.splitTextToSize(f.desc, 105);
        const rowHeight = Math.max(6.5, (wrappedDesc.length * 4) + 3);
        doc.rect(15, currentY, 180, rowHeight, "F");

        doc.setTextColor(15, 23, 42);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.text(f.name, 18, currentY + 4.5);

        doc.setFont("helvetica", "bold");
        doc.setTextColor(16, 185, 129);
        doc.text(`${f.value}%`, 75, currentY + 4.5, { align: "right" });

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(71, 85, 105);
        for (let j = 0; j < wrappedDesc.length; j++) {
          doc.text(wrappedDesc[j], 85, currentY + 4 + (j * 4));
        }

        currentY += rowHeight;
      });

      // Signature Panel at bottom
      currentY = 240;
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);
      doc.line(15, currentY, 75, currentY);
      doc.line(135, currentY, 195, currentY);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text("Aethelgard Quant Committee", 45, currentY + 4, { align: "center" });
      doc.text("Senior Co-CIO", 45, currentY + 8, { align: "center" });

      doc.text("Comité de Riesgos Globales", 165, currentY + 4, { align: "center" });
      doc.text("Aprobación Sistemática", 165, currentY + 8, { align: "center" });

      doc.save(`Aethelgard_HedgeFund_Report_${new Date().toISOString().split("T")[0]}.pdf`);
    } catch (pdfErr) {
      console.error("PDF generation error:", pdfErr);
    }
  };

  // LIGHTWEIGHT MARKDOWN TO ELEMENT CONVERTER (for Research Memo)
  const renderMemoText = (text: string) => {
    if (!text) return null;
    const lines = text.split("\n");
    return lines.map((line, idx) => {
      const trimmed = line.trim();

      // Main header
      if (trimmed.startsWith("# ")) {
        return (
          <h1 key={idx} className="text-xl md:text-2xl font-display font-extrabold text-white tracking-wide uppercase border-b-2 border-emerald-500/30 pb-2 mt-8 mb-6 first:mt-0 flex items-center gap-2.5">
            <span className="w-1.5 h-6 bg-emerald-500 rounded" />
            {trimmed.substring(2)}
          </h1>
        );
      }

      // Sub-header
      if (trimmed.startsWith("## ")) {
        return (
          <h2 key={idx} className="text-sm md:text-base font-display font-bold text-emerald-400 tracking-wider uppercase bg-emerald-500/5 border border-emerald-500/10 px-4 py-2.5 rounded-xl mt-8 mb-4 flex items-center gap-2">
            <span className="w-1 h-3.5 bg-emerald-400 rounded-sm" />
            {trimmed.substring(3)}
          </h2>
        );
      }

      // Minor header
      if (trimmed.startsWith("### ")) {
        return (
          <h3 key={idx} className="text-xs md:text-sm font-display font-bold text-slate-200 tracking-wider uppercase mt-6 mb-2.5 flex items-center gap-1.5">
            <span className="w-1 h-1 bg-emerald-500 rounded-full" />
            {trimmed.substring(4)}
          </h3>
        );
      }

      // List item
      if (trimmed.startsWith("- ")) {
        return (
          <div key={idx} className="flex items-start gap-2.5 ml-1 my-2 leading-relaxed text-xs md:text-sm text-slate-300">
            <span className="text-emerald-500 shrink-0 mt-1.5 text-[8px]">■</span>
            <span className="flex-1">{formatBoldItalicAndCode(trimmed.substring(2))}</span>
          </div>
        );
      }

      // Blockquote or CIO statement
      if (trimmed.startsWith("> ")) {
        return (
          <div key={idx} className="border-l-4 border-emerald-500 bg-emerald-500/5 px-4 py-3 rounded-r-xl my-4 text-xs md:text-sm leading-relaxed text-emerald-300 font-mono">
            {formatBoldItalicAndCode(trimmed.substring(2))}
          </div>
        );
      }

      // Table row check
      if (trimmed.startsWith("|") && idx > 0 && lines[idx - 1].trim().startsWith("|")) {
        // Render simple table or process lines to display table cleanly
        const cells = trimmed.split("|").map(c => c.trim()).filter(c => c !== "");
        // If it's the table separator (e.g., |---|---|), ignore it
        if (cells.every(c => c.startsWith("-"))) return null;

        // Header check: Is it the first line of a table? (Next line is separator)
        const isHeader = idx + 1 < lines.length && lines[idx + 1].trim().startsWith("|") && lines[idx + 1].includes("---");

        return (
          <div key={idx} className={`grid grid-cols-${cells.length} border-b border-slate-900/60 font-mono text-[10px] md:text-xs text-slate-300 transition-colors hover:bg-slate-950/20 py-2 ${isHeader ? "bg-slate-950/80 border-b-2 border-emerald-500/20 font-bold text-white uppercase tracking-wider text-[9px] md:text-[10px] py-2.5" : ""}`}>
            {cells.map((cell, cidx) => (
              <span key={cidx} className={`px-2 truncate ${cidx === 0 ? "text-left text-slate-200" : "text-right font-bold"}`}>
                {cell}
              </span>
            ))}
          </div>
        );
      }

      // Empty line
      if (trimmed === "") return <div key={idx} className="h-3" />;

      // Default paragraph
      return (
        <p key={idx} className="my-2 text-xs md:text-sm leading-relaxed text-slate-300 text-justify">
          {formatBoldItalicAndCode(trimmed)}
        </p>
      );
    });
  };

  const formatBoldItalicAndCode = (text: string) => {
    // Basic formatting helper
    let result: React.ReactNode[] = [text];

    // Bold formatting (**text**)
    if (text.includes("**")) {
      const parts = text.split("**");
      result = parts.map((part, i) => {
        if (i % 2 === 1) {
          return <strong key={`b-${i}`} className="text-white font-bold">{part}</strong>;
        }
        return part;
      });
    }

    // Process inline code (`code`)
    result = result.flatMap((item, itemIdx) => {
      if (typeof item !== "string") return item;
      if (!item.includes("`")) return item;

      const codeParts = item.split("`");
      return codeParts.map((part, i) => {
        if (i % 2 === 1) {
          return <code key={`c-${itemIdx}-${i}`} className="bg-slate-950/60 border border-slate-900 px-1.5 py-0.5 rounded text-[10px] md:text-xs font-mono text-emerald-400">{part}</code>;
        }
        return part;
      });
    });

    // Process italics (*text*)
    result = result.flatMap((item, itemIdx) => {
      if (typeof item !== "string") return item;
      if (!item.includes("*")) return item;

      const italicParts = item.split("*");
      return italicParts.map((part, i) => {
        if (i % 2 === 1) {
          return <em key={`i-${itemIdx}-${i}`} className="text-slate-300 italic">{part}</em>;
        }
        return part;
      });
    });

    return result;
  };

  return (
    <div className="bg-[#070913]/60 border border-slate-900/40 rounded-3xl p-4 md:p-6 shadow-2xl relative overflow-hidden backdrop-blur-xl" id="hedge-fund-analysis-tab">
      
      {/* GLOW DECORATIONS */}
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute -bottom-20 -left-20 w-[300px] h-[300px] bg-cyan-500/5 rounded-full blur-[100px] pointer-events-none" />

      {/* HEADER SECTION */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-900/80 pb-5 mb-6">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 text-emerald-400 rounded-2xl border border-emerald-500/20 shadow-md">
            <FileText size={22} className="pulse-subtle" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base md:text-lg font-display font-extrabold text-white tracking-wider uppercase">
                {language === "EN" ? "Hedge Fund Research Suite" : "Estación de Análisis Hedge Fund"}
              </h3>
              <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-md font-bold font-mono tracking-wider">
                SENIOR CIO LEVEL
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {language === "EN"
                ? "Institutional-grade risk assessment, stress testing, and quantitative research memo."
                : "Memorándum ejecutivo confidencial, simulador de stress-testing y diagnóstico de asimetría de cola."}
            </p>
          </div>
        </div>

        {/* SUITE SUB-TABS */}
        <div className="bg-slate-950/60 p-1.5 rounded-xl border border-slate-900/80 flex gap-1.5 self-start lg:self-center">
          <button
            onClick={() => setActiveSubTab("memo")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-150 cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === "memo"
                ? "bg-emerald-500 text-slate-950 font-extrabold shadow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <FileText size={13} />
            {language === "EN" ? "Research Memo" : "Memorándum CIO"}
          </button>
          <button
            onClick={() => setActiveSubTab("stress")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-150 cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === "stress"
                ? "bg-emerald-500 text-slate-950 font-extrabold shadow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <ShieldAlert size={13} />
            {language === "EN" ? "Stress Tester" : "Simulador de Stress"}
          </button>
          <button
            onClick={() => setActiveSubTab("factors")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-150 cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === "factors"
                ? "bg-emerald-500 text-slate-950 font-extrabold shadow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Layers size={13} />
            {language === "EN" ? "Risk Factors" : "Factores de Riesgo"}
          </button>
          <button
            onClick={() => setActiveSubTab("ai_analyst")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-150 cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === "ai_analyst"
                ? "bg-emerald-500 text-slate-950 font-extrabold shadow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <BrainCircuit size={13} />
            {language === "EN" ? "AI Analyst" : "Analista IA"}
          </button>
        </div>
      </div>

      {/* SUB-TAB CONTENTS */}

      {/* 1. MEMO SUITE */}
      {activeSubTab === "memo" && (
        <div className="space-y-6">
          {/* TOP METADATA SUMMARY CARD */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-950/40 p-4 rounded-2xl border border-slate-900/60">
            <div>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">UNIDAD DE ANÁLISIS</span>
              <span className="text-xs font-mono font-extrabold text-slate-300 mt-0.5 block truncate">
                {portfolio.positions.length} Activos Totales
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">FONDOS BAJO GESTIÓN (AUM)</span>
              <span className="text-xs font-mono font-extrabold text-emerald-400 mt-0.5 block">
                {formatVal(portfolio.totals.mktValue)}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">COJÍN DE LIQUIDEZ</span>
              <span className="text-xs font-mono font-extrabold text-slate-300 mt-0.5 block">
                {formatVal(portfolio.positions.find(p => p.isCash)?.mktValue || 0)}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">STATUS DE EXTRACCIÓN ALFA</span>
              <span className="text-xs font-mono font-extrabold text-emerald-400 mt-0.5 block flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping shrink-0" />
                DIVERGENTE POSITIVO
              </span>
            </div>
          </div>

          {/* REPORT MEMORANDUM DISPLAY */}
          <div className="bg-[#0b0d17] border border-slate-900 rounded-2xl p-5 md:p-8 shadow-inner overflow-y-auto max-h-[700px] scrollbar-thin scrollbar-thumb-slate-900 scrollbar-track-transparent">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <RefreshCw size={36} className="text-emerald-500 animate-spin" />
                <div className="text-center">
                  <h4 className="text-sm font-display font-bold text-white tracking-wider uppercase">
                    Redactando Memorándum de Alta Convicción...
                  </h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm">
                    El CIO de Aethelgard está evaluando volatilidades cruzadas, múltiplos P/E y coberturas asimétricas sobre sus {portfolio.positions.length} posiciones...
                  </p>
                </div>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                <AlertCircle size={32} className="text-rose-500" />
                <p className="text-sm font-semibold text-rose-400">{error}</p>
                <button
                  onClick={() => fetchReport(true)}
                  className="px-4 py-2 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 rounded-xl text-xs text-rose-400 font-bold tracking-wider cursor-pointer transition-all"
                >
                  Reintentar Generación
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-900 pb-3 mb-6">
                  <span className="text-[10px] font-mono text-slate-500">AETHELGARD ALPHA MANAGEMENT LTD. // CO-CIO SECURE TRANSMISSION</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={exportToPDF}
                      disabled={loading || !reportText}
                      className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/15 px-2.5 py-1 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
                      title={language === "EN" ? "Export this full report to professional PDF" : "Exportar reporte analítico completo a PDF institucional"}
                    >
                      <Download size={10} />
                      {language === "EN" ? "EXPORT TO PDF" : "DESCARGAR PDF"}
                    </button>
                    <button
                      onClick={() => fetchReport(true)}
                      className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-slate-200 transition-colors cursor-pointer bg-slate-950 hover:bg-slate-900 border border-slate-900 px-2.5 py-1 rounded-lg"
                      title="Forzar actualización completa con IA"
                    >
                      <RefreshCw size={10} className={loading ? "animate-spin" : ""} />
                      {language === "EN" ? "RE-EXECUTE" : "CORRER ANÁLISIS"}
                    </button>
                  </div>
                </div>

                {/* THE RENDERED AI OUTPUT */}
                <div className="prose prose-invert max-w-none">
                  {renderMemoText(reportText)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. STRESS TESTER SUITE */}
      {activeSubTab === "stress" && (
        <div className="space-y-6">
          <div className="bg-[#0b0d17] border border-slate-900 rounded-2xl p-5 md:p-6 shadow-md">
            <h4 className="text-sm font-display font-extrabold text-white tracking-wider uppercase mb-1 flex items-center gap-2">
              <ShieldAlert className="text-emerald-400" size={16} />
              Motor de Simulación de Estrés y Volatilidad Extrema
            </h4>
            <p className="text-xs text-slate-400">
              Someter la composición de su portafolio actual frente a eventos de cola y catástrofes de mercado históricas para prever la resiliencia de su capital líquido.
            </p>

            {/* SCENARIO SELECTOR */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
              {STRESS_SCENARIOS.map((sc) => {
                const isSelected = sc.id === selectedScenarioId;
                return (
                  <button
                    key={sc.id}
                    onClick={() => setSelectedScenarioId(sc.id)}
                    className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                      isSelected
                        ? "bg-emerald-500/5 border-emerald-500 text-white shadow-lg shadow-emerald-500/5"
                        : "bg-slate-950/20 border-slate-900 text-slate-400 hover:border-slate-800 hover:text-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider">{sc.name}</span>
                      <span className={`w-2 h-2 rounded-full ${
                        sc.impactType.includes("severe") 
                          ? "bg-rose-500" 
                          : sc.impactType.includes("moderate") 
                          ? "bg-amber-500" 
                          : "bg-emerald-500"
                      }`} />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1.5 leading-snug truncate-2-lines">
                      {sc.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* PERFORMANCE RESULTS CONTAINER */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* VALUE METRICS WIDGET (6 Columns) */}
            <div className="lg:col-span-5 bg-slate-950/40 p-5 rounded-2xl border border-slate-900/60 flex flex-col justify-between">
              <div>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">ESCENARIO EVALUADO</span>
                <h3 className="text-base font-display font-extrabold text-white uppercase mt-0.5">
                  {selectedScenario.name}
                </h3>
              </div>

              <div className="my-6 space-y-4">
                <div className="flex justify-between items-baseline border-b border-slate-900 pb-2">
                  <span className="text-xs text-slate-400">AUM Inicial Precrisis:</span>
                  <span className="text-sm font-mono text-slate-200 font-bold">{formatVal(stressMetrics.originalTotalValue)}</span>
                </div>
                <div className="flex justify-between items-baseline border-b border-slate-900 pb-2">
                  <span className="text-xs text-slate-400">AUM Simulado Postcrisis:</span>
                  <span className="text-base font-mono text-white font-extrabold">{formatVal(stressMetrics.simulatedTotalValue)}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-slate-400">Variación Absoluta Estimada:</span>
                  <span className={`text-sm font-mono font-bold ${stressMetrics.netChangeAmt >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {stressMetrics.netChangeAmt >= 0 ? "+" : ""}{formatVal(stressMetrics.netChangeAmt)} ({formatChangePct(stressMetrics.netChangePct)})
                  </span>
                </div>
              </div>

              {/* DRAWDOWN SCALE BAR */}
              <div>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1.5">INTENSIDAD DE RETORNO EN CRISIS</span>
                <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      stressMetrics.netChangePct >= 0 
                        ? "bg-emerald-500" 
                        : stressMetrics.netChangePct < -30 
                        ? "bg-rose-600 animate-pulse" 
                        : "bg-amber-500"
                    }`}
                    style={{ width: `${Math.max(0, Math.min(100, 100 + stressMetrics.netChangePct))}%` }}
                  />
                </div>
                <div className="flex justify-between text-[9px] text-slate-600 font-mono mt-1">
                  <span>-100% Liquidez Total</span>
                  <span>Línea Base precrisis (0%)</span>
                  <span>+100% Retorno</span>
                </div>
              </div>
            </div>

            {/* CIO ADVISORY BOARD (7 Columns) */}
            <div className="lg:col-span-7 bg-slate-950/40 p-5 rounded-2xl border border-slate-900/60 flex flex-col justify-between">
              <div>
                <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider block">INFORME DE COMITÉ DEL CIO</span>
                <div className="border-l-2 border-emerald-500 pl-4 py-1.5 mt-2">
                  <p className="text-xs md:text-sm font-mono leading-relaxed text-emerald-300">
                    "{selectedScenario.cioInsight}"
                  </p>
                </div>
              </div>

              {/* SCENARIO COMPONENT SPECIFICS TABLE */}
              <div className="mt-5">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-2">Pérdida/Ganancia Estimada por Posición</span>
                <div className="bg-slate-950/80 rounded-xl border border-slate-900 overflow-hidden max-h-[220px] overflow-y-auto">
                  <div className="grid grid-cols-4 bg-slate-900/50 border-b border-slate-900 p-2 text-[9px] text-slate-500 uppercase font-mono font-bold tracking-wider">
                    <span>Ticker</span>
                    <span className="text-right">Peso</span>
                    <span className="text-right">Var. %</span>
                    <span className="text-right">Simulado</span>
                  </div>
                  {stressMetrics.details.map((item, idx) => (
                    <div key={`${item.ticker}-${idx}`} className="grid grid-cols-4 p-2 text-[11px] font-mono border-b border-slate-900 last:border-0 hover:bg-slate-900/20 transition-colors">
                      <span className="font-bold text-slate-300">{item.ticker}</span>
                      <span className="text-right text-slate-400">{item.weight.toFixed(1)}%</span>
                      <span className={`text-right font-bold ${item.changePercent >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {item.changePercent >= 0 ? "+" : ""}{item.changePercent.toFixed(0)}%
                      </span>
                      <span className="text-right text-white font-bold">{formatVal(item.simulatedValue)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. FACTOR EXPOSURES */}
      {activeSubTab === "factors" && (
        <div className="space-y-6">
          <div className="bg-[#0b0d17] border border-slate-900 rounded-2xl p-5 md:p-6 shadow-md">
            <h4 className="text-sm font-display font-extrabold text-white tracking-wider uppercase mb-1 flex items-center gap-2">
              <Layers className="text-emerald-400" size={16} />
              Análisis Factorial de Estilo Cuantitativo
            </h4>
            <p className="text-xs text-slate-400">
              Desglose de la exposición a primas de riesgo sistemáticas calculadas de acuerdo a la matriz de ponderación real de sus posiciones activas.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* FACTOR RADAR / LIST CARD */}
            <div className="bg-slate-950/40 p-5 rounded-2xl border border-slate-900/60 space-y-4">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-2">TILT FACTORIAL REAL DEL PORTAFOLIO</span>
              {factorsData.map((f, idx) => (
                <div key={`${f.name}-${idx}`} className="space-y-1.5">
                  <div className="flex justify-between items-baseline text-xs">
                    <span className="font-bold text-slate-200">{f.name}</span>
                    <span className="font-mono text-emerald-400 font-bold">{f.value}%</span>
                  </div>
                  <div className="h-2 w-full bg-slate-900/80 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${f.color} transition-all duration-500`}
                      style={{ width: `${f.value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* FACTOR INTERPRETATION OR CONVICTION CARD */}
            <div className="bg-slate-950/40 p-5 rounded-2xl border border-slate-900/60 flex flex-col justify-between">
              <div>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">GLOSARIO FACTORIAL S&P 500</span>
                <div className="space-y-3 mt-3 overflow-y-auto max-h-[300px]">
                  {factorsData.map((f, idx) => (
                    <div key={`${f.name}-${idx}`} className="p-3 bg-slate-950/80 border border-slate-900 rounded-xl">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${f.color}`} />
                        <h5 className="text-[11px] font-bold text-white uppercase font-mono">{f.name}</h5>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                        {f.desc}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl text-[11px] font-mono leading-relaxed text-emerald-400 flex items-start gap-2">
                <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
                <span>
                  <strong>Nota Cuantitativa:</strong> Su portafolio actual presenta un fuerte sesgo hacia <strong>Crecimiento, Calidad e Inercia (Momentum)</strong>. Esto genera una alta eficiencia durante subas impulsadas por expansión tecnológica, pero incrementa severamente su correlación con la Beta general del Nasdaq.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. AI ANALYST */}
      {activeSubTab === "ai_analyst" && (
        <div className="space-y-6">
          <div className="bg-[#0b0d17] border border-slate-900 rounded-2xl p-5 md:p-6 shadow-md">
            <h4 className="text-sm font-display font-extrabold text-white tracking-wider uppercase mb-1 flex items-center gap-2">
              <BrainCircuit className="text-emerald-400" size={16} />
              {language === "EN" ? "AI Portfolio Analyst" : "Analista IA del Portafolio"}
            </h4>
            <p className="text-xs text-slate-400">
              {language === "EN" 
                ? "Chat directly with our advanced institutional-grade artificial intelligence specialized in deep fundamental analysis and market coverage."
                : "Consulte directamente con nuestro sistema de inteligencia artificial especializado en análisis fundamental profundo y cobertura de mercado."}
            </p>
          </div>
          <div className="bg-[#0b0d17]/50 rounded-2xl border border-slate-900/80 p-2 md:p-4">
            <AskAIAnalyst portfolio={portfolio} />
          </div>
        </div>
      )}
    </div>
  );
}
