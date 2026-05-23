import React, { useState, useEffect } from "react";
import { useGroup } from "../contexts/GroupContext";
import { ChevronLeft, History, Clock, User, ClipboardList, Loader2, AlertCircle, CalendarPlus } from "lucide-react";
import { motion } from "motion/react";

interface LogEntry {
  id: string;
  description: string;
  timestamp: any;
  patientName: string;
  patientId: string;
}

export function PatientLogs({ patientId, onBack, onSchedule }: { patientId: string, onBack: () => void, onSchedule?: (name: string, procedure?: string, hospitalId?: string) => void }) {
  const { apiFetch } = useGroup();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [patientData, setPatientData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Fetch logs
        const logsRes = await apiFetch(`/api/app/patients/${patientId}/logs`);
        if (!logsRes.ok) {
          const errData = await logsRes.json().catch(() => ({}));
          throw new Error(errData.error || "Não foi possível carregar o histórico.");
        }
        const logsData = await logsRes.json();
        setLogs(logsData);
        
        // Fetch patient details
        const patientRes = await apiFetch(`/api/app/patients/info/${patientId}`);
        if (!patientRes.ok) {
          const errData = await patientRes.json().catch(() => ({}));
          throw new Error(errData.error || "Não foi possível carregar os dados.");
        }
        const patient = await patientRes.json();
        if (patient) setPatientData(patient);
      } catch (err: any) {
        console.error("Error fetching patient details:", err);
        setError(err.message || "Não foi possível carregar os dados do paciente.");
      } finally {
        setIsLoading(false);
      }
    };

    if (patientId) {
      fetchLogs();
    }
  }, [patientId, apiFetch]);

  const patientName = patientData?.name || patientData?.nome || "";

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "";
    const date = timestamp._seconds ? new Date(timestamp._seconds * 1000) : new Date(timestamp);
    return date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  return (
    <div className="flex flex-col bg-gray-50/50">
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center gap-4 sticky top-[calc(3.25rem+env(safe-area-inset-top))] lg:top-[env(safe-area-inset-top)] z-10 transition-all">
        <button 
          onClick={onBack}
          className="p-2 -ml-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
        >
          <ChevronLeft size={24} />
        </button>
        <div className="flex flex-col min-w-0">
          <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Histórico do Paciente</h2>
          <h1 className="text-xl font-black text-gray-900 tracking-tight truncate">
            {isLoading ? "Carregando..." : patientName || "Paciente"}
          </h1>
        </div>

        {onSchedule && patientName && !isLoading && (
          <button 
            onClick={() => onSchedule(patientName, patientData?.procedure, patientData?.hospitalId)}
            className="ml-auto flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95"
          >
            <CalendarPlus size={16} />
            <span className="hidden sm:inline">Novo Evento</span>
          </button>
        )}
      </header>

      <div className="flex-1 px-6 py-8">
        <div className="max-w-3xl mx-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 size={40} className="text-blue-600 animate-spin" />
              <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Buscando registros...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-100 rounded-2xl p-8 flex flex-col items-center text-center">
              <AlertCircle size={48} className="text-red-500 mb-4" />
              <h3 className="text-lg font-black text-red-900 mb-2">Ops! Ocorreu um erro</h3>
              <p className="text-red-600 text-sm mb-6">{error}</p>
              <button 
                onClick={() => window.location.reload()}
                className="bg-red-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-red-100"
              >
                Tentar Novamente
              </button>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 opacity-40">
              <ClipboardList size={80} className="text-gray-300 mb-4" />
              <p className="text-xl font-black text-gray-400">Nenhum log encontrado</p>
              <p className="text-sm font-medium text-gray-400 mt-1 max-w-xs text-center">
                As atividades deste paciente aparecerão aqui assim que houverem atualizações.
              </p>
            </div>
          ) : (
            <div className="relative">
              {/* Vertical Line */}
              <div className="absolute left-[19px] top-4 bottom-4 w-0.5 bg-blue-100"></div>

              <div className="space-y-8 relative">
                {logs.map((log, index) => (
                  <motion.div 
                    key={log.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex gap-6 items-start"
                  >
                    <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-100 shrink-0 relative z-10 border-4 border-white">
                      <Clock size={16} strokeWidth={3} />
                    </div>
                    <div className="flex-1 pt-1">
                      <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">
                            {formatDate(log.timestamp)}
                          </span>
                          <History size={14} className="text-gray-200" />
                        </div>
                        <p className="text-gray-800 font-bold leading-relaxed">
                          {log.description}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
