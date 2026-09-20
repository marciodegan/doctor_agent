import React, { useState, useEffect, useRef } from "react";
import { Building2, Bed, Activity, ArrowLeft, ArrowRight, Plus, MapPin, User, FileText, ChevronRight, Search, Calendar as CalendarIcon } from "lucide-react";
import { useGroup } from "../contexts/GroupContext";
import { collection, query, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";

interface CalendarEvent {
  id: string;
  evento: string;
  data: string;
  hora: string;
  tipo?: string;
  descricao?: string;
  patientId?: string;
  nomePaciente?: string;
  status?: string;
}

interface Patient {
  id: string;
  nome: string;
  status: string;
  statusId?: string;
  hospitalId?: string;
  hospitalName?: string;
  roomNumber?: string;
  procedure?: string;
  surgery_type?: string;
}

interface Hospital {
  id: string;
  nome: string;
}

interface Status {
  id: string;
  nome: string;
  sortOrder?: number;
}

interface PatientListViewProps {
  patients: Patient[];
  statuses: Status[];
  hospitals: Hospital[];
  hospitalFilter?: string;
  statusFilter?: string;
  sort?: string;
  pagination?: {
    page: number;
    totalPages: number;
    hospitalFilter?: string;
    statusFilter?: string;
    sort: string;
  };
  onCommand: (cmd: string, shouldClear?: boolean) => void;
}

export const PatientListView: React.FC<PatientListViewProps> = ({
  patients,
  statuses,
  hospitals,
  hospitalFilter,
  statusFilter,
  sort = "id",
  pagination,
  onCommand
}) => {
  const { activeGroup, apiFetch } = useGroup();
  const [localPatients, setLocalPatients] = useState<Patient[]>(patients);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  useEffect(() => {
    if (!activeGroup?.id) {
      setEvents([]);
      return;
    }

    const eventsRef = collection(db, "groups", activeGroup.id, "calendario");
    const q = query(eventsRef);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data()
        })) as CalendarEvent[];
        setEvents(items);
      },
      (error) => {
        console.error("Error listening to group calendar events in PatientListView:", error);
      }
    );

    return () => unsubscribe();
  }, [activeGroup?.id]);

  const getEventStartDateTime = (e: CalendarEvent): Date | null => {
    if (!e.data || !e.hora) return null;
    const dateParts = e.data.split("-").map(Number); // YYYY-MM-DD
    const timeParts = e.hora.split(":").map(Number); // HH:mm
    if (dateParts.length < 3 || timeParts.length < 2 || dateParts.some(isNaN) || timeParts.some(isNaN)) {
      return null;
    }
    return new Date(dateParts[0], dateParts[1] - 1, dateParts[2], timeParts[0], timeParts[1]);
  };

  const normalizeString = (str: string) => {
    return str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  };

  const getPatientEvents = (p: Patient) => {
    const now = new Date();
    const patientEvents = events
      .filter((e) => {
        // match client-side using normalized strings or patientIds
        const patientIdInEvent = e.patientId || "";
        const patientNameInEvent = e.nomePaciente ? normalizeString(e.nomePaciente) : "";
        const patientNameInList = p.nome ? normalizeString(p.nome) : "";

        const isIdMatch = patientIdInEvent && p.id && patientIdInEvent === p.id;
        const isNameMatch = patientNameInEvent && patientNameInList && (
          patientNameInEvent === patientNameInList ||
          patientNameInList.includes(patientNameInEvent) ||
          patientNameInEvent.includes(patientNameInList)
        );

        const isMatch = isIdMatch || isNameMatch;
        if (!isMatch) return false;

        // status: active
        const isActive = !e.status || e.status === "active";
        if (!isActive) return false;

        return true;
      })
      .map((e) => {
        const start = getEventStartDateTime(e);
        return {
          ...e,
          startDateTime: start
        };
      })
      .filter((e): e is CalendarEvent & { startDateTime: Date } => e.startDateTime !== null)
      .sort((a, b) => {
        const timeA = a.startDateTime.getTime();
        const timeB = b.startDateTime.getTime();
        const referenceTime = now.getTime() - 3 * 60 * 60 * 1000; // 3-hour grace window

        const isAUpcoming = timeA >= referenceTime;
        const isBUpcoming = timeB >= referenceTime;

        if (isAUpcoming && !isBUpcoming) return -1;
        if (!isAUpcoming && isBUpcoming) return 1;

        if (isAUpcoming && isBUpcoming) {
          // both are upcoming/current: show closest first
          return timeA - timeB;
        } else {
          // both are in the past: show most recent first
          return timeB - timeA;
        }
      });

    return patientEvents;
  };

  const formatEventTime = (date: Date) => {
    const now = new Date();
    
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    const pad = (n: number) => n.toString().padStart(2, "0");
    const timeStr = `${pad(date.getHours())}:${pad(date.getMinutes())}`;

    if (targetDate.getTime() === today.getTime()) {
      return `Hoje ${timeStr}`;
    } else if (targetDate.getTime() === tomorrow.getTime()) {
      return `Amanhã ${timeStr}`;
    } else {
      return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${timeStr}`;
    }
  };

  useEffect(() => {
    setLocalPatients(patients);
    setSearchTerm("");
  }, [patients]);

  const fetchPatients = async (searchVal: string) => {
    setLoading(true);
    try {
      let apiUrl = "/api/app/patients?full=true";

      if (searchVal.trim()) {
        apiUrl += `&search=${encodeURIComponent(searchVal.trim())}`;
      }

      if (hospitalFilter) {
        apiUrl += `&hospitalId=${encodeURIComponent(hospitalFilter)}`;
      }

      if (statusFilter) {
        apiUrl += `&statusId=${encodeURIComponent(statusFilter)}`;
      }

      const res = await apiFetch(apiUrl);
      const data = await res.json();
      
      if (data && data.patients) {
        setLocalPatients(data.patients);
      } else if (Array.isArray(data)) {
        setLocalPatients(data);
      }
    } catch (err) {
      console.error("Error fetching patients with search:", err);
    } finally {
      setLoading(false);
    }
  };

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timer = setTimeout(() => {
      fetchPatients(searchTerm);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm, activeGroup?.id, hospitalFilter, statusFilter]);

  const isHospFiltered = hospitalFilter && hospitalFilter !== "1" && hospitalFilter !== "all" && hospitalFilter !== "";
  const isStatusFiltered = statusFilter && statusFilter !== "1" && statusFilter !== "all" && statusFilter !== "";

  // Compute final filtered patients set safely starting from localPatients
  const selectedStatus = statuses.find((s: any) => s.id.toString() === statusFilter);
  const isFilteringAlta = selectedStatus && (selectedStatus.nome || "").toLowerCase() === "alta";

  let processedPatients = [...localPatients].filter(p => (p as any).recordStatus !== "removed");
  
  // 1. Filter out 'Alta' unless explicitly filtering by 'Alta' or searching
  if (!isFilteringAlta && !searchTerm.trim()) {
    processedPatients = processedPatients.filter(p => {
      const sName = (p.status || "").toLowerCase();
      return sName !== "alta";
    });
  }

  // 2. Filter by hospital (safety check)
  if (isHospFiltered) {
    processedPatients = processedPatients.filter(p => 
      p.hospitalId?.toString() === hospitalFilter
    );
  }

  // 3. Filter by status (safety check)
  if (isStatusFiltered) {
    processedPatients = processedPatients.filter(p => 
      p.statusId?.toString() === statusFilter || p.status === selectedStatusObj?.nome
    );
  }

  // 4. Client-side search matching
  if (searchTerm.trim()) {
    const searchNorm = searchTerm.toLowerCase().trim();
    processedPatients = processedPatients.filter(p => 
      (p.nome || "").toLowerCase().includes(searchNorm)
    );
  }

  const searchedPatients = processedPatients;

  const getStatusStyles = (statusName: string) => {
    const s = (statusName || "").toLowerCase();
    if (s.includes("alta")) {
      return { 
        bg: "bg-emerald-50 border-emerald-150 text-emerald-700", 
        border: "border-emerald-200",
        text: "text-emerald-700",
        emoji: "✅", 
        headerClass: "bg-emerald-50/50 border-l-4 border-emerald-500 text-emerald-900" 
      };
    }
    if (s.includes("cirurgia") || s.includes("operatório") || s.includes("operatorio")) {
      if (s.includes("pré") || s.includes("pre")) {
        return { 
          bg: "bg-purple-50 border-purple-150 text-purple-700", 
          border: "border-purple-200",
          text: "text-purple-700",
          emoji: "🧪", 
          headerClass: "bg-purple-50/50 border-l-4 border-purple-500 text-purple-900" 
        };
      }
      return { 
        bg: "bg-rose-50 border-rose-150 text-rose-700", 
        border: "border-rose-200",
        text: "text-rose-700",
        emoji: "🔴", 
        headerClass: "bg-rose-50/50 border-l-4 border-rose-500 text-rose-900" 
      };
    }
    if (s.includes("recuperação") || s.includes("recuperacao")) {
      return { 
        bg: "bg-orange-50 border-orange-150 text-orange-700", 
        border: "border-orange-200",
        text: "text-orange-700",
        emoji: "🧡", 
        headerClass: "bg-orange-50/50 border-l-4 border-orange-500 text-orange-900" 
      };
    }
    if (s.includes("internado")) {
      return { 
        bg: "bg-blue-50 border-blue-150 text-blue-700", 
        border: "border-blue-200",
        text: "text-blue-700",
        emoji: "🏥", 
        headerClass: "bg-blue-50/50 border-l-4 border-blue-500 text-blue-900" 
      };
    }
    if (s.includes("observação") || s.includes("observacao")) {
      return { 
        bg: "bg-amber-50 border-amber-150 text-amber-700", 
        border: "border-amber-200",
        text: "text-amber-700",
        emoji: "👁️", 
        headerClass: "bg-amber-50/50 border-l-4 border-amber-500 text-amber-900" 
      };
    }
    return { 
      bg: "bg-slate-50 border-slate-150 text-slate-700", 
      border: "border-slate-200",
      text: "text-slate-700",
      emoji: "📋", 
      headerClass: "bg-slate-100/60 border-l-4 border-slate-400 text-slate-900" 
    };
  };

  const selectedHospitalObj = isHospFiltered 
    ? hospitals.find((h: any) => h.id.toString() === hospitalFilter) 
    : null;

  const selectedStatusObj = isStatusFiltered 
    ? statuses.find((s: any) => s.id.toString() === statusFilter) 
    : null;

  const countPre = patients.filter(p => normalizeString(p.status || "").includes("pre") || normalizeString(p.status || "").includes("pré")).length;
  const countPos = patients.filter(p => normalizeString(p.status || "").includes("pos") || normalizeString(p.status || "").includes("pós")).length;
  const countAcomp = patients.filter(p => normalizeString(p.status || "").includes("acompanhamento")).length;
  const countAlta = patients.filter(p => normalizeString(p.status || "").includes("alta")).length;

  const currentDateFormatted = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long"
  });

  return (
    <div className="space-y-6 w-full text-slate-800 pb-20">
      {/* Modern Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 font-black text-lg">
            🩺
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-900 tracking-tight leading-none">Dr. Agent</h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">Seu dia, mais organizado</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => onCommand("/open_search", true)}
            className="w-10 h-10 rounded-full bg-slate-50 hover:bg-slate-100 border border-slate-200/80 flex items-center justify-center text-slate-700 transition"
            title="Buscar"
          >
            <Search size={18} />
          </button>
          <div className="w-10 h-10 rounded-full bg-blue-600 border-2 border-white flex items-center justify-center text-white font-bold text-xs shadow-md overflow-hidden relative">
            <span className="absolute inset-0 bg-blue-700 flex items-center justify-center font-black">M</span>
            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white"></div>
          </div>
        </div>
      </div>

      {/* Greeting & Date */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Bom dia, Dr. Marcio!</h2>
          <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">Aqui está o resumo dos seus pacientes.</p>
        </div>
        <div className="inline-flex items-center gap-2 bg-slate-50 px-3.5 py-2 rounded-2xl border border-slate-200/70 shadow-sm text-xs font-bold text-slate-700 shrink-0">
          <CalendarIcon size={14} className="text-blue-600" />
          <span className="capitalize">{currentDateFormatted}</span>
        </div>
      </div>

      {/* Modern Search Bar */}
      <div className="relative">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar paciente, hospital, leito, procedimento..."
          className="w-full rounded-2xl bg-white border border-slate-200/90 pl-11 pr-4 py-3.5 text-xs sm:text-sm font-semibold text-slate-800 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 outline-none transition-all placeholder-slate-400 font-sans"
        />
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
          <Search size={18} />
        </div>
      </div>

      {/* Premium Filter Chips */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Hospital Filter Chip */}
        <div className="relative inline-flex items-center">
          <select
            value={hospitalFilter || ""}
            onChange={(e) => {
              const val = e.target.value;
              onCommand(`/pacientes hospital:${val} status:${statusFilter || ""} sort:${sort}`, true);
            }}
            aria-label="Filtrar por hospital"
            className="appearance-none bg-blue-50/80 hover:bg-blue-100/70 border border-blue-200/85 text-blue-800 text-xs font-bold px-3.5 py-2.5 rounded-2xl shadow-sm pr-8 cursor-pointer outline-none transition"
          >
            <option value="">🏥 Todos os hospitais</option>
            {hospitals.map((h) => (
              <option key={h.id} value={h.id}>
                🏥 {h.nome}
              </option>
            ))}
          </select>
          <span className="absolute right-3 pointer-events-none text-blue-600 text-[10px]">▼</span>
        </div>

        {/* Status Filter Chip */}
        <div className="relative inline-flex items-center">
          <select
            value={statusFilter || ""}
            onChange={(e) => {
              const val = e.target.value;
              onCommand(`/pacientes hospital:${hospitalFilter || ""} status:${val} sort:${sort}`, true);
            }}
            aria-label="Filtrar por status"
            className="appearance-none bg-blue-50/80 hover:bg-blue-100/70 border border-blue-200/85 text-blue-800 text-xs font-bold px-3.5 py-2.5 rounded-2xl shadow-sm pr-8 cursor-pointer outline-none transition"
          >
            <option value="">⚙ Todos os status</option>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                ⚙ {s.nome}
              </option>
            ))}
          </select>
          <span className="absolute right-3 pointer-events-none text-blue-600 text-[10px]">▼</span>
        </div>

        {/* Clear Filters Chip */}
        {(isHospFiltered || isStatusFiltered) && (
          <button
            onClick={() => onCommand("/pacientes", true)}
            className="inline-flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold px-3.5 py-2.5 rounded-2xl shadow-sm transition"
          >
            <span>× Limpar</span>
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-slate-200 shadow-sm">
          <Activity size={32} className="mx-auto text-blue-500 mb-2 animate-spin" />
          <p className="text-slate-500 text-xs font-medium">Buscando pacientes...</p>
        </div>
      ) : patients.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-slate-200 shadow-sm">
          <Activity size={32} className="mx-auto text-slate-400 mb-2 animate-pulse" />
          <p className="text-slate-500 text-xs font-medium">Nenhum paciente encontrado.</p>
        </div>
      ) : searchedPatients.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-slate-200 shadow-sm">
          <Activity size={32} className="mx-auto text-slate-400 mb-2 animate-pulse" />
          <p className="text-slate-500 text-xs font-medium">Nenhum paciente encontrado para esta busca.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {isStatusFiltered && !isHospFiltered ? (
            // Group by Hospital
            (() => {
              const hospitalGrouped: Record<string, { id: string, name: string, list: Patient[] }> = {};
              searchedPatients.forEach((p) => {
                const hName = p.hospitalName || "Sem Hospital";
                const hId = p.hospitalId?.toString() || "999";
                if (!hospitalGrouped[hId]) {
                  hospitalGrouped[hId] = { id: hId, name: hName, list: [] };
                }
                hospitalGrouped[hId].list.push(p);
              });

              const sortedHospitals = Object.values(hospitalGrouped).sort((a, b) => a.name.localeCompare(b.name));

              return sortedHospitals.map(({ name: hName, list: groupedPatients }, hIdx) => (
                <div key={hIdx} className="space-y-3 bg-white/60 p-4 rounded-3xl border border-slate-200/60 shadow-sm">
                  {/* Hospital Group Header */}
                  <div className="flex items-center justify-between text-slate-900 px-2 py-1 select-none">
                    <div className="flex items-center gap-2 font-black text-xs uppercase tracking-wider text-slate-800">
                      <span className="text-base">🏥</span>
                      <span>{hName}</span>
                    </div>
                    <span className="text-[11px] bg-slate-100 text-slate-600 px-3 py-1 rounded-full font-bold">
                      {groupedPatients.length} {groupedPatients.length === 1 ? "paciente" : "pacientes"}
                    </span>
                  </div>

                  {/* Patient Cards in Hospital Group */}
                  <div className="grid grid-cols-1 gap-3">
                    {groupedPatients.map((p) => {
                      const initials = p.nome ? p.nome.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase() : "PA";
                      const pEvents = getPatientEvents(p);
                      const nextEvent = pEvents[0];
                      return (
                        <div 
                          key={p.id}
                          onClick={() => onCommand(`/p ${p.id}`, true)}
                          className="group bg-white rounded-2xl shadow-sm hover:shadow-md border border-slate-100/90 p-4 transition-all duration-200 cursor-pointer text-left relative overflow-hidden"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0 border border-blue-100 shadow-sm">
                                {initials}
                              </div>
                              <div>
                                <h3 className="text-sm sm:text-base font-bold text-slate-900 group-hover:text-blue-600 transition-colors tracking-tight">
                                  {p.nome}
                                </h3>
                                <div className="mt-0.5 flex items-center gap-1.5 flex-wrap text-xs text-slate-500 font-medium">
                                  <span className="font-bold text-slate-700 uppercase tracking-tight">
                                    {p.hospitalName || "Sem Hospital"}
                                  </span>
                                  <span>•</span>
                                  <span>{p.roomNumber ? `Leito ${p.roomNumber}` : "Sem leito"}</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {p.status && (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-100">
                                  {p.status}
                                </span>
                              )}
                              <span className="text-slate-400 group-hover:text-slate-600">⋮</span>
                            </div>
                          </div>

                          {(nextEvent || p.procedure || p.surgery_type) && (
                            <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                              {nextEvent && (
                                <span className="inline-flex items-center gap-1 font-semibold text-blue-700 bg-blue-50/70 px-2.5 py-1 rounded-lg">
                                  📅 {formatEventTime(nextEvent.startDateTime)}
                                </span>
                              )}
                              {(p.procedure || p.surgery_type) && (
                                <span className="inline-flex items-center gap-1 font-medium text-slate-600 truncate max-w-[240px]">
                                  📄 {p.procedure || p.surgery_type}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ));
            })()
          ) : (
            // Group by Status (Default view)
            (() => {
              const statusGrouped: Record<string, { id: string, name: string, list: Patient[] }> = {};
              searchedPatients.forEach((p) => {
                const sName = p.status || "Sem Status";
                const sId = p.statusId?.toString() || "999";
                if (!statusGrouped[sId]) {
                  statusGrouped[sId] = { id: sId, name: sName, list: [] };
                }
                statusGrouped[sId].list.push(p);
              });

              // Sort statuses by their sort order configured in DB
              const sortedStatuses = Object.values(statusGrouped).sort((a, b) => {
                const sA = statuses.find((s) => s.id?.toString() === a.id);
                const sB = statuses.find((s) => s.id?.toString() === b.id);
                const orderA = sA && typeof sA.sortOrder === "number" ? sA.sortOrder : 999999;
                const orderB = sB && typeof sB.sortOrder === "number" ? sB.sortOrder : 999999;
                if (orderA !== orderB) return orderA - orderB;
                return a.name.localeCompare(b.name);
              });

              return sortedStatuses.map(({ name: sName, list: groupedPatients }, statusIdx) => {
                const config = getStatusStyles(sName);
                return (
                  <div key={statusIdx} className="space-y-3 bg-white/70 p-4 sm:p-5 rounded-3xl border border-slate-200/70 shadow-sm">
                    {/* Status Group Header */}
                    <div className="flex items-center justify-between select-none">
                      <div className="flex items-center gap-2.5">
                        <span className="text-base">{config.emoji}</span>
                        <div>
                          <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-900">
                            {sName}
                          </h3>
                          <p className="text-[11px] text-slate-500 font-medium">
                            {groupedPatients.length} {groupedPatients.length === 1 ? "paciente" : "pacientes"}
                          </p>
                        </div>
                      </div>
                      <button 
                        onClick={() => onCommand(`/pacientes status:${sName}`, true)}
                        className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                      >
                        <span>Ver todos</span>
                        <ChevronRight size={14} />
                      </button>
                    </div>

                    {/* Patient Cards in Status Group */}
                    <div className="grid grid-cols-1 gap-3 pt-1">
                      {groupedPatients.map((p) => {
                        const hDisplay = p.hospitalName || "Sem Hospital";
                        const initials = p.nome ? p.nome.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase() : "PA";
                        const pEvents = getPatientEvents(p);
                        const nextEvent = pEvents[0];
                        return (
                          <div 
                            key={p.id}
                            onClick={() => onCommand(`/p ${p.id}`, true)}
                            className="group bg-white rounded-2xl shadow-sm hover:shadow-md border border-slate-100/90 p-4 transition-all duration-200 cursor-pointer text-left relative overflow-hidden"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0 border border-blue-100 shadow-sm">
                                  {initials}
                                </div>
                                <div>
                                  <h4 className="text-sm sm:text-base font-bold text-slate-900 group-hover:text-blue-600 transition-colors tracking-tight">
                                    {p.nome}
                                  </h4>
                                  <div className="mt-0.5 flex items-center gap-1.5 flex-wrap text-xs text-slate-500 font-medium">
                                    <span className="font-bold text-slate-700 uppercase tracking-tight">
                                      {hDisplay}
                                    </span>
                                    <span>•</span>
                                    <span>{p.roomNumber ? `Leito ${p.roomNumber}` : "Sem leito"}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {p.status && (
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-100">
                                    {p.status}
                                  </span>
                                )}
                                <span className="text-slate-400 group-hover:text-slate-600 font-bold">⋮</span>
                              </div>
                            </div>

                            {(nextEvent || p.procedure || p.surgery_type) && (
                              <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                                {nextEvent && (
                                  <span className="inline-flex items-center gap-1 font-semibold text-blue-700 bg-blue-50/70 px-2.5 py-1 rounded-lg">
                                    📅 {formatEventTime(nextEvent.startDateTime)}
                                  </span>
                                )}
                                {(p.procedure || p.surgery_type) && (
                                  <span className="inline-flex items-center gap-1 font-medium text-slate-600 truncate max-w-[260px]">
                                    📄 {p.procedure || p.surgery_type}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()
          )}
        </div>
      )}

      {/* Modern Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 pt-4 border-t border-slate-100 mt-6">
          <button
            disabled={pagination.page <= 1}
            onClick={() => {
              const prevPage = pagination.page - 1;
              onCommand(`/pacientes hospital:${pagination.hospitalFilter || ""} status:${pagination.statusFilter || ""} pag:${prevPage} sort:${pagination.sort}`, true);
            }}
            className="px-4 py-2 text-xs font-bold text-slate-700 hover:text-blue-600 bg-white hover:bg-blue-50 disabled:opacity-40 rounded-xl transition-all border border-slate-200/80 shadow-sm flex items-center gap-2"
          >
            <ArrowLeft size={14} />
            <span>Anterior</span>
          </button>

          <span className="text-xs font-black text-slate-500 font-mono tracking-tight shrink-0">
            PÁGINA {pagination.page} DE {pagination.totalPages}
          </span>

          <button
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => {
              const nextPage = pagination.page + 1;
              onCommand(`/pacientes hospital:${pagination.hospitalFilter || ""} status:${pagination.statusFilter || ""} pag:${nextPage} sort:${pagination.sort}`, true);
            }}
            className="px-4 py-2 text-xs font-bold text-slate-700 hover:text-blue-600 bg-white hover:bg-blue-50 disabled:opacity-40 rounded-xl transition-all border border-slate-200/80 shadow-sm flex items-center gap-2"
          >
            <span>Próxima</span>
            <ArrowRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
};
