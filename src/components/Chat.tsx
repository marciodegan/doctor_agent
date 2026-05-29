import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, Send, User, Bot, Loader2, Plus, Sparkles, Image as ImageIcon, Camera, X, Shield, LogOut, Lock, Info, Settings, CalendarPlus, Edit3, Building2, FileText, Check, ChevronDown, Trash2, Activity, AlertCircle, Video, ExternalLink, Download } from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
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
  getDoc,
  addDoc, 
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp 
} from "firebase/firestore";
import { useGroup } from "../contexts/GroupContext";
import { OperationType, handleFirestoreError } from "../lib/firestoreUtils";
import { PatientListView } from "./PatientListView";
import { E2EMedia } from "./E2EMedia";

const sanitizeFileName = (fileName: string): string => {
  if (!fileName) return "arquivo_" + Date.now();
  
  // 1. Normalize accents
  let sanitized = fileName.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  
  // 2. Separate name and extension
  const lastDotIndex = sanitized.lastIndexOf(".");
  let namePart = lastDotIndex !== -1 ? sanitized.substring(0, lastDotIndex) : sanitized;
  let extPart = lastDotIndex !== -1 ? sanitized.substring(lastDotIndex + 1) : "";
  
  // 3. Replace spaces with dash
  namePart = namePart.replace(/\s+/g, "-");
  
  // 4. Keep only letters, numbers, dash and underscore
  namePart = namePart.toLowerCase().replace(/[^a-z0-9-_.]/g, "");
  
  // Lowercase extension and keep only alphanumeric
  extPart = extPart.toLowerCase().replace(/[^a-z0-9]/g, "");
  
  // If namePart becomes empty, generate a fallback
  let finalName = namePart || "arquivo_" + Date.now();
  
  // Assemble back
  return extPart ? `${finalName}.${extPart}` : finalName;
};

const getSafeContentType = (file: File | { name: string; type?: string }): string => {
  const name = (file.name || "").toLowerCase();
  const ext = name.split(".").pop() || "";
  const mime = (file.type || "").toLowerCase();

  if (ext === "mov") return "video/quicktime";
  if (ext === "mp4") return "video/mp4";
  if (ext === "m4v") return "video/x-m4v";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "pdf") return "application/pdf";

  if (mime && mime !== "application/octet-stream" && mime !== "") {
    return mime;
  }

  return "application/octet-stream";
};

const isVideoUrl = (url: string | null | undefined): boolean => {
  if (!url) return false;
  if (url.startsWith("data:video/")) return true;
  const cleanUrl = url.split("?")[0].toLowerCase();
  const decodedUrl = decodeURIComponent(cleanUrl);
  return (
    cleanUrl.endsWith(".mp4") ||
    cleanUrl.endsWith(".mov") ||
    cleanUrl.endsWith(".webm") ||
    cleanUrl.endsWith(".m4v") ||
    cleanUrl.endsWith(".avi") ||
    cleanUrl.endsWith(".3gp") ||
    cleanUrl.endsWith(".mkv") ||
    decodedUrl.endsWith(".mp4") ||
    decodedUrl.endsWith(".mov") ||
    decodedUrl.endsWith(".webm") ||
    decodedUrl.endsWith(".m4v") ||
    decodedUrl.endsWith(".avi") ||
    decodedUrl.endsWith(".3gp") ||
    decodedUrl.endsWith(".mkv")
  );
};

const isPdfUrl = (url: string | null | undefined): boolean => {
  if (!url) return false;
  if (url.startsWith("data:application/pdf")) return true;
  const cleanUrl = url.split("?")[0].toLowerCase();
  const decodedUrl = decodeURIComponent(cleanUrl);
  return cleanUrl.endsWith(".pdf") || decodedUrl.endsWith(".pdf");
};

interface Message {
  role: "user" | "model";
  text: string;
  image?: string;
  audio?: string;
  isProfile?: boolean;
  patientNameForStatus?: string;
  profileData?: {
    id: string;
    nome: string;
    idade: string;
    status?: string;
    hospitalId?: string;
    hospitalNome?: string;
    roomNumber?: string;
    surgery_type?: string;
    procedure?: string;
  };
  reportData?: any;
  form?: {
    title?: string;
    hospitalName?: string;
    roomNumber?: string;
    fields: { 
      label: string; 
      name: string; 
      type: string; 
      placeholder?: string; 
      defaultValue?: string;
      options?: string[];
      suggestions?: (string | { label: string; value: string })[];
      optional?: boolean;
    }[];
    submitLabel: string;
    commandPrefix: string;
    backCommand?: string;
  };
  isListing?: boolean;
  listingTitle?: string;
  actionGroups?: { title: string; actions: { label: string; cmd: string; active?: boolean }[] }[];
  isPatientListing?: boolean;
  patientListData?: {
    patients: any[];
    statuses: any[];
    hospitals: any[];
    hospitalFilter?: string;
    statusFilter?: string;
    sort?: string;
    pagination?: {
      page: number;
      totalPages: number;
      hospitalFilter?: string;
      statusFilter?: string;
      sort: string;
    };
  };
}

const MessageForm: React.FC<{ 
  form: any; 
  onSubmit: (cmd: string) => void;
  selectedImage?: string | null;
  onSelectImage?: (img: string | null) => void;
  selectedFileObj?: File | null;
  onSelectFileObj?: (file: File | null) => void;
}> = ({ form, onSubmit, selectedImage, onSelectImage, selectedFileObj, onSelectFileObj }) => {
  const { apiFetch } = useGroup();
  const [showRemovePatientConfirm, setShowRemovePatientConfirm] = useState(false);
  const [isRemovingPatient, setIsRemovingPatient] = useState(false);
  const [removalError, setRemovalError] = useState<string | null>(null);

  const isEditPatientForm = !!(form.commandPrefix && form.commandPrefix.includes("/update_patient"));
  const patientIdMatch = form.commandPrefix?.match(/id:\s*([^, ]+)/);
  const patientId = patientIdMatch ? patientIdMatch[1].trim() : null;

  const handleConfirmRemoval = async () => {
    if (!patientId) return;
    setIsRemovingPatient(true);
    setRemovalError(null);
    try {
      const response = await apiFetch(`/api/app/patients/${patientId}/remove`, {
        method: "POST"
      });
      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error || "Erro ao remover paciente.");
      }
      
      setShowRemovePatientConfirm(false);
      onSubmit("/pacientes");
    } catch (err: any) {
      console.error(err);
      setRemovalError(err.message || "Não foi possível remover o paciente.");
    } finally {
      setIsRemovingPatient(false);
    }
  };

  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    form.fields.forEach((f: any) => {
      initial[f.name] = f.defaultValue || "";
    });
    return initial;
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  const resizeImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.readAsDataURL(file);
    });
  };

  const [fileError, setFileError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileError(null);

    // Validate type
    const mime = (file.type || "").toLowerCase();
    const name = (file.name || "").toLowerCase();
    let fileTypeResolved: "image" | "video" | "pdf" | null = null;

    if (mime.startsWith("image/") || name.endsWith(".heic") || name.endsWith(".jpeg") || name.endsWith(".jpg") || name.endsWith(".png") || name.endsWith(".webp")) {
      fileTypeResolved = "image";
    } else if (mime.startsWith("video/") || name.endsWith(".mp4") || name.endsWith(".mov") || name.endsWith(".webm") || name.endsWith(".quicktime") || name.endsWith(".m4v")) {
      fileTypeResolved = "video";
    } else if (mime === "application/pdf" || name.endsWith(".pdf")) {
      fileTypeResolved = "pdf";
    }

    if (!fileTypeResolved) {
      setFileError("Tipo de arquivo não permitido. Envie uma imagem, vídeo ou PDF.");
      if (onSelectImage) onSelectImage(null);
      if (onSelectFileObj) onSelectFileObj(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // Validate size
    if (fileTypeResolved === "image" && file.size > 10 * 1024 * 1024) {
      setFileError("Este arquivo é muito grande. Escolha um arquivo menor para anexar (máximo 10MB para imagens).");
      if (onSelectImage) onSelectImage(null);
      if (onSelectFileObj) onSelectFileObj(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (fileTypeResolved === "video" && file.size > 100 * 1024 * 1024) {
      setFileError("Este vídeo é muito grande. Escolha um vídeo menor para anexar.");
      if (onSelectImage) onSelectImage(null);
      if (onSelectFileObj) onSelectFileObj(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (fileTypeResolved === "pdf" && file.size > 20 * 1024 * 1024) {
      setFileError("Este arquivo é muito grande. Escolha um arquivo menor para anexar (máximo 20MB para PDFs).");
      if (onSelectImage) onSelectImage(null);
      if (onSelectFileObj) onSelectFileObj(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (onSelectFileObj) {
      onSelectFileObj(file);
    }

    if (fileTypeResolved === "image") {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (onSelectImage) {
          onSelectImage(event.target?.result as string);
        }
      };
      reader.onerror = () => {
        setFileError("Não foi possível ler a imagem.");
      };
      reader.readAsDataURL(file);
    } else {
      try {
        if (onSelectImage) {
          onSelectImage(URL.createObjectURL(file));
        }
      } catch (err) {
        setFileError("Não foi possível gerar a pré-visualização.");
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parts = Object.entries(values).map(([k, v]) => `${k}: ${v}`);
    let fullCmd = `${form.commandPrefix} ${parts.join(", ")}`;
    onSubmit(fullCmd);
  };

  const isImageForm = form.commandPrefix?.startsWith("/img");

  const isObjectSuggestion = (s: any): s is { label: string, value: string } => typeof s === 'object' && s !== null && 'label' in s;

  const isCalendarForm = form.commandPrefix?.includes("/calendario_add");

  const getField = (name: string) => form.fields.find((f: any) => f.name === name);

  const renderFieldCustom = (fieldName: string) => {
    const field = getField(fieldName);
    if (!field) return null;

    let displayLabel = field.label;
    if (isCalendarForm) {
      if (fieldName === "nomePaciente") displayLabel = "Nome do paciente";
      else if (fieldName === "evento") displayLabel = "Procedimento";
      else if (fieldName === "data") displayLabel = "Data";
      else if (fieldName === "hora") displayLabel = "Horário";
      else if (fieldName === "tipo") displayLabel = "Tipo";
      else if (fieldName === "hospitalId") displayLabel = "Hospital / Clínica";
      else if (fieldName === "sala") displayLabel = "Sala / Unidade";
      else if (fieldName === "descricao") displayLabel = "Observações";
    }

    return (
      <div className="space-y-1.5 flex flex-col text-left">
        <label className={isCalendarForm ? "text-xs font-semibold text-slate-700 ml-0.5" : "text-[11px] font-semibold uppercase tracking-wider text-slate-500 ml-1"}>
          {displayLabel} {field.optional && <span className="text-slate-400 font-normal lowercase">(opcional)</span>}
        </label>
        
        {!field.hideInput && (
          field.type === "select" ? (
            <div className="relative">
              <select
                value={values[field.name] || ""}
                onChange={(e) => setValues(prev => ({ ...prev, [field.name]: e.target.value }))}
                className="w-full h-12 px-4 glass-input rounded-xl text-slate-800 text-sm appearance-none cursor-pointer pr-10 shadow-sm transition-all"
                required={!field.optional}
              >
                <option value="" disabled={!field.optional}>{field.optional ? "Opcional (Deixar em branco)" : "Selecione uma opção"}</option>
                {field.options?.map((opt: string) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <ChevronDown size={16} />
              </div>
            </div>
          ) : field.readOnly ? (
            <div className="w-full h-12 px-4 bg-gray-50 border border-gray-100 rounded-xl text-sm text-gray-950 font-semibold flex items-center shadow-inner">
              {(() => {
                const val = values[field.name];
                if (!val) return <span className="text-gray-300 italic">{field.placeholder}</span>;
                if (field.suggestions) {
                  const suggestion = field.suggestions.find((s: any) => (typeof s === 'object' ? s.value : s) === val);
                  return typeof suggestion === 'object' ? suggestion.label : val;
                }
                return val;
              })()}
            </div>
          ) : field.type === "textarea" ? (
            <textarea
              value={values[field.name] || ""}
              onChange={(e) => setValues(prev => ({ ...prev, [field.name]: e.target.value }))}
              placeholder={field.placeholder}
              rows={3}
              className="w-full px-4 py-3 glass-input rounded-xl text-slate-800 text-sm transition-all shadow-sm resize-none"
              required={!field.optional}
            />
          ) : (
            <input 
              type={field.type}
              value={values[field.name] || ""}
              onChange={(e) => setValues(prev => ({ ...prev, [field.name]: e.target.value }))}
              placeholder={field.placeholder}
              className="w-full h-12 px-4 glass-input rounded-xl text-slate-800 text-sm transition-all shadow-sm"
              required={!field.optional}
              {...(field.type === "number" ? { inputMode: "numeric" } : {})}
            />
          )
        )}

        {field.suggestions && field.suggestions.length > 0 && (
          <div className={isCalendarForm ? "flex flex-wrap gap-1.5 mt-1.5 ml-0.5" : "flex flex-wrap gap-2 mt-1.5 ml-1"}>
            {field.suggestions.map((opt: any) => {
              const label = isObjectSuggestion(opt) ? opt.label : opt;
              const value = isObjectSuggestion(opt) ? opt.value : opt;
              const isSelected = values[field.name] === value;
              
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setValues(prev => ({ ...prev, [field.name]: value }))}
                  className={isCalendarForm ? `px-3 py-1.5 rounded-xl text-[11px] tracking-wide transition-all border cursor-pointer ${
                    isSelected 
                      ? "bg-blue-600 border-blue-600 text-white shadow-sm font-semibold" 
                      : "bg-slate-50 hover:bg-slate-100/80 border-slate-100/50 text-slate-500 hover:text-slate-700 font-medium"
                  }` : `px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all border shadow-sm cursor-pointer ${
                    isSelected 
                      ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-200" 
                      : "bg-gray-100/50 border-gray-200 text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  if (isCalendarForm) {
    return (
      <div className="w-full max-w-2xl mx-auto space-y-4">
        {/* Main Title Above Form Card */}
        <div className="flex flex-col gap-0.5 text-left px-2 mb-1">
          <h3 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight leading-tight flex items-center gap-2">
            <span>📅</span> Novo Evento
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">
            Preencha os dados abaixo para criar o compromisso.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 sm:p-8 glass-panel rounded-[2.5rem] space-y-6 shadow-xl transition-all">
          <AnimatePresence>
            {showRemoveConfirm && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
              >
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  className="bg-white rounded-[2rem] p-8 max-w-sm w-full shadow-2xl text-center"
                >
                  <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500">
                    <X size={32} strokeWidth={3} />
                  </div>
                  <h3 className="text-xl font-black text-gray-900 mb-2 uppercase tracking-tight">Confirmar Remoção</h3>
                  <p className="text-gray-500 text-sm mb-8 leading-relaxed">Você tem certeza que deseja remover esta foto selecionada?</p>
                  <div className="flex gap-3">
                    <button 
                      type="button"
                      onClick={() => setShowRemoveConfirm(false)}
                      className="flex-1 px-6 py-3 bg-gray-100 text-gray-500 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-gray-200 transition-all"
                    >
                      Não, Manter
                    </button>
                    <button 
                      type="button"
                      onClick={() => {
                        onSelectImage?.(null);
                        setShowRemoveConfirm(false);
                      }}
                      className="flex-1 px-6 py-3 bg-red-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-200"
                    >
                      Sim, Remover
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Section 1: Paciente e procedimento */}
          <div className="space-y-4">
            <h4 className="text-sm font-black text-slate-800 tracking-tight text-left pb-1.5 border-b border-slate-100 flex items-center gap-1.5">
              Paciente e procedimento
            </h4>
            <div className="space-y-4">
              {renderFieldCustom("nomePaciente")}
              {renderFieldCustom("evento")}
            </div>
          </div>

          {/* Section 2: Data e horário */}
          <div className="space-y-4">
            <h4 className="text-sm font-black text-slate-800 tracking-tight text-left pb-1.5 border-b border-slate-100 flex items-center gap-1.5">
              Data e horário
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {renderFieldCustom("data")}
              {renderFieldCustom("hora")}
              {renderFieldCustom("tipo")}
            </div>
          </div>

          {/* Section 3: Detalhes */}
          <div className="space-y-4">
            <h4 className="text-sm font-black text-slate-800 tracking-tight text-left pb-1.5 border-b border-slate-100 flex items-center gap-1.5">
              Detalhes
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {renderFieldCustom("hospitalId")}
              {renderFieldCustom("sala")}
            </div>
            <div className="mt-2">
              {renderFieldCustom("descricao")}
            </div>
          </div>

          {/* Footer info card */}
          {(form.hospitalName || form.roomNumber) && (
            <div className="bg-blue-50/30 border border-blue-100/40 rounded-2xl p-4 flex flex-col gap-1 text-left">
              {form.hospitalName && (
                <div className="flex items-center gap-2 text-blue-700 font-bold text-sm">
                  <Building2 size={16} />
                  <span className="uppercase tracking-wide">{form.hospitalName}</span>
                </div>
              )}
              {form.roomNumber && (
                <span className="text-xs text-slate-500 ml-6 font-medium">
                  Sala/Quarto de Internação: {form.roomNumber}
                </span>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-4 border-t border-gray-100 pb-2">
            <div className="flex items-center justify-end gap-3 w-full sm:w-auto">
              {form.backCommand && (
                <button
                  type="button"
                  onClick={() => onSubmit(form.backCommand)}
                  className="px-5 py-3 h-12 text-xs font-bold text-slate-400 hover:text-red-500 hover:bg-red-50/50 rounded-2xl transition-all flex items-center gap-2 group cursor-pointer"
                >
                  <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                  Cancelar
                </button>
              )}

              <button 
                type="submit"
                className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 text-white px-8 h-12 rounded-2xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/10 active:scale-[0.98] cursor-pointer"
              >
                <Plus size={16} strokeWidth={2.5} />
                {form.submitLabel}
              </button>
            </div>
          </div>
        </form>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 p-5 glass-panel rounded-[2rem] space-y-5 shadow-xl transition-all">
      <AnimatePresence>
        {showRemoveConfirm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2rem] p-8 max-w-sm w-full shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500">
                <X size={32} strokeWidth={3} />
              </div>
              <h3 className="text-xl font-black text-gray-900 mb-2 uppercase tracking-tight">Confirmar Remoção</h3>
              <p className="text-gray-500 text-sm mb-8 leading-relaxed">Você tem certeza que deseja remover esta foto selecionada?</p>
              <div className="flex gap-3">
                <button 
                  type="button"
                  onClick={() => setShowRemoveConfirm(false)}
                  className="flex-1 px-6 py-3 bg-gray-100 text-gray-500 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-gray-200 transition-all"
                >
                  Não, Manter
                </button>
                <button 
                  type="button"
                  onClick={() => {
                    onSelectImage?.(null);
                    setShowRemoveConfirm(false);
                  }}
                  className="flex-1 px-6 py-3 bg-red-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-200"
                >
                  Sim, Remover
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showRemovePatientConfirm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2rem] p-8 max-w-sm w-full shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500">
                <Trash2 size={32} strokeWidth={2} />
              </div>
              <h3 className="text-xl font-black text-gray-950 mb-2 uppercase tracking-tight">Remover paciente?</h3>
              <p className="text-gray-500 text-sm mb-6 leading-relaxed">
                Este paciente será removido da lista, mas o histórico será mantido para segurança e auditoria.
              </p>
              {removalError && (
                <p className="text-red-600 text-xs mb-4 bg-red-50 p-2 rounded-xl border border-red-100 font-medium font-mono">
                  {removalError}
                </p>
              )}
              <div className="flex gap-3">
                <button 
                  type="button"
                  onClick={() => setShowRemovePatientConfirm(false)}
                  disabled={isRemovingPatient}
                  className="flex-1 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button 
                  type="button"
                  onClick={handleConfirmRemoval}
                  disabled={isRemovingPatient}
                  className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-red-200 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isRemovingPatient ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : null}
                  Confirmar Remoção
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-3 mb-1 border-b border-gray-50 pb-3">
        <div className="flex flex-col">
          {form.title && <h4 className="text-xs font-black text-blue-900 uppercase tracking-widest leading-tight">{form.title}</h4>}
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">Complete as informações</span>
        </div>
      </div>
      
      {isImageForm && (
        <div className="space-y-2">
          <label className="text-[10px] uppercase tracking-wider font-bold text-gray-500 ml-1">Anexar Documento / Foto, Vídeo ou PDF</label>
          <input
            id="native-image-upload"
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,video/mp4,video/quicktime,.mov,.mp4,.m4v,application/pdf,.pdf"
            onChange={handleFileChange}
            style={{
              position: "absolute",
              opacity: 0,
              width: 1,
              height: 1,
              overflow: "hidden"
            }}
          />
          
          {fileError && (
            <div className="flex items-center gap-1.5 p-2.5 bg-red-50 border border-red-100 rounded-xl text-red-600 text-[10px] font-bold">
              <AlertCircle size={12} className="shrink-0" />
              <span>{fileError}</span>
            </div>
          )}

          {selectedImage ? (
            <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-gray-200 bg-slate-900 flex items-center justify-center group">
              {isPdfUrl(selectedImage) ? (
                <div className="flex flex-col items-center gap-2 p-6 text-center text-white h-full w-full bg-gradient-to-br from-slate-800 to-slate-950 justify-center">
                  <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center text-red-500">
                    <FileText size={28} />
                  </div>
                  <span className="text-xs font-bold text-slate-200 truncate max-w-[200px]">
                    {selectedFileObj?.name || "Documento PDF"}
                  </span>
                  {selectedFileObj?.size && (
                    <span className="text-[10px] text-slate-400">
                      PDF • {(selectedFileObj.size / (1024 * 1024)).toFixed(2)} MB
                    </span>
                  )}
                </div>
              ) : isVideoUrl(selectedImage) ? (
                <video src={selectedImage} controls className="w-full h-full object-contain" />
              ) : (
                <img src={selectedImage} alt="Preview" className="w-full h-full object-contain" />
              )}
              <button 
                type="button"
                onClick={() => {
                  if (onSelectImage) onSelectImage(null);
                  if (onSelectFileObj) onSelectFileObj(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="absolute top-3 right-3 px-3 py-1.5 bg-red-600/90 text-white rounded-xl hover:bg-red-700 transition-all shadow-lg flex items-center gap-1.5 active:scale-95 text-[10px] font-black uppercase tracking-widest backdrop-blur-sm cursor-pointer z-10"
              >
                <X size={12} strokeWidth={3} />
                Remover {isPdfUrl(selectedImage) ? "Documento" : isVideoUrl(selectedImage) ? "Vídeo" : "Imagem"}
              </button>
            </div>
          ) : (
            <button 
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full aspect-video bg-white border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center text-gray-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition-all gap-2 cursor-pointer"
            >
              <FileText size={32} />
              <span className="text-xs font-semibold text-gray-500">Toque para selecionar imagem, vídeo ou PDF</span>
            </button>
          )}
        </div>
      )}

      {form.fields.map((field: any) => (
        <div key={field.name} className="space-y-2">
          <label className="text-[10px] uppercase tracking-wider font-bold text-gray-500 ml-1">{field.label}</label>
          
          {!field.hideInput && (
            field.type === "select" ? (
              <div className="relative">
                <select
                  value={values[field.name] || ""}
                  onChange={(e) => setValues(prev => ({ ...prev, [field.name]: e.target.value }))}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none cursor-pointer pr-10"
                  required={!field.optional}
                >
                  <option value="" disabled={!field.optional}>{field.optional ? "Opcional (Deixar em branco)" : "Selecione uma opção"}</option>
                  {field.options?.map((opt: string) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                  <Plus size={14} className="rotate-45" />
                </div>
              </div>
            ) : field.readOnly ? (
              <div className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm text-gray-900 font-bold shadow-inner">
                {(() => {
                  const val = values[field.name];
                  if (!val) return <span className="text-gray-300 italic">{field.placeholder}</span>;
                  if (field.suggestions) {
                    const suggestion = field.suggestions.find((s: any) => (typeof s === 'object' ? s.value : s) === val);
                    return typeof suggestion === 'object' ? suggestion.label : val;
                  }
                  return val;
                })()}
              </div>
            ) : (
              <input 
                type={field.type}
                value={values[field.name]}
                onChange={(e) => setValues(prev => ({ ...prev, [field.name]: e.target.value }))}
                placeholder={field.placeholder}
                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm"
                required={!field.optional}
                {...(field.type === "number" ? { inputMode: "numeric" } : {})}
              />
            )
          )}

          {field.suggestions && field.suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1 ml-1">
              {field.suggestions.map((opt: any) => {
                const label = isObjectSuggestion(opt) ? opt.label : opt;
                const value = isObjectSuggestion(opt) ? opt.value : opt;
                const isSelected = values[field.name] === value;
                
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setValues(prev => ({ ...prev, [field.name]: (isSelected && field.optional) ? "" : value }))}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black transition-all uppercase border shadow-sm ${
                      isSelected 
                        ? "bg-blue-600 border-blue-600 text-white shadow-blue-100" 
                        : "bg-white border-gray-100 text-gray-500 hover:border-blue-600 hover:text-blue-600"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
      
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-gray-50">
        <div className="flex flex-col items-start w-full sm:w-auto">
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

        <div className="w-full sm:w-auto">
          {isEditPatientForm ? (
            <div className="flex flex-col gap-3 w-full sm:flex-row-reverse sm:items-center sm:gap-3 animate-fade-in">
              {/* Primary action takes full width on mobile, and is highlighted as main action */}
              <button 
                type="submit"
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-8 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-xl shadow-blue-500/20 hover:shadow-blue-500/30 active:scale-95 cursor-pointer"
              >
                {form.submitLabel.toLowerCase().includes("salvar") || form.submitLabel.toLowerCase().includes("registrar") ? (
                  <Check size={16} strokeWidth={3} />
                ) : (
                  <Plus size={16} strokeWidth={3} />
                )}
                {form.submitLabel}
              </button>

              {/* Secondary actions below it side-by-side on mobile */}
              <div className="flex gap-2.5 w-full sm:w-auto sm:flex-row">
                {form.backCommand && (
                  <button
                    type="button"
                    onClick={() => onSubmit(form.backCommand)}
                    className="flex-1 sm:flex-none justify-center px-4 py-3 text-[10px] font-black text-gray-500 uppercase tracking-widest hover:text-red-500 transition-all flex items-center gap-2 group cursor-pointer bg-gray-50 border border-gray-100 rounded-2xl"
                  >
                    <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
                    Cancelar
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowRemovePatientConfirm(true)}
                  className="flex-1 sm:flex-none justify-center px-4 py-3 text-[10px] font-black text-red-600 uppercase tracking-widest bg-red-50 hover:bg-red-100 border border-red-200 rounded-2xl transition-all flex items-center gap-1.5 cursor-pointer shadow-sm shadow-red-50"
                >
                  <Trash2 size={14} />
                  Remover Paciente
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 w-full">
              {form.backCommand && (
                <button
                  type="button"
                  onClick={() => onSubmit(form.backCommand)}
                  className="px-6 py-3 text-[10px] font-black text-gray-400 tracking-widest hover:text-red-500 transition-all flex items-center gap-2 group cursor-pointer"
                >
                  <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
                  Cancelar
                </button>
              )}

              <button 
                type="submit"
                className="flex-1 sm:flex-none bg-blue-600 text-white px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-xl shadow-blue-500/20 hover:shadow-blue-500/30 active:scale-95 cursor-pointer"
              >
                {form.submitLabel.toLowerCase().includes("salvar") || form.submitLabel.toLowerCase().includes("registrar") ? (
                  <Check size={16} strokeWidth={3} />
                ) : (
                  <Plus size={16} strokeWidth={3} />
                )}
                {form.submitLabel}
              </button>
            </div>
          )}
        </div>
      </div>
    </form>
  );
};

export const Chat: React.FC<{ 
  onNavigateToCalendar?: () => void,
  onViewLogs?: (patientId: string) => void,
  initialCommand?: string | null,
  onCommandExecuted?: () => void
}> = ({ onNavigateToCalendar, onViewLogs, initialCommand, onCommandExecuted }) => {
  const { activeGroup, companyName, whatsappNumber, imageAnalysisPrompt, apiFetch, getGroupCryptoKey } = useGroup();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedFileObj, setSelectedFileObj] = useState<File | null>(null);
  const [lastProcessedFile, setLastProcessedFile] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const shouldScrollTopRef = useRef(false);

  const [confirmCommand, setConfirmCommand] = useState<{ title: string, cmd: string, shouldClear?: boolean } | null>(null);

  // Group Configurations
  const [groupHospitals, setGroupHospitals] = useState<{id: string, nome: string, active?: boolean}[]>([]);
  const [groupStatuses, setGroupStatuses] = useState<{id: string, nome: string, active?: boolean, status?: string, sortOrder?: number}[]>([]);
  const [groupProcedures, setGroupProcedures] = useState<{id: string, nome: string, active?: boolean}[]>([]);
  const [groupSurgeryTypes, setGroupSurgeryTypes] = useState<{id: string, nome: string, active?: boolean}[]>([]);
  const [groupAffinities, setGroupAffinities] = useState<{id: string, name: string}[]>([]);
  const [imageTypes, setImageTypes] = useState<{id: string, name: string, active?: boolean}[]>([]);

  useEffect(() => {
    if (!activeGroup?.id) return;

    let isMounted = true;
    const gId = activeGroup.id;
    
    // Afinidades
    const affinityRef = collection(db, "affinity");
    const qAffinity = query(affinityRef, where("groupId", "==", gId), orderBy("name"));
    const unsubAffinity = onSnapshot(qAffinity, (snap) => {
      if (!isMounted) return;
      setGroupAffinities(snap.docs.map(d => ({ id: d.id, name: d.data().name })));
    }, (err) => {
      if (!isMounted) return;
      handleFirestoreError(err, OperationType.LIST, "affinity");
    });
    
    // Statuses
    const statusRef = collection(db, "patient_statuses");
    const qStatus = query(statusRef, where("groupId", "==", gId), orderBy("name"));
    const unsubStatus = onSnapshot(qStatus, (snap) => {
      if (!isMounted) return;
      setGroupStatuses(snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          nome: data.name || data.nome || "",
          active: data.active,
          status: data.status,
          sortOrder: typeof data.sortOrder === "number" ? data.sortOrder : undefined
        };
      }));
    }, (err) => {
      if (!isMounted) return;
      handleFirestoreError(err, OperationType.LIST, "patient_statuses");
    });

    // Hospitals
    const hospRef = collection(db, "hospitals");
    const qHosp = query(hospRef, where("groupId", "==", gId), orderBy("name"));
    const unsubHosp = onSnapshot(qHosp, (snap) => {
      if (!isMounted) return;
      setGroupHospitals(snap.docs.map(d => ({ id: d.id, nome: d.data().name, active: d.data().active })));
    }, (err) => {
      if (!isMounted) return;
      handleFirestoreError(err, OperationType.LIST, "hospitals");
    });

    // Procedures
    const procRef = collection(db, "procedureOptions");
    const qProc = query(procRef, where("groupId", "==", gId), orderBy("nome"));
    const unsubProc = onSnapshot(qProc, (snap) => {
      if (!isMounted) return;
      setGroupProcedures(snap.docs.map(d => ({ id: d.id, nome: d.data().nome, active: d.data().active })));
    }, (err) => {
      if (!isMounted) return;
      handleFirestoreError(err, OperationType.LIST, "procedureOptions");
    });

    // Image Types
    const imageTypesRef = collection(db, "image_types");
    const qImageTypes = query(imageTypesRef, where("groupId", "==", gId), orderBy("name"));
    const unsubImageTypes = onSnapshot(qImageTypes, (snap) => {
      if (!isMounted) return;
      setImageTypes(snap.docs.map(d => ({ id: d.id, name: d.data().name, active: d.data().active })));
    }, (err) => {
      if (!isMounted) return;
      handleFirestoreError(err, OperationType.LIST, "image_types");
    });

    // Surgery Types
    const surgeryTypesRef = collection(db, "surgery_types");
    const qSurgeryTypes = query(surgeryTypesRef, where("groupId", "==", gId), orderBy("nome"));
    const unsubSurgeryTypes = onSnapshot(qSurgeryTypes, (snap) => {
      if (!isMounted) return;
      setGroupSurgeryTypes(snap.docs.map(d => ({ id: d.id, nome: d.data().nome, active: d.data().active })));
    }, (err) => {
      if (!isMounted) return;
      handleFirestoreError(err, OperationType.LIST, "surgery_types");
    });

    return () => {
      isMounted = false;
      unsubAffinity();
      unsubStatus();
      unsubHosp();
      unsubProc();
      unsubImageTypes();
      unsubSurgeryTypes();
    };
  }, [activeGroup?.id]);

  // Compatibility aliases - only for FORMS, filter active
  const hospitalOptions = groupHospitals.filter(h => h.active !== false && (h as any).status !== "removed");
  const statusOptions = groupStatuses
    .filter(s => s.active !== false && (s as any).status !== "removed")
    .sort((a, b) => {
      const orderA = typeof a.sortOrder === "number" ? a.sortOrder : 999999;
      const orderB = typeof b.sortOrder === "number" ? b.sortOrder : 999999;
      if (orderA !== orderB) return orderA - orderB;
      return a.nome.localeCompare(b.nome);
    });
  const procedureOptions = groupProcedures.filter(p => p.active !== false && (p as any).status !== "removed").map(p => p.nome);
  const defaultSurgeryTypes = ["Eletiva", "Urgência", "Emergência", "Retorno", "Avaliação"];
  const loadedSurgeryTypes = groupSurgeryTypes.filter(s => s.active !== false && (s as any).status !== "removed").map(s => s.nome);
  const surgeryTypeOptions = loadedSurgeryTypes.length > 0
    ? Array.from(new Set([...loadedSurgeryTypes, ...defaultSurgeryTypes]))
    : defaultSurgeryTypes;
  const affinityOptions = groupAffinities.map(a => a.name);
  const imageTypeOptions = imageTypes.filter(t => t.active !== false && (t as any).status !== "removed").map(t => t.name);
  
  // Full lists for lookup/display
  const allHospitals = groupHospitals;
  const allStatuses = groupStatuses;
  
  const [isReady, setIsReady] = useState(false);
  
  // Create a mutable reference for the agent so we can reset it
  const agentRef = useRef<any>(null);

  useEffect(() => {
    const userName = auth.currentUser?.displayName?.split(" ")[0] || companyName;
    setMessages([
      { 
        role: "model", 
        text: `<div class="text-base font-medium">Hello ${userName}<br/><br/>Hoje é um lindo dia para salvar vidas ❤️</div>`
      }
    ]);

    import("../lib/gemini").then(({ createAgent }) => {
      if (!agentRef.current) agentRef.current = createAgent(companyName);
      setIsReady(true);
    });
  }, [companyName, auth.currentUser?.displayName]);

  useEffect(() => {
    if (initialCommand && isReady && agentRef.current) {
      handleSend(undefined, initialCommand, true);
      onCommandExecuted?.();
    }
  }, [initialCommand, isReady, onCommandExecuted]);

  const resetAgent = async () => {
    const { createAgent } = await import("../lib/gemini");
    agentRef.current = createAgent(companyName);
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

  const getScrollTargets = () => {
    const targets = [
      chatContainerRef.current,
      document.querySelector("main"),
      document.scrollingElement,
      document.documentElement,
      document.body
    ];

    return targets.filter(Boolean) as HTMLElement[];
  };

  const runAfterPaint = (fn: () => void) => {
    fn();

    requestAnimationFrame(() => {
      fn();

      requestAnimationFrame(() => {
        fn();
      });
    });

    setTimeout(fn, 80);
    setTimeout(fn, 250);
  };

  const scrollToTop = () => {
    runAfterPaint(() => {
      getScrollTargets().forEach((el) => {
        try {
          el.scrollTo({
            top: 0,
            left: 0,
            behavior: "auto"
          });
          el.scrollTop = 0;
        } catch {
          el.scrollTop = 0;
        }
      });
    });
  };

  const scrollToBottom = () => {
    runAfterPaint(() => {
      const target = chatContainerRef.current || document.querySelector("main") || document.scrollingElement;
      if (!target) return;

      target.scrollTo({
        top: target.scrollHeight,
        behavior: "smooth"
      });
    });
  };

  useLayoutEffect(() => {
    if (messages.length === 0) return;

    const lastMessage = messages[messages.length - 1];

    const shouldScrollToTop =
      shouldScrollTopRef.current ||
      lastMessage?.isListing ||
      lastMessage?.isProfile ||
      lastMessage?.form !== undefined ||
      lastMessage?.actionGroups !== undefined ||
      (lastMessage?.text && (
        lastMessage.text.includes("Alterar Status") ||
        lastMessage.text.includes("Adicionar Info") ||
        lastMessage.text.includes("Novo Contato") ||
        lastMessage.text.includes("Anexar Imagem")
      ));

    if (shouldScrollToTop) {
      scrollToTop();
      shouldScrollTopRef.current = false;
    } else {
      scrollToBottom();
    }
  }, [messages]);

  const resizeImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.readAsDataURL(file);
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
**${a.conteudo}**  
_${a.data}_  
\`/editar_log id: ${a.id}, pId: ${cad.ID} label:✏️\` \`/remover_informacao id: ${a.id}, pId: ${cad.ID} label:🗑️\`
`).join("\n");
    
    const docs = data.imagens.map((i: any) => {
      let aiPart = "";
      const analysis = i.aiAnalysis || i.aiResposta;
      if (analysis) {
        aiPart = `\n\n> 🤖 **Análise Inteligente:**\n> ${analysis.split('\n').join('\n> ')}\n`;
      }

      const imgTag = i.link 
        ? `![${i.descricao || 'Imagem'}](${i.link})\n`
        : "";
      
      return `
${imgTag}
**${i.descricao || 'Sem descrição'}**  
_${i.data}_  
\`/remover_imagem id: ${i.id}, pId: ${cad.ID} label:🗑️\`
${aiPart}
`;
    }).join("\n---\n");

    const fams = data.familiares.map((f: any) => {
      const cleanFone = f.fone ? f.fone.replace(/\D/g, "") : "";
      const waNumber = cleanFone ? (cleanFone.startsWith("55") ? cleanFone : "55" + cleanFone) : "";
      const foneLink = waNumber 
        ? `[📞 **${f.fone}**](https://wa.me/${waNumber})` 
        : "📞 Sem telefone";
      return `
**${f.nome}** ${f.relacao ? `(${f.relacao})` : ""} ${foneLink}  
\`/editar_familiar id: ${f.id}, pId: ${cad.ID} label:✏️\` \`/remover_familiar id: ${f.id}, pId: ${cad.ID} label:🗑️\`
`;
    }).join("\n");

    const cadFone = cad.Telefone;
    const cleanCadFone = cadFone ? cadFone.replace(/\D/g, "") : "";
    const waCadNumber = cleanCadFone ? (cleanCadFone.startsWith("55") ? cleanCadFone : "55" + cleanCadFone) : "";
    const cadFoneLink = waCadNumber 
      ? `[📞 **${cadFone}**](https://wa.me/${waCadNumber})` 
      : "";
    const patientContact = cadFoneLink ? `
**Paciente (Próprio)** ${cadFoneLink}
` : "";

    const surgeryTypeHeader = "";

    const calendarLine = "";

    return surgeryTypeHeader + calendarLine +
      `\`/novofamiliar id: ${cad.ID}, nome: ${cad.Nome} label:+\` **Contatos:**\n\n${patientContact || ""}\n${fams || (patientContact ? "" : "Nenhum registro")}\n\n` +
      `\`/logpac id: ${cad.ID}, nome: ${cad.Nome} label:+\` **Informações:**\n\n${audios || "Nenhum registro"}\n\n` +
      `\`/prep_img id: ${cad.ID}, nome: ${cad.Nome} label:+\` **Imagens:**\n\n${docs || "Nenhum registro"}`;
  };

  const handleDirectCommand = async (command: string) => {
    let cmdInput = command.trim();
    if (cmdInput.includes(" label:")) {
      cmdInput = cmdInput.split(" label:")[0].trim();
    }
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

        const res = await apiFetch("/api/calendar/events", {
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
        
        const res = await apiFetch(`/api/calendar/events?timeMin=${today.toISOString()}&timeMax=${dayAfterTomorrow.toISOString()}`);
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
            { label: "Idade", name: "idade", type: "number", placeholder: "Ex: 30", optional: true },
            { 
              label: "Hospital", 
              name: "hospitalName", 
              type: "text", 
              placeholder: "Escolha um hospital",
              // @ts-ignore
              readOnly: true,
              suggestions: hospitalOptions.map(h => ({ label: h.nome, value: h.id }))
            },
            { 
              label: "Prioridade/Tipo", 
              name: "surgery_type", 
              type: "text", 
              placeholder: "Eletiva, Urgência...",
              // @ts-ignore
              readOnly: true,
              suggestions: surgeryTypeOptions.map(s => ({ label: s, value: s })),
              optional: true
            },
            { 
              label: "Status Inicial", 
              name: "status", 
              type: "text", 
              placeholder: "Escolha um status",
              // @ts-ignore
              readOnly: true,
              suggestions: statusOptions.map(s => ({ label: s.nome, value: s.id })),
              optional: true
            },
            { 
              label: "Procedimento", 
              name: "procedimento", 
              type: "text", 
              placeholder: "Escolha um procedimento",
              suggestions: procedureOptions.map(p => ({ label: p, value: p })),
              optional: true
            },
            { label: "Quarto/Leito", name: "roomNumber", type: "text", placeholder: "Ex: 402B", optional: true },
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
        if (k && v !== undefined) parts[k.toLowerCase()] = v;
      });

    const evento = parts.evento || "";
    const dataStr = parts.data || "";
    const hora = parts.hora || "";
    const tipo = parts.tipo || parts.categoria || "";
    const sala = parts.sala || "";
    const descricao = parts.descricao || parts.observações || "";
    const hospName = parts.hospitalid || "";
    
    const selectedHospital = hospitalOptions.find(h => h.nome === hospName || h.id === hospName);
    const hostIdResolved = selectedHospital ? selectedHospital.id : "";

    let pid = parts.pid || "";
    let nomePaciente = parts.nomepaciente || "";

    if (!evento || !dataStr || !hora) {
      setMessages(prev => [...prev, { role: "model", text: "❌ Dados incompletos para o calendário." }]);
      return true;
    }

    setIsLoading(true);
    try {
      if (!auth.currentUser) throw new Error("Usuário não autenticado");

      const GROUP_ID = activeGroup?.id || "main-group";
      const eventsRef = collection(db, "groups", GROUP_ID, "calendario");
      
      // Auto link to a patient if name is provided but ID is not, or vice versa
      if (!pid && nomePaciente) {
        const patientsQuery = query(
          collection(db, "patients"),
          where("groupId", "==", GROUP_ID)
        );
        const snapshot = await getDocs(patientsQuery);
        const matchName = nomePaciente.trim().toLowerCase();
        const matchedDoc = snapshot.docs.find(d => {
          const name = (d.data().name || d.data().nome || "").trim().toLowerCase();
          return name === matchName;
        });
        if (matchedDoc) {
          pid = matchedDoc.id;
        }
      } else if (pid && !nomePaciente) {
        const patientDoc = await getDoc(doc(db, "patients", pid));
        if (patientDoc.exists()) {
          nomePaciente = patientDoc.data().name || patientDoc.data().nome || "";
        }
      }

      await addDoc(eventsRef, {
        evento,
        data: dataStr,
        hora,
        tipo: tipo,
        sala,
        descricao,
        groupId: GROUP_ID,
        patientId: pid,
        nomePaciente,
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
            text: `✅ **Evento adicionado ao Calendário!**\n\n📅 **${evento}**\n🕒 ${dataStr} às ${hora}\n📍 ${sala} (${tipo})` 
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
      let surgeryType = cmdInput.match(/type:\s*([^,]+)/i)?.[1]?.trim() || "";
      let procedure = cmdInput.match(/procedure:\s*([^,]+)/i)?.[1]?.trim() || "";
      
      const today = new Date();
      const pad = (n: number) => n.toString().padStart(2, "0");
      const hojeStrIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`; 
      const agoraStr = `${pad(today.getHours())}:00`;
      
      const hospName = hospitalOptions.find(h => h.id === hospId)?.nome || "";

      setMessages([]); // NEW VIEW

      if (activeGroup?.groupType === "personal") {
        setMessages([{ 
          role: "model", 
          text: "📅 **Novo Evento**\n\nPreencha os detalhes do compromisso:",
          form: {
            title: "Novo Evento",
            fields: [
              { label: "Assunto / Compromisso", name: "evento", type: "text", placeholder: "Ex: Consulta, Reunião..." },
              { label: "Data", name: "data", type: "date", defaultValue: hojeStrIso },
              { label: "Horário", name: "hora", type: "time", defaultValue: agoraStr },
              { label: "Descrição", name: "descricao", type: "textarea", placeholder: "Notas ou detalhes...", optional: true }
            ],
            submitLabel: "Adicionar ao Calendário",
            commandPrefix: "/calendario_add",
          }
        }]);
        return true;
      }

      setMessages([{ 
        role: "model", 
        text: "📅 **Novo Evento no Calendário**\n\nPreencha os detalhes do evento:",
        form: {
          title: "Novo Evento",
          hospitalName: hospName,
          roomNumber: roomNumber,
          fields: [
            { label: "NOME DO PACIENTE", name: "nomePaciente", type: "text", defaultValue: patientName },
            { 
              label: "PROCEDIMENTO", 
              name: "evento", 
              type: "text", 
              placeholder: "Ex: Cirurgia Geral, Estética...", 
              defaultValue: procedure || (patientName ? `Cirurgia - ${patientName}` : ""),
              // @ts-ignore
              suggestions: procedureOptions
            },
            { label: "DATA DA CIRURGIA", name: "data", type: "date", defaultValue: hojeStrIso },
            { label: "HORÁRIO", name: "hora", type: "time", defaultValue: agoraStr },
            { 
              label: "TIPO", 
              name: "tipo", 
              type: "select", 
              options: ["ELETIVA", "URGÊNCIA"], 
              defaultValue: surgeryType.toUpperCase() || "ELETIVA" 
            },
            { 
              label: "HOSPITAL / CLÍNICA", 
              name: "hospitalId", 
              type: "select", 
              options: hospitalOptions.map(h => h.nome),
              defaultValue: hospName
            },
            { 
              label: "SALA / UNIDADE", 
              name: "sala", 
              type: "select", 
              options: ["", "SALA 1", "SALA 2", "SALA 3", "SALA 4", "SALA 5"], 
              defaultValue: roomNumber.toUpperCase().startsWith("SALA") ? roomNumber.toUpperCase() : (roomNumber ? roomNumber : ""),
              optional: true
            },
            { label: "OBSERVAÇÕES ADICIONAIS", name: "descricao", type: "textarea", placeholder: "Alguma recomendação?", optional: true }
          ],
          submitLabel: "Criar evento",
          commandPrefix: pid ? `/calendario_add pid: ${pid},` : "/calendario_add",
          backCommand: pid ? `/p ${pid}` : undefined
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
                suggestions: imageTypeOptions.map(t => ({ label: t, value: t }))
              }
            ],
            submitLabel: "Enviar Imagem",
            commandPrefix: `/img id: ${id},`,
            backCommand: `/p ${id}`
          }
        }]);
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
      const orderedStatuses = [...groupStatuses]
        .filter(s => s.active !== false && (s as any).status !== "removed")
        .sort((a: any, b: any) => {
          const orderA = typeof a.sortOrder === "number" ? a.sortOrder : 999999;
          const orderB = typeof b.sortOrder === "number" ? b.sortOrder : 999999;
          if (orderA !== orderB) return orderA - orderB;
          return a.nome.localeCompare(b.nome);
        });

      const list = orderedStatuses.map((s: any, index: number) => {
        const upCommand = index > 0
          ? `/move_status id: ${s.id}, direction: up label:↑`
          : "/disabled label:↑";

        const downCommand = index < orderedStatuses.length - 1
          ? `/move_status id: ${s.id}, direction: down label:↓`
          : "/disabled label:↓";

        return `${index + 1}. **${s.nome}**  \`${upCommand}\` \`${downCommand}\` \`/remove_status id: ${s.id} label:🗑️\``;
      }).join("\n\n");

      setMessages([{
        role: "model",
        text: `🏷️ **Status Disponíveis**\n\n${list || "Nenhum status encontrado."}`,
        isListing: true
      }]);

      return true;
    }

    if (cmd.startsWith("/move_status")) {
      const statusId = cmdInput.match(/id:\s*([^,]+)/i)?.[1]?.trim();
      const direction = cmdInput.match(/direction:\s*([^,]+)/i)?.[1]?.trim();

      if (!statusId || !direction || !activeGroup?.id) {
        setMessages(prev => [...prev, {
          role: "model",
          text: "❌ Não foi possível alterar a ordem do status."
        }]);
        return true;
      }

      setIsLoading(true);

      try {
        const res = await apiFetch("/api/app/statuses/reorder", {
          method: "POST",
          body: JSON.stringify({ statusId, direction })
        });
        
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP error ${res.status}`);
        }

        await handleDirectCommand("/list_statuses");
      } catch (err: any) {
        setMessages(prev => [...prev, {
          role: "model",
          text: `❌ Erro ao alterar ordem do status: ${err.message}`
        }]);
      } finally {
        setIsLoading(false);
        return true;
      }
    }

    if (cmd.startsWith("/remove_status")) {
      const statusId = cmdInput.match(/id:\s*([^,]+)/i)?.[1]?.trim();

      if (!statusId || !activeGroup?.id) {
        setMessages(prev => [...prev, {
          role: "model",
          text: "❌ Não foi possível remover o status."
        }]);
        return true;
      }

      setIsLoading(true);

      try {
        const res = await apiFetch("/api/app/statuses/remove", {
          method: "POST",
          body: JSON.stringify({ statusId })
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP error ${res.status}`);
        }

        await handleDirectCommand("/list_statuses");
      } catch (err: any) {
        setMessages(prev => [...prev, {
          role: "model",
          text: `❌ Erro ao remover status: ${err.message}`
        }]);
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
              { 
                label: "Afinidade", 
                name: "relationship", 
                type: "text", 
                placeholder: "Ex: Filho(a), Esposa...",
                suggestions: affinityOptions.length > 0 ? affinityOptions : ["Esposa", "Marido", "Filho(a)", "Pai", "Mãe", "Irmão(ã)", "Cuidador", "Amigo(a)"],
                optional: true
              },
              { label: "Telefone", name: "phone", type: "number", placeholder: "Ex: 11999998888" },
            ],
            submitLabel: "+Salvar",
            commandPrefix: `/salvarfamiliar patientId: ${id},`,
            backCommand: `/p ${id}`
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
            commandPrefix: `/salvarlog patientId: ${id},`,
            backCommand: `/p ${id}`
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
          reportData: data,
          profileData: {
            id: cad.ID.toString(),
            nome: cad.Nome,
            idade: cad.Idade ? cad.Idade.toString() : "N/A",
            status: cad.Status,
            hospitalId: cad.hospitalId,
            hospitalNome: allHospitals.find(h => h.id === cad.hospitalId || h.nome === cad.hospital_nome)?.nome || cad.hospital_nome || "Não informado",
            roomNumber: cad.roomNumber || cad.room_number || "Sala ?",
            surgery_type: cad.surgery_type || "",
            procedure: cad.procedure || ""
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
            { label: "Telefone / Contato", name: "telefone", type: "number", placeholder: "Ex: 11999998888" }
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

        const selectedStatus = masterStatuses.find((s: any) => s.id.toString() === statusFilter);
        const isFilteringAlta = selectedStatus && selectedStatus.nome.toLowerCase() === "alta";

        // Filter out 'Alta' if not explicitly requested
        if (!isFilteringAlta) {
          filteredData = filteredData.filter(p => {
            const sName = p.status ? p.status.toLowerCase() : "";
            return sName !== "alta";
          });
        }

        let pageData = filteredData;
        let totalPages = 1;
        let pageToView = 1;

        if (isFilteringAlta) {
          const PAGE_SIZE = 10;
          totalPages = Math.ceil(filteredData.length / PAGE_SIZE);
          pageToView = Math.max(1, Math.min(page, totalPages || 1));
          const start = (pageToView - 1) * PAGE_SIZE;
          const end = start + PAGE_SIZE;
          pageData = filteredData.slice(start, end);
        }

        const actionGroups = [];
        if (hospitals.length > 0) {
          const sortedMasterHospitals = [...masterHospitalsData].sort((a, b) => a.nome.localeCompare(b.nome));
          const hospitalActions = sortedMasterHospitals.map((h: any) => {
            const hId = h.id.toString();
            const isActive = hospitalFilter === hId;
            return { 
              label: h.nome, 
              cmd: isActive
                ? `/pacientes${statusFilter ? ` status:${statusFilter}` : ""} sort:${sort}`
                : `/pacientes hospital:${hId}${statusFilter ? ` status:${statusFilter}` : ""} sort:${sort}`,
              active: isActive
            };
          });

          actionGroups.push({
            title: "Filtrar por Hospital",
            actions: hospitalActions
          });
        }

        if (statuses.length > 0) {
          const sortedMasterStatuses = [...masterStatuses].sort((a, b) => {
            const orderA = typeof a.sortOrder === "number" ? a.sortOrder : 999999;
            const orderB = typeof b.sortOrder === "number" ? b.sortOrder : 999999;
            if (orderA !== orderB) return orderA - orderB;
            const nameA = (a.nome || a.name || "").toLowerCase();
            const nameB = (b.nome || b.name || "").toLowerCase();
            return nameA.localeCompare(nameB);
          });
          const statusActions = sortedMasterStatuses.map((s: any) => {
            const sId = typeof s === 'string' ? s : s.id.toString();
            const sLabel = typeof s === 'string' ? s : s.nome;
            const isActive = statusFilter === sId;
            return { 
              label: sLabel, 
              cmd: isActive
                ? `/pacientes${hospitalFilter ? ` hospital:${hospitalFilter}` : ""} sort:${sort}`
                : `/pacientes status:${sId}${hospitalFilter ? ` hospital:${hospitalFilter}` : ""} sort:${sort}`,
              active: isActive
            };
          });

          actionGroups.push({
            title: "Filtrar por Status",
            actions: statusActions
          });
        }

        setMessages([{ 
          role: "model", 
          text: "",
          isListing: true,
          listingTitle: "", // User wants to remove the title
          isPatientListing: true,
          patientListData: {
            patients: pageData,
            statuses: masterStatuses,
            hospitals: masterHospitalsData,
            hospitalFilter: hospitalFilter || undefined,
            statusFilter: statusFilter || undefined,
            sort,
            pagination: isFilteringAlta ? {
              page: pageToView,
              totalPages: totalPages,
              hospitalFilter: hospitalFilter || undefined,
              statusFilter: statusFilter || undefined,
              sort: sort
            } : undefined
          },
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
        
        const apiUrl = termo ? `/api/app/patients?search=${encodeURIComponent(termo)}` : "/api/app/patients";
        const res = await apiFetch(apiUrl);
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
        const currentHospital = allHospitals.find(h => h.id === p.hospitalId || h.nome === p.hospital_nome);
        const currentStatus = allStatuses.find(s => s.id === p.Status || s.nome === p.Status);
        
        setMessages([{ 
          role: "model", 
          text: `✏️ **Editar Paciente**\n\nAtualize os dados do paciente.`,
          form: {
            title: "Atualizar Dados",
            fields: [
              { label: "Nome", name: "nome", type: "text", defaultValue: p.Nome },
              { label: "Idade", name: "idade", type: "number", defaultValue: p.Idade || "" },
              { 
                label: "Hospital", 
                name: "hospitalName", 
                type: "text", 
                defaultValue: p.hospitalId || currentHospital?.id || "",
                // @ts-ignore
                readOnly: true,
                hideInput: true,
                suggestions: hospitalOptions.map(h => ({ label: h.nome, value: h.id }))
              },
              { 
                label: "Status", 
                name: "status", 
                type: "text", 
                defaultValue: p.statusId || currentStatus?.id || "",
                // @ts-ignore
                readOnly: true,
                hideInput: true,
                suggestions: statusOptions.map(s => ({ label: s.nome, value: s.id }))
              },
              { 
                label: "Prioridade/Tipo", 
                name: "surgery_type", 
                type: "select", 
                defaultValue: p.surgery_type,
                options: surgeryTypeOptions,
                suggestions: surgeryTypeOptions.map(s => ({ label: s, value: s }))
              },
              { label: "Quarto/Leito", name: "roomNumber", type: "text", defaultValue: p.roomNumber || p.room_number || "" },
            ],
            submitLabel: "Salvar Alterações",
            commandPrefix: `/update_patient id: ${id},`,
            backCommand: `/p ${id}`
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
        const surgery_type = cmdInput.match(/surgery_type:\s*([^,]+)/i)?.[1]?.trim();

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
            status: resolvedStatusId,
            surgery_type
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
          ? `<a href="https://wa.me/${waNumber}" style="color: #2563eb; text-decoration: none;">📞 <b>${f.fone}</b></a>` 
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
          text: `🤖 **${companyName} Shortcuts (Zero Tokens):**\n\n` +
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
        const relationship = cmdInput.match(/relationship:\s*([^,]*)/i)?.[1]?.trim() || cmdInput.match(/tipo_parentesco:\s*([^,]*)/i)?.[1]?.trim() || cmdInput.match(/relacao:\s*([^,]*)/i)?.[1]?.trim();
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

        setMessages([]); 
        await handleDirectCommand(`/p ${patientId}`);
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
      let isVideoUpload = false;
      try {
        if (!selectedImage) throw new Error("Selecione uma imagem, vídeo ou PDF acima antes de enviar.");
        
        const id = cmdInput.match(/id:\s*([^,]+)/i)?.[1]?.trim();
        const descMatch = cmdInput.match(/(?:desc|descrição):\s*([^,]+)/i);
        const desc = descMatch ? descMatch[1]?.trim() : "";
        const useAI = cmdInput.includes("useAI: true");

        if (!id) throw new Error("Use: /img id: [ID], desc: [Opcional]");

        let res;
        
        let fileToUpload: File | null = selectedFileObj;
        let isEncrypted = false;
        let ivBase64 = "";
        let originalContentType = "";

        // Normalize image/video parsing for encryption
        let actualFile: File | null = null;
        if (selectedFileObj) {
          actualFile = selectedFileObj;
        } else if (selectedImage) {
          // Convert base64 data to File for encryption
          try {
            const mimeType = selectedImage.split(";")[0].split(":")[1] || "image/jpeg";
            const base64Data = selectedImage.split(",")[1];
            const ext = mimeType.split("/")[1] || "jpg";
            const extResolved = ext === "quicktime" ? "mov" : ext;
            const safeName = `Chat_P${id}_${new Date().getTime()}.${extResolved}`;
            
            const bytes = atob(base64Data);
            const u8arr = new Uint8Array(bytes.length);
            for (let i = 0; i < bytes.length; i++) {
              u8arr[i] = bytes.charCodeAt(i);
            }
            actualFile = new File([u8arr], safeName, { type: mimeType });
          } catch (e) {
            console.warn("[E2E] Base64 file parsing failed", e);
          }
        }

        if (actualFile) {
          try {
            if (activeGroup?.id) {
              const groupKey = await getGroupCryptoKey(activeGroup.id);
              if (!groupKey) {
                throw new Error("Chave de segurança do grupo indisponível. Para sua segurança, o envio de arquivos não criptografados foi bloqueado.");
              }
              console.log("[E2E] Encrypting chat file before upload");
              const { encryptFile } = await import("../lib/crypto");
              const { encryptedBlob, ivBase64: iv } = await encryptFile(actualFile, groupKey);
              fileToUpload = new File([encryptedBlob], actualFile.name + ".encrypted", { type: "application/octet-stream" });
              isEncrypted = true;
              ivBase64 = iv;
              originalContentType = actualFile.type || "application/octet-stream";
            }
          } catch (e: any) {
            console.error("[E2E] Chat file encryption failure", e);
            throw new Error(e.message || "Não foi possível criptografar o arquivo no dispositivo.");
          }
        }

        const mimeTypeToCheck = actualFile ? actualFile.type : "";
        if (mimeTypeToCheck.startsWith("video/") || (actualFile && (actualFile.name.toLowerCase().endsWith(".mov") || actualFile.name.toLowerCase().endsWith(".mp4")))) {
          isVideoUpload = true;
        }

        if (fileToUpload) {
          console.log("[Upload] [FormData] sending file, encryption status:", isEncrypted);
          const formData = new FormData();
          formData.append("file", fileToUpload);
          formData.append("patientId", id);
          formData.append("description", desc || (actualFile ? actualFile.name : "Documento via Chat"));
          formData.append("platform", /iPhone|iPad|iPod/.test(navigator.userAgent) ? "ios" : "other");
          if (isEncrypted) {
            formData.append("isEncrypted", "true");
            formData.append("iv", ivBase64);
            formData.append("originalContentType", originalContentType);
          }

          res = await apiFetch("/api/app/upload-image", {
            method: "POST",
            body: formData
          });
        } else {
          throw new Error("Nenhum arquivo ou imagem selecionados para upload.");
        }

        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || "Erro no upload");

        setMessages([]);
        
        if (useAI && data.fileId) {
          await handleDirectCommand(`/p ${id}`);
          setMessages(prev => [...prev, { role: "model", text: "⏳ **Solicitando análise inteligente da imagem enviada...**" }]);
          await handleDirectCommand(`/ai_analyze id: ${data.fileId}, pId: ${id}`);
        } else {
          await handleDirectCommand(`/p ${id}`);
        }

        if (selectedImage && selectedImage.startsWith("blob:")) {
          try {
            URL.revokeObjectURL(selectedImage);
          } catch (e) {}
        }
        setSelectedImage(null); // Clear image after upload
        setSelectedFileObj(null); // Clear file obj after upload
      } catch (err: any) {
        console.error("[Upload] error full", err);
        console.error("[Upload] error code", err?.code);
        console.error("[Upload] error message", err?.message);

        const friendlyMsg = isVideoUpload
          ? "Não foi possível enviar este vídeo. Tente salvar o vídeo novamente no iPhone ou escolher uma versão menor."
          : `Erro no upload: ${err.message}`;

        setMessages(prev => [...prev, { role: "model", text: `❌ ${friendlyMsg}` }]);
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
          if (!part) return "";
          const val = part.split(":")[1]?.trim();
          if (!val || val === "undefined" || val === "null") return "";
          return val;
        };

        const nome = getVal("nome");
        const fone = getVal("fone");
        const idade = getVal("idade");
        const cpf = getVal("cpf");
        const hospitalName = getVal("hospitalName");
        const roomNumber = getVal("roomNumber");
        const status = getVal("status");
        const procedimento = getVal("procedimento");
        const surgery_type = getVal("surgery_type");

        if (!nome) throw new Error("O campo 'nome:' é obrigatório.");

        // Resolve Names to IDs
        const selectedHospital = hospitalOptions.find(h => h.nome === hospitalName);
        const resolvedHospitalId = selectedHospital ? selectedHospital.id : (hospitalName || "");

        const selectedStatus = statusOptions.find(s => s.nome === status || s.id === status);
        const resolvedStatusId = selectedStatus ? selectedStatus.id : (status || "");

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
            status: resolvedStatusId,
            procedimento,
            surgery_type
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

    if (cmd.startsWith("/remover_imagem")) {
      const rawText = cmdInput.slice("/remover_imagem".length).trim();
      const parts: Record<string, string> = {};
      const pairs = rawText.split(",");
      pairs.forEach(p => {
        const partsArr = p.split(":");
        const k = partsArr[0]?.trim();
        const v = partsArr.slice(1).join(":").trim();
        if (k && v) parts[k.toLowerCase()] = v;
      });

      const fileId = parts.id || "";
      const pId = parts.pid || "";

      if (!fileId) {
        setMessages(prev => [...prev, { role: "model", text: "❌ ID da imagem não informado." }]);
        return true;
      }

      setIsLoading(true);
      try {
        const res = await apiFetch("/api/app/files/remove", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId })
        });
        const resData = await res.json();
        if (resData.error) throw new Error(resData.error);

        setMessages(prev => [...prev, { role: "model", text: "✅ Imagem removida com sucesso." }]);
        if (pId) {
          await handleDirectCommand(`/p ${pId}`);
        }
      } catch (err: any) {
        setMessages(prev => [...prev, { role: "model", text: `❌ Erro ao remover imagem: ${err.message}` }]);
      } finally {
        setIsLoading(false);
        return true;
      }
    }

    if (cmd.startsWith("/remover_informacao")) {
      const rawText = cmdInput.slice("/remover_informacao".length).trim();
      const parts: Record<string, string> = {};
      const pairs = rawText.split(",");
      pairs.forEach(p => {
        const partsArr = p.split(":");
        const k = partsArr[0]?.trim();
        const v = partsArr.slice(1).join(":").trim();
        if (k && v) parts[k.toLowerCase()] = v;
      });

      const logId = parts.id || "";
      const pId = parts.pid || "";

      if (!logId) {
        setMessages(prev => [...prev, { role: "model", text: "❌ ID da informação não informado." }]);
        return true;
      }

      setIsLoading(true);
      try {
        const res = await apiFetch("/api/app/patient-logs/remove", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ logId })
        });
        const resData = await res.json();
        if (resData.error) throw new Error(resData.error);

        setMessages(prev => [...prev, { role: "model", text: "✅ Informação removida com sucesso." }]);
        if (pId) {
          await handleDirectCommand(`/p ${pId}`);
        }
      } catch (err: any) {
        setMessages(prev => [...prev, { role: "model", text: `❌ Erro ao remover informação: ${err.message}` }]);
      } finally {
        setIsLoading(false);
        return true;
      }
    }

    if (cmd.startsWith("/remover_familiar")) {
      const rawText = cmdInput.slice("/remover_familiar".length).trim();
      const parts: Record<string, string> = {};
      const pairs = rawText.split(",");
      pairs.forEach(p => {
        const partsArr = p.split(":");
        const k = partsArr[0]?.trim();
        const v = partsArr.slice(1).join(":").trim();
        if (k && v) parts[k.toLowerCase()] = v;
      });

      const contactId = parts.id || "";
      const pId = parts.pid || "";

      if (!contactId) {
        setMessages(prev => [...prev, { role: "model", text: "❌ ID do contato não informado." }]);
        return true;
      }

      setIsLoading(true);
      try {
        const res = await apiFetch("/api/app/patient-contacts/remove", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactId })
        });
        const resData = await res.json();
        if (resData.error) throw new Error(resData.error);

        setMessages(prev => [...prev, { role: "model", text: "✅ Contato removido com sucesso." }]);
        if (pId) {
          await handleDirectCommand(`/p ${pId}`);
        }
      } catch (err: any) {
        setMessages(prev => [...prev, { role: "model", text: `❌ Erro ao remover contato: ${err.message}` }]);
      } finally {
        setIsLoading(false);
        return true;
      }
    }

    if (cmd.startsWith("/editar_log")) {
      const rawText = cmdInput.slice("/editar_log".length).trim();
      const logId = rawText.match(/id:\s*([^,]+)/i)?.[1]?.trim();
      const pId = rawText.match(/pId:\s*([^,]+)/i)?.[1]?.trim();

      if (!logId) return true;

      const reportMsg = [...messages].reverse().find(m => m.isProfile && m.reportData);
      const log = reportMsg?.reportData?.audios?.find((a: any) => a.id === logId);

      if (log) {
        setMessages([{
          role: "model",
          text: `✏️ **Editar Informação**`,
          form: {
            title: "",
            fields: [
              { label: "Informação", name: "text", type: "textarea", defaultValue: log.conteudo }
            ],
            submitLabel: "Atualizar",
            commandPrefix: `/atualizar_log logId: ${logId}, pId: ${pId},`,
            backCommand: `/p ${pId}`
          }
        }]);
      }
      return true;
    }

    if (cmd.startsWith("/atualizar_log")) {
      const rawText = cmdInput.slice("/atualizar_log".length).trim();
      const getVal = (label: string) => {
        const regex = new RegExp(`${label}:\\s*([^,]*)`, "i");
        const match = cmdInput.match(regex);
        return match ? match[1].trim() : "";
      };
      
      const logId = getVal("logId");
      const pId = getVal("pId");
      const text = getVal("text");

      setIsLoading(true);
      try {
        const res = await apiFetch("/api/app/patient-logs/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ logId, text })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        setMessages(prev => [...prev, { role: "model", text: "✅ Informação atualizada com sucesso!" }]);
        if (pId) await handleDirectCommand(`/p ${pId}`);
      } catch (err: any) {
        setMessages(prev => [...prev, { role: "model", text: `❌ Erro ao atualizar: ${err.message}` }]);
      } finally {
        setIsLoading(false);
        return true;
      }
    }

    if (cmd.startsWith("/editar_familiar")) {
      const rawText = cmdInput.slice("/editar_familiar".length).trim();
      const contactId = rawText.match(/id:\s*([^,]+)/i)?.[1]?.trim();
      const pId = rawText.match(/pId:\s*([^,]+)/i)?.[1]?.trim();

      if (!contactId) return true;

      const reportMsg = [...messages].reverse().find(m => m.isProfile && m.reportData);
      const contact = reportMsg?.reportData?.familiares?.find((f: any) => f.id === contactId);

      if (contact) {
        setMessages([{
          role: "model",
          text: `✏️ **Editar Contato**`,
          form: {
            title: "",
            fields: [
              { label: "Nome", name: "name", type: "text", defaultValue: contact.nome },
              { 
                label: "Afinidade", 
                name: "relationship", 
                type: "text", 
                defaultValue: contact.relacao,
                suggestions: affinityOptions.length > 0 ? affinityOptions : ["Esposa", "Marido", "Filho(a)", "Pai", "Mãe", "Irmão(ã)", "Cuidador", "Amigo(a)"],
                optional: true
              },
              { label: "Telefone", name: "phone", type: "number", defaultValue: contact.fone },
            ],
            submitLabel: "Atualizar",
            commandPrefix: `/atualizar_familiar contactId: ${contactId}, pId: ${pId},`,
            backCommand: `/p ${pId}`
          }
        }]);
      }
      return true;
    }

    if (cmd.startsWith("/atualizar_familiar")) {
      const rawText = cmdInput.slice("/atualizar_familiar".length).trim();
      const getVal = (label: string) => {
        const regex = new RegExp(`${label}:\\s*([^,]*)`, "i");
        const match = cmdInput.match(regex);
        return match ? match[1].trim() : "";
      };
      
      const contactId = getVal("contactId");
      const pId = getVal("pId");
      const name = getVal("name");
      const relationship = getVal("relationship");
      const phone = getVal("phone");

      setIsLoading(true);
      try {
        const res = await apiFetch("/api/app/patient-contacts/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactId, name, relationship, phone })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        setMessages(prev => [...prev, { role: "model", text: "✅ Contato atualizado com sucesso!" }]);
        if (pId) await handleDirectCommand(`/p ${pId}`);
      } catch (err: any) {
        setMessages(prev => [...prev, { role: "model", text: `❌ Erro ao atualizar: ${err.message}` }]);
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
        const res = await apiFetch(`/api/calendar/events/${eventPart}`, { method: "DELETE" });
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
      setIsLoading(true);
      try {
        const patientRes = await apiFetch(`/api/app/patients/info/${patId}`);
        const patientData = await patientRes.json();
        const patientName = patientData.nome || patientData.name || "Paciente selecionado";

        setMessages([{
          role: "model",
          text: `🏷️ **Alterar Status**\n\n**Paciente:** ${patientName}\n\nEscolha o novo status para o paciente:`,
          patientNameForStatus: patientName,
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
      } catch (err) {
        console.error("Erro ao obter nome do paciente:", err);
        setMessages([{
          role: "model",
          text: `🏷️ **Alterar Status**\n\n**Paciente:** Paciente selecionado\n\nEscolha o novo status para o paciente:`,
          patientNameForStatus: "Paciente selecionado",
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
      } finally {
        setIsLoading(false);
      }
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
        const res = await apiFetch("/api/app/patients/status", {
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
        const qRes = await apiFetch("/api/ai/check-quota");
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
          model: "gemini-1.5-flash",
          contents: [
            {
              role: "user",
              parts: [
                { text: imageAnalysisPrompt || "Aja como um médico experiente em cirurgia cardíaca e descreva esta imagem médica indicando possíveis achados e soluções ideais." },
                { inlineData: { data: base64, mimeType: mimeType } }
              ]
            }
          ]
        });

        const analysis = result.text || "Análise indisponível.";

        // 4. Save analysis to database
        const saveRes = await apiFetch("/api/ai/save-analysis", {
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
    if (customPrompt && (forceClear || customPrompt.startsWith("/"))) {
      shouldScrollTopRef.current = true;
    }
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
    setSelectedFileObj(null);
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
          agentRef.current = createAgent(companyName);
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
    <div 
      id="nexus-chat"
      ref={chatContainerRef}
      className="flex flex-col glass-panel rounded-2xl relative pb-4"
    >
      {/* Messages */}
      <div ref={scrollRef} className="px-2 sm:px-6 py-4 space-y-6 flex-1">

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
                <div className={(msg.isProfile || msg.patientNameForStatus || msg.form?.commandPrefix?.includes("/calendario_add")) ? "text-sm w-full overflow-y-auto space-y-6" : `p-4 rounded-2xl text-sm glass-subcard text-gray-800 shadow-sm w-full overflow-y-auto`}>
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
                      {/* Patient header card */}
                      <div className="glass-card rounded-3xl p-5 flex flex-row items-center justify-between gap-4 relative overflow-hidden shadow-sm">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-100/10 rounded-full -mr-12 -mt-12 blur-2xl"></div>
                        
                        {/* Coluna da Esquerda: Nome, Idade e Botão Editar */}
                        <div className="flex flex-col items-start relative z-10 min-w-0 flex-1">
                          <h3 className="text-base sm:text-lg font-bold text-slate-800 tracking-tight leading-tight truncate w-full mb-1.5">
                            {msg.profileData.nome}
                          </h3>
                          <div className="flex flex-row items-center gap-2 mt-0.5">
                            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg shrink-0 uppercase tracking-wider">
                              {(msg.profileData.idade && msg.profileData.idade !== "N/A" && msg.profileData.idade !== "") 
                                ? `${msg.profileData.idade} ${Number(msg.profileData.idade) === 1 ? "ANO" : "ANOS"}`
                                : "Idade N/A"}
                            </span>
                            <button 
                              onClick={() => handleDirectCommand(`/edit_name ${msg.profileData?.id}`)}
                              className="text-[9px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50/50 px-2.5 py-1 rounded-lg hover:bg-blue-100/75 transition-all shrink-0 font-sans"
                            >
                              Editar
                            </button>
                          </div>
                        </div>

                        {/* Coluna da Direita: Hospital e Quarto */}
                        <div className="flex flex-col items-end gap-1 relative z-10 shrink-0 text-right min-w-[100px] max-w-[150px] sm:max-w-[220px]">
                          <div className="text-xs font-bold text-blue-500 tracking-tight truncate w-full uppercase" title={msg.profileData?.hospitalNome || "Sem Hospital"}>
                            {msg.profileData?.hospitalNome || "Sem Hospital"}
                          </div>
                          <div className="text-[11px] font-medium text-slate-400 truncate w-full">
                            Quarto: {msg.profileData?.roomNumber || "Não inf."}
                          </div>
                        </div>
                      </div>

                      {/* Status and schedule actions */}
                      <div className="flex flex-row items-center justify-between gap-3">
                        <button 
                          onClick={() => handleDirectCommand(`/status_alterar ${msg.profileData?.id}`)}
                          className="w-1/2 glass-button border-blue-100/40 h-11 rounded-2xl text-blue-600 text-xs font-bold uppercase tracking-wider flex items-center justify-center hover:bg-white/70 transition-all active:scale-95 shadow-sm"
                        >
                          <span className="max-w-[125px] sm:max-w-none truncate px-1">
                            {allStatuses.find(s => s.id === msg.profileData?.status)?.nome || (msg.profileData?.status && msg.profileData?.status !== "Não informado" ? msg.profileData?.status : "Sem Status")}
                          </span>
                        </button>
                        <button 
                          onClick={() => handleDirectCommand(`/calendario_form pid: ${msg.profileData?.id}, paciente: ${msg.profileData?.nome}, hospId: ${msg.profileData?.hospitalId}, room: ${msg.profileData?.roomNumber}, type: ${msg.profileData?.surgery_type}, procedure: ${msg.profileData?.procedure || ""}`)}
                          className="w-1/2 bg-emerald-600 text-white h-11 rounded-2xl shadow-lg shadow-emerald-500/10 hover:bg-emerald-700 transition-all flex items-center justify-center gap-1.5 active:scale-[0.98] text-xs font-bold uppercase tracking-wider"
                        >
                          <CalendarPlus size={16} className="text-emerald-100 shrink-0" />
                          <span className="truncate px-1 font-bold">Agendar Novo</span>
                        </button>
                      </div>
                    </>
                  )}
                  {msg.image && (
                    <div className="max-w-full rounded-lg mb-2 shadow-sm overflow-hidden bg-slate-100 flex items-center justify-center">
                      <E2EMedia
                        src={msg.image}
                        encryption={null}
                        fallbackType={isPdfUrl(msg.image) ? "pdf" : isVideoUrl(msg.image) ? "video" : "image"}
                        alt="Preview de envio"
                        className="max-h-[300px] w-full object-contain"
                      />
                    </div>
                  )}
                  {msg.audio && (
                    <audio controls src={msg.audio} className="max-w-full mb-2" />
                  )}
                  {msg.role === "user" ? (
                    <div className="whitespace-pre-wrap">{msg.text}</div>
                  ) : (
                    <>
                      {msg.isPatientListing && msg.patientListData ? (
                        <PatientListView
                          patients={msg.patientListData.patients}
                          statuses={msg.patientListData.statuses}
                          hospitals={msg.patientListData.hospitals}
                          hospitalFilter={msg.patientListData.hospitalFilter}
                          statusFilter={msg.patientListData.statusFilter}
                          sort={msg.patientListData.sort}
                          pagination={msg.patientListData.pagination}
                          onCommand={(cmd, shouldClear) => handleSend(undefined, cmd, shouldClear)}
                        />
                      ) : (
                        (() => {
                          const text = msg.text || "";
                          const idxContatos = text.indexOf("`/novofamiliar");
                          const idxInformacoes = text.indexOf("`/logpac");
                          const idxImagens = text.indexOf("`/prep_img");

                          const isSplitNeeded = msg.isProfile && idxContatos !== -1 && idxInformacoes !== -1 && idxImagens !== -1;

                          const mdComponents = {
                            a({ children, ...props }: any) {
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
                               if (href && href.includes("wa.me/")) {
                                 return (
                                   <a
                                     {...props}
                                     onClick={(e) => {
                                       e.preventDefault();
                                       window.location.href = href;
                                     }}
                                     className="text-blue-600 hover:underline inline-flex items-center gap-1 font-medium"
                                   >
                                     {children}
                                   </a>
                                 );
                               }
                               return <a {...props} target="_blank" rel="noopener noreferrer">{children}</a>;
                             },
                            code({ children, ...props }: any) {
                              const content = String(children);
                              const isInline = !props.className;
                              if (isInline && content.startsWith("/")) {
                                let label = content;

                                if (content.includes(" label:")) {
                                  label = content.split(" label:")[1].trim();
                                } else {
                                  if (content.startsWith("/remover_evento")) label = "🗑️";
                                  if (content.startsWith("/remover_informacao")) label = "🗑️";
                                  if (content.startsWith("/remover_imagem")) label = "🗑️";
                                  if (content.startsWith("/remover_familiar")) label = "🗑️";
                                  if (content.startsWith("/editar_log")) label = "✏️";
                                  if (content.startsWith("/editar_familiar")) label = "✏️";
                                  if (content.startsWith("/pacientes")) label = "📋 Pacientes";
                                  if (content.startsWith("/prep_img")) label = "Anexar Foto";
                                  if (content.startsWith("/prep_p") || content.startsWith("/p ")) {
                                    label = "🚀 Relatório Médico";
                                  }
                                  if (content.startsWith("/logpac")) label = "📝 Novo Registro";
                                  if (content.startsWith("/novo_familiar")) label = "👤 Novo Familiar";
                                  if (content.startsWith("/edit_name")) label = "✏️ Editar Cadastro";
                                  if (content.startsWith("/update_patient")) label = "Confirmar Alteração";
                                  if (content.startsWith("/agenda_add")) label = "📅 Agendar Procedimento";
                                  if (content.startsWith("/status_alterar")) {
                                    if (content.includes("status ")) {
                                      const s = content.split("status ")[1];
                                      label = s;
                                    } else {
                                      label = "✏️ Alterar Status";
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
                                  const amanhaStr = `${pad(tomorrow.getDate())}-${pad(tomorrow.getMonth() + 1)}-${today.getFullYear()}`;
                                  
                                  if (date === hojeStr) label = `Hoje ${date}`;
                                  else if (date === amanhaStr) label = `Amanhã ${date}`;
                                  else label = content;
                                }

                                const isPlusLabel = label === "+";
                                const isRemover = content.startsWith("/remover") || content.startsWith("/remove_status");
                                const isReport = content.startsWith("/p ") || content.startsWith("/prep_p");
                                const isDisabled = content.startsWith("/disabled");
                                const isIconLabel = label.length <= 4 && !label.includes(" ");

                                return (
                                  <button
                                    disabled={isDisabled}
                                    onClick={() => {
                                      if (isDisabled) return;

                                      const isRemoverImagem = content.startsWith("/remover_imagem");
                                      const isRemoverEvento = content.startsWith("/remover_evento");
                                      const isRemoverInfo = content.startsWith("/remover_informacao");
                                      const isRemoverFamiliar = content.startsWith("/remover_familiar");
                                      const isRemoverStatus = content.startsWith("/remove_status");
                                      
                                      if (isRemoverImagem || isRemoverEvento || isRemoverInfo || isRemoverFamiliar || isRemoverStatus) {
                                        setConfirmCommand({ 
                                          title: isRemoverImagem ? "Remover esta imagem?" : 
                                                 isRemoverEvento ? "Remover este evento do calendário?" : 
                                                 isRemoverInfo ? "Remover esta informação do histórico?" : 
                                                 isRemoverStatus ? "Remover este status do grupo?" :
                                                 "Remover este contato do histórico?", 
                                          cmd: content,
                                          shouldClear: false 
                                        });
                                        return;
                                      }

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
                                      ? "not-prose bg-blue-600 text-white w-7 h-7 inline-flex items-center justify-center rounded-full font-bold hover:bg-blue-700 transition-all cursor-pointer shadow-md mx-1 active:scale-90"
                                      : isDisabled
                                        ? "not-prose bg-gray-100 text-gray-300 border-gray-200 w-8 h-8 inline-flex items-center justify-center rounded-lg border shadow-sm mx-1 cursor-not-allowed select-none"
                                        : isIconLabel
                                          ? `not-prose ${isRemover ? 'bg-red-50 text-red-600 border-red-100' : 'bg-blue-50 text-blue-600 border-blue-100'} w-8 h-8 inline-flex items-center justify-center rounded-lg hover:brightness-95 transition-all cursor-pointer border shadow-sm mx-1 active:scale-90 font-bold`
                                          : isRemover
                                            ? "not-prose bg-gray-100 text-gray-500 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-200 hover:text-gray-700 transition-all cursor-pointer border border-gray-200 mx-1 shadow-md active:scale-95 flex items-center gap-2 group"
                                            : isReport
                                              ? "not-prose bg-emerald-50 text-emerald-700 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all cursor-pointer border border-emerald-100 mx-1 shadow-lg shadow-emerald-900/5 active:scale-95 flex items-center gap-2"
                                              : "not-prose bg-blue-50 text-blue-700 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all cursor-pointer border border-blue-100 mx-1 shadow-lg shadow-blue-900/5 active:scale-95 flex items-center gap-2"
                                    }
                                  >
                                    {label}
                                  </button>
                                );
                              }
                              return <code {...props}>{children}</code>;
                            },
                            img({ src, alt, ...props }: any) {
                              if (src && isVideoUrl(src)) {
                                return (
                                  <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-slate-950 flex items-center justify-center border border-gray-150 my-2">
                                    <video 
                                      src={src} 
                                      controls 
                                      preload="metadata"
                                      className="w-full h-full object-contain"
                                    />
                                  </div>
                                );
                              }
                              return <img src={src} alt={alt} {...props} referrerPolicy="no-referrer" />;
                            }
                          };

                          if (isSplitNeeded) {
                            const headerPart = text.substring(0, idxContatos);
                            const contatosPart = text.substring(idxContatos, idxInformacoes);
                            const informacoesPart = text.substring(idxInformacoes, idxImagens);
                            const imagensPart = text.substring(idxImagens);

                            // Helper parsers:
                            const parseSectionPart = (partText: string) => {
                              const firstBacktick = partText.indexOf('`');
                              if (firstBacktick === -1) return null;
                              const secondBacktick = partText.indexOf('`', firstBacktick + 1);
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

                              return {
                                command,
                                title,
                                content: content.trim()
                              };
                            };

                            const parseContatos = (contText: string) => {
                              const lines = contText.split('\n').map(l => l.trim()).filter(Boolean);
                              const items: { name: string; phoneLinkText: string; waUrl: string; editCmd?: string; trashCmd?: string }[] = [];
                              
                              let currentItem: any = null;

                              for (let i = 0; i < lines.length; i++) {
                                const line = lines[i];
                                if (line.toLowerCase().includes("nenhum registro")) {
                                  continue;
                                }

                                const waMatchSimple = line.match(/\*\*([^*]+)\*\*(?:\s+\(([^)]+)\))?\s*(?:\[📞\s*\*\*([^*]+)\*\*\]\(([^)]+)\)|📞\s*(Sem\s+telefone))/i);

                                if (waMatchSimple) {
                                  if (currentItem) {
                                    items.push(currentItem);
                                  }
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

                              if (currentItem) {
                                items.push(currentItem);
                              }

                              return items;
                            };

                            const parseInformacoes = (infText: string) => {
                              const lines = infText.split('\n').map(l => l.trim()).filter(Boolean);
                              const items: { content: string; date: string; editCmd?: string; trashCmd?: string }[] = [];
                              
                              let currentItem: any = null;

                              for (let i = 0; i < lines.length; i++) {
                                const line = lines[i];
                                if (line.toLowerCase().includes("nenhum registro")) {
                                  continue;
                                }

                                const contentMatch = line.match(/^\*\*([^*]+)\*\*$/);
                                const dateMatch = line.match(/^_([^_]+)_$/);

                                if (contentMatch) {
                                  if (currentItem) {
                                    items.push(currentItem);
                                  }
                                  currentItem = {
                                    content: contentMatch[1].trim(),
                                    date: "",
                                  };
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

                              if (currentItem) {
                                items.push(currentItem);
                              }

                              return items;
                            };

                            const parseImagens = (imgText: string) => {
                              const blocks = imgText.split('---').map(b => b.trim()).filter(Boolean);
                              const items: { src: string; alt: string; date: string; trashCmd?: string; aiAnalysis?: string }[] = [];

                              blocks.forEach(block => {
                                if (block.toLowerCase().includes("nenhum registro")) {
                                  return;
                                }
                                const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
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
                                if (dateMatch) {
                                  date = dateMatch[1].trim();
                                }

                                const trashMatch = block.match(/`(\/remover_imagem[^`]+)`/);
                                if (trashMatch) {
                                  trashCmd = trashMatch[1];
                                }

                                const aiLines = lines.filter(l => l.startsWith(">"));
                                if (aiLines.length > 0) {
                                  aiAnalysis = aiLines
                                    .map(l => l.replace(/^>\s*/, "").replace(/🤖\s*\*\*Análise Inteligente:\*\*/, "").trim())
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

                            const contatosItems = contatosData ? parseContatos(contatosData.content) : [];
                            const informacoesItems = informacoesData ? parseInformacoes(informacoesData.content) : [];
                            const imagensItems = imagensData ? parseImagens(imagensData.content) : [];

                            return (
                              <div className="flex flex-col gap-6">
                                {headerPart.trim() && (
                                  <div 
                                    className="markdown-body prose prose-sm max-w-none [&_p]:mb-1.5 last:[&_p]:mb-0 bg-white rounded-3xl border border-gray-100 shadow-sm p-4"
                                  >
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
                                        onClick={() => {
                                          handleSend(undefined, contatosData.command, false);
                                        }}
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
                                        contatosItems.map((c, idx) => (
                                          <div key={idx} className="flex flex-col gap-2 pb-4 last:pb-0 border-b border-gray-50 last:border-0">
                                            <div className="flex flex-row items-center justify-between gap-4">
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
                                                        shouldClear: false
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
                                        ))
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
                                        onClick={() => {
                                          handleSend(undefined, informacoesData.command, false);
                                        }}
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
                                        informacoesItems.map((inf, idx) => (
                                          <div key={idx} className="flex flex-col gap-2 pb-4 last:pb-0 border-b border-gray-50 last:border-0 w-full">
                                            <div className="flex flex-row items-start justify-between gap-4">
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
                                                        shouldClear: false
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
                                        ))
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
                                        onClick={() => {
                                          handleSend(undefined, imagensData.command, false);
                                        }}
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
                                          const originalRecord = msg.reportData?.imagens?.find((item: any) => item.link === img.src);
                                          const encryptionMeta = originalRecord?.encryption;

                                          return (
                                            <div key={idx} className="flex flex-col gap-3 pb-4 last:pb-0 border-b border-gray-50 last:border-0 w-full">
                                              {img.src && (
                                                <div className="relative w-full aspect-[9/16] rounded-xl overflow-hidden shadow-sm border border-gray-100 bg-slate-100">
                                                  <E2EMedia
                                                    src={img.src}
                                                    encryption={encryptionMeta}
                                                    fallbackType={isPdfUrl(img.src) ? "pdf" : isVideoUrl(img.src) ? "video" : "image"}
                                                    alt={img.alt || "Imagem de exame"}
                                                    className="w-full h-full object-cover animate-fade-in"
                                                  />
                                                </div>
                                              )}
                                              
                                              <div className="flex flex-row items-center justify-between gap-4">
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
                                                          shouldClear: false
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
                              </div>
                            );
                          }

                          if (msg.patientNameForStatus) {
                            return (
                              <div className="bg-white rounded-[1.5rem] border border-gray-150 shadow-sm p-6 sm:p-7 space-y-5 max-w-lg mx-auto my-1">
                                {/* Título */}
                                <div className="flex items-center gap-2.5">
                                  <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                    <Activity size={18} className="text-blue-600 animate-pulse" />
                                  </div>
                                  <div>
                                    <h3 className="text-base sm:text-lg font-black text-slate-800 tracking-tight">Alterar Status</h3>
                                  </div>
                                </div>

                                {/* Área do Paciente */}
                                <div className="bg-gradient-to-r from-slate-50 to-blue-50/20 border border-slate-100 p-4 rounded-xl flex items-center gap-3 shadow-xs">
                                  <div className="w-9 h-9 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center shrink-0">
                                    <User size={18} strokeWidth={2.5} />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-0.5">Paciente</span>
                                    <span className="text-sm sm:text-base font-bold text-slate-800 block truncate leading-tight">
                                      {msg.patientNameForStatus}
                                    </span>
                                  </div>
                                </div>

                                {/* Descrição Curta */}
                                <p className="text-xs sm:text-sm text-slate-500 leading-relaxed font-semibold">
                                  Escolha o novo status para este paciente.
                                </p>

                                {/* Lista de Status */}
                                <div className="space-y-3 pt-1">
                                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block pb-1">
                                    Selecione o status
                                  </label>
                                  
                                  {msg.actionGroups?.[0]?.actions && (
                                    <div className="flex flex-col gap-2 rounded-xl">
                                      {msg.actionGroups[0].actions.map((action, ai) => {
                                        const statusColors: Record<string, string> = {
                                          "internado": "hover:bg-amber-50 hover:border-amber-200 text-amber-700 hover:text-amber-800 hover:shadow-xs",
                                          "pré-operatório": "hover:bg-blue-50 hover:border-blue-200 text-blue-700 hover:text-blue-800 hover:shadow-xs",
                                          "em cirurgia": "hover:bg-red-50 hover:border-red-200 text-red-700 hover:text-red-800 hover:shadow-xs",
                                          "recuperação": "hover:bg-purple-50 hover:border-purple-200 text-purple-700 hover:text-purple-800 hover:shadow-xs",
                                          "alta": "hover:bg-emerald-50 hover:border-emerald-200 text-emerald-700 hover:text-emerald-800 hover:shadow-xs",
                                        };
                                        const labelLower = action.label.toLowerCase();
                                        const colorStyle = statusColors[labelLower] || "hover:bg-slate-50 hover:border-slate-300 text-slate-700 hover:text-slate-800 hover:shadow-xs";

                                        return (
                                          <button
                                            key={ai}
                                            onClick={() => handleSend(undefined, action.cmd, true)}
                                            className={`w-full py-3 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all border border-gray-150 bg-white text-slate-700 shadow-xs flex items-center justify-between group active:scale-[0.99] cursor-pointer ${colorStyle}`}
                                          >
                                            <span className="truncate">{action.label}</span>
                                            <span className="text-slate-300 group-hover:text-current transition-colors text-xs shrink-0 font-light">❯</span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          }

                          if (msg.form?.commandPrefix?.includes("/calendario_add")) {
                            return null;
                          }

                          return (
                            <div 
                              onClick={(e) => {
                                const target = e.target as HTMLElement;
                                const anchor = target.closest("a");
                                if (anchor) {
                                  const href = anchor.getAttribute("href");
                                  if (href && href.startsWith("/")) {
                                    e.preventDefault();
                                    const isNovoBtn = href === "/iniciarcadastro";
                                    const shouldClear = isNovoBtn ||
                                                        href.startsWith("/p") || 
                                                        href.startsWith("/edit") || 
                                                        href.startsWith("/pacientes") ||
                                                        href.startsWith("/status_alterar");
                                    handleSend(undefined, href, shouldClear);
                                  }
                                }
                              }}
                              className="markdown-body prose prose-sm max-w-none [&_p]:mb-5 last:[&_p]:mb-0"
                            >
                              <ReactMarkdown rehypePlugins={[rehypeRaw]} components={mdComponents}>
                                {msg.text}
                              </ReactMarkdown>
                            </div>
                          );
                        })()
                      )}

                      {msg.actionGroups && !msg.patientNameForStatus && (
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
                          selectedFileObj={selectedFileObj}
                          onSelectFileObj={setSelectedFileObj}
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
                  <Activity size={16} className="animate-spin text-blue-600" />
                  <span className="text-sm text-gray-500 italic">Thinking...</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {confirmCommand && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2rem] p-8 max-w-sm w-full shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500">
                <X size={32} strokeWidth={3} />
              </div>
              <h3 className="text-xl font-black text-gray-900 mb-2 uppercase tracking-tight">Confirmar Ação</h3>
              <p className="text-gray-500 text-sm mb-8 leading-relaxed">{confirmCommand.title}</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setConfirmCommand(null)}
                  className="flex-1 px-6 py-3 bg-gray-100 text-gray-500 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-gray-200 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => {
                    handleSend(undefined, confirmCommand.cmd, confirmCommand.shouldClear);
                    setConfirmCommand(null);
                  }}
                  className="flex-1 px-6 py-3 bg-red-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-200"
                >
                  Sim, Remover
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
