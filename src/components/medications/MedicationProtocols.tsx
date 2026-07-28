import React, { useState, useEffect } from "react";
import { Plus, Search, Trash2, Edit3, Check, X, Shield, RefreshCw, Layers, Eye, Users } from "lucide-react";
import { useGroup } from "../../contexts/GroupContext";
import { Protocol, Medication, ProtocolMedication } from "../../types/medications";

interface MedicationProtocolsProps {
  userRole: string;
}

export function MedicationProtocols({ userRole }: MedicationProtocolsProps) {
  const { apiFetch } = useGroup();
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Modal / Form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedProtocol, setSelectedProtocol] = useState<Protocol | null>(null);
  const [editingProtocol, setEditingProtocol] = useState<Protocol | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    procedureType: "",
    specialty: "Anestesiologia",
    minAge: "",
    maxAge: "",
    minWeight: "",
    maxWeight: "",
    applicationConditions: "",
    exclusionCriteria: "",
    status: "draft" as any
  });

  const [selectedMeds, setSelectedMeds] = useState<ProtocolMedication[]>([]);

  // Item form inside dynamically added medications
  const [medForm, setMedForm] = useState({
    medicationId: "",
    formulaType: "dose_per_weight" as any,
    formulaValue: "",
    minDose: "",
    maxDose: "",
    roundingRule: "nearest" as any,
    resultUnit: "mg",
    frequency: "Dose Única",
    duration: "Imediato",
    internalGuidelines: "",
    mandatoryWarnings: ""
  });

  const specialties = ["Anestesiologia", "Cardiologia", "Ortopedia", "Pediatria", "Obstetrícia", "Geral", "Outra"];

  // Permission Checks
  const isResponsavelClinico = ["responsavel_clinico", "admin", "owner", "administrador"].includes(userRole.toLowerCase());

  const fetchProtocolsAndMeds = async () => {
    try {
      setIsLoading(true);
      const [pRes, mRes] = await Promise.all([
        apiFetch("/api/app/protocols"),
        apiFetch("/api/app/medications")
      ]);

      if (pRes.ok && mRes.ok) {
        const pData = await pRes.json();
        const mData = await mRes.json();
        setProtocols(pData);
        setMedications(mData.filter((m: any) => m.status === "active"));
      } else {
        throw new Error("Erro ao carregar dados do servidor.");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProtocolsAndMeds();
  }, []);

  const handleOpenAddModal = () => {
    setEditingProtocol(null);
    setFormData({
      name: "",
      description: "",
      procedureType: "",
      specialty: "Anestesiologia",
      minAge: "",
      maxAge: "",
      minWeight: "",
      maxWeight: "",
      applicationConditions: "",
      exclusionCriteria: "",
      status: "draft"
    });
    setSelectedMeds([]);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (protocol: Protocol) => {
    setEditingProtocol(protocol);
    setFormData({
      name: protocol.name,
      description: protocol.description,
      procedureType: protocol.procedureType,
      specialty: protocol.specialty,
      minAge: protocol.minAge?.toString() || "",
      maxAge: protocol.maxAge?.toString() || "",
      minWeight: protocol.minWeight?.toString() || "",
      maxWeight: protocol.maxWeight?.toString() || "",
      applicationConditions: protocol.applicationConditions,
      exclusionCriteria: protocol.exclusionCriteria,
      status: protocol.status
    });
    setSelectedMeds(protocol.medications || []);
    setIsModalOpen(true);
  };

  const handleAddMedToProtocol = () => {
    if (!medForm.medicationId) {
      alert("Selecione um medicamento do catálogo.");
      return;
    }
    const val = parseFloat(medForm.formulaValue);
    if (isNaN(val) || val <= 0) {
      alert("Informe um valor de fórmula válido.");
      return;
    }

    const matchedMed = medications.find(m => m.id === medForm.medicationId);
    if (!matchedMed) return;

    // Check if already exists
    if (selectedMeds.some(m => m.medicationId === medForm.medicationId)) {
      alert("Este medicamento já foi adicionado ao protocolo.");
      return;
    }

    const newItem: ProtocolMedication = {
      medicationId: medForm.medicationId,
      genericName: matchedMed.genericName,
      formulaType: medForm.formulaType,
      formulaValue: val,
      minDose: medForm.minDose ? parseFloat(medForm.minDose) : undefined,
      maxDose: medForm.maxDose ? parseFloat(medForm.maxDose) : undefined,
      roundingRule: medForm.roundingRule,
      resultUnit: medForm.resultUnit,
      frequency: medForm.frequency,
      duration: medForm.duration,
      internalGuidelines: medForm.internalGuidelines,
      mandatoryWarnings: medForm.mandatoryWarnings
    };

    setSelectedMeds([...selectedMeds, newItem]);
    setMedForm({
      medicationId: "",
      formulaType: "dose_per_weight",
      formulaValue: "",
      minDose: "",
      maxDose: "",
      roundingRule: "nearest",
      resultUnit: "mg",
      frequency: "Dose Única",
      duration: "Imediato",
      internalGuidelines: "",
      mandatoryWarnings: ""
    });
  };

  const handleRemoveMedFromProtocol = (medId: string) => {
    setSelectedMeds(selectedMeds.filter(m => m.medicationId !== medId));
  };

  const handleSelectMedFromDropdown = (medId: string) => {
    const med = medications.find(m => m.id === medId);
    if (med) {
      setMedForm({
        ...medForm,
        medicationId: medId,
        resultUnit: med.concentrationUnit || "mg",
        roundingRule: med.roundingRule || "nearest"
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.status === "published" && !isResponsavelClinico) {
      alert("Somente Responsáveis Clínicos podem publicar e liberar protocolos clínicos de medicação.");
      return;
    }

    if (selectedMeds.length === 0) {
      alert("Adicione pelo menos um medicamento ao protocolo.");
      return;
    }

    const body = {
      ...formData,
      medications: selectedMeds
    };

    try {
      const url = editingProtocol ? `/api/app/protocols/${editingProtocol.id}` : "/api/app/protocols";
      const method = editingProtocol ? "PUT" : "POST";

      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        setIsModalOpen(false);
        fetchProtocolsAndMeds();
      } else {
        const data = await res.json();
        alert(data.error || "Erro ao salvar protocolo.");
      }
    } catch (err: any) {
      alert(err.message || "Erro de conexão ao salvar.");
    }
  };

  const handleOpenViewModal = (protocol: Protocol) => {
    setSelectedProtocol(protocol);
    setIsViewModalOpen(true);
  };

  const filteredProtocols = protocols.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          p.specialty.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || p.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/70 backdrop-blur-md p-6 rounded-3xl border border-gray-100 shadow-sm">
        <div>
          <h2 className="text-xl font-black text-gray-900 tracking-tight">Protocolos de Medicação</h2>
          <p className="text-xs text-gray-500 font-medium mt-1">
            Cadastre, revise e publique protocolos clínicos que definem as fórmulas e regras de dosagem.
          </p>
        </div>
        {isResponsavelClinico && (
          <button
            onClick={handleOpenAddModal}
            className="flex items-center justify-center gap-2 bg-blue-600 text-white font-black text-[11px] uppercase tracking-wider px-5 py-3 rounded-2xl shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95 self-start md:self-center"
          >
            <Plus size={16} />
            Novo Protocolo
          </button>
        )}
      </div>

      {/* Filter and Search Panel */}
      <div className="bg-white/50 backdrop-blur-sm p-4 rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-3 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Buscar por nome, descrição, especialidade..."
            className="w-full pl-11 pr-4 py-2.5 rounded-2xl bg-white border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-gray-800 placeholder-gray-400"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="px-4 py-2.5 rounded-2xl bg-white border border-gray-200 text-xs font-semibold text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Todos os Status</option>
            <option value="draft">Rascunho</option>
            <option value="under_review">Em Revisão</option>
            <option value="approved">Aprovado</option>
            <option value="published">Publicado / Vigente</option>
            <option value="inactive">Inativo</option>
          </select>
        </div>
      </div>

      {/* List Panel */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 bg-white/40 rounded-3xl border border-gray-100">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : filteredProtocols.length === 0 ? (
        <div className="text-center py-16 bg-white/40 rounded-3xl border border-gray-100 p-8">
          <Layers className="mx-auto text-gray-400 mb-3" size={36} />
          <p className="text-sm font-black text-gray-800 uppercase tracking-wider">Nenhum protocolo cadastrado</p>
          <p className="text-xs text-gray-500 mt-1">Crie ou libere novos protocolos de planejamento cirúrgico.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredProtocols.map(protocol => {
            const isPublished = protocol.status === "published";
            return (
              <div
                key={protocol.id}
                className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col hover:border-blue-100 transition-all group"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 px-2.5 py-1 rounded-full">
                    {protocol.specialty}
                  </span>
                  <span className={`inline-flex items-center px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border ${
                    protocol.status === "published"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                      : protocol.status === "draft"
                      ? "bg-slate-50 text-slate-500 border-slate-200"
                      : protocol.status === "approved"
                      ? "bg-blue-50 text-blue-700 border-blue-100"
                      : "bg-yellow-50 text-yellow-700 border-yellow-100"
                  }`}>
                    {protocol.status === "published" ? "Vigente" : protocol.status === "draft" ? "Rascunho" : protocol.status === "approved" ? "Aprovado" : "Em Revisão"}
                  </span>
                </div>

                <h3 className="font-black text-gray-900 text-base leading-snug group-hover:text-blue-600 transition-colors">
                  {protocol.name}
                </h3>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2 min-h-[2rem]">
                  {protocol.description || "Sem descrição cadastrada."}
                </p>

                <div className="grid grid-cols-3 gap-2 border-y border-gray-50 py-3 my-4">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Medicamentos</span>
                    <span className="text-sm font-bold text-gray-800">{protocol.medications?.length || 0}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Versão</span>
                    <span className="text-sm font-bold text-gray-800">v{protocol.version || 1}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Vigência</span>
                    <span className="text-xs font-bold text-gray-800 truncate">{protocol.effectiveDate}</span>
                  </div>
                </div>

                <div className="flex gap-2 mt-auto pt-2">
                  <button
                    onClick={() => handleOpenViewModal(protocol)}
                    className="flex-1 flex items-center justify-center gap-1 bg-slate-50 hover:bg-slate-100 border border-slate-200/50 text-slate-600 font-bold text-[10px] uppercase tracking-wider py-2.5 rounded-xl transition-all"
                  >
                    <Eye size={14} />
                    Visualizar
                  </button>
                  {isResponsavelClinico && (
                    <button
                      onClick={() => handleOpenEditModal(protocol)}
                      className="flex-1 flex items-center justify-center gap-1 bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold text-[10px] uppercase tracking-wider py-2.5 rounded-xl transition-all border border-blue-100"
                    >
                      <Edit3 size={14} />
                      Editar / Versionar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* View Modal */}
      {isViewModalOpen && selectedProtocol && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl border border-gray-100 shadow-2xl overflow-hidden">
            <div className="bg-slate-50 border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <div>
                <span className="text-[9px] font-black uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                  {selectedProtocol.specialty}
                </span>
                <h3 className="font-black text-gray-900 text-base uppercase tracking-wider mt-1">
                  {selectedProtocol.name} (v{selectedProtocol.version})
                </h3>
              </div>
              <button
                onClick={() => setIsViewModalOpen(false)}
                className="text-gray-400 hover:text-gray-700 p-1 rounded-xl hover:bg-gray-100 transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto text-left">
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-gray-100 text-xs">
                <div>
                  <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest">Faixa Etária Permitida</span>
                  <span className="font-bold text-gray-800">
                    {selectedProtocol.minAge || 0} a {selectedProtocol.maxAge || "99+"} anos
                  </span>
                </div>
                <div>
                  <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest">Faixa de Peso Permitida</span>
                  <span className="font-bold text-gray-800">
                    {selectedProtocol.minWeight || 0} a {selectedProtocol.maxWeight || "300+"} kg
                  </span>
                </div>
                {selectedProtocol.applicationConditions && (
                  <div className="col-span-2 mt-2">
                    <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest">Indicação Clínicas</span>
                    <span className="font-semibold text-gray-700">{selectedProtocol.applicationConditions}</span>
                  </div>
                )}
                {selectedProtocol.exclusionCriteria && (
                  <div className="col-span-2 mt-2">
                    <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest">Critérios de Exclusão</span>
                    <span className="font-semibold text-red-600">{selectedProtocol.exclusionCriteria}</span>
                  </div>
                )}
              </div>

              <div>
                <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                  Medicamentos incluídos ({selectedProtocol.medications?.length || 0})
                </span>
                <div className="space-y-3">
                  {selectedProtocol.medications?.map((m, idx) => (
                    <div key={idx} className="border border-gray-100 p-3.5 rounded-2xl bg-white shadow-sm space-y-1 text-xs">
                      <div className="flex justify-between font-black text-gray-900 text-sm">
                        <span>{m.genericName}</span>
                        <span className="text-blue-600 font-mono">
                          {m.formulaValue} {m.formulaType === "fixed" ? m.resultUnit : `${m.resultUnit}/kg`}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-500 py-1.5 border-t border-b border-gray-50/50 my-1">
                        <div>
                          <strong>Fórmula:</strong> {m.formulaType === "fixed" ? "Dose Fixa" : m.formulaType === "dose_per_weight" ? "Dose/Peso" : "BSA/Superfície"}
                        </div>
                        <div>
                          <strong>Arredondamento:</strong> {m.roundingRule}
                        </div>
                        <div>
                          <strong>Frequência:</strong> {m.frequency}
                        </div>
                        <div>
                          <strong>Duração:</strong> {m.duration}
                        </div>
                      </div>
                      {m.mandatoryWarnings && (
                        <div className="bg-red-50 p-2.5 rounded-xl text-[10px] text-red-700 font-bold border border-red-100 mt-2">
                          {m.mandatoryWarnings}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-3xl border border-gray-100 shadow-2xl overflow-hidden my-8">
            <div className="bg-slate-50 border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="font-black text-gray-900 text-base uppercase tracking-wider">
                  {editingProtocol ? "Editar Protocolo" : "Cadastrar Protocolo Clínico"}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">Preencha as regras que definem o planejamento de medicação.</p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-700 p-1 rounded-xl hover:bg-gray-100 transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto text-left">
              {/* Row 1 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                    Nome do Protocolo *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Protocolo Anestésico Infantil"
                    className="w-full px-4 py-2.5 rounded-2xl bg-gray-50 border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                      Especialidade *
                    </label>
                    <select
                      className="w-full px-4 py-2.5 rounded-2xl bg-gray-50 border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                      value={formData.specialty}
                      onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                    >
                      {specialties.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                      Procedimento / Tipo *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Geral, Cardíaca"
                      className="w-full px-4 py-2.5 rounded-2xl bg-gray-50 border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                      value={formData.procedureType}
                      onChange={(e) => setFormData({ ...formData, procedureType: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                  Descrição Clínicas e Objetivos
                </label>
                <textarea
                  placeholder="Descreva as indicações principais e conduta do protocolo..."
                  className="w-full px-4 py-2.5 rounded-2xl bg-gray-50 border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white h-16 resize-none"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              {/* Age and Weight targets */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-2xl border border-gray-100">
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Idade Mín (Anos)</label>
                  <input
                    type="number"
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-xl bg-white border border-gray-200 text-xs text-gray-800 focus:outline-none"
                    value={formData.minAge}
                    onChange={(e) => setFormData({ ...formData, minAge: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Idade Máx (Anos)</label>
                  <input
                    type="number"
                    placeholder="12"
                    className="w-full px-3 py-2 rounded-xl bg-white border border-gray-200 text-xs text-gray-800 focus:outline-none"
                    value={formData.maxAge}
                    onChange={(e) => setFormData({ ...formData, maxAge: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Peso Mín (kg)</label>
                  <input
                    type="number"
                    placeholder="3"
                    className="w-full px-3 py-2 rounded-xl bg-white border border-gray-200 text-xs text-gray-800 focus:outline-none"
                    value={formData.minWeight}
                    onChange={(e) => setFormData({ ...formData, minWeight: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Peso Máx (kg)</label>
                  <input
                    type="number"
                    placeholder="50"
                    className="w-full px-3 py-2 rounded-xl bg-white border border-gray-200 text-xs text-gray-800 focus:outline-none"
                    value={formData.maxWeight}
                    onChange={(e) => setFormData({ ...formData, maxWeight: e.target.value })}
                  />
                </div>
              </div>

              {/* Add Medication Row builder */}
              <div className="border border-dashed border-gray-200 p-4 rounded-2xl space-y-3 bg-blue-50/10">
                <span className="block text-[10px] font-black text-blue-600 uppercase tracking-widest">
                  Adicionar Medicamentos e Fórmulas de Cálculo
                </span>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Medicamento</label>
                    <select
                      className="w-full px-3 py-2 rounded-xl bg-white border border-gray-200 text-xs text-gray-800"
                      value={medForm.medicationId}
                      onChange={(e) => handleSelectMedFromDropdown(e.target.value)}
                    >
                      <option value="">Selecione...</option>
                      {medications.map(m => (
                        <option key={m.id} value={m.id}>{m.genericName}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Tipo de Fórmula</label>
                    <select
                      className="w-full px-3 py-2 rounded-xl bg-white border border-gray-200 text-xs text-gray-800"
                      value={medForm.formulaType}
                      onChange={(e) => setMedForm({ ...medForm, formulaType: e.target.value as any })}
                    >
                      <option value="dose_per_weight">Dose por Peso (mg/kg, mcg/kg)</option>
                      <option value="fixed">Dose Fixa (mg, mcg)</option>
                      <option value="dose_per_bsa">Superfície Corporal (Dose/BSA)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Valor da Fórmula *</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="Ex: 2 (mg/kg), 50 (mg)"
                      className="w-full px-3 py-2 rounded-xl bg-white border border-gray-200 text-xs text-gray-800"
                      value={medForm.formulaValue}
                      onChange={(e) => setMedForm({ ...medForm, formulaValue: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Dose Mínima de Segurança</label>
                    <input
                      type="number"
                      placeholder="Ex: 0.5"
                      className="w-full px-3 py-2 rounded-xl bg-white border border-gray-200 text-xs text-gray-800"
                      value={medForm.minDose}
                      onChange={(e) => setMedForm({ ...medForm, minDose: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Dose Máxima de Segurança</label>
                    <input
                      type="number"
                      placeholder="Ex: 10"
                      className="w-full px-3 py-2 rounded-xl bg-white border border-gray-200 text-xs text-gray-800"
                      value={medForm.maxDose}
                      onChange={(e) => setMedForm({ ...medForm, maxDose: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Unidade do Resultado</label>
                    <select
                      className="w-full px-3 py-2 rounded-xl bg-white border border-gray-200 text-xs text-gray-800"
                      value={medForm.resultUnit}
                      onChange={(e) => setMedForm({ ...medForm, resultUnit: e.target.value })}
                    >
                      <option value="mg">mg (Miligrama)</option>
                      <option value="mcg">mcg (Micrograma)</option>
                      <option value="g">g (Grama)</option>
                      <option value="UI">UI (Unidades)</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={handleAddMedToProtocol}
                      className="w-full bg-blue-100 hover:bg-blue-200 text-blue-700 font-bold text-xs uppercase tracking-wider py-2.5 rounded-xl transition-all border border-blue-200"
                    >
                      Adicionar Item
                    </button>
                  </div>
                </div>

                {/* Internal Warnings for med */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                  <input
                    type="text"
                    placeholder="Diretrizes internas de administração (EV lento, diluído...)"
                    className="px-3 py-2 rounded-xl bg-white border border-gray-200 text-xs text-gray-800"
                    value={medForm.internalGuidelines}
                    onChange={(e) => setMedForm({ ...medForm, internalGuidelines: e.target.value })}
                  />
                  <input
                    type="text"
                    placeholder="Alertas e avisos obrigatórios (Risco de choque anafilático...)"
                    className="px-3 py-2 rounded-xl bg-white border border-gray-200 text-xs text-gray-800 text-red-600 placeholder-red-300"
                    value={medForm.mandatoryWarnings}
                    onChange={(e) => setMedForm({ ...medForm, mandatoryWarnings: e.target.value })}
                  />
                </div>
              </div>

              {/* Added Medications list */}
              <div>
                <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                  Medicamentos Ativos no Protocolo ({selectedMeds.length})
                </span>
                {selectedMeds.length === 0 ? (
                  <p className="text-xs text-gray-400 italic bg-gray-50 p-4 rounded-xl text-center">Nenhum medicamento adicionado ainda.</p>
                ) : (
                  <div className="border border-gray-100 rounded-2xl overflow-hidden divide-y divide-gray-50 text-xs bg-white shadow-sm">
                    {selectedMeds.map((item, idx) => (
                      <div key={idx} className="p-3 flex items-center justify-between hover:bg-gray-50/50">
                        <div>
                          <span className="font-bold text-gray-900">{item.genericName}</span>
                          <span className="text-slate-500 font-mono text-[10px] ml-2">
                            ({item.formulaValue} {item.formulaType === "fixed" ? item.resultUnit : `${item.resultUnit}/kg`})
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveMedFromProtocol(item.medicationId)}
                          className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Protocol Status selector */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-gray-100">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                    Vigência e Liberação Clínicas
                  </label>
                  <select
                    className="w-full px-4 py-2.5 rounded-2xl bg-white border border-gray-200 text-sm text-gray-800 focus:outline-none"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  >
                    <option value="draft">Rascunho (Salvar para revisar depois)</option>
                    <option value="under_review">Em Revisão (Pronto para auditoria)</option>
                    {isResponsavelClinico && (
                      <>
                        <option value="approved">Aprovado (Validado clinicamente)</option>
                        <option value="published">Publicado / Vigente (Habilitar para uso cirúrgico)</option>
                      </>
                    )}
                    <option value="inactive">Inativo (Não disponível)</option>
                  </select>
                </div>
                <div className="flex items-center text-xs text-gray-500 font-medium">
                  {!isResponsavelClinico && (
                    <div className="flex gap-2 bg-amber-50 text-amber-800 p-3 rounded-xl border border-amber-100">
                      <Shield size={18} className="shrink-0" />
                      <span>Nota: Seu perfil atual não possui permissão para publicar protocolos. Apenas Administradores e Responsáveis Clínicos podem liberar e vigenciar novos protocolos.</span>
                    </div>
                  )}
                </div>
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
                  Salvar Protocolo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
