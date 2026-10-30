import React, { useState } from "react";
import { User, Shield, Key, Bell, Database, Check, ToggleLeft, ToggleRight, Mail, Server, Send, RefreshCw, Eye, EyeOff, CheckCircle2, AlertTriangle, Users, Megaphone, Sparkles, Trash2, UserX, UserCheck, Search, ShieldAlert, CreditCard, Lock, Unlock, Clock, Ban, UserMinus, X, Copy, CheckCheck } from "lucide-react";

export default function AccountSettings({ language, user }: { language: "EN" | "ES"; user: { id: string; name: string; email: string } }) {
  const isAdmin = user?.email?.toLowerCase().trim() === "alejandrotm91@gmail.com";
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

  // Admin User Management State
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [userStatusFilter, setUserStatusFilter] = useState<"ALL" | "ACTIVE" | "SUSPENDED" | "VERIFIED" | "PENDING">("ALL");
  const [userActionLoading, setUserActionLoading] = useState<string | null>(null);
  const [userActionFeedback, setUserActionFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [userToDelete, setUserToDelete] = useState<{ id: string; name: string; email: string } | null>(null);
  const [isRefreshingUsers, setIsRefreshingUsers] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);

  const fetchUsers = async () => {
    setIsRefreshingUsers(true);
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const data = await res.json();
        setRegisteredUsers(data || []);
      }
    } catch (err) {
      console.error("Failed to fetch registered users", err);
    } finally {
      setIsRefreshingUsers(false);
    }
  };

  // Fetch registered users and SMTP config on mount
  React.useEffect(() => {
    fetchUsers();

    if (isAdmin) {
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

      fetchSmtpConfig();
    }
  }, [isAdmin]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedEmail(text);
    setTimeout(() => setCopiedEmail(null), 2000);
  };

  const handleToggleUserStatus = async (targetUser: { id: string; name: string; email: string; status?: "active" | "suspended" }) => {
    setUserActionLoading(targetUser.id);
    setUserActionFeedback(null);
    try {
      const nextStatus = targetUser.status === "suspended" ? "active" : "suspended";
      const res = await fetch("/api/admin/toggle-user-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminEmail: user.email,
          targetEmail: targetUser.email,
          status: nextStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al modificar estado");

      setRegisteredUsers((prev) =>
        prev.map((u) => (u.email.toLowerCase() === targetUser.email.toLowerCase() ? { ...u, status: nextStatus } : u))
      );
      setUserActionFeedback({
        type: "success",
        message: language === "ES"
          ? (nextStatus === "suspended" 
              ? `Acceso revocado/suspendido para ${targetUser.name} (${targetUser.email}). El usuario no podrá iniciar sesión.` 
              : `Acceso reactivado exitosamente para ${targetUser.name}.`)
          : (nextStatus === "suspended" 
              ? `Access suspended for ${targetUser.name} (${targetUser.email}). User won't be able to sign in.` 
              : `Access reactivated for ${targetUser.name}.`),
      });
    } catch (err: any) {
      setUserActionFeedback({ type: "error", message: err.message || "Error al actualizar estado del usuario" });
    } finally {
      setUserActionLoading(null);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    setUserActionLoading(userToDelete.id);
    setUserActionFeedback(null);
    try {
      const res = await fetch("/api/admin/delete-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminEmail: user.email,
          targetEmail: userToDelete.email,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al eliminar usuario");

      setRegisteredUsers((prev) => prev.filter((u) => u.email.toLowerCase() !== userToDelete.email.toLowerCase()));
      setUserActionFeedback({
        type: "success",
        message: language === "ES"
          ? `El usuario ${userToDelete.name} (${userToDelete.email}) ha sido eliminado definitivamente del sistema.`
          : `User ${userToDelete.name} (${userToDelete.email}) was deleted permanently.`,
      });
      setUserToDelete(null);
    } catch (err: any) {
      setUserActionFeedback({ type: "error", message: err.message || "Error al eliminar usuario" });
    } finally {
      setUserActionLoading(null);
    }
  };

  const handleSelectUserForEmail = (targetEmail: string) => {
    setBroadcastRecipient(targetEmail);
    const broadcastSection = document.getElementById("admin-broadcast-section");
    if (broadcastSection) {
      broadcastSection.scrollIntoView({ behavior: "smooth" });
    }
  };

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
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || (language === "ES" ? "No se pudo guardar la configuración" : "Failed to save configuration"));
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
      lblApi: "Live Market Feed",
      lblSound: "Interactive Audio Alerts",
      descApi: "Fetch live ticker closing ticks directly from financial servers",
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
      lblApi: "Feed de mercado en vivo",
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

      {/* Real SMTP Configuration & Testing Block (Admin only) */}
      {isAdmin && (
        <>
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

      {/* Admin User Management & Access Control Table */}
      <div className="bg-[#0f111a]/80 backdrop-blur-md border border-slate-900/60 p-6 rounded-2xl mt-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-900/60 pb-4 mb-6">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
              <Users className="text-indigo-400" size={18} />
            </div>
            <div>
              <h3 className="font-display font-bold text-sm text-white tracking-wide uppercase">
                {language === "ES" ? "Gestión de Usuarios y Control de Acceso" : "User Management & Access Control"}
              </h3>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {language === "ES" 
                  ? "Monitorea cuentas registradas, suspende usuarios morosos o elimina cuentas que no hayan pagado." 
                  : "Monitor registered accounts, suspend delinquent users or delete unpaid accounts."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchUsers}
              disabled={isRefreshingUsers}
              className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={12} className={isRefreshingUsers ? "animate-spin text-indigo-400" : "text-slate-400"} />
              {language === "ES" ? "Actualizar Lista" : "Refresh List"}
            </button>
            <span className="text-[10px] font-mono font-semibold px-2.5 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 flex items-center gap-1.5">
              <ShieldAlert size={12} className="text-indigo-400" />
              Admin Master Control
            </span>
          </div>
        </div>

        {/* User Stats Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-950/60 border border-slate-900 p-3.5 rounded-xl flex items-center justify-between">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 font-semibold">
                {language === "ES" ? "Total Registrados" : "Total Registered"}
              </div>
              <div className="text-xl font-bold font-mono text-white mt-0.5">
                {registeredUsers.length}
              </div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400">
              <Users size={16} />
            </div>
          </div>

          <div className="bg-emerald-950/10 border border-emerald-900/30 p-3.5 rounded-xl flex items-center justify-between">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-emerald-500/80 font-semibold">
                {language === "ES" ? "Activos (Con Acceso)" : "Active (Full Access)"}
              </div>
              <div className="text-xl font-bold font-mono text-emerald-400 mt-0.5">
                {registeredUsers.filter((u) => u.status !== "suspended").length}
              </div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <UserCheck size={16} />
            </div>
          </div>

          <div className="bg-rose-950/10 border border-rose-900/30 p-3.5 rounded-xl flex items-center justify-between">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-rose-500/80 font-semibold">
                {language === "ES" ? "Suspendidos (Sin Pago)" : "Suspended (Unpaid)"}
              </div>
              <div className="text-xl font-bold font-mono text-rose-400 mt-0.5">
                {registeredUsers.filter((u) => u.status === "suspended").length}
              </div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <UserX size={16} />
            </div>
          </div>

          <div className="bg-blue-950/10 border border-blue-900/30 p-3.5 rounded-xl flex items-center justify-between">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-blue-500/80 font-semibold">
                {language === "ES" ? "Emails Verificados" : "Verified Inboxes"}
              </div>
              <div className="text-xl font-bold font-mono text-blue-400 mt-0.5">
                {registeredUsers.filter((u) => u.emailVerified).length}
              </div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <CheckCircle2 size={16} />
            </div>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between mb-4">
          <div className="relative w-full sm:w-80">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              value={userSearchQuery}
              onChange={(e) => setUserSearchQuery(e.target.value)}
              placeholder={language === "ES" ? "Buscar por nombre o correo..." : "Search by name or email..."}
              className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500/50 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none transition-colors font-mono"
            />
            {userSearchQuery && (
              <button
                type="button"
                onClick={() => setUserSearchQuery("")}
                className="absolute right-2.5 top-2 text-slate-500 hover:text-slate-300"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-auto bg-slate-950 p-1 rounded-xl border border-slate-900">
            <button
              type="button"
              onClick={() => setUserStatusFilter("ALL")}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-all ${
                userStatusFilter === "ALL"
                  ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {language === "ES" ? "Todos" : "All"} ({registeredUsers.length})
            </button>
            <button
              type="button"
              onClick={() => setUserStatusFilter("ACTIVE")}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-all ${
                userStatusFilter === "ACTIVE"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {language === "ES" ? "Activos" : "Active"} ({registeredUsers.filter((u) => u.status !== "suspended").length})
            </button>
            <button
              type="button"
              onClick={() => setUserStatusFilter("SUSPENDED")}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-all ${
                userStatusFilter === "SUSPENDED"
                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/30 font-semibold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {language === "ES" ? "Suspendidos" : "Suspended"} ({registeredUsers.filter((u) => u.status === "suspended").length})
            </button>
            <button
              type="button"
              onClick={() => setUserStatusFilter("VERIFIED")}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-all ${
                userStatusFilter === "VERIFIED"
                  ? "bg-blue-500/20 text-blue-300 border border-blue-500/30 font-semibold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {language === "ES" ? "Verificados" : "Verified"} ({registeredUsers.filter((u) => u.emailVerified).length})
            </button>
            <button
              type="button"
              onClick={() => setUserStatusFilter("PENDING")}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-all ${
                userStatusFilter === "PENDING"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {language === "ES" ? "Pendientes" : "Pending"} ({registeredUsers.filter((u) => !u.emailVerified).length})
            </button>
          </div>
        </div>

        {/* Feedback Alert */}
        {userActionFeedback && (
          <div
            className={`p-3 rounded-xl mb-4 flex items-center justify-between text-xs font-medium ${
              userActionFeedback.type === "success"
                ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                : "bg-rose-500/10 border border-rose-500/20 text-rose-400"
            }`}
          >
            <div className="flex items-center gap-2">
              {userActionFeedback.type === "success" ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
              <span>{userActionFeedback.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setUserActionFeedback(null)}
              className="text-slate-400 hover:text-white"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Users Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-900 bg-slate-950/40">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-900 bg-slate-950/80 text-[10px] uppercase font-mono tracking-wider text-slate-500">
                <th className="py-3 px-4">{language === "ES" ? "Usuario" : "User"}</th>
                <th className="py-3 px-4">{language === "ES" ? "Estado de Email" : "Email Status"}</th>
                <th className="py-3 px-4">{language === "ES" ? "Acceso / Pago" : "Access / Payment"}</th>
                <th className="py-3 px-4">{language === "ES" ? "Portafolios / Activos" : "Portfolios / Assets"}</th>
                <th className="py-3 px-4">{language === "ES" ? "Registro / Último Login" : "Registered / Last Login"}</th>
                <th className="py-3 px-4 text-right">{language === "ES" ? "Acciones" : "Actions"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/60 font-sans">
              {registeredUsers
                .filter((u) => {
                  const matchesSearch =
                    u.name?.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
                    u.email?.toLowerCase().includes(userSearchQuery.toLowerCase());
                  if (!matchesSearch) return false;
                  if (userStatusFilter === "ACTIVE") return u.status !== "suspended";
                  if (userStatusFilter === "SUSPENDED") return u.status === "suspended";
                  if (userStatusFilter === "VERIFIED") return !!u.emailVerified;
                  if (userStatusFilter === "PENDING") return !u.emailVerified;
                  return true;
                })
                .map((u) => {
                  const isMainAdmin = u.email?.toLowerCase().trim() === "alejandrotm91@gmail.com";
                  const isSuspended = u.status === "suspended";
                  const isLoadingThis = userActionLoading === u.id;
                  const isCopied = copiedEmail === u.email;

                  return (
                    <tr key={u.id || u.email} className="hover:bg-slate-900/30 transition-colors">
                      {/* User Info */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center font-bold text-xs text-slate-300 uppercase">
                            {u.name ? u.name.charAt(0) : "U"}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                              {u.name || "Usuario"}
                              {isMainAdmin && (
                                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                                  ADMIN
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[11px] font-mono text-slate-400">{u.email}</span>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(u.email)}
                                title={language === "ES" ? "Copiar correo" : "Copy email"}
                                className="text-slate-500 hover:text-slate-300 transition-colors p-0.5"
                              >
                                {isCopied ? <CheckCheck size={11} className="text-emerald-400" /> : <Copy size={11} />}
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Email Status */}
                      <td className="py-3 px-4">
                        {u.emailVerified ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 size={11} />
                            {language === "ES" ? "Verificado" : "Verified"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <Clock size={11} />
                            {language === "ES" ? "Pendiente" : "Pending"}
                          </span>
                        )}
                      </td>

                      {/* Access / Payment Status */}
                      <td className="py-3 px-4">
                        {isSuspended ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-1 rounded-md bg-rose-500/15 text-rose-400 border border-rose-500/30">
                            <Ban size={11} />
                            {language === "ES" ? "Suspendido (Falta de Pago)" : "Suspended (Unpaid)"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <Check size={11} />
                            {language === "ES" ? "Activo (Acceso Total)" : "Active (Full Access)"}
                          </span>
                        )}
                      </td>

                      {/* Portfolios & Holdings */}
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-300">
                        <div className="flex items-center gap-1.5">
                          <span className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-[10px] font-semibold text-slate-300">
                            {u.portfoliosCount || 1} {language === "ES" ? "Portafolio(s)" : "Portfolio(s)"}
                          </span>
                          <span className="text-slate-500 text-[10px]">
                            • {u.holdingsCount || 0} {language === "ES" ? "activos" : "holdings"}
                          </span>
                        </div>
                      </td>

                      {/* Dates */}
                      <td className="py-3 px-4 font-mono text-[10px] text-slate-400">
                        <div>
                          <span className="text-slate-500">Reg: </span>
                          {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                        </div>
                        {u.lastLogin && (
                          <div className="text-[9px] text-slate-500">
                            <span>Login: </span>
                            {new Date(u.lastLogin).toLocaleDateString()}
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        {isMainAdmin ? (
                          <span className="text-[10px] font-mono text-slate-600 italic">
                            {language === "ES" ? "Cuenta Protegida" : "Protected"}
                          </span>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Toggle Suspend / Reactivate */}
                            <button
                              type="button"
                              disabled={isLoadingThis}
                              onClick={() => handleToggleUserStatus(u)}
                              title={
                                isSuspended
                                  ? (language === "ES" ? "Reactivar acceso al usuario" : "Reactivate access")
                                  : (language === "ES" ? "Suspender acceso por falta de pago" : "Suspend access (Unpaid)")
                              }
                              className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                                isSuspended
                                  ? "bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-400"
                                  : "bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-400"
                              }`}
                            >
                              {isLoadingThis ? (
                                <RefreshCw size={14} className="animate-spin" />
                              ) : isSuspended ? (
                                <Unlock size={14} />
                              ) : (
                                <Lock size={14} />
                              )}
                            </button>

                            {/* Email Broadcast trigger */}
                            <button
                              type="button"
                              onClick={() => handleSelectUserForEmail(u.email)}
                              title={language === "ES" ? "Enviar correo personalizado / aviso de cobro" : "Send email / payment notice"}
                              className="p-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 transition-all cursor-pointer"
                            >
                              <Mail size={14} />
                            </button>

                            {/* Delete User */}
                            <button
                              type="button"
                              disabled={isLoadingThis}
                              onClick={() => setUserToDelete(u)}
                              title={language === "ES" ? "Eliminar usuario definitivamente" : "Delete user permanently"}
                              className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 transition-all cursor-pointer"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}

              {registeredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500 font-mono">
                    {language === "ES" ? "No hay usuarios registrados aún." : "No registered users found."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#0f111a] border border-rose-500/30 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center flex-shrink-0">
                <Trash2 className="text-rose-400" size={20} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white font-display">
                  {language === "ES" ? "¿Eliminar Usuario Definitivamente?" : "Delete User Permanently?"}
                </h4>
                <p className="text-[11px] text-slate-400">
                  {language === "ES" ? "Esta acción es irreversible y bloqueará el acceso por completo." : "This action is irreversible and revokes all access."}
                </p>
              </div>
            </div>

            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-900 text-xs font-mono space-y-1">
              <div className="text-slate-300 font-semibold">{userToDelete.name}</div>
              <div className="text-rose-400">{userToDelete.email}</div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              {language === "ES"
                ? "El usuario será borrado del registro del sistema. No podrá volver a iniciar sesión con sus credenciales ni acceder a la plataforma a menos que se registre nuevamente."
                : "The user will be removed from the system registry. They will not be able to log in unless they register again."}
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-colors cursor-pointer"
              >
                {language === "ES" ? "Cancelar" : "Cancel"}
              </button>
              <button
                type="button"
                disabled={userActionLoading === userToDelete.id}
                onClick={handleDeleteUser}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50 transition-colors flex items-center gap-2 cursor-pointer shadow-lg shadow-rose-600/20"
              >
                {userActionLoading === userToDelete.id ? (
                  <RefreshCw size={13} className="animate-spin" />
                ) : (
                  <Trash2 size={13} />
                )}
                {language === "ES" ? "Sí, Eliminar Usuario" : "Yes, Delete User"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Broadcast Communicator Section */}
      <div id="admin-broadcast-section" className="bg-[#0f111a]/80 backdrop-blur-md border border-slate-900/60 p-6 rounded-2xl mt-6">
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
    </>
  )}
</div>
  );
}
