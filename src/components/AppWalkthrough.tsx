import React, { useState, useEffect, useCallback, useRef } from "react";
import { 
  X, 
  ArrowRight, 
  ArrowLeft, 
  Briefcase, 
  TrendingUp, 
  Sparkles, 
  Compass, 
  Search, 
  Check,
  Award,
  FileText
} from "lucide-react";

export type HoldingsLensKey = "basis" | "valuation" | "health" | "financials";

export interface WalkthroughStep {
  id: string;
  targetSelector: string;
  title: {
    EN: string;
    ES: string;
  };
  description: {
    EN: string;
    ES: string;
  };
  badge: {
    EN: string;
    ES: string;
  };
  icon: React.ElementType;
  lensMode?: HoldingsLensKey;
}

export const WALKTHROUGH_STEPS: WalkthroughStep[] = [
  {
    id: "market-stats",
    targetSelector: "#market-header-card",
    title: {
      EN: "General Market Statistics",
      ES: "Estadísticas del Mercado General",
    },
    description: {
      EN: "Monitor major market indices (S&P 500, Nasdaq, Dow Jones), open/close status, and sector trends in real time.",
      ES: "Monitorea los índices principales (S&P 500, Nasdaq, Dow Jones), apertura de Wall Street y rotación de sectores en tiempo real.",
    },
    badge: {
      EN: "1. Market",
      ES: "1. Mercado",
    },
    icon: TrendingUp,
  },
  {
    id: "portfolio-creation",
    targetSelector: "#add-portfolio-btn, #portfolio-management-bar",
    title: {
      EN: "Portfolio Creation",
      ES: "Creación de Portafolios",
    },
    description: {
      EN: "Create and manage your portfolios: build AI-optimized allocations with fundamental criteria or enter your stocks manually.",
      ES: "Crea y gestiona tus portafolios: genera asignaciones inteligentes con IA o ingresa tus acciones y costos manualmente.",
    },
    badge: {
      EN: "2. Portfolios",
      ES: "2. Portafolios",
    },
    icon: Briefcase,
  },
  {
    id: "holdings-basis",
    targetSelector: "#holdings-tab-basis",
    title: {
      EN: "Basis Tab",
      ES: "Pestaña: Basis",
    },
    description: {
      EN: "Live quotes, share counts, average buy price (Cost Basis), current market value, unrealized P&L ($/%), and portfolio weight.",
      ES: "Cotización en tiempo real, precio medio de compra (Cost Basis), valor de mercado, P&L no realizado ($/%) y ponderación.",
    },
    badge: {
      EN: "3. Basis",
      ES: "3. Basis",
    },
    icon: Briefcase,
    lensMode: "basis",
  },
  {
    id: "holdings-valuation",
    targetSelector: "#holdings-tab-valuation",
    title: {
      EN: "Valuation Tab",
      ES: "Pestaña: Valuación",
    },
    description: {
      EN: "Key valuation multiples (P/E, Forward P/E, PEG, EV/EBITDA, P/B) and intrinsic Fair Value calculated via 10-year DCF.",
      ES: "Múltiplos clave (P/E, Forward P/E, PEG, EV/EBITDA, P/B) y Valor Intrínseco por Descuento de Flujos (DCF) a 10 años.",
    },
    badge: {
      EN: "4. Valuation",
      ES: "4. Valuación",
    },
    icon: Sparkles,
    lensMode: "valuation",
  },
  {
    id: "holdings-health",
    targetSelector: "#holdings-tab-health",
    title: {
      EN: "Health & Factors Tab",
      ES: "Pestaña: Salud y Factores",
    },
    description: {
      EN: "Factor analytics across growth, quality, stability, and valuation metrics for each stock to determine and establish its asset type.",
      ES: "Analítica de métricas de crecimiento, calidad, estabilidad y valuación de cada acción para establecer el tipo (Type) de acción.",
    },
    badge: {
      EN: "5. Health",
      ES: "5. Salud",
    },
    icon: Award,
    lensMode: "health",
  },
  {
    id: "holdings-financials",
    targetSelector: "#holdings-tab-financials",
    title: {
      EN: "Financials Tab",
      ES: "Pestaña: Financieros",
    },
    description: {
      EN: "Audited historical statements: revenue history, CAGR growth, net income, profit margin, OCF, and real Free Cash Flow.",
      ES: "Estados contables auditados: historial de ingresos, CAGR de crecimiento, margen neto, flujo operativo (OCF) y Free Cash Flow.",
    },
    badge: {
      EN: "6. Financials",
      ES: "6. Financieros",
    },
    icon: FileText,
    lensMode: "financials",
  },
  {
    id: "superinvestors-tab",
    targetSelector: "#superinvestors-header-banner",
    title: {
      EN: "Superinvestor Portfolios",
      ES: "Portafolios de Superinversores",
    },
    description: {
      EN: "Explore audited SEC 13F portfolios from elite allocators like Warren Buffett, Bill Gates, and Seth Klarman.",
      ES: "Explora las carteras reales auditadas (reportes 13F) de Warren Buffett, Bill Gates, Seth Klarman y otros gestores de élite.",
    },
    badge: {
      EN: "7. Superinvestors",
      ES: "7. Superinversores",
    },
    icon: Compass,
  },
  {
    id: "stock-research",
    targetSelector: "#stock-search-input-field, #stock-explorer-container",
    title: {
      EN: "Stock Research & DCF Engine",
      ES: "Buscador y Análisis de Acciones",
    },
    description: {
      EN: "Search any public stock to audit financial statements, Bogle compounder metrics, and calculate intrinsic DCF value.",
      ES: "Analiza cualquier ticker global: estados contables, métricas Bogle y cálculo de valor intrínseco con la calculadora DCF.",
    },
    badge: {
      EN: "8. Research",
      ES: "8. Análisis",
    },
    icon: Search,
  },
];

interface AppWalkthroughProps {
  isOpen: boolean;
  onClose: () => void;
  language: "EN" | "ES";
  theme?: "dark" | "light";
  onStepChange?: (stepIndex: number) => void;
  currentHoldingsMode?: HoldingsLensKey;
  onHoldingsModeChange?: (mode: HoldingsLensKey) => void;
}

export default function AppWalkthrough({
  isOpen,
  onClose,
  language,
  theme = "dark",
  onStepChange,
  currentHoldingsMode,
  onHoldingsModeChange,
}: AppWalkthroughProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ top: number; left: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const step = WALKTHROUGH_STEPS[currentStepIndex];
  const totalSteps = WALKTHROUGH_STEPS.length;
  const isHoldingsTabStep = Boolean(step?.lensMode);

  // Sync step change to parent view router
  useEffect(() => {
    if (isOpen && onStepChange) {
      onStepChange(currentStepIndex);
    }
  }, [currentStepIndex, isOpen, onStepChange]);

  // Sync lens mode to parent if on a holdings step
  useEffect(() => {
    if (isOpen && step?.lensMode && onHoldingsModeChange) {
      onHoldingsModeChange(step.lensMode);
    }
  }, [isOpen, step, onHoldingsModeChange]);

  // Helper to resolve target element
  const getTargetElement = useCallback((targetStep: WalkthroughStep): HTMLElement | null => {
    const selectors = targetStep.targetSelector.split(",").map((s) => s.trim());
    for (const selector of selectors) {
      const el = document.querySelector(selector) as HTMLElement | null;
      if (el && el.offsetParent !== null) {
        return el;
      }
    }
    return null;
  }, []);

  // Update target element positioning & rect (ONLY measurements, NEVER scrolls)
  const updateTargetPosition = useCallback(() => {
    if (!isOpen || !step) return;

    const targetElement = getTargetElement(step);
    const popoverWidth = Math.min(380, window.innerWidth - 32);
    const popoverHeight = 165;

    if (targetElement) {
      const rect = targetElement.getBoundingClientRect();
      setTargetRect(rect);

      // ALWAYS position the popup BELOW the target element
      let top = rect.bottom + 14;
      let left = Math.max(
        16,
        Math.min(
          rect.left + (rect.width / 2) - (popoverWidth / 2),
          window.innerWidth - popoverWidth - 16
        )
      );

      // Safeguard against overflowing below the viewport bottom
      if (top + popoverHeight > window.innerHeight - 12) {
        const header = document.querySelector("header");
        const headerBottom = header ? header.getBoundingClientRect().bottom : 56;
        if (rect.top - headerBottom > popoverHeight + 20) {
          top = rect.top - popoverHeight - 12;
        } else {
          top = Math.max(headerBottom + 12, window.innerHeight - popoverHeight - 12);
        }
      }

      setPopoverPosition({ top, left });
    } else {
      // Centered fallback if element not found or hidden
      setTargetRect(null);
      setPopoverPosition({
        top: Math.max(70, (window.innerHeight - popoverHeight) / 2),
        left: Math.max(16, (window.innerWidth - popoverWidth) / 2),
      });
    }
  }, [isOpen, step, getTargetElement]);

  // Safe one-time scrolling logic for current step
  const scrollToTargetSafe = useCallback((targetEl: HTMLElement, stepId: string) => {
    const container = document.getElementById("main-content-scroll-container") ||
                      (document.querySelector(".overflow-y-auto") as HTMLElement | null);

    const header = document.querySelector("header");
    const headerBottom = header ? header.getBoundingClientRect().bottom : 56;

    // Header banners and initial top sections: always reset scroll container to 0
    if (
      stepId === "market-stats" ||
      stepId === "superinvestors-tab" ||
      stepId === "portfolio-creation"
    ) {
      if (container) {
        container.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      return;
    }

    // For other elements (e.g. tabs or search input):
    const rect = targetEl.getBoundingClientRect();
    // If element is already nicely visible in the safe viewport area
    if (rect.top >= headerBottom + 16 && rect.bottom <= window.innerHeight - 150) {
      return;
    }

    // Scroll smoothly so the element is placed comfortably below the sticky header
    if (container) {
      const targetY = container.scrollTop + (rect.top - headerBottom - 24);
      container.scrollTo({ top: Math.max(0, targetY), behavior: "smooth" });
    } else {
      const targetY = window.scrollY + (rect.top - headerBottom - 24);
      window.scrollTo({ top: Math.max(0, targetY), behavior: "smooth" });
    }
  }, []);

  // Step transition lifecycle: find element, trigger one-time scroll, and track position
  useEffect(() => {
    if (!isOpen || !step) return;

    let hasScrolled = false;
    let attempts = 0;
    const maxAttempts = 16; // 16 * 50ms = 800ms window

    const interval = setInterval(() => {
      attempts++;
      const el = getTargetElement(step);
      if (el) {
        if (!hasScrolled) {
          hasScrolled = true;
          scrollToTargetSafe(el, step.id);
        }
        updateTargetPosition();
      }

      if (attempts >= maxAttempts) {
        clearInterval(interval);
      }
    }, 50);

    // Also update on window resize or user scrolling (read-only, never causes scroll loops)
    const handleResize = () => updateTargetPosition();
    const handleScroll = () => updateTargetPosition();

    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      clearInterval(interval);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [isOpen, currentStepIndex, step, getTargetElement, scrollToTargetSafe, updateTargetPosition]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleFinish();
      } else if (e.key === "ArrowRight") {
        handleNext();
      } else if (e.key === "ArrowLeft") {
        handlePrev();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, currentStepIndex]);

  if (!isOpen) return null;

  const handleNext = () => {
    if (currentStepIndex < totalSteps - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    } else {
      handleFinish();
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  const handleFinish = () => {
    localStorage.setItem("investiando_walkthrough_completed", "true");
    onClose();
  };

  const isLight = theme === "light";
  const StepIcon = step.icon;

  return (
    <div id="investiando-walkthrough-overlay" className="fixed inset-0 z-[9999] pointer-events-auto select-none">
      {/* 1. Backdrop spotlight cut-out */}
      {targetRect ? (
        <div
          className={`absolute transition-all duration-300 pointer-events-none ${
            isHoldingsTabStep
              ? "rounded-full border-2 border-emerald-400 ring-4 ring-emerald-500/25 shadow-[0_0_0_9999px_rgba(4,6,12,0.30),0_0_20px_rgba(52,211,153,0.5)] animate-pulse"
              : "rounded-2xl border-2 border-emerald-400/80 shadow-[0_0_0_9999px_rgba(4,6,12,0.70)] animate-pulse"
          }`}
          style={{
            top: `${Math.max(isHoldingsTabStep ? 0 : 58, targetRect.top - (isHoldingsTabStep ? 3 : 6))}px`,
            left: `${Math.max(0, targetRect.left - (isHoldingsTabStep ? 3 : 6))}px`,
            width: `${targetRect.width + (isHoldingsTabStep ? 6 : 12)}px`,
            height: `${targetRect.height + (isHoldingsTabStep ? 6 : 12)}px`,
          }}
        />
      ) : (
        <div className={`absolute inset-0 transition-opacity duration-300 ${
          isHoldingsTabStep ? "bg-slate-950/25" : "bg-slate-950/70 backdrop-blur-[2px]"
        }`} />
      )}

      {/* 2. Floating Step Card — Compact, positioned cleanly BELOW the tab/target */}
      <div
        ref={popoverRef}
        className={`fixed z-[10000] w-[calc(100vw-32px)] sm:w-[380px] rounded-2xl p-4 sm:p-4.5 transition-all duration-300 shadow-2xl ${
          isLight
            ? "bg-white/98 border border-[#ded9cb] shadow-slate-900/20 text-[#1b1917]"
            : "bg-[#0c0f18]/98 border border-slate-800/90 shadow-emerald-950/40 text-white backdrop-blur-xl"
        }`}
        style={
          popoverPosition
            ? {
                top: `${popoverPosition.top}px`,
                left: `${popoverPosition.left}px`,
              }
            : {
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
              }
        }
      >
        {/* Header: Badge + Step Indicator + Close Button */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg flex items-center justify-center shrink-0 ${
              isLight ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
            }`}>
              <StepIcon size={15} />
            </div>
            <span className={`text-[10px] font-mono font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
              isLight ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
            }`}>
              {step.badge[language]}
            </span>
          </div>

          <button
            onClick={handleFinish}
            className={`p-1 rounded-lg transition-colors cursor-pointer shrink-0 ${
              isLight ? "text-slate-400 hover:text-slate-700 hover:bg-black/5" : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
            title={language === "EN" ? "Exit Tour" : "Salir del Tour"}
            aria-label="Close walkthrough"
          >
            <X size={15} />
          </button>
        </div>

        {/* Title */}
        <h3 className="text-sm font-display font-black tracking-tight mb-1 text-emerald-600 dark:text-emerald-400">
          {step.title[language]}
        </h3>

        {/* Concise Description */}
        <p className={`text-xs leading-relaxed mb-3.5 ${
          isLight ? "text-slate-600" : "text-slate-300"
        }`}>
          {step.description[language]}
        </p>

        {/* Footer: Step dots + Counter + Navigation Buttons */}
        <div className="flex items-center justify-between pt-2.5 border-t border-slate-800/40 gap-2">
          {/* Step Indicator */}
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1">
              {WALKTHROUGH_STEPS.map((s, idx) => (
                <button
                  key={s.id}
                  onClick={() => setCurrentStepIndex(idx)}
                  className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                    idx === currentStepIndex
                      ? "w-3.5 bg-emerald-500"
                      : idx < currentStepIndex
                      ? isLight ? "w-1.5 bg-slate-300" : "w-1.5 bg-slate-700"
                      : isLight ? "w-1.5 bg-slate-200" : "w-1.5 bg-slate-800"
                  }`}
                  aria-label={`Go to step ${idx + 1}`}
                />
              ))}
            </div>
            <span className={`text-[10px] font-mono font-bold ${isLight ? "text-slate-400" : "text-slate-500"}`}>
              {currentStepIndex + 1}/{totalSteps}
            </span>
          </div>

          {/* Navigation Buttons */}
          <div className="flex items-center gap-1.5">
            {currentStepIndex > 0 && (
              <button
                onClick={handlePrev}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 ${
                  isLight
                    ? "text-slate-600 hover:text-slate-900 hover:bg-black/5 border border-slate-200"
                    : "text-slate-300 hover:text-white hover:bg-white/5 border border-slate-800"
                }`}
              >
                <ArrowLeft size={12} />
                <span>{language === "EN" ? "Prev" : "Anterior"}</span>
              </button>
            )}

            <button
              onClick={handleNext}
              className="px-3 py-1 rounded-lg text-xs font-black bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 shadow-md shadow-emerald-500/20 transition-all duration-200 cursor-pointer flex items-center gap-1"
            >
              <span>
                {currentStepIndex === totalSteps - 1
                  ? language === "EN" ? "Finish" : "Finalizar"
                  : language === "EN" ? "Next" : "Siguiente"}
              </span>
              {currentStepIndex === totalSteps - 1 ? (
                <Check size={12} className="stroke-[3]" />
              ) : (
                <ArrowRight size={12} className="stroke-[3]" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
