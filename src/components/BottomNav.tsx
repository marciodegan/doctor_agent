import React from "react";
import {
  MessageSquare,
  Calendar,
  CalendarDays,
  Users,
  Settings,
  FileText,
  ShoppingCart,
  StickyNote,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useGroup } from "../contexts/GroupContext";

interface BottomNavProps {
  currentView: string;
  onNavigate: (view: any, prompt?: string) => void;
  onOpenManagement: () => void;
}

export function BottomNav({
  currentView,
  onNavigate,
  onOpenManagement,
}: BottomNavProps) {
  const { activeGroup } = useGroup();
  const isPersonal = activeGroup?.groupType === "personal";

  const [isIosStandalone, setIsIosStandalone] = React.useState(false);

  React.useEffect(() => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                  (navigator.userAgent.includes("Mac") && "ontouchend" in document);
    const isStandalone = (window.navigator as any).standalone === true || 
                         window.matchMedia("(display-mode: standalone)").matches;
    if (isIOS && isStandalone) {
      setIsIosStandalone(true);
    }
  }, []);

  const bottomPadding = isIosStandalone ? "4px" : "8px";
  const topPadding = isIosStandalone ? "8px" : "10px";

  const tabs: any[] = [
    {
      id: "workspace",
      label: isPersonal ? "Doc" : "Pacientes",
      icon: isPersonal ? <FileText size={20} /> : <Users size={20} />,
      prompt: isPersonal ? "/drive" : "/pacientes",
    },
    {
      id: "calendar",
      label: "Calendário",
      icon: <Calendar size={20} />,
      prompt: "/open_calendar",
    },
    {
      id: "notes",
      label: "Notas",
      icon: <StickyNote size={20} />,
      prompt: "/notes",
    },
  ];



  tabs.push({
    id: "management",
    label: activeGroup?.name || "Equipe",
    icon: activeGroup?.photoURL ? (
      <img 
        src={activeGroup.photoURL} 
        className="w-7 h-7 rounded-xl object-cover border-2 border-white shadow-md"
        alt="Group"
      />
    ) : (
      <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400">
        <Users size={18} />
      </div>
    ),
    action: onOpenManagement,
  });

  return (
    <div 
  style={{
    bottom: 0,
    paddingBottom: bottomPadding,
  }}
  className="fixed left-0 right-0 lg:left-64 z-[60] w-full lg:w-[calc(100%-16rem)] glass-nav shadow-[0_-8px_32px_rgba(15,23,42,0.06)]"
>
  <div 
    style={{
      paddingTop: topPadding,
    }}
    className="flex items-center justify-around px-4 bg-transparent"
  >
        {tabs.map((tab, idx) => {
          const isActive = currentView === tab.id;
          const isEquipe = tab.id === "management";

          return (
            <button
              key={tab.id}
              id={tab.id === "management" ? "equipe-nav-button" : undefined}
              onClick={() => {
                const mainElement = document.querySelector("main");
                if (mainElement) {
                   mainElement.scrollTo({ top: 0, behavior: "instant" as any });
                   mainElement.scrollTop = 0;
                }
                if (tab.action) {
                  tab.action();
                } else {
                  onNavigate(tab.id, (tab as any).prompt);
                }
              }}
              className="flex flex-col items-center justify-center gap-0.5 sm:gap-1 min-w-[64px] relative group px-1 py-1"
            >
              <AnimatePresence>
                {isActive && (
                  <motion.div
                    layoutId="nav-pill"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="absolute inset-x-1 inset-y-0.5 bg-blue-100/60 border border-white/40 shadow-sm rounded-2xl -z-10"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                  />
                )}
              </AnimatePresence>

              <motion.div
                animate={{
                  scale: isActive ? 1.15 : 1,
                  color: isActive ? "#2563eb" : "#4b5563",
                }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="relative"
              >
                {isEquipe ? (
                  <div className="relative">
                    {tab.icon}
                    <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white shadow-sm" />
                  </div>
                ) : (
                  tab.icon
                )}
                {isActive && !isEquipe && (
                  <motion.div
                    layoutId="active-dot"
                    className="absolute -top-1 -right-1 w-2 h-2 bg-blue-600 rounded-full border-2 border-white shadow-sm"
                  />
                )}
              </motion.div>

              <span
                className={`text-[9px] font-black uppercase tracking-tight transition-colors duration-200 truncate max-w-[90px] text-center ${
                  isActive ? "text-blue-600" : "text-gray-500"
                }`}
              >
                {(tab.label).split(" ")[0]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}