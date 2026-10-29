import React from "react";
import { Shield, AlertTriangle } from "lucide-react";

interface EducationalDisclaimerModalProps {
  isOpen: boolean;
  onAccept: () => void;
  language: "EN" | "ES";
  onLanguageChange?: (lang: "EN" | "ES") => void;
}

export default function EducationalDisclaimerModal({
  isOpen,
  onAccept,
  language,
  onLanguageChange,
}: EducationalDisclaimerModalProps) {
  if (!isOpen) return null;
  const isES = language === "ES";

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
      id="educational-disclaimer-modal-overlay" 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div 
        id="educational-disclaimer-modal-card" 
        className="w-full max-w-xl bg-[#0f121d] border border-slate-800/90 rounded-2xl shadow-2xl shadow-black/80 p-6 sm:p-7 text-slate-200 relative flex flex-col gap-5 max-h-[92vh] overflow-y-auto"
      >
        {/* HEADER */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-slate-850 border border-slate-750 flex items-center justify-center text-slate-300 shrink-0 shadow-inner">
              <Shield size={22} className="stroke-[1.75]" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white tracking-tight leading-snug">
                {isES 
                  ? "Aviso de Responsabilidad y Fines Educativos" 
                  : "Disclaimer & Educational Purpose"}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5 font-medium">
                {isES ? "Por favor lee antes de continuar" : "Please read before continuing"}
              </p>
            </div>
          </div>
          {renderLanguageToggle()}
        </div>

        {/* DIVIDER */}
        <div className="h-px w-full bg-slate-800/80 -my-1" />

        {/* DISCLAIMER POINTS */}
        <div className="space-y-4 text-xs sm:text-[13px] leading-relaxed text-slate-300/95 font-sans">
          {/* Point 1 */}
          <div className="flex items-start gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0 mt-2" />
            <p className="text-justify">
              <strong className="text-white font-bold">
                {isES ? "Propósito Educativo." : "Educational Purpose."}
              </strong>{" "}
              {isES
                ? "Esta aplicación es exclusivamente una herramienta de simulación con fines educativos y de entretenimiento. Ninguna de las funciones, datos o resultados presentados constituye una asesoría financiera, recomendación de inversión o invitación a comprar o vender activos reales."
                : "This application is exclusively a simulation tool for educational and entertainment purposes. None of the features, data, or results presented constitute financial advice, investment recommendations, or an invitation to buy or sell real financial assets."}
            </p>
          </div>

          {/* Point 2 */}
          <div className="flex items-start gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0 mt-2" />
            <p className="text-justify">
              <strong className="text-white font-bold">
                {isES ? "Sin Garantías de Rendimiento." : "No Performance Guarantees."}
              </strong>{" "}
              {isES
                ? "Las simulaciones se basan en datos históricos o algoritmos proyectados. Los rendimientos pasados no garantizan resultados futuros. El éxito obtenido dentro de esta plataforma no asegura un desempeño similar en el mercado de valores real."
                : "Simulations are based on historical data and projected algorithms. Past performance does not guarantee future results. Success obtained within this platform does not ensure similar performance in the real financial markets."}
            </p>
          </div>

          {/* Point 3 */}
          <div className="flex items-start gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0 mt-2" />
            <p className="text-justify">
              <strong className="text-white font-bold">
                {isES ? "Riesgo de Capital." : "Capital Risk."}
              </strong>{" "}
              {isES
                ? "Invertir en la bolsa de valores conlleva riesgos significativos, incluyendo la pérdida total del capital invertido. El usuario reconoce que cualquier decisión financiera tomada fuera de esta app es de su exclusiva responsabilidad."
                : "Investing in the stock market involves significant risks, including the total loss of invested capital. The user acknowledges that any financial decision made outside this app is solely their own responsibility."}
            </p>
          </div>

          {/* Point 4 */}
          <div className="flex items-start gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0 mt-2" />
            <p className="text-justify">
              <strong className="text-white font-bold">
                {isES ? "Uso bajo su propio riesgo." : "Use at your own risk."}
              </strong>{" "}
              {isES
                ? "Investiando.app no se hace responsable por pérdidas económicas derivadas del uso de la información aquí contenida. Te recomendamos consultar siempre con un asesor financiero certificado antes de realizar inversiones reales."
                : "Investiando.app is not responsible for financial losses derived from the use of the information contained herein. We recommend always consulting with a certified financial advisor before making real investments."}
            </p>
          </div>
        </div>

        {/* BOTTOM WARNING NOTICE */}
        <div className="pt-2 border-t border-slate-800/80">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <AlertTriangle size={15} className="shrink-0 text-amber-400" />
            <span>
              {isES
                ? "Al continuar, aceptas que entiendes el carácter simulado y educativo de esta plataforma."
                : "By continuing, you accept and understand the simulated and educational nature of this platform."}
            </span>
          </div>
        </div>

        {/* ACCEPT BUTTON */}
        <button
          id="accept-educational-disclaimer-btn"
          type="button"
          onClick={onAccept}
          className="w-full py-3.5 px-6 rounded-xl bg-slate-100 hover:bg-white text-slate-950 font-mono font-bold text-sm text-center shadow-lg shadow-black/40 transition-all hover:scale-[1.005] active:scale-[0.99] cursor-pointer mt-1"
        >
          {isES ? "Entendido, Continuar a la Terminal" : "I Understand, Continue"}
        </button>
      </div>
    </div>
  );
}
