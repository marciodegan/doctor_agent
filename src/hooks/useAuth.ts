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
      const res = await fetch("/api/auth/status");
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

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "OAUTH_AUTH_SUCCESS") {
        console.log("[Auth] success message received, refreshing status in 500ms...");
        setTimeout(() => checkAuth(), 500); 
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const login = async () => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    try {
      console.log("[Auth] Fetching auth URL...");
      const res = await fetch("/api/auth/url");
      
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error("[Auth] Server returned non-JSON:", text);
        alert(`Erro de Configuração: O servidor retornou uma resposta inválida (Status ${res.status}). Verifique se as credenciais do Google foram configuradas nos Secrets da Vercel.`);
        return;
      }

      if (!res.ok) {
        console.error("[Auth] Server error:", data);
        alert(`Erro de Configuração: ${data.error || "Não foi possível obter a URL de autenticação."}`);
        return;
      }
      
      const { url } = data;
      console.log("[Auth] Auth URL received, redirecting...");
      
      if (isMobile) {
        window.location.href = url;
      } else {
        const popup = window.open(url, "google_oauth", "width=600,height=700");
        if (!popup) {
          alert("O bloqueador de popups impediu a janela de login. Por favor, autorize popups ou use o redirecionamento direto.");
          window.location.href = url;
        }
      }
    } catch (error: any) {
      console.error("Login trigger error:", error);
      alert(`Erro ao iniciar login: ${error.message || "Erro desconhecido"}`);
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setIsAuthenticated(false);
  };

  return { isAuthenticated, login, logout };
};
