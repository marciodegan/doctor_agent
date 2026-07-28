import React, { useState, useEffect } from "react";
import { 
  Plus, Search, Check, X, ClipboardList, HelpCircle, Package, ArrowUpRight, 
  ArrowDownLeft, RefreshCw, AlertTriangle, Scale, History, UserCheck 
} from "lucide-react";
import { useGroup } from "../../contexts/GroupContext";
import { Medication } from "../../types/medications";

interface InventoryManagementProps {
  userRole: string;
}

export function InventoryManagement({ userRole }: InventoryManagementProps) {
  const { apiFetch } = useGroup();
  const [batches, setBatches] = useState<any[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState("all");

  // Modal / Input forms
  const [isAddBatchOpen, setIsAddBatchOpen] = useState(false);
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<any | null>(null);

  const [newBatch, setNewBatch] = useState({
    medicationId: "",
    batchNumber: "",
    expiryDate: "",
    initialQuantity: "",
    locationId: "",
    supplier: ""
  });

  const [adjustment, setAdjustment] = useState({
    newQuantity: "",
    justification: ""
  });

  const fetchInventoryData = async () => {
    try {
      setIsLoading(true);
      const [bRes, mRes, lRes, movRes] = await Promise.all([
        apiFetch("/api/app/inventory-batches"),
        apiFetch("/api/app/medications"),
        apiFetch("/api/app/inventory-locations"),
        apiFetch("/api/app/audit-logs") // use audit logs or stock movements if we can fetch them
      ]);

      if (bRes.ok && mRes.ok && lRes.ok) {
        const bData = await bRes.json();
        const mData = await mRes.json();
        const lData = await lRes.json();
        setBatches(bData);
        setMedications(mData.filter((m: any) => m.status === "active"));
        setLocations(lData);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInventoryData();
  }, []);

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBatch.medicationId || !newBatch.batchNumber || !newBatch.expiryDate || !newBatch.initialQuantity) {
      alert("Por favor, preencha todos os campos obrigatórios.");
      return;
    }

    const loc = locations.find(l => l.id === newBatch.locationId);
    const body = {
      ...newBatch,
      locationName: loc ? loc.name : "Almoxarifado"
    };

    try {
      const res = await apiFetch("/api/app/inventory-batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        setIsAddBatchOpen(false);
        fetchInventoryData();
        setNewBatch({
          medicationId: "",
          batchNumber: "",
          expiryDate: "",
          initialQuantity: "",
          locationId: "",
          supplier: ""
        });
      } else {
        const err = await res.json();
        alert(err.error || "Erro ao adicionar lote.");
      }
    } catch (e) {
      alert("Erro ao salvar lote de medicamento.");
    }
  };

  const handleOpenAdjust = (batch: any) => {
    setSelectedBatch(batch);
    setAdjustment({
      newQuantity: batch.quantityAvailable.toString(),
      justification: ""
    });
    setIsAdjustOpen(true);
  };

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustment.justification.trim()) {
      alert("A justificativa é obrigatória para qualquer ajuste manual de inventário físico.");
      return;
    }

    try {
      const res = await apiFetch("/api/app/inventory-batches/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId: selectedBatch.id,
          newQuantity: parseFloat(adjustment.newQuantity),
          justification: adjustment.justification
        })
      });

      if (res.ok) {
        setIsAdjustOpen(false);
        fetchInventoryData();
      } else {
        const err = await res.json();
        alert(err.error || "Erro ao ajustar inventário.");
      }
    } catch (e) {
      alert("Erro ao enviar ajuste.");
    }
  };

  const filteredBatches = batches.filter(b => {
    const med = medications.find(m => m.id === b.medicationId);
    const medName = med ? med.genericName.toLowerCase() : "";
    const matchesSearch = b.batchNumber.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          medName.includes(searchQuery.toLowerCase());
    
    const matchesLocation = locationFilter === "all" || b.locationId === locationFilter;

    return matchesSearch && matchesLocation;
  });

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/70 backdrop-blur-md p-6 rounded-3xl border border-gray-100 shadow-sm">
        <div>
          <h2 className="text-xl font-black text-gray-900 tracking-tight">Estoque e Lotes Cirúrgicos</h2>
          <p className="text-xs text-gray-500 font-medium mt-1">
            Controle lotes, datas de vencimento, e realize auditorias de inventário físico.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsAddBatchOpen(true)}
            className="flex items-center justify-center gap-2 bg-blue-600 text-white font-black text-[11px] uppercase tracking-wider px-5 py-3 rounded-2xl shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95"
          >
            <Plus size={16} />
            Dar Entrada em Lote
          </button>
        </div>
      </div>

      {/* Grid Filter & Search */}
      <div className="bg-white/50 backdrop-blur-sm p-4 rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-3 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Buscar por lote ou medicamento..."
            className="w-full pl-11 pr-4 py-2.5 rounded-2xl bg-white border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-gray-800 placeholder-gray-400"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="px-4 py-2.5 rounded-2xl bg-white border border-gray-200 text-xs font-semibold text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
          >
            <option value="all">Todas as Localizações</option>
            {locations.map(loc => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid Batches list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 bg-white/40 rounded-3xl border border-gray-100">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : filteredBatches.length === 0 ? (
        <div className="text-center py-16 bg-white/40 rounded-3xl border border-gray-100 p-8">
          <Package className="mx-auto text-gray-400 mb-3" size={36} />
          <p className="text-sm font-black text-gray-800 uppercase tracking-wider">Nenhum lote em estoque</p>
          <p className="text-xs text-gray-500 mt-1">Dê entrada em um novo lote para disponibilizar medicamentos para cirurgias.</p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Medicamento</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Lote</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Vencimento</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Localização</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Disponível</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Reservado</th>
                  <th className="px-6 py-4 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredBatches.map((b) => {
                  const isExpiring = new Date(b.expiryDate) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
                  const isExpired = new Date(b.expiryDate) < new Date();
                  return (
                    <tr key={b.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="font-black text-gray-900 text-sm">{b.genericName}</span>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs font-bold text-gray-600">
                        {b.batchNumber}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 text-xs font-bold ${
                          isExpired ? "text-red-600 font-black" : isExpiring ? "text-amber-600" : "text-gray-700"
                        }`}>
                          {b.expiryDate}
                          {isExpired && <span className="text-[8px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-black uppercase">Vencido</span>}
                          {!isExpired && isExpiring && <span className="text-[8px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-black uppercase">Alerta</span>}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-500 font-semibold">
                        {b.locationName}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="font-mono text-sm font-black text-gray-900">{b.quantityAvailable}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="font-mono text-sm font-bold text-slate-400">{b.quantityReserved}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => handleOpenAdjust(b)}
                            className="flex items-center gap-1 bg-slate-50 border border-gray-200 text-slate-600 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-xl hover:bg-slate-100 transition-all"
                            title="Ajuste Físico"
                          >
                            <Scale size={13} />
                            Ajustar
                          </button>
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

      {/* Add Batch Modal */}
      {isAddBatchOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg border border-gray-100 shadow-2xl overflow-hidden">
            <div className="bg-slate-50 border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="font-black text-gray-900 text-base uppercase tracking-wider">Entrada de Medicamento</h3>
                <p className="text-xs text-gray-500">Registre a entrada de novo lote com vencimento e lote.</p>
              </div>
              <button onClick={() => setIsAddBatchOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateBatch} className="p-6 space-y-4 text-left">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Medicamento *</label>
                <select
                  required
                  className="w-full px-4 py-2.5 rounded-2xl bg-gray-50 border border-gray-200 text-sm text-gray-800 focus:outline-none focus:bg-white"
                  value={newBatch.medicationId}
                  onChange={(e) => setNewBatch({ ...newBatch, medicationId: e.target.value })}
                >
                  <option value="">Selecione do catálogo...</option>
                  {medications.map(m => (
                    <option key={m.id} value={m.id}>{m.genericName}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Número do Lote *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: LOT-2024A"
                    className="w-full px-4 py-2.5 rounded-2xl bg-gray-50 border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none"
                    value={newBatch.batchNumber}
                    onChange={(e) => setNewBatch({ ...newBatch, batchNumber: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Data de Validade *</label>
                  <input
                    type="date"
                    required
                    className="w-full px-4 py-2.5 rounded-2xl bg-gray-50 border border-gray-200 text-sm text-gray-800 focus:outline-none"
                    value={newBatch.expiryDate}
                    onChange={(e) => setNewBatch({ ...newBatch, expiryDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Qtd Inicial (ampolas/unid) *</label>
                  <input
                    type="number"
                    required
                    placeholder="Ex: 100"
                    className="w-full px-4 py-2.5 rounded-2xl bg-gray-50 border border-gray-200 text-sm text-gray-800 focus:outline-none"
                    value={newBatch.initialQuantity}
                    onChange={(e) => setNewBatch({ ...newBatch, initialQuantity: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Local de Armazenamento</label>
                  <select
                    className="w-full px-4 py-2.5 rounded-2xl bg-gray-50 border border-gray-200 text-sm text-gray-800 focus:outline-none"
                    value={newBatch.locationId}
                    onChange={(e) => setNewBatch({ ...newBatch, locationId: e.target.value })}
                  >
                    <option value="">Selecione...</option>
                    {locations.map(loc => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsAddBatchOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-500 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-black uppercase tracking-widest hover:bg-blue-700"
                >
                  Confirmar Entrada
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Adjust Inventory Modal */}
      {isAdjustOpen && selectedBatch && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md border border-gray-100 shadow-2xl overflow-hidden">
            <div className="bg-slate-50 border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="font-black text-gray-900 text-base uppercase tracking-wider flex items-center gap-1">
                  <Scale size={18} /> Ajuste Físico (Inventário)
                </h3>
                <p className="text-xs text-gray-500">Ajustar saldo do lote: <strong>{selectedBatch.batchNumber}</strong></p>
              </div>
              <button onClick={() => setIsAdjustOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAdjustStock} className="p-6 space-y-4 text-left">
              <div className="bg-amber-50 p-3 rounded-2xl border border-amber-100 text-[10px] text-amber-800 font-bold flex gap-2">
                <AlertTriangle size={16} className="shrink-0" />
                <span>Rastreabilidade: Toda correção manual de estoque exige justificativa e gera um registro de auditoria.</span>
              </div>

              <div className="text-xs text-gray-600 font-medium">
                <strong>Medicamento:</strong> {selectedBatch.genericName}
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Novo Saldo Físico Disponível *</label>
                <input
                  type="number"
                  required
                  className="w-full px-4 py-2.5 rounded-2xl bg-gray-50 border border-gray-200 text-sm font-mono font-bold text-gray-800"
                  value={adjustment.newQuantity}
                  onChange={(e) => setAdjustment({ ...adjustment, newQuantity: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Justificativa da Divergência / Perda *</label>
                <textarea
                  required
                  placeholder="Ex: Quebra acidental de ampola durante transporte, divergência em inventário físico, avaria..."
                  className="w-full px-4 py-2.5 rounded-2xl bg-gray-50 border border-gray-200 text-xs text-gray-800 h-20 resize-none placeholder-gray-400 focus:outline-none focus:bg-white"
                  value={adjustment.justification}
                  onChange={(e) => setAdjustment({ ...adjustment, justification: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsAdjustOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-500 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-black uppercase tracking-widest hover:bg-blue-700"
                >
                  Confirmar Ajuste
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
