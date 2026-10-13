import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, FileText, Loader2, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { FinancialTransactionType } from "../../types/financial";

type Prelaunch = {
  id: string;
  batchId: string;
  fileName: string;
  date: string;
  doctorId: string;
  doctorName: string;
  typeId: string;
  typeName: string;
  typeScope: string;
  description: string;
  amount: number | string;
  nature: "CREDIT" | "DEBIT";
  observation: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  aiWarning?: string;
  warning?: string;
  readyForApproval?: boolean;
};

type Batch = { id: string; fileName: string; createdAt: string };

interface Props {
  closingId: string | null;
  apiFetch: (url: string, options?: any) => Promise<Response>;
  transactionTypes: FinancialTransactionType[];
  doctors: any[];
  refreshToken: number;
  onTypesChanged: () => Promise<void> | void;
  onImported: () => void;
}

const fieldClass = "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100";
const formatMoney = (value: any) => Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function FinancialPrelaunchesPanel({ closingId, apiFetch, transactionTypes, doctors, refreshToken, onTypesChanged, onImported }: Props) {
  const [rows, setRows] = useState<Prelaunch[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [savingId, setSavingId] = useState("");
  const [approvingId, setApprovingId] = useState("");
  const [cancellingBatch, setCancellingBatch] = useState("");
  const [creatingTypeForId, setCreatingTypeForId] = useState("");
  const [typeForm, setTypeForm] = useState({ name: "", nature: "DEBIT" as "CREDIT" | "DEBIT", defaultScope: "DOCTOR" as "DOCTOR" | "TEAM", defaultRateioMethod: "PROPORCAO_HEART" as "NOMINAL" | "PROPORCAO_HEART" | "PROP_GERAL", category: "Geral" });

  const load = useCallback(async () => {
    if (!closingId) { setRows([]); setBatches([]); return; }
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch(`/api/app/financial/prelaunches?closingId=${encodeURIComponent(closingId)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível carregar os pré-lançamentos.");
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setBatches(Array.isArray(data.batches) ? data.batches : []);
      setDirty({});
    } catch (e: any) {
      setError(e?.message || "Falha ao carregar pré-lançamentos.");
    } finally {
      setLoading(false);
    }
  }, [closingId, apiFetch]);

  useEffect(() => { load(); }, [load, refreshToken]);

  const groupedRows = useMemo(() => {
    const byBatch = new Map<string, Prelaunch[]>();
    for (const row of rows) {
      const current = byBatch.get(row.batchId) || [];
      current.push(row);
      byBatch.set(row.batchId, current);
    }
    return byBatch;
  }, [rows]);

  const updateLocal = (id: string, patch: Partial<Prelaunch>) => {
    setRows(current => current.map(row => row.id === id ? { ...row, ...patch } : row));
    setDirty(current => ({ ...current, [id]: true }));
  };

  const saveRow = async (row: Prelaunch, override?: Partial<Prelaunch>) => {
    const values = { ...row, ...(override || {}) };
    setSavingId(row.id);
    setError("");
    try {
      const response = await apiFetch(`/api/app/financial/prelaunches/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          date: values.date,
          amount: Number(values.amount),
          observation: values.observation || values.description,
          description: values.description,
          typeId: values.typeId,
          doctorId: values.doctorId || ""
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar as alterações.");
      setRows(current => current.map(item => item.id === row.id ? data : item));
      setDirty(current => { const next = { ...current }; delete next[row.id]; return next; });
      return data as Prelaunch;
    } catch (e: any) {
      setError(e?.message || "Falha ao salvar o pré-lançamento.");
      return null;
    } finally {
      setSavingId("");
    }
  };

  const approve = async (row: Prelaunch) => {
    if (dirty[row.id]) {
      setError("Salve as alterações do pré-lançamento antes de aprová-lo.");
      return;
    }
    const type = transactionTypes.find(item => String(item.id) === String(row.typeId));
    if (!type) { setError("Este pré-lançamento precisa ser vinculado a um tipo cadastrado."); return; }
    if (!row.date || !Number.isFinite(Number(row.amount)) || Number(row.amount) === 0) {
      setError("Confira a data e o valor antes de aprovar.");
      return;
    }
    if (type.defaultScope === "DOCTOR" && !row.doctorId) {
      setError("Este tipo é individual. Selecione um médico antes de aprovar.");
      return;
    }
    if (Number(row.amount) < 0 && type.allowNegativeAmount !== true) {
      setError("O tipo selecionado não permite valor negativo.");
      return;
    }

    setApprovingId(row.id);
    setError("");
    try {
      const response = await apiFetch("/api/app/financial/transactions", {
        method: "POST",
        body: JSON.stringify({
          closingId,
          prelaunchId: row.id,
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
      if (!response.ok) throw new Error(data.error || "Não foi possível incorporar este lançamento.");
      setRows(current => current.filter(item => item.id !== row.id));
      onImported();
    } catch (e: any) {
      setError(e?.message || "Falha ao aprovar o pré-lançamento.");
      await load();
    } finally {
      setApprovingId("");
    }
  };

  const cancelBatch = async (batch: Batch) => {
    if (!confirm(`Cancelar a importação "${batch.fileName}"? Os pré-lançamentos pendentes deste arquivo serão descartados e não entrarão no fluxo de caixa.`)) return;
    setCancellingBatch(batch.id);
    setError("");
    try {
      const response = await apiFetch(`/api/app/financial/prelaunches/batches/${batch.id}/cancel`, { method: "POST", body: JSON.stringify({}) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível cancelar a importação.");
      setRows(current => current.filter(row => row.batchId !== batch.id));
      setBatches(current => current.filter(item => item.id !== batch.id));
      setDirty(current => {
        const next = { ...current };
        rows.filter(row => row.batchId === batch.id).forEach(row => delete next[row.id]);
        return next;
      });
    } catch (e: any) {
      setError(e?.message || "Falha ao cancelar a importação.");
    } finally {
      setCancellingBatch("");
    }
  };

  const createTypeAndLink = async (row: Prelaunch) => {
    if (!typeForm.name.trim()) { setError("Informe o nome do novo tipo de lançamento."); return; }
    setSavingId(row.id);
    setError("");
    try {
      const createResponse = await apiFetch("/api/app/financial/transaction-types", {
        method: "POST",
        body: JSON.stringify({
          name: typeForm.name.trim(),
          nature: typeForm.nature,
          defaultScope: typeForm.defaultScope,
          defaultRateioMethod: typeForm.defaultScope === "TEAM" ? typeForm.defaultRateioMethod : "NOMINAL",
          category: typeForm.category.trim() || "Geral",
          description: `Criado durante a revisão de pré-lançamentos do arquivo ${row.fileName || ""}`.trim()
        })
      });
      const newType = await createResponse.json().catch(() => ({}));
      if (!createResponse.ok || !newType.id) throw new Error(newType.error || "Não foi possível criar o tipo de lançamento.");
      await onTypesChanged();
      const updated = await saveRow(row, {
        typeId: String(newType.id),
        typeName: String(newType.name || typeForm.name.trim()),
        typeScope: String(newType.defaultScope || typeForm.defaultScope),
        nature: newType.nature === "CREDIT" ? "CREDIT" : "DEBIT",
        doctorId: newType.defaultScope === "DOCTOR" ? row.doctorId : "",
        doctorName: newType.defaultScope === "DOCTOR" ? row.doctorName : ""
      });
      if (updated) {
        setCreatingTypeForId("");
        setTypeForm({ name: "", nature: "DEBIT", defaultScope: "DOCTOR", defaultRateioMethod: "PROPORCAO_HEART", category: "Geral" });
      }
    } catch (e: any) {
      setError(e?.message || "Não foi possível criar e vincular o tipo.");
    } finally {
      setSavingId("");
    }
  };

  const pendingCount = rows.length;
  const readyCount = rows.filter(row => {
    const type = transactionTypes.find(item => String(item.id) === String(row.typeId));
    return Boolean(type && row.date && Number(row.amount) !== 0 && Number.isFinite(Number(row.amount)) &&
      (type.defaultScope !== "DOCTOR" || Boolean(row.doctorId)) &&
      !(Number(row.amount) < 0 && type.allowNegativeAmount !== true) && !dirty[row.id]);
  }).length;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
        <div>
          <h3 className="font-black text-slate-900">Pré-lançamentos</h3>
          <p className="mt-1 text-xs text-slate-600">Revise os dados importados. Nenhum valor entra no fluxo de caixa até ser aprovado.</p>
          <p className="mt-2 text-xs font-bold text-violet-800">{pendingCount} pendentes · {readyCount} prontos para aprovação</p>
        </div>
        <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">
          {loading ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>} Atualizar
        </button>
      </div>

      {error && <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"><AlertTriangle size={16} className="mt-0.5 shrink-0"/><span>{error}</span></div>}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500"><Loader2 className="mx-auto mb-2 animate-spin" size={24}/>Carregando pré-lançamentos...</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <FileText size={32} className="mx-auto mb-3 text-slate-300"/>
          <h4 className="font-black text-slate-800">Nenhum pré-lançamento pendente</h4>
          <p className="mt-1 text-xs text-slate-500">Importe um PDF pela opção "Importar PDF com IA". Os dados ficarão aqui até serem aprovados.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {Array.from(groupedRows.entries()).map(([batchId, batchRows]) => {
            const batch = batches.find(item => item.id === batchId) || { id: batchId, fileName: batchRows[0]?.fileName || "Documento", createdAt: "" };
            return (
              <div key={batchId} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText size={17} className="shrink-0 text-violet-600"/>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-800">{batch.fileName}</p>
                      <p className="text-[10px] text-slate-500">{batchRows.length} pré-lançamentos pendentes{batch.createdAt ? ` · ${new Date(batch.createdAt).toLocaleString("pt-BR")}` : ""}</p>
                    </div>
                  </div>
                  <button onClick={() => cancelBatch(batch)} disabled={Boolean(cancellingBatch)} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-[11px] font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                    {cancellingBatch === batch.id ? <Loader2 size={13} className="animate-spin"/> : <Trash2 size={13}/>} Cancelar importação
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-[1250px] w-full text-left text-xs">
                    <thead className="bg-slate-100 text-[10px] font-black uppercase tracking-wide text-slate-500">
                      <tr><th className="p-3">Data</th><th className="p-3">Médico</th><th className="p-3">Tipo cadastrado</th><th className="p-3">Descrição / Observação</th><th className="p-3 text-right">Valor</th><th className="p-3">Conferência</th><th className="p-3">Ações</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {batchRows.map(row => {
                        const selectedType = transactionTypes.find(type => String(type.id) === String(row.typeId));
                        const missingType = !selectedType;
                        const missingDoctor = selectedType?.defaultScope === "DOCTOR" && !row.doctorId;
                        const isDirty = Boolean(dirty[row.id]);
                        const ready = Boolean(selectedType && row.date && Number.isFinite(Number(row.amount)) && Number(row.amount) !== 0 && !missingDoctor && !(Number(row.amount) < 0 && selectedType.allowNegativeAmount !== true) && !isDirty);
                        return (
                          <React.Fragment key={row.id}>
                            <tr className={missingType || missingDoctor || !row.date || isDirty ? "bg-amber-50/80" : "bg-white hover:bg-slate-50/70"}>
                              <td className="p-2"><input value={row.date || ""} onChange={e => updateLocal(row.id, { date: e.target.value })} placeholder="DD/MM/AAAA" className={fieldClass + " min-w-28"}/></td>
                              <td className="p-2">
                                {selectedType?.defaultScope === "TEAM" ? (
                                  <div className="min-w-44 rounded-lg bg-slate-100 px-2.5 py-2 text-[11px] text-slate-500">Equipe · conforme tipo cadastrado</div>
                                ) : (
                                  <select value={row.doctorId || ""} onChange={e => { const doctor = doctors.find(item => String(item.id) === e.target.value); updateLocal(row.id, { doctorId: doctor?.id || "", doctorName: doctor?.name || "" }); }} className={fieldClass + " min-w-48"}>
                                    <option value="">Selecione o médico...</option>
                                    {doctors.map(doctor => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}
                                  </select>
                                )}
                              </td>
                              <td className="p-2">
                                <select value={row.typeId || ""} onChange={e => {
                                  const type = transactionTypes.find(item => String(item.id) === e.target.value);
                                  updateLocal(row.id, {
                                    typeId: type?.id || "", typeName: type?.name || "", typeScope: type?.defaultScope || "",
                                    nature: type?.nature || row.nature,
                                    ...(type?.defaultScope === "TEAM" ? { doctorId: "", doctorName: "" } : {})
                                  });
                                }} className={fieldClass + (missingType ? " min-w-64 border-amber-400 bg-amber-50" : " min-w-64")}>
                                  <option value="">⚠ Vincule um tipo cadastrado...</option>
                                  {transactionTypes.map(type => {
                                    const duplicateName = transactionTypes.filter(candidate => candidate.name.trim().toLocaleLowerCase() === type.name.trim().toLocaleLowerCase()).length > 1;
                                    return <option key={type.id} value={type.id}>{type.name} · {type.nature === "DEBIT" ? "Saída" : "Entrada"} · {type.defaultScope === "DOCTOR" ? "Individual" : "Equipe"}{type.category ? " · " + type.category : ""}{duplicateName ? " · ID " + String(type.id).slice(0, 6) : ""}</option>;
                                  })}
                                </select>
                                {missingType && <p className="mt-1 text-[10px] font-bold text-amber-800">Obrigatório: selecione ou crie um tipo</p>}
                              </td>
                              <td className="p-2"><input value={row.observation || row.description || ""} onChange={e => updateLocal(row.id, { observation: e.target.value })} className={fieldClass + " min-w-56"}/></td>
                              <td className="p-2"><input type="number" step="0.01" value={row.amount ?? ""} onChange={e => updateLocal(row.id, { amount: e.target.value })} className={fieldClass + " min-w-28 text-right font-bold"}/></td>
                              <td className="p-2">
                                <span className={"inline-flex rounded-full px-2 py-1 text-[10px] font-black " + (ready ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900")}>{ready ? "Pronto" : "Revisar"}</span>
                                {row.warning && <p className="mt-1 max-w-52 text-[10px] text-rose-700">{row.warning}</p>}
                                {row.aiWarning && <p className="mt-1 max-w-52 text-[10px] text-amber-700">IA: {row.aiWarning}</p>}
                                {row.confidence && row.confidence !== "HIGH" && <p className="mt-1 text-[10px] text-slate-500">Confiança: {row.confidence === "MEDIUM" ? "média" : "baixa"}</p>}
                                {missingDoctor && <p className="mt-1 text-[10px] font-bold text-amber-800">Selecione o médico</p>}
                                {isDirty && <p className="mt-1 text-[10px] font-bold text-violet-700">Alterações não salvas</p>}
                              </td>
                              <td className="p-2">
                                <div className="flex min-w-36 flex-col gap-1.5">
                                  <button onClick={() => saveRow(row)} disabled={savingId === row.id || !isDirty} className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-bold text-slate-700 disabled:opacity-40">
                                    {savingId === row.id ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>} Salvar ajustes
                                  </button>
                                  <button onClick={() => { setCreatingTypeForId(creatingTypeForId === row.id ? "" : row.id); setTypeForm({ name: row.typeName || row.description || "", nature: row.nature || "DEBIT", defaultScope: row.doctorId ? "DOCTOR" : "TEAM", defaultRateioMethod: "PROPORCAO_HEART", category: "Geral" }); }} className="inline-flex items-center justify-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1.5 text-[10px] font-bold text-violet-700">
                                    <Plus size={12}/> Criar tipo e vincular
                                  </button>
                                  <button onClick={() => approve(row)} disabled={!ready || Boolean(approvingId) || Boolean(savingId)} className="inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-600 px-2 py-1.5 text-[10px] font-black text-white disabled:opacity-40">
                                    {approvingId === row.id ? <Loader2 size={12} className="animate-spin"/> : <Check size={12}/>} Aprovar lançamento
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {creatingTypeForId === row.id && (
                              <tr className="bg-violet-50/60">
                                <td colSpan={7} className="p-4">
                                  <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                                    <label className="text-[10px] font-bold text-slate-600">Nome do tipo
                                      <input value={typeForm.name} onChange={e => setTypeForm(current => ({ ...current, name: e.target.value }))} className={fieldClass + " mt-1"}/>
                                    </label>
                                    <label className="text-[10px] font-bold text-slate-600">Natureza
                                      <select value={typeForm.nature} onChange={e => setTypeForm(current => ({ ...current, nature: e.target.value as "CREDIT" | "DEBIT" }))} className={fieldClass + " mt-1"}>
                                        <option value="DEBIT">Saída</option><option value="CREDIT">Entrada</option>
                                      </select>
                                    </label>
                                    <label className="text-[10px] font-bold text-slate-600">Escopo
                                      <select value={typeForm.defaultScope} onChange={e => setTypeForm(current => ({ ...current, defaultScope: e.target.value as "DOCTOR" | "TEAM" }))} className={fieldClass + " mt-1"}>
                                        <option value="DOCTOR">Médico individual</option><option value="TEAM">Equipe</option>
                                      </select>
                                    </label>
                                    <label className="text-[10px] font-bold text-slate-600">Categoria
                                      <input value={typeForm.category} onChange={e => setTypeForm(current => ({ ...current, category: e.target.value }))} className={fieldClass + " mt-1"}/>
                                    </label>
                                    <div className="flex items-end gap-2">
                                      {typeForm.defaultScope === "TEAM" && <select aria-label="Método de rateio" value={typeForm.defaultRateioMethod} onChange={e => setTypeForm(current => ({ ...current, defaultRateioMethod: e.target.value as any }))} className={fieldClass}>
                                        <option value="PROPORCAO_HEART">Proporção Heart</option><option value="PROP_GERAL">Prop % Geral</option><option value="NOMINAL">Nominal</option>
                                      </select>}
                                      <button onClick={() => createTypeAndLink(row)} disabled={savingId === row.id || !typeForm.name.trim()} className="shrink-0 rounded-lg bg-violet-600 px-3 py-2 text-[10px] font-black text-white disabled:opacity-50">{savingId === row.id ? <Loader2 size={13} className="animate-spin"/> : "Criar e vincular"}</button>
                                      <button onClick={() => setCreatingTypeForId("")} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500"><X size={14}/></button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
