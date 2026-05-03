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
