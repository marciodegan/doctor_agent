import React, { useState, useMemo } from "react";
import { MessageSquare, Plus, CalendarPlus, Share2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import { E2EMedia } from "./E2EMedia";
import { useGroup } from "../contexts/GroupContext";

interface PatientProfileSheetProps {
  msg: any;
  allStatuses: any[];
  allHospitals: any[];
  handleSend: (e: any, cmd: string, shouldClear?: boolean) => void;
  handleDirectCommand: (command: string) => void;
  setConfirmCommand: (cmd: any) => void;
  isVideoUrl: (url: string | null | undefined) => boolean;
  isPdfUrl: (url: string | null | undefined) => boolean;
}

export const PatientProfileSheet: React.FC<PatientProfileSheetProps> = ({
  msg,
  allStatuses,
  allHospitals,
  handleSend,
  handleDirectCommand,
  setConfirmCommand,
  isVideoUrl,
  isPdfUrl,
}) => {
  const profileData = msg.profileData;
  const reportData = msg.reportData;
  const text = msg.text || "";

  const idxContatos = text.indexOf("`/novofamiliar");
  const idxInformacoes = text.indexOf("`/logpac");
  const idxImagens = text.indexOf("`/prep_img");

  const headerPart = idxContatos !== -1 ? text.substring(0, idxContatos) : text;
  const contatosPart = idxContatos !== -1 && idxInformacoes !== -1 ? text.substring(idxContatos, idxInformacoes) : "";
  const informacoesPart = idxInformacoes !== -1 && idxImagens !== -1 ? text.substring(idxInformacoes, idxImagens) : "";
  const imagensPart = idxImagens !== -1 ? text.substring(idxImagens) : "";

  // Helper parsers
  const parseSectionPart = (partText: string) => {
    const firstBacktick = partText.indexOf("`");
    if (firstBacktick === -1) return null;
    const secondBacktick = partText.indexOf("`", firstBacktick + 1);
    if (secondBacktick === -1) return null;

    const command = partText.substring(firstBacktick + 1, secondBacktick).trim();
    const afterBacktick = partText.substring(secondBacktick + 1);
    const titleMatch = afterBacktick.match(/\*\*([^*]+)\*\*/);
    const title = titleMatch ? titleMatch[1].replace(":", "").trim() : "Seção";

    let content = afterBacktick;
    if (titleMatch) {
      const titleIndex = afterBacktick.indexOf(titleMatch[0]);
      content = afterBacktick.substring(titleIndex + titleMatch[0].length);
    }

    return { command, title, content: content.trim() };
  };

  const parseContatos = (contText: string) => {
    const lines = contText.split("\n").map((l) => l.trim()).filter(Boolean);
    const items: { name: string; phoneLinkText: string; waUrl: string; editCmd?: string; trashCmd?: string }[] = [];
    let currentItem: any = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.toLowerCase().includes("nenhum registro")) continue;

      const waMatchSimple = line.match(/\*\*([^*]+)\*\*(?:\s+\(([^)]+)\))?\s*(?:\[📞\s*\*\*([^*]+)\*\*\]\(([^)]+)\)|📞\s*(Sem\s+telefone))/i);
      if (waMatchSimple) {
        if (currentItem) items.push(currentItem);
        const rawName = waMatchSimple[1].trim();
        const relation = waMatchSimple[2]?.trim() || "";
        const phoneVal = waMatchSimple[3]?.trim() || waMatchSimple[5]?.trim() || "";
        const urlVal = waMatchSimple[4]?.trim() || "";
        const fullName = relation ? `${rawName} (${relation})` : rawName;

        currentItem = {
          name: fullName,
          phoneLinkText: phoneVal,
          waUrl: urlVal,
        };
      } else if (line.includes("/editar_familiar") || line.includes("/remover_familiar")) {
        if (currentItem) {
          const editMatch = line.match(/`(\/editar_familiar[^`]+)`/);
          const trashMatch = line.match(/`(\/remover_familiar[^`]+)`/);
          if (editMatch) currentItem.editCmd = editMatch[1];
          if (trashMatch) currentItem.trashCmd = trashMatch[1];
        }
      }
    }
    if (currentItem) items.push(currentItem);
    return items;
  };

  const parseInformacoes = (infText: string) => {
    const lines = infText.split("\n").map((l) => l.trim()).filter(Boolean);
    const items: { content: string; date: string; editCmd?: string; trashCmd?: string }[] = [];
    let currentItem: any = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.toLowerCase().includes("nenhum registro")) continue;

      const contentMatch = line.match(/^\*\*([^*]+)\*\*$/);
      const dateMatch = line.match(/^_([^_]+)_$/);

      if (contentMatch) {
        if (currentItem) items.push(currentItem);
        currentItem = { content: contentMatch[1].trim(), date: "" };
      } else if (dateMatch && currentItem) {
        currentItem.date = dateMatch[1].trim();
      } else if (line.includes("/editar_log") || line.includes("/remover_informacao")) {
        if (currentItem) {
          const editMatch = line.match(/`(\/editar_log[^`]+)`/);
          const trashMatch = line.match(/`(\/remover_informacao[^`]+)`/);
          if (editMatch) currentItem.editCmd = editMatch[1];
          if (trashMatch) currentItem.trashCmd = trashMatch[1];
        }
      }
    }
    if (currentItem) items.push(currentItem);
    return items;
  };

  const parseImagens = (imgText: string) => {
    const blocks = imgText.split("---").map((b) => b.trim()).filter(Boolean);
    const items: { src: string; alt: string; date: string; trashCmd?: string; aiAnalysis?: string }[] = [];

    blocks.forEach((block) => {
      if (block.toLowerCase().includes("nenhum registro")) return;
      const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
      let src = "";
      let alt = "";
      let date = "";
      let trashCmd = "";
      let aiAnalysis = "";

      const imgMatch = block.match(/!\[([^\]]*)\]\(([^)]+)\)/);
      if (imgMatch) {
        alt = imgMatch[1];
        src = imgMatch[2];
      }
      const descMatch = block.match(/\*\*([^*]+)\*\*/);
      if (descMatch) {
        const parsedDesc = descMatch[1].trim();
        if (!alt && parsedDesc) alt = parsedDesc;
      }
      const dateMatch = block.match(/_([^_~]+)_/);
      if (dateMatch) date = dateMatch[1].trim();

      const trashMatch = block.match(/`(\/remover_imagem[^`]+)`/);
      if (trashMatch) trashCmd = trashMatch[1];

      const aiLines = lines.filter((l) => l.startsWith(">"));
      if (aiLines.length > 0) {
        aiAnalysis = aiLines
          .map((l) => l.replace(/^>\s*/, "").replace(/🤖\s*\*\*Análise Inteligente:\*\*/, "").trim())
          .filter(Boolean)
          .join("\n");
      }

      if (src || alt) {
        items.push({ src, alt, date, trashCmd, aiAnalysis });
      }
    });

    return items;
  };

  const contatosData = parseSectionPart(contatosPart);
  const informacoesData = parseSectionPart(informacoesPart);
  const imagensData = parseSectionPart(imagensPart);

  const contatosItems = useMemo(() => (contatosData ? parseContatos(contatosData.content) : []), [contatosData]);
  const informacoesItems = useMemo(() => (informacoesData ? parseInformacoes(informacoesData.content) : []), [informacoesData]);
  const imagensItems = useMemo(() => (imagensData ? parseImagens(imagensData.content) : []), [imagensData]);

  // Extract fields for selection
  const cad = reportData?.cadastro || {};
  const hasNome = Boolean(profileData?.nome || cad?.Nome);
  const hasHospital = Boolean(profileData?.hospitalNome || cad?.hospitalName || cad?.hospital_nome);
  const hasQuarto = Boolean(profileData?.roomNumber || cad?.roomNumber || cad?.room_number);
  const statusStr = allStatuses.find((s) => s.id === profileData?.status)?.nome || (profileData?.status && profileData?.status !== "Não informado" ? profileData?.status : cad?.Status);
  const hasStatus = Boolean(statusStr && statusStr !== "Sem Status" && statusStr !== "Não informado");
  const procedimentoStr = profileData?.procedure || cad?.procedure || profileData?.surgery_type || cad?.surgery_type;
  const hasProcedimento = Boolean(procedimentoStr);
  const hasIdade = Boolean(profileData?.idade && profileData?.idade !== "N/A");
  const obsStr = cad?.Observacoes || cad?.observacoes || cad?.descricao;
  const hasObservacoes = Boolean(obsStr);

  // All selectable keys
  const allKeys = useMemo(() => {
    const keys: string[] = [];
    if (hasNome) keys.push("header_nome");
    if (hasHospital) keys.push("header_hospital");
    if (hasQuarto) keys.push("header_quarto");
    if (hasStatus) keys.push("header_status");
    if (hasProcedimento) keys.push("header_procedimento");
    if (hasIdade) keys.push("header_idade");
    if (hasObservacoes) keys.push("header_observacoes");

    contatosItems.forEach((_, idx) => keys.push(`contato_${idx}`));
    informacoesItems.forEach((_, idx) => keys.push(`info_${idx}`));
    imagensItems.forEach((_, idx) => keys.push(`img_${idx}`));

    return keys;
  }, [hasNome, hasHospital, hasQuarto, hasStatus, hasProcedimento, hasIdade, hasObservacoes, contatosItems, informacoesItems, imagensItems]);

  // State for showing checkboxes (activated when clicking WhatsApp icon)
  const [showCheckboxes, setShowCheckboxes] = useState(false);

  // Default all keys selected
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set(allKeys));

  // Sync if allKeys length changes dynamically
  React.useEffect(() => {
    setSelectedKeys(new Set(allKeys));
  }, [allKeys.join(",")]);

  const isAllSelected = allKeys.length > 0 && selectedKeys.size === allKeys.length;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(allKeys));
    }
  };

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const { userWhatsapp, whatsappNumber } = useGroup();

  // Get user profile or patient whatsapp phone number
  const getUserPhone = () => {
    const rawPhone = userWhatsapp || whatsappNumber || cad?.Telefone || cad?.phone || profileData?.telefone || "";
    const cleanDigits = rawPhone.replace(/\D/g, "");
    if (!cleanDigits) return "";
    if (!cleanDigits.startsWith("55") && (cleanDigits.length === 10 || cleanDigits.length === 11)) {
      return "55" + cleanDigits;
    }
    return cleanDigits;
  };

  // Helper to shorten long image URLs for WhatsApp messages
  const shortenImageLink = async (url: string): Promise<string> => {
    if (!url) return "";
    if (url.length < 50) return url;
    try {
      const res = await fetch("/api/shorten-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.shortUrl) return data.shortUrl;
      }
    } catch (e) {
      console.warn("Failed to shorten image link:", e);
    }
    return url;
  };

  // Generate WhatsApp message text containing ONLY selected fields
  const generateWhatsAppMessage = async () => {
    const sections: string[] = [];

    // Header info lines
    const headerLines: string[] = [];
    if (selectedKeys.has("header_nome") && (profileData?.nome || cad?.Nome)) {
      headerLines.push(`*Paciente*: ${profileData?.nome || cad?.Nome}`);
    }
    if (selectedKeys.has("header_hospital") && (profileData?.hospitalNome || cad?.hospitalName || cad?.hospital_nome)) {
      headerLines.push(`*Hospital*: ${profileData?.hospitalNome || cad?.hospitalName || cad?.hospital_nome}`);
    }
    if (selectedKeys.has("header_quarto") && (profileData?.roomNumber || cad?.roomNumber || cad?.room_number)) {
      headerLines.push(`*Quarto*: ${profileData?.roomNumber || cad?.roomNumber || cad?.room_number}`);
    }
    if (selectedKeys.has("header_status") && statusStr && statusStr !== "Sem Status" && statusStr !== "Não informado") {
      headerLines.push(`*Diagnóstico*: ${statusStr}`);
    }
    if (selectedKeys.has("header_procedimento") && procedimentoStr) {
      headerLines.push(`*Procedimento*: ${procedimentoStr}`);
    }
    if (selectedKeys.has("header_idade") && profileData?.idade && profileData?.idade !== "N/A") {
      headerLines.push(`*Idade*: ${profileData.idade} ${Number(profileData.idade) === 1 ? "ANO" : "ANOS"}`);
    }
    if (selectedKeys.has("header_observacoes") && obsStr) {
      headerLines.push(`*Observações*: ${obsStr}`);
    }

    if (headerLines.length > 0) {
      sections.push(headerLines.join("\n"));
    }

    // Selected Contatos
    const selContatos = contatosItems.filter((_, idx) => selectedKeys.has(`contato_${idx}`));
    if (selContatos.length > 0) {
      const cLines = selContatos.map((c) => {
        const phone = c.phoneLinkText ? ` - ${c.phoneLinkText}` : "";
        return `• ${c.name}${phone}`;
      });
      sections.push(`*Contatos*:\n${cLines.join("\n")}`);
    }

    // Selected Informações
    const selInfos = informacoesItems.filter((_, idx) => selectedKeys.has(`info_${idx}`));
    if (selInfos.length > 0) {
      const iLines = selInfos.map((inf) => {
        const dateStr = inf.date ? ` (${inf.date})` : "";
        return `• ${inf.content}${dateStr}`;
      });
      sections.push(`*Informações*:\n${iLines.join("\n")}`);
    }

    // Selected Imagens
    const selImgs = imagensItems.filter((_, idx) => selectedKeys.has(`img_${idx}`));
    if (selImgs.length > 0) {
      const imgLines = await Promise.all(
        selImgs.map(async (img) => {
          const desc = img.alt || "Imagem";
          const dateStr = img.date ? ` (${img.date})` : "";
          const shortUrl = img.src ? await shortenImageLink(img.src) : "";
          const linkStr = shortUrl ? `\n  Link: ${shortUrl}` : "";
          return `• ${desc}${dateStr}${linkStr}`;
        })
      );
      sections.push(`*Imagens*:\n${imgLines.join("\n")}`);
    }

    return sections.join("\n\n").trim();
  };

  const handleShareWhatsApp = async () => {
    const textToShare = await generateWhatsAppMessage();
    if (!textToShare) {
      alert("Selecione pelo menos um item para compartilhar.");
      return;
    }

    const userPhone = getUserPhone();
    const encodedText = encodeURIComponent(textToShare);

    const selImgs = imagensItems.filter((_, idx) => selectedKeys.has(`img_${idx}`));
    const hasImagesSelected = selImgs.length > 0;

    if (hasImagesSelected && typeof navigator !== "undefined" && navigator.share && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      try {
        await navigator.share({
          title: `Ficha do Paciente - ${profileData?.nome || ""}`,
          text: textToShare,
        });
        return;
      } catch (err: any) {
        if (err.name !== "AbortError") {
          console.warn("Native share fallback to wa.me:", err);
        } else {
          return; // User cancelled
        }
      }
    }

    const waUrl = userPhone
      ? `https://wa.me/${userPhone}?text=${encodedText}`
      : `https://wa.me/?text=${encodedText}`;

    window.open(waUrl, "_blank", "noopener,noreferrer");
  };

  const mdComponents = {
    a({ children, ...props }: any) {
      const href = props.href;
      if (href && href.startsWith("/")) {
        return (
          <span
            onClick={() => handleSend(undefined, href, false)}
            className="text-blue-600 hover:underline cursor-pointer font-normal"
          >
            {children}
          </span>
        );
      }
      return <a {...props} target="_blank" rel="noopener noreferrer">{children}</a>;
    },
  };

  return (
    <div className="flex flex-col gap-5 pb-20 relative">
      {/* Top Bar when selection mode is active */}
      {showCheckboxes && (
        <div className="bg-emerald-50/90 border border-emerald-200 rounded-2xl p-3.5 shadow-sm flex items-center justify-between transition-all animate-fade-in">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isAllSelected}
              onChange={toggleSelectAll}
              className="w-4.5 h-4.5 rounded text-emerald-600 focus:ring-emerald-500 border-gray-300 cursor-pointer accent-emerald-600"
            />
            <span className="text-xs font-bold text-emerald-950 uppercase tracking-wide">
              Selecionar todos para WhatsApp
            </span>
          </label>
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-bold text-emerald-700">
              {selectedKeys.size} / {allKeys.length}
            </span>
            <button
              onClick={() => setShowCheckboxes(false)}
              className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-white/80 hover:bg-white px-2.5 py-1 rounded-lg border border-slate-200 transition-all"
            >
              Concluir
            </button>
          </div>
        </div>
      )}

      {/* Patient header card */}
      {profileData && (
        <>
          <div className="glass-card rounded-3xl p-5 flex flex-row items-center justify-between gap-4 relative overflow-hidden shadow-sm">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-100/10 rounded-full -mr-12 -mt-12 blur-2xl"></div>

            {/* Coluna da Esquerda: Nome, Idade e Botão Editar */}
            <div className="flex flex-col items-start relative z-10 min-w-0 flex-1">
              {hasNome && (
                <div className="flex items-center gap-2.5 w-full mb-1.5">
                  {showCheckboxes && (
                    <input
                      type="checkbox"
                      checked={selectedKeys.has("header_nome")}
                      onChange={() => toggleKey("header_nome")}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-gray-300 cursor-pointer accent-emerald-600 shrink-0"
                      title="Selecionar Nome"
                    />
                  )}
                  <h3 className="text-base sm:text-lg font-bold text-slate-800 tracking-tight leading-tight truncate flex-1">
                    {profileData.nome}
                  </h3>
                </div>
              )}

              <div className="flex flex-row items-center gap-2 mt-0.5">
                {hasIdade && (
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    {showCheckboxes && (
                      <input
                        type="checkbox"
                        checked={selectedKeys.has("header_idade")}
                        onChange={() => toggleKey("header_idade")}
                        className="w-3.5 h-3.5 rounded text-emerald-600 border-gray-300 cursor-pointer accent-emerald-600 shrink-0"
                        title="Selecionar Idade"
                      />
                    )}
                    <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg shrink-0 uppercase tracking-wider">
                      {`${profileData.idade} ${Number(profileData.idade) === 1 ? "ANO" : "ANOS"}`}
                    </span>
                  </label>
                )}
                <button
                  onClick={() => handleDirectCommand(`/edit_name ${profileData?.id}`)}
                  className="text-[9px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50/50 px-2.5 py-1 rounded-lg hover:bg-blue-100/75 transition-all shrink-0 font-sans"
                >
                  Editar
                </button>
              </div>
            </div>

            {/* Coluna da Direita: Hospital e Quarto */}
            <div className="flex flex-col items-end gap-1.5 relative z-10 shrink-0 text-right min-w-[110px] max-w-[160px] sm:max-w-[220px]">
              {hasHospital && (
                <label className="flex items-center gap-1.5 cursor-pointer justify-end w-full">
                  <span className="text-xs font-bold text-blue-500 tracking-tight truncate uppercase" title={profileData?.hospitalNome || "Sem Hospital"}>
                    {profileData?.hospitalNome || "Sem Hospital"}
                  </span>
                  {showCheckboxes && (
                    <input
                      type="checkbox"
                      checked={selectedKeys.has("header_hospital")}
                      onChange={() => toggleKey("header_hospital")}
                      className="w-3.5 h-3.5 rounded text-emerald-600 border-gray-300 cursor-pointer accent-emerald-600 shrink-0"
                      title="Selecionar Hospital"
                    />
                  )}
                </label>
              )}

              {hasQuarto && (
                <label className="flex items-center gap-1.5 cursor-pointer justify-end w-full">
                  <span className="text-[11px] font-medium text-slate-400 truncate">
                    Quarto: {profileData?.roomNumber || "Não inf."}
                  </span>
                  {showCheckboxes && (
                    <input
                      type="checkbox"
                      checked={selectedKeys.has("header_quarto")}
                      onChange={() => toggleKey("header_quarto")}
                      className="w-3.5 h-3.5 rounded text-emerald-600 border-gray-300 cursor-pointer accent-emerald-600 shrink-0"
                      title="Selecionar Quarto"
                    />
                  )}
                </label>
              )}
            </div>
          </div>

          {/* Status, WhatsApp toggle, and schedule actions */}
          <div className="flex flex-row items-center justify-between gap-2.5">
            <div className="flex-1 flex items-center gap-2 min-w-0">
              {showCheckboxes && hasStatus && (
                <input
                  type="checkbox"
                  checked={selectedKeys.has("header_status")}
                  onChange={() => toggleKey("header_status")}
                  className="w-4 h-4 rounded text-emerald-600 border-gray-300 cursor-pointer accent-emerald-600 shrink-0"
                  title="Selecionar Status/Diagnóstico"
                />
              )}
              <button
                onClick={() => handleDirectCommand(`/status_alterar ${profileData?.id}`)}
                className="w-full glass-button border-blue-100/40 h-11 rounded-2xl text-blue-600 text-xs font-bold uppercase tracking-wider flex items-center justify-center hover:bg-white/70 transition-all active:scale-95 shadow-sm"
              >
                <span className="truncate px-1">
                  {statusStr}
                </span>
              </button>
            </div>

            {/* WhatsApp toggle button */}
            <button
              onClick={() => setShowCheckboxes((prev) => !prev)}
              className={`h-11 px-3.5 rounded-2xl transition-all flex items-center justify-center gap-1.5 active:scale-[0.98] text-xs font-bold uppercase tracking-wider shrink-0 shadow-sm ${
                showCheckboxes
                  ? "bg-emerald-700 text-white shadow-emerald-600/20 ring-2 ring-emerald-500"
                  : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/10"
              }`}
              title="Alternar modo WhatsApp"
            >
              <MessageSquare size={16} fill="currentColor" className="shrink-0" />
              <span className="hidden xs:inline sm:inline">WhatsApp</span>
            </button>

            <button
              onClick={() => handleDirectCommand(`/calendario_form pid: ${profileData?.id}, paciente: ${profileData?.nome}, hospId: ${profileData?.hospitalId}, room: ${profileData?.roomNumber}, type: ${profileData?.surgery_type}, procedure: ${profileData?.procedure || ""}`)}
              className="flex-1 bg-emerald-600 text-white h-11 rounded-2xl shadow-lg shadow-emerald-500/10 hover:bg-emerald-700 transition-all flex items-center justify-center gap-1.5 active:scale-[0.98] text-xs font-bold uppercase tracking-wider min-w-0"
            >
              <CalendarPlus size={16} className="text-emerald-100 shrink-0" />
              <span className="truncate px-1 font-bold">Agendar</span>
            </button>
          </div>
        </>
      )}

      {/* Header text part if present */}
      {headerPart.trim() && (
        <div className="markdown-body prose prose-sm max-w-none [&_p]:mb-1.5 last:[&_p]:mb-0 bg-white rounded-3xl border border-gray-100 shadow-sm p-4">
          <ReactMarkdown rehypePlugins={[rehypeRaw]} components={mdComponents}>
            {headerPart}
          </ReactMarkdown>
        </div>
      )}

      {/* --- SECTION CARD: CONTATOS --- */}
      {contatosData && (
        <div className="bg-white rounded-[1.25rem] border border-gray-100 shadow-sm overflow-hidden flex flex-col">
          {/* Section Header */}
          <div className="bg-blue-50/50 px-5 py-3.5 border-b border-blue-100/50 flex items-center gap-3">
            <button
              onClick={() => handleSend(undefined, contatosData.command, false)}
              className="bg-blue-600 text-white w-7 h-7 flex items-center justify-center rounded-full hover:bg-blue-700 transition-all font-bold shadow-md shadow-blue-500/20 shrink-0"
            >
              <Plus size={14} strokeWidth={3} />
            </button>
            <span className="text-sm font-bold text-blue-900 uppercase tracking-wider font-sans">
              {contatosData.title}
            </span>
          </div>

          {/* Section Content */}
          <div className="p-5 flex flex-col gap-4">
            {contatosItems.length === 0 ? (
              <p className="text-xs text-slate-400 italic font-medium">Nenhum registro</p>
            ) : (
              contatosItems.map((c, idx) => {
                const itemKey = `contato_${idx}`;
                return (
                  <div key={idx} className="flex flex-col gap-2 pb-4 last:pb-0 border-b border-gray-50 last:border-0">
                    <div className="flex flex-row items-center justify-between gap-3">
                      {showCheckboxes && (
                        <input
                          type="checkbox"
                          checked={selectedKeys.has(itemKey)}
                          onChange={() => toggleKey(itemKey)}
                          className="w-4 h-4 rounded text-emerald-600 border-gray-300 cursor-pointer accent-emerald-600 shrink-0"
                          title="Selecionar este contato"
                        />
                      )}
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="font-semibold text-slate-800 text-sm leading-snug">
                          {c.name}
                        </span>
                        {c.phoneLinkText && (
                          c.waUrl ? (
                            <a
                              href={c.waUrl}
                              onClick={(e) => {
                                e.preventDefault();
                                window.location.href = c.waUrl;
                              }}
                              className="text-xs font-medium text-blue-600 hover:underline inline-flex items-center gap-1 mt-0.5"
                            >
                              📞 {c.phoneLinkText}
                            </a>
                          ) : (
                            <span className="text-xs text-slate-400 mt-0.5">
                              {c.phoneLinkText}
                            </span>
                          )
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {c.editCmd && (
                          <button
                            onClick={() => handleDirectCommand(c.editCmd!)}
                            className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100/70 transition-all font-sans text-xs active:scale-90"
                            title="Editar Familiar"
                          >
                            ✏️
                          </button>
                        )}
                        {c.trashCmd && (
                          <button
                            onClick={() => {
                              setConfirmCommand({
                                title: "Remover este contato do histórico?",
                                cmd: c.trashCmd!,
                                shouldClear: false,
                              });
                            }}
                            className="w-8 h-8 rounded-full bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100/70 transition-all font-sans text-xs active:scale-90"
                            title="Remover Familiar"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* --- SECTION CARD: INFORMAÇÕES --- */}
      {informacoesData && (
        <div className="bg-white rounded-[1.25rem] border border-gray-100 shadow-sm overflow-hidden flex flex-col">
          {/* Section Header */}
          <div className="bg-blue-50/50 px-5 py-3.5 border-b border-blue-100/50 flex items-center gap-3">
            <button
              onClick={() => handleSend(undefined, informacoesData.command, false)}
              className="bg-blue-600 text-white w-7 h-7 flex items-center justify-center rounded-full hover:bg-blue-700 transition-all font-bold shadow-md shadow-blue-500/20 shrink-0"
            >
              <Plus size={14} strokeWidth={3} />
            </button>
            <span className="text-sm font-bold text-blue-900 uppercase tracking-wider font-sans">
              {informacoesData.title}
            </span>
          </div>

          {/* Section Content */}
          <div className="p-5 flex flex-col gap-4">
            {informacoesItems.length === 0 ? (
              <p className="text-xs text-slate-400 italic font-medium">Nenhum registro</p>
            ) : (
              informacoesItems.map((inf, idx) => {
                const itemKey = `info_${idx}`;
                return (
                  <div key={idx} className="flex flex-col gap-2 pb-4 last:pb-0 border-b border-gray-50 last:border-0 w-full">
                    <div className="flex flex-row items-start justify-between gap-3">
                      {showCheckboxes && (
                        <input
                          type="checkbox"
                          checked={selectedKeys.has(itemKey)}
                          onChange={() => toggleKey(itemKey)}
                          className="w-4 h-4 rounded text-emerald-600 border-gray-300 cursor-pointer accent-emerald-600 shrink-0 mt-0.5"
                          title="Selecionar esta informação"
                        />
                      )}
                      <div className="flex flex-col min-w-0 flex-1">
                        <p className="text-sm text-slate-700 font-medium leading-relaxed break-words whitespace-pre-wrap">
                          {inf.content}
                        </p>
                        {inf.date && (
                          <span className="text-[11px] font-medium text-slate-400 mt-1">
                            {inf.date}
                          </span>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {inf.editCmd && (
                          <button
                            onClick={() => handleDirectCommand(inf.editCmd!)}
                            className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100/70 transition-all font-sans text-xs active:scale-90"
                            title="Editar Informação"
                          >
                            ✏️
                          </button>
                        )}
                        {inf.trashCmd && (
                          <button
                            onClick={() => {
                              setConfirmCommand({
                                title: "Remover esta informação do histórico?",
                                cmd: inf.trashCmd!,
                                shouldClear: false,
                              });
                            }}
                            className="w-8 h-8 rounded-full bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100/70 transition-all font-sans text-xs active:scale-90"
                            title="Remover Informação"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* --- SECTION CARD: IMAGENS --- */}
      {imagensData && (
        <div className="bg-white rounded-[1.25rem] border border-gray-100 shadow-sm overflow-hidden flex flex-col">
          {/* Section Header */}
          <div className="bg-blue-50/50 px-5 py-3.5 border-b border-blue-100/50 flex items-center gap-3">
            <button
              onClick={() => handleSend(undefined, imagensData.command, false)}
              className="bg-blue-600 text-white w-7 h-7 flex items-center justify-center rounded-full hover:bg-blue-700 transition-all font-bold shadow-md shadow-blue-500/20 shrink-0"
            >
              <Plus size={14} strokeWidth={3} />
            </button>
            <span className="text-sm font-bold text-blue-900 uppercase tracking-wider font-sans">
              {imagensData.title}
            </span>
          </div>

          {/* Section Content */}
          <div className="p-5 flex flex-col gap-5">
            {imagensItems.length === 0 ? (
              <p className="text-xs text-slate-400 italic font-medium">Nenhum registro</p>
            ) : (
              imagensItems.map((img, idx) => {
                const itemKey = `img_${idx}`;
                const originalRecord = reportData?.imagens?.find((item: any) => item.link === img.src);
                const encryptionMeta = originalRecord?.encryption;

                return (
                  <div key={idx} className="flex flex-col gap-3 pb-4 last:pb-0 border-b border-gray-50 last:border-0 w-full">
                    {img.src && (
                      <div className="relative w-full aspect-[9/16] rounded-xl overflow-hidden shadow-sm border border-gray-100 bg-slate-100">
                        {showCheckboxes && (
                          <div className="absolute top-3 left-3 z-20 bg-white/90 backdrop-blur-sm p-1.5 rounded-lg border border-gray-200/50 shadow-sm flex items-center">
                            <input
                              type="checkbox"
                              checked={selectedKeys.has(itemKey)}
                              onChange={() => toggleKey(itemKey)}
                              className="w-4 h-4 rounded text-emerald-600 border-gray-300 cursor-pointer accent-emerald-600"
                              title="Selecionar esta imagem"
                            />
                          </div>
                        )}
                        <E2EMedia
                          src={img.src}
                          encryption={encryptionMeta}
                          fallbackType={isPdfUrl(img.src) ? "pdf" : isVideoUrl(img.src) ? "video" : "image"}
                          alt={img.alt || "Imagem de exame"}
                          className="w-full h-full object-cover animate-fade-in"
                        />
                      </div>
                    )}

                    <div className="flex flex-row items-center justify-between gap-3">
                      {showCheckboxes && !img.src && (
                        <input
                          type="checkbox"
                          checked={selectedKeys.has(itemKey)}
                          onChange={() => toggleKey(itemKey)}
                          className="w-4 h-4 rounded text-emerald-600 border-gray-300 cursor-pointer accent-emerald-600 shrink-0"
                          title="Selecionar este documento"
                        />
                      )}
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="font-semibold text-slate-800 text-sm leading-snug">
                          {img.alt || "Sem descrição"}
                        </span>
                        {img.date && (
                          <span className="text-[11px] font-medium text-slate-400 mt-1">
                            {img.date}
                          </span>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {img.trashCmd && (
                          <button
                            onClick={() => {
                              setConfirmCommand({
                                title: "Remover esta imagem?",
                                cmd: img.trashCmd!,
                                shouldClear: false,
                              });
                            }}
                            className="w-8 h-8 rounded-full bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100/70 transition-all font-sans text-xs active:scale-90"
                            title="Remover Imagem"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </div>

                    {img.aiAnalysis && (
                      <div className="bg-blue-50/10 border border-blue-50/50 rounded-2xl p-3.5 text-xs text-slate-600 mt-1 flex flex-col gap-1.5">
                        <span className="font-bold text-blue-800 flex items-center gap-1">
                          🤖 Análise Inteligente:
                        </span>
                        <p className="whitespace-pre-wrap leading-relaxed">
                          {img.aiAnalysis}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Floating WhatsApp Share Button at the bottom */}
      <div className="sticky bottom-4 z-30 pt-2">
        {!showCheckboxes ? (
          <button
            onClick={() => setShowCheckboxes(true)}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 px-5 rounded-2xl shadow-xl shadow-emerald-600/30 transition-all flex items-center justify-center gap-2.5 active:scale-[0.98] text-xs sm:text-sm uppercase tracking-wider"
          >
            <MessageSquare size={18} fill="currentColor" className="shrink-0" />
            <span>Compartilhar via WhatsApp</span>
          </button>
        ) : (
          <button
            onClick={handleShareWhatsApp}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 px-5 rounded-2xl shadow-xl shadow-emerald-600/30 transition-all flex items-center justify-center gap-2.5 active:scale-[0.98] text-xs sm:text-sm uppercase tracking-wider animate-fade-in"
          >
            <MessageSquare size={18} fill="currentColor" className="shrink-0" />
            <span>Enviar no WhatsApp ({selectedKeys.size})</span>
          </button>
        )}
      </div>
    </div>
  );
};
