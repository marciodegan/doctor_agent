import { useState, useEffect } from "react";

export const useAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  const checkAuth = async () => {
    try {
      const res = await fetch("/api/auth/status");
      const data = await res.json();
      setIsAuthenticated(data.isAuthenticated);
    } catch (error) {
      setIsAuthenticated(false);
    }
  };

  useEffect(() => {
    checkAuth();

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "OAUTH_AUTH_SUCCESS") {
        checkAuth();
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const login = async () => {
    // Detect mobile/tablet to avoid popup blockers and handle iframe constraints
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    try {
      console.log("[Auth] Fetching auth URL...");
      const res = await fetch("/api/auth/url");
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Unknown server error" }));
        console.error("[Auth] Server error:", errorData);
        alert(`Erro de Configuração: ${errorData.error || "Não foi possível obter a URL de autenticação."}`);
        return;
      }
      const { url } = await res.json();
      console.log("[Auth] Auth URL received, redirecting...");
      
      if (isMobile) {
        // Direct redirect is much more reliable on iOS/Android
        window.location.href = url;
      } else {
        const popup = window.open(url, "google_oauth", "width=600,height=700");
        if (!popup) {
          alert("O bloqueador de popups impediu a janela de login. Por favor, autorize popups ou use o redirecionamento direto.");
          window.location.href = url;
        }
      }
    } catch (error) {
      console.error("Login trigger error:", error);
      alert("Erro ao iniciar login. Verifique se as credenciais do Google foram configuradas nos Secrets.");
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setIsAuthenticated(false);
  };

  return { isAuthenticated, login, logout };
};
