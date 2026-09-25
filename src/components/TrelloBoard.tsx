import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
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
  Clock,
  XCircle,
  GripVertical,
  ArrowRightLeft,
  Loader2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useGroup } from "../contexts/GroupContext";

interface Patient {
  id: string;
  nome?: string;
  name?: string;
  status?: string;
  statusName?: string;
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

const DEFAULT_COLOR_PALETTE = [
  "#3B82F6", // blue
  "#10B981", // emerald
  "#8B5CF6", // purple
  "#F59E0B", // amber
  "#06B6D4", // cyan
  "#EC4899", // pink
  "#6366F1", // indigo
  "#14B8A6", // teal
  "#F97316", // orange
  "#64748B"  // slate
];

export const TrelloBoard: React.FC<TrelloBoardProps> = ({ onSelectPatient }) => {
  const { activeGroup, apiFetch } = useGroup();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filters & Controls
  const [groupBy, setGroupBy] = useState<"status" | "hospital">("status");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedHospitalFilter, setSelectedHospitalFilter] = useState<string>("all");
  const [activeColumnIndex, setActiveColumnIndex] = useState<number>(0);

  // Drag and Drop States
  const [draggedPatient, setDraggedPatient] = useState<Patient | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);
  const [updatingPatientId, setUpdatingPatientId] = useState<string | null>(null);
  const [justDroppedPatientId, setJustDroppedPatientId] = useState<string | null>(null);

  // Mobile Touch Drag State
  const [isTouchDragging, setIsTouchDragging] = useState<boolean>(false);
  const [touchCoords, setTouchCoords] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Notifications Toast
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Refs
  const carouselRef = useRef<HTMLDivElement>(null);
  const touchStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const touchHoldTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasDraggedRef = useRef<boolean>(false);
  const activeTouchPatientRef = useRef<Patient | null>(null);
  const isTouchDraggingRef = useRef<boolean>(false);
  const dragOverColumnIdRef = useRef<string | null>(null);

  // Keep refs in sync with state for event listeners
  useEffect(() => {
    isTouchDraggingRef.current = isTouchDragging;
  }, [isTouchDragging]);

  useEffect(() => {
    dragOverColumnIdRef.current = dragOverColumnId;
  }, [dragOverColumnId]);

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
  const getHospitalName = useCallback((patient: Patient): string => {
    if (patient.hospitalName) return patient.hospitalName;
    if (patient.hospital) return patient.hospital;
    if (patient.hospitalId) {
      const match = hospitals.find(
        (h) => h.id?.toString() === patient.hospitalId?.toString()
      );
      if (match) return match.nome || match.name || "Hospital";
    }
    return "Hospital não informado";
  }, [hospitals]);

  // Helper to get patient bed / room display name
  const getRoomDisplay = useCallback((patient: Patient): string => {
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
  }, []);

  // Filter patients by hospital and search term
  const filteredPatients = useMemo(() => {
    let result = patients;

    // Filter by Hospital
    if (selectedHospitalFilter !== "all") {
      result = result.filter((p) => {
        const hospId = p.hospitalId?.toString() || "";
        const hospName = normalizeText(getHospitalName(p));
        return (
          hospId === selectedHospitalFilter ||
          hospName === normalizeText(selectedHospitalFilter)
        );
      });
    }

    // Filter by search term
    if (searchTerm.trim()) {
      const term = normalizeText(searchTerm);
      result = result.filter((p) => {
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
    }

    return result;
  }, [patients, selectedHospitalFilter, searchTerm, getHospitalName, getRoomDisplay]);

  // Build Kanban columns dynamically without hardcoding
  const columns = useMemo((): KanbanColumn[] => {
    if (groupBy === "hospital") {
      const hospitalMap = new Map<string, KanbanColumn>();

      hospitals.forEach((h, idx) => {
        const name = h.nome || h.name || "Hospital";
        hospitalMap.set(h.id.toString(), {
          id: h.id.toString(),
          name,
          color: DEFAULT_COLOR_PALETTE[idx % DEFAULT_COLOR_PALETTE.length],
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
              color: DEFAULT_COLOR_PALETTE[hospitalMap.size % DEFAULT_COLOR_PALETTE.length],
              patients: [p]
            });
          }
        }
      });

      return Array.from(hospitalMap.values());
    } else {
      // Group by Status - DYNAMICALLY from Firestore statuses
      const statusMap = new Map<string, KanbanColumn>();

      // 1. Initialize registered statuses from database
      statuses.forEach((s, idx) => {
        const sName = (s.nome || s.name || "").trim();
        const sId = s.id?.toString() || sName;
        if (!sName && !sId) return;

        const colKey = sId;
        if (!statusMap.has(colKey)) {
          statusMap.set(colKey, {
            id: sId,
            name: sName || "Status",
            color: s.color || DEFAULT_COLOR_PALETTE[idx % DEFAULT_COLOR_PALETTE.length],
            patients: []
          });
        }
      });

      // 2. Distribute filtered patients
      filteredPatients.forEach((p) => {
        const pStatusId = p.statusId ? p.statusId.toString().trim() : "";
        const pStatusRaw = (p.statusName || p.status || "").trim();
        const normRaw = normalizeText(pStatusRaw);

        // Try match by statusId
        let matchedKey: string | null = null;
        if (pStatusId && statusMap.has(pStatusId)) {
          matchedKey = pStatusId;
        }

        // If no match by ID, match by normalized name
        if (!matchedKey && pStatusRaw) {
          for (const [key, col] of statusMap.entries()) {
            if (col.id === pStatusId || normalizeText(col.name) === normRaw) {
              matchedKey = key;
              break;
            }
          }
        }

        if (matchedKey) {
          statusMap.get(matchedKey)!.patients.push(p);
        } else if (pStatusRaw) {
          // Dynamic status column found in patient record but not in list
          const dynKey = `dyn-status-${normRaw}`;
          if (!statusMap.has(dynKey)) {
            statusMap.set(dynKey, {
              id: pStatusId || pStatusRaw,
              name: pStatusRaw,
              color: DEFAULT_COLOR_PALETTE[statusMap.size % DEFAULT_COLOR_PALETTE.length],
              patients: []
            });
          }
          statusMap.get(dynKey)!.patients.push(p);
        } else {
          // Patient has no status assigned
          const unassignedKey = "col-unassigned";
          if (!statusMap.has(unassignedKey)) {
            statusMap.set(unassignedKey, {
              id: "unassigned",
              name: "Sem Status",
              color: "#94A3B8",
              patients: []
            });
          }
          statusMap.get(unassignedKey)!.patients.push(p);
        }
      });

      return Array.from(statusMap.values());
    }
  }, [groupBy, statuses, hospitals, filteredPatients, getHospitalName]);

  // Execute patient status move in Firestore & update state optimistically
  const handleMovePatient = async (patientId: string, targetColId: string) => {
    if (groupBy !== "status") {
      return;
    }

    const patient = patients.find((p) => p.id === patientId);
    if (!patient) return;

    const targetColumn = columns.find((c) => c.id === targetColId);
    if (!targetColumn) return;

    const currentStatusId = patient.statusId?.toString() || "";
    const currentStatusName = (patient.statusName || patient.status || "").trim();

    // Check if status is actually changing
    if (
      (currentStatusId && currentStatusId === targetColumn.id) ||
      normalizeText(currentStatusName) === normalizeText(targetColumn.name)
    ) {
      // Same status, no update needed
      return;
    }

    // Save previous state for rollback on error
    const previousPatients = [...patients];
    const targetStatusName = targetColumn.name;
    const targetStatusId = targetColumn.id;
    const patientDisplayName = patient.nome || patient.name || "Paciente";

    // 1. Optimistic UI update: instantly move to target column
    setUpdatingPatientId(patientId);
    setJustDroppedPatientId(patientId);
    setPatients((prev) =>
      prev.map((p) => {
        if (p.id === patientId) {
          return {
            ...p,
            status: targetStatusName,
            statusName: targetStatusName,
            statusId: targetStatusId
          };
        }
        return p;
      })
    );

    setTimeout(() => {
      setJustDroppedPatientId(null);
    }, 1200);

    // 2. Real Firestore persistence
    try {
      const res = await apiFetch("/api/app/patients/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          status: targetStatusId,
          statusName: targetStatusName
        })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.error) {
        throw new Error(data.error || `Erro HTTP ${res.status}`);
      }

      // Success notification
      setNotification({
        type: "success",
        message: `${patientDisplayName} movido para ${targetStatusName}`
      });
      setTimeout(() => setNotification(null), 3500);
    } catch (err: any) {
      console.error("[Trello] Failed to persist patient status move:", err);
      // Revert optimistic update
      setPatients(previousPatients);
      setNotification({
        type: "error",
        message: `Não foi possível mover o paciente para "${targetStatusName}". ${err?.message || ""}`
      });
      setTimeout(() => setNotification(null), 5000);
    } finally {
      setUpdatingPatientId(null);
    }
  };

  // Carousel scroll controls
  const scrollCarousel = (direction: "left" | "right") => {
    if (!carouselRef.current) return;
    const container = carouselRef.current;
    const cardWidth = container.querySelector(":scope > div")?.clientWidth || 340;
    const scrollAmount = cardWidth + 16;
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

  // Desktop HTML5 Drag & Drop handlers
  const handleDragStart = (e: React.DragEvent, patient: Patient) => {
    if (groupBy !== "status" || updatingPatientId === patient.id) {
      e.preventDefault();
      return;
    }
    setDraggedPatient(patient);
    hasDraggedRef.current = true;
    e.dataTransfer.setData("text/plain", patient.id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = () => {
    setDraggedPatient(null);
    setDragOverColumnId(null);
    setTimeout(() => {
      hasDraggedRef.current = false;
    }, 150);
  };

  const handleColumnDragOver = (e: React.DragEvent, columnId: string) => {
    if (groupBy !== "status") return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverColumnId !== columnId) {
      setDragOverColumnId(columnId);
    }
  };

  const handleColumnDragLeave = (e: React.DragEvent, columnId: string) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    if (dragOverColumnId === columnId) {
      setDragOverColumnId(null);
    }
  };

  const handleColumnDrop = (e: React.DragEvent, columnId: string) => {
    if (groupBy !== "status") return;
    e.preventDefault();
    const patientId = e.dataTransfer.getData("text/plain") || draggedPatient?.id;
    if (patientId) {
      handleMovePatient(patientId, columnId);
    }
    setDraggedPatient(null);
    setDragOverColumnId(null);
    setTimeout(() => {
      hasDraggedRef.current = false;
    }, 150);
  };

  // Mobile Touch Drag Handlers
  const handleTouchStart = (e: React.TouchEvent, patient: Patient) => {
    if (groupBy !== "status" || updatingPatientId === patient.id) return;

    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
    activeTouchPatientRef.current = patient;
    hasDraggedRef.current = false;

    // Start 220ms long-press timer to initiate drag
    if (touchHoldTimerRef.current) clearTimeout(touchHoldTimerRef.current);
    touchHoldTimerRef.current = setTimeout(() => {
      // Initiate drag mode
      setIsTouchDragging(true);
      setDraggedPatient(patient);
      setTouchCoords({ x: touch.clientX, y: touch.clientY });
      hasDraggedRef.current = true;
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(35);
      }
    }, 220);
  };

  // Global Touch Move and Touch End listeners during dragging
  useEffect(() => {
    const onWindowTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;

      if (!isTouchDraggingRef.current) {
        // Check if movement before timer should cancel long-press (natural scroll)
        const dx = Math.abs(touch.clientX - touchStartPosRef.current.x);
        const dy = Math.abs(touch.clientY - touchStartPosRef.current.y);
        if (dx > 8 || dy > 8) {
          if (touchHoldTimerRef.current) {
            clearTimeout(touchHoldTimerRef.current);
            touchHoldTimerRef.current = null;
          }
        }
        return;
      }

      // We are in active drag mode: prevent default scroll & track position
      e.preventDefault();
      setTouchCoords({ x: touch.clientX, y: touch.clientY });

      // Identify column under touch using elementFromPoint
      const elem = document.elementFromPoint(touch.clientX, touch.clientY);
      const colElem = elem?.closest("[data-column-id]");
      const foundColId = colElem?.getAttribute("data-column-id") || null;
      setDragOverColumnId(foundColId);

      // Auto-scroll carousel if near edges
      if (carouselRef.current) {
        const rect = carouselRef.current.getBoundingClientRect();
        if (touch.clientX < rect.left + 50) {
          carouselRef.current.scrollBy({ left: -10, behavior: "auto" });
        } else if (touch.clientX > rect.right - 50) {
          carouselRef.current.scrollBy({ left: 10, behavior: "auto" });
        }
      }
    };

    const onWindowTouchEnd = () => {
      if (touchHoldTimerRef.current) {
        clearTimeout(touchHoldTimerRef.current);
        touchHoldTimerRef.current = null;
      }

      if (isTouchDraggingRef.current && activeTouchPatientRef.current) {
        const patientToMove = activeTouchPatientRef.current;
        const targetColId = dragOverColumnIdRef.current;

        if (targetColId) {
          handleMovePatient(patientToMove.id, targetColId);
        }
      }

      setIsTouchDragging(false);
      setDraggedPatient(null);
      setDragOverColumnId(null);
      activeTouchPatientRef.current = null;

      setTimeout(() => {
        hasDraggedRef.current = false;
      }, 200);
    };

    window.addEventListener("touchmove", onWindowTouchMove, { passive: false });
    window.addEventListener("touchend", onWindowTouchEnd);
    window.addEventListener("touchcancel", onWindowTouchEnd);

    return () => {
      window.removeEventListener("touchmove", onWindowTouchMove);
      window.removeEventListener("touchend", onWindowTouchEnd);
      window.removeEventListener("touchcancel", onWindowTouchEnd);
    };
  }, [columns, patients]);

  return (
    <div className="w-full flex flex-col space-y-3 text-slate-800 animate-fadeIn pb-16 relative select-none">
      {/* Notifications Toast */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-2xl shadow-xl border flex items-center gap-3 text-xs font-bold max-w-[90vw] sm:max-w-md backdrop-blur-md ${
              notification.type === "success"
                ? "bg-slate-900/95 text-white border-slate-700 shadow-slate-900/30"
                : "bg-red-600/95 text-white border-red-500 shadow-red-600/30"
            }`}
          >
            {notification.type === "success" ? (
              <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
            ) : (
              <XCircle size={18} className="text-white shrink-0" />
            )}
            <span className="flex-1">{notification.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Ghost Card during Mobile Touch Drag */}
      {isTouchDragging && draggedPatient && (
        <div
          className="fixed pointer-events-none z-[9999] transform -translate-x-1/2 -translate-y-1/2 w-[300px] sm:w-[340px] bg-white rounded-2xl p-4 border-2 border-blue-500 shadow-2xl rotate-2 opacity-95"
          style={{
            left: `${touchCoords.x}px`,
            top: `${touchCoords.y}px`,
          }}
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-sm shadow-inner shrink-0">
              {(draggedPatient.nome || draggedPatient.name || "P").charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-black text-slate-900 truncate">
                {draggedPatient.nome || draggedPatient.name || "Paciente"}
              </h4>
              <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
                {getHospitalName(draggedPatient)}
              </p>
              <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-lg border border-blue-200">
                <ArrowRightLeft size={10} />
                <span>Arrastando para novo status...</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top Filter & Search Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white/90 backdrop-blur-md px-4 py-3 rounded-2xl border border-slate-200/80 shadow-sm">
        {/* Segmented Switch: Por status / Por hospital */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex p-1 bg-slate-100/90 rounded-2xl border border-slate-200/80 shadow-inner">
            <button
              id="trello-group-status-btn"
              onClick={() => {
                setGroupBy("status");
                setActiveColumnIndex(0);
              }}
              className={`flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
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
              className={`flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                groupBy === "hospital"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Building2 size={14} />
              <span>Por hospital</span>
            </button>
          </div>

          {/* Hospital Dropdown Filter */}
          {hospitals.length > 0 && (
            <div className="relative">
              <select
                value={selectedHospitalFilter}
                onChange={(e) => setSelectedHospitalFilter(e.target.value)}
                className="text-xs font-bold text-slate-700 bg-slate-50/90 hover:bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/25 cursor-pointer transition shadow-sm"
              >
                <option value="all">Todos os hospitais</option>
                {hospitals.map((h) => (
                  <option key={h.id} value={h.id.toString()}>
                    {h.nome || h.name || "Hospital"}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Drag Hint Banner for Mobile & Desktop */}
        {groupBy === "status" && (
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-blue-50/80 border border-blue-100 text-blue-700 rounded-xl text-[11px] font-semibold">
            <GripVertical size={13} className="text-blue-500" />
            <span>Arraste os pacientes entre as colunas para alterar o status</span>
          </div>
        )}

        {/* Action Controls & Search */}
        <div className="flex items-center gap-2.5">
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
              Carregando quadro Trello...
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
        /* Modern Carousel Board Container */
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

          {/* Carousel Track with Drag and Drop columns */}
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
              const isDragOver = dragOverColumnId === column.id;
              const isOriginColumn =
                draggedPatient &&
                (draggedPatient.statusId === column.id ||
                  normalizeText(draggedPatient.statusName || draggedPatient.status) ===
                    normalizeText(column.name));

              return (
                <div
                  key={column.id || colIdx}
                  data-column-id={column.id}
                  onDragOver={(e) => handleColumnDragOver(e, column.id)}
                  onDragLeave={(e) => handleColumnDragLeave(e, column.id)}
                  onDrop={(e) => handleColumnDrop(e, column.id)}
                  className={`flex flex-col shrink-0 w-[84vw] sm:w-[350px] md:w-[360px] rounded-[28px] border overflow-hidden snap-center min-h-[540px] transition-all duration-200 ${
                    isDragOver && !isOriginColumn
                      ? "bg-blue-50/80 border-blue-500 ring-4 ring-blue-500/20 shadow-xl scale-[1.01]"
                      : "bg-slate-100/70 border-slate-200/90 shadow-sm hover:shadow-md"
                  }`}
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

                  {/* Column Body: Vertical Cards List & Drop Zone */}
                  <div
                    className="flex-1 overflow-y-auto p-3.5 space-y-3 custom-scrollbar max-h-[calc(100vh-320px)] transition-colors"
                    style={{ scrollbarWidth: "thin" }}
                  >
                    {/* Visual Drop Highlight Target when dragging over this column */}
                    {isDragOver && !isOriginColumn && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="border-2 border-dashed border-blue-500 bg-blue-100/60 rounded-2xl p-3 flex items-center justify-center gap-2 text-blue-700 font-black text-xs shadow-inner"
                      >
                        <Sparkles size={16} className="text-blue-600 animate-spin" />
                        <span>Soltar para mover para {column.name}</span>
                      </motion.div>
                    )}

                    {count === 0 && !isDragOver ? (
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

                        const isBeingDragged = draggedPatient?.id === patient.id;
                        const isUpdatingThisPatient = updatingPatientId === patient.id;
                        const isJustDropped = justDroppedPatientId === patient.id;

                        return (
                          <div
                            key={patient.id}
                            id={`trello-card-${patient.id}`}
                            draggable={groupBy === "status" && !isUpdatingThisPatient}
                            onDragStart={(e) => handleDragStart(e, patient)}
                            onDragEnd={handleDragEnd}
                            onTouchStart={(e) => handleTouchStart(e, patient)}
                            onClick={() => {
                              if (
                                hasDraggedRef.current ||
                                isTouchDragging ||
                                isUpdatingThisPatient
                              ) {
                                return;
                              }
                              onSelectPatient(patient.id, patientName);
                            }}
                            className={`relative bg-white rounded-2xl p-4 border transition-all duration-200 cursor-pointer flex flex-col gap-3 text-left group select-none ${
                              isBeingDragged
                                ? "opacity-35 scale-[0.97] border-dashed border-2 border-blue-400 bg-blue-50/40 shadow-inner"
                                : isJustDropped
                                ? "ring-2 ring-emerald-500 border-emerald-400 bg-emerald-50/30 shadow-lg scale-[1.01]"
                                : "border-slate-200/80 shadow-sm hover:shadow-md hover:border-blue-300"
                            }`}
                          >
                            {/* Updating Overlay Spinner */}
                            {isUpdatingThisPatient && (
                              <div className="absolute inset-0 bg-white/80 backdrop-blur-[1px] rounded-2xl flex items-center justify-center z-20 gap-2 text-blue-600 font-bold text-xs">
                                <Loader2 size={16} className="animate-spin" />
                                <span>Atualizando status...</span>
                              </div>
                            )}

                            {/* Patient Photo & Info Row */}
                            <div className="flex items-start gap-3.5">
                              {/* Drag Handle Indicator */}
                              {groupBy === "status" && (
                                <div
                                  className="text-slate-300 group-hover:text-blue-500 cursor-grab active:cursor-grabbing transition-colors shrink-0 pt-1"
                                  title="Arraste para mover"
                                >
                                  <GripVertical size={16} />
                                </div>
                              )}

                              {/* Photo / Avatar */}
                              <div className="w-11 h-11 rounded-2xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center shadow-inner relative">
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
                              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                                <span className="truncate max-w-[260px] bg-slate-50/80 px-2.5 py-1 rounded-xl border border-slate-100 font-medium text-slate-600">
                                  {patient.procedure ||
                                    patient.diagnosis ||
                                    patient.surgery_type}
                                </span>
                              </div>
                            )}
                          </div>
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
