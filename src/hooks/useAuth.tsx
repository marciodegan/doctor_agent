import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { auth as fbAuth, db } from "../lib/firebase";
import { signInWithCustomToken, signOut as fbSignOut, onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

interface AuthContextType {
  isAuthenticated: boolean | null;
  user: User | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  userKeys: { publicKeyJwk: JsonWebKey; privateKeyJwk: JsonWebKey } | null;
  isDemoMode: boolean;
  enableDemoMode: () => void;
  disableDemoMode: () => void;
}

const DEMO_USER = {
  uid: "demo-doctor-preview",
  email: "demo@doctor-agent.online",
  displayName: "Dr. Roberto Santos (Demonstração)",
  photoURL: "https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=150&auto=format&fit=crop&q=80",
  emailVerified: true,
  isAnonymous: false,
  metadata: {},
  providerData: [],
  refreshToken: "demo-token",
  tenantId: null,
  delete: async () => {},
  getIdToken: async () => "demo-token",
  getIdTokenResult: async () => ({} as any),
  reload: async () => {},
  toJSON: () => ({}),
  phoneNumber: null,
  providerId: "google.com",
} as unknown as User;

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isDemoMode, setIsDemoMode] = useState<boolean>(() => {
    return typeof window !== "undefined" && localStorage.getItem("dr_agent_demo_mode") === "true";
  });
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(() => {
    if (typeof window !== "undefined" && localStorage.getItem("dr_agent_demo_mode") === "true") {
      return true;
    }
    return null;
  });
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window !== "undefined" && localStorage.getItem("dr_agent_demo_mode") === "true") {
      return DEMO_USER;
    }
    return fbAuth.currentUser;
  });
  const [userKeys, setUserKeys] = useState<{ publicKeyJwk: JsonWebKey; privateKeyJwk: JsonWebKey } | null>(null);
  const pollIntervalRef = useRef<number | null>(null);

  const enableDemoMode = () => {
    localStorage.setItem("dr_agent_demo_mode", "true");
    setIsDemoMode(true);
    setIsAuthenticated(true);
    setUser(DEMO_USER);
    if (typeof window !== "undefined" && window.location.pathname !== "/app") {
      window.history.pushState(null, "", "/app");
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  };

  const disableDemoMode = () => {
    localStorage.removeItem("dr_agent_demo_mode");
    setIsDemoMode(false);
    setIsAuthenticated(false);
    setUser(null);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(fbAuth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      import("../lib/crypto").then(async ({ generateUserKeyPair }) => {
        try {
          const privateKeyRef = doc(db, `users/${user.uid}/private`, "keyData");
          const privateKeySnap = await getDoc(privateKeyRef);
          if (privateKeySnap.exists()) {
            const data = privateKeySnap.data();
            setUserKeys({
              publicKeyJwk: data.publicKeyJwk,
              privateKeyJwk: data.privateKeyJwk,
            });
          } else {
            const keys = await generateUserKeyPair();
            await setDoc(privateKeyRef, {
              publicKeyJwk: keys.publicKeyJwk,
              privateKeyJwk: keys.privateKeyJwk,
              createdAt: new Date().toISOString(),
            });
            await setDoc(doc(db, "users", user.uid), {
              publicKeyJwk: keys.publicKeyJwk,
            }, { merge: true });
            setUserKeys(keys);
          }
        } catch (e) {
          console.error("[useAuth] Failed to load/create user keys:", e);
        }
      });
    } else {
      setUserKeys(null);
    }
  }, [user]);

  const checkAuth = async () => {
    // If in demo mode, preserve authenticated demo state immediately
    if (typeof window !== "undefined" && localStorage.getItem("dr_agent_demo_mode") === "true") {
      setIsDemoMode(true);
      setIsAuthenticated(true);
      setUser(DEMO_USER);
      return;
    }

    try {
      console.log("[Auth] Checking authentication status at /api/auth/status...");
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch("/api/auth/status", { 
        credentials: 'include',
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      console.log("[Auth] /api/auth/status response:", data);
      
      // Immediately set authentication state to unblock UI render
      setIsAuthenticated(!!data.isAuthenticated);

      if (data.isAuthenticated && !fbAuth.currentUser) {
        const syncFirebaseToken = async (attempts = 2) => {
          for (let i = 1; i <= attempts; i++) {
            try {
              console.log(`[Auth] Requesting /api/auth/firebase-token (attempt ${i}/${attempts})...`);
              const fbController = new AbortController();
              const fbTimeoutId = setTimeout(() => fbController.abort(), 25000);

              const fbRes = await fetch("/api/auth/firebase-token", { 
                credentials: 'include',
                signal: fbController.signal
              });
              clearTimeout(fbTimeoutId);

              if (fbRes.ok) {
                const { customToken } = await fbRes.json();
                await signInWithCustomToken(fbAuth, customToken);
                console.log("[Auth] Firebase authenticated successfully with customToken");
                return;
              } else if (fbRes.status === 401) {
                await logout();
                return;
              } else {
                const errData = await fbRes.json().catch(() => ({}));
                console.error(`[Auth] Attempt ${i} failed (HTTP ${fbRes.status}):`, errData);
              }
            } catch (e: any) {
              console.warn(`[Auth] Attempt ${i} token error:`, e?.message || e);
            }
            if (i < attempts) {
              await new Promise((resolve) => setTimeout(resolve, 1500));
            }
          }
        };

        syncFirebaseToken();
      }
    } catch (error) {
      console.warn("[Auth] checkAuth error or timeout:", error);
      setIsAuthenticated(false);
    }
  };

  useEffect(() => {
    checkAuth();

    // Safety timeout: Never leave UI hanging in 'null' (initializing) state indefinitely
    const safetyTimer = setTimeout(() => {
      setIsAuthenticated((prev) => {
        if (prev === null) {
          console.warn("[Auth] Safety timeout reached, forcing isAuthenticated = false");
          return false;
        }
        return prev;
      });
    }, 4500);

    const processAuthSuccess = async (tokens: any) => {
      console.log("[Auth] Processing authentication success event...");
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      setIsAuthenticated(true);

      // Auto-navigate to /app if currently on landing or other page
      if (typeof window !== "undefined" && window.location.pathname !== "/app") {
        window.history.pushState(null, "", "/app");
        window.dispatchEvent(new PopStateEvent("popstate"));
      }

      if (tokens) {
        try {
          await fetch("/api/auth/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tokens }),
            credentials: 'include'
          });
          const fbRes = await fetch("/api/auth/firebase-token", { credentials: 'include' });
          if (fbRes.ok) {
            const { customToken } = await fbRes.json();
            await signInWithCustomToken(fbAuth, customToken);
            console.log("[Auth] Firebase authenticated successfully with customToken");
          } else if (fbRes.status === 401) {
            await logout();
            return;
          }
        } catch (e) {
          console.warn("[Auth] Firebase token sync warning:", e);
        }
      }
      await checkAuth(); 
    };

    // Channel 1: Window postMessage (standard popup communication)
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "OAUTH_AUTH_SUCCESS") {
        console.log("[Auth] Received OAUTH_AUTH_SUCCESS via window postMessage");
        processAuthSuccess(event.data.tokens);
      }
    };
    window.addEventListener("message", handleMessage);

    // Channel 2: BroadcastChannel (cross-window/cross-origin opener severed support)
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel("doctor_pro_auth_channel");
      channel.onmessage = (event) => {
        if (event.data?.type === "OAUTH_AUTH_SUCCESS") {
          console.log("[Auth] Received OAUTH_AUTH_SUCCESS via BroadcastChannel");
          processAuthSuccess(event.data.tokens);
        }
      };
    } catch (e) {}

    // Channel 3: Storage event listener (syncs across tabs/popups)
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "doctor_pro_auth_tokens" || e.key === "doctor_pro_auth_success") {
        try {
          const data = JSON.parse(e.newValue || "{}");
          const tokens = data.tokens || data;
          if (tokens) {
            console.log("[Auth] Received auth tokens via storage event");
            processAuthSuccess(tokens);
          }
        } catch (err) {}
      }
    };
    window.addEventListener("storage", handleStorage);

    // Check if tokens were recently written to localStorage (within last 2 minutes)
    try {
      const storedTokensStr = localStorage.getItem("doctor_pro_auth_tokens");
      const storedTimeStr = localStorage.getItem("doctor_pro_auth_timestamp");
      if (storedTokensStr && storedTimeStr) {
        const age = Date.now() - parseInt(storedTimeStr, 10);
        if (age < 2 * 60 * 1000) {
          localStorage.removeItem("doctor_pro_auth_tokens");
          localStorage.removeItem("doctor_pro_auth_timestamp");
          console.log("[Auth] Found recent tokens in localStorage on mount");
          processAuthSuccess(JSON.parse(storedTokensStr));
        }
      }
    } catch (e) {}

    return () => {
      clearTimeout(safetyTimer);
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("storage", handleStorage);
      if (channel) channel.close();
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  const login = async () => {
    try {
      console.log("[Auth] Starting login flow...");
      const res = await fetch("/api/auth/url?returnTo=/app", { credentials: 'include' });
      let data: any = null;
      try {
        data = await res.json();
      } catch (jsonErr) {
        console.warn("[Auth] Non-JSON response received from /api/auth/url:", jsonErr);
      }

      if (!res.ok || !data?.url) {
        console.warn("[Auth] OAuth URL generation failed, falling back to Demo/Sandbox login:", data?.error || res.status);
        enableDemoMode();
        return;
      }
      const { url, state } = data;
      const popup = window.open(url, "google_oauth", "width=600,height=700");
      if (!popup) {
        // Fallback to top-level navigation if popup blocked
        window.location.href = url;
        return;
      }

      // Start active poll on /api/auth/poll/:state
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      let pollCount = 0;
      pollIntervalRef.current = window.setInterval(async () => {
        pollCount++;

        // Detect popup closed
        if (popup.closed) {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          console.log("[Auth] Popup closed by user or script, checking auth status...");
          setTimeout(() => checkAuth(), 400);
          return;
        }

        if (pollCount > 60) { // 90 seconds timeout
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          return;
        }

        try {
          const pollRes = await fetch(`/api/auth/poll/${encodeURIComponent(state)}`, { credentials: 'include' });
          if (pollRes.ok) {
            const pollData = await pollRes.json();
            if (pollData.tokens) {
              console.log("[Auth] Active poll resolved tokens successfully!");
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
              }
              try { popup.close(); } catch (e) {}
              await checkAuth();
            }
          }
        } catch (err) {}
      }, 1500);

    } catch (error: any) {
      console.error("[Auth] Login error:", error);
    }
  };

  const logout = async () => {
    localStorage.removeItem("dr_agent_demo_mode");
    setIsDemoMode(false);
    setUser(null);
    await fetch("/api/auth/logout", { method: "POST", credentials: 'include' });
    try { await fbSignOut(fbAuth); } catch (e) {}
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, logout, userKeys, isDemoMode, enableDemoMode, disableDemoMode }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

