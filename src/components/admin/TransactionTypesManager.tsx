import React, { useState, useEffect } from "react";
import { useGroup } from "../../contexts/GroupContext";
import { 
  Tag, 
  Plus, 
  Search, 
  Trash2, 
  Edit3, 
  Loader2, 
  Check, 
  ArrowDownRight, 
  ArrowUpRight, 
  Users, 
  User, 
  Layers, 
  Sparkles, 
  X,
  AlertCircle,
  HelpCircle,
  RotateCcw,
  Sliders,
  DollarSign
} from "lucide-react";
import { FinancialTransactionType } from "../../types/financial";

interface TransactionTypesManagerProps {
  onSelectTypeForNewTransaction?: (type: FinancialTransactionType) => void;
  onClose?: () => void;
}

export function TransactionTypesManager({ onSelectTypeForNewTransaction, onClose }: TransactionTypesManagerProps) {
  const { activeGroup, apiFetch } = useGroup();
  const [types, setTypes] = useState<FinancialTransactionType[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [natureFilter, setNatureFilter] = useState<"ALL" | "CREDIT" | "DEBIT">("ALL");
  const [scopeFilter, setScopeFilter] = useState<"ALL" | "TEAM" | "DOCTOR">("ALL");
  
  // Modal State for Add / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<FinancialTransactionType | null>(null);
  const [form, setForm] = useState({
    name: "",
    nature: "CREDIT" as "CREDIT" | "DEBIT",
    defaultScope: "TEAM" as "TEAM" | "DOCTOR" | "CLOSING",
    defaultRateioMethod: "NOMINAL" as "NOMINAL" | "PROPORCAO_HEART",
    category: "Receitas Equipe",
    description: ""
  });
  const [submitting, setSubmitting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const fetchTypes = async () => {
    if (!activeGroup) return;
    try {
      setLoading(true);
      const res = await apiFetch("/api/app/financial/transaction-types");
      if (res.ok) {
        const data = await res.json();
        setTypes(data);
      }
    } catch (e) {
      console.error("Failed to load transaction types:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTypes();
  }, [activeGroup]);

  const handleOpenAdd = (preset?: "ENTRADA_EQUIPE" | "DESPESA_EQUIPE") => {
    setEditingType(null);
    if (preset === "ENTRADA_EQUIPE") {
      setForm({
        name: "",
        nature: "CREDIT",
        defaultScope: "TEAM",
        defaultRateioMethod: "NOMINAL",
        category: "Receitas Equipe",
        description: "Entrada de produção ou plantão com rateio societário da equipe (29%, 29%, 29%, 13%)"
      });
    } else if (preset === "DESPESA_EQUIPE") {
      setForm({
        name: "",
        nature: "DEBIT",
        defaultScope: "TEAM",
        defaultRateioMethod: "PROPORCAO_HEART",
        category: "Infraestrutura",
        description: "Despesa com rateio dinâmico pela Proporção HeaRT do período"
      });
    } else {
      setForm({
        name: "",
        nature: "CREDIT",
        defaultScope: "TEAM",
        defaultRateioMethod: "NOMINAL",
        category: "Receitas Equipe",
        description: ""
      });
    }
    setIsModalOpen(true);
  };

  const handleOpenEdit = (typeItem: FinancialTransactionType) => {
    setEditingType(typeItem);
    setForm({
      name: typeItem.name,
      nature: typeItem.nature,
      defaultScope: typeItem.defaultScope || "TEAM",
      defaultRateioMethod: typeItem.defaultRateioMethod || (typeItem.nature === "CREDIT" ? "NOMINAL" : "PROPORCAO_HEART"),
      category: typeItem.category || "Geral",
      description: typeItem.description || ""
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      alert("Por favor, informe o nome do tipo de lançamento.");
      return;
    }

    try {
      setSubmitting(true);
      if (editingType) {
        // Edit existing
        const res = await apiFetch(`/api/app/financial/transaction-types/${editingType.id}`, {
          method: "PUT",
          body: JSON.stringify(form)
        });
        if (res.ok) {
          setTypes(prev => prev.map(t => t.id === editingType.id ? { ...t, ...form } : t));
          setIsModalOpen(false);
          setFeedbackMsg("Tipo de lançamento atualizado com sucesso!");
          setTimeout(() => setFeedbackMsg(null), 3000);
        }
      } else {
        // Create new
        const res = await apiFetch("/api/app/financial/transaction-types", {
          method: "POST",
          body: JSON.stringify(form)
        });
        if (res.ok) {
          const created = await res.json();
          setTypes(prev => [created, ...prev]);
          setIsModalOpen(false);
          setFeedbackMsg(`Novo tipo "${form.name}" cadastrado com sucesso!`);
          setTimeout(() => setFeedbackMsg(null), 3000);
        }
      }
    } catch (err: any) {
      alert("Erro ao salvar tipo de lançamento: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickToggleNature = async (typeItem: FinancialTransactionType) => {
    const nextNature = typeItem.nature === "DEBIT" ? "CREDIT" : "DEBIT";
    const nextMethod = nextNature === "CREDIT" ? "NOMINAL" : "PROPORCAO_HEART";
    try {
      const res = await apiFetch(`/api/app/financial/transaction-types/${typeItem.id}`, {
        method: "PUT",
        body: JSON.stringify({ 
          nature: nextNature,
          defaultRateioMethod: nextMethod 
        })
      });
      if (res.ok) {
        setTypes(prev => prev.map(t => t.id === typeItem.id ? { ...t, nature: nextNature, defaultRateioMethod: nextMethod } : t));
        setFeedbackMsg(`Natureza de "${typeItem.name}" alterada para ${nextNature === "DEBIT" ? "SAÍDA (Débito)" : "ENTRADA (Crédito)"}`);
        setTimeout(() => setFeedbackMsg(null), 3000);
      }
    } catch (e: any) {
      alert("Erro ao alterar natureza: " + e.message);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Deseja remover "${name}" do cadastro de tipos? Os lançamentos que já estão no Fluxo de Caixa serão mantidos sem nenhuma alteração.`)) return;
    try {
      const res = await apiFetch(`/api/app/financial/transaction-types/${id}`, {
        method: "DELETE"
      });
      if (res.ok) {
        setTypes(prev => prev.filter(t => t.id !== id));
        setFeedbackMsg(`Tipo "${name}" removido do cadastro. Lançamentos existentes foram preservados.`);
        setTimeout(() => setFeedbackMsg(null), 4000);
      } else {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Não foi possível remover o tipo de lançamento.");
      }
    } catch (e: any) {
      alert("Erro ao excluir: " + e.message);
    }
  };

  const filteredTypes = (types || []).filter(t => {
    if (!t) return false;
    const nameStr = t.name || "";
    const catStr = t.category || "";
    const descStr = t.description || "";
    const term = searchTerm || "";
    const matchSearch = nameStr.toLowerCase().includes(term.toLowerCase()) ||
      catStr.toLowerCase().includes(term.toLowerCase()) ||
      descStr.toLowerCase().includes(term.toLowerCase());
    const matchNature = natureFilter === "ALL" ? true : t.nature === natureFilter;
    const matchScope = scopeFilter === "ALL" ? true : (t.defaultScope || "TEAM") === scopeFilter;
    return matchSearch && matchNature && matchScope;
  });

  const totalDebitos = types.filter(t => t.nature === "DEBIT").length;
  const totalCreditos = types.filter(t => t.nature === "CREDIT").length;
  const totalEquipe = types.filter(t => (t.defaultScope || "TEAM") === "TEAM").length;

  return (
    <div className="space-y-6 max-w-[1500px] mx-auto p-4 md:p-6 pb-20 font-sans">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-500/20 rounded-2xl border border-blue-400/30 text-blue-300">
                <Tag size={26} />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white flex items-center gap-3">
                  Tipos de Lançamento
                  <span className="text-xs px-2.5 py-1 bg-emerald-500/20 text-emerald-300 rounded-full font-bold border border-emerald-400/20">
                    Entradas & Saídas com Rateio
                  </span>
                </h1>
                <p className="text-sm text-slate-300 max-w-2xl">
                  Cadastre novos tipos de <strong>Entradas</strong> (Azambuja, Marieta, Consultório) com rateio nominal de <strong>29%, 29%, 29%, 13%</strong>, 
                  ou <strong>Saídas</strong> (Aluguel, Celular, etc.) com a Proporção HeaRT dinâmica. No fluxo, o campo Entrada/Saída e o rateio vêm pré-preenchidos!
                </p>
              </div>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Nova Entrada da Equipe */}
            <button
              onClick={() => handleOpenAdd("ENTRADA_EQUIPE")}
              className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-4 py-3 rounded-2xl font-black text-xs tracking-wide shadow-lg shadow-emerald-500/20 active:scale-95 transition cursor-pointer"
            >
              <Plus size={16} />
              <span>Nova Entrada (29/29/29/13%)</span>
            </button>

            {/* Nova Despesa Operacional */}
            <button
              onClick={() => handleOpenAdd("DESPESA_EQUIPE")}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 px-4 py-3 rounded-2xl font-black text-xs tracking-wide active:scale-95 transition cursor-pointer"
            >
              <Plus size={16} />
              <span>Nova Saída / Despesa</span>
            </button>

            {onClose && (
              <button
                onClick={onClose}
                className="p-3 bg-white/10 hover:bg-white/20 rounded-2xl text-white transition cursor-pointer"
              >
                <X size={20} />
              </button>
            )}
          </div>
        </div>

        {/* Feedback Alert */}
        {feedbackMsg && (
          <div className="mt-4 p-3 bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
            <Check size={16} />
            <span>{feedbackMsg}</span>
          </div>
        )}

        {/* Quick KPI stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-white/10">
          <div className="bg-white/5 backdrop-blur-md rounded-2xl p-3 border border-white/10">
            <div className="text-[10px] font-black tracking-wider text-slate-400 uppercase">Total Cadastrado</div>
            <div className="text-2xl font-black text-white mt-1">{types.length}</div>
          </div>
          <div className="bg-emerald-500/10 backdrop-blur-md rounded-2xl p-3 border border-emerald-500/20">
            <div className="text-[10px] font-black tracking-wider text-emerald-300 uppercase flex items-center gap-1">
              <ArrowUpRight size={14} /> Entradas (Receitas)
            </div>
            <div className="text-2xl font-black text-emerald-200 mt-1">{totalCreditos}</div>
          </div>
          <div className="bg-rose-500/10 backdrop-blur-md rounded-2xl p-3 border border-rose-500/20">
            <div className="text-[10px] font-black tracking-wider text-rose-300 uppercase flex items-center gap-1">
              <ArrowDownRight size={14} /> Saídas (Despesas)
            </div>
            <div className="text-2xl font-black text-rose-200 mt-1">{totalDebitos}</div>
          </div>
          <div className="bg-blue-500/10 backdrop-blur-md rounded-2xl p-3 border border-blue-500/20">
            <div className="text-[10px] font-black tracking-wider text-blue-300 uppercase flex items-center gap-1">
              <Users size={14} /> Rateio Equipe HeaRT
            </div>
            <div className="text-2xl font-black text-blue-200 mt-1">{totalEquipe}</div>
          </div>
        </div>
      </div>

      {/* Rule Highlight Banner */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Entradas */}
        <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-4 text-xs text-emerald-950 flex items-start gap-3 shadow-sm">
          <div className="p-2 bg-emerald-600 text-white rounded-xl shrink-0 mt-0.5">
            <ArrowUpRight size={18} />
          </div>
          <div className="space-y-1">
            <span className="font-black text-emerald-900 uppercase block text-[11px]">
              Entradas da Equipe (Azambuja, Marieta, Consultório):
            </span>
            <p className="leading-relaxed text-emerald-800">
              Receitas corporativas são rateadas pelo percentual nominal societário: 
              <strong> 29% Rochele, 29% Thais, 29% Luis e 13% Kathize</strong>. 
              Ao lançar no fluxo, o sistema já gera os créditos proporcionais para cada médico.
            </p>
          </div>
        </div>

        {/* Saídas */}
        <div className="bg-blue-50/80 border border-blue-200 rounded-2xl p-4 text-xs text-blue-950 flex items-start gap-3 shadow-sm">
          <div className="p-2 bg-blue-600 text-white rounded-xl shrink-0 mt-0.5">
            <ArrowDownRight size={18} />
          </div>
          <div className="space-y-1">
            <span className="font-black text-blue-900 uppercase block text-[11px]">
              Saídas Operacionais (Aluguel, Sala, Celular, etc.):
            </span>
            <p className="leading-relaxed text-blue-800">
              Despesas fixas e operacionais utilizam a <strong>PROPORÇÃO HEART</strong> (calculada dinamicamente com base nas receitas recebidas no período por cada sócio).
            </p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search */}
        <div className="relative w-full md:w-96">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nome, categoria ou descrição..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Nature filter */}
          <div className="flex items-center bg-gray-100 p-1 rounded-xl text-xs font-bold text-gray-600">
            <button
              onClick={() => setNatureFilter("ALL")}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${natureFilter === "ALL" ? "bg-white text-gray-900 shadow-sm" : "hover:text-gray-900"}`}
            >
              Todos ({types.length})
            </button>
            <button
              onClick={() => setNatureFilter("CREDIT")}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1 transition cursor-pointer ${natureFilter === "CREDIT" ? "bg-emerald-600 text-white shadow-sm" : "text-emerald-700 hover:text-emerald-900"}`}
            >
              <ArrowUpRight size={13} /> Entradas ({totalCreditos})
            </button>
            <button
              onClick={() => setNatureFilter("DEBIT")}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1 transition cursor-pointer ${natureFilter === "DEBIT" ? "bg-rose-600 text-white shadow-sm" : "text-rose-700 hover:text-rose-900"}`}
            >
              <ArrowDownRight size={13} /> Saídas ({totalDebitos})
            </button>
          </div>

          {/* Scope filter */}
          <div className="flex items-center bg-gray-100 p-1 rounded-xl text-xs font-bold text-gray-600">
            <button
              onClick={() => setScopeFilter("ALL")}
              className={`px-2.5 py-1.5 rounded-lg transition cursor-pointer ${scopeFilter === "ALL" ? "bg-white text-gray-900 shadow-sm" : "hover:text-gray-900"}`}
            >
              Todos Escopos
            </button>
            <button
              onClick={() => setScopeFilter("TEAM")}
              className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition cursor-pointer ${scopeFilter === "TEAM" ? "bg-blue-600 text-white shadow-sm" : "text-blue-700 hover:text-blue-900"}`}
            >
              <Users size={12} /> Equipe HeaRT
            </button>
            <button
              onClick={() => setScopeFilter("DOCTOR")}
              className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition cursor-pointer ${scopeFilter === "DOCTOR" ? "bg-purple-600 text-white shadow-sm" : "text-purple-700 hover:text-purple-900"}`}
            >
              <User size={12} /> Individual
            </button>
          </div>
        </div>
      </div>

      {/* Types Table / Cards */}
      {loading ? (
        <div className="bg-white rounded-3xl border border-gray-200 p-12 text-center shadow-sm">
          <Loader2 size={32} className="animate-spin text-blue-600 mx-auto mb-3" />
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Carregando tipos de lançamentos...</p>
        </div>
      ) : filteredTypes.length === 0 ? (
        <div className="bg-white rounded-3xl border border-gray-200 p-12 text-center shadow-sm space-y-3">
          <Tag size={40} className="text-gray-300 mx-auto" />
          <h3 className="text-base font-bold text-gray-800">Nenhum tipo de lançamento encontrado</h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            Não foram localizados registros com os filtros atuais.
          </p>
          <div className="flex justify-center gap-2 pt-2">
            <button
              onClick={() => handleOpenAdd("ENTRADA_EQUIPE")}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer"
            >
              <Plus size={16} /> Cadastrar Entrada
            </button>
            <button
              onClick={() => handleOpenAdd("DESPESA_EQUIPE")}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer"
            >
              <Plus size={16} /> Cadastrar Saída
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-gray-200/80 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200/80 text-[10px] font-black text-gray-400 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Nome do Lançamento</th>
                  <th className="py-3.5 px-4 text-center">Natureza (Entrada / Saída)</th>
                  <th className="py-3.5 px-4 text-center">Escopo Sugerido</th>
                  <th className="py-3.5 px-4 text-center">Método de Rateio</th>
                  <th className="py-3.5 px-4">Categoria</th>
                  <th className="py-3.5 px-4">Descrição / Observação</th>
                  <th className="py-3.5 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredTypes.map(t => {
                  const isDebit = t.nature === "DEBIT";
                  const isTeam = (t.defaultScope || "TEAM") === "TEAM";
                  const isNominal = t.defaultRateioMethod === "NOMINAL" || (!t.defaultRateioMethod && !isDebit);

                  return (
                    <tr key={t.id} className="hover:bg-blue-50/30 transition group">
                      {/* Name */}
                      <td className="py-3.5 px-4 font-bold text-gray-900">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${isDebit ? "bg-rose-500" : "bg-emerald-500"}`} />
                          <span className="text-sm">{t.name}</span>
                        </div>
                      </td>

                      {/* Nature with interactive switch */}
                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleQuickToggleNature(t)}
                          title="Clique para alternar rapidamente entre Entrada e Saída"
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black border transition cursor-pointer active:scale-95 ${
                            isDebit 
                              ? "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100" 
                              : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                          }`}
                        >
                          {isDebit ? (
                            <>
                              <ArrowDownRight size={13} className="text-rose-600" />
                              <span>SAÍDA (Débito)</span>
                            </>
                          ) : (
                            <>
                              <ArrowUpRight size={13} className="text-emerald-600" />
                              <span>ENTRADA (Crédito)</span>
                            </>
                          )}
                        </button>
                      </td>

                      {/* Default Scope */}
                      <td className="py-3.5 px-4 text-center">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10px] font-bold ${
                          isTeam 
                            ? "bg-blue-50 text-blue-800 border border-blue-200" 
                            : "bg-purple-50 text-purple-800 border border-purple-200"
                        }`}>
                          {isTeam ? <Users size={12} /> : <User size={12} />}
                          <span>{isTeam ? "Rateio Equipe HeaRT" : "Médico Individual"}</span>
                        </span>
                      </td>

                      {/* Default Rateio Method */}
                      <td className="py-3.5 px-4 text-center">
                        {isTeam ? (
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase ${
                            isNominal
                              ? "bg-emerald-100 text-emerald-900 border border-emerald-200"
                              : "bg-indigo-100 text-indigo-900 border border-indigo-200"
                          }`}>
                            {isNominal ? "29/29/29/13% (Nominal)" : "Proporção HeaRT"}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-[10px]">Sem Rateio</span>
                        )}
                      </td>

                      {/* Category */}
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-700 rounded-md font-semibold text-[10px]">
                          <Layers size={11} className="text-gray-400" />
                          <span>{t.category || "Geral"}</span>
                        </span>
                      </td>

                      {/* Description */}
                      <td className="py-3.5 px-4 text-gray-500 text-[11px] max-w-xs truncate">
                        {t.description || "—"}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {onSelectTypeForNewTransaction && (
                            <button
                              onClick={() => onSelectTypeForNewTransaction(t)}
                              title="Lançar este tipo no fluxo de caixa agora"
                              className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-lg text-[10px] transition cursor-pointer"
                            >
                              Lançar no Fluxo
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenEdit(t)}
                            title="Editar tipo de lançamento"
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                          >
                            <Edit3 size={15} />
                          </button>
                          {t.isCustom && (
                            <button
                              onClick={() => handleDelete(t.id, t.name)}
                              title="Excluir tipo"
                              className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Cadastrar ou Editar Tipo */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-6 relative">
              <button
                onClick={() => setIsModalOpen(false)}
                className="absolute top-5 right-5 text-gray-400 hover:text-white transition p-1 rounded-full hover:bg-white/10 cursor-pointer"
              >
                <X size={20} />
              </button>
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-500/20 text-blue-300 rounded-xl border border-blue-400/20">
                  <Tag size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-tight text-white">
                    {editingType ? "Editar Tipo de Lançamento" : "Novo Tipo de Lançamento"}
                  </h3>
                  <p className="text-xs text-slate-300">
                    Defina o nome, se é Entrada ou Saída, e as regras de rateio.
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSave} className="p-6 space-y-4">
              {/* Nome */}
              <div>
                <label className="block text-[11px] font-black uppercase text-gray-700 tracking-wider mb-1.5">
                  Nome do Lançamento *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Entrada Azambuja, Entrada Marieta, Consultório Particular, Aluguel de Sala..."
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none font-semibold text-gray-900"
                />
              </div>

              {/* Natureza: ENTRADA ou SAÍDA */}
              <div>
                <label className="block text-[11px] font-black uppercase text-gray-700 tracking-wider mb-1.5">
                  Natureza Padrão (Entrada ou Saída) *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setForm(prev => ({ 
                        ...prev, 
                        nature: "CREDIT",
                        defaultRateioMethod: "NOMINAL",
                        category: prev.category === "Infraestrutura" ? "Receitas Equipe" : prev.category
                      }));
                    }}
                    className={`flex items-center justify-center gap-2 p-3 rounded-2xl border-2 font-black text-xs transition cursor-pointer ${
                      form.nature === "CREDIT"
                        ? "bg-emerald-50 border-emerald-500 text-emerald-800 shadow-md shadow-emerald-500/10"
                        : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    <ArrowUpRight size={16} className={form.nature === "CREDIT" ? "text-emerald-600" : "text-gray-400"} />
                    <div className="text-left">
                      <span className="block leading-none">ENTRADA (Crédito)</span>
                      <span className="text-[10px] font-normal text-emerald-700/80">Receita / Azambuja / Marieta</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setForm(prev => ({ 
                        ...prev, 
                        nature: "DEBIT",
                        defaultRateioMethod: "PROPORCAO_HEART",
                        category: prev.category === "Receitas Equipe" ? "Infraestrutura" : prev.category
                      }));
                    }}
                    className={`flex items-center justify-center gap-2 p-3 rounded-2xl border-2 font-black text-xs transition cursor-pointer ${
                      form.nature === "DEBIT"
                        ? "bg-rose-50 border-rose-500 text-rose-800 shadow-md shadow-rose-500/10"
                        : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    <ArrowDownRight size={16} className={form.nature === "DEBIT" ? "text-rose-600" : "text-gray-400"} />
                    <div className="text-left">
                      <span className="block leading-none">SAÍDA (Débito)</span>
                      <span className="text-[10px] font-normal text-rose-700/80">Despesa / Aluguel / Celular</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Escopo Padrão */}
              <div>
                <label className="block text-[11px] font-black uppercase text-gray-700 tracking-wider mb-1.5">
                  Escopo Sugerido
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, defaultScope: "TEAM" })}
                    className={`flex items-center gap-2 p-3 rounded-2xl border font-bold text-xs transition cursor-pointer ${
                      form.defaultScope === "TEAM"
                        ? "bg-blue-50 border-blue-500 text-blue-900 ring-2 ring-blue-500/20"
                        : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    <Users size={16} className={form.defaultScope === "TEAM" ? "text-blue-600" : "text-gray-400"} />
                    <div className="text-left">
                      <span className="block leading-none text-xs">Rateio Equipe HeaRT</span>
                      <span className="text-[9px] font-normal text-blue-700/80">Divide entre os médicos sócios</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setForm({ ...form, defaultScope: "DOCTOR" })}
                    className={`flex items-center gap-2 p-3 rounded-2xl border font-bold text-xs transition cursor-pointer ${
                      form.defaultScope === "DOCTOR"
                        ? "bg-purple-50 border-purple-500 text-purple-900 ring-2 ring-purple-500/20"
                        : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    <User size={16} className={form.defaultScope === "DOCTOR" ? "text-purple-600" : "text-gray-400"} />
                    <div className="text-left">
                      <span className="block leading-none text-xs">Médico Individual</span>
                      <span className="text-[9px] font-normal text-purple-700/80">Lançamento direto no médico</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Se Escopo Equipe: Método de Rateio */}
              {form.defaultScope === "TEAM" && (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-2xl space-y-2">
                  <label className="block text-[10px] font-black uppercase text-gray-700 tracking-wider">
                    Método de Rateio da Equipe *
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, defaultRateioMethod: "NOMINAL" })}
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                        form.defaultRateioMethod === "NOMINAL"
                          ? "bg-emerald-50 border-emerald-500 text-emerald-950 font-black ring-2 ring-emerald-500/20"
                          : "bg-white border-gray-200 text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      <span className="block font-black text-xs text-emerald-800">29% / 29% / 29% / 13%</span>
                      <span className="text-[10px] text-gray-500 font-normal leading-tight block mt-0.5">
                        Rateio Societário Nominal (Recomendado para Entradas Azambuja, Marieta, Consultório)
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setForm({ ...form, defaultRateioMethod: "PROPORCAO_HEART" })}
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                        form.defaultRateioMethod === "PROPORCAO_HEART"
                          ? "bg-blue-50 border-blue-500 text-blue-950 font-black ring-2 ring-blue-500/20"
                          : "bg-white border-gray-200 text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      <span className="block font-black text-xs text-blue-800">PROPORÇÃO HEART</span>
                      <span className="text-[10px] text-gray-500 font-normal leading-tight block mt-0.5">
                        Dinâmica pelo faturamento do período (Recomendado para Despesas Operacionais)
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {/* Categoria */}
              <div>
                <label className="block text-[11px] font-black uppercase text-gray-700 tracking-wider mb-1.5">
                  Categoria
                </label>
                <select
                  value={form.category}
                  onChange={e => setForm({ ...form, category: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none font-semibold text-gray-900"
                >
                  <option value="Receitas Equipe">Receitas da Equipe (Azambuja, Marieta, Consultório, Cartão)</option>
                  <option value="Infraestrutura">Infraestrutura (Salas, Aluguéis, Consultórios)</option>
                  <option value="Comunicação">Comunicação (Celular, Telefonia, Internet)</option>
                  <option value="Contabilidade">Contabilidade & Gestão (Contador Heart)</option>
                  <option value="Tributário">Tributário & Impostos (DARE, INSS, Alvará)</option>
                  <option value="Equipe Cirúrgica">Equipe Cirúrgica (Instrumentador, Auxiliares)</option>
                  <option value="Operacional Unimed">Operacional Unimed & Cooperativa</option>
                  <option value="Tecnologia">Tecnologia (Google, Softwares, Licenças)</option>
                  <option value="Plantões">Plantões & Retaguarda</option>
                  <option value="Sobreavisos">Sobreavisos</option>
                  <option value="Produção">Produção Médica</option>
                  <option value="Geral">Outros / Geral</option>
                </select>
              </div>

              {/* Descrição */}
              <div>
                <label className="block text-[11px] font-black uppercase text-gray-700 tracking-wider mb-1.5">
                  Observações / Detalhes
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: Entradas de plantão Azambuja para serem rateadas entre os membros da equipe..."
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none text-gray-900"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-black text-xs shadow-lg shadow-blue-500/20 active:scale-95 transition disabled:opacity-50 cursor-pointer"
                >
                  {submitting && <Loader2 size={15} className="animate-spin" />}
                  <span>{editingType ? "Salvar Alterações" : "Cadastrar Tipo"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
