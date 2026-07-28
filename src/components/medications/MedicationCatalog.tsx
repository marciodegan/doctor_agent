import React, { useState, useEffect } from "react";
import { Plus, Search, Filter, Edit3, Check, X, ShieldAlert, AlertTriangle } from "lucide-react";
import { useGroup } from "../../contexts/GroupContext";
import { Medication } from "../../types/medications";

interface MedicationCatalogProps {
  userRole: string;
}

export function MedicationCatalog({ userRole }: MedicationCatalogProps) {
  const { apiFetch } = useGroup();
  const [medications, setMedications] = useState<Medication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [vigilanceFilter, setVigilanceFilter] = useState("all");

  // Modal / Form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMed, setEditingMed] = useState<Medication | null>(null);
  const [formData, setFormData] = useState({
    genericName: "",
    commercialName: "",
    category: "Anestésico",
    activeIngredient: "",
    concentration: "",
    concentrationUnit: "mg",
    dosageForm: "Injetável",
    presentation: "Ampola 2ml",
    volumePerUnit: "2",
    stockUnit: "Ampola",
    routeOfAdministration: "EV",
    manufacturer: "",
    highVigilance: false,
    controlled: false,
    requiresDoubleCheck: false,
    allowsFractioning: false,
    roundingRule: "exact",
    minStock: "10",
    reorderPoint: "15",
    idealStock: "50",
    storageCondition: "Temperatura Ambiente (15-30°C)",
    observations: "",
    status: "active"
  });

  const categories = ["Anestésico", "Analgésico", "Bloqueador Neuromuscular", "Antibiótico", "Sedativo", "Cardiotônico", "Vasopressor", "Outros"];

  // Check write permission
  const canWrite = ["admin", "owner", "responsavel_estoque", "administrador", "responsavel_clinico"].includes(userRole.toLowerCase());

  const fetchMedications = async () => {
    try {
      setIsLoading(true);
      const res = await apiFetch("/api/app/medications");
      if (res.ok) {
        const data = await res.json();
        setMedications(data);
      } else {
        throw new Error("Erro ao carregar catálogo de medicamentos.");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMedications();
  }, []);

  const handleOpenAddModal = () => {
    setEditingMed(null);
    setFormData({
      genericName: "",
      commercialName: "",
      category: "Anestésico",
      activeIngredient: "",
      concentration: "",
      concentrationUnit: "mg",
      dosageForm: "Injetável",
      presentation: "Ampola 2ml",
      volumePerUnit: "2",
      stockUnit: "Ampola",
      routeOfAdministration: "EV",
      manufacturer: "",
      highVigilance: false,
      controlled: false,
      requiresDoubleCheck: false,
      allowsFractioning: false,
      roundingRule: "exact",
      minStock: "10",
      reorderPoint: "15",
      idealStock: "50",
      storageCondition: "Temperatura Ambiente (15-30°C)",
      observations: "",
      status: "active"
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (med: Medication) => {
    setEditingMed(med);
    setFormData({
      genericName: med.genericName,
      commercialName: med.commercialName,
      category: med.category,
      activeIngredient: med.activeIngredient,
      concentration: med.concentration.toString(),
      concentrationUnit: med.concentrationUnit,
      dosageForm: med.dosageForm,
      presentation: med.presentation,
      volumePerUnit: med.volumePerUnit.toString(),
      stockUnit: med.stockUnit,
      routeOfAdministration: med.routeOfAdministration,
      manufacturer: med.manufacturer,
      highVigilance: med.highVigilance,
      controlled: med.controlled,
      requiresDoubleCheck: med.requiresDoubleCheck,
      allowsFractioning: med.allowsFractioning,
      roundingRule: med.roundingRule,
      minStock: med.minStock.toString(),
      reorderPoint: med.reorderPoint.toString(),
      idealStock: med.idealStock.toString(),
      storageCondition: med.storageCondition,
      observations: med.observations,
      status: med.status
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite) {
      alert("Seu perfil de acesso não possui permissão para cadastrar ou editar medicamentos.");
      return;
    }

    if (!formData.genericName.trim()) {
      alert("Nome genérico é obrigatório.");
      return;
    }

    try {
      const url = editingMed ? `/api/app/medications/${editingMed.id}` : "/api/app/medications";
      const method = editingMed ? "PUT" : "POST";
      
      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        setIsModalOpen(false);
        fetchMedications();
      } else {
        const data = await res.json();
        alert(data.error || "Erro ao salvar medicamento.");
      }
    } catch (err: any) {
      alert(err.message || "Erro de conexão ao salvar.");
    }
  };

  // Toggle active/inactive instead of hard delete
  const handleToggleStatus = async (med: Medication) => {
    if (!canWrite) {
      alert("Seu perfil não possui permissão para alterar medicamentos.");
      return;
    }
    const nextStatus = med.status === "active" ? "inactive" : "active";
    if (!window.confirm(`Deseja realmente alterar o status de ${med.genericName} para ${nextStatus === "active" ? "Ativo" : "Inativo"}?`)) {
      return;
    }

    try {
      const res = await apiFetch(`/api/app/medications/${med.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus })
      });
      if (res.ok) {
        fetchMedications();
      } else {
        alert("Erro ao alterar o status do medicamento.");
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const filteredMeds = medications.filter(med => {
    const matchesSearch = med.genericName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          med.commercialName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          med.activeIngredient.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = categoryFilter === "all" || med.category === categoryFilter;
    
    const matchesVigilance = vigilanceFilter === "all" || 
                             (vigilanceFilter === "high" && med.highVigilance) || 
                             (vigilanceFilter === "controlled" && med.controlled) ||
                             (vigilanceFilter === "normal" && !med.highVigilance && !med.controlled);

    return matchesSearch && matchesCategory && matchesVigilance;
  });

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/70 backdrop-blur-md p-6 rounded-3xl border border-gray-100 shadow-sm">
        <div>
          <h2 className="text-xl font-black text-gray-900 tracking-tight">Catálogo de Medicamentos</h2>
          <p className="text-xs text-gray-500 font-medium mt-1">
            Cadastre os medicamentos utilizados pela equipe de anestesia e cirurgia.
          </p>
        </div>
        {canWrite && (
          <button
            onClick={handleOpenAddModal}
            className="flex items-center justify-center gap-2 bg-blue-600 text-white font-black text-[11px] uppercase tracking-wider px-5 py-3 rounded-2xl shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95 self-start md:self-center"
          >
            <Plus size={16} />
            Novo Medicamento
          </button>
        )}
      </div>

      {/* Filter and Search Panel */}
      <div className="bg-white/50 backdrop-blur-sm p-4 rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-3 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Buscar por nome genérico, comercial, princípio ativo..."
            className="w-full pl-11 pr-4 py-2.5 rounded-2xl bg-white border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-gray-800 placeholder-gray-400"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="px-4 py-2.5 rounded-2xl bg-white border border-gray-200 text-xs font-semibold text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">Todas Categorias</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select
            className="px-4 py-2.5 rounded-2xl bg-white border border-gray-200 text-xs font-semibold text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            value={vigilanceFilter}
            onChange={(e) => setVigilanceFilter(e.target.value)}
          >
            <option value="all">Todos Níveis de Alerta</option>
            <option value="high">Alta Vigilância</option>
            <option value="controlled">Controlados</option>
            <option value="normal">Sem Alerta</option>
          </select>
        </div>
      </div>

      {/* Grid or Table List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 bg-white/40 rounded-3xl border border-gray-100">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : filteredMeds.length === 0 ? (
        <div className="text-center py-16 bg-white/40 rounded-3xl border border-gray-100 p-8">
          <AlertTriangle className="mx-auto text-gray-400 mb-3" size={36} />
          <p className="text-sm font-black text-gray-800 uppercase tracking-wider">Nenhum medicamento encontrado</p>
          <p className="text-xs text-gray-500 mt-1">Tente ajustar seus filtros de busca ou adicione um novo item.</p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Medicamento</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Categoria</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Concentração</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Apresentação</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Alertas</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                  <th className="px-6 py-4 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredMeds.map((med) => (
                  <tr key={med.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-black text-gray-900 text-sm">{med.genericName}</span>
                        {med.commercialName && (
                          <span className="text-xs text-gray-500 font-semibold italic">"{med.commercialName}"</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-50 text-blue-700">
                        {med.category}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-mono text-xs font-bold text-gray-700">
                        {med.concentration} {med.concentrationUnit}/ml
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-600 font-medium">
                      {med.presentation} ({med.volumePerUnit}ml)
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {med.highVigilance && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-50 text-red-700 text-[9px] font-bold border border-red-100">
                            <ShieldAlert size={10} />
                            Alta Vigilância
                          </span>
                        )}
                        {med.controlled && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-700 text-[9px] font-bold border border-amber-100">
                            Portaria 344
                          </span>
                        )}
                        {med.requiresDoubleCheck && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-purple-50 text-purple-700 text-[9px] font-bold border border-purple-100">
                            Dupla Checagem
                          </span>
                        )}
                        {!med.highVigilance && !med.controlled && !med.requiresDoubleCheck && (
                          <span className="text-gray-400 text-xs font-semibold">-</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleToggleStatus(med)}
                        disabled={!canWrite}
                        className={`inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${
                          med.status === "active"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                            : "bg-gray-100 text-gray-500 border-gray-200"
                        } disabled:opacity-75 transition-all`}
                      >
                        {med.status === "active" ? "Ativo" : "Inativo"}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-1">
                        {canWrite && (
                          <button
                            onClick={() => handleOpenEditModal(med)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            title="Editar medicamento"
                          >
                            <Edit3 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-2xl border border-gray-100 shadow-2xl overflow-hidden my-8">
            <div className="bg-slate-50 border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="font-black text-gray-900 text-base uppercase tracking-wider">
                  {editingMed ? "Editar Medicamento" : "Cadastrar Medicamento"}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">Preencha os dados do medicamento clínico.</p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-700 p-1 rounded-xl hover:bg-gray-100 transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Row 1 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                    Nome Genérico / Princípio Ativo *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Propofol, Fentanila"
                    className="w-full px-4 py-2.5 rounded-2xl bg-gray-50 border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                    value={formData.genericName}
                    onChange={(e) => setFormData({ ...formData, genericName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                    Nome Comercial (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Diprivan, Sublimaze"
                    className="w-full px-4 py-2.5 rounded-2xl bg-gray-50 border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                    value={formData.commercialName}
                    onChange={(e) => setFormData({ ...formData, commercialName: e.target.value })}
                  />
                </div>
              </div>

              {/* Row 2 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                    Categoria *
                  </label>
                  <select
                    className="w-full px-4 py-2.5 rounded-2xl bg-gray-50 border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  >
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                    Concentração (quantidade/ml) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="Ex: 10, 50"
                    className="w-full px-4 py-2.5 rounded-2xl bg-gray-50 border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                    value={formData.concentration}
                    onChange={(e) => setFormData({ ...formData, concentration: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                    Unidade da Concentração *
                  </label>
                  <select
                    className="w-full px-4 py-2.5 rounded-2xl bg-gray-50 border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                    value={formData.concentrationUnit}
                    onChange={(e) => setFormData({ ...formData, concentrationUnit: e.target.value })}
                  >
                    <option value="mg">mg (Miligrama)</option>
                    <option value="mcg">mcg (Micrograma)</option>
                    <option value="g">g (Grama)</option>
                    <option value="UI">UI (Unidade Internacional)</option>
                  </select>
                </div>
              </div>

              {/* Row 3 */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                    Forma Farmacêutica
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Injetável, Solução"
                    className="w-full px-4 py-2.5 rounded-2xl bg-gray-50 border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                    value={formData.dosageForm}
                    onChange={(e) => setFormData({ ...formData, dosageForm: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                    Apresentação
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Ampola 2ml, Frasco 10ml"
                    className="w-full px-4 py-2.5 rounded-2xl bg-gray-50 border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                    value={formData.presentation}
                    onChange={(e) => setFormData({ ...formData, presentation: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                    Volume por Unid. (ml)
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="Ex: 2, 10, 50"
                    className="w-full px-4 py-2.5 rounded-2xl bg-gray-50 border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                    value={formData.volumePerUnit}
                    onChange={(e) => setFormData({ ...formData, volumePerUnit: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                    Unid. de Estoque
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Ampola, Frasco"
                    className="w-full px-4 py-2.5 rounded-2xl bg-gray-50 border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                    value={formData.stockUnit}
                    onChange={(e) => setFormData({ ...formData, stockUnit: e.target.value })}
                  />
                </div>
              </div>

              {/* Safety & Alerts Toggles */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-gray-100 space-y-3">
                <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                  Segurança, Alertas e Controle Especial
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="flex items-center gap-3 bg-white p-3 rounded-xl border border-gray-200 cursor-pointer hover:bg-slate-50 transition-colors select-none">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded text-red-600 focus:ring-red-500 border-gray-300"
                      checked={formData.highVigilance}
                      onChange={(e) => setFormData({ ...formData, highVigilance: e.target.checked })}
                    />
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-gray-900">Alta Vigilância (MAV)</span>
                      <span className="text-[9px] text-gray-500">Exige cuidado extremo na administração</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 bg-white p-3 rounded-xl border border-gray-200 cursor-pointer hover:bg-slate-50 transition-colors select-none">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-gray-300"
                      checked={formData.controlled}
                      onChange={(e) => setFormData({ ...formData, controlled: e.target.checked })}
                    />
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-gray-900">Controle Especial</span>
                      <span className="text-[9px] text-gray-500">Sujeito à Portaria 344/98 (Receita A/B)</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 bg-white p-3 rounded-xl border border-gray-200 cursor-pointer hover:bg-slate-50 transition-colors select-none">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-gray-300"
                      checked={formData.requiresDoubleCheck}
                      onChange={(e) => setFormData({ ...formData, requiresDoubleCheck: e.target.checked })}
                    />
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-gray-900">Dupla Conferência</span>
                      <span className="text-[9px] text-gray-500">Exige aprovação de outro profissional</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 bg-white p-3 rounded-xl border border-gray-200 cursor-pointer hover:bg-slate-50 transition-colors select-none">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300"
                      checked={formData.allowsFractioning}
                      onChange={(e) => setFormData({ ...formData, allowsFractioning: e.target.checked })}
                    />
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-gray-900">Permite Fracionamento</span>
                      <span className="text-[9px] text-gray-500">Pode fracionar ampolas/comprimidos</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Row 4 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                    Regra de Arredondamento do Volume
                  </label>
                  <select
                    className="w-full px-4 py-2.5 rounded-2xl bg-gray-50 border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                    value={formData.roundingRule}
                    onChange={(e) => setFormData({ ...formData, roundingRule: e.target.value as any })}
                  >
                    <option value="exact">Exato (sem arredondamento)</option>
                    <option value="ceil">Arredondar para Cima (Ceil)</option>
                    <option value="floor">Arredondar para Baixo (Floor)</option>
                    <option value="nearest">Arredondamento Mais Próximo (Round)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                    Condições de Armazenamento
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Temperatura Ambiente, Sob Refrigeração"
                    className="w-full px-4 py-2.5 rounded-2xl bg-gray-50 border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                    value={formData.storageCondition}
                    onChange={(e) => setFormData({ ...formData, storageCondition: e.target.value })}
                  />
                </div>
              </div>

              {/* Stock Targets */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-blue-50/30 p-4 rounded-2xl border border-blue-100/50">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                    Estoque Mínimo (Alerta)
                  </label>
                  <input
                    type="number"
                    placeholder="Ex: 10"
                    className="w-full px-4 py-2.5 rounded-2xl bg-white border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    value={formData.minStock}
                    onChange={(e) => setFormData({ ...formData, minStock: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                    Ponto de Reposição
                  </label>
                  <input
                    type="number"
                    placeholder="Ex: 15"
                    className="w-full px-4 py-2.5 rounded-2xl bg-white border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    value={formData.reorderPoint}
                    onChange={(e) => setFormData({ ...formData, reorderPoint: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                    Estoque Ideal (Máximo)
                  </label>
                  <input
                    type="number"
                    placeholder="Ex: 50"
                    className="w-full px-4 py-2.5 rounded-2xl bg-white border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    value={formData.idealStock}
                    onChange={(e) => setFormData({ ...formData, idealStock: e.target.value })}
                  />
                </div>
              </div>

              {/* Observations */}
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                  Observações Clínicas / Restrições
                </label>
                <textarea
                  placeholder="Instruções adicionais de uso..."
                  className="w-full px-4 py-2.5 rounded-2xl bg-gray-50 border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white h-20 resize-none"
                  value={formData.observations}
                  onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
                />
              </div>

              {/* Actions Footer */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-500 hover:bg-gray-50 transition-all uppercase tracking-wider"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all active:scale-95 shadow-md shadow-blue-100"
                >
                  Salvar Medicamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
