import React, { useState } from "react";
import { APP_VERSION, VersionConfig } from "../lib/versionCheck";
import { ArrowUpCircle, X, ShieldAlert } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface VersionUpdateModalProps {
  config: VersionConfig;
  isOpen: boolean;
  onClose: () => void;
}

export function VersionUpdateModal({ config, isOpen, onClose }: VersionUpdateModalProps) {
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleUpdate = async () => {
    setLoading(true);
    try {
      // 1. Clear browser caches related to the app
      if ("caches" in window) {
        try {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map((name) => caches.delete(name)));
        } catch (e) {
          console.error("Failed to clear browser caches:", e);
        }
      }

      // 2. Unregister the current service worker
      if ("serviceWorker" in navigator) {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (const registration of registrations) {
            await registration.unregister();
          }
        } catch (e) {
          console.error("Failed to unregister service workers:", e);
        }
      }

      // 3. Reload the page forcing the new version query parameter
      const cleanUrl = window.location.href.split("?")[0];
      window.location.href = `${cleanUrl}?v=${config.latestVersion}`;
    } catch (err) {
      console.error("Error during reload update sequence:", err);
      // Fallback reload
      window.location.reload();
    } finally {
      setLoading(false);
    }
  };

  const handlePostpone = () => {
    // Store ignored version in localStorage
    localStorage.setItem("ignored_app_version", config.latestVersion);
    onClose();
  };

  const displayMessage =
    config.message ||
    "Existe uma nova versão do Dr. Agent disponível. Atualize para usar os novos recursos e melhorias.";

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: "spring", duration: 0.4 }}
          className="bg-white w-full max-w-md rounded-3xl overflow-hidden border border-gray-100 shadow-2xl flex flex-col p-6 relative max-h-[90vh]"
        >
          {/* Top subtle indicator */}
          <div className="flex flex-col items-center text-center mt-2 mb-4">
            <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4 shadow-sm shadow-blue-100">
              <ArrowUpCircle size={32} className="animate-bounce" />
            </div>
            
            <h3 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2">
              Atualização disponível
            </h3>
            
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-xs bg-gray-100 text-gray-500 font-bold px-2 py-0.5 rounded-full">
                v{APP_VERSION}
              </span>
              <span className="text-xs text-gray-400">→</span>
              <span className="text-xs bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full">
                v{config.latestVersion}
              </span>
            </div>
          </div>

          {/* Message Area */}
          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 mb-6 leading-relaxed text-sm text-gray-600 overflow-y-auto">
            {config.forceUpdate && (
              <div className="flex items-start gap-2 text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded-xl mb-3 text-xs font-semibold">
                <ShieldAlert size={16} className="shrink-0 mt-0.5" />
                <span>Atualização obrigatória recomendada pela equipe médica.</span>
              </div>
            )}
            <p className="whitespace-pre-line">{displayMessage}</p>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 shrink-0">
            <button
              onClick={handleUpdate}
              disabled={loading}
              className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl hover:bg-blue-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-200 disabled:opacity-75 cursor-pointer text-sm tracking-wide"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Instalando atualização...
                </>
              ) : (
                "ATUALIZAR AGORA"
              )}
            </button>

            {!config.forceUpdate && (
              <button
                onClick={handlePostpone}
                disabled={loading}
                className="w-full bg-slate-50 hover:bg-slate-150 border border-slate-200 text-slate-700 font-bold py-3.5 rounded-2xl active:scale-[0.98] transition-all disabled:opacity-75 cursor-pointer text-sm tracking-wide"
              >
                Depois
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
