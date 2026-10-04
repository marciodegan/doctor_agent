import React, { useState } from "react";
import { useGroup } from "../../contexts/GroupContext";
import { 
  UploadCloud, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowLeft, 
  Loader2, 
  FileText, 
  Check, 
  Sparkles,
  ShieldCheck,
  Building2,
  Calendar
} from "lucide-react";

interface FinancialImportWizardProps {
  onClose: () => void;
  onComplete: (closingId: string) => void;
}

export function FinancialImportWizard({ onClose, onComplete }: FinancialImportWizardProps) {
  const { activeGroup, apiFetch } = useGroup();
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6 | 7>(1);
  const [closingKey, setClosingKey] = useState("SETEMBRO-26");
  const [isProcessing, setIsProcessing] = useState(false);
  const [importedResult, setImportedResult] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [files, setFiles] = useState({
    xls: "10944_XLS.xls",
    prodPdf: "10944_PROD.pdf",
    demonstrativePdf: "10944_DEMONSTRATIVO.pdf"
  });

  const handleStartProcessing = async () => {
    setIsProcessing(true);
    setErrorMessage(null);
    setStep(3); // Processing step

    try {
      // 1. First ensure closing exists or create it
      const closingsRes = await apiFetch("/api/app/financial/closings");
      let closings = await closingsRes.json();
      let targetClosing = closings.find((c: any) => c.monthKey === closingKey.toUpperCase());

      if (!targetClosing) {
        const createRes = await apiFetch("/api/app/financial/closings", {
          method: "POST",
          body: JSON.stringify({ monthKey: closingKey })
        });
        targetClosing = await createRes.json();
      }

      // Simulate step-by-step UI progress as requested in section 6
      await new Promise(r => setTimeout(r, 600));
      setStep(4); // Lendo XLS e PDFs
      await new Promise(r => setTimeout(r, 600));
      setStep(5); // Cruzando protocolos e identificando médicos
      await new Promise(r => setTimeout(r, 600));

      // 2. Execute import batch 10944
      const importRes = await apiFetch("/api/app/financial/import", {
        method: "POST",
        body: JSON.stringify({
          closingId: targetClosing.id,
          batchNumber: "10944"
        })
      });

      if (!importRes.ok) {
        throw new Error("Erro ao processar importação no servidor.");
      }

      const resData = await importRes.json();
      setImportedResult({ ...resData, closingId: targetClosing.id });
      setStep(6); // Conferência & Confirmação
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "Erro no processamento.");
      setStep(2);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto bg-white rounded-[32px] p-8 lg:p-10 border border-gray-200/80 shadow-2xl space-y-8 my-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 pb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-black">
            <UploadCloud size={24} />
          </div>
          <div>
            <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Assistente de Importação & Fechamento</h3>
            <p className="text-xs text-gray-500 font-medium">Lote 10944 - Unimed Litoral / Heart Cirurgia Cardiovascular</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-900 rounded-xl">
          ✕
        </button>
      </div>

      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-700 flex items-center gap-3">
          <AlertTriangle size={18} className="shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Step 1 & 2: Select Closing & Files */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-black text-gray-700 uppercase tracking-wider">Passo 1: Selecione o Fechamento de Destino</label>
            <select
              value={closingKey}
              onChange={e => setClosingKey(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-4 text-sm font-bold uppercase outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="SETEMBRO-26">SETEMBRO-26</option>
              <option value="OUTUBRO-26">OUTUBRO-26</option>
              <option value="NOVEMBRO-26">NOVEMBRO-26</option>
            </select>
          </div>

          <div className="space-y-3 pt-4">
            <label className="text-xs font-black text-gray-700 uppercase tracking-wider">Passo 2: Documentos do Prestador (Lote 10944)</label>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <FileBox title="Produção XLS" name={files.xls} type="XLS" />
              <FileBox title="Demonstrativo Prod." name={files.prodPdf} type="PDF" />
              <FileBox title="Demonstrativo Pag." name={files.demonstrativePdf} type="PDF" />
            </div>
          </div>

          <div className="p-4 bg-blue-50/60 border border-blue-100 rounded-2xl text-xs text-blue-800 space-y-1">
            <p className="font-bold">Validação do Caso Real:</p>
            <p>O sistema processará automaticamente o cruzamento por protocolo, glosas, impostos (IRRF, PIS, COFINS, CSLL) e capitalização cota-parte.</p>
          </div>

          <div className="flex justify-end pt-4 border-t border-gray-100">
            <button
              onClick={handleStartProcessing}
              disabled={isProcessing}
              className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-xl shadow-blue-500/20 flex items-center gap-2 active:scale-95"
            >
              <span>Processar Documentos</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Step 3, 4, 5: Processing simulation steps */}
      {(step === 3 || step === 4 || step === 5) && (
        <div className="py-16 text-center space-y-6">
          <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mx-auto shadow-2xl">
            <Loader2 size={36} className="animate-spin" />
          </div>
          <div className="space-y-2">
            <h4 className="text-xl font-black text-gray-900 uppercase">
              {step === 3 ? "Lendo arquivos XLS e PDFs..." : step === 4 ? "Cruzando Relação Nr com Protocolos..." : "Identificando Médicos e Glosas..."}
            </h4>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Motor de Conciliação Financeira em Execução</p>
          </div>
        </div>
      )}

      {/* Step 6 & 7: Conference & Success */}
      {step === 6 && importedResult && (
        <div className="space-y-6">
          <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-3xl flex items-center gap-4 text-emerald-900">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Check size={24} />
            </div>
            <div>
              <h4 className="font-black text-base uppercase">Conferência Automática Aprovada</h4>
              <p className="text-xs opacity-80">{importedResult.message}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <ConfCard label="Produção" value={importedResult.totals.processed} />
            <ConfCard label="Glosas" value={importedResult.totals.glosas} isRose />
            <ConfCard label="Impostos" value={importedResult.totals.taxes} isAmber />
            <ConfCard label="Líquido a Receber" value={importedResult.totals.net} isEmerald />
          </div>

          <div className="flex justify-end pt-4 border-t border-gray-100">
            <button
              onClick={() => onComplete(importedResult.closingId)}
              className="px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-xl shadow-emerald-500/20 flex items-center gap-2 active:scale-95"
            >
              <CheckCircle2 size={16} />
              <span>Confirmar & Ver Fechamento</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FileBox({ title, name, type }: { title: string; name: string; type: string }) {
  return (
    <div className="bg-gray-50 border border-gray-200 p-4 rounded-2xl flex flex-col justify-between gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">{title}</span>
        <span className="text-[9px] font-black bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md">{type}</span>
      </div>
      <div className="flex items-center gap-2 text-gray-800 font-bold text-xs truncate">
        <FileText size={16} className="text-blue-600 shrink-0" />
        <span className="truncate">{name}</span>
      </div>
    </div>
  );
}

function ConfCard({ label, value, isRose, isAmber, isEmerald }: { label: string; value: number; isRose?: boolean; isAmber?: boolean; isEmerald?: boolean }) {
  return (
    <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200/80 space-y-1">
      <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">{label}</span>
      <span className={`text-base font-black block ${isRose ? "text-rose-600" : isAmber ? "text-amber-600" : isEmerald ? "text-emerald-600" : "text-gray-900"}`}>
        R$ {value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
      </span>
    </div>
  );
}
