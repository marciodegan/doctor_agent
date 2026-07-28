import React, { useState, useEffect } from "react";
import { 
  Plus, Search, Check, X, ClipboardList, HelpCircle, Package, ArrowUpRight, 
  ArrowDownLeft, RefreshCw, AlertTriangle, Scale, History, UserCheck, Eye, Printer 
} from "lucide-react";
import { useGroup } from "../../contexts/GroupContext";

interface SeparationListProps {
  userRole: string;
}

export function SeparationList({ userRole }: SeparationListProps) {
  const { apiFetch } = useGroup();
  const [plans, setPlans] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<any | null>(null);

  // Separation Checklist status
  const [separatedCheck, setSeparatedCheck] = useState<Record<string, boolean>>({});
  const [manualBatch, setManualBatch] = useState<Record<string, string>>({});

  const fetchPlansAndBatches = async () => {
    try {
      setIsLoading(true);
      const [pRes, bRes] = await Promise.all([
        apiFetch("/api/app/medication-plans"),
        apiFetch("/api/app/inventory-batches")
      ]);

      if (pRes.ok && bRes.ok) {
        const pData = await pRes.ok ? await pRes.json() : [];
        const bData = await bRes.ok ? await bRes.json() : [];
        
        // Filter plans that are confirmed (ready for separation) or already separated (can be closed/completed)
        setPlans(pData.filter((p: any) => p.status === "confirmed" || p.status === "separated"));
        setBatches(bData);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPlansAndBatches();
  }, []);

  const handleOpenSeparation = (plan: any) => {
    setSelectedPlan(plan);
    
    // Initialize checks
    const initialChecks: Record<string, boolean> = {};
    const initialBatches: Record<string, string> = {};
    for (const item of plan.items) {
      initialChecks[item.medicationId] = plan.status === "separated" || !!item.quantitySeparated;
      initialBatches[item.medicationId] = item.batchNumber || "";
    }
    setSeparatedCheck(initialChecks);
    setManualBatch(initialBatches);
  };

  const handleConfirmSeparation = async () => {
    // Check if everything is checked off
    const allSeparated = selectedPlan.items.every((i: any) => separatedCheck[i.medicationId]);
    if (!allSeparated) {
      if (!window.confirm("Alguns medicamentos não foram marcados como separados. Confirmar separação parcial do kit cirúrgico?")) {
        return;
      }
    }

    const itemDetails = selectedPlan.items.map((item: any) => ({
      medicationId: item.medicationId,
      quantitySeparated: item.adjustedVolume,
      batchId: item.batchId || "",
      batchNumber: manualBatch[item.medicationId] || item.batchNumber || ""
    }));

    try {
      const res = await apiFetch("/api/app/medication-plans/separate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          surgeryId: selectedPlan.surgeryId,
          items: itemDetails
        })
      });

      if (res.ok) {
        alert("Kit cirúrgico registrado como SEPARADO fisicamente!");
        setSelectedPlan(null);
        fetchPlansAndBatches();
      } else {
        const err = await res.json();
        alert(err.error || "Erro ao registrar separação.");
      }
    } catch (e) {
      alert("Erro de rede.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/70 backdrop-blur-md p-6 rounded-3xl border border-gray-100 shadow-sm">
        <div>
          <h2 className="text-xl font-black text-gray-900 tracking-tight">Lista de Separação (Kit Cirúrgico)</h2>
          <p className="text-xs text-gray-500 font-medium mt-1">
            Geração automática de listas de retirada física de ampolas e separação de maletas.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 bg-white/40 rounded-3xl border border-gray-100">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : plans.length === 0 ? (
        <div className="text-center py-16 bg-white/40 rounded-3xl border border-gray-100 p-8">
          <ClipboardList className="mx-auto text-gray-400 mb-3" size={36} />
          <p className="text-sm font-black text-gray-800 uppercase tracking-wider">Nenhum kit pendente de separação</p>
          <p className="text-xs text-gray-500 mt-1">Aguarde o cálculo e confirmação de planejamentos de medicação pelos médicos.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* List of plans pending separation */}
          <div className="lg:col-span-1 space-y-3">
            <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 text-left mb-2">Pedidos de Kits Cirúrgicos</span>
            {plans.map((plan) => (
              <div
                key={plan.id}
                onClick={() => handleOpenSeparation(plan)}
                className={`p-4 rounded-3xl border text-left cursor-pointer transition-all ${
                  selectedPlan?.id === plan.id
                    ? "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-100"
                    : plan.status === "separated"
                    ? "bg-emerald-50/50 border-emerald-100 text-emerald-900"
                    : "bg-white border-gray-100 hover:border-gray-200"
                }`}
              >
                <div className="space-y-1">
                  <div className="flex justify-between items-start gap-2">
                    <span className={`inline-flex px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border ${
                      plan.status === "separated"
                        ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                        : "bg-slate-100 text-slate-700 border-slate-200"
                    }`}>
                      {plan.status === "separated" ? "Separado" : "Pendente"}
                    </span>
                    <span className="text-[9px] font-mono opacity-80">{plan.confirmedAt?.split("T")[0]}</span>
                  </div>
                  <h4 className={`font-black text-sm ${selectedPlan?.id === plan.id ? "text-white" : "text-gray-900"}`}>
                    {plan.patientName}
                  </h4>
                  <p className={`text-xs ${selectedPlan?.id === plan.id ? "text-blue-100" : "text-gray-500"} font-semibold`}>
                    {plan.protocolName} (v{plan.protocolVersion})
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Active Separation Checklist Detail Sheet */}
          <div className="lg:col-span-2">
            {selectedPlan ? (
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm text-left space-y-6">
                <div className="flex justify-between items-start gap-4 pb-4 border-b border-gray-50">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Guia de Separação de Medicamentos</span>
                    <h3 className="font-black text-gray-900 text-base leading-snug mt-1">
                      {selectedPlan.patientName}
                    </h3>
                    <p className="text-xs text-gray-500 font-semibold mt-0.5">Protocolo: {selectedPlan.protocolName}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="flex items-center gap-1 bg-slate-50 border border-gray-200 text-slate-600 text-[10px] font-black uppercase tracking-wider px-3.5 py-2 rounded-xl hover:bg-slate-100 transition-all"
                  >
                    <Printer size={14} /> Imprimir Guia
                  </button>
                </div>

                {/* Patient guidelines / warnings */}
                {selectedPlan.patientAllergies?.length > 0 && (
                  <div className="bg-red-50 p-4 rounded-2xl border border-red-100 text-xs text-red-800 flex gap-2">
                    <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-black block uppercase tracking-wider text-[10px]">Alergias Críticas Relatadas</strong>
                      <span>O paciente possui alergias a: {selectedPlan.patientAllergies.join(", ")}. Revise os itens do kit antes de dispensar!</span>
                    </div>
                  </div>
                )}

                {/* Medication Items separation checkboxes */}
                <div className="space-y-3.5">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400">Medicamentos para Retirada Física</span>
                  
                  {selectedPlan.items.map((item: any, idx: number) => {
                    const checked = separatedCheck[item.medicationId];
                    const qtyNeeded = Math.ceil(item.adjustedVolume);
                    
                    return (
                      <div
                        key={idx}
                        onClick={() => setSeparatedCheck({ ...separatedCheck, [item.medicationId]: !checked })}
                        className={`p-4 rounded-3xl border transition-all cursor-pointer flex items-center justify-between ${
                          checked
                            ? "bg-emerald-50/40 border-emerald-200"
                            : "bg-white border-gray-100 hover:border-gray-200"
                        }`}
                      >
                        <div className="flex items-start gap-3.5 flex-1">
                          {/* Custom Checkbox */}
                          <div className={`w-5 h-5 rounded-lg border-2 shrink-0 mt-0.5 flex items-center justify-center transition-all ${
                            checked ? "bg-emerald-600 border-emerald-600 text-white" : "border-gray-300"
                          }`}>
                            {checked && <Check size={12} strokeWidth={3} />}
                          </div>

                          <div className="space-y-1">
                            <span className="font-black text-gray-900 text-sm">{item.genericName}</span>
                            <div className="flex flex-wrap items-center gap-2 text-[10px] text-gray-500 font-semibold">
                              <span>Dosagem: {item.adjustedDose.toFixed(2)} {item.doseUnit}</span>
                              <span>•</span>
                              <span>Volume: {item.adjustedVolume} ml</span>
                            </div>
                            
                            {/* FEFO Lote allocation details */}
                            <div className="inline-flex items-center gap-1 text-[10px] bg-blue-50/50 border border-blue-100/50 text-blue-700 font-bold px-2.5 py-0.5 rounded-lg mt-1">
                              <Package size={10} /> Lote Sugerido (FEFO): {item.batchNumber || "Estoque Geral"}
                            </div>
                          </div>
                        </div>

                        {/* Quantity display */}
                        <div className="text-right">
                          <span className="block text-xs font-black text-gray-400 uppercase tracking-widest">Retirar</span>
                          <span className="font-mono text-xl font-black text-gray-900">{qtyNeeded}</span>
                          <span className="block text-[10px] text-gray-500 font-semibold">Ampolas</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Confirmation Footer */}
                {selectedPlan.status === "confirmed" && (
                  <div className="flex gap-3 pt-4 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => setSelectedPlan(null)}
                      className="flex-1 py-3 bg-slate-50 border border-gray-200 text-slate-500 font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-100 transition-all"
                    >
                      Voltar
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmSeparation}
                      className="flex-1 py-3 bg-blue-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
                    >
                      Confirmar Separação Física do Kit
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full flex flex-col justify-center items-center py-20 bg-white/40 rounded-3xl border border-gray-100 p-8 text-center">
                <ClipboardList className="text-gray-300 mb-3" size={40} />
                <p className="text-sm font-black text-gray-700 uppercase tracking-wider">Selecione um Planejamento Cirúrgico</p>
                <p className="text-xs text-gray-500 mt-1">Clique em uma cirurgia pendente na barra lateral para carregar a guia de separação física.</p>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
