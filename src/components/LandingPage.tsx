import React, { useState, useEffect } from "react";
import { 
  LogIn, 
  UserPlus, 
  Mail, 
  Lock, 
  User, 
  ShieldCheck, 
  ArrowRight, 
  RefreshCw, 
  Inbox, 
  CheckCircle, 
  ExternalLink,
  ChevronRight,
  TrendingUp,
  Brain,
  Sliders,
  Calendar,
  X,
  Sparkles
} from "lucide-react";

interface LandingPageProps {
  onAuthSuccess: (user: { id: string; name: string; email: string }, token: string) => void;
  language: "EN" | "ES";
}

export default function LandingPage({ onAuthSuccess, language }: LandingPageProps) {
  const [mode, setMode] = useState<"hero" | "signin" | "signup" | "verify" | "forgot_request" | "forgot_reset">("hero");
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [emailToVerify, setEmailToVerify] = useState("");

  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Lock background scroll when modal is open
  useEffect(() => {
    if (isAuthModalOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isAuthModalOpen]);

  const openAuthModal = (targetMode: "signin" | "signup") => {
    setError(null);
    setSuccessMsg(null);
    setMode(targetMode);
    setIsAuthModalOpen(true);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError(language === "EN" ? "Please fill in all fields" : "Por favor, completa todos los campos");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 403 && data.email) {
          // Unverified email, redirect to verify screen
          setEmailToVerify(data.email);
          setMode("verify");
          setError(language === "EN" ? "Please verify your email address to continue" : "Por favor, verifica tu correo electrónico para continuar");
        } else {
          setError(data.error || (language === "EN" ? "Invalid email or password" : "Correo o contraseña incorrectos"));
        }
        return;
      }

      setIsAuthModalOpen(false);
      onAuthSuccess(data.user, data.token);
    } catch (err) {
      setError(language === "EN" ? "Connection error" : "Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password || !confirmPassword) {
      setError(language === "EN" ? "Please fill in all fields" : "Por favor, completa todos los campos");
      return;
    }

    if (password !== confirmPassword) {
      setError(language === "EN" ? "Passwords do not match" : "Las contraseñas no coinciden");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || (language === "EN" ? "Registration failed" : "Error al registrarse"));
        return;
      }

      setEmailToVerify(data.email);
      setSuccessMsg(language === "EN" ? "Account created! Verification email sent to your inbox." : "¡Cuenta creada! Correo de verificación enviado a tu bandeja de entrada.");
      setMode("verify");
    } catch (err) {
      setError(language === "EN" ? "Connection error" : "Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verificationCode) {
      setError(language === "EN" ? "Please enter the 6-digit code" : "Por favor, introduce el código de 6 dígitos");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailToVerify, code: verificationCode }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || (language === "EN" ? "Verification failed" : "Código incorrecto o vencido"));
        return;
      }

      setSuccessMsg(null);
      setIsAuthModalOpen(false);
      onAuthSuccess(data.user, data.token);
    } catch (err) {
      setError(language === "EN" ? "Connection error" : "Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch("/api/auth/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailToVerify }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to resend code");
        return;
      }

      setSuccessMsg(language === "EN" ? "New verification code sent!" : "¡Se ha enviado un nuevo código!");
    } catch (err) {
      setError(language === "EN" ? "Connection error" : "Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail) {
      setError(language === "EN" ? "Please enter your email address" : "Por favor, introduce tu correo electrónico");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch("/api/auth/forgot-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || (language === "EN" ? "Failed to send reset code" : "No se pudo enviar el código de restablecimiento"));
        return;
      }

      setSuccessMsg(language === "EN" ? "Reset code sent! Check your email." : "¡Código enviado! Revisa tu correo.");
      setMode("forgot_reset");
    } catch (err) {
      setError(language === "EN" ? "Connection error" : "Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetCode || !newPassword || !confirmNewPassword) {
      setError(language === "EN" ? "Please fill in all fields" : "Por favor, completa todos los campos");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError(language === "EN" ? "Passwords do not match" : "Las contraseñas no coinciden");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/forgot-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail, code: resetCode, newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || (language === "EN" ? "Failed to reset password" : "No se pudo restablecer la contraseña"));
        return;
      }

      setSuccessMsg(language === "EN" ? "Password reset successfully! Please sign in with your new password." : "¡Contraseña restablecida con éxito! Inicia sesión con tu nueva contraseña.");
      setMode("signin");
      setEmail(resetEmail); // autofill signin email field
    } catch (err) {
      setError(language === "EN" ? "Connection error" : "Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  // Render Authentication Forms (used for both desktop panel and popup modal)
  const renderAuthContent = (isInsideModal: boolean) => {
    return (
      <div className="w-full">
        {/* Main Hero Default Form state / Quick actions */}
        {mode === "hero" && (
          <div className="space-y-6 py-2 text-center">
            <h3 className="text-lg font-bold text-white uppercase tracking-wider font-display">
              {language === "EN" ? "Connect Your Terminal" : "Conecta tu Terminal"}
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed px-2">
              {language === "EN" 
                ? "Access full real-time market quote synchronization and custom portfolios by securing your profile terminal."
                : "Accede a sincronización en tiempo real de cotizaciones y administra portafolios personalizados asegurando tu perfil."}
            </p>

            <div className="space-y-3 pt-2">
              <button 
                onClick={() => { setError(null); setSuccessMsg(null); setMode("signup"); }}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <UserPlus size={15} />
                {language === "EN" ? "Create Free Account" : "Crear Cuenta de Terminal"}
                <ArrowRight size={14} />
              </button>

              <button 
                onClick={() => { setError(null); setSuccessMsg(null); setMode("signin"); }}
                className="w-full py-3 bg-slate-900 hover:bg-slate-850 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all border border-slate-800 cursor-pointer flex items-center justify-center gap-2"
              >
                <LogIn size={15} />
                {language === "EN" ? "Sign In to Terminal" : "Iniciar Sesión"}
              </button>
            </div>

            <div className="pt-2 border-t border-slate-900 text-[10px] text-slate-500 leading-relaxed">
              {language === "EN" 
                ? "🔒 Features security protocols including multi-factor email verification"
                : "🔒 Incluye protocolos de seguridad con verificación de correo electrónico"}
            </div>
          </div>
        )}

        {/* SIGN IN STATE */}
        {mode === "signin" && (
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                {language === "EN" ? "Sign In" : "Iniciar Sesión"}
              </h3>
              {!isInsideModal && (
                <button 
                  type="button"
                  onClick={() => setMode("hero")}
                  className="text-[10px] text-slate-500 hover:text-white transition-colors cursor-pointer"
                >
                  {language === "EN" ? "Back" : "Atrás"}
                </button>
              )}
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs text-left leading-normal">
                {error}
              </div>
            )}

            {successMsg && (
              <div className="p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 text-xs text-left leading-normal flex items-start gap-1.5">
                <CheckCircle size={14} className="mt-0.5 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            <div className="space-y-3.5">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1 text-left">
                  {language === "EN" ? "Email Address" : "Correo Electrónico"}
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                  <input 
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. investor@investiando.ai"
                    className="w-full bg-[#05070e] border border-slate-900 rounded-xl pl-9 pr-4 py-2.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1 text-left">
                  {language === "EN" ? "Password" : "Contraseña"}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                  <input 
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#05070e] border border-slate-900 rounded-xl pl-9 pr-4 py-2.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
                    required
                  />
                </div>
                <div className="flex justify-end mt-1.5">
                  <button 
                    type="button"
                    onClick={() => { setError(null); setSuccessMsg(null); setResetEmail(email); setMode("forgot_request"); }}
                    className="text-[11px] text-emerald-400 hover:underline cursor-pointer"
                  >
                    {language === "EN" ? "Forgot your password?" : "¿Olvidaste tu contraseña?"}
                  </button>
                </div>
              </div>
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 font-bold rounded-xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? <RefreshCw size={12} className="animate-spin" /> : <LogIn size={13} />}
              {language === "EN" ? "Access Terminal" : "Acceder a Terminal"}
            </button>

            <div className="text-center pt-2 text-[10px] text-slate-500">
              {language === "EN" ? "Don't have an account?" : "¿No tienes una cuenta?"}{" "}
              <button 
                type="button" 
                onClick={() => { setError(null); setSuccessMsg(null); setMode("signup"); }}
                className="text-emerald-400 hover:underline cursor-pointer"
              >
                {language === "EN" ? "Sign Up" : "Regístrate"}
              </button>
            </div>
          </form>
        )}

        {/* SIGN UP STATE */}
        {mode === "signup" && (
          <form onSubmit={handleSignUp} className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                {language === "EN" ? "Sign Up" : "Crear Cuenta"}
              </h3>
              {!isInsideModal && (
                <button 
                  type="button"
                  onClick={() => setMode("hero")}
                  className="text-[10px] text-slate-500 hover:text-white transition-colors cursor-pointer"
                >
                  {language === "EN" ? "Back" : "Atrás"}
                </button>
              )}
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs text-left leading-normal">
                {error}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1 text-left">
                  {language === "EN" ? "Full Name" : "Nombre Completo"}
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                  <input 
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full bg-[#05070e] border border-slate-900 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1 text-left">
                  {language === "EN" ? "Email Address" : "Correo Electrónico"}
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                  <input 
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. john@example.com"
                    className="w-full bg-[#05070e] border border-slate-900 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1 text-left">
                  {language === "EN" ? "Password" : "Contraseña"}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                  <input 
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#05070e] border border-slate-900 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1 text-left">
                  {language === "EN" ? "Confirm Password" : "Confirmar Contraseña"}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                  <input 
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#05070e] border border-slate-900 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
                    required
                  />
                </div>
              </div>
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="w-full mt-1 py-2.5 bg-[#10b981] hover:bg-[#059669] disabled:opacity-50 text-slate-950 font-bold rounded-xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? <RefreshCw size={12} className="animate-spin" /> : <UserPlus size={13} />}
              {language === "EN" ? "Create Account & Send Code" : "Crear Cuenta y Recibir Código"}
            </button>

            <div className="text-center pt-1 text-[10px] text-slate-500">
              {language === "EN" ? "Already have an account?" : "¿Ya tienes una cuenta?"}{" "}
              <button 
                type="button" 
                onClick={() => { setError(null); setSuccessMsg(null); setMode("signin"); }}
                className="text-emerald-400 hover:underline cursor-pointer"
              >
                {language === "EN" ? "Sign In" : "Inicia Sesión"}
              </button>
            </div>
          </form>
        )}

        {/* EMAIL VERIFICATION MODE */}
        {mode === "verify" && (
          <form onSubmit={handleVerify} className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-1.5 text-amber-400">
                <ShieldCheck size={16} />
                {language === "EN" ? "Verify Code" : "Verificar Código"}
              </h3>
            </div>

            {successMsg && (
              <div className="p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 text-xs text-left leading-normal flex items-start gap-1.5">
                <CheckCircle size={14} className="mt-0.5 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs text-left leading-normal">
                {error}
              </div>
            )}

            <p className="text-[11px] text-slate-400 leading-normal text-left">
              {language === "EN" 
                ? "We sent a 6-digit confirmation code to your email. Check your inbox (or spam) or use the quick test inbox below." 
                : "Enviamos un correo con tu código de confirmación de 6 dígitos. Revisa tu bandeja de entrada real (o spam) o usa el buzón de pruebas abajo."}
            </p>

            <div>
              <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1 text-left">
                {language === "EN" ? "6-Digit Verification Code" : "Código de Verificación de 6 Dígitos"}
              </label>
              <input 
                type="text"
                maxLength={6}
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ""))}
                placeholder="e.g. 123456"
                className="w-full text-center bg-[#05070e] border border-slate-900 rounded-xl py-3 text-lg font-mono font-bold text-emerald-400 tracking-[0.4em] placeholder:tracking-normal placeholder:text-xs placeholder:text-slate-700 focus:outline-none focus:border-emerald-500"
                required
              />
            </div>

            <div className="flex gap-2">
              <button 
                type="submit"
                disabled={loading}
                className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {loading ? <RefreshCw size={12} className="animate-spin" /> : <ShieldCheck size={14} />}
                {language === "EN" ? "Verify Code" : "Verificar Código"}
              </button>

              <button 
                type="button"
                onClick={handleResendCode}
                disabled={loading}
                className="px-4 py-2.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                title={language === "EN" ? "Resend Verification Code" : "Reenviar Código de Verificación"}
              >
                {language === "EN" ? "Resend" : "Reenviar"}
              </button>
            </div>

            <div className="text-center pt-1">
              <button 
                type="button" 
                onClick={() => { setError(null); setSuccessMsg(null); setMode("signup"); }}
                className="text-slate-500 hover:text-white text-xs transition-colors cursor-pointer underline"
              >
                {language === "EN" ? "Change Email Address" : "Cambiar Correo Electrónico"}
              </button>
            </div>
          </form>
        )}

        {/* FORGOT PASSWORD REQUEST STATE */}
        {mode === "forgot_request" && (
          <form onSubmit={handleForgotRequest} className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono text-emerald-400">
                {language === "EN" ? "Reset Password" : "Recuperar Contraseña"}
              </h3>
              <button 
                type="button"
                onClick={() => { setError(null); setSuccessMsg(null); setMode("signin"); }}
                className="text-[10px] text-slate-500 hover:text-white transition-colors cursor-pointer"
              >
                {language === "EN" ? "Back to Login" : "Volver"}
              </button>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs text-left leading-normal">
                {error}
              </div>
            )}

            {successMsg && (
              <div className="p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 text-xs text-left leading-normal flex items-start gap-1.5">
                <CheckCircle size={14} className="mt-0.5 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            <p className="text-[11px] text-slate-400 leading-normal text-left">
              {language === "EN" 
                ? "Enter your email address below. We will send a 6-digit password recovery code to your inbox." 
                : "Introduce tu correo electrónico. Te enviaremos un código de 6 dígitos para restablecer tu contraseña directamente a tu correo."}
            </p>

            <div>
              <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1 text-left">
                {language === "EN" ? "Email Address" : "Correo Electrónico"}
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                <input 
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="e.g. john@example.com"
                  className="w-full bg-[#05070e] border border-slate-900 rounded-xl pl-9 pr-4 py-2.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
                  required
                />
              </div>
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 font-bold rounded-xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {loading ? <RefreshCw size={12} className="animate-spin" /> : <Mail size={13} />}
              {language === "EN" ? "Send Recovery Code" : "Enviar Código de Recuperación"}
            </button>
          </form>
        )}

        {/* FORGOT PASSWORD RESET STATE */}
        {mode === "forgot_reset" && (
          <form onSubmit={handleForgotReset} className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono text-emerald-400">
                {language === "EN" ? "Enter Reset Code" : "Ingresar Código"}
              </h3>
              <button 
                type="button"
                onClick={() => { setError(null); setSuccessMsg(null); setMode("forgot_request"); }}
                className="text-[10px] text-slate-500 hover:text-white transition-colors cursor-pointer"
              >
                {language === "EN" ? "Change Email" : "Cambiar Correo"}
              </button>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs text-left leading-normal">
                {error}
              </div>
            )}

            {successMsg && (
              <div className="p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 text-xs text-left leading-normal flex items-start gap-1.5">
                <CheckCircle size={14} className="mt-0.5 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            <p className="text-[11px] text-slate-400 leading-normal text-left">
              {language === "EN" 
                ? "We have sent a 6-digit recovery code to your email. Enter the code and set your new password below." 
                : "Hemos enviado un código de recuperación de 6 dígitos a tu correo. Ingresa el código y define tu nueva contraseña abajo."}
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1 text-left">
                  {language === "EN" ? "6-Digit Reset Code" : "Código de Recuperación (6 dígitos)"}
                </label>
                <input 
                  type="text"
                  maxLength={6}
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="e.g. 123456"
                  className="w-full text-center bg-[#05070e] border border-slate-900 rounded-xl py-2.5 text-md font-mono font-bold text-emerald-400 tracking-[0.3em] placeholder:tracking-normal placeholder:text-xs placeholder:text-slate-700 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1 text-left">
                  {language === "EN" ? "New Password" : "Nueva Contraseña"}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                  <input 
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#05070e] border border-slate-900 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1 text-left">
                  {language === "EN" ? "Confirm New Password" : "Confirmar Nueva Contraseña"}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                  <input 
                    type="password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#05070e] border border-slate-900 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
                    required
                  />
                </div>
              </div>
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 font-bold rounded-xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {loading ? <RefreshCw size={12} className="animate-spin" /> : <CheckCircle size={13} />}
              {language === "EN" ? "Reset Password" : "Restablecer Contraseña"}
            </button>
          </form>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between relative overflow-x-hidden overflow-y-auto w-full max-w-full font-sans">
      
      {/* Decorative ambient glow */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Header bar */}
      <header className="px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between border-b border-slate-900/60 bg-[#0f111a]/40 backdrop-blur-md z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-slate-950" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m3 17 6-6 4 4 8-8"/><path d="M17 7h4v4"/></svg>
          </div>
          <span className="text-sm sm:text-base font-bold tracking-tight text-white font-mono">investiando.ai</span>
        </div>

        <div className="flex items-center gap-2.5 sm:gap-4">
          <button 
            onClick={() => openAuthModal("signin")}
            className="text-xs font-semibold text-slate-300 hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-slate-900/60 transition-colors cursor-pointer"
          >
            {language === "EN" ? "Sign In" : "Iniciar Sesión"}
          </button>
          <button 
            onClick={() => openAuthModal("signup")}
            className="px-3.5 sm:px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-xl text-xs transition-all shadow-md shadow-emerald-500/10 cursor-pointer active:scale-95"
          >
            {language === "EN" ? "Sign Up Free" : "Crear Cuenta"}
          </button>
        </div>
      </header>

      {/* Core Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-4 sm:py-12 flex flex-col lg:flex-row items-center justify-center gap-5 lg:gap-12 z-10">
        
        {/* Left column - Info / Marketing context */}
        <div className="flex-1 space-y-4 sm:space-y-6 text-left max-w-xl">
          <h1 className="text-2xl sm:text-4xl md:text-5xl font-display font-bold text-white tracking-tight leading-snug sm:leading-[1.1]">
            {language === "EN" ? (
              <>Simulate, Analyze & <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-emerald-200">Master Your Investments</span></>
            ) : (
              <>Simula, Analiza y <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-emerald-200">Domina tus Inversiones</span></>
            )}
          </h1>

          {/* Quick CTAs for Mobile View */}
          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 lg:hidden">
            <button 
              onClick={() => openAuthModal("signup")}
              className="w-full sm:w-auto px-5 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold rounded-xl text-xs uppercase tracking-wider transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
            >
              <UserPlus size={15} />
              <span>{language === "EN" ? "Get Started Free" : "Comenzar Gratis"}</span>
              <ArrowRight size={14} />
            </button>
            <button 
              onClick={() => openAuthModal("signin")}
              className="w-full sm:w-auto px-5 py-3 bg-[#0f111a]/80 hover:bg-slate-900 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all border border-slate-800 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
            >
              <LogIn size={14} />
              <span>{language === "EN" ? "Sign In" : "Iniciar Sesión"}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4 pt-2 sm:pt-4">
            <div className="p-3.5 bg-[#0f111a]/60 border border-slate-900/60 rounded-xl flex items-start gap-2.5">
              <Brain size={18} className="text-emerald-400 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">{language === "EN" ? "AI Analyst" : "Analista IA"}</h4>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-normal">
                  {language === "EN" ? "Interactive Gemini core portfolio advisory." : "Consultor inteligente con tecnología Gemini."}
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-[#0f111a]/60 border border-slate-900/60 rounded-xl flex items-start gap-2.5">
              <Sliders size={18} className="text-emerald-400 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">{language === "EN" ? "What-If Simulation" : "Simulador What-If"}</h4>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-normal">
                  {language === "EN" ? "Instantly simulate reallocations & futures." : "Simulaciones automáticas de reajustes."}
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-[#0f111a]/60 border border-slate-900/60 rounded-xl flex items-start gap-2.5">
              <TrendingUp size={18} className="text-emerald-400 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">{language === "EN" ? "Analyst Targets" : "Precios Objetivo"}</h4>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-normal">
                  {language === "EN" ? "Consensus high, average, and low targets." : "Comparación con metas de analistas."}
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-[#0f111a]/60 border border-slate-900/60 rounded-xl flex items-start gap-2.5">
              <Calendar size={18} className="text-emerald-400 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">{language === "EN" ? "Earnings Calendar" : "Calendario de Reportes"}</h4>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-normal">
                  {language === "EN" ? "Never miss critical reporting days." : "Mantén el control de reportes corporativos."}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right column - Authentication Interactive Panel (Desktop Only, completely hidden on mobile) */}
        <div className="hidden lg:block w-full max-w-md bg-[#0f111a]/80 border border-slate-900 p-6 rounded-2xl shadow-xl shadow-black/40 relative">
          {renderAuthContent(false)}
        </div>
      </main>

      {/* AUTHENTICATION POP-UP MODAL (For Mobile & Header button clicks) */}
      {isAuthModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 overscroll-contain">
          <div className="w-full max-w-md bg-[#0f111a] border border-slate-800/90 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] relative animate-in zoom-in-95 duration-200">
            
            {/* Modal Top Bar */}
            <div className="px-5 py-4 border-b border-slate-800/80 bg-slate-950/60 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 bg-emerald-500/15 border border-emerald-500/30 rounded-lg flex items-center justify-center text-emerald-400 shadow-sm shadow-emerald-500/10">
                  {mode === "signup" ? <UserPlus size={14} /> : mode === "verify" ? <ShieldCheck size={14} /> : <LogIn size={14} />}
                </div>
                <div>
                  <h4 className="text-xs font-bold font-display uppercase tracking-wider text-white">
                    {mode === "signup" 
                      ? (language === "EN" ? "Create Account" : "Crear Cuenta")
                      : mode === "verify"
                      ? (language === "EN" ? "Email Verification" : "Verificación de Correo")
                      : mode === "forgot_request" || mode === "forgot_reset"
                      ? (language === "EN" ? "Account Recovery" : "Recuperar Cuenta")
                      : (language === "EN" ? "Terminal Sign In" : "Iniciar Sesión")}
                  </h4>
                  <span className="text-[10px] text-slate-500 font-mono block">investiando.ai terminal</span>
                </div>
              </div>
              <button
                onClick={() => setIsAuthModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer"
                title={language === "EN" ? "Close" : "Cerrar"}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-5 sm:p-6 overflow-y-auto no-scrollbar scrollbar-none space-y-4 [touch-action:pan-y] [-webkit-overflow-scrolling:touch]">
              {renderAuthContent(true)}
            </div>

          </div>
        </div>
      )}

      {/* Mini footer */}
      <footer className="border-t border-slate-900/60 bg-[#0f111a]/20 py-4 px-6 flex flex-col sm:flex-row items-center justify-between text-[9px] text-slate-600 font-medium tracking-wide uppercase">
        <div>investiando.ai v2.4.1 Terminal Auth Service</div>
        <div className="mt-1 sm:mt-0 text-emerald-500 font-bold">● Secure SSL Encryption Active</div>
      </footer>

    </div>
  );
}
