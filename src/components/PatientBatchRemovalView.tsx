import React, { useState, useEffect } from "react";
import { ArrowLeft, Users, Trash2, Search, CheckSquare, Square, AlertCircle, Loader2 } from "lucide-react";
import { useGroup } from "../contexts/GroupContext";

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

  const fetchPatients = async () => {
    if (!activeGroup) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/app/patients?full=true");
      if (!res.ok) throw new Error("Erro ao carregar pacientes.");
      const data = await res.json();
      if (Array.isArray(data)) {
        setPatients(data);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao carregar pacientes.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPatients();
  }, [activeGroup?.id]);

  const filteredPatients = patients.filter(p => {
    const term = searchTerm.toLowerCase();
    const name = (p.nome || p.name || "").toLowerCase();
    const code = (p.codigoUsuario || "").toLowerCase();
    const hospital = (p.hospitalName || "").toLowerCase();
    const status = (p.status || "").toLowerCase();
    return name.includes(term) || code.includes(term) || hospital.includes(term) || status.includes(term);
  });

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredPatients.length) {
      setSelectedIds(new Set());
    } else {
      const allIds = new Set(filteredPatients.map(p => p.id));
      setSelectedIds(allIds);
    }
  };

  const toggleSelectPatient = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleBatchRemove = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Tem certeza que deseja remover os ${selectedIds.size} pacientes selecionados? Esta ação não pode ser desfeita facilmente.`)) {
      return;
    }

    setIsDeleting(true);
    setError(null);
    try {
      const res = await apiFetch("/api/app/patients/batch-remove", {
        method: "POST",
        body: JSON.stringify({ patientIds: Array.from(selectedIds) })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Erro HTTP ${res.status}`);
      }

      alert(`${selectedIds.size} pacientes removidos com sucesso!`);
      setSelectedIds(new Set());
      await fetchPatients();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao remover pacientes.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white p-6 sm:p-8 max-w-5xl mx-auto w-full overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-slate-100">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack} 
            className="p-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all text-slate-600 active:scale-95 shrink-0"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-red-50 text-red-600 rounded-2xl shadow-2xs">
              <Users size={26} />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-black text-slate-900 uppercase tracking-tight">Gerenciar e Remover Pacientes</h3>
              <p className="text-xs text-slate-500 font-medium">Selecione múltiplos pacientes para remoção rápida em lote</p>
            </div>
          </div>
        </div>

        {selectedIds.size > 0 && (
          <button
            onClick={handleBatchRemove}
            disabled={isDeleting}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-red-600 text-white rounded-2xl font-black text-xs uppercase tracking-wider hover:bg-red-700 transition-all shadow-xl shadow-red-100 active:scale-95 disabled:opacity-50"
          >
            {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            <span>Remover Selecionados ({selectedIds.size})</span>
          </button>
        )}
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-700">
          <AlertCircle size={20} className="shrink-0" />
          <span className="text-xs font-bold">{error}</span>
        </div>
      )}

      {/* Search & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, código, hospital ou status..."
            className="w-full bg-slate-50 border border-slate-200 pl-11 pr-4 py-3 rounded-2xl text-sm font-semibold outline-none focus:ring-4 focus:ring-red-100 transition-all"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-2 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold transition-all active:scale-95"
          >
            {selectedIds.size > 0 && selectedIds.size === filteredPatients.length ? (
              <CheckSquare size={16} className="text-blue-600" />
            ) : (
              <Square size={16} className="text-slate-500" />
            )}
            <span>{selectedIds.size === filteredPatients.length ? "Desmarcar Todos" : "Selecionar Todos"}</span>
          </button>
          <span className="text-xs font-bold text-slate-500 px-2">
            {filteredPatients.length} {filteredPatients.length === 1 ? "paciente" : "pacientes"}
          </span>
        </div>
      </div>

      {/* Patient List */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 size={32} className="animate-spin text-red-600" />
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Carregando pacientes...</span>
        </div>
      ) : filteredPatients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-slate-50 rounded-3xl border border-dashed border-slate-200 text-center p-6">
          <Users size={40} className="text-slate-300 mb-3" />
          <h4 className="text-sm font-bold text-slate-700">Nenhum paciente encontrado</h4>
          <p className="text-xs text-slate-400 mt-1">Tente ajustar sua busca ou importe novos pacientes.</p>
        </div>
      ) : (
        <div className="space-y-2.5 pb-12">
          {filteredPatients.map((p) => {
            const isSelected = selectedIds.has(p.id);
            const initials = (p.nome || p.name || "PA").split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase();
            return (
              <div
                key={p.id}
                onClick={() => toggleSelectPatient(p.id)}
                className={`flex items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer select-none ${
                  isSelected 
                    ? "bg-red-50/60 border-red-200 shadow-2xs" 
                    : "bg-white border-slate-100 hover:border-slate-200 shadow-2xs"
                }`}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="text-red-600 shrink-0">
                    {isSelected ? <CheckSquare size={20} className="text-red-600" /> : <Square size={20} className="text-slate-300" />}
                  </div>
                  <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0 border border-slate-200/80">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-slate-900 truncate">{p.nome || p.name}</h4>
                    <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mt-0.5 truncate">
                      <span className="font-semibold text-slate-700 uppercase tracking-tight">{p.hospitalName || "Sem Hospital"}</span>
                      <span>•</span>
                      <span>{p.codigoUsuario || "Sem Código"}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[11px] bg-slate-100 text-slate-600 px-3 py-1 rounded-full font-bold">
                    {p.status || "Sem Status"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
