import React, { useRef, useState } from "react";
import { AlertTriangle, FileUp, Loader2, Sparkles, X } from "lucide-react";

interface Props {
  open: boolean;
  closingId: string | null;
  apiFetch: (url: string, options?: any) => Promise<Response>;
  onClose: () => void;
  onPrelaunchesCreated: (count: number) => void;
}

const toBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || "").split("base64,").pop() || "");
  reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
  reader.readAsDataURL(file);
});

export function FinancialTransactionAIImport({ open, closingId, apiFetch, onClose, onPrelaunchesCreated }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const close = () => {
    if (processing) return;
    setFile(null);
    setError("");
    onClose();
  };

  const importDocument = async () => {
    if (!file) { setError("Selecione um PDF ou uma imagem."); return; }
    if (!closingId) { setError("Selecione uma competência em aberto antes de importar."); return; }
    setProcessing(true);
    setError("");
    try {
      const base64 = await toBase64(file);
      const response = await apiFetch("/api/app/financial/transactions/ai-preview", {
        method: "POST",
        body: JSON.stringify({
          closingId,
          fileName: file.name,
          mimeType: file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : file.name.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg",
          base64
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível interpretar o documento.");
      if (!data.batchId || !Number(data.count)) throw new Error("A IA não criou pré-lançamentos para revisão.");
      onPrelaunchesCreated(Number(data.count));
      setFile(null);
      onClose();
    } catch (e: any) {
      setError(e?.message || "Falha ao interpretar o documento.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-4 sm:px-7">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-100 text-violet-700"><Sparkles size={20}/></div>
            <div>
              <h3 className="font-black text-slate-900">Importar PDF com IA</h3>
              <p className="text-xs text-slate-500">Os dados serão salvos primeiro em Pré-lançamentos.</p>
            </div>
          </div>
          <button onClick={close} disabled={processing} className="rounded-xl p-2 text-slate-500 hover:bg-slate-200 disabled:opacity-40" aria-label="Fechar"><X size={18}/></button>
        </div>
        <div className="flex-1 space-y-5 overflow-auto p-5 sm:p-7">
          <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <FileUp size={36} className="mx-auto mb-3 text-violet-600"/>
            <h4 className="font-bold text-slate-800">Selecione o documento de ocorrências financeiras</h4>
            <p className="mt-1 text-sm text-slate-500">PDF, JPG ou PNG. A IA não gravará diretamente no Fluxo de Caixa.</p>
            <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={e => { setFile(e.target.files?.[0] || null); setError(""); }} className="hidden"/>
            <button onClick={() => fileRef.current?.click()} disabled={processing} className="mt-4 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold hover:bg-slate-100 disabled:opacity-50">Escolher arquivo</button>
            {file && <p className="mt-3 break-all text-sm font-semibold text-violet-800">{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</p>}
          </div>
          <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle size={18} className="mt-0.5 shrink-0"/>
            <p>Após a leitura, abra a aba Pré-lançamentos para conferir os médicos e vincular cada linha a um tipo previamente cadastrado. Linhas sem tipo não poderão ser aprovadas.</p>
          </div>
          {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
        </div>
        <div className="flex justify-between gap-3 border-t border-slate-100 px-5 py-4 sm:px-7">
          <button onClick={close} disabled={processing} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 disabled:opacity-50">Cancelar</button>
          <button onClick={importDocument} disabled={!file || processing} className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-black text-white disabled:opacity-50">
            {processing ? <Loader2 size={16} className="animate-spin"/> : <Sparkles size={16}/>}
            {processing ? "Interpretando e preparando..." : "Importar para Pré-lançamentos"}
          </button>
        </div>
      </div>
    </div>
  );
}
