import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "./hooks/useAuth";
import { auth } from "./lib/firebase";
import { useGroup } from "./contexts/GroupContext";
import { Chat } from "./components/Chat";
import { Calendar as FirestoreCalendar } from "./components/Calendar";
import { GoogleAgenda } from "./components/GoogleAgenda";
import { Debug } from "./components/Debug";
import { Pricing } from "./components/Pricing";
import { GroupSelector } from "./components/GroupSelector";
import { Profile } from "./components/Profile";
import { 
  Calendar, 
  CalendarDays,
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
  Users,
  User,
  Zap,
  TrendingUp,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Settings,
  Lock,
  Loader2,
  Stethoscope,
  PowerOff
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { BottomNav } from "./components/BottomNav";

import { TeamManagement } from "./components/TeamManagement";
import { PersonalDocuments } from "./components/PersonalDocuments";
import { PatientLogs } from "./components/PatientLogs";
import { ShoppingList } from "./components/ShoppingList";
import { PersonalNotes } from "./components/PersonalNotes";

type NavView = "workspace" | "pricing" | "calendar" | "agenda" | "logs" | "shopping_list" | "notes";

export default function App() {
  const { isAuthenticated, user, login, logout } = useAuth();
  const { 
    activeGroup, 
    companyName,
    setIsManagementOpen, 
    setManagementMode, 
    setConfigsActiveTab,
    activeGroupMembers,
    toggleGroupStatus
  } = useGroup();

  const currentUserMember = activeGroupMembers.find(m => m.userId === user?.uid);
  const isOwner = activeGroup?.createdBy === user?.uid;
  const isAdmin = isOwner || currentUserMember?.role === "owner";
  const [isDebug, setIsDebug] = useState(window.location.hash === "#debug");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [currentView, setCurrentView] = useState<NavView | null>("agenda");
  const [activePatientId, setActivePatientId] = useState<string | null>(null);
  const [activePatientName, setActivePatientName] = useState<string | null>(null);
  const [activePatientProcedure, setActivePatientProcedure] = useState<string | null>(null);
  const [activePatientHospitalId, setActivePatientHospitalId] = useState<string | null>(null);
  const [activePatientType, setActivePatientType] = useState<string | null>(null);
  const [activePatientSala, setActivePatientSala] = useState<string | null>(null);
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileGroupsOpen, setIsMobileGroupsOpen] = useState(false);
  
  const [showSecurityInfo, setShowSecurityInfo] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showHeader, setShowHeader] = useState(true);
  const mainRef = useRef<HTMLElement | null>(null);

  const navigateAndAction = (view: NavView, command?: string, patientId?: string, patientName?: string, procedure?: string, hospitalId?: string, type?: string, sala?: string) => {
    setCurrentView(view);
    setIsMobileMenuOpen(false);
    setActivePatientId(patientId || null);
    setActivePatientName(patientName || null);
    setActivePatientProcedure(procedure || null);
    setActivePatientHospitalId(hospitalId || null);
    setActivePatientType(type || null);
    setActivePatientSala(sala || null);
    
    if (command) {
      setPendingCommand(command);
    } else {
      setPendingCommand(null);
    }

    // Always show the header when navigating
    setShowHeader(true);
    
    // Force scroll to top regardless of view change
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const mainElement = document.querySelector("main");
    if (mainElement) {
      mainElement.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Handle header show/hide scroll behavior
  useEffect(() => {
    const mainElement = mainRef.current;
    if (!mainElement) return;

    let lastScrollTop = 0;
    const threshold = 15; // px threshold before triggering hide/show
    const topZone = 60; // always show header if within 60px of the top

    const handleScroll = () => {
      const currentScrollTop = mainElement.scrollTop;

      // Always show near the top of the container
      if (currentScrollTop <= topZone) {
        setShowHeader(true);
        lastScrollTop = currentScrollTop;
        return;
      }

      // Check threshold of movement before toggling
      const delta = currentScrollTop - lastScrollTop;
      if (Math.abs(delta) < threshold) {
        return;
      }

      if (delta > 0) {
        // Scrolling down -> hide
        setShowHeader(false);
      } else {
        // Scrolling up -> show
        setShowHeader(true);
      }

      lastScrollTop = currentScrollTop;
    };

    mainElement.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      mainElement.removeEventListener("scroll", handleScroll);
    };
  }, []);

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

  // Effect to scroll to top when view changes or patient changes
  useEffect(() => {
    const scrollToTop = () => {
      window.scrollTo({ top: 0, behavior: 'instant' });
      const mainElement = document.querySelector("main");
      if (mainElement) {
        mainElement.scrollTo({ top: 0, behavior: 'instant' });
      }
    };
    
    // Immediate scroll
    scrollToTop();
    
    // Brief delay to handle AnimatePresence transitions and dynamic content loading
    const timer = setTimeout(scrollToTop, 50);
    const timer2 = setTimeout(scrollToTop, 150);
    
    return () => {
      clearTimeout(timer);
      clearTimeout(timer2);
    };
  }, [currentView, activePatientId, activePatientName]);

  useEffect(() => {
    const handleBeforeInstall = (e: any) => {
      console.log("[PWA] beforeinstallprompt event fired");
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    
    // Check if running as PWA
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    console.log("[PWA] Running as PWA:", isPWA);
    
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
          <p className="text-gray-400 font-medium tracking-tight">Initializing {companyName}...</p>
        </div>
      </div>
    );
  }

  const handleGroupSelection = () => {
    setCurrentView("agenda");
    setIsMobileGroupsOpen(false);
    setIsMobileMenuOpen(false);
    setIsManagementOpen(false);
    const mainElement = document.querySelector("main");
    if (mainElement) mainElement.scrollTop = 0;
  };

  if (isAuthenticated && !activeGroup) {
    return (
      <div className="min-h-screen bg-[#FDFDFD] flex items-center justify-center p-6">
        <GroupSelector onSelect={handleGroupSelection} />
      </div>
    );
  }

  return (
    <div 
      style={{
        "--header-offset": showHeader ? "var(--header-offset-static)" : "var(--safe-top)"
      } as React.CSSProperties}
      className="h-full flex flex-col bg-[#FDFDFD] text-gray-900 font-sans selection:bg-blue-100 selection:text-blue-900 overflow-hidden"
    >
      {/* Top Header - Both Mobile and Desktop */}
      <header 
        style={{ 
          height: 'var(--header-offset-static)', 
          paddingTop: 'var(--safe-top)',
          transform: showHeader ? 'translateY(0)' : 'translateY(-100%)',
          opacity: showHeader ? 1 : 0
        }}
        className={`fixed top-0 left-0 lg:left-64 right-0 bg-white/80 backdrop-blur-md border-b border-gray-100 z-40 transition-all duration-300 ease-in-out ${isFullscreen ? 'hidden' : ''}`}
      >
        <div className="h-full w-full flex items-center justify-center px-4 relative">
          {/* Left Toggle - Mobile Only */}
          <div className="absolute left-4 flex items-center lg:hidden">
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 text-gray-500 hover:text-blue-600 transition-colors"
            >
              <Menu size={24} />
            </button>
          </div>

          {/* Centered Logo */}
          <div className="flex items-center gap-2 pointer-events-none">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-blue-200">
              <Stethoscope size={14} />
            </div>
            <span className="font-bold text-lg tracking-tight text-blue-600 whitespace-nowrap">Dr. Agent</span>
          </div>

          <div className="absolute right-4 flex items-center gap-2">
            <button 
              onClick={() => setIsMobileGroupsOpen(true)}
              className="p-2 text-gray-500 hover:text-blue-600 transition-colors flex items-center gap-1"
            >
              <Users size={20} />
              {activeGroup && <div className="w-1.5 h-1.5 bg-blue-50 rounded-full"></div>}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Drawer */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[60] lg:hidden"
            />
            <motion.aside 
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}
              className="fixed left-0 top-0 bottom-0 w-72 bg-white z-[70] flex flex-col p-6 lg:hidden"
            >
              <div className="flex items-center justify-between mb-10">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-blue-200">
                    <Stethoscope size={18} />
                  </div>
                  <h1 className="font-bold text-xl tracking-tight text-blue-600">Dr. Agent</h1>
                </div>
                <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 text-gray-400">
                  <X size={20} />
                </button>
              </div>

              <nav className="flex-1 space-y-1">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 mb-4">Workspace</div>
                <NavItem 
                  icon={activeGroup?.groupType === "personal" ? <FileText size={18} /> : <Layout size={18} />} 
                  label={activeGroup?.groupType === "personal" ? "Documentos" : "Agent Dashboard"} 
                  active={currentView === "workspace"} 
                  onClick={() => navigateAndAction("workspace")}
                />
                <NavItem 
                  icon={<Calendar size={18} />} 
                  label="Calendário" 
                  active={currentView === "calendar"}
                  onClick={() => navigateAndAction("calendar")}
                />
                <NavItem 
                  icon={<Calendar size={18} className="text-emerald-500" />} 
                  label="Agenda" 
                  active={currentView === "agenda"}
                  onClick={() => navigateAndAction("agenda")}
                />
                <NavItem icon={<FileText size={18} />} label="Drive & Files" />
                
                <div className="pt-8 space-y-1">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 mb-4">Account</div>
                  <NavItem 
                    icon={<Zap size={18} className="text-blue-600" />} 
                    label="Assinatura Pro" 
                    active={currentView === "pricing"}
                    onClick={() => navigateAndAction("pricing")}
                  />
                  <NavItem 
                    icon={<User size={18} />} 
                    label="Meu Perfil" 
                    onClick={() => {
                      setShowProfile(true);
                      setIsMobileMenuOpen(false);
                    }}
                  />
                </div>
              </nav>

              <div className="mt-auto">
                <button 
                  onClick={logout}
                  className="flex items-center gap-3 w-full p-3 text-sm text-gray-500 hover:text-red-600 transition-colors bg-gray-50 rounded-2xl"
                >
                  <LogOut size={16} />
                  <span className="font-medium">Disconnect</span>
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Mobile Groups & Info Drawer */}
      <AnimatePresence>
        {isMobileGroupsOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileGroupsOpen(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[60] lg:hidden"
            />
            <motion.div 
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}
              className="fixed right-0 top-0 bottom-0 w-[85%] max-w-sm bg-white z-[70] flex flex-col overflow-y-auto lg:hidden"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
                <div className="flex items-center gap-2">
                  <Users size={18} className="text-blue-600" />
                  <h2 className="font-bold text-lg">Ambientes</h2>
                </div>
                <button onClick={() => setIsMobileGroupsOpen(false)} className="p-2 text-gray-400">
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-8">
                <motion.div 
                  onClick={() => navigateAndAction("pricing")}
                  className="bg-blue-600 rounded-3xl p-6 text-white cursor-pointer hover:bg-blue-700 transition-all border border-blue-500 shadow-xl shadow-blue-100"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-2 bg-white/20 rounded-xl">
                      <Zap size={20} />
                    </div>
                  </div>
                  <h4 className="font-bold text-sm mb-1">Dr. Agent Business</h4>
                  <p className="text-[10px] text-blue-50 mb-4 line-clamp-2">Acesso total a automações, IA avançada e relatórios personalizados.</p>
                  <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-widest">
                    <span>Assinar agora</span>
                    <TrendingUp size={14} />
                  </div>
                </motion.div>

                <div className="bg-white border border-gray-100 rounded-2xl p-4">
                  <GroupSelector onSelect={handleGroupSelection} />
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Sidebar - Desktop Only */}
      <aside 
        style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}
        className="fixed left-0 top-0 bottom-0 w-64 bg-white border-r border-gray-100 hidden lg:flex flex-col p-6 z-50"
      >
        <div className="flex items-center justify-between mb-10 px-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-blue-200">
              <Stethoscope size={18} />
            </div>
            <h1 className="font-bold text-xl tracking-tight text-blue-600 truncate max-w-[140px]">Dr. Agent</h1>
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 mb-4">Workspace</div>
          <NavItem 
            icon={activeGroup?.groupType === "personal" ? <FileText size={18} /> : <Layout size={18} />} 
            label={activeGroup?.groupType === "personal" ? "Documentos" : "Agent Dashboard"} 
            active={currentView === "workspace"} 
            onClick={() => navigateAndAction("workspace")}
          />
          <NavItem 
            icon={<Users size={18} />} 
            label="Equipe" 
            onClick={() => setIsManagementOpen(true)}
          />
          <NavItem 
            icon={<Calendar size={18} />} 
            label="Calendário" 
            active={currentView === "calendar"}
            onClick={() => navigateAndAction("calendar")}
          />
          <NavItem 
            icon={<Calendar size={18} className="text-emerald-500" />} 
            label="Agenda" 
            active={currentView === "agenda"}
            onClick={() => navigateAndAction("agenda")}
          />
          <NavItem icon={<FileText size={18} />} label="Drive & Files" />
          
          <div className="pt-8 space-y-1">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 mb-4">Account</div>
            <NavItem 
              icon={<Zap size={18} className="text-blue-600" />} 
              label="Assinatura Pro" 
              active={currentView === "pricing"}
              onClick={() => navigateAndAction("pricing")}
            />
            <NavItem 
              icon={<User size={18} />} 
              label="Meu Perfil" 
              onClick={() => setShowProfile(true)}
            />
            <NavItem 
              icon={<Settings size={18} />} 
              label="Configurações" 
              onClick={() => {
                setManagementMode("configs");
                setConfigsActiveTab("general");
                setIsManagementOpen(true);
              }}
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
      <main 
        ref={mainRef}
        style={{ 
          paddingTop: 'var(--header-offset-static)',
          paddingBottom: 'var(--bottom-offset)'
        }}
        className={`lg:pl-64 flex flex-col overflow-y-auto custom-scrollbar ${isFullscreen ? "fixed inset-0 z-[100] bg-white lg:pl-0 pt-0 pb-0" : "min-h-screen"}`}
      >
        
        {/* Global Modals (Settings, Security, Profile) */}
        <AnimatePresence>
          {showProfile && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="w-full max-w-sm"
              >
                <Profile 
                  onHose={() => setShowProfile(false)} 
                  installPrompt={installPrompt}
                  onInstall={handleInstall}
                />
              </motion.div>
            </motion.div>
          )}

          {showSecurityInfo && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-white p-6 flex flex-col items-center justify-center text-center backdrop-blur-md"
            >
              <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-6">
                <Lock size={32} />
              </div>
              <h4 className="text-xl font-black text-gray-900 mb-2 tracking-tight">Privacidade & Soberania</h4>
              <div className="space-y-4 text-sm text-gray-600 mb-10 max-w-xs mx-auto">
                <p className="flex items-start gap-3 text-left">
                  <Shield size={18} className="text-blue-500 shrink-0 mt-0.5" />
                  <span>Seus documentos do Drive e Calendar <strong>nunca</strong> são armazenados em nossos servidores.</span>
                </p>
                <p className="flex items-start gap-3 text-left">
                  <Shield size={18} className="text-blue-500 shrink-0 mt-0.5" />
                  <span>O acesso é feito via token oficial do Google (OAuth2) que expira automaticamente.</span>
                </p>
                <p className="flex items-start gap-3 text-left">
                  <Shield size={18} className="text-blue-500 shrink-0 mt-0.5" />
                  <span>A memória da IA é limpa automaticamente após cada tarefa de salvamento de dados.</span>
                </p>
              </div>
              <button 
                onClick={() => setShowSecurityInfo(false)}
                className="w-full max-w-[200px] py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all active:scale-95 shadow-xl shadow-blue-100"
              >
                Entendido
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Hero / Dashboard Area */}
        <div id="main-scroll-container" className={`p-2 sm:p-4 flex flex-col gap-6 w-full relative ${isFullscreen ? "h-screen overflow-hidden" : ""}`}>
          {(activeGroup?.active === false || activeGroup?.ativo === false) && (
            <div className="absolute inset-x-2 sm:inset-x-4 inset-y-2 sm:inset-y-4 z-[45] bg-white/60 backdrop-blur-md rounded-[2.5rem] flex items-center justify-center p-6 text-center">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white border border-gray-100 p-10 rounded-[32px] shadow-2xl max-w-sm space-y-6"
              >
                 <div className="w-20 h-20 bg-red-50 text-red-600 rounded-[2rem] flex items-center justify-center mx-auto shadow-inner shadow-red-100/50">
                   <PowerOff size={40} />
                 </div>
                 <div className="space-y-2">
                   <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tighter">Ambiente Desativado</h3>
                   <p className="text-sm text-gray-500 font-medium leading-relaxed">
                     Este grupo foi desativado. Nenhuma ação pode ser realizada até que receba permissão de um administrador.
                   </p>
                 </div>
                 {isAdmin ? (
                   <button 
                     onClick={() => {
                        if (confirm(`Deseja reativar o grupo "${activeGroup.name}"?`)) {
                          toggleGroupStatus(activeGroup.id, true);
                        }
                     }}
                     className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-sm uppercase tracking-widest shadow-xl shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                   >
                     <Zap size={18} />
                     Reativar Grupo
                   </button>
                 ) : (
                   <div className="pt-2">
                     <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-50 px-4 py-2 rounded-full border border-gray-100">Somente Administradores</span>
                   </div>
                 )}
              </motion.div>
            </div>
          )}
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
                  Connect your Google account to let {companyName} manage your schedule, documents, and tasks with AI.
                </p>
              </motion.div>

              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                onClick={login}
                className="flex items-center gap-4 bg-blue-600 text-white px-8 py-4 rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-2xl shadow-blue-500/20 active:scale-95"
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
              <div className="xl:col-span-3 flex flex-col">
                <div className="flex-1">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentView}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="w-full"
                    >
                      {currentView === "pricing" ? (
                        <Pricing onBack={() => navigateAndAction("workspace")} />
                      ) : currentView === "calendar" ? (
                        <FirestoreCalendar 
                          prefilledPatientName={activePatientName || undefined} 
                          prefilledProcedure={activePatientProcedure || undefined}
                          prefilledHospitalId={activePatientHospitalId || undefined}
                          prefilledType={activePatientType || undefined}
                          prefilledSala={activePatientSala || undefined}
                        />
                      ) : currentView === "agenda" ? (
                        <GoogleAgenda />
                      ) : currentView === "shopping_list" ? (
                        <ShoppingList />
                      ) : currentView === "logs" && activePatientId ? (
                        <PatientLogs 
                          patientId={activePatientId} 
                          onBack={() => navigateAndAction("workspace")}
                          onSchedule={(name, proc, hospId) => navigateAndAction("calendar", undefined, activePatientId!, name, proc, hospId)}
                        />
                      ) : currentView === "notes" ? (
                        <PersonalNotes />
                      ) : activeGroup?.groupType === "personal" ? (
                        <PersonalDocuments />
                      ) : (
                        <Chat 
                          onNavigateToCalendar={() => navigateAndAction("calendar")} 
                          onViewLogs={(pid) => navigateAndAction("logs", undefined, pid)}
                          initialCommand={pendingCommand}
                          onCommandExecuted={() => setPendingCommand(null)}
                        />
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>

              {/* Sidebar - removed GroupSelector from right side as per request */}
              <div className="space-y-8 hidden xl:flex flex-col pt-24 pr-2">
                {/* Space reserved for other gadgets if needed, but GroupSelector is gone */}
              </div>
            </div>
          )}
        </div>
      </main>

      {!isFullscreen && isAuthenticated && activeGroup && (
        <BottomNav 
          currentView={currentView}
          onNavigate={(view, prompt) => navigateAndAction(view, prompt)}
          onOpenManagement={() => setIsManagementOpen(true)}
        />
      )}
      <TeamManagement />
    </div>
  );
}

function NavItem({ icon, label, active = false, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-3 w-full p-2.5 rounded-xl transition-all ${
      active 
        ? "bg-blue-600 text-white shadow-lg shadow-blue-200" 
        : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
    }`}>
      {icon}
      <span className="text-sm font-semibold">{label}</span>
      {active && <div className="ml-auto w-1.5 h-1.5 bg-white/40 rounded-full"></div>}
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
