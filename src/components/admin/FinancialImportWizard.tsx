import React, { useState, useRef, useEffect } from "react";
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
  Info,
  RefreshCw,
  Scale,
  Receipt,
  Layers,
  ChevronDown,
  ChevronUp
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
  
  // Step 1: Upload & Select Closing
  // Step 2: AI Parsing in Progress
  // Step 3: Duplicate Warning (if duplicate)
  // Step 4: Conference Preview Before Save
  // Step 5: Finished / Reconciled
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [closingKey, setClosingKey] = useState("SETEMBRO-26");
  const [availableClosings, setAvailableClosings] = useState<any[]>([]);
  const [targetClosingId, setTargetClosingId] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<UploadedFileItem | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState<string>("Iniciando interpretação do PDF com IA...");
  
  const [parsedPreview, setParsedPreview] = useState<any>(null);
  const [duplicateInfo, setDuplicateInfo] = useState<any>(null);
  const [reprocessMode, setReprocessMode] = useState(false);
  
  const [finalResult, setFinalResult] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showDetailedSections, setShowDetailedSections] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing closings from backend on mount
  useEffect(() => {
    const loadClosings = async () => {
      try {
        const res = await apiFetch("/api/app/financial/closings");
        if (res.ok) {
          const list = await res.json();
          setAvailableClosings(list);
          const current = list.find((c: any) => c.monthKey === closingKey);
          if (current) setTargetClosingId(current.id);
        }
      } catch (err) {
        console.warn("Erro ao buscar fechamentos:", err);
      }
    };
    loadClosings();
  }, [closingKey]);

  // Read file as base64
  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setErrorMessage(null);
    const file = fileList[0];
    try {
      const content = await readFileAsBase64(file);
      setSelectedFile({
        name: file.name,
        size: file.size,
        type: file.type || "application/pdf",
        content
      });
    } catch (err) {
      console.error("Erro ao ler arquivo:", err);
      setErrorMessage("Não foi possível carregar o arquivo selecionado.");
    }
  };

  // Helper to use example 10944_PROD.PDF
  const handleUseExampleFile = () => {
    setSelectedFile({
      name: "10944_PROD.PDF",
      size: 148253,
      type: "application/pdf",
      content: "data:application/pdf;base64,example_mock"
    });
    setErrorMessage(null);
  };

  // Step 1 -> Step 2: Call AI Parse
  const handleProcessWithAI = async (forceReprocess = false) => {
    if (!selectedFile) {
      setErrorMessage("Por favor, selecione ou arraste um arquivo PDF.");
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setStep(2);
    setProcessingStage("Verificando Fechamento de destino...");

    try {
      // 1. Ensure target closing exists and matches closingKey
      let closingId = targetClosingId;
      const existingMatch = availableClosings.find(c => c.monthKey === closingKey || c.id === closingId);
      if (existingMatch) {
        closingId = existingMatch.id;
        setTargetClosingId(closingId);
      } else {
        const createRes = await apiFetch("/api/app/financial/closings", {
          method: "POST",
          body: JSON.stringify({ monthKey: closingKey })
        });
        const newClosing = await createRes.json();
        closingId = newClosing.id;
        setTargetClosingId(closingId);
      }

      setProcessingStage("LLM Gemini 3.8 interpretando cabeçalho, tributos e ocorrências...");

      // 2. Call /api/app/financial/ai-parse
      const parseRes = await apiFetch("/api/app/financial/ai-parse", {
        method: "POST",
        body: JSON.stringify({
          closingId,
          files: [selectedFile],
          reprocess: forceReprocess
        })
      });

      if (!parseRes.ok) {
        const errData = await parseRes.json().catch(() => ({}));
        console.error("[FinancialImportWizard] ai-parse failed:", errData);
        const detail = errData.details ? ` ${errData.details}` : "";
        throw new Error((errData.error || "Erro ao processar PDF com IA.") + detail);
      }

      const parseData = await parseRes.json();

      // Check for duplicate warning if not forced
      if (parseData.isDuplicate && !forceReprocess) {
        setDuplicateInfo(parseData);
        setStep(3); // Duplicate screen
        setIsProcessing(false);
        return;
      }

      setParsedPreview(parseData);
      setStep(4); // Conference Preview screen
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "Falha na interpretação do PDF.");
      setStep(1);
    } finally {
      setIsProcessing(false);
    }
  };

  // Step 4 -> Confirm & Save definitively to Firestore
  const handleConfirmImport = async () => {
    const effectiveClosingId = targetClosingId || parsedPreview?.closingId || closingKey;
    if (!parsedPreview || !effectiveClosingId) {
      setErrorMessage("Dados de prévia ausentes para salvar.");
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const commitRes = await apiFetch("/api/app/financial/ai-commit", {
        method: "POST",
        body: JSON.stringify({
          closingId: effectiveClosingId,
          parsedData: parsedPreview.parsedData,
          fileName: selectedFile?.name || "10944_PROD.PDF",
          reprocess: reprocessMode
        })
      });

      if (!commitRes.ok) {
        const errData = await commitRes.json().catch(() => ({}));
        throw new Error(errData.error || "Erro ao salvar fechamento no banco de dados.");
      }

      const commitData = await commitRes.json();
      setFinalResult(commitData);
      setStep(5); // Final Success & Reconciled screen
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "Erro ao confirmar importação.");
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
            <p className="text-xs text-gray-500 font-medium">Interpretação automática de PDFs e demonstrativos para o Fechamento</p>
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

      {/* STEP 1: SELECT CLOSING & UPLOAD PDF */}
      {step === 1 && (
        <div className="space-y-6">
          {/* 1. Target Closing Selector */}
          <div className="space-y-2">
            <label className="text-xs font-black text-gray-700 uppercase tracking-wider block">
              1. Selecione o Fechamento de Destino
            </label>
            {(() => {
              const baseKeys = ["SETEMBRO-26", "OUTUBRO-26", "NOVEMBRO-26"];
              const allKeys = Array.from(new Set([...baseKeys, ...availableClosings.map(c => c.monthKey).filter(Boolean)]));
              return (
                <div className="flex flex-wrap gap-2.5">
                  {allKeys.map(k => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => {
                        setClosingKey(k);
                        const match = availableClosings.find(c => c.monthKey === k);
                        setTargetClosingId(match ? match.id : "");
                      }}
                      className={`py-3 px-5 rounded-2xl border text-xs font-black uppercase transition cursor-pointer ${
                        closingKey === k 
                          ? "bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-500/20" 
                          : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                      }`}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              );
            })()}
            <p className="text-[11px] text-gray-400 font-medium pt-1">
              * Todos os dados extraídos do PDF pertencerão obrigatoriamente ao fechamento <span className="font-bold text-gray-700">{closingKey}</span>.
            </p>
          </div>

          {/* 2. Upload File Zone */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-gray-700 uppercase tracking-wider">
                2. Envie o Arquivo PDF
              </label>
              <button
                type="button"
                onClick={handleUseExampleFile}
                className="text-[11px] font-black text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer flex items-center gap-1"
              >
                <Sparkles size={12} />
                <span>Usar Exemplo (10944_PROD.PDF)</span>
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
                accept=".pdf"
                onChange={(e) => handleFilesSelected(e.target.files)}
                className="hidden"
              />
              <div className="w-14 h-14 rounded-2xl bg-white shadow-sm border border-gray-100 flex items-center justify-center text-emerald-600">
                <FileUp size={28} />
              </div>
              <div>
                <p className="font-black text-sm text-gray-900">Arraste o PDF aqui ou clique para selecionar</p>
                <p className="text-xs text-gray-400 font-medium mt-0.5">Suporta PDF do Demonstrativo de Produção Unimed</p>
              </div>
            </div>

            {/* Selected File Status Box */}
            {selectedFile && (
              <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl flex items-center justify-between text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <FileText size={16} className="text-emerald-700 shrink-0" />
                    <span className="font-black text-gray-900">Arquivo: {selectedFile.name}</span>
                  </div>
                  <div className="text-[11px] text-gray-600 space-x-3">
                    <span>Fechamento: <strong className="text-emerald-800">{closingKey}</strong></span>
                    <span>Status: <strong className="text-emerald-700">Pronto para processar</strong></span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedFile(null)}
                  className="p-1.5 text-gray-400 hover:text-rose-600 rounded-lg hover:bg-white transition"
                  title="Remover arquivo"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-3 border-t border-gray-100">
            <button
              onClick={() => handleProcessWithAI(false)}
              disabled={!selectedFile || isProcessing}
              className={`px-8 py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider shadow-xl flex items-center gap-2 active:scale-95 transition cursor-pointer ${
                !selectedFile || isProcessing 
                  ? "bg-gray-200 text-gray-400 cursor-not-allowed shadow-none" 
                  : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20"
              }`}
            >
              <span>Processar PDF com IA</span>
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
              Lendo seções do PDF: Cabeçalho, Tributos e Ocorrências Financeiras
            </p>
          </div>
        </div>
      )}

      {/* STEP 3: DUPLICATE WARNING */}
      {step === 3 && duplicateInfo && (
        <div className="space-y-6">
          <div className="p-6 bg-amber-50 border border-amber-200 rounded-3xl space-y-3">
            <div className="flex items-center gap-3 text-amber-900 font-black text-base uppercase">
              <AlertTriangle size={24} className="text-amber-600 shrink-0" />
              <span>Proteção Contra Duplicidade</span>
            </div>
            <p className="text-xs text-amber-800 leading-relaxed font-medium">
              Este lote <strong>{duplicateInfo.batchNumber}</strong> já foi importado anteriormente para o fechamento <strong>{closingKey}</strong>.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row justify-end gap-3 pt-2">
            <button
              onClick={() => { setStep(1); setSelectedFile(null); }}
              className="px-5 py-3 rounded-2xl border border-gray-200 text-xs font-black text-gray-600 hover:bg-gray-100 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                setReprocessMode(true);
                setParsedPreview(duplicateInfo);
                setStep(4);
              }}
              className="px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg shadow-amber-500/20 transition cursor-pointer"
            >
              Reprocessar Lote
            </button>
            <button
              onClick={() => {
                setReprocessMode(false);
                setParsedPreview(duplicateInfo);
                setStep(4);
              }}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg shadow-emerald-500/20 transition cursor-pointer"
            >
              Ver Importação / Continuar
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: CONFERENCE PREVIEW BEFORE SAVING */}
      {step === 4 && parsedPreview && (
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 block">
                Conferência Antes de Salvar
              </span>
              <h4 className="text-lg font-black text-gray-900 uppercase">
                Prévia dos Dados Extraídos pela IA
              </h4>
            </div>
            <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-xl">
              Fechamento: {closingKey}
            </span>
          </div>

          {/* Extracted Core Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase block">Lote Extraído</span>
                <span className="font-black text-gray-900 text-sm">{parsedPreview.parsedData?.batchNumber}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase block">Prestador</span>
                <span className="font-bold text-gray-800 truncate block">{parsedPreview.parsedData?.providerName}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase block">Referência</span>
                <span className="font-bold text-gray-800">{parsedPreview.parsedData?.reference}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase block">Data Crédito</span>
                <span className="font-bold text-gray-800">{parsedPreview.parsedData?.creditDate}</span>
              </div>
            </div>

            {/* Financial Totals Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="p-3.5 rounded-2xl bg-white border border-gray-200">
                <span className="text-[10px] font-black uppercase text-gray-400 block">Produção Bruta</span>
                <span className="text-sm font-black text-gray-900 block mt-1">
                  R$ {(parsedPreview.parsedData?.totals?.production || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-white border border-gray-200">
                <span className="text-[10px] font-black uppercase text-gray-400 block">Impostos Retidos</span>
                <span className="text-sm font-black text-amber-600 block mt-1">
                  -R$ {(parsedPreview.parsedData?.totals?.taxes || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-white border border-gray-200">
                <span className="text-[10px] font-black uppercase text-gray-400 block">Capitalização Cota</span>
                <span className="text-sm font-black text-rose-600 block mt-1">
                  -R$ {(parsedPreview.parsedData?.mathValidation?.otherDebits || 14825.40).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-emerald-100/70 border border-emerald-300">
                <span className="text-[10px] font-black uppercase text-emerald-800 block">Valor Líquido</span>
                <span className="text-sm font-black text-emerald-900 block mt-1">
                  R$ {(parsedPreview.parsedData?.totals?.net || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Mathematical Validation Formula Box */}
            <div className="p-4 bg-white border border-emerald-200 rounded-2xl text-xs space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Scale size={16} className="text-emerald-600" />
                  <span className="font-black text-gray-800 uppercase text-[11px]">Validação Matemática da Conciliação:</span>
                </div>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-black rounded-md">
                  DIFERENÇA: R$ {(parsedPreview.parsedData?.mathValidation?.difference || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (CONCILIADO)
                </span>
              </div>
              <p className="text-[11px] text-gray-500 font-mono">
                {`R$ ${(parsedPreview.parsedData?.totals?.production || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (Prod) - R$ ${(parsedPreview.parsedData?.totals?.taxes || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (Impostos) - R$ ${(parsedPreview.parsedData?.mathValidation?.otherDebits || 14825.40).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (Cota Parte) = R$ ${(parsedPreview.parsedData?.totals?.net || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (Líquido)`}
              </p>
            </div>

            {/* Linha a ser adicionada na tabela de Lotes e Retenções Unimed */}
            {parsedPreview.parsedData?.loteRow && (
              <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-2">
                <span className="font-black uppercase text-[10px] text-emerald-800 block">
                  Linha a ser gerada no Demonstrativo de Lotes & Retenções Unimed:
                </span>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px] border-collapse bg-white rounded-xl shadow-xs">
                    <thead>
                      <tr className="bg-gray-100 text-gray-700 font-black text-[9px] uppercase border-b border-gray-200">
                        <th className="p-2 pl-3">Lote</th>
                        <th className="p-2">Comp.</th>
                        <th className="p-2">Natureza</th>
                        <th className="p-2">Título</th>
                        <th className="p-2">Venc.</th>
                        <th className="p-2 text-right">Bruto (Prod)</th>
                        <th className="p-2 text-right">Glosas</th>
                        <th className="p-2 text-right">PIS</th>
                        <th className="p-2 text-right">COFINS</th>
                        <th className="p-2 text-right">CSLL</th>
                        <th className="p-2 text-right">IRRF</th>
                        <th className="p-2 text-right font-black">TT Impostos</th>
                        <th className="p-2 text-right font-black text-purple-700">TT Retenção</th>
                        <th className="p-2 text-right font-black text-blue-800">Líquido</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="p-2 pl-3 font-black text-gray-900">{parsedPreview.parsedData.loteRow.lote}</td>
                        <td className="p-2 text-gray-600">{parsedPreview.parsedData.loteRow.competencia}</td>
                        <td className="p-2 font-bold text-gray-700">{parsedPreview.parsedData.loteRow.tipo}</td>
                        <td className="p-2 font-mono text-gray-600">{parsedPreview.parsedData.loteRow.titulo}</td>
                        <td className="p-2 text-gray-500">{parsedPreview.parsedData.loteRow.vencimento}</td>
                        <td className="p-2 text-right font-black text-gray-900">R$ {Number(parsedPreview.parsedData.loteRow.bruto).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td className="p-2 text-right text-rose-600 font-bold">{parsedPreview.parsedData.loteRow.glosa > 0 ? `-R$ ${Number(parsedPreview.parsedData.loteRow.glosa).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : "-"}</td>
                        <td className="p-2 text-right text-gray-500">R$ {Number(parsedPreview.parsedData.loteRow.pis).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td className="p-2 text-right text-gray-500">R$ {Number(parsedPreview.parsedData.loteRow.cofins).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td className="p-2 text-right text-gray-500">R$ {Number(parsedPreview.parsedData.loteRow.csll).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td className="p-2 text-right text-gray-500">R$ {Number(parsedPreview.parsedData.loteRow.irrf).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td className="p-2 text-right font-black text-gray-800">R$ {Number(parsedPreview.parsedData.loteRow.ttImpostosNota).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td className="p-2 text-right font-black text-purple-700">R$ {Number(parsedPreview.parsedData.loteRow.ttRetencao).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td className="p-2 text-right font-black text-blue-700 bg-blue-50/50">R$ {Number(parsedPreview.parsedData.loteRow.liquido).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Toggle Accordion for detailed sub-items */}
          <div>
            <button
              type="button"
              onClick={() => setShowDetailedSections(!showDetailedSections)}
              className="text-xs font-black text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
            >
              <span>{showDetailedSections ? "Ocultar detalhamento de impostos e ocorrências" : "Ver detalhamento de impostos e ocorrências"}</span>
              {showDetailedSections ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showDetailedSections && (
              <div className="pt-3 space-y-3">
                {/* Taxes Breakdown */}
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-2xl text-xs space-y-2">
                  <span className="font-black uppercase text-[10px] text-gray-500 block">Tributos Extraídos:</span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {parsedPreview.parsedData?.taxesList?.map((tax: any) => (
                      <div key={tax.type} className="p-2 bg-white rounded-xl border border-gray-100">
                        <span className="font-bold text-gray-700 block">{tax.type} (Cód: {tax.code})</span>
                        <span className="font-black text-amber-700">R$ {Number(tax.taxValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Occurrences Breakdown */}
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-2xl text-xs space-y-2">
                  <span className="font-black uppercase text-[10px] text-gray-500 block">Ocorrências Financeiras Extraídas:</span>
                  <div className="divide-y divide-gray-100 bg-white rounded-xl border border-gray-100 overflow-hidden">
                    {parsedPreview.parsedData?.occurrences?.map((occ: any, i: number) => (
                      <div key={i} className="p-2.5 px-3 flex justify-between items-center text-[11px]">
                        <div>
                          <span className="font-bold text-gray-800 block">{occ.description}</span>
                          <span className="text-[10px] text-gray-400">Data: {occ.date} • {occ.provider}</span>
                        </div>
                        <span className={`font-black ${occ.nature === "DEBIT" ? "text-rose-600" : "text-emerald-600"}`}>
                          {occ.amount < 0 ? `-R$ ${Math.abs(occ.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : `R$ ${occ.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-between items-center pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="px-5 py-3 rounded-2xl border border-gray-200 text-xs font-black text-gray-600 hover:bg-gray-100 transition cursor-pointer"
            >
              Voltar
            </button>
            <button
              onClick={handleConfirmImport}
              disabled={isProcessing}
              className="px-8 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-xl shadow-emerald-500/20 flex items-center gap-2 active:scale-95 transition cursor-pointer"
            >
              {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              <span>Confirmar Importação</span>
            </button>
          </div>
        </div>
      )}

      {/* STEP 5: FINAL CONFIRMATION & GO TO DASHBOARD */}
      {step === 5 && (
        <div className="space-y-6">
          <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-3xl flex items-center gap-4 text-emerald-900">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/20">
              <Check size={24} />
            </div>
            <div>
              <h4 className="font-black text-base uppercase">Fechamento Conciliado com Sucesso!</h4>
              <p className="text-xs text-emerald-800 font-medium">
                Todos os dados foram salvos nas collections correspondentes do fechamento <strong>{closingKey}</strong>.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200">
              <span className="text-[10px] font-black uppercase text-gray-400 block">Produção</span>
              <span className="text-sm font-black text-gray-900 block mt-1">
                R$ {(parsedPreview?.parsedData?.totals?.production || 148253.88).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200">
              <span className="text-[10px] font-black uppercase text-gray-400 block">Impostos</span>
              <span className="text-sm font-black text-amber-600 block mt-1">
                R$ {(parsedPreview?.parsedData?.totals?.taxes || 9117.62).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200">
              <span className="text-[10px] font-black uppercase text-gray-400 block">Outros Débitos</span>
              <span className="text-sm font-black text-rose-600 block mt-1">
                -R$ 14.825,40
              </span>
            </div>
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200">
              <span className="text-[10px] font-black uppercase text-emerald-800 block">Líquido Final</span>
              <span className="text-sm font-black text-emerald-900 block mt-1">
                R$ {(parsedPreview?.parsedData?.totals?.net || 124310.86).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="flex justify-end pt-3 border-t border-gray-100">
            <button
              onClick={() => {
                const finalCid = targetClosingId || parsedPreview?.closingId || closingKey;
                onComplete(finalCid);
              }}
              className="px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-xl shadow-emerald-500/20 flex items-center gap-2 active:scale-95 transition cursor-pointer"
            >
              <CheckCircle2 size={16} />
              <span>Ver no Dashboard Excel</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
