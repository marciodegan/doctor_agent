import { useState, useEffect } from "react";

export const useAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

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
      if (!data.isAuthenticated && data.debug) {
        console.warn("[Auth] Not authenticated. Debug info:", data.debug);
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
      console.log("[Auth] success message received, refreshing status...");
      
      if (tokens) {
        console.log("[Auth] Tokens received, establishing session...");
        try {
          await fetch("/api/auth/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tokens }),
            credentials: 'include'
          });
          console.log("[Auth] Session established successfully");
        } catch (e) {
          console.error("[Auth] Failed to establish session via tokens:", e);
        }
      }
      
      console.log("[Auth] refreshing status in 500ms...");
      setTimeout(() => checkAuth(), 500); 
    };

    // Listen via postMessage
    const handleMessage = (event: MessageEvent) => {
      console.log("[Auth] Message received:", event.data?.type, "from", event.origin);
      if (event.data?.type === "OAUTH_AUTH_SUCCESS") {
        console.log("[Auth] Valid auth message received from popup");
        processAuthSuccess(event.data.tokens);
      }
    };

    // Listen via BroadcastChannel
    const authChannel = new BroadcastChannel('nexus_auth_channel');
    authChannel.onmessage = (event) => {
      if (event.data?.type === "OAUTH_AUTH_SUCCESS") {
        console.log("[Auth] Received via BroadcastChannel");
        processAuthSuccess(event.data.tokens);
      }
    };

    // Listen via LocalStorage fallback (rare cases)
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'nexus_auth_success' && event.newValue) {
        try {
          const data = JSON.parse(event.newValue);
          // Only process if recent (within 30s)
          if (Date.now() - data.timestamp < 30000) {
            console.log("[Auth] Received via LocalStorage fallback");
            processAuthSuccess(data.tokens);
            localStorage.removeItem('nexus_auth_success');
          }
        } catch (e) {
          console.error("[Auth] Error parsing storage auth:", e);
        }
      }
    };

    window.addEventListener("message", handleMessage);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("storage", handleStorage);
      authChannel.close();
    };
  }, []);

  const login = async () => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    try {
      console.log("[Auth] Fetching auth URL...");
      const res = await fetch("/api/auth/url", { credentials: 'include' });
      
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error("[Auth] Server returned non-JSON:", text);
        alert(`Erro de Configuração: O servidor retornou uma resposta inválida.`);
        return;
      }

      if (!res.ok) {
        console.error("[Auth] Server error:", data);
        alert(`Erro de Configuração: ${data.error || "Não foi possível obter a URL de autenticação."}`);
        return;
      }
      
      const { url, state } = data;
      console.log("[Auth] Auth URL received, opening...", { state });
      
      if (isMobile) {
        window.location.href = url;
      } else {
        const popup = window.open(url, "google_oauth", "width=600,height=700");
        if (!popup) {
          alert("O bloqueador de popups impediu a janela de login. Redirecionando...");
          window.location.href = url;
          return;
        }

        // Start polling for the state if available
        // This handles cases where postMessage/BroadcastChannel/LocalStorage fail due to partitioning
        if (state) {
          console.log("[Auth] Starting session poll for state:", state);
          let attempts = 0;
          const maxAttempts = 120; // 2-3 minutes
          const pollInterval = setInterval(async () => {
            attempts++;
            if (attempts > maxAttempts) {
              clearInterval(pollInterval);
              return;
            }

            try {
              const pollRes = await fetch(`/api/auth/poll/${state}`, { credentials: 'include' });
              if (pollRes.ok) {
                const pollData = await pollRes.json();
                console.log("[Auth] Poll success! Establishing session...");
                clearInterval(pollInterval);
                
                // Establish session in iframe context
                await fetch("/api/auth/session", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ tokens: pollData.tokens }),
                  credentials: 'include'
                });
                
                checkAuth();
                if (popup && !popup.closed) popup.close();
              }
            } catch (e) {
              // Ignore polling errors
            }
          }, 1500);

          // Clear interval if user closes popup manually
          const checkPopup = setInterval(() => {
            if (popup.closed) {
              clearInterval(checkPopup);
              // Wait a bit then check auth one last time in case it just finished
              setTimeout(() => {
                 clearInterval(pollInterval);
                 checkAuth();
              }, 2000);
            }
          }, 1000);
        }
      }
    } catch (error: any) {
      console.error("Login trigger error:", error);
      alert(`Erro ao iniciar login: ${error.message || "Erro desconhecido"}`);
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: 'include' });
    setIsAuthenticated(false);
  };

  return { isAuthenticated, login, logout };
};
