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
  X
} from "lucide-react";

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

  // New Transaction Modal State
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newForm, setNewForm] = useState({
    doctorId: "rochele",
    doctorName: "ROCHELE LORENZI POL",
    typeName: "Integralização de Cota Parte",
    typeId: "cota_parte",
    amount: "",
    nature: "DEBIT",
    observation: "",
    date: new Date().toLocaleDateString("pt-BR")
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Doctors list
  const doctors = [
    { key: "rochele", name: "ROCHELE LORENZI POL" },
    { key: "thais", name: "THAIS ISABEL LUMIKOSKI" },
    { key: "luis", name: "LUIS BONGIOLO MATTOS" },
    { key: "kathize", name: "KATHIZE LIRA" },
    { key: "tamara", name: "TAMARA QUINTINO REGIS" },
    { key: "luan", name: "LUAN JUNIOR VIGNATTI" },
    { key: "thaynara", name: "THAYNARA MAESTRI VIGNATTI" },
    { key: "camila", name: "CAMILA RIBEIRO DUTRA" },
    { key: "maria_eduarda", name: "MARIA EDUARDA CASA SOUZA MACHADO" },
    { key: "heart_equipe", name: "HEART CIRURGIA CARDIOVASCULAR" }
  ];

  // Common expense and occurrence types
  const commonTypes = [
    "Integralização de Cota Parte",
    "Glosas - Clínica Cooperada - 11%",
    "Contribuição de Centro de Estudos",
    "Mensalidade PLAC",
    "Desconto Atendimentos Realizados - Recurso Próprio",
    "Disponibilidade Médica - UTI",
    "Sobreavisos",
    "Remuneração Bonificação Parto Normal",
    "Repasse Pagamento de Produção - HU",
    "Repasse Pagamento de Parecer Médico - HU",
    "Capitalização Cota-Parte (360)",
    "Contador Heart",
    "DARE",
    "Aluguel Sala / Consultório",
    "Celular Corporativo",
    "Consultório Itajaí",
    "CRM",
    "Instrumentador Cirúrgico",
    "Alvará Municipal",
    "Constit Heart LK / Google",
    "INSS Patronal",
    "Outra Despesa"
  ];

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
        setEditingId(null);
        fetchTransactions();
      }
    } catch (e: any) {
      alert("Erro ao salvar: " + e.message);
    }
  };

  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClosingId || !newForm.amount) return;

    try {
      setIsSubmitting(true);
      const res = await apiFetch("/api/app/financial/transactions", {
        method: "POST",
        body: JSON.stringify({
          closingId: selectedClosingId,
          doctorId: newForm.doctorId,
          doctorName: newForm.doctorName,
          scope: newForm.doctorId === "heart_equipe" ? "TEAM" : "DOCTOR",
          typeName: newForm.typeName,
          typeId: newForm.typeName.toLowerCase().replace(/[^a-z0-9]/g, "_"),
          amount: parseFloat(newForm.amount),
          nature: newForm.nature,
          observation: newForm.observation,
          date: newForm.date,
          source: "MANUAL"
        })
      });

      if (res.ok) {
        setIsNewModalOpen(false);
        setNewForm({
          doctorId: "rochele",
          doctorName: "ROCHELE LORENZI POL",
          typeName: "Integralização de Cota Parte",
          typeId: "cota_parte",
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
              <p className="text-xs text-gray-500 font-medium">Lançamentos de ocorrências por médico, despesas da equipe e conciliações</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Closing Month Selector */}
          <div className="bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2 flex items-center gap-2 text-xs">
            <Calendar size={14} className="text-emerald-600" />
            <select
              value={selectedClosingId || ""}
              onChange={e => setSelectedClosingId(e.target.value)}
              className="bg-transparent text-gray-800 font-bold outline-none cursor-pointer pr-2"
            >
              {closings.length > 0 ? (
                closings.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.monthKey}
                  </option>
                ))
              ) : (
                <option value="">SETEMBRO-26</option>
              )}
            </select>
          </div>

          <button
            onClick={() => setIsNewModalOpen(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20 active:scale-95 transition cursor-pointer"
          >
            <Plus size={16} />
            <span>Novo Lançamento</span>
          </button>
        </div>
      </div>

      {/* Metric Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-3xl bg-white border border-gray-200 shadow-xs flex flex-col justify-between space-y-1">
          <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Entradas / Créditos</span>
          <span className="text-xl font-black text-emerald-600">
            +R$ {totalEntradas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] text-gray-400 font-medium">Plantões, bonificações e repasses</span>
        </div>

        <div className="p-5 rounded-3xl bg-white border border-gray-200 shadow-xs flex flex-col justify-between space-y-1">
          <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Saídas / Débitos</span>
          <span className="text-xl font-black text-rose-600">
            -R$ {totalSaidas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] text-gray-400 font-medium">Cota parte, glosas e taxas</span>
        </div>

        <div className="p-5 rounded-3xl bg-white border border-gray-200 shadow-xs flex flex-col justify-between space-y-1">
          <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Saldo das Ocorrências</span>
          <span className={`text-xl font-black ${totalEntradas - totalSaidas >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
            R$ {(totalEntradas - totalSaidas).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] text-gray-400 font-medium">Impacto líquido nas contas</span>
        </div>

        <div className="p-5 rounded-3xl bg-white border border-gray-200 shadow-xs flex flex-col justify-between space-y-1">
          <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Total de Registros</span>
          <span className="text-xl font-black text-gray-900">{filtered.length} lançamentos</span>
          <span className="text-[10px] text-gray-400 font-medium">Conciliados neste fechamento</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por descrição, tipo de despesa ou médico..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-black uppercase text-gray-400">Médico:</span>
            <select
              value={selectedDoctorFilter}
              onChange={e => setSelectedDoctorFilter(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold outline-none cursor-pointer"
            >
              <option value="ALL">Todos os Médicos & Equipe</option>
              {doctors.map(d => (
                <option key={d.key} value={d.name}>{d.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-black uppercase text-gray-400">Natureza:</span>
            <select
              value={selectedNatureFilter}
              onChange={e => setSelectedNatureFilter(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold outline-none cursor-pointer"
            >
              <option value="ALL">Todas as Naturezas</option>
              <option value="CREDIT">Entradas (Créditos)</option>
              <option value="DEBIT">Saídas (Débitos)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-[32px] border border-gray-200/80 shadow-xl overflow-hidden">
        {loading ? (
          <div className="py-20 text-center space-y-3">
            <Loader2 size={32} className="animate-spin text-emerald-600 mx-auto" />
            <p className="text-xs text-gray-400 font-bold uppercase">Carregando Fluxo de Caixa...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <Wallet size={32} className="text-gray-300 mx-auto" />
            <p className="text-sm text-gray-500 font-bold">Nenhum lançamento financeiro encontrado.</p>
            <p className="text-xs text-gray-400">Importe arquivos na aba "Importações" ou crie um lançamento avulso.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-100 text-gray-600 font-black uppercase text-[10px] tracking-wider border-b border-gray-200">
                  <th className="p-4 pl-6">Data</th>
                  <th className="p-4">Médico / Responsável</th>
                  <th className="p-4">Tipo de Despesa / Ocorrência</th>
                  <th className="p-4 text-center">Natureza</th>
                  <th className="p-4">Descrição / Observação</th>
                  <th className="p-4">Origem</th>
                  <th className="p-4 text-right">Valor (R$)</th>
                  <th className="p-4 pr-6 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                {filtered.map(t => {
                  const isEditing = editingId === t.id;
                  const isCredit = t.nature === "CREDIT";

                  return (
                    <tr key={t.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="p-4 pl-6 text-gray-500 font-bold">{t.date || "-"}</td>
                      <td className="p-4 font-black text-gray-900">
                        {t.doctorName || "Equipe HeaRT"}
                      </td>
                      <td className="p-4">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.typeName}
                            onChange={e => setEditForm({ ...editForm, typeName: e.target.value })}
                            className="border border-gray-300 rounded px-2 py-1 text-xs w-full"
                          />
                        ) : (
                          <span className="font-bold text-gray-800">{t.typeName || t.typeId}</span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        <span className={`px-2.5 py-0.5 rounded-md text-[9px] font-black uppercase ${
                          isCredit 
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-200" 
                            : "bg-rose-100 text-rose-800 border border-rose-200"
                        }`}>
                          {isCredit ? "ENTRADA" : "SAÍDA"}
                        </span>
                      </td>
                      <td className="p-4 text-gray-600 max-w-xs truncate">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.observation}
                            onChange={e => setEditForm({ ...editForm, observation: e.target.value })}
                            className="border border-gray-300 rounded px-2 py-1 text-xs w-full"
                          />
                        ) : (
                          <span>{t.observation || "-"}</span>
                        )}
                      </td>
                      <td className="p-4">
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[9px] font-black uppercase">
                          {t.source || "PDF"}
                        </span>
                      </td>
                      <td className={`p-4 text-right font-black text-sm ${
                        isCredit ? "text-emerald-600" : "text-rose-600"
                      }`}>
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.01"
                            value={editForm.amount}
                            onChange={e => setEditForm({ ...editForm, amount: e.target.value })}
                            className="border border-gray-300 rounded px-2 py-1 text-xs w-24 text-right"
                          />
                        ) : (
                          <span>
                            {isCredit ? "+R$ " : "-R$ "}
                            {Math.abs(Number(t.amount) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        )}
                      </td>
                      <td className="p-4 pr-6 text-center">
                        {isEditing ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleSaveEdit(t.id)}
                              className="p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                            >
                              <Check size={13} />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="p-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1.5 text-gray-400">
                            <button
                              onClick={() => {
                                setEditingId(t.id);
                                setEditForm({
                                  amount: String(t.amount || ""),
                                  observation: t.observation || "",
                                  typeName: t.typeName || ""
                                });
                              }}
                              className="p-1.5 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              onClick={() => handleDelete(t.id)}
                              className="p-1.5 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            >
                              <Trash2 size={14} />
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

      {/* Modal: New Manual Transaction */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-[250] bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] p-6 lg:p-8 max-w-lg w-full shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <h3 className="font-black text-gray-900 text-base uppercase">Novo Lançamento no Fluxo de Caixa</h3>
                <p className="text-xs text-gray-500">Adicione uma ocorrência ou despesa manual</p>
              </div>
              <button 
                onClick={() => setIsNewModalOpen(false)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center text-xs"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTransaction} className="space-y-4 text-xs font-bold">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider">Médico / Responsável</label>
                <select
                  value={newForm.doctorName}
                  onChange={e => {
                    const sel = doctors.find(d => d.name === e.target.value);
                    setNewForm({
                      ...newForm,
                      doctorName: e.target.value,
                      doctorId: sel?.key || "equipe"
                    });
                  }}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none"
                >
                  {doctors.map(d => (
                    <option key={d.key} value={d.name}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider">Tipo de Despesa / Ocorrência</label>
                <select
                  value={newForm.typeName}
                  onChange={e => setNewForm({ ...newForm, typeName: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none"
                >
                  {commonTypes.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider">Natureza</label>
                  <select
                    value={newForm.nature}
                    onChange={e => setNewForm({ ...newForm, nature: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none"
                  >
                    <option value="DEBIT">Saída / Desconto (Débito)</option>
                    <option value="CREDIT">Entrada / Remuneração (Crédito)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider">Valor (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    required
                    value={newForm.amount}
                    onChange={e => setNewForm({ ...newForm, amount: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider">Observação / Justificativa</label>
                <input
                  type="text"
                  placeholder="Ex: Plantão extra, Glosa Lote 1490176, Cota Unimed..."
                  value={newForm.observation}
                  onChange={e => setNewForm({ ...newForm, observation: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="px-5 py-3 rounded-xl border border-gray-200 font-bold text-gray-600 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black uppercase shadow-lg shadow-emerald-500/20 active:scale-95 transition flex items-center gap-2"
                >
                  {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                  <span>Salvar Lançamento</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
