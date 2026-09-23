import React, { useState, useEffect, useMemo } from "react";
import { 
  ArrowLeft, 
  Users, 
  Trash2, 
  Search, 
  CheckSquare, 
  Square, 
  AlertCircle, 
  Loader2, 
  ChevronLeft, 
  ChevronRight, 
  Check, 
  RefreshCw,
  X,
  Filter
} from "lucide-react";
import { useGroup } from "../contexts/GroupContext";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";

interface PatientBatchRemovalViewProps {
  onBack: () => void;
}

export function PatientBatchRemovalView({ onBack }: PatientBatchRemovalViewProps) {
  const { activeGroup, apiFetch } = useGroup();
  const [patients, setPatients] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const fetchPatients = async () => {
    if (!activeGroup) return;
    setIsLoading(true);
    setError(null);
    try {
      // First try fetching via API
      let list: any[] = [];
      try {
        const res = await apiFetch("/api/app/patients?full=true");
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.patients)) {
            list = data.patients;
          } else if (Array.isArray(data)) {
            list = data;
          }
        }
      } catch (apiErr) {
        console.warn("API fetch error, trying direct Firestore fallback:", apiErr);
      }

      // If list is empty, fallback to direct Firestore query
      if (list.length === 0 && activeGroup?.id) {
        try {
          const snap = await getDocs(query(collection(db, "patients"), where("groupId", "==", activeGroup.id)));
          list = snap.docs
            .map(d => {
              const dData = d.data();
              return {
                id: d.id,
                ...dData,
                nome: dData.name || dData.nome || "Sem Nome",
                hospitalName: dData.hospitalId || "Sem Hospital",
                status: dData.statusId || "Sem Status"
              };
            })
            .filter((p: any) => p.recordStatus !== "removed");
        } catch (fbErr) {
          console.error("Direct Firestore fallback error:", fbErr);
        }
      }

      setPatients(list);
    } catch (err: any) {
      console.error("Erro ao buscar pacientes:", err);
      setError(err.message || "Erro ao carregar lista de pacientes.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPatients();
  }, [activeGroup?.id]);

  // Filtered patients based on search
  const filteredPatients = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return patients;

    return patients.filter(p => {
      const name = (p.nome || p.name || "").toLowerCase();
      const code = (p.codigoUsuario || "").toLowerCase();
      const doc = (p.cpf || p.documento || "").toLowerCase();
      const hospital = (p.hospitalName || "").toLowerCase();
      const status = (p.status || "").toLowerCase();
      return (
        name.includes(term) || 
        code.includes(term) || 
        doc.includes(term) || 
        hospital.includes(term) || 
        status.includes(term)
      );
    });
  }, [patients, searchTerm]);

  // Reset to page 1 when search or page size changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, pageSize]);

  // Paginated patients for current page
  const totalPages = Math.max(1, Math.ceil(filteredPatients.length / pageSize));
  const validCurrentPage = Math.min(currentPage, totalPages);

  const paginatedPatients = useMemo(() => {
    const startIndex = (validCurrentPage - 1) * pageSize;
    return filteredPatients.slice(startIndex, startIndex + pageSize);
  }, [filteredPatients, validCurrentPage, pageSize]);

  // Check if all patients on CURRENT PAGE are selected
  const isAllCurrentPageSelected = useMemo(() => {
    if (paginatedPatients.length === 0) return false;
    return paginatedPatients.every(p => selectedIds.has(p.id));
  }, [paginatedPatients, selectedIds]);

  // Toggle selection for all patients on the CURRENT PAGE
  const toggleSelectCurrentPage = () => {
    const next = new Set(selectedIds);
    if (isAllCurrentPageSelected) {
      // Unselect all items on current page
      paginatedPatients.forEach(p => next.delete(p.id));
    } else {
      // Select all items on current page
      paginatedPatients.forEach(p => next.add(p.id));
    }
    setSelectedIds(next);
  };

  // Select all filtered patients across ALL pages
  const selectAllFiltered = () => {
    const next = new Set(selectedIds);
    filteredPatients.forEach(p => next.add(p.id));
    setSelectedIds(next);
  };

  // Deselect everything
  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  // Toggle individual patient
  const toggleSelectPatient = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  // Batch delete action
  const handleBatchRemove = async () => {
    if (selectedIds.size === 0) return;

    const count = selectedIds.size;
    const confirmMsg = `ATENÇÃO: Deseja realmente remover os ${count} paciente(s) selecionado(s)?\n\nEles deixarão de aparecer na lista de pacientes ativos do grupo.`;
    
    if (!window.confirm(confirmMsg)) return;

    setIsDeleting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await apiFetch("/api/app/patients/batch-remove", {
        method: "POST",
        body: JSON.stringify({ patientIds: Array.from(selectedIds) })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Erro HTTP ${res.status}`);
      }

      const resData = await res.json().catch(() => ({}));
      setSuccessMessage(`${count} paciente(s) e todos os seus procedimentos foram removidos permanentemente!`);
      setSelectedIds(new Set());
      await fetchPatients();
    } catch (err: any) {
      console.error("Erro na remoção:", err);
      setError(err.message || "Não foi possível remover os pacientes selecionados.");
    } finally {
      setIsDeleting(false);
    }
  };

  const [isPurging, setIsPurging] = useState(false);

  const handlePurgeRemoved = async () => {
    const confirmMsg = "Deseja realizar a limpeza profunda do banco de dados?\n\nIsso removerá permanentemente do banco todos os procedimentos órfãos e pacientes que já foram marcados como removidos anteriormente.";
    if (!window.confirm(confirmMsg)) return;

    setIsPurging(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await apiFetch("/api/app/patients/purge-removed", {
        method: "POST"
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Erro HTTP ${res.status}`);
      }
      const data = await res.json();
      setSuccessMessage(`Limpeza concluída! ${data.purgedPatients || 0} paciente(s) e ${data.purgedProcedures || 0} procedimento(s) órfãos foram purgados definitivamente do banco de dados.`);
      await fetchPatients();
    } catch (err: any) {
      console.error("Erro na limpeza:", err);
      setError(err.message || "Erro ao realizar a limpeza.");
    } finally {
      setIsPurging(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-y-auto">
      {/* Top Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-5 sticky top-0 z-20 shadow-xs">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button 
              onClick={onBack} 
              className="p-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all text-slate-600 active:scale-95 shrink-0"
              title="Voltar para configurações"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-50 text-red-600 rounded-2xl shadow-inner">
                <Users size={24} />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                  Gerenciar e Remover Pacientes
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  {patients.length} paciente(s) cadastrado(s) no grupo
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-center">
            <button
              onClick={handlePurgeRemoved}
              disabled={isPurging || isLoading}
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl transition-all text-xs font-bold active:scale-95 disabled:opacity-50"
              title="Limpar procedimentos órfãos e registros removidos do banco"
            >
              {isPurging ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} className="text-amber-600" />}
              <span className="hidden md:inline">Limpar Órfãos / Removidos</span>
            </button>

            <button
              onClick={fetchPatients}
              disabled={isLoading}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all active:scale-95 disabled:opacity-50"
              title="Atualizar lista"
            >
              <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
            </button>

            {selectedIds.size > 0 && (
              <button
                onClick={handleBatchRemove}
                disabled={isDeleting}
                className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-xl font-black text-xs uppercase tracking-wider hover:bg-red-700 transition-all shadow-lg shadow-red-200 active:scale-95 disabled:opacity-50"
              >
                {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                <span>Remover ({selectedIds.size})</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto w-full p-4 sm:p-6 flex-1 flex flex-col gap-4">
        {/* Alerts */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-between text-red-700 text-xs font-bold shadow-xs">
            <div className="flex items-center gap-2.5">
              <AlertCircle size={18} className="shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded-lg">
              <X size={16} />
            </button>
          </div>
        )}

        {successMessage && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-emerald-800 text-xs font-bold shadow-xs">
            <div className="flex items-center gap-2.5">
              <Check size={18} className="shrink-0 text-emerald-600" />
              <span>{successMessage}</span>
            </div>
            <button onClick={() => setSuccessMessage(null)} className="p-1 hover:bg-emerald-100 rounded-lg">
              <X size={16} />
            </button>
          </div>
        )}

        {/* Search & Bulk Selection Toolbar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome, código, CPF, hospital ou status..."
              className="w-full bg-slate-50 border border-slate-200 pl-10 pr-4 py-2.5 rounded-xl text-sm font-semibold outline-none focus:ring-3 focus:ring-red-100 focus:border-red-400 transition-all"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Select All on Current Page Button */}
            <button
              onClick={toggleSelectCurrentPage}
              disabled={paginatedPatients.length === 0}
              className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all border ${
                isAllCurrentPageSelected 
                  ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100" 
                  : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
              }`}
            >
              {isAllCurrentPageSelected ? (
                <CheckSquare size={16} className="text-red-600" />
              ) : (
                <Square size={16} className="text-slate-400" />
              )}
              <span>Selecionar Todos da Página</span>
            </button>

            {/* Select All Across All Pages if there are multiple pages */}
            {filteredPatients.length > paginatedPatients.length && (
              <button
                onClick={selectAllFiltered}
                className="px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all"
              >
                Selecionar Todos ({filteredPatients.length})
              </button>
            )}

            {/* Deselect All */}
            {selectedIds.size > 0 && (
              <button
                onClick={deselectAll}
                className="px-3 py-2.5 text-slate-500 hover:text-slate-800 text-xs font-bold transition-all"
              >
                Desmarcar Todos
              </button>
            )}

            {/* Items per page selector */}
            <div className="flex items-center gap-1.5 ml-auto border-l border-slate-200 pl-3">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Exibir:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-700 outline-none"
              >
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        </div>

        {/* Selected count notification pill */}
        {selectedIds.size > 0 && (
          <div className="bg-red-50 border border-red-200 px-4 py-3 rounded-2xl flex items-center justify-between text-xs text-red-900 font-bold shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse" />
              <span>
                <strong>{selectedIds.size}</strong> de {filteredPatients.length} paciente(s) selecionado(s) para remoção
              </span>
            </div>
            <button
              onClick={handleBatchRemove}
              disabled={isDeleting}
              className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all disabled:opacity-50"
            >
              {isDeleting ? "Removendo..." : "Confirmar Remoção"}
            </button>
          </div>
        )}

        {/* Patients Table / List */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <Loader2 size={36} className="animate-spin text-red-600" />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Buscando pacientes no banco de dados...
              </span>
            </div>
          ) : filteredPatients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
              <Users size={44} className="text-slate-300 mb-3" />
              <h4 className="text-base font-bold text-slate-800">
                {searchTerm ? "Nenhum paciente encontrado para esta busca" : "Nenhum paciente cadastrado"}
              </h4>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                {searchTerm 
                  ? "Verifique o termo digitado ou limpe o campo de busca."
                  : "Importe uma planilha CSV através da opção 'Importar pacientes via CSV' nas configurações."
                }
              </p>
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="mt-4 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
                >
                  Limpar Busca
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-black text-slate-500 uppercase tracking-wider select-none">
                    <th className="py-3.5 px-4 w-12 text-center">
                      <button
                        type="button"
                        onClick={toggleSelectCurrentPage}
                        title={isAllCurrentPageSelected ? "Desmarcar todos desta página" : "Selecionar todos desta página"}
                        className="p-1 rounded-md hover:bg-slate-200 transition-colors"
                      >
                        {isAllCurrentPageSelected ? (
                          <CheckSquare size={18} className="text-red-600" />
                        ) : (
                          <Square size={18} className="text-slate-400" />
                        )}
                      </button>
                    </th>
                    <th className="py-3.5 px-4">Paciente</th>
                    <th className="py-3.5 px-4">Código do Usuário</th>
                    <th className="py-3.5 px-4">Hospital / Prestador</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedPatients.map((p) => {
                    const isSelected = selectedIds.has(p.id);
                    const name = p.nome || p.name || "Paciente sem nome";
                    const initials = name
                      .split(" ")
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((n: string) => n[0])
                      .join("")
                      .toUpperCase();

                    return (
                      <tr
                        key={p.id}
                        onClick={() => toggleSelectPatient(p.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected 
                            ? "bg-red-50/60 hover:bg-red-50" 
                            : "hover:bg-slate-50/80"
                        }`}
                      >
                        {/* Checkbox column */}
                        <td className="py-3.5 px-4 text-center" onClick={(e) => toggleSelectPatient(p.id, e)}>
                          <button
                            type="button"
                            className="p-1 rounded-md hover:bg-slate-200 transition-colors"
                          >
                            {isSelected ? (
                              <CheckSquare size={18} className="text-red-600" />
                            ) : (
                              <Square size={18} className="text-slate-300" />
                            )}
                          </button>
                        </td>

                        {/* Name and avatar */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0 border border-slate-200">
                              {initials || "PA"}
                            </div>
                            <div className="min-w-0">
                              <span className="font-bold text-slate-900 text-sm block truncate">
                                {name}
                              </span>
                              {(p.cpf || p.documento) && (
                                <span className="text-[11px] text-slate-400 block">
                                  Doc: {p.cpf || p.documento}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* User Code */}
                        <td className="py-3.5 px-4 text-xs font-semibold text-slate-600">
                          {p.codigoUsuario ? (
                            <span className="font-mono bg-slate-100 px-2 py-1 rounded-md text-[11px]">
                              {p.codigoUsuario}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Não informado</span>
                          )}
                        </td>

                        {/* Hospital */}
                        <td className="py-3.5 px-4 text-xs font-semibold text-slate-700">
                          {p.hospitalName || p.hospitalId || (
                            <span className="text-slate-400 italic">Sem Hospital</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4">
                          <span className="inline-block text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                            {p.status || "Sem Status"}
                          </span>
                        </td>

                        {/* Action: direct select/unselect or delete */}
                        <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => toggleSelectPatient(p.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                              isSelected 
                                ? "bg-red-600 text-white border-red-600 hover:bg-red-700" 
                                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                            }`}
                          >
                            {isSelected ? "Selecionado" : "Selecionar"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Footer */}
          {filteredPatients.length > 0 && (
            <div className="bg-slate-50/90 border-t border-slate-200 px-4 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="text-slate-600 font-semibold">
                Mostrando <strong>{(validCurrentPage - 1) * pageSize + 1}</strong> a{" "}
                <strong>{Math.min(validCurrentPage * pageSize, filteredPatients.length)}</strong> de{" "}
                <strong>{filteredPatients.length}</strong> pacientes
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={validCurrentPage <= 1}
                  className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 font-bold hover:bg-slate-100 transition-all disabled:opacity-40 disabled:hover:bg-white"
                >
                  <ChevronLeft size={16} />
                  <span>Anterior</span>
                </button>

                <span className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-bold text-slate-800">
                  {validCurrentPage} / {totalPages}
                </span>

                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={validCurrentPage >= totalPages}
                  className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 font-bold hover:bg-slate-100 transition-all disabled:opacity-40 disabled:hover:bg-white"
                >
                  <span>Próximo</span>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
