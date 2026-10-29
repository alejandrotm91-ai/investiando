import { UserPortfolio } from "../types";

// Datos de la app del usuario (carteras, posiciones, watchlist, margen) guardados en el servidor
// (Cloudflare D1) mediante /api/user/*. La sesión viaja en una cookie, así que no hace falta
// enviar ningún token. Reemplaza a src/lib/firebase.ts con las mismas funciones.
//
// - Cada cambio se aplica al instante en memoria y en localStorage, y se envía al servidor.
// - Si el envío falla (sin conexión, error), queda pendiente y se reintenta cada 30 s.
// - Las suscripciones consultan el servidor cada 60 s y al volver a la pestaña, para ver
//   cambios hechos desde otro dispositivo.

export interface UserCloudData {
  email: string;
  holdings?: any[];
  portfolios?: UserPortfolio[];
  activePortfolioId?: string;
  watchlist?: string[];
  marginPositions?: any[];
  updatedAt?: string;
}

const POLL_MS = 60 * 1000;
const RETRY_MS = 30 * 1000;
const PENDING_SYNC_PREFIX = "investiando_pending_sync_";

const memoryCache = new Map<string, UserCloudData>();

const clean = (email: string) => email.toLowerCase().trim();
const cacheKey = (cleanEmail: string) => `cloud_user_cache_${cleanEmail}`;

function getStoredLocalData(cleanEmail: string): UserCloudData | null {
  try {
    const cached = localStorage.getItem(cacheKey(cleanEmail));
    return cached ? (JSON.parse(cached) as UserCloudData) : null;
  } catch {
    return null;
  }
}

function setStoredLocalData(cleanEmail: string, data: UserCloudData): void {
  try {
    localStorage.setItem(cacheKey(cleanEmail), JSON.stringify(data));
  } catch {
    // almacenamiento lleno o bloqueado
  }
}

function markPendingSync(cleanEmail: string) {
  try { localStorage.setItem(PENDING_SYNC_PREFIX + cleanEmail, "1"); } catch {}
}

function clearPendingSync(cleanEmail: string) {
  try { localStorage.removeItem(PENDING_SYNC_PREFIX + cleanEmail); } catch {}
}

function hasPendingSync(cleanEmail: string): boolean {
  try { return localStorage.getItem(PENDING_SYNC_PREFIX + cleanEmail) === "1"; } catch { return false; }
}

function pendingEmails(): string[] {
  const emails: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(PENDING_SYNC_PREFIX)) emails.push(key.slice(PENDING_SYNC_PREFIX.length));
    }
  } catch {}
  return emails;
}

// --- Suscriptores ---
interface EmailSubscription {
  listeners: Set<(data: UserCloudData) => void>;
  pollTimer: ReturnType<typeof setInterval> | null;
  teardownTimer: ReturnType<typeof setTimeout> | null;
}
const activeSubscriptions = new Map<string, EmailSubscription>();

function notifySubscribers(cleanEmail: string, data: UserCloudData) {
  memoryCache.set(cleanEmail, data);
  setStoredLocalData(cleanEmail, data);
  activeSubscriptions.get(cleanEmail)?.listeners.forEach((callback) => {
    try {
      callback(data);
    } catch (e) {
      console.error("Error in user data listener callback:", e);
    }
  });
}

async function fetchFromServer(cleanEmail: string): Promise<UserCloudData | null> {
  try {
    const res = await fetch(`/api/user/get-cloud-data?email=${encodeURIComponent(cleanEmail)}`, { credentials: "same-origin" });
    if (!res.ok) return null;
    const json = await res.json();
    return (json?.data as UserCloudData) || null;
  } catch {
    return null;
  }
}

/** Trae la versión del servidor y avisa a los suscriptores si cambió. No pisa cambios locales pendientes. */
async function refreshFromServer(cleanEmail: string) {
  if (hasPendingSync(cleanEmail)) return;
  const data = await fetchFromServer(cleanEmail);
  if (!data) return;
  const current = memoryCache.get(cleanEmail) || getStoredLocalData(cleanEmail);
  if (current && JSON.stringify(current) === JSON.stringify(data)) return;
  notifySubscribers(cleanEmail, data);
}

export async function getUserCloudData(email: string): Promise<UserCloudData | null> {
  if (!email) return null;
  const cleanEmail = clean(email);
  if (memoryCache.has(cleanEmail)) return memoryCache.get(cleanEmail)!;
  const data = await fetchFromServer(cleanEmail);
  if (data) {
    memoryCache.set(cleanEmail, data);
    setStoredLocalData(cleanEmail, data);
    return data;
  }
  return getStoredLocalData(cleanEmail);
}

async function pushToServer(cleanEmail: string, partial: Partial<UserCloudData>): Promise<boolean> {
  try {
    const res = await fetch("/api/user/save-cloud-data", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: cleanEmail, data: partial }),
    });
    const json = await res.json().catch(() => null);
    return res.ok && !!json?.success;
  } catch {
    return false;
  }
}

export async function saveUserCloudData(email: string, data: Partial<UserCloudData>): Promise<void> {
  if (!email) return;
  const cleanEmail = clean(email);

  // 1. Al instante en memoria y localStorage, y aviso a los suscriptores locales.
  const existing = memoryCache.get(cleanEmail) || getStoredLocalData(cleanEmail) || { email: cleanEmail };
  const merged: UserCloudData = { ...existing, ...data, email: cleanEmail, updatedAt: new Date().toISOString() };
  notifySubscribers(cleanEmail, merged);

  // 2. Al servidor (D1). Si falla, queda pendiente y se reintenta con el estado completo.
  markPendingSync(cleanEmail);
  const ok = await Promise.race([
    pushToServer(cleanEmail, { ...data, updatedAt: merged.updatedAt }),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 8000)),
  ]);
  if (ok) clearPendingSync(cleanEmail);
  else console.warn("Could not sync user data with the server; will retry automatically.");
}

/** Reenvía al servidor los cambios que quedaron pendientes (estado completo guardado en local). */
function flushAllPendingSyncs() {
  pendingEmails().forEach(async (cleanEmail) => {
    const cached = getStoredLocalData(cleanEmail);
    if (!cached) {
      clearPendingSync(cleanEmail);
      return;
    }
    const { email: _email, ...rest } = cached;
    if (await pushToServer(cleanEmail, rest)) clearPendingSync(cleanEmail);
  });
}

if (typeof window !== "undefined") {
  setTimeout(flushAllPendingSyncs, 3000);
  setInterval(flushAllPendingSyncs, RETRY_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    flushAllPendingSyncs();
    activeSubscriptions.forEach((_sub, cleanEmail) => refreshFromServer(cleanEmail));
  });
}

export function subscribeUserCloudData(email: string, onData: (data: UserCloudData) => void): () => void {
  if (!email) return () => {};
  const cleanEmail = clean(email);

  // 1. Datos en caché de inmediato.
  const initialData = memoryCache.get(cleanEmail) || getStoredLocalData(cleanEmail);
  if (initialData) {
    try {
      onData(initialData);
    } catch (e) {
      console.error("Error in initial onData handler:", e);
    }
  }

  let sub = activeSubscriptions.get(cleanEmail);
  if (!sub) {
    sub = { listeners: new Set(), pollTimer: null, teardownTimer: null };
    activeSubscriptions.set(cleanEmail, sub);
  }
  if (sub.teardownTimer) {
    clearTimeout(sub.teardownTimer);
    sub.teardownTimer = null;
  }
  sub.listeners.add(onData);

  // 2. Una sola consulta periódica por usuario, compartida por todos los suscriptores.
  if (!sub.pollTimer) {
    refreshFromServer(cleanEmail);
    sub.pollTimer = setInterval(() => refreshFromServer(cleanEmail), POLL_MS);
  }

  return () => {
    const currentSub = activeSubscriptions.get(cleanEmail);
    if (!currentSub) return;
    currentSub.listeners.delete(onData);
    if (currentSub.listeners.size === 0) {
      // Espera un poco para no reiniciar la consulta en cada re-render.
      currentSub.teardownTimer = setTimeout(() => {
        if (currentSub.listeners.size === 0) {
          if (currentSub.pollTimer) clearInterval(currentSub.pollTimer);
          activeSubscriptions.delete(cleanEmail);
        }
      }, 5000);
    }
  };
}
