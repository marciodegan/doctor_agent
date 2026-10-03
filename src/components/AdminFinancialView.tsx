import React, { useState, useEffect, useRef } from "react";
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  FileText, 
  Upload, 
  Plus, 
  Check, 
  X, 
  ArrowLeft, 
  Loader2, 
  AlertTriangle, 
  Calendar, 
  Shield, 
  Filter, 
  CheckCircle2, 
  FolderPlus,
  RefreshCw
} from "lucide-react";
import { useGroup } from "../contexts/GroupContext";
import { useAuth } from "../hooks/useAuth";

interface AdminFinancialViewProps {
  onBack: () => void;
}

export function AdminFinancialView({ onBack }: AdminFinancialViewProps) {
  const { activeGroup, apiFetch, activeGroupMembers } = useGroup();
  const { user } = useAuth();

  const currentUserMembership = activeGroupMembers.find(m => m.userId === user?.uid);
  const isOwner = currentUserMembership?.role === "owner";
  const isCreator = activeGroup?.createdBy === user?.uid;
  const isAdmin = isOwner || isCreator || currentUserMembership?.role === "admin";

  const [activeTab, setActiveTab] = useState<"fluxo" | "fechamentos" | "importar" | "config">("fluxo");

  // Closings state
  const [closings, setClosings] = useState<any[]>([]);
  const [selectedClosingId, setSelectedClosingId] = useState<string>("");
  const [newClosingName, setNewClosingName] = useState("");
  const [newClosingMes, setNewClosingMes] = useState(new Date().getMonth() + 1);
  const [newClosingAno, setNewClosingAno] = useState(new Date().getFullYear());
  const [isCreatingClosing, setIsCreatingClosing] = useState(false);

  // Transactions state
  const [transactions, setTransactions] = useState<any[]>([]);
  const [transactionTypes, setTransactionTypes] = useState<any[]>([]);
  const [filterDoctor, setFilterDoctor] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterNatureza, setFilterNatureza] = useState("all");
  const [isLoadingTx, setIsLoadingTx] = useState(false);

  // Manual Transaction Modal
  const [isNewTxModalOpen, setIsNewTxModalOpen] = useState(false);
  const [manualDoctorName, setManualDoctorName] = useState("");
  const [manualType, setManualType] = useState("");
  const [manualDate, setManualDate] = useState(new Date().toISOString().split("T")[0]);
  const [manualValue, setManualValue] = useState("");
  const [manualObs, setManualObs] = useState("");
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);

  // Import PDF state
  const [selectedPdfFile, setSelectedPdfFile] = useState<File | null>(null);
  const [isImportingPdf, setIsImportingPdf] = useState(false);
  const [pdfPreviewData, setPdfPreviewData] = useState<any | null>(null);
  const [isConfirmingPdf, setIsConfirmingPdf] = useState(false);
  const [importSuccessResult, setImportSuccessResult] = useState<any | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // Load closings and types on mount
  useEffect(() => {
    if (activeGroup) {
      loadClosings();
      loadTypes();
    }
  }, [activeGroup]);

  // Load transactions when selectedClosingId changes
  useEffect(() => {
    if (activeGroup && selectedClosingId) {
      loadTransactions();
    }
  }, [activeGroup, selectedClosingId]);

  const loadClosings = async () => {
    try {
      const res = await apiFetch("/api/app/financial/closings");
      if (res.ok) {
        const data = await res.json();
        setClosings(data);
        if (data.length > 0 && !selectedClosingId) {
          // Select open or latest closing by default
          const openOne = data.find((c: any) => c.status === "ABERTO" || c.status === "EM_CONFERENCIA") || data[0];
          setSelectedClosingId(openOne.id);
        }
      }
    } catch (err) {
      console.error("Error loading closings:", err);
    }
  };

  const loadTypes = async () => {
    try {
      const res = await apiFetch("/api/app/financial/types");
      if (res.ok) {
        const data = await res.json();
        setTransactionTypes(data);
      }
    } catch (err) {
      console.error("Error loading transaction types:", err);
    }
  };

  const loadTransactions = async () => {
    if (!selectedClosingId) return;
    try {
      setIsLoadingTx(true);
      const res = await apiFetch(`/api/app/financial/transactions?fechamentoId=${selectedClosingId}`);
      if (res.ok) {
        const data = await res.json();
        setTransactions(data);
      }
    } catch (err) {
      console.error("Error loading transactions:", err);
    } finally {
      setIsLoadingTx(false);
    }
  };

  const handleCreateClosing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClosingName.trim()) return;
    try {
      setIsCreatingClosing(true);
      const res = await apiFetch("/api/app/financial/closings", {
        method: "POST",
        body: JSON.stringify({
          nome: newClosingName.trim(),
          competencia: newClosingName.trim(),
          mes: Number(newClosingMes),
          ano: Number(newClosingAno)
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao criar fechamento");
      }
      const created = await res.json();
      setNewClosingName("");
      await loadClosings();
      setSelectedClosingId(created.id);
      alert("Fechamento criado com sucesso!");
    } catch (err: any) {
      alert(err.message || "Erro ao criar fechamento");
    } finally {
      setIsCreatingClosing(false);
    }
  };

  const handleUpdateClosingStatus = async (closingId: string, status: string) => {
    if (!confirm(`Deseja alterar o status deste fechamento para ${status}?`)) return;
    try {
      const res = await apiFetch(`/api/app/financial/closings/${closingId}`, {
        method: "PUT",
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        loadClosings();
      }
    } catch (err: any) {
      alert(err.message || "Erro ao atualizar status");
    }
  };

  const handleCreateManualTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualDoctorName.trim() || !manualValue || !selectedClosingId) return;
    try {
      setIsSubmittingManual(true);
      const currentClosing = closings.find(c => c.id === selectedClosingId);
      const res = await apiFetch("/api/app/financial/transactions", {
        method: "POST",
        body: JSON.stringify({
          doctorName: manualDoctorName.trim(),
          tipoLancamentoNome: manualType || "Outros",
          dataLancamento: manualDate,
          valor: Number(manualValue),
          observacao: manualObs,
          fechamentoId: selectedClosingId,
          fechamentoNome: currentClosing?.nome || ""
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao criar lançamento");
      }
      setIsNewTxModalOpen(false);
      setManualDoctorName("");
      setManualValue("");
      setManualObs("");
      loadTransactions();
    } catch (err: any) {
      alert(err.message || "Erro ao criar lançamento");
    } finally {
      setIsSubmittingManual(false);
    }
  };

  const handlePdfSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedClosingId) {
      alert("Selecione um arquivo PDF e certifique-se de escolher um Fechamento.");
      return;
    }

    setSelectedPdfFile(file);
    setIsImportingPdf(true);
    setPdfPreviewData(null);
    setImportSuccessResult(null);

    try {
      const currentClosing = closings.find(c => c.id === selectedClosingId);
      const formData = new FormData();
      formData.append("file", file);
      formData.append("fechamentoId", selectedClosingId);
      formData.append("fechamentoNome", currentClosing?.nome || "Fechamento");

      const res = await fetch("/api/app/financial/import-pdf", {
        method: "POST",
        headers: {
          "x-group-id": activeGroup?.id || ""
        },
        body: formData
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Erro HTTP ${res.status}`);
      }

      const data = await res.json();
      setPdfPreviewData(data);
    } catch (err: any) {
      console.error("PDF import error:", err);
      alert(err.message || "Erro ao processar PDF com IA.");
    } finally {
      setIsImportingPdf(false);
    }
  };

  const handleConfirmPdfImport = async () => {
    if (!pdfPreviewData || !selectedClosingId) return;
    try {
      setIsConfirmingPdf(true);
      const currentClosing = closings.find(c => c.id === selectedClosingId);
      const res = await apiFetch("/api/app/financial/import-pdf/confirm", {
        method: "POST",
        body: JSON.stringify({
          fechamentoId: selectedClosingId,
          fechamentoNome: currentClosing?.nome || "",
          nomeArquivo: pdfPreviewData.fileName,
          transactions: pdfPreviewData.transactions
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao confirmar importação");
      }

      const result = await res.json();
      setImportSuccessResult(result);
      setPdfPreviewData(null);
      setSelectedPdfFile(null);
      loadTransactions();
    } catch (err: any) {
      alert(err.message || "Erro ao salvar lançamentos");
    } finally {
      setIsConfirmingPdf(false);
    }
  };

  // Calculations for Fluxo de Caixa dashboard
  const currentClosingObj = closings.find(c => c.id === selectedClosingId);
  const filteredTransactions = transactions.filter(t => {
    if (filterDoctor !== "all" && t.doctorName !== filterDoctor) return false;
    if (filterType !== "all" && t.tipoLancamentoNome !== filterType) return false;
    if (filterNatureza !== "all" && t.natureza !== filterNatureza) return false;
    return true;
  });

  const totalEntradas = filteredTransactions
    .filter(t => t.natureza === "CREDITO" || t.valor > 0)
    .reduce((acc, t) => acc + Math.abs(t.valor), 0);

  const totalSaidas = filteredTransactions
    .filter(t => t.natureza === "DEBITO" || t.valor < 0)
    .reduce((acc, t) => acc + Math.abs(t.valor), 0);

  const saldoTotal = totalEntradas - totalSaidas;

  const uniqueDoctors = Array.from(new Set(transactions.map(t => t.doctorName))).filter(Boolean);

  return (
    <div className="flex flex-col h-full bg-gray-50/50 p-4 sm:p-6 space-y-6 max-w-[1400px] mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-[28px] border border-gray-100 shadow-sm">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl transition-all"
            title="Voltar"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-200">
              <DollarSign size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-900 tracking-tight uppercase">Administração / Financeiro</h2>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Gestão de Fechamentos, Fluxo de Caixa e Importações</p>
            </div>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-2 bg-gray-100 p-1.5 rounded-2xl overflow-x-auto">
          <button
            onClick={() => setActiveTab("fluxo")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${activeTab === "fluxo" ? "bg-white text-blue-600 shadow-md" : "text-gray-600 hover:text-gray-900"}`}
          >
            Fluxo de Caixa
          </button>
          <button
            onClick={() => setActiveTab("fechamentos")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${activeTab === "fechamentos" ? "bg-white text-blue-600 shadow-md" : "text-gray-600 hover:text-gray-900"}`}
          >
            Fechamentos
          </button>
          <button
            onClick={() => setActiveTab("importar")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${activeTab === "importar" ? "bg-white text-blue-600 shadow-md" : "text-gray-600 hover:text-gray-900"}`}
          >
            Importar PDF
          </button>
          <button
            onClick={() => setActiveTab("config")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${activeTab === "config" ? "bg-white text-blue-600 shadow-md" : "text-gray-600 hover:text-gray-900"}`}
          >
            Tipos Financeiros
          </button>
        </div>
      </div>

      {!isAdmin && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3 text-amber-800">
          <AlertTriangle size={20} className="shrink-0" />
          <p className="text-sm font-medium">Acesso restrito: apenas administradores podem gerenciar e alterar informações financeiras da equipe.</p>
        </div>
      )}

      {/* TAB 1: FLUXO DE CAIXA */}
      {activeTab === "fluxo" && (
        <div className="space-y-6">
          {/* Controls bar */}
          <div className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200">
                <Calendar size={16} className="text-blue-600" />
                <span className="text-xs font-bold text-gray-500">Fechamento:</span>
                <select
                  value={selectedClosingId}
                  onChange={(e) => setSelectedClosingId(e.target.value)}
                  className="bg-transparent text-xs font-black text-gray-900 outline-none cursor-pointer"
                >
                  {closings.length === 0 && <option value="">Nenhum fechamento criado</option>}
                  {closings.map(c => (
                    <option key={c.id} value={c.id}>{c.nome} ({c.status})</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200">
                <span className="text-xs font-bold text-gray-500">Médico:</span>
                <select
                  value={filterDoctor}
                  onChange={(e) => setFilterDoctor(e.target.value)}
                  className="bg-transparent text-xs font-bold text-gray-900 outline-none cursor-pointer"
                >
                  <option value="all">Todos</option>
                  {uniqueDoctors.map(doc => (
                    <option key={doc} value={doc}>{doc}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200">
                <span className="text-xs font-bold text-gray-500">Tipo:</span>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="bg-transparent text-xs font-bold text-gray-900 outline-none cursor-pointer"
                >
                  <option value="all">Todos</option>
                  {transactionTypes.map(t => (
                    <option key={t.id} value={t.nome}>{t.nome}</option>
                  ))}
                </select>
              </div>
            </div>

            {isAdmin && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsNewTxModalOpen(true)}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-md transition-all"
                >
                  <Plus size={16} />
                  <span>Novo Lançamento</span>
                </button>
                <button
                  onClick={() => setActiveTab("importar")}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-md transition-all"
                >
                  <Upload size={16} />
                  <span>Importar PDF</span>
                </button>
              </div>
            )}
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-6 rounded-[24px] border border-gray-100 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest block">Entradas Totais</span>
                <span className="text-2xl font-black text-emerald-600 mt-1 block">
                  R$ {totalEntradas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
                <TrendingUp size={24} />
              </div>
            </div>

            <div className="bg-white p-6 rounded-[24px] border border-gray-100 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest block">Saídas Totais</span>
                <span className="text-2xl font-black text-red-600 mt-1 block">
                  R$ {totalSaidas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center">
                <TrendingDown size={24} />
              </div>
            </div>

            <div className="bg-white p-6 rounded-[24px] border border-gray-100 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest block">Saldo do Fechamento</span>
                <span className={`text-2xl font-black mt-1 block ${saldoTotal >= 0 ? "text-blue-600" : "text-red-600"}`}>
                  R$ {saldoTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                <DollarSign size={24} />
              </div>
            </div>
          </div>

          {/* Transactions Table */}
          <div className="bg-white rounded-[28px] border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-black text-gray-900 text-sm uppercase tracking-tight">
                Lançamentos Financeiros ({filteredTransactions.length})
              </h3>
              <button 
                onClick={loadTransactions}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-xl transition"
                title="Atualizar"
              >
                <RefreshCw size={16} />
              </button>
            </div>

            {isLoadingTx ? (
              <div className="py-16 text-center">
                <Loader2 size={32} className="animate-spin text-blue-600 mx-auto" />
                <p className="text-xs text-gray-400 mt-2">Carregando lançamentos...</p>
              </div>
            ) : filteredTransactions.length === 0 ? (
              <div className="py-16 text-center space-y-2">
                <FileText size={36} className="text-gray-300 mx-auto" />
                <p className="text-sm font-bold text-gray-600">Nenhum lançamento encontrado para este fechamento.</p>
                <p className="text-xs text-gray-400">Importe um PDF ou cadastre manualmente um lançamento.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/70 border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                      <th className="p-4">Médico / Entidade</th>
                      <th className="p-4">Data</th>
                      <th className="p-4">Lançamento</th>
                      <th className="p-4">Valor</th>
                      <th className="p-4">Natureza</th>
                      <th className="p-4">Origem</th>
                      <th className="p-4">Observação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-xs font-medium text-gray-700">
                    {filteredTransactions.map(tx => (
                      <tr key={tx.id} className="hover:bg-gray-50/50 transition">
                        <td className="p-4 font-bold text-gray-900 uppercase">{tx.doctorName}</td>
                        <td className="p-4">{tx.dataLancamento}</td>
                        <td className="p-4 font-semibold text-gray-800">{tx.tipoLancamentoNome}</td>
                        <td className={`p-4 font-black ${tx.valor >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {tx.valor >= 0 ? `+ R$ ${tx.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : `- R$ ${Math.abs(tx.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase ${tx.natureza === "CREDITO" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                            {tx.natureza}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className="px-2 py-1 bg-gray-100 rounded-md text-[10px] font-bold text-gray-600 uppercase">
                            {tx.origem || "MANUAL"}
                          </span>
                        </td>
                        <td className="p-4 text-gray-500 max-w-xs truncate">{tx.observacao || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: FECHAMENTOS */}
      {activeTab === "fechamentos" && (
        <div className="space-y-6 max-w-4xl mx-auto w-full">
          {isAdmin && (
            <div className="bg-white p-6 rounded-[28px] border border-gray-100 shadow-sm space-y-4">
              <h3 className="font-black text-gray-900 text-sm uppercase tracking-tight flex items-center gap-2">
                <FolderPlus size={18} className="text-blue-600" />
                <span>Criar Novo Fechamento</span>
              </h3>
              <form onSubmit={handleCreateClosing} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <input
                  type="text"
                  placeholder="Nome (ex: SETEMBRO-26)"
                  value={newClosingName}
                  onChange={(e) => setNewClosingName(e.target.value)}
                  className="bg-gray-50 border border-gray-200 px-4 py-3 rounded-2xl text-xs font-bold focus:ring-2 focus:ring-blue-100 outline-none"
                  required
                />
                <select
                  value={newClosingMes}
                  onChange={(e) => setNewClosingMes(Number(e.target.value))}
                  className="bg-gray-50 border border-gray-200 px-4 py-3 rounded-2xl text-xs font-bold focus:ring-2 focus:ring-blue-100 outline-none"
                >
                  {["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"].map((m, idx) => (
                    <option key={idx + 1} value={idx + 1}>{m}</option>
                  ))}
                </select>
                <input
                  type="number"
                  placeholder="Ano"
                  value={newClosingAno}
                  onChange={(e) => setNewClosingAno(Number(e.target.value))}
                  className="bg-gray-50 border border-gray-200 px-4 py-3 rounded-2xl text-xs font-bold focus:ring-2 focus:ring-blue-100 outline-none"
                  required
                />
                <button
                  type="submit"
                  disabled={isCreatingClosing}
                  className="bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider py-3 shadow-md transition flex items-center justify-center gap-2"
                >
                  {isCreatingClosing ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  <span>Criar Fechamento</span>
                </button>
              </form>
            </div>
          )}

          <div className="bg-white rounded-[28px] border border-gray-100 shadow-sm p-6 space-y-4">
            <h3 className="font-black text-gray-900 text-sm uppercase tracking-tight">Fechamentos Registrados</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {closings.map(c => (
                <div key={c.id} className="bg-gray-50/80 border border-gray-100 p-5 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-sm text-gray-900 uppercase">{c.nome}</span>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      c.status === "ABERTO" ? "bg-emerald-100 text-emerald-700" :
                      c.status === "EM_CONFERENCIA" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                    }`}>
                      {c.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 font-medium">Mês/Ano: {c.mes}/{c.ano}</p>
                  
                  {isAdmin && (
                    <div className="flex items-center gap-2 pt-2 border-t border-gray-200/50">
                      <button
                        onClick={() => handleUpdateClosingStatus(c.id, "ABERTO")}
                        className="text-[10px] font-bold bg-white border border-gray-200 px-3 py-1.5 rounded-xl hover:bg-gray-100"
                      >
                        Aberto
                      </button>
                      <button
                        onClick={() => handleUpdateClosingStatus(c.id, "EM_CONFERENCIA")}
                        className="text-[10px] font-bold bg-white border border-gray-200 px-3 py-1.5 rounded-xl hover:bg-gray-100"
                      >
                        Conferência
                      </button>
                      <button
                        onClick={() => handleUpdateClosingStatus(c.id, "FECHADO")}
                        className="text-[10px] font-bold bg-white border border-gray-200 px-3 py-1.5 rounded-xl hover:bg-gray-100 text-blue-600"
                      >
                        Fechar
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: IMPORTAR PDF */}
      {activeTab === "importar" && (
        <div className="max-w-3xl mx-auto w-full space-y-6">
          <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm space-y-6">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
              <Upload className="text-blue-600" size={24} />
              <div>
                <h3 className="font-black text-gray-900 text-base uppercase tracking-tight">Importação de Ocorrências Financeiras (PDF)</h3>
                <p className="text-xs text-gray-500">O sistema lê automaticamente o PDF, agrupa por médico e calcula os lançamentos</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">1. Selecione o Fechamento de Destino:</label>
                <select
                  value={selectedClosingId}
                  onChange={(e) => setSelectedClosingId(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 px-4 py-3 rounded-2xl text-xs font-bold text-gray-900 outline-none"
                >
                  {closings.map(c => (
                    <option key={c.id} value={c.id}>{c.nome} ({c.status})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">2. Selecione o arquivo PDF:</label>
                <div
                  onClick={() => pdfInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-200 hover:border-blue-500 bg-gray-50/50 rounded-[28px] p-8 text-center cursor-pointer transition flex flex-col items-center justify-center gap-3"
                >
                  <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center">
                    {isImportingPdf ? <Loader2 size={28} className="animate-spin" /> : <FileText size={28} />}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">
                      {selectedPdfFile ? selectedPdfFile.name : "Clique para selecionar o PDF financeiro"}
                    </h4>
                    <p className="text-xs text-gray-400 mt-0.5">Ex: pagina_19_10886_prod.PDF</p>
                  </div>
                  <input
                    ref={pdfInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={handlePdfSelected}
                    className="hidden"
                    disabled={isImportingPdf}
                  />
                </div>
              </div>
            </div>

            {/* Preview Section */}
            {pdfPreviewData && (
              <div className="space-y-6 pt-4 border-t border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-black text-gray-900 text-sm uppercase">Pré-visualização da Importação</h4>
                    <p className="text-xs text-gray-500">
                      Novos: <span className="font-bold text-emerald-600">{pdfPreviewData.newCount}</span> | 
                      Já Existentes (Idempotência): <span className="font-bold text-amber-600">{pdfPreviewData.existingCount}</span>
                    </p>
                  </div>
                </div>

                <div className="max-h-96 overflow-y-auto border border-gray-100 rounded-2xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50 sticky top-0 font-bold text-gray-500 uppercase text-[10px]">
                      <tr>
                        <th className="p-3">Médico</th>
                        <th className="p-3">Data</th>
                        <th className="p-3">Lançamento</th>
                        <th className="p-3">Valor</th>
                        <th className="p-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {pdfPreviewData.transactions.map((tx: any, idx: number) => (
                        <tr key={idx} className={tx.isDuplicate ? "bg-amber-50/50 opacity-60" : ""}>
                          <td className="p-3 font-bold uppercase">{tx.doctorName}</td>
                          <td className="p-3">{tx.dataLancamento}</td>
                          <td className="p-3">{tx.tipoLancamentoNome}</td>
                          <td className={`p-3 font-bold ${tx.valor >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            R$ {tx.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-3">
                            {tx.isDuplicate ? (
                              <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">Existente</span>
                            ) : (
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">Novo</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button
                  onClick={handleConfirmPdfImport}
                  disabled={isConfirmingPdf}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-200 transition flex items-center justify-center gap-2"
                >
                  {isConfirmingPdf ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={18} />}
                  <span>Confirmar e Salvar no Fluxo de Caixa</span>
                </button>
              </div>
            )}

            {importSuccessResult && (
              <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-2xl text-center space-y-3">
                <CheckCircle2 size={36} className="text-emerald-600 mx-auto" />
                <h4 className="font-black text-emerald-900 text-base">Importação Realizada com Sucesso!</h4>
                <p className="text-xs text-emerald-700">
                  {importSuccessResult.savedNew} novos lançamentos salvos. ({importSuccessResult.skippedExisting} duplicados ignorados).
                </p>
                <button
                  onClick={() => setActiveTab("fluxo")}
                  className="px-6 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider"
                >
                  Ver no Fluxo de Caixa
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: CONFIGURAÇÕES / TIPOS */}
      {activeTab === "config" && (
        <div className="max-w-3xl mx-auto w-full space-y-6">
          <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm space-y-6">
            <h3 className="font-black text-gray-900 text-base uppercase tracking-tight">Tipos de Lançamento Financeiro</h3>
            <p className="text-xs text-gray-500">Estes tipos são utilizados para categorizar os lançamentos no sistema e relatórios.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {transactionTypes.map(t => (
                <div key={t.id} className="bg-gray-50 border border-gray-100 p-4 rounded-2xl flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-800 uppercase">{t.nome}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${t.naturezaPadrao === "CREDITO" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                    {t.naturezaPadrao}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Manual Transaction Modal */}
      {isNewTxModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[32px] shadow-2xl p-8 max-w-md w-full space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-gray-900 text-lg uppercase">Novo Lançamento Manual</h3>
              <button onClick={() => setIsNewTxModalOpen(false)} className="p-2 text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateManualTx} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Médico / Entidade:</label>
                <input
                  type="text"
                  placeholder="Nome do médico"
                  value={manualDoctorName}
                  onChange={(e) => setManualDoctorName(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 px-4 py-3 rounded-2xl text-xs font-bold outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Tipo de Lançamento:</label>
                <select
                  value={manualType}
                  onChange={(e) => setManualType(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 px-4 py-3 rounded-2xl text-xs font-bold outline-none cursor-pointer"
                >
                  <option value="">Selecione o tipo</option>
                  {transactionTypes.map(t => (
                    <option key={t.id} value={t.nome}>{t.nome}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Data:</label>
                  <input
                    type="date"
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 px-4 py-3 rounded-2xl text-xs font-bold outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Valor (R$):</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="-7500.00 ou 1500.00"
                    value={manualValue}
                    onChange={(e) => setManualValue(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 px-4 py-3 rounded-2xl text-xs font-bold outline-none"
                    required
                  />
                  <span className="text-[10px] text-gray-400 mt-0.5 block">Negativo para débito, positivo para crédito</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Observação:</label>
                <input
                  type="text"
                  placeholder="Observações (opcional)"
                  value={manualObs}
                  onChange={(e) => setManualObs(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 px-4 py-3 rounded-2xl text-xs font-bold outline-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewTxModalOpen(false)}
                  className="flex-1 py-3 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-2xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingManual}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-blue-200 transition flex items-center justify-center gap-2"
                >
                  {isSubmittingManual ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  <span>Salvar</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
