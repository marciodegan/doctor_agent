import React, { useState, useEffect } from "react";
import { 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown,
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
  patientId?: string;
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
    patientId: ""
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  useEffect(() => {
    const GROUP_ID = activeGroup?.id;
    if (!GROUP_ID) return;

    if (GROUP_ID === "demo-group-hospital") {
      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const demoEvents: CalendarEvent[] = [
        {
          id: "demo-cal-1",
          nomePaciente: "Maria Silva",
          patientId: "demo-pat-1",
          evento: "Passagem de Plantão - UTI",
          data: todayStr,
          hora: "07:00",
          descricao: "Passagem de plantão geral dos leitos da UTI.",
          tipo: "URGÊNCIA",
          sala: "SALA 1",
          hospitalId: "demo-hosp-1",
          groupId: "demo-group-hospital",
          createdBy: "demo-doctor-preview",
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: "demo-cal-2",
          nomePaciente: "Carlos Eduardo Santos",
          patientId: "demo-pat-2",
          evento: "Visita Médica Multidisciplinar",
          data: todayStr,
          hora: "10:30",
          descricao: "Round clínico de enfermaria com equipe multidisciplinar.",
          tipo: "ELETIVA",
          sala: "SALA 2",
          hospitalId: "demo-hosp-1",
          groupId: "demo-group-hospital",
          createdBy: "demo-doctor-preview",
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: "demo-cal-3",
          nomePaciente: "Ana Beatriz Oliveira",
          patientId: "demo-pat-3",
          evento: "Colecistectomia Videolaparoscópica",
          data: todayStr,
          hora: "14:00",
          descricao: "Procedimento eletivo agendado.",
          tipo: "ELETIVA",
          sala: "SALA 1",
          hospitalId: "demo-hosp-2",
          groupId: "demo-group-hospital",
          createdBy: "demo-doctor-preview",
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];
      setEvents(demoEvents);
      setIsLoading(false);
      return;
    }

    if (!auth.currentUser) return;

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

    if (gId === "demo-group-hospital") {
      setAllProcedures([
        { nome: "Passagem de Plantão", active: true },
        { nome: "Visita Médica Multidisciplinar", active: true },
        { nome: "Colecistectomia Videolaparoscópica", active: true },
        { nome: "Apendicectomia", active: true }
      ]);
      setAllSurgeryTypes([
        { name: "ELETIVA", active: true },
        { name: "URGÊNCIA", active: true }
      ]);
      setAllHospitals([
        { id: "demo-hosp-1", nome: "Hospital Central & UTI", active: true },
        { id: "demo-hosp-2", nome: "Hospital Santa Clara", active: true }
      ]);
      return;
    }

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
  const [listNavMode, setListNavMode] = useState<"day" | "month">("month");
  
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
    
    window.location.href = waUrl;
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
            setListNavMode("day");
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
    if (!activeGroup?.id) return;
    let isMounted = true;
    const q = query(collection(db, "patients"), where("groupId", "==", activeGroup.id));
    const unsub = onSnapshot(q, (snap) => {
      if (!isMounted) return;
      setAllPatients(snap.docs.map(d => ({ 
        id: d.id, 
        nome: d.data().name || d.data().nome || "" 
      })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, "patients"));

    return () => {
      isMounted = false;
      unsub();
    };
  }, [activeGroup?.id]);

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
      patientId: ""
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
      patientId: event.patientId || ""
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    try {
      // Automatically resolve patientId and nomePaciente if possible
      let finalPatientId = formData.patientId || "";
      let finalNomePaciente = formData.nomePaciente || "";

      if (!finalPatientId && finalNomePaciente) {
        const queryName = finalNomePaciente.trim().toLowerCase();
        const matched = allPatients.find(p => p.nome.trim().toLowerCase() === queryName);
        if (matched) {
          finalPatientId = matched.id;
          finalNomePaciente = matched.nome; // Use dynamic exact name
        }
      } else if (finalPatientId && !finalNomePaciente) {
        const matched = allPatients.find(p => p.id === finalPatientId);
        if (matched) {
          finalNomePaciente = matched.nome;
        }
      }

      const dataToSave = {
        ...formData,
        patientId: finalPatientId,
        nomePaciente: finalNomePaciente
      };

      // 1. Save to Firestore
      let savedEventId = "";
      if (editingEvent) {
        const eventRef = doc(db, "groups", GROUP_ID, "calendario", editingEvent.id);
        await updateDoc(eventRef, {
          ...dataToSave,
          updatedAt: serverTimestamp()
        });
        savedEventId = editingEvent.id;
      } else {
        const eventsRef = collection(db, "groups", GROUP_ID, "calendario");
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
    <div className="flex flex-col bg-white rounded-3xl border border-gray-100 shadow-sm">
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
      <div 
        style={{
          paddingBottom: "calc(7rem + env(safe-area-inset-bottom, 0px))"
        }}
        className="flex-1 bg-gray-50/30 overflow-y-auto custom-scrollbar"
      >
        {viewMode === "month" ? (
          <div className="min-w-[600px] grid grid-cols-7 border-b border-gray-100">
            {DAYS.map(day => (
              <div key={day} className="py-2 text-center text-[10px] font-black uppercase tracking-widest text-gray-400 bg-white border-b border-gray-100">
                {day}
              </div>
            ))}
            {renderDays()}
          </div>
        ) : (
          <div className="max-w-4xl mx-auto p-3 sm:p-6 lg:p-8 pt-8">
            <div className="mb-10 pl-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-xl font-black text-gray-900 leading-tight">Olá, {auth.currentUser?.displayName?.split(" ")[0] || "Doutor(a)"}! 👋</h1>
                <p className="text-gray-500 font-medium mt-2 text-lg">Hoje é um lindo dia para salvar vidas ❤️</p>
              </div>
              
              <div className="flex bg-gray-100 p-1 rounded-2xl self-start sm:self-center shrink-0 border border-gray-100">
                <button 
                  onClick={() => setListNavMode("day")}
                  type="button"
                  className={`px-4 py-2 rounded-xl text-xs font-black tracking-wider transition-all ${listNavMode === "day" ? "bg-white text-blue-600 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}
                >
                  DIA SELECIONADO
                </button>
                <button 
                  onClick={() => setListNavMode("month")}
                  type="button"
                  className={`px-4 py-2 rounded-xl text-xs font-black tracking-wider transition-all ${listNavMode === "month" ? "bg-white text-blue-600 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}
                >
                  MÊS INTEIRO
                </button>
              </div>
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
                const sDayStr = selectedDay;
                const sDayObj = new Date(selectedDay + "T12:00:00");
                const nextDayObj = new Date(sDayObj);
                nextDayObj.setDate(nextDayObj.getDate() + 1);
                const nextDayStr = nextDayObj.toISOString().split("T")[0];
                
                filteredListEvents = filteredEvents.filter(event => {
                  return event.data === sDayStr || event.data === nextDayStr;
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
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 xs:p-5 sm:p-10 md:p-12 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-0"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl z-10 border border-gray-100 flex flex-col my-auto overflow-hidden"
            >
              {/* Header */}
              <div className="px-6 sm:px-8 pt-6 sm:pt-8 pb-4 flex flex-col gap-0.5 text-left relative border-b border-slate-100 shrink-0 bg-white">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="absolute right-6 sm:right-8 top-6 sm:top-8 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-all cursor-pointer"
                >
                  <X size={20} />
                </button>
                <h3 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight leading-tight flex items-center gap-2">
                  <span>📅</span> {editingEvent ? "Editar Evento" : "Novo Evento"}
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 font-medium pr-10">
                  {editingEvent ? "Atualize os dados do compromisso." : "Preencha os dados abaixo para criar o compromisso."}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col min-h-0 overflow-hidden">
                <div className="px-6 sm:px-8 py-6 space-y-6 overflow-y-auto max-h-[58vh] sm:max-h-[62vh] custom-scrollbar">
                  
                  {/* Section 1: Paciente e procedimento */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-black text-slate-800 tracking-tight text-left pb-1.5 border-b border-slate-100 flex items-center gap-1.5">
                      Paciente e procedimento
                    </h4>
                    <div className="space-y-4">
                      
                      {/* Nome do Paciente Group */}
                      <div className="space-y-1.5 flex flex-col text-left relative">
                        <label className="text-xs font-semibold text-slate-700 ml-0.5">Nome do paciente</label>
                        <div className="relative group">
                          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors pointer-events-none">
                            <User size={18} />
                          </div>
                          <input 
                            required
                            type="text"
                            value={formData.nomePaciente}
                            onChange={e => {
                              setFormData({ ...formData, nomePaciente: e.target.value, patientId: "" });
                              setShowPatientSuggestions(true);
                            }}
                            onFocus={() => setShowPatientSuggestions(true)}
                            onBlur={() => setTimeout(() => setShowPatientSuggestions(false), 200)}
                            placeholder="Nome completo do paciente"
                            className="w-full h-12 pl-11 pr-4 bg-white border border-gray-200 rounded-xl text-slate-800 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all shadow-sm placeholder:text-slate-400/70"
                          />
                        </div>

                        <AnimatePresence>
                          {showPatientSuggestions && formData.nomePaciente && filteredPatients.length > 0 && (
                            <motion.div
                              initial={{ opacity: 0, y: -10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -10 }}
                              className="absolute z-50 left-0 right-0 top-full mt-2 bg-white rounded-2xl border border-slate-100 shadow-xl shadow-blue-900/10 max-h-48 overflow-y-auto custom-scrollbar"
                            >
                              {filteredPatients.map(p => (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => {
                                    setFormData({ ...formData, nomePaciente: p.nome, patientId: p.id });
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

                      {/* Procedimento Group */}
                      <div className="space-y-1.5 flex flex-col text-left">
                        <label className="text-xs font-semibold text-slate-700 ml-0.5">Procedimento</label>
                        <div className="relative group">
                          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors pointer-events-none">
                            <CalendarIcon size={18} />
                          </div>
                          <input 
                            required
                            type="text"
                            value={formData.evento}
                            onChange={e => setFormData({ ...formData, evento: e.target.value })}
                            placeholder="Ex: Cirurgia Geral, Estética..."
                            className="w-full h-12 pl-11 pr-4 bg-white border border-gray-200 rounded-xl text-slate-800 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all shadow-sm placeholder:text-slate-400/70"
                          />
                        </div>
                        
                        {/* Chips */}
                        {procedureOptions.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2 ml-0.5">
                            {procedureOptions.map(opt => {
                              const isSelected = formData.evento === opt;
                              return (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() => setFormData({ ...formData, evento: opt })}
                                  className={`px-3 py-1.5 rounded-xl text-[11px] tracking-wide transition-all border cursor-pointer ${
                                    isSelected 
                                      ? "bg-blue-600 border-blue-600 text-white shadow-sm font-semibold" 
                                      : "bg-slate-50 hover:bg-slate-100/80 border-slate-100/50 text-slate-500 hover:text-slate-700 font-medium"
                                  }`}
                                >
                                  {opt}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                    </div>
                  </div>

                  {/* Section 2: Data da cirurgia */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-black text-slate-800 tracking-tight text-left pb-1.5 border-b border-slate-100 flex items-center gap-1.5">
                      Data da cirurgia
                    </h4>
                    <div className="space-y-1.5 flex flex-col text-left">
                      <label className="text-xs font-semibold text-slate-700 ml-0.5">Data</label>
                      <div className="relative group">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors pointer-events-none">
                          <CalendarIcon size={18} />
                        </div>
                        <input 
                          required
                          type="date"
                          value={formData.data}
                          onChange={e => setFormData({ ...formData, data: e.target.value })}
                          className="w-full h-12 pl-11 pr-4 bg-white border border-gray-200 rounded-xl text-slate-800 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all shadow-sm font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Section 3: Horário e tipo */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-black text-slate-800 tracking-tight text-left pb-1.5 border-b border-slate-100 flex items-center gap-1.5">
                      Horário e tipo
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5 flex flex-col text-left">
                        <label className="text-xs font-semibold text-slate-700 ml-0.5">Horário</label>
                        <div className="relative group">
                          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors pointer-events-none">
                            <Clock size={18} />
                          </div>
                          <input 
                            required
                            type="time"
                            value={formData.hora}
                            onChange={e => setFormData({ ...formData, hora: e.target.value })}
                            className="w-full h-12 pl-11 pr-4 bg-white border border-gray-200 rounded-xl text-slate-800 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all shadow-sm font-mono"
                          />
                        </div>
                      </div>
                      
                      <div className="space-y-1.5 flex flex-col text-left">
                        <label className="text-xs font-semibold text-slate-700 ml-0.5">Tipo</label>
                        <div className="relative">
                          <select 
                            value={formData.tipo}
                            onChange={e => setFormData({ ...formData, tipo: e.target.value })}
                            className="w-full h-12 px-4 bg-white border border-gray-200 rounded-xl text-slate-800 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none appearance-none cursor-pointer pr-10 shadow-sm transition-all"
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
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                            <ChevronDown size={16} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Section 4: Hospital / Clínica */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-black text-slate-800 tracking-tight text-left pb-1.5 border-b border-slate-100 flex items-center gap-1.5">
                      Hospital / Clínica
                    </h4>
                    <div className="space-y-1.5 flex flex-col text-left">
                      <label className="text-xs font-semibold text-slate-700 ml-0.5">Hospital / Clínica</label>
                      <div className="relative">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                          <Building2 size={18} />
                        </div>
                        <select 
                          value={formData.hospitalId}
                          onChange={e => setFormData({ ...formData, hospitalId: e.target.value })}
                          className="w-full h-12 pl-11 bg-white border border-gray-200 rounded-xl text-slate-800 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none appearance-none cursor-pointer pr-10 shadow-sm transition-all overflow-hidden whitespace-nowrap text-ellipsis"
                        >
                          <option value="">Selecione o Hospital...</option>
                          {hospitalOptions.map(h => (
                            <option key={h.id} value={h.id}>{h.nome}</option>
                          ))}
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                          <ChevronDown size={16} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Section 5: Detalhes */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-black text-slate-800 tracking-tight text-left pb-1.5 border-b border-slate-100 flex items-center gap-1.5">
                      Detalhes
                    </h4>
                    <div className="space-y-4">
                      <div className="space-y-1.5 flex flex-col text-left">
                        <label className="text-xs font-semibold text-slate-700 ml-0.5">Sala / Unidade</label>
                        <input 
                          type="text"
                          value={formData.sala}
                          onChange={e => setFormData({ ...formData, sala: e.target.value })}
                          placeholder="Ex: Sala 01"
                          className="w-full h-12 px-4 bg-white border border-gray-200 rounded-xl text-slate-800 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all shadow-sm placeholder:text-slate-400/70"
                        />
                      </div>
                      
                      <div className="space-y-1.5 flex flex-col text-left">
                        <label className="text-xs font-semibold text-slate-700 ml-0.5">Observações <span className="text-slate-400 font-normal lowercase">(opcional)</span></label>
                        <div className="relative group">
                          <div className="absolute left-3.5 top-4 text-slate-400 group-focus-within:text-blue-500 transition-colors pointer-events-none">
                            <FileText size={18} />
                          </div>
                          <textarea 
                            value={formData.descricao}
                            onChange={e => setFormData({ ...formData, descricao: e.target.value })}
                            placeholder="Alguma recomendação ou detalhe importante?"
                            rows={3}
                            className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-slate-800 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all shadow-sm resize-none min-h-[100px] placeholder:text-slate-400/70"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Google Calendar Box disabled */}

                </div>

                {/* Footer buttons */}
                <div className="px-6 sm:px-8 py-5 sm:py-6 bg-white border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0">
                  <div className="flex items-center justify-start gap-3 w-full sm:w-auto">
                    {editingEvent ? (
                      <button 
                        type="button"
                        onClick={handleDelete}
                        className="px-5 py-3 h-12 text-xs font-bold text-red-500 hover:bg-red-50/50 border border-transparent hover:border-red-100 rounded-2xl transition-all flex items-center gap-2 group cursor-pointer"
                        title="Excluir Procedimento"
                      >
                        <Trash2 size={16} />
                        Excluir
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsModalOpen(false)}
                        className="px-5 py-3 h-12 text-xs font-bold text-slate-400 hover:text-red-500 hover:bg-red-50/50 rounded-2xl transition-all flex items-center gap-2 group cursor-pointer"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>

                  <button 
                    type="submit"
                    className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-8 h-12 rounded-2xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/10 active:scale-[0.98] cursor-pointer"
                  >
                    {editingEvent ? <Check size={16} strokeWidth={2.5} /> : <Plus size={16} strokeWidth={2.5} />}
                    {editingEvent ? "Salvar Alterações" : "Criar evento"}
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
