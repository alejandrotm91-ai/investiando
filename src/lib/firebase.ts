/// <reference types="vite/client" />
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  initializeFirestore,
  getFirestore,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  Unsubscribe,
  setLogLevel,
} from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";
import { UserPortfolio } from "../types";

// Suppress benign internal gRPC idle stream / connection recycling messages from flooding the console
try {
  setLogLevel("silent");
} catch {
  // Ignore
}

// Filter benign internal Firestore WebChannel / gRPC stream idling from unhandled rejection handlers
if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event?.reason;
    const msg = typeof reason === "string" ? reason : reason?.message || "";
    if (
      msg.includes("Disconnecting idle stream") ||
      msg.includes("Timed out waiting for new targets") ||
      msg.includes("1 CANCELLED")
    ) {
      event.preventDefault();
    }
  });
}

// Initialize Firebase App
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

const customDbId =
  (import.meta as any).env?.VITE_FIREBASE_DATABASE_ID ||
  firebaseConfig.firestoreDatabaseId ||
  "ai-studio-investiando-7538016d-72da-4068-9c63-45731cbbc8c9";

// Initialize Firestore with robust auto-detect long polling for web / iframe / sandbox environments
export const db = (() => {
  try {
    return initializeFirestore(
      app,
      {
        experimentalAutoDetectLongPolling: true,
      },
      customDbId
    );
  } catch {
    try {
      return getFirestore(app, customDbId);
    } catch {
      return getFirestore(app);
    }
  }
})();

export interface UserCloudData {
  email: string;
  holdings?: any[];
  portfolios?: UserPortfolio[];
  activePortfolioId?: string;
  watchlist?: string[];
  marginPositions?: any[];
  updatedAt?: string;
}

export function normalizeEmailToDocId(email: string): string {
  if (!email) return "anonymous_user";
  return email.trim().toLowerCase().replace(/[^a-z0-9@._-]/g, "_");
}

// Local cache keys and in-memory cache
const memoryCache = new Map<string, UserCloudData>();
let quotaWarned = false;

const QUOTA_RETRY_COOLDOWN_MS = 10 * 60 * 1000; // retry cadence instead of waiting a full day

function isClientQuotaExceeded(): boolean {
  try {
    const failedAt = parseInt(localStorage.getItem("investiando_quota_failure_at") || "0", 10);
    return Date.now() - failedAt < QUOTA_RETRY_COOLDOWN_MS;
  } catch {
    return false;
  }
}

let isQuotaExceeded = isClientQuotaExceeded();

function markQuotaExceeded() {
  isQuotaExceeded = true;
  try {
    localStorage.setItem("investiando_quota_failure_at", String(Date.now()));
  } catch {}
  if (!quotaWarned) {
    console.warn("[Firebase] Free tier quota reached. Working from local storage; will retry syncing automatically in the background.");
    quotaWarned = true;
  }
}

// --- Pending-sync tracking so local changes made while quota-limited are never silently lost ---
const PENDING_SYNC_PREFIX = "investiando_pending_sync_";

function markPendingSync(cleanEmail: string) {
  try {
    localStorage.setItem(PENDING_SYNC_PREFIX + cleanEmail, "1");
  } catch {
    // ignore
  }
}

function clearPendingSync(cleanEmail: string) {
  try {
    localStorage.removeItem(PENDING_SYNC_PREFIX + cleanEmail);
  } catch {
    // ignore
  }
}

function getAllPendingSyncEmails(): string[] {
  const emails: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PENDING_SYNC_PREFIX)) {
        emails.push(key.slice(PENDING_SYNC_PREFIX.length));
      }
    }
  } catch {
    // ignore
  }
  return emails;
}

// Pushes any locally-cached changes that never made it to Firestore. Safe to call often:
// it no-ops unless something is pending and the quota cooldown has cleared. This is what
// lets an open session recover automatically once the quota window resets, instead of a
// user's edits staying stuck in local-only storage until they happen to edit again.
function flushAllPendingSyncs() {
  if (isQuotaExceeded) return;
  getAllPendingSyncEmails().forEach((cleanEmail) => {
    const cached = getStoredLocalData(cleanEmail);
    if (!cached) {
      clearPendingSync(cleanEmail);
      return;
    }
    saveUserCloudData(cleanEmail, cached);
  });
}

if (typeof window !== "undefined") {
  setTimeout(() => {
    isQuotaExceeded = isClientQuotaExceeded();
    flushAllPendingSyncs();
  }, 3000);
  setInterval(() => {
    isQuotaExceeded = isClientQuotaExceeded();
    flushAllPendingSyncs();
  }, 30 * 1000);
}

function getLocalCacheKey(cleanEmail: string): string {
  return `cloud_user_cache_${cleanEmail}`;
}

function getStoredLocalData(cleanEmail: string): UserCloudData | null {
  try {
    const cached = localStorage.getItem(getLocalCacheKey(cleanEmail));
    if (cached) {
      return JSON.parse(cached) as UserCloudData;
    }
  } catch (e) {
    // Ignore localStorage parse errors
  }
  return null;
}

function setStoredLocalData(cleanEmail: string, data: UserCloudData): void {
  try {
    localStorage.setItem(getLocalCacheKey(cleanEmail), JSON.stringify(data));
  } catch (e) {
    // Ignore storage quota errors
  }
}

// Multiplexed subscriber management
interface EmailSubscription {
  listeners: Set<(data: UserCloudData) => void>;
  unsubscribeFirestore: Unsubscribe | null;
  teardownTimer: NodeJS.Timeout | null;
}

const activeSubscriptions = new Map<string, EmailSubscription>();

function notifySubscribers(cleanEmail: string, data: UserCloudData) {
  memoryCache.set(cleanEmail, data);
  setStoredLocalData(cleanEmail, data);
  const sub = activeSubscriptions.get(cleanEmail);
  if (sub) {
    sub.listeners.forEach((callback) => {
      try {
        callback(data);
      } catch (e) {
        console.error("Error in user data listener callback:", e);
      }
    });
  }
}

// Fetch user data from Firestore with graceful fallback to local cache
export async function getUserCloudData(email: string): Promise<UserCloudData | null> {
  if (!email) return null;
  const cleanEmail = email.toLowerCase().trim();

  // Return from in-memory cache first if available
  if (memoryCache.has(cleanEmail)) {
    return memoryCache.get(cleanEmail)!;
  }

  const localData = getStoredLocalData(cleanEmail);
  if (isQuotaExceeded) {
    return localData;
  }

  try {
    const docId = normalizeEmailToDocId(cleanEmail);
    const userRef = doc(db, "users", docId);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const data = snap.data() as UserCloudData;
      memoryCache.set(cleanEmail, data);
      setStoredLocalData(cleanEmail, data);
      return data;
    }
  } catch (err: any) {
    const isQuota = err?.code === "resource-exhausted" || err?.message?.toLowerCase?.()?.includes("quota");
    if (isQuota) {
      markQuotaExceeded();
    } else {
      console.warn("Could not fetch user data from Firestore, checking server API:", err?.message || err);
    }
  }

  // Try server endpoint fallback
  try {
    const res = await fetch(`/api/user/get-cloud-data?email=${encodeURIComponent(cleanEmail)}`);
    if (res.ok) {
      const json = await res.json();
      if (json?.data) {
        memoryCache.set(cleanEmail, json.data);
        setStoredLocalData(cleanEmail, json.data);
        return json.data;
      }
    }
  } catch (e) {
    // ignore
  }

  return localData;
}

// Save or update user data in Firestore and local/server caches
export async function saveUserCloudData(email: string, data: Partial<UserCloudData>): Promise<void> {
  if (!email) return;
  const cleanEmail = email.toLowerCase().trim();

  // 1. Immediately update in-memory and local cache, and notify any local subscribers
  const existing = memoryCache.get(cleanEmail) || getStoredLocalData(cleanEmail) || { email: cleanEmail };
  const merged: UserCloudData = {
    ...existing,
    ...data,
    email: cleanEmail,
    updatedAt: new Date().toISOString(),
  };

  memoryCache.set(cleanEmail, merged);
  setStoredLocalData(cleanEmail, merged);
  notifySubscribers(cleanEmail, merged);

  const partialUpdate = {
    ...data,
    email: cleanEmail,
    updatedAt: new Date().toISOString(),
  };

  // 2. Immediately persist via server endpoint (writes to both server users_db.json and Firestore)
  const serverSyncPromise = fetch("/api/user/save-cloud-data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: cleanEmail, data: partialUpdate }),
  })
    .then((res) => res.json())
    .then((resData) => {
      if (resData?.success) {
        clearPendingSync(cleanEmail);
      }
      return resData;
    })
    .catch((err) => {
      console.warn("Could not sync with /api/user/save-cloud-data:", err);
      markPendingSync(cleanEmail);
    });

  // 3. Direct Firestore client write if available and quota not exceeded
  let clientFirestorePromise = Promise.resolve();
  if (!isQuotaExceeded) {
    clientFirestorePromise = (async () => {
      try {
        const docId = normalizeEmailToDocId(cleanEmail);
        const userRef = doc(db, "users", docId);
        await setDoc(
          userRef,
          partialUpdate,
          { merge: true }
        );
        clearPendingSync(cleanEmail);
      } catch (err: any) {
        const isQuota = err?.code === "resource-exhausted" || err?.message?.toLowerCase?.()?.includes("quota");
        if (isQuota) {
          markQuotaExceeded();
          markPendingSync(cleanEmail);
        } else {
          console.warn("Could not save user data to client Firestore, kept in local/server cache:", err?.message || err);
        }
      }
    })();
  }

  // Await server sync or timeout to ensure persistence before UI proceeds
  await Promise.race([
    Promise.allSettled([serverSyncPromise, clientFirestorePromise]),
    new Promise((resolve) => setTimeout(resolve, 8000)),
  ]);
}

// Subscribe to real-time updates for a user (multiplexed single listener per email)
export function subscribeUserCloudData(
  email: string,
  onData: (data: UserCloudData) => void
): () => void {
  if (!email) return () => {};
  const cleanEmail = email.toLowerCase().trim();

  // 1. Give subscriber the current cached data immediately
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
    sub = {
      listeners: new Set(),
      unsubscribeFirestore: null,
      teardownTimer: null,
    };
    activeSubscriptions.set(cleanEmail, sub);
  }

  if (sub.teardownTimer) {
    clearTimeout(sub.teardownTimer);
    sub.teardownTimer = null;
  }

  sub.listeners.add(onData);

  // If already connected to Firestore or if quota is exceeded, don't open duplicate listener
  if (!sub.unsubscribeFirestore && !isQuotaExceeded) {
    try {
      const docId = normalizeEmailToDocId(cleanEmail);
      const userRef = doc(db, "users", docId);
      sub.unsubscribeFirestore = onSnapshot(
        userRef,
        (snap) => {
          if (snap.exists()) {
            const cloudData = snap.data() as UserCloudData;
            notifySubscribers(cleanEmail, cloudData);
          }
        },
        (error: any) => {
          const errMsg = error?.message || "";
          const isIdleOrCancelled =
            error?.code === "cancelled" ||
            errMsg.includes("Disconnecting idle stream") ||
            errMsg.includes("CANCELLED") ||
            errMsg.includes("idle stream");

          if (isIdleOrCancelled) {
            // Benign transport recycling by Firestore WebChannel/gRPC stream - ignore
            return;
          }

          const isQuota =
            error?.code === "resource-exhausted" ||
            errMsg.toLowerCase().includes("quota");
          if (isQuota) {
            markQuotaExceeded();
          }
          // Clean up listener on quota exceeded or fatal error so it doesn't keep generating errors
          if (sub?.unsubscribeFirestore) {
            try {
              sub.unsubscribeFirestore();
            } catch {
              // ignore
            }
            sub.unsubscribeFirestore = null;
          }
        }
      );
    } catch (e) {
      console.warn("Could not establish Firestore snapshot listener:", e);
    }
  }

  // Return unsubscribe function
  return () => {
    const currentSub = activeSubscriptions.get(cleanEmail);
    if (!currentSub) return;

    currentSub.listeners.delete(onData);

    if (currentSub.listeners.size === 0) {
      // Delay teardown slightly to prevent rapid subscribe/unsubscribe cycles on component re-renders
      currentSub.teardownTimer = setTimeout(() => {
        if (currentSub.listeners.size === 0) {
          if (currentSub.unsubscribeFirestore) {
            try {
              currentSub.unsubscribeFirestore();
            } catch (e) {
              // ignore
            }
            currentSub.unsubscribeFirestore = null;
          }
          activeSubscriptions.delete(cleanEmail);
        }
      }, 5000);
    }
  };
}
