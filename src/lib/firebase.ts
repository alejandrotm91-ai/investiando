import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, onSnapshot, Unsubscribe } from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";
import { UserPortfolio } from "../types";

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Get Firestore instance using custom database ID
export const db = getFirestore(
  app,
  firebaseConfig.firestoreDatabaseId || "(default)"
);

export interface UserCloudData {
  email: string;
  holdings?: any[];
  portfolios?: UserPortfolio[];
  activePortfolioId?: string;
  watchlist?: string[];
  marginPositions?: any[];
  updatedAt?: string;
}

// Local cache keys and in-memory cache
const memoryCache = new Map<string, UserCloudData>();
let isQuotaExceeded = false;
let quotaWarned = false;

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
    const userRef = doc(db, "users", cleanEmail);
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
      isQuotaExceeded = true;
      if (!quotaWarned) {
        console.warn("[Firebase] Free tier daily quota reached. Operating in seamless local cache mode.");
        quotaWarned = true;
      }
    } else {
      console.warn("Could not fetch user data from Firestore, using local data:", err?.message || err);
    }
  }
  return localData;
}

// Debounce map for writes
const pendingWrites = new Map<string, { timeout: NodeJS.Timeout; data: Partial<UserCloudData> }>();

// Save or update user data in Firestore
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

  notifySubscribers(cleanEmail, merged);

  if (isQuotaExceeded) {
    return;
  }

  // 2. Debounce cloud writes to prevent eating read/write units in bursts
  const existingPending = pendingWrites.get(cleanEmail);
  if (existingPending) {
    clearTimeout(existingPending.timeout);
    data = { ...existingPending.data, ...data };
  }

  const timeout = setTimeout(async () => {
    pendingWrites.delete(cleanEmail);
    try {
      const userRef = doc(db, "users", cleanEmail);
      await setDoc(
        userRef,
        {
          email: cleanEmail,
          ...data,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (err: any) {
      const isQuota = err?.code === "resource-exhausted" || err?.message?.toLowerCase?.()?.includes("quota");
      if (isQuota) {
        isQuotaExceeded = true;
        if (!quotaWarned) {
          console.warn("[Firebase] Free tier daily quota reached. Operating in seamless local cache mode.");
          quotaWarned = true;
        }
      } else {
        console.warn("Could not save user data to Firestore, kept in local cache:", err?.message || err);
      }
    }
  }, 1000);

  pendingWrites.set(cleanEmail, { timeout, data });
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
      const userRef = doc(db, "users", cleanEmail);
      sub.unsubscribeFirestore = onSnapshot(
        userRef,
        (snap) => {
          if (snap.exists()) {
            const cloudData = snap.data() as UserCloudData;
            notifySubscribers(cleanEmail, cloudData);
          }
        },
        (error: any) => {
          const isQuota = error?.code === "resource-exhausted" || error?.message?.toLowerCase?.()?.includes("quota");
          if (isQuota) {
            isQuotaExceeded = true;
            if (!quotaWarned) {
              console.warn("[Firebase] Firestore quota limit reached. Gracefully falling back to local persistence.");
              quotaWarned = true;
            }
          }
          // Clean up listener on quota exceeded so it doesn't keep generating errors
          if (sub?.unsubscribeFirestore) {
            try {
              sub.unsubscribeFirestore();
            } catch (e) {
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
