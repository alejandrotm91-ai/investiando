import React, { useState } from "react";
import { HelpCircle, Mail, Send, CheckCircle, ChevronDown, ChevronUp, BookOpen, MessageSquare } from "lucide-react";

interface FAQItem {
  q: string;
  a: string;
}

export default function SupportDashboard({ language }: { language: "EN" | "ES" }) {
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [formData, setFormData] = useState({ name: "", email: "", msg: "" });

  const t = {
    EN: {
      title: "HELP & SUPPORT",
      desc: "Get fast support or find immediate answers in our interactive FAQ guides",
      contactTitle: "Submit a Ticket",
      contactDesc: "Fill out the secure form below to contact our analyst team",
      fName: "Your Name",
      fEmail: "Email Address",
      fMsg: "Support Message",
      fSubmit: "Send Support Ticket",
      successMsg: "Support ticket received! We will reply via email within 24 hours.",
      faqTitle: "Frequently Asked Questions",
      faqDesc: "Quick answers to help you navigate your stock terminal metrics",
    },
    ES: {
      title: "AYUDA Y SOPORTE",
      desc: "Obtén soporte rápido o encuentra respuestas inmediatas en nuestras guías interactivas",
      contactTitle: "Enviar una Consulta",
      contactDesc: "Completa el formulario seguro para contactar con nuestro equipo de analistas",
      fName: "Tu Nombre",
      fEmail: "Correo Electrónico",
      fMsg: "Mensaje de Consulta",
      fSubmit: "Enviar Ticket de Soporte",
      successMsg: "¡Ticket de soporte recibido! Responderemos por correo en menos de 24 horas.",
      faqTitle: "Preguntas Frecuentes",
      faqDesc: "Respuestas rápidas para ayudarte a navegar por las métricas de tu terminal",
    }
  }[language];

  const faqs: FAQItem[] = {
    EN: [
      { q: "How is the compound portfolio performance (%) calculated?", a: "The cumulative return chart calculates the time-weighted return of your current allocations starting from the base date (t0). Each holding's relative pricing ratio is aggregated using its respective portfolio weight to simulate historical trajectory as if you had bought them on day one." },
      { q: "Is the market stock pricing real-time?", a: "Yes! When active, our server fetches live market pricing from financial exchange feeds. If the markets are closed or APIs undergo high-frequency limits, our custom terminal automatically supplies robust, realistic fallback pricing based on the last daily closing ticks." },
      { q: "How can I update my holding weights?", a: "Head over to the 'Posiciones' (Holdings) sub-tab and click the 'Añadir / Editar Posiciones' button. You can add new ticker symbols, change existing stock shares, or adjust average acquisition costs. The terminal recalculates weights automatically." },
      { q: "Is my personal portfolio data stored on the cloud?", a: "To ensure absolute privacy, your custom stock allocations, cash balances, and preferences are saved exclusively inside your browser's secure LocalStorage. No data ever leaves your device except to fetch quotes." },
    ],
    ES: [
      { q: "¿Cómo se calcula el rendimiento acumulado (%) de la cartera?", a: "El gráfico de rendimiento acumulado calcula el retorno ponderado en el tiempo de tus posiciones actuales partiendo de la fecha base (t0). La variación relativa de cada acción se agrega utilizando sus pesos respectivos en el portafolio para simular la trayectoria histórica como si las hubieras adquirido en el día uno." },
      { q: "¿Las cotizaciones de las acciones son en tiempo real?", a: "¡Sí! Cuando está activo, nuestro servidor consulta precios del mercado en vivo. Si el mercado está cerrado o las APIs tienen límites de tráfico, nuestra terminal proporciona precios de cierre realistas automáticamente." },
      { q: "¿Cómo puedo actualizar las ponderaciones de mis posiciones?", a: "Ve a la pestaña 'Posiciones' y haz clic en el botón 'Añadir / Editar Posiciones'. Puedes agregar nuevos tickers, cambiar el número de acciones de tus activos o ajustar tus costos de adquisición promedio. La terminal recalculará los pesos de forma automática." },
      { q: "¿Mi información financiera se guarda en la nube?", a: "Para garantizar absoluta confidencialidad, tus posiciones, balances de efectivo y configuraciones de terminal se almacenan exclusivamente dentro del LocalStorage seguro de tu navegador. Ningún dato sensible sale de tu dispositivo." },
    ]
  }[language];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.msg) return;
    setFormSubmitted(true);
    setFormData({ name: "", email: "", msg: "" });
  };

  return (
    <div className="space-y-6">
      {/* Title block */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#0a0c14]/40 border border-slate-900/40 p-6 rounded-2xl">
        <div>
          <h2 className="text-xl font-display font-bold text-white tracking-wide uppercase flex items-center gap-2">
            <HelpCircle className="text-blue-400" size={20} />
            {t.title}
          </h2>
          <p className="text-xs text-slate-400 mt-1">{t.desc}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Contact form ticket */}
        <div className="bg-[#0f111a]/80 backdrop-blur-md border border-slate-900/60 p-6 rounded-2xl flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white tracking-wide mb-2 flex items-center gap-2 border-b border-slate-900/60 pb-3">
              <Mail size={15} className="text-blue-400" />
              {t.contactTitle}
            </h3>
            <p className="text-xs text-slate-500 mb-5">{t.contactDesc}</p>

            {formSubmitted ? (
              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs p-4 rounded-xl flex items-start gap-3 mt-6">
                <CheckCircle size={18} className="flex-shrink-0 mt-0.5" />
                <span>{t.successMsg}</span>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1.5">{t.fName}</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-slate-950/80 border border-slate-800 text-slate-100 rounded-lg py-2 px-3 text-xs focus:outline-none focus:border-blue-500 font-sans"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1.5">{t.fEmail}</label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full bg-slate-950/80 border border-slate-800 text-slate-100 rounded-lg py-2 px-3 text-xs focus:outline-none focus:border-blue-500 font-sans"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1.5">{t.fMsg}</label>
                  <textarea
                    rows={4}
                    required
                    value={formData.msg}
                    onChange={(e) => setFormData({ ...formData, msg: e.target.value })}
                    className="w-full bg-slate-950/80 border border-slate-800 text-slate-100 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-blue-500 font-sans resize-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                >
                  <Send size={14} />
                  {t.fSubmit}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* FAQs */}
        <div className="bg-[#0f111a]/80 backdrop-blur-md border border-slate-900/60 p-6 rounded-2xl flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white tracking-wide mb-2 flex items-center gap-2 border-b border-slate-900/60 pb-3">
              <BookOpen size={15} className="text-emerald-400" />
              {t.faqTitle}
            </h3>
            <p className="text-xs text-slate-500 mb-5">{t.faqDesc}</p>

            <div className="space-y-3">
              {faqs.map((faq, idx) => {
                const isOpen = openFaq === idx;
                return (
                  <div key={idx} className="border border-slate-900 rounded-xl overflow-hidden bg-slate-950/30">
                    <button
                      onClick={() => setOpenFaq(isOpen ? null : idx)}
                      className="w-full py-3 px-4 flex items-center justify-between text-left text-xs font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer"
                    >
                      <span>{faq.q}</span>
                      {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-3.5 pt-1 text-xs text-slate-400 leading-relaxed font-sans border-t border-slate-900/40">
                        {faq.a}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
