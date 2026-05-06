import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { auth as fbAuth } from "../lib/firebase";
import { signInWithCustomToken, signOut as fbSignOut, onAuthStateChanged, User } from "firebase/auth";

interface AuthContextType {
  isAuthenticated: boolean | null;
  user: User | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [user, setUser] = useState<User | null>(fbAuth.currentUser);
  const pollIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(fbAuth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetch("/api/auth/status", { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      
      if (data.isAuthenticated && !fbAuth.currentUser) {
        try {
          const fbRes = await fetch("/api/auth/firebase-token", { credentials: 'include' });
          if (fbRes.ok) {
            const { customToken } = await fbRes.json();
            await signInWithCustomToken(fbAuth, customToken);
          }
        } catch (e) {}
      }
      setIsAuthenticated(data.isAuthenticated);
    } catch (error) {
      setIsAuthenticated(false);
    }
  };

  useEffect(() => {
    checkAuth();
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
    <AuthContext.Provider value={{ isAuthenticated, user, login, logout }}>
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

