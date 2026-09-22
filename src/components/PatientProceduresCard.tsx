import React, { useState, useEffect, useMemo } from "react";
import { 
  Activity, 
  ChevronDown, 
  ChevronUp, 
  Calendar, 
  ArrowUpDown, 
  RefreshCw, 
  Building2, 
  Hash, 
  FileText, 
  AlertCircle
} from "lucide-react";
import { useGroup } from "../contexts/GroupContext";

export interface ProcedimentoItem {
  id: string;
  pacienteId?: string;
  codigoUsuario?: string;
  nomeUsuario?: string;
  periodo?: string;
  notaFiscal?: string;
  relacaoNr?: string;
  data?: string;
  documento?: string;
  quantidade?: number;
  codigoAMB?: string;
  descricao?: string;
  valorHonorarios?: number;
  valorOperacional?: number;
  valorFilme?: number;
  valorTaxaAdministrativa?: number;
  prestadorExecutante?: string;
  prestadorPagamento?: string;
  prestadorProtocolo?: string;
  dadosOriginais?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

interface PatientProceduresCardProps {
  patientId: string;
  codigoUsuario?: string;
  initialProcedimentos?: ProcedimentoItem[];
}

export const PatientProceduresCard: React.FC<PatientProceduresCardProps> = ({
  patientId,
  codigoUsuario,
  initialProcedimentos = []
}) => {
  const { apiFetch } = useGroup();
  const [procedimentos, setProcedimentos] = useState<ProcedimentoItem[]>(initialProcedimentos);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc"); // Default: Mais recente para mais antigo
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Sync when initialProcedimentos changes
  useEffect(() => {
    if (initialProcedimentos && initialProcedimentos.length > 0) {
      setProcedimentos(initialProcedimentos);
    }
  }, [initialProcedimentos]);

  const fetchProcedimentos = async () => {
    if (!patientId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/app/patients/${patientId}/procedimentos?sort=${sortOrder}`);
      if (!res.ok) {
        throw new Error(`Erro ao buscar procedimentos (${res.status})`);
      }
      const data = await res.json();
      if (data && Array.isArray(data.procedimentos)) {
        setProcedimentos(data.procedimentos);
      }
    } catch (err: any) {
      console.error("Erro ao carregar procedimentos:", err);
      setError(err.message || "Erro ao consultar procedimentos");
    } finally {
      setLoading(false);
    }
  };

  // If no initial procedures were provided, fetch them on mount or when patientId changes
  useEffect(() => {
    if (!initialProcedimentos || initialProcedimentos.length === 0) {
      fetchProcedimentos();
    }
  }, [patientId]);

  // Handle in-memory or server sort toggle
  const toggleSort = () => {
    const nextOrder = sortOrder === "desc" ? "asc" : "desc";
    setSortOrder(nextOrder);
  };

  const sortedProcedimentos = useMemo(() => {
    const list = [...procedimentos];
    list.sort((a, b) => {
      const dateA = a.data || a.createdAt || "";
      const dateB = b.data || b.createdAt || "";
      return sortOrder === "asc" ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
    });
    return list;
  }, [procedimentos, sortOrder]);

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  const formatCurrency = (val?: number) => {
    if (val === undefined || val === null || isNaN(val)) return "0,00";
    return val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const totalHonorarios = useMemo(() => {
    return procedimentos.reduce((acc, curr) => acc + (curr.valorHonorarios || 0), 0);
  }, [procedimentos]);

  return (
    <div className="bg-white rounded-[1.25rem] border border-gray-100 shadow-sm overflow-hidden flex flex-col transition-all">
      {/* Header */}
      <div className="bg-blue-50/50 px-5 py-3.5 border-b border-blue-100/50 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="bg-blue-600 text-white w-7 h-7 flex items-center justify-center rounded-full font-bold shadow-md shadow-blue-500/20 shrink-0">
            <Activity size={14} strokeWidth={2.5} />
          </div>
          <span className="text-sm font-bold text-blue-900 uppercase tracking-wider font-sans truncate">
            Procedimentos
          </span>
          <span className="bg-blue-100/70 text-blue-800 text-[11px] font-bold px-2 py-0.5 rounded-full border border-blue-200/50 shrink-0">
            {sortedProcedimentos.length}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Sort Order Button */}
          {sortedProcedimentos.length > 1 && (
            <button
              type="button"
              onClick={toggleSort}
              title={sortOrder === "desc" ? "Ordenado: Mais recentes primeiro" : "Ordenado: Mais antigos primeiro"}
              className="px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-white hover:bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs"
            >
              <ArrowUpDown size={12} className="text-blue-500" />
              <span>{sortOrder === "desc" ? "Mais recentes" : "Mais antigos"}</span>
            </button>
          )}

          {/* Refresh Button */}
          <button
            type="button"
            onClick={fetchProcedimentos}
            disabled={loading}
            title="Atualizar lista de procedimentos"
            className="p-1.5 text-blue-700 bg-white hover:bg-blue-50 border border-blue-200 rounded-lg transition-colors shadow-2xs disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? "animate-spin text-blue-600" : "text-blue-500"} />
          </button>
        </div>
      </div>

      {/* Summary sub-header if there are procedures */}
      {sortedProcedimentos.length > 0 && totalHonorarios > 0 && (
        <div className="bg-slate-50/70 px-5 py-2 border-b border-slate-100 flex items-center justify-between text-xs text-slate-600">
          <span className="font-medium text-slate-500">Total em honorários:</span>
          <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
            R$ {formatCurrency(totalHonorarios)}
          </span>
        </div>
      )}

      {/* Content */}
      <div className="p-4 sm:p-5">
        {loading && sortedProcedimentos.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-slate-400 text-xs font-medium gap-2">
            <RefreshCw size={15} className="animate-spin text-blue-500" />
            <span>Consultando procedimentos...</span>
          </div>
        ) : error ? (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-amber-800 text-xs">
            <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold">Não foi possível carregar os procedimentos.</p>
              <p className="text-amber-700 mt-0.5">{error}</p>
            </div>
            <button 
              type="button"
              onClick={fetchProcedimentos}
              className="text-xs underline font-semibold text-amber-900 hover:text-amber-950 shrink-0"
            >
              Tentar novamente
            </button>
          </div>
        ) : sortedProcedimentos.length === 0 ? (
          <p className="text-xs text-slate-400 italic font-medium py-3 text-center sm:text-left">
            Nenhum procedimento importado para este paciente.
          </p>
        ) : (
          <div className="space-y-3">
            {sortedProcedimentos.map((proc, index) => {
              const isExpanded = expandedId === proc.id;
              const hasPrestador = proc.prestadorExecutante || proc.prestadorPagamento;

              return (
                <div
                  key={proc.id || index}
                  className="bg-white rounded-xl border border-slate-100 hover:border-blue-200 p-3.5 sm:p-4 transition-all shadow-2xs hover:shadow-xs flex flex-col gap-2.5"
                >
                  {/* Top Bar: Data, Código AMB, and Vlr. Hon. */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      {proc.data && (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-700 bg-slate-100/80 px-2 py-0.5 rounded-md border border-slate-200/60">
                          <Calendar size={12} className="text-slate-500" />
                          {proc.data}
                        </span>
                      )}
                      {proc.codigoAMB && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200/60">
                          <Hash size={11} className="text-blue-500" />
                          AMB {proc.codigoAMB}
                        </span>
                      )}
                      {proc.quantidade !== undefined && proc.quantidade > 1 && (
                        <span className="text-[11px] font-semibold text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200/50">
                          Qtd: {proc.quantidade}
                        </span>
                      )}
                    </div>

                    {proc.valorHonorarios !== undefined && (
                      <div className="text-right">
                        <span className="text-[11px] text-slate-400 mr-1.5 font-medium">Vlr. Hon.:</span>
                        <span className="text-xs sm:text-sm font-bold text-emerald-700 bg-emerald-50/90 px-2 py-0.5 rounded-md border border-emerald-200/70">
                          R$ {formatCurrency(proc.valorHonorarios)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Descrição */}
                  <div className="text-sm font-bold text-slate-900 leading-snug">
                    {proc.descricao || "Procedimento sem descrição"}
                  </div>

                  {/* Prestador Executante ou Prestador Pagamento */}
                  {hasPrestador && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50/60 px-2.5 py-1.5 rounded-lg border border-slate-100">
                      <Building2 size={13} className="text-blue-600 shrink-0" />
                      <span className="font-semibold text-slate-700">Prestador:</span>
                      <span className="truncate">{proc.prestadorExecutante || proc.prestadorPagamento}</span>
                    </div>
                  )}

                  {/* Toggle details button */}
                  <div className="pt-1 flex items-center justify-between border-t border-slate-100/80">
                    <button
                      type="button"
                      onClick={() => toggleExpand(proc.id)}
                      className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors py-0.5"
                    >
                      <span>{isExpanded ? "Ocultar detalhes" : "Ver todos os detalhes"}</span>
                      {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>

                    {proc.notaFiscal && (
                      <span className="text-[11px] text-slate-400">
                        NF: <span className="font-mono text-slate-600 font-semibold">{proc.notaFiscal}</span>
                      </span>
                    )}
                  </div>

                  {/* Expanded Details Panel */}
                  {isExpanded && (
                    <div className="mt-2 pt-3 border-t border-slate-100 bg-slate-50/60 -mx-3.5 -mb-3.5 sm:-mx-4 sm:-mb-4 p-3.5 sm:p-4 rounded-b-xl space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {proc.periodo && (
                          <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200/60">
                            <span className="text-slate-500 font-medium">Período:</span>
                            <span className="font-semibold text-slate-800">{proc.periodo}</span>
                          </div>
                        )}
                        {proc.notaFiscal && (
                          <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200/60">
                            <span className="text-slate-500 font-medium">Nota Fiscal:</span>
                            <span className="font-mono font-semibold text-slate-800">{proc.notaFiscal}</span>
                          </div>
                        )}
                        {proc.relacaoNr && (
                          <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200/60">
                            <span className="text-slate-500 font-medium">Relação Nº:</span>
                            <span className="font-mono font-semibold text-slate-800">{proc.relacaoNr}</span>
                          </div>
                        )}
                        {proc.documento && (
                          <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200/60">
                            <span className="text-slate-500 font-medium">Documento:</span>
                            <span className="font-mono font-semibold text-slate-800">{proc.documento}</span>
                          </div>
                        )}
                        {proc.valorOperacional !== undefined && proc.valorOperacional > 0 && (
                          <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200/60">
                            <span className="text-slate-500 font-medium">Vlr. Operacional:</span>
                            <span className="font-bold text-slate-800">R$ {formatCurrency(proc.valorOperacional)}</span>
                          </div>
                        )}
                        {proc.valorFilme !== undefined && proc.valorFilme > 0 && (
                          <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200/60">
                            <span className="text-slate-500 font-medium">Vlr. Filme:</span>
                            <span className="font-bold text-slate-800">R$ {formatCurrency(proc.valorFilme)}</span>
                          </div>
                        )}
                        {proc.valorTaxaAdministrativa !== undefined && proc.valorTaxaAdministrativa > 0 && (
                          <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200/60">
                            <span className="text-slate-500 font-medium">Vlr. Tx Adm:</span>
                            <span className="font-bold text-slate-800">R$ {formatCurrency(proc.valorTaxaAdministrativa)}</span>
                          </div>
                        )}
                        {proc.prestadorProtocolo && (
                          <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200/60 sm:col-span-2">
                            <span className="text-slate-500 font-medium">Prestador Protocolo:</span>
                            <span className="font-semibold text-slate-800">{proc.prestadorProtocolo}</span>
                          </div>
                        )}
                      </div>

                      {/* Dados Originais se houver outras colunas preservadas */}
                      {proc.dadosOriginais && Object.keys(proc.dadosOriginais).length > 0 && (
                        <div className="bg-white p-3 rounded-lg border border-slate-200/60">
                          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                            <FileText size={12} className="text-slate-400" />
                            Registro Completo da Linha CSV
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] max-h-48 overflow-y-auto pr-1">
                            {Object.entries(proc.dadosOriginais).map(([k, v]) => (
                              <div key={k} className="flex items-center justify-between py-0.5 border-b border-slate-100 last:border-b-0">
                                <span className="text-slate-400 font-medium truncate max-w-[45%]">{k}:</span>
                                <span className="text-slate-700 font-semibold truncate max-w-[50%]">{String(v ?? "") || "-"}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
