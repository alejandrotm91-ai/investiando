import React, { useState, useEffect, useMemo } from "react";
import { Holding, UserPortfolio } from "../types";
import {
  Sparkles,
  X,
  DollarSign,
  ShieldCheck,
  TrendingUp,
  Layers,
  BarChart3,
  CheckCircle2,
  RefreshCw,
  Sliders,
  ChevronRight,
  Zap,
  Briefcase,
  PieChart,
  Building2,
  Target,
  ArrowRight,
  Info,
  Check,
  Tag,
  Activity
} from "lucide-react";
import { calculatePortfolioScoreFromMatrix, getStockScore } from "../utils/stockScoresMatrix";

export interface CreatePortfolioAIModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyPortfolio: (newHoldings: Holding[], portfolioName?: string, targetPortfolioId?: string) => void;
  language?: "EN" | "ES";
  theme?: "dark" | "light";
  userPortfolios?: UserPortfolio[];
  activePortfolioId?: string;
}

interface GeneratedHolding {
  ticker: string;
  name: string;
  shares: number;
  avgCost: number;
  currentPrice: number;
  mktValue: number;
  weight: number;
  sector: string;
  marketCap: number;
  marketCapFormatted: string;
  pe: number | null;
  dividendYield: number | null;
  rationale: string;
  archetype: string;
}

interface GenerationResult {
  success: boolean;
  strategyTitle: string;
  strategyDescription: string;
  totalTargetAmount: number;
  totalAllocatedAmount: number;
  cashRemaining: number;
  holdings: GeneratedHolding[];
  summaryMetrics: {
    weightedPe: number;
    weightedDivYield: number;
    sectorWeights: Record<string, number>;
    topHolding: string;
  };
  aiRationale: string;
}

const STRATEGY_OPTIONS = [
  {
    id: "balanced",
    icon: Layers,
    badge: "All-Weather Core",
    badgeES: "Todo-Terreno",
    titleEN: "Balanced All-Weather Core",
    titleES: "Portafolio Equilibrado Todo-Terreno",
    descEN: "Strategic multi-sector balance across growth engines, compounders, defensives, and cash flow pillars.",
    descES: "Diversificación multisectorial estratégica equilibrando crecimiento, calidad y estabilidad.",
    examples: "MSFT, AAPL, AMZN, JNJ, JPM, PG"
  },
  {
    id: "compounders",
    icon: Building2,
    badge: "Quality & Moats",
    badgeES: "Calidad & Moats",
    titleEN: "High-Quality Compounders",
    titleES: "Compounders de Alta Calidad",
    descEN: "Focus on high-ROIC industry leaders with wide moats, pricing power, and fortress balance sheets.",
    descES: "Líderes con altos retornos sobre capital (ROIC), ventajas competitivas duraderas y balances blindados.",
    examples: "MSFT, AAPL, GOOGL, NVDA, V, COST"
  },
  {
    id: "hypergrowth",
    icon: Zap,
    badge: "AI & Tech",
    badgeES: "IA & Tecnología",
    titleEN: "Hyper-Growth & AI Leaders",
    titleES: "Hipercrecimiento & Líderes de IA",
    descEN: "Fast-growing leaders in artificial intelligence, semiconductors, and next-gen cloud platforms (> $20B).",
    descES: "Líderes de rápida expansión en infraestructura de IA, semiconductores y software en la nube (> $20B).",
    examples: "NVDA, AMZN, META, AVGO, TSM, NOW"
  },
  {
    id: "garp",
    icon: TrendingUp,
    badge: "Balanced Growth",
    badgeES: "Crecimiento Razonable",
    titleEN: "Growth at a Reasonable Price (GARP)",
    titleES: "Crecimiento a Precio Razonable (GARP)",
    descEN: "Companies with solid double-digit earnings growth trading at rational valuation multiples.",
    descES: "Empresas con sólido crecimiento de beneficios cotizando a múltiplos razonables (PEG atractivo).",
    examples: "GOOGL, META, QCOM, AMAT, BKNG, TXN"
  },
  {
    id: "buffett",
    icon: Target,
    badge: "Buffett Style",
    badgeES: "Estilo Buffett",
    titleEN: "Wonderful Co. @ Fair Price",
    titleES: "Negocios Extraordinarios a Precio Justo",
    descEN: "Durable franchises with heavy free cash flow conversion, high retention, and disciplined capital allocation.",
    descES: "Negocios con alto flujo de caja libre, fidelidad de clientes y disciplina en asignación de capital.",
    examples: "BRK-B, AAPL, KO, AXP, OXY, MCD"
  },
  {
    id: "dividends",
    icon: ShieldCheck,
    badge: "Dividend Growth",
    badgeES: "Dividendos Crecientes",
    titleEN: "Dividend Growth & Defensive",
    titleES: "Dividendos Crecientes & Defensivos",
    descEN: "Low-volatility large caps with consistent decades of dividend growth and resilient cash flows.",
    descES: "Valores estables de baja volatilidad con décadas de incrementos continuos en dividendos.",
    examples: "JNJ, PG, PEP, ABBV, MCD, MRK"
  },
  {
    id: "deepvalue",
    icon: DollarSign,
    badge: "High FCF Yield",
    badgeES: "Alto Rendimiento FCF",
    titleEN: "Deep Value & Cash Flow Yield",
    titleES: "Valor Profundo & Alto Flujo de Caja",
    descEN: "Large-cap leaders trading at attractive historical valuation discounts with robust cash generation.",
    descES: "Compañías consolidadas cotizando con descuento y generando fuerte flujo de caja libre.",
    examples: "BABA, PYPL, GM, CMCSA, CVS, INTC"
  }
];

const PRESET_AMOUNTS = [10000, 25000, 50000, 100000, 250000, 500000];
const HOLDINGS_COUNT_OPTIONS = [6, 8, 10, 12, 15];

export default function CreatePortfolioAIModal({
  isOpen,
  onClose,
  onApplyPortfolio,
  language = "EN",
  theme = "dark",
  userPortfolios = [],
  activePortfolioId = "portfolio-1"
}: CreatePortfolioAIModalProps) {
  const isES = language === "ES";
  const isLight = theme === "light";

  // Form State
  const [amount, setAmount] = useState<number>(50000);
  const [amountInput, setAmountInput] = useState<string>("50,000");
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>(["balanced"]);
  const [holdingsCount, setHoldingsCount] = useState<number>(8);
  const [customNotes, setCustomNotes] = useState<string>("");

  const getDefaultStrategyName = (stratIds: string[]) => {
    if (!stratIds || stratIds.length === 0) return isES ? "Portafolio IA Personalizado" : "Custom AI Portfolio";
    const selectedOptions = STRATEGY_OPTIONS.filter((s) => stratIds.includes(s.id));
    if (selectedOptions.length === 0) return isES ? "Portafolio IA Personalizado" : "Custom AI Portfolio";
    if (selectedOptions.length === 1) {
      return isES ? selectedOptions[0].titleES : selectedOptions[0].titleEN;
    }
    if (selectedOptions.length === 2) {
      const name1 = isES ? selectedOptions[0].badgeES : selectedOptions[0].badge;
      const name2 = isES ? selectedOptions[1].badgeES : selectedOptions[1].badge;
      return isES ? `Híbrido: ${name1} & ${name2}` : `Hybrid: ${name1} & ${name2}`;
    }
    return isES
      ? `Portafolio Multi-Estilo (${selectedOptions.length} Enfoques)`
      : `Multi-Style Portfolio (${selectedOptions.length} Styles)`;
  };

  const [portfolioName, setPortfolioName] = useState<string>(() => getDefaultStrategyName(["balanced"]));
  const [hasUserEditedName, setHasUserEditedName] = useState<boolean>(false);

  // Target Slot: "new" (if userPortfolios.length <= 1) or specific portfolio ID
  const [targetSlot, setTargetSlot] = useState<string>(() => {
    if (!userPortfolios || userPortfolios.length <= 1) return "new";
    return activePortfolioId || userPortfolios[0].id || "portfolio-1";
  });

  // Reset or update targetSlot when modal opens or userPortfolios change
  useEffect(() => {
    if (!userPortfolios || userPortfolios.length <= 1) {
      setTargetSlot("new");
    } else {
      setTargetSlot(activePortfolioId || userPortfolios[0].id || "portfolio-1");
    }
  }, [userPortfolios, activePortfolioId, isOpen]);

  // When strategy toggle changes, update name if user hasn't manually customized it
  const handleStrategyToggle = (stratId: string) => {
    const nextStrategies = selectedStrategies.includes(stratId)
      ? selectedStrategies.filter((id) => id !== stratId)
      : [...selectedStrategies, stratId];

    setSelectedStrategies(nextStrategies);
    if (!hasUserEditedName) {
      setPortfolioName(getDefaultStrategyName(nextStrategies));
    }
  };

  // Flow State: 'config' | 'generating' | 'preview'
  const [step, setStep] = useState<"config" | "generating" | "preview">("config");
  const [generatingStepText, setGeneratingStepText] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);

  // Lock background body scroll when modal is open to ensure smooth touch scrolling on mobile
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // Compute Unified Global Portfolio Score
  const portfolioScore = useMemo(() => {
    if (!result || !result.holdings || result.holdings.length === 0) return null;
    return calculatePortfolioScoreFromMatrix(result.holdings);
  }, [result]);

  if (!isOpen) return null;

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, "");
    if (!raw) {
      setAmountInput("");
      setAmount(0);
      return;
    }
    const num = parseInt(raw, 10);
    setAmount(num);
    setAmountInput(num.toLocaleString("en-US"));
  };

  const handleSelectPreset = (val: number) => {
    setAmount(val);
    setAmountInput(val.toLocaleString("en-US"));
  };

  const handleGenerate = async () => {
    if (amount < 1000) {
      setErrorMsg(isES ? "El monto mínimo de inversión es $1,000 USD." : "Minimum investment amount is $1,000 USD.");
      return;
    }

    if (selectedStrategies.length === 0) {
      setErrorMsg(isES ? "Por favor selecciona al menos un enfoque / estilo de inversión." : "Please select at least one portfolio style / theme.");
      return;
    }

    setErrorMsg(null);
    setStep("generating");
    setGeneratingStepText(isES ? "Escaneando universo Large-Cap (> $20B Market Cap)..." : "Scanning Large-Cap universe (> $20B Market Cap)...");

    try {
      // Periodic status updates for UI feedback
      const timer1 = setTimeout(() => {
        setGeneratingStepText(isES ? "Evaluando factores fundamentales (Quality, Growth, Stability, Valuation)..." : "Evaluating fundamental factors (Quality, Growth, Stability, Valuation)...");
      }, 1400);

      const timer2 = setTimeout(() => {
        setGeneratingStepText(isES ? "Optimizando pesos y consultando precios de mercado en tiempo real..." : "Optimizing weights & fetching real-time market prices...");
      }, 2800);

      const timer3 = setTimeout(() => {
        setGeneratingStepText(isES ? "Calculando cantidades exactas de acciones y saldo en efectivo..." : "Computing exact share counts & cash allocation...");
      }, 4200);

      const res = await fetch("/api/portfolio/generate-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          strategyType: selectedStrategies.join(","),
          strategyTypes: selectedStrategies,
          holdingsCount,
          customNotes,
          language
        })
      });

      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to generate AI portfolio");
      }

      const data: GenerationResult = await res.json();
      setResult(data);
      setStep("preview");
    } catch (err: any) {
      console.error("AI Portfolio generation error:", err);
      setErrorMsg(err.message || (isES ? "Ocurrió un error al generar el portafolio. Intente nuevamente." : "An error occurred while generating the portfolio. Please try again."));
      setStep("config");
    }
  };

  const handleApply = () => {
    if (!result || !Array.isArray(result.holdings)) return;

    // Convert generated holdings to standard Holding[] format
    const newHoldings: Holding[] = result.holdings.map((h) => ({
      ticker: h.ticker,
      shares: h.shares,
      avgCost: h.avgCost
    }));

    // If there is cash remaining, add CASH position
    if (result.cashRemaining && result.cashRemaining > 0) {
      newHoldings.push({
        ticker: "CASH",
        shares: Math.round(result.cashRemaining * 100) / 100,
        avgCost: 1,
        isCash: true
      });
    }

    const finalName = portfolioName.trim() || result.strategyTitle || (isES ? "Portafolio IA" : "AI Portfolio");
    onApplyPortfolio(newHoldings, finalName, targetSlot);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 overscroll-contain">
      <div 
        className={`w-full max-w-4xl h-[92dvh] max-h-[92dvh] sm:h-auto sm:max-h-[90vh] flex flex-col min-h-0 rounded-2xl border shadow-2xl overflow-hidden transition-colors ${
          isLight
            ? "bg-[#f7f5ef] border-[#ded9cb] text-[#3a3730]"
            : "bg-[#0b0e14] border-slate-800/90 text-slate-100"
        }`}
      >
        {/* MODAL HEADER */}
        <div className={`px-4 sm:px-7 py-3.5 sm:py-5 border-b flex items-center justify-between shrink-0 transition-colors ${
          isLight
            ? "border-[#ded9cb] bg-gradient-to-r from-emerald-500/10 via-[#ebe8df] to-teal-500/10"
            : "border-slate-800/80 bg-gradient-to-r from-emerald-950/20 via-slate-900/40 to-teal-950/20"
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl border flex items-center justify-center shadow-sm shrink-0 ${
              isLight
                ? "bg-emerald-500/15 border-emerald-600/30 text-emerald-700 shadow-emerald-600/10"
                : "bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border-emerald-500/30 text-emerald-400 shadow-emerald-500/10"
            }`}>
              <Sparkles size={18} className="animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className={`text-sm sm:text-lg font-display font-bold tracking-wide ${
                  isLight ? "text-[#1b1917]" : "text-white"
                }`}>
                  {isES ? "Crear Portafolio con IA" : "Create Portfolio with AI"}
                </h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                  isLight 
                    ? "bg-emerald-500/10 text-emerald-800 border-emerald-600/30" 
                    : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                }`}>
                  Large-Cap &gt; $20B
                </span>
              </div>
              <p className={`text-[11px] sm:text-xs line-clamp-1 sm:line-clamp-none ${isLight ? "text-[#787366]" : "text-slate-400"}`}>
                {isES
                  ? "Construcción cuantitativa e institucional basada en tu capital y estilo de inversión"
                  : "Institutional-grade portfolio construction tailored to your target capital and style"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-xl transition-colors cursor-pointer shrink-0 ${
              isLight 
                ? "text-[#787366] hover:text-[#1b1917] hover:bg-[#ebe8df]" 
                : "text-slate-400 hover:text-white hover:bg-slate-800/60"
            }`}
          >
            <X size={18} />
          </button>
        </div>

        {/* MODAL BODY CONTENT (Smooth vertical scroll without visible scrollbar) */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-7 space-y-6 no-scrollbar scrollbar-none [touch-action:pan-y] [-webkit-overflow-scrolling:touch]">
          {errorMsg && (
            <div className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
              isLight 
                ? "bg-rose-500/10 border-rose-500/30 text-rose-700" 
                : "bg-rose-500/10 border-rose-500/30 text-rose-300"
            }`}>
              <Info size={16} className="shrink-0 text-rose-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* STEP 1: CONFIGURATION */}
          {step === "config" && (
            <div className="space-y-6">
              {/* 1. PORTFOLIO NAME */}
              <div className={`p-5 rounded-2xl border space-y-3 transition-colors ${
                isLight 
                  ? "bg-white border-[#ded9cb] shadow-sm" 
                  : "bg-[#0f121a]/80 border-slate-800/80"
              }`}>
                <label className={`text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${
                  isLight ? "text-[#3a3730]" : "text-slate-300"
                }`}>
                  <Tag size={14} className={isLight ? "text-emerald-700" : "text-emerald-400"} />
                  {isES ? "Nombre del Portafolio" : "Portfolio Name"}
                </label>

                <div className="relative">
                  <div className={`absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none ${
                    isLight ? "text-emerald-700" : "text-emerald-400"
                  }`}>
                    <Briefcase size={16} />
                  </div>
                  <input
                    type="text"
                    value={portfolioName}
                    onChange={(e) => {
                      setPortfolioName(e.target.value);
                      setHasUserEditedName(true);
                    }}
                    placeholder={isES ? "ej. Compounders de Calidad, Crecimiento IA..." : "e.g. Quality Compounders, AI Growth..."}
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl font-medium text-sm border focus:outline-none transition-all ${
                      isLight 
                        ? "bg-[#f7f5ef] border-[#ded9cb] text-[#1b1917] placeholder-[#787366]/70 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20" 
                        : "bg-slate-950/70 border-slate-800 text-white placeholder-slate-500 focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20"
                    }`}
                  />
                </div>
              </div>

              {/* 2. INVESTMENT AMOUNT & NUMBER OF HOLDINGS ROW */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {/* Investment Amount Card */}
                <div className={`p-4.5 rounded-2xl border space-y-3 flex flex-col justify-between transition-colors ${
                  isLight 
                    ? "bg-white border-[#ded9cb] shadow-sm" 
                    : "bg-[#0f121a]/80 border-slate-800/80"
                }`}>
                  <div className="flex items-center justify-between">
                    <label className={`text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${
                      isLight ? "text-[#3a3730]" : "text-slate-300"
                    }`}>
                      <DollarSign size={14} className={isLight ? "text-emerald-700" : "text-emerald-400"} />
                      {isES ? "Monto de Inversión (USD)" : "Investment Amount (USD)"}
                    </label>
                    <span className={`text-[10px] font-mono font-medium ${
                      isLight ? "text-emerald-700" : "text-emerald-400/90"
                    }`}>
                      {isES ? "100% Asignado" : "100% Allocated"}
                    </span>
                  </div>

                  <div className="relative">
                    <div className={`absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-base font-mono font-bold ${
                      isLight ? "text-[#787366]" : "text-slate-400"
                    }`}>
                      $
                    </div>
                    <input
                      type="text"
                      value={amountInput}
                      onChange={handleAmountChange}
                      placeholder="50,000"
                      className={`w-full pl-8 pr-3 py-2.5 rounded-xl font-mono text-base font-bold border focus:outline-none transition-all ${
                        isLight 
                          ? "bg-[#f7f5ef] border-[#ded9cb] text-[#1b1917] focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20" 
                          : "bg-slate-950/70 border-slate-800 text-white focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20"
                      }`}
                    />
                  </div>

                  {/* Quick Presets */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className={`text-[10px] font-medium mr-0.5 ${isLight ? "text-[#787366]" : "text-slate-400"}`}>
                      {isES ? "Presets:" : "Presets:"}
                    </span>
                    {PRESET_AMOUNTS.map((val) => {
                      const isSelected = amount === val;
                      return (
                        <button
                          key={val}
                          type="button"
                          onClick={() => handleSelectPreset(val)}
                          className={`px-2 py-0.5 rounded-lg text-[11px] font-mono font-semibold transition-all cursor-pointer border ${
                            isSelected
                              ? isLight 
                                ? "bg-emerald-500/20 text-emerald-800 border-emerald-600 shadow-sm" 
                                : "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm"
                              : isLight 
                                ? "bg-[#ebe8df] text-[#3a3730] border-[#ded9cb] hover:bg-white hover:text-[#1b1917]" 
                                : "bg-slate-900/60 text-slate-400 border-slate-800/80 hover:text-white hover:bg-slate-800"
                          }`}
                        >
                          ${(val / 1000).toFixed(0)}k
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Holdings Count Card */}
                <div className={`p-4.5 rounded-2xl border space-y-3 flex flex-col justify-between transition-colors ${
                  isLight 
                    ? "bg-white border-[#ded9cb] shadow-sm" 
                    : "bg-[#0f121a]/80 border-slate-800/80"
                }`}>
                  <div className="flex items-center justify-between">
                    <label className={`text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${
                      isLight ? "text-[#3a3730]" : "text-slate-300"
                    }`}>
                      <Target size={14} className={isLight ? "text-emerald-700" : "text-emerald-400"} />
                      {isES ? "Número de Posiciones" : "Number of Holdings"}
                    </label>
                    <span className={`text-[10px] font-mono ${isLight ? "text-[#787366]" : "text-slate-400"}`}>
                      {isES ? "Enfoque institucional" : "Institutional focus"}
                    </span>
                  </div>

                  <div className="grid grid-cols-6 gap-1.5 py-0.5">
                    {HOLDINGS_COUNT_OPTIONS.map((cnt) => {
                      const isSelected = holdingsCount === cnt;
                      return (
                        <button
                          key={cnt}
                          type="button"
                          onClick={() => setHoldingsCount(cnt)}
                          className={`py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer border flex items-center justify-center ${
                            isSelected
                              ? isLight 
                                ? "bg-emerald-500/20 text-emerald-800 border-emerald-600 shadow-sm ring-1 ring-emerald-600/30" 
                                : "bg-emerald-500/20 text-emerald-300 border-emerald-500/60 shadow-sm ring-1 ring-emerald-500/30"
                              : isLight 
                                ? "bg-[#f7f5ef] text-[#787366] border-[#ded9cb] hover:text-[#1b1917] hover:bg-white" 
                                : "bg-slate-950/70 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700"
                          }`}
                        >
                          {cnt}
                        </button>
                      );
                    })}
                  </div>

                  <div className={`flex items-center justify-between text-[10px] pt-0.5 ${isLight ? "text-[#787366]" : "text-slate-400"}`}>
                    <span>{isES ? "Diversificación:" : "Diversification:"}</span>
                    <span className={`font-mono font-semibold ${isLight ? "text-emerald-700" : "text-emerald-400"}`}>
                      {holdingsCount} {isES ? "Posiciones Large-Cap" : "Large-Cap Holdings"}
                    </span>
                  </div>
                </div>
              </div>

              {/* 3. STRATEGY TYPE SELECTION (MULTI-SELECT) */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className={`text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${
                    isLight ? "text-[#3a3730]" : "text-slate-300"
                  }`}>
                    <Sliders size={14} className={isLight ? "text-emerald-700" : "text-emerald-400"} />
                    {isES ? "Estilos / Enfoques de Inversión" : "Portfolio Styles / Themes"}
                  </label>
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border transition-all ${
                      selectedStrategies.length === 0
                        ? isLight 
                          ? "text-amber-800 bg-amber-500/15 border-amber-500/40 font-semibold" 
                          : "text-amber-300 bg-amber-500/15 border-amber-500/40 font-semibold"
                        : isLight 
                          ? "text-emerald-800 bg-emerald-500/10 border-emerald-600/30" 
                          : "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
                    }`}>
                      {selectedStrategies.length === 0
                        ? (isES ? "⚠️ Elige al menos 1 estilo" : "⚠️ Select at least 1 style")
                        : (isES ? `Seleccionados: ${selectedStrategies.length} de 7` : `Selected: ${selectedStrategies.length} of 7`)}
                    </span>
                    <span className={`text-[11px] hidden sm:inline ${isLight ? "text-[#787366]" : "text-slate-400"}`}>
                      {isES ? "(Puedes combinar varios)" : "(Select multiple to blend)"}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {STRATEGY_OPTIONS.map((strat) => {
                    const Icon = strat.icon;
                    const isSelected = selectedStrategies.includes(strat.id);
                    return (
                      <div
                        key={strat.id}
                        onClick={() => handleStrategyToggle(strat.id)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between relative group select-none ${
                          isSelected
                            ? isLight 
                              ? "bg-emerald-500/10 border-emerald-600 shadow-md shadow-emerald-500/10 ring-1 ring-emerald-600/30" 
                              : "bg-emerald-950/25 border-emerald-500/70 shadow-lg shadow-emerald-950/30 ring-1 ring-emerald-500/30"
                            : isLight 
                              ? "bg-white border-[#ded9cb] hover:border-emerald-600/40 hover:bg-[#fcfbf9]" 
                              : "bg-[#0f121a]/60 border-slate-800/70 hover:border-slate-700 hover:bg-[#0f121a]"
                        }`}
                      >
                        {/* Top action row: About Hover Button + Checkbox */}
                        <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
                          {/* ABOUT HOVER BUTTON & TOOLTIP */}
                          <div
                            className="relative group/about"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              className={`p-1 rounded-md transition-colors flex items-center gap-1 cursor-help ${
                                isLight 
                                  ? "text-[#787366] hover:text-emerald-800 hover:bg-[#ebe8df]" 
                                  : "text-slate-400 hover:text-emerald-300 hover:bg-slate-800/90"
                              }`}
                              title={isES ? "Acerca de esta estrategia" : "About this strategy"}
                            >
                              <Info size={13} className={isLight ? "text-[#787366] group-hover/about:text-emerald-800" : "text-slate-400 group-hover/about:text-emerald-300"} />
                              <span className={`text-[10px] font-medium hidden sm:inline ${isLight ? "text-[#787366] group-hover/about:text-emerald-800" : "text-slate-400 group-hover/about:text-emerald-300"}`}>
                                {isES ? "Info" : "About"}
                              </span>
                            </button>

                            {/* Floating Tooltip */}
                            <div className={`absolute right-0 bottom-full mb-2 w-64 p-3 rounded-xl shadow-2xl text-xs z-50 pointer-events-none opacity-0 invisible group-hover/about:opacity-100 group-hover/about:visible transition-all duration-150 transform translate-y-1 group-hover/about:translate-y-0 ${
                              isLight 
                                ? "bg-white border border-[#ded9cb] text-[#3a3730] shadow-xl" 
                                : "bg-slate-900 border border-slate-700/90 text-slate-300 shadow-2xl shadow-black/90"
                            }`}>
                              <div className={`flex items-center gap-1.5 font-bold text-[11px] mb-1.5 ${isLight ? "text-emerald-800" : "text-emerald-400"}`}>
                                <Info size={12} />
                                <span>{isES ? strat.titleES : strat.titleEN}</span>
                              </div>
                              <p className={`text-[11px] leading-relaxed ${isLight ? "text-[#3a3730]" : "text-slate-300"}`}>
                                {isES ? strat.descES : strat.descEN}
                              </p>
                              <div className={`mt-2 pt-2 border-t text-[10px] ${isLight ? "border-[#ded9cb]" : "border-slate-800"}`}>
                                <span className={`font-semibold ${isLight ? "text-[#787366]" : "text-slate-400"}`}>{isES ? "Ejemplos: " : "Examples: "}</span>
                                <span className={`font-mono font-bold ${isLight ? "text-emerald-700" : "text-emerald-300"}`}>{strat.examples}</span>
                              </div>
                            </div>
                          </div>

                          {/* Checkbox indicator */}
                          <div
                            className={`w-5 h-5 rounded-md flex items-center justify-center transition-all ${
                              isSelected
                                ? isLight 
                                  ? "bg-emerald-600 text-white font-bold shadow-sm" 
                                  : "bg-emerald-500 text-slate-950 font-bold shadow-sm"
                                : isLight 
                                  ? "border border-[#ded9cb] bg-[#f7f5ef] group-hover:border-slate-400" 
                                  : "border border-slate-700 bg-slate-900/80 group-hover:border-slate-500"
                            }`}
                          >
                            {isSelected && <Check size={13} strokeWidth={3.5} />}
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center gap-2.5 pr-20">
                            <div className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                              isSelected 
                                ? isLight ? "bg-emerald-500/20 text-emerald-800" : "bg-emerald-500/20 text-emerald-300" 
                                : isLight ? "bg-[#ebe8df] text-[#787366] group-hover:text-[#1b1917]" : "bg-slate-900 text-slate-400 group-hover:text-white"
                            }`}>
                              <Icon size={16} />
                            </div>
                            <div className="min-w-0">
                              <span className={`text-xs font-bold block leading-tight truncate ${isLight ? "text-[#1b1917]" : "text-white"}`}>
                                {isES ? strat.titleES : strat.titleEN}
                              </span>
                              <span className={`text-[10px] font-mono font-medium ${isLight ? "text-emerald-700" : "text-emerald-400/90"}`}>
                                {isES ? strat.badgeES : strat.badge}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className={`pt-2 mt-2 border-t flex items-center justify-between text-[10px] ${
                          isLight ? "border-[#ded9cb]/60 text-[#787366]" : "border-slate-800/50 text-slate-400"
                        }`}>
                          <span className="font-medium">{isES ? "Universo:" : "Universe:"}</span>
                          <span className={`font-mono truncate max-w-[170px] sm:max-w-[210px] ${isLight ? "text-[#3a3730] font-medium" : "text-slate-300"}`}>{strat.examples}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 4. OPTIONAL CUSTOM INSTRUCTIONS */}
              <div className={`p-4 rounded-2xl border space-y-2 transition-colors ${
                isLight 
                  ? "bg-white border-[#ded9cb] shadow-sm" 
                  : "bg-[#0f121a]/80 border-slate-800/80"
              }`}>
                <label className={`text-xs font-bold uppercase tracking-wider flex items-center justify-between ${
                  isLight ? "text-[#3a3730]" : "text-slate-300"
                }`}>
                  <span>{isES ? "Instrucciones Adicionales (Opcional)" : "Custom Guidelines / Sector Focus (Optional)"}</span>
                  <span className={`text-[10px] lowercase font-normal ${isLight ? "text-[#787366]" : "text-slate-400"}`}>{isES ? "ej. Sobreponderar semiconductores o salud" : "e.g. Overweight tech or healthcare"}</span>
                </label>
                <input
                  type="text"
                  value={customNotes}
                  onChange={(e) => setCustomNotes(e.target.value)}
                  placeholder={isES ? "ej. Priorizar empresas con menor deuda y líderes en centros de datos..." : "e.g. Prioritize lower debt companies with high cloud/AI exposure..."}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-xs border transition-all focus:outline-none ${
                    isLight 
                      ? "bg-[#f7f5ef] border-[#ded9cb] text-[#1b1917] placeholder-[#787366]/70 focus:border-emerald-600" 
                      : "bg-slate-950/70 border-slate-800 text-white placeholder-slate-400 focus:border-emerald-500/60"
                  }`}
                />
              </div>
            </div>
          )}

          {/* STEP 2: GENERATING ANIMATION */}
          {step === "generating" && (
            <div className="py-16 flex flex-col items-center justify-center text-center space-y-6">
              <div className="relative">
                <div className={`w-20 h-20 rounded-full border-4 animate-spin flex items-center justify-center ${
                  isLight 
                    ? "border-emerald-500/20 border-t-emerald-600" 
                    : "border-emerald-500/20 border-t-emerald-400"
                }`} />
                <div className={`absolute inset-0 flex items-center justify-center ${isLight ? "text-emerald-700" : "text-emerald-400"}`}>
                  <Sparkles size={28} className="animate-pulse" />
                </div>
              </div>

              <div className="space-y-2 max-w-md">
                <h4 className={`text-base font-display font-bold uppercase tracking-wider ${isLight ? "text-[#1b1917]" : "text-white"}`}>
                  {isES ? "Generando Portafolio con Inteligencia Artificial" : "Synthesizing Institutional AI Portfolio"}
                </h4>
                <p className={`text-xs font-mono animate-pulse ${isLight ? "text-emerald-700 font-semibold" : "text-emerald-400/90"}`}>
                  {generatingStepText}
                </p>
                <p className={`text-[11px] pt-2 ${isLight ? "text-[#787366]" : "text-slate-400"}`}>
                  {isES
                    ? `Filtrando universo Large-Cap (> $20B) para asignación de $${amount.toLocaleString()} USD`
                    : `Filtering Large-Cap universe (> $20B) for $${amount.toLocaleString()} USD allocation`}
                </p>
              </div>
            </div>
          )}

          {/* STEP 3: PREVIEW & APPLY */}
          {step === "preview" && result && (
            <div className="space-y-6 animate-in fade-in duration-300">
              {/* TOP STRATEGY SUMMARY CARD */}
              <div className={`p-5 rounded-2xl border space-y-4 transition-colors ${
                isLight 
                  ? "bg-gradient-to-r from-emerald-500/10 via-white to-teal-500/10 border-emerald-600/30 shadow-sm" 
                  : "bg-gradient-to-r from-emerald-950/30 via-slate-900/60 to-teal-950/30 border-emerald-500/40"
              }`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider ${
                      isLight ? "bg-emerald-700 text-white" : "bg-emerald-500 text-slate-950"
                    }`}>
                      {result.strategyTitle}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                      isLight 
                        ? "bg-emerald-500/10 text-emerald-800 border-emerald-600/30" 
                        : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    }`}>
                      Large-Cap Universe (&gt; $20B)
                    </span>
                  </div>

                  <div className="text-right">
                    <span className={`text-[11px] block ${isLight ? "text-[#787366]" : "text-slate-400"}`}>
                      {isES ? "Capital Asignado / Objetivo" : "Allocated / Target Capital"}
                    </span>
                    <span className={`text-base font-mono font-bold ${isLight ? "text-[#1b1917]" : "text-white"}`}>
                      ${result.totalAllocatedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      <span className={`text-xs font-normal ml-1 ${isLight ? "text-[#787366]" : "text-slate-400"}`}>
                        / ${result.totalTargetAmount.toLocaleString()}
                      </span>
                    </span>
                  </div>
                </div>

                {/* Portfolio Name in Preview */}
                <div className={`p-3.5 rounded-xl border ${
                  isLight 
                    ? "bg-[#f7f5ef] border-[#ded9cb]" 
                    : "bg-slate-950/70 border-slate-800"
                }`}>
                  <label className={`text-[10px] font-bold uppercase tracking-wider block mb-1 ${
                    isLight ? "text-[#787366]" : "text-slate-400"
                  }`}>
                    {isES ? "Nombre del Portafolio a Guardar:" : "Portfolio Name to Save:"}
                  </label>
                  <input
                    type="text"
                    value={portfolioName}
                    onChange={(e) => setPortfolioName(e.target.value)}
                    className={`w-full rounded-lg px-3 py-1.5 text-xs font-bold border focus:outline-none ${
                      isLight 
                        ? "bg-white border-[#ded9cb] text-[#1b1917] focus:border-emerald-600" 
                        : "bg-slate-900 border-slate-700/80 text-white focus:border-emerald-500"
                    }`}
                  />
                </div>

                <p className={`text-xs leading-relaxed ${isLight ? "text-[#3a3730]" : "text-slate-300"}`}>
                  {result.aiRationale || result.strategyDescription}
                </p>

                {/* Quick stats ribbon */}
                <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 pt-3 border-t ${
                  isLight ? "border-[#ded9cb]" : "border-slate-800/80"
                }`}>
                  {/* GLOBAL SCORE CARD */}
                  <div className={`p-3 rounded-xl border col-span-2 sm:col-span-1 flex flex-col justify-between relative overflow-hidden ${
                    isLight 
                      ? "bg-gradient-to-br from-emerald-500/15 via-white to-white border-emerald-600/40 shadow-sm" 
                      : "bg-gradient-to-br from-emerald-950/40 via-slate-950/80 to-slate-950/90 border-emerald-500/50 shadow-md shadow-emerald-950/20"
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                        isLight ? "text-emerald-800" : "text-emerald-400"
                      }`}>
                        <Activity size={12} className={isLight ? "text-emerald-800" : "text-emerald-400"} />
                        {isES ? "Global Score" : "Global Score"}
                      </span>
                      {portfolioScore && (
                        <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${portfolioScore.badgeBg} ${portfolioScore.badgeText} border ${portfolioScore.badgeBorder}`}>
                          Score {portfolioScore.score}
                        </span>
                      )}
                    </div>
                    <div className="flex items-baseline gap-1.5 mt-1.5">
                      <span className={`text-xl font-mono font-black ${isLight ? "text-[#1b1917]" : "text-white"}`}>
                        {portfolioScore ? portfolioScore.score : 80}
                      </span>
                      <span className={`text-[10px] font-mono ${isLight ? "text-[#787366]" : "text-slate-400"}`}>/100</span>
                      <span className={`text-[10px] font-semibold truncate ml-auto ${isLight ? "text-emerald-800 font-bold" : "text-emerald-300"}`}>
                        {portfolioScore ? (isES ? portfolioScore.labelES : portfolioScore.labelEN) : ""}
                      </span>
                    </div>
                  </div>

                  <div className={`p-3 rounded-xl border flex flex-col justify-between ${
                    isLight 
                      ? "bg-white border-[#ded9cb] shadow-sm" 
                      : "bg-slate-950/60 border-slate-800/80"
                  }`}>
                    <span className={`text-[10px] font-medium block ${isLight ? "text-[#787366]" : "text-slate-400"}`}>{isES ? "Posiciones" : "Positions"}</span>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className={`text-base font-mono font-bold ${isLight ? "text-[#1b1917]" : "text-white"}`}>{result.holdings.length}</span>
                      <span className={`text-[10px] font-mono ${isLight ? "text-[#787366]" : "text-slate-400"}`}>Large-Caps</span>
                    </div>
                  </div>

                  <div className={`p-3 rounded-xl border flex flex-col justify-between ${
                    isLight 
                      ? "bg-white border-[#ded9cb] shadow-sm" 
                      : "bg-slate-950/60 border-slate-800/80"
                  }`}>
                    <span className={`text-[10px] font-medium block ${isLight ? "text-[#787366]" : "text-slate-400"}`}>{isES ? "P/E Ponderado" : "Weighted P/E"}</span>
                    <span className={`text-base font-mono font-bold mt-1 ${isLight ? "text-emerald-700" : "text-emerald-400"}`}>
                      {result.summaryMetrics?.weightedPe ? `${result.summaryMetrics.weightedPe.toFixed(1)}x` : "24.2x"}
                    </span>
                  </div>

                  <div className={`p-3 rounded-xl border flex flex-col justify-between ${
                    isLight 
                      ? "bg-white border-[#ded9cb] shadow-sm" 
                      : "bg-slate-950/60 border-slate-800/80"
                  }`}>
                    <span className={`text-[10px] font-medium block ${isLight ? "text-[#787366]" : "text-slate-400"}`}>{isES ? "Div. Yield Estimado" : "Est. Div Yield"}</span>
                    <span className={`text-base font-mono font-bold mt-1 ${isLight ? "text-teal-700" : "text-teal-400"}`}>
                      {result.summaryMetrics?.weightedDivYield ? `${result.summaryMetrics.weightedDivYield.toFixed(2)}%` : "1.65%"}
                    </span>
                  </div>

                  <div className={`p-3 rounded-xl border flex flex-col justify-between col-span-2 sm:col-span-1 ${
                    isLight 
                      ? "bg-white border-[#ded9cb] shadow-sm" 
                      : "bg-slate-950/60 border-slate-800/80"
                  }`}>
                    <span className={`text-[10px] font-medium block ${isLight ? "text-[#787366]" : "text-slate-400"}`}>{isES ? "Efectivo Libre (Cash)" : "Cash Buffer"}</span>
                    <span className={`text-base font-mono font-bold mt-1 ${isLight ? "text-[#3a3730]" : "text-slate-300"}`}>
                      ${result.cashRemaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* HOLDINGS BREAKDOWN TABLE */}
              <div className="space-y-2">
                <h4 className={`text-xs font-bold uppercase tracking-wider flex items-center justify-between ${
                  isLight ? "text-[#1b1917]" : "text-slate-300"
                }`}>
                  <span>{isES ? "Composición Detallada del Portafolio" : "Detailed Portfolio Allocation"}</span>
                  <span className={`text-[11px] font-mono ${isLight ? "text-[#787366]" : "text-slate-400"}`}>{result.holdings.length} {isES ? "activos" : "equities"}</span>
                </h4>

                <div className={`overflow-x-auto rounded-xl border no-scrollbar scrollbar-none ${
                  isLight 
                    ? "border-[#ded9cb] bg-white shadow-sm" 
                    : "border-slate-800/90 bg-[#0f121a]"
                }`}>
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className={`border-b text-[10px] font-mono font-bold uppercase ${
                        isLight 
                          ? "border-[#ded9cb] bg-[#ebe8df] text-[#3a3730]" 
                          : "border-slate-800 bg-slate-950/80 text-slate-400"
                      }`}>
                        <th className="py-2.5 px-3">{isES ? "Activo / Empresa" : "Asset / Company"}</th>
                        <th className="py-2.5 px-3 text-center">{isES ? "Score" : "Score"}</th>
                        <th className="py-2.5 px-3">{isES ? "Sector" : "Sector"}</th>
                        <th className="py-2.5 px-3">{isES ? "Market Cap" : "Market Cap"}</th>
                        <th className="py-2.5 px-3 text-right">{isES ? "Precio Actual" : "Live Price"}</th>
                        <th className="py-2.5 px-3 text-right">{isES ? "Acciones" : "Shares"}</th>
                        <th className="py-2.5 px-3 text-right">{isES ? "Valor Total" : "Total Value"}</th>
                        <th className="py-2.5 px-3 text-right">{isES ? "Peso" : "Weight"}</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isLight ? "divide-[#ded9cb]/60" : "divide-slate-800/60"}`}>
                      {result.holdings.map((h) => {
                        const sScore = getStockScore(h.ticker);
                        return (
                          <tr key={h.ticker} className={`transition-colors ${
                            isLight ? "hover:bg-[#fcfbf9]" : "hover:bg-slate-900/50"
                          }`}>
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-2">
                                <span className={`font-mono font-bold text-xs ${isLight ? "text-[#1b1917]" : "text-white"}`}>{h.ticker}</span>
                                <span className={`text-[11px] truncate max-w-[130px] sm:max-w-[180px] ${isLight ? "text-[#787366]" : "text-slate-400"}`}>
                                  {h.name}
                                </span>
                              </div>
                              {h.rationale && (
                                <p className={`text-[10px] mt-0.5 line-clamp-1 italic ${isLight ? "text-[#787366]" : "text-slate-400"}`}>
                                  {h.rationale}
                                </p>
                              )}
                            </td>
                            <td className="py-3 px-3 text-center">
                              <span className={`inline-flex items-center justify-center min-w-[36px] px-2 py-0.5 rounded text-[11px] font-mono font-bold ${sScore.badgeBg} ${sScore.badgeText} border ${sScore.badgeBorder}`}>
                                {sScore.score}
                              </span>
                            </td>
                            <td className={`py-3 px-3 text-[11px] ${isLight ? "text-[#787366]" : "text-slate-400"}`}>
                              {h.sector || "Large Cap"}
                            </td>
                            <td className="py-3 px-3">
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${
                                isLight 
                                  ? "bg-emerald-500/10 text-emerald-800 border-emerald-600/30" 
                                  : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                              }`}>
                                {h.marketCapFormatted || (h.marketCap ? `$${(h.marketCap / 1e9).toFixed(1)}B` : "> $20B")}
                              </span>
                            </td>
                            <td className={`py-3 px-3 text-right font-mono ${isLight ? "text-[#3a3730]" : "text-slate-300"}`}>
                              ${h.currentPrice.toFixed(2)}
                            </td>
                            <td className={`py-3 px-3 text-right font-mono font-bold ${isLight ? "text-[#1b1917]" : "text-white"}`}>
                              {h.shares.toLocaleString()}
                            </td>
                            <td className={`py-3 px-3 text-right font-mono font-bold ${isLight ? "text-emerald-700" : "text-emerald-400"}`}>
                              ${h.mktValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className={`py-3 px-3 text-right font-mono font-bold ${isLight ? "text-[#3a3730]" : "text-slate-300"}`}>
                              {h.weight.toFixed(1)}%
                            </td>
                          </tr>
                        );
                      })}

                      {/* Cash Row if remaining */}
                      {result.cashRemaining > 0 && (
                        <tr className={`${isLight ? "bg-[#ebe8df]/40 text-[#787366]" : "bg-slate-950/40 text-slate-400"}`}>
                          <td className={`py-2.5 px-3 font-mono font-bold ${isLight ? "text-[#1b1917]" : "text-slate-300"}`}>
                            CASH <span className={`text-[10px] font-normal ${isLight ? "text-[#787366]" : "text-slate-400"}`}>({isES ? "Efectivo" : "Cash Buffer"})</span>
                          </td>
                          <td className="py-2.5 px-3 text-center text-[10px] font-mono">-</td>
                          <td className="py-2.5 px-3 text-[11px]">{isES ? "Liquidez" : "Liquidity"}</td>
                          <td className="py-2.5 px-3 text-[10px] font-mono">-</td>
                          <td className="py-2.5 px-3 text-right font-mono">$1.00</td>
                          <td className="py-2.5 px-3 text-right font-mono">{result.cashRemaining.toFixed(2)}</td>
                          <td className={`py-2.5 px-3 text-right font-mono font-bold ${isLight ? "text-[#3a3730]" : "text-slate-300"}`}>
                            ${result.cashRemaining.toFixed(2)}
                          </td>
                          <td className={`py-2.5 px-3 text-right font-mono ${isLight ? "text-[#787366]" : "text-slate-400"}`}>
                            {((result.cashRemaining / result.totalTargetAmount) * 100).toFixed(1)}%
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* MODAL FOOTER ACTION BAR */}
        <div className={`px-5 sm:px-7 py-4 border-t flex flex-wrap items-center justify-between gap-3 shrink-0 transition-colors ${
          isLight 
            ? "border-[#ded9cb] bg-[#ebe8df]" 
            : "border-slate-800/80 bg-[#0c0f17]"
        }`}>
          {step === "config" && (
            <>
              <button
                type="button"
                onClick={onClose}
                className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  isLight 
                    ? "text-[#787366] hover:text-[#1b1917] hover:bg-slate-200/60" 
                    : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                }`}
              >
                {isES ? "Cancelar" : "Cancel"}
              </button>

              <button
                type="button"
                onClick={handleGenerate}
                className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer ${
                  isLight 
                    ? "bg-emerald-700 hover:bg-emerald-800 text-white shadow-lg shadow-emerald-700/20" 
                    : "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-lg shadow-emerald-500/20"
                }`}
              >
                <Sparkles size={15} className={isLight ? "fill-white text-white" : "fill-slate-950"} />
                <span>{isES ? "Generar Portafolio con IA" : "Generate Portfolio with AI"}</span>
                <ArrowRight size={14} />
              </button>
            </>
          )}

          {step === "generating" && (
            <div className="w-full flex justify-center py-1">
              <span className={`text-xs font-mono ${isLight ? "text-[#787366]" : "text-slate-400"}`}>
                {isES ? "Procesando con Gemini AI..." : "Processing with Gemini AI..."}
              </span>
            </div>
          )}

          {step === "preview" && (
            <>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStep("config")}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    isLight 
                      ? "text-[#787366] hover:text-[#1b1917] hover:bg-slate-200/60" 
                      : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                  }`}
                >
                  <Sliders size={13} />
                  <span>{isES ? "Ajustar Parámetros" : "Adjust Settings"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleGenerate}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 border ${
                    isLight 
                      ? "bg-white text-[#3a3730] border-[#ded9cb] hover:bg-[#fcfbf9] hover:text-[#1b1917]" 
                      : "bg-slate-900/80 text-slate-300 border-slate-800 hover:text-white hover:bg-slate-800"
                  }`}
                >
                  <RefreshCw size={13} />
                  <span>{isES ? "Regenerar" : "Regenerate"}</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    isLight 
                      ? "text-[#787366] hover:text-[#1b1917] hover:bg-slate-200/60" 
                      : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                  }`}
                >
                  {isES ? "Descartar" : "Discard"}
                </button>

                <button
                  type="button"
                  onClick={handleApply}
                  className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer ${
                    isLight 
                      ? "bg-emerald-700 hover:bg-emerald-800 text-white shadow-lg shadow-emerald-700/25" 
                      : "bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/25"
                  }`}
                >
                  <CheckCircle2 size={15} />
                  <span>{isES ? "Aplicar a Mi Portafolio" : "Apply to My Portfolio"}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
