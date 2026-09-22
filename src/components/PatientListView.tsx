import React, { useState, useEffect, useRef } from "react";
import { Building2, Bed, Activity, ArrowLeft, ArrowRight, Plus, MapPin, User, FileText, ChevronRight, ChevronDown, Search, Calendar as CalendarIcon } from "lucide-react";
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
  const [collapsedStatuses, setCollapsedStatuses] = useState<Record<string, boolean>>({});
  const [collapsedHospitals, setCollapsedHospitals] = useState<Record<string, boolean>>({});

  const toggleStatusCollapse = (key: string) => {
    setCollapsedStatuses(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const toggleHospitalCollapse = (key: string) => {
    setCollapsedHospitals(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

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

  const isHospFiltered = Boolean(hospitalFilter && hospitalFilter !== "all" && hospitalFilter !== "");
  const isStatusFiltered = Boolean(statusFilter && statusFilter !== "all" && statusFilter !== "");

  const selectedHospitalObj = isHospFiltered 
    ? hospitals.find((h: any) => h.id.toString() === hospitalFilter) 
    : null;

  const selectedStatusObj = isStatusFiltered 
    ? statuses.find((s: any) => s.id.toString() === statusFilter) 
    : null;

  // Compute final filtered patients set safely starting from localPatients
  const selectedStatus = selectedStatusObj;
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
        dot: "bg-emerald-500 shadow-emerald-500/30",
        badge: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
        emoji: "✅"
      };
    }
    if (s.includes("cirurgia")) {
      return { 
        dot: "bg-amber-400 shadow-amber-400/30",
        badge: "bg-amber-50 text-amber-700 border-amber-200/80",
        emoji: "🟡"
      };
    }
    if (s.includes("pós") || s.includes("pos") || s.includes("operatorio") || s.includes("operatório")) {
      if (s.includes("pré") || s.includes("pre")) {
        return { 
          dot: "bg-purple-500 shadow-purple-500/30",
          badge: "bg-purple-50 text-purple-700 border-purple-200/80",
          emoji: "🟣"
        };
      }
      return { 
        dot: "bg-rose-500 shadow-rose-500/30",
        badge: "bg-blue-50 text-blue-600 border-blue-200/80",
        emoji: "🔴"
      };
    }
    if (s.includes("recuperação") || s.includes("recuperacao")) {
      return { 
        dot: "bg-emerald-500 shadow-emerald-500/30",
        badge: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
        emoji: "🟢"
      };
    }
    if (s.includes("pré") || s.includes("pre")) {
      return { 
        dot: "bg-purple-500 shadow-purple-500/30",
        badge: "bg-purple-50 text-purple-700 border-purple-200/80",
        emoji: "🟣"
      };
    }
    if (s.includes("internado")) {
      return { 
        dot: "bg-blue-500 shadow-blue-500/30",
        badge: "bg-blue-50 text-blue-700 border-blue-200/80",
        emoji: "🔵"
      };
    }
    if (s.includes("observação") || s.includes("observacao")) {
      return { 
        dot: "bg-amber-400 shadow-amber-400/30",
        badge: "bg-amber-50 text-amber-700 border-amber-200/80",
        emoji: "🟡"
      };
    }
    return { 
      dot: "bg-slate-400 shadow-slate-400/30",
      badge: "bg-slate-50 text-slate-700 border-slate-200/80",
      emoji: "⚪"
    };
  };

  const sortedHospitals = [...hospitals].sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));

  const sortedMasterStatuses = [...statuses].sort((a, b) => {
    const orderA = typeof a.sortOrder === "number" ? a.sortOrder : 999999;
    const orderB = typeof b.sortOrder === "number" ? b.sortOrder : 999999;
    if (orderA !== orderB) return orderA - orderB;
    const nameA = (a.nome || "").toLowerCase();
    const nameB = (b.nome || "").toLowerCase();
    return nameA.localeCompare(nameB);
  });

  const hasActiveFilter = Boolean(isHospFiltered || isStatusFiltered || searchTerm.trim());

  return (
    <div className="space-y-4 w-full text-slate-800 pb-20">
      {/* Search & Filters Card */}
      <div className="bg-white rounded-3xl p-3.5 sm:p-4 border border-slate-100 shadow-2xs space-y-3.5">
        {/* Modern Search Bar */}
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar paciente, hospital, leito, procedimento..."
            className="w-full rounded-2xl bg-white border border-slate-200/90 pl-11 pr-4 py-3 text-xs sm:text-sm font-semibold text-slate-800 shadow-2xs focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 outline-none transition-all placeholder-slate-400"
          />
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search size={18} />
          </div>
        </div>

        {/* Hospital Filter Buttons */}
        {sortedHospitals.length > 0 && (
          <div className="space-y-1.5 pt-0.5">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400">
              Filtrar por Hospital
            </h4>
            <div className="flex flex-wrap gap-2">
              {sortedHospitals.map((h) => {
                const hId = h.id.toString();
                const isActive = hospitalFilter === hId;
                return (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => {
                      const cmd = isActive
                        ? `/pacientes${statusFilter ? ` status:${statusFilter}` : ""} sort:${sort || "status"}`
                        : `/pacientes hospital:${hId}${statusFilter ? ` status:${statusFilter}` : ""} sort:${sort || "status"}`;
                      onCommand(cmd, true);
                    }}
                    className={`px-2.5 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all border shadow-sm ${
                      isActive 
                        ? 'bg-blue-600 text-white border-blue-600 shadow-blue-100' 
                        : 'bg-white text-blue-600 border-blue-600 hover:bg-blue-50'
                    }`}
                  >
                    {h.nome}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Status Filter Buttons */}
        {sortedMasterStatuses.length > 0 && (
          <div className="space-y-1.5 pt-0.5">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400">
              Filtrar por Status
            </h4>
            <div className="flex flex-wrap gap-2">
              {sortedMasterStatuses.map((s) => {
                const sId = typeof s === 'string' ? s : s.id.toString();
                const sLabel = typeof s === 'string' ? s : s.nome;
                const isActive = statusFilter === sId;
                return (
                  <button
                    key={sId}
                    type="button"
                    onClick={() => {
                      const cmd = isActive
                        ? `/pacientes${hospitalFilter ? ` hospital:${hospitalFilter}` : ""} sort:${sort || "status"}`
                        : `/pacientes status:${sId}${hospitalFilter ? ` hospital:${hospitalFilter}` : ""} sort:${sort || "status"}`;
                      onCommand(cmd, true);
                    }}
                    className={`px-2.5 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all border shadow-sm ${
                      isActive 
                        ? 'bg-blue-600 text-white border-blue-600 shadow-blue-100' 
                        : 'bg-white text-blue-600 border-blue-600 hover:bg-blue-50'
                    }`}
                  >
                    {sLabel}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Clear Filters Chip - only when filter is applied */}
        {hasActiveFilter && (
          <div className="pt-0.5 flex items-center justify-start text-xs">
            <button
              type="button"
              onClick={() => {
                setSearchTerm("");
                onCommand("/pacientes", true);
              }}
              className="inline-flex items-center gap-1 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 text-rose-600 text-[11px] font-bold px-2.5 py-1 rounded-full shadow-2xs transition"
            >
              <span>× Limpar filtros</span>
            </button>
          </div>
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

              return sortedHospitals.map(({ id: hId, name: hName, list: groupedPatients }, hIdx) => {
                const isHospCollapsed = Boolean(collapsedHospitals[hId || hName]);

                return (
                  <div 
                    key={hId || hIdx} 
                    className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/80 shadow-2xs overflow-hidden transition-all duration-200"
                  >
                    {/* Hospital Group Header */}
                    <button
                      type="button"
                      onClick={() => toggleHospitalCollapse(hId || hName)}
                      aria-expanded={!isHospCollapsed}
                      className={`w-full bg-[#A9CCF5] px-4 py-3 sm:px-5 sm:py-3.5 flex items-center justify-between text-left transition-colors hover:bg-[#9ec5f1] active:bg-[#92bcee] select-none cursor-pointer focus:outline-none rounded-t-2xl sm:rounded-t-3xl ${
                        isHospCollapsed ? "rounded-b-2xl sm:rounded-b-3xl" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-base shrink-0 bg-white/70 w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center shadow-2xs">
                          🏥
                        </span>
                        <div className="min-w-0">
                          <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#0F2942] leading-tight truncate">
                            {hName}
                          </h3>
                          <p className="text-[11px] sm:text-xs text-[#1E3A5F]/85 font-medium mt-0.5">
                            {groupedPatients.length} {groupedPatients.length === 1 ? "paciente" : "pacientes"}
                          </p>
                        </div>
                      </div>

                      <div className="text-[#0F2942] p-1 shrink-0 flex items-center justify-center">
                        <ChevronDown
                          size={20}
                          strokeWidth={2.5}
                          className={`text-[#0F2942] transition-transform duration-200 ${isHospCollapsed ? "" : "rotate-180"}`}
                        />
                      </div>
                    </button>

                    {/* Patient Cards in Hospital Group */}
                    {!isHospCollapsed && (
                      <div className="p-3 sm:p-4 bg-slate-50/50 space-y-2.5">
                        {groupedPatients.map((p) => {
                          const initials = p.nome ? p.nome.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase() : "PA";
                          const pEvents = getPatientEvents(p);
                          const nextEvent = pEvents[0];
                          return (
                            <div 
                              key={p.id}
                              onClick={() => onCommand(`/p ${p.id}`, true)}
                              className="group bg-white rounded-2xl shadow-2xs hover:shadow-xs border border-slate-100 hover:border-blue-200/80 p-3 sm:p-3.5 transition-all duration-150 cursor-pointer text-left relative"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-blue-50 text-blue-600 font-bold text-xs sm:text-sm flex items-center justify-center shrink-0 border border-blue-100/70">
                                    {initials}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <h4 className="text-sm sm:text-base font-bold text-slate-900 group-hover:text-blue-600 transition-colors tracking-tight truncate">
                                      {p.nome}
                                    </h4>
                                    <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium truncate mt-0.5">
                                      <span className="font-semibold text-slate-700 uppercase tracking-tight truncate">
                                        {p.hospitalName || "Sem Hospital"}
                                      </span>
                                      <span>•</span>
                                      <span className="shrink-0">{p.roomNumber ? `Leito ${p.roomNumber}` : "Sem leito"}</span>
                                    </div>
                                    {nextEvent ? (
                                      <div className="text-[11px] sm:text-xs text-slate-400 font-medium mt-0.5 flex items-center gap-1 truncate">
                                        <span>{formatEventTime(nextEvent.startDateTime)}</span>
                                        {(p.procedure || p.surgery_type) && (
                                          <>
                                            <span>•</span>
                                            <span className="truncate">{p.procedure || p.surgery_type}</span>
                                          </>
                                        )}
                                      </div>
                                    ) : (p.procedure || p.surgery_type) ? (
                                      <div className="text-[11px] sm:text-xs text-slate-400 font-medium mt-0.5 truncate">
                                        {p.procedure || p.surgery_type}
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <button 
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onCommand(`/p ${p.id}`, true);
                                    }}
                                    className="p-1 text-slate-400 hover:text-slate-600 text-base font-bold leading-none cursor-pointer"
                                    title="Opções do paciente"
                                  >
                                    ⋮
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              });
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

              return sortedStatuses.map(({ id: sId, name: sName, list: groupedPatients }, statusIdx) => {
                const config = getStatusStyles(sName);
                const isCollapsed = Boolean(collapsedStatuses[sId || sName]);

                return (
                  <div 
                    key={sId || statusIdx} 
                    className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/80 shadow-2xs overflow-hidden transition-all duration-200"
                  >
                    {/* Status Group Header */}
                    <button
                      type="button"
                      onClick={() => toggleStatusCollapse(sId || sName)}
                      aria-expanded={!isCollapsed}
                      className={`w-full bg-[#A9CCF5] px-4 py-3 sm:px-5 sm:py-3.5 flex items-center justify-between text-left transition-colors hover:bg-[#9ec5f1] active:bg-[#92bcee] select-none cursor-pointer focus:outline-none rounded-t-2xl sm:rounded-t-3xl ${
                        isCollapsed ? "rounded-b-2xl sm:rounded-b-3xl" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full ${config.dot} shrink-0 ring-2 ring-white/80 shadow-2xs`} />
                        <div className="min-w-0">
                          <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#0F2942] leading-tight truncate">
                            {sName}
                          </h3>
                          <p className="text-[11px] sm:text-xs text-[#1E3A5F]/85 font-medium mt-0.5">
                            {groupedPatients.length} {groupedPatients.length === 1 ? "paciente" : "pacientes"}
                          </p>
                        </div>
                      </div>

                      <div className="text-[#0F2942] p-1 shrink-0 flex items-center justify-center">
                        <ChevronDown
                          size={20}
                          strokeWidth={2.5}
                          className={`text-[#0F2942] transition-transform duration-200 ${isCollapsed ? "" : "rotate-180"}`}
                        />
                      </div>
                    </button>

                    {/* Patient Cards in Status Group */}
                    {!isCollapsed && (
                      <div className="p-3 sm:p-4 bg-slate-50/50 space-y-2.5">
                        {groupedPatients.map((p) => {
                          const hDisplay = p.hospitalName || "Sem Hospital";
                          const initials = p.nome ? p.nome.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase() : "PA";
                          const pEvents = getPatientEvents(p);
                          const nextEvent = pEvents[0];
                          return (
                            <div 
                              key={p.id}
                              onClick={() => onCommand(`/p ${p.id}`, true)}
                              className="group bg-white rounded-2xl shadow-2xs hover:shadow-xs border border-slate-100 hover:border-blue-200/80 p-3 sm:p-3.5 transition-all duration-150 cursor-pointer text-left relative"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-blue-50 text-blue-600 font-bold text-xs sm:text-sm flex items-center justify-center shrink-0 border border-blue-100/70">
                                    {initials}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <h4 className="text-sm sm:text-base font-bold text-slate-900 group-hover:text-blue-600 transition-colors tracking-tight truncate">
                                      {p.nome}
                                    </h4>
                                    <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium truncate mt-0.5">
                                      <span className="font-semibold text-slate-700 uppercase tracking-tight truncate">
                                        {hDisplay}
                                      </span>
                                      <span>•</span>
                                      <span className="shrink-0">{p.roomNumber ? `Leito ${p.roomNumber}` : "Sem leito"}</span>
                                    </div>
                                    {nextEvent ? (
                                      <div className="text-[11px] sm:text-xs text-slate-400 font-medium mt-0.5 flex items-center gap-1 truncate">
                                        <span>{formatEventTime(nextEvent.startDateTime)}</span>
                                        {(p.procedure || p.surgery_type) && (
                                          <>
                                            <span>•</span>
                                            <span className="truncate">{p.procedure || p.surgery_type}</span>
                                          </>
                                        )}
                                      </div>
                                    ) : (p.procedure || p.surgery_type) ? (
                                      <div className="text-[11px] sm:text-xs text-slate-400 font-medium mt-0.5 truncate">
                                        {p.procedure || p.surgery_type}
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <button 
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onCommand(`/p ${p.id}`, true);
                                    }}
                                    className="p-1 text-slate-400 hover:text-slate-600 text-base font-bold leading-none cursor-pointer"
                                    title="Opções do paciente"
                                  >
                                    ⋮
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
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
