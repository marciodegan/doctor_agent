import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  serverTimestamp 
} from "firebase/firestore";
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
  phone?: string;
  fone?: string;
  cpf?: string;
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

export interface CreatePatientInput {
  nome: string;
  fone?: string;
  idade?: string | number;
  cpf?: string;
  hospitalName?: string;
  hospitalId?: string;
  roomNumber?: string;
  status?: string;
  statusId?: string;
  procedimento?: string;
  procedure?: string;
  surgery_type?: string;
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

/**
 * Creates a new patient document. Uses client Firestore first, with API fallback.
 */
export async function createPatient(
  groupId: string,
  input: CreatePatientInput,
  apiFetch?: (url: string, init?: RequestInit) => Promise<Response>
): Promise<{ id: string }> {
  if (!input.nome || !input.nome.trim()) {
    throw new Error("O nome do paciente é obrigatório.");
  }

  if (!groupId) {
    throw new Error("Grupo ativo não selecionado.");
  }

  try {
    const patientDocRef = doc(collection(db, "patients"));
    const patientRecord = {
      name: input.nome.trim(),
      nome: input.nome.trim(),
      phone: input.fone || "",
      age: input.idade !== undefined ? input.idade.toString() : "",
      idade: input.idade !== undefined ? input.idade.toString() : "",
      cpf: input.cpf || "",
      hospitalId: input.hospitalId || input.hospitalName || "",
      hospitalName: input.hospitalName || "",
      roomNumber: input.roomNumber || "",
      statusId: input.statusId || input.status || "",
      status: input.status || "",
      procedure: input.procedimento || input.procedure || "",
      surgery_type: input.surgery_type || "",
      groupId,
      recordStatus: "active",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(patientDocRef, patientRecord);

    // Add initial log
    try {
      const logRef = doc(collection(db, "patient_logs"));
      await setDoc(logRef, {
        patientId: patientDocRef.id,
        patientName: input.nome.trim(),
        text: "Paciente cadastrado no sistema.",
        description: "Paciente cadastrado no sistema.",
        groupId,
        type: "texto",
        createdAt: serverTimestamp(),
        timestamp: serverTimestamp(),
      });
    } catch (logErr) {
      console.warn("[patientService] Could not write initial patient log:", logErr);
    }

    return { id: patientDocRef.id };
  } catch (firestoreErr: any) {
    console.warn("[patientService] Direct Firestore createPatient failed, trying API fallback:", firestoreErr);
    if (apiFetch) {
      const res = await apiFetch("/api/app/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: input.nome,
          fone: input.fone,
          idade: input.idade,
          cpf: input.cpf,
          hospitalName: input.hospitalId || input.hospitalName,
          roomNumber: input.roomNumber,
          status: input.statusId || input.status,
          procedimento: input.procedimento || input.procedure,
          surgery_type: input.surgery_type,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return { id: data.id };
    }
    throw firestoreErr;
  }
}

/**
 * Updates a patient's status. Uses client Firestore first, with API fallback.
 */
export async function updatePatientStatus(
  patientId: string,
  statusId: string,
  statusName?: string,
  userName?: string,
  apiFetch?: (url: string, init?: RequestInit) => Promise<Response>
): Promise<void> {
  if (!patientId || !statusId) {
    throw new Error("ID do paciente e Status são obrigatórios.");
  }

  try {
    const patientRef = doc(db, "patients", patientId);
    await updateDoc(patientRef, {
      statusId: statusId,
      status: statusName || statusId,
      updatedAt: serverTimestamp(),
    });

    try {
      const pSnap = await getDoc(patientRef);
      const pData = pSnap.data();
      const pName = pData?.name || pData?.nome || "Paciente";
      const gId = pData?.groupId || "";

      const logRef = doc(collection(db, "patient_logs"));
      await setDoc(logRef, {
        patientId,
        patientName: pName,
        text: `Status alterado para ${statusName || statusId}${userName ? ` por ${userName}` : ""}`,
        description: `Status alterado para ${statusName || statusId}${userName ? ` por ${userName}` : ""}`,
        groupId: gId,
        type: "texto",
        createdAt: serverTimestamp(),
        timestamp: serverTimestamp(),
      });
    } catch (logErr) {
      console.warn("[patientService] Could not write status change log:", logErr);
    }
  } catch (firestoreErr) {
    console.warn("[patientService] Direct updatePatientStatus failed, trying API fallback:", firestoreErr);
    if (apiFetch) {
      const res = await apiFetch("/api/app/patients/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, status: statusId, statusName }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return;
    }
    throw firestoreErr;
  }
}

/**
 * Updates patient profile information. Uses client Firestore first, with API fallback.
 */
export async function updatePatientInfo(
  patientId: string,
  updates: Record<string, any>,
  apiFetch?: (url: string, init?: RequestInit) => Promise<Response>
): Promise<void> {
  if (!patientId) throw new Error("ID do paciente é obrigatório.");

  try {
    const patientRef = doc(db, "patients", patientId);
    const docUpdates: Record<string, any> = {
      updatedAt: serverTimestamp(),
    };

    if (updates.nome !== undefined) {
      docUpdates.name = updates.nome;
      docUpdates.nome = updates.nome;
    }
    if (updates.name !== undefined) {
      docUpdates.name = updates.name;
      docUpdates.nome = updates.name;
    }
    if (updates.fone !== undefined) {
      docUpdates.phone = updates.fone;
      docUpdates.phone = updates.fone;
    }
    if (updates.phone !== undefined) {
      docUpdates.phone = updates.phone;
    }
    if (updates.idade !== undefined) {
      docUpdates.age = updates.idade;
      docUpdates.idade = updates.idade;
    }
    if (updates.age !== undefined) {
      docUpdates.age = updates.age;
      docUpdates.idade = updates.age;
    }
    if (updates.hospitalName !== undefined) {
      docUpdates.hospitalId = updates.hospitalName;
    }
    if (updates.hospitalId !== undefined) {
      docUpdates.hospitalId = updates.hospitalId;
    }
    if (updates.roomNumber !== undefined) {
      docUpdates.roomNumber = updates.roomNumber;
    }
    if (updates.status !== undefined) {
      docUpdates.statusId = updates.status;
      docUpdates.status = updates.status;
    }
    if (updates.statusId !== undefined) {
      docUpdates.statusId = updates.statusId;
    }
    if (updates.surgery_type !== undefined) {
      docUpdates.surgery_type = updates.surgery_type;
    }
    if (updates.procedure !== undefined) {
      docUpdates.procedure = updates.procedure;
    }
    if (updates.procedimento !== undefined) {
      docUpdates.procedure = updates.procedimento;
    }

    await updateDoc(patientRef, docUpdates);
  } catch (firestoreErr) {
    console.warn("[patientService] Direct updatePatientInfo failed, trying API fallback:", firestoreErr);
    if (apiFetch) {
      const res = await apiFetch("/api/app/patients/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: patientId, ...updates }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return;
    }
    throw firestoreErr;
  }
}

/**
 * Removes a patient (soft delete).
 */
export async function removePatientRecord(
  patientId: string,
  userId?: string,
  userEmail?: string,
  apiFetch?: (url: string, init?: RequestInit) => Promise<Response>
): Promise<void> {
  if (!patientId) throw new Error("ID do paciente é obrigatório.");

  try {
    const patientRef = doc(db, "patients", patientId);
    await updateDoc(patientRef, {
      recordStatus: "removed",
      removedAt: serverTimestamp(),
      removedBy: userId || "",
      updatedAt: serverTimestamp(),
    });
  } catch (firestoreErr) {
    console.warn("[patientService] Direct removePatientRecord failed, trying API fallback:", firestoreErr);
    if (apiFetch) {
      const res = await apiFetch(`/api/app/patients/${patientId}/remove`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return;
    }
    throw firestoreErr;
  }
}

/**
 * Loads patient report data for report display.
 */
export async function getPatientReportData(
  patientId: string,
  groupId: string,
  apiFetch?: (url: string, init?: RequestInit) => Promise<any>
): Promise<any> {
  if (!patientId) throw new Error("ID do paciente é obrigatório.");

  try {
    const patientSnap = await getDoc(doc(db, "patients", patientId));
    if (!patientSnap.exists()) {
      throw new Error("Paciente não encontrado.");
    }
    const pData = patientSnap.data();
    const effectiveGroupId = pData.groupId || groupId;

    // Fetch related docs
    const [contactsSnap, logsSnap, filesSnap, statusesSnap, hospitalsSnap] = await Promise.all([
      getDocs(query(collection(db, "patients_contacts"), where("patientId", "==", patientId))),
      getDocs(query(collection(db, "patient_logs"), where("patientId", "==", patientId))),
      getDocs(query(collection(db, "files"), where("patientId", "==", patientId))),
      getDocs(query(collection(db, "patient_statuses"), where("groupId", "==", effectiveGroupId))),
      getDocs(query(collection(db, "hospitals"), where("groupId", "==", effectiveGroupId))),
    ]);

    const statusesMap = new Map<string, string>();
    statusesSnap.docs.forEach((d) => {
      const dData = d.data();
      statusesMap.set(d.id, dData.name || dData.nome || "");
    });

    const hospitalsMap = new Map<string, string>();
    hospitalsSnap.docs.forEach((d) => {
      const dData = d.data();
      hospitalsMap.set(d.id, dData.name || dData.nome || "");
    });

    const hospName =
      (pData.hospitalId && hospitalsMap.get(pData.hospitalId)) ||
      pData.hospitalName ||
      pData.hospital_nome ||
      pData.hospitalId ||
      "Sem Hospital";

    const statName =
      (pData.statusId && statusesMap.get(pData.statusId)) ||
      pData.status ||
      "Sem Status";

    const isVideoUrl = (url: string) => {
      if (!url) return false;
      const cleanUrl = url.split("?")[0].toLowerCase();
      return (
        cleanUrl.endsWith(".mp4") ||
        cleanUrl.endsWith(".mov") ||
        cleanUrl.endsWith(".webm") ||
        cleanUrl.endsWith(".quicktime") ||
        cleanUrl.endsWith(".m4v")
      );
    };
    const isPdfUrl = (url: string) => {
      if (!url) return false;
      const cleanUrl = url.split("?")[0].toLowerCase();
      return cleanUrl.endsWith(".pdf");
    };

    const files = filesSnap.docs
      .filter((d) => d.data().status !== "removed")
      .map((d) => {
        const data = d.data();
        const fileTypeResolved =
          data.fileType ||
          (isVideoUrl(data.link || "")
            ? "video"
            : isPdfUrl(data.link || "")
            ? "pdf"
            : "image");
        return {
          id: d.id,
          data: data.timestamp
            ? (typeof data.timestamp.toDate === "function" ? data.timestamp.toDate() : new Date(data.timestamp)).toLocaleString("pt-BR", {
                timeZone: "America/Sao_Paulo",
              })
            : "Recente",
          descricao: data.description || "Arquivo",
          link: data.link,
          aiResposta: data.aiAnalysis || "",
          fileType: fileTypeResolved,
          contentType: data.contentType || "",
          size: data.size || 0,
          originalName: data.originalName || data.description || "Arquivo",
          uploadedByEmail: data.uploadedByEmail || "",
          encryption: data.encryption || null,
        };
      });

    const logs = logsSnap.docs
      .filter((d) => d.data().status !== "removed")
      .map((d) => {
        const data = d.data();
        const dateObj = data.createdAt || data.timestamp;
        return {
          id: d.id,
          conteudo: data.text || data.description || "",
          tipo: data.type || "texto",
          data: dateObj
            ? (typeof dateObj.toDate === "function" ? dateObj.toDate() : new Date(dateObj)).toLocaleString("pt-BR", {
                timeZone: "America/Sao_Paulo",
              })
            : "Recente",
        };
      });

    const contacts = contactsSnap.docs
      .filter((d) => d.data().status !== "removed")
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          nome: data.name || data.nome || "",
          relacao: data.relationship || data.relacao || "",
          fone: data.phone || data.fone || "",
        };
      });

    return {
      cadastro: {
        ID: patientId,
        Nome: pData.name || pData.nome || "Sem Nome",
        Telefone: pData.phone || pData.fone || "",
        Idade: pData.age || pData.idade || "",
        Status: statName,
        statusId: pData.statusId || "",
        hospitalName: hospName,
        hospitalId: pData.hospitalId || "",
        roomNumber: pData.roomNumber || pData.quarto || "",
        surgery_type: pData.surgery_type || "",
        procedure: pData.procedure || pData.procedimento || "",
      },
      audios: logs,
      imagens: files,
      familiares: contacts,
    };
  } catch (firestoreErr) {
    console.warn("[patientService] Direct getPatientReportData failed, trying API fallback:", firestoreErr);
    if (apiFetch) {
      const res = await apiFetch(`/api/app/patient-report/${patientId}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data;
    }
    throw firestoreErr;
  }
}
