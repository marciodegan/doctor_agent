import React, { useEffect, useState } from "react";
import {
  Shield,
  ShieldAlert,
  Lock,
  LogOut,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  UserCheck,
  FileImage,
  Smartphone,
  ExternalLink,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useGroup } from "../contexts/GroupContext";

interface SharePageProps {
  token: string;
}

interface ShareData {
  authorized: boolean;
  token: string;
  groupId: string;
  patientName: string;
  alt: string;
  mediaUrl: string;
}

export default function SharePage({ token }: SharePageProps) {
  const { isAuthenticated, user, login, logout } = useAuth();
  const { groups, setActiveGroupId } = useGroup();

  const [loading, setLoading] = useState(true);
  const [shareData, setShareData] = useState<ShareData | null>(null);
  const [errorType, setErrorType] = useState<
    "unauthenticated" | "access_denied" | "not_found" | "server_error" | null
  >(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const verifyShareToken = async () => {
    if (!token) {
      setErrorType("not_found");
      setErrorMessage("Link de compartilhamento inválido.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorType(null);
    setErrorMessage("");

    try {
      const res = await fetch("/api/share/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
        credentials: "include",
      });

      const data = await res.json();

      if (res.status === 401 || data.error === "unauthenticated") {
        setErrorType("unauthenticated");
        setErrorMessage(data.message || "Você precisa estar autenticado para visualizar este conteúdo.");
        setLoading(false);
        return;
      }

      if (res.status === 403 || data.error === "access_denied") {
        setErrorType("access_denied");
        setErrorMessage(
          data.message ||
            `Sua conta (${user?.email || "conectada"}) não pertence ao grupo responsável por esta imagem.`
        );
        setLoading(false);
        return;
      }

      if (res.status === 404 || data.error === "not_found") {
        setErrorType("not_found");
        setErrorMessage(data.message || "Este link de imagem não existe ou expirou.");
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setErrorType("server_error");
        setErrorMessage("Não foi possível validar as permissões no momento.");
        setLoading(false);
        return;
      }

      setShareData(data);
      if (data.groupId) {
        setActiveGroupId(data.groupId);
      }
      setLoading(false);
    } catch (err: any) {
      console.error("[SharePage] Token verification error:", err);
      setErrorType("server_error");
      setErrorMessage("Erro de rede ao verificar o link compartilhado.");
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated === false) {
      setErrorType("unauthenticated");
      setErrorMessage("Você precisa estar conectado para visualizar este arquivo compartilhado.");
      setLoading(false);
    } else if (isAuthenticated === true && user) {
      verifyShareToken();
    }
  }, [token, isAuthenticated, user]);

  const handleOpenApp = () => {
    if (shareData?.groupId) {
      setActiveGroupId(shareData.groupId);
    }
    window.location.href = "/app";
  };

  return (
    <div className="min-h-dvh bg-slate-900 text-slate-100 flex flex-col justify-between p-4 sm:p-6 md:p-8 font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Header */}
      <header className="max-w-3xl w-full mx-auto flex items-center justify-between py-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Shield size={20} />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-white tracking-tight leading-tight">
              Acesso Seguro ao Conteúdo
            </h1>
            <p className="text-xs text-slate-400">Ambiente de saúde protegido por autenticação</p>
          </div>
        </div>

        {user && (
          <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700/60 rounded-full px-3 py-1.5 text-xs text-slate-300">
            <UserCheck size={14} className="text-emerald-400 shrink-0" />
            <span className="max-w-[140px] sm:max-w-[200px] truncate">{user.email}</span>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="max-w-2xl w-full mx-auto my-auto py-8">
        {/* Loading State */}
        {loading && (
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-3xl p-8 sm:p-12 text-center shadow-2xl backdrop-blur-md animate-fade-in">
            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 animate-spin">
              <Loader2 size={32} />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Validando Credenciais e Permissões</h2>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              Verificando se você está autenticado e se sua conta pertence ao grupo responsável por esta imagem...
            </p>
          </div>
        )}

        {/* State: Unauthenticated (Needs Login) */}
        {!loading && errorType === "unauthenticated" && (
          <div className="bg-slate-800/80 border border-slate-700 rounded-3xl p-6 sm:p-10 text-center shadow-2xl backdrop-blur-md space-y-6 animate-fade-in">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Lock size={32} />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-black text-white tracking-tight">Identificação Necessária</h2>
              <p className="text-sm text-slate-300 leading-relaxed max-w-md mx-auto">
                Este link contém informações médicas e imagens privadas que requerem autenticação para visualização.
              </p>
            </div>

            <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-4 text-left text-xs text-slate-400 space-y-2 max-w-md mx-auto">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                <Smartphone size={16} />
                <span>Sessão PWA Mantida</span>
              </div>
              <p className="text-slate-300">
                Ao entrar, sua sessão será mantida no celular para acesso rápido sem solicitar login novamente.
              </p>
            </div>

            <div className="pt-2 max-w-sm mx-auto space-y-3">
              <button
                onClick={() => login()}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 px-6 rounded-2xl shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2.5 active:scale-[0.98] text-sm uppercase tracking-wider"
              >
                <Lock size={18} />
                <span>Entrar para Visualizar</span>
              </button>
            </div>
          </div>
        )}

        {/* State: Access Denied (Not member of the group) */}
        {!loading && errorType === "access_denied" && (
          <div className="bg-slate-800/80 border border-red-500/30 rounded-3xl p-6 sm:p-10 text-center shadow-2xl backdrop-blur-md space-y-6 animate-fade-in">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
              <ShieldAlert size={32} />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-black text-white tracking-tight">Acesso Negado</h2>
              <p className="text-sm text-slate-300 leading-relaxed max-w-md mx-auto">
                {errorMessage || "Sua conta não possui permissão para visualizar esta imagem ou não pertence ao grupo responsável."}
              </p>
            </div>

            <div className="bg-slate-900/60 border border-red-500/20 rounded-2xl p-4 text-left text-xs text-slate-400 space-y-1.5 max-w-md mx-auto">
              <p className="text-slate-300 font-medium">Conta atual: <span className="text-white font-bold">{user?.email || "Desconhecida"}</span></p>
              <p className="text-slate-400">Se você pertence a este grupo com outro e-mail, alterne a conta para prosseguir.</p>
            </div>

            <div className="pt-2 max-w-sm mx-auto flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => logout()}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
              >
                <LogOut size={16} />
                <span>Trocar de Conta</span>
              </button>
              <button
                onClick={handleOpenApp}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-wider shadow-md shadow-emerald-600/20"
              >
                <ExternalLink size={16} />
                <span>Ir ao App</span>
              </button>
            </div>
          </div>
        )}

        {/* State: Not Found */}
        {!loading && errorType === "not_found" && (
          <div className="bg-slate-800/80 border border-slate-700 rounded-3xl p-6 sm:p-10 text-center shadow-2xl backdrop-blur-md space-y-6 animate-fade-in">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-700/50 border border-slate-600/50 flex items-center justify-center text-slate-400">
              <FileImage size={32} />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white">Link Indisponível ou Expirado</h2>
              <p className="text-sm text-slate-400 max-w-md mx-auto">
                {errorMessage || "Não encontramos o arquivo correspondente a este link."}
              </p>
            </div>

            <button
              onClick={handleOpenApp}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-6 rounded-2xl transition-all inline-flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
            >
              <ArrowLeft size={16} />
              <span>Voltar ao Aplicativo</span>
            </button>
          </div>
        )}

        {/* State: Server Error */}
        {!loading && errorType === "server_error" && (
          <div className="bg-slate-800/80 border border-slate-700 rounded-3xl p-6 sm:p-10 text-center shadow-2xl backdrop-blur-md space-y-6 animate-fade-in">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <ShieldAlert size={32} />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white">Falha na Validação</h2>
              <p className="text-sm text-slate-400 max-w-md mx-auto">
                {errorMessage || "Ocorreu um erro ao verificar sua permissão para esta imagem."}
              </p>
            </div>

            <button
              onClick={verifyShareToken}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-6 rounded-2xl transition-all inline-flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
            >
              <span>Tentar Novamente</span>
            </button>
          </div>
        )}

        {/* State: Authorized Success */}
        {!loading && !errorType && shareData && (
          <div className="bg-slate-800/90 border border-slate-700 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-md animate-fade-in space-y-0">
            {/* Meta Bar */}
            <div className="bg-slate-950/60 border-b border-slate-700/80 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <CheckCircle2 size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {shareData.patientName || "Imagem do Paciente"}
                  </h3>
                  <p className="text-xs text-emerald-400 font-medium">
                    Acesso Autenticado & Verificado no Grupo
                  </p>
                </div>
              </div>

              <button
                onClick={handleOpenApp}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2 px-4 rounded-xl transition-all flex items-center gap-2"
              >
                <ExternalLink size={14} />
                <span>Abrir no App</span>
              </button>
            </div>

            {/* Image Box */}
            <div className="p-4 sm:p-6 bg-slate-950/40 flex items-center justify-center min-h-[300px]">
              <img
                src={shareData.mediaUrl}
                alt={shareData.alt || "Imagem de Paciente"}
                className="max-h-[70vh] w-auto rounded-2xl object-contain shadow-2xl border border-slate-700/50"
              />
            </div>

            {/* Footer Notice */}
            <div className="bg-slate-900 px-6 py-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5 text-slate-300">
                <Lock size={12} className="text-emerald-400" />
                <span>Link protegido do seu domínio (Sem exposição pública)</span>
              </span>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="max-w-3xl w-full mx-auto py-4 text-center text-xs text-slate-400 border-t border-slate-800/60">
        <p>Sistema Médico de Gestão - Acesso Restrito aos Membros Autorizados</p>
      </footer>
    </div>
  );
}
