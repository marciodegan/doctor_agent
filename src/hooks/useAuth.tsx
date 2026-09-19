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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [user, setUser] = useState<User | null>(fbAuth.currentUser);
  const [userKeys, setUserKeys] = useState<{ publicKeyJwk: JsonWebKey; privateKeyJwk: JsonWebKey } | null>(null);
  const pollIntervalRef = useRef<number | null>(null);

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
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
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
          } else if (fbRes.status === 401) {
            await logout();
            return;
          }
        } catch (e) {}
      }
      setTimeout(() => checkAuth(), 500); 
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "OAUTH_AUTH_SUCCESS") processAuthSuccess(event.data.tokens);
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const login = async () => {
    try {
      const res = await fetch("/api/auth/url", { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) return;
      const { url, state } = data;
      const popup = window.open(url, "google_oauth", "width=600,height=700");
      if (!popup) {
        window.location.href = url;
        return;
      }
    } catch (error: any) {}
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: 'include' });
    try { await fbSignOut(fbAuth); } catch (e) {}
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, logout, userKeys }}>
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

