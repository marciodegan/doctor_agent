import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Send, User, Bot, Loader2, Plus, Sparkles, Image as ImageIcon, X, Shield, LogOut, Lock, Info, Settings } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { tools, executeTool } from "../lib/gemini";

interface Message {
  role: "user" | "model";
  text: string;
  image?: string;
  audio?: string;
  form?: {
    title?: string;
    fields: { label: string; name: string; type: string; placeholder?: string; defaultValue?: string }[];
    submitLabel: string;
    commandPrefix: string;
  };
}

const MessageForm: React.FC<{ form: any; onSubmit: (cmd: string) => void }> = ({ form, onSubmit }) => {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    form.fields.forEach((f: any) => {
      initial[f.name] = f.defaultValue || "";
    });
    return initial;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parts = Object.entries(values).map(([k, v]) => `${k}: ${v}`);
    const fullCmd = `${form.commandPrefix} ${parts.join(", ")}`;
    onSubmit(fullCmd);
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 p-4 bg-white/50 rounded-2xl border border-blue-100 space-y-3">
      {form.title && <h4 className="text-sm font-bold text-blue-800 mb-2">{form.title}</h4>}
      {form.fields.map((field: any) => (
        <div key={field.name}>
          <label className="text-[10px] uppercase tracking-wider font-bold text-gray-500 ml-1">{field.label}</label>
          <input 
            type={field.type}
            value={values[field.name]}
            onChange={(e) => setValues(prev => ({ ...prev, [field.name]: e.target.value }))}
            placeholder={field.placeholder}
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            required
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
        const name = data.companyName || "Nexus Business AI";
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

  const handleLogout = () => {
    document.cookie = "google_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    window.location.reload();
  };

  const suggestions = [
    { label: "👤 Pacientes", prompt: "/pacientes" },
    { label: "🔍 Buscar", prompt: "/edit_menu" },
    { label: "📝 Notes", prompt: "/iniciarlog" },
    { label: "👪 Familiar", prompt: "/iniciarfamiliar" },
    { label: "👤 Novo", prompt: "/iniciarcadastro" },
    { label: "🖼️ Enviar Imagem", prompt: "/enviarimagem" },
    { label: "📅 Agendar", prompt: "/iniciaragenda" },
    { label: "📅 Agenda", prompt: "/agenda" },
    { label: "🏥 Hospitais", prompt: "/hospitais" },
    { label: "🏷️ Status", prompt: "/status_menu" },
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
            { label: "Telefone", name: "fone", type: "text", placeholder: "Ex: (51) 98888-7777" },
            { label: "Idade", name: "idade", type: "text", placeholder: "Ex: 30" },
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
          text: `🖼️ **Para qual paciente deseja enviar a imagem?**\n\n${list || "Nenhum paciente encontrado."}\n\n*Nota: Primeiro anexe a imagem no ícone de clipe abaixo.*` 
        }]);
      } catch (err: any) {
        setMessages(prev => [...prev, { role: "model", text: `❌ Erro: ${err.message}` }]);
      } finally {
        setIsLoading(false);
        return true;
      }
    }

    if (cmd.startsWith("/prep_img")) {
      const id = cmdInput.split(" ")[1];
      if (id) {
        setMessages(prev => [...prev, { 
          role: "model", 
          text: `🖼️ **Anexar Imagem**\n\nIdentificado ID: **${id}**. Clique no clipe de papel abaixo para anexar a imagem e preencha a descrição:`,
          form: {
            title: "Descrição da Imagem",
            fields: [
              { label: "Descrição / Título", name: "descrição", type: "text", placeholder: "Ex: Raio-X do tórax" }
            ],
            submitLabel: "Enviar Imagem",
            commandPrefix: `/img id: ${id},`
          }
        }]);
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
      const parts = cmdInput.split(" ");
      const id = parts[1];
      if (id) {
        setMessages(prev => [...prev, { 
          role: "model", 
          text: `👪 **Novo Familiar**\n\nCadastrando para o Paciente ID: **${id}**`,
          form: {
            title: "Dados do Familiar",
            fields: [
              { label: "Nome do Familiar", name: "nome", type: "text" },
              { label: "Grau de Parentesco", name: "relacao", type: "text", placeholder: "Ex: Filho(a), Esposa..." },
              { label: "Telefone", name: "fone", type: "text" },
            ],
            submitLabel: "Salvar Familiar",
            commandPrefix: `/registrar_familiar id: ${id},`
          }
        }]);
        return true;
      } else {
        setInput("/novo_familiar ");
        setMessages(prev => [...prev, { 
          role: "model", 
          text: "👪 **Novo Familiar**\n\nComplete o comando com o ID do paciente:\n`/novo_familiar [ID]`" 
        }]);
        return "PREFILL";
      }
    }

    if (cmd.startsWith("/logpac")) {
      const id = cmdInput.split(" ")[1];
      if (id) {
        setMessages(prev => [...prev, { 
          role: "model", 
          text: `📝 **Adicionar Log**\n\nPaciente ID: **${id}**`,
          form: {
            title: "Texto do Log",
            fields: [
              { label: "O que aconteceu?", name: "texto", type: "text", placeholder: "Descreva a atualização..." }
            ],
            submitLabel: "Salvar Evolução",
            commandPrefix: `/log id: ${id},`
          }
        }]);
        return true;
      }
    }

    if (cmd === "/iniciarhospital") {
      setMessages(prev => [...prev, { 
        role: "model", 
        text: `🏥 **Cadastro de Novo Hospital**\n\n` +
              `Para registrar um novo hospital, use o comando abaixo:\n\n` +
              `\`/hospital_add nome: [NOME], fone: [TELEFONE], c1: [CONTATO1], c2: [CONTATO2], c3: [CONTATO3], c4: [CONTATO4], c5: [CONTATO5]\`\n\n` +
              `*Clique no comando abaixo para carregar o modelo no chat:*`
      }]);
      setInput("/hospital_add nome: , fone: , c1: , c2: , c3: , c4: , c5: ");
      return "PREFILL";
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
        const audios = data.audios.map((a: any) => `• [${a.data}] ${a.conteudo}  `).join("\n");
        
        const docs = data.imagens.map((i: any) => {
          const fileId = i.link?.match(/[-\w]{25,}/)?.[0];
          const downloadText = fileId ? ` **[[Baixar Arquivo](/api/drive/file/${fileId})]**` : "";
          return `• [${i.data}] ${i.descricao}${downloadText} **[[Drive](${i.link})]**  `;
        }).join("\n");

        const fams = data.familiares.map((f: any) => {
          const cleanFone = f.fone ? f.fone.replace(/\D/g, "") : "";
          const waNumber = cleanFone ? (cleanFone.startsWith("55") ? cleanFone : "55" + cleanFone) : "";
          const foneLink = waNumber ? `[📞 **${f.fone}**](https://wa.me/${waNumber})` : "📞 Sem fone";
          return `• **${f.nome}** (${f.relacao}) - ${foneLink}  `;
        }).join("\n");

        const cleanCadFone = cad.Telefone ? cad.Telefone.replace(/\D/g, "") : "";
        const waCadNumber = cleanCadFone ? (cleanCadFone.startsWith("55") ? cleanCadFone : "55" + cleanCadFone) : "";
        const foneCadLink = waCadNumber ? `[📞 **${cad.Telefone}**](https://wa.me/${waCadNumber})` : "N/A";

        const reportText = `🚀 **Relatório Direto: ${cad.Nome} (ID: ${cad.ID})**\n\n` +
          `**Cadastro:**\n- Status: **${cad.Status || "Não informado"}** \`/status_alterar ${cad.ID}\`\n- Telefone: ${foneCadLink}\n- Idade: ${cad.Idade || "N/A"}\n- \`/edit_name ${cad.ID}\`\n\n` +
          `**Familiares:**\n\n${fams || "Nenhum registro"}\n\n` +
          `**Evoluções:**\n\n${audios || "Nenhum registro"}\n\n` +
          `**Imagens:**\n\n${docs || "Nenhum registro"}`;

        setMessages([{ role: "model", text: reportText }]);
        setTimeout(scrollToTop, 0);
      } catch (err: any) {
        setMessages(prev => [...prev, { role: "model", text: `❌ Erro: ${err.message}` }]);
      } finally {
        setIsLoading(false);
        return true;
      }
    }

    if (cmd.startsWith("/pacientes")) {
      setIsLoading(true);
      try {
        const res = await fetch("/api/app/patients");
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        
        let page = 1;
        let sort = "id";
        
        const pagMatch = cmdInput.match(/pag:\s*(\d+)/i);
        if (pagMatch) page = parseInt(pagMatch[1]);
        
        const sortMatch = cmdInput.match(/sort:\s*(\w+)/i);
        if (sortMatch) sort = sortMatch[1].toLowerCase();

        const sortedData = [...data];
        if (sort === "nome") {
          sortedData.sort((a, b) => a.nome.localeCompare(b.nome));
        } else {
          sortedData.sort((a, b) => (parseInt(b.id) || 0) - (parseInt(a.id) || 0));
        }

        const PAGE_SIZE = 8;
        const totalPages = Math.ceil(sortedData.length / PAGE_SIZE);
        const pageToView = Math.max(1, Math.min(page, totalPages || 1));
        const start = (pageToView - 1) * PAGE_SIZE;
        const end = start + PAGE_SIZE;
        const pageData = sortedData.slice(start, end);

        const list = pageData.map((p: any) => 
          `👤 \`/p ${p.id} label:${p.nome}\` **ID:[${p.id}]**\n` +
          `📍 **Status:** ${p.status || "Não informado"}`
        ).join("\n\n---\n\n");

        let nav = "";
        const cmdName = "/pacientes";
        if (totalPages > 1) {
          nav = `\n\n📖 **Página ${pageToView} de ${totalPages}**\n`;
          if (pageToView > 1) nav += ` \`${cmdName} pag:${pageToView - 1} sort:${sort}\` `;
          if (pageToView < totalPages) nav += ` \`${cmdName} pag:${pageToView + 1} sort:${sort}\` `;
        }

        const sortOptions = `\n\n🎯 **Ordenar por:**\n• \`${cmdName} sort:nome\` (A-Z)\n• \`${cmdName} sort:id\` (Mais recentes)`;

        setMessages([{ 
          role: "model", 
          text: `📂 **Cadastro de Pacientes (${data.length} total):**\n\n${list || "Nenhum paciente encontrado."}${nav}${sortOptions}` 
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
          const list = pageData.map((p: any) => 
            `👤 \`/p ${p.id} label:${p.nome}\` **ID:[${p.id}]**\n` +
            `📍 **Status:** ${p.status || "Não informado"}`
          ).join("\n\n---\n\n");
          
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
              { label: "Telefone", name: "fone", type: "text", defaultValue: p.Telefone || "" },
              { label: "Idade", name: "idade", type: "text", defaultValue: p.Idade || "" },
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
      try {
        const id = cmdInput.match(/id:\s*([^,]+)/i)?.[1]?.trim();
        const nome = cmdInput.match(/nome:\s*([^,]+)/i)?.[1]?.trim();
        const fone = cmdInput.match(/fone:\s*([^,]+)/i)?.[1]?.trim();
        const idade = cmdInput.match(/idade:\s*(.+)/i)?.[1]?.trim();

        if (!id) throw new Error("ID não identificado.");

        const res = await fetch("/api/app/patients/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, nome, fone, idade })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        setMessages(prev => [...prev, { 
          role: "model", 
          text: `✅ **Paciente atualizado com sucesso!**\nID: **${id}**\n\n[Ver Relatório Atualizado](/p ${id})` 
        }]);
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
          text: "🤖 **Nexus Shortcuts (Zero Tokens):**\n\n" +
                "- `/pacientes`: Lista todos os pacientes (Banco Compartilhado).\n" +
                "- `/buscar [NOME]`: Busca paciente por nome.\n" +
                "- `/p [ID]`: Relatório rápido (ex: `/p 2`).\n" +
                "- `/edit_name [ID]`: Editar nome, fone ou idade do paciente.\n" +
                "- `/edit_menu`: Atalho direto para buscar e editar.\n" +
                "- `/familiares [ID]`: Lista familiares de um paciente.\n" +
                "- `/novo_familiar [ID]`: Atalho para cadastrar familiar.\n" +
                "- `/registrar_familiar id: [ID], nome: [N], relacao: [R], fone: [F]`: Cadastro de familiar.\n" +
                "- `/agendar data: [D], hora: [H], evento: [E]`: Cria evento na agenda Google.\n" +
                "- `/log id: [ID], texto: [T]`: Adiciona log de texto direto.\n" +
                "- `/img id: [ID], desc: [D]`: Envia imagem anexada direto para o Drive.\n" +
                "- `/registrar nome: [N], fone: [F], idade: [I]`: Cadastra paciente.\n" +
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
        const nome = cmdInput.match(/nome:\s*([^,]+)/i)?.[1]?.trim();
        const relacao = cmdInput.match(/relacao:\s*([^,]+)/i)?.[1]?.trim();
        const fone = cmdInput.match(/fone:\s*(.+)/i)?.[1]?.trim();

        if (!patientId || !nome) throw new Error("Use: /registrar_familiar id: [ID], nome: [NOME], relacao: [TIPO], fone: [FONE]");

        const res = await fetch("/api/app/family-members", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patientId, nome, relacao, fone })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        setMessages(prev => [...prev, { 
          role: "model", 
          text: `✅ **Familiar cadastrado com sucesso!**\nNome: **${nome}**\nRelação: ${relacao || "Não especificado"}\nFone: ${fone ? `[${fone}](https://wa.me/${fone.replace(/\D/g, "").startsWith("55") ? fone.replace(/\D/g, "") : "55" + fone.replace(/\D/g, "")})` : "Não informado"}\nPaciente ID: ${patientId}` 
        }]);
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
        const text = cmdInput.match(/texto:\s*(.+)/i)?.[1]?.trim();

        if (!patientId || !text) throw new Error("Use: /log id: [ID], texto: [Sua transcrição]");

        const res = await fetch("/api/app/logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patientId, text })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        setMessages(prev => [...prev, { 
          role: "model", 
          text: `✅ **Texto adicionado com sucesso!**\nPaciente ID: **${patientId}**\n\nO conteúdo foi salvo na planilha "Pacientes - Áudios".` 
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
        if (!selectedImage) throw new Error("Anexe uma imagem primeiro clicando no ícone de clipe.");
        
        const id = cmdInput.match(/id:\s*([^,]+)/i)?.[1]?.trim();
        const descMatch = cmdInput.match(/(?:desc|descrição):\s*(.+)/i);
        const desc = descMatch ? descMatch[1]?.trim() : "";

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

        setMessages(prev => [...prev, { 
          role: "model", 
          text: `✅ **Imagem salva com sucesso!**\nPaciente ID: **${id}**\n[Visualizar no Drive](${data.link})` 
        }]);
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
          const part = parts.find(p => p.toLowerCase().includes(label));
          return part ? part.split(":")[1]?.trim() : "";
        };

        const nome = getVal("nome");
        const fone = getVal("fone");
        const idade = getVal("idade");

        if (!nome) throw new Error("O campo 'nome:' é obrigatório.");

        const res = await fetch("/api/app/patients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome, fone, idade })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        setMessages(prev => [...prev, { 
          role: "model", 
          text: `✅ **Paciente cadastrado com sucesso!**\nID Gerado: **${data.id}**\nNome: ${nome}\nFone: ${fone ? `[${fone}](https://wa.me/${fone.replace(/\D/g, "").startsWith("55") ? fone.replace(/\D/g, "") : "55" + fone.replace(/\D/g, "")})` : "Não informado"}` 
        }]);
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
            <h3 className="font-semibold text-gray-900 leading-tight">Nexus Business AI</h3>
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
                    placeholder="Ex: Nexus AI"
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
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.2 }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div className={`flex gap-3 max-w-[90%] sm:max-w-[85%] ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  msg.role === "user" ? "bg-gray-100 text-gray-600" : "bg-blue-100 text-blue-600"
                }`}>
                  {msg.role === "user" ? <User size={16} /> : <Bot size={16} />}
                </div>
                <div className={`p-3 rounded-2xl text-sm ${
                  msg.role === "user" 
                    ? "bg-blue-600 text-white rounded-tr-none" 
                    : "bg-gray-100 text-gray-800 rounded-tl-none border border-gray-200"
                }`}>
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
                          components={{
                            code({ children, ...props }) {
                              const content = String(children);
                              // Check if it's inline (no className which usually defines language-*)
                              const isInline = !props.className;
                              if (isInline && content.startsWith("/")) {
                                // Customize labels for common commands
                                let label = content;
                                if (content.startsWith("/remover_evento")) label = "🗑️";
                                if (content.startsWith("/pacientes")) label = "📋 Pacientes";
                                if (content.startsWith("/prep_img")) label = "🖼️ Anexar";
                                if (content.startsWith("/prep_p") || content.startsWith("/p ")) {
                                  if (content.includes(" label:")) {
                                    label = content.split(" label:")[1].trim();
                                  } else {
                                    label = "🚀 Relatório";
                                  }
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

                      {msg.form && (
                        <MessageForm 
                          form={msg.form} 
                          onSubmit={(cmd) => handleSend(undefined, cmd)} 
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
        <div className="px-4 pb-2 flex flex-wrap gap-2 shrink-0">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => handleSend(undefined, s.prompt, true)}
              className="text-[11px] font-bold px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-full text-gray-600 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600 transition-all uppercase tracking-wide"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSend} className="p-3 sm:p-6 border-t bg-gray-50 shrink-0">
        <div className="relative flex gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageSelect}
            className="hidden"
            accept="image/*"
          />
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-11 h-11 bg-white border border-gray-200 rounded-xl flex items-center justify-center text-gray-400 hover:text-blue-600 hover:border-blue-200 transition-colors"
              title="Upload Image"
            >
              <ImageIcon size={20} />
            </button>
          </div>
          <div className="relative flex-1">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Message your agent..."
              className="w-full bg-white border border-gray-200 rounded-xl py-3 pl-4 pr-12 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm shadow-sm"
            />
            <button
              type="submit"
              disabled={isLoading || (!input.trim() && !selectedImage)}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
