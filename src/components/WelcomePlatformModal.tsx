import React, { useState } from "react";
import { 
  Sparkles, 
  TrendingUp, 
  ShieldCheck, 
  Compass, 
  ArrowRight, 
  Clock, 
  DollarSign,
  X
} from "lucide-react";

interface WelcomePlatformModalProps {
  isOpen: boolean;
  onContinue: () => void;
  onClose?: () => void;
  isManualOpen?: boolean;
  language: "EN" | "ES";
  onLanguageChange?: (lang: "EN" | "ES") => void;
}

interface AssetComparison {
  ticker: string;
  name: string;
  archetype: { es: string; en: string };
  finalValue: number;
  totalReturn: string;
  multiple: string;
  cagr: string;
  color: string;
  badgeBg: string;
  dotColor: string;
  lesson: { es: string; en: string };
}

const COMPOUNDING_COMPARISONS: AssetComparison[] = [
  {
    ticker: "KO",
    name: "Coca-Cola",
    archetype: { es: "Consumo Defensivo & Dividendos", en: "Defensive Dividend King" },
    finalValue: 460,
    totalReturn: "+360%",
    multiple: "4.6x",
    cagr: "6.5%",
    color: "text-rose-300",
    badgeBg: "bg-rose-500/20 text-rose-300",
    dotColor: "bg-rose-400",
    lesson: {
      es: "Foso de marca inquebrantable y 60+ años de dividendos crecientes.",
      en: "Enduring brand moat with 60+ years of uninterrupted rising dividends."
    }
  },
  {
    ticker: "SPY",
    name: "S&P 500",
    archetype: { es: "Índice Total Diversificado", en: "Total Market Index" },
    finalValue: 580,
    totalReturn: "+480%",
    multiple: "5.8x",
    cagr: "7.5%",
    color: "text-slate-200",
    badgeBg: "bg-slate-500/20 text-slate-300",
    dotColor: "bg-slate-400",
    lesson: {
      es: "Referencia pasiva: crecimiento corporativo sin riesgo de quiebra individual.",
      en: "Passive baseline: captures economic expansion without single-firm default risk."
    }
  },
  {
    ticker: "BRK.B",
    name: "Berkshire Hathaway",
    archetype: { es: "Value Compounder (Buffett)", en: "Buffett Conglomerate" },
    finalValue: 1420,
    totalReturn: "+1,320%",
    multiple: "14.2x",
    cagr: "11.5%",
    color: "text-amber-300",
    badgeBg: "bg-amber-500/20 text-amber-300",
    dotColor: "bg-amber-400",
    lesson: {
      es: "Reasignación disciplinada de flujos libres hacia negocios líderes.",
      en: "Disciplined free cash flow redeployment into cash-generative monopolies."
    }
  },
  {
    ticker: "MSFT",
    name: "Microsoft",
    archetype: { es: "Titán Tech & Cloud", en: "Tech & Cloud Titan" },
    finalValue: 1850,
    totalReturn: "+1,750%",
    multiple: "18.5x",
    cagr: "13.0%",
    color: "text-blue-300",
    badgeBg: "bg-blue-500/20 text-blue-300",
    dotColor: "bg-blue-400",
    lesson: {
      es: "Superó la burbuja dot-com reinvirtiendo en la nube (Azure) y recompras.",
      en: "Pivoted massive software cash flows into Azure cloud infrastructure."
    }
  },
  {
    ticker: "AMZN",
    name: "Amazon",
    archetype: { es: "Comercio & Cloud AWS", en: "E-Commerce & AWS Leader" },
    finalValue: 5800,
    totalReturn: "+5,700%",
    multiple: "58.0x",
    cagr: "18.5%",
    color: "text-orange-300",
    badgeBg: "bg-orange-500/20 text-orange-300",
    dotColor: "bg-orange-400",
    lesson: {
      es: "Reinversión agresiva del 100% de flujos para dominar logística y cloud.",
      en: "Aggressive 100% cash flow reinvestment to dominate logistics and AWS."
    }
  },
  {
    ticker: "AAPL",
    name: "Apple",
    archetype: { es: "Ecosistema & Recompras", en: "Ecosystem & Buybacks" },
    finalValue: 24800,
    totalReturn: "+24,700%",
    multiple: "248.0x",
    cagr: "25.5%",
    color: "text-emerald-400",
    badgeBg: "bg-emerald-500/20 text-emerald-300",
    dotColor: "bg-emerald-400",
    lesson: {
      es: "Poder de fijación de precios y el mayor plan de recompra de acciones.",
      en: "Consumer pricing power combined with massive share buybacks."
    }
  },
  {
    ticker: "MNST",
    name: "Monster Beverage",
    archetype: { es: "Consumo Ultra-Crecimiento", en: "Consumer Compounder" },
    finalValue: 80000,
    totalReturn: "+79,900%",
    multiple: "800.0x",
    cagr: "31.8%",
    color: "text-lime-300",
    badgeBg: "bg-lime-500/20 text-lime-300",
    dotColor: "bg-lime-400",
    lesson: {
      es: "Altísimo retorno sobre capital invertido (ROIC) y expansión global.",
      en: "Extraordinary ROIC in branded beverages with global distribution."
    }
  },
  {
    ticker: "NVDA",
    name: "Nvidia",
    archetype: { es: "Superciclo Chips & IA", en: "AI & GPU Supercycle" },
    finalValue: 135000,
    totalReturn: "+134,900%",
    multiple: "1,350.0x",
    cagr: "35.0%",
    color: "text-emerald-300",
    badgeBg: "bg-emerald-500/30 text-emerald-200",
    dotColor: "bg-emerald-300",
    lesson: {
      es: "Monopolio en computación acelerada (CUDA) capitalizando la revolución de IA.",
      en: "Accelerated computing monopoly (CUDA + GPUs) fueling the AI revolution."
    }
  }
];

export default function WelcomePlatformModal({
  isOpen,
  onContinue,
  onClose,
  isManualOpen = false,
  language,
  onLanguageChange,
}: WelcomePlatformModalProps) {
  const isES = language === "ES";
  const [showAllCards, setShowAllCards] = useState<boolean>(false);
  
  if (!isOpen) return null;

  const handleDismiss = () => {
    if (onClose) {
      onClose();
    } else {
      onContinue();
    }
  };

  const displayedCards = showAllCards 
    ? COMPOUNDING_COMPARISONS 
    : COMPOUNDING_COMPARISONS.filter(item => ["KO", "BRK.B", "MSFT", "AAPL"].includes(item.ticker));

  const renderLanguageToggle = () => {
    if (!onLanguageChange) return null;
    return (
      <div className="flex items-center bg-slate-950/90 border border-slate-800/90 rounded-lg p-0.5 font-mono text-[11px] shrink-0 shadow-inner">
        <button
          type="button"
          onClick={() => onLanguageChange("EN")}
          className={`px-2 py-0.5 rounded transition-all font-bold cursor-pointer ${
            language === "EN"
              ? "bg-emerald-500 text-slate-950 shadow-sm"
              : "text-slate-400 hover:text-slate-200"
          }`}
          title="Switch to English"
        >
          EN
        </button>
        <button
          type="button"
          onClick={() => onLanguageChange("ES")}
          className={`px-2 py-0.5 rounded transition-all font-bold cursor-pointer ${
            language === "ES"
              ? "bg-emerald-500 text-slate-950 shadow-sm"
              : "text-slate-400 hover:text-slate-200"
          }`}
          title="Cambiar a Español"
        >
          ES
        </button>
      </div>
    );
  };

  return (
    <div 
      id="welcome-platform-modal-overlay" 
      className="fixed inset-0 z-[9998] flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
    >
      {/* STEP 1: WELCOME & CORE PILLARS */}
      <div 
        id="welcome-platform-modal-card" 
        className="w-full max-w-2xl bg-[#0d111a] border border-slate-800/90 rounded-2xl shadow-2xl shadow-black/90 p-5 sm:p-7 text-slate-200 relative flex flex-col gap-5 max-h-[92vh] overflow-y-auto"
      >
        {/* TOP BAR / TOGGLE */}
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-mono font-semibold uppercase tracking-wider">
            <Sparkles size={11} />
            {isES ? "Bienvenido a Investiando" : "Welcome to Investiando"}
          </div>
          <div className="flex items-center gap-2">
            {renderLanguageToggle()}
            {isManualOpen && (
              <button
                type="button"
                onClick={handleDismiss}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title={isES ? "Cerrar" : "Close"}
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* HEADER */}
        <div className="flex items-start gap-4 -mt-1">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 shadow-lg shadow-emerald-950/40">
            <Compass size={24} className="stroke-[1.8]" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-white tracking-tight leading-snug">
              {isES 
                ? "¿Qué es esta plataforma y cómo aprovecharla?" 
                : "What is this platform and how to make the most of it?"}
            </h2>
            <p className="text-xs sm:text-[13px] text-slate-400 mt-1 leading-relaxed">
              {isES ? (
                <>
                  Tu <span className="text-emerald-400 font-semibold">laboratorio cuantitativo</span> para simular, entender valuaciones y proyectar retornos a largo plazo <strong className="text-slate-200 font-bold">antes de arriesgar dinero real</strong> en tu broker.
                </>
              ) : (
                <>
                  Your <span className="text-emerald-400 font-semibold">quantitative lab</span> to simulate, understand valuations, and project long-term compounding <strong className="text-slate-200 font-bold">before risking real capital</strong> at your broker.
                </>
              )}
            </p>
          </div>
        </div>

        {/* 3 CORE PILLARS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Pillar 1: Simulator */}
          <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800/80 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                <TrendingUp size={15} />
              </div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                {isES ? "Simular" : "Simulate"}
              </h3>
            </div>
            <p className="text-[11.5px] text-slate-300/90 leading-relaxed">
              {isES
                ? "Diseña portafolios y prueba tesis de inversión sin riesgo. Evalúa cómo interactúan tus activos antes de ejecutar órdenes en tu cuenta de corretaje."
                : "Build portfolios and stress-test investment theses risk-free. See how your assets compound together before placing real orders in your brokerage."}
            </p>
          </div>

          {/* Pillar 2: Fair Value */}
          <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800/80 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                <ShieldCheck size={15} />
              </div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                {isES ? "Modelos Fair Value" : "Fair Value Models"}
              </h3>
            </div>
            {isES ? (
              <div className="text-[11.5px] text-slate-300/90 leading-relaxed flex flex-col gap-1">
                <p>Estima el valor intrínseco para comprar con margen de seguridad:</p>
                <ul className="space-y-0.5 pl-0.5 text-[11px] text-slate-300">
                  <li className="flex items-start gap-1">
                    <span className="text-emerald-400 font-bold">•</span>
                    <span><strong>Modelo DCF:</strong> Descuento de FCF al WACC.</span>
                  </li>
                  <li className="flex items-start gap-1">
                    <span className="text-emerald-400 font-bold">•</span>
                    <span><strong>Modelo Bogle:</strong> Los 3 motores (Yield + EPS + P/E).</span>
                  </li>
                </ul>
              </div>
            ) : (
              <div className="text-[11.5px] text-slate-300/90 leading-relaxed flex flex-col gap-1">
                <p>Estimate intrinsic Fair Value to invest with an objective margin of safety:</p>
                <ul className="space-y-0.5 pl-0.5 text-[11px] text-slate-300">
                  <li className="flex items-start gap-1">
                    <span className="text-emerald-400 font-bold">•</span>
                    <span><strong>DCF Model:</strong> Multi-stage Discounted FCF at WACC.</span>
                  </li>
                  <li className="flex items-start gap-1">
                    <span className="text-emerald-400 font-bold">•</span>
                    <span><strong>Bogle Model:</strong> 3 Engines (Yield + EPS Growth + P/E).</span>
                  </li>
                </ul>
              </div>
            )}
          </div>

          {/* Pillar 3: Long Term & Patience */}
          <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800/80 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                <Clock size={15} />
              </div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                {isES ? "Disciplina y Tiempo" : "Patience & Compounding"}
              </h3>
            </div>
            <p className="text-[11.5px] text-slate-300/90 leading-relaxed">
              {isES ? (
                <>
                  El mercado premia a quien piensa en <span className="text-emerald-400 font-bold">años</span>, no en <span className="text-rose-400 font-bold">días</span>. <strong className="text-white font-bold">La clave no es predecir el corto plazo,</strong> <span className="text-emerald-400 font-semibold">sino dejar que el interés compuesto multiplique tu capital.</span>
                </>
              ) : (
                <>
                  Markets reward those who think in <span className="text-emerald-400 font-bold">years</span>, not <span className="text-rose-400 font-bold">days</span>. <strong className="text-white font-bold">The edge is not daily speculation,</strong> <span className="text-emerald-400 font-semibold">but letting compound earnings multiply your principal.</span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* SNEAK PEEK: THE POWER OF COMPOUNDING (100 USD in 2000 -> 24+ Years) */}
        <div className="flex flex-col gap-3.5 p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 shadow-inner">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 shadow-lg shadow-amber-950/40">
              <DollarSign size={20} className="stroke-[2]" />
            </div>
            <div>
              <h3 className="text-[13px] sm:text-sm font-black text-white tracking-tight leading-snug">
                {isES 
                  ? "Comparación del retorno de 100 USD en diferentes acciones (+20 años)" 
                  : "Comparison of return on 100 USD across different stocks (20+ years)"}
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
                {isES
                  ? "Crecimiento real de 100 USD invertidos en el año 2000 tras más de 24 años de retención ininterrumpida."
                  : "Real wealth compounding of 100 USD invested in year 2000 across 24+ years of uninterrupted holding."}
              </p>
            </div>
          </div>

          {/* VIEW: CARDS */}
          <div className="flex flex-col gap-2.5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {displayedCards.map((asset) => (
                <div 
                  key={asset.ticker} 
                  className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition-colors"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className={`text-[11px] font-mono font-bold ${asset.color}`}>
                        {asset.name}
                      </span>
                      <span className={`w-2 h-2 rounded-full ${asset.dotColor}`}></span>
                    </div>
                    <div className="flex items-baseline gap-1 mt-1.5">
                      <span className="text-sm sm:text-base font-mono font-black text-white whitespace-nowrap">
                        ~${asset.finalValue.toLocaleString()}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">USD</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] font-mono text-emerald-400 font-bold whitespace-nowrap">
                        {asset.totalReturn} ({asset.multiple})
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => setShowAllCards(!showAllCards)}
                className="text-[11px] font-mono text-emerald-400 hover:text-emerald-300 font-semibold cursor-pointer underline underline-offset-2 flex items-center gap-1"
              >
                <span>
                  {showAllCards 
                    ? (isES ? "Ver menos acciones" : "Show fewer stocks")
                    : (isES ? "Ver más acciones (NVDA, AMZN, MNST, SPY...)" : "Show more stocks (NVDA, AMZN, MNST, SPY...)")
                  }
                </span>
              </button>
              <span className="text-[10px] font-mono text-slate-400">
                {isES ? "Base: $100 invertidos en 2000" : "Base: $100 invested in 2000"}
              </span>
            </div>
          </div>
        </div>

        {/* CTA BUTTON */}
        <button
          id="welcome-platform-continue-btn"
          type="button"
          onClick={handleDismiss}
          className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-mono font-black text-sm text-center shadow-lg shadow-emerald-950/60 transition-all hover:scale-[1.005] active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2 mt-0.5"
        >
          <span>
            {isManualOpen
              ? (isES ? "Entendido, Cerrar Guía" : "Understood, Close Guide")
              : (isES ? "Entendido, Continuar al Aviso Legal" : "Understood, Continue to Disclaimer")}
          </span>
          <ArrowRight size={16} className="stroke-[2.5]" />
        </button>
      </div>
    </div>
  );
}
