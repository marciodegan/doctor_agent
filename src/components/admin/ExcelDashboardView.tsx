import React, { useState, useEffect } from "react";
import { useGroup } from "../../contexts/GroupContext";
import { 
  collection,
  query,
  where,
  getDocs,
  getDoc,
  setDoc,
  doc,
  orderBy
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { 
  TableProperties, 
  Download, 
  Share2,
  Calendar, 
  TrendingUp, 
  Users, 
  DollarSign, 
  FileText, 
  ShieldCheck, 
  ArrowDownRight, 
  ArrowUpRight,
  Filter,
  CheckCircle2,
  AlertCircle,
  Stethoscope,
  Building2,
  Wallet,
  Receipt,
  Search,
  Plus,
  Eye,
  ChevronDown,
  ChevronUp,
  Layers,
  Percent,
  Settings2,
  UserCheck,
  UserX,
  Save,
  Check,
  Info,
  Tag,
  Trash2,
  Sparkles,
  BrainCircuit,
  UploadCloud,
  Loader2
} from "lucide-react";
import { DoctorTeamMember, TeamFinancialSettings } from "../../types/financial";
import { TransactionTypesManager } from "./TransactionTypesManager";
import { FinancialImportWizard } from "./FinancialImportWizard";
import { ProviderLinker } from "./ProviderLinker";
import { GlosasView } from "./GlosasView";

const KNOWN_DOCTORS = ['ROCHELE', 'THAIS', 'LUIS', 'KATHIZE'];

interface ExcelDashboardViewProps {
  closingId: string | null;
  initialSubTab?: "visao_geral" | "config_equipe" | "colunas_medicos" | "entradas_fontes" | "ocorrencias_fluxo" | "lotes_unimed" | "despesas_equipe" | "tipos_lancamento" | "config_prestadores" | "descritivo_pagamentos" | "glosas";
  onOpenImport?: () => void;
}

const normalize = (value: any) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim()
  .toUpperCase()
  .replace(/\s+/g, " ");

export function ExcelDashboardView({ closingId, initialSubTab = "lotes_unimed", onOpenImport }: ExcelDashboardViewProps) {
  const { activeGroup, apiFetch } = useGroup();
  const [closings, setClosings] = useState<any[]>([]);
  const [selectedClosingId, setSelectedClosingId] = useState<string | null>(closingId || "SETEMBRO-26");
  const [details, setDetails] = useState<any>(null);
  const rawProduction = Array.isArray(details?.productionRecords) ? details.productionRecords : [];
  const [loading, setLoading] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<
    "visao_geral" | "config_equipe" | "colunas_medicos" | "matriz_entradas" | "entradas_fontes" | "ocorrencias_fluxo" | "lotes_unimed" | "despesas_equipe" | "tipos_lancamento" | "config_prestadores" | "lancamentos_importados" | "descritivo_pagamentos" | "glosas"
  >(initialSubTab);
  const [selectedDoctorFilter, setSelectedDoctorFilter] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [removedLotes, setRemovedLotes] = useState<string[]>([]);
  const [noteSettings, setNoteSettings] = useState({
    irrfPercent: 1.5, pisPercent: 0.65, cofinsPercent: 3, csllPercent: 1,
    lucroPresumidoPercent: 32, irpjPercent: 15, csll9Percent: 9,
    adicional10Percent: 10, reservaRetencaoPercent: 59.6, cotaParte: 0, otherDeductions: 0
  });
  const [loteAliquotas, setLoteAliquotas] = useState<Record<string, any>>({});
  const [savingNoteSettings, setSavingNoteSettings] = useState(false);
  const [noteSettingsMessage, setNoteSettingsMessage] = useState("");
  const [isManualNoteOpen, setIsManualNoteOpen] = useState(false);
  const [savingManualNote, setSavingManualNote] = useState(false);
  const [manualNoteMessage, setManualNoteMessage] = useState("");
  const [manualNote, setManualNote] = useState({ lote: "", competencia: "", tipo: "Produção Estruturada", titulo: "", vencimento: "", bruto: "", glosa: "0", liquido: "" });

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [matrixModalData, setMatrixModalData] = useState<{
    isOpen: boolean;
    title: string;
    doctorName: string;
    source: string;
    records: any[];
  }>({ isOpen: false, title: "", doctorName: "", source: "", records: [] });

  const [doctors, setDoctors] = useState<any[]>([]);
  const [providerMappings, setProviderMappings] = useState<any[]>([]);
  const [financialImports, setFinancialImports] = useState<any[]>([]);
  const [loadingFinancialImports, setLoadingFinancialImports] = useState(false);
  const [selectedImportId, setSelectedImportId] = useState<string | null>(null);
  const [selectedImportDetails, setSelectedImportDetails] = useState<any>(null);
  const [loadingImportDetails, setLoadingImportDetails] = useState(false);
  const [deletingImportId, setDeletingImportId] = useState<string | null>(null);
  const [deletingAllImports, setDeletingAllImports] = useState(false);
  const [importManagementMessage, setImportManagementMessage] = useState("");


  useEffect(() => {
    if (activeSubTab !== "lancamentos_importados") return;
    let cancelled = false;
    const loadImports = async () => {
      setLoadingFinancialImports(true);
      setImportManagementMessage("");
      try {
        const response = await apiFetch("/api/app/financial/imports");
        const data = await response.json().catch(() => []);
        if (!response.ok) throw new Error(data.error || "Não foi possível carregar as importações.");
        if (!cancelled) {
          const spreadsheetImports = (Array.isArray(data) ? data : []).filter((item: any) =>
            item.source === "XLS_IMPORT" || /\.(csv|xls|xlsx)$/i.test(String(item.fileName || ""))
          );
          setFinancialImports(spreadsheetImports);
          if (selectedImportId && !spreadsheetImports.some((item: any) => item.id === selectedImportId)) {
            setSelectedImportId(null);
            setSelectedImportDetails(null);
          }
        }
      } catch (error: any) {
        if (!cancelled) setImportManagementMessage(error?.message || "Erro ao carregar importações.");
      } finally {
        if (!cancelled) setLoadingFinancialImports(false);
      }
    };
    loadImports();
    return () => { cancelled = true; };
  }, [activeSubTab, activeGroup?.id]);

  const refreshFinancialImports = async () => {
    const response = await apiFetch("/api/app/financial/imports");
    const data = await response.json().catch(() => []);
    if (!response.ok) throw new Error(data.error || "Não foi possível atualizar as importações.");
    const spreadsheetImports = (Array.isArray(data) ? data : []).filter((item: any) =>
      item.source === "XLS_IMPORT" || /\.(csv|xls|xlsx)$/i.test(String(item.fileName || ""))
    );
    setFinancialImports(spreadsheetImports);
    return spreadsheetImports;
  };

  const openImportedRecords = async (importId: string) => {
    setSelectedImportId(importId);
    setSelectedImportDetails(null);
    setLoadingImportDetails(true);
    setImportManagementMessage("");
    try {
      const response = await apiFetch("/api/app/financial/imports/" + importId + "/details");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível abrir os lançamentos.");
      setSelectedImportDetails(data);
    } catch (error: any) {
      setImportManagementMessage(error?.message || "Erro ao consultar os lançamentos.");
    } finally {
      setLoadingImportDetails(false);
    }
  };

  const isImportClosingOpen = (item: any) =>
    item.closingExists === true &&
    !["FECHADO", "CONCLUIDO", "CONCLUÍDO", "FINALIZADO", "ENCERRADO", "CLOSED", "COMPLETED", "DESCONHECIDO"].includes(String(item.closingStatus || "").trim().toUpperCase());

  const removeImportedFile = async (item: any) => {
    if (!isImportClosingOpen(item)) {
      setImportManagementMessage("Esta importação pertence a um fechamento fechado ou concluído e não pode ser removida.");
      return;
    }
    if (!window.confirm("Remover a importação " + (item.fileName || item.id) + " e todos os lançamentos vinculados? Esta ação não pode ser desfeita.")) return;
    setDeletingImportId(item.id);
    setImportManagementMessage("");
    try {
      const response = await apiFetch("/api/app/financial/imports/" + item.id, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível remover a importação.");
      if (selectedImportId === item.id) {
        setSelectedImportId(null);
        setSelectedImportDetails(null);
      }
      await refreshFinancialImports();
      if (selectedClosingId) {
        const detailsRes = await apiFetch("/api/app/financial/closings/" + selectedClosingId + "/details");
        if (detailsRes.ok) setDetails(await detailsRes.json());
      }
      setImportManagementMessage("Importação removida e lançamentos vinculados excluídos.");
    } catch (error: any) {
      setImportManagementMessage(error?.message || "Erro ao remover importação.");
    } finally {
      setDeletingImportId(null);
    }
  };

  const removeAllOpenImports = async () => {
    const eligible = financialImports.filter(isImportClosingOpen);
    if (!eligible.length) {
      setImportManagementMessage("Não há importações de planilhas vinculadas a fechamentos abertos.");
      return;
    }
    if (!window.confirm("Remover " + eligible.length + " importação(ões) de fechamentos abertos e todos os seus lançamentos? Importações de fechamentos fechados serão preservadas.")) return;
    setDeletingAllImports(true);
    setImportManagementMessage("");
    let removed = 0;
    const errors: string[] = [];
    try {
      for (const item of eligible) {
        try {
          const response = await apiFetch("/api/app/financial/imports/" + item.id, { method: "DELETE" });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || "Falha ao remover " + item.fileName);
          removed++;
        } catch (error: any) {
          errors.push((item.fileName || item.id) + ": " + (error?.message || "erro"));
        }
      }
      setSelectedImportId(null);
      setSelectedImportDetails(null);
      await refreshFinancialImports();
      if (selectedClosingId) {
        const detailsRes = await apiFetch("/api/app/financial/closings/" + selectedClosingId + "/details");
        if (detailsRes.ok) setDetails(await detailsRes.json());
      }
      setImportManagementMessage(errors.length
        ? removed + " importação(ões) removidas. Algumas não puderam ser removidas: " + errors.slice(0, 3).join(" | ")
        : removed + " importação(ões) removidas com sucesso.");
    } catch (error: any) {
      setImportManagementMessage(error?.message || "Erro ao remover as importações.");
    } finally {
      setDeletingAllImports(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const fetchProviderMappings = async () => {
      if (!activeGroup?.id) {
        setProviderMappings([]);
        return;
      }
      try {
        const mappingsQuery = query(
          collection(db, "doctor_provider_mappings"),
          where("teamId", "==", activeGroup.id),
          where("active", "==", true)
        );
        const snapshot = await getDocs(mappingsQuery);
        if (!cancelled) setProviderMappings(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
      } catch (error) {
        console.error("Erro ao carregar Prestadores Vinculados:", error);
        if (!cancelled) setProviderMappings([]);
      }
    };
    void fetchProviderMappings();
    return () => { cancelled = true; };
  }, [activeGroup?.id]);

  // Reapply current Prestadores Vinculados to existing imported records so
  // operational and film-only lines are assigned to the mapped doctor.
  const production = React.useMemo(() => rawProduction.map((record: any) => {
    const executante = normalize(record.executingProvider || "");
    const prestador = normalize(record.protocolProvider || record.paymentProvider || "");
    const mapping = providerMappings.find((item: any) =>
      normalize(item.executante) === executante && normalize(item.prestador) === prestador
    );
    return mapping ? {
      ...record,
      doctorId: mapping.doctorId,
      doctorName: mapping.doctorName || record.doctorName,
      allocationStatus: "ALLOCATED"
    } : record;
  }), [rawProduction, providerMappings]);

  // Manual entries for green plantao / entrada cells
  const defaultManualEntradas: Record<string, any> = {};
  const [manualEntradas, setManualEntradas] = useState<Record<string, any>>(defaultManualEntradas);
  const [manualEntriesLoaded, setManualEntriesLoaded] = useState(false);
  const [manualEntrySaveMessage, setManualEntrySaveMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    const loadManualEntries = async () => {
      if (!activeGroup?.id || !selectedClosingId) return;
      setManualEntriesLoaded(false);
      try {
        const settingsRef = doc(db, "groups", activeGroup.id, "financial_matrix_manual_entries", String(selectedClosingId).split("/").join("_"));
        const snapshot = await getDoc(settingsRef);
        if (cancelled) return;
        if (snapshot.exists() && snapshot.data()?.manualEntradas) {
          setManualEntradas({ ...defaultManualEntradas, ...snapshot.data().manualEntradas });
        } else {
          setManualEntradas(defaultManualEntradas);
        }
        if (snapshot.exists() && snapshot.data()?.globalEntradas) {
          setGlobalEntradas({ ...defaultGlobalEntradas, ...snapshot.data().globalEntradas });
        } else {
          setGlobalEntradas(defaultGlobalEntradas);
        }
      } catch (error) {
        console.error("Erro ao carregar valores manuais da matriz:", error);
      } finally {
        if (!cancelled) setManualEntriesLoaded(true);
      }
    };
    void loadManualEntries();
    return () => { cancelled = true; };
  }, [activeGroup?.id, selectedClosingId]);

  const updateManualEntry = (doctorKey: string, patch: Record<string, any>) => {
    setManualEntradas(current => ({
      ...current,
      [doctorKey]: { ...(current[doctorKey] || {}), ...patch }
    }));
  };

  const saveManualEntryOnBlur = async (doctorKey: string, patch: Record<string, any>) => {
    const next = {
      ...manualEntradas,
      [doctorKey]: { ...(manualEntradas[doctorKey] || {}), ...patch }
    };
    setManualEntradas(next);
    if (!manualEntriesLoaded || !activeGroup?.id || !selectedClosingId) {
      setManualEntrySaveMessage("Não foi possível salvar: grupo ou fechamento ainda não foi carregado.");
      return;
    }
    try {
      setManualEntrySaveMessage("Salvando valores da matriz...");
      await setDoc(doc(db, "groups", activeGroup.id, "financial_matrix_manual_entries", String(selectedClosingId).split("/").join("_")), {
        groupId: activeGroup.id,
        closingId: selectedClosingId,
        manualEntradas: next,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      setManualEntrySaveMessage("Valores de plantão salvos.");
    } catch (error: any) {
      console.error("Erro ao salvar valores manuais da matriz:", error);
      setManualEntrySaveMessage("Falha ao salvar os valores. Verifique as permissões do Firestore.");
      alert("Não foi possível salvar os valores de Plantão TT no Firestore. Verifique as permissões de gravação. Detalhe: " + (error?.message || "erro desconhecido"));
    }
  };

  // Global manual entries for totals at the top of sections
  const defaultGlobalEntradas = {
    azambujaTT: 0,
    azambujaDS: 0,
    marietaTT: 0,
    marietaDS: 0,
    consultorioTT: 0,
    consultorioDS: 0,
    dinheiroTT: 0,
    dinheiroDS: 0,
    unimedLuisTT: 0,
    unimedLuisDS: 0
  };
  const [globalEntradas, setGlobalEntradas] = useState<typeof defaultGlobalEntradas>(defaultGlobalEntradas);

  const saveGlobalEntryOnBlur = async (key: keyof typeof defaultGlobalEntradas, value: number) => {
    const next = { ...globalEntradas, [key]: value };
    setGlobalEntradas(next);
    if (!activeGroup?.id || !selectedClosingId) {
      setManualEntrySaveMessage("Não foi possível salvar: grupo ou fechamento ainda não foi carregado.");
      return;
    }
    try {
      setManualEntrySaveMessage("Salvando valores da matriz...");
      await setDoc(
        doc(db, "groups", activeGroup.id, "financial_matrix_manual_entries", String(selectedClosingId).split("/").join("_")),
        {
          groupId: activeGroup.id,
          closingId: selectedClosingId,
          globalEntradas: next,
          updatedAt: new Date().toISOString()
        },
        { merge: true }
      );
      setManualEntrySaveMessage("Valores de Azambuja e Marieta salvos.");
    } catch (error: any) {
      console.error("Erro ao salvar totais de Azambuja/Marieta:", error);
      setManualEntrySaveMessage("Falha ao salvar os valores. Verifique as permissões do Firestore.");
      alert("Não foi possível salvar os valores de Azambuja/Marieta no Firestore. Verifique as permissões de gravação. Detalhe: " + (error?.message || "erro desconhecido"));
    }
  };

  useEffect(() => {
    if (!activeGroup?.id) {
      setDoctors([]);
      return;
    }
    let cancelled = false;
    const fetchDoctors = async () => {
      try {
        const doctorsCol = collection(db, "doctors");
        const q = query(doctorsCol, where("teamId", "==", activeGroup.id), where("active", "==", true), orderBy("name"));
        const snapshot = await getDocs(q);
        if (!cancelled) setDoctors(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Falha ao carregar médicos da equipe ativa:", error);
        if (!cancelled) setDoctors([]);
      }
    };
    setDoctors([]);
    fetchDoctors();
    return () => { cancelled = true; };
  }, [activeGroup?.id]);

  // Team settings state
  const [teamSettings, setTeamSettings] = useState<TeamFinancialSettings>({
    teamId: "",
    doctors: [
      { key: "rochele", name: "ROCHELE LORENZI POL", isTeamMember: true, teamSharePercent: 29, proporcaoHeartDinamica: 26.79, disponivelPeriodo: 36086.02, specialty: "Cirurgia Cardiovascular", participaUnimed: true, unimedDistributionRule: "EQUAL" },
      { key: "thais", name: "THAIS ISABEL LUMIKOSKI", isTeamMember: true, teamSharePercent: 29, proporcaoHeartDinamica: 28.97, disponivelPeriodo: 39019.05, specialty: "Cirurgia Cardiovascular", participaUnimed: true, unimedDistributionRule: "EQUAL" },
      { key: "luis", name: "LUIS BONGIOLO MATTOS", isTeamMember: true, teamSharePercent: 29, proporcaoHeartDinamica: 26.79, disponivelPeriodo: 36086.02, specialty: "Cirurgia Geral / Cardio", participaUnimed: true, unimedDistributionRule: "EQUAL" },
      { key: "kathize", name: "KATHIZE LIRA", isTeamMember: true, teamSharePercent: 13, proporcaoHeartDinamica: 17.45, disponivelPeriodo: 23509.08, specialty: "Médica Assistente", participaUnimed: false, unimedDistributionRule: "EQUAL" },
      { key: "tamara", name: "TAMARA QUINTINO REGIS", isTeamMember: false, teamSharePercent: 0, proporcaoHeartDinamica: 0, disponivelPeriodo: 0, specialty: "Dermatologia Clínica", participaUnimed: false, unimedDistributionRule: "EQUAL" },
      { key: "luan", name: "LUAN JUNIOR VIGNATTI", isTeamMember: false, teamSharePercent: 0, proporcaoHeartDinamica: 0, disponivelPeriodo: 0, specialty: "Cirurgia da Pele / Dermatologia", participaUnimed: false, unimedDistributionRule: "EQUAL" },
      { key: "thaynara", name: "THAYNARA MAESTRI VIGNATTI", isTeamMember: false, teamSharePercent: 0, proporcaoHeartDinamica: 0, disponivelPeriodo: 0, specialty: "Ginecologia & Obstetrícia", participaUnimed: false, unimedDistributionRule: "EQUAL" },
      { key: "camila", name: "CAMILA RIBEIRO DUTRA", isTeamMember: false, teamSharePercent: 0, proporcaoHeartDinamica: 0, disponivelPeriodo: 0, specialty: "Reumatologia & Infusões", participaUnimed: false, unimedDistributionRule: "EQUAL" },
      { key: "maria_eduarda", name: "MARIA EDUARDA CASA SOUZA MACHADO", isTeamMember: false, teamSharePercent: 0, proporcaoHeartDinamica: 0, disponivelPeriodo: 0, specialty: "Dermatologia & Procedimentos", participaUnimed: false, unimedDistributionRule: "EQUAL" }
    ],
    teamOnlySources: ["AZAMBUJA", "MARIETA", "CONSULTORIO", "RECEBIDO_DINHEIRO", "CARTAO", "UNIMED_LUIS"],
    teamOnlyExpenses: ["CONTADOR_HEART", "DARE", "ALUGUEL_SALA", "CELULAR", "CONSULTORIO_ITAJAI", "CRM", "INSTRUMENTADOR", "ALVARA", "GOOGLE", "INSS_PATRONAL", "CAPITALIZACAO_COTA_PARTE"]
  });

  const configuredDoctors = Array.isArray(teamSettings.doctors) ? teamSettings.doctors : [];

  const rowsData = React.useMemo(() => {
    const normalizeDoctorName = (value: any) => String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, " ");

    const configuredIndex = new Map(configuredDoctors.map((d, index) => [d.key, index]));
    const seenNames = new Set<string>();

    // Firestore may contain more than one document for the same doctor. The matrix
    // must display one row per normalized doctor name, preferring the first matched
    // configuration and keeping its stable key for allocations.
    const uniqueRows = (Array.isArray(doctors) ? doctors : []).reduce((rows: any[], doc) => {
      const setting = configuredDoctors.find(d => d.key === doc.id)
        || configuredDoctors.find(d => normalizeDoctorName(d.name) === normalizeDoctorName(doc.name));
      const name = doc.name || setting?.name || "Médico";
      const normalizedName = normalizeDoctorName(name);
      if (!normalizedName || seenNames.has(normalizedName)) return rows;
      seenNames.add(normalizedName);

      rows.push({
        key: setting?.key || doc.id,
        firestoreId: doc.id,
        name,
        percent: Number(setting?.teamSharePercent) || 0,
        heartPercent: Number(setting?.proporcaoHeartDinamica) || 0,
        valorLimite: Math.max(0, Number(setting?.valorLimite ?? doc.valorLimite) || 0),
        isTeam: Boolean(setting?.isTeamMember)
      });
      return rows;
    }, []);

    return uniqueRows.sort((a, b) => {
      const ai = configuredIndex.get(a.key);
      const bi = configuredIndex.get(b.key);
      if (ai !== undefined && bi !== undefined) return ai - bi;
      if (ai !== undefined) return -1;
      if (bi !== undefined) return 1;
      return a.name.localeCompare(b.name, "pt-BR");
    });
  }, [doctors, teamSettings]);

  const moveDoctorInList = async (doctorKey: string, direction: -1 | 1) => {
    const currentRows = rowsData.map(row => row.key);
    const from = currentRows.indexOf(doctorKey);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= currentRows.length) return;

    const reorderedKeys = [...currentRows];
    [reorderedKeys[from], reorderedKeys[to]] = [reorderedKeys[to], reorderedKeys[from]];
    const settingsByKey = new Map(configuredDoctors.map(d => [d.key, d]));
    const reorderedSettings = reorderedKeys
      .map(key => settingsByKey.get(key))
      .filter(Boolean) as DoctorTeamMember[];
    const extraSettings = configuredDoctors.filter(d => !reorderedKeys.includes(d.key));
    const updatedSettings = { ...teamSettings, doctors: [...reorderedSettings, ...extraSettings] };

    setTeamSettings(updatedSettings);
    try {
      const response = await apiFetch("/api/app/financial/team-settings", {
        method: "POST",
        body: JSON.stringify(updatedSettings)
      });
      if (!response.ok) throw new Error("Não foi possível salvar a ordem dos médicos.");
    } catch (error: any) {
      console.error("[Financial Matrix] Failed to save doctor order:", error);
      alert("Não foi possível salvar a ordem dos médicos. Tente novamente.");
    }
  };

  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);

  // DISP PERÍODO and PROPORÇÃO HEART consider only doctors marked as team members.
  const recalculateHeartProportions = (docs: DoctorTeamMember[]) => {
    const teamMembers = docs.filter(d => d.isTeamMember === true);
    const sumDisponivel = teamMembers.reduce((acc, d) => acc + (Number(d.disponivelPeriodo) || 0), 0);
    return docs.map(d => {
      if (d.isTeamMember === true) {
        const dyn = sumDisponivel > 0
          ? Math.round(((Number(d.disponivelPeriodo) || 0) / sumDisponivel) * 10000) / 100
          : 0;
        return { ...d, proporcaoHeartDinamica: dyn };
      }
      return { ...d, proporcaoHeartDinamica: 0 };
    });
  };

  // Load team settings from backend
  useEffect(() => {
    if (!activeGroup) return;
    const fetchTeamSettings = async () => {
      try {
        const res = await apiFetch("/api/app/financial/team-settings");
        if (res.ok) {
          const data = await res.json();
          if (data && data.doctors) {
            // Older saved settings may contain doctors as a keyed object instead of an array.
            const normalizedDoctors = Array.isArray(data.doctors)
              ? data.doctors
              : data.doctors && typeof data.doctors === "object"
                ? Object.entries(data.doctors).map(([key, value]: [string, any]) => ({
                    ...(value && typeof value === "object" ? value : {}),
                    key: value?.key || key
                  }))
                : [];
            setTeamSettings(current => ({
              ...current,
              ...data,
              doctors: normalizedDoctors
            }));
          }
        }
      } catch (e) {
        console.error("Failed to load team settings:", e);
      }
    };
    fetchTeamSettings();
  }, [activeGroup]);

  useEffect(() => {
    if (!details?.closing) return;
    const saved = details.closing.noteSettings || {};
    const cotaParteFromTransactions = (Array.isArray(details.transactions) ? details.transactions : [])
      .filter((item: any) => /capitaliza.*cota|cota.*parte/i.test(String(item.typeName || item.observation || item.description || "")))
      .reduce((sum: number, item: any) => sum + Math.abs(Number(item.amount) || 0), 0);
    setNoteSettings({
      irrfPercent: Number(saved.irrfPercent ?? 1.5), pisPercent: Number(saved.pisPercent ?? 0.65),
      cofinsPercent: Number(saved.cofinsPercent ?? 3), csllPercent: Number(saved.csllPercent ?? 1),
      lucroPresumidoPercent: Number(saved.lucroPresumidoPercent ?? 32), irpjPercent: Number(saved.irpjPercent ?? 15),
      csll9Percent: Number(saved.csll9Percent ?? 9), adicional10Percent: Number(saved.adicional10Percent ?? 10),
      reservaRetencaoPercent: Number(saved.reservaRetencaoPercent ?? 59.6),
      cotaParte: Number(saved.cotaParte ?? (cotaParteFromTransactions || details.closing.totalOtherDebits || details.closing.otherDebits || 0)),
      otherDeductions: Number(saved.otherDeductions ?? 0)
    });
    setLoteAliquotas(saved.perLote && typeof saved.perLote === "object" ? saved.perLote : {});
    setNoteSettingsMessage("");
  }, [details?.closing?.id, details?.closing?.noteSettings]);

  const saveNoteSettings = async () => {
    if (!selectedClosingId) return;
    try {
      setSavingNoteSettings(true);
      setNoteSettingsMessage("");
      const response = await apiFetch(`/api/app/financial/closings/${selectedClosingId}/note-settings`, {
        method: "POST", body: JSON.stringify({ noteSettings: { ...noteSettings, perLote: loteAliquotas } })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar os parâmetros.");
      setDetails((current: any) => current ? { ...current, closing: { ...current.closing, noteSettings: data.noteSettings } } : current);
      setNoteSettingsMessage("Configurações salvas neste fechamento.");
    } catch (error: any) {
      setNoteSettingsMessage(error?.message || "Erro ao salvar as configurações.");
    } finally { setSavingNoteSettings(false); }
  };

  // Load available closings
  useEffect(() => {
    const fetchClosings = async () => {
      try {
        const res = await apiFetch("/api/app/financial/closings");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setClosings(data);
            if (!selectedClosingId) {
              setSelectedClosingId(data[0].id || data[0].monthKey);
            }
          }
        }
      } catch (e) {
        console.error("Failed to load closings:", e);
      }
    };
    fetchClosings();
  }, [activeGroup]);

  // Sync selectedClosingId when prop changes
  useEffect(() => {
    if (closingId) {
      setSelectedClosingId(closingId);
      setActiveSubTab("lotes_unimed");
    }
  }, [closingId]);

  // Load details for selected closing
  useEffect(() => {
    const cid = selectedClosingId || closingId || "SETEMBRO-26";
    if (!cid) return;
    const fetchDetails = async () => {
      try {
        setLoading(true);
        const res = await apiFetch(`/api/app/financial/closings/${cid}/details`);
        if (res.ok) {
          const data = await res.json();
          setDetails(data);
        }
      } catch (e) {
        console.error("Failed to load closing details:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
  }, [selectedClosingId, closingId, activeGroup]);

  useEffect(() => {
    if (details?.closing?.removedLotes && Array.isArray(details.closing.removedLotes)) {
      setRemovedLotes(details.closing.removedLotes);
    }
  }, [details]);

  const handleSaveTeamSettings = async () => {
    try {
      setSavingSettings(true);
      const res = await apiFetch("/api/app/financial/team-settings", {
        method: "POST",
        body: JSON.stringify(teamSettings)
      });
      if (res.ok) {
        setSettingsSuccess(true);
        setTimeout(() => setSettingsSuccess(false), 3000);
      }
    } catch (e: any) {
      alert("Erro ao salvar configurações da equipe: " + e.message);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleRemoveLote = async (loteNumber: string) => {
    if (!confirm(`Deseja realmente remover o lote/nota ${loteNumber} da conciliação atual do fechamento e salvá-lo no Firebase?`)) return;

    const updatedRemoved = [...removedLotes, loteNumber];
    setRemovedLotes(updatedRemoved);

    if (selectedClosingId) {
      try {
        await apiFetch(`/api/app/financial/closings/${selectedClosingId}/removed-lotes`, {
          method: "POST",
          body: JSON.stringify({ removedLotes: updatedRemoved })
        });

        await apiFetch(`/api/app/financial/closings/${selectedClosingId}/taxes/${loteNumber}`, {
          method: "DELETE"
        });

        const detailsRes = await apiFetch(`/api/app/financial/closings/${selectedClosingId}/details`);
        if (detailsRes.ok) {
          const data = await detailsRes.json();
          setDetails(data);
        }
      } catch (err: any) {
        console.error("Failed to update removed lotes in Firebase:", err);
        alert("Erro ao salvar alteração no Firebase: " + err.message);
      }
    }
  };

  const handleRestoreLotes = async () => {
    setRemovedLotes([]);
    if (selectedClosingId) {
      try {
        await apiFetch(`/api/app/financial/closings/${selectedClosingId}/removed-lotes`, {
          method: "POST",
          body: JSON.stringify({ removedLotes: [] })
        });
        const detailsRes = await apiFetch(`/api/app/financial/closings/${selectedClosingId}/details`);
        if (detailsRes.ok) {
          const data = await detailsRes.json();
          setDetails(data);
        }
      } catch (err: any) {
        console.error("Failed to restore lotes:", err);
      }
    }
  };

  const cashFlowTransactions = Array.isArray(details?.transactions) ? details.transactions : [];
  const availableTransactionTypes = Array.isArray(details?.transactionTypes) ? details.transactionTypes : [];
  const transactionTypesById = new Map<string, any>(
    availableTransactionTypes.map((type: any) => [String(type.id), type])
  );
  const normalizeTransactionTypeName = (value: any) => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
  const transactionTypesByName = new Map<string, any>(
    availableTransactionTypes.map((type: any) => [normalizeTransactionTypeName(type.name), type])
  );
  const normalizeRateioMethod = (value: any) => String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const getEffectiveRateioMethod = (tx: any) => {
    // The transaction type's current catalog configuration is authoritative.
    // Prefer the visible type name because older transactions can carry a stale
    // or generic typeId, and do not let a saved allocation snapshot override it.
    const currentType = transactionTypesByName.get(normalizeTransactionTypeName(tx.typeName))
      || transactionTypesById.get(String(tx.typeId || ""));
    const configuredMethod = normalizeRateioMethod(currentType?.defaultRateioMethod);
    if (configuredMethod) return configuredMethod;
    // Legacy fallback only when the type is no longer available in the catalog.
    const candidates = [tx.allocationMethod, tx.rateioMethod].map(normalizeRateioMethod).filter(Boolean);
    if (candidates.includes("PROP_GERAL")) return "PROP_GERAL";
    return candidates[0] || "";
  };
  const getEffectiveTransactionType = (tx: any) =>
    transactionTypesByName.get(normalizeTransactionTypeName(tx.typeName))
    || transactionTypesById.get(String(tx.typeId || ""));
  const getEffectiveTransactionScope = (tx: any) => {
    const configuredScope = String(getEffectiveTransactionType(tx)?.defaultScope || "").trim().toUpperCase();
    return configuredScope || String(tx.scope || "").trim().toUpperCase();
  };
  const isCreditTransaction = (tx: any) => {
    const nature = String(tx.nature || getEffectiveTransactionType(tx)?.nature || "").trim().toUpperCase();
    return ["CREDIT", "ENTRADA", "INCOME", "RECEITA"].includes(nature);
  };
  const isSharedUnimedRateioTransaction = (tx: any) => {
    const type = getEffectiveTransactionType(tx);
    const typeName = normalizeTransactionTypeName(type?.name || tx.typeName || "");
    const scope = getEffectiveTransactionScope(tx);
    const teamScope = ["TEAM", "TEAM_HEART", "EQUIPE", "EQUIPE_HEART", "HEART_TEAM", "RATEIO_EQUIPE"].includes(scope);
    const isRepasseUnimedCredit = typeName.includes("REPASSE PAGAMENTO DE PARECER MEDICO - HU")
      || typeName.includes("REPASSE PAGAMENTO DE PRODUCAO - HU");
    const isRateioCredit = isCreditTransaction(tx)
      && (
        typeName.includes("SOBREAVISO")
        || typeName.includes("RATEIO")
        || isRepasseUnimedCredit
      );
    if (!isRateioCredit) return false;

    // Lançamentos individuais (ex.: Sobreavisos e os repasses HU) também são
    // compartilhados entre os participantes Unimed quando o médico de origem
    // participa da Unimed. O tipo pode continuar como Médico Individual no cadastro;
    // esta regra define que esses créditos entram em Equipe TT, sem duplicar em Part. TT.
    if (scope === "DOCTOR") {
      // This predicate is evaluated outside cashFlowAllocation's useMemo, so it
      // must not reference resolveDoctor declared inside that callback.
      const rawDoctorId = String(tx.doctorId || "").trim();
      const rawDoctorName = String(tx.doctorName || "").trim();
      const firestoreDoctor = (Array.isArray(doctors) ? doctors : []).find((doctor: any) =>
        String(doctor.id || "") === rawDoctorId
      );
      const doctorName = firestoreDoctor?.name || rawDoctorName;
      const selectedDoctor = configuredDoctors.find((doctor: any) =>
        String(doctor.key || "") === rawDoctorId
        || normalizeTransactionTypeName(doctor.name) === normalizeTransactionTypeName(doctorName)
        || normalizeTransactionTypeName(doctor.name) === normalizeTransactionTypeName(rawDoctorId)
      );
      return selectedDoctor?.participaUnimed === true;
    }
    return teamScope;
  };
  const isSalaryTransaction = (tx: any) => tx.isSalary === true
    || transactionTypesById.get(String(tx.typeId || ""))?.isSalary === true
    || transactionTypesByName.get(normalizeTransactionTypeName(tx.typeName))?.isSalary === true;
  const getMatrixAdjustmentType = (tx: any): "ACERTO_1" | "SOBRE_MES_ANTERIOR" | "ACERTO_FINAL" | null => {
    const type = tx.matrixAdjustmentType
      || transactionTypesById.get(String(tx.typeId || ""))?.matrixAdjustmentType
      || transactionTypesByName.get(normalizeTransactionTypeName(tx.typeName))?.matrixAdjustmentType;
    if (type === "ACERTO_1" || type === "SOBRE_MES_ANTERIOR" || type === "ACERTO_FINAL") return type;
    const normalizedName = normalizeTransactionTypeName(tx.typeName || "");
    if (normalizedName === "ACERTO 1") return "ACERTO_1";
    if (normalizedName === "SOBRE MES ANTERIOR") return "SOBRE_MES_ANTERIOR";
    if (normalizedName === "ACERTO FINAL") return "ACERTO_FINAL";
    return null;
  };
  const isMatrixAdjustmentTransaction = (tx: any) => getMatrixAdjustmentType(tx) !== null;
  const cashFlowExpenseTypes = Array.from(new Map(
    cashFlowTransactions
      .filter((tx: any) => String(tx.nature || "").toUpperCase() === "DEBIT" && !isSalaryTransaction(tx) && !isMatrixAdjustmentTransaction(tx))
      .map((tx: any) => [String(tx.typeId || tx.typeName || "outros"), {
        id: String(tx.typeId || tx.typeName || "outros"),
        name: String(tx.typeName || "Despesa"),
        scope: String(tx.scope || "TEAM"),
        rateioMethod: String(tx.rateioMethod || ""),
        allowNegativeAmount: tx.allowNegativeAmount === true
      }])
  ).values())
    .map((type, index) => {
      const currentType = transactionTypesByName.get(normalizeTransactionTypeName(type.name))
        || transactionTypesById.get(String(type.id));
      return {
        ...type,
        scope: String(currentType?.defaultScope || type.scope || "TEAM").toUpperCase(),
        rateioMethod: normalizeRateioMethod(currentType?.defaultRateioMethod || type.rateioMethod),
        displayOrder: Math.max(0, Number(currentType?.displayOrder) || 0),
        originalIndex: index
      };
    })
    // Types with an explicit positive order appear first by that order. Types not
    // yet assigned an order retain their previous relative order after them.
    .sort((a, b) => {
      const ao = a.displayOrder;
      const bo = b.displayOrder;
      if (ao > 0 && bo > 0) return ao - bo || a.originalIndex - b.originalIndex;
      if (ao > 0) return -1;
      if (bo > 0) return 1;
      return a.originalIndex - b.originalIndex;
    })
    .map(({ originalIndex, ...type }) => type) as Array<{
      id:string; name:string; scope:string; rateioMethod:string;
      allowNegativeAmount:boolean; displayOrder:number;
    }>;

  // All expense columns follow the manually configured order. Subtotals remain
  // at the end and are display-only, based on the values already in the matrix.
  const expenseTypeMethod = (type: {id:string; name:string; rateioMethod:string}) =>
    getEffectiveRateioMethod({ typeId: type.id, typeName: type.name, rateioMethod: type.rateioMethod });
  const heartExpenseTypes = cashFlowExpenseTypes.filter(type =>
    type.scope !== "DOCTOR" && expenseTypeMethod(type) === "PROPORCAO_HEART");
  const generalPropExpenseTypes = cashFlowExpenseTypes.filter(type =>
    type.scope !== "DOCTOR" && expenseTypeMethod(type) === "PROP_GERAL");
  const individualExpenseTypes = cashFlowExpenseTypes.filter(type => type.scope === "DOCTOR");
  const displayedExpenseTypes = cashFlowExpenseTypes;
  const getDisplayedExpenseValue = (row: any, type: {id:string; allowNegativeAmount:boolean}) => {
    const value = Number(row.cashFlowExpenses?.[type.id]) || 0;
    return type.allowNegativeAmount ? value : Math.abs(value);
  };
  const getExpenseGroupTotal = (row: any, types: Array<{id:string; allowNegativeAmount:boolean}>) =>
    types.reduce((sum, type) => sum + getDisplayedExpenseValue(row, type), 0);
  const getExpenseHeaderColor = (type: {scope:string; id:string; name:string; rateioMethod:string}) => {
    if (type.scope === "DOCTOR") return "bg-emerald-200 text-emerald-950";
    const method = expenseTypeMethod(type);
    if (method === "PROPORCAO_HEART") return "bg-orange-200 text-orange-950";
    if (method === "PROP_GERAL") return "bg-purple-200 text-purple-950";
    return "bg-slate-200 text-slate-900";
  };
  const getExpenseCellColor = (type: {scope:string; id:string; name:string; rateioMethod:string}) => {
    if (type.scope === "DOCTOR") return "bg-emerald-50/70 text-emerald-900";
    const method = expenseTypeMethod(type);
    if (method === "PROPORCAO_HEART") return "bg-orange-50/70 text-orange-900";
    if (method === "PROP_GERAL") return "bg-purple-50/70 text-purple-900";
    return "bg-slate-50/70 text-slate-800";
  };

  const cashFlowAllocation = React.useMemo(() => {
    const incomingByDoctor: Record<string, number> = {};
    const incomingTransactionsByDoctor: Record<string, any[]> = {};
    const unimedPlantaoByDoctor: Record<string, number> = {};
    const expenseByDoctorType: Record<string, Record<string, number>> = {};
    const salaryByDoctor: Record<string, number> = {};
    const matrixAdjustmentByDoctor: Record<string, { ACERTO_1: number; SOBRE_MES_ANTERIOR: number; ACERTO_FINAL: number }> = {};
    // Use the same canonical key for transaction allocation and matrix rows.
    // The previous regex escaped the backslashes, so it did not remove Unicode
    // diacritics or collapse whitespace as intended.
    const normalize = (value: any) => String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, " ");
    const team = configuredDoctors.filter((d: any) => d.isTeamMember === true);
    const allDoctors = configuredDoctors;
    // Resolve legacy transaction doctor IDs (Firestore IDs or names) to the stable
    // financial-settings key used by the matrix rows.
    const resolveDoctor = (id: any, name: any) => {
      const rawId = String(id || "").trim();
      const rawName = String(name || "").trim();

      // Canonical IDs are the document IDs from the shared Firestore doctors collection.
      // Resolve them before trying legacy slugs or display names.
      const byFirestoreId = (Array.isArray(doctors) ? doctors : []).find((d: any) => String(d.id) === rawId);
      if (byFirestoreId?.name) {
        const byFirestoreName = configuredDoctors.find((d: any) => normalize(d.name) === normalize(byFirestoreId.name));
        if (byFirestoreName) return byFirestoreName;
        return {
          key: byFirestoreId.id,
          name: byFirestoreId.name,
          isTeamMember: false,
          teamSharePercent: 0,
          proporcaoHeartDinamica: 0
        };
      }

      // Legacy records can still contain canonical slugs and display names.
      const canonicalNames: Record<string, string> = {
        rochele: "ROCHELE LORENZI POL",
        thais: "THAIS ISABEL LUMIKOSKI",
        luis: "LUIS BONGIOLO MATTOS",
        kathize: "KATHIZE LIRA",
        tamara: "TAMARA QUINTINO REGIS",
        luan: "LUAN JUNIOR VIGNATTI",
        thaynara: "THAYNARA MAESTRI VIGNATTI",
        camila: "CAMILA RIBEIRO DUTRA",
        maria_eduarda: "MARIA EDUARDA CASA SOUZA MACHADO"
      };
      const canonicalName = canonicalNames[rawId.toLowerCase()];
      if (canonicalName) {
        const byCanonicalName = configuredDoctors.find((d: any) => normalize(d.name) === normalize(canonicalName));
        if (byCanonicalName) return byCanonicalName;
      }

      // Prefer an exact configured key next, then the saved name, and only then
      // treat the raw ID as a possible legacy doctor name.
      const byStableKey = configuredDoctors.find((d: any) => String(d.key).trim().toLowerCase() === rawId.toLowerCase());
      if (byStableKey) return byStableKey;
      const byExactName = configuredDoctors.find((d: any) => normalize(d.name) === normalize(rawName));
      if (byExactName) return byExactName;
      return configuredDoctors.find((d: any) => normalize(d.name) === normalize(rawId));
    };

    cashFlowTransactions.forEach((tx: any) => {
      const rawAmount = Number(tx.amount) || 0;
      if (!Number.isFinite(rawAmount) || rawAmount === 0) return;
      const isCredit = isCreditTransaction(tx);
      const allowNegativeAmount = tx.allowNegativeAmount === true;
      const amount = allowNegativeAmount ? rawAmount : Math.abs(rawAmount);
      const doctorId = String(tx.doctorId || "");
      const typeId = String(tx.typeId || tx.typeName || "outros");
      const scope = String(tx.scope || "").toUpperCase();
      // Allocation scope is a snapshot of the transaction type configuration.
      // Never let a populated doctorId override TEAM scope.
      const isTeamPlaceholderId = ["HEART_EQUIPE", "EQUIPE", "HEART", "TEAM"].includes(doctorId.toUpperCase());
      const resolvedSelectedDoctor = doctorId && !isTeamPlaceholderId ? resolveDoctor(doctorId, tx.doctorName) : undefined;

      // Key allocations by normalized doctor name, not by a mixture of slugs and
      // Firestore-generated settings keys. This guarantees the value follows the
      // selected doctor's visible matrix row.
      const matrixKey = (doctor: any) => normalize(doctor?.name);
      const addAllocation = (key: string, allocated: number, transaction: any) => {
        if (!Number.isFinite(allocated) || allocated === 0 || (allocated < 0 && !allowNegativeAmount)) return;
        if (isCredit) {
          incomingByDoctor[key] = (incomingByDoctor[key] || 0) + allocated;
          incomingTransactionsByDoctor[key] ||= [];
          incomingTransactionsByDoctor[key].push({ ...transaction, allocatedAmount: allocated });
        } else {
          expenseByDoctorType[key] ||= {};
          expenseByDoctorType[key][typeId] = (expenseByDoctorType[key][typeId] || 0) + allocated;
        }
      };

      // Adjustment columns are informational balances after FINAL. They accept signed amounts
      // and must not affect RESULT, salary, FINAL, or the general-expense columns.
      const isSharedUnimedRateio = isSharedUnimedRateioTransaction(tx);
      // Disponibilidade UTI importada do PDF é individual, exclusiva de Plantão TT.
      // Não deve aparecer em Part. TT nem ser rateada para Equipe TT.
      const normalizedTypeName = normalize(getEffectiveTransactionType(tx)?.name || tx.typeName || "");
      // O importador pode gravar o nome legado "Disponibilidade Médica - UTI"
      // mesmo após a nova configuração do tipo. Reconhecer ambos os nomes evita
      // que a entrada individual do PDF caia em Part. TT.
      const normalizedOccurrence = normalizeTransactionTypeName(tx.observation || tx.description || "");
      const isUtiPlantaoType = [
        "DISPONIBILIDADE MEDICA - UTI",
        "DISPONIBILIDADE MEDICA - UTI (PLANTAO INDIVIDUAL)"
      ].includes(normalizedTypeName)
        || normalizedTypeName.includes("DISPONIBILIDADE MEDICA - UTI")
        || normalizedOccurrence.includes("PLANTAO UTI");
      // Para este tipo importado, a regra individual é fixa e prevalece sobre
      // snapshots antigos de scope TEAM ou configurações "Participa Unimed".
      const isImportedUtiPlantao = isUtiPlantaoType
        && /PDF/i.test(String(tx.source || tx.sourceFile || tx.importId || ""));
      if (isImportedUtiPlantao) {
        if (isTeamPlaceholderId || !resolvedSelectedDoctor?.name) {
          console.error("[CashFlowAllocation] UTI plantão individual sem médico válido", {
            transactionId: tx.id, doctorId, doctorName: tx.doctorName || null, scope
          });
          return;
        }
        const key = matrixKey(resolvedSelectedDoctor);
        unimedPlantaoByDoctor[key] = Math.round(((unimedPlantaoByDoctor[key] || 0) + amount) * 100) / 100;
        return;
      }
      // Entradas de rateio da equipe (incluindo Sobreaviso) são distribuídas
      // igualmente entre os participantes da Unimed na coluna Equipe TT.
      // Evita alocá-las também como entradas individuais em Part. TT.
      if (isSharedUnimedRateio) return;

      const adjustmentType = getMatrixAdjustmentType(tx);
      if (adjustmentType) {
        if (scope !== "DOCTOR" || isTeamPlaceholderId || !resolvedSelectedDoctor?.name) {
          console.error("[CashFlowAllocation] Matrix adjustment must target one doctor", {
            transactionId: tx.id, doctorId, doctorName: tx.doctorName || null, adjustmentType
          });
          return;
        }
        const key = matrixKey(resolvedSelectedDoctor);
        matrixAdjustmentByDoctor[key] ||= { ACERTO_1: 0, SOBRE_MES_ANTERIOR: 0, ACERTO_FINAL: 0 };
        matrixAdjustmentByDoctor[key][adjustmentType] = Math.round((matrixAdjustmentByDoctor[key][adjustmentType] + rawAmount) * 100) / 100;
        return;
      }

      // Salary is shown in its own column and only deducted when calculating FINAL.
      // It must not be included among general expenses or in RESULT a second time.
      if (isSalaryTransaction(tx)) {
        if (scope !== "DOCTOR" || isTeamPlaceholderId || !resolvedSelectedDoctor?.name) {
          console.error("[CashFlowAllocation] Salary transaction must target one doctor", {
            transactionId: tx.id, doctorId, doctorName: tx.doctorName || null
          });
          return;
        }
        const key = matrixKey(resolvedSelectedDoctor);
        salaryByDoctor[key] = (salaryByDoctor[key] || 0) + Math.abs(rawAmount);
        return;
      }

      // Individual transactions must never silently fall through to team allocation.
      if (scope === "DOCTOR") {
        if (isTeamPlaceholderId || !resolvedSelectedDoctor?.name) {
          console.error("[CashFlowAllocation] Individual transaction has an unresolved doctor ID", {
            transactionId: tx.id,
            closingId: tx.closingId,
            doctorId,
            doctorName: tx.doctorName || null,
            typeId,
            typeName: tx.typeName || null
          });
          return;
        }
        addAllocation(matrixKey(resolvedSelectedDoctor), amount, tx);
        return;
      }

      const isTeamRate = ["TEAM", "TEAM_HEART", "EQUIPE", "EQUIPE_HEART", "HEART_TEAM", "RATEIO_EQUIPE"].includes(scope)
        || ["HEART_EQUIPE", "EQUIPE"].includes(doctorId.toUpperCase());
      const eligible = isTeamRate ? team : allDoctors;
      if (!eligible.length) return;

      const method = getEffectiveRateioMethod(tx);
      // Never run general-PROP transactions through the legacy team/Heart weights.
      // Check the persisted snapshot directly as well as the resolved catalog rule.
      const savedMethod = normalizeRateioMethod(tx.rateioMethod);
      const apiMethod = normalizeRateioMethod(tx.allocationMethod);
      if (savedMethod === "PROP_GERAL" || apiMethod === "PROP_GERAL" || method === "PROP_GERAL") return;
      // Team expenses configured for PROPORCAO_HEART are allocated later, after
      // the matrix's actual "Proporção Heart" column has been calculated.
      if (!isCredit && method === "PROPORCAO_HEART") return;
      const nominalWeight = (d: any) => Math.max(0, Number(d.teamSharePercent) || 0);
      const heartWeight = (d: any) => Math.max(0, Number(d.proporcaoHeartDinamica) || 0);
      // Prop Heart can be zero on older/uninitialized settings. Use it when configured;
      // otherwise fall back to nominal percentages so a valid team transaction is not lost.
      const heartTotal = eligible.reduce((sum: number, d: any) => sum + heartWeight(d), 0);
      const nominalTotal = eligible.reduce((sum: number, d: any) => sum + nominalWeight(d), 0);
      const useHeart = method !== "NOMINAL" && heartTotal > 0;
      const weight = (d: any) => useHeart ? heartWeight(d) : nominalWeight(d);
      const totalWeight = useHeart ? heartTotal : nominalTotal;
      if (totalWeight <= 0) return;

      // Cent-safe allocation: the last eligible doctor receives any rounding remainder.
      const weightedDoctors = eligible.filter((d: any) => weight(d) > 0);
      let allocatedSoFar = 0;
      weightedDoctors.forEach((d: any, index: number) => {
        const allocated = index === weightedDoctors.length - 1
          ? Math.round((amount - allocatedSoFar) * 100) / 100
          : Math.round((amount * weight(d) / totalWeight) * 100) / 100;
        allocatedSoFar += allocated;
        addAllocation(matrixKey(d), allocated, tx);
      });
    });
    return { incomingByDoctor, incomingTransactionsByDoctor, unimedPlantaoByDoctor, expenseByDoctorType, salaryByDoctor, matrixAdjustmentByDoctor };
  }, [details?.transactions, details?.transactionTypes, configuredDoctors, doctors]);

  // Calculate sum of team percentages
  const teamSumPercent = configuredDoctors
    .filter(d => d.isTeamMember)
    .reduce((acc, d) => acc + (Number(d.teamSharePercent) || 0), 0);

  // Excel master dataset linked dynamically with imported closing details (zero fallback if no closing)
  const hasClosing = Boolean(details?.closing);
  const closingProd = Number(details?.closing?.totalProduction || details?.closing?.processedValue || 0);
  const closingTaxes = Number(details?.closing?.totalTaxes || details?.closing?.taxValue || 0);
  const closingDebits = Number(details?.closing?.totalOtherDebits || details?.closing?.otherDebits || 0);
  const closingNet = Number(details?.closing?.totalNet || details?.closing?.netValue || 0);

  // UNIMED: aggregate only imported financial_production records already mapped by doctorId.
  const { doctorsAggregated, totalUnimedTT, totalUnimedDS, pendingRecords } = React.useMemo(() => {
    const productionRecords = production;
    const aggr = new Map<string, any>();
    const pending: any[] = [];

    const loteRows = (Array.isArray(details?.taxes) ? details.taxes : [])
      .filter((item: any) => item.bruto !== undefined && item.liquido !== undefined);
    // When a lot row exists, bruto already represents the reconciled VL NOTA (production plus eligible occurrences less itemized glosas).
    // Do not add operational/film again because they are already included in the imported production total.
    // Recalcular VL NOTA usando os mesmos lançamentos PDF que alimentam a tabela
    // consolidada de lotes. Os campos totalNota/vlNotaCalculado vindos do backend
    // podem estar antigos e conter apenas o Bruto CSV.
    const normalizeLotLabel = (value: any) => String(value || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase().replace(/\s+/g, " ");
    const normalizeLotKey = (value: any) => String(value ?? "").trim().replace(/\.0$/, "");
    const allLotTransactions = Array.isArray(details?.transactions) ? details.transactions : [];
    const lotProductionBase = loteRows.reduce((sum: number, item: any) => {
      const lotNumber = normalizeLotKey(item.lote ?? item.batchNumber ?? item.id);
      const rowImportId = String(item.importId || "").trim();
      const hasTransactionsForRowImport = Boolean(rowImportId) && allLotTransactions.some((tx: any) =>
        String(tx.importId || "").trim() === rowImportId && String(tx.source || "").toUpperCase().includes("PDF")
      );
      const linkedPdfTransactions = allLotTransactions.filter((tx: any) => {
        const source = String(tx.source || "").trim().toUpperCase();
        const transactionImportId = String(tx.importId || "").trim();
        const transactionLot = normalizeLotKey(tx.lote ?? tx.loteNumber ?? tx.batchNumber ?? tx.batch);
        const linkedToRow = hasTransactionsForRowImport
          ? transactionImportId === rowImportId
          : transactionLot === lotNumber;
        return linkedToRow && source !== "MANUAL" && (source.includes("PDF") || Boolean(transactionImportId));
      });
      const allowedPositiveTypes = /^(?:DISPONIBILIDADE(?: MEDICA)?(?: -)? (?:REUMATOLOGIA|GINECOLOGIA(?: - CENTRO OBSTETRICO)?|UTI)|SOBREAVISOS?|REMUNERACAO BONIFICACAO PARTO NORMAL)(?: \(PLANTAO INDIVIDUAL\))?$/;
      const credits = linkedPdfTransactions.filter((tx: any) => {
        const label = normalizeLotLabel(tx.typeName || tx.observation || tx.description);
        const amount = Number(tx.amount) || 0;
        return (String(tx.nature || "").toUpperCase() === "CREDIT" || amount > 0) && allowedPositiveTypes.test(label);
      }).reduce((total: number, tx: any) => total + Math.abs(Number(tx.amount) || 0), 0);
      const glosas = linkedPdfTransactions.filter((tx: any) =>
        /GLOSAS.*CLINICA COOPERADA/.test(normalizeLotLabel(tx.typeName || tx.observation || tx.description))
      ).reduce((total: number, tx: any) => total + Math.abs(Number(tx.amount) || 0), 0);
      const bruto = Number(item.producaoCsv ?? item.bruto) || 0;
      const totalNota = linkedPdfTransactions.length
        ? Math.round((bruto + credits - glosas) * 100) / 100
        : Number(item.totalNota ?? item.vlNotaCalculado ?? item.bruto) || 0;
      return sum + totalNota;
    }, 0);
    const productionBase = lotProductionBase > 0 ? lotProductionBase : productionRecords.reduce((sum: number, item: any) => sum + (Number(item.honorValue) || 0) + (Number(item.operationalValue) || 0) + (Number(item.filmValue) || 0), 0);
    const irrfTotal = Math.round(productionBase * noteSettings.irrfPercent) / 100;
    const pisTotal = Math.round(productionBase * noteSettings.pisPercent) / 100;
    const cofinsTotal = Math.round(productionBase * noteSettings.cofinsPercent) / 100;
    const csllTotal = Math.round(productionBase * noteSettings.csllPercent) / 100;
    const taxesTotal = irrfTotal + pisTotal + cofinsTotal + csllTotal;
    const presumedProfitTotal = Math.round(productionBase * noteSettings.lucroPresumidoPercent) / 100;
    const irpjTotal = Math.max(0, Math.round((presumedProfitTotal * noteSettings.irpjPercent / 100 - irrfTotal) * 100) / 100);
    const csll9Total = Math.max(0, Math.round((presumedProfitTotal * noteSettings.csll9Percent / 100 - csllTotal) * 100) / 100);
    const additionalTotal = Math.round(presumedProfitTotal * noteSettings.adicional10Percent) / 100;
    const reserveTotal = irpjTotal + csll9Total + additionalTotal;
    const retentionTotal = Math.round((taxesTotal + reserveTotal * noteSettings.reservaRetencaoPercent / 100) * 100) / 100;
    const cotaParte = Number(noteSettings.cotaParte);
    const internalDSTotal = Math.max(0, Math.round((productionBase - cotaParte - noteSettings.otherDeductions - retentionTotal - reserveTotal) * 100) / 100);

    productionRecords.forEach((p: any) => {
      if (p.allocationStatus === "PENDING_REVIEW" || !p.doctorId) {
        pending.push(p);
        return;
      }
      if (!aggr.has(p.doctorId)) {
        aggr.set(p.doctorId, {
          doctorId: p.doctorId,
          doctorName: p.doctorName || "Médico",
          honorTT: 0,
          glosa: 0,
          operationalTT: 0,
          filmTT: 0,
          plantaoTT: 0,
          plantaoDS: 0
        });
      }
      const entry = aggr.get(p.doctorId);
      entry.honorTT += Number(p.honorValue) || 0;
      entry.operationalTT += Number(p.operationalValue) || 0;
      entry.filmTT += Number(p.filmValue) || 0;
    });

    if (Array.isArray(details?.glosas)) {
      details.glosas.forEach((g: any) => {
        if (!g.doctorId || !aggr.has(g.doctorId)) return;
        aggr.get(g.doctorId).glosa += Number(g.glosaValue) || 0;
      });
    }

    let totalTT = 0;
    let totalDS = 0;
    const processedDoctors = Array.from(aggr.values()).map(d => {
      const man = manualEntradas[d.doctorId] || {};
      const docConfig = configuredDoctors.find(c => c.key === d.doctorId);
      const isTeam = Boolean(docConfig?.isTeamMember);
      const percent = Number(docConfig?.teamSharePercent) || 0;
      const honorTT = Number(d.honorTT) || 0;
      const honorDS = Math.max(0, honorTT - (Number(d.glosa) || 0));
      const plantaoTT = Number(man.plantaoTT) || 0;
      const plantaoDS = Number(man.plantaoDS) || 0;
      const vlNotaTT = honorTT + (Number(d.operationalTT) || 0) + d.filmTT + plantaoTT;
      const doctorProduction = honorTT + (Number(d.operationalTT) || 0) + (Number(d.filmTT) || 0);
      const allocatedNoteDS = productionBase > 0 ? (doctorProduction / productionBase) * internalDSTotal : (isTeam ? honorDS : honorTT) + d.filmTT;
      const dispDS = Math.round((allocatedNoteDS + plantaoDS) * 100) / 100;

      totalTT += vlNotaTT;
      totalDS += dispDS;

      return { ...d, isTeam, percent, honorDS, plantaoTT, plantaoDS, vlNotaTT, dispDS };
    });

    return {
      doctorsAggregated: processedDoctors,
      // VL NOTA includes all Unimed notes, including manual notes without doctor production rows.
      totalUnimedTT: productionBase,
      totalUnimedDS: totalDS,
      pendingRecords: pending
    };
  }, [production, details?.glosas, details?.taxes, details?.transactions, manualEntradas, configuredDoctors, noteSettings]);

  const excelData = React.useMemo(() => ({
    monthKey: details?.closing?.monthKey || "FECHAMENTO",
    totals: {
      entradasGerais: totalUnimedTT,
      saldoFinal: totalUnimedDS
    },
    fechamentoMedicos: doctorsAggregated.map(d => ({
        nome: d.doctorName || "Médico não identificado",
        key: d.doctorId || "",
        isTeamMember: Boolean(d.isTeam),
        producao: Number(d.honorTT) || 0,
        entradas: Number(d.plantaoTT) || 0,
        saidas: Number(d.glosa) || 0,
        liquidoCalculado: Number(d.honorDS) || 0,
        // Campos usados pela visualização de colunas. Não há rateio de lucros
        // calculado neste resumo; manter zero evita quebrar a tela com dados antigos.
        divisaoLucros: 0,
        finalGeral: Number(d.dispDS) || 0,
        detalhesEntradas: [],
        detalhesSaidas: []
    })),
    ocorrencias: (Array.isArray(details?.transactions) ? details.transactions : []).map((tx: any) => ({
      ...tx,
      lote: String(tx.lote || tx.loteNumber || tx.batchNumber || tx.batch || ""),
      medico: tx.doctorName || (tx.scope === "TEAM" ? "HEART CIRURGIA CARDIOVASCULAR" : "Médico não identificado"),
      tipo: tx.typeName || tx.typeId || "Ocorrência",
      desc: tx.observation || tx.description || "",
      natureza: tx.nature === "CREDIT" ? "ENTRADA" : "SAIDA",
      valor: Math.abs(Number(tx.amount) || 0)
    })),
    lotesUnimed: (Array.isArray(details?.taxes) ? details.taxes : [])
      .filter((item: any) => item.lote !== undefined && item.bruto !== undefined)
      .map((item: any) => {
        const lotNumber = String(item.lote || item.batchNumber || item.id || "");
        const normalizeOccurrence = (value: any) => String(value || "")
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase().replace(/\s+/g, " ");
        const normalizeLotNumber = (value: any) => String(value ?? "").trim().replace(/\.0$/, "");
        const rowImportId = String(item.importId || "").trim();
        const allTransactions = Array.isArray(details?.transactions) ? details.transactions : [];
        const hasTransactionsForRowImport = Boolean(rowImportId) && allTransactions.some((tx: any) =>
          String(tx.importId || "").trim() === rowImportId && String(tx.source || "").toUpperCase().includes("PDF")
        );
        // Preferir a importação exata quando ela tem ocorrências. Em registros
        // antigos/linhas CSV, cruzar pelo lote como fallback. Excluir lançamentos manuais.
        const pdfTransactions = allTransactions.filter((tx: any) => {
          const transactionLot = normalizeLotNumber(tx.lote ?? tx.loteNumber ?? tx.batchNumber ?? tx.batch);
          const transactionImportId = String(tx.importId || "").trim();
          const source = String(tx.source || "").trim().toUpperCase();
          const isImportedPdf = source.includes("PDF") || Boolean(transactionImportId);
          const matchesImport = Boolean(rowImportId) && transactionImportId === rowImportId;
          const matchesLot = transactionLot === normalizeLotNumber(lotNumber);
          const linkedToRow = hasTransactionsForRowImport ? matchesImport : matchesLot;
          return linkedToRow && source !== "MANUAL" && isImportedPdf;
        });
        const allowedPositiveTypes = /^(?:DISPONIBILIDADE(?: MEDICA)?(?: -)? (?:REUMATOLOGIA|GINECOLOGIA(?: - CENTRO OBSTETRICO)?|UTI)|SOBREAVISOS?|REMUNERACAO BONIFICACAO PARTO NORMAL)(?: \(PLANTAO INDIVIDUAL\))?$/;
        const eligibleCredits = pdfTransactions.filter((tx: any) => {
          const label = normalizeOccurrence(tx.typeName || tx.observation || tx.description);
          const amount = Number(tx.amount) || 0;
          const isCredit = String(tx.nature || "").toUpperCase() === "CREDIT" || amount > 0;
          return isCredit && allowedPositiveTypes.test(label);
        }).reduce((sum: number, tx: any) => sum + Math.abs(Number(tx.amount) || 0), 0);
        const itemizedGlosas = pdfTransactions.filter((tx: any) =>
          /GLOSAS.*CLINICA COOPERADA/.test(normalizeOccurrence(tx.typeName || tx.observation))
        ).reduce((sum: number, tx: any) => sum + Math.abs(Number(tx.amount) || 0), 0);
        const storedOtherValues = Number(item.outrosValores ?? ((Number(item.vlNotaCalculado ?? item.bruto) || 0) - (Number(item.producaoCsv ?? item.bruto) || 0))) || 0;
        const computedOtherValues = pdfTransactions.length
          ? Math.round((eligibleCredits - itemizedGlosas) * 100) / 100
          : storedOtherValues;
        const lotGross = Number(item.producaoCsv ?? item.bruto) || 0;
        const lotTotal = pdfTransactions.length
          ? Math.round((lotGross + computedOtherValues) * 100) / 100
          : Number(item.totalNota ?? item.vlNotaCalculado ?? item.bruto) || 0;
        return ({
        ...item,
        lote: lotNumber,
        competencia: item.competencia || "",
        tipo: item.tipo || item.demonstrativo || "",
        titulo: item.titulo || "",
        vencimento: item.vencimento || "",
        bruto: lotGross,
        outrosValores: computedOtherValues,
        totalNota: lotTotal,
        glosa: Number(item.glosa) || 0,
        aliquotas: {
          pis: Number(loteAliquotas[String(item.lote || item.batchNumber || item.id || "")]?.pis ?? noteSettings.pisPercent),
          cofins: Number(loteAliquotas[String(item.lote || item.batchNumber || item.id || "")]?.cofins ?? noteSettings.cofinsPercent),
          csll: Number(loteAliquotas[String(item.lote || item.batchNumber || item.id || "")]?.csll ?? noteSettings.csllPercent),
          irrf: Number(loteAliquotas[String(item.lote || item.batchNumber || item.id || "")]?.irrf ?? noteSettings.irrfPercent),
          iss: Number(loteAliquotas[String(item.lote || item.batchNumber || item.id || "")]?.iss ?? 5),
          lucroPresumido: Number(loteAliquotas[String(item.lote || item.batchNumber || item.id || "")]?.lucroPresumido ?? noteSettings.lucroPresumidoPercent),
          irpj: Number(loteAliquotas[String(item.lote || item.batchNumber || item.id || "")]?.irpj ?? noteSettings.irpjPercent),
          csll9: Number(loteAliquotas[String(item.lote || item.batchNumber || item.id || "")]?.csll9 ?? noteSettings.csll9Percent),
          adicional: Number(loteAliquotas[String(item.lote || item.batchNumber || item.id || "")]?.adicional ?? noteSettings.adicional10Percent)
        },
        pis: Math.round((lotTotal) * Number(loteAliquotas[String(item.lote || item.batchNumber || item.id || "")]?.pis ?? noteSettings.pisPercent)) / 100,
        cofins: Math.round((lotTotal) * Number(loteAliquotas[String(item.lote || item.batchNumber || item.id || "")]?.cofins ?? noteSettings.cofinsPercent)) / 100,
        csll: Math.round((lotTotal) * Number(loteAliquotas[String(item.lote || item.batchNumber || item.id || "")]?.csll ?? noteSettings.csllPercent)) / 100,
        irrf: Math.round((lotTotal) * Number(loteAliquotas[String(item.lote || item.batchNumber || item.id || "")]?.irrf ?? noteSettings.irrfPercent)) / 100,
        iss: Math.round((lotTotal) * Number(loteAliquotas[String(item.lote || item.batchNumber || item.id || "")]?.iss ?? 5)) / 100,
        ttImpostosNota: 0,
        ttRetencao: 0,
        lucroPresumido: Math.round((lotTotal) * Number(loteAliquotas[String(item.lote || item.batchNumber || item.id || "")]?.lucroPresumido ?? noteSettings.lucroPresumidoPercent)) / 100,
        irpj: 0,
        csll9: 0,
        add10: 0,
        reservaImposto: 0,
        liquido: Number(item.netReported ?? item.liquido) || 0,
        dsSaque: 0
      });
      }).map((lote: any) => {
        const money = (value: number) => Math.round(value * 100) / 100;
        lote.ttImpostosNota = money(lote.pis + lote.cofins + lote.csll + lote.irrf);
        lote.ttRetencao = money(lote.ttImpostosNota + lote.iss);
        lote.irpj = Math.max(0, money(lote.lucroPresumido * lote.aliquotas.irpj / 100 - lote.irrf));
        lote.csll9 = Math.max(0, money(lote.lucroPresumido * lote.aliquotas.csll9 / 100 - lote.csll));
        lote.add10 = money(lote.lucroPresumido * lote.aliquotas.adicional / 100);
        lote.reservaImposto = money(lote.irpj + lote.csll9 + lote.add10);
        // DS de saque é calculado somente pelo bruto menos retenções e reserva de impostos.
        lote.dsSaque = money(lote.totalNota - lote.ttRetencao - lote.reservaImposto);
        return lote;
      }),
    despesasEquipe: (Array.isArray(details?.transactions) ? details.transactions : []).filter((t: any) => t.nature === "DEBIT" && t.scope !== "TEAM_SPLIT").map((t: any) => ({ despesa: t.typeName || t.typeId || "Despesa", categoria: t.scope === "DOCTOR" ? "Individual" : "Equipe", valor: Number(t.amount) || 0, status: "Lançado" }))
  }), [doctorsAggregated, totalUnimedTT, totalUnimedDS, details, noteSettings, loteAliquotas]);

  // Filter occurrences
  const filteredOcorrencias = excelData.ocorrencias.filter(o => {
    const matchDoctor = selectedDoctorFilter === "ALL" 
      ? true 
      : selectedDoctorFilter === "HEART"
      ? o.medico.includes("HEART")
      : o.medico.includes(selectedDoctorFilter);
    const matchSearch = searchTerm 
      ? o.tipo.toLowerCase().includes(searchTerm.toLowerCase()) || 
        o.desc.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.medico.toLowerCase().includes(searchTerm.toLowerCase())
      : true;
    return matchDoctor && matchSearch;
  });

  const totalOcorrenciasEntradas = filteredOcorrencias
    .filter(o => o.natureza === "ENTRADA")
    .reduce((acc, o) => acc + o.valor, 0);

  const totalOcorrenciasSaidas = filteredOcorrencias
    .filter(o => o.natureza === "SAIDA")
    .reduce((acc, o) => acc + o.valor, 0);

  // Group doctors by team member status
  const teamDoctors = excelData.fechamentoMedicos.filter(d => {
    const config = configuredDoctors.find(c => c.name === d.nome);
    return config ? config.isTeamMember : d.isTeamMember;
  });

  const nonTeamDoctors = excelData.fechamentoMedicos.filter(d => {
    const config = configuredDoctors.find(c => c.name === d.nome);
    return config ? !config.isTeamMember : !d.isTeamMember;
  });


  // Dados exclusivos da visualização Colunas por Médico. Não altera os cálculos
  // nem os dados persistidos da matriz financeira.
  const moneyLabel = (value: any) => (Number(value) || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const normalizeCardDoctor = (value: any) => String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().toUpperCase().replace(/\s+/g, " ");
  const getDoctorCardMatrixData = (med: any) => {


    const doc = rowsData.find((row: any) => String(row.key) === String(med.key)
      || normalizeCardDoctor(row.name) === normalizeCardDoctor(med.nome));
    const isTeam = Boolean(doc?.isTeam);
    const percent = Number(doc?.percent ?? med.percent) || 0;
    const hasClosing = Boolean(details?.closing);
    const mul = hasClosing ? 1 : 0;
    const doctorsForTotals = rowsData;
    const totalAzPlantaoTT = doctorsForTotals.reduce((sum: number, row: any) =>
      sum + (Number(manualEntradas[row.key]?.azambujaPlantaoTT) || 0), 0) * mul;
    const totalAzPlantaoDS = doctorsForTotals.reduce((sum: number, row: any) => {
      const tt = (Number(manualEntradas[row.key]?.azambujaPlantaoTT) || 0) * mul;
      return sum + (globalEntradas.azambujaTT > 0
        ? Math.round((tt * globalEntradas.azambujaDS / globalEntradas.azambujaTT) * 100) / 100
        : 0);
    }, 0);
    const netAzTT = Math.max(0, (Number(globalEntradas.azambujaTT) || 0) * mul - totalAzPlantaoTT);
    const netAzDS = Math.max(0, (Number(globalEntradas.azambujaDS) || 0) * mul - totalAzPlantaoDS);
    const azPlTT = (Number(manualEntradas[med.key]?.azambujaPlantaoTT) || 0) * mul;
    const azPlDS = globalEntradas.azambujaTT > 0
      ? Math.round((azPlTT * globalEntradas.azambujaDS / globalEntradas.azambujaTT) * 100) / 100
      : 0;
    const azTT = (isTeam ? Math.round(percent / 100 * netAzTT * 100) / 100 : 0) + azPlTT;
    const azDS = (isTeam ? Math.round(percent / 100 * netAzDS * 100) / 100 : 0) + azPlDS;
    const marTT = isTeam ? Math.round(percent / 100 * (Number(globalEntradas.marietaTT) || 0) * 100) / 100 * mul : 0;
    const marDS = isTeam ? Math.round(percent / 100 * (Number(globalEntradas.marietaDS) || 0) * 100) / 100 * mul : 0;
    const doctorAgg = (Array.isArray(doctorsAggregated) ? doctorsAggregated : []).find((item: any) =>
      String(item.doctorId) === String(med.key)
      || normalizeCardDoctor(item.doctorName) === normalizeCardDoctor(med.nome));
    const doctorConfig = configuredDoctors.find((item: any) => String(item.key) === String(med.key))
      || configuredDoctors.find((item: any) => normalizeCardDoctor(item.name) === normalizeCardDoctor(med.nome));
    const unimedParticipants = configuredDoctors.filter((doctor: any) => doctor.participaUnimed === true);
    const sharedRateioTransactions = cashFlowTransactions.filter((tx: any) => isSharedUnimedRateioTransaction(tx));
    const sharedRateioTotal = sharedRateioTransactions.reduce((sum: number, tx: any) => {
      const amount = Number(tx.amount) || 0;
      return sum + (tx.allowNegativeAmount === true ? amount : Math.abs(amount));
    }, 0);
    const participantProduction = unimedParticipants.reduce((sum: number, doctor: any) => {
      const found = (Array.isArray(doctorsAggregated) ? doctorsAggregated : []).find((item: any) =>
        String(item.doctorId) === String(doctor.key)
        || normalizeCardDoctor(item.doctorName) === normalizeCardDoctor(doctor.name));
      return sum + (Number(found?.honorTT) || 0) + (Number(found?.operationalTT) || 0) + (Number(found?.filmTT) || 0);
    }, 0) + sharedRateioTotal;
    const sharedUnimedTT = unimedParticipants.length ? participantProduction / unimedParticipants.length : 0;
    const totalLotsDS = (Array.isArray(excelData.lotesUnimed) ? excelData.lotesUnimed : [])
      .reduce((sum: number, lote: any) => sum + (Number(lote.dsSaque) || 0), 0);
    const unimedDSRatio = Number(totalUnimedTT) > 0 ? totalLotsDS / Number(totalUnimedTT) : 0;
    const prod = Number(doctorAgg?.honorTT) || 0;
    const operational = Number(doctorAgg?.operationalTT) || 0;
    const film = Number(doctorAgg?.filmTT) || 0;
    const participatesUnimed = doctorConfig?.participaUnimed === true;
    const unimedEqTT = isTeam ? (participatesUnimed ? sharedUnimedTT : prod + operational + film) * mul : 0;
    const unimedPartTT = (((!isTeam ? prod + operational + film : 0)
      + (Number(cashFlowAllocation.incomingByDoctor[normalizeCardDoctor(med.nome)]) || 0)) * mul);
    const importedUtiPlantaoTT = Number(cashFlowAllocation.unimedPlantaoByDoctor[normalizeCardDoctor(med.nome)]) || 0;
    const unimPlTT = importedUtiPlantaoTT * mul;
    const unimTotTT = unimedEqTT + unimedPartTT + (isTeam && !participatesUnimed ? operational + film : 0) + unimPlTT;
    const unimTotDS = Math.round(unimTotTT * unimedDSRatio * 100) / 100;
    const consultTT = isTeam ? Math.round(percent / 100 * (Number(globalEntradas.consultorioTT) || 0) * 100) / 100 * mul : 0;
    const consultDS = isTeam ? Math.round(percent / 100 * (Number(globalEntradas.consultorioDS) || 0) * 100) / 100 * mul : 0;
    const dinheiroTT = isTeam ? Math.round(percent / 100 * (Number(globalEntradas.dinheiroTT) || 0) * 100) / 100 * mul : 0;
    const dinheiroDS = isTeam ? Math.round(percent / 100 * (Number(globalEntradas.dinheiroDS) || 0) * 100) / 100 * mul : 0;
    const unimLuisTT = isTeam ? Math.round(percent / 100 * (Number(globalEntradas.unimedLuisTT) || 0) * 100) / 100 * mul : 0;
    const unimLuisDS = isTeam ? Math.round(percent / 100 * (Number(globalEntradas.unimedLuisDS) || 0) * 100) / 100 * mul : 0;

    const incoming = [
      { label: "Azambuja", tt: azTT, ds: azDS },
      { label: "Marieta", tt: marTT, ds: marDS },
      { label: "Unimed", tt: unimTotTT, ds: unimTotDS },
      { label: "Consultório", tt: consultTT, ds: consultDS },
      { label: "Dinheiro", tt: dinheiroTT, ds: dinheiroDS },
      { label: "Unimed Luis", tt: unimLuisTT, ds: unimLuisDS }
    ];
    const totalDS = incoming.reduce((sum, item) => sum + item.ds, 0);
    const dispPeriodo = isTeam ? Math.max(0, totalDS - unimTotDS) : 0;
    const getDispPeriodoForRow = (rowDoc: any) => {
      const rowIsTeam = Boolean(rowDoc?.isTeam);
      if (!rowIsTeam) return 0;
      const rowPct = Number(rowDoc?.percent) || 0;
      const rowManual = manualEntradas[rowDoc.key] || {};
      const rowAzPlTT = (Number(rowManual.azambujaPlantaoTT) || 0) * mul;
      const rowAzPlDS = globalEntradas.azambujaTT > 0
        ? Math.round((rowAzPlTT * globalEntradas.azambujaDS / globalEntradas.azambujaTT) * 100) / 100
        : 0;
      const rowAzDS = Math.round(rowPct / 100 * netAzDS * 100) / 100 + rowAzPlDS;
      const rowMarDS = Math.round(rowPct / 100 * (Number(globalEntradas.marietaDS) || 0) * 100) / 100 * mul;
      const rowAgg = (Array.isArray(doctorsAggregated) ? doctorsAggregated : []).find((item: any) =>
        String(item.doctorId) === String(rowDoc.key)
        || normalizeCardDoctor(item.doctorName) === normalizeCardDoctor(rowDoc.name));
      const rowConfig = configuredDoctors.find((item: any) => String(item.key) === String(rowDoc.key))
        || configuredDoctors.find((item: any) => normalizeCardDoctor(item.name) === normalizeCardDoctor(rowDoc.name));
      const rowParticipatesUnimed = rowConfig?.participaUnimed === true;
      const rowProd = Number(rowAgg?.honorTT) || 0;
      const rowOperational = Number(rowAgg?.operationalTT) || 0;
      const rowFilm = Number(rowAgg?.filmTT) || 0;
      const rowUnimedEqTT = (rowParticipatesUnimed ? sharedUnimedTT : rowProd + rowOperational + rowFilm) * mul;
      const rowUnimedPartTT = ((Number(cashFlowAllocation.incomingByDoctor[normalizeCardDoctor(rowDoc.name)]) || 0) * mul);
      const rowUtiTT = (Number(cashFlowAllocation.unimedPlantaoByDoctor[normalizeCardDoctor(rowDoc.name)]) || 0) * mul;
      const rowUnimedTT = rowUnimedEqTT + rowUnimedPartTT + (rowParticipatesUnimed ? 0 : rowOperational + rowFilm) + rowUtiTT;
      const rowUnimedDS = Math.round(rowUnimedTT * unimedDSRatio * 100) / 100;
      const rowConsultDS = Math.round(rowPct / 100 * (Number(globalEntradas.consultorioDS) || 0) * 100) / 100 * mul;
      const rowDinheiroDS = Math.round(rowPct / 100 * (Number(globalEntradas.dinheiroDS) || 0) * 100) / 100 * mul;
      const rowLuisDS = Math.round(rowPct / 100 * (Number(globalEntradas.unimedLuisDS) || 0) * 100) / 100 * mul;
      return Math.max(0, rowAzDS + rowMarDS + rowUnimedDS + rowConsultDS + rowDinheiroDS + rowLuisDS - rowUnimedDS);
    };
    const totalTeamDisp = rowsData.filter((row: any) => row.isTeam)
      .reduce((sum: number, row: any) => sum + getDispPeriodoForRow(row), 0);
    const heartPercent = isTeam && totalTeamDisp > 0 ? dispPeriodo / totalTeamDisp * 100 : 0;

    const expenses = { ...(cashFlowAllocation.expenseByDoctorType[normalizeCardDoctor(med.nome)] || {}) };
    // Reaplica somente os rateios de despesas da matriz para que o cartão mostre
    // os mesmos valores proporcionais de Heart e PROP Geral, sem alterar lançamentos.
    const heartTransactions = cashFlowTransactions.filter((tx: any) =>
      String(tx.nature || "").toUpperCase() === "DEBIT"
      && String(tx.scope || "TEAM").toUpperCase() !== "DOCTOR"
      && !isSalaryTransaction(tx) && !isMatrixAdjustmentTransaction(tx)
      && getEffectiveRateioMethod(tx) === "PROPORCAO_HEART");
    heartTransactions.forEach((tx: any) => { delete expenses[String(tx.typeId || tx.typeName || "outros")]; });
    heartTransactions.forEach((tx: any) => {
      if (!isTeam) return;
      const amount = tx.allowNegativeAmount === true ? Number(tx.amount) || 0 : Math.max(0, Number(tx.amount) || 0);
      const allocated = Math.round((amount * heartPercent / 100 + Number.EPSILON) * 100) / 100;
      const typeId = String(tx.typeId || tx.typeName || "outros");
      if (allocated !== 0) expenses[typeId] = (Number(expenses[typeId]) || 0) + allocated;
    });
    const propTransactions = cashFlowTransactions.filter((tx: any) =>
      String(tx.nature || "").toUpperCase() === "DEBIT"
      && String(tx.scope || "TEAM").toUpperCase() !== "DOCTOR"
      && !isSalaryTransaction(tx) && getEffectiveRateioMethod(tx) === "PROP_GERAL");
    propTransactions.forEach((tx: any) => { delete expenses[String(tx.typeId || tx.typeName || "outros")]; });
    const totalUnimedForProp = Number(totalUnimedTT) || 0;
    const propPercent = totalUnimedForProp > 0 ? Math.max(0, unimTotTT) / totalUnimedForProp * 100 : 0;
    const participatesGeneral = doctorConfig?.participaRateioGeral === true;
    propTransactions.forEach((tx: any) => {
      if (!participatesGeneral) return;
      const amount = tx.allowNegativeAmount === true ? Number(tx.amount) || 0 : Math.max(0, Number(tx.amount) || 0);
      const allocated = Math.round((amount * propPercent / 100 + Number.EPSILON) * 100) / 100;
      const typeId = String(tx.typeId || tx.typeName || "outros");
      if (allocated !== 0) expenses[typeId] = (Number(expenses[typeId]) || 0) + allocated;
    });
    const expenseRows = displayedExpenseTypes.map((type: any) => ({
      id: type.id,
      label: type.name,
      amount: type.allowNegativeAmount ? Number(expenses[type.id]) || 0 : Math.abs(Number(expenses[type.id]) || 0)
    }));
    const glosaValue = Number(med.saidas) || Number(doctorAgg?.glosa) || 0;
    const salaryAmount = Number(cashFlowAllocation.salaryByDoctor[normalizeCardDoctor(med.nome)]) || 0;
    const adjustment = cashFlowAllocation.matrixAdjustmentByDoctor[normalizeCardDoctor(med.nome)] || {};
    const resultAfterSalary = Math.round((totalDS
      - expenseRows.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0)
      - salaryAmount) * 100) / 100;
    const profitBase = resultAfterSalary + (Number(adjustment.ACERTO_1) || 0) + (Number(adjustment.SOBRE_MES_ANTERIOR) || 0);
    const limit = Math.max(0, Number(doctorConfig?.valorLimite) || 0);
    const divLucros = limit > 0 ? Math.min(profitBase, limit) : profitBase;
    const excedente = limit > 0 ? Math.max(0, Math.round((profitBase - limit) * 100) / 100) : 0;
    const finalization = Math.round((divLucros + excedente + (Number(adjustment.ACERTO_FINAL) || 0)) * 100) / 100;
    return {
      incoming,
      expenses: [...expenseRows, { id: "salary", label: "Salário", amount: salaryAmount }],
      glosa: glosaValue,
      totalTT: incoming.reduce((sum, item) => sum + item.tt, 0),
      totalDS,
      dispPeriodo,
      result: finalization
    };
  };

  const downloadDoctorCardPng = async (med: any, data: any, shareToWhatsApp: boolean) => {
    const width = 900;
    const padding = 42;
    const rowHeight = 54;
    const visibleExpenses = Array.isArray(data.expenses) ? data.expenses : [];
    const entryRows = Array.isArray(data.incoming) ? data.incoming : [];
    const expenseRows = [...visibleExpenses, { id: "glosa", label: "Glosas", amount: Number(data.glosa) || 0 }];
    const height = 370 + Math.max(1, entryRows.length) * rowHeight + Math.max(1, expenseRows.length) * rowHeight + 130;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Não foi possível gerar a imagem PNG neste navegador.");
    const roundedRect = (x: number, y: number, w: number, h: number, radius: number, fill: string, stroke?: string) => {
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.arcTo(x + w, y, x + w, y + h, radius);
      ctx.arcTo(x + w, y + h, x, y + h, radius);
      ctx.arcTo(x, y + h, x, y, radius);
      ctx.arcTo(x, y, x + w, y, radius);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
    };
    const text = (value: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = "left") => {
      ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(value, x, y);
    };
    ctx.fillStyle = "#f1f5f9"; ctx.fillRect(0, 0, width, height);
    roundedRect(padding, padding, width - padding * 2, height - padding * 2, 28, "#ffffff", "#dbe3ed");
    roundedRect(padding, padding, width - padding * 2, 170, 28, "#102b46");
    ctx.fillStyle = "#102b46"; ctx.fillRect(padding, padding + 140, width - padding * 2, 30);
    text("iCare  •  RESUMO FINANCEIRO", padding + 28, padding + 44, "bold 18px Arial", "#93c5fd");
    text(String(med.nome || "Médico").toUpperCase(), padding + 28, padding + 88, "bold 27px Arial", "#ffffff");
    text(String(excelData.monthKey || selectedClosingId || "Fechamento"), padding + 28, padding + 124, "16px Arial", "#dbeafe");
    let y = padding + 210;
    text("ENTRADAS", padding + 28, y, "bold 17px Arial", "#047857");
    y += 25;
    entryRows.forEach((item: any) => {
      roundedRect(padding + 20, y, width - padding * 2 - 40, rowHeight - 7, 10, "#f0fdf4");
      text(item.label, padding + 36, y + 23, "bold 17px Arial", "#14532d");
      text("TT  R$ " + moneyLabel(item.tt), width - padding - 35, y + 18, "14px Arial", "#64748b", "right");
      text("DS  R$ " + moneyLabel(item.ds), width - padding - 35, y + 37, "bold 15px Arial", "#047857", "right");
      y += rowHeight;
    });
    if (!entryRows.length) {
      text("Nenhuma entrada com valor neste fechamento.", padding + 30, y + 18, "15px Arial", "#64748b");
      y += rowHeight;
    }
    y += 12;
    text("SAÍDAS", padding + 28, y, "bold 17px Arial", "#be123c");
    y += 25;
    expenseRows.forEach((item: any) => {
      roundedRect(padding + 20, y, width - padding * 2 - 40, rowHeight - 7, 10, "#fff1f2");
      text(item.label, padding + 36, y + 27, "bold 16px Arial", "#881337");
      text("- R$ " + moneyLabel(item.amount), width - padding - 35, y + 27, "bold 16px Arial", "#be123c", "right");
      y += rowHeight;
    });
    if (!expenseRows.length) {
      text("Nenhuma saída com valor neste fechamento.", padding + 30, y + 18, "15px Arial", "#64748b");
      y += rowHeight;
    }
    y += 12;
    roundedRect(padding + 20, y, width - padding * 2 - 40, 78, 16, "#e0f2fe", "#bae6fd");
    text("VALOR FINAL", padding + 38, y + 31, "bold 15px Arial", "#075985");
    text("R$ " + moneyLabel(data.result), width - padding - 38, y + 49, "bold 25px Arial", "#0c4a6e", "right");
    y += 96;
    text("Gerado pelo iCare", width / 2, y + 4, "12px Arial", "#94a3b8", "center");

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(result => result ? resolve(result) : reject(new Error("Falha ao criar o arquivo PNG.")), "image/png");
    });
    const safeName = String(med.nome || "medico").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "medico";
    const file = new File([blob], "icare-" + safeName + ".png", { type: "image/png" });
    if (shareToWhatsApp && typeof navigator !== "undefined" && typeof (navigator as any).share === "function"
      && typeof (navigator as any).canShare === "function" && (navigator as any).canShare({ files: [file] })) {
      await (navigator as any).share({ files: [file], title: "Resumo financeiro • " + med.nome, text: "Resumo financeiro de " + med.nome + " • " + excelData.monthKey });
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    if (shareToWhatsApp) {
      const message = "Resumo financeiro de " + med.nome + " • " + excelData.monthKey + ". Anexe a imagem PNG que acabou de ser baixada.";
      window.open("https://wa.me/?text=" + encodeURIComponent(message), "_blank", "noopener,noreferrer");
    }
  };

  if (!activeGroup) return <div className="p-8 text-center text-gray-500">Grupo não selecionado.</div>;

  return (
    <div className="space-y-6 max-w-[1700px] mx-auto pb-20 font-sans">
      {/* Top Banner / Excel Dashboard Title */}
      <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white p-7 lg:p-9 rounded-[36px] shadow-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative overflow-hidden border border-emerald-800/40">
        <div className="space-y-3 z-10">
          <div className="flex flex-wrap items-center gap-3">
            <span className="px-3.5 py-1 bg-emerald-500/25 border border-emerald-400/40 text-emerald-200 text-xs font-black uppercase tracking-widest rounded-full flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              PLANILHA MESTRA • FECHAMENTO {excelData.monthKey}
            </span>
            <span className="px-3 py-1 bg-white/10 text-white/90 text-xs font-bold rounded-full">
              Rateio Diferenciado: Equipe vs. Cooperados
            </span>
          </div>
          <div>
            <h2 className="text-2xl lg:text-3xl font-black tracking-tight uppercase flex items-center gap-3">
              <span>Dashboard Financeiro & Rateios HeaRT</span>
            </h2>
            <p className="text-xs text-emerald-100/80 font-medium max-w-3xl mt-1">
              Controle de rateio para <b>membros da equipe</b> (Rochele, Thais, Luis, Kathize) e <b>cooperados parceiros</b> (Thaynara, Tamara, Maria Eduarda, Camila, Luan) conforme a planilha Google Sheets.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 z-10">
          {/* Closing Month Selector */}
          <div className="bg-black/30 backdrop-blur-md border border-white/20 rounded-2xl px-3 py-2 flex items-center gap-2 text-xs">
            <Calendar size={14} className="text-emerald-300" />
            <select
              value={selectedClosingId || ""}
              onChange={e => setSelectedClosingId(e.target.value)}
              className="bg-transparent text-white font-bold outline-none cursor-pointer pr-2"
            >
              {closings.length > 0 ? (
                closings.map(c => (
                  <option key={c.id} value={c.id} className="text-gray-900 bg-white">
                    {c.monthKey} ({c.status || "CONCILIADO"})
                  </option>
                ))
              ) : (
                <option value="" className="text-gray-900 bg-white">SETEMBRO-26</option>
              )}
            </select>
          </div>

          <button
            onClick={() => {
              if (onOpenImport) {
                onOpenImport();
              } else {
                setIsImportModalOpen(true);
              }
            }}
            className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white px-4 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider transition border border-emerald-300/40 cursor-pointer shadow-lg shadow-emerald-500/25 active:scale-95"
          >
            <Sparkles size={15} className="text-amber-300" />
            <span>Importar PDF com IA</span>
          </button>

          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider transition border border-white/20 cursor-pointer shadow-sm active:scale-95"
          >
            <Download size={15} />
            <span>Exportar PDF</span>
          </button>
        </div>
      </div>

      {/* Top Metrics Cards matching Excel summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <MetricCard 
          label="Entradas Totais" 
          value={excelData.totals.entradasGerais} 
          color="text-emerald-600" 
          bg="bg-emerald-50/50" 
          sub="Produção & Plantões"
        />
        <MetricCard 
          label="Disponível Saque" 
          value={excelData.totals.totalRecebimentos} 
          color="text-indigo-600" 
          bg="bg-indigo-50/50" 
          sub="Recebimentos Brutos"
        />
        <MetricCard 
          label="Total Saídas" 
          value={excelData.totals.totalSaidas} 
          isNegative 
          color="text-rose-600" 
          bg="bg-rose-50/50" 
          sub="Operacional + Outras"
        />
        <MetricCard 
          label="Reserva Impostos" 
          value={excelData.totals.totalReservadoImpostos} 
          color="text-amber-600" 
          bg="bg-amber-50/50" 
          sub="Tributos retidos"
        />
        <MetricCard 
          label="Distribuído Médicos" 
          value={excelData.totals.totalDistribuicao} 
          color="text-blue-600" 
          bg="bg-blue-50/50" 
          isHighlight
          sub="Salários da Equipe"
        />
        <MetricCard 
          label="Saldo Final Caixa" 
          value={excelData.totals.saldoFinal} 
          color="text-emerald-700" 
          bg="bg-emerald-50/60" 
          sub="Sobra em Caixa"
        />
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-gray-200 text-xs font-black uppercase tracking-wider">
        <button
          onClick={() => setActiveSubTab("visao_geral")}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl transition cursor-pointer shrink-0 ${
            activeSubTab === "visao_geral"
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
              : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
          }`}
        >
          <TableProperties size={16} />
          <span>1. Mapa de Rateio e Salários</span>
        </button>

        <button
          onClick={() => setActiveSubTab("descritivo_pagamentos")}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl transition cursor-pointer shrink-0 ${
            activeSubTab === "descritivo_pagamentos"
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
              : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
          }`}
        >
          <FileText size={16} />
          <span>Descritivo de Pagamentos</span>
        </button>

        <button
          onClick={() => setActiveSubTab("matriz_entradas")}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl transition cursor-pointer shrink-0 ${
            activeSubTab === "matriz_entradas"
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
              : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
          }`}
        >
          <DollarSign size={16} />
          <span>Matriz de Entradas (TT & DS)</span>
        </button>

        <button
          onClick={() => setActiveSubTab("colunas_medicos")}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl transition cursor-pointer shrink-0 ${
            activeSubTab === "colunas_medicos"
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
              : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
          }`}
        >
          <Users size={16} />
          <span>3. Colunas por Médico (Excel View)</span>
        </button>

        <button
          onClick={() => setActiveSubTab("ocorrencias_fluxo")}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl transition cursor-pointer shrink-0 ${
            activeSubTab === "ocorrencias_fluxo"
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
              : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
          }`}
        >
          <Wallet size={16} />
          <span>4. Ocorrências no Fluxo ({excelData.ocorrencias.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab("entradas_fontes")}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl transition cursor-pointer shrink-0 ${
            activeSubTab === "entradas_fontes"
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
              : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
          }`}
        >
          <Building2 size={16} />
          <span>5. Fontes (Azambuja, Marieta, Unimed)</span>
        </button>

        <button
          onClick={() => setActiveSubTab("lotes_unimed")}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl transition cursor-pointer shrink-0 ${
            activeSubTab === "lotes_unimed"
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
              : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
          }`}
        >
          <Receipt size={16} />
          <span>6. Lotes & Retenções Unimed</span>
        </button>

        <button
          onClick={() => setActiveSubTab("glosas")}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl transition cursor-pointer shrink-0 ${
            activeSubTab === "glosas"
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
              : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
          }`}
        >
          <ShieldCheck size={16} />
          <span>Glosas</span>
        </button>

        <button
          onClick={() => setActiveSubTab("despesas_equipe")}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl transition cursor-pointer shrink-0 ${
            activeSubTab === "despesas_equipe"
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
              : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
          }`}
        >
          <FileText size={16} />
          <span>7. Despesas Equipe Heart</span>
        </button>

        <button
          onClick={() => setActiveSubTab("config_prestadores")}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl transition cursor-pointer shrink-0 ${
            activeSubTab === "config_prestadores"
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
              : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
          }`}
        >
          <UserCheck size={16} />
          <span>Prestadores</span>
        </button>

        <button
          onClick={() => setActiveSubTab("lancamentos_importados")}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl transition cursor-pointer shrink-0 ${
            activeSubTab === "lancamentos_importados"
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
              : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
          }`}
        >
          <UploadCloud size={16} />
          <span>9. Lançamentos Importados</span>
        </button>

        <button
          onClick={() => setActiveSubTab("tipos_lancamento")}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl transition cursor-pointer shrink-0 ${
            activeSubTab === "tipos_lancamento"
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
              : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
          }`}
        >
          <Tag size={16} />
          <span>8. Tipos de Lançamento (Pré-preenchimento)</span>
        </button>
      </div>

      {/* VIEW: MATRIZ DE ENTRADAS (TT & DS) */}
      {(activeSubTab === "matriz_entradas" || activeSubTab === "descritivo_pagamentos") && (
        <div className={activeSubTab === "descritivo_pagamentos" ? "hidden" : "space-y-6"}>
          <div className="bg-white rounded-[32px] border border-gray-300 shadow-xl overflow-hidden p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-gray-300">
              <div>
                <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Matriz de Entradas — Totais (TT) e Disponíveis para Saque (DS)</h3>
                <p className="text-xs text-gray-500">Visualização detalhada por médico e fonte. Os campos com fundo <span className="bg-blue-100 text-blue-900 px-1.5 py-0.5 rounded font-bold">azul</span> são editáveis manualmente para lançamentos de plantão. Os valores são salvos ao sair do campo.</p>
              </div>
              {manualEntrySaveMessage && <p className={`text-xs font-semibold ${manualEntrySaveMessage.startsWith("Falha") || manualEntrySaveMessage.startsWith("Não foi") ? "text-red-600" : "text-emerald-700"}`}>{manualEntrySaveMessage}</p>}
            </div>

            <div className="overflow-x-auto custom-scrollbar">
              <table className="min-w-max w-full text-[11px] border-collapse text-center [&_tbody_tr>*:nth-child(3)]:border-l-2 [&_tbody_tr>*:nth-child(3)]:border-l-black [&_tfoot_tr>*:nth-child(3)]:border-l-2 [&_tfoot_tr>*:nth-child(3)]:border-l-black [&_thead_tr:nth-child(2)>*:nth-child(3)]:border-l-2 [&_thead_tr:nth-child(2)>*:nth-child(3)]:border-l-black [&_tbody_tr>*:nth-child(9)]:border-l-2 [&_tbody_tr>*:nth-child(9)]:border-l-black [&_tfoot_tr>*:nth-child(9)]:border-l-2 [&_tfoot_tr>*:nth-child(9)]:border-l-black [&_thead_tr:nth-child(2)>*:nth-child(9)]:border-l-2 [&_thead_tr:nth-child(2)>*:nth-child(9)]:border-l-black [&_tbody_tr>*:nth-child(13)]:border-l-2 [&_tbody_tr>*:nth-child(13)]:border-l-black [&_tfoot_tr>*:nth-child(13)]:border-l-2 [&_tfoot_tr>*:nth-child(13)]:border-l-black [&_thead_tr:nth-child(2)>*:nth-child(13)]:border-l-2 [&_thead_tr:nth-child(2)>*:nth-child(13)]:border-l-black [&_tbody_tr>*:nth-child(23)]:border-l-2 [&_tbody_tr>*:nth-child(23)]:border-l-black [&_tfoot_tr>*:nth-child(23)]:border-l-2 [&_tfoot_tr>*:nth-child(23)]:border-l-black [&_thead_tr:nth-child(2)>*:nth-child(23)]:border-l-2 [&_thead_tr:nth-child(2)>*:nth-child(23)]:border-l-black [&_tbody_tr>*:nth-child(25)]:border-l-2 [&_tbody_tr>*:nth-child(25)]:border-l-black [&_tfoot_tr>*:nth-child(25)]:border-l-2 [&_tfoot_tr>*:nth-child(25)]:border-l-black [&_thead_tr:nth-child(2)>*:nth-child(25)]:border-l-2 [&_thead_tr:nth-child(2)>*:nth-child(25)]:border-l-black [&_tbody_tr>*:nth-child(27)]:border-l-2 [&_tbody_tr>*:nth-child(27)]:border-l-black [&_tfoot_tr>*:nth-child(27)]:border-l-2 [&_tfoot_tr>*:nth-child(27)]:border-l-black [&_thead_tr:nth-child(2)>*:nth-child(27)]:border-l-2 [&_thead_tr:nth-child(2)>*:nth-child(27)]:border-l-black [&_tbody_tr>*:nth-child(29)]:border-l-2 [&_tbody_tr>*:nth-child(29)]:border-l-black [&_tfoot_tr>*:nth-child(29)]:border-l-2 [&_tfoot_tr>*:nth-child(29)]:border-l-black [&_thead_tr:nth-child(2)>*:nth-child(29)]:border-l-2 [&_thead_tr:nth-child(2)>*:nth-child(29)]:border-l-black [&_tbody_tr>*:nth-child(8)]:border-r-2 [&_tbody_tr>*:nth-child(8)]:border-r-black [&_tfoot_tr>*:nth-child(8)]:border-r-2 [&_tfoot_tr>*:nth-child(8)]:border-r-black [&_thead_tr:nth-child(2)>*:nth-child(8)]:border-r-2 [&_thead_tr:nth-child(2)>*:nth-child(8)]:border-r-black [&_tbody_tr>*:nth-child(12)]:border-r-2 [&_tbody_tr>*:nth-child(12)]:border-r-black [&_tfoot_tr>*:nth-child(12)]:border-r-2 [&_tfoot_tr>*:nth-child(12)]:border-r-black [&_thead_tr:nth-child(2)>*:nth-child(12)]:border-r-2 [&_thead_tr:nth-child(2)>*:nth-child(12)]:border-r-black [&_tbody_tr>*:nth-child(22)]:border-r-2 [&_tbody_tr>*:nth-child(22)]:border-r-black [&_tfoot_tr>*:nth-child(22)]:border-r-2 [&_tfoot_tr>*:nth-child(22)]:border-r-black [&_thead_tr:nth-child(2)>*:nth-child(22)]:border-r-2 [&_thead_tr:nth-child(2)>*:nth-child(22)]:border-r-black [&_tbody_tr>*:nth-child(24)]:border-r-2 [&_tbody_tr>*:nth-child(24)]:border-r-black [&_tfoot_tr>*:nth-child(24)]:border-r-2 [&_tfoot_tr>*:nth-child(24)]:border-r-black [&_thead_tr:nth-child(2)>*:nth-child(24)]:border-r-2 [&_thead_tr:nth-child(2)>*:nth-child(24)]:border-r-black [&_tbody_tr>*:nth-child(26)]:border-r-2 [&_tbody_tr>*:nth-child(26)]:border-r-black [&_tfoot_tr>*:nth-child(26)]:border-r-2 [&_tfoot_tr>*:nth-child(26)]:border-r-black [&_thead_tr:nth-child(2)>*:nth-child(26)]:border-r-2 [&_thead_tr:nth-child(2)>*:nth-child(26)]:border-r-black [&_tbody_tr>*:nth-child(28)]:border-r-2 [&_tbody_tr>*:nth-child(28)]:border-r-black [&_tfoot_tr>*:nth-child(28)]:border-r-2 [&_tfoot_tr>*:nth-child(28)]:border-r-black [&_thead_tr:nth-child(2)>*:nth-child(28)]:border-r-2 [&_thead_tr:nth-child(2)>*:nth-child(28)]:border-r-black [&_tbody_tr>*:nth-child(32)]:border-r-2 [&_tbody_tr>*:nth-child(32)]:border-r-black [&_tfoot_tr>*:nth-child(32)]:border-r-2 [&_tfoot_tr>*:nth-child(32)]:border-r-black [&_thead_tr:nth-child(2)>*:nth-child(32)]:border-r-2 [&_thead_tr:nth-child(2)>*:nth-child(32)]:border-r-black [&_tbody_tr>*:nth-child(29)]:border-l-2 [&_tbody_tr>*:nth-child(29)]:border-l-black [&_tfoot_tr>*:nth-child(29)]:border-l-2 [&_tfoot_tr>*:nth-child(29)]:border-l-black [&_thead_tr:nth-child(2)>*:nth-child(27)]:border-l-2 [&_thead_tr:nth-child(2)>*:nth-child(27)]:border-l-black [&_tbody_tr>*:nth-child(33)]:border-l-2 [&_tbody_tr>*:nth-child(33)]:border-l-black [&_tfoot_tr>*:nth-child(33)]:border-l-2 [&_tfoot_tr>*:nth-child(33)]:border-l-black [&_thead_tr:nth-child(2)>*:nth-child(31)]:border-l-2 [&_thead_tr:nth-child(2)>*:nth-child(31)]:border-l-black [&_tbody_tr>*:nth-last-child(11)]:border-l-2 [&_tbody_tr>*:nth-last-child(11)]:border-l-black [&_tfoot_tr>*:nth-last-child(11)]:border-l-2 [&_tfoot_tr>*:nth-last-child(11)]:border-l-black [&_tbody_tr>*:nth-last-child(8)]:border-l-2 [&_tbody_tr>*:nth-last-child(8)]:border-l-black [&_tfoot_tr>*:nth-last-child(8)]:border-l-2 [&_tfoot_tr>*:nth-last-child(8)]:border-l-black [&_tbody_tr>*:nth-last-child(5)]:border-l-2 [&_tbody_tr>*:nth-last-child(5)]:border-l-black [&_tfoot_tr>*:nth-last-child(5)]:border-l-2 [&_tfoot_tr>*:nth-last-child(5)]:border-l-black [&_tbody_tr>*:nth-last-child(4)]:border-l-2 [&_tbody_tr>*:nth-last-child(4)]:border-l-black [&_tfoot_tr>*:nth-last-child(4)]:border-l-2 [&_tfoot_tr>*:nth-last-child(4)]:border-l-black [&_thead_tr:first-child>*:nth-child(8)]:border-l-2 [&_thead_tr:first-child>*:nth-child(8)]:border-l-black [&_thead_tr:first-child>*:nth-child(9)]:border-l-2 [&_thead_tr:first-child>*:nth-child(9)]:border-l-black [&_thead_tr:first-child>*:nth-child(10)]:border-l-2 [&_thead_tr:first-child>*:nth-child(10)]:border-l-black [&_tbody_tr>*:nth-last-child(11)]:border-l-2 [&_tbody_tr>*:nth-last-child(11)]:border-l-black [&_tfoot_tr>*:nth-last-child(11)]:border-l-2 [&_tfoot_tr>*:nth-last-child(11)]:border-l-black [&_thead_tr:first-child>*:nth-last-child(11)]:border-l-2 [&_thead_tr:first-child>*:nth-last-child(11)]:border-l-black [&_tbody_tr>*:nth-last-child(10)]:border-l-2 [&_tbody_tr>*:nth-last-child(10)]:border-l-black [&_tfoot_tr>*:nth-last-child(10)]:border-l-2 [&_tfoot_tr>*:nth-last-child(10)]:border-l-black [&_thead_tr:first-child>*:nth-last-child(10)]:border-l-2 [&_thead_tr:first-child>*:nth-last-child(10)]:border-l-black [&_tbody_tr>*:nth-last-child(9)]:border-l-2 [&_tbody_tr>*:nth-last-child(9)]:border-l-black [&_tfoot_tr>*:nth-last-child(9)]:border-l-2 [&_tfoot_tr>*:nth-last-child(9)]:border-l-black [&_thead_tr:first-child>*:nth-last-child(9)]:border-l-2 [&_thead_tr:first-child>*:nth-last-child(9)]:border-l-black [&_tbody_tr>*:nth-last-child(8)]:border-l-2 [&_tbody_tr>*:nth-last-child(8)]:border-l-black [&_tfoot_tr>*:nth-last-child(8)]:border-l-2 [&_tfoot_tr>*:nth-last-child(8)]:border-l-black [&_thead_tr:first-child>*:nth-last-child(8)]:border-l-2 [&_thead_tr:first-child>*:nth-last-child(8)]:border-l-black [&_tbody_tr>*:nth-last-child(7)]:border-l-2 [&_tbody_tr>*:nth-last-child(7)]:border-l-black [&_tfoot_tr>*:nth-last-child(7)]:border-l-2 [&_tfoot_tr>*:nth-last-child(7)]:border-l-black [&_thead_tr:first-child>*:nth-last-child(7)]:border-l-2 [&_thead_tr:first-child>*:nth-last-child(7)]:border-l-black [&_tbody_tr>*:nth-last-child(6)]:border-l-2 [&_tbody_tr>*:nth-last-child(6)]:border-l-black [&_tfoot_tr>*:nth-last-child(6)]:border-l-2 [&_tfoot_tr>*:nth-last-child(6)]:border-l-black [&_thead_tr:first-child>*:nth-last-child(6)]:border-l-2 [&_thead_tr:first-child>*:nth-last-child(6)]:border-l-black [&_tbody_tr>*:nth-last-child(5)]:border-l-2 [&_tbody_tr>*:nth-last-child(5)]:border-l-black [&_tfoot_tr>*:nth-last-child(5)]:border-l-2 [&_tfoot_tr>*:nth-last-child(5)]:border-l-black [&_thead_tr:first-child>*:nth-last-child(5)]:border-l-2 [&_thead_tr:first-child>*:nth-last-child(5)]:border-l-black [&_tbody_tr>*:nth-last-child(4)]:border-l-2 [&_tbody_tr>*:nth-last-child(4)]:border-l-black [&_tfoot_tr>*:nth-last-child(4)]:border-l-2 [&_tfoot_tr>*:nth-last-child(4)]:border-l-black [&_thead_tr:first-child>*:nth-last-child(4)]:border-l-2 [&_thead_tr:first-child>*:nth-last-child(4)]:border-l-black [&_tbody_tr>*:nth-last-child(3)]:border-l-2 [&_tbody_tr>*:nth-last-child(3)]:border-l-black [&_tfoot_tr>*:nth-last-child(3)]:border-l-2 [&_tfoot_tr>*:nth-last-child(3)]:border-l-black [&_thead_tr:first-child>*:nth-last-child(3)]:border-l-2 [&_thead_tr:first-child>*:nth-last-child(3)]:border-l-black [&_tbody_tr>*:nth-last-child(2)]:border-l-2 [&_tbody_tr>*:nth-last-child(2)]:border-l-black [&_tfoot_tr>*:nth-last-child(2)]:border-l-2 [&_tfoot_tr>*:nth-last-child(2)]:border-l-black [&_thead_tr:first-child>*:nth-last-child(2)]:border-l-2 [&_thead_tr:first-child>*:nth-last-child(2)]:border-l-black [&_tbody_tr>*:nth-last-child(1)]:border-l-2 [&_tbody_tr>*:nth-last-child(1)]:border-l-black [&_tfoot_tr>*:nth-last-child(1)]:border-l-2 [&_tfoot_tr>*:nth-last-child(1)]:border-l-black [&_thead_tr:first-child>*:nth-last-child(1)]:border-l-2 [&_thead_tr:first-child>*:nth-last-child(1)]:border-l-black">
                <thead>
                  <tr className="bg-[#1E3A5F] text-white font-black uppercase tracking-wider">
                    <th className="sticky left-0 z-30 p-3 border border-gray-300 text-left pl-4 bg-[#1E3A5F] shadow-[4px_0_6px_-4px_rgba(0,0,0,0.45)]" rowSpan={2}>MÉDICO</th>
                    <th className="p-3 border border-gray-300" rowSpan={2}>% EQUIPE</th>
                    <th className="p-3 border border-gray-300 border-l-[1px] border-l-black border-r-[1px] border-r-black bg-[#254D73]" colSpan={6}>
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-1">
                        <span>AZAMBUJA</span>
                        <div className="flex items-center gap-1.5 bg-[#1E3A5F] px-2 py-1 rounded-lg border border-blue-300/60 font-mono text-[10px]">
                          <span className="text-blue-200 font-bold">TT:</span>
                          <input
                            type="number"
                            value={globalEntradas.azambujaTT || ""}
                            onChange={(e) => setGlobalEntradas({ ...globalEntradas, azambujaTT: parseFloat(e.target.value) || 0 })}
                            onBlur={(e) => void saveGlobalEntryOnBlur("azambujaTT", parseFloat(e.currentTarget.value) || 0)}
                            className="w-20 text-center bg-blue-100 text-blue-950 font-black rounded px-1 py-0.5 outline-none focus:ring-2 focus:ring-blue-400"
                            placeholder="0,00"
                          />
                          <span className="text-blue-200 font-bold ml-1">DS:</span>
                          <input
                            type="number"
                            value={globalEntradas.azambujaDS || ""}
                            onChange={(e) => setGlobalEntradas({ ...globalEntradas, azambujaDS: parseFloat(e.target.value) || 0 })}
                            onBlur={(e) => void saveGlobalEntryOnBlur("azambujaDS", parseFloat(e.currentTarget.value) || 0)}
                            className="w-20 text-center bg-blue-100 text-blue-950 font-black rounded px-1 py-0.5 outline-none focus:ring-2 focus:ring-blue-400"
                            placeholder="0,00"
                          />
                        </div>
                      </div>
                    </th>
                    <th className="p-3 border border-gray-300 border-r-[1px] border-r-black bg-[#315F86]" colSpan={4}>
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-1">
                        <span>MARIETA</span>
                        <div className="flex items-center gap-1.5 bg-[#1E3A5F] px-2 py-1 rounded-lg border border-blue-300/60 font-mono text-[10px]">
                          <span className="text-blue-200 font-bold">TT:</span>
                          <input
                            type="number"
                            value={globalEntradas.marietaTT || ""}
                            onChange={(e) => setGlobalEntradas({ ...globalEntradas, marietaTT: parseFloat(e.target.value) || 0 })}
                            onBlur={(e) => void saveGlobalEntryOnBlur("marietaTT", parseFloat(e.currentTarget.value) || 0)}
                            className="w-20 text-center bg-blue-100 text-blue-950 font-black rounded px-1 py-0.5 outline-none focus:ring-2 focus:ring-blue-400"
                            placeholder="0,00"
                          />
                          <span className="text-blue-200 font-bold ml-1">DS:</span>
                          <input
                            type="number"
                            value={globalEntradas.marietaDS || ""}
                            onChange={(e) => setGlobalEntradas({ ...globalEntradas, marietaDS: parseFloat(e.target.value) || 0 })}
                            onBlur={(e) => void saveGlobalEntryOnBlur("marietaDS", parseFloat(e.currentTarget.value) || 0)}
                            className="w-20 text-center bg-blue-100 text-blue-950 font-black rounded px-1 py-0.5 outline-none focus:ring-2 focus:ring-blue-400"
                            placeholder="0,00"
                          />
                        </div>
                      </div>
                    </th>
                    <th className="p-3 border border-gray-300 border-r-[1px] border-r-black bg-[#254D73]" colSpan={10}>
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-2">
                        <span className="font-black">UNIMED</span>
                        <div className="flex items-center gap-2 bg-[#1E3A5F] px-2.5 py-1 rounded-lg border border-blue-300/60 font-mono text-[10px]">
                          <span className="text-blue-200 font-bold uppercase">VL NOTA:</span>
                          <span className="text-white font-black">{totalUnimedTT.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                          <span className="text-blue-200 font-bold uppercase ml-2">DS:</span>
                          <span className="text-blue-200 font-black">{excelData.lotesUnimed.reduce((sum: number, lote: any) => sum + (Number(lote.dsSaque) || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    </th>
                    <th className="p-3 border border-gray-300 border-r-[1px] border-r-black bg-[#315F86]" colSpan={2}>
                      <div className="flex flex-col items-center justify-center gap-1 px-0">
                        <span>CONSULTÓRIO</span>
                        <div className="flex items-center justify-center gap-1 bg-[#1E3A5F] px-1 py-1 rounded-lg border border-blue-300/60 font-mono text-[10px]">
                          <span className="text-blue-200 font-bold">TT:</span>
                          <input
                            type="number"
                            value={globalEntradas.consultorioTT || ""}
                            onChange={(e) => setGlobalEntradas({ ...globalEntradas, consultorioTT: parseFloat(e.target.value) || 0 })}
                            onBlur={(e) => void saveGlobalEntryOnBlur("consultorioTT", parseFloat(e.currentTarget.value) || 0)}
                            className="w-14 text-center bg-blue-100 text-blue-950 font-black rounded px-1 py-0.5 outline-none focus:ring-2 focus:ring-blue-400"
                            placeholder="0,00"
                          />
                          <span className="text-blue-200 font-bold ml-1">DS:</span>
                          <input
                            type="number"
                            value={globalEntradas.consultorioDS || ""}
                            onChange={(e) => setGlobalEntradas({ ...globalEntradas, consultorioDS: parseFloat(e.target.value) || 0 })}
                            onBlur={(e) => void saveGlobalEntryOnBlur("consultorioDS", parseFloat(e.currentTarget.value) || 0)}
                            className="w-14 text-center bg-blue-100 text-blue-950 font-black rounded px-1 py-0.5 outline-none focus:ring-2 focus:ring-blue-400"
                            placeholder="0,00"
                          />
                        </div>
                      </div>
                    </th>
                    <th className="p-3 border border-gray-300 border-r-[1px] border-r-black bg-[#254D73]" colSpan={2}>
                      <div className="flex flex-col items-center justify-center gap-1 px-0">
                        <span>DINHEIRO</span>
                        <div className="flex items-center justify-center gap-1 bg-[#1E3A5F] px-1 py-1 rounded-lg border border-blue-300/60 font-mono text-[10px]">
                          <span className="text-blue-200 font-bold">TT:</span>
                          <input
                            type="number"
                            value={globalEntradas.dinheiroTT || ""}
                            onChange={(e) => setGlobalEntradas({ ...globalEntradas, dinheiroTT: parseFloat(e.target.value) || 0 })}
                            onBlur={(e) => void saveGlobalEntryOnBlur("dinheiroTT", parseFloat(e.currentTarget.value) || 0)}
                            className="w-14 text-center bg-blue-100 text-blue-950 font-black rounded px-1 py-0.5 outline-none focus:ring-2 focus:ring-blue-400"
                            placeholder="0,00"
                          />
                          <span className="text-blue-200 font-bold ml-1">DS:</span>
                          <input
                            type="number"
                            value={globalEntradas.dinheiroDS || ""}
                            onChange={(e) => setGlobalEntradas({ ...globalEntradas, dinheiroDS: parseFloat(e.target.value) || 0 })}
                            onBlur={(e) => void saveGlobalEntryOnBlur("dinheiroDS", parseFloat(e.currentTarget.value) || 0)}
                            className="w-14 text-center bg-blue-100 text-blue-950 font-black rounded px-1 py-0.5 outline-none focus:ring-2 focus:ring-blue-400"
                            placeholder="0,00"
                          />
                        </div>
                      </div>
                    </th>
                    <th className="p-3 border border-gray-300 border-r-[1px] border-r-black bg-[#315F86]" colSpan={2}>
                      <div className="flex flex-col items-center justify-center gap-1 px-0">
                        <span>UNIMED LUIS</span>
                        <div className="flex items-center justify-center gap-1 bg-slate-700/80 px-1 py-1 rounded-lg border border-blue-300/60 font-mono text-[10px]">
                          <span className="text-blue-200 font-bold">TT:</span>
                          <input
                            type="number"
                            value={globalEntradas.unimedLuisTT || ""}
                            onChange={(e) => setGlobalEntradas({ ...globalEntradas, unimedLuisTT: parseFloat(e.target.value) || 0 })}
                            onBlur={(e) => void saveGlobalEntryOnBlur("unimedLuisTT", parseFloat(e.currentTarget.value) || 0)}
                            className="w-14 text-center bg-blue-100 text-blue-950 font-black rounded px-1 py-0.5 outline-none focus:ring-2 focus:ring-blue-400"
                            placeholder="0,00"
                          />
                          <span className="text-blue-200 font-bold ml-1">DS:</span>
                          <input
                            type="number"
                            value={globalEntradas.unimedLuisDS || ""}
                            onChange={(e) => setGlobalEntradas({ ...globalEntradas, unimedLuisDS: parseFloat(e.target.value) || 0 })}
                            onBlur={(e) => void saveGlobalEntryOnBlur("unimedLuisDS", parseFloat(e.currentTarget.value) || 0)}
                            className="w-14 text-center bg-blue-100 text-blue-950 font-black rounded px-1 py-0.5 outline-none focus:ring-2 focus:ring-blue-400"
                            placeholder="0,00"
                          />
                        </div>
                      </div>
                    </th>
                    <th className="p-3 border border-gray-300 border-r-[1px] border-r-black bg-[#1E3A5F]" colSpan={4}>TOTAL GERAL</th>
                    <th className="p-3 border border-gray-300 bg-slate-700" colSpan={Math.max(1, cashFlowExpenseTypes.length) + 3}>SAÍDAS / DESPESAS</th>
                    <th className="p-3 border border-gray-300 bg-slate-700 text-white" rowSpan={2}>RESULT</th>
                    <th className="p-3 border border-gray-300 bg-slate-700 text-white" rowSpan={2}>%</th>
                    <th className="p-3 border border-gray-300 bg-[#254D73] text-white" rowSpan={2}>SALÁRIO</th>
                    <th className="p-3 border border-gray-300 bg-slate-700 text-white" rowSpan={2}>FINAL</th>
                    <th className="p-3 border border-gray-300 bg-stone-600 text-white" rowSpan={2}>ACERTO 1</th>
                    <th className="p-3 border border-gray-300 bg-stone-600 text-white" rowSpan={2}>SOBRE MÊS ANTERIOR</th>
                    <th className="p-3 border border-gray-300 bg-[#1E3A5F] text-white" rowSpan={2}>DIV LUCROS</th>
                    <th className="p-3 border border-gray-300 bg-orange-700 text-white" rowSpan={2}>EXCEDENTE</th>
                    <th className="p-3 border border-gray-300 bg-orange-100 text-orange-950" rowSpan={2}>TOTAL</th>
                    <th className="p-3 border border-gray-300 bg-orange-100 text-orange-950" rowSpan={2}>ACERTO FINAL</th>
                    <th className="p-3 border border-gray-300 bg-orange-500 text-orange-950" rowSpan={2}>FINALIZAÇÃO</th>
                  </tr>
                  <tr className="bg-slate-800 text-slate-200 font-bold uppercase text-[10px]">
                    {/* Azambuja */}
                    <th className="p-2 border border-gray-300 border-l-[1px] border-l-black">Equipe TT</th>
                    <th className="p-2 border border-gray-300">Equipe DS</th>
                    <th className="p-2 border border-gray-300 bg-slate-700 text-blue-100">Plantão TT</th>
                    <th className="p-2 border border-gray-300 bg-slate-700 text-blue-100">Plantão DS</th>
                    <th className="p-2 border border-gray-300">Total TT</th>
                    <th className="p-2 border border-gray-300 border-r-[1px] border-r-black">Total DS</th>
                    {/* Marieta */}
                    <th className="p-2 border border-gray-300">Equipe TT</th>
                    <th className="p-2 border border-gray-300">Equipe DS</th>
                    <th className="p-2 border border-gray-300">Total TT</th>
                    <th className="p-2 border border-gray-300">Total DS</th>
                    {/* Unimed */}
                    <th className="p-2 border border-gray-300">Equipe TT</th>
                    <th className="p-2 border border-gray-300">Equipe DS</th>
                    <th className="p-2 border border-gray-300">Part. TT</th>
                    <th className="p-2 border border-gray-300">Part. DS</th>
                    <th className="p-2 border border-gray-300 bg-slate-700 text-blue-100">Plantão TT</th>
                    <th className="p-2 border border-gray-300 bg-slate-700 text-blue-100">Plantão DS</th>
                    <th className="p-2 border border-gray-300">VL Nota TT</th>
                    <th className="p-2 border border-gray-300">Disp DS</th>
                    <th className="p-2 border border-gray-300">Prop %</th>
                    <th className="p-2 border border-gray-300">Disp Unim</th>
                    {/* Consultorio */}
                    <th className="p-2 border border-gray-300">TT</th>
                    <th className="p-2 border border-gray-300">DS</th>
                    {/* Dinheiro */}
                    <th className="p-2 border border-gray-300">TT</th>
                    <th className="p-2 border border-gray-300">DS</th>
                    {/* Unimed Luis */}
                    <th className="p-2 border border-gray-300">TT</th>
                    <th className="p-2 border border-gray-300">DS</th>
                    {/* Totalizador consolidado logo após Unimed Luis */}
                    <th className="p-2 border border-gray-300 bg-slate-700 text-blue-100">TT</th>
                    <th className="p-2 border border-gray-300 bg-slate-700 text-blue-100">DS</th>
                    <th className="p-2 border border-gray-300 bg-slate-700 text-blue-100">Disp Período</th>
                    <th className="p-2 border border-gray-300 bg-slate-700 text-blue-100">Proporção Heart</th>
                    {/* Despesas por tipo */}
                    {displayedExpenseTypes.map(type => <th key={type.id} className={`p-2 border border-gray-300 ${getExpenseHeaderColor(type)}`}>{type.name}</th>)}
                    {!cashFlowExpenseTypes.length && <th className="p-2 border border-gray-300 bg-slate-200 text-slate-900">Despesas</th>}
                    <th className="p-2 border border-gray-300 bg-orange-200 text-orange-950">TOTAL HEART</th>
                    <th className="p-2 border border-gray-300 bg-purple-200 text-purple-950">TOTAL TODOS</th>
                    <th className="p-2 border border-gray-300 bg-emerald-200 text-emerald-950">TOTAL INDIVIDUAL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 font-medium text-gray-800">
                  {(() => {
                    const hasClosing = Boolean(details?.closing);
                    const doctorAggById = new Map(doctorsAggregated.map((d: any) => [d.doctorId, d]));
                    const getDoctorUnimed = (doctorId: string, doctorName?: string) => {
                      const found: any = doctorAggById.get(doctorId)
                        || doctorsAggregated.find((item: any) => normalize(item.doctorName) === normalize(doctorName));
                      if (!found) return { prod: 0, disp: 0, operational: 0, film: 0 };
                      return {
                        prod: Number(found.honorTT) || 0,
                        disp: Number(found.honorDS) || 0,
                        operational: Number(found.operationalTT) || 0,
                        film: Number(found.filmTT) || 0
                      };
                    };

                    // A produção CSV e os créditos de rateio da equipe são divididos
                    // igualmente apenas entre os médicos marcados em "Participa Unimed?".
                    const unimedParticipants = configuredDoctors.filter((doctor: any) =>
                      doctor.participaUnimed === true
                    );
                    const sharedRateioTransactions = cashFlowTransactions.filter(isSharedUnimedRateioTransaction);
                    const sharedRateioTotal = sharedRateioTransactions.reduce((sum: number, tx: any) => {
                      const amount = Number(tx.amount) || 0;
                      return sum + (tx.allowNegativeAmount === true ? amount : Math.abs(amount));
                    }, 0);
                    const participantProduction = unimedParticipants.reduce((sum: number, doctor: any) => {
                      const data = getDoctorUnimed(doctor.key, doctor.name);
                      return sum + data.prod + data.operational + data.film;
                    }, 0) + sharedRateioTotal;
                    const sharedUnimedTT = unimedParticipants.length
                      ? Math.round((participantProduction / unimedParticipants.length) * 100) / 100
                      : 0;
                    const totalLotsDS = excelData.lotesUnimed.reduce((sum: number, lote: any) => sum + (Number(lote.dsSaque) || 0), 0);
                    const unimedDSRatio = totalUnimedTT > 0 ? totalLotsDS / totalUnimedTT : 0;

                    const mul = hasClosing ? 1 : 0;

                    const totalAzambujaPlantaoTT = rowsData.reduce((acc, doc) => {
                      const man = manualEntradas[doc.key] || {};
                      return acc + (man.azambujaPlantaoTT || 0);
                    }, 0) * mul;

                    const totalAzambujaPlantaoDS = rowsData.reduce((acc, doc) => {
                      const man = manualEntradas[doc.key] || {};
                      const tt = (man.azambujaPlantaoTT || 0) * mul;
                      const ds = (globalEntradas.azambujaTT > 0)
                        ? Math.round((tt * globalEntradas.azambujaDS / globalEntradas.azambujaTT) * 100) / 100
                        : 0;
                      return acc + ds;
                    }, 0);

                    const netAzEquipeTT = Math.max(0, (globalEntradas.azambujaTT * mul) - totalAzambujaPlantaoTT);
                    const netAzEquipeDS = Math.max(0, (globalEntradas.azambujaDS * mul) - totalAzambujaPlantaoDS);



                    const rows = rowsData.map((doc) => {
                      const isTeam = doc.isTeam;
                      const pct = doc.percent;
                      
                      const man = manualEntradas[doc.key] || {
                        azambujaPlantaoTT: 0, azambujaPlantaoDS: 0,
                        unimedPlantaoTT: 0, unimedPlantaoDS: 0,
                        consultTT: 0, consultDS: 0,
                        dinheiroTT: 0, dinheiroDS: 0,
                        unimLuisTT: 0, unimLuisDS: 0
                      };

                      // Azambuja Equipe = total typed minus plantoes, rateada pelo percentual da equipe
                      const azEqTT = isTeam ? Math.round((pct / 100) * netAzEquipeTT * 100) / 100 : 0;
                      const azEqDS = isTeam ? Math.round((pct / 100) * netAzEquipeDS * 100) / 100 : 0;
                      const azPlTT = (man.azambujaPlantaoTT || 0) * mul;
                      const azPlDS = (globalEntradas.azambujaTT > 0)
                        ? Math.round((azPlTT * globalEntradas.azambujaDS / globalEntradas.azambujaTT) * 100) / 100 * mul
                        : 0;
                      const azTotTT = azEqTT + azPlTT;
                      const azTotDS = azEqDS + azPlDS;

                      // Marieta Equipe rateada pelo percentual da equipe para médicos da equipe (29, 29, 29, 13)
                      const marEqTT = isTeam ? Math.round((pct / 100) * globalEntradas.marietaTT * 100) / 100 * mul : 0;
                      const marEqDS = isTeam ? Math.round((pct / 100) * globalEntradas.marietaDS * 100) / 100 * mul : 0;
                      const marTotTT = marEqTT;
                      const marTotDS = marEqDS;

                      const doctorConfig = configuredDoctors.find((item: any) => item.key === doc.key)
                        || configuredDoctors.find((item: any) => normalize(item.name) === normalize(doc.name));
                      const participatesUnimed = doctorConfig?.participaUnimed === true;
                      const unimedData = getDoctorUnimed(doc.key, doc.name);
                      const unimedEqTT = isTeam
                        ? (participatesUnimed ? sharedUnimedTT : unimedData.prod + unimedData.operational + unimedData.film) * mul
                        : 0;
                      const unimedEqDS = isTeam
                        ? Math.round(unimedEqTT * unimedDSRatio * 100) / 100
                        : 0;
                      // Entradas de fluxo de caixa passam a compor Part. TT na seção Unimed.
                      // Para médicos externos, somam à produção CSV; para membros da equipe,
                      // ficam em Part. TT sem duplicar a parcela compartilhada em Equipe TT.
                      const importedAndOtherIncoming = cashFlowAllocation.incomingByDoctor[normalize(doc.name)] || 0;
                      const unimedPartTT = Math.round((((!isTeam ? unimedData.prod + unimedData.operational + unimedData.film : 0) + importedAndOtherIncoming) * mul) * 100) / 100;
                      const unimedPartDS = Math.round(unimedPartTT * unimedDSRatio * 100) / 100;
                      // Os valores operacionais/filme já estão incluídos na cota igual dos participantes.
                      const unimedOp = isTeam && participatesUnimed ? 0 : unimedData.operational * mul;
                      const unimedFilm = isTeam && participatesUnimed ? 0 : unimedData.film * mul;
                      // Plantão TT soma os valores manuais legados e as disponibilidades UTI
                      // importadas do PDF. O lançamento UTI não é incluído em Part. TT.
                      const importedUtiPlantaoTT = cashFlowAllocation.unimedPlantaoByDoctor[normalize(doc.name)] || 0;
                      // Plantão TT é alimentado exclusivamente pela importação PDF de UTI.
                      // Não considerar valores manuais legados nem participação Unimed.
                      const unimPlTT = importedUtiPlantaoTT * mul;
                      const unimPlDS = Math.round(unimPlTT * unimedDSRatio * 100) / 100;
                      const unimTotTT = unimedEqTT + unimedPartTT + (isTeam ? unimedOp + unimedFilm : 0) + unimPlTT;
                      const unimTotDS = Math.round(unimTotTT * unimedDSRatio * 100) / 100;

                      const consultTT = isTeam ? Math.round((pct / 100) * globalEntradas.consultorioTT * 100) / 100 * mul : 0;
                      const consultDS = isTeam ? Math.round((pct / 100) * globalEntradas.consultorioDS * 100) / 100 * mul : 0;
                      const dinheiroTT = isTeam ? Math.round((pct / 100) * globalEntradas.dinheiroTT * 100) / 100 * mul : 0;
                      const dinheiroDS = isTeam ? Math.round((pct / 100) * globalEntradas.dinheiroDS * 100) / 100 * mul : 0;
                      const unimLuisTT = isTeam ? Math.round((pct / 100) * globalEntradas.unimedLuisTT * 100) / 100 * mul : 0;
                      const unimLuisDS = isTeam ? Math.round((pct / 100) * globalEntradas.unimedLuisDS * 100) / 100 * mul : 0;

                      const totalGeralTT = azTotTT + marTotTT + unimTotTT + consultTT + dinheiroTT + unimLuisTT;
                      const totalGeralDS = azTotDS + marTotDS + unimTotDS + consultDS + dinheiroDS + unimLuisDS;

                      return {
                        ...doc,
                        azEqTT, azEqDS, azPlTT, azPlDS, azTotTT, azTotDS,
                        marEqTT, marEqDS, marTotTT, marTotDS,
                        unimedEqTT, unimedEqDS, unimedPartTT, unimedPartDS, unimedOp, unimedFilm, importedUtiPlantaoTT, unimPlTT, unimPlDS, unimTotTT, unimTotDS,
                        consultTT, consultDS, dinheiroTT, dinheiroDS, unimLuisTT, unimLuisDS,
                        totalGeralTT, totalGeralDS,
                        cashFlowIn: 0,
                        incomingTransactions: cashFlowAllocation.incomingTransactionsByDoctor[normalize(doc.name)] || [],
                        cashFlowExpenses: cashFlowAllocation.expenseByDoctorType[normalize(doc.name)] || {},
                        salaryAmount: cashFlowAllocation.salaryByDoctor[normalize(doc.name)] || 0,
                        acerto1Amount: cashFlowAllocation.matrixAdjustmentByDoctor[normalize(doc.name)]?.ACERTO_1 || 0,
                        sobreMesAnteriorAmount: cashFlowAllocation.matrixAdjustmentByDoctor[normalize(doc.name)]?.SOBRE_MES_ANTERIOR || 0,
                        acertoFinalAmount: cashFlowAllocation.matrixAdjustmentByDoctor[normalize(doc.name)]?.ACERTO_FINAL || 0,
                        afterCashFlowOut: Math.round((totalGeralDS - Object.values(cashFlowAllocation.expenseByDoctorType[normalize(doc.name)] || {}).reduce((sum: number, value: number) => sum + value, 0)) * 100) / 100
                      };
                    });

                    // DISP PERÍODO is based on the same matrix totals as Consultório,
                    // Dinheiro and Unimed Luis, but only for doctors marked as team members.
                    // Exclude the shared Unimed amount from each team member's DS balance.
                    const normalizeTeamDoctorName = (value: any) => String(value || "")
                      .normalize("NFD")
                      .replace(/[\u0300-\u036f]/g, "")
                      .trim()
                      .toUpperCase()
                      .replace(/\s+/g, " ");
                    const isConfiguredTeamMember = (row: any) => {
                      const config = configuredDoctors.find((doctor: any) =>
                        doctor.key === row.key ||
                        normalizeTeamDoctorName(doctor.name) === normalizeTeamDoctorName(row.name)
                      );
                      // The saved doctor configuration is authoritative; row.isTeam is a fallback
                      // for rows whose doctor is not present in the configuration yet.
                      return config ? config.isTeamMember === true : row.isTeam === true;
                    };
                    const getAvailableForProp = (row: any) => {
                      if (!isConfiguredTeamMember(row)) return 0;
                      const totalDS = Number(row.totalGeralDS) || 0;
                      const unimedDS = Number(row.unimTotDS) || 0;
                      return Math.max(0, totalDS - unimedDS);
                    };

                    // The denominator for PROPORÇÃO HEART is the sum of DISP PERÍODO
                    // of team members only. Their percentages therefore add up to 100%.
                    const teamRowsForHeart = rows.filter(isConfiguredTeamMember);
                    const totalDispPeriodo = teamRowsForHeart.reduce(
                      (sum: number, row: any) => sum + getAvailableForProp(row),
                      0
                    );
                    rows.forEach((row: any) => {
                      const isTeamMember = isConfiguredTeamMember(row);
                      const dispPeriodo = isTeamMember ? getAvailableForProp(row) : 0;
                      row.isTeam = isTeamMember;
                      row.dispPeriodo = Math.round(dispPeriodo * 100) / 100;
                      row.proporcaoHeart = isTeamMember && totalDispPeriodo > 0
                        ? (dispPeriodo / totalDispPeriodo) * 100
                        : 0;
                    });

                    // PROPORCAO_HEART expenses must use the calculated "Proporção Heart"
                    // column from this matrix, not the nominal 29/29/29/13% or a saved setting.
                    const heartRateTransactions = cashFlowTransactions.filter((tx: any) => {
                      if (isSalaryTransaction(tx) || isMatrixAdjustmentTransaction(tx)) return false;
                      const method = getEffectiveRateioMethod(tx);
                      return String(tx.nature || "").toUpperCase() === "DEBIT"
                        && String(tx.scope || "TEAM").toUpperCase() !== "DOCTOR"
                        && method === "PROPORCAO_HEART";
                    });
                    const heartRateTypeIds = new Set(
                      heartRateTransactions.map((tx: any) => String(tx.typeId || tx.typeName || "outros"))
                    );
                    // Remove allocations previously produced by the nominal fallback before
                    // applying the matrix's dynamic proportions.
                    rows.forEach((row: any) => {
                      const expenses = { ...(row.cashFlowExpenses || {}) };
                      heartRateTypeIds.forEach((typeId: string) => { delete expenses[typeId]; });
                      row.cashFlowExpenses = expenses;
                    });
                    heartRateTransactions.forEach((tx: any) => {
                      const participatingRows = rows.filter((row: any) => row.isTeam === true);
                      if (participatingRows.length === 0) return;
                      const amount = tx.allowNegativeAmount === true
                        ? Number(tx.amount) || 0
                        : Math.max(0, Number(tx.amount) || 0);
                      const typeId = String(tx.typeId || tx.typeName || "outros");
                      participatingRows.forEach((row: any) => {
                        const percent = Math.max(0, Number(row.proporcaoHeart) || 0);
                        const allocated = Math.round((amount * percent / 100 + Number.EPSILON) * 100) / 100;
                        if (allocated === 0 || (allocated < 0 && tx.allowNegativeAmount !== true)) return;
                        row.cashFlowExpenses = { ...(row.cashFlowExpenses || {}) };
                        row.cashFlowExpenses[typeId] = Math.round(((Number(row.cashFlowExpenses[typeId]) || 0) + allocated) * 100) / 100;
                      });
                    });

                    // PROP_GERAL uses the Unimed matrix "Prop %" column for every doctor,
                    // regardless of team membership. The displayed percentage is each doctor's
                    // Unimed TT divided by totalUnimedTT; only participaRateioGeral controls eligibility.
                    // Do not normalize: warn above 100% but still apply each individual percentage.
                    const getPropGeralPercent = (row: any) => totalUnimedTT > 0
                      ? Math.max(0, Number(row.unimTotTT) || 0) / totalUnimedTT * 100
                      : 0;
                    const propGeneralErrors: string[] = [];
                    const propGeneralWarnings: string[] = [];
                    const propGeneralTransactions = cashFlowTransactions.filter((tx: any) => {
                      if (isSalaryTransaction(tx)) return false;
                      const savedMethod = normalizeRateioMethod(tx.rateioMethod);
                      const apiMethod = normalizeRateioMethod(tx.allocationMethod);
                      return String(tx.nature || "").toUpperCase() === "DEBIT" &&
                        String(tx.scope || "TEAM").toUpperCase() !== "DOCTOR" &&
                        (savedMethod === "PROP_GERAL" || apiMethod === "PROP_GERAL" ||
                          getEffectiveRateioMethod(tx) === "PROP_GERAL");
                    });

                    // Clear any legacy allocation already placed under these type IDs
                    // before applying the PROP % formula. This prevents old Heart/nominal
                    // values from surviving alongside the new general-PROP allocation.
                    const propGeneralTypeIds = new Set(
                      propGeneralTransactions.map((tx: any) => String(tx.typeId || tx.typeName || "outros"))
                    );
                    rows.forEach((row: any) => {
                      const expenses = { ...(row.cashFlowExpenses || {}) };
                      propGeneralTypeIds.forEach((typeId: string) => { delete expenses[typeId]; });
                      row.cashFlowExpenses = expenses;
                    });

                    propGeneralTransactions.forEach((tx: any) => {
                      const participatingRows = rows.filter((row: any) => {
                        const config = configuredDoctors.find((d: any) => d.key === row.key)
                          || configuredDoctors.find((d: any) => normalize(d.name) === normalize(row.name));
                        return config?.participaRateioGeral === true;
                      });
                      if (participatingRows.length === 0) {
                        propGeneralErrors.push(`${tx.typeName || "Saída"}: nenhum médico está habilitado para o rateio geral. Rateio bloqueado.`);
                        return;
                      }
                      const propSum = participatingRows.reduce((sum: number, row: any) => sum + getPropGeralPercent(row), 0);
                      if (propSum > 100.05) {
                        propGeneralWarnings.push(`${tx.typeName || "Saída"}: a soma dos percentuais PROP dos médicos habilitados é ${propSum.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%, acima de 100%. O rateio será aplicado pelos percentuais individuais, sem normalização.`);
                      }
                      const allowNegativeAmount = tx.allowNegativeAmount === true;
                      const amount = allowNegativeAmount
                        ? Number(tx.amount) || 0
                        : Math.max(0, Number(tx.amount) || 0);
                      const typeId = String(tx.typeId || tx.typeName || "outros");
                      participatingRows.forEach((row: any) => {
                        const percent = getPropGeralPercent(row);
                        // Use the original transaction amount times this doctor's displayed Unimed PROP %.
                        const allocated = Math.round((amount * percent / 100 + Number.EPSILON) * 100) / 100;
                        if (allocated === 0 || (allocated < 0 && !allowNegativeAmount)) return;
                        row.cashFlowExpenses = { ...(row.cashFlowExpenses || {}) };
                        row.cashFlowExpenses[typeId] = Math.round(((Number(row.cashFlowExpenses[typeId]) || 0) + allocated) * 100) / 100;
                      });
                    });
                    rows.forEach((row: any) => {
                      const expenses = Object.values(row.cashFlowExpenses || {}).reduce((sum: number, value: any) => sum + (Number(value) || 0), 0);
                      row.afterCashFlowOut = Math.round(((Number(row.totalGeralDS) || 0) + (Number(row.cashFlowIn) || 0) - expenses) * 100) / 100;
                      row.finalAfterSalary = Math.round((row.afterCashFlowOut - (Number(row.salaryAmount) || 0)) * 100) / 100;
                      const totalForProfitDistribution = Math.round((row.finalAfterSalary + (Number(row.acerto1Amount) || 0) + (Number(row.sobreMesAnteriorAmount) || 0)) * 100) / 100;
                      const limit = Math.max(0, Number(row.valorLimite) || 0);
                      row.divLucrosAmount = limit > 0 ? Math.min(totalForProfitDistribution, limit) : totalForProfitDistribution;
                      row.excedenteAmount = limit > 0 ? Math.max(0, Math.round((totalForProfitDistribution - limit) * 100) / 100) : 0;
                      row.totalAmount = Math.round((Number(row.divLucrosAmount || 0) + Number(row.excedenteAmount || 0)) * 100) / 100;
                      row.finalizacaoAmount = Math.round((row.totalAmount + (Number(row.acertoFinalAmount) || 0)) * 100) / 100;
                    });

                    // O percentual RESULT deve considerar somente os membros da equipe.
                    // Médicos externos não entram no denominador e não recebem percentual.
                    const teamRows = rows.filter((row: any) => row.isTeam === true);
                    const totalTeamResult = teamRows.reduce(
                      (sum: number, row: any) => sum + (Number(row.afterCashFlowOut) || 0),
                      0
                    );
                    rows.forEach((row: any) => {
                      row.afterCashFlowOutPercent = row.isTeam === true && totalTeamResult !== 0
                        ? Math.round(((Number(row.afterCashFlowOut) || 0) / totalTeamResult) * 10000) / 100
                        : 0;
                    });

                    (window as any).__matrixRowsCache = rows;

                    return (
                      <>
                        {propGeneralErrors.length > 0 && (
                          <tr>
                            <td colSpan={50} className="p-3 border border-rose-300 bg-rose-50 text-rose-800 text-left font-bold whitespace-normal">
                              <div className="flex items-start gap-2">
                                <span className="font-black">Rateio PROP % não aplicado:</span>
                                <span>{propGeneralErrors.join(" ")}</span>
                              </div>
                            </td>
                          </tr>
                        )}
                        {propGeneralWarnings.length > 0 && (
                          <tr>
                            <td colSpan={50} className="p-3 border border-amber-300 bg-amber-50 text-amber-900 text-left font-bold whitespace-normal">
                              <div className="flex items-start gap-2">
                                <span className="font-black">Atenção no rateio PROP %:</span>
                                <span>{propGeneralWarnings.join(" ")}</span>
                              </div>
                            </td>
                          </tr>
                        )}
                        {rows.map((r) => (
                      <tr key={r.key} className="even:bg-slate-50/70 hover:bg-emerald-50/40 transition-colors">
                        <td
                          className="sticky left-0 z-10 p-3 border border-gray-300 text-left pl-4 font-black text-gray-900 bg-white cursor-pointer hover:bg-blue-50 transition-colors shadow-[4px_0_6px_-4px_rgba(0,0,0,0.35)]"
                          title="Clique para ver todos os lançamentos deste médico"
                          onClick={() => {
                            const recs = production.filter(p => p.doctorId === r.key);
                            setMatrixModalData({
                              isOpen: true,
                              title: `Todos os lançamentos Unimed — ${r.name}`,
                              doctorName: r.name,
                              source: "UNIMED",
                              records: recs
                            });
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <span className="underline decoration-dotted underline-offset-2">{r.name}</span>
                            <Eye size={13} className="text-blue-500 shrink-0" />
                            <span className="inline-flex items-center gap-0.5 ml-1" onClick={(event) => event.stopPropagation()}>
                              <button
                                type="button"
                                title="Mover médico para cima"
                                aria-label={`Mover ${r.name} para cima`}
                                disabled={rowsData.findIndex(item => item.key === r.key) === 0}
                                onClick={(event) => { event.stopPropagation(); void moveDoctorInList(r.key, -1); }}
                                className="p-1 rounded border border-gray-300 bg-white hover:bg-blue-50 disabled:opacity-30 disabled:cursor-not-allowed"
                              ><ChevronUp size={12} /></button>
                              <button
                                type="button"
                                title="Mover médico para baixo"
                                aria-label={`Mover ${r.name} para baixo`}
                                disabled={rowsData.findIndex(item => item.key === r.key) === rowsData.length - 1}
                                onClick={(event) => { event.stopPropagation(); void moveDoctorInList(r.key, 1); }}
                                className="p-1 rounded border border-gray-300 bg-white hover:bg-blue-50 disabled:opacity-30 disabled:cursor-not-allowed"
                              ><ChevronDown size={12} /></button>
                            </span>
                            {r.isTeam && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800">Sócio</span>}
                          </div>
                          <div className="text-[9px] text-blue-500 font-bold mt-0.5">Ver lançamentos</div>
                        </td>
                        <td className="p-3 border border-gray-300 font-bold text-gray-700 bg-slate-50">
                          {r.percent > 0 ? `${r.percent}%` : "-"}
                        </td>
                        {/* Azambuja */}
                        <td className="p-3 border border-gray-300 border-l-[1px] border-l-black font-mono text-gray-700">{r.azEqTT > 0 ? r.azEqTT.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}</td>
                        <td className="p-3 border border-gray-300 font-mono text-gray-700">{r.azEqDS > 0 ? r.azEqDS.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}</td>
                        <td className="p-3 border border-gray-300 bg-blue-50/60 p-1">
                          <input
                            type="number"
                            value={manualEntradas[r.key]?.azambujaPlantaoTT || ""}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              const ratio = 0.8147;
                              const man = manualEntradas[r.key] || {};
                              updateManualEntry(r.key, { azambujaPlantaoTT: val, azambujaPlantaoDS: Math.round(val * ratio * 100) / 100 });
                            }}
                            onBlur={(e) => {
                              const val = parseFloat(e.currentTarget.value) || 0;
                              const ratio = 0.8147;
                              void saveManualEntryOnBlur(r.key, { azambujaPlantaoTT: val, azambujaPlantaoDS: Math.round(val * ratio * 100) / 100 });
                            }}
                            className="w-20 text-center bg-emerald-100/80 border border-emerald-300 rounded-lg font-mono text-xs py-1 text-emerald-950 font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                            placeholder="0,00"
                          />
                        </td>
                        <td className="p-3 border border-gray-300 bg-blue-50/30 font-mono text-emerald-800 font-bold">
                          {r.azPlDS > 0 ? r.azPlDS.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}
                        </td>
                        <td className="p-3 border border-gray-300 font-mono font-bold text-gray-900">{r.azTotTT > 0 ? r.azTotTT.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}</td>
                        <td className="p-3 border border-gray-300 font-mono font-bold text-blue-700 border-r border-gray-300">{r.azTotDS > 0 ? r.azTotDS.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}</td>

                        {/* Marieta */}
                        <td className="p-3 border border-gray-300 font-mono text-gray-700">{r.marEqTT > 0 ? r.marEqTT.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}</td>
                        <td className="p-3 border border-gray-300 font-mono text-gray-700">{r.marEqDS > 0 ? r.marEqDS.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}</td>
                        <td className="p-3 border border-gray-300 font-mono font-bold text-gray-900">{r.marTotTT > 0 ? r.marTotTT.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}</td>
                        <td className="p-3 border border-gray-300 font-mono font-bold text-blue-700 border-r border-gray-300">{r.marTotDS > 0 ? r.marTotDS.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}</td>

                        {/* Unimed (Equipe from imports, Plantao manual) */}
                        <td 
                          onClick={() => {
                            const recs = production.filter(p => p.doctorId === r.key);
                            const doctorConfig = configuredDoctors.find((d: any) => d.key === r.key)
                              || configuredDoctors.find((d: any) => normalize(d.name) === normalize(r.name));
                            const sharedCashRecords = doctorConfig?.participaUnimed === true && unimedParticipants.length > 0
                              ? sharedRateioTransactions.map((tx: any) => ({
                                  id: tx.id,
                                  recordType: "CASH_FLOW",
                                  protocol: tx.id || "FLUXO DE CAIXA",
                                  date: tx.date || tx.createdAt || "",
                                  patientName: tx.typeName || transactionTypesById.get(String(tx.typeId || ""))?.name || "Sobreaviso",
                                  patientCode: r.name,
                                  document: tx.description || tx.observation || "-",
                                  quantity: 1,
                                  ambCode: "RATEIO",
                                  procedureDescription: tx.description || tx.observation || `Entrada de rateio: ${tx.typeName || transactionTypesById.get(String(tx.typeId || ""))?.name || "Equipe"}`,
                                  honorValue: Math.round(((tx.allowNegativeAmount === true ? Number(tx.amount) || 0 : Math.abs(Number(tx.amount) || 0)) / unimedParticipants.length) * 100) / 100,
                                  operationalValue: 0,
                                  filmValue: 0,
                                  administrativeFee: 0,
                                  executingProvider: "Lançamento financeiro",
                                  paymentProvider: "-",
                                  protocolProvider: "-"
                                }))
                              : [];
                            setMatrixModalData({ isOpen: true, title: `Produção Unimed + Rateios (Equipe) — ${r.name}`, doctorName: r.name, source: "UNIMED", records: [...recs, ...sharedCashRecords] });
                          }}
                          className="p-3 border border-gray-300 font-mono text-gray-700 cursor-pointer hover:bg-blue-50 transition-colors"
                        >
                          {r.unimedEqTT > 0 ? r.unimedEqTT.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}
                        </td>
                        <td 
                          onClick={() => {
                            const recs = production.filter(p => p.doctorId === r.key);
                            setMatrixModalData({ isOpen: true, title: `Produção Unimed (Equipe DS) — ${r.name}`, doctorName: r.name, source: "UNIMED", records: recs });
                          }}
                          className="p-3 border border-gray-300 font-mono text-gray-700 cursor-pointer hover:bg-blue-50 transition-colors"
                        >
                          {r.unimedEqDS > 0 ? r.unimedEqDS.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}
                        </td>
                        <td
                          onClick={() => {
                            const productionRows = production
                              .filter(p => p.doctorId === r.key || normalize(p.doctorName) === normalize(r.name))
                              .map(p => ({ ...p, _recordType: "PRODUCTION" }));
                            const incomingRows = (r.incomingTransactions || []).map((tx: any) => ({
                              ...tx,
                              _recordType: "CASH_FLOW",
                              transactionAmount: Number(tx.allocatedAmount ?? tx.amount) || 0,
                              transactionTypeName: tx.typeName || transactionTypesById.get(String(tx.typeId || ""))?.name || "Entrada",
                              transactionDescription: tx.observation || tx.description || "",
                              transactionDate: tx.date || "",
                              transactionNature: tx.nature || "CREDIT"
                            }));
                            setMatrixModalData({
                              isOpen: true,
                              title: `Unimed Part. TT — ${r.name}`,
                              doctorName: r.name,
                              source: "UNIMED",
                              records: [...productionRows, ...incomingRows]
                            });
                          }}
                          className="p-3 border border-gray-300 font-mono text-gray-700 cursor-pointer hover:bg-blue-50 transition-colors"
                          title="Clique para ver a produção CSV e as entradas do fluxo de caixa que compõem este total"
                        >
                          {r.unimedPartTT > 0 ? r.unimedPartTT.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}
                        </td>
                        <td 
                          onClick={() => {
                            const recs = production.filter(p => p.doctorId === r.key);
                            setMatrixModalData({ isOpen: true, title: `Produção Unimed (Part. DS) — ${r.name}`, doctorName: r.name, source: "UNIMED", records: recs });
                          }}
                          className="p-3 border border-gray-300 font-mono text-gray-700 cursor-pointer hover:bg-blue-50 transition-colors"
                        >
                          {r.unimedPartDS > 0 ? r.unimedPartDS.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}
                        </td>
                        <td className="p-3 border border-gray-300 bg-blue-50/60 font-mono text-center font-bold text-gray-800">
                          {r.importedUtiPlantaoTT > 0
                            ? r.importedUtiPlantaoTT.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
                            : "-"}
                        </td>
                        <td className="p-3 border border-gray-300 bg-blue-50/30 font-mono text-emerald-800 font-bold">
                          {r.unimPlDS > 0 ? r.unimPlDS.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}
                        </td>
                        <td className="p-3 border border-gray-300 font-mono font-bold text-gray-900">{r.unimTotTT > 0 ? r.unimTotTT.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}</td>
                        <td className="p-3 border border-gray-300 font-mono font-bold text-blue-700">{r.unimTotDS > 0 ? r.unimTotDS.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}</td>
                        <td className="p-3 border border-gray-300 font-mono text-gray-500">{r.unimTotTT > 0 ? (totalUnimedTT > 0 ? (r.unimTotTT / totalUnimedTT * 100) : 0).toFixed(2) : "0.00"}%</td>
                        <td className="p-3 border border-gray-300 font-mono font-bold text-blue-800 border-r border-gray-300">{r.unimTotDS > 0 ? r.unimTotDS.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}</td>

                        {/* Consultorio */}
                        <td className="p-3 border border-gray-300 font-mono text-gray-700">{r.consultTT > 0 ? r.consultTT.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}</td>
                        <td className="p-3 border border-gray-300 font-mono font-bold text-blue-900 border-r border-gray-300">{r.consultDS > 0 ? r.consultDS.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}</td>

                        {/* Dinheiro */}
                        <td className="p-3 border border-gray-300 font-mono text-gray-700">{r.dinheiroTT > 0 ? r.dinheiroTT.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}</td>
                        <td className="p-3 border border-gray-300 font-mono font-bold text-blue-900 border-r border-gray-300">{r.dinheiroDS > 0 ? r.dinheiroDS.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}</td>

                        {/* Unimed Luis */}
                        <td className="p-3 border border-gray-300 font-mono text-gray-700">{r.unimLuisTT > 0 ? r.unimLuisTT.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}</td>
                        <td className="p-3 border border-gray-300 font-mono font-bold text-blue-900 border-r border-gray-300">{r.unimLuisDS > 0 ? r.unimLuisDS.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}</td>

                        {/* Totalizador consolidado */}
                        <td className="p-3 border border-gray-300 font-mono font-black bg-slate-100 text-gray-900">{r.totalGeralTT.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td className="p-3 border border-gray-300 font-mono font-black bg-blue-50 text-blue-950">{r.totalGeralDS.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td className="p-3 border border-gray-300 font-mono font-bold text-indigo-700 bg-slate-50">{r.isTeam === true ? r.dispPeriodo.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "0,00"}</td>
                        <td className="p-3 border border-gray-300 font-mono font-black bg-blue-50 text-blue-950">{(r.isTeam === true ? r.proporcaoHeart : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%</td>

                        {/* Despesas por tipo */}
                        {displayedExpenseTypes.map(type => <td key={type.id} className={`p-3 border border-gray-300 font-mono font-bold ${getExpenseCellColor(type)}`}>{getDisplayedExpenseValue(r, type) !== 0 ? getDisplayedExpenseValue(r, type).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}</td>)}
                        {!cashFlowExpenseTypes.length && <td className="p-3 border border-gray-300 bg-slate-50">-</td>}
                        <td className="p-3 border border-gray-300 font-mono font-black text-orange-900 bg-orange-100">{getExpenseGroupTotal(r, heartExpenseTypes) !== 0 ? getExpenseGroupTotal(r, heartExpenseTypes).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}</td>
                        <td className="p-3 border border-gray-300 font-mono font-black text-purple-900 bg-purple-100">{getExpenseGroupTotal(r, generalPropExpenseTypes) !== 0 ? getExpenseGroupTotal(r, generalPropExpenseTypes).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}</td>
                        <td className="p-3 border border-gray-300 font-mono font-black text-emerald-900 bg-emerald-100">{getExpenseGroupTotal(r, individualExpenseTypes) !== 0 ? getExpenseGroupTotal(r, individualExpenseTypes).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}</td>
                        <td className={`p-3 border border-gray-300 font-mono font-black ${r.afterCashFlowOut < 0 ? "text-rose-700 bg-rose-50" : "text-orange-900 bg-orange-100"}`}>
                          {r.afterCashFlowOut.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-3 border border-gray-300 font-mono font-black bg-slate-100 text-slate-700">
                          {(Number(r.afterCashFlowOutPercent) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                        </td>
                        <td className="p-3 border border-gray-300 font-mono font-bold text-amber-800 bg-amber-50/70">
                          {Number(r.salaryAmount) > 0 ? Number(r.salaryAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}
                        </td>
                        <td className={`p-3 border border-gray-300 font-mono font-black ${r.finalAfterSalary < 0 ? "text-rose-700 bg-rose-50" : "text-orange-900 bg-orange-100"}`}>
                          {Number(r.finalAfterSalary || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className={`p-3 border border-gray-300 font-mono font-bold ${Number(r.acerto1Amount) < 0 ? "text-rose-700 bg-rose-50" : "text-slate-700 bg-stone-50"}`}>
                          {Number(r.acerto1Amount) !== 0 ? Number(r.acerto1Amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}
                        </td>
                        <td className={`p-3 border border-gray-300 font-mono font-bold ${Number(r.sobreMesAnteriorAmount) < 0 ? "text-rose-700 bg-rose-50" : "text-slate-700 bg-stone-50"}`}>
                          {Number(r.sobreMesAnteriorAmount) !== 0 ? Number(r.sobreMesAnteriorAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}
                        </td>
                        <td className="p-3 border border-gray-300 font-mono font-black text-orange-900 bg-orange-50/70">
                          {Number(r.divLucrosAmount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className={`p-3 border border-gray-300 font-mono font-bold ${Number(r.excedenteAmount) > 0 ? "text-orange-800 bg-orange-50" : "text-slate-700 bg-slate-50"}`}>
                          {Number(r.excedenteAmount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-3 border border-gray-300 font-mono font-black text-orange-900 bg-orange-50/70">
                          {Number(r.totalAmount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className={`p-3 border border-gray-300 font-mono font-bold ${Number(r.acertoFinalAmount) < 0 ? "text-rose-700 bg-rose-50" : "text-orange-900 bg-orange-50/70"}`}>
                          {Number(r.acertoFinalAmount) !== 0 ? Number(r.acertoFinalAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}
                        </td>
                        <td className={`p-3 border border-gray-300 font-mono font-black ${Number(r.finalizacaoAmount) < 0 ? "text-rose-700 bg-rose-50" : "text-orange-900 bg-orange-100"}`}>
                          {Number(r.finalizacaoAmount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                      </>
                    );
                  })()}
                </tbody>
                <tfoot>
                  {(() => {
                    const rows = (window as any).__matrixRowsCache || [];
                    const sum = (field: string) => rows.reduce((acc: number, r: any) => acc + (r[field] || 0), 0);
                    const fmt = (val: number) => val > 0 ? val.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-";

                    return (
                      <tr className="bg-[#1E3A5F] text-white font-black text-xs">
                        <td className="p-3 border border-gray-300 text-left pl-4 uppercase" colSpan={2}>TOTAL GERAL CONSOLIDADO</td>
                        <td className="p-3 border border-gray-300 border-l-[1px] border-l-black font-mono">{fmt(sum('azEqTT'))}</td>
                        <td className="p-3 border border-gray-300 font-mono">{fmt(sum('azEqDS'))}</td>
                        <td className="p-3 border border-gray-300 font-mono text-blue-200">{fmt(sum('azPlTT'))}</td>
                        <td className="p-3 border border-gray-300 font-mono text-blue-200">{fmt(sum('azPlDS'))}</td>
                        <td className="p-3 border border-gray-300 font-mono">{fmt(sum('azTotTT'))}</td>
                        <td className="p-3 border border-gray-300 border-r-[1px] border-r-black font-mono">{fmt(sum('azTotDS'))}</td>
                        <td className="p-3 border border-gray-300 font-mono">{fmt(sum('marEqTT'))}</td>
                        <td className="p-3 border border-gray-300 font-mono">{fmt(sum('marEqDS'))}</td>
                        <td className="p-3 border border-gray-300 font-mono">{fmt(sum('marTotTT'))}</td>
                        <td className="p-3 border border-gray-300 font-mono">{fmt(sum('marTotDS'))}</td>
                        <td className="p-3 border border-gray-300 font-mono">{fmt(sum('unimedEqTT'))}</td>
                        <td className="p-3 border border-gray-300 font-mono">{fmt(sum('unimedEqDS'))}</td>
                        <td className="p-3 border border-gray-300 font-mono">{fmt(sum('unimedPartTT'))}</td>
                        <td className="p-3 border border-gray-300 font-mono">{fmt(sum('unimedPartDS'))}</td>
                        <td className="p-3 border border-gray-300 font-mono text-blue-200">{fmt(sum('unimPlTT'))}</td>
                        <td className="p-3 border border-gray-300 font-mono text-blue-200">{fmt(sum('unimPlDS'))}</td>
                        <td className="p-3 border border-gray-300 font-mono">{fmt(sum('unimTotTT'))}</td>
                        <td className="p-3 border border-gray-300 font-mono">{fmt(sum('unimTotDS'))}</td>
                        <td className="p-3 border border-gray-300 font-mono">100.00%</td>
                        <td className="p-3 border border-gray-300 font-mono">{fmt(sum('unimTotDS'))}</td>
                        <td className="p-3 border border-gray-300 font-mono">{fmt(sum('consultTT'))}</td>
                        <td className="p-3 border border-gray-300 font-mono">{fmt(sum('consultTT'))}</td>
                        <td className="p-3 border border-gray-300 font-mono">{fmt(sum('dinheiroTT'))}</td>
                        <td className="p-3 border border-gray-300 font-mono">{fmt(sum('dinheiroTT'))}</td>
                        <td className="p-3 border border-gray-300 font-mono">{fmt(sum('unimLuisTT'))}</td>
                        <td className="p-3 border border-gray-300 font-mono">{fmt(sum('unimLuisDS'))}</td>
                        <td className="p-3 border border-gray-300 font-mono">{fmt(sum('totalGeralTT'))}</td>
                        <td className="p-3 border border-gray-300 font-mono">{fmt(sum('totalGeralDS'))}</td>
                        <td className="p-3 border border-gray-300 font-mono">{fmt(sum('totalGeralDS') - sum('unimTotDS'))}</td>
                        <td className="p-3 border border-gray-300 font-mono">100.00%</td>
                        {displayedExpenseTypes.map(type => <td key={type.id} className={`p-3 border border-gray-300 font-mono ${getExpenseCellColor(type)}`}>{fmt(rows.reduce((acc: number, row: any) => acc + getDisplayedExpenseValue(row, type), 0))}</td>)}
                        {!cashFlowExpenseTypes.length && <td className="p-3 border border-gray-300 bg-slate-50">-</td>}
                        <td className="p-3 border border-gray-300 font-mono font-black text-orange-200">{fmt(rows.reduce((acc: number, row: any) => acc + getExpenseGroupTotal(row, heartExpenseTypes), 0))}</td>
                        <td className="p-3 border border-gray-300 font-mono font-black text-purple-200">{fmt(rows.reduce((acc: number, row: any) => acc + getExpenseGroupTotal(row, generalPropExpenseTypes), 0))}</td>
                        <td className="p-3 border border-gray-300 font-mono font-black text-emerald-200">{fmt(rows.reduce((acc: number, row: any) => acc + getExpenseGroupTotal(row, individualExpenseTypes), 0))}</td>
                        <td className="p-3 border border-gray-300 font-mono font-black text-white">{sum('afterCashFlowOut').toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td className="p-3 border border-gray-300 font-mono font-black">{rows.some((row: any) => row.isTeam === true) ? "100,00%" : "0,00%"}</td>
                        <td className="p-3 border border-gray-300 font-mono font-black text-amber-200">{sum('salaryAmount').toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td className="p-3 border border-gray-300 font-mono font-black text-white">{sum('finalAfterSalary').toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td className="p-3 border border-gray-300 font-mono font-black text-stone-200">{sum('acerto1Amount').toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td className="p-3 border border-gray-300 font-mono font-black text-stone-200">{sum('sobreMesAnteriorAmount').toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td className="p-3 border border-gray-300 font-mono font-black text-emerald-200">{sum('divLucrosAmount').toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td className="p-3 border border-gray-300 font-mono font-black text-orange-200">{sum('excedenteAmount').toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td className="p-3 border border-gray-300 font-mono font-black bg-orange-100 text-orange-950">{(Math.round((sum('divLucrosAmount') + sum('excedenteAmount')) * 100) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td className="p-3 border border-gray-300 font-mono font-black text-violet-200">{sum('acertoFinalAmount').toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td className="p-3 border border-gray-300 font-mono font-black bg-orange-500 text-orange-950">{sum('finalizacaoAmount').toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    );
                  })()}
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === "descritivo_pagamentos" && (() => {
        const rows = (window as any).__matrixRowsCache || [];
        const money = (value: number) => (Number(value) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const totalDS = rows.reduce((sum: number, row: any) => sum + (Number(row.totalGeralDS) || 0), 0);
        const totalDivisao = rows.reduce((sum: number, row: any) => sum + (Number(row.divLucrosAmount) || 0), 0);
        const totalFlash = rows.reduce((sum: number, row: any) => sum + (Number(row.excedenteAmount) || 0), 0);
        const totalSalario = rows.reduce((sum: number, row: any) => sum + (Number(row.salaryAmount) || 0), 0);
        const totalDistribuicao = rows.reduce((sum: number, row: any) =>
          sum + (Number(row.divLucrosAmount) || 0) + (Number(row.excedenteAmount) || 0) + (Number(row.salaryAmount) || 0), 0);
        const totalReservadoImpostos = Number(excelData.totals.totalReservadoImpostos) || 0;
        const totalFinal = Math.round((totalDS - totalDistribuicao - totalReservadoImpostos) * 100) / 100;
        return (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-gray-900 uppercase">Descritivo de Pagamentos</h3>
                <p className="text-xs text-gray-500">Resumo calculado a partir do fechamento atual. Os valores acompanham a matriz financeira.</p>
              </div>
              <div className="rounded-lg bg-[#1E3A5F] px-4 py-2 text-white text-xs font-bold">
                {selectedClosingId || "Fechamento atual"}
              </div>
            </div>

            <div className="overflow-x-auto bg-white border border-gray-300 shadow-sm rounded-xl">
              <table className="w-full min-w-[700px] border-collapse text-xs text-center">
                <thead>
                  <tr className="bg-[#BFBFBF] text-black font-black uppercase">
                    <th className="p-2 border border-gray-500 text-left">MÉDICO</th>
                    <th className="p-2 border border-gray-500">DIVISÃO</th>
                    <th className="p-2 border border-gray-500">FLASH</th>
                    <th className="p-2 border border-gray-500">SALÁRIO</th>
                    <th className="p-2 border border-gray-500">TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row: any) => {
                    const divisao = Number(row.divLucrosAmount) || 0;
                    const flash = Number(row.excedenteAmount) || 0;
                    const salario = Number(row.salaryAmount) || 0;
                    const total = Math.round((divisao + flash + salario) * 100) / 100;
                    return (
                      <tr key={row.key || row.name} className="hover:bg-blue-50/50">
                        <td className="p-2 border border-gray-400 text-left font-bold uppercase whitespace-nowrap">{row.name}</td>
                        <td className="p-2 border border-gray-400 font-mono">{money(divisao)}</td>
                        <td className="p-2 border border-gray-400 font-mono">{money(flash)}</td>
                        <td className="p-2 border border-gray-400 font-mono">{money(salario)}</td>
                        <td className="p-2 border border-gray-400 font-mono font-black">{money(total)}</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-[#BFBFBF] text-black font-black">
                    <td className="p-2 border border-gray-500 text-left">TOTAL</td>
                    <td className="p-2 border border-gray-500 font-mono">{money(totalDivisao)}</td>
                    <td className="p-2 border border-gray-500 font-mono">{money(totalFlash)}</td>
                    <td className="p-2 border border-gray-500 font-mono">{money(totalSalario)}</td>
                    <td className="p-2 border border-gray-500 font-mono">{money(totalDistribuicao)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto bg-white border border-gray-300 shadow-sm rounded-xl">
              <table className="w-full border-collapse text-xs">
                <tbody className="font-black">
                  <tr>
                    <td className="p-3 border border-gray-400 uppercase">TOTAL RECEBIMENTOS DISPONÍVEL SAQUE</td>
                    <td className="p-3 border border-gray-400 text-right font-mono">{money(totalDS)}</td>
                  </tr>
                  <tr>
                    <td className="p-3 border border-gray-400 uppercase">TOTAL DISTRIBUIÇÃO MÉDICOS</td>
                    <td className="p-3 border border-gray-400 text-right font-mono">{money(totalDistribuicao)}</td>
                  </tr>
                  <tr>
                    <td className="p-3 border border-gray-400 uppercase">TOTAL RESERVADO IMPOSTOS</td>
                    <td className="p-3 border border-gray-400 text-right font-mono text-amber-700">{money(totalReservadoImpostos)}</td>
                  </tr>
                  <tr className="bg-[#BFBFBF] text-black">
                    <td className="p-3 border border-gray-500 uppercase">TOTAL FINAL</td>
                    <td className="p-3 border border-gray-500 text-right font-mono">{money(totalFinal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {rows.length === 0 && (
              <p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                A matriz ainda está calculando os dados deste fechamento. Selecione outra aba e volte ao Descritivo de Pagamentos.
              </p>
            )}
          </div>
        );
      })()}

      {/* VIEW 1: MAPA MESTRE DE RATEIO E SALÁRIOS (SEPARADO ENTRE EQUIPE E FORA DA EQUIPE) */}
      {activeSubTab === "visao_geral" && (
        <div className="space-y-8">
          {/* BLOCO 1: MEMBROS DA EQUIPE (SÓCIOS) */}
          <div className="bg-white rounded-[32px] border border-gray-300 shadow-xl overflow-hidden">
            <div className="p-6 border-b border-gray-300 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-emerald-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-700 text-white flex items-center justify-center font-black shadow-md shadow-emerald-600/20">
                  <UserCheck size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-gray-900 text-base uppercase tracking-tight">1. Membros da Equipe HeaRT (Rateio Institucional)</h3>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-600 text-white">
                      Sócios / Equipe
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 font-medium">
                    Participam do rateio de Azambuja, Marieta, Consultório/Particular e dividem despesas corporativas (Soma dos percentuais: {teamSumPercent}%)
                  </p>
                </div>
              </div>
            </div>

            {/* Explanatory Callout Banner */}
            <div className="mx-6 my-3.5 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 rounded-2xl flex items-start gap-3.5 text-xs text-blue-950">
              <Info size={20} className="text-blue-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-black text-blue-900 uppercase tracking-wide block text-[11px]">
                  Regra Contábil de Rateio da Equipe HeaRT:
                </span>
                <p className="leading-relaxed text-blue-900">
                  • <strong>Entradas da Equipe (Azambuja, Marieta, Consultório Particular, Cartão, Dinheiro):</strong> entram no rateio nominal societário de <strong>29% (Rochele), 29% (Thais), 29% (Luis) e 13% (Kathize)</strong>.<br />
                  • <strong>Despesas Operacionais e Fixas (Aluguel Sala, Celular, Consultório Itajaí, DARE, Contador):</strong> utilizam a <strong>PROPORÇÃO HEART</strong> (calculada dinamicamente pelo faturamento recebido por cada sócio no período: 26,79%, 28,97%, 26,79%, 17,45%).
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-emerald-100/60 text-emerald-950 font-black uppercase text-[10px] tracking-wider border-b border-emerald-200">
                    <th className="p-4 pl-6">Médico da Equipe</th>
                    <th className="p-4 text-center">% Nominal (Entradas)</th>
                    <th className="p-4 text-center bg-blue-100/70 text-blue-950">PROPORÇÃO HEART (Despesas)</th>
                    <th className="p-4 text-right">Disponível no Mês</th>
                    <th className="p-4 text-right">Produção Unimed</th>
                    <th className="p-4 text-right">Outras Entradas (Azambuja/Marieta)</th>
                    <th className="p-4 text-right">Ocorrências / Deduções</th>
                    <th className="p-4 text-right">Líquido Produção</th>
                    <th className="p-4 text-right">Divisão / Acertos</th>
                    <th className="p-4 text-right pr-6 bg-emerald-100 text-emerald-950 font-black">Salário Final Reajustado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                  {teamDoctors.map((med) => {
                    const docConfig = configuredDoctors.find(d => d.name === med.nome);
                    const nominalPct = docConfig?.teamSharePercent || med.percent;
                    const dynamicHeartPct = docConfig?.proporcaoHeartDinamica || (med.key === 'kathize' ? 17.45 : med.key === 'thais' ? 28.97 : 26.79);
                    const dispMes = docConfig?.disponivelPeriodo || (med.key === 'thais' ? 39019.05 : med.key === 'kathize' ? 23509.08 : 36086.02);

                    return (
                      <tr key={med.nome} className="hover:bg-emerald-50/30 transition-colors">
                        <td className="p-4 pl-6">
                          <div className="font-black text-gray-900 flex items-center gap-2">
                            <span>{med.nome}</span>
                            <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-emerald-100 text-emerald-800">Membro da Equipe</span>
                          </div>
                          <div className="text-[10px] text-gray-400">
                            {docConfig?.specialty || "Médico Sócio"}
                          </div>
                        </td>
                        <td className="p-4 text-center font-black text-emerald-700">
                          <span className="px-2.5 py-1 bg-emerald-100/70 border border-emerald-200 rounded-lg text-xs font-black">
                            {nominalPct}%
                          </span>
                        </td>
                        <td className="p-4 text-center font-black text-blue-900 bg-blue-50/40">
                          <span className="px-2.5 py-1 bg-blue-100 text-blue-900 border border-blue-200 rounded-lg text-xs font-black">
                            {dynamicHeartPct.toFixed(2)}%
                          </span>
                        </td>
                        <td className="p-4 text-right font-mono font-bold text-gray-700">
                          R$ {dispMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-4 text-right font-bold text-blue-700">
                          R$ {med.producao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-4 text-right text-emerald-600 font-bold">
                          +R$ {med.entradas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-4 text-right text-rose-600 font-bold">
                          {med.saidas > 0 ? `-R$ ${med.saidas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : "-"}
                        </td>
                        <td className="p-4 text-right font-black text-gray-900">
                          R$ {med.liquidoCalculado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-4 text-right text-indigo-600 font-bold">
                          {med.divisaoLucros > 0 ? `+R$ ${med.divisaoLucros.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : "-"}
                        </td>
                        <td className="p-4 text-right pr-6 font-black text-sm text-emerald-800 bg-emerald-50/50">
                          R$ {(Number(med.finalGeral) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* BLOCO 2: MÉDICOS FORA DA EQUIPE (COOPERADOS & PARCEIROS) */}
          <div className="bg-white rounded-[32px] border border-gray-300 shadow-xl overflow-hidden">
            <div className="p-6 border-b border-gray-300 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-slate-700 text-white flex items-center justify-center font-black shadow-md shadow-slate-600/20">
                  <UserX size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-gray-900 text-base uppercase tracking-tight">2. Médicos Fora da Equipe (Cooperados Parceiros)</h3>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-slate-200 text-slate-800">
                      Sem Rateio de Custos Corporativos
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 font-medium">
                    Recebem a sua própria produção Unimed e plantões específicos, deduzindo apenas ocorrências individuais (sem rateio de Marieta/Azambuja/Consultório/Contador)
                  </p>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-black uppercase text-[10px] tracking-wider border-b border-gray-300">
                    <th className="p-4 pl-6">Médico Cooperado</th>
                    <th className="p-4 text-center">Escopo</th>
                    <th className="p-4 text-right">Produção Unimed Própria</th>
                    <th className="p-4 text-right">Outras Entradas Diretas</th>
                    <th className="p-4 text-right">Deduções Próprias (Glosas/Cota)</th>
                    <th className="p-4 text-right">Líquido de Produção</th>
                    <th className="p-4 text-right">Divisão / Acertos</th>
                    <th className="p-4 text-right pr-6 bg-slate-100 text-slate-900 font-black">Valor Final a Receber</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                  {nonTeamDoctors.map((med) => (
                    <tr key={med.nome} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4 pl-6">
                        <div className="font-black text-gray-900 flex items-center gap-2">
                          <span>{med.nome}</span>
                          <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-slate-100 text-slate-600">Cooperado Externo</span>
                        </div>
                        <div className="text-[10px] text-gray-400">
                          {configuredDoctors.find(d => d.name === med.nome)?.specialty || "Médico Cooperado"}
                        </div>
                      </td>
                      <td className="p-4 text-center font-bold text-gray-400">
                        <span className="px-2 py-1 bg-gray-100 rounded-lg text-[10px]">
                          Direto (0% Equipe)
                        </span>
                      </td>
                      <td className="p-4 text-right font-bold text-blue-700">
                        R$ {med.producao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-4 text-right text-emerald-600 font-bold">
                        {med.entradas > 0 ? `+R$ ${med.entradas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : "-"}
                      </td>
                      <td className="p-4 text-right text-rose-600 font-bold">
                        {med.saidas > 0 ? `-R$ ${med.saidas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : "-"}
                      </td>
                      <td className="p-4 text-right font-black text-gray-900">
                        R$ {med.liquidoCalculado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-4 text-right text-indigo-600 font-bold">
                        {med.divisaoLucros > 0 ? `+R$ ${med.divisaoLucros.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : "-"}
                      </td>
                      <td className="p-4 text-right pr-6 font-black text-sm text-gray-900 bg-slate-50/50">
                        R$ {med.finalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {(() => {
                    const ntProd = nonTeamDoctors.reduce((acc, d) => acc + (d.producao || 0), 0);
                    const ntEnt = nonTeamDoctors.reduce((acc, d) => acc + (d.entradas || 0), 0);
                    const ntSai = nonTeamDoctors.reduce((acc, d) => acc + (d.saidas || 0), 0);
                    const ntLiq = nonTeamDoctors.reduce((acc, d) => acc + (d.liquidoCalculado || 0), 0);
                    const ntDiv = nonTeamDoctors.reduce((acc, d) => acc + (d.divisaoLucros || 0), 0);
                    const ntFin = nonTeamDoctors.reduce((acc, d) => acc + (d.finalGeral || 0), 0);
                    return (
                      <tr className="bg-gray-100 font-black text-xs text-gray-900 border-t-2 border-gray-300">
                        <td colSpan={2} className="p-4 pl-6 uppercase">TOTAL GERAL CONSOLIDADO (COOPERADOS)</td>
                        <td className="p-4 text-right text-blue-700">R$ {ntProd.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td className="p-4 text-right text-emerald-700">{ntEnt > 0 ? `+R$ ${ntEnt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : "R$ 0,00"}</td>
                        <td className="p-4 text-right text-rose-700">{ntSai > 0 ? `-R$ ${ntSai.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : "R$ 0,00"}</td>
                        <td className="p-4 text-right">R$ {ntLiq.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td className="p-4 text-right text-indigo-700">{ntDiv > 0 ? `+R$ ${ntDiv.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : "R$ 0,00"}</td>
                        <td className="p-4 text-right pr-6 text-emerald-900 bg-emerald-100/80 font-black text-base">
                          R$ {ntFin.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })()}
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: COLUNAS VERTICAIS POR MÉDICO (EXCEL COLUMN VIEW) */}
      {activeSubTab === "colunas_medicos" && (
        <div className="space-y-4">
          <div className="p-4 bg-sky-50 border border-sky-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm text-sky-950">
              <Users size={18} />
              <div>
                <p className="font-black">Resumo financeiro individual por médico</p>
                <p className="text-xs text-sky-800">Entradas e saídas organizadas conforme a matriz do fechamento {excelData.monthKey}.</p>
              </div>
            </div>
            <span className="text-[10px] uppercase font-black tracking-wider text-sky-700">9 médicos • cartões individuais</span>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {excelData.fechamentoMedicos.map((med: any) => {
              const isTeam = med.isTeamMember;
              const matrixData = getDoctorCardMatrixData(med);
              const entries = Array.isArray(matrixData.incoming) ? matrixData.incoming : [];
              const expenses = Array.isArray(matrixData.expenses) ? matrixData.expenses : [];
              const glosa = Number(matrixData.glosa) || 0;
              const specialty = configuredDoctors.find((d: any) => d.name === med.nome)?.specialty || "Especialidade não informada";
              const isBusy = false;
              return (
                <article key={med.key || med.nome} className={`doctor-share-card bg-white rounded-2xl border shadow-sm overflow-hidden ${isTeam ? "border-emerald-300" : "border-slate-200"}`}>
                  <div className={`px-4 py-4 sm:px-5 flex items-start justify-between gap-3 ${isTeam ? "bg-emerald-50" : "bg-slate-50"}`}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-md ${isTeam ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>
                          {isTeam ? "Membro da equipe" : "Cooperado externo"}
                        </span>
                        {isTeam && <span className="text-[10px] font-bold text-emerald-800">{Number(med.percent) || 0}% nominal</span>}
                      </div>
                      <h3 className="font-black text-slate-950 text-base sm:text-lg leading-tight break-words">{med.nome}</h3>
                      <p className="text-xs text-slate-500 mt-1">{specialty}</p>
                    </div>
                    <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs ${isTeam ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-700"}`}>
                      {isTeam ? "HEART" : "EXT"}
                    </div>
                  </div>

                  <div className="p-4 sm:p-5 space-y-5">
                    <section>
                      <div className="flex items-center justify-between gap-2 border-b border-emerald-100 pb-2 mb-2">
                        <h4 className="text-xs font-black uppercase tracking-wider text-emerald-800">Entradas</h4>
                        <span className="text-[10px] font-bold text-slate-400">TT / disponível (DS)</span>
                      </div>
                      <div className="space-y-1.5">
                        {entries.map((item: any) => (
                          <div key={item.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2 px-3 rounded-lg bg-emerald-50/70">
                            <span className="text-sm font-semibold text-slate-700">{item.label}</span>
                            <div className="text-right">
                              <div className="text-[10px] text-slate-500">TT R$ {moneyLabel(item.tt)}</div>
                              <div className="text-sm font-black text-emerald-800">DS R$ {moneyLabel(item.ds)}</div>
                            </div>
                          </div>
                        ))}
                        {!entries.length && <p className="text-xs text-slate-400 py-3">Nenhuma entrada com valor neste fechamento.</p>}
                      </div>
                      <div className="mt-2 flex justify-between gap-3 border-t border-emerald-200 pt-3">
                        <span className="text-xs font-black uppercase text-slate-600">Total de entradas (DS)</span>
                        <span className="text-sm font-black text-emerald-800">R$ {moneyLabel(matrixData.totalDS)}</span>
                      </div>
                    </section>

                    <section>
                      <div className="flex items-center justify-between gap-2 border-b border-rose-100 pb-2 mb-2">
                        <h4 className="text-xs font-black uppercase tracking-wider text-rose-800">Saídas</h4>
                        <span className="text-[10px] font-bold text-slate-400">Despesas e glosas</span>
                      </div>
                      <div className="space-y-1.5">
                        {expenses.map((item: any) => (
                          <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2 px-3 rounded-lg bg-rose-50/70">
                            <span className="text-sm font-semibold text-slate-700">{item.label}</span>
                            <span className="text-sm font-black text-rose-700">- R$ {moneyLabel(item.amount)}</span>
                          </div>
                        ))}
                        {glosa !== 0 && (
                          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2 px-3 rounded-lg bg-rose-50/70">
                            <span className="text-sm font-semibold text-slate-700">Glosas</span>
                            <span className="text-sm font-black text-rose-700">- R$ {moneyLabel(glosa)}</span>
                          </div>
                        )}
                        {!expenses.length && glosa === 0 && <p className="text-xs text-slate-400 py-3">Nenhuma saída com valor neste fechamento.</p>}
                      </div>
                    </section>

                    <div className={`rounded-xl border px-4 py-4 flex items-center justify-between gap-3 ${isTeam ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-200"}`}>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-600">Valor final líquido</p>
                        <p className="text-[10px] text-slate-500 mt-1">Conforme o fechamento atual</p>
                      </div>
                      <p className={`text-xl font-black tabular-nums ${isTeam ? "text-emerald-900" : "text-slate-950"}`}>R$ {moneyLabel(matrixData.result)}</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void downloadDoctorCardPng(med, matrixData, false).catch((error: any) => alert(error?.message || "Não foi possível gerar a imagem PNG."))}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        <Download size={15} /> Baixar cartão PNG
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void downloadDoctorCardPng(med, matrixData, true).catch((error: any) => alert(error?.message || "Não foi possível compartilhar o cartão."))}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#128C7E] px-3 py-2.5 text-xs font-black text-white hover:bg-[#0e776b] disabled:opacity-50"
                      >
                        <Share2 size={15} /> Enviar pelo WhatsApp
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW 4: OCORRÊNCIAS NO FLUXO DE CAIXA */}
      {activeSubTab === "ocorrencias_fluxo" && (
        <div className="bg-white rounded-[32px] border border-gray-300 shadow-xl overflow-hidden space-y-4">
          <div className="p-6 border-b border-gray-300 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gray-50/70">
            <div>
              <h3 className="font-black text-gray-900 text-base uppercase tracking-tight">Ocorrências Financeiras Lançadas no Fluxo de Caixa</h3>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">
                Detalhamento exato de médico, tipo de despesa, cota parte, glosas e plantões ({filteredOcorrencias.length} lançamentos)
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar tipo de despesa..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="bg-white border border-gray-300 rounded-xl pl-9 pr-3 py-2 text-xs font-bold outline-none w-56 focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <Filter size={14} className="text-gray-400" />
                <select
                  value={selectedDoctorFilter}
                  onChange={e => setSelectedDoctorFilter(e.target.value)}
                  className="bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="ALL">Todos os Médicos & Equipe</option>
                  {configuredDoctors.map(d => (
                    <option key={d.key} value={d.name}>{d.name} {d.isTeamMember ? "(Equipe)" : "(Externo)"}</option>
                  ))}
                  <option value="HEART">EQUIPE HEART</option>
                </select>
              </div>
            </div>
          </div>

          {/* Totais do filtro atual */}
          <div className="px-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl text-xs flex justify-between items-center">
              <span className="text-emerald-800 font-bold">Total Entradas / Remunerações:</span>
              <span className="font-black text-emerald-700">+R$ {totalOcorrenciasEntradas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="p-3 bg-rose-50/50 border border-rose-100 rounded-xl text-xs flex justify-between items-center">
              <span className="text-rose-800 font-bold">Total Saídas / Deduções:</span>
              <span className="font-black text-rose-700">-R$ {totalOcorrenciasSaidas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="p-3 bg-gray-50 border border-gray-300 rounded-xl text-xs flex justify-between items-center">
              <span className="text-gray-700 font-bold">Saldo das Ocorrências:</span>
              <span className={`font-black ${totalOcorrenciasEntradas - totalOcorrenciasSaidas >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                R$ {(totalOcorrenciasEntradas - totalOcorrenciasSaidas).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-100 text-gray-600 font-black uppercase text-[10px] tracking-wider border-b border-gray-300">
                  <th className="p-3.5 pl-6">Data</th>
                  <th className="p-3.5">Lote</th>
                  <th className="p-3.5">Médico / Responsável</th>
                  <th className="p-3.5">Escopo</th>
                  <th className="p-3.5">Tipo de Despesa / Ocorrência</th>
                  <th className="p-3.5">Descrição</th>
                  <th className="p-3.5 text-center">Natureza</th>
                  <th className="p-3.5 text-right pr-6">Valor (R$)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                {filteredOcorrencias.map((oc, idx) => {
                  const isTeam = oc.medico.includes("HEART") || configuredDoctors.find(d => d.name === oc.medico)?.isTeamMember;
                  return (
                    <tr key={idx} className="hover:bg-gray-50/80 transition-colors">
                      <td className="p-3.5 pl-6 text-gray-500 font-bold">{oc.data || oc.date || ""}</td>
                      <td className="p-3.5 font-bold text-blue-700">{oc.lote || "—"}</td>
                      <td className="p-3.5 font-bold text-gray-900">{oc.medico}</td>
                      <td className="p-3.5">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                          isTeam ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-700"
                        }`}>
                          {isTeam ? "Equipe HeaRT" : "Individual Externo"}
                        </span>
                      </td>
                      <td className="p-3.5 font-bold text-gray-700">{oc.tipo}</td>
                      <td className="p-3.5 text-gray-500">{oc.desc}</td>
                      <td className="p-3.5 text-center">
                        <span className={`px-2.5 py-0.5 rounded-md text-[9px] font-black uppercase ${
                          oc.natureza === "ENTRADA" 
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-200" 
                            : "bg-rose-100 text-rose-800 border border-rose-200"
                        }`}>
                          {oc.natureza}
                        </span>
                      </td>
                      <td className={`p-3.5 text-right pr-6 font-black ${
                        oc.natureza === "ENTRADA" ? "text-emerald-600" : "text-rose-600"
                      }`}>
                        {oc.natureza === "ENTRADA" ? "+R$ " : "-R$ "}
                        {oc.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 5: FONTES DE ENTRADA (AZAMBUJA, MARIETA, UNIMED, CONSULTÓRIO) */}
      {activeSubTab === "entradas_fontes" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Unimed Litoral Card */}
          <div className="bg-white rounded-[32px] border border-gray-200 p-6 shadow-md space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-black">
                  <Building2 size={16} />
                </div>
                <div>
                  <h4 className="font-black text-gray-900 uppercase text-sm">Unimed Litoral</h4>
                  <p className="text-[10px] text-gray-400">Cooperativa Médica (Produção Individual de Cada Médico)</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-gray-400 uppercase font-black block">Líquido Recebido:</span>
                <span className="font-black text-blue-700 text-sm">R$ {excelData.fontes.unimed.liquidoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-black uppercase text-gray-400">Rateio por Médico:</span>
              <div className="divide-y divide-gray-50 text-xs">
                {excelData.fontes.unimed.rateio.map(r => (
                  <div key={r.medico} className="py-2 flex justify-between items-center">
                    <span className="font-bold text-gray-800">{r.medico}</span>
                    <span className="font-black text-gray-900">R$ {r.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Marieta Card */}
          <div className="bg-white rounded-[32px] border border-emerald-300 p-6 shadow-md space-y-4 ring-2 ring-emerald-500/10">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-black">
                  <Building2 size={16} />
                </div>
                <div>
                  <h4 className="font-black text-gray-900 uppercase text-sm">Hospital Marieta</h4>
                  <p className="text-[10px] text-emerald-700 font-bold">Exclusivo da Equipe HeaRT (29% / 29% / 29% / 13%)</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-gray-400 uppercase font-black block">Líquido Total:</span>
                <span className="font-black text-emerald-700 text-sm">R$ {excelData.fontes.marieta.liquidoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-black uppercase text-gray-400">Rateio Somente entre Membros da Equipe:</span>
              <div className="divide-y divide-gray-50 text-xs">
                {excelData.fontes.marieta.rateio.map(r => (
                  <div key={r.medico} className="py-2 flex justify-between items-center bg-emerald-50/30 px-3 rounded-lg">
                    <span className="font-bold text-gray-800">{r.medico}</span>
                    <span className="font-black text-emerald-800">R$ {r.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Azambuja Card */}
          <div className="bg-white rounded-[32px] border border-emerald-300 p-6 shadow-md space-y-4 ring-2 ring-emerald-500/10">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center font-black">
                  <Building2 size={16} />
                </div>
                <div>
                  <h4 className="font-black text-gray-900 uppercase text-sm">Hospital Azambuja</h4>
                  <p className="text-[10px] text-purple-700 font-bold">Exclusivo da Equipe HeaRT (Plantões e Retaguarda)</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-gray-400 uppercase font-black block">Líquido Total:</span>
                <span className="font-black text-purple-700 text-sm">R$ {excelData.fontes.azambuja.liquidoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-black uppercase text-gray-400">Rateio Somente entre Membros da Equipe:</span>
              <div className="divide-y divide-gray-50 text-xs">
                {excelData.fontes.azambuja.rateio.map(r => (
                  <div key={r.medico} className="py-2 flex justify-between items-center bg-purple-50/30 px-3 rounded-lg">
                    <span className="font-bold text-gray-800">{r.medico}</span>
                    <span className="font-black text-purple-800">R$ {r.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Consultório / Particular Card */}
          <div className="bg-white rounded-[32px] border border-emerald-300 p-6 shadow-md space-y-4 ring-2 ring-emerald-500/10">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-black">
                  <Wallet size={16} />
                </div>
                <div>
                  <h4 className="font-black text-gray-900 uppercase text-sm">Consultório & Particular</h4>
                  <p className="text-[10px] text-amber-700 font-bold">Exclusivo da Equipe (Dinheiro, Cartão e Unimed Luis)</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-gray-400 uppercase font-black block">Total Recebido:</span>
                <span className="font-black text-amber-700 text-sm">R$ {excelData.fontes.consultorio.totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div className="p-3 bg-gray-50 rounded-2xl flex justify-between text-xs">
                <span className="text-gray-600 font-bold">Espécie / Dinheiro:</span>
                <span className="font-black text-gray-900">R$ {excelData.fontes.consultorio.dinheiro.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="p-3 bg-gray-50 rounded-2xl flex justify-between text-xs">
                <span className="text-gray-600 font-bold">Cartão de Crédito/Débito:</span>
                <span className="font-black text-gray-900">R$ {excelData.fontes.consultorio.cartao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="p-3 bg-blue-50/50 rounded-2xl flex justify-between text-xs border border-blue-100">
                <span className="text-blue-700 font-bold">Unimed Dr. Luis:</span>
                <span className="font-black text-blue-900">R$ {excelData.fontes.consultorio.unimedLuis.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 6: LOTES UNIMED */}
      {activeSubTab === "lotes_unimed" && (
        <div className="bg-white rounded-[32px] border border-gray-200 shadow-xl overflow-hidden space-y-4">
          <div className="p-6 border-b border-gray-100 bg-gray-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-black text-gray-900 text-base uppercase tracking-tight">Demonstrativo de Notas & Lotes Unimed</h3>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Cruzamento de Notas Fiscais, Retenções Tributárias Federais e Glosas (Montado a partir do Demonstrativo de Produção importado)</p>
            </div>
            <button type="button" onClick={() => { setManualNote({ lote: "", competencia: details?.closing?.monthKey || excelData?.monthKey || "", tipo: "Produção Estruturada", titulo: "", vencimento: "", bruto: "", glosa: "0", liquido: "" }); setManualNoteMessage(""); setIsManualNoteOpen(true); }} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl inline-flex items-center gap-2"><Plus size={14} /> Lançar nota manualmente</button>
            {removedLotes.length > 0 && (
              <button
                onClick={handleRestoreLotes}
                className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-black rounded-xl transition-colors"
              >
                Restaurar Notas Removidas ({removedLotes.length})
              </button>
            )}
          </div>

          {(() => {
            const lots = (Array.isArray(details?.taxes) ? details.taxes : []).filter((item: any) => item.bruto !== undefined && item.liquido !== undefined);
            const operational = production.reduce((sum: number, item: any) => sum + (Number(item.operationalValue) || 0), 0);
            const film = production.reduce((sum: number, item: any) => sum + (Number(item.filmValue) || 0), 0);
            const lotProductionBase = lots.reduce((sum: number, lot: any) => sum + (Number(lot.bruto) || 0), 0);
            const productionBase = lotProductionBase > 0 ? lotProductionBase + operational + film : production.reduce((sum: number, item: any) => sum + (Number(item.honorValue) || 0) + (Number(item.operationalValue) || 0) + (Number(item.filmValue) || 0), 0);
            const officialNet = lots.reduce((sum: number, lot: any) => sum + (Number(lot.netReported ?? lot.liquido) || 0), 0);
            const money = (value: number) => (Number(value) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const setPercent = (key: keyof typeof noteSettings, value: number) => setNoteSettings(current => ({ ...current, [key]: value }));
            const irrf = Math.round(productionBase * noteSettings.irrfPercent) / 100;
            const pis = Math.round(productionBase * noteSettings.pisPercent) / 100;
            const cofins = Math.round(productionBase * noteSettings.cofinsPercent) / 100;
            const csll = Math.round(productionBase * noteSettings.csllPercent) / 100;
            const taxes = irrf + pis + cofins + csll;
            const presumedProfit = Math.round(productionBase * noteSettings.lucroPresumidoPercent) / 100;
            const irpj = Math.max(0, Math.round((presumedProfit * noteSettings.irpjPercent / 100 - irrf) * 100) / 100);
            const csll9 = Math.max(0, Math.round((presumedProfit * noteSettings.csll9Percent / 100 - csll) * 100) / 100);
            const adicional = Math.round(presumedProfit * noteSettings.adicional10Percent) / 100;
            const reserve = irpj + csll9 + adicional;
            const totalRetention = Math.round((taxes + reserve * noteSettings.reservaRetencaoPercent / 100) * 100) / 100;
            const internalDS = Math.round((productionBase - noteSettings.cotaParte - noteSettings.otherDeductions - totalRetention - reserve) * 100) / 100;
            const fields: { key: keyof typeof noteSettings; label: string }[] = [
              { key: "irrfPercent", label: "IRRF %" }, { key: "pisPercent", label: "PIS %" },
              { key: "cofinsPercent", label: "COFINS %" }, { key: "csllPercent", label: "CSLL retida %" },
              { key: "lucroPresumidoPercent", label: "Base lucro presumido %" }, { key: "irpjPercent", label: "IRPJ %" },
              { key: "csll9Percent", label: "CSLL adicional %" }, { key: "adicional10Percent", label: "Adicional %" },
              { key: "reservaRetencaoPercent", label: "Reserva na retenção %" }
            ];
            return (
              <div className="mx-4 mb-4 p-5 rounded-2xl border border-emerald-200 bg-emerald-50/50 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div><h4 className="font-black text-gray-900 uppercase text-sm">Dados da Nota e Cálculo do DS</h4><p className="text-xs text-gray-500 mt-1">Parâmetros salvos por fechamento. O líquido oficial permanece separado do DS interno.</p></div>
                  <button type="button" onClick={saveNoteSettings} disabled={savingNoteSettings} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black">{savingNoteSettings ? "Salvando..." : "Salvar parâmetros"}</button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 bg-white border rounded-xl"><span className="text-[10px] uppercase font-bold text-gray-500">Valor-base da nota</span><div className="font-black text-gray-900">R$ {money(productionBase)}</div></div>
                  <div className="p-3 bg-white border rounded-xl"><span className="text-[10px] uppercase font-bold text-gray-500">Líquido oficial Unimed</span><div className="font-black text-blue-800">R$ {money(officialNet)}</div></div>
                  <div className="p-3 bg-white border rounded-xl"><span className="text-[10px] uppercase font-bold text-gray-500">Operacional + filme adicionados</span><div className="font-black text-emerald-700">R$ {money(operational + film)}</div></div>
                  <div className="p-3 bg-emerald-100 border border-emerald-200 rounded-xl"><span className="text-[10px] uppercase font-bold text-emerald-800">DS interno calculado</span><div className="font-black text-emerald-900 text-lg">R$ {money(internalDS)}</div></div>
                </div>
                <div><h5 className="text-xs font-black uppercase text-gray-700 mb-2">Percentuais editáveis</h5><div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {fields.map(field => <label key={field.key} className="text-[11px] font-bold text-gray-600">{field.label}<div className="flex items-center mt-1"><input type="number" min="0" step="0.01" value={noteSettings[field.key]} onChange={event => setPercent(field.key, Number(event.target.value))} className="w-full min-w-0 p-2 rounded-lg border border-gray-300 bg-white text-gray-900" /><span className="ml-1">%</span></div></label>)}
                </div></div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="text-xs font-bold text-gray-600">Capitalização cota-parte (R$)<input type="number" min="0" step="0.01" value={noteSettings.cotaParte} onChange={event => setPercent("cotaParte", Number(event.target.value))} className="block w-full mt-1 p-2 rounded-lg border border-gray-300 bg-white text-gray-900" /></label>
                  <label className="text-xs font-bold text-gray-600">Outras deduções (R$)<input type="number" min="0" step="0.01" value={noteSettings.otherDeductions} onChange={event => setPercent("otherDeductions", Number(event.target.value))} className="block w-full mt-1 p-2 rounded-lg border border-gray-300 bg-white text-gray-900" /></label>
                  <div className="p-3 bg-white border rounded-xl text-xs space-y-1"><div className="flex justify-between"><span>Impostos retidos</span><b>R$ {money(taxes)}</b></div><div className="flex justify-between"><span>Reserva (IRPJ + CSLL + adicional)</span><b>R$ {money(reserve)}</b></div><div className="flex justify-between"><span>TT retenção calculada</span><b>R$ {money(totalRetention)}</b></div></div>
                </div>
                <p className="text-[11px] text-gray-500">DS interno = produção total (incluindo operacional e filme) − cota-parte − outras deduções − TT retenção − reserva de impostos. Os percentuais e deduções são editáveis.</p>
                {noteSettingsMessage && <p className={noteSettingsMessage.includes("salvas") ? "text-xs font-bold text-emerald-700" : "text-xs font-bold text-rose-700"}>{noteSettingsMessage}</p>}
              </div>
            );
          })()}
          {isManualNoteOpen && (
            <div className="mx-4 mb-4 p-5 rounded-2xl border border-emerald-200 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-4"><div><h4 className="font-black text-gray-900 text-sm uppercase">Nova nota manual</h4><p className="text-xs text-gray-500 mt-1">Cadastre uma nota mesmo sem CSV. Os valores entram nos totais deste fechamento.</p></div><button type="button" onClick={() => setIsManualNoteOpen(false)} className="px-3 py-2 rounded-lg border text-xs font-bold">Cancelar</button></div>
              <form onSubmit={async (event) => {
                event.preventDefault();
                if (!selectedClosingId) { setManualNoteMessage("Selecione um fechamento antes de lançar a nota."); return; }
                setSavingManualNote(true); setManualNoteMessage("");
                try {
                  const response = await apiFetch("/api/app/financial/closings/" + selectedClosingId + "/manual-note", { method: "POST", body: JSON.stringify({ note: { ...manualNote, bruto: Number(manualNote.bruto), glosa: Number(manualNote.glosa || 0), liquido: manualNote.liquido === "" ? undefined : Number(manualNote.liquido) } }) });
                  const data = await response.json().catch(() => ({}));
                  if (!response.ok) throw new Error(data.error || "Não foi possível salvar a nota.");
                  const detailsRes = await apiFetch("/api/app/financial/closings/" + selectedClosingId + "/details");
                  if (detailsRes.ok) setDetails(await detailsRes.json());
                  setIsManualNoteOpen(false); setManualNoteMessage("Nota manual salva com sucesso.");
                } catch (error: any) { setManualNoteMessage(error?.message || "Erro ao salvar nota manual."); } finally { setSavingManualNote(false); }
              }} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {([{ key: "lote", label: "Número da nota/lote", required: true }, { key: "competencia", label: "Competência" }, { key: "tipo", label: "Período / natureza" }, { key: "titulo", label: "Título" }, { key: "vencimento", label: "Vencimento" }, { key: "bruto", label: "Bruto (R$)", required: true }, { key: "glosa", label: "Glosas (R$)" }, { key: "liquido", label: "Líquido oficial (R$), opcional" }] as any[]).map((field) => (
                  <label key={field.key} className="text-xs font-bold text-gray-700">{field.label}<input required={field.required} type={["bruto", "glosa", "liquido"].includes(field.key) ? "number" : "text"} min={["bruto", "glosa", "liquido"].includes(field.key) ? "0" : undefined} step={["bruto", "glosa", "liquido"].includes(field.key) ? "0.01" : undefined} value={(manualNote as any)[field.key]} onChange={(event) => setManualNote(current => ({ ...current, [field.key]: event.target.value }))} className="block w-full mt-1 p-2.5 rounded-lg border border-gray-300 bg-white text-gray-900 font-medium" /></label>
                ))}
                <div className="sm:col-span-2 lg:col-span-4 flex items-center justify-between gap-3"><p className="text-[11px] text-gray-500">Os impostos e o DS usam as alíquotas configuradas para este fechamento.</p><button disabled={savingManualNote} type="submit" className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-black disabled:opacity-50">{savingManualNote ? "Salvando..." : "Salvar nota"}</button></div>
              </form>{manualNoteMessage && <p className="mt-3 text-xs font-bold text-rose-700">{manualNoteMessage}</p>}
            </div>
          )}
          {manualNoteMessage && !isManualNoteOpen && <p className="mx-4 mb-3 text-xs font-bold text-emerald-700">{manualNoteMessage}</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="bg-gray-100 text-gray-700 font-black uppercase text-[9px] tracking-wider border-b border-gray-200">
                  <th className="p-3 pl-4">Lote</th>
                  <th className="p-3">Arquivo de origem</th>
                  <th className="p-3">Comp.</th>
                  <th className="p-3">Período / Natureza</th>
                  <th className="p-3">Título</th>
                  <th className="p-3">Vencimento</th>
                  <th className="p-3 text-right">Bruto CSV (R$)</th>
                  <th className="p-3 text-right">Outros Valores PDF (R$)</th>
                  <th className="p-3 text-right font-black">Total (R$)</th>
                  <th className="p-3 text-right">Glosas</th>
                  <th className="p-2 text-right">PIS % / R$</th>
                  <th className="p-2 text-right">COFINS % / R$</th>
                  <th className="p-2 text-right">CSLL % / R$</th>
                  <th className="p-2 text-right">IRRF % / R$</th>
                  <th className="p-2 text-right">ISS % / R$</th>
                  <th className="p-3 text-right font-black">TT Impostos</th>
                  <th className="p-3 text-right font-black">TT Retenção</th>
                  <th className="p-2 text-right">Lucro Presum. % / R$</th>
                  <th className="p-2 text-right">IRPJ % / R$</th>
                  <th className="p-2 text-right">CSLL 9% / R$</th>
                  <th className="p-2 text-right">ADD % / R$</th>
                  <th className="p-3 text-right">Reserva Imp.</th>
                  <th className="p-3 text-right bg-blue-50 font-black text-blue-900">Líquido oficial (R$)</th>
                  <th className="p-3 text-right bg-emerald-50 font-black text-emerald-900">DS saque (R$)</th>
                  <th className="p-3 text-center pr-4">Remover</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                {excelData.lotesUnimed.length === 0 ? (
                  <tr>
                    <td colSpan={25} className="p-12 text-center">
                      <div className="max-w-md mx-auto space-y-3">
                        <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                          <BrainCircuit size={24} />
                        </div>
                        <div>
                          <p className="text-gray-700 font-black text-sm">Nenhum lote/demonstrativo Unimed no fechamento {excelData.monthKey}</p>
                          <p className="text-gray-400 text-xs font-medium mt-1">Importe o arquivo 10944_PROD.PDF para preencher automaticamente as notas, retenções e ocorrências financeiras.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (onOpenImport) onOpenImport();
                            else setIsImportModalOpen(true);
                          }}
                          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider shadow-md shadow-emerald-500/20 active:scale-95 transition cursor-pointer"
                        >
                          <Sparkles size={14} className="text-amber-300" />
                          <span>Importar PDF deste Fechamento</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  excelData.lotesUnimed.map((lote: any) => (
                    <tr key={lote.lote} className="hover:bg-blue-50/20 transition-colors">
                      <td className="p-3 pl-4 font-black text-gray-900">{lote.lote}</td>
                      <td className="p-3 min-w-[130px]">
                        {lote.sourceFileUrl ? (
                          <a href={lote.sourceFileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-900 underline font-bold" title={lote.sourceDocument || "Abrir arquivo importado"}>
                            <FileText size={13} /> Abrir arquivo
                          </a>
                        ) : (
                          <span className="text-gray-400" title={lote.sourceDocument || "Arquivo original não foi armazenado nesta importação"}>{lote.sourceDocument || (lote.manualEntry ? "Lançamento manual" : "Não disponível")}</span>
                        )}
                      </td>
                      <td className="p-3 text-gray-600">{lote.competencia}</td>
                      <td className="p-3 font-bold text-gray-700">{lote.tipo}</td>
                      <td className="p-3 font-mono text-gray-600">{lote.titulo}</td>
                      <td className="p-3 text-gray-500">{lote.vencimento}</td>
                      <td className="p-3 text-right font-bold text-gray-900">R$ {lote.bruto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right font-bold text-indigo-700">R$ {lote.outrosValores.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right font-black text-emerald-800 bg-emerald-50/50">R$ {lote.totalNota.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right text-rose-600 font-bold">{lote.glosa > 0 ? `-R$ ${lote.glosa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : "-"}</td>
                      <td className="p-2 text-right text-gray-700 whitespace-nowrap">
                        <input aria-label={`pis aliquota lote ${lote.lote}`} type="number" min="0" step="0.01" value={lote.aliquotas.pis} onChange={event => setLoteAliquotas(current => ({ ...current, [String(lote.lote)]: { ...(current[String(lote.lote)] || {}), pis: Number(event.target.value) } }))} className="w-14 p-1 text-right border border-gray-200 rounded text-[10px]" />%
                        <div className="font-bold">R$ {lote.pis.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                      </td>
                      <td className="p-2 text-right text-gray-700 whitespace-nowrap">
                        <input aria-label={`cofins aliquota lote ${lote.lote}`} type="number" min="0" step="0.01" value={lote.aliquotas.cofins} onChange={event => setLoteAliquotas(current => ({ ...current, [String(lote.lote)]: { ...(current[String(lote.lote)] || {}), cofins: Number(event.target.value) } }))} className="w-14 p-1 text-right border border-gray-200 rounded text-[10px]" />%
                        <div className="font-bold">R$ {lote.cofins.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                      </td>
                      <td className="p-2 text-right text-gray-700 whitespace-nowrap">
                        <input aria-label={`csll aliquota lote ${lote.lote}`} type="number" min="0" step="0.01" value={lote.aliquotas.csll} onChange={event => setLoteAliquotas(current => ({ ...current, [String(lote.lote)]: { ...(current[String(lote.lote)] || {}), csll: Number(event.target.value) } }))} className="w-14 p-1 text-right border border-gray-200 rounded text-[10px]" />%
                        <div className="font-bold">R$ {lote.csll.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                      </td>
                      <td className="p-2 text-right text-gray-700 whitespace-nowrap">
                        <input aria-label={`irrf aliquota lote ${lote.lote}`} type="number" min="0" step="0.01" value={lote.aliquotas.irrf} onChange={event => setLoteAliquotas(current => ({ ...current, [String(lote.lote)]: { ...(current[String(lote.lote)] || {}), irrf: Number(event.target.value) } }))} className="w-14 p-1 text-right border border-gray-200 rounded text-[10px]" />%
                        <div className="font-bold">R$ {lote.irrf.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                      </td>
                      <td className="p-2 text-right text-gray-700 whitespace-nowrap">
                        <input aria-label={`iss aliquota lote ${lote.lote}`} type="number" min="0" step="0.01" value={lote.aliquotas.iss} onChange={event => setLoteAliquotas(current => ({ ...current, [String(lote.lote)]: { ...(current[String(lote.lote)] || {}), iss: Number(event.target.value) } }))} className="w-14 p-1 text-right border border-gray-200 rounded text-[10px]" />%
                        <div className="font-bold">R$ {lote.iss.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                      </td>
                      <td className="p-3 text-right font-black text-gray-700">R$ {lote.ttImpostosNota.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right font-black text-purple-700">R$ {lote.ttRetencao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="p-2 text-right text-gray-700 whitespace-nowrap">
                        <input aria-label={`lucroPresumido aliquota lote ${lote.lote}`} type="number" min="0" step="0.01" value={lote.aliquotas.lucroPresumido} onChange={event => setLoteAliquotas(current => ({ ...current, [String(lote.lote)]: { ...(current[String(lote.lote)] || {}), lucroPresumido: Number(event.target.value) } }))} className="w-14 p-1 text-right border border-gray-200 rounded text-[10px]" />%
                        <div className="font-bold">R$ {lote.lucroPresumido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                      </td>
                      <td className="p-2 text-right text-gray-700 whitespace-nowrap">
                        <input aria-label={`irpj aliquota lote ${lote.lote}`} type="number" min="0" step="0.01" value={lote.aliquotas.irpj} onChange={event => setLoteAliquotas(current => ({ ...current, [String(lote.lote)]: { ...(current[String(lote.lote)] || {}), irpj: Number(event.target.value) } }))} className="w-14 p-1 text-right border border-gray-200 rounded text-[10px]" />%
                        <div className="font-bold">R$ {lote.irpj.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                      </td>
                      <td className="p-2 text-right text-gray-700 whitespace-nowrap">
                        <input aria-label={`csll9 aliquota lote ${lote.lote}`} type="number" min="0" step="0.01" value={lote.aliquotas.csll9} onChange={event => setLoteAliquotas(current => ({ ...current, [String(lote.lote)]: { ...(current[String(lote.lote)] || {}), csll9: Number(event.target.value) } }))} className="w-14 p-1 text-right border border-gray-200 rounded text-[10px]" />%
                        <div className="font-bold">R$ {lote.csll9.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                      </td>
                      <td className="p-2 text-right text-gray-700 whitespace-nowrap">
                        <input aria-label={`adicional aliquota lote ${lote.lote}`} type="number" min="0" step="0.01" value={lote.aliquotas.adicional} onChange={event => setLoteAliquotas(current => ({ ...current, [String(lote.lote)]: { ...(current[String(lote.lote)] || {}), adicional: Number(event.target.value) } }))} className="w-14 p-1 text-right border border-gray-200 rounded text-[10px]" />%
                        <div className="font-bold">R$ {lote.add10.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                      </td>
                      <td className="p-3 text-right text-amber-700 font-bold">R$ {lote.reservaImposto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right font-black text-blue-700 bg-blue-50/50">
                        R$ {lote.liquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2 text-right font-black text-emerald-800 bg-emerald-50/50 whitespace-nowrap">
                        <div>R$ {lote.dsSaque.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                        <label className="text-[9px] font-normal text-gray-500">Cota-parte R$
                          <input type="number" min="0" step="0.01" value={Number(loteAliquotas[String(lote.lote)]?.cotaParte) || 0} onChange={event => setLoteAliquotas(current => ({ ...current, [String(lote.lote)]: { ...(current[String(lote.lote)] || {}), cotaParte: Number(event.target.value) } }))} className="w-20 ml-1 p-1 border border-gray-200 rounded bg-white text-right" />
                        </label>
                      </td>
                      <td className="p-3 text-center pr-4">
                        <button
                          onClick={() => handleRemoveLote(lote.lote)}
                          className="p-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg transition-colors inline-flex items-center gap-1 font-bold text-[10px]"
                          title="Remover nota do fechamento"
                        >
                          <Trash2 size={14} /> Remover
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                {(() => {
                  const totBruto = excelData.lotesUnimed.reduce((acc, l) => acc + l.bruto, 0);
                  const totOutros = excelData.lotesUnimed.reduce((acc, l) => acc + l.outrosValores, 0);
                  const totTotal = excelData.lotesUnimed.reduce((acc, l) => acc + l.totalNota, 0);
                  const totGlosa = excelData.lotesUnimed.reduce((acc, l) => acc + l.glosa, 0);
                  const totIrrf = excelData.lotesUnimed.reduce((acc, l) => acc + l.irrf, 0);
                  const totIss = excelData.lotesUnimed.reduce((acc, l) => acc + l.iss, 0);
                  const totDS = excelData.lotesUnimed.reduce((acc, l) => acc + l.dsSaque, 0);
                  const totPis = excelData.lotesUnimed.reduce((acc, l) => acc + l.pis, 0);
                  const totCofins = excelData.lotesUnimed.reduce((acc, l) => acc + l.cofins, 0);
                  const totCsll = excelData.lotesUnimed.reduce((acc, l) => acc + l.csll, 0);
                  const totImp = excelData.lotesUnimed.reduce((acc, l) => acc + l.ttImpostosNota, 0);
                  const totRet = excelData.lotesUnimed.reduce((acc, l) => acc + l.ttRetencao, 0);
                  const totLucro = excelData.lotesUnimed.reduce((acc, l) => acc + l.lucroPresumido, 0);
                  const totIrpj = excelData.lotesUnimed.reduce((acc, l) => acc + l.irpj, 0);
                  const totCsll9 = excelData.lotesUnimed.reduce((acc, l) => acc + l.csll9, 0);
                  const totAdd10 = excelData.lotesUnimed.reduce((acc, l) => acc + l.add10, 0);
                  const totReserva = excelData.lotesUnimed.reduce((acc, l) => acc + l.reservaImposto, 0);
                  const totLiq = excelData.lotesUnimed.reduce((acc, l) => acc + l.liquido, 0);
                  return (
                    <tr className="bg-gray-100 font-black text-xs text-gray-900 border-t-2 border-gray-300">
                      <td colSpan={6} className="p-3 pl-4 uppercase">TOTAL CONSOLIDADO DOS LOTES</td>
                      <td className="p-3 text-right">R$ {totBruto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right text-indigo-700">R$ {totOutros.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right font-black text-emerald-800">R$ {totTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right text-rose-600">{totGlosa > 0 ? `-R$ ${totGlosa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : "-"}</td>
                      <td className="p-3 text-right">R$ {totPis.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right">R$ {totCofins.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right">R$ {totCsll.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right">R$ {totIrrf.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right">R$ {totIss.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right">R$ {totImp.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right text-purple-800">R$ {totRet.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right">R$ {totLucro.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right">R$ {totIrpj.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right">R$ {totCsll9.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right">R$ {totAdd10.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right text-amber-800">R$ {totReserva.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right text-blue-800 bg-blue-100 font-black text-sm">
                        R$ {totLiq.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 text-right text-emerald-800 bg-emerald-100 font-black text-sm">
                        R$ {totDS.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3"></td>
                    </tr>
                  );
                })()}
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 7: DESPESAS DA EQUIPE HEART COM RATEIO PELA PROPORÇÃO HEART */}
      {activeSubTab === "despesas_equipe" && (
        <div className="bg-white rounded-[32px] border border-gray-200 shadow-xl overflow-hidden space-y-4">
          <div className="p-6 border-b border-gray-100 bg-gray-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-gray-900 text-base uppercase tracking-tight">Despesas Corporativas & Operacionais (Equipe HeaRT)</h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-blue-100 text-blue-800">
                  Rateio via PROPORÇÃO HEART
                </span>
              </div>
              <p className="text-xs text-gray-500 font-medium mt-1">
                Custos fixos, infraestrutura e tributos rateados dinamicamente entre os sócios conforme a coluna <strong>PROPORÇÃO HEART</strong> do período:
                <span className="font-bold text-gray-700 ml-1">
                  Rochele ({configuredDoctors.find(d => d.key === 'rochele')?.proporcaoHeartDinamica || 26.79}%), 
                  Thais ({configuredDoctors.find(d => d.key === 'thais')?.proporcaoHeartDinamica || 28.97}%), 
                  Luis ({configuredDoctors.find(d => d.key === 'luis')?.proporcaoHeartDinamica || 26.79}%), 
                  Kathize ({configuredDoctors.find(d => d.key === 'kathize')?.proporcaoHeartDinamica || 17.45}%)
                </span>
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-gray-400 uppercase font-bold block">Total Despesas Equipe:</span>
              <span className="font-black text-rose-600 text-base">R$ {excelData.despesasEquipe.reduce((sum, item) => sum + (Number(item.valor) || 0), 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-100 text-gray-700 font-black uppercase text-[10px] tracking-wider border-b border-gray-200">
                  <th className="p-3.5 pl-6">Despesa / Item</th>
                  <th className="p-3.5">Categoria</th>
                  <th className="p-3.5 text-right font-black">Valor Total (R$)</th>
                  <th className="p-3.5 text-right text-emerald-800 bg-emerald-50/50">Drª Rochele (26,79%)</th>
                  <th className="p-3.5 text-right text-emerald-800 bg-emerald-50/50">Drª Thais (28,97%)</th>
                  <th className="p-3.5 text-right text-emerald-800 bg-emerald-50/50">Dr Luis (26,79%)</th>
                  <th className="p-3.5 text-right text-emerald-800 bg-emerald-50/50">Drª Kathize (17,45%)</th>
                  <th className="p-3.5 text-center pr-6">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                {excelData.despesasEquipe.map((d, idx) => {
                  const val = d.valor;
                  const pRochele = configuredDoctors.find(x => x.key === 'rochele')?.proporcaoHeartDinamica || 26.79;
                  const pThais = configuredDoctors.find(x => x.key === 'thais')?.proporcaoHeartDinamica || 28.97;
                  const pLuis = configuredDoctors.find(x => x.key === 'luis')?.proporcaoHeartDinamica || 26.79;
                  const pKathize = configuredDoctors.find(x => x.key === 'kathize')?.proporcaoHeartDinamica || 17.45;

                  const rRochele = (val * pRochele) / 100;
                  const rThais = (val * pThais) / 100;
                  const rLuis = (val * pLuis) / 100;
                  const rKathize = (val * pKathize) / 100;

                  return (
                    <tr key={idx} className="hover:bg-rose-50/20 transition-colors">
                      <td className="p-3.5 pl-6 font-bold text-gray-900">{d.despesa}</td>
                      <td className="p-3.5 text-gray-600 font-medium">{d.categoria}</td>
                      <td className="p-3.5 text-right font-black text-rose-600">
                        -R$ {val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3.5 text-right font-mono text-[11px] text-gray-700 bg-emerald-50/20">
                        -R$ {rRochele.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3.5 text-right font-mono text-[11px] text-gray-700 bg-emerald-50/20">
                        -R$ {rThais.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3.5 text-right font-mono text-[11px] text-gray-700 bg-emerald-50/20">
                        -R$ {rLuis.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3.5 text-right font-mono text-[11px] text-gray-700 bg-emerald-50/20">
                        -R$ {rKathize.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3.5 text-center pr-6">
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md text-[9px] font-black uppercase">
                          {d.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSubTab === "glosas" && (
        <div className="bg-white rounded-[28px] border border-gray-200 shadow-sm p-4 sm:p-6">
          <GlosasView />
        </div>
      )}

      {/* VIEW 8: GERENCIADOR DE TIPOS DE LANÇAMENTO */}
      {activeSubTab === "tipos_lancamento" && (
        <div className="bg-white rounded-[32px] border border-gray-200 shadow-xl overflow-hidden p-2">
          <TransactionTypesManager />
        </div>
      )}

      {/* VIEW 9: GERENCIADOR DE PRESTADORES */}
      {activeSubTab === "config_prestadores" && (
        <div className="bg-white rounded-[32px] border border-gray-200 shadow-xl overflow-hidden p-6">
          <ProviderLinker doctors={doctors} />
        </div>
      )}

      {activeSubTab === "lancamentos_importados" && (
        <div className="space-y-6">
          <div className="bg-white rounded-[28px] border border-gray-200 shadow-sm p-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
              <div>
                <h3 className="text-xl font-black text-gray-900 uppercase">Lançamentos Importados</h3>
                <p className="text-sm text-gray-500 mt-1">Confira os registros de cada arquivo antes de removê-lo. Só é possível excluir importações vinculadas a fechamentos abertos.</p>
              </div>
              <button type="button" onClick={removeAllOpenImports} disabled={deletingAllImports || loadingFinancialImports || !financialImports.some(isImportClosingOpen)} className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black disabled:opacity-40">
                <Trash2 size={15} /> {deletingAllImports ? "Removendo importações..." : "Remover todas dos fechamentos abertos"}
              </button>
            </div>
            {importManagementMessage && <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 text-blue-900 px-4 py-3 text-sm font-semibold">{importManagementMessage}</div>}
            {loadingFinancialImports ? (
              <div className="py-12 text-center text-gray-500"><Loader2 className="animate-spin inline mr-2" size={18} />Carregando importações...</div>
            ) : financialImports.length === 0 ? (
              <div className="py-12 text-center text-gray-500"><FileText className="mx-auto mb-3 text-gray-300" size={34} /><p className="font-bold">Nenhuma importação de CSV ou planilha encontrada.</p></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-900 text-white text-[10px] uppercase tracking-wider">
                    <tr><th className="p-3">Arquivo</th><th className="p-3">Fechamento</th><th className="p-3">Data da importação</th><th className="p-3">Lançamentos</th><th className="p-3">Situação</th><th className="p-3 text-right">Ações</th></tr>
                  </thead>
                  <tbody>
                    {financialImports.map((item: any) => {
                      const open = isImportClosingOpen(item);
                      return (
                        <tr key={item.id} className={`border-b border-gray-100 ${selectedImportId === item.id ? "bg-emerald-50" : "hover:bg-gray-50"}`}>
                          <td className="p-3 font-bold text-gray-900 min-w-[220px] break-all">{item.fileName || item.batch || item.id}</td>
                          <td className="p-3 whitespace-nowrap">{item.closingMonthKey || item.closingId}</td>
                          <td className="p-3 whitespace-nowrap">{item.importedAt ? new Date(item.importedAt).toLocaleString("pt-BR") : "-"}</td>
                          <td className="p-3 tabular-nums">{Number(item.recordCount ?? item.recordsCreated ?? 0).toLocaleString("pt-BR")}</td>
                          <td className="p-3"><span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black ${open ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>{open ? "FECHAMENTO ABERTO" : "BLOQUEADO: FECHADO"}</span></td>
                          <td className="p-3"><div className="flex justify-end gap-2">
                            <button type="button" onClick={() => openImportedRecords(item.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50"><Eye size={14} /> Ver lançamentos</button>
                            <button type="button" onClick={() => removeImportedFile(item)} disabled={!open || deletingImportId === item.id || deletingAllImports} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-35 disabled:cursor-not-allowed"><Trash2 size={14} /> {deletingImportId === item.id ? "Removendo..." : "Remover"}</button>
                          </div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {selectedImportId && (
            <div className="bg-white rounded-[28px] border border-gray-200 shadow-sm p-6">
              {loadingImportDetails ? (
                <div className="py-10 text-center text-gray-500"><Loader2 className="animate-spin inline mr-2" size={18} />Carregando lançamentos vinculados...</div>
              ) : selectedImportDetails ? (() => {
                const detail = selectedImportDetails;
                const records = [
                  ...(detail.production || []), ...(detail.glosas || []), ...(detail.taxes || []),
                  ...(detail.adjustments || []), ...(detail.transactions || []), ...(detail.batches || []),
                  ...(detail.reconciliation || [])
                ];
                const money = (value: any) => value === undefined || value === null || value === "" || !Number.isFinite(Number(value)) ? "-" : "R$ " + Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                const recordValue = (r: any) => r.value ?? r.amount ?? r.honorarios ?? r.productionValue ?? r.taxValue ?? r.glosaValue ?? r.netValue ?? r.baseValue;
                return (
                  <>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                      <div><h4 className="text-lg font-black text-gray-900">Lançamentos de {detail.import?.fileName || selectedImportId}</h4><p className="text-xs text-gray-500 mt-1">{records.length} registro(s) vinculado(s) ao arquivo. Confira abaixo antes de remover.</p></div>
                      <button type="button" onClick={() => { setSelectedImportId(null); setSelectedImportDetails(null); }} className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-bold text-gray-600">Fechar detalhes</button>
                    </div>
                    {records.length === 0 ? <p className="py-8 text-center text-gray-500">Não foram encontrados registros vinculados por importId para este arquivo.</p> : (
                      <div className="overflow-x-auto max-h-[650px] overflow-y-auto border border-gray-200 rounded-xl">
                        <table className="w-full text-left text-xs">
                          <thead className="sticky top-0 bg-slate-900 text-white uppercase tracking-wide"><tr><th className="p-3">Categoria</th><th className="p-3">Data</th><th className="p-3">Médico / Executante</th><th className="p-3">Documento</th><th className="p-3">Descrição</th><th className="p-3 text-right">Valor</th></tr></thead>
                          <tbody>
                            {records.map((r: any, index: number) => (
                              <tr key={r.recordType + "-" + r.id + "-" + index} className="border-b border-gray-100 hover:bg-gray-50">
                                <td className="p-3 whitespace-nowrap font-bold">{r.recordType}</td>
                                <td className="p-3 whitespace-nowrap">{r.date || r.data || r.createdAt || "-"}</td>
                                <td className="p-3 min-w-[160px]">{r.doctorName || r.medico || r.executingProvider || r.executante || r.userName || "-"}</td>
                                <td className="p-3 whitespace-nowrap">{r.document || r.documentNumber || r.numeroDocumento || r.protocolNumber || "-"}</td>
                                <td className="p-3 min-w-[220px]">{r.description || r.typeName || r.observation || r.procedureDescription || r.sourceDocument || r.fileName || "-"}</td>
                                <td className="p-3 text-right whitespace-nowrap tabular-nums">{money(recordValue(r))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                );
              })() : <p className="text-sm text-gray-500">Não foi possível carregar os lançamentos desta importação.</p>}
            </div>
          )}
        </div>
      )}

      {/* Modal de Importação com IA */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-4xl max-h-[94vh] overflow-y-auto my-auto animate-in fade-in zoom-in-95 duration-200">
            <FinancialImportWizard
              onClose={() => setIsImportModalOpen(false)}
              onComplete={async (newClosingId) => {
                setIsImportModalOpen(false);
                setSelectedClosingId(newClosingId);
                setActiveSubTab("lotes_unimed");
                try {
                  const closingsRes = await apiFetch("/api/app/financial/closings");
                  if (closingsRes.ok) {
                    const closingsList = await closingsRes.json();
                    setClosings(closingsList);
                  }
                  const detRes = await apiFetch(`/api/app/financial/closings/${newClosingId}/details`);
                  if (detRes.ok) {
                    const detData = await detRes.json();
                    setDetails(detData);
                  }
                } catch (e) {
                  console.error(e);
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Modal de Detalhamento de Célula da Matriz */}
      {matrixModalData.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] border border-gray-200 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <div>
                <h3 className="text-base font-black text-gray-900 uppercase tracking-tight">{matrixModalData.title}</h3>
                <p className="text-xs text-gray-500 font-medium mt-0.5">Detalhamento dos lançamentos e procedimentos associados</p>
              </div>
              <button
                onClick={() => setMatrixModalData({ isOpen: false, title: "", doctorName: "", source: "", records: [] })}
                className="w-9 h-9 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-700 font-black flex items-center justify-center transition cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {matrixModalData.records.length === 0 ? (
                <p className="text-center text-gray-500 py-12 text-xs font-bold">Nenhum lançamento encontrado para este médico.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 mb-5">
                    {[
                      ["Lançamentos", matrixModalData.records.length, "bg-gray-50"],
                      ["Vlr. Hon.", matrixModalData.records.filter((x: any) => x._recordType !== "CASH_FLOW").reduce((s: number, x: any) => s + (Number(x.honorValue) || 0), 0), "bg-blue-50"],
                      ["Vlr. Oper.", matrixModalData.records.filter((x: any) => x._recordType !== "CASH_FLOW").reduce((s: number, x: any) => s + (Number(x.operationalValue) || 0), 0), "bg-teal-50"],
                      ["Vlr. Filme", matrixModalData.records.filter((x: any) => x._recordType !== "CASH_FLOW").reduce((s: number, x: any) => s + (Number(x.filmValue) || 0), 0), "bg-teal-50"],
                      ["Vlr. Nota", matrixModalData.records.filter((x: any) => x._recordType !== "CASH_FLOW").reduce((s: number, x: any) => s + (Number(x.honorValue) || 0) + (Number(x.operationalValue) || 0) + (Number(x.filmValue) || 0), 0), "bg-emerald-50"],
                      ["Entradas do fluxo de caixa", matrixModalData.records.filter((x: any) => x._recordType === "CASH_FLOW").reduce((s: number, x: any) => s + (Number(x.transactionAmount) || 0), 0), "bg-violet-50"]
                    ].map(([label, value, bg]) => (
                      <div key={String(label)} className={`rounded-xl border border-gray-200 px-3 py-2 ${bg}`}>
                        <div className="text-[9px] font-black uppercase text-gray-500">{label}</div>
                        <div className="text-sm font-black text-gray-900">
                          {typeof value === "number" ? `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : value}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="overflow-x-auto border border-gray-200 rounded-xl">
                    <table className="min-w-[1900px] w-full text-left border-collapse text-[11px]">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-slate-800 text-white font-black uppercase text-[9px] tracking-wider">
                          <th className="p-2">Relação Nr / Origem</th>
                          <th className="p-2">Data</th>
                          <th className="p-2">Médico / Usuário</th>
                          <th className="p-2">Código do Usuário</th>
                          <th className="p-2">Documento</th>
                          <th className="p-2">Qt.</th>
                          <th className="p-2">Código AMB</th>
                          <th className="p-2 min-w-[260px]">Descrição</th>
                          <th className="p-2 text-right">Vlr. Hon.</th>
                          <th className="p-2 text-right">Vlr. Oper.</th>
                          <th className="p-2 text-right">Vlr. Filme</th>
                          <th className="p-2 text-right">Vlr. Tx Adm</th>
                          <th className="p-2 text-right">Valor lançamento</th>
                          <th className="p-2 min-w-[230px]">Prestador Executante</th>
                          <th className="p-2 min-w-[230px]">Prestador Pagamento</th>
                          <th className="p-2 min-w-[230px]">Prestador Protocolo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                        {matrixModalData.records.map((rec, idx) => {
                          const isCashFlow = rec._recordType === "CASH_FLOW";
                          return (
                            <tr key={idx} className={isCashFlow ? "bg-violet-50/70 hover:bg-violet-100/70" : "hover:bg-blue-50/30"}>
                              <td className="p-2 font-bold">{isCashFlow ? "Entrada de caixa" : rec.protocol || "Produção CSV"}</td>
                              <td className="p-2 whitespace-nowrap">{isCashFlow ? rec.transactionDate || rec.date || "-" : rec.date || "-"}</td>
                              <td className="p-2 font-semibold">{isCashFlow ? rec.doctorName || matrixModalData.doctorName : rec.patientName || "-"}</td>
                              <td className="p-2 font-mono">{isCashFlow ? "-" : rec.patientCode || "-"}</td>
                              <td className="p-2 font-mono">{isCashFlow ? rec.transactionTypeName || rec.typeName || "-" : rec.document || "-"}</td>
                              <td className="p-2 text-right">{isCashFlow ? "-" : rec.quantity ?? "-"}</td>
                              <td className="p-2 font-mono">{isCashFlow ? "-" : rec.ambCode || "-"}</td>
                              <td className="p-2">{isCashFlow ? rec.transactionDescription || rec.observation || rec.description || "-" : rec.procedureDescription || "-"}</td>
                              <td className="p-2 text-right font-mono">{isCashFlow ? "-" : (Number(rec.honorValue) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                              <td className="p-2 text-right font-mono text-teal-700">{isCashFlow ? "-" : (Number(rec.operationalValue) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                              <td className="p-2 text-right font-mono text-teal-700">{isCashFlow ? "-" : (Number(rec.filmValue) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                              <td className="p-2 text-right font-mono">{isCashFlow ? "-" : (Number(rec.administrativeFee) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                              <td className="p-2 text-right font-mono font-black text-violet-800">{isCashFlow ? (Number(rec.transactionAmount) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "-"}</td>
                              <td className="p-2">{isCashFlow ? "Fluxo de Caixa" : rec.executingProvider || "-"}</td>
                              <td className="p-2">{isCashFlow ? rec.source || "-" : rec.paymentProvider || "-"}</td>
                              <td className="p-2">{isCashFlow ? rec.transactionNature === "CREDIT" ? "Entrada" : "Saída" : rec.protocolProvider || "-"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ 
  label, 
  value, 
  isNegative, 
  color, 
  bg, 
  isHighlight,
  sub 
}: { 
  label: string; 
  value: number; 
  isNegative?: boolean; 
  color: string; 
  bg: string; 
  isHighlight?: boolean;
  sub?: string;
}) {
  return (
    <div className={`p-5 rounded-3xl border ${isHighlight ? "border-emerald-300 shadow-md bg-white ring-2 ring-emerald-500/10" : "border-gray-200/80 bg-white shadow-xs"} flex flex-col justify-between space-y-1`}>
      <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">{label}</span>
      <span className={`text-xl font-black ${color}`}>
        {isNegative ? "-R$ " : "R$ "}
        {Math.abs(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
      </span>
      {sub && <span className="text-[9px] font-bold text-gray-400 block">{sub}</span>}
    </div>
  );
}
