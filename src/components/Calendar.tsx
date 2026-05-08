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
  FileText,
  AlertCircle,
  Share2,
  Check,
  Building2,
  Filter
} from "lucide-react";
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  orderBy,
  Timestamp,
  getDocs
} from "firebase/firestore";
import { db, auth } from "../lib/firebase";
import { motion, AnimatePresence } from "motion/react";
import { useGroup } from "../contexts/GroupContext";
import { OperationType, handleFirestoreError } from "../lib/firestoreUtils";

  interface CalendarEvent {
  id: string;
  evento: string;
  data: string; // YYYY-MM-DD
  hora: string; // HH:mm
  descricao: string;
  tipo?: string; // ELETIVA / URGÊNCIA
  sala?: string; // SALA 1 / SALA 2
  hospitalId?: string;
  groupId: string;
  createdBy: string;
  createdAt: any;
  updatedAt: any;
}

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

export function Calendar() {
  const { activeGroup } = useGroup();
  const GROUP_ID = activeGroup?.id || "main-group";
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [procedureOptions, setProcedureOptions] = useState<string[]>([]);
  const [surgeryTypeOptions, setSurgeryTypeOptions] = useState<string[]>([]);
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [waError, setWaError] = useState<string | null>(null);
  const [hospitalOptions, setHospitalOptions] = useState<{id: string, nome: string}[]>([]);
  const [selectedHospitalFilter, setSelectedHospitalFilter] = useState<string>("all");
  
  // Form State
  const [formData, setFormData] = useState({
    evento: "",
    data: "",
    hora: "",
    descricao: "",
    tipo: "ELETIVA",
    sala: "SALA 1",
    hospitalId: ""
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  useEffect(() => {
    const GROUP_ID = activeGroup?.id;
    if (!GROUP_ID || !auth.currentUser) return;

    const eventsRef = collection(db, "groups", GROUP_ID, "calendario");
    const q = query(eventsRef, orderBy("data"), orderBy("hora"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedEvents = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as CalendarEvent[];
      setEvents(fetchedEvents);
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `groups/${GROUP_ID}/calendario`);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [auth.currentUser, activeGroup?.id]);

  useEffect(() => {
    const fetchConfigs = async () => {
      const gId = activeGroup?.id;
      if (!gId) return;

      try {
        // Fetch Procedure Options
        const procRef = collection(db, "procedureOptions");
        const qProc = query(procRef, where("groupId", "==", gId), orderBy("nome"));
        const unsubProc = onSnapshot(qProc, (snap) => {
          setProcedureOptions(snap.docs.map(d => d.data().nome));
        });

        // Fetch Surgery Types
        const typeRef = collection(db, "surgery_types");
        const qType = query(typeRef, where("groupId", "==", gId), orderBy("name"));
        const unsubType = onSnapshot(qType, (snap) => {
          setSurgeryTypeOptions(snap.docs.map(d => d.data().name));
        });

        return () => {
          unsubProc();
          unsubType();
        };
      } catch (e) {
        console.error("Error fetching configs:", e);
      }
    };
    return fetchConfigs() as any;
  }, [activeGroup?.id]);

  const [viewMode, setViewMode] = useState<"month" | "list">("month");
  const [selectedDay, setSelectedDay] = useState(new Date().toISOString().split("T")[0]);

  // Handle month navigation for list view too
  const goToNextDay = () => {
    const d = new Date(selectedDay);
    d.setDate(d.getDate() + 1);
    setSelectedDay(d.toISOString().split("T")[0]);
  };
  const goToPrevDay = () => {
    const d = new Date(selectedDay);
    d.setDate(d.getDate() - 1);
    setSelectedDay(d.toISOString().split("T")[0]);
  };

  useEffect(() => {
    const fetchHospitals = async () => {
      try {
        const res = await fetch("/api/app/hospitals");
        const data = await res.json();
        setHospitalOptions(data);
      } catch (e) {
        console.error("Error fetching hospitals:", e);
      }
    };
    fetchHospitals();
  }, []);

  const filteredEvents = selectedHospitalFilter === "all" 
    ? events 
    : events.filter(e => e.hospitalId === selectedHospitalFilter);
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch("/api/app/settings");
        const data = await res.json();
        if (data.whatsappNumber) {
          setWhatsappNumber(data.whatsappNumber);
        }
      } catch (err) {
        console.error("Failed to fetch settings", err);
      }
    };
    fetchSettings();
  }, []);

  const toggleEventSelection = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newSelected = new Set(selectedEventIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedEventIds(newSelected);
    if (waError) setWaError(null);
  };

  const handleSendToWhatsApp = () => {
    if (selectedEventIds.size === 0) return;

    const cleanPhone = whatsappNumber.replace(/\D/g, "");
    if (!cleanPhone) {
      setWaError("Configure seu WhatsApp no ícone de engrenagem do Chat");
      console.warn("WhatsApp number missing in settings");
      return;
    }

    const selectedEvents = events
      .filter(e => selectedEventIds.has(e.id))
      .sort((a, b) => {
        const dateA = new Date(`${a.data}T${a.hora}`);
        const dateB = new Date(`${b.data}T${b.hora}`);
        return dateA.getTime() - dateB.getTime();
      });

    let message = `🏥 *AGENDA DE CIRURGIAS*\n\n`;
    
    selectedEvents.forEach((e, idx) => {
      const [y, m, d] = e.data.split("-");
      const dateFormatted = `${d}/${m}/${y}`;
      const hosp = hospitalOptions.find(h => h.id === e.hospitalId)?.nome || "";
      
      message += `🔹 *${e.evento}*\n`;
      message += `📅 ${dateFormatted}\n`;
      message += `🕒 ${e.hora}\n`;
      if (hosp) message += `🏥 ${hosp}\n`;
      if (e.tipo) message += `🏷️ ${e.tipo}\n`;
      if (e.sala) message += `📍 ${e.sala}\n`;
      if (e.descricao) message += `📝 ${e.descricao}\n`;
      if (idx < selectedEvents.length - 1) message += `\n---\n\n`;
    });

    const encodedMessage = encodeURIComponent(message);
    const waUrl = `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
    
    // Try window.open first
    const waWindow = window.open(waUrl, "_blank");
    
    // Fallback if blocked
    if (!waWindow || waWindow.closed || typeof waWindow.closed === "undefined") {
      const link = document.createElement("a");
      link.href = waUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

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
      days.push(<div key={`empty-${i}`} className="h-24 sm:h-32 bg-gray-50/50"></div>);
    }

    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dayEvents = filteredEvents.filter(e => e.data === dateStr);
      const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;

      days.push(
        <div 
          key={day} 
          onClick={() => {
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            setSelectedDay(dateStr);
            setViewMode("list");
          }}
          className={`h-24 sm:h-32 border-t border-l border-gray-100 p-1 sm:p-2 relative flex cursor-pointer flex-col hover:bg-gray-50/80 transition-colors ${isToday ? "bg-blue-50/30" : "bg-white"}`}
        >
          <div className="flex items-center justify-between mb-1 shrink-0">
            <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
              isToday ? "bg-blue-600 text-white shadow-lg shadow-blue-200" : "text-gray-500"
            }`}>
              {day}
            </div>
            {dayEvents.length > 0 && (
              <span className="text-[9px] font-black text-gray-300 uppercase tracking-tighter">{dayEvents.length} ev</span>
            )}
          </div>
          
          <div className="flex-1 space-y-1 overflow-y-auto custom-scrollbar pr-0.5">
            {dayEvents.map(event => {
              const isSelected = selectedEventIds.has(event.id);
              return (
                <div key={event.id} className="relative group/item mb-1 last:mb-0">
                  <div className="flex items-start gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleEventSelection(e, event.id);
                      }}
                      className={`shrink-0 w-4 h-4 mt-1 rounded border flex items-center justify-center transition-all ${
                        isSelected 
                          ? "bg-emerald-500 border-emerald-500 text-white shadow-sm" 
                          : "bg-white border-blue-200 text-transparent hover:border-blue-400"
                      }`}
                    >
                      <Check size={10} strokeWidth={4} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditModal(event);
                      }}
                      className={`flex-1 text-left p-1.5 rounded-lg border transition-all ${
                        isSelected 
                          ? "bg-blue-50/50 border-blue-400/50" 
                          : "bg-white border-blue-50 hover:border-blue-200 hover:shadow-sm"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <div className="text-[8px] font-black text-gray-400 font-mono tracking-tighter">{event.hora}</div>
                        {event.sala && <div className="text-[7px] font-black text-blue-400 uppercase tracking-tight">{event.sala}</div>}
                      </div>
                      <div className="text-[10px] font-bold text-gray-700 leading-tight truncate">{event.evento}</div>
                    </button>
                  </div>
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
    setEditingEvent(null);
    setFormData({
      evento: "",
      data: dateStr || today.toISOString().split("T")[0],
      hora: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }).replace(/^24/, "00"),
      descricao: "",
      tipo: "ELETIVA",
      sala: "SALA 1",
      hospitalId: selectedHospitalFilter !== "all" ? selectedHospitalFilter : ""
    });
    setIsModalOpen(true);
  };

  const openEditModal = (event: CalendarEvent) => {
    setEditingEvent(event);
    setFormData({
      evento: event.evento,
      data: event.data,
      hora: event.hora,
      descricao: event.descricao || "",
      tipo: event.tipo || "ELETIVA",
      sala: event.sala || "SALA 1",
      hospitalId: event.hospitalId || ""
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    try {
      if (editingEvent) {
        const eventRef = doc(db, "groups", GROUP_ID, "calendario", editingEvent.id);
        await updateDoc(eventRef, {
          ...formData,
          updatedAt: serverTimestamp()
        });
      } else {
        const eventsRef = collection(db, "groups", GROUP_ID, "calendario");
        await addDoc(eventsRef, {
          ...formData,
          groupId: GROUP_ID,
          createdBy: auth.currentUser.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      setIsModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `groups/${GROUP_ID}/calendario`);
    }
  };

  const handleDelete = async () => {
    if (!editingEvent) return;
    if (!confirm("Tem certeza que deseja excluir este evento?")) return;

    try {
      await deleteDoc(doc(db, "groups", GROUP_ID, "calendario", editingEvent.id));
      setIsModalOpen(false);
    } catch (error) {
      console.error("Error deleting event:", error);
      alert("Erro ao excluir evento.");
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-gray-50 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
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
                  className={`px-3 py-1 rounded-lg text-[10px] font-black transition-all ${viewMode === "month" ? "bg-white text-blue-600 shadow-sm" : "text-gray-400"}`}
                >
                  MÊS
                </button>
                <button 
                  onClick={() => setViewMode("list")}
                  className={`px-3 py-1 rounded-lg text-[10px] font-black transition-all ${viewMode === "list" ? "bg-white text-blue-600 shadow-sm" : "text-gray-400"}`}
                >
                  LISTA
                </button>
              </div>
            </div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              {viewMode === "month" ? "Calendário Mensal" : "Lista de Procedimentos"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hospitalOptions.length > 0 && (
            <div className="flex items-center gap-2 mr-2">
              <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-black text-gray-400">
                <Filter size={12} />
                <span>FILTRAR:</span>
              </div>
              <select
                value={selectedHospitalFilter}
                onChange={(e) => setSelectedHospitalFilter(e.target.value)}
                className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs font-bold text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="all">Todos Hospitais</option>
                {hospitalOptions.map(h => (
                  <option key={h.id} value={h.id}>{h.nome}</option>
                ))}
              </select>
            </div>
          )}

          {selectedEventIds.size > 0 && (
            <div className="flex flex-col items-end">
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={handleSendToWhatsApp}
                className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-emerald-200 hover:bg-emerald-700 active:scale-95 transition-all"
              >
                <Share2 size={18} />
                <span className="hidden sm:inline">WhatsApp ({selectedEventIds.size})</span>
              </motion.button>
              {waError && (
                <motion.span 
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-[10px] text-red-500 font-bold mt-1 mr-1 text-right max-w-[200px]"
                >
                  {waError}
                </motion.span>
              )}
            </div>
          )}

          <div className="flex bg-gray-50 rounded-xl p-1 border border-gray-100">
            <button 
              onClick={handlePrevMonth}
              className="p-2 hover:bg-white hover:shadow-sm rounded-lg transition-all text-gray-500"
            >
              <ChevronLeft size={20} />
            </button>
            <button 
              onClick={() => {
                setCurrentDate(new Date());
                setSelectedDay(new Date().toISOString().split("T")[0]);
              }}
              className="px-3 text-xs font-bold text-gray-600 hover:text-blue-600"
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
            onClick={() => openAddModal(viewMode === "list" ? selectedDay : undefined)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-blue-200 hover:bg-blue-700 active:scale-95 transition-all"
          >
            <Plus size={18} />
            <span className="hidden sm:inline">Novo evento</span>
          </button>
        </div>
      </div>

      {/* Calendar Content */}
      <div className="flex-1 overflow-auto bg-gray-50/30">
        {viewMode === "month" ? (
          <div className="min-w-[600px] grid grid-cols-7 h-full">
            {DAYS.map(day => (
              <div key={day} className="py-2 text-center text-[10px] font-black uppercase tracking-widest text-gray-400 bg-white border-b border-gray-100">
                {day}
              </div>
            ))}
            {renderDays()}
          </div>
        ) : (
          <div className="max-w-4xl mx-auto p-4 sm:p-8">
            {(() => {
              const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
              const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
              const currentMonthEvents = filteredEvents.filter(e => {
                const eventDate = new Date(e.data + "T12:00:00");
                return eventDate >= monthStart && eventDate <= monthEnd;
              }).sort((a, b) => a.data.localeCompare(b.data) || a.hora.localeCompare(b.hora));

              if (currentMonthEvents.length === 0) {
                return (
                  <div className="bg-white rounded-3xl p-12 text-center border-2 border-dashed border-gray-100">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CalendarIcon className="text-gray-300" size={32} />
                    </div>
                    <h3 className="text-lg font-bold text-gray-700">Nenhum evento neste mês</h3>
                    <p className="text-gray-400 text-sm mt-1">Utilize o botão "+" para adicionar novos procedimentos.</p>
                  </div>
                );
              }

              // Group by date
              const grouped = currentMonthEvents.reduce((acc, e) => {
                if (!acc[e.data]) acc[e.data] = [];
                acc[e.data].push(e);
                return acc;
              }, {} as Record<string, CalendarEvent[]>);

              return Object.entries(grouped).map(([date, dailyEvents]) => {
                const [y, m, d] = date.split("-");
                const dateObj = new Date(date + "T12:00:00");
                const dayName = DAYS[dateObj.getDay()];
                
                return (
                  <div key={date} className="mb-8 last:mb-0">
                    <div className="flex items-center gap-4 mb-4 ml-2">
                       <div className="flex flex-col items-center">
                          <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">{dayName}</span>
                          <span className="text-2xl font-black text-gray-900 leading-none">{d}</span>
                       </div>
                       <div className="h-px flex-1 bg-gray-100"></div>
                       <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">{MONTHS[parseInt(m) - 1]}</span>
                    </div>
                    <div className="grid gap-4">
                      {dailyEvents.map(event => {
                        const isSelected = selectedEventIds.has(event.id);
                        const hosp = hospitalOptions.find(h => h.id === event.hospitalId);
                        return (
                          <motion.div 
                            key={event.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className={`bg-white p-5 rounded-3xl border-2 transition-all flex items-center gap-5 ${isSelected ? "border-emerald-500 shadow-xl shadow-emerald-50" : "border-gray-50 hover:border-blue-100 shadow-sm"}`}
                          >
                            <button
                              onClick={(e) => toggleEventSelection(e, event.id)}
                              className={`shrink-0 w-9 h-9 rounded-2xl border-2 flex items-center justify-center transition-all ${
                                isSelected 
                                  ? "bg-emerald-500 border-emerald-500 text-white shadow-lg" 
                                  : "bg-white border-gray-100 text-transparent hover:border-emerald-300 shadow-inner"
                              }`}
                            >
                              <Check size={18} strokeWidth={4} />
                            </button>
                            
                            <div className="flex-1 cursor-pointer" onClick={() => openEditModal(event)}>
                              <div className="flex items-center gap-3 mb-1.5">
                                <span className="text-[11px] font-black text-blue-600 font-mono tracking-tighter bg-blue-50 px-2.5 py-1 rounded-lg">
                                  {event.hora}
                                </span>
                                {event.sala && (
                                  <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest bg-gray-50 px-2.5 py-1 rounded-lg">
                                    {event.sala}
                                  </span>
                                )}
                                {event.tipo && (
                                  <span className={`text-[9px] font-black px-2.5 py-1 rounded-lg ${event.tipo === "URGÊNCIA" ? "bg-red-50 text-red-500" : "bg-emerald-50 text-emerald-500"}`}>
                                    {event.tipo}
                                  </span>
                                )}
                              </div>
                              <h4 className="text-lg font-bold text-gray-800 leading-tight">{event.evento}</h4>
                              <div className="flex flex-wrap items-center gap-4 mt-2.5">
                                {hosp && (
                                  <div className="flex items-center gap-1.5 text-gray-500 bg-gray-50 px-2.5 py-0.5 rounded-full">
                                    <Building2 size={12} className="text-gray-400" />
                                    <span className="text-[10px] font-bold">{hosp.nome}</span>
                                  </div>
                                )}
                                {event.descricao && (
                                  <div className="flex items-center gap-1.5 text-gray-400">
                                    <FileText size={12} />
                                    <span className="text-[10px] font-medium truncate max-w-[200px]">{event.descricao}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            <button 
                              onClick={() => openEditModal(event)}
                              className="p-2.5 hover:bg-blue-50 hover:text-blue-600 rounded-2xl text-gray-300 transition-all active:scale-95"
                              title="Editar"
                            >
                              <Edit3 size={18} />
                            </button>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden z-10"
            >
              <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
                <h3 className="font-black text-gray-900 tracking-tight">
                  {editingEvent ? "Editar Evento" : "Novo Evento"}
                </h3>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-xl transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5 ml-1">Evento</label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                      <CalendarIcon size={18} />
                    </div>
                    <input 
                      required
                      type="text"
                      value={formData.evento}
                      onChange={e => setFormData({ ...formData, evento: e.target.value })}
                      placeholder="Ex: Cirurgia Cardíaca"
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    />
                  </div>
                  {procedureOptions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {procedureOptions.map(opt => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setFormData({ ...formData, evento: opt })}
                          className="text-[9px] font-bold px-2.5 py-1.5 bg-white border border-gray-100 rounded-xl text-gray-500 hover:border-blue-200 hover:text-blue-600 transition-all uppercase tracking-tight"
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5 ml-1">Data</label>
                    <input 
                      required
                      type="date"
                      value={formData.data}
                      onChange={e => setFormData({ ...formData, data: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5 ml-1">Hora e Categoria</label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                          <Clock size={18} />
                        </div>
                        <input 
                          required
                          type="time"
                          value={formData.hora}
                          onChange={e => setFormData({ ...formData, hora: e.target.value })}
                          className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono"
                        />
                      </div>
                      <select 
                        value={formData.tipo}
                        onChange={e => setFormData({ ...formData, tipo: e.target.value })}
                        className="bg-gray-50 border border-gray-100 rounded-2xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
                      >
                        {surgeryTypeOptions.length > 0 ? (
                          surgeryTypeOptions.map(opt => (
                            <option key={opt} value={opt}>{opt.substring(0, 4)}</option>
                          ))
                        ) : (
                          <>
                            <option value="ELETIVA">ELET</option>
                            <option value="URGÊNCIA">URG</option>
                          </>
                        )}
                      </select>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5 ml-1">Descrição (Opcional)</label>
                  <div className="relative">
                    <div className="absolute left-3 top-4 text-gray-400">
                      <FileText size={18} />
                    </div>
                    <textarea 
                      value={formData.descricao}
                      onChange={e => setFormData({ ...formData, descricao: e.target.value })}
                      placeholder="Detalhes adicionais..."
                      rows={3}
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none"
                    />
                  </div>
                </div>

                <div className="pt-4 flex items-end gap-3 justify-between">
                  <div className="flex-1 grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5 ml-1">Hospital</label>
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                          <Building2 size={16} />
                        </div>
                        <select 
                          value={formData.hospitalId}
                          onChange={e => setFormData({ ...formData, hospitalId: e.target.value })}
                          className="w-full bg-gray-50 border border-gray-100 rounded-xl py-2.5 pl-9 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer appearance-none font-bold"
                        >
                          <option value="">Hospital...</option>
                          {hospitalOptions.map(h => (
                            <option key={h.id} value={h.id}>{h.nome}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5 ml-1">Nº Sala</label>
                      <input 
                        type="text"
                        value={formData.sala}
                        onChange={e => setFormData({ ...formData, sala: e.target.value })}
                        placeholder="Sala..."
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl py-2.5 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-bold"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {editingEvent && (
                      <button 
                        type="button"
                        onClick={handleDelete}
                        className="p-3 text-red-500 hover:bg-red-50 rounded-2xl transition-all border border-transparent hover:border-red-100"
                      >
                        <Trash2 size={24} />
                      </button>
                    )}
                    <button 
                      type="submit"
                      className="whitespace-nowrap bg-blue-600 text-white px-8 py-3.5 rounded-2xl font-black text-sm hover:bg-blue-700 shadow-xl shadow-blue-100 active:scale-[0.98] transition-all uppercase tracking-tight"
                    >
                      {editingEvent ? "Salvar" : "Agendar Agora"}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
