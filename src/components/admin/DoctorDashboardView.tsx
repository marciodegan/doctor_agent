import React, { useState, useEffect } from "react";
import { useGroup } from "../../contexts/GroupContext";
import { Stethoscope, Users, FileText, AlertTriangle, Loader2 } from "lucide-react";

interface DoctorDashboardViewProps {
  closingId: string | null;
}

export function DoctorDashboardView({ closingId }: DoctorDashboardViewProps) {
  const { activeGroup, apiFetch } = useGroup();
  const [details, setDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!closingId || !activeGroup) return;
    const fetchDetails = async () => {
      try {
        setLoading(true);
        const res = await apiFetch(`/api/app/financial/closings/${closingId}/details`);
        if (res.ok) {
          const data = await res.json();
          setDetails(data);
        }
      } catch (e) {
        console.error("Failed to load doctor details:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
  }, [closingId, activeGroup]);

  if (!closingId) {
    return (
      <div className="bg-white rounded-[32px] p-12 text-center border border-gray-200">
        <p className="text-sm text-gray-500 font-bold">Selecione um fechamento na aba <b>Fechamentos</b> para visualizar a produção por médico.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-blue-600" size={36} />
      </div>
    );
  }

  const doctorsSummary = details?.doctorsSummary || [];

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto pb-12">
      <div className="bg-white p-6 rounded-[28px] border border-gray-200 shadow-xs flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight">Dashboard por Médico</h2>
          <p className="text-xs text-gray-500">Honorários, glosas e produção líquida individual</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {doctorsSummary.map((doc: any) => (
          <div key={doc.doctorId} className="bg-white border border-gray-200/80 p-6 rounded-[32px] shadow-xl space-y-6">
            <div className="flex items-center justify-between">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-black shadow-md shadow-blue-500/10">
                <Stethoscope size={22} />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-700 px-3 py-1 rounded-xl">
                {doc.procedureCount} Procedimentos
              </span>
            </div>

            <div>
              <h4 className="font-black text-gray-900 text-lg uppercase tracking-tight">{doc.doctorName}</h4>
              <p className="text-xs text-gray-400 font-bold mt-0.5">{doc.protocolCount} Protocolos Vinculados</p>
            </div>

            <div className="space-y-3 pt-4 border-t border-gray-100 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500 font-medium">Honorários Brutos:</span>
                <span className="font-black text-gray-900">R$ {doc.productionTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 font-medium">Glosas Aplicadas:</span>
                <span className="font-black text-rose-600">-R$ {doc.glosaTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between pt-3 border-t border-gray-100 font-black text-sm text-blue-600">
                <span>Produção Líquida:</span>
                <span>R$ {doc.netProduction.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
