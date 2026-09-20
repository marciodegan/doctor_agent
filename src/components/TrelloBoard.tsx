import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Kanban,
  Building2,
  Bed,
  Search,
  RefreshCw,
  User,
  Activity,
  Layers,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Filter,
  CheckCircle2,
  Clock
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useGroup } from "../contexts/GroupContext";

interface Patient {
  id: string;
  nome?: string;
  name?: string;
  status?: string;
  statusId?: string;
  hospitalId?: string;
  hospitalName?: string;
  hospital?: string;
  roomNumber?: string;
  bed?: string;
  quarto?: string;
  leito?: string;
  procedure?: string;
  surgery_type?: string;
  diagnosis?: string;
  foto?: string;
  photo?: string;
  photoUrl?: string;
  avatar?: string;
  age?: string;
  [key: string]: any;
}

interface Hospital {
  id: string;
  nome?: string;
  name?: string;
}

interface Status {
  id: string;
  nome?: string;
  name?: string;
  sortOrder?: number;
  color?: string;
}

interface KanbanColumn {
  id: string;
  name: string;
  color?: string;
  patients: Patient[];
}

interface TrelloBoardProps {
  onSelectPatient: (patientId: string, patientName?: string) => void;
}

// Normalize text for search & matching
function normalizeText(str?: string): string {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export const TrelloBoard: React.FC<TrelloBoardProps> = ({ onSelectPatient }) => {
  const { activeGroup, apiFetch } = useGroup();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Grouping mode: "status" or "hospital"
  const [groupBy, setGroupBy] = useState<"status" | "hospital">("status");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [activeColumnIndex, setActiveColumnIndex] = useState<number>(0);

  const carouselRef = useRef<HTMLDivElement>(null);

  const loadData = async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      // 1. Fetch full patients list
      const patientsRes = await apiFetch("/api/app/patients?full=true");
      if (!patientsRes.ok) {
        throw new Error(`Erro ao carregar pacientes (${patientsRes.status})`);
      }
      const patientsData = await patientsRes.json();

      let patientList: Patient[] = [];
      let hospitalList: Hospital[] = [];
      let statusList: Status[] = [];

      if (Array.isArray(patientsData)) {
        patientList = patientsData;
      } else if (patientsData && typeof patientsData === "object") {
        if (Array.isArray(patientsData.patients)) {
          patientList = patientsData.patients;
        }
        if (Array.isArray(patientsData.hospitals)) {
          hospitalList = patientsData.hospitals;
        }
        if (Array.isArray(patientsData.statuses)) {
          statusList = patientsData.statuses;
        }
      }

      if (hospitalList.length === 0) {
        try {
          const hRes = await apiFetch("/api/app/hospitals");
          if (hRes.ok) {
            const hData = await hRes.json();
            if (Array.isArray(hData)) hospitalList = hData;
          }
        } catch (e) {
          console.warn("[Trello] Could not load individual hospitals list:", e);
        }
      }

      if (statusList.length === 0) {
        try {
          const sRes = await apiFetch("/api/app/statuses");
          if (sRes.ok) {
            const sData = await sRes.json();
            if (Array.isArray(sData)) statusList = sData;
          }
        } catch (e) {
          console.warn("[Trello] Could not load individual statuses list:", e);
        }
      }

      setPatients(patientList);
      setHospitals(hospitalList);
      setStatuses(statusList);
    } catch (err: any) {
      console.error("[Trello] Error loading board data:", err);
      setError(err?.message || "Não foi possível carregar os dados do quadro.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeGroup?.id]);

  // Helper to get patient hospital display name
  const getHospitalName = (patient: Patient): string => {
    if (patient.hospitalName) return patient.hospitalName;
    if (patient.hospital) return patient.hospital;
    if (patient.hospitalId) {
      const match = hospitals.find(
        (h) => h.id?.toString() === patient.hospitalId?.toString()
      );
      if (match) return match.nome || match.name || "Hospital";
    }
    return "Hospital não informado";
  };

  // Helper to get patient bed / room display name
  const getRoomDisplay = (patient: Patient): string => {
    const raw =
      patient.roomNumber ||
      patient.bed ||
      patient.quarto ||
      patient.leito ||
      "";
    if (!raw) return "Sem leito";
    if (
      raw.toLowerCase().startsWith("quarto") ||
      raw.toLowerCase().startsWith("leito")
    ) {
      return raw;
    }
    return `Quarto ${raw}`;
  };

  // Filter patients by search term
  const filteredPatients = useMemo(() => {
    if (!searchTerm.trim()) return patients;
    const term = normalizeText(searchTerm);
    return patients.filter((p) => {
      const name = normalizeText(p.nome || p.name);
      const hosp = normalizeText(getHospitalName(p));
      const room = normalizeText(getRoomDisplay(p));
      const diag = normalizeText(p.diagnosis || p.procedure || p.surgery_type);
      return (
        name.includes(term) ||
        hosp.includes(term) ||
        room.includes(term) ||
        diag.includes(term)
      );
    });
  }, [patients, searchTerm, hospitals]);

  // Build Kanban columns based on groupBy
  const columns = useMemo((): KanbanColumn[] => {
    if (groupBy === "hospital") {
      const hospitalMap = new Map<string, KanbanColumn>();

      hospitals.forEach((h) => {
        const name = h.nome || h.name || "Hospital";
        hospitalMap.set(h.id.toString(), {
          id: h.id.toString(),
          name,
          color: "#2563EB",
          patients: []
        });
      });

      filteredPatients.forEach((p) => {
        const hId = p.hospitalId ? p.hospitalId.toString() : "";
        const hName = getHospitalName(p);

        if (hId && hospitalMap.has(hId)) {
          hospitalMap.get(hId)!.patients.push(p);
        } else {
          let existingKey: string | null = null;
          for (const [key, val] of hospitalMap.entries()) {
            if (normalizeText(val.name) === normalizeText(hName)) {
              existingKey = key;
              break;
            }
          }

          if (existingKey) {
            hospitalMap.get(existingKey)!.patients.push(p);
          } else {
            const newKey = hId || `hosp-${hName}`;
            hospitalMap.set(newKey, {
              id: newKey,
              name: hName,
              color: "#2563EB",
              patients: [p]
            });
          }
        }
      });

      return Array.from(hospitalMap.values());
    } else {
      const statusMap = new Map<string, KanbanColumn>();

      const defaultStatus1 = "Pré-operatório";
      const defaultStatus2 = "Pós-operatório";

      statusMap.set("col-pre-op", {
        id: "pre-op",
        name: defaultStatus1,
        color: "#3B82F6",
        patients: []
      });

      statusMap.set("col-pos-op", {
        id: "pos-op",
        name: defaultStatus2,
        color: "#10B981",
        patients: []
      });

      statuses.forEach((s) => {
        const sName = s.nome || s.name || "";
        const norm = normalizeText(sName);

        const isPreOp =
          norm.includes("pre-op") ||
          norm.includes("preop") ||
          norm.includes("pre operatorio") ||
          norm.includes("pre-operatorio");
        const isPosOp =
          norm.includes("pos-op") ||
          norm.includes("posop") ||
          norm.includes("pos operatorio") ||
          norm.includes("pos-operatorio");

        if (isPreOp) {
          const pre = statusMap.get("col-pre-op")!;
          pre.id = s.id.toString();
          if (s.color) pre.color = s.color;
        } else if (isPosOp) {
          const pos = statusMap.get("col-pos-op")!;
          pos.id = s.id.toString();
          if (s.color) pos.color = s.color;
        } else if (sName) {
          const key = `status-${s.id}`;
          if (!statusMap.has(key)) {
            statusMap.set(key, {
              id: s.id.toString(),
              name: sName,
              color: s.color || "#6366F1",
              patients: []
            });
          }
        }
      });

      filteredPatients.forEach((p) => {
        const pStatusRaw = p.status || "";
        const pStatusId = p.statusId ? p.statusId.toString() : "";
        const norm = normalizeText(pStatusRaw);

        const isPre =
          norm.includes("pre-op") ||
          norm.includes("preop") ||
          norm.includes("pre operatorio") ||
          norm.includes("pre-operatorio") ||
          pStatusId === statusMap.get("col-pre-op")?.id;

        const isPos =
          norm.includes("pos-op") ||
          norm.includes("posop") ||
          norm.includes("pos operatorio") ||
          norm.includes("pos-operatorio") ||
          pStatusId === statusMap.get("col-pos-op")?.id;

        if (isPre) {
          statusMap.get("col-pre-op")!.patients.push(p);
          return;
        }

        if (isPos) {
          statusMap.get("col-pos-op")!.patients.push(p);
          return;
        }

        let matchedKey: string | null = null;
        for (const [key, val] of statusMap.entries()) {
          if (key === "col-pre-op" || key === "col-pos-op") continue;
          if (pStatusId && val.id === pStatusId) {
            matchedKey = key;
            break;
          }
          if (pStatusRaw && normalizeText(val.name) === norm) {
            matchedKey = key;
            break;
          }
        }

        if (matchedKey) {
          statusMap.get(matchedKey)!.patients.push(p);
        } else {
          if (pStatusRaw) {
            const dynKey = `status-dyn-${norm}`;
            if (!statusMap.has(dynKey)) {
              statusMap.set(dynKey, {
                id: pStatusId || dynKey,
                name: pStatusRaw,
                color: "#8B5CF6",
                patients: []
              });
            }
            statusMap.get(dynKey)!.patients.push(p);
          } else {
            const unassignedKey = "col-unassigned";
            if (!statusMap.has(unassignedKey)) {
              statusMap.set(unassignedKey, {
                id: "unassigned",
                name: "Outros / Sem Status",
                color: "#94A3B8",
                patients: []
              });
            }
            statusMap.get(unassignedKey)!.patients.push(p);
          }
        }
      });

      return Array.from(statusMap.values());
    }
  }, [groupBy, patients, filteredPatients, statuses, hospitals]);

  // Carousel scroll controls
  const scrollCarousel = (direction: "left" | "right") => {
    if (!carouselRef.current) return;
    const container = carouselRef.current;
    const cardWidth = container.querySelector(":scope > div")?.clientWidth || 340;
    const scrollAmount = cardWidth + 16; // card width + gap
    container.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth"
    });
  };

  const scrollToColumn = (index: number) => {
    if (!carouselRef.current) return;
    const container = carouselRef.current;
    const children = container.querySelectorAll(":scope > div");
    if (children[index]) {
      children[index].scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest"
      });
      setActiveColumnIndex(index);
    }
  };

  const handleScroll = () => {
    if (!carouselRef.current) return;
    const container = carouselRef.current;
    const scrollLeft = container.scrollLeft;
    const cardWidth = container.querySelector(":scope > div")?.clientWidth || 340;
    const newIndex = Math.round(scrollLeft / (cardWidth + 16));
    if (newIndex >= 0 && newIndex < columns.length) {
      setActiveColumnIndex(newIndex);
    }
  };

  return (
    <div className="w-full flex flex-col space-y-3 text-slate-800 animate-fadeIn pb-16">
      {/* Top Filter & Search Controls (Without Trello title card) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/90 backdrop-blur-md px-4 py-3 rounded-2xl border border-slate-200/80 shadow-sm">
        {/* Segmented Switch: Por status / Por hospital */}
        <div className="inline-flex p-1 bg-slate-100/90 rounded-2xl border border-slate-200/80 shadow-inner w-full sm:w-auto">
          <button
            id="trello-group-status-btn"
            onClick={() => {
              setGroupBy("status");
              setActiveColumnIndex(0);
            }}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              groupBy === "status"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Activity size={14} />
            <span>Por status</span>
          </button>
          <button
            id="trello-group-hospital-btn"
            onClick={() => {
              setGroupBy("hospital");
              setActiveColumnIndex(0);
            }}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              groupBy === "hospital"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Building2 size={14} />
            <span>Por hospital</span>
          </button>
        </div>

        {/* Action Controls & Search */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-60">
            <Search
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              id="trello-search-input"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar paciente, hospital..."
              className="w-full pl-10 pr-3.5 py-2 text-xs bg-slate-50/80 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 text-slate-800 placeholder-slate-400 font-medium transition"
            />
          </div>

          <button
            id="trello-refresh-btn"
            onClick={() => loadData(true)}
            disabled={refreshing || loading}
            title="Recarregar pacientes"
            className="p-2 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-2xl transition border border-slate-200/60 disabled:opacity-50 shadow-sm shrink-0"
          >
            <RefreshCw
              size={15}
              className={refreshing ? "animate-spin text-blue-600" : ""}
            />
          </button>
        </div>
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="flex items-center justify-center py-24 bg-white/80 rounded-3xl border border-slate-200/80 shadow-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
              Carregando carrossel Trello...
            </p>
          </div>
        </div>
      ) : error ? (
        <div className="p-8 text-center bg-red-50/80 rounded-3xl border border-red-200 text-red-700 space-y-3 shadow-sm">
          <p className="text-sm font-semibold">{error}</p>
          <button
            onClick={() => loadData()}
            className="px-5 py-2.5 bg-red-600 text-white rounded-2xl text-xs font-bold shadow-md hover:bg-red-700 transition"
          >
            Tentar novamente
          </button>
        </div>
      ) : (
        /* Modern Carousel Board Container with Navigation Controls */
        <div className="w-full relative flex flex-col space-y-4">
          {/* Carousel Header Controls & Pagination Dots */}
          <div className="flex items-center justify-between px-2">
            {/* Dots Indicator */}
            <div className="flex items-center gap-1.5 overflow-x-auto py-1 max-w-[70vw] sm:max-w-none custom-scrollbar">
              {columns.map((col, idx) => (
                <button
                  key={idx}
                  onClick={() => scrollToColumn(idx)}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    activeColumnIndex === idx
                      ? "w-8 bg-blue-600 shadow-sm shadow-blue-500/30"
                      : "w-2 bg-slate-300 hover:bg-slate-400"
                  }`}
                  title={col.name}
                />
              ))}
              <span className="text-xs font-bold text-slate-500 ml-2 hidden sm:inline">
                Coluna {activeColumnIndex + 1} de {columns.length} ({columns[activeColumnIndex]?.name || ""})
              </span>
            </div>

            {/* Navigation Arrows */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => scrollCarousel("left")}
                disabled={activeColumnIndex === 0}
                className="w-9 h-9 rounded-2xl bg-white border border-slate-200/80 text-slate-700 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 disabled:opacity-30 disabled:hover:bg-white disabled:hover:text-slate-700 flex items-center justify-center transition-all shadow-sm"
                title="Coluna anterior"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() => scrollCarousel("right")}
                disabled={activeColumnIndex === columns.length - 1}
                className="w-9 h-9 rounded-2xl bg-white border border-slate-200/80 text-slate-700 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 disabled:opacity-30 disabled:hover:bg-white disabled:hover:text-slate-700 flex items-center justify-center transition-all shadow-sm"
                title="Próxima coluna"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          {/* Carousel Track */}
          <div
            ref={carouselRef}
            onScroll={handleScroll}
            id="trello-kanban-carousel"
            className="flex gap-4 sm:gap-6 overflow-x-auto pb-6 pt-2 px-5 sm:px-8 scroll-smooth snap-x snap-mandatory custom-scrollbar"
            style={{
              WebkitOverflowScrolling: "touch",
              scrollbarWidth: "thin",
            }}
          >
            {columns.map((column, colIdx) => {
              const count = column.patients.length;
              return (
                <div
                  key={column.id || colIdx}
                  className="flex flex-col shrink-0 w-[84vw] sm:w-[350px] md:w-[360px] bg-slate-100/70 border border-slate-200/90 rounded-[28px] shadow-sm hover:shadow-md overflow-hidden snap-center min-h-[540px] transition-all"
                >
                  {/* Column Header */}
                  <div className="p-4 bg-white/95 border-b border-slate-200/80 flex items-center justify-between gap-2 select-none sticky top-0 z-10 backdrop-blur-sm">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-3 h-3 rounded-full shrink-0 shadow-sm"
                        style={{
                          backgroundColor:
                            column.color ||
                            (groupBy === "hospital" ? "#2563EB" : "#3B82F6"),
                        }}
                      />
                      <h2
                        className="text-xs font-black uppercase tracking-wider text-slate-900 truncate"
                        title={column.name}
                      >
                        {column.name}
                      </h2>
                    </div>

                    <span className="shrink-0 text-xs font-black px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100 shadow-sm">
                      {count} {count === 1 ? "paciente" : "pacientes"}
                    </span>
                  </div>

                  {/* Column Body: Vertical Cards List */}
                  <div
                    className="flex-1 overflow-y-auto p-3.5 space-y-3.5 custom-scrollbar max-h-[calc(100vh-320px)]"
                    style={{ scrollbarWidth: "thin" }}
                  >
                    {count === 0 ? (
                      <div className="h-44 border-2 border-dashed border-slate-200/80 rounded-2xl flex flex-col items-center justify-center text-center p-4 text-slate-400 bg-white/50">
                        <div className="w-9 h-9 rounded-2xl bg-slate-100 flex items-center justify-center mb-2 text-slate-400 shadow-sm">
                          <CheckCircle2 size={18} />
                        </div>
                        <p className="text-xs font-bold text-slate-600">
                          Nenhum paciente
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {groupBy === "status"
                            ? "Nenhum paciente com este status"
                            : "Nenhum paciente neste hospital"}
                        </p>
                      </div>
                    ) : (
                      column.patients.map((patient) => {
                        const patientName =
                          patient.nome || patient.name || "Paciente sem nome";
                        const patientHospital = getHospitalName(patient);
                        const patientRoom = getRoomDisplay(patient);
                        const photoSource =
                          patient.foto ||
                          patient.photo ||
                          patient.photoUrl ||
                          patient.avatar;

                        return (
                          <motion.div
                            key={patient.id}
                            id={`trello-card-${patient.id}`}
                            whileHover={{ y: -2, scale: 1.01 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() =>
                              onSelectPatient(patient.id, patientName)
                            }
                            className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm hover:shadow-md hover:border-blue-300 transition-all duration-200 cursor-pointer flex flex-col gap-3 text-left group"
                          >
                            {/* Patient Photo & Info Row */}
                            <div className="flex items-start gap-3.5">
                              {/* Photo / Avatar */}
                              <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center shadow-inner relative">
                                {photoSource ? (
                                  <img
                                    src={photoSource}
                                    alt={patientName}
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      (e.target as HTMLElement).style.display =
                                        "none";
                                    }}
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center bg-blue-50 text-blue-700 font-bold text-sm">
                                    {patientName.charAt(0).toUpperCase()}
                                  </div>
                                )}
                              </div>

                              {/* Patient Name & Location */}
                              <div className="flex-1 min-w-0">
                                <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors truncate tracking-tight">
                                  {patientName}
                                </h3>

                                <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-600 truncate">
                                  <Building2
                                    size={13}
                                    className="text-slate-400 shrink-0"
                                  />
                                  <span
                                    className="truncate font-semibold text-[11px] uppercase tracking-tight"
                                    title={patientHospital}
                                  >
                                    {patientHospital}
                                  </span>
                                </div>

                                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 truncate">
                                  <Bed
                                    size={13}
                                    className="text-slate-400 shrink-0"
                                  />
                                  <span className="font-medium text-slate-700 text-[11px]">
                                    {patientRoom}
                                  </span>
                                </div>
                              </div>

                              <ChevronRight
                                size={16}
                                className="text-slate-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all mt-1 shrink-0"
                              />
                            </div>

                            {/* Secondary Information (Procedure or Diagnosis if available) */}
                            {(patient.procedure ||
                              patient.diagnosis ||
                              patient.surgery_type) && (
                              <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                                <span className="truncate max-w-[260px] bg-slate-50/80 px-2.5 py-1 rounded-xl border border-slate-100 font-medium text-slate-600">
                                  {patient.procedure ||
                                    patient.diagnosis ||
                                    patient.surgery_type}
                                </span>
                              </div>
                            )}
                          </motion.div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
