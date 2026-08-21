import React, { useState, useRef, useEffect } from "react";
import { ChatMessage, PortfolioData } from "../types";
import { Send, Sparkles, BrainCircuit, Bot, User, HelpCircle, Loader2 } from "lucide-react";

interface AskAIAnalystProps {
  portfolio: PortfolioData;
}

const PRESET_QUESTIONS = [
  "¿Cómo evaluarías la diversificación general de mi portafolio?",
  "¿Cuáles son las acciones con mayor y menor múltiplo de valuación y qué riesgos representan?",
  "Si el mercado entra en corrección bajista, ¿cuál es mi activo más riesgoso y por qué?",
  "¿Consideras adecuado mi saldo de efectivo (Cash) actual de acuerdo al valor total?",
];

export default function AskAIAnalyst({ portfolio }: AskAIAnalystProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState<string>("");
  const [sending, setSending] = useState<boolean>(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, sending]);

  // Welcome message when conversation starts
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: "welcome",
          role: "model",
          content: `¡Hola! Soy tu **Analista de Inversiones de Inteligencia Artificial** 🤖📈. 

He cargado todos los datos en tiempo real de tu cartera (valores de mercado, ponderaciones, múltiplos de Yahoo Finance, retornos, efectivo, etc.). 

Puedo ayudarte a:
- Evaluar la **diversificación y balance** de tus activos.
- Analizar tus ratios de valuación (**P/E, PEG**) comparativos.
- Darte **opiniones de mercado** basadas en análisis fundamental.
- Simular estrategias de cobertura o sugerir redistribuciones.

¿De qué te gustaría hablar hoy? Selecciona una de las preguntas frecuentes abajo o escribe tu propia consulta.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }
      ]);
    }
  }, []);

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || sending) return;

    const userMsg: ChatMessage = {
      id: Math.random().toString(),
      role: "user",
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    try {
      // Map history to simple format the backend expects
      const historyPayload = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: textToSend,
          history: historyPayload,
          portfolio: portfolio,
        }),
      });

      const data = await response.json();

      const aiMsg: ChatMessage = {
        id: Math.random().toString(),
        role: "model",
        content: data.text || "Lo siento, hubo un problema al procesar tu solicitud.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      console.error("AI chat error:", err);
      const errorMsg: ChatMessage = {
        id: Math.random().toString(),
        role: "model",
        content: "❌ Lo siento, no pude conectarme con el motor analítico de Gemini. Por favor, verifica tu conexión y vuelve a intentarlo.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setSending(false);
    }
  };

  // Render basic markdown (bold, bullet points, headers, tables) in an elegant react wrapper
  const renderMessageContent = (text: string) => {
    // Very lightweight formatter for standard markdown conventions
    const lines = text.split("\n");
    return lines.map((line, lineIndex) => {
      // Bullet list
      if (line.trim().startsWith("- ")) {
        return (
          <li key={lineIndex} className="ml-4 list-disc pl-1 my-1 text-slate-300">
            {formatInlineBoldAndCode(line.trim().substring(2))}
          </li>
        );
      }
      
      // Ordered list
      const numListMatch = line.trim().match(/^(\d+)\.\s(.*)/);
      if (numListMatch) {
        return (
          <li key={lineIndex} className="ml-5 list-decimal pl-1 my-1 text-slate-300">
            {formatInlineBoldAndCode(numListMatch[2])}
          </li>
        );
      }

      // Headers (### or ##)
      if (line.trim().startsWith("### ")) {
        return (
          <h4 key={lineIndex} className="text-sm font-display font-bold text-white uppercase tracking-wider mt-4 mb-2">
            {line.trim().substring(4)}
          </h4>
        );
      }
      if (line.trim().startsWith("## ") || line.trim().startsWith("# ")) {
        return (
          <h3 key={lineIndex} className="text-base font-display font-bold text-emerald-400 uppercase tracking-wide mt-5 mb-2.5 border-b border-slate-800 pb-1">
            {line.trim().replace(/^#+\s/, "")}
          </h3>
        );
      }
 
      // Default paragraph
      if (line.trim() === "") return <div key={lineIndex} className="h-2" />;
      return (
        <p key={lineIndex} className="my-1.5 leading-relaxed text-slate-200">
          {formatInlineBoldAndCode(line)}
        </p>
      );
    });
  };
 
  const formatInlineBoldAndCode = (text: string) => {
    // Split by ** for bold
    const parts = text.split("**");
    return parts.map((part, i) => {
      if (i % 2 === 1) {
        return <strong key={i} className="text-white font-bold">{part}</strong>;
      }
      // Check for inline code `
      const codeParts = part.split("`");
      return codeParts.map((subPart, j) => {
        if (j % 2 === 1) {
          return <code key={j} className="bg-slate-800 px-1.5 py-0.5 rounded text-xs font-mono text-emerald-400">{subPart}</code>;
        }
        return subPart;
      });
    });
  };
 
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 h-[680px] flex flex-col justify-between shadow-2xl relative overflow-hidden" id="ask-ai-section">
      
      {/* HEADER */}
      <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
        <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl">
          <BrainCircuit size={20} className="pulse-subtle" />
        </div>
        <div>
          <h3 className="text-base font-display font-bold text-white tracking-wider flex items-center gap-1.5 uppercase">
            Analista de Portafolio IA
            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-md font-semibold font-mono">Gemini 3.5</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Haz consultas directas o solicita recomendaciones estratégicas para tu cartera de inversión.
          </p>
        </div>
      </div>
 
      {/* CHAT BUBBLES SCROLL AREA */}
      <div className="flex-1 overflow-y-auto py-5 px-1 space-y-4 my-2 scroll-smooth">
        {messages.map((msg) => {
          const isAI = msg.role === "model";
          return (
            <div key={msg.id} className={`flex gap-3 max-w-[85%] ${isAI ? "mr-auto" : "ml-auto flex-row-reverse"}`}>
              {/* Avatar */}
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                isAI ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-slate-800 text-slate-200"
              }`}>
                {isAI ? <Bot size={16} /> : <User size={16} />}
              </div>
 
              {/* Message body */}
              <div className={`p-4 rounded-2xl text-sm leading-relaxed ${
                isAI 
                  ? "bg-slate-950/60 text-slate-200 rounded-tl-none border border-slate-800" 
                  : "bg-emerald-600 text-white rounded-tr-none shadow-lg"
              }`}>
                <div className="space-y-1">
                  {isAI ? renderMessageContent(msg.content) : <p className="font-medium">{msg.content}</p>}
                </div>
                <span className={`text-[9px] block mt-2 font-semibold ${isAI ? "text-slate-500 text-left" : "text-emerald-200 text-right"}`}>
                  {msg.timestamp}
                </span>
              </div>
            </div>
          );
        })}
 
        {sending && (
          <div className="flex gap-3 max-w-[80%] mr-auto">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
              <Bot size={16} />
            </div>
            <div className="bg-slate-950/60 text-slate-400 p-4 rounded-2xl rounded-tl-none border border-slate-800 text-sm flex items-center gap-2">
              <Loader2 className="animate-spin text-emerald-500" size={16} />
              <span className="italic">AI está analizando tu cartera fundamentalmente...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
 
      {/* QUICK PRESET CONTROLS (only show if messages list is short or no pending request) */}
      {!sending && messages.length <= 2 && (
        <div className="mb-4">
          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-2 flex items-center gap-1">
            <HelpCircle size={12} /> Sugerencias de Consulta
          </span>
          <div className="flex flex-wrap gap-2">
            {PRESET_QUESTIONS.map((q, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(q)}
                className="text-xs text-left bg-slate-800 hover:bg-slate-700 border border-slate-800 hover:border-emerald-500 text-slate-300 py-2 px-3.5 rounded-xl transition-all cursor-pointer"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
 
      {/* FOOTER INPUT BOX */}
      <div className="border-t border-slate-800 pt-4 flex gap-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSendMessage(input);
          }}
          disabled={sending}
          placeholder="Pregúntale a la IA algo como: '¿Qué opinas del PEG de META?' o '¿Cómo redistribuirías mi portafolio?'..."
          className="flex-1 bg-slate-950 border border-slate-800 focus:border-emerald-500 outline-none text-sm text-white px-4 py-3 rounded-xl transition-all"
        />
        <button
          onClick={() => handleSendMessage(input)}
          disabled={sending || !input.trim()}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white p-3 rounded-xl transition-all flex items-center justify-center cursor-pointer shadow-lg hover:shadow-emerald-500/10"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
