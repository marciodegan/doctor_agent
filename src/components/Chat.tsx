import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Send, User, Bot, Loader2, Sparkles, Image as ImageIcon, X, Mic, Shield, LogOut, Lock, Info } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { tools, executeTool } from "../lib/gemini";

interface Message {
  role: "user" | "model";
  text: string;
  image?: string;
  audio?: string;
}

export const Chat: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    { role: "model", text: "Hello! I'm your Nexus Agent. How can I help you manage your workspace today?" }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedAudio, setSelectedAudio] = useState<string | null>(null);
  const [lastProcessedFile, setLastProcessedFile] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  
  const [showSecurityInfo, setShowSecurityInfo] = useState(false);
  
  // Create a mutable reference for the agent so we can reset it
  const agentRef = useRef<any>(null);

  useEffect(() => {
    import("../lib/gemini").then(({ createAgent }) => {
      if (!agentRef.current) agentRef.current = createAgent();
    });
  }, []);

  const resetAgent = async () => {
    const { createAgent } = await import("../lib/gemini");
    agentRef.current = createAgent();
    setMessages([{ role: "model", text: "Chat history cleared. How can I help you?" }]);
    setSelectedImage(null);
    setSelectedAudio(null);
    setLastProcessedFile(null);
  };

  const handleLogout = () => {
    document.cookie = "google_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    window.location.reload();
  };

  const suggestions = [
    { label: "🚀 Relatórios", prompt: "/iniciarrelat" },
    { label: "📝 Log Texto", prompt: "/iniciarlog" },
    { label: "👪 Familiares", prompt: "/iniciarfamiliar" },
    { label: "📅 Agendar", prompt: "/iniciaragenda" },
    { label: "🖼️ Enviar Imagem", prompt: "/img id: 1, desc: Foto da ferida" },
    { label: "👤 Novo", prompt: "/iniciarcadastro" },
    { label: "📅 Agenda", prompt: "/agenda" },
    { label: "❓ Ajuda", prompt: "/ajuda" },
  ];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

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

  const handleAudioSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedAudio(reader.result as string);
      };
      reader.readAsDataURL(file);
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
        const dateParts = dataStr.split("-");
        if (dateParts.length === 3) {
          const [d, m, y] = dateParts;
          eventDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
        } else {
          // Try slash format too just in case
          const altParts = dataStr.split("/");
          if (altParts.length === 3) {
            const [d, m, y] = altParts;
            eventDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
          }
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
        const tonight = new Date();
        tonight.setHours(23, 59, 59, 999);
        
        const res = await fetch(`/api/calendar/events?timeMin=${today.toISOString()}&timeMax=${tonight.toISOString()}`);
        const data = await res.json();
        
        const list = data.map((e: any) => {
          const start = new Date(e.start.dateTime || e.start.date);
          const timeStr = start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
          return `• **${timeStr}** - ${e.summary} \`/remover_evento ${e.id}\``;
        }).join("\n\n");
        
        setMessages(prev => [...prev, { 
          role: "model", 
          text: `📅 **Sua Agenda (${new Date().toLocaleDateString("pt-BR")}):**\n\n${list || "Sem compromissos hoje na sua conta."}\n\n*Nota: Esta agenda é pessoal e visível apenas para você.*` 
        }]);
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
        text: `👤 **Cadastro de Novo Paciente**\n\n` +
              `Para registrar um novo paciente, use o comando abaixo:\n\n` +
              `\`/registrar nome: [NOME], fone: [TELEFONE], idade: [IDADE]\`\n\n` +
              `**Exemplo:**\n\`/registrar nome: João Silva, fone: (51) 98888-7777, idade: 30\`\n\n` +
              `*Clique no comando abaixo para carregar o modelo no chat:*`
      }]);
      setInput("/registrar nome: , fone: , idade: ");
      return "PREFILL";
    }

    if (cmd === "/iniciaragenda") {
      const today = new Date();
      const tomorrow = new Date();
      tomorrow.setDate(today.getDate() + 1);
      
      const pad = (n: number) => n.toString().padStart(2, "0");
      const hojeStr = `${pad(today.getDate())}-${pad(today.getMonth() + 1)}-${today.getFullYear()}`;
      const amanhaStr = `${pad(tomorrow.getDate())}-${pad(tomorrow.getMonth() + 1)}-${tomorrow.getFullYear()}`;
      
      setMessages(prev => [...prev, { 
        role: "model", 
        text: "📅 **Novo Agendamento**\n\nEscolha uma opção para facilitar:\n\n" +
              `- Hoje \`/agendar data: ${hojeStr}, hora: 09:00, evento: \`\n` +
              `- Amanhã \`/agendar data: ${amanhaStr}, hora: 09:00, evento: \`\n\n` +
              "Ou preencha manualmente:\n`/agendar data: DD-MM-AAAA, hora: HH:MM, evento: NOME`" 
      }]);
      return true;
    }

    if (cmd === "/iniciarrelat") {
      setIsLoading(true);
      try {
        const res = await fetch("/api/app/patients");
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        
        const list = data.map((p: any) => `• **${p.nome}** (ID: ${p.id}) - Digite \`/prep_p ${p.id}\``).join("\n\n");
        setMessages(prev => [...prev, { 
          role: "model", 
          text: `🚀 **Para qual paciente deseja gerar o relatório?**\n\n${list || "Nenhum paciente encontrado."}\n\n*Clique no comando acima para preparar o envio.*` 
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
        setInput(`/registrar_familiar id: ${id}, nome: , relacao: , fone: `);
        setMessages(prev => [...prev, { 
          role: "model", 
          text: `👪 **Novo Familiar**\n\nComplete o comando no chat e envie:\n\`/registrar_familiar id: ${id}, nome: [NOME], relacao: [TIPO], fone: [FONE]\`` 
        }]);
        return "PREFILL";
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
        setInput(`/log id: ${id}, texto: `);
        return "PREFILL";
      }
    }

    if (cmd.startsWith("/p") || cmd === "/pacientes" || cmd === "/familiares" || cmd === "/ajuda") {
      setIsLoading(true);
      try {
        if (cmd === "/ajuda") {
          setMessages(prev => [...prev, { 
            role: "model", 
            text: "🤖 **Nexus Shortcuts (Zero Tokens):**\n\n" +
                  "- `/pacientes`: Lista todos os pacientes (Banco Compartilhado).\n" +
                  "- `/p [ID]`: Relatório rápido (ex: `/p 2`).\n" +
                  "- `/familiares [ID]`: Lista familiares de um paciente.\n" +
                  "- `/novo_familiar [ID]`: Atalho para cadastrar familiar.\n" +
                  "- `/registrar_familiar id: [ID], nome: [N], relacao: [R], fone: [F]`: Cadastro de familiar.\n" +
                  "- `/agendar data: [D], hora: [H], evento: [E]`: Cria evento na agenda Google.\n" +
                  "- `/log id: [ID], texto: [T]`: Adiciona log de texto direto.\n" +
                  "- `/img id: [ID], desc: [D]`: Envia imagem anexada direto para o Drive.\n" +
                  "- `/registrar nome: [N], fone: [F], idade: [I]`: Cadastra paciente.\n" +
                  "- `/iniciarcadastro`: Ajuda para cadastrar novo paciente.\n" +
                  "- `/agenda`: **Sua** agenda pessoal (Privada).\n" +
                  "- `/iniciaragenda`: Ajuda para marcar novo compromisso.\n" +
                  "- `/limpar`: Reseta a memória da IA.\n" +
                  "- `/ajuda`: Mostra esta lista.\n\n" +
                  "💡 **Privacidade:** Pacientes são compartilhados com a equipe, mas a Agenda é individual de cada conta Google."
          }]);
        } else if (cmd === "/pacientes") {
          const res = await fetch("/api/app/patients");
          const data = await res.json();
          if (data.error) throw new Error(data.error);
          
          const list = data.map((p: any) => `• **${p.nome}** (ID: ${p.id}) - \`/p ${p.id}\``).join("\n\n");
          setMessages(prev => [...prev, { 
            role: "model", 
            text: `📂 **Lista de Pacientes:**\n\n${list || "Nenhum paciente encontrado."}` 
          }]);
        } else if (cmd.startsWith("/familiares")) {
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
        } else if (cmd.startsWith("/p ")) {
          const id = cmdInput.split(" ")[1];
          if (!id) throw new Error("Especifique um ID (ex: /p 1)");

          const res = await fetch(`/api/app/patient-report/${id}`);
          const data = await res.json();
          if (data.error) throw new Error(data.error);

          const cad = data.cadastro;
          const audios = data.audios.map((a: any) => `• [${a.data}] ${a.conteudo}${a.link ? ` **[[Link](${a.link})]**` : ""}`).join("\n\n");
          
          const docs = data.imagens.map((i: any) => {
            // Extract Drive ID from link if possible for the proxy download
            const fileId = i.link?.match(/[-\w]{25,}/)?.[0];
            const downloadText = fileId ? ` **[[Baixar Arquivo](/api/drive/file/${fileId})]**` : "";
            return `• [${i.data}] ${i.descricao}${downloadText} **[[Drive](${i.link})]**`;
          }).join("\n\n");

          const fams = data.familiares.map((f: any) => {
            const cleanFone = f.fone ? f.fone.replace(/\D/g, "") : "";
            const waNumber = cleanFone ? (cleanFone.startsWith("55") ? cleanFone : "55" + cleanFone) : "";
            const foneLink = waNumber ? `[📞 **${f.fone}**](https://wa.me/${waNumber})` : "📞 Sem fone";
            return `• **${f.nome}** (${f.relacao}) - ${foneLink}`;
          }).join("\n\n");

          const cleanCadFone = cad.Telefone ? cad.Telefone.replace(/\D/g, "") : "";
          const waCadNumber = cleanCadFone ? (cleanCadFone.startsWith("55") ? cleanCadFone : "55" + cleanCadFone) : "";
          const foneCadLink = waCadNumber ? `[📞 **${cad.Telefone}**](https://wa.me/${waCadNumber})` : "N/A";

          const reportText = `🚀 **Relatório Direto: ${cad.Nome} (ID: ${cad.ID})**\n\n` +
            `**Cadastro:**\n- Telefone: ${foneCadLink}\n- Idade: ${cad.Idade || "N/A"}\n\n` +
            `**Familiares:**\n${fams || "Nenhum registro"}\n\n` +
            `**Evoluções:**\n${audios || "Nenhum registro"}\n\n` +
            `**Imagens:**\n${docs || "Nenhum registro"}`;

          setMessages(prev => [...prev, { role: "model", text: reportText }]);
        }
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
        const desc = cmdInput.match(/desc:\s*(.+)/i)?.[1]?.trim();

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

  const handleSend = async (e?: React.FormEvent, customPrompt?: string) => {
    e?.preventDefault();
    const promptToSend = customPrompt || input;
    if (!promptToSend.trim() && !selectedImage && !selectedAudio || isLoading) return;

    const userMessage = promptToSend.trim();

    // Direct Command Interceptor to save tokens
    if (userMessage.startsWith("/")) {
      const handled = await handleDirectCommand(userMessage);
      if (handled === "PREFILL") return; // Keep input as set by command
      if (handled) {
        setInput("");
        setMessages(prev => [...prev, { role: "user", text: userMessage }]);
        return;
      }
    }

    const userImage = selectedImage;
    const userAudio = selectedAudio;
    if (userImage) setLastProcessedFile(userImage);
    if (userAudio) setLastProcessedFile(userAudio);
    
    setInput("");
    setSelectedImage(null);
    setSelectedAudio(null);
    setMessages(prev => [...prev, { 
      role: "user", 
      text: userMessage, 
      image: userImage || undefined,
      audio: userAudio || undefined
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
      if (userAudio) {
        const base64Data = userAudio.split(",")[1];
        const mimeType = userAudio.split(";")[0].split(":")[1];
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
              result: await executeTool(call.name, call.args, { lastFile: userImage || userAudio || lastProcessedFile })
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
    <div id="nexus-chat" className="flex flex-col h-full bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-bottom bg-gray-50 flex items-center justify-between border-b border-gray-100">
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
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 sm:px-6 py-4 space-y-6">
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
                              if (content.startsWith("/remover_evento")) label = "🗑️ Remover";
                              if (content.startsWith("/prep_p")) label = "📄 Relatório";
                              if (content.startsWith("/logpac")) label = "📝 Novo Log";
                              if (content.startsWith("/novo_familiar")) label = "➕ Novo Familiar";
                              if (content.startsWith("/agenda_add")) label = "📅 Agendar";
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
                                  onClick={() => handleSend(undefined, content)}
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

      {/* Image/Audio Preview */}
      {(selectedImage || selectedAudio) && (
        <div className="px-4 py-2 bg-gray-50 border-t flex flex-wrap gap-3">
          {selectedImage && (
            <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200">
              <img src={selectedImage} alt="Preview" className="w-full h-full object-cover" />
              <button 
                onClick={() => setSelectedImage(null)}
                className="absolute top-0 right-0 p-1 bg-black/50 text-white hover:bg-black/70"
              >
                <X size={12} />
              </button>
            </div>
          )}
          {selectedAudio && (
            <div className="relative p-2 bg-blue-50 rounded-lg border border-blue-200 flex items-center gap-2">
              <Mic size={16} className="text-blue-600" />
              <span className="text-[10px] font-medium text-blue-700">Audio Ready</span>
              <button 
                onClick={() => setSelectedAudio(null)}
                className="p-1 hover:bg-blue-100 rounded"
              >
                <X size={12} className="text-blue-600" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Suggested Actions */}
      {!isLoading && (
        <div className="px-4 pb-2 flex flex-wrap gap-2">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => handleSend(undefined, s.prompt)}
              className="text-[11px] font-bold px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-full text-gray-600 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600 transition-all uppercase tracking-wide"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSend} className="p-3 sm:p-6 border-t bg-gray-50">
        <div className="relative flex gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageSelect}
            className="hidden"
            accept="image/*"
          />
          <input
            type="file"
            ref={audioInputRef}
            onChange={handleAudioSelect}
            className="hidden"
            accept="audio/*"
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
            <button
              type="button"
              onClick={() => audioInputRef.current?.click()}
              className="w-11 h-11 bg-white border border-gray-200 rounded-xl flex items-center justify-center text-gray-400 hover:text-blue-600 hover:border-blue-200 transition-colors"
              title="Upload Audio"
            >
              <Mic size={20} />
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
              disabled={isLoading || (!input.trim() && !selectedImage && !selectedAudio)}
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
