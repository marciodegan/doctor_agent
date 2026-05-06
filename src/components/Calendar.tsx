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
  Check
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
  Timestamp
} from "firebase/firestore";
import { db, auth } from "../lib/firebase";
import { motion, AnimatePresence } from "motion/react";

  interface CalendarEvent {
  id: string;
  evento: string;
  data: string; // YYYY-MM-DD
  hora: string; // HH:mm
  descricao: string;
  tipo?: string; // ELETIVA / URGÊNCIA
  sala?: string; // SALA 1 / SALA 2
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

const GROUP_ID = "main-group"; // Fallback shared group as per instruction/existence

export function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [procedureOptions, setProcedureOptions] = useState<string[]>([]);
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [whatsappNumber, setWhatsappNumber] = useState("");
  
  // Form State
  const [formData, setFormData] = useState({
    evento: "",
    data: "",
    hora: "",
    descricao: "",
    tipo: "ELETIVA",
    sala: "SALA 1"
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  useEffect(() => {
    if (!auth.currentUser) return;

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
      console.error("Error fetching events:", error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [auth.currentUser]);

  useEffect(() => {
    const fetchProcedures = async () => {
      try {
        const { getDocs } = await import("firebase/firestore");
        const q = query(collection(db, "procedureOptions"), orderBy("nome"));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          setProcedureOptions(snapshot.docs.map(d => d.data().nome));
        }
      } catch (e) {
        console.error("Error fetching procedures:", e);
      }
    };
    fetchProcedures();
  }, []);

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
  };

  const handleSendToWhatsApp = () => {
    if (selectedEventIds.size === 0) return;

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
      message += `🔹 *${e.evento}*\n`;
      message += `📅 Data: ${dateFormatted}\n`;
      message += `🕒 Hora: ${e.hora}\n`;
      if (e.tipo) message += `🏷️ Categoria: ${e.tipo}\n`;
      if (e.sala) message += `📍 Sala: ${e.sala}\n`;
      if (e.descricao) message += `📝 Obs: ${e.descricao}\n`;
      if (idx < selectedEvents.length - 1) message += `\n---\n\n`;
    });

    const cleanPhone = whatsappNumber.replace(/\D/g, "");
    if (!cleanPhone) {
      alert("Por favor, configure seu número de WhatsApp nas configurações do Chat.");
      return;
    }

    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/${cleanPhone}?text=${encodedMessage}`, "_blank");
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
      const dayEvents = events.filter(e => e.data === dateStr);
      const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;

      days.push(
        <div 
          key={day} 
          className={`h-24 sm:h-32 border-t border-l border-gray-100 p-1 sm:p-2 relative hover:bg-gray-50/80 transition-colors ${isToday ? "bg-blue-50/30" : "bg-white"}`}
        >
          <div className={`flex items-center justify-center w-6 h-6 sm:w-8 sm:h-8 rounded-full text-xs sm:text-sm font-bold mb-1 ${
            isToday ? "bg-blue-600 text-white shadow-lg shadow-blue-200" : "text-gray-500"
          }`}>
            {day}
          </div>
          
          <div className="space-y-1 overflow-y-auto max-h-[calc(100%-2rem)] custom-scrollbar">
            {dayEvents.map(event => {
              const isSelected = selectedEventIds.has(event.id);
              return (
                <div key={event.id} className="relative group/item">
                  <button
                    onClick={() => openEditModal(event)}
                    className={`w-full text-left p-1 rounded border transition-all ${
                      isSelected 
                        ? "bg-blue-50 border-blue-400 shadow-sm" 
                        : "bg-white border-blue-100 hover:border-blue-300"
                    }`}
                  >
                    <div className="text-[9px] sm:text-[10px] font-bold text-blue-600 truncate">{event.evento}</div>
                    <div className="flex items-center justify-between mt-0.5">
                      <div className="text-[8px] sm:text-[9px] text-gray-400 font-medium">{event.hora}</div>
                      {event.sala && <div className="text-[7px] font-black text-blue-400/80 uppercase">{event.sala}</div>}
                    </div>
                  </button>
                  <button
                    onClick={(e) => toggleEventSelection(e, event.id)}
                    className={`absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full border flex items-center justify-center transition-all z-10 ${
                      isSelected 
                        ? "bg-emerald-500 border-emerald-500 text-white scale-110" 
                        : "bg-white border-gray-200 text-transparent group-hover/item:text-gray-400 group-hover/item:border-blue-300"
                    }`}
                  >
                    <Check size={10} strokeWidth={4} />
                  </button>
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
      hora: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      descricao: "",
      tipo: "ELETIVA",
      sala: "SALA 1"
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
      sala: event.sala || "SALA 1"
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
      console.error("Error saving event:", error);
      alert("Erro ao salvar evento. Verifique sua conexão.");
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
            <h2 className="text-xl font-black text-gray-900 tracking-tight">
              {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h2>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Calendário de Cirurgias</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {selectedEventIds.size > 0 && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={handleSendToWhatsApp}
              className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-emerald-200 hover:bg-emerald-700 active:scale-95 transition-all mr-2"
            >
              <Share2 size={18} />
              <span className="hidden sm:inline">WhatsApp ({selectedEventIds.size})</span>
            </motion.button>
          )}

          <div className="flex bg-gray-50 rounded-xl p-1 border border-gray-100">
            <button 
              onClick={handlePrevMonth}
              className="p-2 hover:bg-white hover:shadow-sm rounded-lg transition-all text-gray-500"
            >
              <ChevronLeft size={20} />
            </button>
            <button 
              onClick={() => setCurrentDate(new Date())}
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
            onClick={() => openAddModal()}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-blue-200 hover:bg-blue-700 active:scale-95 transition-all"
          >
            <Plus size={18} />
            <span className="hidden sm:inline">Adicionar evento</span>
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 overflow-auto bg-gray-50/30">
        <div className="min-w-[600px] grid grid-cols-7 h-full">
          {DAYS.map(day => (
            <div key={day} className="py-2 text-center text-[10px] font-black uppercase tracking-widest text-gray-400 bg-white border-b border-gray-100">
              {day}
            </div>
          ))}
          {renderDays()}
        </div>
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
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5 ml-1">Categoria</label>
                    <select 
                      value={formData.tipo}
                      onChange={e => setFormData({ ...formData, tipo: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
                    >
                      <option value="ELETIVA">ELETIVA</option>
                      <option value="URGÊNCIA">URGÊNCIA</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5 ml-1">Sala</label>
                    <select 
                      value={formData.sala}
                      onChange={e => setFormData({ ...formData, sala: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
                    >
                      <option value="SALA 1">SALA 1</option>
                      <option value="SALA 2">SALA 2</option>
                    </select>
                  </div>
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
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5 ml-1">Hora</label>
                    <div className="relative">
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

                <div className="pt-4 flex items-center gap-3">
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
                    className="flex-1 bg-black text-white py-4 rounded-2xl font-bold hover:bg-zinc-800 shadow-xl shadow-gray-200 active:scale-[0.98] transition-all"
                  >
                    {editingEvent ? "Salvar Alterações" : "Adicionar ao Calendário"}
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
