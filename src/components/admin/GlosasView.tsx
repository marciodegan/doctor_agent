import React, { useEffect, useMemo, useRef, useState } from "react";
import { useGroup } from "../../contexts/GroupContext";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, ClipboardCheck, Download, FileSearch, FileUp, Loader2, Mail, MessageCircle, RefreshCw, Search, Share2, UploadCloud } from "lucide-react";

type GlosaRow = {
  id?: string; protocol?: string; lot?: string; protocolDate?: string; date?: string; patientName?: string;
  patientCode?: string; document?: string; ambCode?: string; procedureDescription?: string;
  valueInformed?: number; valueProcessed?: number; valueReleased?: number; glosaValue?: number;
  reason?: string; doctorName?: string; matchStatus?: string; matchedProduction?: any; verified?: boolean;
};
type GlosaImport = { id: string; fileName: string; createdAt: string; lot?: string; rowCount: number; matchedCount: number; unmatchedCount: number; verifiedCount?: number; protocolCount?: number; };
type ProtocolGroup = { key: string; protocol: string; lot: string; rows: GlosaRow[]; csvRecords: any[]; totalGlosa: number; verified: boolean; };

const money = (v: any) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const norm = (v: any) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
const rowPatient = (r: GlosaRow) => r.patientName || r.matchedProduction?.patientName || "Paciente não identificado";
const rowDoctor = (r: GlosaRow) => r.doctorName || r.matchedProduction?.doctorName || r.matchedProduction?.protocolProvider || r.matchedProduction?.executingProvider || "Médico não identificado";
const rowProcedure = (r: GlosaRow) => r.procedureDescription || r.matchedProduction?.procedureDescription || "Procedimento não identificado";
const rowDate = (r: GlosaRow) => r.date || r.protocolDate || r.matchedProduction?.date || "";

export function GlosasView() {
  const { activeGroup, apiFetch } = useGroup();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [imports, setImports] = useState<GlosaImport[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [rows, setRows] = useState<GlosaRow[]>([]);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [savingProtocol, setSavingProtocol] = useState("");
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
  useEffect(() => { setImports([]); setRows([]); setSelectedId(""); setFile(null); setExpanded([]); loadImports(); }, [activeGroup?.id]);

  const openImport = async (id: string) => {
    setSelectedId(id); setError(""); setMessage(""); setRows([]); setExpanded([]);
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
      setSelectedId(data.id || data.importId || "");
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setMessage("PDF processado. Confira os protocolos e marque cada um como verificado depois da revisão.");
      setShowUpload(false);
      await loadImports();
    } catch (e: any) { setError(e.message || "Erro ao confrontar os arquivos."); }
    finally { setLoading(false); }
  };

  const protocolGroups = useMemo<ProtocolGroup[]>(() => {
    const map = new Map<string, GlosaRow[]>();
    rows.forEach((r, i) => {
      const protocol = String(r.protocol || "").trim();
      const key = protocol || "SEM-PROTOCOLO-" + (r.id || i);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return Array.from(map.entries()).map(([key, items]) => {
      const csvRows = items.flatMap(r => Array.isArray((r as any).matchedProductionRecords) ? (r as any).matchedProductionRecords : []);
      const csvRecords = Array.from(new Map(csvRows.map((record: any, index: number) => [
        String(record.productionId || record.sourceRowNumber || record.document || record.protocol + "-" + index), record
      ])).values());
      return {
        key, protocol: items[0]?.protocol || "Sem protocolo", lot: items.find(r => r.lot)?.lot || "",
        rows: items, csvRecords, totalGlosa: items.reduce((sum, r) => sum + (Number(r.glosaValue) || 0), 0),
        verified: items.length > 0 && items.every(r => r.verified === true)
      };
    }).filter(group => group.totalGlosa > 0).sort((a, b) => Number(a.verified) - Number(b.verified) || a.protocol.localeCompare(b.protocol, "pt-BR", { numeric: true }));
  }, [rows]);

  const filteredGroups = useMemo(() => {
    const term = norm(search);
    if (!term) return protocolGroups;
    return protocolGroups.filter(g => norm([g.protocol, g.lot, ...g.rows.flatMap(r => [r.patientName, r.patientCode, r.doctorName, r.procedureDescription, r.ambCode, r.reason, r.matchedProduction?.patientName, r.matchedProduction?.doctorName])].join(" ")).includes(term));
  }, [protocolGroups, search]);
  const matched = rows.filter(r => r.matchStatus === "MATCHED").length;
  const unmatched = rows.length - matched;
  const totalGlosa = rows.reduce((sum, r) => sum + (Number(r.glosaValue) || 0), 0);
  const verifiedCount = protocolGroups.filter(g => g.verified).length;

  const verifyProtocol = async (group: ProtocolGroup, verified: boolean) => {
    if (!selectedId) return;
    setSavingProtocol(group.key); setError("");
    const previous = rows;
    setRows(current => current.map(r => String(r.protocol || "") === group.protocol ? { ...r, verified } : r));
    try {
      const res = await apiFetch("/api/app/financial/glosas/imports/" + encodeURIComponent(selectedId) + "/protocol/" + encodeURIComponent(group.protocol) + "/verified", {
        method: "PATCH", body: JSON.stringify({ verified })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar a conferência.");
      setMessage(verified ? "Protocolo " + group.protocol + " marcado como verificado." : "Conferência do protocolo " + group.protocol + " reaberta.");
      await loadImports();
    } catch (e: any) { setRows(previous); setError(e.message || "Erro ao salvar verificação."); }
    finally { setSavingProtocol(""); }
  };

  const protocolText = (g: ProtocolGroup) => [
    "GLOSAS · " + (activeGroup?.name || "Equipe médica"),
    "Protocolo: " + g.protocol,
    "Lote: " + (g.lot || "Não identificado"),
    "",
    ...g.rows.map((r, i) => [
      (i + 1) + ". " + rowProcedure(r),
      "Paciente: " + rowPatient(r),
      "Data: " + (rowDate(r) || "Não informada"),
      "Médico: " + rowDoctor(r),
      "Código AMB/documento: " + (r.ambCode || r.document || r.patientCode || "—"),
      "Informado: " + money(r.valueInformed),
      "Liberado: " + money(r.valueReleased ?? r.valueProcessed),
      "Glosa: " + money(r.glosaValue),
      r.reason ? "Motivo: " + r.reason : ""
    ].filter(Boolean).join("\n")),
    "",
    "Total de glosas do protocolo: " + money(g.totalGlosa),
    "Conferido: " + (g.verified ? "Sim" : "Não")
  ].join("\n");

  const shareWhatsApp = (g: ProtocolGroup) => window.open("https://wa.me/?text=" + encodeURIComponent(protocolText(g)), "_blank", "noopener,noreferrer");
  const shareEmail = (g: ProtocolGroup) => {
    const subject = "Glosas - Protocolo " + g.protocol;
    window.location.href = "mailto:?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(protocolText(g));
  };
  const downloadProtocolImage = (g: ProtocolGroup) => {
    const lines = [
      "GLOSAS · " + (activeGroup?.name || "Equipe médica"),
      "Protocolo: " + g.protocol + "    Lote: " + (g.lot || "—"),
      "────────────────────────────────────────",
      ...g.rows.flatMap((r, i) => [
        (i + 1) + ". " + rowProcedure(r),
        "Paciente: " + rowPatient(r) + "   |   Data: " + (rowDate(r) || "—"),
        "Médico: " + rowDoctor(r) + "   |   AMB: " + (r.ambCode || "—"),
        "Informado: " + money(r.valueInformed) + "   Liberado: " + money(r.valueReleased ?? r.valueProcessed) + "   Glosa: " + money(r.glosaValue),
        ...(r.reason ? ["Motivo: " + r.reason] : []),
        ""
      ]),
      "TOTAL GLOSAS: " + money(g.totalGlosa),
      "Conferido: " + (g.verified ? "Sim" : "Não")
    ];
    const canvas = document.createElement("canvas");
    const scale = 2, width = 1100, lineHeight = 27, padding = 36;
    canvas.width = width * scale; canvas.height = (padding * 2 + lines.length * lineHeight) * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(scale, scale); ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, width, canvas.height / scale);
    ctx.fillStyle = "#17243b"; ctx.fillRect(0, 0, width, 94);
    ctx.fillStyle = "#ffffff"; ctx.font = "bold 25px Arial"; ctx.fillText("GLOSAS · PROTOCOLO " + g.protocol, padding, 39);
    ctx.font = "16px Arial"; ctx.fillText("Lote: " + (g.lot || "—") + "  |  " + (activeGroup?.name || "Equipe médica"), padding, 69);
    let y = 126;
    lines.slice(2).forEach((line, index) => {
      if (line.startsWith("TOTAL GLOSAS")) { ctx.fillStyle = "#fff0e6"; ctx.fillRect(0, y - 20, width, 36); ctx.fillStyle = "#9a3412"; ctx.font = "bold 19px Arial"; }
      else { ctx.fillStyle = "#17243b"; ctx.font = line.startsWith("Paciente:") || line.startsWith("Médico:") ? "15px Arial" : "bold 16px Arial"; }
      ctx.fillText(line.slice(0, 125), padding, y); y += lineHeight;
    });
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "glosa-protocolo-" + g.protocol + ".png"; a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  return <div className="space-y-5 text-gray-800">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div><h2 className="text-2xl font-black text-slate-800 flex items-center gap-2"><FileSearch className="text-blue-700"/> Glosas</h2>
      <p className="text-sm text-gray-500 mt-1">Abra cada protocolo para revisar os procedimentos e marque como verificado quando terminar.</p></div>
      <div className="flex gap-2">
        <button onClick={() => { setShowUpload(v => !v); setError(""); }} className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white flex items-center gap-2"><FileUp size={16}/> Importar PDF</button>
        <button onClick={loadImports} className="rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-bold flex items-center gap-2"><RefreshCw size={15}/> Atualizar</button>
      </div>
    </div>

    {showUpload && <section className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4 sm:p-5 space-y-4">
      <div><h3 className="font-extrabold text-slate-800">Importar demonstrativo de glosas</h3><p className="text-sm text-gray-600 mt-1">O PDF será lido e confrontado com a produção CSV já importada da equipe selecionada.</p></div>
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" onChange={e => { setFile(e.target.files?.[0] || null); setError(""); }} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-4 file:py-2 file:font-bold file:text-blue-800 border border-blue-100 rounded-xl bg-white p-2"/>
      {file && <p className="text-sm text-slate-700">Arquivo selecionado: <strong>{file.name}</strong> · {(file.size / 1024 / 1024).toFixed(2)} MB</p>}
      <button disabled={loading || !file} onClick={compare} className="rounded-xl bg-blue-700 px-5 py-3 font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2 w-full sm:w-auto">{loading ? <><Loader2 className="animate-spin" size={17}/> Processando PDF...</> : <><UploadCloud size={17}/> Importar e confrontar</>}</button>
    </section>}

    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex gap-2"><AlertCircle size={18} className="shrink-0"/>{error}</div>}
    {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 flex gap-2"><CheckCircle2 size={18} className="shrink-0"/>{message}</div>}

    {rows.length > 0 && <>
      <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-5">
        <div className="rounded-xl border bg-white p-3 sm:p-4"><p className="text-xs font-bold uppercase text-gray-500">Protocolos</p><p className="text-2xl font-black mt-1">{protocolGroups.length}</p></div>
        <div className="rounded-xl border bg-white p-4"><p className="text-xs font-bold uppercase text-gray-500">Procedimentos</p><p className="text-2xl font-black mt-1">{rows.length}</p></div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 sm:p-4"><p className="text-xs font-bold uppercase text-emerald-700">Verificados</p><p className="text-2xl font-black text-emerald-800 mt-1">{verifiedCount}</p></div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 sm:p-4"><p className="text-xs font-bold uppercase text-amber-700">Pendentes</p><p className="text-2xl font-black text-amber-800 mt-1">{protocolGroups.length - verifiedCount}</p></div>
        <div className="rounded-xl border bg-white p-3 sm:p-4 col-span-2 xl:col-span-1"><p className="text-xs font-bold uppercase text-gray-500">Total de glosas</p><p className="text-xl font-black mt-1">{money(totalGlosa)}</p></div>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between"><div><h3 className="font-extrabold text-lg">Protocolos com glosas</h3><p className="text-xs text-gray-500 mt-1">Os protocolos pendentes aparecem primeiro; os verificados vão para o final.</p></div><div className="relative w-full sm:max-w-sm"><Search size={16} className="absolute left-3 top-3 text-gray-400"/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar protocolo, paciente, médico..." className="w-full rounded-xl border border-gray-300 py-2.5 pl-9 pr-3 text-sm"/></div></div>
      <div className="space-y-3">
        {filteredGroups.map(g => {
          const isOpen = expanded.includes(g.key);
          return <section key={g.key} className={`overflow-hidden rounded-2xl border bg-white ${g.verified ? "border-emerald-200 opacity-80" : "border-gray-200"}`}>
            <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-3 sm:p-4">
              <button onClick={() => setExpanded(current => isOpen ? current.filter(k => k !== g.key) : [...current, g.key])} className="flex min-w-0 w-full flex-1 items-start gap-2 text-left sm:items-center sm:gap-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${g.verified ? "bg-emerald-100 text-emerald-800" : "bg-blue-50 text-blue-800"}`}>{isOpen ? <ChevronDown size={18}/> : <ChevronRight size={18}/>}</span>
                <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2 font-extrabold text-slate-800">Protocolo {g.protocol}{g.verified && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-800">Verificado</span>}</span><span className="mt-1 block text-xs text-gray-500">Lote {g.lot || "—"} · {g.csvRecords.length} registro(s) CSV vinculado(s) · {g.rows.length} linha(s) de glosa</span></span>
                <span className="shrink-0 text-left sm:text-right"><span className="block text-[10px] font-bold uppercase text-gray-500">Total glosa</span><span className="text-sm sm:text-base font-black text-red-700">{money(g.totalGlosa)}</span></span>
              </button>
              <button title={g.verified ? "Reabrir conferência" : "Marcar como verificado"} disabled={savingProtocol === g.key} onClick={() => verifyProtocol(g, !g.verified)} className={`flex w-full shrink-0 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-extrabold disabled:opacity-50 sm:w-auto sm:py-2 ${g.verified ? "bg-emerald-100 text-emerald-800" : "bg-slate-800 text-white"}`}>{savingProtocol === g.key ? <Loader2 size={15} className="animate-spin"/> : <ClipboardCheck size={15}/>}<span className="hidden md:inline">{g.verified ? "Verificado" : "Marcar verificado"}</span><span className="md:hidden">{g.verified ? "OK" : "Verificar"}</span></button>
            </div>
            {isOpen && <div className="border-t border-gray-100">
              <div className="grid grid-cols-2 gap-2 border-b border-gray-100 bg-gray-50 p-3 sm:flex sm:flex-wrap">
                <button onClick={() => shareWhatsApp(g)} className="inline-flex min-w-0 items-center justify-center gap-2 rounded-lg border border-green-200 bg-white px-2 py-2.5 text-xs font-bold text-green-800 sm:px-3"><MessageCircle size={15}/> WhatsApp</button>
                <button onClick={() => shareEmail(g)} className="inline-flex min-w-0 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-2 py-2.5 text-xs font-bold text-blue-800 sm:px-3"><Mail size={15}/> E-mail</button>
                <button onClick={() => downloadProtocolImage(g)} className="inline-flex min-w-0 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-2 py-2.5 text-xs font-bold text-gray-700 sm:px-3"><Download size={15}/> Baixar imagem</button>
                <button onClick={() => { void navigator.clipboard?.writeText(protocolText(g)); setMessage("Resumo do protocolo copiado."); }} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-700"><Share2 size={15}/> Copiar resumo</button>
              </div>
              <div className="space-y-3 p-3 sm:p-4">
                {g.csvRecords.length > 0 && <section className="overflow-hidden rounded-xl border border-blue-100">
                  <div className="flex flex-col gap-1 bg-blue-50 px-4 py-3"><h4 className="font-extrabold text-slate-800">Registros completos encontrados no CSV</h4><p className="text-xs text-slate-600">{g.csvRecords.length} linha(s) do arquivo original com o protocolo {g.protocol}. Todas as colunas importadas são preservadas nesta tabela.</p></div>
                  {g.csvRecords[0]?.sourceColumns ? <div className="overflow-auto">
                    <table className="min-w-max w-full text-xs">
                      <thead className="bg-slate-800 text-white"><tr>{Object.keys(g.csvRecords[0].sourceColumns).map((header: string) => <th key={header} className="whitespace-nowrap border-r border-slate-600 px-3 py-2 text-left">{header}</th>)}</tr></thead>
                      <tbody>{g.csvRecords.map((record: any, index: number) => <tr key={record.productionId || index} className="border-t border-gray-100 odd:bg-white even:bg-gray-50">
                        {Object.keys(g.csvRecords[0].sourceColumns).map((header: string) => {
                          const value = record.sourceColumns?.[header];
                          const display = value === null || value === undefined || value === "" ? "—" : typeof value === "object" ? (value.seconds ? new Date(value.seconds * 1000).toLocaleString("pt-BR") : JSON.stringify(value)) : String(value);
                          return <td key={header} className="whitespace-nowrap border-r border-gray-100 px-3 py-2">{display}</td>;
                        })}
                      </tr>)}</tbody>
                    </table>
                  </div> : <div className="overflow-auto"><table className="min-w-[950px] w-full text-xs"><thead className="bg-slate-800 text-white"><tr>{["Data","Paciente","Código usuário","Documento","Código AMB","Descrição","Qtd.","Vlr. Hon.","Vlr. Oper.","Vlr. Filme","Vlr. Tx Adm","Prestador Executante","Prestador Pagamento","Prestador Protocolo"].map(h => <th key={h} className="whitespace-nowrap px-3 py-2 text-left">{h}</th>)}</tr></thead><tbody>{g.csvRecords.map((record: any, index: number) => <tr key={record.productionId || index} className="border-t border-gray-100"><td className="whitespace-nowrap px-3 py-2">{record.date || "—"}</td><td className="px-3 py-2">{record.patientName || "—"}</td><td className="px-3 py-2">{record.patientCode || "—"}</td><td className="px-3 py-2">{record.document || "—"}</td><td className="px-3 py-2">{record.ambCode || "—"}</td><td className="px-3 py-2">{record.procedureDescription || "—"}</td><td className="px-3 py-2">{record.quantity ?? "—"}</td><td className="px-3 py-2">{money(record.honorValue)}</td><td className="px-3 py-2">{money(record.operationalValue)}</td><td className="px-3 py-2">{money(record.filmValue)}</td><td className="px-3 py-2">{money(record.administrativeFee)}</td><td className="px-3 py-2">{record.executingProvider || "—"}</td><td className="px-3 py-2">{record.paymentProvider || "—"}</td><td className="px-3 py-2">{record.protocolProvider || "—"}</td></tr>)}</tbody></table></div>}
                </section>}
                {g.rows.map((r, i) => <article key={r.id || g.key + "-" + i} className="rounded-xl border border-gray-200 p-3 sm:p-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1"><p className="font-bold text-slate-800">{i + 1}. {rowProcedure(r)}</p><div className="mt-2 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-4 gap-y-1 text-xs text-gray-600"><p><strong>Paciente:</strong> {rowPatient(r)}</p><p><strong>Data:</strong> {rowDate(r) || "Não informada"}</p><p><strong>Médico:</strong> {rowDoctor(r)}</p><p><strong>Código AMB:</strong> {r.ambCode || r.matchedProduction?.ambCode || "—"}</p><p><strong>Documento:</strong> {r.document || r.matchedProduction?.document || "—"}</p><p><strong>Correspondência CSV:</strong> {r.matchStatus === "MATCHED" ? <span className="font-bold text-emerald-700">Encontrado</span> : <span className="font-bold text-amber-700">Conferir manualmente</span>}</p>{r.reason && <p className="sm:col-span-2 xl:col-span-3"><strong>Motivo:</strong> {r.reason}</p>}</div></div>
                    <div className="grid grid-cols-3 gap-2 xl:w-[390px]"><div className="rounded-lg bg-gray-50 p-2"><p className="text-[10px] font-bold uppercase text-gray-500">Informado</p><p className="mt-1 text-xs font-bold">{money(r.valueInformed)}</p></div><div className="rounded-lg bg-gray-50 p-2"><p className="text-[10px] font-bold uppercase text-gray-500">Liberado</p><p className="mt-1 text-xs font-bold">{money(r.valueReleased ?? r.valueProcessed)}</p></div><div className="rounded-lg bg-red-50 p-2"><p className="text-[10px] font-bold uppercase text-red-700">Glosa</p><p className="mt-1 text-xs font-black text-red-700">{money(r.glosaValue)}</p></div></div>
                  </div>
                </article>)}
                <div className="flex justify-end rounded-xl bg-slate-800 p-4 text-white"><div className="text-right"><p className="text-xs uppercase text-slate-300">Total de glosas do protocolo</p><p className="text-xl font-black">{money(g.totalGlosa)}</p></div></div>
              </div>
            </div>}
          </section>;
        })}
        {filteredGroups.length === 0 && <div className="rounded-xl border border-dashed p-8 text-center text-sm text-gray-500">Nenhum protocolo corresponde à busca.</div>}
      </div>
      <p className="text-xs text-gray-500">Correspondência automática é uma sugestão de conferência. Revise os dados antes de considerar uma glosa concluída.</p>
    </>}

    <section className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3"><h3 className="font-extrabold">Importações anteriores</h3>{loadingList && <Loader2 size={16} className="animate-spin text-blue-700"/>}</div>
      {imports.length === 0 && !loadingList ? <p className="text-sm text-gray-500 mt-3">Nenhum demonstrativo de glosas importado nesta equipe.</p> : <div className="divide-y divide-gray-100 mt-2">{imports.map(item => <button key={item.id} onClick={() => openImport(item.id)} className={`w-full text-left py-3 px-2 rounded-lg hover:bg-gray-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 ${selectedId === item.id ? "bg-blue-50" : ""}`}>
        <span><strong className="block text-sm">{item.fileName || "Demonstrativo PDF"}</strong><span className="text-xs text-gray-500">{item.createdAt ? new Date(item.createdAt).toLocaleString("pt-BR") : "Data indisponível"} · Lote {item.lot || "não identificado"}</span></span>
        <span className="text-xs text-gray-600">{item.protocolCount ?? "—"} protocolos · {item.verifiedCount || 0} verificados · {item.unmatchedCount || 0} para conferir</span>
      </button>)}</div>}
    </section>
  </div>;
}
