import React, { useEffect, useMemo, useRef, useState } from "react";
import { useGroup } from "../../contexts/GroupContext";
import { AlertCircle, CheckCircle2, FileSearch, FileUp, Loader2, RefreshCw, Search, UploadCloud } from "lucide-react";

type GlosaRow = {
  protocol?: string; lot?: string; protocolDate?: string; patientName?: string;
  patientCode?: string; document?: string; ambCode?: string; procedureDescription?: string;
  valueInformed?: number; valueProcessed?: number; valueReleased?: number; glosaValue?: number;
  reason?: string; doctorName?: string; matchStatus?: string; matchedProduction?: any;
};
type GlosaImport = { id: string; fileName: string; createdAt: string; lot?: string; rowCount: number; matchedCount: number; unmatchedCount: number; };
const money = (v: any) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const norm = (v: any) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

export function GlosasView() {
  const { activeGroup, apiFetch } = useGroup();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [imports, setImports] = useState<GlosaImport[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [rows, setRows] = useState<GlosaRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showUpload, setShowUpload] = useState(true);

  const loadImports = async () => {
    setLoadingList(true);
    try {
      const res = await apiFetch("/api/app/financial/glosas/imports");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Não foi possível carregar as importações.");
      setImports(Array.isArray(data.imports) ? data.imports : []);
    } catch (e: any) { setError(e.message || "Erro ao carregar glosas."); }
    finally { setLoadingList(false); }
  };
  useEffect(() => { setImports([]); setRows([]); setSelectedId(""); setFile(null); loadImports(); }, [activeGroup?.id]);

  const openImport = async (id: string) => {
    setSelectedId(id); setError(""); setMessage(""); setRows([]);
    try {
      const res = await apiFetch("/api/app/financial/glosas/imports/" + encodeURIComponent(id));
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Não foi possível abrir a conciliação.");
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setShowUpload(false);
    } catch (e: any) { setError(e.message || "Erro ao abrir a conciliação."); }
  };

  const compare = async () => {
    if (!file) { setError("Selecione o demonstrativo PDF de glosas."); return; }
    if (!/\.pdf$/i.test(file.name)) { setError("O arquivo precisa estar no formato PDF."); return; }
    setLoading(true); setError(""); setMessage(""); setRows([]);
    try {
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Não foi possível ler o PDF."));
        reader.readAsDataURL(file);
      });
      const res = await apiFetch("/api/app/financial/glosas/compare", {
        method: "POST",
        body: JSON.stringify({ fileName: file.name, mimeType: file.type || "application/pdf", content })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Falha ao processar o demonstrativo.");
      setSelectedId(data.importId || "");
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setMessage("PDF processado e confrontado com os dados CSV já importados para esta equipe.");
      setShowUpload(false);
      await loadImports();
    } catch (e: any) { setError(e.message || "Erro ao confrontar os arquivos."); }
    finally { setLoading(false); }
  };

  const filteredRows = useMemo(() => rows.filter(r => {
    const term = norm(search);
    if (!term) return true;
    return [r.protocol, r.lot, r.patientName, r.patientCode, r.document, r.ambCode, r.procedureDescription, r.doctorName, r.reason]
      .some(v => norm(v).includes(term));
  }), [rows, search]);
  const matched = rows.filter(r => r.matchStatus === "MATCHED").length;
  const unmatched = rows.filter(r => r.matchStatus !== "MATCHED").length;
  const totalGlosa = rows.reduce((sum, r) => sum + (Number(r.glosaValue) || 0), 0);

  return <div className="space-y-5 text-gray-800">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div><h2 className="text-2xl font-black text-slate-800 flex items-center gap-2"><FileSearch className="text-blue-700"/> Glosas</h2>
      <p className="text-sm text-gray-500 mt-1">Importe o demonstrativo em PDF e confira cada glosa contra a produção importada por CSV, sem alterar o fechamento financeiro.</p></div>
      <div className="flex gap-2">
        <button onClick={() => { setShowUpload(v => !v); setError(""); }} className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white flex items-center gap-2"><FileUp size={16}/> Importar PDF</button>
        <button onClick={loadImports} className="rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-bold flex items-center gap-2"><RefreshCw size={15}/> Atualizar</button>
      </div>
    </div>

    {showUpload && <section className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4 sm:p-5 space-y-4">
      <div><h3 className="font-extrabold text-slate-800">Importar demonstrativo de glosas</h3><p className="text-sm text-gray-600 mt-1">O PDF será lido e confrontado com os registros da produção CSV da equipe selecionada.</p></div>
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" onChange={e => { setFile(e.target.files?.[0] || null); setError(""); }} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-4 file:py-2 file:font-bold file:text-blue-800 border border-blue-100 rounded-xl bg-white p-2"/>
      {file && <p className="text-sm text-slate-700">Arquivo selecionado: <strong>{file.name}</strong> · {(file.size / 1024 / 1024).toFixed(2)} MB</p>}
      <button disabled={loading || !file} onClick={compare} className="rounded-xl bg-blue-700 px-5 py-3 font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2 w-full sm:w-auto">{loading ? <><Loader2 className="animate-spin" size={17}/> Processando PDF e confrontando CSV...</> : <><UploadCloud size={17}/> Importar e confrontar</>}</button>
    </section>}

    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex gap-2"><AlertCircle size={18} className="shrink-0"/>{error}</div>}
    {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 flex gap-2"><CheckCircle2 size={18} className="shrink-0"/>{message}</div>}

    {rows.length > 0 && <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border bg-white p-4"><p className="text-xs font-bold uppercase text-gray-500">Registros PDF</p><p className="text-2xl font-black mt-1">{rows.length}</p></div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-bold uppercase text-emerald-700">Encontrados no CSV</p><p className="text-2xl font-black text-emerald-800 mt-1">{matched}</p></div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-bold uppercase text-amber-700">Sem correspondência</p><p className="text-2xl font-black text-amber-800 mt-1">{unmatched}</p></div>
        <div className="rounded-xl border bg-white p-4"><p className="text-xs font-bold uppercase text-gray-500">Total de glosas</p><p className="text-xl font-black mt-1">{money(totalGlosa)}</p></div>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between"><h3 className="font-extrabold text-lg">Resultado do confronto</h3><div className="relative w-full sm:max-w-sm"><Search size={16} className="absolute left-3 top-3 text-gray-400"/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar protocolo, paciente, médico..." className="w-full rounded-xl border border-gray-300 py-2.5 pl-9 pr-3 text-sm"/></div></div>
      <div className="overflow-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-[1050px] w-full text-sm">
          <thead className="bg-slate-800 text-white"><tr>{["Situação","Protocolo","Lote","Paciente","Código / Documento","Médico","Valor informado","Valor liberado","Glosa","Descrição / motivo"].map(h => <th key={h} className="p-3 text-left whitespace-nowrap">{h}</th>)}</tr></thead>
          <tbody>{filteredRows.map((r, i) => <tr key={String(r.protocol || "") + "-" + i} className="border-t border-gray-100 hover:bg-gray-50">
            <td className="p-3 whitespace-nowrap">{r.matchStatus === "MATCHED" ? <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-1 text-xs font-bold">Encontrado</span> : <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-1 text-xs font-bold">Conferir</span>}</td>
            <td className="p-3 font-mono">{r.protocol || "—"}</td><td className="p-3">{r.lot || "—"}</td><td className="p-3">{r.patientName || "—"}</td>
            <td className="p-3">{r.ambCode || r.document || r.patientCode || "—"}</td><td className="p-3">{r.doctorName || r.matchedProduction?.doctorName || "—"}</td>
            <td className="p-3 text-right">{money(r.valueInformed)}</td><td className="p-3 text-right">{money(r.valueReleased)}</td><td className="p-3 text-right font-bold text-red-700">{money(r.glosaValue)}</td><td className="p-3 max-w-xs">{r.reason || r.procedureDescription || "—"}</td>
          </tr>)}</tbody>
        </table>
        {filteredRows.length === 0 && <p className="p-8 text-center text-gray-500">Nenhum registro corresponde à busca.</p>}
      </div>
    </>}

    <section className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3"><h3 className="font-extrabold">Importações anteriores</h3>{loadingList && <Loader2 size={16} className="animate-spin text-blue-700"/>}</div>
      {imports.length === 0 && !loadingList ? <p className="text-sm text-gray-500 mt-3">Nenhum demonstrativo de glosas importado nesta equipe.</p> : <div className="divide-y divide-gray-100 mt-2">{imports.map(item => <button key={item.id} onClick={() => openImport(item.id)} className={`w-full text-left py-3 px-2 rounded-lg hover:bg-gray-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 ${selectedId === item.id ? "bg-blue-50" : ""}`}>
        <span><strong className="block text-sm">{item.fileName || "Demonstrativo PDF"}</strong><span className="text-xs text-gray-500">{item.createdAt ? new Date(item.createdAt).toLocaleString("pt-BR") : "Data indisponível"} · Lote {item.lot || "não identificado"}</span></span>
        <span className="text-xs text-gray-600">{item.rowCount || 0} registros · {item.matchedCount || 0} encontrados · {item.unmatchedCount || 0} para conferir</span>
      </button>)}</div>}
    </section>
  </div>;
}
