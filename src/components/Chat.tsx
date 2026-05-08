import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Send, User, Bot, Loader2, Plus, Sparkles, Image as ImageIcon, X, Shield, LogOut, Lock, Info, Settings, CalendarPlus, Edit3, Building2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import { tools, executeTool, ai } from "../lib/gemini";
import { auth, db } from "../lib/firebase";
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  orderBy, 
  getDocs, 
  addDoc, 
  serverTimestamp 
} from "firebase/firestore";
import { useGroup } from "../contexts/GroupContext";
import { OperationType, handleFirestoreError } from "../lib/firestoreUtils";

interface Message {
  role: "user" | "model";
  text: string;
  image?: string;
  audio?: string;
  isProfile?: boolean;
  profileData?: {
    id: string;
    nome: string;
    idade: string;
    status?: string;
    hospitalId?: string;
    hospitalNome?: string;
    roomNumber?: string;
  };
  form?: {
    title?: string;
    fields: { 
      label: string; 
      name: string; 
      type: string; 
      placeholder?: string; 
      defaultValue?: string;
      options?: string[];
    }[];
    submitLabel: string;
    commandPrefix: string;
  };
  isListing?: boolean;
  listingTitle?: string;
  actionGroups?: { title: string; actions: { label: string; cmd: string; active?: boolean }[] }[];
}

const MessageForm: React.FC<{ 
  form: any; 
  onSubmit: (cmd: string) => void;
  selectedImage?: string | null;
  onSelectImage?: (img: string | null) => void;
}> = ({ form, onSubmit, selectedImage, onSelectImage }) => {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    form.fields.forEach((f: any) => {
      initial[f.name] = f.defaultValue || "";
    });
    return initial;
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resizeImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
          } else {
            if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.7));
        };
      };
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onSelectImage) {
      const dataUrl = await resizeImage(file);
      onSelectImage(dataUrl);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parts = Object.entries(values).map(([k, v]) => `${k}: ${v}`);
    let fullCmd = `${form.commandPrefix} ${parts.join(", ")}`;
    onSubmit(fullCmd);
  };

  const isImageForm = form.commandPrefix?.startsWith("/img");

  return (
    <form onSubmit={handleSubmit} className="mt-4 p-4 bg-white/50 rounded-2xl border border-blue-100 space-y-3 shadow-sm">
      {form.title && <h4 className="text-sm font-bold text-blue-800 mb-2">{form.title}</h4>}
      
      {isImageForm && (
        <div className="space-y-2">
          <label className="text-[10px] uppercase tracking-wider font-bold text-gray-500 ml-1">Anexar Documento / Foto</label>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            className="hidden" 
            accept="image/*" 
          />
          
          {selectedImage ? (
            <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-gray-200 group">
              <img src={selectedImage} alt="Preview" className="w-full h-full object-cover" />
              <button 
                type="button"
                onClick={() => onSelectImage?.(null)}
                className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button 
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full aspect-video bg-white border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center text-gray-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition-all gap-2"
            >
              <ImageIcon size={32} />
              <span className="text-xs font-medium">Toque para selecionar imagem</span>
            </button>
          )}
        </div>
      )}

      {form.fields.map((field: any) => (
        <div key={field.name}>
          <label className="text-[10px] uppercase tracking-wider font-bold text-gray-500 ml-1">{field.label}</label>
          {field.options && field.options.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2 ml-1">
              {field.options.map((opt: string) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setValues(prev => ({ ...prev, [field.name]: opt }))}
                  className="px-2 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-bold border border-blue-100 hover:bg-blue-100 transition-colors"
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
          {field.type === "select" ? (
            <select
              value={values[field.name]}
              onChange={(e) => setValues(prev => ({ ...prev, [field.name]: e.target.value }))}
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none cursor-pointer"
              required
            >
              <option value="" disabled>Selecione uma opção</option>
              {field.options?.map((opt: string) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : field.readOnly ? (
            <div className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 font-medium">
              {values[field.name] || <span className="text-gray-400">{field.placeholder}</span>}
            </div>
          ) : (
            <input 
              type={field.type}
              value={values[field.name]}
              onChange={(e) => setValues(prev => ({ ...prev, [field.name]: e.target.value }))}
              placeholder={field.placeholder}
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              required
              {...(field.type === "number" ? { inputMode: "numeric" } : {})}
            />
          )}
          {field.suggestions && field.suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2 ml-1">
              {field.suggestions.map((opt: string) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setValues(prev => ({ ...prev, [field.name]: opt }))}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black transition-all uppercase border shadow-sm ${
                    values[field.name] === opt 
                      ? "bg-blue-600 border-blue-600 text-white shadow-blue-100" 
                      : "bg-white border-gray-100 text-gray-500 hover:border-blue-600 hover:text-blue-600"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      
      <div className="flex flex-row items-center justify-between gap-4 pt-2">
        <div className="flex flex-col">
          {form.hospitalName && (
            <div className="flex items-center gap-1.5 text-blue-600">
              <Building2 size={14} />
              <span className="text-[11px] font-black uppercase tracking-tight truncate max-w-[150px]">
                {form.hospitalName}
              </span>
            </div>
          )}
          {form.roomNumber && (
            <span className="text-[10px] font-bold text-gray-400 ml-5 leading-none">
              Quarto {form.roomNumber}
            </span>
          )}
        </div>

        <button 
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-1.5 shadow-lg shadow-blue-100"
        >
          <Plus size={14} />
          {form.submitLabel}
        </button>
      </div>
    </form>
  );
};

export const Chat: React.FC<{ 
  onNavigateToCalendar?: () => void,
  initialCommand?: string | null,
  onCommandExecuted?: () => void
}> = ({ onNavigateToCalendar, initialCommand, onCommandExecuted }) => {
  const { activeGroup, companyName, whatsappNumber, apiFetch } = useGroup();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [lastProcessedFile, setLastProcessedFile] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Group Configurations
  const [groupHospitals, setGroupHospitals] = useState<{id: string, nome: string}[]>([]);
  const [groupStatuses, setGroupStatuses] = useState<{id: string, nome: string}[]>([]);
  const [groupProcedures, setGroupProcedures] = useState<string[]>([]);

  useEffect(() => {
    if (!activeGroup?.id) return;

    const gId = activeGroup.id;
    
    // Statuses
    const statusRef = collection(db, "patient_statuses");
    const qStatus = query(statusRef, where("groupId", "==", gId), orderBy("name"));
    const unsubStatus = onSnapshot(qStatus, (snap) => {
      setGroupStatuses(snap.docs.map(d => ({ id: d.id, nome: d.data().name })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, "patient_statuses"));

    // Hospitals
    const hospRef = collection(db, "hospitals");
    const qHosp = query(hospRef, where("groupId", "==", gId), orderBy("name"));
    const unsubHosp = onSnapshot(qHosp, (snap) => {
      setGroupHospitals(snap.docs.map(d => ({ id: d.id, nome: d.data().name })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, "hospitals"));

    // Procedures
    const procRef = collection(db, "procedureOptions");
    const qProc = query(procRef, where("groupId", "==", gId), orderBy("nome"));
    const unsubProc = onSnapshot(qProc, (snap) => {
      setGroupProcedures(snap.docs.map(d => d.data().nome));
    }, (err) => handleFirestoreError(err, OperationType.LIST, "procedureOptions"));

    return () => {
      unsubStatus();
      unsubHosp();
      unsubProc();
    };
  }, [activeGroup?.id]);

  // Compatibility aliases (if needed by existing code)
  const hospitalOptions = groupHospitals;
  const statusOptions = groupStatuses;
  const procedureOptions = groupProcedures;
  
  // Create a mutable reference for the agent so we can reset it
  const agentRef = useRef<any>(null);


  useEffect(() => {
    setMessages([
      { 
        role: "model", 
        text: `<div class="text-base font-medium">Hello ${companyName} ❤️<br/><br/>Hoje é um lindo dia para salvar vidas.</div>`
      }
    ]);

    import("../lib/gemini").then(({ createAgent }) => {
      if (!agentRef.current) agentRef.current = createAgent();
    });
  }, [companyName]);

  useEffect(() => {
    if (initialCommand && agentRef.current) {
      handleSend(undefined, initialCommand, true);
      onCommandExecuted?.();
    }
  }, [initialCommand, agentRef.current]);

  const resetAgent = async () => {
    const { createAgent } = await import("../lib/gemini");
    agentRef.current = createAgent();
    setMessages([{ role: "model", text: `Hello ${companyName} ❤️\n\nHoje é um lindo dia para salvar vidas.` }]);
    setSelectedImage(null);
    setLastProcessedFile(null);
    setTimeout(scrollToTop, 0);
  };

  const handleLogout = async () => {
    // Clear both possible cookie names matching the server configuration
    document.cookie = "__Secure-nexus-p-v1=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    document.cookie = "__Secure-nexus-u-v1=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    document.cookie = "google_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    
    // Server-side logout to clear httpOnly cookies
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: 'include' });
    } catch (e) {
      console.error("Logout failed", e);
    }
    window.location.reload();
  };

  useEffect(() => {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: "smooth"
    });
  }, [messages, isLoading]);

  const scrollToTop = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resizeImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX_WIDTH = 800; // Resize to save tokens
          const MAX_HEIGHT = 800;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.7)); // Compress to 70% JPEG
        };
      };
    });
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const compressedDataUrl = await resizeImage(file);
      setSelectedImage(compressedDataUrl);
    }
  };

  const generatePatientReport = (data: any) => {
    const cad = data.cadastro;
    const audios = data.audios.map((a: any) => `
<div style="margin-left: 24px; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #efefef;">
  <div style="margin-bottom: 2px;">${a.conteudo}</div>
  <div style="font-size: 12px; font-weight: bold; color: #4b5563;">${a.data}</div>
</div>`).join("");
    
    const docs = data.imagens.map((i: any) => {
      const downloadText = i.link ? ` <a href="${i.link}" target="_blank" rel="noopener noreferrer" className="ml-2 px-2 py-0.5 bg-blue-50 text-blue-600 rounded-md text-[10px] font-bold hover:bg-blue-100 transition-colors inline-block no-underline">Baixar Arquivo</a>` : "";
      
      let aiPart = "";
      if (i.aiResposta) {
        aiPart = `<div className="mt-1 text-blue-600">🤖 <b>AI:</b> ${i.aiResposta}</div>`;
      }

      const imgTag = i.link 
        ? `<div className="my-2"><img src="${i.link}" alt="${i.descricao}" className="max-w-full rounded-xl border border-gray-100 shadow-sm block" referrerPolicy="no-referrer" /></div>`
        : "";
      
      return `
<div className="ml-6 mb-3 pb-3 border-b border-gray-100">
  <div className="mb-0.5"><b>${i.descricao}</b>${aiPart}</div>
  ${imgTag}
  <div className="text-[10px] font-medium text-gray-500">${i.data}${downloadText} \`/ai_analyze id: ${i.id}, pId: ${cad.ID}, url: ${i.link}\`</div>
</div>`;
    }).join("");

    const fams = data.familiares.map((f: any) => {
      const cleanFone = f.fone ? f.fone.replace(/\D/g, "") : "";
      const waNumber = cleanFone ? (cleanFone.startsWith("55") ? cleanFone : "55" + cleanFone) : "";
      const foneLink = waNumber 
        ? `<a href="https://wa.me/${waNumber}" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: none;">📞 <b>${f.fone}</b></a>` 
        : "📞 Sem fone";
      return `
<div style="margin-left: 24px; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #efefef;">
  <div style="margin-bottom: 2px;">${f.nome} (${f.relacao})</div>
  <div style="font-size: 12px; font-weight: bold; color: #4b5563;">${foneLink}</div>
</div>`;
    }).join("");

    const cadFone = cad.Telefone;
    const cleanCadFone = cadFone ? cadFone.replace(/\D/g, "") : "";
    const waCadNumber = cleanCadFone ? (cleanCadFone.startsWith("55") ? cleanCadFone : "55" + cleanCadFone) : "";
    const cadFoneLink = waCadNumber 
      ? `<a href="https://wa.me/${waCadNumber}" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: none;">📞 <b>${cadFone}</b></a>` 
      : "";
    const patientContact = cadFoneLink ? `
<div style="margin-left: 24px; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #efefef;">
  <div style="margin-bottom: 2px;">Paciente (Próprio)</div>
  <div style="font-size: 12px; font-weight: bold; color: #4b5563;">${cadFoneLink}</div>
</div>` : "";

    const calendarLine = "";

    return calendarLine +
      `\`/novofamiliar id: ${cad.ID}, nome: ${cad.Nome} label:+\` **Contatos:**\n\n${patientContact}${fams || (patientContact ? "" : "Nenhum registro")}\n\n\n\n\n\n\n\n\n\n` +
      `\`/logpac id: ${cad.ID}, nome: ${cad.Nome} label:+\` **Informações:**\n\n${audios || "Nenhum registro"}\n\n\n\n\n\n\n\n\n\n` +
      `\`/prep_img id: ${cad.ID}, nome: ${cad.Nome} label:+\` **Imagens:**\n\n${docs || "Nenhum registro"}`;
  };

  const handleDirectCommand = async (command: string) => {
    const cmdInput = command.trim();
    const cmd = cmdInput.toLowerCase();
    
    if (cmd.startsWith("/agendar")) {
      const rawText = cmdInput.slice("/agendar".length).trim();
      let evento = "", hora = "", dataStr = "";

      if (rawText.includes(":")) {
        // Format with keys: evento: x, hora: y, data: z
        const parts: Record<string, string> = {};
        const pairs = rawText.split(",");
        pairs.forEach(p => {
          const partsArr = p.split(":");
          const k = partsArr[0]?.trim();
          const v = partsArr.slice(1).join(":").trim(); // Handle possible colons in values
          if (k && v) parts[k.toLowerCase()] = v;
        });
        evento = parts.evento || "";
        hora = parts.hora || "";
        dataStr = parts.data || "";
        const tipo = parts.tipo || "";
        const sala = parts.sala || "";
        if (tipo || sala) {
          evento += ` [${tipo}] [${sala}]`;
        }
      }

      if (!evento && (hora || dataStr)) {
        setInput(cmdInput);
        return "PREFILL";
      }

      if (!evento || !hora || !dataStr) {
        setMessages(prev => [...prev, { 
          role: "model", 
          text: "❌ **Formato incorreto.**\n\nUse: `/agendar evento: [NOME], data: [DD-MM-AAAA], hora: [HH:MM]`\nExemplo: `/agendar evento: Consulta, data: 15-05-2024, hora: 14:00`" 
        }]);
        return true;
      }

      setIsLoading(true);
      try {
        let eventDate = new Date();
        
        // Handle YYYY-MM-DD (from date picker) or DD-MM-YYYY (manual)
        if (dataStr.includes("-")) {
          const parts = dataStr.split("-");
          if (parts[0].length === 4) {
            // YYYY-MM-DD
            const [y, m, d] = parts;
            eventDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
          } else {
            // DD-MM-YYYY
            const [d, m, y] = parts;
            eventDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
          }
        } else if (dataStr.includes("/")) {
          const parts = dataStr.split("/");
          // DD/MM/YYYY
          const [d, m, y] = parts;
          eventDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
        }

        const timeParts = hora.split(":");
        const hh = parseInt(timeParts[0] || "12");
        const mm = parseInt(timeParts[1] || "00");
        
        if (isNaN(hh) || isNaN(mm)) throw new Error("Hora inválida. Use HH:MM");
        
        eventDate.setHours(hh, mm, 0, 0);

        if (isNaN(eventDate.getTime())) throw new Error("Data ou Hora inválida. Use DD-MM-AAAA");

        const pad = (n: number) => n.toString().padStart(2, "0");
        const dateStrIso = `${eventDate.getFullYear()}-${pad(eventDate.getMonth() + 1)}-${pad(eventDate.getDate())}T${pad(eventDate.getHours())}:${pad(eventDate.getMinutes())}:00`;
        const endEventDate = new Date(eventDate.getTime() + 60 * 60 * 1000);
        const endDateStrIso = `${endEventDate.getFullYear()}-${pad(endEventDate.getMonth() + 1)}-${pad(endEventDate.getDate())}T${pad(endEventDate.getHours())}:${pad(endEventDate.getMinutes())}:00`;

        const body = {
          summary: evento,
          start: { dateTime: dateStrIso, timeZone: "America/Sao_Paulo" },
          end: { dateTime: endDateStrIso, timeZone: "America/Sao_Paulo" },
          reminders: {
            useDefault: false,
            overrides: [
              { method: "popup", minutes: 30 }
            ]
          }
        };

        const res = await fetch("/api/calendar/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        const resData = await res.json();
        if (resData.error) throw new Error(resData.error);

        setMessages(prev => [...prev, { role: "model", text: `✅ **Agendado com sucesso!**\n\n📅 **${evento}**\n🕒 ${eventDate.toLocaleString("pt-BR")}` }]);
        await handleDirectCommand("/agenda");
      } catch (err: any) {
        setMessages(prev => [...prev, { role: "model", text: `❌ Erro ao agendar: ${err.message}` }]);
      } finally {
        setIsLoading(false);
        return true;
      }
    }

    if (cmd === "/agenda") {
      setIsLoading(true);
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        
        const dayAfterTomorrow = new Date(today);
        dayAfterTomorrow.setDate(today.getDate() + 2);
        
        const res = await fetch(`/api/calendar/events?timeMin=${today.toISOString()}&timeMax=${dayAfterTomorrow.toISOString()}`);
        const data = await res.json();
        
        const formatDate = (date: Date) => {
          return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
        };

        const formatEvent = (e: any) => {
          const start = new Date(e.start.dateTime || e.start.date);
          const timeStr = start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
          return `• ${timeStr} - ${e.summary} \`/remover_evento ${e.id}\``;
        };

        const todayEvents = data.filter((e: any) => {
          const start = new Date(e.start.dateTime || e.start.date);
          return start >= today && start < tomorrow;
        });

        const tomorrowEvents = data.filter((e: any) => {
          const start = new Date(e.start.dateTime || e.start.date);
          return start >= tomorrow && start < dayAfterTomorrow;
        });

        const todayList = todayEvents.map(formatEvent).join("\n\n");
        const tomorrowList = tomorrowEvents.map(formatEvent).join("\n\n");

        const fullAgenda = 
          `**📅 Sua Agenda (${formatDate(today)}):**\n\n${todayList || "Sem compromissos."}\n\n` +
          `**📅 Sua Agenda (${formatDate(tomorrow)}):**\n\n${tomorrowList || "Sem compromissos."}\n\n` +
          `*Nota: Esta agenda é pessoal e visível apenas para você.*`;

        setMessages([{ 
          role: "model", 
          text: fullAgenda,
          actionGroups: [
            {
              title: "Ações",
              actions: [
                { label: "➕ Novo Agendamento", cmd: "/iniciaragenda" }
              ]
            }
          ]
        }]);
        setTimeout(scrollToTop, 0);
      } catch (err: any) {
        setMessages(prev => [...prev, { role: "model", text: `❌ Erro ao buscar agenda: ${err.message}` }]);
      } finally {
        setIsLoading(false);
        return true;
      }
    }

    if (cmd === "/iniciarcadastro") {
      setMessages(prev => [...prev, { 
        role: "model", 
        text: "👤 **Novo Paciente**",
        form: {
          title: "",
          fields: [
            { label: "Nome", name: "nome", type: "text", placeholder: "Ex: João Silva" },
            { label: "Idade", name: "idade", type: "number", placeholder: "Ex: 30" },
            { 
              label: "Hospital", 
              name: "hospitalName", 
              type: "text", 
              placeholder: "Toque em um hospital abaixo",
              // @ts-ignore
              readOnly: true,
              suggestions: hospitalOptions.map(h => h.nome)
            },
            { 
              label: "Status Inicial", 
              name: "status", 
              type: "text", 
              placeholder: "Toque em um status abaixo",
              // @ts-ignore
              readOnly: true,
              suggestions: statusOptions.map(s => s.nome),
              defaultValue: "Pré-operatorio"
            },
            { label: "Quarto/Leito", name: "roomNumber", type: "text", placeholder: "Ex: 402B" },
          ],
          submitLabel: "Registrar Paciente",
          commandPrefix: "/registrar"
        }
      }]);
      return true;
    }

    if (cmd.startsWith("/calendario_add")) {
      const rawText = cmdInput.slice("/calendario_add".length).trim();
      const parts: Record<string, string> = {};
      const pairs = rawText.split(",");
      pairs.forEach(p => {
        const partsArr = p.split(":");
        const k = partsArr[0]?.trim();
        const v = partsArr.slice(1).join(":").trim();
        if (k && v) parts[k.toLowerCase()] = v;
      });

      const evento = parts.evento || "";
      const dataStr = parts.data || "";
      const hora = parts.hora || "";
      const categoria = parts.categoria || "";
      const sala = parts.sala || "";
      const hospName = parts.hospitalid || ""; // form fields use names as values for selects often, but let's check
      
      const selectedHospital = hospitalOptions.find(h => h.nome === hospName || h.id === hospName);
      const hostIdResolved = selectedHospital ? selectedHospital.id : "";

      const pid = parts.pid || "";

      if (!evento || !dataStr || !hora) {
        setMessages(prev => [...prev, { role: "model", text: "❌ Dados incompletos para o calendário." }]);
        return true;
      }

      setIsLoading(true);
      try {
        if (!auth.currentUser) throw new Error("Usuário não autenticado");

        const GROUP_ID = activeGroup?.id || "main-group";
        const eventsRef = collection(db, "groups", GROUP_ID, "calendario");
        
        await addDoc(eventsRef, {
          evento,
          data: dataStr,
          hora,
          tipo: categoria,
          sala,
          descricao: `Categoria: ${categoria}, Sala: ${sala}`,
          groupId: GROUP_ID,
          patientId: pid,
          hospitalId: hostIdResolved,
          createdBy: auth.currentUser.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        if (pid) {
          setMessages([]);
          await handleDirectCommand(`/p ${pid}`);
        } else {
          setMessages(prev => [...prev, { 
            role: "model", 
            text: `✅ **Evento adicionado ao Calendário!**\n\n📅 **${evento}**\n🕒 ${dataStr} às ${hora}\n📍 ${sala} (${categoria})` 
          }]);
        }
      } catch (err: any) {
        handleFirestoreError(err, OperationType.WRITE, `groups/${activeGroup?.id || "main-group"}/calendario`);
      } finally {
        setIsLoading(false);
        return true;
      }
    }

    if (cmd === "/iniciaragenda") {
      const today = new Date();
      const pad = (n: number) => n.toString().padStart(2, "0");
      const hojeStrIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`; // YYYY-MM-DD for picker
      const agoraStr = `${pad(today.getHours())}:00`;
      
      setMessages(prev => [...prev, { 
        role: "model", 
        text: "📅 **Novo Agendamento (Google Agenda)**\n\nPreencha os detalhes do compromisso:",
        form: {
          title: "Agendar Compromisso",
          fields: [
            // @ts-ignore
            { label: "Evento / Descrição", name: "evento", type: "text", placeholder: "Ex: Consulta de Retorno" },
            { label: "Data", name: "data", type: "date", defaultValue: hojeStrIso },
            { label: "Horário", name: "hora", type: "time", defaultValue: agoraStr },
          ],
          submitLabel: "Adicionar à Agenda",
          commandPrefix: "/agendar"
        }
      }]);
      return true;
    }

    if (cmd.startsWith("/calendario_form")) {
      let patientName = cmdInput.match(/paciente:\s*([^,]+)/i)?.[1]?.trim() || "";
      let pid = cmdInput.match(/pid:\s*([\w-]+)/i)?.[1]?.trim() || "";
      let hospId = cmdInput.match(/hospId:\s*([\w-]+)/i)?.[1]?.trim() || "";
      let roomNumber = cmdInput.match(/room:\s*([^,]+)/i)?.[1]?.trim() || "";
      
      const today = new Date();
      const pad = (n: number) => n.toString().padStart(2, "0");
      const hojeStrIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`; 
      const agoraStr = `${pad(today.getHours())}:00`;
      
      const hospName = hospitalOptions.find(h => h.id === hospId)?.nome || "";

      setMessages([]); // NEW VIEW
      setMessages([{ 
        role: "model", 
        text: "📅 **Novo Evento no Calendário**\n\nPreencha os detalhes do evento:",
        form: {
          title: "Novo Evento",
          hospitalName: hospName,
          roomNumber: roomNumber,
          fields: [
            { 
              label: "Evento / Descrição", 
              name: "evento", 
              type: "text", 
              placeholder: "Ex: Cirurgia de Quadril", 
              defaultValue: patientName ? `Cirurgia - ${patientName}` : "",
              // @ts-ignore
              suggestions: procedureOptions
            },
            { 
              label: "Hospital", 
              name: "hospitalId", 
              type: "select", 
              options: hospitalOptions.map(h => h.nome),
              defaultValue: hospName
            },
            // @ts-ignore
            { label: "Categoria", name: "categoria", type: "select", options: ["ELETIVA", "URGÊNCIA"], defaultValue: "ELETIVA" },
            { label: "Sala", name: "sala", type: "select", options: ["SALA 1", "SALA 2"], defaultValue: "SALA 1" },
            { label: "Data", name: "data", type: "date", defaultValue: hojeStrIso },
            { label: "Horário", name: "hora", type: "time", defaultValue: agoraStr }
          ],
          submitLabel: "Adicionar ao Calendário",
          commandPrefix: pid ? `/calendario_add pid: ${pid},` : "/calendario_add"
        }
      }]);
      return true;
    }

    if (cmd === "/enviarimagem") {
      setIsLoading(true);
      try {
        const res = await apiFetch("/api/app/patients");
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        
        const list = data.map((p: any) => `• **${p.nome}** (ID: ${p.id}) - \`/prep_img ${p.id}\``).join("\n\n");
        setMessages(prev => [...prev, { 
          role: "model", 
          text: `🖼️ **Para qual paciente deseja enviar a imagem?**\n\n${list || "Nenhum paciente encontrado."}` 
        }]);
      } catch (err: any) {
        setMessages(prev => [...prev, { role: "model", text: `❌ Erro: ${err.message}` }]);
      } finally {
        setIsLoading(false);
        return true;
      }
    }

    // Handle Add Hospital form
    if (cmd.startsWith("/hospital")) {
      const nome = cmd.match(/nome:\s*([^,]+)/i)?.[1]?.trim();
      const telefone = cmd.match(/telefone:\s*(.+)/i)?.[1]?.trim() || "";

      if (nome) {
        setIsLoading(true);
        apiFetch("/api/app/hospitals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome, telefone })
        })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              setMessages(prev => [...prev, { role: "model", text: `✅ **Hospital Adicionado!**\n\n🏥 **${nome}** foi cadastrado com sucesso.` }]);
            } else {
              setMessages(prev => [...prev, { role: "model", text: `❌ **Erro ao adicionar hospital:** ${data.error || "Ocorreu um erro inesperado."}` }]);
            }
          })
          .catch(err => {
            console.error(err);
            setMessages(prev => [...prev, { role: "model", text: "❌ **Erro de conexão** ao tentar adicionar o hospital." }]);
          })
          .finally(() => setIsLoading(false));
        return true;
      }
    }

    if (cmd.startsWith("/prep_img")) {
      const id = cmdInput.match(/id:\s*([^,]+)/i)?.[1]?.trim() || cmdInput.split(" ")[1];
      const nome = cmdInput.match(/nome:\s*([^,]+)/i)?.[1]?.trim() || cmdInput.match(/nome:\s*(.+)/i)?.[1]?.trim();

      if (id) {
        setIsLoading(true);
        apiFetch("/api/app/image-options")
          .then(res => res.json())
          .then(options => {
            setMessages([{
              role: "model",
              text: `🖼️ **Anexar Imagem**\n\n### 📌 **Paciente:** ${nome ? nome : id}`,
              form: {
                title: "",
                fields: [
                  { 
                    label: "Descrição / Título", 
                    name: "descrição", 
                    type: "text", 
                    placeholder: "Ex: Raio-X do tórax",
                    options: Array.isArray(options) ? options : []
                  }
                ],
                submitLabel: "Enviar Imagem",
                commandPrefix: `/img id: ${id},`
              }
            }]);
          })
          .catch(err => {
            console.error("Error fetching image options", err);
            // Fallback without options
            setMessages([{
              role: "model",
              text: `🖼️ **Anexar Imagem**\n\n### 📌 **Paciente:** ${nome ? nome : id}`,
              form: {
                title: "",
                fields: [
                  { label: "Descrição / Título", name: "descrição", type: "text", placeholder: "Ex: Raio-X do tórax" }
                ],
                submitLabel: "Enviar Imagem",
                commandPrefix: `/img id: ${id},`
              }
            }]);
          })
          .finally(() => {
            setIsLoading(false);
          });
        return true;
      }
    }

    if (cmd === "/config_menu") {
      setMessages(prev => [...prev, { 
        role: "model", 
        text: "⚙️ **Configurações do Sistema**\n\nEscolha o que deseja gerenciar:",
        form: {
          title: "Menu de Configuração",
          fields: [],
          submitLabel: "Voltar", // Not used if we add custom buttons below
          commandPrefix: "/"
        }
      }]);
      // We'll append a message with the config buttons manually to avoid form constraints
      setMessages(prev => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg.role === "model" && lastMsg.text.includes("Configurações")) {
          return [...prev.slice(0, -1), {
            ...lastMsg,
            text: "⚙️ **Configurações do Sistema**\n\nSelecione uma opção:\n\n• [🏥 Hospitais](/hospitais)\n• [🏷️ Status](/list_statuses)\n• [🖼️ Tipos de Imagem](/list_image_options)"
          }];
        }
        return prev;
      });
      return true;
    }

    if (cmd === "/list_statuses") {
      setIsLoading(true);
      try {
        const res = await apiFetch("/api/app/statuses");
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        
        const list = data.map((s: any) => `• ${typeof s === 'string' ? s : s.nome || s.name}`).join("\n");
        setMessages(prev => [...prev, { 
          role: "model", 
          text: `🏷️ **Status Disponíveis:**\n\n${list || "Nenhum status encontrado."}` 
        }]);
      } catch (err: any) {
        setMessages(prev => [...prev, { role: "model", text: `❌ Erro ao buscar status: ${err.message}` }]);
      } finally {
        setIsLoading(false);
        return true;
      }
    }

    if (cmd === "/list_image_options") {
      setIsLoading(true);
      try {
        const res = await apiFetch("/api/app/image-options");
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        
        const list = data.map((s: string) => `• ${s}`).join("\n");
        setMessages(prev => [...prev, { 
          role: "model", 
          text: `🖼️ **Tipos de Imagem (Opções de Descrição):**\n\n${list || "Nenhuma opção encontrada."}` 
        }]);
      } catch (err: any) {
        setMessages(prev => [...prev, { role: "model", text: `❌ Erro ao buscar opções de imagem: ${err.message}` }]);
      } finally {
        setIsLoading(false);
        return true;
      }
    }
    
    if (cmd === "/iniciarrelat") {
      setIsLoading(true);
      try {
        const res = await apiFetch("/api/app/patients");
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        
        const list = data.map((p: any) => `• **${p.nome}** (ID: ${p.id}) - \`/p ${p.id}\``).join("\n\n");
        setMessages(prev => [...prev, { 
          role: "model", 
          text: `🚀 **Selecione o paciente para ver o relatório:**\n\n${list || "Nenhum paciente encontrado."}` 
        }]);
      } catch (err: any) {
        setMessages(prev => [...prev, { role: "model", text: `❌ Erro: ${err.message}` }]);
      } finally {
        setIsLoading(false);
        return true;
      }
    }

    if (cmd.startsWith("/prep_p")) {
      const id = cmdInput.split(" ")[1];
      if (id) {
        setInput(`/p ${id}`);
        return "PREFILL";
      }
    }

    if (cmd === "/iniciarlog") {
      setIsLoading(true);
      try {
        const res = await apiFetch("/api/app/patients");
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        
        const list = data.map((p: any) => `• **${p.nome}** (ID: ${p.id}) - Digite \`/logpac ${p.id}\``).join("\n\n");
        setMessages(prev => [...prev, { 
          role: "model", 
          text: `📝 **Para qual paciente deseja adicionar o log?**\n\n${list || "Nenhum paciente encontrado."}\n\n*Clique no comando ou digite \`/logpac ID\`*` 
        }]);
      } catch (err: any) {
        setMessages(prev => [...prev, { role: "model", text: `❌ Erro: ${err.message}` }]);
      } finally {
        setIsLoading(false);
        return true;
      }
    }

    if (cmd === "/iniciarfamiliar") {
      setIsLoading(true);
      try {
        const res = await apiFetch("/api/app/patients");
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        
        const list = data.map((p: any) => `• **${p.nome}** (ID: ${p.id}) - \`/novo_familiar ${p.id}\``).join("\n\n");
        setMessages(prev => [...prev, { 
          role: "model", 
          text: `👪 **Gestão de Familiares**\n\nSelecione um paciente para cadastrar um novo familiar:\n\n${list || "Nenhum paciente encontrado."}` 
        }]);
      } catch (err: any) {
        setMessages(prev => [...prev, { role: "model", text: `❌ Erro: ${err.message}` }]);
      } finally {
        setIsLoading(false);
        return true;
      }
    }


    if (cmd.startsWith("/novofamiliar") || cmd.startsWith("/novo_familiar")) {
      const id = cmdInput.match(/id:\s*([^,]+)/i)?.[1]?.trim() || cmdInput.split(" ")[1];
      let nome = cmdInput.match(/nome:\s*([^,]+)/i)?.[1]?.trim() || cmdInput.match(/nome:\s*(.+)/i)?.[1]?.trim();
      
      // Remove any trailing label part if present in the name match
      if (nome && nome.includes("label:")) {
        nome = nome.split("label:")[0].trim();
      }

      if (id) {
        setMessages([{
          role: "model",
          text: `👪 **Novo Contato**\n\n📌 **Paciente:** ${nome || id}`,
          form: {
            title: "",
            fields: [
              { label: "Nome", name: "name", type: "text" },
              { label: "Afinidade", name: "relationship", type: "text", placeholder: "Ex: Filho(a), Esposa..." },
              { label: "Telefone", name: "phone", type: "text", placeholder: "(xx) xxxxx-xxxx" },
            ],
            submitLabel: "+Salvar",
            commandPrefix: `/salvarfamiliar patientId: ${id},`
          }
        }]);
        return true;
      }
    }

    if (cmd.startsWith("/logpac")) {
      const id = cmdInput.match(/id:\s*([^,]+)/i)?.[1]?.trim() || cmdInput.split(" ")[1];
      let nome = cmdInput.match(/nome:\s*([^,]+)/i)?.[1]?.trim() || cmdInput.match(/nome:\s*(.+)/i)?.[1]?.trim();
      
      if (nome && nome.includes("label:")) {
        nome = nome.split("label:")[0].trim();
      }

      if (id) {
        setMessages([{
          role: "model",
          text: `📝 **Adicionar Info**\n\n📌 **Paciente:** ${nome || id}`,
          form: {
            title: "",
            fields: [
              { label: "Informação", name: "text", type: "textarea", placeholder: "Digite aqui..." }
            ],
            submitLabel: "+Salvar",
            commandPrefix: `/salvarlog patientId: ${id},`
          }
        }]);
        return true;
      }
    }

    if (cmd === "/iniciarhospital") {
      setMessages(prev => [...prev, { 
        role: "model", 
        text: `🏥 **Cadastro de Novo Hospital**\n\nPreencha os dados abaixo para registrar:`,
        form: {
          title: "Novo Hospital",
          fields: [
            { label: "Nome do Hospital", name: "nome", type: "text", placeholder: "Ex: Hospital Moinhos de Vento" },
            { label: "Telefone", name: "fone", type: "number", placeholder: "Ex: 5133334444" },
            { label: "Contato 1", name: "c1", type: "text" },
            { label: "Contato 2", name: "c2", type: "text" },
            { label: "Contato 3", name: "c3", type: "text" },
          ],
          submitLabel: "Salvar Hospital",
          commandPrefix: "/hospital_add"
        }
      }]);
      return true;
    }

    if (cmd === "/hospitais") {
      setIsLoading(true);
      try {
        const res = await apiFetch("/api/app/hospitals");
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        
        const list = data.map((h: any) => {
          const contatosStr = h.contatos.map((c: string, idx: number) => `  - Contato ${idx + 1}: ${c}`).join("\n");
          return `• **${h.nome}**\n  📞 ${h.fone || "Sem fone"}\n${contatosStr}`;
        }).join("\n\n");
        
        setMessages(prev => [...prev, { 
          role: "model", 
          text: `🏥 **Lista de Hospitais:**\n\n${list || "Nenhum hospital encontrado."}\n\n[➕ Adicionar Novo Hospital](/iniciarhospital)` 
        }]);
      } catch (err: any) {
        setMessages(prev => [...prev, { role: "model", text: `❌ Erro ao buscar hospitais: ${err.message}` }]);
      } finally {
        setIsLoading(false);
        return true;
      }
    }

    if (cmd.startsWith("/hospital_add")) {
      setIsLoading(true);
      try {
        const getVal = (label: string) => {
          const regex = new RegExp(`${label}:\\s*([^,]+)`, "i");
          const match = cmdInput.match(regex);
          return match ? match[1].trim() : "";
        };

        const nome = getVal("nome");
        const fone = getVal("fone");
        const c1 = getVal("c1");
        const c2 = getVal("c2");
        const c3 = getVal("c3");
        const c4 = getVal("c4");
        const c5 = getVal("c5");

        if (!nome) throw new Error("O campo 'nome:' é obrigatório.");

        const res = await apiFetch("/api/app/hospitals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome, fone, contatos: [c1, c2, c3, c4, c5].filter(Boolean) })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        setMessages(prev => [...prev, { 
          role: "model", 
          text: `✅ **Hospital cadastrado com sucesso!**\nNome: **${nome}**\n📞 ${fone || "Não informado"}` 
        }]);
      } catch (err: any) {
        setMessages(prev => [...prev, { role: "model", text: `❌ Erro no cadastro de hospital: ${err.message}` }]);
      } finally {
        setIsLoading(false);
        return true;
      }
    }

    if (cmd.startsWith("/p ") || (/^\/p\d+/i).test(cmd)) {
      let id = "";
      if (cmd.startsWith("/p ")) {
        id = cmdInput.split(" ")[1];
      } else {
        id = cmd.match(/\/p(\d+)/i)?.[1] || "";
      }
      
      if (!id) throw new Error("Especifique um ID (ex: /p 1)");

      setIsLoading(true);
      try {
        const res = await apiFetch(`/api/app/patient-report/${id}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        const cad = data.cadastro;
        const reportText = generatePatientReport(data);

        setMessages([{ 
          role: "model", 
          text: reportText,
          isProfile: true,
          profileData: {
            id: cad.ID.toString(),
            nome: cad.Nome,
            idade: cad.Idade ? cad.Idade.toString() : "N/A",
            status: cad.Status,
            hospitalId: cad.hospitalId,
            hospitalNome: hospitalOptions.find(h => h.id === cad.hospitalId || h.nome === cad.hospital_nome)?.nome || cad.hospital_nome || "Não informado",
            roomNumber: cad.roomNumber || cad.room_number || "Sala ?"
          }
        }]);
        setTimeout(scrollToTop, 0);
      } catch (err: any) {
        setMessages(prev => [...prev, { role: "model", text: `❌ Erro: ${err.message}` }]);
      } finally {
        setIsLoading(false);
        return true;
      }
    }

    if (cmd.startsWith("/novo_hospital")) {
      setMessages([{
        role: "model",
        text: "🏥 **Cadastrar Novo Hospital**\n\nPreencha os dados abaixo para adicionar um registro aos seus serviços.",
        form: {
          title: "",
          fields: [
            { label: "Nome do Hospital", name: "nome", type: "text", placeholder: "Ex: Hospital São Camilo" },
            { label: "Telefone / Contato", name: "telefone", type: "text", placeholder: "(11) 99999-9999" }
          ],
          submitLabel: "Salvar Hospital",
          commandPrefix: "/hospital"
        }
      }]);
      return true;
    }

    if (cmd.startsWith("/pacientes")) {
      setIsLoading(true);
      try {
        const getFilterValue = (key: string) => {
          const regex = new RegExp(`\\b${key}:\\s*([^\\s]*)`, 'i');
          const match = cmdInput.match(regex);
          if (!match) return undefined;
          return match[1].trim();
        };

        const hospitalFilter = getFilterValue('hospital');
        const statusFilter = getFilterValue('status');

        let apiUrl = "/api/app/patients?full=true";
        if (hospitalFilter !== undefined) {
          apiUrl += `&hospitalId=${encodeURIComponent(hospitalFilter)}`;
        }
        if (statusFilter !== undefined) {
          apiUrl += `&statusId=${encodeURIComponent(statusFilter)}`;
        }

        const res = await apiFetch(apiUrl);
        const json = await res.json();
        
        if (json.error) throw new Error(json.error);
        
        const data = json.patients || [];
        const masterHospitalsData = json.hospitals || [];
        const masterStatuses = json.statuses || [];

        let page = 1;
        let sort = "id";
        
        const pagMatch = cmdInput.match(/pag:\s*(\d+)/i);
        if (pagMatch) page = parseInt(pagMatch[1]);
        
        const sortMatch = cmdInput.match(/sort:\s*(\w+)/i);
        if (sortMatch) sort = sortMatch[1].toLowerCase();

        let filteredData = [...data];
        // Data is now filtered on the server via hospitalId and statusId query parameters.

        if (sort === "nome") {
          filteredData.sort((a, b) => a.nome.localeCompare(b.nome));
        } else {
          filteredData.sort((a, b) => (parseInt(b.id) || 0) - (parseInt(a.id) || 0));
        }

        const hospitals = masterHospitalsData.map((h: any) => h.nome).filter(Boolean);
        const statuses = Array.isArray(masterStatuses) ? masterStatuses.filter(Boolean) : [];

        const PAGE_SIZE = 10;
        const totalPages = Math.ceil(filteredData.length / PAGE_SIZE);
        const pageToView = Math.max(1, Math.min(page, totalPages || 1));
        const start = (pageToView - 1) * PAGE_SIZE;
        const end = start + PAGE_SIZE;
        const pageData = filteredData.slice(start, end);

        let listText = `<div style="display: flex; justify-content: flex-end; margin-bottom: 20px;">\n\n[➕ Novo Paciente](/iniciarcadastro)\n\n</div>\n\n`;

        const isHospFiltered = hospitalFilter && hospitalFilter !== "1";
        const isStatusFiltered = statusFilter && statusFilter !== "1";

        if (isHospFiltered) {
          const selectedHospital = masterHospitalsData.find((h: any) => h.id.toString() === hospitalFilter);
          if (selectedHospital) {
            listText += `<div style="font-size: 20px; font-weight: 800; color: #111827; margin-top: 10px; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center;"><span style="color: #3b82f6; margin-right: 10px;">🏥</span> ${selectedHospital.nome}</div>\n\n`;
          }
        }
        if (isStatusFiltered) {
          const selectedStatus = masterStatuses.find((s: any) => s.id.toString() === statusFilter);
          if (selectedStatus) {
            listText += `<div style="font-size: 20px; font-weight: 800; color: #111827; margin-top: ${isHospFiltered ? "0" : "10"}px; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center;"><span style="color: #3b82f6; margin-right: 10px;">📋</span> ${selectedStatus.nome}</div>\n\n`;
          }
        }

        if (isStatusFiltered && !isHospFiltered) {
          // GROUP BY HOSPITAL
          const hospitalGrouped: Record<string, { id: string, name: string, patients: any[] }> = {};
          pageData.forEach((p: any) => {
            const hName = p.hospitalName || "Sem Hospital";
            const hId = p.hospitalId?.toString() || "999";
            if (!hospitalGrouped[hId]) {
              hospitalGrouped[hId] = { id: hId, name: hName, patients: [] };
            }
            hospitalGrouped[hId].patients.push(p);
          });

          const sortedHospitals = Object.values(hospitalGrouped).sort((a, b) => a.name.localeCompare(b.name));
          sortedHospitals.forEach(({ name: hName, patients }, hIdx) => {
            const marginTop = (hIdx === 0) ? "0px" : "24px";
            listText += `<div style="font-size: 17px; font-weight: bold; color: #1e40af; background-color: #eff6ff; padding: 8px 12px; border-radius: 8px; margin-top: ${marginTop}; margin-bottom: 8px; display: flex; align-items: center; border-left: 4px solid #3b82f6;"><span style="margin-right: 6px;">🏥</span> ${hName}</div>`;
            patients.forEach(p => {
              const roomDisplay = p.roomNumber ? ` - ${p.roomNumber}` : "";
              listText += `<div style="padding: 4px 12px; border-bottom: 1px solid #f3f4f6; font-size: 15px;">• <a href="/p ${p.id}"><strong>${p.nome}</strong></a>${roomDisplay}</div>`;
            });
          });
        } else {
          // GROUP BY STATUS
          const statusGrouped: Record<string, { id: string, name: string, patients: any[] }> = {};
          pageData.forEach((p: any) => {
            const sName = p.status || "Sem Status";
            const sId = p.statusId?.toString() || "999";
            if (!statusGrouped[sId]) {
              statusGrouped[sId] = { id: sId, name: sName, patients: [] };
            }
            statusGrouped[sId].patients.push(p);
          });

          const sortedStatuses = Object.values(statusGrouped).sort((a, b) => (parseInt(a.id) || 0) - (parseInt(b.id) || 0));
          sortedStatuses.forEach(({ name: sName, patients }, statusIdx) => {
            const marginTop = (statusIdx === 0) ? "0px" : "24px";
            listText += `<div style="font-size: 17px; font-weight: bold; color: #1e40af; background-color: #eff6ff; padding: 8px 12px; border-radius: 8px; margin-top: ${marginTop}; margin-bottom: 8px; display: flex; align-items: center; border-left: 4px solid #3b82f6;"><span style="margin-right: 6px;">📋</span> ${sName}</div>`;
            patients.forEach(p => {
              const roomDisplay = p.roomNumber ? ` - ${p.roomNumber}` : "";
              const hDisplay = p.hospitalName && !isHospFiltered ? ` <span style="color: #6b7280; font-size: 13px;">(${p.hospitalName})</span>` : "";
              listText += `<div style="padding: 4px 12px; border-bottom: 1px solid #f3f4f6; font-size: 15px;">• <a href="/p ${p.id}"><strong>${p.nome}</strong></a>${roomDisplay}${hDisplay}</div>`;
            });
          });
        }

        if (pageData.length === 0) {
          listText += "_Nenhum paciente encontrado._\n";
        }

        let nav = "";
        const cmdName = "/pacientes";
        const currentFilters = ` hospital:${hospitalFilter || ""} status:${statusFilter || ""}`;
        
        if (totalPages > 1) {
          nav = `\n\n📖 **Página ${pageToView} de ${totalPages}**\n`;
          if (pageToView > 1) nav += ` [\`⬅️ Ant\`](/pacientes${currentFilters} pag:${pageToView - 1} sort:${sort}) `;
          if (pageToView < totalPages) nav += ` [\`Próximo ➡️\`](/pacientes${currentFilters} pag:${pageToView + 1} sort:${sort}) `;
        }

        const actionGroups = [];
        if (hospitals.length > 0) {
          const sortedMasterHospitals = [...masterHospitalsData].sort((a, b) => a.nome.localeCompare(b.nome));
          const hospitalActions = sortedMasterHospitals.map((h: any) => {
            const hId = h.id.toString();
            return { 
              label: h.nome, 
              cmd: `/pacientes hospital:${hId} sort:${sort}`
            };
          });

          actionGroups.push({
            title: "Filtrar por Hospital",
            actions: hospitalActions
          });
        }

        if (statuses.length > 0) {
          const sortedMasterStatuses = [...masterStatuses].sort((a, b) => (parseInt(a.id) || 0) - (parseInt(b.id) || 0));
          const statusActions = sortedMasterStatuses.map((s: any) => {
            const sId = typeof s === 'string' ? s : s.id.toString();
            const sLabel = typeof s === 'string' ? s : s.nome;
            return { 
              label: sLabel, 
              cmd: `/pacientes status:${sId} sort:${sort}`
            };
          });

          actionGroups.push({
            title: "Filtrar por Status",
            actions: statusActions
          });
        }

        setMessages([{ 
          role: "model", 
          text: listText + (nav ? nav : ""),
          isListing: true,
          listingTitle: "", // User wants to remove the title
          actionGroups
        }]);
        setTimeout(scrollToTop, 0);
      } catch (err: any) {
        setMessages(prev => [...prev, { role: "model", text: `❌ Erro: ${err.message}` }]);
      } finally {
        setIsLoading(false);
        return true;
      }
    }

    if (cmd === "/edit_menu") {
      setMessages(prev => [...prev, { 
        role: "model", 
        text: "🔍 **Buscar Paciente para Editar**\n\nDigite o nome ou parte dele:",
        form: {
          title: "Buscar Paciente",
          fields: [
            { label: "Nome do Paciente", name: "termo", type: "text" },
          ],
          submitLabel: "Procurar",
          commandPrefix: "/buscar termo:"
        }
      }]);
      return true;
    }

    if (cmd.startsWith("/buscar")) {
      setIsLoading(true);
      try {
        const termo = cmdInput.match(/termo:\s*([^,]+)/i)?.[1]?.trim() || cmdInput.replace("/buscar", "").split(" ")[1] || "";
        let page = 1;
        let sort = "id";

        const pagMatch = cmdInput.match(/pag:\s*(\d+)/i);
        if (pagMatch) page = parseInt(pagMatch[1]);
        
        const sortMatch = cmdInput.match(/sort:\s*(\w+)/i);
        if (sortMatch) sort = sortMatch[1].toLowerCase();

        if (!termo && cmdInput.includes("termo:")) throw new Error("Informe um nome para buscar.");
        
        const res = await apiFetch("/api/app/patients");
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        let filtered = data;
        if (termo) {
          filtered = data.filter((p: any) => 
            p.nome.toLowerCase().includes(termo.toLowerCase()) || 
            p.id.toString() === termo
          );
        }

        if (sort === "nome") {
          filtered.sort((a: any, b: any) => a.nome.localeCompare(b.nome));
        } else {
          filtered.sort((a: any, b: any) => (parseInt(b.id) || 0) - (parseInt(a.id) || 0));
        }

        const PAGE_SIZE = 8;
        const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
        const pageToView = Math.max(1, Math.min(page, totalPages || 1));
        const start = (pageToView - 1) * PAGE_SIZE;
        const end = start + PAGE_SIZE;
        const pageData = filtered.slice(start, end);

        if (filtered.length === 0) {
          setMessages(prev => [...prev, { 
            role: "model", 
            text: `❌ Nenhum paciente encontrado para "**${termo || "todos"}**".` 
          }]);
        } else {
          const list = pageData.map((p: any) => {
            let text = `### \`/p ${p.id} label:${p.nome}\`  \n` +
                       `**Status:** ${p.status || "Não informado"}`;
            
            const hospitalInfo = [p.hospitalName, p.roomNumber].filter(Boolean).join(" - ");
            if (hospitalInfo) {
              text += `\n${hospitalInfo}`;
            }
            return text;
          }).join("\n\n\n");
          
          let nav = "";
          if (totalPages > 1) {
            nav = `\n\n📖 **Página ${pageToView} de ${totalPages}**\n`;
            const searchBase = termo ? `termo:${termo}` : "";
            if (pageToView > 1) nav += ` \`/buscar ${searchBase} pag:${pageToView - 1} sort:${sort}\` `;
            if (pageToView < totalPages) nav += ` \`/buscar ${searchBase} pag:${pageToView + 1} sort:${sort}\` `;
          }

          setMessages([{ 
            role: "model", 
            text: `🔍 **Resultados para "${termo || "todos"}":**\n\n${list}${nav}` 
          }]);
          setTimeout(scrollToTop, 0);
        }
      } catch (err: any) {
        setMessages(prev => [...prev, { role: "model", text: `❌ Erro na busca: ${err.message}` }]);
      } finally {
        setIsLoading(false);
        return true;
      }
    }

    if (cmd.startsWith("/edit_name")) {
      const id = cmdInput.split(" ")[1];
      if (!id) throw new Error("ID não informado.");
      
      setIsLoading(true);
      try {
        const pRes = await apiFetch(`/api/app/patient-report/${id}`);
        const pData = await pRes.json();
        if (pData.error) throw new Error(pData.error);
        
        const p = pData.cadastro;

        // Resolve Names for Display
        const currentHospital = hospitalOptions.find(h => h.id === p.hospitalId || h.nome === p.hospital_nome);
        const currentStatus = statusOptions.find(s => s.id === p.Status || s.nome === p.Status);
        
        setMessages([{ 
          role: "model", 
          text: `✏️ **Editar Cadastro: ${p.Nome} (ID: ${p.ID})**`,
          form: {
            title: "Atualizar Dados",
            fields: [
              { label: "Nome", name: "nome", type: "text", defaultValue: p.Nome },
              { label: "Idade", name: "idade", type: "number", defaultValue: p.Idade || "" },
              { 
                label: "Hospital", 
                name: "hospitalName", 
                type: "text", 
                defaultValue: currentHospital?.nome || p.hospital_nome || "",
                // @ts-ignore
                readOnly: true,
                suggestions: hospitalOptions.map(h => h.nome)
              },
              { 
                label: "Status", 
                name: "status", 
                type: "text", 
                defaultValue: currentStatus?.nome || p.Status || "",
                // @ts-ignore
                readOnly: true,
                suggestions: statusOptions.map(s => s.nome)
              },
              { label: "Quarto/Leito", name: "roomNumber", type: "text", defaultValue: p.roomNumber || p.room_number || "" },
            ],
            submitLabel: "Salvar Alterações",
            commandPrefix: `/update_patient id: ${id},`
          }
        }]);
        setTimeout(scrollToTop, 0);
      } catch (err: any) {
        setMessages(prev => [...prev, { role: "model", text: `❌ Erro ao buscar paciente: ${err.message}` }]);
      } finally {
        setIsLoading(false);
        return true;
      }
    }

    if (cmd.startsWith("/update_patient")) {
      setIsLoading(true);
      setMessages([]); // Clear screen immediately
      try {
        const id = cmdInput.match(/id:\s*([^,]+)/i)?.[1]?.trim();
        const nome = cmdInput.match(/nome:\s*([^,]+)/i)?.[1]?.trim();
        const fone = cmdInput.match(/fone:\s*([^,]+)/i)?.[1]?.trim();
        const idade = cmdInput.match(/idade:\s*([^,]+)/i)?.[1]?.trim();
        const hospitalName = cmdInput.match(/hospitalName:\s*([^,]+)/i)?.[1]?.trim();
        const roomNumber = cmdInput.match(/roomNumber:\s*([^,]+)/i)?.[1]?.trim();
        const status = cmdInput.match(/status:\s*([^,]+)/i)?.[1]?.trim();

        if (!id) throw new Error("ID não identificado.");

        // Resolve Names to IDs
        const selectedHospital = hospitalOptions.find(h => h.nome === hospitalName);
        const resolvedHospitalId = selectedHospital ? selectedHospital.id : hospitalName;

        const selectedStatus = statusOptions.find(s => s.nome === status);
        const resolvedStatusId = selectedStatus ? selectedStatus.id : status;

        const res = await apiFetch("/api/app/patients/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            id, 
            nome, 
            fone, 
            idade, 
            hospitalName: resolvedHospitalId, 
            roomNumber,
            status: resolvedStatusId
          })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        // Clear screen and show updated report
        setMessages([]);
        handleDirectCommand(`/p ${id}`);
      } catch (err: any) {
        setMessages(prev => [...prev, { role: "model", text: `❌ Erro na atualização: ${err.message}` }]);
      } finally {
        setIsLoading(false);
        return true;
      }
    }

    if (cmd.startsWith("/familiares")) {
      const id = cmdInput.split(" ")[1] || "all";
      const res = await apiFetch(`/api/app/family-members/${id}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      const list = data.map((f: any) => {
        const cleanFone = f.fone ? f.fone.replace(/\D/g, "") : "";
        const waNumber = cleanFone ? (cleanFone.startsWith("55") ? cleanFone : "55" + cleanFone) : "";
        const foneLink = waNumber 
          ? `<a href="https://wa.me/${waNumber}" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: none;">📞 <b>${f.fone}</b></a>` 
          : "📞 Sem fone";
        return `• **${f.nome}** (${f.relacao})\n  ${foneLink}\n  👤 Paciente: ${f.pacienteNome} (ID: ${f.pacienteId})`;
      }).join("\n\n");
      setMessages(prev => [...prev, { 
        role: "model", 
        text: `👪 **Familiares encontrados:**\n\n${list || "Nenhum familiar encontrado."}` 
      }]);
      return true;
    }

    if (cmd === "/ajuda") {
      setIsLoading(true);
      try {
        let dbInfoStr = "";
        try {
          const dbRes = await apiFetch("/api/app/db-info");
          const dbInfo = await dbRes.json();
          if (dbInfo.id) {
            dbInfoStr = `\n\n🛡️ **Planilha Conectada:**\n- Nome: ${dbInfo.name}\n- Owner: ${dbInfo.owner}\n- [Link da Planilha](${dbInfo.link})\n\n💡 Se você compartilhou esta planilha com outro usuário, ele deve clicar no link acima enquanto logado na conta Google dele para que o Google Drive dela "conheça" o arquivo.`;
          }
        } catch (e) {
          console.error("Failed to fetch DB info for help", e);
        }

        setMessages(prev => [...prev, { 
          role: "model", 
          text: "🤖 **Doctor Pro Shortcuts (Zero Tokens):**\n\n" +
                "- `/pacientes`: Lista todos os pacientes (Banco Compartilhado).\n" +
                "- `/buscar [NOME]`: Busca paciente por nome.\n" +
                "- `/p [ID]`: Relatório rápido (ex: `/p 2`).\n" +
                "- `/edit_name [ID]`: Editar nome ou idade do paciente.\n" +
                "- `/edit_menu`: Atalho direto para buscar e editar.\n" +
                "- `/contatos [ID]`: Lista contatos de um paciente.\n" +
                "- `/novo_familiar [ID]`: Atalho para cadastrar contato (familiar).\n" +
                "- `/registrar_familiar id: [ID], nome: [N], relacao: [R], fone: [F]`: Cadastro de contato.\n" +
                "- `/agendar data: [D], hora: [H], evento: [E]`: Cria evento na agenda Google.\n" +
                "- `/log id: [ID], texto: [T]`: Adiciona log de texto direto.\n" +
                "- `/img id: [ID], desc: [D]`: Envia imagem anexada direto para o Drive.\n" +
                "- `/registrar nome: [N], idade: [I]`: Cadastra paciente.\n" +
                "- `/iniciarcadastro`: Ajuda para cadastrar novo paciente.\n" +
                "- `/agenda`: **Sua** agenda pessoal (Privada).\n" +
                "- `/hospitais`: Lista todos os hospitais.\n" +
                "- `/iniciarhospital`: Ajuda para cadastrar novo hospital.\n" +
                "- `/hospital_add nome: [N], fone: [F], c1: [C1]...`: Cadastro de hospital.\n" +
                "- `/iniciaragenda`: Ajuda para marcar novo compromisso.\n"+
                "- `/limpar`: Reseta a memória da IA.\n" +
                "- `/ajuda`: Mostra esta lista.\n\n" +
                "💡 **Privacidade:** Pacientes são compartilhados com a equipe, mas a Agenda é individual de cada conta Google." +
                dbInfoStr
        }]);
      } catch (err: any) {
        setMessages(prev => [...prev, { role: "model", text: `❌ Erro: ${err.message}` }]);
      } finally {
        setIsLoading(false);
        return true;
      }
    }

    if (cmd.startsWith("/salvarfamiliar") || cmd.startsWith("/registrar_familiar")) {
      setIsLoading(true);
      try {
        const patientId = cmdInput.match(/patientId:\s*([^,]+)/i)?.[1]?.trim() || cmdInput.match(/id:\s*([^,]+)/i)?.[1]?.trim();
        const name = cmdInput.match(/name:\s*([^,]+)/i)?.[1]?.trim() || cmdInput.match(/nome_familiar:\s*([^,]+)/i)?.[1]?.trim() || cmdInput.match(/nome:\s*([^,]+)/i)?.[1]?.trim();
        const relationship = cmdInput.match(/relationship:\s*([^,]+)/i)?.[1]?.trim() || cmdInput.match(/tipo_parentesco:\s*([^,]+)/i)?.[1]?.trim() || cmdInput.match(/relacao:\s*([^,]+)/i)?.[1]?.trim();
        const phone = cmdInput.match(/phone:\s*([^,]+)/i)?.[1]?.trim() || cmdInput.match(/telefone:\s*([^,]+)/i)?.[1]?.trim() || cmdInput.match(/fone:\s*(.+)/i)?.[1]?.trim();

        if (!patientId || !name) throw new Error("ID do paciente e Nome são obrigatórios.");

        const res = await apiFetch("/api/app/patient-contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patientId, name, relationship, phone })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        setMessages([]);
        handleSend(undefined, `/p ${patientId}`, true);
      } catch (err: any) {
        setMessages(prev => [...prev, { role: "model", text: `❌ Erro no cadastro: ${err.message}` }]);
      } finally {
        setIsLoading(false);
        return true;
      }
    }

    if (cmd.startsWith("/salvarlog")) {
      setIsLoading(true);
      try {
        const patientId = cmdInput.match(/patientId:\s*([^,]+)/i)?.[1]?.trim();
        const text = cmdInput.match(/text:\s*(.+)/i)?.[1]?.trim();

        if (!patientId || !text) throw new Error("ID do paciente e Texto são obrigatórios.");

        const res = await apiFetch("/api/app/patient-logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patientId, text })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        const pRes = await apiFetch(`/api/app/patient-report/${patientId}`);
        const pData = await pRes.json();
        if (pData.id) {
          const reportText = generatePatientReport(pData);
          setMessages([{ 
            role: "model", 
            text: reportText,
            isProfile: true,
            profileData: {
              id: pData.id,
              nome: pData.cadastro.Nome,
              idade: pData.cadastro.Idade,
              status: pData.cadastro.Status,
              hospitalId: pData.cadastro.hospitalId,
              hospitalNome: hospitalOptions.find(h => h.id === pData.cadastro.hospitalId || h.nome === pData.cadastro.hospital_nome)?.nome || pData.cadastro.hospital_nome || "Não informado",
              roomNumber: pData.cadastro.roomNumber || pData.cadastro.room_number || "Sala ?"
            }
          }]);
          setTimeout(scrollToTop, 0);
        }
      } catch (error) {
        setMessages(prev => [...prev, { role: "model", text: `❌ Erro: ${(error as Error).message}` }]);
      } finally {
        setIsLoading(false);
      }
      return true;
    }

    if (cmd.startsWith("/log")) {
      setIsLoading(true);
      try {
        const patientId = cmdInput.match(/id:\s*([^,]+)/i)?.[1]?.trim();
        const patientNome = cmdInput.match(/p_nome:\s*([^,]+)/i)?.[1]?.trim();
        const text = cmdInput.match(/texto:\s*(.+)/i)?.[1]?.trim();

        if (!patientId || !text) throw new Error("Use: /log id: [ID], texto: [Sua transcrição]");

        const res = await apiFetch("/api/app/logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patientId, text, paciente_nome: patientNome })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        setMessages(prev => [...prev, { 
          role: "model", 
          text: `✅ **Texto adicionado com sucesso!**\nPaciente ID: **${patientId}**\n\nO conteúdo foi salvo na planilha "Log de Status".` 
        }]);
      } catch (err: any) {
        setMessages(prev => [...prev, { role: "model", text: `❌ Erro ao salvar log: ${err.message}` }]);
      } finally {
        setIsLoading(false);
        return true;
      }
    }

    if (cmd.startsWith("/open_calendar")) {
      if (onNavigateToCalendar) {
        onNavigateToCalendar();
      }
      return true;
    }

    if (cmd.startsWith("/img")) {
      setIsLoading(true);
      try {
        if (!selectedImage) throw new Error("Selecione uma imagem acima antes de enviar.");
        
        const id = cmdInput.match(/id:\s*([^,]+)/i)?.[1]?.trim();
        const descMatch = cmdInput.match(/(?:desc|descrição):\s*([^,]+)/i);
        const desc = descMatch ? descMatch[1]?.trim() : "";
        const useAI = cmdInput.includes("useAI: true");

        if (!id) throw new Error("Use: /img id: [ID], desc: [Opcional]");

        const mimeType = selectedImage.split(";")[0].split(":")[1];
        const base64Data = selectedImage.split(",")[1];

        const res = await apiFetch("/api/app/upload-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patientId: id,
            description: desc || "Documento via Chat",
            mimeType: mimeType,
            base64Data: base64Data,
            fileName: `Chat_P${id}_${new Date().getTime()}.jpg`
          })
        });
        
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        setMessages([]);
        
        if (useAI && data.fileId) {
          await handleDirectCommand(`/p ${id}`);
          setMessages(prev => [...prev, { role: "model", text: "⏳ **Solicitando análise inteligente da imagem enviada...**" }]);
          await handleDirectCommand(`/ai_analyze id: ${data.fileId}, pId: ${id}`);
        } else {
          await handleDirectCommand(`/p ${id}`);
        }

        setSelectedImage(null); // Clear image after upload
      } catch (err: any) {
        setMessages(prev => [...prev, { role: "model", text: `❌ Erro no upload: ${err.message}` }]);
      } finally {
        setIsLoading(false);
        return true;
      }
    }

    if (cmd.startsWith("/registrar")) {
      setIsLoading(true);
      try {
        // Simple parser for "nome: X, fone: Y, idade: Z"
        const parts = cmdInput.replace("/registrar", "").split(",");
        const getVal = (label: string) => {
          const part = parts.find(p => p.toLowerCase().includes(label.toLowerCase()));
          return part ? part.split(":")[1]?.trim() : "";
        };

        const nome = getVal("nome");
        const fone = getVal("fone");
        const idade = getVal("idade");
        const cpf = getVal("cpf");
        const hospitalName = getVal("hospitalName");
        const roomNumber = getVal("roomNumber");
        const status = getVal("status");

        if (!nome) throw new Error("O campo 'nome:' é obrigatório.");

        // Resolve Names to IDs
        const selectedHospital = hospitalOptions.find(h => h.nome === hospitalName);
        const resolvedHospitalId = selectedHospital ? selectedHospital.id : hospitalName;

        const selectedStatus = statusOptions.find(s => s.nome === status);
        const resolvedStatusId = selectedStatus ? selectedStatus.id : status;

        const res = await apiFetch("/api/app/patients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            nome, 
            fone, 
            idade, 
            cpf, 
            hospitalName: resolvedHospitalId, 
            roomNumber,
            status: resolvedStatusId
          })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        setMessages([]);
        await handleDirectCommand("/pacientes");
      } catch (err: any) {
        setMessages(prev => [...prev, { role: "model", text: `❌ Erro no cadastro: ${err.message}` }]);
      } finally {
        setIsLoading(false);
        return true;
      }
    }

    if (cmd.startsWith("/remover_evento")) {
      const eventPart = cmdInput.split(" ")[1];
      if (!eventPart) return true;
      
      setIsLoading(true);
      try {
        const res = await fetch(`/api/calendar/events/${eventPart}`, { method: "DELETE" });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        
        setMessages(prev => [...prev, { role: "model", text: "✅ Evento removido com sucesso!" }]);
        await handleDirectCommand("/agenda");
      } catch (err: any) {
        setMessages(prev => [...prev, { role: "model", text: `❌ Erro ao remover evento: ${err.message}` }]);
      } finally {
        setIsLoading(false);
        return true;
      }
    }

    if (cmd.startsWith("/status_alterar")) {
      const patId = cmdInput.split(" ")[1];
      if (!patId) return true;

      if (groupStatuses.length === 0) {
        setMessages(prev => [...prev, { role: "model", text: "⚠️ Configure os status do grupo no painel de gestão para usar esta função." }]);
        return true;
      }

      setMessages([]); // NEW VIEW
      setMessages([{
        role: "model",
        text: "🏷️ **Alterar Status**\n\nEscolha o novo status para o paciente:",
        actionGroups: [
          {
            title: "Selecione o Status",
            actions: groupStatuses.map((s: any) => ({
              label: s.nome,
              cmd: `/status_apply pac: ${patId}, sid: ${s.id}, sname: ${s.nome}`
            }))
          }
        ]
      }]);
      return true;
    }

    if (cmd.startsWith("/status_apply")) {
      const pacId = cmdInput.match(/pac:\s*([\w-]+)/i)?.[1]?.trim();
      const statusId = cmdInput.match(/sid:\s*([\w-]+)/i)?.[1]?.trim();
      const sname = cmdInput.match(/sname:\s*(.+)/i)?.[1]?.trim();

      if (!pacId || !statusId) {
        setMessages(prev => [...prev, { role: "model", text: "❌ Parâmetros inválidos para alteração de status." }]);
        return true;
      }

      setIsLoading(true);
      try {
        const res = await fetch("/api/app/patients/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patientId: pacId, status: statusId, statusName: sname })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        setMessages([]); // Clear to refresh with report
        await handleDirectCommand(`/p ${pacId}`);
      } catch (err: any) {
        setMessages(prev => [...prev, { role: "model", text: `❌ Erro ao atualizar status: ${err.message}` }]);
      } finally {
        setIsLoading(false);
        return true;
      }
    }

    if (cmd.startsWith("/ai_analyze")) {
      const fileId = cmdInput.match(/id:\s*([^, ]+)/i)?.[1]?.trim();
      const pId = cmdInput.match(/pId:\s*([^, ]+)/i)?.[1]?.trim() || "";
      const url = cmdInput.match(/url:\s*([^, ]+)/i)?.[1]?.trim() || "";

      if (!fileId) throw new Error("ID do arquivo não especificado.");

      setIsLoading(true);
      try {
        // 1. Check Quota
        const qRes = await fetch("/api/ai/check-quota");
        const qData = await qRes.json();
        if (qData.remaining <= 0) throw new Error(qData.error || "Você atingiu sua cota de 10 análises diárias.");

        // 2. Fetch image base64
        let base64 = "";
        let mimeType = "image/jpeg";

        if (url) {
          const imgFetchRes = await fetch(url);
          const blob = await imgFetchRes.blob();
          mimeType = blob.type;
          base64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
            reader.readAsDataURL(blob);
          });
        } else {
          throw new Error("Link da imagem não encontrado para análise.");
        }

        // 3. Call Gemini
        const result = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [
            {
              role: "user",
              parts: [
                { text: "Aja como um médico experiente e analise este documento ou imagem médica. Forneça uma análise técnica e objetiva em português." },
                { inlineData: { data: base64, mimeType: mimeType } }
              ]
            }
          ]
        });

        const analysis = result.text || "Análise indisponível.";

        // 4. Save analysis to database
        const saveRes = await fetch("/api/ai/save-analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId, analysis })
        });
        const saveData = await saveRes.json();
        if (!saveRes.ok) throw new Error(saveData.error || "Erro ao salvar análise.");

        setMessages(prev => [...prev, { role: "model", text: `✨ **Análise da IA Concluída:**\n\n${analysis}` }]);
        
        if (pId) {
          setTimeout(() => handleDirectCommand(`/p ${pId}`), 1500);
        }
      } catch (err: any) {
        setMessages(prev => [...prev, { role: "model", text: `❌ Erro na IA: ${err.message}` }]);
      } finally {
        setIsLoading(false);
        return true;
      }
    }

    if (cmd === "/limpar") {
      resetAgent();
      return true;
    }

    return false;
  };

  const handleSend = async (e?: React.FormEvent, customPrompt?: string, forceClear?: boolean) => {
    e?.preventDefault();
    const promptToSend = customPrompt || input;
    if (!promptToSend.trim() && !selectedImage || isLoading) return;

    if (customPrompt) {
      setTimeout(scrollToTop, 0);
    }

    const userMessage = promptToSend.trim();
    const userImage = selectedImage;

    if (forceClear) {
      setMessages([]);
    }

    // Direct Command Interceptor to save tokens
    if (userMessage.startsWith("/")) {
      const handled = await handleDirectCommand(userMessage);
      if (handled === "PREFILL") return; // Keep input as set by command
      if (handled) {
        setInput("");
        if (!forceClear) {
          setMessages(prev => [...prev, { role: "user", text: userMessage }]);
        }
        return;
      }
    }

    if (userImage) setLastProcessedFile(userImage);
    
    setInput("");
    setSelectedImage(null);
    setMessages(prev => [...prev, { 
      role: "user", 
      text: userMessage, 
      image: userImage || undefined
    }]);
    setIsLoading(true);

    try {
      let parts: any[] = [{ text: userMessage || "Process this file." }];
      if (userImage) {
        const base64Data = userImage.split(",")[1];
        const mimeType = userImage.split(";")[0].split(":")[1];
        parts.push({
          inlineData: {
            data: base64Data,
            mimeType: mimeType
          }
        });
      }

      let response = await agentRef.current.sendMessage({
        message: parts,
      });

      let shouldClearMemory = false;

      // Handle function calls
      let functionCalls = response.functionCalls;
      while (functionCalls && functionCalls.length > 0) {
        const toolResults = await Promise.all(
          functionCalls.map(async (call: any) => {
            if (call.name === "clear_local_memory") shouldClearMemory = true;
            return {
              name: call.name,
              result: await executeTool(call.name, call.args, { lastFile: userImage || lastProcessedFile })
            };
          })
        );

        response = await agentRef.current.sendMessage({
          message: toolResults.map((tr: any) => ({
            functionResponse: {
              name: tr.name,
              response: { result: tr.result }
            }
          })) as any,
        });
        functionCalls = response.functionCalls;
      }

      setMessages(prev => [...prev, { role: "model", text: response.text || "I've processed your request." }]);

      if (shouldClearMemory) {
        setTimeout(async () => {
          const { createAgent } = await import("../lib/gemini");
          agentRef.current = createAgent();
          setMessages(prev => [...prev, { role: "model", text: "🧹 *Memória interna da IA limpa automaticamente para economizar cota. O histórico acima será mantido na tela apenas para sua leitura.*" }]);
          setLastProcessedFile(null);
        }, 800);
      }
    } catch (error: any) {
      console.error("Chat error:", error);
      const errorMessage = error?.message || "I encountered an error while processing that.";
      setMessages(prev => [...prev, { role: "model", text: `Error: ${errorMessage}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div id="nexus-chat" className="flex flex-col bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden relative">
      {/* Messages */}
      <div ref={scrollRef} className="px-2 sm:px-6 py-4 space-y-6">

        <AnimatePresence initial={false}>
          {messages.filter(m => m.role === "model").map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.2 }}
              className="flex justify-start"
            >
              <div className="flex gap-3 w-full">
                <div className={`p-3 rounded-2xl text-sm bg-gray-50 text-gray-800 border border-gray-100 shadow-sm w-full overflow-hidden ${msg.isProfile ? 'pt-0 ring-1 ring-blue-100' : ''}`}>
                  {msg.isListing && msg.listingTitle && (
                    <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-100">
                      <h3 className="text-base font-extrabold text-gray-800 tracking-tight">{msg.listingTitle}</h3>
                      <button 
                        onClick={() => handleSend(undefined, "/iniciarcadastro", true)}
                        className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm shadow-blue-100 hover:bg-blue-700 transition-colors flex items-center gap-1.5"
                      >
                        <Plus size={14} />
                        NOVO PACIENTE
                      </button>
                    </div>
                  )}
                  {msg.isProfile && msg.profileData && (
                    <>
                      <div className="bg-blue-50/80 -mx-4 -mt-2 mb-0 pt-6 pb-5 px-4 flex flex-row items-center justify-between border-b border-blue-100 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-200/20 rounded-full -mr-12 -mt-12 blur-2xl"></div>
                        
                        <div className="flex flex-col items-start gap-1 relative z-10 min-w-0 flex-1">
                          <h3 className="text-[20px] font-black text-blue-900 tracking-tight leading-tight truncate w-full">{msg.profileData.nome}</h3>
                          <div className="flex flex-row items-center gap-3">
                            <span className="text-[12px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-lg shrink-0">{msg.profileData.idade} ANOS</span>
                            <button 
                              onClick={() => handleDirectCommand(`/edit_name ${msg.profileData?.id}`)}
                              className="text-[9px] font-black uppercase tracking-wider text-white bg-blue-600/90 px-2 py-0.5 rounded-md hover:bg-blue-700 transition-all shadow-sm active:scale-95 shrink-0"
                            >
                              Editar
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1.5 relative z-10 shrink-0 ml-4">
                          <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest leading-none">Status</span>
                          <button 
                            onClick={() => handleDirectCommand(`/status_alterar ${msg.profileData?.id}`)}
                            className="bg-white px-4 py-2.5 rounded-xl border-2 border-blue-600 text-blue-900 text-[14px] font-black shadow-md hover:bg-blue-50 transition-all flex items-center gap-2 active:scale-95"
                          >
                            {msg.profileData?.status || "PENDENTE"}
                            <Edit3 size={16} className="text-blue-500" />
                          </button>
                        </div>
                      </div>

                      <div className="px-4 py-5 bg-white border-b border-gray-100 flex flex-col gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center border border-gray-100">
                            <Building2 size={20} className="text-blue-500" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Unidade / Leito</span>
                            <span className="text-[13px] font-bold text-gray-800 leading-tight truncate">
                              {msg.profileData?.hospitalNome || "Sem Unidade"}
                            </span>
                            <span className="text-[11px] font-bold text-gray-400">
                              {msg.profileData?.roomNumber || "Sala não informada"}
                            </span>
                          </div>
                        </div>

                        <button 
                          onClick={() => handleDirectCommand(`/calendario_form pid: ${msg.profileData?.id}, paciente: ${msg.profileData?.nome}, hospId: ${msg.profileData?.hospitalId}, room: ${msg.profileData?.roomNumber}`)}
                          className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg shadow-md shadow-emerald-100 hover:bg-emerald-700 transition-all flex items-center justify-center gap-1.5 active:scale-[0.98] w-fit"
                        >
                          <CalendarPlus size={14} className="text-emerald-100" />
                          <span className="text-[9px] font-black uppercase tracking-tight">Agendar Novo</span>
                        </button>
                      </div>
                    </>
                  )}
                  {msg.image && (
                    <img src={msg.image} alt="User upload" className="max-w-full rounded-lg mb-2 shadow-sm" />
                  )}
                  {msg.audio && (
                    <audio controls src={msg.audio} className="max-w-full mb-2" />
                  )}
                  {msg.role === "user" ? (
                    <div className="whitespace-pre-wrap">{msg.text}</div>
                  ) : (
                    <>
                      <div className="markdown-body prose prose-sm max-w-none">
                        <ReactMarkdown
                          rehypePlugins={[rehypeRaw]}
                          components={{
                            a({ children, ...props }) {
                              const href = props.href;
                              if (href && href.startsWith("/")) {
                                const isNovoBtn = href === "/iniciarcadastro";
                                return (
                                  <span
                                    onClick={() => {
                                      const shouldClear = isNovoBtn ||
                                                          href.startsWith("/p") || 
                                                          href.startsWith("/edit") || 
                                                          href.startsWith("/pacientes") ||
                                                          href.startsWith("/status_alterar");
                                      handleSend(undefined, href, shouldClear);
                                    }}
                                    className={isNovoBtn 
                                      ? "bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-blue-200 hover:bg-blue-700 cursor-pointer inline-flex items-center gap-2 not-prose"
                                      : href.startsWith("/status_alterar")
                                        ? "text-gray-900 font-bold text-[15px] cursor-pointer hover:text-blue-700"
                                        : "text-blue-600 hover:underline cursor-pointer font-normal"
                                    }
                                  >
                                    {children}
                                  </span>
                                );
                              }
                              return <a {...props} target="_blank" rel="noopener noreferrer">{children}</a>;
                            },
                            code({ children, ...props }) {
                              const content = String(children);
                              // Check if it's inline (no className which usually defines language-*)
                              const isInline = !props.className;
                              if (isInline && content.startsWith("/")) {
                                // Customize labels for common commands
                                let label = content;

                                // General label override support
                                if (content.includes(" label:")) {
                                  label = content.split(" label:")[1].trim();
                                } else {
                                  if (content.startsWith("/remover_evento")) label = "🗑️";
                                  if (content.startsWith("/pacientes")) label = "📋 Pacientes";
                                  if (content.startsWith("/prep_img")) label = "🖼️ Anexar";
                                  if (content.startsWith("/prep_p") || content.startsWith("/p ")) {
                                    label = "🚀 Relatório";
                                  }
                                  if (content.startsWith("/logpac")) label = "📝 Novo Log";
                                  if (content.startsWith("/novo_familiar")) label = "➕ Novo Familiar";
                                  if (content.startsWith("/edit_name")) label = "✏️ Editar Cadastro";
                                  if (content.startsWith("/update_patient")) label = "Confirmar";
                                  if (content.startsWith("/agenda_add")) label = "📅 Agendar";
                                  if (content.startsWith("/status_alterar")) {
                                    if (content.includes("status ")) {
                                      const s = content.split("status ")[1];
                                      label = s;
                                    } else {
                                      label = "✏️ Alterar";
                                    }
                                  }
                                }
                                if (content.startsWith("/status_select")) {
                                  label = content.split("/status_select ")[1] || "Selecionar";
                                }
                                if (content.startsWith("/status_apply")) {
                                  const idMatch = content.match(/pac:\s*([\w-]+)/i);
                                  label = idMatch ? `Aplicar ao ID: ${idMatch[1]}` : "Confirmar";
                                }
                                if (content.startsWith("/set_status")) {
                                  const s = content.split(" ").slice(2).join(" ");
                                  label = s;
                                }
                                if (content.startsWith("/agendar data:")) {
                                  const dateMatch = content.match(/data:\s*([\d-]+)/);
                                  const date = dateMatch ? dateMatch[1] : "";
                                  const today = new Date();
                                  const pad = (n: number) => n.toString().padStart(2, "0");
                                  const hojeStr = `${pad(today.getDate())}-${pad(today.getMonth() + 1)}-${today.getFullYear()}`;
                                  const tomorrow = new Date();
                                  tomorrow.setDate(today.getDate() + 1);
                                  const amanhaStr = `${pad(tomorrow.getDate())}-${pad(tomorrow.getMonth() + 1)}-${tomorrow.getFullYear()}`;
                                  
                                  if (date === hojeStr) label = `Hoje ${date}`;
                                  else if (date === amanhaStr) label = `Amanhã ${date}`;
                                  else label = content;
                                }

                                  const isPlusLabel = label === "+";
                                  return (
                                    <button
                                      onClick={() => {
                                        const shouldClear = content.startsWith("/p") || 
                                                            content.startsWith("/edit_name") || 
                                                            content.startsWith("/pacientes") || 
                                                            content.startsWith("/cadastro") ||
                                                            content.startsWith("/status_alterar") ||
                                                            content.startsWith("/buscar") ||
                                                            content.startsWith("/hospitais") ||
                                                            content.startsWith("/agenda");
                                        handleSend(undefined, content, shouldClear);
                                      }}
                                      className={isPlusLabel 
                                        ? "not-prose bg-blue-600 text-white w-6 h-6 inline-flex items-center justify-center rounded-full font-bold hover:bg-blue-700 transition-colors cursor-pointer shadow-sm mx-0.5"
                                        : "not-prose bg-white text-blue-600 px-2 py-0.5 rounded-lg text-[10px] font-bold hover:bg-blue-50 transition-all cursor-pointer border border-blue-600 mx-0.5 shadow-sm"
                                      }
                                    >
                                      {label}
                                    </button>
                                  );
                              }
                              return <code {...props}>{children}</code>;
                            }
                          }}
                        >
                          {msg.text}
                        </ReactMarkdown>
                      </div>

                      {msg.actionGroups && (
                        <div className="mt-6 pt-6 -mx-3 -mb-3 p-4 bg-gray-50/70 border-t border-gray-100 space-y-4">
                          {msg.actionGroups.map((group, gi) => (
                            <div key={gi} className="space-y-2">
                              <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400">{group.title}</h4>
                              <div className="flex flex-wrap gap-2">
                                {group.actions.map((action, ai) => (
                                  <button
                                    key={ai}
                                    onClick={() => handleSend(undefined, action.cmd, true)}
                                    className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all border shadow-sm ${
                                      action.active 
                                        ? 'bg-blue-600 text-white border-blue-600 shadow-blue-100' 
                                        : 'bg-white text-blue-600 border-blue-600 hover:bg-blue-50'
                                    }`}
                                  >
                                    {action.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {msg.form && (
                        <MessageForm 
                          form={msg.form} 
                          onSubmit={(cmd) => handleSend(undefined, cmd)} 
                          selectedImage={selectedImage}
                          onSelectImage={setSelectedImage}
                        />
                      )}
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                  <Bot size={16} />
                </div>
                <div className="bg-gray-100 p-3 rounded-2xl rounded-tl-none flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin text-blue-600" />
                  <span className="text-sm text-gray-500 italic">Thinking...</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </div>
  );
};
