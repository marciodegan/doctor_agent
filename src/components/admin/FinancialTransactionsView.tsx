import React, { useState, useEffect } from "react";
import { useGroup } from "../../contexts/GroupContext";
import { 
  Wallet, 
  Plus, 
  Search, 
  Trash2, 
  Edit3, 
  Loader2, 
  Check, 
  Filter,
  Calendar,
  ArrowDownRight,
  ArrowUpRight,
  TrendingUp,
  X,
  Users,
  UserCheck,
  UserX,
  Sparkles,
  FileText,
  Tag,
  Settings2,
  Percent,
  Sliders,
  DollarSign
} from "lucide-react";
import { TransactionTypesManager } from "./TransactionTypesManager";
import { FinancialTransactionAIImport } from "./FinancialTransactionAIImport";
import { FinancialPrelaunchesPanel } from "./FinancialPrelaunchesPanel";
import { FinancialTransactionType } from "../../types/financial";
import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";

interface FinancialTransactionsViewProps {
  closingId: string | null;
}

export function FinancialTransactionsView({ closingId }: FinancialTransactionsViewProps) {
  const { activeGroup, apiFetch } = useGroup();
  const [closings, setClosings] = useState<any[]>([]);
  const [selectedClosingId, setSelectedClosingId] = useState<string | null>(closingId);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ date: "", lote: "", doctorId: "", doctorName: "", typeId: "", typeName: "", amount: "", observation: "" });
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDoctorFilter, setSelectedDoctorFilter] = useState("ALL");
  const [selectedNatureFilter, setSelectedNatureFilter] = useState("ALL");

  // Transaction Types list loaded from API
  const [transactionTypes, setTransactionTypes] = useState<FinancialTransactionType[]>([]);
  const [isTypesModalOpen, setIsTypesModalOpen] = useState(false);
  const [isAIImportOpen, setIsAIImportOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<"FLOW" | "PRELAUNCHES">("FLOW");
  const [prelaunchRefreshToken, setPrelaunchRefreshToken] = useState(0);

  // New Transaction Modal State
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [allocationMode, setAllocationMode] = useState<"TEAM" | "DOCTOR">("TEAM");
  const [autoSplitTeam, setAutoSplitTeam] = useState(true);
  const [multipleRows, setMultipleRows] = useState<{ doctorId: string; amount: string }[]>([]);
  // Team allocation methods: nominal, dynamic HeaRT, or all-doctor PROP percentage.
  const [rateioMethod, setRateioMethod] = useState<"PROPORCAO_HEART" | "NOMINAL" | "PROP_GERAL">("PROPORCAO_HEART");

  const [newForm, setNewForm] = useState({
    doctorId: "",
    doctorName: "",
    typeName: "Aluguel Sala / Consultório",
    typeId: "aluguel_sala",
    amount: "",
    nature: "DEBIT" as "DEBIT" | "CREDIT",
    observation: "",
    date: new Date().toLocaleDateString("pt-BR"),
    lote: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Team Doctors with both Nominal Equity % and Dynamic PROPORÇÃO HEART %
  const [teamDoctors, setTeamDoctors] = useState([
    { key: "rochele", name: "ROCHELE LORENZI POL", isTeam: true, percent: 29, proporcaoHeart: 26.79, disponivel: 36086.02 },
    { key: "thais", name: "THAIS ISABEL LUMIKOSKI", isTeam: true, percent: 29, proporcaoHeart: 28.97, disponivel: 39019.05 },
    { key: "luis", name: "LUIS BONGIOLO MATTOS", isTeam: true, percent: 29, proporcaoHeart: 26.79, disponivel: 36086.02 },
    { key: "kathize", name: "KATHIZE LIRA", isTeam: true, percent: 13, proporcaoHeart: 17.45, disponivel: 23509.08 }
  ]);

  // All doctors list with team status
  const allDoctors = [
    { key: "rochele", name: "ROCHELE LORENZI POL", isTeam: true, percent: 29 },
    { key: "thais", name: "THAIS ISABEL LUMIKOSKI", isTeam: true, percent: 29 },
    { key: "luis", name: "LUIS BONGIOLO MATTOS", isTeam: true, percent: 29 },
    { key: "kathize", name: "KATHIZE LIRA", isTeam: true, percent: 13 },
    { key: "tamara", name: "TAMARA QUINTINO REGIS", isTeam: false, percent: 0 },
    { key: "luan", name: "LUAN JUNIOR VIGNATTI", isTeam: false, percent: 0 },
    { key: "thaynara", name: "THAYNARA MAESTRI VIGNATTI", isTeam: false, percent: 0 },
    { key: "camila", name: "CAMILA RIBEIRO DUTRA", isTeam: false, percent: 0 },
    { key: "maria_eduarda", name: "MARIA EDUARDA CASA SOUZA MACHADO", isTeam: false, percent: 0 }
  ];

  // New transactions use the actual Firestore document ID from the shared doctors collection.
  // Slug keys remain only as a fallback for environments where the doctor query is unavailable.
  const [doctorOptions, setDoctorOptions] = useState<any[]>([]);
  const selectableDoctors = doctorOptions.length > 0
    ? doctorOptions
    : allDoctors.map(doctor => ({ ...doctor, id: doctor.key }));

  const fetchDoctorOptions = async () => {
    if (!activeGroup?.id) { setDoctorOptions([]); return; }
    try {
      const snapshot = await getDocs(query(collection(db, "doctors"), where("teamId", "==", activeGroup?.id || ""), where("active", "==", true), orderBy("name")));
      const docs = snapshot.docs
        .map(document => {
          const data = document.data();
          const fallback = allDoctors.find(doctor => String(doctor.name).trim().toUpperCase() === String(data.name || "").trim().toUpperCase());
          return {
            id: document.id,
            key: fallback?.key || document.id,
            name: String(data.name || "").trim(),
            isTeam: Boolean(fallback?.isTeam),
            percent: fallback?.percent || 0
          };
        })
        .filter(doctor => doctor.name);
      setDoctorOptions(docs);
    } catch (error) {
      console.error("Failed to load canonical doctor IDs:", error);
      setDoctorOptions([]);
    }
  };

  useEffect(() => {
    setDoctorOptions([]);
    fetchDoctorOptions();
  }, [activeGroup?.id]);

  // Fetch transaction types
  const fetchTransactionTypes = async () => {
    if (!activeGroup) return;
    try {
      const res = await apiFetch("/api/app/financial/transaction-types");
      if (res.ok) {
        const data = await res.json();
        setTransactionTypes(data);
      }
    } catch (e) {
      console.error("Failed to load transaction types:", e);
    }
  };

  // Fetch team settings
  const fetchTeamSettings = async () => {
    if (!activeGroup) return;
    try {
      const res = await apiFetch("/api/app/financial/team-settings");
      if (res.ok) {
        const data = await res.json();
        if (data.doctors && data.doctors.length > 0) {
          const members = data.doctors.filter((d: any) => d.isTeamMember).map((d: any) => ({
            key: d.key,
            name: d.name,
            isTeam: true,
            percent: d.teamSharePercent || 0,
            proporcaoHeart: d.proporcaoHeartDinamica || (d.teamSharePercent || 0),
            disponivel: d.disponivelPeriodo || 0
          }));
          if (members.length > 0) {
            setTeamDoctors(members);
          }
        }
      }
    } catch (e) {
      console.error("Failed to load team settings:", e);
    }
  };

  // Load closings list if no closing is selected
  useEffect(() => {
    if (!activeGroup) return;
    const fetchClosings = async () => {
      try {
        const res = await apiFetch("/api/app/financial/closings");
        if (res.ok) {
          const data = await res.json();
          setClosings(data);
          if (!selectedClosingId && data.length > 0) {
            setSelectedClosingId(data[0].id);
          }
        }
      } catch (e) {
        console.error("Failed to load closings:", e);
      }
    };
    fetchClosings();
    fetchTransactionTypes();
    fetchTeamSettings();
    fetchDoctorOptions();
  }, [activeGroup]);

  // Sync selectedClosingId
  useEffect(() => {
    if (closingId) {
      setSelectedClosingId(closingId);
    }
  }, [closingId]);

  const fetchTransactions = async () => {
    if (!selectedClosingId || !activeGroup) return;
    try {
      setLoading(true);
      const res = await apiFetch(`/api/app/financial/closings/${selectedClosingId}/details`);
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions || []);
      }
    } catch (e) {
      console.error("Failed to load transactions:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [selectedClosingId, activeGroup]);

  // When user selects a transaction type from the dropdown, PRE-FILL the nature (ENTRADA / SAÍDA) and suggested scope!
  const handleSelectTransactionType = (typeId: string) => {
    const matched = transactionTypes.find(t => String(t.id) === String(typeId) || t.name === typeId);
    if (matched) {
      if (matched.isMultiple) {
        setAllocationMode("DOCTOR");
        setAutoSplitTeam(false);
        setMultipleRows(selectableDoctors.map(doctor => ({ doctorId: String(doctor.id), amount: "" })));
      } else {
        setMultipleRows([]);
      }
      setNewForm(prev => ({
        ...prev,
        typeName: matched.name,
        typeId: matched.id,
        nature: matched.nature // AUTO-PREFILL NATURE (CREDIT / DEBIT)
      }));

      // Suggest allocation mode
      if (matched.defaultScope === "TEAM") {
        setAllocationMode("TEAM");
      } else if (matched.defaultScope === "DOCTOR" || matched.isSalary === true) {
        setAllocationMode("DOCTOR");
      }

      // Automatically set rateio method:
      // For Entradas da equipe (ex: Azambuja, Marieta, Consultório), default to NOMINAL (29%, 29%, 29%, 13%)
      // For Despesas operacionais da equipe (ex: Aluguel, Celular), default to PROPORCAO_HEART dinâmica
      if (matched.defaultRateioMethod) {
        setRateioMethod(matched.defaultRateioMethod);
      } else if (matched.nature === "CREDIT") {
        setRateioMethod("NOMINAL");
      } else {
        setRateioMethod("PROPORCAO_HEART");
      }
    } else {
      setNewForm(prev => ({
        ...prev,
        typeId: "",
        typeName: "",
        nature: "DEBIT"
      }));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Deseja realmente excluir este lançamento financeiro do fluxo de caixa?")) return;
    try {
      const res = await apiFetch(`/api/app/financial/transactions/${id}`, { method: "DELETE" });
      if (res.ok) {
        setTransactions(transactions.filter(t => t.id !== id));
      }
    } catch (e: any) {
      alert("Erro ao excluir: " + e.message);
    }
  };

  const handleSaveEdit = async (id: string) => {
    const selectedType = transactionTypes.find(t => String(t.id) === String(editForm.typeId));
    if (!selectedType) {
      alert("Selecione um tipo de lançamento cadastrado.");
      return;
    }
    if (selectedType.defaultScope === "DOCTOR" && !editForm.doctorId && !(selectedType as any).doctorId) {
      alert("Este tipo exige a seleção de um médico.");
      return;
    }
    try {
      const doctor = selectableDoctors.find(d => String(d.id) === String(editForm.doctorId));
      const payload = {
        ...editForm,
        typeId: selectedType.id,
        typeName: selectedType.name,
        doctorId: selectedType.defaultScope === "TEAM" ? "" : (editForm.doctorId || (selectedType as any).doctorId || ""),
        doctorName: selectedType.defaultScope === "TEAM" ? "" : (doctor?.name || editForm.doctorName || ""),
        lote: editForm.lote.trim()
      };
      const res = await apiFetch(`/api/app/financial/transactions/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      const responseData = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert("Erro ao salvar: " + (responseData.error || responseData.message || `HTTP ${res.status}`));
        return;
      }
      await fetchTransactions();
      setEditingId(null);
    } catch (e: any) {
      alert("Erro ao salvar: " + e.message);
    }
  };

  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClosingId) {
      alert("Por favor, selecione um fechamento / competência.");
      return;
    }
    const selectedType = transactionTypes.find(t => String(t.id) === String(newForm.typeId));
    const parsedAmount = Number(newForm.amount);
    if (!selectedType?.isMultiple && (!newForm.amount || !Number.isFinite(parsedAmount) || parsedAmount === 0 ||
        (parsedAmount < 0 && selectedType?.allowNegativeAmount !== true))) {
      alert(selectedType?.allowNegativeAmount
        ? "Informe um valor diferente de zero. Valores negativos são permitidos para este tipo."
        : "Informe um valor maior que zero.");
      return;
    }
    if (!selectedType) {
      alert("O tipo de lançamento selecionado não está mais disponível. Atualize a lista e selecione um tipo cadastrado.");
      await fetchTransactionTypes();
      return;
    }
    if (selectedType.isMultiple) {
      const rows = multipleRows.filter(row => row.doctorId && row.amount.trim() !== "" && Number(row.amount) !== 0);
      if (rows.length < 1 || rows.some(row => !Number.isFinite(Number(row.amount)) || (Number(row.amount) < 0 && selectedType.allowNegativeAmount !== true))) {
        alert("Preencha ao menos um médico com um valor válido diferente de zero.");
        return;
      }
    } else if (selectedType.defaultScope === "DOCTOR" && !newForm.doctorId && !(selectedType as any).doctorId) {
      alert("Este tipo de lançamento é individual. Selecione um médico antes de confirmar.");
      return;
    }
    try {
      setIsSubmitting(true);
      const isTeam = allocationMode === "TEAM";
      const commonPayload = {
        closingId: selectedClosingId,
        typeName: selectedType.name,
        typeId: selectedType.id,
        nature: newForm.nature,
        observation: newForm.observation,
        date: newForm.date,
        lote: newForm.lote.trim()
      };
      if (selectedType.isMultiple) {
        const rows = multipleRows.filter(row => row.doctorId && row.amount.trim() !== "" && Number(row.amount) !== 0);
        for (const row of rows) {
          const doctor = selectableDoctors.find(d => String(d.id) === String(row.doctorId));
          const res = await apiFetch("/api/app/financial/transactions", {
            method: "POST",
            body: JSON.stringify({ ...commonPayload, doctorId: row.doctorId, doctorName: doctor?.name || "", scope: "DOCTOR", amount: Number(row.amount), source: "MANUAL", autoSplitTeam: false })
          });
          const responseData = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(responseData.error || responseData.message || "Erro HTTP " + res.status);
        }
      } else {
        const res = await apiFetch("/api/app/financial/transactions", {
          method: "POST",
          body: JSON.stringify({
            closingId: selectedClosingId,
            doctorId: newForm.doctorId || null,
            doctorName: newForm.doctorId ? (selectableDoctors.find(d => String(d.id) === String(newForm.doctorId))?.name || "") : null,
            scope: newForm.doctorId ? "DOCTOR" : "TEAM",
            typeName: newForm.typeName,
            typeId: newForm.typeId || "avulso",
            amount: parseFloat(newForm.amount),
            nature: newForm.nature,
            observation: newForm.observation,
            date: newForm.date,
            lote: newForm.lote.trim(),
            source: isTeam ? "RATEIO_EQUIPE" : "MANUAL",
            autoSplitTeam: isTeam && autoSplitTeam,
            rateioMethod: isTeam ? rateioMethod : undefined
          })
        });
        const responseData = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(responseData.error || responseData.message || "Erro HTTP " + res.status);
      }
      setMultipleRows([]);
      setIsNewModalOpen(false);
      setNewForm({
        doctorId: "",
        doctorName: "",
        typeName: "Aluguel Sala / Consultório",
        typeId: "",
        amount: "",
        nature: "DEBIT",
        observation: "",
        date: new Date().toLocaleDateString("pt-BR"),
        lote: ""
      });
      await fetchTransactions();
    } catch (err: any) {
      alert("Erro ao criar lançamento: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter transactions
  const filtered = transactions.filter(t => {
    const docName = t.doctorName || "";
    const matchDoctor = selectedDoctorFilter === "ALL" 
      ? true 
      : selectedDoctorFilter === "HEART" 
      ? docName.includes("HEART") 
      : docName.includes(selectedDoctorFilter);
    const matchNature = selectedNatureFilter === "ALL" 
      ? true 
      : t.nature === selectedNatureFilter;
    const matchSearch = searchTerm 
      ? (t.typeName || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
        (t.observation || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        docName.toLowerCase().includes(searchTerm.toLowerCase())
      : true;
    return matchDoctor && matchNature && matchSearch;
  });

  const totalEntradas = filtered
    .filter(t => t.nature === "CREDIT")
    .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

  const totalSaidas = filtered
    .filter(t => t.nature === "DEBIT")
    .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

  const inputAmount = parseFloat(newForm.amount) || 0;

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-16 font-sans">
      {/* Header and Controls */}
      <div className="bg-white p-6 lg:p-7 rounded-[32px] border border-gray-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-black">
              <Wallet size={20} />
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight">Fluxo de Caixa & Ocorrências</h2>
              <p className="text-xs text-gray-500 font-medium">
                Lançamentos de despesas corporativas HeaRT e ocorrências individuais com rateio dinâmico (Proporção HeaRT)
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Competência Selector */}
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-2xl px-3.5 py-2 text-xs">
            <Calendar size={15} className="text-gray-400" />
            <span className="font-black text-gray-500 uppercase text-[10px]">Competência:</span>
            <select
              value={selectedClosingId || ""}
              onChange={e => setSelectedClosingId(e.target.value)}
              className="bg-transparent font-black text-gray-900 outline-none cursor-pointer"
            >
              {closings.filter(c => String(c.status || "").toUpperCase() !== "FECHADO").map(c => (
                <option key={c.id} value={c.id}>
                  {c.monthKey} ({c.status})
                </option>
              ))}
              {closings.length === 0 && <option value="">Nenhum fechamento</option>}
            </select>
          </div>

          {/* Gerenciar Tipos de Lançamento */}
          <button
            onClick={() => setIsTypesModalOpen(true)}
            className="flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-4 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider transition cursor-pointer active:scale-95"
          >
            <Tag size={15} />
            <span>Tipos de Lançamento</span>
          </button>

          {/* AI Import Preview Button */}
          <button
            onClick={() => setIsAIImportOpen(true)}
            disabled={!selectedClosingId || closings.some(c => c.id === selectedClosingId && String(c.status || "").toUpperCase() === "FECHADO")}
            title="Interpretar PDF ou imagem e revisar pré-lançamentos antes de importar"
            className="flex items-center gap-2 bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 px-4 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Sparkles size={15} />
            <span>Importar PDF com IA</span>
          </button>

          {activeSection === "FLOW" && (
            <>
              {/* Novo Lançamento Button */}
              <button
                onClick={async () => {
                  await fetchTransactionTypes();
                  setIsNewModalOpen(true);
                }}
                disabled={transactionTypes.length === 0 || closings.some(c => c.id === selectedClosingId && String(c.status || "").toUpperCase() === "FECHADO")}
                title={transactionTypes.length === 0 ? "Cadastre um tipo de lançamento antes de lançar valores." : closings.some(c => c.id === selectedClosingId && String(c.status || "").toUpperCase() === "FECHADO") ? "Fechamento concluído. Crie ou selecione um fechamento em aberto." : "Novo lançamento"}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20 active:scale-95 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus size={16} />
                <span>Novo Lançamento</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white p-1.5 shadow-xs">
        <button onClick={() => setActiveSection("FLOW")} className={`rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition ${activeSection === "FLOW" ? "bg-emerald-600 text-white shadow-sm" : "text-gray-500 hover:bg-gray-50"}`}>
          <span className="inline-flex items-center gap-2"><Wallet size={14}/> Fluxo de Caixa</span>
        </button>
        <button onClick={() => setActiveSection("PRELAUNCHES")} className={`rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition ${activeSection === "PRELAUNCHES" ? "bg-violet-600 text-white shadow-sm" : "text-gray-500 hover:bg-gray-50"}`}>
          <span className="inline-flex items-center gap-2"><FileText size={14}/> Pré-lançamentos</span>
        </button>
      </div>

      {activeSection === "FLOW" && (
        <>
      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-gray-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase text-gray-400 block tracking-wider">Entradas no Fluxo</span>
            <span className="text-xl font-black text-emerald-600">
              +R$ {totalEntradas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <ArrowUpRight size={20} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-gray-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase text-gray-400 block tracking-wider">Saídas & Deduções</span>
            <span className={`text-xl font-black ${totalSaidas < 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {totalSaidas < 0 ? "+R$ " : "-R$ "}{Math.abs(totalSaidas).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <ArrowDownRight size={20} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-gray-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase text-gray-400 block tracking-wider">Total Ocorrências</span>
            <span className="text-xl font-black text-gray-900">{filtered.length} lançamentos</span>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <TrendingUp size={20} />
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-3xl border border-gray-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar tipo, médico ou descrição..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-3.5 py-2 text-xs font-semibold text-gray-800 placeholder-gray-400 outline-none focus:border-emerald-500 w-64"
            />
          </div>

          {/* Doctor filter */}
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-xs">
            <Users size={14} className="text-gray-400" />
            <select
              value={selectedDoctorFilter}
              onChange={e => setSelectedDoctorFilter(e.target.value)}
              className="bg-transparent font-bold text-gray-700 outline-none cursor-pointer"
            >
              <option value="ALL">Todos os Médicos / Equipe</option>
              <option value="HEART">Rateio Equipe HeaRT (Sócios)</option>
              {allDoctors.map(d => (
                <option key={d.key} value={d.name}>
                  {d.name} {d.isTeam ? "(Equipe)" : "(Externo)"}
                </option>
              ))}
            </select>
          </div>

          {/* Nature filter */}
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-xs">
            <Filter size={14} className="text-gray-400" />
            <select
              value={selectedNatureFilter}
              onChange={e => setSelectedNatureFilter(e.target.value)}
              className="bg-transparent font-bold text-gray-700 outline-none cursor-pointer"
            >
              <option value="ALL">Todas as Naturezas</option>
              <option value="CREDIT">Apenas Entradas (+)</option>
              <option value="DEBIT">Apenas Saídas (-)</option>
            </select>
          </div>
        </div>

        <div className="text-xs font-bold text-gray-400">
          Mostrando {filtered.length} de {transactions.length} registros
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-[32px] border border-gray-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center space-y-2">
            <Loader2 size={28} className="animate-spin text-emerald-600 mx-auto" />
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Carregando fluxo de caixa...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Wallet size={36} className="text-gray-300 mx-auto" />
            <p className="font-black text-gray-700 text-sm">Nenhum lançamento encontrado</p>
            <p className="text-xs text-gray-400">Clique em "Novo Lançamento" para adicionar uma ocorrência ou despesa de equipe.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200 text-gray-400 font-black uppercase text-[10px] tracking-wider">
                  <th className="p-4 pl-6">Data</th>
                  <th className="p-4">Lote</th>
                  <th className="p-4">Médico / Destinatário</th>
                  <th className="p-4">Tipo de Lançamento</th>
                  <th className="p-4">Descrição / Observação</th>
                  <th className="p-4 text-center">Origem / Rateio</th>
                  <th className="p-4 text-right pr-6">Valor (R$)</th>
                  <th className="p-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
                {filtered.map(t => {
                  const isDebit = t.nature === "DEBIT";
                  const isHeartTeam = t.scope === "TEAM" || (t.doctorName && t.doctorName.includes("HEART"));
                  const isTeamSplit = t.scope === "TEAM_SPLIT";

                  return (
                    <tr key={t.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="p-4 pl-6 text-gray-500 font-mono text-[11px] whitespace-nowrap">
                        {editingId === t.id ? (
                          <input type="text" value={editForm.date} onChange={e => setEditForm({ ...editForm, date: e.target.value })} placeholder="DD/MM/AAAA" className="border border-gray-300 rounded px-2 py-1 w-24 text-xs" />
                        ) : (t.date || "14/09/2026")}
                      </td>

                      <td className="p-4 font-bold text-blue-700 whitespace-nowrap">
                        {editingId === t.id ? (
                          <input type="text" value={editForm.lote} onChange={e => setEditForm({ ...editForm, lote: e.target.value })} placeholder="Lote" className="border border-gray-300 rounded px-2 py-1 w-20 text-xs" />
                        ) : (t.lote || t.loteNumber || t.batchNumber || t.batch || "—")}
                      </td>

                      <td className="p-4">
                        {editingId === t.id ? (
                          <select value={editForm.doctorId} onChange={e => {
                            const doctor = selectableDoctors.find(d => String(d.id) === String(e.target.value));
                            setEditForm({ ...editForm, doctorId: doctor?.id || "", doctorName: doctor?.name || "" });
                          }} className="border border-gray-300 rounded px-2 py-1 w-48 text-xs">
                            <option value="">Equipe / compartilhado</option>
                            {selectableDoctors.map(doctor => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}
                          </select>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="font-black text-gray-900">{t.doctorName}</span>
                            {isHeartTeam && (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-100 text-emerald-800">Equipe HeaRT</span>
                            )}
                            {isTeamSplit && (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-blue-100 text-blue-800">Rateio {t.teamSharePercent ? `${t.teamSharePercent}%` : "HeaRT"}</span>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="p-4 font-bold text-gray-800">
                        {editingId === t.id ? (
                          <select value={editForm.typeId} onChange={e => {
                            const type = transactionTypes.find(item => String(item.id) === String(e.target.value));
                            setEditForm({ ...editForm, typeId: type?.id || "", typeName: type?.name || "", doctorId: type?.defaultScope === "TEAM" ? "" : editForm.doctorId, doctorName: type?.defaultScope === "TEAM" ? "" : editForm.doctorName });
                          }} className="border border-gray-300 rounded px-2 py-1 w-52 text-xs">
                            <option value="">Selecione o tipo</option>
                            {transactionTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
                          </select>
                        ) : (t.typeName || t.typeId)}
                      </td>

                      <td className="p-4 text-gray-500 text-[11px] max-w-xs truncate">
                        {editingId === t.id ? (
                          <input
                            type="text"
                            value={editForm.observation}
                            onChange={e => setEditForm({ ...editForm, observation: e.target.value })}
                            className="border border-gray-300 rounded px-2 py-1 text-xs w-full"
                          />
                        ) : (
                          t.observation || "—"
                        )}
                      </td>

                      <td className="p-4 text-center">
                        <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase ${
                          isTeamSplit
                            ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                            : isHeartTeam
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-gray-100 text-gray-600"
                        }`}>
                          {t.source || "FLUXO"}
                        </span>
                      </td>

                      <td className="p-4 text-right pr-6 whitespace-nowrap">
                        {editingId === t.id ? (
                          <input
                            type="number"
                            step="0.01"
                            value={editForm.amount}
                            onChange={e => setEditForm({ ...editForm, amount: e.target.value })}
                            className="border border-gray-300 rounded px-2 py-1 text-xs font-black text-right w-24"
                          />
                        ) : (
                          <span className={`font-black text-xs ${(t.allowNegativeAmount === true && Number(t.amount) < 0) || !isDebit ? "text-emerald-600" : "text-rose-600"}`}>
                            {t.allowNegativeAmount === true
                              ? `${Number(t.amount) < 0 ? "-" : ""}R$ `
                              : (isDebit ? "-R$ " : "+R$ ")}
                            {Math.abs(Number(t.amount) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        )}
                      </td>

                      <td className="p-4 text-right whitespace-nowrap">
                        {editingId === t.id ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleSaveEdit(t.id)}
                              className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700 cursor-pointer"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="w-7 h-7 rounded-lg bg-gray-200 text-gray-600 flex items-center justify-center hover:bg-gray-300 cursor-pointer"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => {
                                setEditingId(t.id);
                                const matchedType = transactionTypes.find(type => String(type.id) === String(t.typeId))
                                  || transactionTypes.find(type => type.name === t.typeName);
                                setEditForm({
                                  date: t.date || "",
                                  lote: String(t.lote || t.loteNumber || t.batchNumber || t.batch || ""),
                                  doctorId: t.scope === "TEAM" ? "" : String(t.doctorId || ""),
                                  doctorName: t.scope === "TEAM" ? "" : String(t.doctorName || ""),
                                  typeId: String(matchedType?.id || t.typeId || ""),
                                  typeName: matchedType?.name || t.typeName || "",
                                  amount: String(t.amount ?? ""),
                                  observation: t.observation || ""
                                });
                              }}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                            >
                              <Edit3 size={15} />
                            </button>
                            <button
                              onClick={() => handleDelete(t.id)}
                              className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

        </>
      )}

      {activeSection === "PRELAUNCHES" && (
        <FinancialPrelaunchesPanel
          closingId={selectedClosingId}
          apiFetch={apiFetch}
          transactionTypes={transactionTypes}
          doctors={selectableDoctors}
          refreshToken={prelaunchRefreshToken}
          onTypesChanged={fetchTransactionTypes}
          onImported={() => { fetchTransactions(); fetchTransactionTypes(); }}
        />
      )}

      {/* Modal: New Manual Transaction with Team Dynamic Rateio Logic */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-[250] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] p-6 lg:p-8 max-w-xl w-full shadow-2xl space-y-5 animate-in fade-in zoom-in-95 font-sans max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <h3 className="font-black text-gray-900 text-base uppercase">Novo Lançamento no Fluxo de Caixa</h3>
                <p className="text-xs text-gray-500">
                  Lançamento com pré-preenchimento automático e rateio dinâmico (Proporção HeaRT)
                </p>
              </div>
              <button 
                onClick={() => setIsNewModalOpen(false)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTransaction} className="space-y-4 text-xs font-bold">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider">Data *</label>
                <input
                  type="text"
                  required
                  value={newForm.date}
                  onChange={e => setNewForm({ ...newForm, date: e.target.value })}
                  placeholder="DD/MM/AAAA"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none font-semibold text-xs focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider">Lote (opcional)</label>
                <input
                  type="text"
                  value={newForm.lote}
                  onChange={e => setNewForm({ ...newForm, lote: e.target.value })}
                  placeholder="Informe o número do lote para vincular à matriz"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none font-semibold text-xs focus:border-emerald-500"
                />
                <span className="text-[10px] text-gray-400 font-normal">Ao informar o lote, o lançamento fica vinculado a ele para os cálculos e totais da matriz.</span>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider block">Tipo de Lançamento *</label>
                <select
                  required
                  value={transactionTypes.some(t => String(t.id) === String(newForm.typeId)) ? newForm.typeId : ""}
                  onChange={e => handleSelectTransactionType(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none text-xs font-bold text-gray-900 focus:bg-white focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Selecione um tipo cadastrado</option>
                  {transactionTypes.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} — [{t.nature === "DEBIT" ? "SAÍDA" : "ENTRADA"}] {t.isMultiple ? "(MÚLTIPLO)" : t.isSalary === true ? "(SALÁRIO INDIVIDUAL)" : t.matrixAdjustmentType === "ACERTO_FINAL" ? "(ACERTO FINAL INDIVIDUAL)" : t.matrixAdjustmentType ? "(ACERTO INDIVIDUAL)" : t.defaultScope === "TEAM" ? "(Equipe HeaRT)" : "(Individual)"}
                    </option>
                  ))}
                </select>
              </div>

              {transactionTypes.find(t => String(t.id) === String(newForm.typeId))?.isMultiple ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider block">Valores por médico</label>
                    <p className="mt-1 text-[10px] text-gray-500">Preencha somente os médicos envolvidos. Cada valor será salvo como um lançamento individual. A soma não precisa fechar em zero.</p>
                  </div>
                  <div className="space-y-2">
                    {multipleRows.map((row, index) => {
                      const doctor = selectableDoctors.find(d => String(d.id) === String(row.doctorId));
                      return <div key={row.doctorId || index} className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 p-2">
                        <span className="truncate text-xs font-bold text-gray-800">{doctor?.name || "Médico"}</span>
                        <input aria-label={"Valor de " + (doctor?.name || "médico")} type="number" step="0.01" placeholder="0,00" value={row.amount} onChange={e => setMultipleRows(current => current.map((item, i) => i === index ? { ...item, amount: e.target.value } : item))} className="w-full rounded-lg border border-gray-200 bg-white p-2 text-right text-xs font-bold outline-none focus:border-emerald-500" />
                      </div>;
                    })}
                  </div>
                  <p className="text-xs font-bold text-slate-700">Soma informativa: {multipleRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider block">Médico {transactionTypes.find(t => String(t.id) === String(newForm.typeId))?.defaultScope === "DOCTOR" ? "(obrigatório para este tipo)" : "(opcional)"}</label>
                  <select value={newForm.doctorId || ""} onChange={e => {
                    const doctor = selectableDoctors.find(d => String(d.id) === String(e.target.value));
                    setNewForm({ ...newForm, doctorId: doctor?.id || "", doctorName: doctor?.name || "" });
                  }} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none text-xs font-bold text-gray-900 focus:bg-white focus:ring-2 focus:ring-emerald-500">
                    <option value="">{transactionTypes.find(t => String(t.id) === String(newForm.typeId))?.defaultScope === "DOCTOR" ? "Selecione o médico para este lançamento individual" : "Equipe / despesa compartilhada (ratear conforme o tipo)"}</option>
                    {selectableDoctors.map(doctor => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}
                  </select>
                  <span className="text-[10px] text-gray-400 font-normal">{transactionTypes.find(t => String(t.id) === String(newForm.typeId))?.defaultScope === "DOCTOR" ? "Este tipo é individual e exige a seleção de um médico." : "Sem médico selecionado, será usada a regra de rateio configurada no tipo de lançamento."}</span>
                </div>
              )}

              {!transactionTypes.find(t => String(t.id) === String(newForm.typeId))?.isMultiple && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider">Valor Total (R$) *</label>
                  <input type="number" step="0.01" min={transactionTypes.find(t => String(t.id) === String(newForm.typeId))?.allowNegativeAmount === true ? undefined : "0.01"} placeholder={transactionTypes.find(t => String(t.id) === String(newForm.typeId))?.allowNegativeAmount === true ? "Ex.: 1000 ou -1000" : "0,00"} required value={newForm.amount} onChange={e => setNewForm({ ...newForm, amount: e.target.value })} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none font-black text-xs focus:border-emerald-500" />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider">Observação</label>
                <input type="text" value={newForm.observation} onChange={e => setNewForm({ ...newForm, observation: e.target.value })} placeholder="Descrição opcional" className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none font-semibold text-xs focus:border-emerald-500" />
              </div>

              <p className="text-[10px] text-gray-500 font-medium">
                A natureza, o destino e as regras de rateio são definidos no cadastro do tipo de lançamento e não podem ser alterados aqui.
                {transactionTypes.find(t => String(t.id) === String(newForm.typeId))?.allowNegativeAmount === true && " Este tipo permite valores positivos e negativos para acertos entre médicos."}
              </p>

              {/* Submit Buttons */}
              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-bold hover:bg-gray-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-black uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/20 active:scale-95 transition disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                  <span>Confirmar e Lançar</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <FinancialTransactionAIImport
        open={isAIImportOpen}
        closingId={selectedClosingId}
        apiFetch={apiFetch}
        onClose={() => setIsAIImportOpen(false)}
        onPrelaunchesCreated={() => { setActiveSection("PRELAUNCHES"); setPrelaunchRefreshToken(value => value + 1); }}
      />

      {/* Modal: Gerenciar Tipos de Lançamento */}
      {isTypesModalOpen && (
        <div className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-5xl w-full max-h-[92vh] overflow-y-auto shadow-2xl relative">
            <TransactionTypesManager
              onSelectTypeForNewTransaction={(type) => {
                handleSelectTransactionType(type.name);
                setIsTypesModalOpen(false);
                setIsNewModalOpen(true);
              }}
              onClose={() => {
                setIsTypesModalOpen(false);
                fetchTransactionTypes();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
