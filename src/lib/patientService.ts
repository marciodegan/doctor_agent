import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";

export interface PatientRecord {
  id: string;
  nome: string;
  status: string;
  name?: string;
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
  recordStatus?: string;
  updatedAt?: any;
  createdAt?: any;
  [key: string]: any;
}

export interface HospitalRecord {
  id: string;
  nome: string;
  name?: string;
}

export interface StatusRecord {
  id: string;
  nome: string;
  name?: string;
  sortOrder?: number;
}

export interface PatientsDataResult {
  patients: PatientRecord[];
  hospitals: HospitalRecord[];
  statuses: StatusRecord[];
}

/**
 * Fetches all patients, hospitals and statuses for a given group.
 * Uses direct client-side Firestore first (fast, realtime & respects user auth rules),
 * with fallback to server API if needed.
 */
export async function getGroupPatientsData(
  groupId: string,
  apiFetch?: (url: string, init?: RequestInit) => Promise<Response>
): Promise<PatientsDataResult> {
  if (!groupId) {
    return { patients: [], hospitals: [], statuses: [] };
  }

  try {
    // 1. Query Firestore directly via Client SDK
    const patientsQuery = query(
      collection(db, "patients"),
      where("groupId", "==", groupId)
    );
    const hospitalsQuery = query(
      collection(db, "hospitals"),
      where("groupId", "==", groupId)
    );
    const statusesQuery = query(
      collection(db, "patient_statuses"),
      where("groupId", "==", groupId)
    );

    const [patientsSnap, hospitalsSnap, statusesSnap] = await Promise.all([
      getDocs(patientsQuery),
      getDocs(hospitalsQuery),
      getDocs(statusesQuery),
    ]);

    const hospitals: HospitalRecord[] = hospitalsSnap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          nome: data.name || data.nome || "",
        };
      })
      .sort((a, b) => a.nome.localeCompare(b.nome));

    const hMap = new Map<string, string>();
    hospitals.forEach((h) => hMap.set(h.id, h.nome));

    const statuses: StatusRecord[] = statusesSnap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          nome: data.name || data.nome || "",
          sortOrder: typeof data.sortOrder === "number" ? data.sortOrder : undefined,
        };
      })
      .sort((a, b) => {
        const orderA = typeof a.sortOrder === "number" ? a.sortOrder : 999999;
        const orderB = typeof b.sortOrder === "number" ? b.sortOrder : 999999;
        if (orderA !== orderB) return orderA - orderB;
        return a.nome.localeCompare(b.nome);
      });

    const sMap = new Map<string, string>();
    statuses.forEach((s) => sMap.set(s.id, s.nome));

    const patients: PatientRecord[] = patientsSnap.docs
      .map((d) => {
        const data = d.data();
        const hospName =
          (data.hospitalId && hMap.get(data.hospitalId)) ||
          data.hospitalName ||
          data.hospital_nome ||
          "Sem Hospital";

        const statName =
          (data.statusId && sMap.get(data.statusId)) ||
          (data.status && data.status !== "Não informado" ? data.status : "Sem Status");

        const record: PatientRecord = {
          id: d.id,
          ...data,
          nome: data.name || data.nome || "Sem Nome",
          hospitalName: hospName,
          status: statName,
          roomNumber: data.roomNumber || data.room_number || data.quarto || "",
          recordStatus: data.recordStatus,
        };
        return record;
      })
      .filter((p) => p.recordStatus !== "removed");

    return { patients, hospitals, statuses };
  } catch (firestoreErr) {
    console.warn("[patientService] Direct Firestore fetch failed, trying API fallback:", firestoreErr);

    // 2. Fallback to API if available
    if (apiFetch) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        const res = await apiFetch("/api/app/patients?full=true", {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        const json = await res.json();
        if (json && json.patients) {
          return {
            patients: json.patients || [],
            hospitals: json.hospitals || [],
            statuses: json.statuses || [],
          };
        }
      } catch (apiErr) {
        console.error("[patientService] API fallback also failed:", apiErr);
      }
    }

    return { patients: [], hospitals: [], statuses: [] };
  }
}
