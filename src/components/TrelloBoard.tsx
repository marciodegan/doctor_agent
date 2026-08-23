import React, { useState, useEffect, useMemo } from "react";
import {
  Trello,
  Building2,
  Activity,
  Search,
  User,
  Bed,
  Stethoscope,
  ChevronRight,
  RefreshCw,
  Clock,
  Layers,
  ArrowUpDown,
  FileText
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useGroup } from "../contexts/GroupContext";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";

interface Patient {
  id: string;
  nome: string;
  name?: string;
  status?: string;
  statusId?: string;
  hospitalId?: string;
  hospitalName?: string;
  roomNumber?: string;
  room_number?: string;
  quarto?: string;
  procedure?: string;
  surgery_type?: string;
  photoURL?: string;
  photoUrl?: string;
  avatar?: string;
  idade?: string | number;
  convenio?: string;
  updatedAt?: any;
  createdAt?: any;
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

interface TrelloBoardProps {
  onSelectPatient: (patientId: string) => void;
}

type GroupingMode = "status" | "hospital";

export const TrelloBoard: React.FC<TrelloBoardProps> = ({ onSelectPatient }) => {
  const { activeGroup, apiFetch } = useGroup();
  const [groupingMode, setGroupingMode] = useState<GroupingMode>("status");
  const [searchTerm, setSearchTerm] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch / Listen to patients, statuses, and hospitals
  useEffect(() => {
    if (!activeGroup?.id) {
      setPatients([]);
      setStatuses([]);
      setHospitals([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    let isMounted = true;

    // 1. Listen to patient_statuses
    const statusRef = collection(db, "patient_statuses");
    const qStatus = query(statusRef, where("groupId", "==", activeGroup.id));
    const unsubStatus = onSnapshot(
      qStatus,
      (snap) => {
        if (!isMounted) return;
        const items = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            nome: data.name || data.nome || "",
            sortOrder: typeof data.sortOrder === "number" ? data.sortOrder : undefined,
          };
        });
        items.sort((a, b) => {
          const orderA = typeof a.sortOrder === "number" ? a.sortOrder : 999999;
          const orderB = typeof b.sortOrder === "number" ? b.sortOrder : 999999;
          if (orderA !== orderB) return orderA - orderB;
          return a.nome.localeCompare(b.nome);
        });
        setStatuses(items);
      },
      (err) => {
        console.warn("[Trello] Error fetching statuses from Firestore:", err);
      }
    );

    // 2. Listen to hospitals
    const hospRef = collection(db, "hospitals");
    const qHosp = query(hospRef, where("groupId", "==", activeGroup.id));
    const unsubHosp = onSnapshot(
      qHosp,
      (snap) => {
        if (!isMounted) return;
        const items = snap.docs
          .map((d) => ({
            id: d.id,
            nome: d.data().name || d.data().nome || "",
          }))
          .sort((a, b) => a.nome.localeCompare(b.nome));
        setHospitals(items);
      },
      (err) => {
        console.warn("[Trello] Error fetching hospitals from Firestore:", err);
      }
    );

    // 3. Listen to patients
    const patientsRef = collection(db, "patients");
    const qPatients = query(patientsRef, where("groupId", "==", activeGroup.id));
    const unsubPatients = onSnapshot(
      qPatients,
      (snap) => {
        if (!isMounted) return;
        const items = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              ...data,
              nome: data.name || data.nome || "Sem Nome",
              roomNumber: data.roomNumber || data.room_number || data.quarto || "",
            } as Patient;
          })
          .filter((p: any) => p.recordStatus !== "removed");
        setPatients(items);
        setLoading(false);
      },
      (err) => {
        console.warn("[Trello] Error fetching patients from Firestore:", err);
        // Fallback to API if firestore listener encounters issues
        apiFetch("/api/app/patients?full=true")
          .then((res) => res.json())
          .then((data) => {
            if (isMounted && data.patients) {
              setPatients(data.patients);
            }
          })
          .catch((e) => console.error("[Trello] API fallback failed:", e))
          .finally(() => {
            if (isMounted) setLoading(false);
          });
      }
    );

    return () => {
      isMounted = false;
      unsubStatus();
      unsubHosp();
      unsubPatients();
    };
  }, [activeGroup?.id]);

  // Create lookup maps for Status and Hospital names
  const statusMap = useMemo(() => {
    const map = new Map<string, string>();
    statuses.forEach((s) => map.set(s.id, s.nome));
    return map;
  }, [statuses]);

  const hospitalMap = useMemo(() => {
    const map = new Map<string, string>();
    hospitals.forEach((h) => map.set(h.id, h.nome));
    return map;
  }, [hospitals]);

  // Enriched patients with resolved hospitalName and statusName
  const enrichedPatients = useMemo(() => {
    return patients.map((p) => {
      const resolvedStatus =
        (p.statusId && statusMap.get(p.statusId)) ||
        (p.status && p.status !== "Não informado" ? p.status : "") ||
        "Sem Status";

      const resolvedHospital =
        (p.hospitalId && hospitalMap.get(p.hospitalId)) ||
        p.hospitalName ||
        "Sem Hospital";

      return {
        ...p,
        resolvedStatus,
        resolvedHospital,
      };
    });
  }, [patients, statusMap, hospitalMap]);

  // Filter patients by search term
  const filteredPatients = useMemo(() => {
    if (!searchTerm.trim()) return enrichedPatients;
    const term = searchTerm.toLowerCase().trim();
    return enrichedPatients.filter((p) => {
      const name = (p.nome || "").toLowerCase();
      const hospital = (p.resolvedHospital || "").toLowerCase();
      const room = (p.roomNumber || "").toLowerCase();
      const procedure = (p.procedure || "").toLowerCase();
      const status = (p.resolvedStatus || "").toLowerCase();
      return (
        name.includes(term) ||
        hospital.includes(term) ||
        room.includes(term) ||
        procedure.includes(term) ||
        status.includes(term)
      );
    });
  }, [enrichedPatients, searchTerm]);

  // Helper to normalize status strings for comparison
  const normalizeStatus = (str: string) => {
    return str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  };

  // Build Kanban columns based on grouping mode
  const columns = useMemo(() => {
    if (groupingMode === "status") {
      // 1. Collect all distinct statuses
      // Start with default/requested statuses: Pré-operatório, Pós-operatório
      const baseStatuses = ["Pré-operatório", "Pós-operatório"];
      
      // Add statuses defined in the group config
      const groupStatusNames = statuses.map((s) => s.nome).filter(Boolean);
      
      // Combine unique status column titles preserving order
      const columnNames: string[] = [];
      
      // Ensure base statuses are in the list
      baseStatuses.forEach((bs) => {
        const foundInGroup = groupStatusNames.find(
          (gs) => normalizeStatus(gs) === normalizeStatus(bs)
        );
        columnNames.push(foundInGroup || bs);
      });

      // Add other group statuses not already included
      groupStatusNames.forEach((gs) => {
        if (!columnNames.some((c) => normalizeStatus(c) === normalizeStatus(gs))) {
          columnNames.push(gs);
        }
      });

      // Also check if any patient has a status not listed yet
      filteredPatients.forEach((p) => {
        if (
          p.resolvedStatus &&
          p.resolvedStatus !== "Sem Status" &&
          !columnNames.some((c) => normalizeStatus(c) === normalizeStatus(p.resolvedStatus))
        ) {
          columnNames.push(p.resolvedStatus);
        }
      });

      // Include "Sem Status" column only if there are patients with no status
      const hasUnassigned = filteredPatients.some(
        (p) => !p.resolvedStatus || p.resolvedStatus === "Sem Status"
      );
      if (hasUnassigned) {
        columnNames.push("Sem Status");
      }

      // Group patients into columns
      return columnNames.map((colName) => {
        const colPatients = filteredPatients.filter((p) => {
          if (colName === "Sem Status") {
            return !p.resolvedStatus || p.resolvedStatus === "Sem Status";
          }
          return normalizeStatus(p.resolvedStatus) === normalizeStatus(colName);
        });

        return {
          id: `status-${colName}`,
          title: colName,
          type: "status" as const,
          patients: colPatients,
        };
      });
    } else {
      // Grouping by Hospital
      const hospitalNames: string[] = [];

      // Add all group hospitals
      hospitals.forEach((h) => {
        if (h.nome && !hospitalNames.includes(h.nome)) {
          hospitalNames.push(h.nome);
        }
      });

      // Add any hospital names appearing in patient records
      filteredPatients.forEach((p) => {
        if (
          p.resolvedHospital &&
          p.resolvedHospital !== "Sem Hospital" &&
          !hospitalNames.includes(p.resolvedHospital)
        ) {
          hospitalNames.push(p.resolvedHospital);
        }
      });

      // Sort hospitals alphabetically
      hospitalNames.sort((a, b) => a.localeCompare(b));

      // Include "Sem Hospital" column if there are patients without a hospital
      const hasUnassignedHosp = filteredPatients.some(
        (p) => !p.resolvedHospital || p.resolvedHospital === "Sem Hospital"
      );
      if (hasUnassignedHosp) {
        hospitalNames.push("Sem Hospital");
      }

      return hospitalNames.map((hName) => {
        const colPatients = filteredPatients.filter((p) => {
          if (hName === "Sem Hospital") {
            return !p.resolvedHospital || p.resolvedHospital === "Sem Hospital";
          }
          return p.resolvedHospital === hName;
        });

        return {
          id: `hosp-${hName}`,
          title: hName,
          type: "hospital" as const,
          patients: colPatients,
        };
      });
    }
  }, [groupingMode, statuses, hospitals, filteredPatients]);

  // Helper for column color accent
  const getColumnTheme = (title: string, type: "status" | "hospital") => {
    if (type === "status") {
      const norm = normalizeStatus(title);
      if (norm.includes("pre") || norm.includes("pre-op")) {
        return {
          headerBg: "bg-amber-500/10 text-amber-900 border-amber-200/80",
          badgeBg: "bg-amber-100 text-amber-800",
          dotColor: "bg-amber-500",
          icon: "🟡",
        };
      }
      if (norm.includes("pos") || norm.includes("pos-op")) {
        return {
          headerBg: "bg-emerald-500/10 text-emerald-900 border-emerald-200/80",
          badgeBg: "bg-emerald-100 text-emerald-800",
          dotColor: "bg-emerald-500",
          icon: "🟢",
        };
      }
      if (norm.includes("cirurgia") || norm.includes("bloco")) {
        return {
          headerBg: "bg-purple-500/10 text-purple-900 border-purple-200/80",
          badgeBg: "bg-purple-100 text-purple-800",
          dotColor: "bg-purple-500",
          icon: "🟣",
        };
      }
      if (norm.includes("alta")) {
        return {
          headerBg: "bg-blue-500/10 text-blue-900 border-blue-200/80",
          badgeBg: "bg-blue-100 text-blue-800",
          dotColor: "bg-blue-500",
          icon: "🔵",
        };
      }
      return {
        headerBg: "bg-slate-500/10 text-slate-900 border-slate-200/80",
        badgeBg: "bg-slate-100 text-slate-800",
        dotColor: "bg-slate-500",
        icon: "⚪",
      };
    } else {
      return {
        headerBg: "bg-blue-500/10 text-blue-900 border-blue-200/80",
        badgeBg: "bg-blue-100 text-blue-800",
        dotColor: "bg-blue-600",
        icon: "🏥",
      };
    }
  };

  // Extract patient initials
  const getInitials = (name: string) => {
    if (!name) return "P";
    const parts = name.trim().split(" ");
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  return (
    <div className="w-full flex flex-col h-full space-y-4">
      {/* Top Header & Controls */}
      <div className="bg-white/80 backdrop-blur-md rounded-3xl p-4 sm:p-5 border border-gray-200/60 shadow-sm flex flex-col gap-4">
        {/* Row 1: Title and Total badge */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-md shadow-blue-500/20">
              <Trello size={20} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                Quadro Trello
              </h1>
              <p className="text-xs text-gray-500 font-medium">
                Visualização Kanban de pacientes por status ou hospital
              </p>
            </div>
          </div>

          {/* Grouping Toggle Switch */}
          <div className="inline-flex p-1 bg-gray-100/90 rounded-2xl border border-gray-200/70 shadow-inner self-start sm:self-auto">
            <button
              onClick={() => setGroupingMode("status")}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                groupingMode === "status"
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <Activity size={14} />
              <span>Por status</span>
            </button>
            <button
              onClick={() => setGroupingMode("hospital")}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                groupingMode === "hospital"
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <Building2 size={14} />
              <span>Por hospital</span>
            </button>
          </div>
        </div>

        {/* Row 2: Search Bar & Stats */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar paciente por nome, hospital, quarto..."
              className="w-full rounded-2xl glass-input pl-10 pr-4 py-2.5 text-xs sm:text-sm font-semibold text-gray-800 shadow-sm outline-none transition-all"
            />
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
              <Search size={16} />
            </div>
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-xs text-gray-400 hover:text-gray-600"
              >
                Limpar
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            <span className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-2 rounded-xl border border-gray-200/60">
              {filteredPatients.length}{" "}
              {filteredPatients.length === 1 ? "paciente" : "pacientes"}
            </span>
          </div>
        </div>
      </div>

      {/* Kanban Board Container (Horizontal scroll) */}
      <div className="w-full flex-1 min-h-[calc(100vh-280px)] overflow-x-auto pb-6 pt-1 custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center py-20 bg-white/50 rounded-3xl border border-dashed border-gray-200">
            <div className="flex flex-col items-center gap-3">
              <Activity className="animate-spin text-blue-600" size={32} />
              <p className="text-sm font-bold text-gray-500">
                Carregando pacientes do quadro...
              </p>
            </div>
          </div>
        ) : columns.length === 0 ? (
          <div className="flex items-center justify-center py-20 bg-white/50 rounded-3xl border border-dashed border-gray-200">
            <p className="text-sm font-medium text-gray-500">
              Nenhuma coluna disponível.
            </p>
          </div>
        ) : (
          <div className="flex flex-row items-start gap-4 sm:gap-5 min-w-max px-1">
            {columns.map((column) => {
              const theme = getColumnTheme(column.title, column.type);

              return (
                <div
                  key={column.id}
                  className="w-[290px] sm:w-[320px] md:w-[340px] shrink-0 flex flex-col bg-slate-50/80 rounded-3xl border border-slate-200/80 p-3 sm:p-3.5 shadow-sm max-h-[calc(100vh-220px)] transition-all"
                >
                  {/* Column Header */}
                  <div
                    className={`flex items-center justify-between p-3 rounded-2xl border mb-3 select-none ${theme.headerBg}`}
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <span className="text-base shrink-0">{theme.icon}</span>
                      <h2 className="font-black text-xs sm:text-sm uppercase tracking-wide truncate">
                        {column.title}
                      </h2>
                    </div>
                    <span
                      className={`text-[11px] px-2.5 py-0.5 rounded-full font-black tracking-tight shrink-0 shadow-2xs ${theme.badgeBg}`}
                    >
                      {column.patients.length}
                    </span>
                  </div>

                  {/* Column Cards (Vertical scrollable list) */}
                  <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar min-h-[120px]">
                    {column.patients.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 px-4 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-white/40">
                        <User size={24} className="text-slate-300 mb-1.5" />
                        <span className="text-xs font-semibold text-slate-400">
                          Nenhum paciente
                        </span>
                      </div>
                    ) : (
                      column.patients.map((p) => {
                        const photo = p.photoURL || p.photoUrl || p.avatar;
                        const room =
                          p.roomNumber || p.room_number || p.quarto || "";

                        return (
                          <motion.div
                            key={p.id}
                            whileHover={{ y: -2 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => onSelectPatient(p.id)}
                            className="bg-white rounded-2xl p-3.5 border border-gray-200/80 shadow-xs hover:shadow-md hover:border-blue-300 transition-all cursor-pointer group select-none text-left relative overflow-hidden"
                          >
                            {/* Accent line on hover */}
                            <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />

                            {/* Card Content Top: Avatar + Name + Surgery Type */}
                            <div className="flex items-start gap-3">
                              {/* Patient Photo or Initial Avatar */}
                              {photo ? (
                                <img
                                  src={photo}
                                  alt={p.nome}
                                  className="w-11 h-11 rounded-xl object-cover border border-gray-100 shrink-0 shadow-xs"
                                  onError={(e) => {
                                    // Fallback to initials if image fails to load
                                    (e.target as HTMLElement).style.display = "none";
                                  }}
                                />
                              ) : (
                                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-100 border border-blue-200/60 text-blue-700 flex items-center justify-center font-black text-xs shrink-0 shadow-2xs">
                                  {getInitials(p.nome)}
                                </div>
                              )}

                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-1.5">
                                  <h3 className="text-sm font-bold text-gray-900 group-hover:text-blue-600 transition-colors leading-tight line-clamp-2">
                                    {p.nome}
                                  </h3>
                                  {p.surgery_type && (
                                    <span
                                      className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md tracking-wider shrink-0 ${
                                        p.surgery_type.toLowerCase().includes("urgente")
                                          ? "bg-red-50 text-red-700 border border-red-200"
                                          : "bg-blue-50 text-blue-700 border border-blue-200"
                                      }`}
                                    >
                                      {p.surgery_type}
                                    </span>
                                  )}
                                </div>

                                {p.idade && (
                                  <span className="text-[10px] text-gray-400 font-semibold mt-0.5 block">
                                    {p.idade} {Number(p.idade) === 1 ? "ano" : "anos"}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Card Metadata (Hospital & Quarto) */}
                            <div className="mt-3 pt-2.5 border-t border-gray-100 flex flex-col gap-1 text-xs">
                              {/* Hospital */}
                              <div className="flex items-center gap-1.5 text-gray-600">
                                <Building2 size={13} className="text-blue-500 shrink-0" />
                                <span className="font-semibold text-gray-800 truncate text-[11px] uppercase">
                                  {p.resolvedHospital || "Sem Hospital"}
                                </span>
                              </div>

                              {/* Quarto / Leito */}
                              <div className="flex items-center gap-1.5 text-gray-500">
                                <Bed size={13} className="text-indigo-500 shrink-0" />
                                <span className="font-medium text-gray-600 truncate text-[11px]">
                                  {room
                                    ? room.toLowerCase().includes("quarto") ||
                                      room.toLowerCase().includes("leito") ||
                                      room.toLowerCase().includes("sala")
                                      ? room
                                      : `Quarto ${room}`
                                    : "Sem quarto definido"}
                                </span>
                              </div>

                              {/* Procedure if available */}
                              {p.procedure && (
                                <div className="flex items-center gap-1.5 text-gray-500 mt-0.5">
                                  <Stethoscope size={13} className="text-emerald-500 shrink-0" />
                                  <span className="font-medium text-emerald-700 truncate text-[11px]">
                                    {p.procedure}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Card Footer: Status tag (when in hospital mode) + Action link */}
                            <div className="mt-2.5 pt-2 flex items-center justify-between text-[10px] border-t border-gray-50">
                              {groupingMode === "hospital" && (
                                <span className="font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-md truncate max-w-[130px]">
                                  {p.resolvedStatus}
                                </span>
                              )}
                              <div className="ml-auto flex items-center gap-1 text-blue-600 font-bold group-hover:translate-x-0.5 transition-transform">
                                <span>Ver ficha</span>
                                <ChevronRight size={12} />
                              </div>
                            </div>
                          </motion.div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
