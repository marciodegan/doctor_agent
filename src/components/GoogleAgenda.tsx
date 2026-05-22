import React, { useState, useEffect } from "react";
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Trash2, 
  Edit3,
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

import { auth } from "../lib/firebase";

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
  const { companyName, apiFetch } = useGroup();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<GoogleEvent[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<GoogleEvent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"month" | "list">("list");
  const [selectedDay, setSelectedDay] = useState(new Date().toISOString().split("T")[0]);
  const [listNavMode, setListNavMode] = useState<"day" | "month">("day");
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [waError, setWaError] = useState<string | null>(null);
  
  // Form State
  const [formData, setFormData] = useState({
    summary: "",
    date: "",
    time: "",
    description: ""
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const toYMD = (d: Date) => {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const fetchEvents = async () => {
    setIsLoading(true);
    setWaError(null);
    try {
      // Broaden the range by one day on each side to handle timezone offsets safely
      const startRange = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0, 0, 0, 0); 
      const endRange = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1, 23, 59, 59);
      
      const res = await apiFetch(`/api/calendar/events?timeMin=${startRange.toISOString()}&timeMax=${endRange.toISOString()}`);
      
      if (res.status === 401) {
        setWaError("Sua sessão do Google expirou. Por favor, faça login novamente.");
        return;
      }

      const data = await res.json();
      if (Array.isArray(data)) {
        setEvents(data);
      } else if (data.error) {
         console.error("API error", data.error);
         setWaError("Erro ao carregar eventos: " + data.error);
      }
    } catch (err) {
      console.error("Failed to fetch Google Calendar events", err);
      setWaError("Não foi possível conectar ao Google Agenda.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [currentDate]);

  const handlePrevMonth = () => {
    const d = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    setCurrentDate(d);
    setSelectedDay(toYMD(d));
  };

  const handleNextMonth = () => {
    const d = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    setCurrentDate(d);
    setSelectedDay(toYMD(d));
  };

  const handlePrevDay = () => {
    const d = new Date(selectedDay + "T12:00:00");
    d.setDate(d.getDate() - 1);
    const newDate = toYMD(d);
    setSelectedDay(newDate);
    // Sync currentDate (the month grid) if we move to a different month
    if (d.getMonth() !== currentDate.getMonth() || d.getFullYear() !== currentDate.getFullYear()) {
      setCurrentDate(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  };

  const handleNextDay = () => {
    const d = new Date(selectedDay + "T12:00:00");
    d.setDate(d.getDate() + 1);
    const newDate = toYMD(d);
    setSelectedDay(newDate);
    // Sync currentDate (the month grid) if we move to a different month
    if (d.getMonth() !== currentDate.getMonth() || d.getFullYear() !== currentDate.getFullYear()) {
      setCurrentDate(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  };

  const toggleEventSelection = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newSelected = new Set(selectedEventIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedEventIds(newSelected);
  };

  const handleSendToWhatsApp = () => {
    if (selectedEventIds.size === 0) return;

    const selectedEvents = events
      .filter(e => selectedEventIds.has(e.id))
      .sort((a, b) => {
        const dateA = new Date(a.start.dateTime || a.start.date || "");
        const dateB = new Date(b.start.dateTime || b.start.date || "");
        return dateA.getTime() - dateB.getTime();
      });

    let message = `🏥 *GOOGLE AGENDA - COMPROMISSOS*\n\n`;
    
    selectedEvents.forEach((e, idx) => {
      const start = new Date(e.start.dateTime || e.start.date || "");
      const dateFormatted = start.toLocaleDateString("pt-BR");
      const time = e.start.dateTime 
        ? start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
        : "Dia todo";
      
      message += `📌 *${e.summary}*\n`;
      message += `🕒 ${time}\n`;
      message += `📅 ${dateFormatted}\n`;
      if (e.description) message += `📝 ${e.description}\n`;
      if (idx < selectedEvents.length - 1) message += `\n---\n\n`;
    });

    const encodedMessage = encodeURIComponent(message);
    const waUrl = `https://wa.me/?text=${encodedMessage}`;
    window.location.href = waUrl;
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
          onClick={() => {
            setSelectedDay(dateStr);
            setViewMode("list");
          }}
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
                <button 
                  key={event.id} 
                  onClick={(e) => {
                    e.stopPropagation();
                    openEditModal(event);
                  }}
                  className="w-full text-left p-1 px-1.5 rounded-lg border border-emerald-50 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)] hover:border-emerald-200 transition-all active:scale-[0.98]"
                >
                  <div className="text-[7px] font-black text-emerald-500 uppercase tracking-tighter">{time}</div>
                  <div className="text-[9px] font-bold text-gray-700 leading-tight truncate">{event.summary}</div>
                </button>
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
    setEditingEvent(null);
    setFormData({
      summary: "",
      date: dateStr || now.toISOString().split("T")[0],
      time: now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      description: ""
    });
    setIsModalOpen(true);
  };

  const openEditModal = (event: GoogleEvent) => {
    const start = new Date(event.start.dateTime || event.start.date || "");
    setEditingEvent(event);
    setFormData({
      summary: event.summary,
      date: start.toISOString().split("T")[0],
      time: start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      description: event.description || ""
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

      const url = editingEvent 
        ? `/api/calendar/events/${editingEvent.id}`
        : "/api/calendar/events";
      
      const method = editingEvent ? "PUT" : "POST";

      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        setIsModalOpen(false);
        setEditingEvent(null);
        fetchEvents();
      }
    } catch (err) {
      console.error("Error saving Google event:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (eventId: string) => {
    if (!confirm("Tem certeza que deseja remover este compromisso?")) return;
    try {
      const res = await apiFetch(`/api/calendar/events/${eventId}`, { method: "DELETE" });
      if (res.ok) {
        fetchEvents();
      }
    } catch (err) {
      console.error("Error deleting Google event:", err);
    }
  };

  return (
    <div className="flex flex-col bg-white rounded-3xl border border-gray-100 shadow-sm">
      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-gray-50 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-emerald-500 text-white rounded-2xl">
            <CalendarIcon size={24} />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-black text-gray-900 tracking-tight">
                {`${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`}
              </h2>
              <div className="flex bg-gray-100 p-1 rounded-xl">
                <button 
                   onClick={() => setViewMode("month")}
                   className={`px-3 py-1 rounded-lg text-[10px] font-black transition-all flex items-center gap-1.5 ${viewMode === "month" ? "bg-white text-emerald-600 shadow-sm" : "text-gray-400"}`}
                >
                  <CalendarDays size={12} />
                  GRADE
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
            <p className="text-[8px] font-black text-emerald-600/80 uppercase tracking-[0.2em] font-mono">
              Google Agenda
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isLoading && <Loader2 size={20} className="animate-spin text-gray-400 mr-2" />}
          
          {selectedEventIds.size > 0 && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={handleSendToWhatsApp}
              className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-emerald-200 hover:bg-emerald-700 active:scale-95 transition-all mr-2"
            >
              <Check size={18} />
              <span className="hidden sm:inline">WhatsApp ({selectedEventIds.size})</span>
            </motion.button>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black text-gray-400 uppercase w-8">Mês</span>
              <div className="flex bg-gray-50 rounded-xl p-1 border border-gray-100">
                <button 
                  onClick={handlePrevMonth}
                  className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg transition-all text-gray-500"
                >
                  <ChevronLeft size={16} />
                </button>
                <button 
                  onClick={() => setCurrentDate(new Date())}
                  className="px-2 text-[10px] font-bold text-gray-600 hover:text-emerald-600"
                >
                  Hoje
                </button>
                <button 
                  onClick={handleNextMonth}
                  className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg transition-all text-gray-500"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black text-gray-400 uppercase w-8">Dia</span>
              <div className="flex bg-gray-50 rounded-xl p-1 border border-gray-100">
                <button 
                  onClick={handlePrevDay}
                  className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg transition-all text-gray-500"
                >
                  <ChevronLeft size={16} />
                </button>
                <button 
                  onClick={() => {
                    const now = new Date();
                    setSelectedDay(now.toISOString().split("T")[0]);
                    // If month is different, sync
                    if (now.getMonth() !== currentDate.getMonth() || now.getFullYear() !== currentDate.getFullYear()) {
                      setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1));
                    }
                  }}
                  className="px-2 text-[10px] font-bold text-gray-600 hover:text-emerald-600"
                >
                  Hoje
                </button>
                <button 
                  onClick={handleNextDay}
                  className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg transition-all text-gray-500"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>

          <button 
            onClick={() => openAddModal(viewMode === "list" ? selectedDay : undefined)}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-xl shadow-emerald-200 hover:bg-emerald-700 active:scale-95 transition-all"
          >
            <Plus size={18} />
            <span className="hidden sm:inline">Novo Compromisso</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div 
        style={{
          paddingBottom: "calc(7rem + env(safe-area-inset-bottom, 0px))"
        }}
        className="flex-1 bg-gray-50/20 overflow-y-auto custom-scrollbar"
      >
        {viewMode === "month" ? (
          <div className="min-w-[800px] lg:min-w-full grid grid-cols-7 border-b border-gray-100">
            {DAYS.map(day => (
              <div key={day} className="py-3 text-center text-[10px] font-black uppercase tracking-widest text-gray-400 bg-white border-b border-gray-100">
                {day}
              </div>
            ))}
            {renderDays()}
          </div>
        ) : (
          <div className="w-full max-w-5xl mx-auto p-3 sm:p-6 lg:p-8 space-y-6">
            <div className="flex bg-gray-100 p-1 rounded-xl">
                <button 
                  onClick={() => setListNavMode("day")}
                  className={`px-3 py-1 rounded-lg text-[9px] font-black transition-all ${listNavMode === "day" ? "bg-white text-emerald-600 shadow-sm" : "text-gray-400"}`}
                >
                  DIA
                </button>
                <button 
                  onClick={() => setListNavMode("month")}
                  className={`px-3 py-1 rounded-lg text-[9px] font-black transition-all ${listNavMode === "month" ? "bg-white text-emerald-600 shadow-sm" : "text-gray-400"}`}
                >
                  MÊS
                </button>
              </div>

              <motion.h1 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-[14px] font-black text-gray-900 leading-tight tracking-tight mt-1"
              >
                Olá, {auth.currentUser?.displayName?.split(" ")[0] || "Doutor(a)"}! 👋
              </motion.h1>
              <motion.p 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-gray-400 font-medium mt-1 text-[13px]"
              >
                {listNavMode === "day" 
                  ? `Compromissos para ${new Date(selectedDay + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "long" })}`
                  : "Todos os compromissos do mês"}
              </motion.p>
            {waError && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center gap-3 mb-6"
              >
                <AlertCircle className="text-red-500" size={20} />
                <p className="text-xs font-bold text-red-700">{waError}</p>
                <button 
                  onClick={() => window.location.href = "/api/auth/url"}
                  className="ml-auto bg-red-600 text-white px-4 py-1.5 rounded-lg text-xs font-black"
                >
                  LOGIN GOOGLE
                </button>
              </motion.div>
            )}
            {(() => {
              let filteredListEvents: GoogleEvent[] = [];
              
              if (listNavMode === "month") {
                filteredListEvents = events;
              } else {
                const sDay = new Date(selectedDay + "T00:00:00");
                const targetDateStr = toYMD(sDay);
                
                filteredListEvents = events.filter(event => {
                  const eventDateStr = (event.start.dateTime || event.start.date || "").split("T")[0];
                  return eventDateStr === targetDateStr;
                });
              }

              const sortedEvents = [...filteredListEvents].sort((a, b) => {
                const dateA = new Date(a.start.dateTime || a.start.date || "");
                const dateB = new Date(b.start.dateTime || b.start.date || "");
                return dateA.getTime() - dateB.getTime();
              });

              if (sortedEvents.length === 0 && !isLoading) {
                return (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-white rounded-3xl p-16 text-center border border-gray-100 shadow-sm"
                  >
                    <CalendarIcon className="w-16 h-16 text-gray-200 mx-auto mb-6" />
                    <h3 className="text-lg font-bold text-gray-900">
                      {listNavMode === "day" ? "Nenhum compromisso para este dia" : "Nenhum compromisso este mês"}
                    </h3>
                    <p className="text-gray-400 mt-2 text-sm">
                      {listNavMode === "day" 
                        ? "Sua agenda do Google está limpa para hoje." 
                        : "Sua agenda do Google está limpa no momento."}
                      Selecione outra data ou adicione um novo compromisso.
                    </p>
                  </motion.div>
                );
              }

              return (
                <div className="space-y-4">
                  {sortedEvents.map((event, idx) => {
                    const start = new Date(event.start.dateTime || event.start.date || "");
                    const isAllDay = !event.start.dateTime;
                    const eventDateStr = start.toISOString().split("T")[0];
                    const isToday = eventDateStr === today.toISOString().split("T")[0];

                    return (
                      <motion.div 
                        key={event.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className="bg-white p-3.5 sm:p-5 rounded-2xl border border-gray-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex items-start sm:items-center justify-between gap-3 sm:gap-6 group hover:shadow-xl hover:shadow-emerald-900/5 hover:-translate-y-0.5 transition-all duration-300 relative overflow-hidden"
                      >
                        {/* Status bar */}
                        <div className={`absolute top-0 left-0 w-1 h-full transition-colors duration-300 ${isToday ? "bg-emerald-500" : "bg-gray-100 group-hover:bg-emerald-300"}`} />

                        <div className="flex items-start sm:items-center gap-3 sm:gap-6 flex-1 min-w-0 ml-1">
                          {/* Date & Selection Group */}
                          <div className="flex flex-col items-center gap-2 shrink-0">
                            {/* Date Box */}
                            <div className="flex flex-col items-center justify-center w-12 h-12 sm:w-14 sm:h-14 bg-gray-50 rounded-xl group-hover:bg-emerald-600 group-hover:text-white transition-all duration-300 shrink-0 shadow-inner">
                              <span className="text-[7px] sm:text-[8px] font-black uppercase tracking-widest opacity-40 group-hover:opacity-100 mb-0.5">
                                {start.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}
                              </span>
                              <span className="text-[18px] sm:text-[20px] font-black leading-none tabular-nums">{start.getDate()}</span>
                              <span className="text-[7px] sm:text-[8px] font-black uppercase tracking-widest opacity-60 group-hover:opacity-100 mt-0.5">
                                {start.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}
                              </span>
                            </div>

                            {/* Selection Checkbox */}
                            <button
                              onClick={(e) => toggleEventSelection(e, event.id)}
                              className={`w-5 h-5 sm:w-6 sm:h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                                selectedEventIds.has(event.id) 
                                  ? "bg-emerald-500 border-emerald-500 text-white shadow-lg" 
                                  : "bg-white border-gray-100 text-transparent hover:border-emerald-300 shadow-inner"
                              }`}
                            >
                              <Check size={14} strokeWidth={4} />
                            </button>
                          </div>
                          
                          <div className="min-w-0 flex-1 py-0.5 sm:py-1">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              <span className="text-[9px] sm:text-[10px] font-black text-emerald-600 bg-emerald-50/50 px-2 py-0.5 rounded-lg flex items-center gap-1 border border-emerald-100/30 group-hover:bg-emerald-100/50 transition-colors">
                                <Clock size={10} strokeWidth={3} />
                                {isAllDay ? "DIA TODO" : start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                              {isToday && (
                                <span className="text-[8px] font-black text-white bg-emerald-500 px-2 py-0.5 rounded-md shadow-sm tracking-wider uppercase">HOJE</span>
                              )}
                            </div>
                            
                            <h4 className="font-bold text-[12px] sm:text-[14px] text-gray-900 leading-tight tracking-tight group-hover:text-emerald-900 transition-colors mb-0.5 sm:mb-1 break-words line-clamp-1">
                              {event.summary}
                            </h4>
                            
                            {event.description && (
                              <p className="text-[9px] sm:text-[11px] font-medium text-gray-400 group-hover:text-gray-500 transition-colors break-words line-clamp-1 sm:line-clamp-2">
                                {event.description}
                              </p>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex flex-col sm:flex-row items-center gap-0.5 sm:gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all shrink-0 ml-1">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditModal(event);
                            }}
                            className="p-1.5 sm:p-2 text-gray-300 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all active:scale-90"
                            title="Editar"
                          >
                            <Edit3 size={14} />
                          </button>
                          
                          <button 
                            onClick={() => handleDelete(event.id)}
                            className="p-1.5 sm:p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all active:scale-90"
                            title="Excluir"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              );
            })()}
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
                <h3 className="font-black text-gray-900">{editingEvent ? "Editar Compromisso" : "Novo Compromisso"}</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 text-gray-400">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="pl-6 pr-6 pt-0 pb-[65px] space-y-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 ml-1">Assunto / Compromisso</label>
                  <div className="relative group">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-emerald-600 transition-colors">
                      <CalendarIcon size={18} />
                    </div>
                    <input 
                      required
                      value={formData.summary}
                      onChange={e => setFormData({ ...formData, summary: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-emerald-600/5 focus:border-emerald-600 transition-all placeholder:font-medium"
                      placeholder="O que vamos agendar no Google?"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Data</label>
                    <input 
                      type="date"
                      required
                      value={formData.date}
                      onChange={e => setFormData({ ...formData, date: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-emerald-600/5 focus:border-emerald-600 transition-all font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Horário</label>
                    <div className="relative group">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-emerald-600 transition-colors">
                        <Clock size={18} />
                      </div>
                      <input 
                        type="time"
                        required
                        value={formData.time}
                        onChange={e => setFormData({ ...formData, time: e.target.value })}
                        className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-emerald-600/5 focus:border-emerald-600 transition-all font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="mb-0">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 ml-1">Descrição / Notas</label>
                  <textarea 
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl pt-[12px] pb-[3px] px-5 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-emerald-600/5 focus:border-emerald-600 transition-all resize-none min-h-[100px]"
                    rows={3}
                    placeholder="Adicione detalhes extras aqui..."
                  />
                </div>

                <div className="pt-2 flex flex-col sm:flex-row items-center gap-4 border-t border-gray-50">
                  <button 
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-emerald-600 text-white py-4.5 rounded-2xl font-black text-xs sm:text-sm shadow-2xl shadow-emerald-500/20 hover:bg-emerald-700 hover:shadow-emerald-500/30 active:scale-[0.98] transition-all uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <>
                        {editingEvent ? <Check size={18} /> : <Plus size={18} />}
                        {editingEvent ? "Salvar Alterações" : "Agendar no Google"}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
