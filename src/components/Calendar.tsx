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
  Filter,
  User
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
  nomePaciente?: string;
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

export function Calendar({ 
  prefilledPatientName,
  prefilledProcedure,
  prefilledHospitalId,
  prefilledType,
  prefilledSala
}: { 
  prefilledPatientName?: string,
  prefilledProcedure?: string,
  prefilledHospitalId?: string,
  prefilledType?: string,
  prefilledSala?: string
}) {
  const { activeGroup, whatsappNumber, userWhatsapp, apiFetch } = useGroup();
  const GROUP_ID = activeGroup?.id || "main-group";
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [allProcedures, setAllProcedures] = useState<{nome: string, active?: boolean}[]>([]);
  const [allSurgeryTypes, setAllSurgeryTypes] = useState<{name: string, active?: boolean}[]>([]);
  const [allHospitals, setAllHospitals] = useState<{id: string, nome: string, active?: boolean}[]>([]);
  const [waError, setWaError] = useState<string | null>(null);
  
  const procedureOptions = allProcedures.filter(p => p.active !== false && (p as any).status !== "removed").map(p => p.nome);
  const surgeryTypeOptions = allSurgeryTypes.filter(s => s.active !== false && (s as any).status !== "removed").map(s => s.name);
  const hospitalOptions = allHospitals.filter(h => h.active !== false && (h as any).status !== "removed");

  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [selectedHospitalFilter, setSelectedHospitalFilter] = useState<string>("all");
  
  // Form State
  const [formData, setFormData] = useState({
    nomePaciente: "",
    evento: "",
    data: "",
    hora: "",
    descricao: "",
    tipo: "ELETIVA",
    sala: "SALA 1",
    hospitalId: "",
    syncToGoogle: false
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  useEffect(() => {
    const GROUP_ID = activeGroup?.id;
    if (!GROUP_ID || !auth.currentUser) return;

    let isMounted = true;
    const eventsRef = collection(db, "groups", GROUP_ID, "calendario");
    const q = query(eventsRef, orderBy("data"), orderBy("hora"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!isMounted) return;
      const fetchedEvents = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as CalendarEvent[];
      setEvents(fetchedEvents);
      setIsLoading(false);
    }, (error) => {
      if (!isMounted) return;
      handleFirestoreError(error, OperationType.LIST, `groups/${GROUP_ID}/calendario`);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [auth.currentUser?.uid, activeGroup?.id]);

  useEffect(() => {
    const gId = activeGroup?.id;
    if (!gId) return;

    let isMounted = true;

    // Fetch Procedure Options
    const procRef = collection(db, "procedureOptions");
    const qProc = query(procRef, where("groupId", "==", gId), orderBy("nome"));
    const unsubProc = onSnapshot(qProc, (snap) => {
      if (!isMounted) return;
      setAllProcedures(snap.docs.map(d => ({ nome: d.data().nome, active: d.data().active })));
    }, (err) => console.error("Error fetching procedures:", err));

    // Fetch Surgery Types
    const typeRef = collection(db, "surgery_types");
    const qType = query(typeRef, where("groupId", "==", gId), orderBy("name"));
    const unsubType = onSnapshot(qType, (snap) => {
      if (!isMounted) return;
      setAllSurgeryTypes(snap.docs.map(d => ({ name: d.data().name, active: d.data().active })));
    }, (err) => console.error("Error fetching surgery types:", err));

    // Fetch Hospitals
    const hospRef = collection(db, "hospitals");
    const qHosp = query(hospRef, where("groupId", "==", gId), orderBy("name"));
    const unsubHosp = onSnapshot(qHosp, (snap) => {
      if (!isMounted) return;
      setAllHospitals(snap.docs.map(d => ({ 
        id: d.id, 
        nome: d.data().name,
        active: d.data().active
      })));
    }, (err) => console.error("Error fetching hospitals:", err));

    return () => {
      isMounted = false;
      unsubProc();
      unsubType();
      unsubHosp();
    };
  }, [activeGroup?.id]);

  const [viewMode, setViewMode] = useState<"month" | "list">("list");
  const [selectedDay, setSelectedDay] = useState(new Date().toISOString().split("T")[0]);
  const [listNavMode, setListNavMode] = useState<"day" | "month">("day");
  
  useEffect(() => {
    if ((prefilledPatientName || prefilledProcedure || prefilledHospitalId || prefilledType || prefilledSala) && !isModalOpen && !editingEvent) {
      openAddModal(selectedDay);
    }
  }, [prefilledPatientName, prefilledProcedure, prefilledHospitalId, prefilledType, prefilledSala]);

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
        const res = await apiFetch("/api/app/hospitals");
        const data = await res.json();
        // Since we have real-time listeners, we might not need this fetch, 
        // but it was here before. I'll comment it out or keep it for the very first load
        // setAllHospitals(data.map((h: any) => ({ id: h.id, nome: h.nome, active: true })));
      } catch (e) {
        console.error("Error fetching hospitals:", e);
      }
    };
    fetchHospitals();
  }, []);

  const filteredEvents = selectedHospitalFilter === "all" 
    ? events 
    : events.filter(e => e.hospitalId === selectedHospitalFilter);

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

    // Favor user's personal WhatsApp from profile over group number
    const targetPhone = userWhatsapp || whatsappNumber;
    const cleanPhone = targetPhone.replace(/\D/g, "");
    
    if (!cleanPhone) {
      setWaError("Configure seu WhatsApp no Meu Perfil/Configurações");
      console.warn("WhatsApp number missing");
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
        const hosp = allHospitals.find(h => h.id === e.hospitalId)?.nome || "";
      
      if (e.nomePaciente) {
        message += `👤 *Paciente: ${e.nomePaciente}*\n`;
      }
      message += `🩺 *${e.evento || "Procedimento"}*\n`;
      message += `🕒 ${e.hora}\n`;
      message += `📅 ${dateFormatted}\n`;
      if (e.descricao) message += `📝 ${e.descricao}\n`;
      if (e.tipo) message += `🏷️ ${e.tipo}\n`;
      if (e.sala) message += `📍 ${e.sala}\n`;
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

  const handlePrevDay = () => {
    const d = new Date(selectedDay + "T12:00:00");
    d.setDate(d.getDate() - 1);
    const newDate = d.toISOString().split("T")[0];
    setSelectedDay(newDate);
    // Sync currentDate (the month grid) if we move to a different month
    if (d.getMonth() !== currentDate.getMonth() || d.getFullYear() !== currentDate.getFullYear()) {
      setCurrentDate(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  };

  const handleNextDay = () => {
    const d = new Date(selectedDay + "T12:00:00");
    d.setDate(d.getDate() + 1);
    const newDate = d.toISOString().split("T")[0];
    setSelectedDay(newDate);
    // Sync currentDate (the month grid) if we move to a different month
    if (d.getMonth() !== currentDate.getMonth() || d.getFullYear() !== currentDate.getFullYear()) {
      setCurrentDate(new Date(d.getFullYear(), d.getMonth(), 1));
    }
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
                      <div className="text-[10px] font-bold text-gray-700 leading-tight truncate">
                        {event.nomePaciente ? `${event.nomePaciente} - ${event.evento}` : event.evento}
                      </div>
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

  const [allPatients, setAllPatients] = useState<{id: string, nome: string}[]>([]);
  const [showPatientSuggestions, setShowPatientSuggestions] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const q = query(collection(db, "patients"), where("groupId", "==", GROUP_ID));
    const unsub = onSnapshot(q, (snap) => {
      if (!isMounted) return;
      setAllPatients(snap.docs.map(d => ({ 
        id: d.id, 
        nome: d.data().name 
      })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, "patients"));

    return () => {
      isMounted = false;
      unsub();
    };
  }, [GROUP_ID]);

  const filteredPatients = allPatients.filter(p => 
    p.nome.toLowerCase().includes(formData.nomePaciente.toLowerCase())
  );

  const openAddModal = (dateStr?: string) => {
    setEditingEvent(null);
    setFormData({
      nomePaciente: prefilledPatientName || "",
      evento: prefilledProcedure || "",
      data: dateStr || today.toISOString().split("T")[0],
      hora: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }).replace(/^24/, "00"),
      descricao: "",
      tipo: prefilledType || "ELETIVA",
      sala: prefilledSala || "SALA 1",
      hospitalId: prefilledHospitalId || (selectedHospitalFilter !== "all" ? selectedHospitalFilter : ""),
      syncToGoogle: false
    });
    setIsModalOpen(true);
  };

  const openEditModal = (event: CalendarEvent) => {
    setEditingEvent(event);
    setFormData({
      nomePaciente: event.nomePaciente || "",
      evento: event.evento,
      data: event.data,
      hora: event.hora,
      descricao: event.descricao || "",
      tipo: event.tipo || "ELETIVA",
      sala: event.sala || "SALA 1",
      hospitalId: event.hospitalId || "",
      syncToGoogle: false
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    try {
      // 1. Save to Firestore
      let savedEventId = "";
      if (editingEvent) {
        const eventRef = doc(db, "groups", GROUP_ID, "calendario", editingEvent.id);
        const { syncToGoogle, ...dataToSave } = formData;
        await updateDoc(eventRef, {
          ...dataToSave,
          updatedAt: serverTimestamp()
        });
        savedEventId = editingEvent.id;
      } else {
        const eventsRef = collection(db, "groups", GROUP_ID, "calendario");
        const { syncToGoogle, ...dataToSave } = formData;
        const docRef = await addDoc(eventsRef, {
          ...dataToSave,
          groupId: GROUP_ID,
          createdBy: auth.currentUser.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        savedEventId = docRef.id;
      }

      // Close modal immediately after Firestore save for responsiveness
      setIsModalOpen(false);
      setEditingEvent(null);

      // 2. Sync to Google Calendar if requested (non-blocking)
      if (formData.syncToGoogle) {
        try {
          const [y, m, d] = formData.data.split("-");
          const [hh, mm] = formData.hora.split(":");
          const start = new Date(parseInt(y), parseInt(m) - 1, parseInt(d), parseInt(hh), parseInt(mm));
          const end = new Date(start.getTime() + 60 * 60 * 1000); // 1 hour duration default

          const hosp = allHospitals.find(h => h.id === formData.hospitalId)?.nome || "";
          const summary = formData.nomePaciente 
            ? `${formData.nomePaciente} - ${formData.evento}` 
            : formData.evento;
          
          let description = `Procedimento: ${formData.evento}\n`;
          if (formData.nomePaciente) description += `Paciente: ${formData.nomePaciente}\n`;
          if (hosp) description += `Hospital: ${hosp}\n`;
          if (formData.sala) description += `Sala: ${formData.sala}\n`;
          if (formData.tipo) description += `Tipo: ${formData.tipo}\n`;
          if (formData.descricao) description += `\nNotas: ${formData.descricao}`;

          const body = {
            summary,
            description,
            start: { dateTime: start.toISOString(), timeZone: "America/Sao_Paulo" },
            end: { dateTime: end.toISOString(), timeZone: "America/Sao_Paulo" }
          };

          apiFetch("/api/calendar/events", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
          }).catch(err => console.error("Non-blocking Google sync failed:", err));
        } catch (err) {
          console.error("Failed to prepare Google Calendar sync:", err);
        }
      }
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
      setEditingEvent(null);
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
                  GRADE
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

        <div className="flex flex-col items-end gap-3">
          <div className="flex items-center gap-2">
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
                    onClick={() => {
                      const now = new Date();
                      setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1));
                    }}
                    className="px-2 text-[10px] font-bold text-gray-600 hover:text-blue-600"
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
                      const nowStr = now.toISOString().split("T")[0];
                      setSelectedDay(nowStr);
                      // If month is different, sync
                      if (now.getMonth() !== currentDate.getMonth() || now.getFullYear() !== currentDate.getFullYear()) {
                        setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1));
                      }
                    }}
                    className="px-2 text-[10px] font-bold text-gray-600 hover:text-blue-600"
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
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-blue-200 hover:bg-blue-700 active:scale-95 transition-all"
            >
              <Plus size={18} />
              <span className="hidden sm:inline">Novo evento</span>
            </button>
          </div>

          {hospitalOptions.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-black text-gray-400">
                <Filter size={12} />
                <span>FILTRAR:</span>
              </div>
              <select
                value={selectedHospitalFilter}
                onChange={(e) => setSelectedHospitalFilter(e.target.value)}
                className="bg-white border border-gray-200 rounded-xl px-4 py-1.5 text-xs font-black text-gray-600 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all shadow-sm"
              >
                <option value="all">TODOS OS HOSPITAIS</option>
                {hospitalOptions.map(h => (
                  <option key={h.id} value={h.id}>{h.nome.toUpperCase()}</option>
                ))}
              </select>
            </div>
          )}
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
          <div className="max-w-4xl mx-auto p-4 sm:p-8 pt-10">
            <div className="mb-10 pl-2">
              <h1 className="text-xl font-black text-gray-900 leading-tight">Olá, {auth.currentUser?.displayName?.split(" ")[0] || "Doutor(a)"}! 👋</h1>
              <p className="text-gray-500 font-medium mt-2 text-lg">Hoje é um lindo dia para salvar vidas ❤️</p>
            </div>
            {(() => {
              let filteredListEvents: CalendarEvent[] = [];
              
              if (listNavMode === "month") {
                const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
                const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
                filteredListEvents = filteredEvents.filter(e => {
                  const eventDate = new Date(e.data + "T12:00:00");
                  return eventDate >= monthStart && eventDate <= monthEnd;
                });
              } else {
                const sDay = new Date(selectedDay + "T00:00:00");
                const nextDay = new Date(sDay);
                nextDay.setDate(nextDay.getDate() + 1);
                
                filteredListEvents = filteredEvents.filter(event => {
                  const start = new Date(event.data + "T12:00:00");
                  return (
                    (start.getDate() === sDay.getDate() && start.getMonth() === sDay.getMonth() && start.getFullYear() === sDay.getFullYear()) ||
                    (start.getDate() === nextDay.getDate() && start.getMonth() === nextDay.getMonth() && start.getFullYear() === nextDay.getFullYear())
                  );
                });
              }

              const sortedEvents = [...filteredListEvents].sort((a, b) => a.data.localeCompare(b.data) || a.hora.localeCompare(b.hora));

              if (sortedEvents.length === 0 && !isLoading) {
                return (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-white rounded-3xl p-16 text-center border border-gray-100 shadow-sm"
                  >
                    <CalendarIcon className="w-16 h-16 text-gray-200 mx-auto mb-6" />
                    <h3 className="text-lg font-bold text-gray-900">Nenhum procedimento</h3>
                    <p className="text-gray-400 mt-2 text-sm">Sua agenda local está limpa no momento. Selecione outra data ou adicione um novo procedimento.</p>
                  </motion.div>
                );
              }

              return (
                <div className="space-y-4">
                  {sortedEvents.map((event, idx) => {
                    const start = new Date(event.data + "T12:00:00");
                    const isToday = event.data === today.toISOString().split("T")[0];
                    const isSelected = selectedEventIds.has(event.id);
                    const hosp = allHospitals.find(h => h.id === event.hospitalId);

                    return (
                      <motion.div 
                        key={event.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className={`bg-white p-3.5 sm:p-5 rounded-2xl border transition-all flex items-start sm:items-center justify-between gap-3 sm:gap-6 group relative overflow-hidden ${
                          isSelected 
                            ? "border-emerald-500 shadow-xl shadow-emerald-50" 
                            : "border-gray-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] hover:shadow-xl hover:shadow-blue-900/5 hover:-translate-y-0.5"
                        }`}
                      >
                        {/* Status bar */}
                        <div className={`absolute top-0 left-0 w-1 h-full transition-colors duration-300 ${isToday ? "bg-blue-500" : "bg-gray-100 group-hover:bg-blue-300"}`} />

                        <div className="flex items-start sm:items-center gap-3 sm:gap-6 flex-1 min-w-0 ml-1">
                          {/* Date & Selection Group */}
                          <div className="flex flex-col items-center gap-2 shrink-0">
                            {/* Date Box */}
                            <div className="flex flex-col items-center justify-center w-12 h-12 sm:w-14 sm:h-14 bg-gray-50 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-all duration-300 shrink-0 shadow-inner">
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
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleEventSelection(e, event.id);
                              }}
                              className={`w-5 h-5 sm:w-6 sm:h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                                isSelected 
                                  ? "bg-emerald-500 border-emerald-500 text-white shadow-lg" 
                                  : "bg-white border-gray-100 text-transparent hover:border-emerald-300 shadow-inner"
                              }`}
                            >
                              <Check size={14} strokeWidth={4} />
                            </button>
                          </div>
                          
                          <div className="min-w-0 flex-1 py-0.5 sm:py-1">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              <span className="text-[9px] sm:text-[10px] font-black text-blue-600 bg-blue-50/50 px-2 py-0.5 rounded-lg flex items-center gap-1 border border-blue-100/30 group-hover:bg-blue-100/50 transition-colors">
                                <Clock size={10} strokeWidth={3} />
                                {event.hora}
                              </span>
                              {event.tipo && (
                                <span className={`text-[8px] sm:text-[9px] font-black px-2 py-0.5 rounded-lg border tracking-wider uppercase ${
                                  event.tipo === "URGÊNCIA" 
                                    ? "bg-red-50 text-red-500 border-red-100" 
                                    : "bg-emerald-50 text-emerald-600 border-emerald-100"
                                }`}>
                                  {event.tipo}
                                </span>
                              )}
                              {isToday && (
                                <span className="text-[8px] font-black text-white bg-blue-500 px-2 py-0.5 rounded-md shadow-sm tracking-wider uppercase">HOJE</span>
                              )}
                            </div>
                            
                            <h4 className="font-bold text-[12px] sm:text-[14px] text-gray-900 leading-tight tracking-tight group-hover:text-blue-900 transition-colors mb-0.5 sm:mb-1 break-words line-clamp-1">
                              {event.nomePaciente ? `${event.nomePaciente} - ${event.evento}` : event.evento}
                            </h4>
                            
                            {(event.descricao || hosp || event.sala) && (
                              <div className="space-y-0.5">
                                {event.descricao && (
                                  <p className="text-[9px] sm:text-[11px] font-medium text-gray-400 group-hover:text-gray-500 transition-colors break-words line-clamp-1 sm:line-clamp-2">
                                    {event.descricao}
                                  </p>
                                )}
                                {(hosp || event.sala) && (
                                  <div className="flex items-center gap-3 mt-1">
                                    {hosp && (
                                      <div className="flex items-center gap-1 text-[8px] sm:text-[9px] font-bold text-gray-300">
                                        <Building2 size={10} />
                                        <span>{hosp.nome}</span>
                                      </div>
                                    )}
                                    {event.sala && (
                                      <div className="flex items-center gap-1 text-[8px] sm:text-[9px] font-bold text-blue-300">
                                        <span className="w-1.5 h-1.5 bg-blue-200 rounded-full" />
                                        <span>{event.sala}</span>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex flex-col sm:flex-row items-center gap-0.5 sm:gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all shrink-0 ml-1">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditModal(event);
                            }}
                            className="p-1.5 sm:p-2 text-gray-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all active:scale-90"
                            title="Editar"
                          >
                            <Edit3 size={14} />
                          </button>
                          
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingEvent(event);
                              handleDelete();
                            }}
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
            })() }
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

              <form onSubmit={handleSubmit} className="pl-6 pr-6 pt-0 pb-[65px] space-y-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
                <div className="relative">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 ml-1">Nome do Paciente</label>
                  <div className="relative group">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-600 transition-colors">
                      <User size={18} />
                    </div>
                    <input 
                      required
                      type="text"
                      value={formData.nomePaciente}
                      onChange={e => {
                        setFormData({ ...formData, nomePaciente: e.target.value });
                        setShowPatientSuggestions(true);
                      }}
                      onFocus={() => setShowPatientSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowPatientSuggestions(false), 200)}
                      placeholder="Nome completo do paciente"
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-blue-600/5 focus:border-blue-600 transition-all placeholder:font-medium"
                    />
                  </div>

                  <AnimatePresence>
                    {showPatientSuggestions && formData.nomePaciente && filteredPatients.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute z-50 left-0 right-0 top-full mt-2 bg-white rounded-2xl border border-blue-50 shadow-xl shadow-blue-900/10 max-h-48 overflow-y-auto custom-scrollbar"
                      >
                        {filteredPatients.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setFormData({ ...formData, nomePaciente: p.nome });
                              setShowPatientSuggestions(false);
                            }}
                            className="w-full text-left px-5 py-3 text-sm font-bold text-gray-700 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0"
                          >
                            <div className="flex items-center gap-3">
                              <User size={14} className="text-gray-400" />
                              {p.nome}
                            </div>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 ml-1">Procedimento</label>
                  <div className="relative group">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-600 transition-colors">
                      <CalendarIcon size={18} />
                    </div>
                    <input 
                      required
                      type="text"
                      value={formData.evento}
                      onChange={e => setFormData({ ...formData, evento: e.target.value })}
                      placeholder="Ex: Cirurgia Geral, Estética..."
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-blue-600/5 focus:border-blue-600 transition-all placeholder:font-medium"
                    />
                  </div>
                  {procedureOptions.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3 pt-2 border-t border-gray-50">
                      {procedureOptions.map(opt => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setFormData({ ...formData, evento: opt })}
                          className="text-[9px] font-black px-3 py-2 bg-white border border-gray-100 rounded-xl text-gray-500 hover:border-blue-300 hover:text-blue-600 hover:shadow-sm transition-all uppercase tracking-tight"
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Data da Cirurgia</label>
                    <input 
                      required
                      type="date"
                      value={formData.data}
                      onChange={e => setFormData({ ...formData, data: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-blue-600/5 focus:border-blue-600 transition-all font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Horário & Tipo</label>
                    <div className="flex gap-3">
                      <div className="relative flex-1 group">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-600 transition-colors">
                          <Clock size={18} />
                        </div>
                        <input 
                          required
                          type="time"
                          value={formData.hora}
                          onChange={e => setFormData({ ...formData, hora: e.target.value })}
                          className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-blue-600/5 focus:border-blue-600 transition-all font-mono"
                        />
                      </div>
                      <select 
                        value={formData.tipo}
                        onChange={e => setFormData({ ...formData, tipo: e.target.value })}
                        className="bg-gray-50 border border-gray-100 rounded-2xl py-4 px-4 text-xs font-black focus:outline-none focus:ring-4 focus:ring-blue-600/5 focus:border-blue-600 transition-all cursor-pointer appearance-none shadow-inner"
                      >
                        {surgeryTypeOptions.length > 0 ? (
                          surgeryTypeOptions.map(opt => (
                            <option key={opt} value={opt}>{opt.toUpperCase()}</option>
                          ))
                        ) : (
                          <>
                            <option value="ELETIVA">ELETIVA</option>
                            <option value="URGÊNCIA">URGÊNCIA</option>
                          </>
                        )}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Hospital / Clínica</label>
                    <div className="relative group">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-600 transition-colors">
                        <Building2 size={18} />
                      </div>
                      <select 
                        value={formData.hospitalId}
                        onChange={e => setFormData({ ...formData, hospitalId: e.target.value })}
                        className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-blue-600/5 focus:border-blue-600 transition-all cursor-pointer appearance-none"
                      >
                        <option value="">Selecione o Hospital...</option>
                        {hospitalOptions.map(h => (
                          <option key={h.id} value={h.id}>{h.nome}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Sala / Unidade</label>
                    <input 
                      type="text"
                      value={formData.sala}
                      onChange={e => setFormData({ ...formData, sala: e.target.value })}
                      placeholder="Ex: Sala 01"
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-blue-600/5 focus:border-blue-600 transition-all"
                    />
                  </div>
                </div>

                <div className="mb-0">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 ml-1">Observações Adicionais</label>
                  <div className="relative group">
                    <div className="absolute left-4 top-5 text-gray-400 group-focus-within:text-blue-600 transition-colors">
                      <FileText size={18} />
                    </div>
                    <textarea 
                      value={formData.descricao}
                      onChange={e => setFormData({ ...formData, descricao: e.target.value })}
                      placeholder="Alguma recomendação ou detalhe importante?"
                      rows={3}
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl pt-[12px] pb-[3px] pl-12 pr-4 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-blue-600/5 focus:border-blue-600 transition-all resize-none min-h-[100px]"
                    />
                  </div>
                </div>

                <div 
                  className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100 flex items-center justify-between group cursor-pointer hover:bg-emerald-50 transition-all" 
                  onClick={() => setFormData({ ...formData, syncToGoogle: !formData.syncToGoogle })}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${formData.syncToGoogle ? "bg-emerald-500 text-white shadow-lg shadow-emerald-200" : "bg-white text-emerald-500 border border-emerald-100"}`}>
                      <CalendarIcon size={20} />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-gray-900 leading-tight">Adicionar à minha Agenda Google</h4>
                      <p className="text-[10px] font-bold text-gray-400">Sincroniza automaticamente este evento</p>
                    </div>
                  </div>
                  <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${formData.syncToGoogle ? "bg-emerald-500 border-emerald-500 text-white" : "bg-white border-emerald-100 text-transparent"}`}>
                    <Check size={14} strokeWidth={4} />
                  </div>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row items-center gap-4 border-t border-gray-50">
                  <div className="flex items-center gap-3 w-full sm:w-auto order-2 sm:order-1">
                    {editingEvent && (
                      <button 
                        type="button"
                        onClick={handleDelete}
                        className="flex-1 sm:flex-none p-4 text-red-500 hover:bg-red-50 rounded-2xl transition-all border border-transparent hover:border-red-100 active:scale-95 flex items-center justify-center"
                        title="Excluir Procedimento"
                      >
                        <Trash2 size={24} />
                        <span className="sm:hidden font-black uppercase text-[10px] tracking-widest ml-2">Excluir</span>
                      </button>
                    )}
                  </div>
                  <button 
                    type="submit"
                    className="w-full sm:w-auto sm:flex-1 bg-blue-600 text-white px-8 py-4.5 rounded-2xl font-black text-xs sm:text-sm shadow-2xl shadow-blue-500/20 hover:bg-blue-700 hover:shadow-blue-500/30 active:scale-[0.98] transition-all uppercase tracking-widest order-1 sm:order-2 flex items-center justify-center gap-2"
                  >
                    {editingEvent ? <Check size={20} /> : <Plus size={20} />}
                    {editingEvent ? "Salvar Alterações" : "Agendar Procedimento"}
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
