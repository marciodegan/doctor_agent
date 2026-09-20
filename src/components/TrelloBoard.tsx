import React, { useState, useEffect, useMemo } from "react";
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

      // If hospitals or statuses were not bundled in full response, fetch them individually
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
      // Group by Hospital
      // 1. Collect all known hospitals from API and from patients
      const hospitalMap = new Map<string, KanbanColumn>();

      // Pre-populate with registered hospitals
      hospitals.forEach((h, idx) => {
        const name = h.nome || h.name || "Hospital";
        hospitalMap.set(h.id.toString(), {
          id: h.id.toString(),
          name,
          color: "#2563EB",
          patients: []
        });
      });

      // Also collect unassigned or extra hospitals from patient records
      filteredPatients.forEach((p) => {
        const hId = p.hospitalId ? p.hospitalId.toString() : "";
        const hName = getHospitalName(p);

        if (hId && hospitalMap.has(hId)) {
          hospitalMap.get(hId)!.patients.push(p);
        } else {
          // Find by name or create
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

      // Convert to array and filter out empty registered hospitals if there are no patients,
      // but keep at least the ones that exist or have patients
      const result = Array.from(hospitalMap.values());
      return result;
    } else {
      // Group by Status
      // Requirement: Initial structure must be:
      // "Pré-operatório" and "Pós-operatório"
      // Plus any other statuses dynamically obtained
      const statusMap = new Map<string, KanbanColumn>();

      // 1. Ensure "Pré-operatório" and "Pós-operatório" are always the first columns
      const defaultStatus1 = "Pré-operatório";
      const defaultStatus2 = "Pós-operatório";

      statusMap.set("col-pre-op", {
        id: "pre-op",
        name: defaultStatus1,
        color: "#3B82F6", // Blue
        patients: []
      });

      statusMap.set("col-pos-op", {
        id: "pos-op",
        name: defaultStatus2,
        color: "#10B981", // Emerald green
        patients: []
      });

      // 2. Add other registered statuses from the DB/API if any
      statuses.forEach((s) => {
        const sName = s.nome || s.name || "";
        const norm = normalizeText(sName);

        // Check if it's already pre-op or pos-op
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

      // 3. Distribute patients to their matching status column
      filteredPatients.forEach((p) => {
        const pStatusRaw = p.status || "";
        const pStatusId = p.statusId ? p.statusId.toString() : "";
        const norm = normalizeText(pStatusRaw);

        // Check if matches pre-op
        const isPre =
          norm.includes("pre-op") ||
          norm.includes("preop") ||
          norm.includes("pre operatorio") ||
          norm.includes("pre-operatorio") ||
          pStatusId === statusMap.get("col-pre-op")?.id;

        // Check if matches pos-op
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

        // Try matching with other registered status columns by ID or Name
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
          // If patient has a distinct status name not yet in map, create a column for it
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
            // Patient has no status at all -> Put in pre-op or add "Sem Status"
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

  return (
    <div className="w-full flex flex-col space-y-4 text-slate-800 animate-fadeIn">
      {/* Top Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/80 backdrop-blur-md p-4 rounded-3xl border border-slate-200/80 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <Kanban size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black text-slate-900 tracking-tight">
                Quadro Trello
              </h1>
              <span className="text-[10px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200/60">
                Kanban
              </span>
            </div>
            <p className="text-xs text-slate-500">
              {filteredPatients.length}{" "}
              {filteredPatients.length === 1 ? "paciente" : "pacientes"}{" "}
              organizados no quadro
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Segmented Switch: Por status / Por hospital */}
          <div className="inline-flex p-1 bg-slate-100/90 rounded-2xl border border-slate-200/80 shadow-inner">
            <button
              id="trello-group-status-btn"
              onClick={() => setGroupBy("status")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
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
              onClick={() => setGroupBy("hospital")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                groupBy === "hospital"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Building2 size={14} />
              <span>Por hospital</span>
            </button>
          </div>

          {/* Quick Search */}
          <div className="relative flex-1 sm:w-56">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              id="trello-search-input"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar paciente..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800 placeholder-slate-400 transition"
            />
          </div>

          {/* Refresh button */}
          <button
            id="trello-refresh-btn"
            onClick={() => loadData(true)}
            disabled={refreshing || loading}
            title="Recarregar pacientes"
            className="p-2 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-xl transition border border-slate-200/60 disabled:opacity-50"
          >
            <RefreshCw
              size={16}
              className={refreshing ? "animate-spin text-blue-600" : ""}
            />
          </button>
        </div>
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="flex items-center justify-center py-20 bg-white/60 rounded-3xl border border-slate-200/60">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
              Carregando quadro Trello...
            </p>
          </div>
        </div>
      ) : error ? (
        <div className="p-8 text-center bg-red-50/80 rounded-3xl border border-red-200 text-red-700 space-y-3">
          <p className="text-sm font-semibold">{error}</p>
          <button
            onClick={() => loadData()}
            className="px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-bold shadow-md hover:bg-red-700 transition"
          >
            Tentar novamente
          </button>
        </div>
      ) : (
        /* Horizontal Kanban Board Container */
        <div className="w-full relative">
          {/* Subtle scroll indicator for mobile */}
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium px-2 pb-1.5 md:hidden">
            <span>Deslize horizontalmente para ver outras colunas</span>
            <span>← →</span>
          </div>

          <div
            id="trello-kanban-container"
            className="flex gap-4 overflow-x-auto pb-6 pt-1 px-1 scroll-smooth snap-x snap-mandatory md:snap-none custom-scrollbar"
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
                  className="flex flex-col shrink-0 w-[84vw] sm:w-[320px] md:w-[340px] max-w-[360px] bg-slate-100/80 border border-slate-200/90 rounded-3xl shadow-sm overflow-hidden snap-center flex-1 min-h-[500px]"
                >
                  {/* Column Header */}
                  <div className="p-3.5 bg-white/95 border-b border-slate-200/80 flex items-center justify-between gap-2 select-none sticky top-0 z-10">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{
                          backgroundColor:
                            column.color ||
                            (groupBy === "hospital" ? "#2563EB" : "#3B82F6"),
                        }}
                      />
                      <h2
                        className="text-xs font-black uppercase tracking-wider text-slate-800 truncate"
                        title={column.name}
                      >
                        {column.name}
                      </h2>
                    </div>

                    <span className="shrink-0 text-[11px] font-black px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                      {count}
                    </span>
                  </div>

                  {/* Column Body: Vertical Cards List */}
                  <div
                    className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar max-h-[calc(100vh-280px)]"
                    style={{ scrollbarWidth: "thin" }}
                  >
                    {count === 0 ? (
                      <div className="h-40 border-2 border-dashed border-slate-200/80 rounded-2xl flex flex-col items-center justify-center text-center p-4 text-slate-400">
                        <div className="w-8 h-8 rounded-full bg-slate-200/50 flex items-center justify-center mb-1.5 text-slate-400">
                          <CheckCircle2 size={16} />
                        </div>
                        <p className="text-xs font-bold text-slate-500">
                          Nenhum paciente
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
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
                            className="bg-white rounded-2xl p-3.5 border border-slate-200/90 shadow-sm hover:shadow-md hover:border-blue-300 transition-all duration-150 cursor-pointer flex flex-col gap-2.5 text-left group"
                          >
                            {/* Patient Photo & Info Row */}
                            <div className="flex items-start gap-3">
                              {/* Photo / Avatar */}
                              <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center shadow-inner relative">
                                {photoSource ? (
                                  <img
                                    src={photoSource}
                                    alt={patientName}
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      // Fallback to avatar if image fails to load
                                      (e.target as HTMLElement).style.display =
                                        "none";
                                    }}
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center bg-blue-50 text-blue-600 font-bold text-sm">
                                    {patientName.charAt(0).toUpperCase()}
                                  </div>
                                )}
                              </div>

                              {/* Patient Name & Location */}
                              <div className="flex-1 min-w-0">
                                <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors truncate">
                                  {patientName}
                                </h3>

                                <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-600 truncate">
                                  <Building2
                                    size={12}
                                    className="text-slate-400 shrink-0"
                                  />
                                  <span
                                    className="truncate font-medium text-[11px]"
                                    title={patientHospital}
                                  >
                                    {patientHospital}
                                  </span>
                                </div>

                                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 truncate">
                                  <Bed
                                    size={12}
                                    className="text-slate-400 shrink-0"
                                  />
                                  <span className="font-semibold text-slate-700 text-[11px]">
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
                              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
                                <span className="truncate max-w-[220px] bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-100 font-medium">
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
