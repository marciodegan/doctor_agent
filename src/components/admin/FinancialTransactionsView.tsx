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
  Tag,
  Settings2,
  Percent,
  Sliders,
  DollarSign
} from "lucide-react";
import { TransactionTypesManager } from "./TransactionTypesManager";
import { FinancialTransactionType } from "../../types/financial";

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
  const [editForm, setEditForm] = useState({ amount: "", observation: "", typeName: "" });
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDoctorFilter, setSelectedDoctorFilter] = useState("ALL");
  const [selectedNatureFilter, setSelectedNatureFilter] = useState("ALL");

  // Transaction Types list loaded from API
  const [transactionTypes, setTransactionTypes] = useState<FinancialTransactionType[]>([]);
  const [isTypesModalOpen, setIsTypesModalOpen] = useState(false);

  // New Transaction Modal State
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [allocationMode, setAllocationMode] = useState<"TEAM" | "DOCTOR">("TEAM");
  const [autoSplitTeam, setAutoSplitTeam] = useState(true);
  // Rateio Method: PROPORCAO_HEART (Dynamic based on period revenue) vs NOMINAL (29/29/29/13)
  const [rateioMethod, setRateioMethod] = useState<"PROPORCAO_HEART" | "NOMINAL">("PROPORCAO_HEART");

  const [newForm, setNewForm] = useState({
    doctorId: "rochele",
    doctorName: "ROCHELE LORENZI POL",
    typeName: "Aluguel Sala / Consultório",
    typeId: "aluguel_sala",
    amount: "",
    nature: "DEBIT" as "DEBIT" | "CREDIT",
    observation: "",
    date: new Date().toLocaleDateString("pt-BR")
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
  const handleSelectTransactionType = (typeName: string) => {
    const matched = transactionTypes.find(t => t.name === typeName);
    if (matched) {
      setNewForm(prev => ({
        ...prev,
        typeName: matched.name,
        typeId: matched.id,
        nature: matched.nature // AUTO-PREFILL NATURE (CREDIT / DEBIT)
      }));

      // Suggest allocation mode
      if (matched.defaultScope === "TEAM") {
        setAllocationMode("TEAM");
      } else if (matched.defaultScope === "DOCTOR") {
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
        typeName
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
    try {
      const res = await apiFetch(`/api/app/financial/transactions/${id}`, {
        method: "PUT",
        body: JSON.stringify(editForm)
      });
      if (res.ok) {
        setTransactions(transactions.map(t => t.id === id ? { ...t, ...editForm } : t));
        setEditingId(null);
      }
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
    if (!newForm.amount || parseFloat(newForm.amount) <= 0) {
      alert("Por favor, informe um valor válido.");
      return;
    }

    try {
      setIsSubmitting(true);
      const isTeam = allocationMode === "TEAM";

      const res = await apiFetch("/api/app/financial/transactions", {
        method: "POST",
        body: JSON.stringify({
          closingId: selectedClosingId,
          doctorId: isTeam ? "heart_equipe" : newForm.doctorId,
          doctorName: isTeam ? "HEART CIRURGIA CARDIOVASCULAR" : newForm.doctorName,
          scope: isTeam ? "TEAM" : "DOCTOR",
          typeName: newForm.typeName,
          typeId: newForm.typeId || "avulso",
          amount: parseFloat(newForm.amount),
          nature: newForm.nature,
          observation: newForm.observation,
          date: newForm.date,
          source: isTeam ? "RATEIO_EQUIPE" : "MANUAL",
          autoSplitTeam: isTeam && autoSplitTeam,
          rateioMethod: isTeam ? rateioMethod : undefined
        })
      });

      if (res.ok) {
        setIsNewModalOpen(false);
        setNewForm({
          doctorId: "rochele",
          doctorName: "ROCHELE LORENZI POL",
          typeName: "Aluguel Sala / Consultório",
          typeId: "aluguel_sala",
          amount: "",
          nature: "DEBIT",
          observation: "",
          date: new Date().toLocaleDateString("pt-BR")
        });
        fetchTransactions();
      }
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

          {/* Novo Lançamento Button */}
          <button
            onClick={() => setIsNewModalOpen(true)}
            disabled={closings.some(c => c.id === selectedClosingId && String(c.status || "").toUpperCase() === "FECHADO")}
            title={closings.some(c => c.id === selectedClosingId && String(c.status || "").toUpperCase() === "FECHADO") ? "Fechamento concluído. Crie ou selecione um fechamento em aberto." : "Novo lançamento"}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20 active:scale-95 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus size={16} />
            <span>Novo Lançamento</span>
          </button>
        </div>
      </div>

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
            <span className="text-xl font-black text-rose-600">
              -R$ {totalSaidas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
                        {t.date || "14/09/2026"}
                      </td>

                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-gray-900">{t.doctorName}</span>
                          {isHeartTeam && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-100 text-emerald-800">
                              Equipe HeaRT
                            </span>
                          )}
                          {isTeamSplit && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-blue-100 text-blue-800">
                              Rateio {t.teamSharePercent ? `${t.teamSharePercent}%` : "HeaRT"}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="p-4 font-bold text-gray-800">
                        {t.typeName || t.typeId}
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
                          <span className={`font-black text-xs ${isDebit ? "text-rose-600" : "text-emerald-600"}`}>
                            {isDebit ? "-R$ " : "+R$ "}
                            {Math.abs(t.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
                                setEditForm({
                                  amount: String(t.amount || ""),
                                  observation: t.observation || "",
                                  typeName: t.typeName || ""
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
              {/* Tipo de Despesa / Ocorrência - AUTO-PREFILLS NATURE AND SCOPE */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider block">
                  Tipo de Lançamento *
                </label>
                <select
                  value={newForm.typeName}
                  onChange={e => handleSelectTransactionType(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none text-xs font-bold text-gray-900 focus:bg-white focus:ring-2 focus:ring-emerald-500"
                >
                  {transactionTypes.length > 0 ? (
                    transactionTypes.map(t => (
                      <option key={t.id} value={t.name}>
                        {t.name} — [{t.nature === "DEBIT" ? "SAÍDA" : "ENTRADA"}] {t.defaultScope === "TEAM" ? "(Equipe HeaRT)" : "(Individual)"}
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="Aluguel Sala / Consultório">Aluguel Sala / Consultório — [SAÍDA] (Equipe)</option>
                      <option value="Celular Corporativo">Celular Corporativo — [SAÍDA] (Equipe)</option>
                      <option value="Consultório Itajaí">Consultório Itajaí — [SAÍDA] (Equipe)</option>
                      <option value="Contador Heart">Contador Heart — [SAÍDA] (Equipe)</option>
                      <option value="DARE">DARE — [SAÍDA] (Equipe)</option>
                      <option value="Disponibilidade Médica - UTI">Disponibilidade Médica - UTI — [ENTRADA] (Médico)</option>
                      <option value="Sobreavisos">Sobreavisos — [ENTRADA] (Médico)</option>
                    </>
                  )}
                </select>
                <span className="text-[10px] text-gray-400 block font-normal">
                  * Ao selecionar o tipo, o campo de <strong>Entrada / Saída</strong> é pré-preenchido automaticamente!
                </span>
              </div>

              {/* Somente os campos essenciais do lançamento */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider">Valor Total (R$) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0,00"
                  required
                  value={newForm.amount}
                  onChange={e => setNewForm({ ...newForm, amount: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none font-black text-xs focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
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
                  <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider">Observação</label>
                  <input
                    type="text"
                    value={newForm.observation}
                    onChange={e => setNewForm({ ...newForm, observation: e.target.value })}
                    placeholder="Descrição opcional"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none font-semibold text-xs focus:border-emerald-500"
                  />
                </div>
              </div>

              <p className="text-[10px] text-gray-500 font-medium">
                A natureza, o destino e as regras de rateio são definidos no cadastro do tipo de lançamento e não podem ser alterados aqui.
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
