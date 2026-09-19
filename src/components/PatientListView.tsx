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
  
  // 1. Filter out 'Alta' unless explicitly filtering by 'Alta'
  if (!isFilteringAlta) {
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

  return (
    <div className="space-y-6 w-full text-gray-800">
      {/* Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2">
        <button 
          onClick={() => onCommand("/iniciarcadastro", true)}
          className="self-start inline-flex items-center gap-2 font-bold text-sm bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-full shadow-md shadow-blue-500/10 hover:shadow-lg hover:shadow-blue-500/20 active:scale-[0.98] transition-all"
        >
          <Plus size={16} />
          Novo Paciente
        </button>
      </div>

      {/* Buscar field */}
      <div className="relative">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar paciente..."
          className="w-full rounded-2xl glass-input pl-11 pr-4 py-3 text-sm font-semibold text-gray-800 shadow-sm outline-none transition-all font-sans"
        />
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
          <Search size={18} />
        </div>
      </div>

      {/* Selected Filters Summary Badge directly under search input */}
      {(selectedHospitalObj || selectedStatusObj) && (
        <div className="flex flex-wrap gap-2 items-center">
          {selectedHospitalObj && (
            <div className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 shadow-sm">
              <span className="text-[13px] font-black text-blue-700 uppercase tracking-tight">
                🏢 {selectedHospitalObj.nome}
              </span>
            </div>
          )}
          {selectedStatusObj && (
            <div className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 shadow-sm">
              <span className="text-[13px] font-black text-blue-700 uppercase tracking-tight">
                📋 {selectedStatusObj.nome}
              </span>
            </div>
          )}
          <button 
            onClick={() => onCommand("/pacientes", true)}
            className="text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer ml-1"
          >
            Limpar Filtros
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 bg-gray-50/50 rounded-3xl border border-dashed border-gray-200">
          <Activity size={32} className="mx-auto text-blue-500 mb-2 animate-spin text-blue-500" />
          <p className="text-gray-500 text-sm font-medium">Buscando pacientes...</p>
        </div>
      ) : patients.length === 0 ? (
        <div className="text-center py-12 bg-gray-50/50 rounded-3xl border border-dashed border-gray-200">
          <Activity size={32} className="mx-auto text-gray-400 mb-2 animate-pulse" />
          <p className="text-gray-500 text-sm font-medium">Nenhum paciente encontrado.</p>
          <p className="text-gray-400 text-xs mt-1">Tente ajustar seus filtros de pesquisa acima.</p>
        </div>
      ) : searchedPatients.length === 0 ? (
        <div className="text-center py-12 bg-gray-50/50 rounded-3xl border border-dashed border-gray-200">
          <Activity size={32} className="mx-auto text-gray-400 mb-2 animate-pulse" />
          <p className="text-gray-500 text-sm font-medium">Nenhum paciente encontrado para esta busca.</p>
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
                <div key={hIdx} className="space-y-3">
                  {/* Hospital Group Header */}
                  <div className="flex items-center justify-between text-blue-900 bg-blue-50/50 px-4 py-3 rounded-xl border-l-4 border-blue-500 select-none">
                    <div className="flex items-center gap-2 font-black text-sm uppercase tracking-wide">
                      <span>🏥</span>
                      <span>{hName}</span>
                    </div>
                    <span className="text-[10px] bg-blue-100/80 text-blue-800 px-2.5 py-1 rounded-full font-extrabold tracking-wider">
                      {groupedPatients.length} {groupedPatients.length === 1 ? "PACIENTE" : "PACIENTES"}
                    </span>
                  </div>

                  {/* Patient Cards in Hospital Group */}
                  <div className="grid grid-cols-1 gap-3">
                    {groupedPatients.map((p) => {
                      return (
                        <div 
                          key={p.id}
                          onClick={() => onCommand(`/p ${p.id}`, true)}
                          className="group glass-card rounded-2xl shadow-sm px-4 py-3 hover:border-blue-200/50 hover:shadow-md transition-all duration-200 cursor-pointer text-left"
                        >
                          <div className="text-sm font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                            {p.nome}
                          </div>
                          <div className="mt-1 flex items-center gap-1 flex-wrap">
                            <span className="text-xs font-bold text-gray-700 uppercase">
                              {p.hospitalName || "Sem Hospital"}
                            </span>
                            <span className="text-xs text-gray-400">·</span>
                            <span className="text-xs text-gray-500">
                              {p.roomNumber ? `Leito ${p.roomNumber}` : "Sem leito"}
                            </span>
                          </div>
                          {(() => {
                            const pEvents = getPatientEvents(p);
                            if (pEvents.length === 0) return null;
                            const nextEvent = pEvents[0];
                            const timeFormatted = formatEventTime(nextEvent.startDateTime);
                            const additionalCount = pEvents.length - 1;
                            return (
                              <div 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onCommand("/open_calendar", true);
                                }}
                                className="mt-2 inline-flex items-center gap-1.5 bg-blue-50/70 hover:bg-blue-100/70 px-2.5 py-1 rounded-full text-[11px] font-bold text-blue-700 transition-all select-none border border-blue-100 max-w-full"
                              >
                                <CalendarIcon size={12} className="shrink-0 text-blue-500" />
                                <span className="truncate">
                                  {timeFormatted} · {nextEvent.evento}
                                </span>
                                {additionalCount > 0 && (
                                  <span className="shrink-0 text-[9px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-full font-black uppercase tracking-tight ml-0.5">
                                    +{additionalCount} {additionalCount === 1 ? "evento" : "eventos"}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
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
                return (
                  <div key={statusIdx} className="space-y-3">
                    {/* Status Group Header */}
                    <div className="flex items-center justify-between rounded-2xl border border-blue-200/40 bg-blue-50/70 backdrop-blur-sm px-4 py-3 select-none">
                      <span className="text-[11px] font-black uppercase tracking-widest text-blue-700">
                        {sName}
                      </span>
                      <span className="rounded-full bg-white border border-blue-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-700">
                        {groupedPatients.length} {groupedPatients.length === 1 ? "paciente" : "pacientes"}
                      </span>
                    </div>

                    {/* Patient Cards in Status Group */}
                    <div className="grid grid-cols-1 gap-3">
                      {groupedPatients.map((p) => {
                        const hDisplay = p.hospitalName || "Sem Hospital";
                        return (
                          <div 
                            key={p.id}
                            onClick={() => onCommand(`/p ${p.id}`, true)}
                            className="group glass-card rounded-2xl shadow-sm px-4 py-3 hover:border-blue-200/50 hover:shadow-md transition-all duration-200 cursor-pointer text-left"
                          >
                            <div className="text-sm font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                              {p.nome}
                            </div>
                            <div className="mt-1 flex items-center gap-1 flex-wrap">
                              <span className="text-xs font-bold text-gray-700 uppercase">
                                {hDisplay}
                              </span>
                              <span className="text-xs text-gray-400">·</span>
                              <span className="text-xs text-gray-500">
                                {p.roomNumber ? `Leito ${p.roomNumber}` : "Sem leito"}
                              </span>
                            </div>
                            {(() => {
                              const pEvents = getPatientEvents(p);
                              if (pEvents.length === 0) return null;
                              const nextEvent = pEvents[0];
                              const timeFormatted = formatEventTime(nextEvent.startDateTime);
                              const additionalCount = pEvents.length - 1;
                              return (
                                <div 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onCommand("/open_calendar", true);
                                  }}
                                  className="mt-2 inline-flex items-center gap-1.5 bg-blue-50/70 hover:bg-blue-100/70 px-2.5 py-1 rounded-full text-[11px] font-bold text-blue-700 transition-all select-none border border-blue-100 max-w-full"
                                >
                                  <CalendarIcon size={12} className="shrink-0 text-blue-500" />
                                  <span className="truncate">
                                    {timeFormatted} · {nextEvent.evento}
                                  </span>
                                  {additionalCount > 0 && (
                                    <span className="shrink-0 text-[9px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-full font-black uppercase tracking-tight ml-0.5">
                                      +{additionalCount} {additionalCount === 1 ? "evento" : "eventos"}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
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

      {/* Modern JSX-based Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 pt-6 border-t border-gray-100 mt-6">
          <button
            disabled={pagination.page <= 1}
            onClick={() => {
              const prevPage = pagination.page - 1;
              onCommand(`/pacientes hospital:${pagination.hospitalFilter || ""} status:${pagination.statusFilter || ""} pag:${prevPage} sort:${pagination.sort}`, true);
            }}
            className="p-2 sm:px-4 sm:py-2 text-xs font-bold text-gray-700 hover:text-blue-600 bg-gray-50 hover:bg-blue-100/50 disabled:opacity-40 disabled:hover:bg-gray-50 disabled:hover:text-gray-700 rounded-xl transition-all border border-gray-200/50 flex items-center gap-1.5"
          >
            <ArrowLeft size={14} />
            <span className="hidden sm:inline">Anterior</span>
          </button>

          <span className="text-xs font-black text-gray-500 font-mono tracking-tight shrink-0">
            PÁGINA {pagination.page} DE {pagination.totalPages}
          </span>

          <button
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => {
              const nextPage = pagination.page + 1;
              onCommand(`/pacientes hospital:${pagination.hospitalFilter || ""} status:${pagination.statusFilter || ""} pag:${nextPage} sort:${pagination.sort}`, true);
            }}
            className="p-2 sm:px-4 sm:py-2 text-xs font-bold text-gray-700 hover:text-blue-600 bg-gray-50 hover:bg-blue-100/50 disabled:opacity-40 disabled:hover:bg-gray-50 disabled:hover:text-gray-700 rounded-xl transition-all border border-gray-200/50 flex items-center gap-1.5"
          >
            <span className="hidden sm:inline">Próxima</span>
            <ArrowRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
};
