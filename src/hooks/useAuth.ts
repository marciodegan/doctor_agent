import { useState, useEffect, useRef } from "react";

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
        } catch (e) {
          console.error("[Auth] Failed to establish session:", e);
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

    const authChannel = new BroadcastChannel('nexus_auth_channel');
    authChannel.onmessage = (event) => {
      if (event.data?.type === "OAUTH_AUTH_SUCCESS") {
        console.log("[Auth] Received via BroadcastChannel");
        processAuthSuccess(event.data.tokens);
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'nexus_auth_success' && event.newValue) {
        try {
          const data = JSON.parse(event.newValue);
          if (Date.now() - data.timestamp < 30000) {
            console.log("[Auth] Received via LocalStorage");
            processAuthSuccess(data.tokens);
            localStorage.removeItem('nexus_auth_success');
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
          pollIntervalRef.current = window.setInterval(async () => {
            try {
              const pollRes = await fetch(`/api/auth/poll/${state}`, { credentials: 'include' });
              if (pollRes.ok) {
                const pollData = await pollRes.json();
                console.log("[Auth] Poll success!");
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
                if (errData.debug?.cookieCount > 0) {
                   console.log("[Auth] Poll 404 but cookies found. This is unusual.", errData.debug);
                }
              }
            } catch (e) {}
          }, 2000);

          const checkPopup = setInterval(() => {
            if (popup.closed) {
              clearInterval(checkPopup);
              setTimeout(() => {
                if (pollIntervalRef.current) {
                  clearInterval(pollIntervalRef.current);
                  pollIntervalRef.current = null;
                }
                checkAuth();
              }, 1000);
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
    setIsAuthenticated(false);
  };

  return { isAuthenticated, login, logout };
};
