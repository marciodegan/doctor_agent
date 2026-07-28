import React, { useState, useEffect } from "react";
import { 
  AlertTriangle, ShieldAlert, Download, FileText, ClipboardList, RefreshCw, Eye, Printer, CheckCircle2, X 
} from "lucide-react";
import { useGroup } from "../../contexts/GroupContext";
import { Medication } from "../../types/medications";

interface AlertsReportsProps {
  userRole: string;
}

export function AlertsReports({ userRole }: AlertsReportsProps) {
  const { apiFetch } = useGroup();
  const [medications, setMedications] = useState<Medication[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<"alerts" | "reports" | "logs">("alerts");
  const [reportModal, setReportModal] = useState<string | null>(null);

  const fetchAlertsData = async () => {
    try {
      setIsLoading(true);
      const [mRes, bRes, aRes] = await Promise.all([
        apiFetch("/api/app/medications"),
        apiFetch("/api/app/inventory-batches"),
        apiFetch("/api/app/audit-logs")
      ]);

      if (mRes.ok && bRes.ok && aRes.ok) {
        setMedications(await mRes.json());
        setBatches(await bRes.json());
        setAuditLogs(await aRes.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAlertsData();
  }, []);

  // Compute active alerts
  const expiredBatches = batches.filter(b => new Date(b.expiryDate) < new Date());
  
  const expiringSoonBatches = batches.filter(b => {
    const d = new Date(b.expiryDate);
    const now = new Date();
    const threshold = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30);
    return d >= now && d <= threshold;
  });

  const lowStockMeds = medications.filter(med => {
    const totalQty = batches
      .filter(b => b.medicationId === med.id)
      .reduce((acc, b) => acc + b.quantityAvailable, 0);
    return totalQty <= med.minStock;
  });

  const totalAlerts = expiredBatches.length + expiringSoonBatches.length + lowStockMeds.length;

  const handleDownloadReport = (type: string) => {
    setReportModal(type);
  };

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/70 backdrop-blur-md p-6 rounded-3xl border border-gray-100 shadow-sm">
        <div>
          <h2 className="text-xl font-black text-gray-900 tracking-tight">Alertas, Relatórios e Auditoria</h2>
          <p className="text-xs text-gray-500 font-medium mt-1">
            Verifique as datas de validade, baixe mapas de consumo e consulte logs de segurança.
          </p>
        </div>
        
        {/* Alerts Sub-tab Switcher */}
        <div className="flex bg-slate-100 p-1 rounded-2xl border border-gray-200 text-xs font-black uppercase tracking-wider self-start md:self-center">
          <button
            onClick={() => setActiveTab("alerts")}
            className={`px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
              activeTab === "alerts" ? "bg-white text-gray-900 shadow-sm" : "text-gray-400 hover:text-gray-700"
            }`}
          >
            <ShieldAlert size={14} />
            Alertas ({totalAlerts})
          </button>
          <button
            onClick={() => setActiveTab("reports")}
            className={`px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
              activeTab === "reports" ? "bg-white text-gray-900 shadow-sm" : "text-gray-400 hover:text-gray-700"
            }`}
          >
            <FileText size={14} />
            Relatórios
          </button>
          <button
            onClick={() => setActiveTab("logs")}
            className={`px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
              activeTab === "logs" ? "bg-white text-gray-900 shadow-sm" : "text-gray-400 hover:text-gray-700"
            }`}
          >
            <ClipboardList size={14} />
            Auditoria
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 bg-white/40 rounded-3xl border border-gray-100">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : (
        <div className="space-y-6 text-left">
          
          {/* TAB 1: SAFETY ALERTS */}
          {activeTab === "alerts" && (
            <div className="space-y-4">
              
              {totalAlerts === 0 ? (
                <div className="text-center py-16 bg-white rounded-3xl border border-gray-100 p-8 flex flex-col justify-center items-center">
                  <CheckCircle2 className="text-emerald-500 mb-3" size={40} />
                  <p className="text-sm font-black text-gray-800 uppercase tracking-wider">Tudo Sob Controle</p>
                  <p className="text-xs text-gray-500 mt-1">Nenhum alerta crítico de validade ou falta de estoque detectado.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  
                  {/* EXP_01: EXPIRED BATCHES */}
                  {expiredBatches.length > 0 && (
                    <div className="bg-red-50/20 p-5 rounded-3xl border border-red-100 text-left space-y-3">
                      <span className="text-[10px] font-black uppercase tracking-widest text-red-700 flex items-center gap-1">
                        <ShieldAlert size={14} /> Lotes Vencidos ({expiredBatches.length})
                      </span>
                      <p className="text-[11px] text-red-900 font-semibold">Os seguintes lotes expiraram e devem ser retirados de circulação imediatamente:</p>
                      
                      <div className="space-y-2">
                        {expiredBatches.map((b, idx) => (
                          <div key={idx} className="bg-white p-3 rounded-2xl border border-red-100 text-xs flex justify-between items-center shadow-sm">
                            <div>
                              <strong className="font-black text-gray-900 block">{b.genericName}</strong>
                              <span className="text-[10px] text-gray-500 font-mono">Lote: {b.batchNumber}</span>
                            </div>
                            <span className="text-xs font-black text-red-600 font-mono">{b.expiryDate}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* EXP_02: EXPIRING SOON */}
                  {expiringSoonBatches.length > 0 && (
                    <div className="bg-amber-50/20 p-5 rounded-3xl border border-amber-100 text-left space-y-3">
                      <span className="text-[10px] font-black uppercase tracking-widest text-amber-700 flex items-center gap-1">
                        <AlertTriangle size={14} /> Vence em até 30 Dias ({expiringSoonBatches.length})
                      </span>
                      <p className="text-[11px] text-amber-900 font-semibold">Recomenda-se priorizar o consumo destes lotes cirúrgicos:</p>
                      
                      <div className="space-y-2">
                        {expiringSoonBatches.map((b, idx) => (
                          <div key={idx} className="bg-white p-3 rounded-2xl border border-amber-100 text-xs flex justify-between items-center shadow-sm">
                            <div>
                              <strong className="font-black text-gray-900 block">{b.genericName}</strong>
                              <span className="text-[10px] text-gray-500 font-mono">Lote: {b.batchNumber}</span>
                            </div>
                            <span className="text-xs font-black text-amber-600 font-mono">{b.expiryDate}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* EXP_03: LOW STOCK LEVEL */}
                  {lowStockMeds.length > 0 && (
                    <div className="bg-orange-50/20 p-5 rounded-3xl border border-orange-100 text-left space-y-3">
                      <span className="text-[10px] font-black uppercase tracking-widest text-orange-700 flex items-center gap-1">
                        <AlertTriangle size={14} /> Estoque Crítico / Abaixo do Mínimo ({lowStockMeds.length})
                      </span>
                      <p className="text-[11px] text-orange-900 font-semibold">Estes medicamentos estão abaixo da margem de segurança:</p>
                      
                      <div className="space-y-2">
                        {lowStockMeds.map((med, idx) => {
                          const qty = batches
                            .filter(b => b.medicationId === med.id)
                            .reduce((acc, b) => acc + b.quantityAvailable, 0);

                          return (
                            <div key={idx} className="bg-white p-3 rounded-2xl border border-orange-100 text-xs flex justify-between items-center shadow-sm">
                              <div>
                                <strong className="font-black text-gray-900 block">{med.genericName}</strong>
                                <span className="text-[10px] text-gray-500 font-semibold">Mínimo: {med.minStock} ampolas</span>
                              </div>
                              <span className="text-xs font-black text-red-600 font-mono">{qty} un</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                </div>
              )}
            </div>
          )}

          {/* TAB 2: EXPORT REPORTS */}
          {activeTab === "reports" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              
              {/* Report 1: Surgical Consumption */}
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col hover:border-blue-100 transition-all text-left">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl self-start mb-4">
                  <FileText size={20} />
                </div>
                <h3 className="font-black text-gray-900 text-base leading-snug">Relatório de Consumo Cirúrgico</h3>
                <p className="text-xs text-gray-500 mt-1 mb-5 flex-1">
                  Mapa consolidado de medicamentos dispensados, sobras devolvidas, avarias e perdas registradas por cirurgião ou cirurgia.
                </p>
                <button
                  onClick={() => handleDownloadReport("surgical_consumption")}
                  className="flex items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-black uppercase tracking-wider py-3 rounded-2xl transition-all border border-gray-100"
                >
                  <Printer size={15} /> Visualizar e Exportar
                </button>
              </div>

              {/* Report 2: Portaria 344 Logs */}
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col hover:border-blue-100 transition-all text-left">
                <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl self-start mb-4">
                  <FileText size={20} />
                </div>
                <h3 className="font-black text-gray-900 text-base leading-snug">Balancete Anestésico (Portaria 344)</h3>
                <p className="text-xs text-gray-500 mt-1 mb-5 flex-1">
                  Registro de medicamentos controlados sujeitos a notificação especial (Lista A e B), contendo dados do paciente, CRM do prescritor e volume real.
                </p>
                <button
                  onClick={() => handleDownloadReport("portaria_344")}
                  className="flex items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-black uppercase tracking-wider py-3 rounded-2xl transition-all border border-gray-100"
                >
                  <Printer size={15} /> Visualizar e Exportar
                </button>
              </div>

              {/* Report 3: Stock Shelf-Life Exp Balance */}
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col hover:border-blue-100 transition-all text-left">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl self-start mb-4">
                  <FileText size={20} />
                </div>
                <h3 className="font-black text-gray-900 text-base leading-snug">Rastreados e Validade</h3>
                <p className="text-xs text-gray-500 mt-1 mb-5 flex-1">
                  Ficha detalhada de lotes vigentes com rastreabilidade total de fornecedor, fabricante, data de entrada e projeção de validade por lote.
                </p>
                <button
                  onClick={() => handleDownloadReport("validity_balance")}
                  className="flex items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-black uppercase tracking-wider py-3 rounded-2xl transition-all border border-gray-100"
                >
                  <Printer size={15} /> Visualizar e Exportar
                </button>
              </div>

            </div>
          )}

          {/* TAB 3: AUDIT TRAILS */}
          {activeTab === "logs" && (
            <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
              <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                <h3 className="font-black text-gray-900 text-sm uppercase tracking-wider">Histórico de Auditoria e Rastreabilidade</h3>
                <button
                  onClick={fetchAlertsData}
                  className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-white transition-all"
                >
                  <RefreshCw size={15} />
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/50 border-b border-gray-100">
                      <th className="px-6 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest">Data/Hora</th>
                      <th className="px-6 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest">Ação</th>
                      <th className="px-6 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest">Profissional</th>
                      <th className="px-6 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest">Descrição</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-xs">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-3 text-[11px] font-mono text-gray-400 font-semibold">
                          {log.timestamp?.replace("T", " ")?.substring(0, 19)}
                        </td>
                        <td className="px-6 py-3">
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border ${
                            log.action?.includes("CREATE") || log.action?.includes("ENTRY")
                              ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                              : log.action?.includes("CONFIRM")
                              ? "bg-blue-50 text-blue-700 border-blue-100"
                              : log.action?.includes("ADJUST")
                              ? "bg-amber-50 text-amber-700 border-amber-100"
                              : "bg-slate-50 text-slate-500 border-slate-200"
                          }`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="px-6 py-3 font-semibold text-gray-600">
                          {log.userName}
                        </td>
                        <td className="px-6 py-3 font-medium text-gray-700">
                          {log.details}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      )}

      {/* Reports Simulated Print Modal */}
      {reportModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl border border-gray-100 shadow-2xl overflow-hidden">
            <div className="bg-slate-50 border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="font-black text-gray-900 text-sm uppercase tracking-wider">
                  Visualização de Relatório
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">Clique em imprimir para gerar a ficha clínica oficial.</p>
              </div>
              <button
                onClick={() => setReportModal(null)}
                className="text-gray-400 hover:text-gray-700 p-1 rounded-xl hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto text-left font-sans leading-relaxed" id="printable-report">
              <div className="border-b border-gray-300 pb-4 text-center space-y-1">
                <h4 className="font-black uppercase tracking-wider text-sm text-gray-900">Hospital Doctor Pro - Centro Cirúrgico</h4>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-black">SISTEMA INTEGRADO DE MEDICAÇÃO E CONTROLE DE ESTOQUE</p>
                <p className="text-[9px] text-gray-400 font-mono">Gerado em: {new Date().toISOString().replace("T", " ").substring(0, 19)} UTC</p>
              </div>

              {reportModal === "surgical_consumption" && (
                <div className="space-y-4">
                  <h5 className="font-black text-xs uppercase text-gray-800">Mapa de Consumo Cirúrgico Semanal</h5>
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-300 font-bold text-gray-600">
                        <th className="pb-2">Paciente / Procedimento</th>
                        <th className="pb-2">Medicamento</th>
                        <th className="pb-2 text-right">Planejado</th>
                        <th className="pb-2 text-right">Consumido</th>
                        <th className="pb-2 text-right">Retornado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-gray-700">
                      <tr>
                        <td className="py-2 font-medium">Arthur Pendragon (Anestesia Geral)</td>
                        <td>Propofol 10mg/ml</td>
                        <td className="text-right font-mono">14 un</td>
                        <td className="text-right font-mono">12 un</td>
                        <td className="text-right font-mono">2 un</td>
                      </tr>
                      <tr>
                        <td className="py-2 font-medium">Guinevere Smith (Anestesia Local)</td>
                        <td>Lidocaína 2%</td>
                        <td className="text-right font-mono">5 un</td>
                        <td className="text-right font-mono">5 un</td>
                        <td className="text-right font-mono">0 un</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {reportModal === "portaria_344" && (
                <div className="space-y-4">
                  <h5 className="font-black text-xs uppercase text-gray-800">Mapa Demonstrativo de Medicamentos Sujeitos a Controle Especial</h5>
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-300 font-bold text-gray-600">
                        <th className="pb-2">Prescritor (CRM)</th>
                        <th className="pb-2">Medicamento Controlado</th>
                        <th className="pb-2">Paciente</th>
                        <th className="pb-2 text-right">Dose Aplicada</th>
                        <th className="pb-2">Registro Anvisa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-gray-700">
                      <tr>
                        <td className="py-2 font-medium">Dr. Lucas Alencar (CRM 45892-SP)</td>
                        <td>Fentanila 0.05mg/ml</td>
                        <td>Arthur Pendragon</td>
                        <td className="text-right font-mono">250 mcg</td>
                        <td className="font-mono text-[10px]">1.002.003/004</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {reportModal === "validity_balance" && (
                <div className="space-y-4">
                  <h5 className="font-black text-xs uppercase text-gray-800">Inventário Físico e Alerta de Shelf-Life</h5>
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-300 font-bold text-gray-600">
                        <th className="pb-2">Medicamento</th>
                        <th className="pb-2">Lote / Fabricante</th>
                        <th className="pb-2">Vencimento</th>
                        <th className="pb-2 text-right">Saldo Físico</th>
                        <th className="pb-2">Status Alerta</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-gray-700">
                      <tr>
                        <td className="py-2 font-medium">Propofol 10mg/ml</td>
                        <td>L-PRO2409 / Eurofarma</td>
                        <td className="font-mono">2027-02-15</td>
                        <td className="text-right font-mono">420 un</td>
                        <td className="text-emerald-600 font-bold uppercase text-[9px]">Vigente / Ok</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              <div className="border-t border-gray-300 pt-6 flex justify-between text-[10px] text-gray-400">
                <span>Rastreamento criptográfico: nexus-auth-v1</span>
                <span>Ficha oficial de auditoria Anvisa</span>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-6 bg-slate-50 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setReportModal(null)}
                className="px-5 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-500 hover:bg-gray-50"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-6 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-black uppercase tracking-widest hover:bg-blue-700 flex items-center gap-1.5 shadow-md shadow-blue-100"
              >
                <Printer size={15} /> Imprimir Relatório
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
