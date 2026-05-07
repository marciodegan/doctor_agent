import React, { useState, useEffect } from "react";
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Trash2, 
  X,
  Calendar as CalendarIcon,
  Clock,
  Loader2,
  AlertCircle,
  Check,
  LayoutList,
  CalendarDays
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useGroup } from "../contexts/GroupContext";

interface GoogleEvent {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
  };
}

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

export function GoogleAgenda() {
  const { companyName } = useGroup();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<GoogleEvent[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"month" | "list">("month");
  
  // Form State
  const [formData, setFormData] = useState({
    summary: "",
    date: "",
    time: "",
    description: ""
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const fetchEvents = async () => {
    setIsLoading(true);
    try {
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);
      
      const res = await fetch(`/api/calendar/events?timeMin=${startOfMonth.toISOString()}&timeMax=${endOfMonth.toISOString()}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setEvents(data);
      }
    } catch (err) {
      console.error("Failed to fetch Google Calendar events", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [currentDate]);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const renderDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const totalDays = daysInMonth(year, month);
    const startDay = firstDayOfMonth(year, month);
    const days = [];

    // Empty slots for previous month
    for (let i = 0; i < startDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-24 sm:h-32 bg-emerald-50/10"></div>);
    }

    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dayEvents = events.filter(e => {
        const d = (e.start.dateTime || e.start.date || "").split("T")[0];
        return d === dateStr;
      });
      const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;

      days.push(
        <div 
          key={day} 
          onClick={() => openAddModal(dateStr)}
          className={`h-24 sm:h-32 border-t border-l border-gray-100 p-1 sm:p-2 relative flex flex-col cursor-pointer hover:bg-gray-50/80 transition-colors ${isToday ? "bg-emerald-50/30" : "bg-white"}`}
        >
          <div className="flex items-center justify-between mb-1 shrink-0">
            <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
              isToday ? "bg-emerald-600 text-white shadow-lg shadow-emerald-200" : "text-gray-500"
            }`}>
              {day}
            </div>
            {dayEvents.length > 0 && (
              <span className="text-[9px] font-black text-emerald-300 uppercase tracking-tighter">{dayEvents.length} compromissos</span>
            )}
          </div>
          
          <div className="flex-1 space-y-1 overflow-y-auto custom-scrollbar pr-0.5">
            {dayEvents.map(event => {
              const time = event.start.dateTime 
                ? new Date(event.start.dateTime).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
                : "Dia todo";
              return (
                <div key={event.id} className="p-1 px-1.5 rounded-lg border border-emerald-50 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                  <div className="text-[7px] font-black text-emerald-500 uppercase tracking-tighter">{time}</div>
                  <div className="text-[9px] font-bold text-gray-700 leading-tight truncate">{event.summary}</div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    return days;
  };

  const openAddModal = (dateStr?: string) => {
    const now = new Date();
    setFormData({
      summary: "",
      date: dateStr || now.toISOString().split("T")[0],
      time: now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      description: ""
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const [y, m, d] = formData.date.split("-");
      const [hh, mm] = formData.time.split(":");
      const start = new Date(parseInt(y), parseInt(m) - 1, parseInt(d), parseInt(hh), parseInt(mm));
      const end = new Date(start.getTime() + 60 * 60 * 1000);

      const body = {
        summary: formData.summary,
        description: formData.description,
        start: { dateTime: start.toISOString(), timeZone: "America/Sao_Paulo" },
        end: { dateTime: end.toISOString(), timeZone: "America/Sao_Paulo" }
      };

      const res = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        setIsModalOpen(false);
        fetchEvents();
      }
    } catch (err) {
      console.error("Error creating Google event:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (eventId: string) => {
    if (!confirm("Tem certeza que deseja remover este compromisso?")) return;
    try {
      const res = await fetch(`/api/calendar/events/${eventId}`, { method: "DELETE" });
      if (res.ok) {
        fetchEvents();
      }
    } catch (err) {
      console.error("Error deleting Google event:", err);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-gray-50 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-emerald-500 text-white rounded-2xl">
            <CalendarIcon size={24} />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-black text-gray-900 tracking-tight">
                {`${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`}
              </h2>
              <div className="flex bg-gray-100 p-1 rounded-xl">
                <button 
                   onClick={() => setViewMode("month")}
                   className={`px-3 py-1 rounded-lg text-[10px] font-black transition-all flex items-center gap-1.5 ${viewMode === "month" ? "bg-white text-emerald-600 shadow-sm" : "text-gray-400"}`}
                >
                  <CalendarDays size={12} />
                  MÊS
                </button>
                <button 
                  onClick={() => setViewMode("list")}
                  className={`px-3 py-1 rounded-lg text-[10px] font-black transition-all flex items-center gap-1.5 ${viewMode === "list" ? "bg-white text-emerald-600 shadow-sm" : "text-gray-400"}`}
                >
                  <LayoutList size={12} />
                  LISTA
                </button>
              </div>
            </div>
            <p className="text-[10px] font-black text-emerald-600/80 uppercase tracking-[0.2em] font-mono">
              Google Agenda • {companyName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isLoading && <Loader2 size={20} className="animate-spin text-gray-400 mr-2" />}
          
          <div className="flex bg-gray-50 rounded-xl p-1 border border-gray-100">
            <button 
              onClick={handlePrevMonth}
              className="p-2 hover:bg-white hover:shadow-sm rounded-lg transition-all text-gray-500"
            >
              <ChevronLeft size={20} />
            </button>
            <button 
              onClick={() => setCurrentDate(new Date())}
              className="px-3 text-xs font-bold text-gray-600 hover:text-emerald-600"
            >
              Hoje
            </button>
            <button 
              onClick={handleNextMonth}
              className="p-2 hover:bg-white hover:shadow-sm rounded-lg transition-all text-gray-500"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          <button 
            onClick={() => openAddModal()}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-xl shadow-emerald-200 hover:bg-emerald-700 active:scale-95 transition-all"
          >
            <Plus size={18} />
            <span className="hidden sm:inline">Novo Compromisso</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-gray-50/20">
        {viewMode === "month" ? (
          <div className="min-w-[700px] grid grid-cols-7 h-full">
            {DAYS.map(day => (
              <div key={day} className="py-2 text-center text-[10px] font-black uppercase tracking-widest text-gray-400 bg-white border-b border-gray-100">
                {day}
              </div>
            ))}
            {renderDays()}
          </div>
        ) : (
          <div className="max-w-3xl mx-auto p-4 sm:p-8 space-y-6">
             {events.length === 0 && !isLoading ? (
               <div className="bg-white rounded-3xl p-12 text-center border border-gray-100 shadow-sm">
                 <CalendarIcon className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                 <h3 className="text-gray-900 font-bold">Nenhum compromisso este mês</h3>
                 <p className="text-sm text-gray-400 mt-1">Sua agenda do Google está limpa no momento.</p>
               </div>
             ) : (
               <div className="space-y-4">
                 {events
                   .sort((a, b) => {
                     const dateA = new Date(a.start.dateTime || a.start.date || "");
                     const dateB = new Date(b.start.dateTime || b.start.date || "");
                     return dateA.getTime() - dateB.getTime();
                   })
                   .map(event => {
                    const start = new Date(event.start.dateTime || event.start.date || "");
                    const isAllDay = !event.start.dateTime;
                    return (
                      <motion.div 
                        key={event.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between gap-4 group"
                      >
                        <div className="flex items-center gap-5">
                          <div className="flex flex-col items-center justify-center w-12 h-12 bg-gray-50 rounded-xl group-hover:bg-emerald-600 group-hover:text-white transition-all shadow-inner group-hover:shadow-emerald-200">
                            <span className="text-[10px] font-black uppercase tracking-tighter opacity-60">
                              {start.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}
                            </span>
                            <span className="text-xl font-black leading-none">{start.getDate()}</span>
                          </div>
                          
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg flex items-center gap-1">
                                <Clock size={10} />
                                {isAllDay ? "DIA TODO" : start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                            <h4 className="font-bold text-gray-900 tracking-tight">{event.summary}</h4>
                            {event.description && <p className="text-xs text-gray-400 mt-1 line-clamp-1">{event.description}</p>}
                          </div>
                        </div>
                        
                        <button 
                          onClick={() => handleDelete(event.id)}
                          className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                        >
                          <Trash2 size={18} />
                        </button>
                      </motion.div>
                    );
                 })}
               </div>
             )}
          </div>
        )}
      </div>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden z-10"
            >
              <div className="p-6 border-b border-gray-50 flex items-center justify-between">
                <h3 className="font-black text-gray-900">Novo Compromisso</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 text-gray-400">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-[10px] font-black uppercase text-gray-400 mb-1.5 ml-1">Assunto</label>
                  <input 
                    required
                    value={formData.summary}
                    onChange={e => setFormData({ ...formData, summary: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="O que vamos agendar?"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 mb-1.5 ml-1">Data</label>
                    <input 
                      type="date"
                      required
                      value={formData.date}
                      onChange={e => setFormData({ ...formData, date: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 mb-1.5 ml-1">Hora</label>
                    <input 
                      type="time"
                      required
                      value={formData.time}
                      onChange={e => setFormData({ ...formData, time: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-gray-400 mb-1.5 ml-1">Descrição</label>
                  <textarea 
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                    rows={3}
                    placeholder="Notas opcionais..."
                  />
                </div>

                <button 
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold shadow-xl shadow-emerald-200 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                >
                  {isLoading ? <Loader2 size={18} className="animate-spin" /> : "Agendar no Google"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
