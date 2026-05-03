import React, { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { Terminal, Shield, Globe, Cpu, AlertTriangle, RefreshCw } from "lucide-react";

export function Debug() {
  const { login } = useAuth();
  const [serverInfo, setServerInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/ping")
      .then(r => r.json())
      .then(setServerInfo)
      .catch(e => setServerInfo({ error: e.message }))
      .finally(() => setLoading(false));
  }, []);

  const browserInfo = {
    userAgent: navigator.userAgent,
    href: window.location.href,
    protocol: window.location.protocol,
    host: window.location.host,
    isIframe: window.self !== window.top,
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-green-400 font-mono p-4 md:p-10 text-sm overflow-auto">
      <div className="max-w-3xl mx-auto space-y-8">
        <header className="border-b border-green-900/50 pb-6 mb-10">
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Terminal className="text-green-500" />
            NEXUS_SYSTEM_DIAGNOSTIC
          </h1>
          <p className="text-zinc-500 mt-2 italic px-8">Verificação de integridade do OAuth e conexão</p>
        </header>

        <section className="space-y-4">
          <h2 className="text-xs uppercase tracking-widest text-zinc-500 font-bold flex items-center gap-2">
            <Globe size={14} /> Client_Environment
          </h2>
          <div className="bg-zinc-900/50 border border-green-900/20 rounded-lg p-6 space-y-2">
            <div><span className="text-zinc-500">HOST:</span> {browserInfo.host}</div>
            <div><span className="text-zinc-500">URL:</span> {browserInfo.href}</div>
            <div><span className="text-zinc-500">PROTO:</span> {browserInfo.protocol}</div>
            <div><span className="text-zinc-500">IFRAME:</span> {browserInfo.isIframe ? "TRUE (WARNING: Iframe detected)" : "FALSE"}</div>
            <div><span className="text-zinc-500">UA:</span> <span className="text-xs break-all">{browserInfo.userAgent}</span></div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xs uppercase tracking-widest text-zinc-500 font-bold flex items-center gap-2">
            <Cpu size={14} /> Server_Status
          </h2>
          <div className="bg-zinc-900/50 border border-green-900/20 rounded-lg p-6 space-y-2">
            {loading ? (
              <div className="flex items-center gap-2 animate-pulse">
                <RefreshCw size={14} className="animate-spin" /> Pinging server...
              </div>
            ) : (
              <>
                <div><span className="text-zinc-500">REPLY:</span> {JSON.stringify(serverInfo)}</div>
                {serverInfo?.env ? (
                  <div className="text-green-500 flex items-center gap-2">
                    <Shield size={14} /> CLIENT_ID detected in server environment
                  </div>
                ) : (
                  <div className="text-red-500 flex items-center gap-2">
                    <AlertTriangle size={14} /> CLIENT_ID MISSING! Check your Secrets.
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xs uppercase tracking-widest text-zinc-500 font-bold flex items-center gap-2">
            <Shield size={14} /> OAuth_Trigger_Test
          </h2>
          <div className="bg-zinc-900/50 border border-green-900/20 rounded-lg p-6 flex flex-col items-center gap-4">
            <button 
              onClick={login}
              className="px-6 py-3 bg-green-900/30 border border-green-500/50 rounded hover:bg-green-500 hover:text-zinc-950 transition-all font-bold w-full md:w-auto"
            >
              TRIGGER_OAUTH_FLOW
            </button>
            <p className="text-[10px] text-zinc-500 max-w-sm text-center">
              Ao clicar, as informações serão impressas no log do servidor. Verifique o Host e URI que aparecerão nos logs.
            </p>
          </div>
        </section>

        <footer className="pt-20 text-zinc-600 text-[10px] flex justify-between">
          <span>BUILD: 2026.05.03</span>
          <button onClick={() => window.location.hash = ""} className="hover:text-green-400">EXIT_DEBUG</button>
        </footer>
      </div>
    </div>
  );
}
