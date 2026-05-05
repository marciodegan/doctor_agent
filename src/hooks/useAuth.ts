import { useState, useEffect, useRef } from "react";
import { auth as fbAuth } from "../lib/firebase";
import { signInWithCustomToken, signOut as fbSignOut } from "firebase/auth";

export const useAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const pollIntervalRef = useRef<number | null>(null);

  const checkAuth = async () => {
    console.log("[Auth] Checking auth status...");
    const timeoutId = setTimeout(() => {
      console.warn("[Auth] Check auth timed out");
      setIsAuthenticated(prev => (prev === null ? false : prev));
    }, 8000);

    try {
      const res = await fetch("/api/auth/status", { credentials: 'include' });
      clearTimeout(timeoutId);
      
      console.log("[Auth] Status response status:", res.status);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      
      const data = await res.json();
      console.log("[Auth] Auth status API data:", data);
      
      if (data.isAuthenticated && !fbAuth.currentUser) {
        // Try to get firebase token if we are authenticated with Google but not Firebase
        try {
          const fbRes = await fetch("/api/auth/firebase-token", { credentials: 'include' });
          if (fbRes.ok) {
            const { customToken } = await fbRes.json();
            await signInWithCustomToken(fbAuth, customToken);
            console.log("[Auth] Firebase session restored");
          }
        } catch (e) {
          console.error("[Auth] Failed to restore Firebase session:", e);
        }
      }

      setIsAuthenticated(data.isAuthenticated);
    } catch (error) {
      clearTimeout(timeoutId);
      console.error("[Auth] Check auth failed:", error);
      setIsAuthenticated(false);
    }
  };

  useEffect(() => {
    checkAuth();

    const processAuthSuccess = async (tokens: any) => {
      console.log("[Auth] Success message received, established session...");
      
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

          // After session is established, sign in to Firebase
          const fbRes = await fetch("/api/auth/firebase-token", { credentials: 'include' });
          if (fbRes.ok) {
            const { customToken } = await fbRes.json();
            await signInWithCustomToken(fbAuth, customToken);
            console.log("[Auth] Signed in to Firebase successfully");
          }
        } catch (e) {
          console.error("[Auth] Failed to establish session or sign in to Firebase:", e);
        }
      }
      
      setTimeout(() => checkAuth(), 500); 
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "OAUTH_AUTH_SUCCESS") {
        console.log("[Auth] Message received via postMessage");
        processAuthSuccess(event.data.tokens);
      }
    };

    const authChannel = new BroadcastChannel('doctor_pro_auth_channel');
    authChannel.onmessage = (event) => {
      if (event.data?.type === "OAUTH_AUTH_SUCCESS") {
        console.log("[Auth] Received via BroadcastChannel");
        processAuthSuccess(event.data.tokens);
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'doctor_pro_auth_success' && event.newValue) {
        try {
          const data = JSON.parse(event.newValue);
          if (Date.now() - data.timestamp < 30000) {
            console.log("[Auth] Received via LocalStorage");
            processAuthSuccess(data.tokens);
            localStorage.removeItem('doctor_pro_auth_success');
          }
        } catch (e) {}
      }
    };

    window.addEventListener("message", handleMessage);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("storage", handleStorage);
      authChannel.close();
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const login = async () => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    try {
      const res = await fetch("/api/auth/url", { credentials: 'include' });
      const data = await res.json();
      
      if (!res.ok) {
        alert(`Erro: ${data.error || "Erro ao iniciar login."}`);
        return;
      }
      
      const { url, state } = data;
      console.log("[Auth] Opening auth URL...", { state });
      
      if (isMobile) {
        window.location.href = url;
      } else {
        const popup = window.open(url, "google_oauth", "width=600,height=700");
        if (!popup) {
          window.location.href = url;
          return;
        }

        if (state) {
          console.log("[Auth] Starting session poll for state:", state);
          let pollAttempts = 0;
          pollIntervalRef.current = window.setInterval(async () => {
            pollAttempts++;
            try {
              const pollRes = await fetch(`/api/auth/poll/${state}`, { credentials: 'include' });
              if (pollRes.ok) {
                const pollData = await pollRes.json();
                console.log("[Auth] Poll success! Tokens found.");
                if (pollIntervalRef.current) {
                  clearInterval(pollIntervalRef.current);
                  pollIntervalRef.current = null;
                }
                
                await fetch("/api/auth/session", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ tokens: pollData.tokens }),
                  credentials: 'include'
                });
                
                checkAuth();
                if (popup && !popup.closed) popup.close();
              } else if (pollRes.status === 404) {
                const errData = await pollRes.json().catch(() => ({}));
                if (pollAttempts % 5 === 0) {
                  console.log(`[Auth] Polling... (Attempt ${pollAttempts})`, errData.debug);
                }
              }
            } catch (e) {
              console.error("[Auth] Poll fetch error:", e);
            }
          }, 2000);

          const checkPopup = setInterval(() => {
            if (popup.closed) {
              console.log("[Auth] Popup closed by user/system");
              clearInterval(checkPopup);
              setTimeout(() => {
                if (pollIntervalRef.current) {
                  clearInterval(pollIntervalRef.current);
                  pollIntervalRef.current = null;
                }
                checkAuth();
              }, 1500);
            }
          }, 1000);
        }
      }
    } catch (error: any) {
      alert(`Erro: ${error.message}`);
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: 'include' });
    try {
      await fbSignOut(fbAuth);
    } catch (e) {
      console.error("[Auth] Firebase signout error:", e);
    }
    setIsAuthenticated(false);
  };

  return { isAuthenticated, login, logout };
};
