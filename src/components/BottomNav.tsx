import React from "react";
import { 
  MessageSquare, 
  Calendar, 
  CalendarDays, 
  Users,
  Settings
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface BottomNavProps {
  currentView: string;
  onNavigate: (view: any, prompt?: string) => void;
  onOpenManagement: () => void;
}

export function BottomNav({ currentView, onNavigate, onOpenManagement }: BottomNavProps) {
  const tabs = [
    { id: "workspace", label: "Pacientes", icon: <Users size={20} />, prompt: "/pacientes" },
    { id: "calendar", label: "Calendário", icon: <Calendar size={20} />, prompt: "/open_calendar" },
    { id: "agenda", label: "Agenda", icon: <CalendarDays size={20} />, prompt: "/agenda" },
    { id: "management", label: "Equipe", icon: <Users size={18} />, action: onOpenManagement },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[60] lg:hidden">
      <div className="absolute inset-x-4 bottom-4 h-16 bg-white/90 backdrop-blur-2xl border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-3xl overflow-hidden" />
      
      <div className="relative flex items-center justify-around px-6 pb-4 pt-0 h-24 mb-0">
        {tabs.map((tab) => {
          const isActive = currentView === tab.id;
          
          return (
            <button
              key={tab.label}
              onClick={() => tab.action ? tab.action() : onNavigate(tab.id, (tab as any).prompt)}
              className="flex flex-col items-center justify-center gap-1 min-w-[56px] relative"
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
                  scale: isActive ? 1.2 : 1,
                  y: isActive ? -4 : 0,
                  color: isActive ? "#2563eb" : "#9ca3af"
                }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
                className="relative"
              >
                {tab.icon}
                {isActive && (
                  <motion.div 
                    layoutId="active-dot"
                    className="absolute -top-1 -right-1 w-2 h-2 bg-blue-600 rounded-full border-2 border-white shadow-sm"
                  />
                )}
              </motion.div>
              
              <span className={`text-[9px] font-black uppercase tracking-widest transition-colors duration-200 ${
                isActive ? "text-blue-600" : "text-gray-400"
              }`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
