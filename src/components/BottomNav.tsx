import React from "react";
import {
  MessageSquare,
  Calendar,
  CalendarDays,
  Users,
  Settings,
  FileText,
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

  const tabs = [
    {
      id: "workspace",
      label: isPersonal ? "Documentos" : "Pacientes",
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
      id: "management",
      label: "Equipe",
      icon: <Users size={18} />,
      action: onOpenManagement,
    },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[60] lg:hidden px-4 pb-4">
      <div className="relative h-16 sm:h-20 bg-white/95 backdrop-blur-3xl border border-gray-100 shadow-[0_20px_50px_rgba(37,99,235,0.15)] rounded-[28px] sm:rounded-3xl overflow-hidden flex items-center justify-around px-2">
        {tabs.map((tab, idx) => {
          const isActive = currentView === tab.id;
          const isEquipe = tab.id === "management";

          return (
            <button
              key={tab.label}
              id={tab.id === "management" ? "equipe-nav-button" : undefined}
              onClick={() =>
                tab.action
                  ? tab.action()
                  : onNavigate(tab.id, (tab as any).prompt)
              }
              className="flex flex-col items-center justify-center gap-0.5 sm:gap-1 min-w-[64px] relative group"
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
                    <Users size={20} />
                    {/* Status Dot for the whole team */}
                    <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full border border-white shadow-sm" />
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
                className={`text-[9px] font-black uppercase tracking-widest transition-colors duration-200 ${
                  isActive ? "text-blue-600" : "text-gray-400"
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
