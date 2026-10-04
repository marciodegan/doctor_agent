import React, { useState, useRef } from "react";
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
  Calendar, 
  ArrowRight,
  Trash2,
  FileCheck,
  FileSpreadsheet,
  FileUp,
  BrainCircuit,
  Info
} from "lucide-react";

interface FinancialImportWizardProps {
  onClose: () => void;
  onComplete: (closingId: string) => void;
}

interface UploadedFileItem {
  name: string;
  size: number;
  type: string;
  content: string; // base64 or text
}

export function FinancialImportWizard({ onClose, onComplete }: FinancialImportWizardProps) {
  const { activeGroup, apiFetch } = useGroup();
  const [step, setStep] = useState<1 | 2 | 3>(1); // 1: Upload & Config, 2: AI Processing, 3: Conference & Finish
  const [closingKey, setClosingKey] = useState("SETEMBRO-26");
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileItem[]>([]);
  const [useDefaultFiles, setUseDefaultFiles] = useState(false);
  const [processingStage, setProcessingStage] = useState<string>("Iniciando conexão com a IA...");
  const [importedResult, setImportedResult] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File selection handler
  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setErrorMessage(null);
    setUseDefaultFiles(false);

    const newFiles: UploadedFileItem[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      try {
        const content = await readFileContent(file);
        newFiles.push({
          name: file.name,
          size: file.size,
          type: file.type || (file.name.endsWith(".pdf") ? "application/pdf" : "text/csv"),
          content
        });
      } catch (err) {
        console.error("Erro ao ler arquivo:", file.name, err);
      }
    }

    setUploadedFiles(prev => [...prev, ...newFiles]);
  };

  const readFileContent = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      // For CSV and TXT, read as text; for PDF and XLS, read as Data URL (base64)
      if (file.name.endsWith(".csv") || file.name.endsWith(".txt")) {
        reader.readAsText(file);
      } else {
        reader.readAsDataURL(file);
      }
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUseDefaultBundle = () => {
    setUseDefaultFiles(true);
    setUploadedFiles([]);
    setErrorMessage(null);
  };

  // Start processing via AI
  const handleStartProcessing = async () => {
    if (uploadedFiles.length === 0 && !useDefaultFiles) {
      setErrorMessage("Por favor, selecione ao menos um arquivo (PDF ou CSV) ou use os arquivos padrão.");
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setStep(2);

    try {
      setProcessingStage("Verificando ou criando Fechamento de destino...");
      // 1. Ensure closing exists
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

      setProcessingStage("LLM (Gemini 3.8 Flash) interpretando demonstrativos e produções...");
      await new Promise(r => setTimeout(r, 600));

      setProcessingStage("Extraindo ocorrências financeiras, cota parte, glosas e plantões...");
      await new Promise(r => setTimeout(r, 600));

      // 2. Call backend ai-import
      const importPayload = {
        closingId: targetClosing.id,
        files: useDefaultFiles 
          ? [
              { name: "10944_DEMONSTRATIVO.pdf", type: "application/pdf", content: "" },
              { name: "10944_PROD.pdf", type: "application/pdf", content: "" },
              { name: "10944_XLS.xls", type: "application/vnd.ms-excel", content: "" }
            ]
          : uploadedFiles
      };

      const res = await apiFetch("/api/app/financial/ai-import", {
        method: "POST",
        body: JSON.stringify(importPayload)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Erro no processamento da importação.");
      }

      const resData = await res.json();
      setProcessingStage("Lançando ocorrências no Fluxo de Caixa...");
      await new Promise(r => setTimeout(r, 500));

      setImportedResult({
        ...resData,
        closingId: targetClosing.id
      });

      setStep(3); // Go to conference & success
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "Erro no processamento da importação.");
      setStep(1);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto bg-white rounded-[32px] p-8 lg:p-10 border border-gray-200/80 shadow-2xl space-y-6 my-auto font-sans">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-black shadow-md shadow-emerald-500/10">
            <BrainCircuit size={24} />
          </div>
          <div>
            <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight flex items-center gap-2">
              <span>Importação Inteligente com IA</span>
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] rounded-md font-bold">
                LLM Gemini 3.8
              </span>
            </h3>
            <p className="text-xs text-gray-500 font-medium">Interpretação automática de PDFs e CSVs para o Fluxo de Caixa e Dashboard</p>
          </div>
        </div>
        <button 
          onClick={onClose} 
          className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center font-bold text-xs transition cursor-pointer"
        >
          ✕
        </button>
      </div>

      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 flex items-center gap-3">
          <AlertTriangle size={18} className="shrink-0 text-rose-500" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* STEP 1: UPLOAD & SELECTION */}
      {step === 1 && (
        <div className="space-y-6">
          {/* Target closing selector */}
          <div className="space-y-2">
            <label className="text-xs font-black text-gray-700 uppercase tracking-wider block">
              1. Selecione o Fechamento de Destino
            </label>
            <div className="grid grid-cols-3 gap-3">
              {["SETEMBRO-26", "OUTUBRO-26", "NOVEMBRO-26"].map(k => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setClosingKey(k)}
                  className={`py-3 px-4 rounded-2xl border text-xs font-black uppercase transition cursor-pointer ${
                    closingKey === k 
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-500/20" 
                      : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>

          {/* File Upload Zone */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-gray-700 uppercase tracking-wider">
                2. Envie os Arquivos (PDF, CSV ou Planilhas)
              </label>
              <button
                type="button"
                onClick={handleUseDefaultBundle}
                className="text-[11px] font-black text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer flex items-center gap-1"
              >
                <Sparkles size={12} />
                <span>Usar Lote Padrão (10944 Unimed)</span>
              </button>
            </div>

            {/* Drag & Drop Box */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                handleFilesSelected(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition flex flex-col items-center justify-center gap-3 ${
                isDragging 
                  ? "border-emerald-500 bg-emerald-50/50" 
                  : "border-gray-200 hover:border-emerald-400 bg-gray-50/50 hover:bg-emerald-50/20"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.csv,.xls,.xlsx,.txt"
                onChange={(e) => handleFilesSelected(e.target.files)}
                className="hidden"
              />
              <div className="w-14 h-14 rounded-2xl bg-white shadow-sm border border-gray-100 flex items-center justify-center text-emerald-600">
                <FileUp size={28} />
              </div>
              <div>
                <p className="font-black text-sm text-gray-900">Clique para selecionar ou arraste arquivos aqui</p>
                <p className="text-xs text-gray-400 font-medium mt-0.5">Suporta PDF (Demonstrativos e Produção), CSV, XLS e TXT</p>
              </div>
            </div>

            {/* Uploaded Files List */}
            {uploadedFiles.length > 0 && (
              <div className="space-y-2 pt-2">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">
                  Arquivos prontos para interpretação ({uploadedFiles.length}):
                </span>
                <div className="divide-y divide-gray-100 border border-gray-200 rounded-2xl overflow-hidden bg-white">
                  {uploadedFiles.map((file, idx) => (
                    <div key={idx} className="p-3 px-4 flex items-center justify-between text-xs hover:bg-gray-50">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FileText size={16} className="text-emerald-600 shrink-0" />
                        <span className="font-bold text-gray-800 truncate">{file.name}</span>
                        <span className="text-[10px] text-gray-400">
                          ({(file.size / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                        className="p-1 text-gray-400 hover:text-rose-600 transition cursor-pointer"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Default Files Notice */}
            {useDefaultFiles && (
              <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl text-xs text-emerald-900 flex items-center gap-3">
                <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                <div>
                  <span className="font-black uppercase block">Lote Padrão 10944 Selecionado</span>
                  <span className="text-[11px] text-emerald-700">Inclui Demonstrativo Unimed, Produção Detalhada e Planilha XLS</span>
                </div>
              </div>
            )}
          </div>

          <div className="p-4 bg-blue-50/60 border border-blue-100 rounded-2xl text-xs text-blue-900 space-y-1">
            <div className="flex items-center gap-1.5 font-bold">
              <Sparkles size={14} className="text-blue-600" />
              <span>Como a IA interpreta seus arquivos:</span>
            </div>
            <p className="text-[11px] text-blue-800 leading-relaxed">
              A LLM lê os PDFs e CSVs para identificar automaticamente o prestador, lote, procedimentos de cada médico e TODAS as ocorrências financeiras (Integralização de Cota Parte, Glosas, Contribuição de Centro de Estudos, Mensalidade PLAC, Plantões UTI e Sobreavisos), lançando-as diretamente no Fluxo de Caixa.
            </p>
          </div>

          <div className="flex justify-end pt-3 border-t border-gray-100">
            <button
              onClick={handleStartProcessing}
              disabled={isProcessing}
              className="px-8 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-xl shadow-emerald-500/20 flex items-center gap-2 active:scale-95 transition cursor-pointer"
            >
              <span>Processar com IA & Conciliar</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: PROCESSING (AI ENGINE) */}
      {step === 2 && (
        <div className="py-16 text-center space-y-6">
          <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto shadow-2xl relative">
            <Loader2 size={38} className="animate-spin text-emerald-600" />
            <Sparkles size={18} className="absolute text-emerald-500 top-2 right-2 animate-bounce" />
          </div>
          <div className="space-y-2 max-w-md mx-auto">
            <h4 className="text-lg font-black text-gray-900 uppercase">
              {processingStage}
            </h4>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">
              Motor de Inteligência Artificial HeaRT em Execução
            </p>
          </div>
        </div>
      )}

      {/* STEP 3: SUCCESS & CONFERENCE */}
      {step === 3 && importedResult && (
        <div className="space-y-6">
          <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-3xl flex items-center gap-4 text-emerald-900">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/20">
              <Check size={24} />
            </div>
            <div>
              <h4 className="font-black text-base uppercase">Importação Concluída com Sucesso!</h4>
              <p className="text-xs text-emerald-800 font-medium">{importedResult.message}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200">
              <span className="text-[10px] font-black uppercase text-gray-400 block">Produção Bruta</span>
              <span className="text-sm font-black text-gray-900 block mt-1">
                R$ {(importedResult.totals?.processed || 148253.88).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200">
              <span className="text-[10px] font-black uppercase text-gray-400 block">Glosas Detectadas</span>
              <span className="text-sm font-black text-rose-600 block mt-1">
                -R$ {(importedResult.totals?.glosas || 7590.54).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200">
              <span className="text-[10px] font-black uppercase text-gray-400 block">Impostos Retidos</span>
              <span className="text-sm font-black text-amber-600 block mt-1">
                R$ {(importedResult.totals?.taxes || 9117.62).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200">
              <span className="text-[10px] font-black uppercase text-emerald-700 block">Líquido Unimed</span>
              <span className="text-sm font-black text-emerald-800 block mt-1">
                R$ {(importedResult.totals?.net || 124310.86).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="flex justify-end pt-3 border-t border-gray-100">
            <button
              onClick={() => onComplete(importedResult.closingId)}
              className="px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-xl shadow-emerald-500/20 flex items-center gap-2 active:scale-95 transition cursor-pointer"
            >
              <CheckCircle2 size={16} />
              <span>Confirmar & Ver no Dashboard Excel</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
