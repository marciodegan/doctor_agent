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
  RefreshCw,
  Search,
  Copy,
  Trash2,
  Edit3,
  MoreVertical,
  LayoutDashboard,
  Layers,
  Settings as SettingsIcon
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

  const [activeTab, setActiveTab] = useState<"dashboard" | "fluxo" | "fechamentos" | "importar" | "config">("fluxo");

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
  
  // Filters state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDoctor, setFilterDoctor] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterNatureza, setFilterNatureza] = useState("all");
  const [filterOrigem, setFilterOrigem] = useState("all");
  const [isLoadingTx, setIsLoadingTx] = useState(false);

  // Manual Transaction Modal / Panel state
  const [isNewTxModalOpen, setIsNewTxModalOpen] = useState(false);
  const [manualDoctorName, setManualDoctorName] = useState("");
  const [manualType, setManualType] = useState("");
  const [manualDate, setManualDate] = useState(new Date().toISOString().split("T")[0]);
  const [manualValue, setManualValue] = useState("");
  const [manualNatureza, setManualNatureza] = useState("CREDITO");
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
        if (data.length === 0) {
          const createRes = await apiFetch("/api/app/financial/closings", {
            method: "POST",
            body: JSON.stringify({
              nome: "SETEMBRO-26",
              competencia: "SETEMBRO-26",
              mes: 9,
              ano: 2026
            })
          });
          if (createRes.ok) {
            const created = await createRes.json();
            setClosings([created]);
            setSelectedClosingId(created.id);
            return;
          }
        }
        setClosings(data);
        if (data.length > 0 && !selectedClosingId) {
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

  const executeSaveManualTx = async () => {
    if (!manualDoctorName.trim() || !manualValue || !selectedClosingId) return false;
    const currentClosing = closings.find(c => c.id === selectedClosingId);
    const numericVal = Number(manualValue);
    const finalVal = manualNatureza === "DEBITO" && numericVal > 0 ? -numericVal : numericVal;

    const res = await apiFetch("/api/app/financial/transactions", {
      method: "POST",
      body: JSON.stringify({
        doctorName: manualDoctorName.trim(),
        tipoLancamentoNome: manualType || "Outros",
        dataLancamento: manualDate,
        valor: finalVal,
        natureza: manualNatureza,
        observacao: manualObs,
        fechamentoId: selectedClosingId,
        fechamentoNome: currentClosing?.nome || "",
        origem: "MANUAL"
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Erro ao criar lançamento");
    }
    return true;
  };

  const handleCreateManualTx = async (e: React.FormEvent, keepOpen = false) => {
    e.preventDefault();
    try {
      setIsSubmittingManual(true);
      await executeSaveManualTx();
      if (!keepOpen) {
        setIsNewTxModalOpen(false);
        setManualDoctorName("");
        setManualValue("");
        setManualObs("");
      } else {
        // Keep doctor, closing and date, clear value and observation for rapid entry
        setManualValue("");
        setManualObs("");
      }
      loadTransactions();
    } catch (err: any) {
      alert(err.message || "Erro ao criar lançamento");
    } finally {
      setIsSubmittingManual(false);
    }
  };

  const handleDeleteTx = async (txId: string) => {
    if (!confirm("Deseja realmente excluir este lançamento?")) return;
    try {
      const res = await apiFetch(`/api/app/financial/transactions/${txId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        loadTransactions();
      } else {
        alert("Erro ao excluir lançamento");
      }
    } catch (err: any) {
      alert(err.message || "Erro ao excluir lançamento");
    }
  };

  const handleDuplicateTx = async (tx: any) => {
    try {
      const currentClosing = closings.find(c => c.id === selectedClosingId);
      const res = await apiFetch("/api/app/financial/transactions", {
        method: "POST",
        body: JSON.stringify({
          doctorName: tx.doctorName,
          tipoLancamentoNome: tx.tipoLancamentoNome,
          dataLancamento: tx.dataLancamento,
          valor: tx.valor,
          natureza: tx.natureza,
          observacao: `[Cópia] ${tx.observacao || ""}`,
          fechamentoId: selectedClosingId,
          fechamentoNome: currentClosing?.nome || "",
          origem: "MANUAL"
        })
      });
      if (res.ok) {
        loadTransactions();
      }
    } catch (err: any) {
      alert("Erro ao duplicar lançamento");
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
          transactions: pdfPreviewData.transactions || []
        })
      });

      if (!res.ok) {
        throw new Error("Erro ao confirmar importação.");
      }

      const result = await res.json();
      setImportSuccessResult(result);
      setPdfPreviewData(null);
      setSelectedPdfFile(null);
      loadTransactions();
    } catch (err: any) {
      alert(err.message || "Erro ao confirmar importação");
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
    if (filterOrigem !== "all" && (t.origem || "MANUAL") !== filterOrigem) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchDoc = (t.doctorName || "").toLowerCase().includes(q);
      const matchType = (t.tipoLancamentoNome || "").toLowerCase().includes(q);
      const matchObs = (t.observacao || "").toLowerCase().includes(q);
      if (!matchDoc && !matchType && !matchObs) return false;
    }
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
  const uniqueOrigins = Array.from(new Set(transactions.map(t => t.origem || "MANUAL"))).filter(Boolean);

  const clearFilters = () => {
    setFilterDoctor("all");
    setFilterType("all");
    setFilterNatureza("all");
    setFilterOrigem("all");
    setSearchQuery("");
  };

  return (
    <div className="flex flex-col min-h-full bg-gray-50/60 p-4 sm:p-8 space-y-8 max-w-[1600px] mx-auto w-full">
      {/* FULLSCREEN HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white p-6 sm:p-8 rounded-[32px] border border-gray-100 shadow-sm">
        <div className="flex items-center gap-5">
          <button 
            onClick={onBack}
            className="p-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl transition-all"
            title="Voltar ao Workspace"
          >
            <ArrowLeft size={22} />
          </button>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-xl shadow-blue-200">
              <DollarSign size={28} />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-black text-gray-900 tracking-tight uppercase">Administração / Financeiro</h1>
                <span className="px-3 py-1 bg-blue-50 text-blue-700 text-xs font-black uppercase tracking-wider rounded-full">
                  Fullscreen
                </span>
              </div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-0.5">Gestão de Fechamentos, Fluxo de Caixa e Importações Inteligentes</p>
            </div>
          </div>
        </div>

        {/* Closing Selector Top Bar */}
        <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-2xl border border-gray-200/60">
          <Calendar size={18} className="text-blue-600 shrink-0 ml-1" />
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Fechamento Atual</span>
            <select
              value={selectedClosingId}
              onChange={(e) => setSelectedClosingId(e.target.value)}
              className="bg-transparent text-xs font-black text-gray-900 outline-none cursor-pointer"
            >
              {closings.length === 0 && <option value="">Nenhum fechamento cadastrado</option>}
              {closings.map(c => (
                <option key={c.id} value={c.id}>{c.nome} ({c.status})</option>
              ))}
            </select>
          </div>
          {currentClosingObj && (
            <span className={`ml-2 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
              currentClosingObj.status === "ABERTO" ? "bg-emerald-100 text-emerald-700" :
              currentClosingObj.status === "EM_CONFERENCIA" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
            }`}>
              ● {currentClosingObj.status}
            </span>
          )}
        </div>
      </div>

      {/* NAVIGATION TABS */}
      <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        <button
          onClick={() => setActiveTab("dashboard")}
          className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${activeTab === "dashboard" ? "bg-blue-600 text-white shadow-lg shadow-blue-200" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}
        >
          <LayoutDashboard size={16} />
          <span>Dashboard</span>
        </button>
        <button
          onClick={() => setActiveTab("fluxo")}
          className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${activeTab === "fluxo" ? "bg-blue-600 text-white shadow-lg shadow-blue-200" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}
        >
          <DollarSign size={16} />
          <span>Fluxo de Caixa</span>
        </button>
        <button
          onClick={() => setActiveTab("fechamentos")}
          className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${activeTab === "fechamentos" ? "bg-blue-600 text-white shadow-lg shadow-blue-200" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}
        >
          <Layers size={16} />
          <span>Fechamentos</span>
        </button>
        <button
          onClick={() => setActiveTab("importar")}
          className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${activeTab === "importar" ? "bg-blue-600 text-white shadow-lg shadow-blue-200" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}
        >
          <Upload size={16} />
          <span>Importar PDF</span>
        </button>
        <button
          onClick={() => setActiveTab("config")}
          className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${activeTab === "config" ? "bg-blue-600 text-white shadow-lg shadow-blue-200" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}
        >
          <SettingsIcon size={16} />
          <span>Tipos Financeiros</span>
        </button>
      </div>

      {!isAdmin && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3 text-amber-800">
          <AlertTriangle size={20} className="shrink-0" />
          <p className="text-sm font-medium">Acesso restrito: apenas administradores podem gerenciar e alterar informações financeiras da equipe.</p>
        </div>
      )}

      {/* ========================================== */}
      {/* TAB 1: DASHBOARD EXECUTIVO */}
      {/* ========================================== */}
      {activeTab === "dashboard" && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-[28px] border border-gray-100 shadow-sm space-y-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Saldo do Fechamento</span>
              <h3 className={`text-3xl font-black ${saldoTotal >= 0 ? "text-blue-600" : "text-red-600"}`}>
                R$ {saldoTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </h3>
              <p className="text-xs text-gray-500 font-medium">Referente a {currentClosingObj?.nome || "Atual"}</p>
            </div>
            <div className="bg-white p-6 rounded-[28px] border border-gray-100 shadow-sm space-y-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Entradas Totais</span>
              <h3 className="text-3xl font-black text-emerald-600">
                R$ {totalEntradas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </h3>
              <p className="text-xs text-gray-500 font-medium">Créditos recebidos</p>
            </div>
            <div className="bg-white p-6 rounded-[28px] border border-gray-100 shadow-sm space-y-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Saídas Totais</span>
              <h3 className="text-3xl font-black text-red-600">
                R$ {totalSaidas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </h3>
              <p className="text-xs text-gray-500 font-medium">Débitos e repasses</p>
            </div>
            <div className="bg-white p-6 rounded-[28px] border border-gray-100 shadow-sm space-y-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Lançamentos</span>
              <h3 className="text-3xl font-black text-gray-900">{filteredTransactions.length}</h3>
              <p className="text-xs text-gray-500 font-medium">Registros processados</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm space-y-6">
              <h3 className="font-black text-gray-900 text-base uppercase tracking-tight">Resumo por Médico</h3>
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {uniqueDoctors.map(doc => {
                  const docTx = transactions.filter(t => t.doctorName === doc);
                  const docSum = docTx.reduce((acc, t) => acc + t.valor, 0);
                  return (
                    <div key={doc} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
                      <div>
                        <h4 className="font-black text-xs uppercase text-gray-900">{doc}</h4>
                        <p className="text-[10px] text-gray-500 font-bold">{docTx.length} lançamentos</p>
                      </div>
                      <span className={`font-black text-xs ${docSum >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        R$ {docSum.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm space-y-6">
              <h3 className="font-black text-gray-900 text-base uppercase tracking-tight">Evolução dos Fechamentos</h3>
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {closings.map(c => (
                  <div 
                    key={c.id} 
                    onClick={() => { setSelectedClosingId(c.id); setActiveTab("fluxo"); }}
                    className="flex items-center justify-between p-4 bg-gray-50 hover:bg-blue-50/50 rounded-2xl border border-gray-100 cursor-pointer transition"
                  >
                    <div>
                      <h4 className="font-black text-xs uppercase text-gray-900">{c.nome}</h4>
                      <p className="text-[10px] text-gray-500 font-bold">Mês/Ano: {c.mes}/{c.ano}</p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      c.status === "ABERTO" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
                    }`}>
                      {c.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* TAB 2: FLUXO DE CAIXA (TELA PRINCIPAL) */}
      {/* ========================================== */}
      {activeTab === "fluxo" && (
        <div className="space-y-6">
          {/* Controls bar & Actions */}
          <div className="bg-white p-6 rounded-[28px] border border-gray-100 shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto flex-1">
              {/* Global Search */}
              <div className="relative flex-1 min-w-[260px]">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar médico, lançamento, observação..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 pl-11 pr-4 py-3 rounded-2xl text-xs font-bold text-gray-900 outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {/* Filter: Doctor */}
              <select
                value={filterDoctor}
                onChange={(e) => setFilterDoctor(e.target.value)}
                className="bg-gray-50 border border-gray-200 px-4 py-3 rounded-2xl text-xs font-bold text-gray-900 outline-none cursor-pointer"
              >
                <option value="all">Todos os Médicos</option>
                {uniqueDoctors.map(doc => (
                  <option key={doc} value={doc}>{doc}</option>
                ))}
              </select>

              {/* Filter: Type */}
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="bg-gray-50 border border-gray-200 px-4 py-3 rounded-2xl text-xs font-bold text-gray-900 outline-none cursor-pointer"
              >
                <option value="all">Todos os Lançamentos</option>
                {transactionTypes.map(t => (
                  <option key={t.id} value={t.nome}>{t.nome}</option>
                ))}
              </select>

              {/* Filter: Natureza */}
              <select
                value={filterNatureza}
                onChange={(e) => setFilterNatureza(e.target.value)}
                className="bg-gray-50 border border-gray-200 px-4 py-3 rounded-2xl text-xs font-bold text-gray-900 outline-none cursor-pointer"
              >
                <option value="all">Todas as Naturezas</option>
                <option value="CREDITO">Crédito</option>
                <option value="DEBITO">Débito</option>
              </select>

              {(filterDoctor !== "all" || filterType !== "all" || filterNatureza !== "all" || searchQuery !== "") && (
                <button
                  onClick={clearFilters}
                  className="text-xs font-bold text-blue-600 hover:underline px-2"
                >
                  Limpar filtros
                </button>
              )}
            </div>

            {isAdmin && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsNewTxModalOpen(true)}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-blue-200 transition-all"
                >
                  <Plus size={16} />
                  <span>Novo Lançamento</span>
                </button>
                <button
                  onClick={() => setActiveTab("importar")}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-200 transition-all"
                >
                  <Upload size={16} />
                  <span>Importar PDF</span>
                </button>
              </div>
            )}
          </div>

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-[28px] border border-gray-100 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest block">Entradas</span>
                <span className="text-2xl font-black text-emerald-600 mt-1 block">
                  R$ {totalEntradas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
                <TrendingUp size={24} />
              </div>
            </div>

            <div className="bg-white p-6 rounded-[28px] border border-gray-100 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest block">Saídas</span>
                <span className="text-2xl font-black text-red-600 mt-1 block">
                  -R$ {totalSaidas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center">
                <TrendingDown size={24} />
              </div>
            </div>

            <div className="bg-white p-6 rounded-[28px] border border-gray-100 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest block">Saldo Líquido</span>
                <span className={`text-2xl font-black mt-1 block ${saldoTotal >= 0 ? "text-blue-600" : "text-red-600"}`}>
                  R$ {saldoTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                <DollarSign size={24} />
              </div>
            </div>

            <div className="bg-white p-6 rounded-[28px] border border-gray-100 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest block">Lançamentos</span>
                <span className="text-2xl font-black text-gray-900 mt-1 block">
                  {filteredTransactions.length} <span className="text-xs text-gray-400 font-normal">reg.</span>
                </span>
              </div>
              <div className="w-12 h-12 bg-gray-50 text-gray-600 rounded-2xl flex items-center justify-center">
                <FileText size={24} />
              </div>
            </div>
          </div>

          {/* Transactions Table & Mobile Cards */}
          <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-black text-gray-900 text-sm uppercase tracking-tight">
                  Fluxo de Caixa Detalhado ({filteredTransactions.length})
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">Fechamento: <span className="font-bold text-gray-700 uppercase">{currentClosingObj?.nome || "N/A"}</span></p>
              </div>
              <button 
                onClick={loadTransactions}
                className="p-2.5 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-2xl transition"
                title="Atualizar dados"
              >
                <RefreshCw size={16} />
              </button>
            </div>

            {isLoadingTx ? (
              <div className="py-20 text-center">
                <Loader2 size={36} className="animate-spin text-blue-600 mx-auto" />
                <p className="text-xs text-gray-400 mt-3 font-bold uppercase tracking-wider">Carregando lançamentos...</p>
              </div>
            ) : filteredTransactions.length === 0 ? (
              <div className="py-20 text-center space-y-3">
                <FileText size={42} className="text-gray-300 mx-auto" />
                <p className="text-sm font-bold text-gray-700">Nenhum lançamento encontrado com os filtros atuais.</p>
                <p className="text-xs text-gray-400">Tente limpar os filtros ou importar um novo PDF.</p>
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="overflow-x-auto hidden md:block">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50/80 border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                        <th className="p-4">Data</th>
                        <th className="p-4">Médico</th>
                        <th className="p-4">Lançamento</th>
                        <th className="p-4">Valor</th>
                        <th className="p-4">Natureza</th>
                        <th className="p-4">Origem</th>
                        <th className="p-4">Observação</th>
                        <th className="p-4 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-xs font-medium text-gray-700">
                      {filteredTransactions.map(tx => (
                        <tr key={tx.id} className="hover:bg-gray-50/60 transition group">
                          <td className="p-4 font-bold text-gray-600">{tx.dataLancamento}</td>
                          <td className="p-4 font-black text-gray-900 uppercase">{tx.doctorName}</td>
                          <td className="p-4 font-semibold text-gray-800">{tx.tipoLancamentoNome}</td>
                          <td className={`p-4 font-black text-sm ${tx.valor >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {tx.valor >= 0 ? `+ R$ ${tx.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : `- R$ ${Math.abs(tx.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
                          </td>
                          <td className="p-4">
                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${tx.natureza === "CREDITO" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                              {tx.natureza}
                            </span>
                          </td>
                          <td className="p-4">
                            <span className="px-2.5 py-1 bg-gray-100 rounded-lg text-[10px] font-bold text-gray-600 uppercase">
                              {tx.origem || "MANUAL"}
                            </span>
                          </td>
                          <td className="p-4 text-gray-500 max-w-xs truncate">{tx.observacao || "-"}</td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-1.5 opacity-80 group-hover:opacity-150 transition">
                              <button
                                onClick={() => handleDuplicateTx(tx)}
                                className="p-2 bg-gray-100 hover:bg-blue-100 hover:text-blue-600 text-gray-600 rounded-xl transition"
                                title="Duplicar"
                              >
                                <Copy size={14} />
                              </button>
                              {isAdmin && (
                                <button
                                  onClick={() => handleDeleteTx(tx.id)}
                                  className="p-2 bg-gray-100 hover:bg-red-100 hover:text-red-600 text-gray-600 rounded-xl transition"
                                  title="Excluir"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="grid grid-cols-1 gap-4 p-4 md:hidden">
                  {filteredTransactions.map(tx => (
                    <div key={tx.id} className="bg-gray-50 border border-gray-100 p-5 rounded-2xl space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="font-black text-sm text-gray-900 uppercase block">{tx.doctorName}</span>
                          <span className="text-xs font-semibold text-gray-600">{tx.tipoLancamentoNome}</span>
                        </div>
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase ${tx.natureza === "CREDITO" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                          {tx.natureza}
                        </span>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-gray-200/60 text-xs">
                        <span className="text-gray-500 font-medium">{tx.dataLancamento} • {tx.origem || "MANUAL"}</span>
                        <span className={`font-black text-base ${tx.valor >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {tx.valor >= 0 ? `+ R$ ${tx.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : `- R$ ${Math.abs(tx.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
                        </span>
                      </div>
                      {tx.observacao && <p className="text-xs text-gray-500 italic">Obs: {tx.observacao}</p>}
                      <div className="flex items-center gap-2 pt-2">
                        <button
                          onClick={() => handleDuplicateTx(tx)}
                          className="flex-1 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700"
                        >
                          Duplicar
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => handleDeleteTx(tx.id)}
                            className="py-2 px-4 bg-red-50 text-red-600 rounded-xl text-xs font-bold"
                          >
                            Excluir
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* TAB 3: FECHAMENTOS */}
      {/* ========================================== */}
      {activeTab === "fechamentos" && (
        <div className="space-y-8 max-w-4xl mx-auto w-full">
          {isAdmin && (
            <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm space-y-6">
              <h3 className="font-black text-gray-900 text-base uppercase tracking-tight flex items-center gap-3">
                <FolderPlus size={20} className="text-blue-600" />
                <span>Criar Novo Fechamento</span>
              </h3>
              <form onSubmit={handleCreateClosing} className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <input
                  type="text"
                  placeholder="Nome (ex: OUTUBRO-26)"
                  value={newClosingName}
                  onChange={(e) => setNewClosingName(e.target.value)}
                  className="bg-gray-50 border border-gray-200 px-4 py-3.5 rounded-2xl text-xs font-bold focus:ring-2 focus:ring-blue-100 outline-none"
                  required
                />
                <select
                  value={newClosingMes}
                  onChange={(e) => setNewClosingMes(Number(e.target.value))}
                  className="bg-gray-50 border border-gray-200 px-4 py-3.5 rounded-2xl text-xs font-bold focus:ring-2 focus:ring-blue-100 outline-none"
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
                  className="bg-gray-50 border border-gray-200 px-4 py-3.5 rounded-2xl text-xs font-bold focus:ring-2 focus:ring-blue-100 outline-none"
                  required
                />
                <button
                  type="submit"
                  disabled={isCreatingClosing}
                  className="bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider py-3.5 shadow-lg shadow-blue-200 transition flex items-center justify-center gap-2"
                >
                  {isCreatingClosing ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  <span>Criar</span>
                </button>
              </form>
            </div>
          )}

          <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm p-8 space-y-6">
            <h3 className="font-black text-gray-900 text-base uppercase tracking-tight">Fechamentos Registrados</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {closings.map(c => (
                <div key={c.id} className="bg-gray-50 border border-gray-100 p-6 rounded-3xl space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-base text-gray-900 uppercase">{c.nome}</span>
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      c.status === "ABERTO" ? "bg-emerald-100 text-emerald-700" :
                      c.status === "EM_CONFERENCIA" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                    }`}>
                      {c.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 font-bold">Mês/Ano Referência: {c.mes}/{c.ano}</p>
                  
                  {isAdmin && (
                    <div className="flex items-center gap-2 pt-3 border-t border-gray-200/60">
                      <button
                        onClick={() => handleUpdateClosingStatus(c.id, "ABERTO")}
                        className="flex-1 text-[11px] font-bold bg-white border border-gray-200 py-2 rounded-xl hover:bg-gray-100"
                      >
                        Aberto
                      </button>
                      <button
                        onClick={() => handleUpdateClosingStatus(c.id, "EM_CONFERENCIA")}
                        className="flex-1 text-[11px] font-bold bg-white border border-gray-200 py-2 rounded-xl hover:bg-gray-100"
                      >
                        Conferência
                      </button>
                      <button
                        onClick={() => handleUpdateClosingStatus(c.id, "FECHADO")}
                        className="flex-1 text-[11px] font-bold bg-blue-50 border border-blue-200 text-blue-700 py-2 rounded-xl hover:bg-blue-100"
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

      {/* ========================================== */}
      {/* TAB 4: IMPORTAR PDF */}
      {/* ========================================== */}
      {activeTab === "importar" && (
        <div className="max-w-4xl mx-auto w-full space-y-6">
          <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm space-y-6">
            <div className="flex items-center gap-4 border-b border-gray-100 pb-5">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                <Upload size={24} />
              </div>
              <div>
                <h3 className="font-black text-gray-900 text-lg uppercase tracking-tight">Importação Inteligente de PDF</h3>
                <p className="text-xs text-gray-500 font-medium">A IA do Gemini lê automaticamente o extrato ou relatório, agrupa por médico e calcula os valores</p>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">1. Selecione o Fechamento de Destino:</label>
                <select
                  value={selectedClosingId}
                  onChange={(e) => setSelectedClosingId(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 px-4 py-3.5 rounded-2xl text-xs font-bold text-gray-900 outline-none"
                >
                  {closings.length === 0 && <option value="">Nenhum fechamento cadastrado.</option>}
                  {closings.map(c => (
                    <option key={c.id} value={c.id}>{c.nome} ({c.status})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">2. Selecione o arquivo PDF:</label>
                <div
                  onClick={() => pdfInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-200 hover:border-blue-500 bg-gray-50/50 rounded-[32px] p-10 text-center cursor-pointer transition flex flex-col items-center justify-center gap-4"
                >
                  <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center shadow-md">
                    {isImportingPdf ? <Loader2 size={32} className="animate-spin" /> : <FileText size={32} />}
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-gray-900 uppercase">
                      {selectedPdfFile ? selectedPdfFile.name : "Clique para selecionar o PDF financeiro"}
                    </h4>
                    <p className="text-xs text-gray-400 mt-1">Extratos, relatórios de produção ou ocorrências</p>
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
              <div className="space-y-6 pt-6 border-t border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-black text-gray-900 text-sm uppercase">Pré-visualização da Importação</h4>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Novos para importar: <span className="font-black text-emerald-600">{pdfPreviewData.newCount}</span> | 
                      Já Existentes (Idempotência): <span className="font-black text-amber-600">{pdfPreviewData.existingCount}</span>
                    </p>
                  </div>
                </div>

                <div className="max-h-[400px] overflow-y-auto border border-gray-100 rounded-2xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50 sticky top-0 font-black text-gray-500 uppercase text-[10px]">
                      <tr>
                        <th className="p-3.5">Médico</th>
                        <th className="p-3.5">Data</th>
                        <th className="p-3.5">Lançamento</th>
                        <th className="p-3.5">Valor</th>
                        <th className="p-3.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {pdfPreviewData.transactions.map((tx: any, idx: number) => (
                        <tr key={idx} className={tx.isDuplicate ? "bg-amber-50/50 opacity-60" : ""}>
                          <td className="p-3.5 font-black uppercase">{tx.doctorName}</td>
                          <td className="p-3.5">{tx.dataLancamento}</td>
                          <td className="p-3.5">{tx.tipoLancamentoNome}</td>
                          <td className={`p-3.5 font-bold ${tx.valor >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            R$ {tx.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-3.5">
                            {tx.isDuplicate ? (
                              <span className="text-[10px] font-black text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full uppercase">Existente</span>
                            ) : (
                              <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full uppercase">Novo</span>
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
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-200 transition flex items-center justify-center gap-2"
                >
                  {isConfirmingPdf ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={18} />}
                  <span>Confirmar e Salvar no Fluxo de Caixa</span>
                </button>
              </div>
            )}

            {importSuccessResult && (
              <div className="p-8 bg-emerald-50 border border-emerald-200 rounded-3xl text-center space-y-4">
                <CheckCircle2 size={42} className="text-emerald-600 mx-auto" />
                <h4 className="font-black text-emerald-900 text-lg uppercase">Importação Realizada com Sucesso!</h4>
                <p className="text-xs text-emerald-700 font-medium">
                  {importSuccessResult.savedNew} novos lançamentos salvos com sucesso ({importSuccessResult.skippedExisting} duplicados ignorados).
                </p>
                <button
                  onClick={() => setActiveTab("fluxo")}
                  className="px-8 py-3 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-md hover:bg-emerald-700 transition"
                >
                  Ver no Fluxo de Caixa
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* TAB 5: CONFIGURAÇÕES / TIPOS */}
      {/* ========================================== */}
      {activeTab === "config" && (
        <div className="max-w-4xl mx-auto w-full space-y-6">
          <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm space-y-6">
            <h3 className="font-black text-gray-900 text-base uppercase tracking-tight">Tipos de Lançamento Financeiro</h3>
            <p className="text-xs text-gray-500 font-medium">Estes tipos são utilizados para categorizar os lançamentos no sistema e relatórios.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {transactionTypes.map(t => (
                <div key={t.id} className="bg-gray-50 border border-gray-100 p-5 rounded-2xl flex items-center justify-between">
                  <span className="text-xs font-black text-gray-800 uppercase">{t.nome}</span>
                  <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase ${t.naturezaPadrao === "CREDITO" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                    {t.naturezaPadrao}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* NOVO LANÇAMENTO (SPACIOUS DRAWER/MODAL) */}
      {/* ========================================== */}
      {isNewTxModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-[32px] shadow-2xl p-8 sm:p-10 max-w-2xl w-full space-y-6 my-8">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <h3 className="font-black text-gray-900 text-lg uppercase tracking-tight">Novo Lançamento Financeiro</h3>
                <p className="text-xs text-gray-400">Preencha os dados do lançamento para o fechamento atual</p>
              </div>
              <button onClick={() => setIsNewTxModalOpen(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl">
                <X size={22} />
              </button>
            </div>

            <form onSubmit={(e) => handleCreateManualTx(e, false)} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Médico / Entidade:</label>
                  <input
                    type="text"
                    placeholder="Nome completo do médico"
                    value={manualDoctorName}
                    onChange={(e) => setManualDoctorName(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 px-4 py-3.5 rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-100"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Tipo de Lançamento:</label>
                  <select
                    value={manualType}
                    onChange={(e) => setManualType(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 px-4 py-3.5 rounded-2xl text-xs font-bold outline-none cursor-pointer"
                  >
                    <option value="">Selecione o tipo</option>
                    {transactionTypes.map(t => (
                      <option key={t.id} value={t.nome}>{t.nome}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Data:</label>
                  <input
                    type="date"
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 px-4 py-3.5 rounded-2xl text-xs font-bold outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Natureza:</label>
                  <select
                    value={manualNatureza}
                    onChange={(e) => setManualNatureza(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 px-4 py-3.5 rounded-2xl text-xs font-bold outline-none cursor-pointer"
                  >
                    <option value="CREDITO">Crédito (+)</option>
                    <option value="DEBITO">Débito (-)</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Valor (R$):</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Ex: 7500.00"
                    value={manualValue}
                    onChange={(e) => setManualValue(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 px-4 py-3.5 rounded-2xl text-xs font-bold outline-none"
                    required
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Observação:</label>
                  <input
                    type="text"
                    placeholder="Observações ou detalhamento (opcional)"
                    value={manualObs}
                    onChange={(e) => setManualObs(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 px-4 py-3.5 rounded-2xl text-xs font-bold outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsNewTxModalOpen(false)}
                  className="px-6 py-3.5 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-2xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isSubmittingManual}
                  onClick={(e) => handleCreateManualTx(e, true)}
                  className="px-6 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-2xl font-black text-xs uppercase tracking-wider transition"
                >
                  Salvar e Novo
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingManual}
                  className="px-8 py-3.5 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-blue-200 hover:bg-blue-700 transition flex items-center justify-center gap-2"
                >
                  {isSubmittingManual ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
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
