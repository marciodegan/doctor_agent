import React, { useState, useEffect } from "react";
import { useAuth } from "./hooks/useAuth";
import { useGroup } from "./contexts/GroupContext";
import { Chat } from "./components/Chat";
import { Calendar as FirestoreCalendar } from "./components/Calendar";
import { Debug } from "./components/Debug";
import { Pricing } from "./components/Pricing";
import { GroupSelector } from "./components/GroupSelector";
import { 
  Calendar, 
  FileText, 
  Layout, 
  LogOut, 
  LogIn, 
  ShieldCheck,
  Command,
  Plus,
  Maximize,
  Minimize,
  Smartphone,
  Sparkles,
  Shield,
  Zap,
  TrendingUp
} from "lucide-react";
import { motion } from "motion/react";

export default function App() {
  const { isAuthenticated, login, logout } = useAuth();
  const { activeGroup } = useGroup();
  const [isDebug, setIsDebug] = useState(window.location.hash === "#debug");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [currentView, setCurrentView] = useState<"workspace" | "pricing" | "calendar">("workspace");
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);

  const navigateAndAction = (view: "workspace" | "calendar", command?: string) => {
    setCurrentView(view);
    if (command) {
      setPendingCommand(command);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      const doc = document as any;
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement || 
        doc.webkitFullscreenElement || 
        doc.mozFullScreenElement || 
        doc.msFullscreenElement
      );
      setIsFullscreen(isCurrentlyFullscreen);
    };

    const events = ["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange", "MSFullscreenChange"];
    events.forEach(event => document.addEventListener(event, handleFullscreenChange));
    
    return () => {
      events.forEach(event => document.removeEventListener(event, handleFullscreenChange));
    };
  }, []);

  useEffect(() => {
    const handleHashChange = () => setIsDebug(window.location.hash === "#debug");
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
  }, []);

  const toggleFullscreen = async () => {
    try {
      const doc = document.documentElement as any;
      const docWithPrefix = document as any;

      // Check if we are currently in native fullscreen
      const isNativeFS = !!(document.fullscreenElement || 
                          docWithPrefix.webkitFullscreenElement || 
                          docWithPrefix.mozFullScreenElement || 
                          docWithPrefix.msFullscreenElement);

      if (!isNativeFS && !isFullscreen) {
        const requestMethod = doc.requestFullscreen || 
                            doc.webkitRequestFullscreen || 
                            doc.mozRequestFullScreen || 
                            doc.msRequestFullscreen;
        
        if (requestMethod) {
          try {
            await requestMethod.call(doc);
            setIsFullscreen(true);
          } catch (e) {
            console.warn("[Fullscreen] Native request failed, falling back to windowed mode:", e);
            setIsFullscreen(true); // Windowed fallback
          }
        } else {
          setIsFullscreen(true); // Windowed fallback
        }
      } else {
        const exitMethod = document.exitFullscreen || 
                          docWithPrefix.webkitExitFullscreen || 
                          docWithPrefix.mozCancelFullScreen || 
                          docWithPrefix.msExitFullscreen;
        
        if (exitMethod && isNativeFS) {
          try {
            await exitMethod.call(document);
          } catch (e) {
            console.error("[Fullscreen] Exit error:", e);
          }
        }
        setIsFullscreen(false);
      }
    } catch (error) {
      console.error("[Fullscreen] Global error:", error);
      setIsFullscreen(!isFullscreen);
    }
  };

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallPrompt(null);
    }
  };

  if (isDebug) return <Debug />;

  console.log("[App] Rendering standard view. Auth:", isAuthenticated);

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600">
            <Layout size={32} />
          </div>
          <p className="text-gray-400 font-medium tracking-tight">Initializing Doctor Pro...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated && !activeGroup) {
    return (
      <div className="min-h-screen bg-[#FDFDFD] flex items-center justify-center p-6">
        <GroupSelector />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFDFD] text-gray-900 font-sans selection:bg-blue-100 selection:text-blue-900 pt-[calc(env(safe-area-inset-top,0px)+8px)]">
      {/* Sidebar - Desktop Only */}
      <aside className="fixed left-0 top-0 bottom-0 w-64 bg-white border-r border-gray-100 hidden lg:flex flex-col p-6 z-20">
        <div className="flex items-center gap-2 mb-10 px-2">
          <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center text-white">
            <Command size={18} />
          </div>
          <h1 className="font-bold text-xl tracking-tight">Doctor Pro</h1>
        </div>

        <nav className="flex-1 space-y-1">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 mb-4">Workspace</div>
          <NavItem 
            icon={<Layout size={18} />} 
            label="Agent Dashboard" 
            active={currentView === "workspace"} 
            onClick={() => setCurrentView("workspace")}
          />
          <NavItem 
            icon={<Calendar size={18} />} 
            label="Calendário" 
            active={currentView === "calendar"}
            onClick={() => setCurrentView("calendar")}
          />
          <NavItem icon={<FileText size={18} />} label="Drive & Files" />
          
          <div className="pt-8 space-y-1">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 mb-4">Account</div>
            <NavItem 
              icon={<Zap size={18} className="text-blue-600" />} 
              label="Assinatura Pro" 
              active={currentView === "pricing"}
              onClick={() => setCurrentView("pricing")}
            />
          </div>
        </nav>

        <div className="mt-auto px-2">
          {isAuthenticated ? (
            <button 
              onClick={logout}
              className="flex items-center gap-3 w-full p-2 text-sm text-gray-500 hover:text-red-600 transition-colors group"
            >
              <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center group-hover:bg-red-50 transition-colors">
                <LogOut size={16} />
              </div>
              <span className="font-medium">Disconnect</span>
            </button>
          ) : (
            <button 
              onClick={login}
              className="flex items-center gap-3 w-full p-2 text-sm text-blue-600 font-bold"
            >
              <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                <LogIn size={16} />
              </div>
              <span>Connect Google</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className={`lg:pl-64 flex flex-col ${isFullscreen ? "fixed inset-0 z-[100] bg-white lg:pl-0" : ""}`}>
        {/* Hero / Dashboard Area */}
        <div id="main-scroll-container" className={`p-2 sm:p-4 flex flex-col gap-6 w-full ${isFullscreen ? "h-screen overflow-hidden" : ""}`}>
          {!isAuthenticated ? (
            <div className="flex-1 flex flex-col items-center justify-center max-w-2xl mx-auto text-center space-y-8 w-full px-4">
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <h1 className="text-5xl font-black tracking-tighter text-gray-900 leading-none">
                  Your Workspace, <br />
                  <span className="text-blue-600">Simpler Than Ever.</span>
                </h1>
                <p className="text-gray-500 text-lg max-w-md mx-auto">
                  Connect your Google account to let Doctor Pro Agent manage your schedule, documents, and tasks with AI.
                </p>
              </motion.div>

              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                onClick={login}
                className="flex items-center gap-4 bg-black text-white px-8 py-4 rounded-2xl font-bold hover:bg-zinc-800 transition-all shadow-2xl shadow-blue-500/10 active:scale-95"
              >
                <div className="w-6 h-6 bg-white rounded-md flex items-center justify-center">
                  <svg viewBox="0 0 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                </div>
                <span>Connect your Workspace</span>
              </motion.button>
            </div>
          ) : (
            <div className={`grid grid-cols-1 xl:grid-cols-4 gap-6 h-full max-w-[1600px] mx-auto w-full ${isFullscreen ? "max-w-none" : ""}`}>
              {/* Chat column */}
              <div className="xl:col-span-3 flex flex-col min-h-0 overflow-hidden">
                <div className="flex-1 min-h-0">
                  {currentView === "pricing" ? (
                    <Pricing onBack={() => setCurrentView("workspace")} />
                  ) : currentView === "calendar" ? (
                    <FirestoreCalendar />
                  ) : (
                    <Chat 
                      onNavigateToCalendar={() => setCurrentView("calendar")} 
                      initialCommand={pendingCommand}
                      onCommandExecuted={() => setPendingCommand(null)}
                    />
                  )}
                </div>

                {/* Persistent Bottom Navigation */}
                <div className="px-4 py-3 flex flex-wrap gap-2 shrink-0 border-t bg-gray-50/50 backdrop-blur-sm">
                  {[
                    { label: "👤 Pacientes", prompt: "/pacientes", view: "workspace" as const },
                    { label: "📅 Calendário", prompt: "/open_calendar", view: "calendar" as const },
                    { label: "📅 Agenda", prompt: "/agenda", view: "workspace" as const },
                  ].map((s, i) => (
                    <button
                      key={i}
                      onClick={() => navigateAndAction(s.view, s.prompt)}
                      className={`text-[10px] font-bold px-3 py-1.5 border rounded-full transition-all uppercase tracking-wide shadow-sm ${
                        (s.view === currentView && (s.prompt !== "/open_calendar" || currentView === "calendar"))
                        ? "border-blue-600 text-blue-600 bg-blue-50" 
                        : "border-blue-600 text-blue-600 bg-white hover:bg-blue-50"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sidebar Info column */}
              <div className="space-y-8 hidden xl:block pr-2">
                <div className="bg-blue-600 rounded-3xl p-8 text-white shadow-xl shadow-blue-200">
                  <h3 className="text-xl font-bold mb-2">Doctor Pro Tips</h3>
                  <p className="text-blue-100 text-sm mb-6 leading-relaxed">
                    Try asking: "What's on my calendar today?" or "Create a new spreadsheet for my budget."
                  </p>
                  <div className="bg-white/10 rounded-2xl p-4 flex items-center gap-3 border border-white/10">
                    <div className="p-2 bg-white/20 rounded-lg">
                      <Sparkles size={20} />
                    </div>
                    <span className="text-xs font-medium">Gemini 3.1 Pro Powered</span>
                  </div>
                </div>

                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => setCurrentView("pricing")}
                  className="bg-zinc-900 rounded-3xl p-6 text-white cursor-pointer hover:bg-zinc-800 transition-all border border-zinc-700 group"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-2 bg-blue-600 rounded-xl group-hover:scale-110 transition-transform">
                      <Zap size={20} />
                    </div>
                    <div className="flex -space-x-2">
                       {[1,2,3].map(i => (
                         <div key={i} className="w-6 h-6 rounded-full border-2 border-zinc-900 bg-zinc-700" />
                       ))}
                    </div>
                  </div>
                  <h4 className="font-bold text-sm mb-1">Doctor Pro Business</h4>
                  <p className="text-[10px] text-zinc-400 mb-4 line-clamp-2">Acesso total a automações, IA avançada e relatórios personalizados.</p>
                  <div className="flex items-center gap-2 text-xs font-bold text-blue-400 uppercase tracking-widest">
                    <span>Assinar agora</span>
                    <TrendingUp size={14} />
                  </div>
                </motion.div>

                <div className="bg-white border border-gray-100 rounded-3xl p-6">
                  <GroupSelector />
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function NavItem({ icon, label, active = false, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-3 w-full p-2.5 rounded-xl transition-all ${
      active 
        ? "bg-black text-white shadow-lg shadow-black/10" 
        : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
    }`}>
      {icon}
      <span className="text-sm font-semibold">{label}</span>
      {active && <div className="ml-auto w-1.5 h-1.5 bg-blue-400 rounded-full"></div>}
    </button>
  );
}

function ServiceStatus({ label, active }: { label: string, active: boolean }) {
  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
      <div className="flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full ${active ? "bg-green-500" : "bg-gray-300"}`}></div>
        <span className="text-xs font-medium text-gray-700">{label}</span>
      </div>
      <div className="text-[10px] font-bold text-gray-400">REST API</div>
    </div>
  );
}
