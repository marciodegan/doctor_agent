import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Send, User, Bot, Loader2, Plus, Sparkles, Image as ImageIcon, X, Shield, LogOut, Lock, Info, Settings } from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import { tools, executeTool, ai } from "../lib/gemini";

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
          <input 
            type={field.type}
            value={values[field.name]}
            onChange={(e) => setValues(prev => ({ ...prev, [field.name]: e.target.value }))}
            placeholder={field.placeholder}
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            required
            {...(field.type === "number" ? { inputMode: "numeric" } : {})}
          />
        </div>
      ))}
      
      <button 
        type="submit"
        className="w-full py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
      >
        <Plus size={16} />
        {form.submitLabel}
      </button>
    </form>
  );
};

export const Chat: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [lastProcessedFile, setLastProcessedFile] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [showSecurityInfo, setShowSecurityInfo] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  
  // Create a mutable reference for the agent so we can reset it
  const agentRef = useRef<any>(null);

  useEffect(() => {
    // Fetch Settings
    fetch("/api/app/settings")
      .then(res => res.json())
      .then(data => {
        const name = data.companyName || "Doctor Pro";
        setCompanyName(name);
        setMessages([
          { role: "model", text: `Hello ${name}.\n\nHoje é um lindo dia para salvar vidas.\n\nGerencie os **[📋 Pacientes](/pacientes)**, busque por **[🔍 Nome](/edit_menu)** ou veja sua **[📅 Agenda](/agenda)**.` }
        ]);
      })
      .catch(err => {
        console.error("Failed to fetch settings", err);
        setMessages([
          { role: "model", text: "Hello! Como posso ajudar você hoje?" }
        ]);
      });

    import("../lib/gemini").then(({ createAgent }) => {
      if (!agentRef.current) agentRef.current = createAgent();
    });
  }, []);

  const updateSettings = async (name: string) => {
    setIsUpdatingSettings(true);
    try {
      const res = await fetch("/api/app/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: name })
      });
      if (res.ok) {
        setCompanyName(name);
        setShowSettings(false);
      }
    } catch (err) {
      console.error("Failed to update settings", err);
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  const handleBackup = async () => {
    setIsBackingUp(true);
    try {
      const res = await fetch("/api/app/backup", { method: "POST" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      setMessages(prev => [...prev, { 
        role: "model", 
        text: `✅ **Backup realizado com sucesso!**\nNovo arquivo: **${data.name}**` 
      }]);
      setShowSettings(false);
    } catch (err: any) {
      console.error("Backup failed", err);
      setMessages(prev => [...prev, { role: "model", text: `❌ Falha no backup: ${err.message}` }]);
    } finally {
      setIsBackingUp(false);
    }
  };

  const resetAgent = async () => {
    const { createAgent } = await import("../lib/gemini");
    agentRef.current = createAgent();
    setMessages([{ role: "model", text: `Hello ${companyName}.\n\nHoje é um lindo dia para salvar vidas.` }]);
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

  const suggestions = [
    { label: "👤 Pacientes", prompt: "/pacientes" },
    { label: "🔍 Buscar", prompt: "/edit_menu" },
    { label: "👤 Novo", prompt: "/iniciarcadastro" },
    { label: "📅 Agendar", prompt: "/iniciaragenda" },
    { label: "📅 Agenda", prompt: "/agenda" },
    { label: "⚙️ Config", prompt: "/config_menu" },
    { label: "❓ Ajuda", prompt: "/ajuda" },
  ];

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
          `\`/iniciaragenda label:➕ NOVO EVENTO\`\n\n` +
          `**📅 Sua Agenda (${formatDate(today)}):**\n\n${todayList || "Sem compromissos."}\n\n` +
          `**📅 Sua Agenda (${formatDate(tomorrow)}):**\n\n${tomorrowList || "Sem compromissos."}\n\n` +
          `*Nota: Esta agenda é pessoal e visível apenas para você.*`;

        setMessages([{ role: "model", text: fullAgenda }]);
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
        text: `👤 **Cadastro de Novo Paciente**\n\nPreencha os dados abaixo para registrar:`,
        form: {
          title: "Novo Paciente",
          fields: [
            { label: "Nome do Paciente", name: "nome", type: "text", placeholder: "Ex: João Silva" },
            { label: "Idade", name: "idade", type: "text", placeholder: "Ex: 30" },
            { label: "Hospital", name: "hospitalName", type: "text", placeholder: "Ex: Hospital São Lucas" },
            { label: "Quarto/Leito", name: "roomNumber", type: "text", placeholder: "Ex: 402B" },
          ],
          submitLabel: "Registrar Paciente",
          commandPrefix: "/registrar"
        }
      }]);
      return true;
    }

    if (cmd === "/iniciaragenda") {
      const today = new Date();
      const pad = (n: number) => n.toString().padStart(2, "0");
      const hojeStrIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`; // YYYY-MM-DD for picker
      const agoraStr = `${pad(today.getHours())}:00`;
      
      setMessages(prev => [...prev, { 
        role: "model", 
        text: "📅 **Novo Agendamento**\n\nPreencha os detalhes do compromisso:",
        form: {
          title: "Agendar Compromisso",
          fields: [
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

    if (cmd === "/enviarimagem") {
      setIsLoading(true);
      try {
        const res = await fetch("/api/app/patients");
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
        fetch("/api/app/hospitals", {
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
        fetch("/api/app/image-options")
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
        const res = await fetch("/api/app/statuses");
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        
        const list = data.map((s: string) => `• ${s}`).join("\n");
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
        const res = await fetch("/api/app/image-options");
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
        const res = await fetch("/api/app/patients");
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
        const res = await fetch("/api/app/patients");
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
        const res = await fetch("/api/app/patients");
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


    if (cmd.startsWith("/novo_familiar")) {
      const id = cmdInput.match(/id:\s*([^,]+)/i)?.[1]?.trim() || cmdInput.split(" ")[1];
      const nome = cmdInput.match(/nome:\s*([^,]+)/i)?.[1]?.trim() || cmdInput.match(/nome:\s*(.+)/i)?.[1]?.trim();

      if (id) {
        setMessages([{
          role: "model",
          text: `👪 **Novo Familiar**\n\n📌 **Paciente:** ${nome ? `${nome} (ID: ${id})` : `ID: ${id}`}`,
          form: {
            title: "Dados do Familiar",
            fields: [
              { label: "Nome do Familiar", name: "nome_familiar", type: "text" },
              { label: "Grau de Parentesco", name: "tipo_parentesco", type: "text", placeholder: "Ex: Filho(a), Esposa..." },
              { label: "Telefone", name: "telefone", type: "number" },
            ],
            submitLabel: "Salvar Familiar",
            commandPrefix: `/registrar_familiar id: ${id}, paciente_nome: ${nome || ""},`
          }
        }]);
        return true;
      } else {
        setInput("/novo_familiar ");
        setMessages([{ 
          role: "model", 
          text: "👪 **Novo Familiar**\n\nComplete o comando com o ID do paciente:\n`/novo_familiar [ID]`" 
        }]);
        return "PREFILL";
      }
    }

    if (cmd.startsWith("/logpac")) {
      const id = cmdInput.match(/id:\s*([^,]+)/i)?.[1]?.trim() || cmdInput.split(" ")[1];
      const nome = cmdInput.match(/nome:\s*([^,]+)/i)?.[1]?.trim() || cmdInput.match(/nome:\s*(.+)/i)?.[1]?.trim();

      if (id) {
        setMessages([{
          role: "model",
          text: `📝 **Adicionar Log**\n\n📌 **Paciente:** ${nome ? `${nome} (ID: ${id})` : `ID: ${id}`}`,
          form: {
            title: "Texto do Log",
            fields: [
              { label: "O que aconteceu?", name: "texto", type: "text", placeholder: "Descreva a atualização..." }
            ],
            submitLabel: "Salvar Evolução",
            commandPrefix: `/log id: ${id}, p_nome: ${nome || ""},`
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
        const res = await fetch("/api/app/hospitals");
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

        const res = await fetch("/api/app/hospitals", {
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
        const res = await fetch(`/api/app/patient-report/${id}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        const cad = data.cadastro;
        const audios = data.audios.map((a: any) => `• **${a.data}**\n  ${a.conteudo}`).join("\n\n");
        
        const docs = data.imagens.map((i: any) => {
          const downloadText = i.link ? ` [[Baixar Arquivo](${i.link})]` : "";
          const fileIdMatch = i.link?.match(/id=([^&]+)/) || i.link?.match(/\/file\/d\/([^/]+)/);
          const fileId = fileIdMatch ? fileIdMatch[1] : "";
          
          let aiPart = "";
          if (i.aiResposta) {
            aiPart = `\n🤖 **AI Resposta:** ${i.aiResposta}`;
          }
          
          return `• [${i.data}]${downloadText}\n\n${i.descricao}${aiPart}`;
        }).join("\n\n");

        const fams = data.familiares.map((f: any) => {
          const cleanFone = f.fone ? f.fone.replace(/\D/g, "") : "";
          const waNumber = cleanFone ? (cleanFone.startsWith("55") ? cleanFone : "55" + cleanFone) : "";
          const foneLink = waNumber ? `[📞 **${f.fone}**](https://wa.me/${waNumber})` : "📞 Sem fone";
          return `• **${f.nome}** (${f.relacao})\n  ${foneLink}`;
        }).join("\n\n");

        const cleanCadFone = cad.Telefone ? cad.Telefone.replace(/\D/g, "") : "";
        const waCadNumber = cleanCadFone ? (cleanCadFone.startsWith("55") ? cleanCadFone : "55" + cleanCadFone) : "";
        const foneCadLink = waCadNumber ? `[📞 **${cad.Telefone}**](https://wa.me/${waCadNumber})` : "N/A";

        const reportText = `📍 **Status:** ${cad.Status || "Não informado"} \`/status_alterar ${cad.ID}\`\n\n` +
          `**Contatos:** \`/novo_familiar id: ${cad.ID}, nome: ${cad.Nome} label:➕\`\n\n${fams || "Nenhum registro"}\n\n` +
          `**Informações:** \`/logpac id: ${cad.ID}, nome: ${cad.Nome} label:➕\`\n\n${audios || "Nenhum registro"}\n\n` +
          `**Imagens:** \`/prep_img id: ${cad.ID}, nome: ${cad.Nome} label:➕\`\n\n${docs || "Nenhum registro"}`;

        setMessages([{ 
          role: "model", 
          text: reportText,
          isProfile: true,
          profileData: {
            id: cad.ID.toString(),
            nome: cad.Nome,
            idade: cad.Idade ? cad.Idade.toString() : "N/A"
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
        const res = await fetch("/api/app/patients?full=true");
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

        const hospitalFilter = cmdInput.match(/hospital:\s*(.+?)(?=\s+\w+:|$)/i)?.[1]?.trim();
        const statusFilter = cmdInput.match(/status:\s*(.+?)(?=\s+\w+:|$)/i)?.[1]?.trim();

        let filteredData = [...data];
        if (hospitalFilter) {
          const hFilter = hospitalFilter.toLowerCase().trim();
          filteredData = filteredData.filter((p: any) => 
            p.hospitalId?.toString().toLowerCase().trim() === hFilter || 
            p.hospitalName?.toLowerCase().trim() === hFilter
          );
        }
        if (statusFilter) {
          const sFilter = statusFilter.toLowerCase().trim();
          filteredData = filteredData.filter((p: any) => 
            p.statusId?.toString().toLowerCase().trim() === sFilter || 
            p.status?.toLowerCase().trim() === sFilter
          );
        }

        if (sort === "nome") {
          filteredData.sort((a, b) => a.nome.localeCompare(b.nome));
        } else {
          filteredData.sort((a, b) => (parseInt(b.id) || 0) - (parseInt(a.id) || 0));
        }

        const hospitals = masterHospitalsData.map((h: any) => h.nome).filter(Boolean);
        const statuses = Array.isArray(masterStatuses) ? masterStatuses.filter(Boolean) : [];

        const showHospitals = cmdInput.includes("view:hospitais");
        const showStatuses = cmdInput.includes("view:status");

        const PAGE_SIZE = 10;
        const totalPages = Math.ceil(filteredData.length / PAGE_SIZE);
        const pageToView = Math.max(1, Math.min(page, totalPages || 1));
        const start = (pageToView - 1) * PAGE_SIZE;
        const end = start + PAGE_SIZE;
        const pageData = filteredData.slice(start, end);

        // Group pageData by Hospital, then by Status (using statusId for sorting)
        const hospitalsGrouped: Record<string, { 
          id: string, 
          statuses: Record<string, { id: string, name: string, patients: any[] }> 
        }> = {};
        
        pageData.forEach((p: any) => {
          const hName = p.hospitalName || "Sem Hospital";
          const hId = p.hospitalId || "-";
          const sName = p.status || "Sem Status";
          const sId = p.statusId?.toString() || "999";
          
          if (!hospitalsGrouped[hName]) {
            hospitalsGrouped[hName] = { id: hId, statuses: {} };
          }
          if (!hospitalsGrouped[hName].statuses[sId]) {
            hospitalsGrouped[hName].statuses[sId] = { id: sId, name: sName, patients: [] };
          }
          hospitalsGrouped[hName].statuses[sId].patients.push(p);
        });

        let listText = `<div style="display: flex; justify-content: flex-end; margin-bottom: 20px;">\n\n[➕ Novo Paciente](/iniciarcadastro)\n\n</div>\n\n`;

        Object.entries(hospitalsGrouped).forEach(([hName, group]) => {
          // Always show hospital header as requested
          listText += `<div style="font-size: 18px; font-weight: bold; color: #1e40af; background-color: #eff6ff; padding: 8px 12px; border-radius: 8px; margin-top: 24px; margin-bottom: 12px; display: block; border-left: 4px solid #3b82f6;">${hName}</div>`;
          
          // Sort statuses by their ID numerically
          const sortedStatuses = Object.values(group.statuses).sort((a, b) => {
            const idA = parseInt(a.id) || 0;
            const idB = parseInt(b.id) || 0;
            return idA - idB;
          });

          sortedStatuses.forEach(({ name: sName, patients }, statusIdx) => {
            // Spacing between status groupings
            const marginTop = (statusIdx === 0) ? "10px" : "44px";
            listText += `<div style="font-size: 17px; font-weight: bold; color: #374151; margin-left: 8px; margin-top: ${marginTop}; margin-bottom: 8px; display: flex; align-items: center;"><span style="margin-right: 6px;">📋</span> ${sName}</div>`;
            patients.forEach(p => {
              const roomDisplay = p.roomNumber ? ` - ${p.roomNumber}` : "";
              listText += `<div style="margin-left: 24px; margin-bottom: 4px; font-size: 15px; font-weight: normal;">• <a href="/p ${p.id}">${p.nome}</a>${roomDisplay}</div>`;
            });
          });
        });

        if (pageData.length === 0) {
          listText += "_Nenhum paciente encontrado._\n";
        }

        let nav = "";
        const cmdName = "/pacientes";
        const currentFilters = `${hospitalFilter ? ` hospital:${hospitalFilter}` : ""}${statusFilter ? ` status:${statusFilter}` : ""}`;
        
        if (totalPages > 1) {
          nav = `\n\n📖 **Página ${pageToView} de ${totalPages}**\n`;
          if (pageToView > 1) nav += ` [\`⬅️ Ant\`](/pacientes${currentFilters} pag:${pageToView - 1} sort:${sort}) `;
          if (pageToView < totalPages) nav += ` [\`Próximo ➡️\`](/pacientes${currentFilters} pag:${pageToView + 1} sort:${sort}) `;
        }

        const actionGroups = [
          {
            title: "Ordenar",
            actions: [
              { label: "A-Z", cmd: `/pacientes${currentFilters} sort:nome`, active: sort === "nome" },
              { label: "Mais Recentes", cmd: `/pacientes${currentFilters} sort:id`, active: sort === "id" },
            ]
          }
        ];

        if (statuses.length > 0) {
          actionGroups.push({
            title: "Filtrar por Status",
            actions: masterStatuses.map((s: any) => ({ 
              label: typeof s === 'string' ? s : s.nome, 
              cmd: `/pacientes hospital:${hospitalFilter || ""} status:${typeof s === 'string' ? s : s.id} sort:${sort}`,
              active: statusFilter === (typeof s === 'string' ? s : s.id.toString())
            }))
          });
        }

        if (hospitals.length > 0) {
          actionGroups.push({
            title: "Filtrar por Hospital",
            actions: masterHospitalsData.map((h: any) => ({ 
              label: h.nome, 
              cmd: `/pacientes hospital:${h.id} status:${statusFilter || ""} sort:${sort}`,
              active: hospitalFilter === h.id.toString()
            }))
          });
        }

        let filterActiveTxt = "";
        if (hospitalFilter || statusFilter) {
          filterActiveTxt = `\n\nFiltro Ativo: **${hospitalFilter || ""} ${statusFilter || ""}** [\`Limpar\`](/pacientes sort:${sort})`;
        }

        setMessages([{ 
          role: "model", 
          text: listText + filterActiveTxt + (nav ? nav : ""),
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
        
        const res = await fetch("/api/app/patients");
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

          const sortOptions = `\n\n🎯 **Ordenar por:**\n• \`/buscar ${termo ? `termo:${termo} ` : ""}sort:nome\` (A-Z)\n• \`/buscar ${termo ? `termo:${termo} ` : ""}sort:id\` (Mais recentes)`;

          setMessages([{ 
            role: "model", 
            text: `🔍 **Resultados para "${termo || "todos"}":**\n\n${list}${nav}${sortOptions}` 
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
        const pRes = await fetch(`/api/app/patient-report/${id}`);
        const pData = await pRes.json();
        if (pData.error) throw new Error(pData.error);
        
        const p = pData.cadastro;
        
        setMessages([{ 
          role: "model", 
          text: `✏️ **Editar Cadastro: ${p.Nome} (ID: ${p.ID})**`,
          form: {
            title: "Atualizar Dados",
            fields: [
              { label: "Nome", name: "nome", type: "text", defaultValue: p.Nome },
              { label: "Idade", name: "idade", type: "text", defaultValue: p.Idade || "" },
              { label: "Hospital", name: "hospitalName", type: "text", defaultValue: p.hospital_nome || "" },
              { label: "Quarto/Leito", name: "roomNumber", type: "text", defaultValue: p.room_number || "" },
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

        if (!id) throw new Error("ID não identificado.");

        const res = await fetch("/api/app/patients/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, nome, fone, idade, hospitalName, roomNumber })
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
      const res = await fetch(`/api/app/family-members/${id}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      const list = data.map((f: any) => {
        const cleanFone = f.fone ? f.fone.replace(/\D/g, "") : "";
        const waNumber = cleanFone ? (cleanFone.startsWith("55") ? cleanFone : "55" + cleanFone) : "";
        const foneLink = waNumber ? `[📞 **${f.fone}**](https://wa.me/${waNumber})` : "📞 Sem fone";
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
          const dbRes = await fetch("/api/app/db-info");
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

    if (cmd.startsWith("/registrar_familiar")) {
      setIsLoading(true);
      try {
        const patientId = cmdInput.match(/id:\s*([^,]+)/i)?.[1]?.trim();
        const patientNome = cmdInput.match(/paciente_nome:\s*([^,]+)/i)?.[1]?.trim();
        const nomeParaApi = cmdInput.match(/nome_familiar:\s*([^,]+)/i)?.[1]?.trim() || cmdInput.match(/familiar_nome:\s*([^,]+)/i)?.[1]?.trim() || cmdInput.match(/nome:\s*([^,]+)/i)?.[1]?.trim();
        const relacaoParaApi = cmdInput.match(/tipo_parentesco:\s*([^,]+)/i)?.[1]?.trim() || cmdInput.match(/relacao:\s*([^,]+)/i)?.[1]?.trim();
        const foneParaApi = cmdInput.match(/telefone:\s*([^,]+)/i)?.[1]?.trim() || cmdInput.match(/fone:\s*([^,]+)/i)?.[1]?.trim() || cmdInput.match(/fone:\s*(.+)/i)?.[1]?.trim();

        if (!patientId || !nomeParaApi) throw new Error("Use: /registrar_familiar id: [ID], nome_familiar: [NOME], tipo_parentesco: [TIPO], telefone: [FONE]");

        const res = await fetch("/api/app/family-members", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patientId, nome: nomeParaApi, relacao: relacaoParaApi, fone: foneParaApi, paciente_nome: patientNome })
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

    if (cmd.startsWith("/log")) {
      setIsLoading(true);
      try {
        const patientId = cmdInput.match(/id:\s*([^,]+)/i)?.[1]?.trim();
        const patientNome = cmdInput.match(/p_nome:\s*([^,]+)/i)?.[1]?.trim();
        const text = cmdInput.match(/texto:\s*(.+)/i)?.[1]?.trim();

        if (!patientId || !text) throw new Error("Use: /log id: [ID], texto: [Sua transcrição]");

        const res = await fetch("/api/app/logs", {
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

        const res = await fetch("/api/app/upload-image", {
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

        if (!nome) throw new Error("O campo 'nome:' é obrigatório.");

        const res = await fetch("/api/app/patients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome, fone, idade, cpf, hospitalName, roomNumber })
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
      } catch (err: any) {
        setMessages(prev => [...prev, { role: "model", text: `❌ Erro ao remover evento: ${err.message}` }]);
      } finally {
        setIsLoading(false);
        return true;
      }
    }

    if (cmd.startsWith("/ai_analyze")) {
      const driveId = cmdInput.match(/id:\s*([^, ]+)/i)?.[1]?.trim();
      const pId = cmdInput.match(/pId:\s*([^, ]+)/i)?.[1]?.trim() || "";

      if (!driveId) throw new Error("ID do arquivo não especificado.");

      setIsLoading(true);
      try {
        // 1. Check Quota
        const qRes = await fetch("/api/ai/check-quota");
        const qData = await qRes.json();
        if (qData.remaining <= 0) throw new Error(qData.error || "Você atingiu sua cota de 10 análises diárias.");

        // 2. Fetch image base64
        const imgRes = await fetch(`/api/drive/file-base64/${driveId}`);
        const imgData = await imgRes.json();
        if (!imgRes.ok) throw new Error(imgData.error || "Erro ao baixar imagem.");

        // 3. Call Gemini
        const result = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [
            {
              role: "user",
              parts: [
                { text: "aja como um phd em cirurgia cardíaca e analise essa imagem" },
                { inlineData: { data: imgData.base64, mimeType: imgData.mimeType } }
              ]
            }
          ]
        });

        const analysis = result.text || "";

        // 4. Save to Sheets
        const saveRes = await fetch("/api/ai/save-analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ driveId, analysis })
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
      {/* Header */}
      <div className="p-4 border-b bg-gray-50 flex items-center justify-between border-gray-100 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-sm shadow-blue-200">
            <Sparkles size={18} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 leading-tight">Doctor Pro</h3>
            <div className="flex items-center gap-2">
              <p className="text-[10px] text-green-600 font-bold flex items-center gap-1 uppercase tracking-wider">
                <span className="w-1 h-1 bg-green-500 rounded-full animate-pulse"></span>
                Online
              </p>
              <span className="text-[10px] text-gray-300">|</span>
              <button 
                onClick={() => setShowSecurityInfo(true)}
                className="text-[10px] text-blue-600 font-medium hover:underline flex items-center gap-0.5"
              >
                <Shield size={10} /> Conexão Segura
              </button>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          <button 
            onClick={() => setShowSettings(true)}
            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Configurar Empresa"
          >
            <Settings size={18} />
          </button>
          <button 
            onClick={handleLogout}
            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors group relative"
            title="Desconectar Google"
          >
            <LogOut size={18} />
            <span className="absolute right-0 top-full mt-2 hidden group-hover:block bg-gray-900 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-50">
              Desconectar Google
            </span>
          </button>
        </div>
      </div>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between font-sans">
                <div className="flex items-center gap-2 text-gray-900 font-bold">
                  <Settings size={20} className="text-blue-600" />
                  Configurações
                </div>
                <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-gray-100 rounded-full">
                  <X size={18} className="text-gray-400" />
                </button>
              </div>
              <div className="p-6 space-y-4 font-sans">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Nome da Empresa</label>
                  <input 
                    type="text" 
                    value={companyName} 
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Ex: Doctor Pro"
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-900"
                  />
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => updateSettings(companyName)}
                    disabled={isUpdatingSettings || isBackingUp}
                    className="flex-[2] py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isUpdatingSettings ? <Loader2 size={18} className="animate-spin" /> : "Salvar"}
                  </button>
                  <button 
                    onClick={handleBackup}
                    disabled={isUpdatingSettings || isBackingUp}
                    className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200 flex items-center justify-center gap-2 disabled:opacity-50"
                    title="Realizar backup do banco de dados"
                  >
                    {isBackingUp ? <Loader2 size={18} className="animate-spin" /> : "Backup"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Security Overlay */}
      <AnimatePresence>
        {showSecurityInfo && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-white/95 backdrop-blur-sm p-6 flex flex-col items-center justify-center text-center"
          >
            <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4">
              <Lock size={32} />
            </div>
            <h4 className="text-lg font-bold text-gray-900 mb-2">Privacidade & Soberania</h4>
            <div className="space-y-4 text-sm text-gray-600 mb-8 max-w-xs">
              <p className="flex items-start gap-2 text-left">
                <Shield size={16} className="text-blue-500 shrink-0 mt-0.5" />
                <span>Seus documentos do Drive e Calendar <strong>nunca</strong> são armazenados em nossos servidores.</span>
              </p>
              <p className="flex items-start gap-2 text-left">
                <Shield size={16} className="text-blue-500 shrink-0 mt-0.5" />
                <span>O acesso é feito via token oficial do Google (OAuth2) que expira automaticamente.</span>
              </p>
              <p className="flex items-start gap-2 text-left">
                <Shield size={16} className="text-blue-500 shrink-0 mt-0.5" />
                <span>A memória da IA é limpa automaticamente após cada tarefa de salvamento de dados.</span>
              </p>
            </div>
            <button 
              onClick={() => setShowSecurityInfo(false)}
              className="px-6 py-2 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
            >
              Entendi, continuar
            </button>
          </motion.div>
        )}
      </AnimatePresence>

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
                    <div className="bg-blue-50 -mx-4 -mt-4 mb-6 p-10 flex flex-col items-center justify-center border-b border-blue-100 shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-blue-100/30 rounded-full -mr-16 -mt-16 blur-2xl"></div>
                      <div className="absolute bottom-0 left-0 w-24 h-24 bg-blue-100/30 rounded-full -ml-12 -mb-12 blur-2xl"></div>
                      
                      <button 
                        onClick={() => handleDirectCommand(`/edit_name ${msg.profileData?.id}`)}
                        className="group flex flex-col items-center hover:scale-105 transition-transform relative z-10"
                      >
                        <h2 className="text-2xl font-extrabold text-blue-700 group-hover:text-blue-900 transition-colors tracking-tight text-center leading-tight">{msg.profileData.nome}</h2>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-lg font-bold text-blue-500 group-hover:text-blue-700 transition-colors">{msg.profileData.idade} anos</p>
                          <div className="w-1 h-1 bg-blue-300 rounded-full"></div>
                          <span className="text-[9px] font-black uppercase tracking-widest text-blue-400 group-hover:text-blue-600 transition-colors">Editar</span>
                        </div>
                      </button>
                    </div>
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
                                                          href.startsWith("/pacientes");
                                      handleSend(undefined, href, shouldClear);
                                    }}
                                    className={isNovoBtn 
                                      ? "bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-blue-200 hover:bg-blue-700 cursor-pointer inline-flex items-center gap-2 not-prose"
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
                                    className="not-prose bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-mono font-bold hover:bg-blue-100 transition-colors cursor-pointer border border-blue-100 mx-0.5"
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

                      {msg.isListing && msg.actionGroups && (
                        <div className="mt-8 pt-6 border-t border-gray-100 space-y-4">
                          {msg.actionGroups.map((group, gi) => (
                            <div key={gi} className="space-y-2">
                              <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400">{group.title}</h4>
                              <div className="flex flex-wrap gap-2">
                                {group.actions.map((action, ai) => (
                                  <button
                                    key={ai}
                                    onClick={() => handleSend(undefined, action.cmd, true)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border shadow-sm ${
                                      action.active 
                                        ? 'bg-blue-600 text-white border-blue-600 shadow-blue-100' 
                                        : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300 hover:text-blue-600'
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

      {/* Image Preview */}
      {selectedImage && (
        <div className="px-4 py-2 bg-gray-50 border-t flex flex-wrap gap-3">
          <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200">
            <img src={selectedImage} alt="Preview" className="w-full h-full object-cover" />
            <button 
              onClick={() => setSelectedImage(null)}
              className="absolute top-0 right-0 p-1 bg-black/50 text-white hover:bg-black/70"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Suggested Actions */}
      {!isLoading && (
        <div className="px-4 pb-4 flex flex-wrap gap-2 shrink-0 border-t pt-4 bg-gray-50/50">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => handleSend(undefined, s.prompt, true)}
              className="text-[11px] font-bold px-3 py-1.5 bg-white border border-gray-200 rounded-full text-gray-600 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600 transition-all uppercase tracking-wide shadow-sm"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
