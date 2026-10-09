import React, { useState, useEffect } from "react";
import { useGroup } from "../../contexts/GroupContext";
import { 
  collection,
  query,
  where,
  getDocs,
  orderBy
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { 
  TableProperties, 
  Download, 
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
  UploadCloud
} from "lucide-react";
import { DoctorTeamMember, TeamFinancialSettings } from "../../types/financial";
import { TransactionTypesManager } from "./TransactionTypesManager";
import { FinancialImportWizard } from "./FinancialImportWizard";
import { ProviderLinker } from "./ProviderLinker";

const KNOWN_DOCTORS = ['ROCHELE', 'THAIS', 'LUIS', 'KATHIZE'];

interface ExcelDashboardViewProps {
  closingId: string | null;
  initialSubTab?: "visao_geral" | "config_equipe" | "colunas_medicos" | "entradas_fontes" | "ocorrencias_fluxo" | "lotes_unimed" | "despesas_equipe" | "tipos_lancamento" | "config_prestadores";
  onOpenImport?: () => void;
}

export function ExcelDashboardView({ closingId, initialSubTab = "lotes_unimed", onOpenImport }: ExcelDashboardViewProps) {
  const { activeGroup, apiFetch } = useGroup();
  const [closings, setClosings] = useState<any[]>([]);
  const [selectedClosingId, setSelectedClosingId] = useState<string | null>(closingId || "SETEMBRO-26");
  const [details, setDetails] = useState<any>(null);
  const production = details?.productionRecords || [];
  const [loading, setLoading] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<
    "visao_geral" | "config_equipe" | "colunas_medicos" | "matriz_entradas" | "entradas_fontes" | "ocorrencias_fluxo" | "lotes_unimed" | "despesas_equipe" | "tipos_lancamento" | "config_prestadores"
  >(initialSubTab);
  const [selectedDoctorFilter, setSelectedDoctorFilter] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [removedLotes, setRemovedLotes] = useState<string[]>([]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [matrixModalData, setMatrixModalData] = useState<{
    isOpen: boolean;
    title: string;
    doctorName: string;
    source: string;
    records: any[];
  }>({ isOpen: false, title: "", doctorName: "", source: "", records: [] });

  const [doctors, setDoctors] = useState<any[]>([]);

  // Manual entries for green plantao / entrada cells
  const [manualEntradas, setManualEntradas] = useState<Record<string, any>>({
    thais: { azambujaPlantaoTT: 3600, azambujaPlantaoDS: 2933.04, unimedPlantaoTT: 0, unimedPlantaoDS: 0 },
    kathize: { azambujaPlantaoTT: 9000, azambujaPlantaoDS: 7332.59, unimedPlantaoTT: 0, unimedPlantaoDS: 0 },
    rochele: { azambujaPlantaoTT: 0, azambujaPlantaoDS: 0, unimedPlantaoTT: 1966.87, unimedPlantaoDS: 1610.61 }
  });

  // Global manual entries for totals at the top of sections
  const [globalEntradas, setGlobalEntradas] = useState<{
    azambujaTT: number;
    azambujaDS: number;
    marietaTT: number;
    marietaDS: number;
    consultorioTT: number;
    consultorioDS: number;
    dinheiroTT: number;
    dinheiroDS: number;
    unimedLuisTT: number;
    unimedLuisDS: number;
  }>({
    azambujaTT: 70020.94,
    azambujaDS: 57048.34,
    marietaTT: 81042.09,
    marietaDS: 67645.83,
    consultorioTT: 400,
    consultorioDS: 400,
    dinheiroTT: 1200,
    dinheiroDS: 1200,
    unimedLuisTT: 8406,
    unimedLuisDS: 7016.49
  });

  useEffect(() => {
    const fetchDoctors = async () => {
      const doctorsCol = collection(db, "doctors");
      const q = query(doctorsCol, where("active", "==", true), orderBy("name"));
      const snapshot = await getDocs(q);
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setDoctors(docs);
    };
    fetchDoctors();
  }, []);

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

  const rowsData = React.useMemo(() => doctors.map(doc => ({
    key: doc.id,
    name: doc.name,
    percent: teamSettings.doctors.find(d => d.key === doc.id)?.teamSharePercent || 0,
    isTeam: teamSettings.doctors.find(d => d.key === doc.id)?.isTeamMember || false
  })), [doctors, teamSettings]);

  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);

  // Recalculates dynamic PROPORÇÃO HEART based on disponivelPeriodo
  const recalculateHeartProportions = (docs: DoctorTeamMember[]) => {
    const teamMembers = docs.filter(d => d.isTeamMember);
    const sumDisponivel = teamMembers.reduce((acc, d) => acc + (Number(d.disponivelPeriodo) || 0), 0);
    return docs.map(d => {
      if (d.isTeamMember && sumDisponivel > 0 && d.disponivelPeriodo !== undefined) {
        const dyn = Math.round(((Number(d.disponivelPeriodo) || 0) / sumDisponivel) * 10000) / 100;
        return { ...d, proporcaoHeartDinamica: dyn };
      }
      return d;
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
            setTeamSettings(data);
          }
        }
      } catch (e) {
        console.error("Failed to load team settings:", e);
      }
    };
    fetchTeamSettings();
  }, [activeGroup]);

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

  // Calculate sum of team percentages
  const teamSumPercent = teamSettings.doctors
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
    const productionRecords = Array.isArray(details?.productionRecords) ? details.productionRecords : [];
    const aggr = new Map<string, any>();
    const pending: any[] = [];

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
      const docConfig = teamSettings.doctors.find(c => c.key === d.doctorId);
      const isTeam = Boolean(docConfig?.isTeamMember);
      const percent = Number(docConfig?.teamSharePercent) || 0;
      const honorTT = Number(d.honorTT) || 0;
      const honorDS = Math.max(0, honorTT - (Number(d.glosa) || 0));
      const plantaoTT = Number(man.plantaoTT) || 0;
      const plantaoDS = Number(man.plantaoDS) || 0;
      const vlNotaTT = honorTT + d.filmTT + plantaoTT;
      const dispDS = (isTeam ? honorDS : honorTT) + d.filmTT + plantaoDS;

      totalTT += vlNotaTT;
      totalDS += dispDS;

      return { ...d, isTeam, percent, honorDS, plantaoTT, plantaoDS, vlNotaTT, dispDS };
    });

    return {
      doctorsAggregated: processedDoctors,
      totalUnimedTT: totalTT,
      totalUnimedDS: totalDS,
      pendingRecords: pending
    };
  }, [details?.productionRecords, details?.glosas, manualEntradas, teamSettings.doctors]);

  const excelData = React.useMemo(() => ({
    monthKey: details?.closing?.monthKey || "FECHAMENTO",
    totals: {
      entradasGerais: totalUnimedTT,
      saldoFinal: totalUnimedDS
    },
    fechamentoMedicos: doctorsAggregated.map(d => ({
        nome: d.doctorName,
        key: d.doctorId,
        isTeamMember: d.isTeam,
        producao: d.honorTT,
        entradas: d.plantaoTT,
        saidas: d.glosa,
        liquidoCalculado: d.honorDS,
        finalGeral: d.dispDS
    })),
    ocorrencias: details?.transactions || [],
    lotesUnimed: [],
    despesasEquipe: []
  }), [doctorsAggregated, totalUnimedTT, totalUnimedDS, details]);

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
    const config = teamSettings.doctors.find(c => c.name === d.nome);
    return config ? config.isTeamMember : d.isTeamMember;
  });

  const nonTeamDoctors = excelData.fechamentoMedicos.filter(d => {
    const config = teamSettings.doctors.find(c => c.name === d.nome);
    return config ? !config.isTeamMember : !d.isTeamMember;
  });

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
      {activeSubTab === "matriz_entradas" && (
        <div className="space-y-6">
          <div className="bg-white rounded-[32px] border border-gray-200 shadow-xl overflow-hidden p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Matriz de Entradas — Totais (TT) e Disponíveis para Saque (DS)</h3>
                <p className="text-xs text-gray-500">Visualização detalhada por médico e fonte. Os campos com fundo <span className="bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">verde</span> são editáveis manualmente para lançamentos de plantão.</p>
              </div>
            </div>

            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-[11px] border-collapse text-center">
                <thead>
                  <tr className="bg-slate-900 text-white font-black uppercase tracking-wider">
                    <th className="p-3 border border-slate-700 text-left pl-4" rowSpan={2}>MÉDICO</th>
                    <th className="p-3 border border-slate-700" rowSpan={2}>% EQUIPE</th>
                    <th className="p-3 border border-slate-700 bg-blue-900" colSpan={6}>
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-1">
                        <span>AZAMBUJA</span>
                        <div className="flex items-center gap-1.5 bg-blue-950/80 px-2 py-1 rounded-lg border border-blue-700/60 font-mono text-[10px]">
                          <span className="text-emerald-300 font-bold">TT:</span>
                          <input
                            type="number"
                            value={globalEntradas.azambujaTT || ""}
                            onChange={(e) => setGlobalEntradas({ ...globalEntradas, azambujaTT: parseFloat(e.target.value) || 0 })}
                            className="w-20 text-center bg-emerald-100 text-emerald-950 font-black rounded px-1 py-0.5 outline-none focus:ring-2 focus:ring-emerald-400"
                            placeholder="0,00"
                          />
                          <span className="text-emerald-300 font-bold ml-1">DS:</span>
                          <input
                            type="number"
                            value={globalEntradas.azambujaDS || ""}
                            onChange={(e) => setGlobalEntradas({ ...globalEntradas, azambujaDS: parseFloat(e.target.value) || 0 })}
                            className="w-20 text-center bg-emerald-100 text-emerald-950 font-black rounded px-1 py-0.5 outline-none focus:ring-2 focus:ring-emerald-400"
                            placeholder="0,00"
                          />
                        </div>
                      </div>
                    </th>
                    <th className="p-3 border border-slate-700 bg-indigo-900" colSpan={4}>
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-1">
                        <span>MARIETA</span>
                        <div className="flex items-center gap-1.5 bg-indigo-950/80 px-2 py-1 rounded-lg border border-indigo-700/60 font-mono text-[10px]">
                          <span className="text-emerald-300 font-bold">TT:</span>
                          <input
                            type="number"
                            value={globalEntradas.marietaTT || ""}
                            onChange={(e) => setGlobalEntradas({ ...globalEntradas, marietaTT: parseFloat(e.target.value) || 0 })}
                            className="w-20 text-center bg-emerald-100 text-emerald-950 font-black rounded px-1 py-0.5 outline-none focus:ring-2 focus:ring-emerald-400"
                            placeholder="0,00"
                          />
                          <span className="text-emerald-300 font-bold ml-1">DS:</span>
                          <input
                            type="number"
                            value={globalEntradas.marietaDS || ""}
                            onChange={(e) => setGlobalEntradas({ ...globalEntradas, marietaDS: parseFloat(e.target.value) || 0 })}
                            className="w-20 text-center bg-emerald-100 text-emerald-950 font-black rounded px-1 py-0.5 outline-none focus:ring-2 focus:ring-emerald-400"
                            placeholder="0,00"
                          />
                        </div>
                      </div>
                    </th>
                    <th className="p-3 border border-slate-700 bg-teal-900" colSpan={9}>
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-2">
                        <span className="font-black">UNIMED</span>
                        <div className="flex items-center gap-2 bg-teal-950/80 px-2.5 py-1 rounded-lg border border-teal-700/60 font-mono text-[10px]">
                          <span className="text-teal-200 font-bold uppercase">VL NOTA:</span>
                          <span className="text-white font-black">{totalUnimedTT.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                          <span className="text-teal-200 font-bold uppercase ml-2">DS:</span>
                          <span className="text-emerald-300 font-black">{totalUnimedDS.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    </th>
                    <th className="p-3 border border-slate-700 bg-purple-900" colSpan={2}>
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-1">
                        <span>CONSULTÓRIO</span>
                        <div className="flex items-center gap-1.5 bg-purple-950/80 px-2 py-1 rounded-lg border border-purple-700/60 font-mono text-[10px]">
                          <span className="text-emerald-300 font-bold">TT:</span>
                          <input
                            type="number"
                            value={globalEntradas.consultorioTT || ""}
                            onChange={(e) => setGlobalEntradas({ ...globalEntradas, consultorioTT: parseFloat(e.target.value) || 0 })}
                            className="w-16 text-center bg-emerald-100 text-emerald-950 font-black rounded px-1 py-0.5 outline-none focus:ring-2 focus:ring-emerald-400"
                            placeholder="0,00"
                          />
                          <span className="text-emerald-300 font-bold ml-1">DS:</span>
                          <input
                            type="number"
                            value={globalEntradas.consultorioDS || ""}
                            onChange={(e) => setGlobalEntradas({ ...globalEntradas, consultorioDS: parseFloat(e.target.value) || 0 })}
                            className="w-16 text-center bg-emerald-100 text-emerald-950 font-black rounded px-1 py-0.5 outline-none focus:ring-2 focus:ring-emerald-400"
                            placeholder="0,00"
                          />
                        </div>
                      </div>
                    </th>
                    <th className="p-3 border border-slate-700 bg-amber-900" colSpan={2}>
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-1">
                        <span>DINHEIRO</span>
                        <div className="flex items-center gap-1.5 bg-amber-950/80 px-2 py-1 rounded-lg border border-amber-700/60 font-mono text-[10px]">
                          <span className="text-emerald-300 font-bold">TT:</span>
                          <input
                            type="number"
                            value={globalEntradas.dinheiroTT || ""}
                            onChange={(e) => setGlobalEntradas({ ...globalEntradas, dinheiroTT: parseFloat(e.target.value) || 0 })}
                            className="w-16 text-center bg-emerald-100 text-emerald-950 font-black rounded px-1 py-0.5 outline-none focus:ring-2 focus:ring-emerald-400"
                            placeholder="0,00"
                          />
                          <span className="text-emerald-300 font-bold ml-1">DS:</span>
                          <input
                            type="number"
                            value={globalEntradas.dinheiroDS || ""}
                            onChange={(e) => setGlobalEntradas({ ...globalEntradas, dinheiroDS: parseFloat(e.target.value) || 0 })}
                            className="w-16 text-center bg-emerald-100 text-emerald-950 font-black rounded px-1 py-0.5 outline-none focus:ring-2 focus:ring-emerald-400"
                            placeholder="0,00"
                          />
                        </div>
                      </div>
                    </th>
                    <th className="p-3 border border-slate-700 bg-rose-900" colSpan={2}>
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-1">
                        <span>UNIMED LUIS</span>
                        <div className="flex items-center gap-1.5 bg-rose-950/80 px-2 py-1 rounded-lg border border-rose-700/60 font-mono text-[10px]">
                          <span className="text-emerald-300 font-bold">TT:</span>
                          <input
                            type="number"
                            value={globalEntradas.unimedLuisTT || ""}
                            onChange={(e) => setGlobalEntradas({ ...globalEntradas, unimedLuisTT: parseFloat(e.target.value) || 0 })}
                            className="w-16 text-center bg-emerald-100 text-emerald-950 font-black rounded px-1 py-0.5 outline-none focus:ring-2 focus:ring-emerald-400"
                            placeholder="0,00"
                          />
                          <span className="text-emerald-300 font-bold ml-1">DS:</span>
                          <input
                            type="number"
                            value={globalEntradas.unimedLuisDS || ""}
                            onChange={(e) => setGlobalEntradas({ ...globalEntradas, unimedLuisDS: parseFloat(e.target.value) || 0 })}
                            className="w-16 text-center bg-emerald-100 text-emerald-950 font-black rounded px-1 py-0.5 outline-none focus:ring-2 focus:ring-emerald-400"
                            placeholder="0,00"
                          />
                        </div>
                      </div>
                    </th>
                    <th className="p-3 border border-slate-700 bg-emerald-900" colSpan={6}>TOTAL GERAL</th>
                  </tr>
                  <tr className="bg-slate-800 text-slate-200 font-bold uppercase text-[10px]">
                    {/* Azambuja */}
                    <th className="p-2 border border-slate-700">Equipe TT</th>
                    <th className="p-2 border border-slate-700">Equipe DS</th>
                    <th className="p-2 border border-slate-700 bg-emerald-950/80 text-emerald-300">Plantão TT</th>
                    <th className="p-2 border border-slate-700 bg-emerald-950/80 text-emerald-300">Plantão DS</th>
                    <th className="p-2 border border-slate-700">Total TT</th>
                    <th className="p-2 border border-slate-700">Total DS</th>
                    {/* Marieta */}
                    <th className="p-2 border border-slate-700">Equipe TT</th>
                    <th className="p-2 border border-slate-700">Equipe DS</th>
                    <th className="p-2 border border-slate-700">Total TT</th>
                    <th className="p-2 border border-slate-700">Total DS</th>
                    {/* Unimed */}
                    <th className="p-2 border border-slate-700">Equipe TT</th>
                    <th className="p-2 border border-slate-700">Equipe DS</th>
                    <th className="p-2 border border-slate-700">Part. TT</th>
                    <th className="p-2 border border-slate-700">Part. DS</th>
                    <th className="p-2 border border-slate-700 bg-teal-950/80 text-teal-300">Operacional</th>
                    <th className="p-2 border border-slate-700 bg-teal-950/80 text-teal-300">Filme</th>
                    <th className="p-2 border border-slate-700 bg-emerald-950/80 text-emerald-300">Plantão TT</th>
                    <th className="p-2 border border-slate-700 bg-emerald-950/80 text-emerald-300">Plantão DS</th>
                    <th className="p-2 border border-slate-700">VL Nota TT</th>
                    <th className="p-2 border border-slate-700">Disp DS</th>
                    <th className="p-2 border border-slate-700">Prop %</th>
                    <th className="p-2 border border-slate-700">Disp Unim</th>
                    {/* Consultorio */}
                    <th className="p-2 border border-slate-700">TT</th>
                    <th className="p-2 border border-slate-700">DS</th>
                    {/* Dinheiro */}
                    <th className="p-2 border border-slate-700">TT</th>
                    <th className="p-2 border border-slate-700">DS</th>
                    {/* Unimed Luis */}
                    <th className="p-2 border border-slate-700">TT</th>
                    <th className="p-2 border border-slate-700">DS</th>
                    {/* Total Geral */}
                    <th className="p-2 border border-slate-700">TT Geral</th>
                    <th className="p-2 border border-slate-700">DS Geral</th>
                    <th className="p-2 border border-slate-700">Prop Heart %</th>
                    <th className="p-2 border border-slate-700">Disp Período</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 font-medium text-gray-800">
                  {(() => {
                    const hasClosing = Boolean(details?.closing);
                    const doctorAggById = new Map(doctorsAggregated.map((d: any) => [d.doctorId, d]));
                    const getDoctorUnimed = (doctorId: string) => {
                      const found: any = doctorAggById.get(doctorId);
                      if (!found) return { prod: 0, disp: 0, operational: 0, film: 0 };
                      return {
                        prod: Number(found.honorTT) || 0,
                        disp: Number(found.honorDS) || 0,
                        operational: Number(found.operationalTT) || 0,
                        film: Number(found.filmTT) || 0
                      };
                    };

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

                      const unimedData = getDoctorUnimed(doc.key);
                      const unimedEqTT = isTeam ? (unimedData.prod * mul) : 0;
                      const unimedEqDS = isTeam ? (unimedData.disp * mul) : 0;
                      const unimedPartTT = !isTeam ? Math.round((unimedData.prod - unimedData.operational) * mul * 100) / 100 : 0;
                      const unimedPartDS = !isTeam ? Math.round((unimedData.disp - unimedData.operational) * mul * 100) / 100 : 0;
                      const unimedOp = unimedData.operational * mul;
                      const unimedFilm = unimedData.film * mul;
                      const unimPlTT = (man.unimedPlantaoTT || 0) * mul;
                      const unimPlDS = (man.unimedPlantaoDS || 0) * mul;
                      const unimTotTT = unimedEqTT + unimedPartTT + unimedOp + unimedFilm + unimPlTT;
                      const unimTotDS = unimedEqDS + unimedPartDS + unimedOp + unimedFilm + unimPlDS;

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
                        unimedEqTT, unimedEqDS, unimedPartTT, unimedPartDS, unimedOp, unimedFilm, unimPlTT, unimPlDS, unimTotTT, unimTotDS,
                        consultTT, consultDS, dinheiroTT, dinheiroDS, unimLuisTT, unimLuisDS,
                        totalGeralTT, totalGeralDS
                      };
                    });

                    (window as any).__matrixRowsCache = rows;

                    return rows.map((r) => (
                      <tr key={r.key} className="even:bg-slate-50/70 hover:bg-emerald-50/40 transition-colors">
                        <td
                          className="p-3 border border-slate-200 text-left pl-4 font-black text-gray-900 bg-white cursor-pointer hover:bg-blue-50 transition-colors"
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
                            {r.isTeam && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800">Sócio</span>}
                          </div>
                          <div className="text-[9px] text-blue-500 font-bold mt-0.5">Ver lançamentos</div>
                        </td>
                        <td className="p-3 border border-slate-200 font-bold text-gray-700 bg-slate-50">
                          {r.percent > 0 ? `${r.percent}%` : "-"}
                        </td>
                        {/* Azambuja */}
                        <td className="p-3 border border-slate-200 font-mono text-gray-700">{r.azEqTT > 0 ? r.azEqTT.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}</td>
                        <td className="p-3 border border-slate-200 font-mono text-gray-700">{r.azEqDS > 0 ? r.azEqDS.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}</td>
                        <td className="p-3 border border-slate-200 bg-emerald-50/60 p-1">
                          <input
                            type="number"
                            value={manualEntradas[r.key]?.azambujaPlantaoTT || ""}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              const ratio = 0.8147;
                              const man = manualEntradas[r.key] || {};
                              setManualEntradas({
                                ...manualEntradas,
                                [r.key]: { ...man, azambujaPlantaoTT: val, azambujaPlantaoDS: Math.round(val * ratio * 100) / 100 }
                              });
                            }}
                            className="w-20 text-center bg-emerald-100/80 border border-emerald-300 rounded-lg font-mono text-xs py-1 text-emerald-950 font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                            placeholder="0,00"
                          />
                        </td>
                        <td className="p-3 border border-slate-200 bg-emerald-50/30 font-mono text-emerald-800 font-bold">
                          {r.azPlDS > 0 ? r.azPlDS.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}
                        </td>
                        <td className="p-3 border border-slate-200 font-mono font-bold text-gray-900">{r.azTotTT > 0 ? r.azTotTT.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}</td>
                        <td className="p-3 border border-slate-200 font-mono font-bold text-blue-700 border-r-2 border-slate-500">{r.azTotDS > 0 ? r.azTotDS.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}</td>

                        {/* Marieta */}
                        <td className="p-3 border border-slate-200 font-mono text-gray-700">{r.marEqTT > 0 ? r.marEqTT.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}</td>
                        <td className="p-3 border border-slate-200 font-mono text-gray-700">{r.marEqDS > 0 ? r.marEqDS.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}</td>
                        <td className="p-3 border border-slate-200 font-mono font-bold text-gray-900">{r.marTotTT > 0 ? r.marTotTT.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}</td>
                        <td className="p-3 border border-slate-200 font-mono font-bold text-blue-700 border-r-2 border-slate-500">{r.marTotDS > 0 ? r.marTotDS.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}</td>

                        {/* Unimed (Equipe from imports, Plantao manual) */}
                        <td 
                          onClick={() => {
                            const recs = production.filter(p => p.doctorId === r.key);
                            setMatrixModalData({ isOpen: true, title: `Produção Unimed (Equipe) — ${r.name}`, doctorName: r.name, source: "UNIMED", records: recs });
                          }}
                          className="p-3 border border-slate-200 font-mono text-gray-700 cursor-pointer hover:bg-blue-50 transition-colors"
                        >
                          {r.unimedEqTT > 0 ? r.unimedEqTT.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}
                        </td>
                        <td 
                          onClick={() => {
                            const recs = production.filter(p => p.doctorId === r.key);
                            setMatrixModalData({ isOpen: true, title: `Produção Unimed (Equipe DS) — ${r.name}`, doctorName: r.name, source: "UNIMED", records: recs });
                          }}
                          className="p-3 border border-slate-200 font-mono text-gray-700 cursor-pointer hover:bg-blue-50 transition-colors"
                        >
                          {r.unimedEqDS > 0 ? r.unimedEqDS.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}
                        </td>
                        <td 
                          onClick={() => {
                            const recs = production.filter(p => p.doctorId === r.key);
                            setMatrixModalData({ isOpen: true, title: `Produção Unimed (Part. TT) — ${r.name}`, doctorName: r.name, source: "UNIMED", records: recs });
                          }}
                          className="p-3 border border-slate-200 font-mono text-gray-700 cursor-pointer hover:bg-blue-50 transition-colors"
                        >
                          {r.unimedPartTT > 0 ? r.unimedPartTT.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}
                        </td>
                        <td 
                          onClick={() => {
                            const recs = production.filter(p => p.doctorId === r.key);
                            setMatrixModalData({ isOpen: true, title: `Produção Unimed (Part. DS) — ${r.name}`, doctorName: r.name, source: "UNIMED", records: recs });
                          }}
                          className="p-3 border border-slate-200 font-mono text-gray-700 cursor-pointer hover:bg-blue-50 transition-colors"
                        >
                          {r.unimedPartDS > 0 ? r.unimedPartDS.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}
                        </td>
                        <td 
                          onClick={() => {
                            const recs = production.filter(p => p.doctorId === r.key);
                            setMatrixModalData({ isOpen: true, title: `Operacional Unimed — ${r.name}`, doctorName: r.name, source: "OPERACIONAL", records: recs });
                          }}
                          className="p-3 border border-slate-200 font-mono text-teal-800 font-bold cursor-pointer hover:bg-teal-50 transition-colors"
                        >
                          {r.unimedOp > 0 ? r.unimedOp.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}
                        </td>
                        <td 
                          onClick={() => {
                            const recs = production.filter(p => p.doctorId === r.key);
                            setMatrixModalData({ isOpen: true, title: `Filme Unimed — ${r.name}`, doctorName: r.name, source: "FILME", records: recs });
                          }}
                          className="p-3 border border-slate-200 font-mono text-teal-800 font-bold cursor-pointer hover:bg-teal-50 transition-colors"
                        >
                          {r.unimedFilm > 0 ? r.unimedFilm.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}
                        </td>
                        <td className="p-3 border border-slate-200 bg-emerald-50/60 p-1">
                          <input
                            type="number"
                            value={manualEntradas[r.key]?.unimedPlantaoTT || ""}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              const ratio = 0.8189;
                              const man = manualEntradas[r.key] || {};
                              setManualEntradas({
                                ...manualEntradas,
                                [r.key]: { ...man, unimedPlantaoTT: val, unimedPlantaoDS: Math.round(val * ratio * 100) / 100 }
                              });
                            }}
                            className="w-20 text-center bg-emerald-100/80 border border-emerald-300 rounded-lg font-mono text-xs py-1 text-emerald-950 font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                            placeholder="0,00"
                          />
                        </td>
                        <td className="p-3 border border-slate-200 bg-emerald-50/30 font-mono text-emerald-800 font-bold">
                          {r.unimPlDS > 0 ? r.unimPlDS.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}
                        </td>
                        <td className="p-3 border border-slate-200 font-mono font-bold text-gray-900">{r.unimTotTT > 0 ? r.unimTotTT.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}</td>
                        <td className="p-3 border border-slate-200 font-mono font-bold text-blue-700">{r.unimTotDS > 0 ? r.unimTotDS.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}</td>
                        <td className="p-3 border border-slate-200 font-mono text-gray-500">{r.unimTotTT > 0 ? (totalUnimedTT > 0 ? (r.unimTotTT / totalUnimedTT * 100) : 0).toFixed(2) : "0.00"}%</td>
                        <td className="p-3 border border-slate-200 font-mono font-bold text-teal-800 border-r-2 border-slate-500">{r.unimTotDS > 0 ? r.unimTotDS.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}</td>

                        {/* Consultorio */}
                        <td className="p-3 border border-slate-200 font-mono text-gray-700">{r.consultTT > 0 ? r.consultTT.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}</td>
                        <td className="p-3 border border-slate-200 font-mono font-bold text-purple-900 border-r-2 border-slate-500">{r.consultDS > 0 ? r.consultDS.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}</td>

                        {/* Dinheiro */}
                        <td className="p-3 border border-slate-200 font-mono text-gray-700">{r.dinheiroTT > 0 ? r.dinheiroTT.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}</td>
                        <td className="p-3 border border-slate-200 font-mono font-bold text-amber-900 border-r-2 border-slate-500">{r.dinheiroDS > 0 ? r.dinheiroDS.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}</td>

                        {/* Unimed Luis */}
                        <td className="p-3 border border-slate-200 font-mono text-gray-700">{r.unimLuisTT > 0 ? r.unimLuisTT.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}</td>
                        <td className="p-3 border border-slate-200 font-mono font-bold text-rose-900 border-r-2 border-slate-500">{r.unimLuisDS > 0 ? r.unimLuisDS.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}</td>

                        {/* Total Geral */}
                        <td className="p-3 border border-slate-200 font-mono font-black bg-slate-100 text-gray-900">{r.totalGeralTT.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td className="p-3 border border-slate-200 font-mono font-black bg-emerald-50 text-emerald-950">{r.totalGeralDS.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td className="p-3 border border-slate-200 font-mono font-bold text-indigo-700 bg-slate-50">{(r.isTeam && r.totalGeralDS > 0 ? (r.totalGeralDS / 36086.02 * 26.79).toFixed(2) : "0.00")}%</td>
                        <td className="p-3 border border-slate-200 font-mono font-black bg-blue-50 text-blue-950">{r.isTeam ? r.totalGeralDS.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-"}</td>
                      </tr>
                    ));
                  })()}
                </tbody>
                <tfoot>
                  {(() => {
                    const rows = (window as any).__matrixRowsCache || [];
                    const sum = (field: string) => rows.reduce((acc: number, r: any) => acc + (r[field] || 0), 0);
                    const fmt = (val: number) => val > 0 ? val.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "-";

                    return (
                      <tr className="bg-slate-900 text-white font-black text-xs">
                        <td className="p-3 border border-slate-700 text-left pl-4 uppercase" colSpan={2}>TOTAL GERAL CONSOLIDADO</td>
                        <td className="p-3 border border-slate-700 font-mono">{fmt(sum('azEqTT'))}</td>
                        <td className="p-3 border border-slate-700 font-mono">{fmt(sum('azEqDS'))}</td>
                        <td className="p-3 border border-slate-700 font-mono text-emerald-300">{fmt(sum('azPlTT'))}</td>
                        <td className="p-3 border border-slate-700 font-mono text-emerald-300">{fmt(sum('azPlDS'))}</td>
                        <td className="p-3 border border-slate-700 font-mono">{fmt(sum('azTotTT'))}</td>
                        <td className="p-3 border border-slate-700 font-mono">{fmt(sum('azTotDS'))}</td>
                        <td className="p-3 border border-slate-700 font-mono">{fmt(sum('marEqTT'))}</td>
                        <td className="p-3 border border-slate-700 font-mono">{fmt(sum('marEqDS'))}</td>
                        <td className="p-3 border border-slate-700 font-mono">{fmt(sum('marEqTT'))}</td>
                        <td className="p-3 border border-slate-700 font-mono">{fmt(sum('marEqDS'))}</td>
                        <td className="p-3 border border-slate-700 font-mono">{fmt(sum('unimedEqTT'))}</td>
                        <td className="p-3 border border-slate-700 font-mono">{fmt(sum('unimedEqDS'))}</td>
                        <td className="p-3 border border-slate-700 font-mono">{fmt(sum('unimedPartTT'))}</td>
                        <td className="p-3 border border-slate-700 font-mono">{fmt(sum('unimedPartDS'))}</td>
                        <td className="p-3 border border-slate-700 font-mono text-teal-300">{fmt(sum('unimedOp'))}</td>
                        <td className="p-3 border border-slate-700 font-mono text-teal-300">{fmt(sum('unimedFilm'))}</td>
                        <td className="p-3 border border-slate-700 font-mono text-emerald-300">{fmt(sum('unimPlTT'))}</td>
                        <td className="p-3 border border-slate-700 font-mono text-emerald-300">{fmt(sum('unimPlDS'))}</td>
                        <td className="p-3 border border-slate-700 font-mono">{fmt(sum('unimTotTT'))}</td>
                        <td className="p-3 border border-slate-700 font-mono">{fmt(sum('unimTotDS'))}</td>
                        <td className="p-3 border border-slate-700 font-mono">100.00%</td>
                        <td className="p-3 border border-slate-700 font-mono">{fmt(sum('unimTotDS'))}</td>
                        <td className="p-3 border border-slate-700 font-mono">{fmt(sum('consultTT'))}</td>
                        <td className="p-3 border border-slate-700 font-mono">{fmt(sum('consultTT'))}</td>
                        <td className="p-3 border border-slate-700 font-mono">{fmt(sum('dinheiroTT'))}</td>
                        <td className="p-3 border border-slate-700 font-mono">{fmt(sum('dinheiroTT'))}</td>
                        <td className="p-3 border border-slate-700 font-mono">{fmt(sum('unimLuisTT'))}</td>
                        <td className="p-3 border border-slate-700 font-mono">{fmt(sum('unimLuisDS'))}</td>
                        <td className="p-3 border border-slate-700 font-mono text-emerald-400">{fmt(sum('totalGeralTT'))}</td>
                        <td className="p-3 border border-slate-700 font-mono text-emerald-400">{fmt(sum('totalGeralDS'))}</td>
                        <td className="p-3 border border-slate-700 font-mono">100.00%</td>
                        <td className="p-3 border border-slate-700 font-mono text-blue-300">{fmt(sum('totalGeralDS'))}</td>
                      </tr>
                    );
                  })()}
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 1: MAPA MESTRE DE RATEIO E SALÁRIOS (SEPARADO ENTRE EQUIPE E FORA DA EQUIPE) */}
      {activeSubTab === "visao_geral" && (
        <div className="space-y-8">
          {/* BLOCO 1: MEMBROS DA EQUIPE (SÓCIOS) */}
          <div className="bg-white rounded-[32px] border border-gray-200 shadow-xl overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-emerald-50/50">
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
                    const docConfig = teamSettings.doctors.find(d => d.name === med.nome);
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
                          R$ {med.finalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* BLOCO 2: MÉDICOS FORA DA EQUIPE (COOPERADOS & PARCEIROS) */}
          <div className="bg-white rounded-[32px] border border-gray-200 shadow-xl overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50">
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
                  <tr className="bg-slate-100 text-slate-700 font-black uppercase text-[10px] tracking-wider border-b border-gray-200">
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
                          {teamSettings.doctors.find(d => d.name === med.nome)?.specialty || "Médico Cooperado"}
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
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users size={16} />
              <span className="font-bold">Colunas Individuais por Médico do Excel (4 da Equipe e 5 Cooperados Parceiros)</span>
            </div>
            <span className="text-[10px] uppercase font-black tracking-wider text-emerald-700">9 Painéis Conectados</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {excelData.fechamentoMedicos.map((med) => {
              const isTeam = med.isTeamMember;
              return (
                <div 
                  key={med.nome}
                  className={`bg-white rounded-[28px] border shadow-md p-6 flex flex-col justify-between space-y-4 transition ${
                    isTeam 
                      ? "border-emerald-300 ring-2 ring-emerald-500/10 hover:border-emerald-500" 
                      : "border-gray-200 hover:border-gray-400"
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 border-b border-gray-100 pb-3">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                            isTeam ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"
                          }`}>
                            {isTeam ? `Membro Equipe (${med.percent})` : "Cooperado Externo"}
                          </span>
                        </div>
                        <h4 className="font-black text-gray-900 text-sm mt-1">{med.nome}</h4>
                        <p className="text-[10px] text-gray-400">
                          {teamSettings.doctors.find(d => d.name === med.nome)?.specialty}
                        </p>
                      </div>
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-xs shrink-0 ${
                        isTeam ? "bg-emerald-600 text-white" : "bg-gray-200 text-gray-700"
                      }`}>
                        {isTeam ? med.percent : "EXT"}
                      </div>
                    </div>

                    <div className="py-3 space-y-2 border-b border-gray-100">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Produção Unimed:</span>
                        <span className="font-bold text-gray-900">R$ {med.producao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-emerald-600 font-medium">Outras Entradas:</span>
                        <span className="font-bold text-emerald-600">+R$ {med.entradas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-rose-600 font-medium">Ocorrências / Descontos:</span>
                        <span className="font-bold text-rose-600">-R$ {med.saidas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-indigo-600 font-medium">Divisão / Acertos:</span>
                        <span className="font-bold text-indigo-600">+R$ {med.divisaoLucros.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>

                    {/* Occurrence highlights */}
                    <div className="py-2 space-y-1 text-[10px]">
                      <span className="font-black text-gray-400 uppercase tracking-wider block">Lançamentos Alocados:</span>
                      {med.detalhesEntradas.map((de, idx) => (
                        <div key={idx} className="text-emerald-700 font-medium truncate">• {de}</div>
                      ))}
                      {med.detalhesSaidas.map((ds, idx) => (
                        <div key={idx} className="text-rose-700 font-medium truncate">• {ds}</div>
                      ))}
                    </div>
                  </div>

                  <div className={`p-4 rounded-2xl border flex items-center justify-between ${
                    isTeam 
                      ? "bg-emerald-50/70 border-emerald-100" 
                      : "bg-gray-50 border-gray-200"
                  }`}>
                    <span className="text-[10px] font-black text-gray-700 uppercase">Salário Final Líquido:</span>
                    <span className={`text-base font-black ${isTeam ? "text-emerald-800" : "text-gray-900"}`}>
                      R$ {med.finalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW 4: OCORRÊNCIAS NO FLUXO DE CAIXA */}
      {activeSubTab === "ocorrencias_fluxo" && (
        <div className="bg-white rounded-[32px] border border-gray-200 shadow-xl overflow-hidden space-y-4">
          <div className="p-6 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gray-50/70">
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
                  className="bg-white border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-xs font-bold outline-none w-56 focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <Filter size={14} className="text-gray-400" />
                <select
                  value={selectedDoctorFilter}
                  onChange={e => setSelectedDoctorFilter(e.target.value)}
                  className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="ALL">Todos os Médicos & Equipe</option>
                  {teamSettings.doctors.map(d => (
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
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs flex justify-between items-center">
              <span className="text-gray-700 font-bold">Saldo das Ocorrências:</span>
              <span className={`font-black ${totalOcorrenciasEntradas - totalOcorrenciasSaidas >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                R$ {(totalOcorrenciasEntradas - totalOcorrenciasSaidas).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-100 text-gray-600 font-black uppercase text-[10px] tracking-wider border-b border-gray-200">
                  <th className="p-3.5 pl-6">Data</th>
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
                  const isTeam = oc.medico.includes("HEART") || teamSettings.doctors.find(d => d.name === oc.medico)?.isTeamMember;
                  return (
                    <tr key={idx} className="hover:bg-gray-50/80 transition-colors">
                      <td className="p-3.5 pl-6 text-gray-500 font-bold">{oc.data}</td>
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
            {removedLotes.length > 0 && (
              <button
                onClick={handleRestoreLotes}
                className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-black rounded-xl transition-colors"
              >
                Restaurar Notas Removidas ({removedLotes.length})
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="bg-gray-100 text-gray-700 font-black uppercase text-[9px] tracking-wider border-b border-gray-200">
                  <th className="p-3 pl-4">Lote</th>
                  <th className="p-3">Comp.</th>
                  <th className="p-3">Período / Natureza</th>
                  <th className="p-3">Título</th>
                  <th className="p-3">Vencimento</th>
                  <th className="p-3 text-right">Bruto (R$)</th>
                  <th className="p-3 text-right">Glosas</th>
                  <th className="p-3 text-right">PIS</th>
                  <th className="p-3 text-right">COFINS</th>
                  <th className="p-3 text-right">CSLL</th>
                  <th className="p-3 text-right">IRRF</th>
                  <th className="p-3 text-right font-black">TT Impostos</th>
                  <th className="p-3 text-right font-black">TT Retenção</th>
                  <th className="p-3 text-right">Lucro Presum.</th>
                  <th className="p-3 text-right">IRPJ</th>
                  <th className="p-3 text-right">CSLL 9%</th>
                  <th className="p-3 text-right">ADD 10%</th>
                  <th className="p-3 text-right">Reserva Imp.</th>
                  <th className="p-3 text-right bg-blue-50 font-black text-blue-900">Líquido (R$)</th>
                  <th className="p-3 text-center pr-4">Remover</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                {excelData.lotesUnimed.length === 0 ? (
                  <tr>
                    <td colSpan={20} className="p-12 text-center">
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
                      <td className="p-3 text-gray-600">{lote.competencia}</td>
                      <td className="p-3 font-bold text-gray-700">{lote.tipo}</td>
                      <td className="p-3 font-mono text-gray-600">{lote.titulo}</td>
                      <td className="p-3 text-gray-500">{lote.vencimento}</td>
                      <td className="p-3 text-right font-bold text-gray-900">R$ {lote.bruto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right text-rose-600 font-bold">{lote.glosa > 0 ? `-R$ ${lote.glosa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : "-"}</td>
                      <td className="p-3 text-right text-gray-500">R$ {lote.pis.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right text-gray-500">R$ {lote.cofins.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right text-gray-500">R$ {lote.csll.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right text-gray-500">R$ {lote.irrf.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right font-black text-gray-700">R$ {lote.ttImpostosNota.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right font-black text-purple-700">R$ {lote.ttRetencao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right text-gray-500">R$ {lote.lucroPresumido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right text-gray-500">R$ {lote.irpj.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right text-gray-500">R$ {lote.csll9.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right text-gray-500">R$ {lote.add10.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right text-amber-700 font-bold">R$ {lote.reservaImposto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right font-black text-blue-700 bg-blue-50/50">
                        R$ {lote.liquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
                  const totGlosa = excelData.lotesUnimed.reduce((acc, l) => acc + l.glosa, 0);
                  const totIrrf = excelData.lotesUnimed.reduce((acc, l) => acc + l.irrf, 0);
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
                      <td colSpan={5} className="p-3 pl-4 uppercase">TOTAL CONSOLIDADO DOS LOTES</td>
                      <td className="p-3 text-right">R$ {totBruto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right text-rose-600">{totGlosa > 0 ? `-R$ ${totGlosa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : "-"}</td>
                      <td className="p-3 text-right">R$ {totPis.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right">R$ {totCofins.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right">R$ {totCsll.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right">R$ {totIrrf.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
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
                  Rochele ({teamSettings.doctors.find(d => d.key === 'rochele')?.proporcaoHeartDinamica || 26.79}%), 
                  Thais ({teamSettings.doctors.find(d => d.key === 'thais')?.proporcaoHeartDinamica || 28.97}%), 
                  Luis ({teamSettings.doctors.find(d => d.key === 'luis')?.proporcaoHeartDinamica || 26.79}%), 
                  Kathize ({teamSettings.doctors.find(d => d.key === 'kathize')?.proporcaoHeartDinamica || 17.45}%)
                </span>
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-gray-400 uppercase font-bold block">Total Despesas Equipe:</span>
              <span className="font-black text-rose-600 text-base">R$ 21.618,34</span>
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
                  const pRochele = teamSettings.doctors.find(x => x.key === 'rochele')?.proporcaoHeartDinamica || 26.79;
                  const pThais = teamSettings.doctors.find(x => x.key === 'thais')?.proporcaoHeartDinamica || 28.97;
                  const pLuis = teamSettings.doctors.find(x => x.key === 'luis')?.proporcaoHeartDinamica || 26.79;
                  const pKathize = teamSettings.doctors.find(x => x.key === 'kathize')?.proporcaoHeartDinamica || 17.45;

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
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-5">
                    {[
                      ["Lançamentos", matrixModalData.records.length, "bg-gray-50"],
                      ["Vlr. Hon.", matrixModalData.records.reduce((s: number, x: any) => s + (Number(x.honorValue) || 0), 0), "bg-blue-50"],
                      ["Vlr. Oper.", matrixModalData.records.reduce((s: number, x: any) => s + (Number(x.operationalValue) || 0), 0), "bg-teal-50"],
                      ["Vlr. Filme", matrixModalData.records.reduce((s: number, x: any) => s + (Number(x.filmValue) || 0), 0), "bg-teal-50"],
                      ["Vlr. Nota", matrixModalData.records.reduce((s: number, x: any) => s + (Number(x.honorValue) || 0) + (Number(x.operationalValue) || 0) + (Number(x.filmValue) || 0), 0), "bg-emerald-50"]
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
                          <th className="p-2">Relação Nr</th>
                          <th className="p-2">Data</th>
                          <th className="p-2">Nome do Usuário</th>
                          <th className="p-2">Código do Usuário</th>
                          <th className="p-2">Documento</th>
                          <th className="p-2">Qt.</th>
                          <th className="p-2">Código AMB</th>
                          <th className="p-2 min-w-[260px]">Descrição</th>
                          <th className="p-2 text-right">Vlr. Hon.</th>
                          <th className="p-2 text-right">Vlr. Oper.</th>
                          <th className="p-2 text-right">Vlr. Filme</th>
                          <th className="p-2 text-right">Vlr. Tx Adm</th>
                          <th className="p-2 min-w-[230px]">Prestador Executante</th>
                          <th className="p-2 min-w-[230px]">Prestador Pagamento</th>
                          <th className="p-2 min-w-[230px]">Prestador Protocolo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                        {matrixModalData.records.map((rec, idx) => (
                          <tr key={idx} className="hover:bg-blue-50/30">
                            <td className="p-2 font-bold">{rec.protocol || "-"}</td>
                            <td className="p-2 whitespace-nowrap">{rec.date || "-"}</td>
                            <td className="p-2 font-semibold">{rec.patientName || "-"}</td>
                            <td className="p-2 font-mono">{rec.patientCode || "-"}</td>
                            <td className="p-2 font-mono">{rec.document || "-"}</td>
                            <td className="p-2 text-right">{rec.quantity ?? "-"}</td>
                            <td className="p-2 font-mono">{rec.ambCode || "-"}</td>
                            <td className="p-2">{rec.procedureDescription || "-"}</td>
                            <td className="p-2 text-right font-mono">{(Number(rec.honorValue) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                            <td className="p-2 text-right font-mono text-teal-700">{(Number(rec.operationalValue) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                            <td className="p-2 text-right font-mono text-teal-700">{(Number(rec.filmValue) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                            <td className="p-2 text-right font-mono">{(Number(rec.administrativeFee) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                            <td className="p-2">{rec.executingProvider || "-"}</td>
                            <td className="p-2">{rec.paymentProvider || "-"}</td>
                            <td className="p-2">{rec.protocolProvider || "-"}</td>
                          </tr>
                        ))}
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
