import React, { useState, useEffect } from "react";
import { useGroup } from "../../contexts/GroupContext";
import { FinancialClosing } from "../../types/financial";
import { 
  Calendar, 
  Plus, 
  UploadCloud, 
  CheckCircle2, 
  AlertTriangle, 
  Lock, 
  Unlock, 
  ChevronRight, 
  FileText, 
  Loader2,
  TrendingUp,
  ArrowRight,
  ShieldAlert,
  Users,
  Trash2
} from "lucide-react";

interface FinancialClosingsViewProps {
  selectedClosingId: string | null;
  onSelectClosing: (id: string | null) => void;
  onOpenImport: () => void;
}

export function FinancialClosingsView({ selectedClosingId, onSelectClosing, onOpenImport }: FinancialClosingsViewProps) {
  const { activeGroup, apiFetch } = useGroup();
  const [closings, setClosings] = useState<FinancialClosing[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMonthModal, setNewMonthModal] = useState(false);
  const [monthNameInput, setMonthNameInput] = useState("SETEMBRO-26");
  const [closingDetails, setClosingDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const fetchClosings = async () => {
    if (!activeGroup) return;
    try {
      setLoading(true);
      const res = await apiFetch("/api/app/financial/closings");
      if (res.ok) {
        const data = await res.json();
        setClosings(data);
        if (data.length > 0 && !selectedClosingId) {
          onSelectClosing(data[0].id);
        }
      }
    } catch (e) {
      console.error("Failed to load closings:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClosings();
  }, [activeGroup]);

  useEffect(() => {
    if (selectedClosingId) {
      fetchClosingDetails(selectedClosingId);
    } else {
      setClosingDetails(null);
    }
  }, [selectedClosingId]);

  const fetchClosingDetails = async (id: string) => {
    try {
      setLoadingDetails(true);
      const res = await apiFetch(`/api/app/financial/closings/${id}/details`);
      if (res.ok) {
        const data = await res.json();
        setClosingDetails(data);
      }
    } catch (e) {
      console.error("Failed to load closing details:", e);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleCreateClosing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!monthNameInput.trim()) return;
    try {
      const res = await apiFetch("/api/app/financial/closings", {
        method: "POST",
        body: JSON.stringify({ monthKey: monthNameInput.trim().toUpperCase() })
      });
      if (res.ok) {
        const newClosing = await res.json();
        setClosings([newClosing, ...closings]);
        onSelectClosing(newClosing.id);
        setNewMonthModal(false);
        setMonthNameInput("");
      }
    } catch (err: any) {
      alert("Erro ao criar fechamento: " + err.message);
    }
  };

  const handleToggleCloseMonth = async (closingId: string, currentStatus: string) => {
    const newStatus = currentStatus === "FECHADO" ? "ABERTO" : "FECHADO";
    const reason = newStatus === "ABERTO" ? prompt("Motivo da reabertura do mês:") : "";
    if (newStatus === "ABERTO" && !reason) return;

    try {
      const res = await apiFetch(`/api/app/financial/closings/${closingId}/status`, {
        method: "POST",
        body: JSON.stringify({ status: newStatus, reason })
      });
      if (res.ok) {
        fetchClosings();
        fetchClosingDetails(closingId);
      }
    } catch (err: any) {
      alert("Erro ao atualizar status: " + err.message);
    }
  };

  const handleDeleteClosing = async (closingId: string, monthKey: string) => {
    if (!confirm(`Deseja realmente EXCLUIR o fechamento "${monthKey}" e todos os seus lançamentos, produções e dados importados? Esta ação é irreversível e removerá todos os dados do período.`)) return;
    try {
      const res = await apiFetch(`/api/app/financial/closings/${closingId}`, { method: "DELETE" });
      if (res.ok) {
        const remaining = closings.filter(c => c.id !== closingId);
        setClosings(remaining);
        if (selectedClosingId === closingId) {
          onSelectClosing(remaining.length > 0 ? remaining[0].id : null);
        }
      }
    } catch (err: any) {
      alert("Erro ao excluir fechamento: " + err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-blue-600" size={36} />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto pb-12">
      {/* Top action bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-[28px] border border-gray-200/80 shadow-xs">
        <div>
          <h2 className="text-xl font-black text-gray-900 tracking-tight uppercase">Fechamentos Financeiros</h2>
          <p className="text-xs text-gray-500">Selecione o mês desejado ou importe os arquivos do portal do prestador</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setNewMonthModal(true)}
            className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2.5 rounded-2xl font-black text-xs transition"
          >
            <Plus size={16} />
            <span>Novo Fechamento (Mês)</span>
          </button>
          <button
            onClick={onOpenImport}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-2xl font-black text-xs transition shadow-lg shadow-blue-500/20 active:scale-95"
          >
            <UploadCloud size={16} />
            <span>Importar Documentos (Lote 10944)</span>
          </button>
        </div>
      </div>

      {/* Closings Tabs / Cards Selector */}
      {closings.length === 0 ? (
        <div className="bg-white rounded-[32px] p-12 text-center border border-gray-200/80 space-y-4">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mx-auto">
            <Calendar size={32} />
          </div>
          <h3 className="text-lg font-bold text-gray-900">Nenhum fechamento financeiro cadastrado</h3>
          <p className="text-sm text-gray-500 max-w-sm mx-auto">Crie seu primeiro fechamento (ex: SETEMBRO-26) e importe os arquivos do portal do prestador.</p>
          <button
            onClick={() => setNewMonthModal(true)}
            className="px-6 py-3 bg-blue-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-xl shadow-blue-500/20"
          >
            Criar Fechamento SETEMBRO-26
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3 overflow-x-auto pb-2 custom-scrollbar">
          {closings.map(c => {
            const isSelected = c.id === selectedClosingId;
            return (
              <button
                key={c.id}
                onClick={() => onSelectClosing(c.id)}
                className={`flex items-center gap-4 px-6 py-4 rounded-3xl border transition-all shrink-0 cursor-pointer ${
                  isSelected
                    ? "bg-blue-600 border-blue-600 text-white shadow-xl shadow-blue-500/20"
                    : "bg-white border-gray-200/80 text-gray-800 hover:border-blue-300"
                }`}
              >
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-xs ${
                  isSelected ? "bg-white/20 text-white" : "bg-blue-50 text-blue-600"
                }`}>
                  <Calendar size={18} />
                </div>
                <div className="text-left">
                  <span className="text-[10px] font-bold uppercase tracking-widest opacity-80 block">Fechamento</span>
                  <span className="font-black text-base tracking-tight">{c.monthKey}</span>
                </div>
                <div className={`ml-2 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                  c.status === "FECHADO" 
                    ? "bg-emerald-500 text-white" 
                    : c.status === "CONCILIADO_COM_AVISOS" 
                    ? "bg-amber-400 text-gray-900" 
                    : "bg-gray-100 text-gray-600"
                }`}>
                  {c.status.replace(/_/g, " ")}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Selected Closing Dashboard / Board */}
      {selectedClosingId && (
        loadingDetails ? (
          <div className="bg-white rounded-[32px] p-16 text-center">
            <Loader2 className="animate-spin text-blue-600 mx-auto" size={36} />
            <p className="text-xs text-gray-400 font-bold mt-4">Carregando dados consolidados do fechamento...</p>
          </div>
        ) : closingDetails ? (
          <div className="space-y-8">
            {/* Board do Fechamento (Section 33) */}
            <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 text-white rounded-[36px] p-8 lg:p-10 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-10 opacity-10 pointer-events-none">
                <TrendingUp size={180} />
              </div>

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 border-b border-white/10 pb-6">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="px-3 py-1 bg-blue-500/30 border border-blue-400/30 text-blue-300 rounded-full text-xs font-black uppercase tracking-widest">
                      {closingDetails.closing.monthKey}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest flex items-center gap-1.5 ${
                      closingDetails.closing.status === "FECHADO" 
                        ? "bg-emerald-500/30 border border-emerald-400/30 text-emerald-300" 
                        : "bg-amber-500/30 border border-amber-400/30 text-amber-300"
                    }`}>
                      {closingDetails.closing.status === "FECHADO" ? <Lock size={12} /> : <Unlock size={12} />}
                      <span>STATUS: {closingDetails.closing.status.replace(/_/g, " ")}</span>
                    </span>
                  </div>
                  <h3 className="text-2xl lg:text-3xl font-black tracking-tight">Consolidado Financeiro Mensal</h3>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleToggleCloseMonth(closingDetails.closing.id, closingDetails.closing.status)}
                    className={`px-5 py-3 rounded-2xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-xl ${
                      closingDetails.closing.status === "FECHADO"
                        ? "bg-amber-500 text-gray-900 hover:bg-amber-400"
                        : "bg-emerald-500 text-white hover:bg-emerald-600"
                    }`}
                  >
                    {closingDetails.closing.status === "FECHADO" ? <Unlock size={16} /> : <Lock size={16} />}
                    <span>{closingDetails.closing.status === "FECHADO" ? "Reabrir Mês" : "Fechar Mês"}</span>
                  </button>

                  <button
                    onClick={() => handleDeleteClosing(closingDetails.closing.id, closingDetails.closing.monthKey)}
                    className="px-4 py-3 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-300 rounded-2xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer"
                    title="Excluir Fechamento e Dados Importados"
                  >
                    <Trash2 size={16} />
                    <span>Excluir Fechamento</span>
                  </button>
                </div>
              </div>

              {/* Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
                <CardItem label="Produção" value={closingDetails.closing.processedValue} color="text-blue-300" />
                <CardItem label="Glosas" value={closingDetails.closing.glosaValue} color="text-rose-300" isNegative />
                <CardItem label="Impostos" value={closingDetails.closing.taxValue} color="text-amber-300" isNegative />
                <CardItem label="Outros Débitos" value={closingDetails.closing.otherDebits} color="text-purple-300" isNegative />
                <CardItem label="Outros Créditos" value={closingDetails.closing.otherCredits} color="text-emerald-300" />
                <CardItem label="Valor Líquido" value={closingDetails.closing.netValue} color="text-emerald-400 font-black text-xl" isHighlight />
              </div>

              {closingDetails.closing.hasQuantityDivergence && (
                <div className="mt-6 p-4 bg-amber-500/20 border border-amber-400/30 rounded-2xl flex items-center gap-3 text-amber-200 text-xs font-medium">
                  <ShieldAlert size={18} className="shrink-0 text-amber-400" />
                  <span>Aviso: Existe divergência de quantidade de registros entre o XLS detalhado ({closingDetails.closing.productionQuantity}) e o PDF estatístico ({closingDetails.closing.pdfProductionQuantity}). Valores financeiros rigorosamente conciliados.</span>
                </div>
              )}
            </div>

            {/* Board por Médico & Produção (Section 34) */}
            <div className="bg-white rounded-[36px] p-8 border border-gray-200/80 shadow-xl space-y-6">
              <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                <div>
                  <h4 className="text-lg font-black text-gray-900 uppercase tracking-tight">Produção & Glosas por Médico</h4>
                  <p className="text-xs text-gray-500">Distribuição calculada através do cruzamento por protocolo</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {closingDetails.doctorsSummary.map((doc: any) => (
                  <div key={doc.doctorId} className="bg-gray-50/60 border border-gray-200/60 p-6 rounded-3xl space-y-4 hover:bg-white hover:shadow-xl transition-all">
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black text-xs shadow-md shadow-blue-500/20">
                        <Users size={18} />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-xl">
                        {doc.procedureCount} procedimentos
                      </span>
                    </div>

                    <div>
                      <h5 className="font-black text-gray-900 text-base uppercase tracking-tight">{doc.doctorName}</h5>
                      <span className="text-xs text-gray-400 font-bold">{doc.protocolCount} protocolos associados</span>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-gray-200/60 text-xs">
                      <div className="flex justify-between font-medium">
                        <span className="text-gray-500">Produção Bruta:</span>
                        <span className="font-bold text-gray-900">R$ {doc.productionTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between font-medium">
                        <span className="text-gray-500">Glosas Atribuídas:</span>
                        <span className="font-bold text-rose-600">-R$ {doc.glosaTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between font-black text-sm pt-2 border-t border-gray-200/60 text-blue-600">
                        <span>Líquido de Produção:</span>
                        <span>R$ {doc.netProduction.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null
      )}

      {/* Modal: New Month */}
      {newMonthModal && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <form onSubmit={handleCreateClosing} className="bg-white rounded-[32px] p-8 max-w-sm w-full space-y-6 shadow-2xl">
            <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Criar Novo Fechamento</h3>
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase">Referência do Fechamento</label>
              <input
                type="text"
                value={monthNameInput}
                onChange={e => setMonthNameInput(e.target.value)}
                placeholder="Ex: SETEMBRO-26"
                className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 text-sm font-bold uppercase outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setNewMonthModal(false)}
                className="flex-1 py-3.5 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-2xl"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold text-xs uppercase tracking-wider shadow-lg shadow-blue-500/20"
              >
                Criar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function CardItem({ label, value, color, isNegative, isHighlight }: { label: string; value: number; color: string; isNegative?: boolean; isHighlight?: boolean }) {
  return (
    <div className={`p-5 rounded-3xl border ${isHighlight ? "bg-blue-600/20 border-blue-400/40" : "bg-white/5 border-white/10"} flex flex-col justify-between`}>
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</span>
      <span className={`text-lg font-black mt-3 ${color}`}>
        {isNegative ? "-R$ " : "R$ "}{Math.abs(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    </div>
  );
}
