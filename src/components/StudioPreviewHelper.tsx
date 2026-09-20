import React, { useState, useEffect } from "react";
import { ExternalLink, Sparkles, Layers, ChevronUp, ChevronDown, Monitor } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

export function StudioPreviewHelper() {
  const { isDemoMode, enableDemoMode, disableDemoMode } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname);
  const [isIframe, setIsIframe] = useState(false);

  useEffect(() => {
    setIsIframe(typeof window !== "undefined" && window.self !== window.top);
    const updatePath = () => setCurrentPath(window.location.pathname);
    window.addEventListener("popstate", updatePath);
    return () => window.removeEventListener("popstate", updatePath);
  }, []);

  const navigateTo = (path: string) => {
    window.history.pushState(null, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const openNewTab = () => {
    window.open(window.location.href, "_blank");
  };

  // Only render in iframe or development environment
  if (!isIframe && !(import.meta as any).env?.DEV) {
    return null;
  }

  return (
    <aside
      aria-label="Studio Preview Helper"
      className="fixed bottom-3 right-3 z-[9999] font-sans"
    >
      <div className="bg-slate-900/95 text-white backdrop-blur-md border border-slate-700/80 rounded-2xl shadow-2xl p-2.5 flex flex-col gap-2 min-w-[240px] max-w-[320px] transition-all duration-200">
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-1.5 text-xs font-bold text-blue-400">
            <Monitor size={14} className="text-blue-400 shrink-0" />
            <span>AI Studio Preview Helper</span>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition text-xs flex items-center"
            title={isOpen ? "Recolher" : "Expandir"}
            aria-label={isOpen ? "Recolher" : "Expandir"}
          >
            {isOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>

        {isOpen && (
          <div className="flex flex-col gap-2 pt-1 border-t border-slate-800 text-xs">
            {/* Page switcher */}
            <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => navigateTo("/")}
                className={`flex-1 py-1.5 px-2 rounded-lg font-semibold transition text-center ${
                  currentPath === "/" ? "bg-blue-600 text-white shadow-sm" : "text-slate-300 hover:text-white hover:bg-slate-700"
                }`}
              >
                Landing
              </button>
              <button
                type="button"
                onClick={() => navigateTo("/app")}
                className={`flex-1 py-1.5 px-2 rounded-lg font-semibold transition text-center ${
                  currentPath === "/app" ? "bg-blue-600 text-white shadow-sm" : "text-slate-300 hover:text-white hover:bg-slate-700"
                }`}
              >
                App (/app)
              </button>
            </div>

            {/* Demo mode quick button */}
            <button
              type="button"
              onClick={() => {
                if (isDemoMode) {
                  disableDemoMode();
                } else {
                  enableDemoMode();
                }
              }}
              className={`flex items-center justify-between px-3 py-2 rounded-xl font-semibold transition ${
                isDemoMode
                  ? "bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/30"
                  : "bg-blue-600/20 text-blue-300 border border-blue-500/30 hover:bg-blue-600/30"
              }`}
            >
              <div className="flex items-center gap-2">
                <Sparkles size={14} />
                <span>{isDemoMode ? "Prévia Médica Ativa" : "Ativar Modo Prévia"}</span>
              </div>
              <span className="text-[10px] uppercase tracking-wider bg-white/10 px-1.5 py-0.5 rounded font-black">
                {isDemoMode ? "ON" : "OFF"}
              </span>
            </button>

            {/* Open in new tab button */}
            <button
              type="button"
              onClick={openNewTab}
              className="flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-xl font-medium transition"
              title="Abrir em nova aba para contornar bloqueios de popups ou cookies de iframe"
            >
              <ExternalLink size={13} />
              <span>Abrir em Nova Aba</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
