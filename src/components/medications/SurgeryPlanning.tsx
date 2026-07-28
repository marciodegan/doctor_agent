import React, { useState, useEffect } from "react";
import { 
  Plus, Search, Check, X, Shield, RefreshCw, AlertTriangle, ChevronRight, 
  ChevronLeft, ClipboardList, HelpCircle, User, ShieldAlert, Key, Package, Info 
} from "lucide-react";
import { useGroup } from "../../contexts/GroupContext";
import { Protocol, Medication, CalculatedPlanItem } from "../../types/medications";

interface SurgeryPlanningProps {
  userRole: string;
}

export function SurgeryPlanning({ userRole }: SurgeryPlanningProps) {
  const { apiFetch } = useGroup();
  
  // Step state
  const [currentStep, setCurrentStep] = useState(1);
  const [surgeries, setSurgeries] = useState<any[]>([]);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Selected Entities
  const [selectedSurgery, setSelectedSurgery] = useState<any | null>(null);
  const [selectedProtocol, setSelectedProtocol] = useState<Protocol | null>(null);

  // Form Inputs / Clinical Parameters
  const [patientWeight, setPatientWeight] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [patientAllergies, setPatientAllergies] = useState<string[]>([]);
  const [newAllergy, setNewAllergy] = useState("");
  const [patientRestrictions, setPatientRestrictions] = useState("");

  // Calculation Results
  const [calculatedItems, setCalculatedItems] = useState<CalculatedPlanItem[]>([]);
  const [justifications, setJustifications] = useState<Record<string, string>>({});
  const [doubleCheckStatus, setDoubleCheckStatus] = useState<Record<string, { approved: boolean; witnessName: string }>>({});
  const [witnessEmail, setWitnessEmail] = useState<Record<string, string>>({});

  // Loaded Plans (In case of viewing existing)
  const [existingPlans, setExistingPlans] = useState<Record<string, any>>({});

  const fetchInitialData = async () => {
    try {
      setIsLoading(true);
      const [surgRes, protRes, batchRes, plansRes] = await Promise.all([
        apiFetch("/api/app/calendario"), // Fetch surgeries
        apiFetch("/api/app/protocols"),  // Fetch protocols
        apiFetch("/api/app/inventory-batches"), // Fetch batches for FEFO overview
        apiFetch("/api/app/medication-plans") // Fetch existing plans
      ]);

      if (surgRes.ok && protRes.ok && batchRes.ok && plansRes.ok) {
        const sData = await surgRes.json();
        const pData = await protRes.json();
        const bData = await batchRes.json();
        const plData = await plansRes.json();

        // Filter valid scheduled surgeries or those with medication planning
        setSurgeries(sData);
        // Only published/approved protocols can be used
        setProtocols(pData.filter((p: any) => p.status === "published" || p.status === "approved"));
        setBatches(bData);

        // Index existing plans
        const planIndex: Record<string, any> = {};
        for (const plan of plData) {
          planIndex[plan.surgeryId] = plan;
        }
        setExistingPlans(planIndex);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  const handleSelectSurgery = (surgery: any) => {
    setSelectedSurgery(surgery);
    
    // Guess values from patient fields
    setPatientWeight(surgery.patientWeight || "70");
    setPatientAge(surgery.patientAge || "45");
    setPatientAllergies(surgery.patientAllergies || []);
    setPatientRestrictions(surgery.patientRestrictions || "");

    // If there is already an existing plan, load it
    const ex = existingPlans[surgery.id];
    if (ex) {
      setPatientWeight(ex.patientWeight || "70");
      setPatientAge(ex.patientAge || "45");
      setPatientAllergies(ex.patientAllergies || []);
      setPatientRestrictions(ex.patientRestrictions || "");
      setSelectedProtocol(protocols.find(p => p.id === ex.protocolId) || null);
      setCalculatedItems(ex.items || []);
      setJustifications(ex.justifications || {});
      
      const checks: Record<string, any> = {};
      for (const item of ex.items) {
        if (item.doubleChecked) {
          checks[item.medicationId] = { approved: true, witnessName: "Confirmado em prontuário" };
        }
      }
      setDoubleCheckStatus(checks);
      setCurrentStep(4); // Advance to review/adjust
    } else {
      setSelectedProtocol(null);
      setCalculatedItems([]);
      setJustifications({});
      setDoubleCheckStatus({});
      setCurrentStep(2); // Go to protocol selection
    }
  };

  const handleSelectProtocol = (protocol: Protocol) => {
    setSelectedProtocol(protocol);
    setCurrentStep(3); // Go to calculation
  };

  const handleRunCalculation = async () => {
    if (!selectedProtocol) return;
    
    try {
      const res = await apiFetch("/api/app/medication-plans/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          protocolId: selectedProtocol.id,
          patientWeight,
          patientAge,
          patientAllergies,
          patientRestrictions
        })
      });

      if (res.ok) {
        const data = await res.json();
        setCalculatedItems(data.items);
        setCurrentStep(4); // Go to review and adjustments
      } else {
        const err = await res.json();
        alert(err.error || "Erro ao efetuar o cálculo.");
      }
    } catch (e: any) {
      alert("Erro ao conectar com o servidor.");
    }
  };

  // Adjust volume/dose manually
  const handleItemOverride = (medicationId: string, value: string) => {
    const val = parseFloat(value);
    if (isNaN(val)) return;

    setCalculatedItems(calculatedItems.map(item => {
      if (item.medicationId === medicationId) {
        // Redo warning checks against safety limits
        const warns = [...(item.warnings || [])];
        const protocolMed = selectedProtocol?.medications?.find(m => m.medicationId === medicationId);
        
        if (protocolMed) {
          const doseUnit = item.doseUnit;
          // Clean old warning list
          const cleanWarns = warns.filter(w => !w.includes("limite") && !w.includes("máxima") && !w.includes("mínima") && !w.includes("alterada"));
          
          if (protocolMed.minDose && val < protocolMed.minDose) {
            cleanWarns.push(`Dose ajustada (${val.toFixed(2)} ${doseUnit}) está abaixo da dose mínima recomendada (${protocolMed.minDose} ${doseUnit}).`);
          }
          if (protocolMed.maxDose && val > protocolMed.maxDose) {
            cleanWarns.push(`Dose ajustada (${val.toFixed(2)} ${doseUnit}) ultrapassa a dose máxima de segurança recomendada (${protocolMed.maxDose} ${doseUnit}).`);
          }
          if (val !== item.calculatedDose) {
            cleanWarns.push(`A dose foi alterada manualmente pelo profissional.`);
          }

          return {
            ...item,
            adjustedDose: val,
            adjustedVolume: val / (protocolMed.formulaValue || 1), // simplified representation
            isAdjusted: true,
            warnings: cleanWarns
          };
        }
      }
      return item;
    }));
  };

  const handleWitnessSignOff = async (medicationId: string) => {
    const email = witnessEmail[medicationId]?.trim();
    if (!email) {
      alert("Informe o e-mail do médico testemunha para dupla conferência.");
      return;
    }

    try {
      const res = await apiFetch("/api/app/medication-plans/double-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          surgeryId: selectedSurgery.id,
          medicationId,
          witnessEmail: email
        })
      });

      if (res.ok) {
        const data = await res.json();
        setDoubleCheckStatus({
          ...doubleCheckStatus,
          [medicationId]: { approved: true, witnessName: data.witnessName }
        });
        
        // Mark item doubleChecked as true in state
        setCalculatedItems(calculatedItems.map(item => {
          if (item.medicationId === medicationId) {
            return { ...item, doubleChecked: true };
          }
          return item;
        }));
      } else {
        const err = await res.json();
        alert(err.error || "Dupla conferência recusada.");
      }
    } catch (e) {
      alert("Erro ao realizar dupla conferência.");
    }
  };

  const handleConfirmAndReserve = async () => {
    // Validate high vigilance items have been checked
    for (const item of calculatedItems) {
      if (item.requiresDoubleCheck && !item.doubleChecked) {
        alert(`O item de alta vigilância ${item.genericName} exige assinatura de dupla conferência por outra testemunha.`);
        return;
      }
      if (item.isAdjusted && !justifications[item.medicationId]?.trim()) {
        alert(`Por favor, insira a justificativa clínica para o ajuste no medicamento ${item.genericName}.`);
        return;
      }
    }

    try {
      const res = await apiFetch("/api/app/medication-plans/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          surgeryId: selectedSurgery.id,
          patientName: selectedSurgery.patientName,
          protocolId: selectedProtocol?.id,
          protocolName: selectedProtocol?.name,
          protocolVersion: selectedProtocol?.version,
          patientWeight,
          patientAge,
          patientAllergies,
          patientRestrictions,
          items: calculatedItems,
          justifications
        })
      });

      if (res.ok) {
        alert("Planejamento confirmado com sucesso e reserva de lote FEFO realizada!");
        fetchInitialData();
        setCurrentStep(1);
        setSelectedSurgery(null);
      } else {
        const err = await res.json();
        alert(err.error || "Erro ao confirmar planejamento.");
      }
    } catch (e) {
      alert("Erro ao registrar confirmação.");
    }
  };

  const handleCancelPlan = async () => {
    if (!window.confirm("Deseja realmente cancelar este planejamento? A reserva de estoque correspondente será liberada.")) {
      return;
    }
    try {
      const res = await apiFetch("/api/app/medication-plans/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ surgeryId: selectedSurgery.id })
      });
      if (res.ok) {
        alert("Planejamento cancelado e estoque liberado.");
        fetchInitialData();
        setCurrentStep(1);
        setSelectedSurgery(null);
      } else {
        const err = await res.json();
        alert(err.error);
      }
    } catch (e) {
      alert("Erro de conexão.");
    }
  };

  const handleAddAllergy = () => {
    if (newAllergy.trim() && !patientAllergies.includes(newAllergy.trim())) {
      setPatientAllergies([...patientAllergies, newAllergy.trim()]);
      setNewAllergy("");
    }
  };

  return (
    <div className="space-y-6">
      {/* Tab/Step Progress Header */}
      <div className="bg-white/70 backdrop-blur-md p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-gray-900 tracking-tight">Planejamento e Cálculo Clínico</h2>
          <p className="text-xs text-gray-500 font-medium mt-1">
            Planeje, calcule e reserve os medicamentos cirúrgicos com rastreabilidade total.
          </p>
        </div>
        
        {/* Wizard Steps indicator */}
        {selectedSurgery && (
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-gray-400">
            <span className={currentStep === 1 ? "text-blue-600" : ""}>1. Paciente</span>
            <ChevronRight size={14} />
            <span className={currentStep === 2 ? "text-blue-600" : ""}>2. Protocolo</span>
            <ChevronRight size={14} />
            <span className={currentStep === 3 ? "text-blue-600" : ""}>3. Cálculo</span>
            <ChevronRight size={14} />
            <span className={currentStep === 4 ? "text-blue-600" : ""}>4. Revisão</span>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 bg-white/40 rounded-3xl border border-gray-100">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Wizard Area */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* STEP 1: SELECT SURGERY */}
            {currentStep === 1 && (
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
                <h3 className="font-black text-gray-900 text-base uppercase tracking-wider">
                  Etapa 1: Selecionar Procedimento Cirúrgico Agendado
                </h3>
                <p className="text-xs text-gray-500">Selecione uma cirurgia para iniciar o planejamento e separação de medicamentos.</p>
                
                {surgeries.length === 0 ? (
                  <div className="text-center py-10 bg-slate-50 rounded-2xl border border-gray-100 p-6">
                    <ClipboardList className="mx-auto text-gray-400 mb-2" size={28} />
                    <p className="text-xs font-bold text-gray-600 uppercase">Nenhuma cirurgia agendada encontrada</p>
                    <p className="text-[10px] text-gray-400 mt-1">Verifique sua agenda cirúrgica e agende cirurgias antes de planejar as medicações.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {surgeries.map((surg: any) => {
                      const hasPlan = existingPlans[surg.id];
                      return (
                        <div
                          key={surg.id}
                          onClick={() => handleSelectSurgery(surg)}
                          className={`p-4 rounded-2xl border transition-all cursor-pointer text-left flex items-center justify-between ${
                            hasPlan 
                              ? "bg-blue-50/20 border-blue-100 hover:bg-blue-50/40" 
                              : "bg-white border-gray-100 hover:border-gray-200"
                          }`}
                        >
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-100 text-[9px] font-black uppercase text-gray-600">
                              {surg.specialty}
                            </span>
                            <h4 className="font-black text-gray-900 text-sm">{surg.patientName}</h4>
                            <p className="text-xs text-gray-500 font-semibold">{surg.procedureName || surg.title}</p>
                            <p className="text-[10px] text-gray-400 font-mono">
                              {surg.date} às {surg.time} • Sala: {surg.room || "CC-01"}
                            </p>
                          </div>
                          
                          <div className="text-right">
                            <span className={`inline-flex px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider border ${
                              hasPlan 
                                ? "bg-emerald-50 text-emerald-700 border-emerald-100" 
                                : "bg-gray-50 text-gray-500 border-gray-100"
                            }`}>
                              {hasPlan ? "Planejado" : "Pendente"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* STEP 2: SELECT PROTOCOL */}
            {currentStep === 2 && selectedSurgery && (
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-black text-gray-900 text-base uppercase tracking-wider">
                    Etapa 2: Selecionar Protocolo de Medicação
                  </h3>
                  <button
                    onClick={() => setCurrentStep(1)}
                    className="flex items-center gap-1 text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline"
                  >
                    <ChevronLeft size={14} /> Voltar
                  </button>
                </div>
                <p className="text-xs text-gray-500">Selecione o protocolo clínico aprovado para carregar as fórmulas e medicamentos recomendados.</p>
                
                {/* Warnings about no active protocol */}
                {protocols.length === 0 ? (
                  <div className="bg-red-50 p-4 rounded-2xl border border-red-100 text-xs text-red-800 space-y-2">
                    <div className="flex gap-2 items-center font-bold">
                      <AlertTriangle size={18} />
                      <span>Não existe um protocolo aprovado para este cálculo.</span>
                    </div>
                    <p className="text-[10px] leading-relaxed">Cadastre ou selecione um protocolo antes de continuar. Apenas responsáveis clínicos podem autorizar e aprovar protocolos no Doctor Pro.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {protocols.map((protocol) => (
                      <div
                        key={protocol.id}
                        onClick={() => handleSelectProtocol(protocol)}
                        className="p-4 rounded-2xl border border-gray-100 bg-white hover:border-blue-200 hover:shadow-sm cursor-pointer text-left flex justify-between items-center"
                      >
                        <div className="space-y-0.5">
                          <h4 className="font-black text-gray-900 text-sm">{protocol.name}</h4>
                          <p className="text-xs text-gray-500 line-clamp-1">{protocol.description}</p>
                          <span className="inline-flex text-[9px] font-black text-blue-600 bg-blue-50 px-2 rounded">
                            {protocol.specialty} • {protocol.medications?.length || 0} Itens • v{protocol.version}
                          </span>
                        </div>
                        <ChevronRight className="text-gray-300" size={18} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* STEP 3: CONFIGURE PATIENT & CALCULATE */}
            {currentStep === 3 && selectedSurgery && selectedProtocol && (
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-black text-gray-900 text-base uppercase tracking-wider">
                    Etapa 3: Confirmar Parâmetros Clínicos
                  </h3>
                  <button
                    onClick={() => setCurrentStep(2)}
                    className="flex items-center gap-1 text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline"
                  >
                    <ChevronLeft size={14} /> Voltar
                  </button>
                </div>
                
                <div className="bg-slate-50 p-4 rounded-2xl border border-gray-100 text-xs text-slate-600">
                  <span className="font-bold text-gray-800">Protocolo Selecionado:</span> {selectedProtocol.name} (v{selectedProtocol.version})
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                      Peso do Paciente (kg) *
                    </label>
                    <input
                      type="number"
                      step="any"
                      required
                      placeholder="Ex: 70"
                      className="w-full px-4 py-2.5 rounded-2xl bg-gray-50 border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                      value={patientWeight}
                      onChange={(e) => setPatientWeight(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                      Idade do Paciente (Anos) *
                    </label>
                    <input
                      type="number"
                      required
                      placeholder="Ex: 45"
                      className="w-full px-4 py-2.5 rounded-2xl bg-gray-50 border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                      value={patientAge}
                      onChange={(e) => setPatientAge(e.target.value)}
                    />
                  </div>
                </div>

                {/* Allergies and Restrictions */}
                <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-gray-100">
                  <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    Alergias Alimentares ou Medicamentosas
                  </span>
                  
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Adicionar alergia (Ex: Dipirona, Propofol)"
                      className="flex-1 px-3 py-2 rounded-xl bg-white border border-gray-200 text-xs text-gray-800"
                      value={newAllergy}
                      onChange={(e) => setNewAllergy(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddAllergy())}
                    />
                    <button
                      type="button"
                      onClick={handleAddAllergy}
                      className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded-xl text-xs font-bold text-gray-700"
                    >
                      Adicionar
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {patientAllergies.length === 0 ? (
                      <span className="text-[11px] text-gray-400 font-medium">Nenhuma alergia relatada.</span>
                    ) : (
                      patientAllergies.map((allg, index) => (
                        <span key={index} className="inline-flex items-center gap-1 bg-red-50 text-red-700 text-[10px] font-bold px-2.5 py-1 rounded-full border border-red-100">
                          {allg}
                          <X size={10} className="cursor-pointer" onClick={() => setPatientAllergies(patientAllergies.filter(a => a !== allg))} />
                        </span>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                    Restrições de Volume ou Patologias (Opcional)
                  </label>
                  <textarea
                    placeholder="Ex: Insuficiência renal grave, restrição hídrica..."
                    className="w-full px-4 py-2.5 rounded-2xl bg-gray-50 border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white h-16 resize-none"
                    value={patientRestrictions}
                    onChange={(e) => setPatientRestrictions(e.target.value)}
                  />
                </div>

                <button
                  type="button"
                  onClick={handleRunCalculation}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-blue-100 active:scale-95"
                >
                  Calcular Doses e Volumes do Protocolo
                </button>
              </div>
            )}

            {/* STEP 4: REVIEW & CONFIRM */}
            {currentStep === 4 && selectedSurgery && calculatedItems.length > 0 && (
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-black text-gray-900 text-base uppercase tracking-wider">
                      Etapa 4: Revisar e Confirmar Planejamento
                    </h3>
                    <p className="text-xs text-gray-500">Ajuste doses se necessário, providencie dupla conferência e confirme a reserva.</p>
                  </div>
                  {!existingPlans[selectedSurgery.id] && (
                    <button
                      onClick={() => setCurrentStep(3)}
                      className="flex items-center gap-1 text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline"
                    >
                      <ChevronLeft size={14} /> Voltar
                    </button>
                  )}
                </div>

                <div className="space-y-4">
                  {calculatedItems.map((item, idx) => {
                    const isHigh = item.highVigilance;
                    const requiresDoubleCheck = item.requiresDoubleCheck;
                    const doubleCheckOk = doubleCheckStatus[item.medicationId]?.approved || item.doubleChecked;
                    const adjusted = item.adjustedDose !== item.calculatedDose;

                    return (
                      <div 
                        key={idx} 
                        className={`p-4 rounded-3xl border text-left space-y-3 transition-colors ${
                          isHigh ? "bg-red-50/10 border-red-100" : "bg-white border-gray-100"
                        }`}
                      >
                        <div className="flex justify-between items-start gap-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-black text-gray-900 text-sm">{item.genericName}</h4>
                              {isHigh && (
                                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-red-100 text-red-800 text-[8px] font-black uppercase tracking-wider">
                                  <ShieldAlert size={10} />
                                  Alta Vigilância
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-gray-500 font-semibold mt-0.5">
                              Concentração: {item.adjustedVolume} ml / Dose: {item.adjustedDose.toFixed(2)} {item.doseUnit}
                            </p>
                          </div>
                          
                          {/* Dose Override input */}
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Dose:</span>
                            <input
                              type="number"
                              step="any"
                              disabled={!!existingPlans[selectedSurgery.id]}
                              className="w-20 px-2 py-1 rounded bg-slate-50 border border-gray-200 text-xs text-right font-mono text-gray-800 font-bold"
                              value={item.adjustedDose}
                              onChange={(e) => handleItemOverride(item.medicationId, e.target.value)}
                            />
                            <span className="text-xs text-gray-500 font-semibold">{item.doseUnit}</span>
                          </div>
                        </div>

                        {/* Calculation warnings */}
                        {item.warnings && item.warnings.length > 0 && (
                          <div className="space-y-1 bg-amber-50 p-3 rounded-2xl border border-amber-100 text-[10px] text-amber-800 font-semibold">
                            {item.warnings.map((w, index) => (
                              <p key={index} className="flex gap-1.5 items-start">
                                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                                <span>{w}</span>
                              </p>
                            ))}
                          </div>
                        )}

                        {/* Justification required */}
                        {item.isAdjusted && (
                          <div className="space-y-1.5">
                            <label className="block text-[9px] font-black text-amber-800 uppercase tracking-wider">
                              Justificativa Clínica Obrigatória para o Ajuste de Dose *
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="Informe a indicação ou restrição que justifica a dosagem alterada..."
                              disabled={!!existingPlans[selectedSurgery.id]}
                              className="w-full px-3 py-2 rounded-xl bg-amber-50/50 border border-amber-200 text-xs text-amber-900 focus:outline-none"
                              value={justifications[item.medicationId] || ""}
                              onChange={(e) => setJustifications({ ...justifications, [item.medicationId]: e.target.value })}
                            />
                          </div>
                        )}

                        {/* Double check witness module */}
                        {requiresDoubleCheck && (
                          <div className={`p-3 rounded-2xl border text-xs space-y-2 ${
                            doubleCheckOk ? "bg-emerald-50 border-emerald-100 text-emerald-800" : "bg-purple-50/40 border-purple-100"
                          }`}>
                            <div className="flex justify-between items-center">
                              <span className="font-black text-[9px] uppercase tracking-wider flex items-center gap-1">
                                <Key size={12} />
                                Dupla Conferência Requerida
                              </span>
                              {doubleCheckOk && (
                                <span className="inline-flex gap-1 items-center text-[9px] font-black text-emerald-700">
                                  <Check size={12} /> Verificado
                                </span>
                              )}
                            </div>
                            
                            {doubleCheckOk ? (
                              <p className="text-[10px] text-emerald-600 font-medium">
                                Testemunhado por: <strong>{doubleCheckStatus[item.medicationId]?.witnessName || "Outro Profissional"}</strong>
                              </p>
                            ) : (
                              <div className="flex gap-2">
                                <input
                                  type="email"
                                  placeholder="E-mail da testemunha clínica (médico/enfermeiro)"
                                  className="flex-1 px-3 py-1.5 rounded-xl bg-white border border-gray-200 text-xs text-gray-800"
                                  value={witnessEmail[item.medicationId] || ""}
                                  onChange={(e) => setWitnessEmail({ ...witnessEmail, [item.medicationId]: e.target.value })}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleWitnessSignOff(item.medicationId)}
                                  className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-[10px] uppercase tracking-wider px-3.5 py-1.5 rounded-xl"
                                >
                                  Assinar
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Final Actions */}
                <div className="flex gap-3 pt-4 border-t border-gray-100">
                  {existingPlans[selectedSurgery.id] ? (
                    <button
                      type="button"
                      onClick={handleCancelPlan}
                      className="flex-1 py-3 bg-red-50 hover:bg-red-100 text-red-600 font-black text-xs uppercase tracking-widest rounded-2xl transition-all border border-red-100"
                    >
                      Cancelar Planejamento e Liberar Lotes
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => { setSelectedSurgery(null); setCurrentStep(1); }}
                        className="flex-1 py-3 bg-gray-50 hover:bg-gray-100 text-gray-500 font-black text-xs uppercase tracking-widest rounded-2xl transition-all border border-gray-200"
                      >
                        Descartar
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmAndReserve}
                        className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-blue-100"
                      >
                        Confirmar e Reservar Estoque
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar Panel: Surgical Information Summary & Stock Reservations FEFO recommendations */}
          <div className="space-y-6">
            
            {/* Surgery Details Card */}
            {selectedSurgery && (
              <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm text-left space-y-3.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Paciente do Planejamento</span>
                <div className="flex gap-3 items-center">
                  <div className="p-3 bg-slate-50 text-slate-500 rounded-2xl">
                    <User size={20} />
                  </div>
                  <div>
                    <h4 className="font-black text-gray-900 text-sm leading-tight">{selectedSurgery.patientName}</h4>
                    <p className="text-[10px] text-gray-400 mt-0.5">Idade: {patientAge || selectedSurgery.patientAge || "N/A"} anos • Peso: {patientWeight || selectedSurgery.patientWeight || "N/A"} kg</p>
                  </div>
                </div>

                <div className="space-y-2 border-t border-gray-50 pt-3 text-xs">
                  <p className="text-gray-600">
                    <strong>Procedimento:</strong> {selectedSurgery.procedureName || selectedSurgery.title}
                  </p>
                  <p className="text-gray-600 font-mono text-[10px]">
                    <strong>Cirurgião:</strong> {selectedSurgery.surgeonName || "N/A"}
                  </p>
                  {patientAllergies.length > 0 && (
                    <div className="bg-red-50/50 p-2.5 rounded-xl border border-red-100 text-[10px] text-red-700 font-bold">
                      Alergias: {patientAllergies.join(", ")}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* FEFO Stock Reservation Guide */}
            <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm text-left space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-1">
                  <Package size={14} /> Recomendações FEFO
                </span>
                <span className="text-[9px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">Expirando Primeiro</span>
              </div>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                O Doctor Pro aloca automaticamente as ampolas do lote com o vencimento mais próximo (FEFO - First Expire, First Out) ao confirmar.
              </p>

              {calculatedItems.length > 0 ? (
                <div className="space-y-2 divide-y divide-gray-50">
                  {calculatedItems.map((item, idx) => {
                    const matchBatches = batches
                      .filter(b => b.medicationId === item.medicationId && b.quantityAvailable > 0)
                      .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));

                    return (
                      <div key={idx} className="pt-2 text-[11px] space-y-1">
                        <div className="flex justify-between font-black text-gray-800">
                          <span>{item.genericName}</span>
                          <span className="text-blue-600 font-bold">Reserva: {Math.ceil(item.adjustedVolume)} amp</span>
                        </div>
                        {matchBatches.length > 0 ? (
                          <div className="bg-slate-50 p-2 rounded-xl border border-gray-100 text-[10px] text-gray-600 font-semibold flex justify-between items-center">
                            <span>Lote: {matchBatches[0].batchNumber}</span>
                            <span className="text-red-600 text-[9px] font-bold">Exp: {matchBatches[0].expiryDate} ({matchBatches[0].quantityAvailable} disp)</span>
                          </div>
                        ) : (
                          <div className="text-[10px] text-red-600 font-bold bg-red-50 p-1.5 rounded">
                            ALERTA: Sem estoque disponível para este item!
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-[10px] text-gray-400 italic py-4 text-center">
                  Inicie um cálculo para ver a alocação de lotes sugerida.
                </div>
              )}
            </div>

            {/* Protocol Conditions Guidelines */}
            {selectedProtocol && (
              <div className="bg-slate-50 p-5 rounded-3xl border border-gray-100 text-left space-y-2 text-xs">
                <span className="font-black text-[9px] uppercase tracking-wider text-gray-400 flex items-center gap-1">
                  <Info size={14} /> Diretrizes Clínicas do Protocolo
                </span>
                <p className="text-gray-700 leading-relaxed">
                  <strong>Indicações:</strong> {selectedProtocol.applicationConditions || "Nenhuma indicação cadastrada."}
                </p>
                {selectedProtocol.exclusionCriteria && (
                  <p className="text-red-700 font-bold">
                    <strong>Critérios de Exclusão:</strong> {selectedProtocol.exclusionCriteria}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
