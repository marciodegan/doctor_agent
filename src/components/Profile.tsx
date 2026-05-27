import React, { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { useGroup } from "../contexts/GroupContext";
import { db } from "../lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { Camera, Loader2, Check, User as UserIcon, X, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { APP_VERSION } from "../lib/versionCheck";

export function Profile({ onHose, installPrompt, onInstall }: { onHose?: () => void, installPrompt?: any, onInstall?: () => void }) {
  const { user } = useAuth();
  const { updateProfile } = useGroup();
  const [displayName, setDisplayName] = useState("");
  const [photoURL, setPhotoURL] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState("");
  const [isStandalone, setIsStandalone] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    const checkPwaStatus = () => {
      const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
      setIsStandalone(isStandaloneMode);
      console.log("[PWA] App is standalone:", isStandaloneMode);

      const isAndroidOS = /Android/i.test(navigator.userAgent);
      setIsAndroid(isAndroidOS);
      console.log("[PWA] Running on Android:", isAndroidOS);
    };

    checkPwaStatus();
  }, []);

  const checkForAppUpdate = async () => {
    if (!("serviceWorker" in navigator)) {
      alert("Atualização não disponível neste navegador.");
      return;
    }

    try {
      setCheckingUpdate(true);
      setUpdateStatus("Verificando atualizações...");

      const registration = await navigator.serviceWorker.getRegistration();

      if (!registration) {
        setCheckingUpdate(false);
        setUpdateStatus("");
        alert("Nenhum registro de atualização encontrado para este PWA.");
        return;
      }

      let updateFound = false;
      const onUpdateFound = () => {
        updateFound = true;
        setUpdateStatus("Atualização encontrada. Atualizando app...");
      };
      registration.addEventListener('updatefound', onUpdateFound);

      await registration.update();

      // Wait a short duration to let service worker update state transitions run
      await new Promise((resolve) => setTimeout(resolve, 2000));

      registration.removeEventListener('updatefound', onUpdateFound);

      if (registration.waiting) {
        setUpdateStatus("Atualização encontrada. Atualizando app...");
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
        await new Promise((resolve) => setTimeout(resolve, 800));
        window.location.reload();
        return;
      } else if (registration.installing) {
        setUpdateStatus("Sincronizando novas funções...");
        registration.installing.addEventListener('statechange', (e: any) => {
          if (e.target.state === 'installed') {
            registration.waiting?.postMessage({ type: "SKIP_WAITING" });
            window.location.reload();
          }
        });
        return;
      }

      if (updateFound) {
        // Fallback reload if an update was found but bypasses normal state queries
        window.location.reload();
        return;
      }

      setUpdateStatus("Você já está usando a versão mais recente.");
      setTimeout(() => setUpdateStatus(""), 4000);
    } catch (error) {
      console.error("Erro ao verificar atualização:", error);
      alert("Não foi possível verificar atualizações agora. Tente novamente.");
    } finally {
      setCheckingUpdate(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    
    const fetchProfile = async () => {
      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setDisplayName(data.displayName || "");
          setPhotoURL(data.photoURL || "");
          setWhatsapp(data.whatsapp || "");
        }
      } catch (err) {
        console.error("Error fetching profile:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setSaving(true);
    setError("");
    setSuccess(false);
    
    try {
      await updateProfile(displayName, photoURL, whatsapp);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || "Erro ao salvar perfil");
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);
    setError("");

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = (reader.result as string).split(",")[1];
        
        const res = await fetch("/api/storage/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `avatars/${user.uid}_${Date.now()}.jpg`,
            mimeType: file.type,
            base64Data
          })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");

        setPhotoURL(data.url);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setError(err.message || "Erro no upload");
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="bg-white md:rounded-3xl p-6 md:border md:border-gray-100 md:shadow-xl md:shadow-blue-500/5 flex flex-col min-h-dvh md:min-h-0 md:max-h-[90vh] h-full md:h-auto overflow-y-auto md:overflow-hidden -webkit-overflow-scrolling-touch pt-[calc(3.25rem+1.5rem+env(safe-area-inset-top))] md:pt-6 pb-[calc(5rem+3rem+env(safe-area-inset-bottom))] md:pb-6 relative z-10">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <h3 className="font-black text-gray-900 tracking-tight">Meu Perfil</h3>
        {onHose && (
          <button onClick={onHose} className="p-2 hover:bg-gray-100 rounded-xl transition-all text-gray-400">
            <X size={20} />
          </button>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6 overflow-y-visible md:overflow-y-auto custom-scrollbar flex-1 md:pr-2 md:pb-2">
        <div className="flex flex-col items-center">
          <div className="relative group">
            <div className="w-24 h-24 rounded-full bg-gray-100 border-4 border-white shadow-lg overflow-hidden flex items-center justify-center text-gray-400">
              {photoURL ? (
                <img src={photoURL} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <UserIcon size={40} />
              )}
              
              {uploading && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white">
                  <Loader2 className="animate-spin" size={20} />
                </div>
              )}
            </div>
            
            <label className="absolute bottom-0 right-0 p-2 bg-blue-600 text-white rounded-full shadow-lg border-2 border-white cursor-pointer hover:bg-blue-700 transition-all">
              <Camera size={14} />
              <input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} disabled={uploading} />
            </label>
          </div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-4">Foto do Perfil</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 px-1">Nome de Exibição</label>
            <input 
              type="text"
              placeholder="Seu nome"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 px-4 py-3 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm"
              required
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 px-1">WhatsApp</label>
            <input 
              type="text"
              placeholder="(00) 00000-0000"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 px-4 py-3 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 px-1">Email (Somente leitura)</label>
            <input 
              type="email"
              value={user?.email || ""}
              disabled
              className="w-full bg-gray-50 border border-gray-100 px-4 py-3 rounded-2xl text-sm font-medium text-gray-400 outline-none cursor-not-allowed italic"
            />
          </div>
        </div>

        {error && <p className="text-xs text-red-500 font-bold px-1">{error}</p>}

        <button 
          type="submit"
          disabled={saving || uploading}
          className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 active:scale-95 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="animate-spin" size={20} />
          ) : success ? (
            <Check size={20} />
          ) : (
            "SALVAR ALTERAÇÕES"
          )}
        </button>

        {/* PWA Update Section */}
        <div className="border-t border-gray-100 pt-6 mt-6 space-y-4">
          <div className="flex justify-between items-start px-1 gap-4">
            <div className="flex flex-col gap-1 pr-2">
              <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Atualização do Aplicativo</h4>
              <p className="text-xs text-gray-500 leading-relaxed">
                Verifique se você está usando a versão mais recente do Dr. Agent com todos os novos recursos e otimizações.
              </p>
            </div>
            <div className="text-right shrink-0">
              <span className="text-[10px] uppercase font-black tracking-wider text-gray-400 block mb-0.5">Versão</span>
              <span className="text-xs font-black bg-blue-50 text-blue-600 border border-blue-100 px-2.5 py-1 rounded-full inline-block">
                v{APP_VERSION}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={checkForAppUpdate}
            disabled={checkingUpdate}
            className="w-full bg-slate-50 border border-slate-200 text-slate-700 font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 hover:bg-slate-100 hover:text-slate-900 transition-all active:scale-[0.98] disabled:opacity-60 cursor-pointer"
          >
            {checkingUpdate ? (
              <Loader2 className="animate-spin text-blue-600" size={17} />
            ) : (
              <RefreshCw size={17} className="text-slate-500" />
            )}
            {checkingUpdate ? "Verificando..." : "ATUALIZAR APP"}
          </button>

          {updateStatus && (
            <p className="text-xs text-center font-semibold text-blue-600 animate-pulse px-2">
              {updateStatus}
            </p>
          )}
        </div>

        {/* PWA Install Section */}
        {!isStandalone && (
          <div className="border-t border-gray-100 pt-6 mt-6 space-y-4">
            <div className="flex flex-col gap-1 px-1">
              <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Instalação do Aplicativo</h4>
              <p className="text-xs text-gray-500 leading-relaxed">
                Adicione o Dr. Agent à tela inicial do seu celular para acesso rápido offline, melhor desempenho e visualização em tela cheia.
              </p>
            </div>

            {installPrompt ? (
              <button
                type="button"
                onClick={() => {
                  console.log("[PWA] Install button clicked");
                  if (onInstall) onInstall();
                }}
                className="w-full bg-blue-600 border border-blue-600 text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 hover:bg-blue-700 hover:border-blue-700 transition-all active:scale-[0.98] cursor-pointer shadow-lg shadow-blue-100 text-sm tracking-wide"
              >
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                INSTALAR APLICATIVO
              </button>
            ) : isAndroid ? (
              <div className="bg-amber-50/50 border border-amber-100/80 rounded-2xl p-4 text-xs text-amber-800 leading-relaxed">
                <p className="font-bold flex items-center gap-1.5 mb-1 text-amber-900">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                  Como instalar no Android:
                </p>
                Para instalar, toque no botão <strong className="font-extrabold">⋮ (três pontos)</strong> no topo do navegador Chrome e selecione <strong className="font-semibold">"Instalar aplicativo"</strong> ou <strong className="font-semibold">"Adicionar à tela inicial"</strong>.
              </div>
            ) : null}
          </div>
        )}
      </form>
    </div>
  );
}
