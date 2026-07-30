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
  Smartphone,
  ExternalLink,
  Share2,
  Copy,
  User
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useGroup } from "../contexts/GroupContext";
import { PatientProfileSheet } from "../components/PatientProfileSheet";
import { generatePatientReport } from "../lib/patientReport";

interface PatientSharePageProps {
  token: string;
}

export default function PatientSharePage({ token }: PatientSharePageProps) {
  const { isAuthenticated, user, login, logout } = useAuth();
  const { setActiveGroupId } = useGroup();

  const [loading, setLoading] = useState(true);
  const [patientData, setPatientData] = useState<any>(null);
  const [errorType, setErrorType] = useState<
    "unauthenticated" | "access_denied" | "not_found" | "server_error" | null
  >(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [copied, setCopied] = useState(false);

  const verifyPatientShareToken = async () => {
    if (!token) {
      setErrorType("not_found");
      setErrorMessage("Link de compartilhamento de paciente inválido.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorType(null);
    setErrorMessage("");

    try {
      const res = await fetch("/api/share/patient/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
        credentials: "include",
      });

      const data = await res.json();

      if (res.status === 401 || data.error === "unauthenticated") {
        setErrorType("unauthenticated");
        setErrorMessage(data.message || "Você precisa estar autenticado para visualizar o paciente.");
        setLoading(false);
        return;
      }

      if (res.status === 403 || data.error === "access_denied") {
        setErrorType("access_denied");
        setErrorMessage(
          data.message ||
            `Sua conta (${user?.email || "conectada"}) não pertence ao grupo responsável por este paciente.`
        );
        setLoading(false);
        return;
      }

      if (res.status === 404 || data.error === "not_found") {
        setErrorType("not_found");
        setErrorMessage(data.message || "O link deste paciente não foi encontrado ou foi removido.");
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setErrorType("server_error");
        setErrorMessage("Não foi possível verificar as permissões do grupo no momento.");
        setLoading(false);
        return;
      }

      setPatientData(data);
      if (data.groupId) {
        setActiveGroupId(data.groupId);
      }
      setLoading(false);
    } catch (err: any) {
      console.error("[PatientSharePage] Verification error:", err);
      setErrorType("server_error");
      setErrorMessage("Erro de conexão ao validar o link do paciente.");
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated === false) {
      setErrorType("unauthenticated");
      setErrorMessage("Você precisa estar conectado para acessar a ficha do paciente.");
      setLoading(false);
    } else if (isAuthenticated === true && user) {
      verifyPatientShareToken();
    }
  }, [token, isAuthenticated, user]);

  const handleOpenApp = () => {
    if (patientData?.groupId) {
      setActiveGroupId(patientData.groupId);
    }
    window.location.href = "/app";
  };

  const handleCopyShareLink = async () => {
    const fullUrl = window.location.href;
    try {
      if (navigator.share && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        await navigator.share({
          title: `Ficha do Paciente - ${patientData?.patientName || "Paciente"}`,
          text: `Acesse a ficha de ${patientData?.patientName || "Paciente"} no app:`,
          url: fullUrl,
        });
        return;
      }
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (e) {
      console.warn("Share link error:", e);
    }
  };

  const isVideoUrl = (url?: string | null) => {
    if (!url) return false;
    return /\.(mp4|webm|ogg|mov|avi|m4v|hevc|h265|qt|quicktime|3gp|3gpp|mkv|ts)(\?.*)?$/i.test(url) || url.includes("video") || url.includes("hevc") || url.includes("h265");
  };

  const isPdfUrl = (url?: string | null) => {
    if (!url) return false;
    return /\.pdf(\?.*)?$/i.test(url) || url.includes("application/pdf");
  };

  const handleDirectCommand = (cmd: string) => {
    if (patientData?.groupId) {
      setActiveGroupId(patientData.groupId);
    }
    // Redirect to main app with command if needed
    window.location.href = "/app";
  };

  return (
    <div className="min-h-dvh bg-slate-900 text-slate-100 flex flex-col justify-between p-3 sm:p-6 md:p-8 font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Header */}
      <header className="max-w-4xl w-full mx-auto flex items-center justify-between py-3 border-b border-slate-800 gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
            <Shield size={20} />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-white tracking-tight leading-tight">
              Ficha Restrita do Paciente
            </h1>
            <p className="text-xs text-slate-400">Acesso seguro exclusivo para membros do grupo</p>
          </div>
        </div>

        {user && (
          <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700/60 rounded-full px-3 py-1.5 text-xs text-slate-300">
            <UserCheck size={14} className="text-emerald-400 shrink-0" />
            <span className="max-w-[120px] sm:max-w-[200px] truncate">{user.email}</span>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="max-w-3xl w-full mx-auto my-auto py-6">
        {/* Loading State */}
        {loading && (
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-3xl p-8 sm:p-12 text-center shadow-2xl backdrop-blur-md animate-fade-in">
            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 animate-spin">
              <Loader2 size={32} />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Validando Credenciais e Acesso ao Paciente</h2>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              Verificando se você possui autorização do grupo para acessar as informações médicas e arquivos deste paciente...
            </p>
          </div>
        )}

        {/* State: Unauthenticated */}
        {!loading && errorType === "unauthenticated" && (
          <div className="bg-slate-800/80 border border-slate-700 rounded-3xl p-6 sm:p-10 text-center shadow-2xl backdrop-blur-md space-y-6 animate-fade-in">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Lock size={32} />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-black text-white tracking-tight">Autenticação Necessária</h2>
              <p className="text-sm text-slate-300 leading-relaxed max-w-md mx-auto">
                Este link dá acesso à ficha clínica e histórico do paciente. É necessário identificar-se para garantir o sigilo dos dados.
              </p>
            </div>

            <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-4 text-left text-xs text-slate-400 space-y-2 max-w-md mx-auto">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                <Smartphone size={16} />
                <span>Sessão PWA Mantida</span>
              </div>
              <p className="text-slate-300">
                Como este é um aplicativo PWA, após fazer login uma vez, sua sessão será reaproveitada nos próximos acessos.
              </p>
            </div>

            <div className="pt-2 max-w-sm mx-auto space-y-3">
              <button
                onClick={() => login()}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 px-6 rounded-2xl shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2.5 active:scale-[0.98] text-sm uppercase tracking-wider"
              >
                <Lock size={18} />
                <span>Entrar para Visualizar Ficha</span>
              </button>
            </div>
          </div>
        )}

        {/* State: Access Denied */}
        {!loading && errorType === "access_denied" && (
          <div className="bg-slate-800/80 border border-red-500/30 rounded-3xl p-6 sm:p-10 text-center shadow-2xl backdrop-blur-md space-y-6 animate-fade-in">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
              <ShieldAlert size={32} />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-black text-white tracking-tight">Acesso Negado ao Paciente</h2>
              <p className="text-sm text-slate-300 leading-relaxed max-w-md mx-auto">
                {errorMessage || "Sua conta não pertence ao grupo responsável por este paciente."}
              </p>
            </div>

            <div className="bg-slate-900/60 border border-red-500/20 rounded-2xl p-4 text-left text-xs text-slate-400 space-y-1.5 max-w-md mx-auto">
              <p className="text-slate-300 font-medium">Conta atual: <span className="text-white font-bold">{user?.email || "Desconhecida"}</span></p>
              <p className="text-slate-400">Se você possui outra conta cadastrada no grupo correto, alterne sua conta.</p>
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
              <User size={32} />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white">Paciente Não Encontrado</h2>
              <p className="text-sm text-slate-400 max-w-md mx-auto">
                {errorMessage || "Não localizamos os dados deste paciente ou o registro foi alterado."}
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
              <h2 className="text-xl font-bold text-white">Falha na Conexão</h2>
              <p className="text-sm text-slate-400 max-w-md mx-auto">
                {errorMessage || "Não foi possível carregar a ficha do paciente no momento."}
              </p>
            </div>

            <button
              onClick={verifyPatientShareToken}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-6 rounded-2xl transition-all inline-flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
            >
              <span>Tentar Novamente</span>
            </button>
          </div>
        )}

        {/* State: Authorized Success */}
        {!loading && !errorType && patientData && (
          <div className="space-y-4 animate-fade-in">
            {/* Top Toolbar */}
            <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-lg backdrop-blur-md">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <CheckCircle2 size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {patientData.patientName || "Ficha do Paciente"}
                  </h3>
                  <p className="text-xs text-emerald-400 font-medium">
                    Acesso Autenticado & Verificado no Grupo
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyShareLink}
                  className="bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold py-2 px-3 rounded-xl transition-all flex items-center gap-1.5"
                  title="Compartilhar link seguro deste paciente"
                >
                  <Share2 size={14} className="text-emerald-400" />
                  <span>{copied ? "Link Copiado!" : "Compartilhar Link"}</span>
                </button>

                <button
                  onClick={handleOpenApp}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2 px-3.5 rounded-xl transition-all flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
                >
                  <ExternalLink size={14} />
                  <span>Abrir no App</span>
                </button>
              </div>
            </div>

            {/* Patient Profile Sheet Component Container */}
            <div className="bg-white rounded-3xl p-2 sm:p-4 text-slate-900 shadow-2xl overflow-hidden border border-slate-200">
              <PatientProfileSheet
                msg={{
                  role: "model",
                  text: generatePatientReport(patientData.reportData),
                  isProfile: true,
                  reportData: patientData.reportData,
                  profileData: patientData.profileData,
                }}
                allStatuses={patientData.allStatuses || []}
                allHospitals={patientData.allHospitals || []}
                handleSend={(e, cmd) => handleDirectCommand(cmd)}
                handleDirectCommand={handleDirectCommand}
                setConfirmCommand={() => {}}
                isVideoUrl={isVideoUrl}
                isPdfUrl={isPdfUrl}
              />
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="max-w-4xl w-full mx-auto py-3 text-center text-xs text-slate-400 border-t border-slate-800/60">
        <p>Sistema Médico de Gestão - Acesso Restrito aos Membros Autorizados</p>
      </footer>
    </div>
  );
}
