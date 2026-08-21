import React, { useState } from "react";
import { User, Shield, Key, Bell, Database, Check, ToggleLeft, ToggleRight, Mail, Server, Send, RefreshCw, Eye, EyeOff, CheckCircle2, AlertTriangle, Users, Megaphone, Sparkles } from "lucide-react";

export default function AccountSettings({ language, user }: { language: "EN" | "ES"; user: { id: string; name: string; email: string } }) {
  const [currency, setCurrency] = useState("USD");
  const [timeframe, setTimeframe] = useState("1M");
  const [saved, setSaved] = useState(false);
  
  // Toggles for mockup parameters
  const [apiQuotes, setApiQuotes] = useState(true);
  const [notifSound, setNotifSound] = useState(false);

  // SMTP Config state
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [smtpLoading, setSmtpLoading] = useState(false);
  const [smtpSaved, setSmtpSaved] = useState(false);
  const [smtpError, setSmtpError] = useState<string | null>(null);
  const [smtpSuccess, setSmtpSuccess] = useState<string | null>(null);

  // SMTP Test state
  const [testRecipient, setTestRecipient] = useState("");
  const [testLoading, setTestLoading] = useState(false);
  const [testSuccess, setTestSuccess] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  // Admin Broadcast / Registered Users state
  const [registeredUsers, setRegisteredUsers] = useState<any[]>([]);
  const [broadcastRecipient, setBroadcastRecipient] = useState("ALL");
  const [broadcastSubject, setBroadcastSubject] = useState("");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [broadcastSuccess, setBroadcastSuccess] = useState<string | null>(null);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);

  // Fetch SMTP config & registered users on mount
  React.useEffect(() => {
    const fetchSmtpConfig = async () => {
      try {
        const res = await fetch("/api/smtp/config");
        if (res.ok) {
          const data = await res.json();
          setSmtpHost(data.host || "");
          setSmtpPort(data.port || "587");
          setSmtpSecure(!!data.secure);
          setSmtpUser(data.user || "");
          setSmtpPass(data.pass || "");
          setSmtpFrom(data.from || "");
        }
      } catch (err) {
        console.error("Failed to load SMTP config", err);
      }
    };

    const fetchUsers = async () => {
      try {
        const res = await fetch("/api/admin/users");
        if (res.ok) {
          const data = await res.json();
          setRegisteredUsers(data || []);
        }
      } catch (err) {
        console.error("Failed to fetch registered users", err);
      }
    };

    fetchSmtpConfig();
    fetchUsers();
  }, []);

  const handleApplyGmailPreset = () => {
    setSmtpHost("smtp.gmail.com");
    setSmtpPort("465");
    setSmtpSecure(true);
    setSmtpUser("alejandrotm91@gmail.com");
    setSmtpFrom('"investiando.ai" <alejandrotm91@gmail.com>');
    setSmtpSuccess(language === "ES" ? "Configuración de Gmail cargada. Ingresa tu Contraseña de Aplicación de 16 caracteres y guarda." : "Gmail settings applied. Enter your 16-character App Password and save.");
  };

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastSubject.trim() || !broadcastMessage.trim()) {
      setBroadcastError(language === "ES" ? "Por favor escribe el asunto y el mensaje" : "Please enter subject and message");
      return;
    }

    setBroadcastLoading(true);
    setBroadcastSuccess(null);
    setBroadcastError(null);

    try {
      const res = await fetch("/api/admin/broadcast-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientEmail: broadcastRecipient,
          subject: broadcastSubject,
          message: broadcastMessage,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Error al enviar comunicados");
      }

      setBroadcastSuccess(
        language === "ES" 
          ? `¡Correo enviado exitosamente a ${data.sentCount} destinatarios!` 
          : `Email sent successfully to ${data.sentCount} recipients!`
      );
      setBroadcastSubject("");
      setBroadcastMessage("");
    } catch (err: any) {
      setBroadcastError(err.message || "Error al enviar los correos");
    } finally {
      setBroadcastLoading(false);
    }
  };

  const handleSaveSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSmtpLoading(true);
    setSmtpError(null);
    setSmtpSuccess(null);

    try {
      const res = await fetch("/api/smtp/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: smtpHost,
          port: smtpPort,
          secure: smtpSecure,
          user: smtpUser,
          pass: smtpPass,
          from: smtpFrom,
        }),
      });

      if (!res.ok) {
        throw new Error(language === "ES" ? "No se pudo guardar la configuración" : "Failed to save configuration");
      }

      setSmtpSaved(true);
      setSmtpSuccess(language === "ES" ? "¡Configuración SMTP guardada correctamente!" : "SMTP configuration saved successfully!");
      setTimeout(() => setSmtpSaved(false), 3000);
    } catch (err: any) {
      setSmtpError(err.message || "Error");
    } finally {
      setSmtpLoading(false);
    }
  };

  const handleTestSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testRecipient) {
      setTestError(language === "ES" ? "Por favor ingresa un correo de destino" : "Please enter a recipient email");
      return;
    }

    setTestLoading(true);
    setTestSuccess(null);
    setTestError(null);

    try {
      const res = await fetch("/api/smtp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: smtpHost,
          port: smtpPort,
          secure: smtpSecure,
          user: smtpUser,
          pass: smtpPass,
          from: smtpFrom,
          testEmail: testRecipient,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || (language === "ES" ? "Error al enviar el correo de prueba" : "Failed to send test email"));
      }

      setTestSuccess(language === "ES" ? `¡Correo de prueba enviado con éxito a ${testRecipient}!` : `Test email sent successfully to ${testRecipient}!`);
    } catch (err: any) {
      setTestError(err.message || "Error");
    } finally {
      setTestLoading(false);
    }
  };

  const t = {
    EN: {
      title: "MY ACCOUNT PROFILE",
      desc: "Manage your trading terminal preferences, credentials and data structures",
      subProfile: "Terminal Settings",
      subPreferences: "Account Info",
      lblCurrency: "Base Currency",
      lblTimeframe: "Default Timeframe",
      lblSave: "Save Preferences",
      lblSaved: "Preferences updated!",
      pEmail: "Account Email",
      pTier: "Account Level",
      pTierVal: "PRO Terminal User",
      pJoined: "Member Since",
      pJoinedVal: "January 2024",
      lblApi: "Live Yahoo Finance Feed",
      lblSound: "Interactive Audio Alerts",
      descApi: "Fetch live ticker closing ticks directly from external servers",
      descSound: "Play ambient sound notes on positive/negative earnings updates"
    },
    ES: {
      title: "PERFIL DE MI CUENTA",
      desc: "Administra las preferencias, credenciales y estructuras de datos de tu terminal de trading",
      subProfile: "Ajustes de la Terminal",
      subPreferences: "Información de la Cuenta",
      lblCurrency: "Moneda de Referencia",
      lblTimeframe: "Temporalidad por Defecto",
      lblSave: "Guardar Preferencias",
      lblSaved: "¡Preferencias actualizadas!",
      pEmail: "Correo de Cuenta",
      pTier: "Nivel de Cuenta",
      pTierVal: "Usuario Terminal PRO",
      pJoined: "Miembro Desde",
      pJoinedVal: "Enero de 2024",
      lblApi: "Feed en vivo Yahoo Finance",
      lblSound: "Alertas de Sonido Interactivas",
      descApi: "Obtener cotizaciones de cierre en tiempo real de servidores externos",
      descSound: "Reproducir tonos ambientales ante actualizaciones de mercado"
    }
  }[language];

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Title block */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#0a0c14]/40 border border-slate-900/40 p-6 rounded-2xl">
        <div>
          <h2 className="text-xl font-display font-bold text-white tracking-wide uppercase flex items-center gap-2">
            <User className="text-blue-400" size={20} />
            {t.title}
          </h2>
          <p className="text-xs text-slate-400 mt-1">{t.desc}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Terminal Preferences */}
        <div className="bg-[#0f111a]/80 backdrop-blur-md border border-slate-900/60 p-6 rounded-2xl flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white tracking-wide mb-2 flex items-center gap-2 border-b border-slate-900/60 pb-3">
              <Database size={15} className="text-blue-400" />
              {t.subProfile}
            </h3>

            <div className="space-y-4 mt-4">
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1.5">{t.lblCurrency}</label>
                <div className="flex gap-2">
                  {["USD", "EUR", "MXN"].map((c) => (
                    <button
                      key={c}
                      onClick={() => setCurrency(c)}
                      className={`px-4 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                        currency === c
                          ? "bg-blue-500 text-slate-950 border-blue-400"
                          : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1.5">{t.lblTimeframe}</label>
                <div className="flex gap-2">
                  {["1W", "1M", "3M", "1Y", "10Y"].map((tf) => (
                    <button
                      key={tf}
                      onClick={() => setTimeframe(tf)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                        timeframe === tf
                          ? "bg-emerald-500 text-slate-950 border-emerald-400"
                          : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggles */}
              <div className="space-y-4 border-t border-slate-900/60 pt-4 mt-2">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <span className="text-xs font-semibold text-slate-300 block">{t.lblApi}</span>
                    <span className="text-[10px] text-slate-500 block leading-tight mt-0.5">{t.descApi}</span>
                  </div>
                  <button 
                    onClick={() => setApiQuotes(!apiQuotes)}
                    className="text-slate-400 hover:text-white cursor-pointer transition-all"
                  >
                    {apiQuotes ? <ToggleRight className="text-emerald-500" size={28} /> : <ToggleLeft className="text-slate-600" size={28} />}
                  </button>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <span className="text-xs font-semibold text-slate-300 block">{t.lblSound}</span>
                    <span className="text-[10px] text-slate-500 block leading-tight mt-0.5">{t.descSound}</span>
                  </div>
                  <button 
                    onClick={() => setNotifSound(!notifSound)}
                    className="text-slate-400 hover:text-white cursor-pointer transition-all"
                  >
                    {notifSound ? <ToggleRight className="text-emerald-500" size={28} /> : <ToggleLeft className="text-slate-600" size={28} />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saved}
            className="w-full mt-6 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:bg-emerald-500 disabled:text-slate-950 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all"
          >
            {saved ? <Check size={14} /> : null}
            {saved ? t.lblSaved : t.lblSave}
          </button>
        </div>

        {/* Profile Card */}
        <div className="bg-[#0f111a]/80 backdrop-blur-md border border-slate-900/60 p-6 rounded-2xl flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white tracking-wide mb-2 flex items-center gap-2 border-b border-slate-900/60 pb-3">
              <Shield size={15} className="text-emerald-400" />
              {t.subPreferences}
            </h3>

            <div className="space-y-4 mt-4 font-sans text-xs">
              <div className="flex justify-between items-center bg-slate-950/40 p-3 rounded-xl border border-slate-900">
                <span className="text-slate-500 font-semibold uppercase text-[10px]">{t.pEmail}</span>
                <span className="font-mono text-slate-200 font-medium">{user.email}</span>
              </div>

              <div className="flex justify-between items-center bg-slate-950/40 p-3 rounded-xl border border-slate-900">
                <span className="text-slate-500 font-semibold uppercase text-[10px]">{t.pTier}</span>
                <span className="font-semibold text-emerald-400 tracking-wide uppercase text-[10px] bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                  {t.pTierVal}
                </span>
              </div>

              <div className="flex justify-between items-center bg-slate-950/40 p-3 rounded-xl border border-slate-900">
                <span className="text-slate-500 font-semibold uppercase text-[10px]">{t.pJoined}</span>
                <span className="text-slate-300 font-medium">{t.pJoinedVal}</span>
              </div>

              <div className="flex justify-between items-center bg-slate-950/40 p-3 rounded-xl border border-slate-900">
                <span className="text-slate-500 font-semibold uppercase text-[10px]">API Security Key</span>
                <span className="font-mono text-slate-500 tracking-wider">••••••••••••••••3E4E</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 text-[10px] font-mono text-slate-500 bg-slate-950/40 p-3 rounded-xl border border-slate-900 mt-6 justify-center">
            <Key size={12} className="text-slate-600" />
            <span>Secure TLS Encryption v1.3 Standard</span>
          </div>
        </div>
      </div>

      {/* Real SMTP Configuration & Testing Block */}
      <div className="bg-[#0f111a]/80 backdrop-blur-md border border-slate-900/60 p-6 rounded-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-900/60 pb-4 mb-6">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
              <Mail className="text-blue-400" size={18} />
            </div>
            <div>
              <h3 className="font-display font-bold text-sm text-white tracking-wide uppercase">
                {language === "ES" ? "Servidor de Correo Real (SMTP)" : "Real Mail Server (SMTP)"}
              </h3>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {language === "ES" 
                  ? "Configura tus credenciales SMTP para enviar correos de verificación y comunicados a bandejas de entrada reales." 
                  : "Configure your SMTP credentials to send verification emails and broadcasts to real inboxes."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleApplyGmailPreset}
              className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Sparkles size={12} className="text-blue-400" />
              {language === "ES" ? "Cargar Gmail (alejandrotm91@gmail.com)" : "Load Gmail Preset"}
            </button>
            <span className="text-[10px] font-mono font-semibold px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 flex items-center gap-1.5">
              <Server size={11} className="text-emerald-500" />
              TLS / SSL Supported
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* SMTP Form fields */}
          <form onSubmit={handleSaveSmtp} className="lg:col-span-7 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1.5">
                  {language === "ES" ? "Servidor SMTP (Host)" : "SMTP Server (Host)"}
                </label>
                <input
                  type="text"
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  placeholder="e.g. smtp.gmail.com o smtp.resend.com"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500/50 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-slate-600 focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1.5">
                  {language === "ES" ? "Puerto" : "Port"}
                </label>
                <input
                  type="text"
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(e.target.value)}
                  placeholder="587 o 465"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500/50 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-slate-600 focus:outline-none transition-colors"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1.5">
                  {language === "ES" ? "Usuario / Correo" : "Username / Email"}
                </label>
                <input
                  type="text"
                  value={smtpUser}
                  onChange={(e) => setSmtpUser(e.target.value)}
                  placeholder="usuario@dominio.com"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500/50 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-slate-600 focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1.5">
                  {language === "ES" ? "Contraseña de Aplicación de Gmail" : "Gmail App Password"}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={smtpPass}
                    onChange={(e) => setSmtpPass(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500/50 rounded-xl pl-3 pr-10 py-2 text-xs font-mono text-white placeholder-slate-600 focus:outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1.5">
                {language === "ES" ? "Remitente Personalizado (From)" : "Custom Sender (From)"}
              </label>
              <input
                type="text"
                value={smtpFrom}
                onChange={(e) => setSmtpFrom(e.target.value)}
                placeholder='"investiando.ai" <mi_correo@dominio.com>'
                className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500/50 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-slate-600 focus:outline-none transition-colors"
              />
              <span className="text-[9px] text-slate-500 mt-1 block">
                {language === "ES" 
                  ? "Formato opcional: \"Nombre\" <correo@ejemplo.com>. Si se deja vacío, se usará el usuario SMTP." 
                  : "Optional format: \"Name\" <email@example.com>. If empty, SMTP Username will be used."}
              </span>
            </div>

            <div className="flex items-center gap-3 py-1.5">
              <button
                type="button"
                onClick={() => setSmtpSecure(!smtpSecure)}
                className="text-slate-400 hover:text-white cursor-pointer transition-all flex items-center gap-2"
              >
                {smtpSecure ? <ToggleRight className="text-emerald-500" size={28} /> : <ToggleLeft className="text-slate-600" size={28} />}
                <span className="text-xs font-semibold text-slate-300">
                  {language === "ES" ? "Usar conexión segura (SSL - Puerto 465)" : "Use secure connection (SSL - Port 465)"}
                </span>
              </button>
            </div>

            {smtpError && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium">
                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                <span>{smtpError}</span>
              </div>
            )}

            {smtpSuccess && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
                <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" />
                <span>{smtpSuccess}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={smtpLoading}
              className="px-5 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:bg-emerald-500 disabled:text-slate-950 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-2 cursor-pointer transition-all"
            >
              {smtpLoading ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
              {smtpSaved 
                ? (language === "ES" ? "¡Credenciales Guardadas!" : "Credentials Saved!") 
                : (language === "ES" ? "Guardar Servidor SMTP" : "Save SMTP Server")}
            </button>
          </form>

          {/* Test module */}
          <div className="lg:col-span-5 bg-slate-950/40 p-5 rounded-2xl border border-slate-900 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2 font-mono">
                {language === "ES" ? "Probar Enlace en Vivo" : "Test Live Connection"}
              </span>
              <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                {language === "ES"
                  ? "Envía un correo de prueba estructurado desde tu servidor SMTP para verificar que la bandeja de entrada reciba los códigos de seguridad reales."
                  : "Send a structured test email from your SMTP server to verify that the inbox receives actual security codes."}
              </p>

              <form onSubmit={handleTestSmtp} className="space-y-4">
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1.5">
                    {language === "ES" ? "Bandeja de Destino (Para)" : "Destination Inbox (To)"}
                  </label>
                  <input
                    type="email"
                    value={testRecipient}
                    onChange={(e) => setTestRecipient(e.target.value)}
                    placeholder="ejemplo@correo.com"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500/50 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-slate-600 focus:outline-none transition-colors"
                  />
                </div>

                {testError && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium">
                    <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                    <span>{testError}</span>
                  </div>
                )}

                {testSuccess && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
                    <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" />
                    <span>{testSuccess}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={testLoading}
                  className="w-full py-2.5 bg-slate-900 hover:bg-slate-850 text-slate-200 border border-slate-800 hover:border-slate-700 font-bold rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                >
                  {testLoading ? <RefreshCw size={14} className="animate-spin text-blue-400" /> : <Send size={13} />}
                  {testLoading 
                    ? (language === "ES" ? "Enviando Correo..." : "Sending Email...") 
                    : (language === "ES" ? "Enviar Correo de Prueba" : "Send Test Email")}
                </button>
              </form>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-900/40 text-[10px] text-slate-500 leading-relaxed font-mono">
              <span className="text-amber-500 font-semibold block mb-1">💡 Pasos sencillos para Gmail (alejandrotm91@gmail.com):</span>
              1. Ve a <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="text-blue-400 underline">myaccount.google.com/apppasswords</a>.<br />
              2. Crea una "Contraseña de Aplicación" llamada <b>investiando</b> y copia la clave de 16 letras.<br />
              3. Pegala en el campo "Contraseña de Aplicación" y haz clic en <b>Guardar Servidor SMTP</b>. ¡Listo!
            </div>
          </div>
        </div>
      </div>

      {/* Admin Broadcast Communicator Section */}
      <div className="bg-[#0f111a]/80 backdrop-blur-md border border-slate-900/60 p-6 rounded-2xl mt-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-900/60 pb-4 mb-6">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
              <Megaphone className="text-emerald-400" size={18} />
            </div>
            <div>
              <h3 className="font-display font-bold text-sm text-white tracking-wide uppercase">
                {language === "ES" ? "Enviar Correos a Usuarios Registrados" : "Broadcast Emails to Registered Users"}
              </h3>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {language === "ES" 
                  ? "Envía comunicados, noticias o alertas directamente a las cuentas registradas desde tu correo." 
                  : "Send announcements, news or alerts directly to registered user accounts from your email."}
              </p>
            </div>
          </div>

          <span className="text-[10px] font-mono font-semibold px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-1.5 self-start sm:self-auto">
            <Users size={12} />
            {registeredUsers.length} {language === "ES" ? "Usuarios Registrados" : "Registered Users"}
          </span>
        </div>

        <form onSubmit={handleSendBroadcast} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
            <div className="sm:col-span-4">
              <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1.5">
                {language === "ES" ? "Destinatario(s)" : "Recipient(s)"}
              </label>
              <select
                value={broadcastRecipient}
                onChange={(e) => setBroadcastRecipient(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500/50 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none transition-colors"
              >
                <option value="ALL">
                  📢 {language === "ES" ? `Todos los usuarios (${registeredUsers.length})` : `All Users (${registeredUsers.length})`}
                </option>
                {registeredUsers.map((u) => (
                  <option key={u.id} value={u.email}>
                    👤 {u.name} ({u.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-8">
              <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1.5">
                {language === "ES" ? "Asunto del Correo" : "Email Subject"}
              </label>
              <input
                type="text"
                value={broadcastSubject}
                onChange={(e) => setBroadcastSubject(e.target.value)}
                placeholder={language === "ES" ? "Ej: Actualización de Portafolio e Indicadores en investiando.ai" : "Ex: Portfolio & Indicators Update on investiando.ai"}
                className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500/50 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1.5">
              {language === "ES" ? "Mensaje del Comunicado" : "Broadcast Message"}
            </label>
            <textarea
              rows={4}
              value={broadcastMessage}
              onChange={(e) => setBroadcastMessage(e.target.value)}
              placeholder={language === "ES" ? "Escribe aquí el contenido que deseas enviar a los usuarios..." : "Write the announcement message to send to users..."}
              className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500/50 rounded-xl p-3 text-xs text-white placeholder-slate-600 focus:outline-none transition-colors"
            />
          </div>

          {broadcastError && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
              <span>{broadcastError}</span>
            </div>
          )}

          {broadcastSuccess && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
              <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" />
              <span>{broadcastSuccess}</span>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={broadcastLoading}
              className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-2 cursor-pointer transition-all shadow-lg shadow-emerald-500/10"
            >
              {broadcastLoading ? <RefreshCw size={14} className="animate-spin text-slate-950" /> : <Send size={14} />}
              {broadcastLoading 
                ? (language === "ES" ? "Enviando a los usuarios..." : "Sending to users...") 
                : (language === "ES" ? "Enviar Comunicado por Correo" : "Send Email Broadcast")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
