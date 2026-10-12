import React, { useRef, useState } from "react";
import { Check, FileUp, Loader2, Sparkles, Trash2, X, AlertTriangle } from "lucide-react";
import { FinancialTransactionType } from "../../types/financial";

type PreviewRow = {
  id: string;
  date: string;
  doctorId: string;
  doctorName: string;
  typeId: string;
  description: string;
  amount: string;
  nature: "CREDIT" | "DEBIT";
  observation: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  warning?: string;
  selected: boolean;
};

interface Props {
  open: boolean;
  closingId: string | null;
  apiFetch: (url: string, options?: any) => Promise<Response>;
  transactionTypes: FinancialTransactionType[];
  doctors: any[];
  onClose: () => void;
  onImported: () => void;
}

const toBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || "").split("base64,").pop() || "");
  reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
  reader.readAsDataURL(file);
});

export function FinancialTransactionAIImport({ open, closingId, apiFetch, transactionTypes, doctors, onClose, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [stage, setStage] = useState<"select" | "preview" | "done">("select");
  const [result, setResult] = useState({ saved: 0, failed: 0 });

  if (!open) return null;

  const updateRow = (id: string, patch: Partial<PreviewRow>) =>
    setRows(current => current.map(row => row.id === id ? { ...row, ...patch } : row));

  const analyze = async () => {
    if (!file) { setError("Selecione um PDF ou uma imagem."); return; }
    if (!closingId) { setError("Selecione uma competência em aberto antes de importar."); return; }
    setProcessing(true);
    setError("");
    try {
      const base64 = await toBase64(file);
      const response = await apiFetch("/api/app/financial/transactions/ai-preview", {
        method: "POST",
        body: JSON.stringify({ fileName: file.name, mimeType: file.type || "application/pdf", base64 })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível interpretar o documento.");
      const parsedRows = (data.rows || []).map((row: any, index: number): PreviewRow => ({
        id: String(row.id || index),
        date: String(row.date || ""),
        doctorId: String(row.doctorId || ""),
        doctorName: String(row.doctorName || ""),
        typeId: String(row.typeId || ""),
        description: String(row.description || ""),
        amount: String(row.amount ?? ""),
        nature: row.nature === "CREDIT" ? "CREDIT" : "DEBIT",
        observation: String(row.observation || row.description || ""),
        confidence: row.confidence === "HIGH" || row.confidence === "MEDIUM" ? row.confidence : "LOW",
        warning: String(row.warning || ""),
        selected: true
      }));
      if (!parsedRows.length) throw new Error("A IA não identificou lançamentos para conferir.");
      const seen = new Set<string>();
      const checkedRows = parsedRows.map((row: PreviewRow) => {
        const fingerprint = [row.date.trim().toUpperCase(), row.doctorId || row.doctorName.trim().toUpperCase(), row.typeId, Number(row.amount)].join("|");
        if (!row.date || !row.typeId || !row.amount || !fingerprint) return row;
        if (seen.has(fingerprint)) {
          return { ...row, confidence: "LOW" as const, warning: [row.warning, "Possível duplicidade: confira antes de importar"].filter(Boolean).join("; ") };
        }
        seen.add(fingerprint);
        return row;
      });
      setRows(checkedRows);
      setStage("preview");
    } catch (e: any) {
      setError(e?.message || "Falha ao interpretar o documento.");
    } finally {
      setProcessing(false);
    }
  };

  const confirmImport = async () => {
    if (!closingId) { setError("Selecione uma competência em aberto."); return; }
    const selected = rows.filter(row => row.selected);
    if (!selected.length) { setError("Selecione pelo menos um lançamento para importar."); return; }
    const invalid = selected.find(row => {
      const type = transactionTypes.find(item => String(item.id) === row.typeId);
      return !row.date.trim() || !type || !Number.isFinite(Number(row.amount)) || Number(row.amount) === 0 ||
        (type.defaultScope === "DOCTOR" && !row.doctorId) ||
        (Number(row.amount) < 0 && type.allowNegativeAmount !== true);
    });
    if (invalid) {
      setError("Revise os campos obrigatórios: data, tipo, valor e médico quando o tipo for individual. Valores negativos só são permitidos nos tipos configurados para isso.");
      return;
    }

    setSaving(true);
    setError("");
    let saved = 0;
    let failed = 0;
    const errors: string[] = [];
    const savedIds = new Set<string>();
    for (const row of selected) {
      const type = transactionTypes.find(item => String(item.id) === row.typeId)!;
      try {
        const response = await apiFetch("/api/app/financial/transactions", {
          method: "POST",
          body: JSON.stringify({
            closingId,
            doctorId: row.doctorId || null,
            doctorName: row.doctorName || null,
            typeId: type.id,
            typeName: type.name,
            amount: Number(row.amount),
            date: row.date,
            observation: row.observation || row.description,
            source: "PDF"
          })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Falha ao salvar");
        saved++;
        savedIds.add(row.id);
      } catch (e: any) {
        failed++;
        errors.push(`${row.description || type.name}: ${e?.message || "erro ao salvar"}`);
      }
    }
    setResult({ saved, failed });
    if (savedIds.size > 0) setRows(current => current.map(row => savedIds.has(row.id) ? { ...row, selected: false } : row));
    setSaving(false);
    if (failed) setError(`Importados: ${saved}. Falharam: ${failed}. Os itens já importados foram desmarcados para evitar duplicação. ${errors.slice(0, 3).join(" | ")}`);
    if (saved > 0) onImported();
    if (failed === 0) setStage("done");
  };

  const close = () => {
    if (processing || saving) return;
    setFile(null); setRows([]); setError(""); setStage("select"); setResult({ saved: 0, failed: 0 });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-7xl max-h-[94vh] overflow-hidden flex flex-col">
        <div className="px-5 sm:px-7 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-violet-100 text-violet-700 flex items-center justify-center"><Sparkles size={20}/></div>
            <div>
              <h3 className="font-black text-slate-900">Importar lançamentos com IA</h3>
              <p className="text-xs text-slate-500">Pré-visualize e aprove antes de gravar no fluxo de caixa.</p>
            </div>
          </div>
          <button onClick={close} disabled={processing || saving} className="p-2 rounded-xl hover:bg-slate-200 text-slate-500 disabled:opacity-40" aria-label="Fechar"><X size={18}/></button>
        </div>

        <div className="p-5 sm:p-7 overflow-auto flex-1 space-y-5">
          {stage === "select" && (
            <div className="max-w-2xl mx-auto py-8 space-y-5">
              <div className="border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center bg-slate-50">
                <FileUp size={34} className="mx-auto text-violet-600 mb-3"/>
                <h4 className="font-bold text-slate-800">Selecione o documento de ocorrências financeiras</h4>
                <p className="text-sm text-slate-500 mt-1">PDF, JPG ou PNG. Nenhum lançamento será salvo nesta etapa.</p>
                <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={e => { setFile(e.target.files?.[0] || null); setError(""); }} className="hidden"/>
                <button onClick={() => fileRef.current?.click()} className="mt-4 px-4 py-2 rounded-xl border border-slate-300 bg-white font-bold text-sm hover:bg-slate-100">Escolher arquivo</button>
                {file && <p className="mt-3 text-sm font-semibold text-violet-800">{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</p>}
              </div>
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900 flex gap-2"><AlertTriangle size={18} className="shrink-0 mt-0.5"/><span>A IA pode errar a classificação. Confira médico, tipo, data e valor antes de confirmar.</span></div>
            </div>
          )}

          {stage === "preview" && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h4 className="font-black text-slate-900">Pré-lançamentos para conferência</h4><p className="text-xs text-slate-500">{rows.filter(row => row.selected).length} de {rows.length} selecionados · {file?.name}</p></div>
                <button onClick={() => setRows(current => current.map(row => ({ ...row, selected: !current.every(item => item.selected) })))} className="text-xs font-bold text-violet-700 hover:underline">{rows.every(row => row.selected) ? "Desmarcar todos" : "Selecionar todos"}</button>
              </div>
              <div className="overflow-auto border border-slate-200 rounded-xl">
                <table className="min-w-[1120px] w-full text-xs">
                  <thead className="bg-slate-100 text-slate-600 uppercase text-[10px]"><tr>
                    <th className="p-3 text-left">Importar</th><th className="p-3 text-left">Data</th><th className="p-3 text-left">Médico</th><th className="p-3 text-left">Tipo de lançamento</th><th className="p-3 text-left">Descrição / Observação</th><th className="p-3 text-right">Valor (R$)</th><th className="p-3 text-left">Conferência</th><th className="p-3"></th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map(row => {
                      const selectedType = transactionTypes.find(item => String(item.id) === row.typeId);
                      return <tr key={row.id} className={row.selected ? "bg-white" : "bg-slate-50 opacity-60"}>
                        <td className="p-2 text-center"><input type="checkbox" checked={row.selected} onChange={e => updateRow(row.id, { selected: e.target.checked })}/></td>
                        <td className="p-2"><input value={row.date} onChange={e => updateRow(row.id, { date: e.target.value })} placeholder="DD/MM/AAAA" className="w-28 border rounded-lg p-2"/></td>
                        <td className="p-2"><select value={row.doctorId} onChange={e => { const doctor = doctors.find(item => String(item.id) === e.target.value); updateRow(row.id, { doctorId: doctor?.id || "", doctorName: doctor?.name || "" }); }} className="w-48 border rounded-lg p-2"><option value="">Sem médico / equipe</option>{doctors.map(doctor => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}</select></td>
                        <td className="p-2"><select value={row.typeId} onChange={e => { const type = transactionTypes.find(item => String(item.id) === e.target.value); updateRow(row.id, { typeId: type?.id || "", nature: type?.nature || row.nature, ...(type?.defaultScope === "TEAM" ? { doctorId: "", doctorName: "" } : {}), warning: type && type.defaultScope === "DOCTOR" && !row.doctorId ? "Selecione o médico" : "" }); }} className="w-56 border rounded-lg p-2"><option value="">Selecione o tipo...</option>{transactionTypes.map(type => <option key={type.id} value={type.id}>{type.name} · {type.nature === "DEBIT" ? "Saída" : "Entrada"} · {type.defaultScope === "DOCTOR" ? "Individual" : "Equipe"}{type.category ? " · " + type.category : ""}</option>)}</select></td>
                        <td className="p-2"><input value={row.observation} onChange={e => updateRow(row.id, { observation: e.target.value })} className="w-56 border rounded-lg p-2"/></td>
                        <td className="p-2"><input type="number" step="0.01" value={row.amount} onChange={e => updateRow(row.id, { amount: e.target.value })} className="w-28 border rounded-lg p-2 text-right"/></td>
                        <td className="p-2"><span className={row.confidence === "HIGH" ? "text-emerald-700" : row.confidence === "MEDIUM" ? "text-amber-700" : "text-rose-700"}>{row.confidence === "HIGH" ? "Alta" : row.confidence === "MEDIUM" ? "Média" : "Revisar"}</span>{(row.warning || !row.typeId || (selectedType?.defaultScope === "DOCTOR" && !row.doctorId)) && <p className="text-rose-600 mt-1 max-w-40">{row.warning || "Confira tipo e médico"}</p>}</td>
                        <td className="p-2"><button onClick={() => setRows(current => current.filter(item => item.id !== row.id))} title="Excluir pré-lançamento" className="p-2 rounded-lg text-rose-600 hover:bg-rose-50"><Trash2 size={15}/></button></td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {stage === "done" && <div className="py-12 text-center"><div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center"><Check size={26}/></div><h4 className="mt-4 text-xl font-black text-slate-900">Importação concluída</h4><p className="mt-2 text-sm text-slate-600">{result.saved} lançamentos gravados no fluxo de caixa.</p></div>}
          {error && <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-800">{error}</div>}
        </div>

        <div className="px-5 sm:px-7 py-4 border-t border-slate-100 flex justify-between gap-3">
          <button onClick={() => stage === "preview" ? setStage("select") : close()} disabled={processing || saving || stage === "done"} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm disabled:opacity-40">{stage === "preview" ? "Escolher outro arquivo" : "Cancelar"}</button>
          {stage === "select" && <button onClick={analyze} disabled={!file || processing} className="px-5 py-2.5 rounded-xl bg-violet-600 text-white font-black text-sm flex items-center gap-2 disabled:opacity-50">{processing ? <Loader2 size={16} className="animate-spin"/> : <Sparkles size={16}/>} {processing ? "Interpretando documento..." : "Gerar pré-lançamentos"}</button>}
          {stage === "preview" && <button onClick={confirmImport} disabled={saving || rows.filter(row => row.selected).length === 0} className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-black text-sm flex items-center gap-2 disabled:opacity-50">{saving ? <Loader2 size={16} className="animate-spin"/> : <Check size={16}/>} {saving ? "Salvando..." : "Aprovar e importar selecionados"}</button>}
          {stage === "done" && <button onClick={close} className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-black text-sm">Concluir</button>}
        </div>
      </div>
    </div>
  );
}
