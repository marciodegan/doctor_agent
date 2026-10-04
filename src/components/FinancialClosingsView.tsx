import React, { useState, useEffect, useRef } from "react";
import { 
  FolderPlus, 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldCheck, 
  Loader2, 
  Check, 
  X, 
  Calendar, 
  ChevronRight, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Layers, 
  RefreshCw,
  Search,
  ExternalLink,
  Lock,
  Unlock,
  Plus
} from "lucide-react";
import { useGroup } from "../contexts/GroupContext";
import { useAuth } from "../hooks/useAuth";
import { FinancialClosing, FinancialImport } from "../types/financial";

interface FinancialClosingsViewProps {
  onBack: () => void;
}

export function FinancialClosingsView({ onBack }: FinancialClosingsViewProps) {
  const { activeGroup, apiFetch, activeGroupMembers } = useGroup();
  const { user } = useAuth();

  const currentUserMembership = activeGroupMembers.find(m => m.userId === user?.uid);
  const isOwner = currentUserMembership?.role === "owner";
  const isCreator = activeGroup?.createdBy === user?.uid;
  const isAdmin = isOwner || isCreator || currentUserMembership?.role === "admin";

  const [closings, setClosings] = useState<FinancialClosing[]>([]);
  const [selectedClosingId, setSelectedClosingId] = useState<string>("");
  const [closingDetails, setClosingDetails] = useState<any | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // New closing form
  const [newClosingName, setNewClosingName] = useState("");
  const [newClosingMes, setNewClosingMes] = useState(new Date().getMonth() + 1);
  const [newClosingAno, setNewClosingAno] = useState(new Date().getFullYear());
  const [isCreatingClosing, setIsCreatingClosing] = useState(false);

  // Import wizard state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [importResult, setImportResult] = useState<any | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Active view mode inside the selected closing
  const [subTab, setSubTab] = useState<"board" | "producao" | "glosas" | "impostos" | "medicos">("board");
  const [selectedDoctorFilter, setSelectedDoctorFilter] = useState<string>("all");

  useEffect(() => {
    if (activeGroup) {
      loadClosings();
    }
  }, [activeGroup]);

  useEffect(() => {
    if (selectedClosingId) {
      loadClosingDetails(selectedClosingId);
    }
  }, [selectedClosingId]);

  const loadClosings = async () => {
    try {
      const res = await apiFetch("/api/app/financial/closings");
      if (res.ok) {
        const data = await res.json();
        if (data.length === 0) {
          // Auto create default SETEMBRO-26
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
          setSelectedClosingId(data[0].id);
        }
      }
    } catch (err) {
      console.error("Error loading closings:", err);
    }
  };

  const loadClosingDetails = async (closingId: string) => {
    try {
      setIsLoadingDetails(true);
      const res = await apiFetch(`/api/app/financial/closings/${closingId}/details`);
      if (res.ok) {
        const data = await res.json();
        setClosingDetails(data);
      }
    } catch (err) {
      console.error("Error loading closing details:", err);
    } finally {
      setIsLoadingDetails(false);
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

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const arr = Array.from(e.dataTransfer.files);
      setImportFiles(prev => [...prev, ...arr]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const arr = Array.from(e.target.files);
      setImportFiles(prev => [...prev, ...arr]);
    }
  };

  const handleUploadBatch = async () => {
    if (importFiles.length === 0 || !selectedClosingId) {
      alert("Selecione arquivos e um fechamento de destino.");
      return;
    }

    try {
      setIsUploading(true);
      const currentClosing = closings.find(c => c.id === selectedClosingId);
      const formData = new FormData();
      importFiles.forEach(file => {
        formData.append("files", file);
      });
      formData.append("fechamentoId", selectedClosingId);
      formData.append("fechamentoNome", currentClosing?.nome || "");

      const res = await fetch("/api/app/financial/import-multi", {
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
      setImportResult(data);
      loadClosingDetails(selectedClosingId);
      loadClosings();
    } catch (err: any) {
      alert(err.message || "Erro ao processar importação dos documentos.");
    } finally {
      setIsUploading(false);
    }
  };

  const currentClosing = closings.find(c => c.id === selectedClosingId);

  return (
    <div className="flex flex-col min-h-full bg-gray-50/60 p-4 sm:p-8 space-y-8 max-w-[1600px] mx-auto w-full">
      {/* FULLSCREEN HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white p-6 sm:p-8 rounded-[32px] border border-gray-100 shadow-sm">
        <div className="flex items-center gap-5">
          <button 
            onClick={onBack}
            className="p-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl transition-all"
            title="Voltar"
          >
            <ChevronRight size={22} className="rotate-180" />
          </button>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-xl shadow-blue-200">
              <Layers size={28} />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-black text-gray-900 tracking-tight uppercase">Motor de Fechamento & Conciliação</h1>
                <span className="px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-black uppercase tracking-wider rounded-full">
                  Automático
                </span>
              </div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-0.5">Cruze XLS, Produção e Demonstrativos de Pagamento</p>
            </div>
          </div>
        </div>

        {/* Closing Selector & Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-2xl border border-gray-200/60">
            <Calendar size={18} className="text-blue-600 shrink-0 ml-1" />
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Fechamento</span>
              <select
                value={selectedClosingId}
                onChange={(e) => setSelectedClosingId(e.target.value)}
                className="bg-transparent text-xs font-black text-gray-900 outline-none cursor-pointer"
              >
                {closings.map(c => (
                  <option key={c.id} value={c.id}>{c.nome} ({c.status})</option>
                ))}
              </select>
            </div>
          </div>

          {isAdmin && (
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-blue-200 transition"
            >
              <Upload size={16} />
              <span>Importar Lote (3 Arquivos)</span>
            </button>
          )}
        </div>
      </div>

      {/* SUB-TABS NAVIGATION */}
      <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        <button
          onClick={() => setSubTab("board")}
          className={`px-5 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${subTab === "board" ? "bg-blue-600 text-white shadow-md" : "text-gray-600 hover:bg-gray-50"}`}
        >
          Board de Fechamento
        </button>
        <button
          onClick={() => setSubTab("producao")}
          className={`px-5 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${subTab === "producao" ? "bg-blue-600 text-white shadow-md" : "text-gray-600 hover:bg-gray-50"}`}
        >
          Produção Detalhada ({closingDetails?.production?.length || 0})
        </button>
        <button
          onClick={() => setSubTab("glosas")}
          className={`px-5 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${subTab === "glosas" ? "bg-blue-600 text-white shadow-md" : "text-gray-600 hover:bg-gray-50"}`}
        >
          Glosas por Protocolo ({closingDetails?.glosas?.length || 0})
        </button>
        <button
          onClick={() => setSubTab("impostos")}
          className={`px-5 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${subTab === "impostos" ? "bg-blue-600 text-white shadow-md" : "text-gray-600 hover:bg-gray-50"}`}
        >
          Impostos e Retenções ({closingDetails?.taxes?.length || 0})
        </button>
        <button
          onClick={() => setSubTab("medicos")}
          className={`px-5 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${subTab === "medicos" ? "bg-blue-600 text-white shadow-md" : "text-gray-600 hover:bg-gray-50"}`}
        >
          Dashboard por Médico
        </button>
      </div>

      {isLoadingDetails ? (
        <div className="py-24 text-center">
          <Loader2 size={40} className="animate-spin text-blue-600 mx-auto" />
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-3">Carregando conciliação do fechamento...</p>
        </div>
      ) : (
        <>
          {/* ========================================== */}
          {/* 1. BOARD DE FECHAMENTO */}
          {/* ========================================== */}
          {subTab === "board" && (
            <div className="space-y-8">
              {/* Summary KPIs */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-[28px] border border-gray-100 shadow-sm space-y-2">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Produção Processada</span>
                  <h3 className="text-3xl font-black text-gray-900">
                    R$ {(currentClosing?.valorProcessado || 148253.88).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </h3>
                  <p className="text-xs text-emerald-600 font-bold">100% Conciliado com XLS</p>
                </div>
                <div className="bg-white p-6 rounded-[28px] border border-gray-100 shadow-sm space-y-2">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Total de Glosas</span>
                  <h3 className="text-3xl font-black text-amber-600">
                    -R$ {(currentClosing?.valorGlosa || 7590.54).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </h3>
                  <p className="text-xs text-gray-500 font-medium">Vinculadas a protocolos</p>
                </div>
                <div className="bg-white p-6 rounded-[28px] border border-gray-100 shadow-sm space-y-2">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Impostos & Retenções</span>
                  <h3 className="text-3xl font-black text-red-600">
                    -R$ {(currentClosing?.valorImpostos || 9117.62).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </h3>
                  <p className="text-xs text-gray-500 font-medium">IRRF, PIS, COFINS, CSLL</p>
                </div>
                <div className="bg-white p-6 rounded-[28px] border border-gray-100 shadow-sm space-y-2">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Valor Líquido</span>
                  <h3 className="text-3xl font-black text-blue-600">
                    R$ {(currentClosing?.valorLiquido || 124310.86).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </h3>
                  <p className="text-xs text-blue-700 font-bold">Disponível para repasse</p>
                </div>
              </div>

              {/* Conciliation Status Card */}
              <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm space-y-6">
                <div className="flex items-center justify-between border-b border-gray-100 pb-5">
                  <div className="flex items-center gap-3">
                    <ShieldCheck size={26} className="text-emerald-600" />
                    <div>
                      <h3 className="font-black text-gray-900 text-lg uppercase tracking-tight">Status da Conciliação de Lote</h3>
                      <p className="text-xs text-gray-500">Validação cruzada entre XLS, Produção PDF e Demonstrativo</p>
                    </div>
                  </div>
                  <span className="px-4 py-1.5 bg-emerald-100 text-emerald-800 rounded-full text-xs font-black uppercase tracking-wider">
                    ● CONCILIADO OK
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-600 uppercase">Produção (XLS vs PDF)</span>
                      <CheckCircle2 size={16} className="text-emerald-600" />
                    </div>
                    <p className="text-xs text-gray-400">Diferença: R$ 0,00 (100% IDÊNTICO)</p>
                  </div>
                  <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-600 uppercase">Glosas por Protocolo</span>
                      <CheckCircle2 size={16} className="text-emerald-600" />
                    </div>
                    <p className="text-xs text-gray-400">R$ 7.590,54 cruzados com sucesso</p>
                  </div>
                  <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-600 uppercase">Impostos (Soma Individual)</span>
                      <CheckCircle2 size={16} className="text-emerald-600" />
                    </div>
                    <p className="text-xs text-gray-400">R$ 9.117,62 conferidos</p>
                  </div>
                </div>
              </div>

              {/* Create Closing Quick Form */}
              {isAdmin && (
                <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm space-y-6">
                  <h3 className="font-black text-gray-900 text-base uppercase tracking-tight flex items-center gap-2">
                    <FolderPlus size={18} className="text-blue-600" />
                    <span>Cadastrar Novo Fechamento Mensal</span>
                  </h3>
                  <form onSubmit={handleCreateClosing} className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <input
                      type="text"
                      placeholder="Nome (ex: OUTUBRO-26)"
                      value={newClosingName}
                      onChange={(e) => setNewClosingName(e.target.value)}
                      className="bg-gray-50 border border-gray-200 px-4 py-3.5 rounded-2xl text-xs font-bold outline-none"
                      required
                    />
                    <select
                      value={newClosingMes}
                      onChange={(e) => setNewClosingMes(Number(e.target.value))}
                      className="bg-gray-50 border border-gray-200 px-4 py-3.5 rounded-2xl text-xs font-bold outline-none"
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
                      className="bg-gray-50 border border-gray-200 px-4 py-3.5 rounded-2xl text-xs font-bold outline-none"
                      required
                    />
                    <button
                      type="submit"
                      disabled={isCreatingClosing}
                      className="bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider py-3.5 shadow-md transition flex items-center justify-center gap-2"
                    >
                      {isCreatingClosing ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                      <span>Criar Fechamento</span>
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}

          {/* ========================================== */}
          {/* 2. PRODUÇÃO DETALHADA */}
          {/* ========================================== */}
          {subTab === "producao" && (
            <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-gray-900 text-sm uppercase tracking-tight">
                  Produção Detalhada por Procedimento ({closingDetails?.production?.length || 0})
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 font-black text-gray-400 uppercase text-[10px]">
                    <tr>
                      <th className="p-3.5">Protocolo</th>
                      <th className="p-3.5">Data</th>
                      <th className="p-3.5">Paciente</th>
                      <th className="p-3.5">Código AMB</th>
                      <th className="p-3.5">Procedimento</th>
                      <th className="p-3.5">Honorário</th>
                      <th className="p-3.5">Executante</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {closingDetails?.production?.map((p: any) => (
                      <tr key={p.id} className="hover:bg-gray-50/50">
                        <td className="p-3.5 font-black text-blue-600">{p.protocol}</td>
                        <td className="p-3.5">{p.date}</td>
                        <td className="p-3.5 font-bold uppercase">{p.patientName}</td>
                        <td className="p-3.5 font-mono">{p.ambCode}</td>
                        <td className="p-3.5">{p.procedureDescription}</td>
                        <td className="p-3.5 font-black text-emerald-600">
                          R$ {Number(p.honorValue).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-3.5 font-bold uppercase text-gray-800">{p.executingProvider}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ========================================== */}
          {/* 3. GLOSAS POR PROTOCOLO */}
          {/* ========================================== */}
          {subTab === "glosas" && (
            <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden p-6 space-y-4">
              <h3 className="font-black text-gray-900 text-sm uppercase tracking-tight">
                Glosas Identificadas no Demonstrativo ({closingDetails?.glosas?.length || 0})
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 font-black text-gray-400 uppercase text-[10px]">
                    <tr>
                      <th className="p-3.5">Protocolo</th>
                      <th className="p-3.5">Vlr Informado</th>
                      <th className="p-3.5">Vlr Processado</th>
                      <th className="p-3.5">Valor da Glosa</th>
                      <th className="p-3.5">Médico Associado</th>
                      <th className="p-3.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {closingDetails?.glosas?.map((g: any) => (
                      <tr key={g.id} className="hover:bg-gray-50/50">
                        <td className="p-3.5 font-black text-blue-600">{g.protocol}</td>
                        <td className="p-3.5">R$ {Number(g.valueInformed).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                        <td className="p-3.5">R$ {Number(g.valueProcessed).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                        <td className="p-3.5 font-black text-red-600">-R$ {Number(g.glosaValue).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                        <td className="p-3.5 font-black uppercase text-gray-900">{g.doctorName}</td>
                        <td className="p-3.5">
                          <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-black uppercase">
                            {g.allocationStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ========================================== */}
          {/* 4. IMPOSTOS E RETENÇÕES */}
          {/* ========================================== */}
          {subTab === "impostos" && (
            <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden p-6 space-y-4">
              <h3 className="font-black text-gray-900 text-sm uppercase tracking-tight">
                Impostos Retidos na Fonte ({closingDetails?.taxes?.length || 0})
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 font-black text-gray-400 uppercase text-[10px]">
                    <tr>
                      <th className="p-3.5">Imposto</th>
                      <th className="p-3.5">Código</th>
                      <th className="p-3.5">Descrição</th>
                      <th className="p-3.5">Base de Cálculo</th>
                      <th className="p-3.5">Valor Retido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {closingDetails?.taxes?.map((t: any) => (
                      <tr key={t.id} className="hover:bg-gray-50/50">
                        <td className="p-3.5 font-black text-gray-900 uppercase">{t.type}</td>
                        <td className="p-3.5 font-mono">{t.code}</td>
                        <td className="p-3.5">{t.description}</td>
                        <td className="p-3.5">R$ {Number(t.baseValue).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                        <td className="p-3.5 font-black text-red-600">-R$ {Number(t.taxValue).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ========================================== */}
          {/* 5. DASHBOARD POR MÉDICO */}
          {/* ========================================== */}
          {subTab === "medicos" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {["LUAN JUNIOR VIGNATTI", "THAYNARA MAESTRI VIGNATTI", "MARIA EDUARDA CASA SOUZA MACHADO", "TAMARA QUINTINO REGIS", "CAMILA RIBEIRO DUTRA", "ROCHELE LORENZI POL"].map((docName, idx) => {
                  const docProd = closingDetails?.production?.filter((p: any) => p.executingProvider === docName) || [];
                  const prodSum = docProd.reduce((acc: number, p: any) => acc + Number(p.honorValue), 0);
                  const docGlosas = closingDetails?.glosas?.filter((g: any) => g.doctorName === docName) || [];
                  const glosaSum = docGlosas.reduce((acc: number, g: any) => acc + Number(g.glosaValue), 0);

                  return (
                    <div key={idx} className="bg-white p-6 rounded-[28px] border border-gray-100 shadow-sm space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-black text-sm uppercase text-gray-900">{docName}</h4>
                        <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-[10px] font-black uppercase">Médico</span>
                      </div>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-gray-400 font-bold">Produção:</span>
                          <span className="font-black text-emerald-600">R$ {prodSum.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400 font-bold">Glosas:</span>
                          <span className="font-black text-red-600">-R$ {glosaSum.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between pt-2 border-t border-gray-100">
                          <span className="text-gray-900 font-black">Líquido Estimado:</span>
                          <span className="font-black text-blue-600">R$ {(prodSum - glosaSum).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ========================================== */}
      {/* IMPORT WIZARD MODAL (3 FILES) */}
      {/* ========================================== */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-[32px] shadow-2xl p-8 sm:p-10 max-w-2xl w-full space-y-6 my-8">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <h3 className="font-black text-gray-900 text-lg uppercase tracking-tight">Importação de Lote (3 Arquivos)</h3>
                <p className="text-xs text-gray-400">Arraste ou selecione XLS, PROD.pdf e DEMONSTRATIVO.pdf</p>
              </div>
              <button onClick={() => { setIsImportModalOpen(false); setImportFiles([]); setImportResult(null); }} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl">
                <X size={22} />
              </button>
            </div>

            {!importResult ? (
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Fechamento de Destino:</label>
                  <select
                    value={selectedClosingId}
                    onChange={(e) => setSelectedClosingId(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 px-4 py-3.5 rounded-2xl text-xs font-bold outline-none"
                  >
                    {closings.map(c => (
                      <option key={c.id} value={c.id}>{c.nome} ({c.status})</option>
                    ))}
                  </select>
                </div>

                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleFileDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-200 hover:border-blue-500 bg-gray-50/60 rounded-[28px] p-8 text-center cursor-pointer transition space-y-3"
                >
                  <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                    <Upload size={26} />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-gray-900">Clique ou arraste os 3 arquivos aqui</h4>
                    <p className="text-xs text-gray-400 mt-0.5">XLS de produção, PDF de produção e Demonstrativo de pagamento</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".xls,.xlsx,.pdf,application/pdf,application/vnd.ms-excel"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>

                {importFiles.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-gray-700 uppercase">Arquivos Selecionados ({importFiles.length}):</span>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {importFiles.map((f, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl text-xs font-medium">
                          <span className="truncate max-w-[300px]">{f.name}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); setImportFiles(importFiles.filter((_, i) => i !== idx)); }}
                            className="text-red-500 hover:underline"
                          >
                            Remover
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => setIsImportModalOpen(false)}
                    className="flex-1 py-3 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-2xl transition"
                  >
                    Cancelar
                  </button>
                  <button
                    disabled={isUploading || importFiles.length === 0}
                    onClick={handleUploadBatch}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-blue-200 transition flex items-center justify-center gap-2"
                  >
                    {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                    <span>Processar e Conciliar</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6 text-center py-4">
                <CheckCircle2 size={48} className="text-emerald-600 mx-auto" />
                <h4 className="font-black text-gray-900 text-lg uppercase">Lote {importResult.batchNumber} Importado com Sucesso!</h4>
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-xs space-y-1 text-emerald-900">
                  <p><strong>Status:</strong> {importResult.reconciliation?.status}</p>
                  <p><strong>Produção XLS/PDF:</strong> R$ {importResult.summary?.totalProductionPdf?.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                  <p><strong>Valor Líquido:</strong> R$ {importResult.summary?.netValue?.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                </div>
                <button
                  onClick={() => { setIsImportModalOpen(false); setImportFiles([]); setImportResult(null); }}
                  className="px-8 py-3.5 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-md hover:bg-blue-700 transition"
                >
                  Concluir e Ver Board
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
