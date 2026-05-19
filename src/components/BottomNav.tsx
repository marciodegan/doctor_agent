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
      id: "agenda",
      label: "Agenda",
      icon: <CalendarDays size={20} />,
      prompt: "/agenda",
    },
    {
      id: "notes",
      label: "Notas",
      icon: <StickyNote size={20} />,
      prompt: "/notes",
    },
  ];

  if (isPersonal) {
    tabs.push({
      id: "shopping_list",
      label: "Lista",
      icon: <ShoppingCart size={20} />,
      prompt: "/shopping_list",
    });
  }

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
      style={{ bottom: 'calc(var(--safe-bottom) + 12px)' }}
      className="fixed left-1/2 lg:left-[calc(8rem+50vw)] -translate-x-1/2 z-[60] w-[calc(100%-32px)] max-w-md transition-all duration-300"
    >
      <div className="h-14 sm:h-16 flex items-center justify-around px-3 bg-white border border-gray-100 rounded-[28px] shadow-[0_12px_35px_rgba(15,23,42,0.12)]">
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
                  mainElement.scrollTo({ top: 0, behavior: "smooth" });
                }
                if (tab.action) {
                  tab.action();
                } else {
                  onNavigate(tab.id, (tab as any).prompt);
                }
              }}
              className="flex flex-col items-center justify-center gap-0.5 sm:gap-1 min-w-[64px] relative group px-1"
            >
              <AnimatePresence>
                {isActive && (
                  <motion.div
                    layoutId="nav-pill"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="absolute inset-0 bg-blue-50/50 rounded-2xl -z-10"
                    transition={{ type: "spring", bounce: 0.3, duration: 0.6 }}
                  />
                )}
              </AnimatePresence>

              <motion.div
                animate={{
                  scale: isActive ? 1.15 : 1,
                  color: isActive ? "#2563eb" : "#9ca3af",
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
                className={`text-[9px] font-black uppercase tracking-tight transition-colors duration-200 truncate max-w-[60px] text-center ${
                  isActive ? "text-blue-600" : "text-gray-400"
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