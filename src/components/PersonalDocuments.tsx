import React, { useState, useEffect, useRef } from "react";
import { 
  FileText, 
  Plus, 
  ExternalLink, 
  RefreshCcw, 
  ShieldAlert, 
  Loader2, 
  Share2, 
  Check, 
  Search,
  Upload,
  FolderOpen
} from "lucide-react";
import { useGroup } from "../contexts/GroupContext";
import { useAuth } from "../hooks/useAuth";
import { motion, AnimatePresence } from "framer-motion";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  iconLink?: string;
  thumbnailLink?: string;
  createdTime?: string;
}

interface DriveConfig {
  mainFolderId?: string;
  mainFolderName?: string;
  setupAt?: any;
}

export const PersonalDocuments: React.FC = () => {
  const { activeGroup, apiFetch, activeGroupMembers } = useGroup();
  const { user } = useAuth();
  const isAdmin = activeGroup?.createdBy === user?.uid;
  const [config, setConfig] = useState<DriveConfig | null>(null);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSharingModalOpen, setIsSharingModalOpen] = useState(false);
  const [sharingEmail, setSharingEmail] = useState("");
  const [isSharing, setIsSharing] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchConfigAndFiles = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // 1. Get Config
      const configRes = await apiFetch("/api/drive/config");
      const configData = await configRes.json();
      
      if (configData.mainFolderId) {
        setConfig(configData);
        // 2. Get Files
        const filesRes = await apiFetch(`/api/drive/list?mainFolderId=${configData.mainFolderId}`);
        const filesData = await filesRes.json();
        setFiles(Array.isArray(filesData) ? filesData : []);
      } else {
        setConfig(null);
      }
    } catch (err: any) {
      console.error("Drive error:", err);
      setError("Não foi possível carregar a integração com Google Drive. Certifique-se de estar logado e com permissões.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchConfigAndFiles();
  }, [activeGroup?.id]);

  const handleSetup = async () => {
    if (!activeGroup) return;
    setIsSettingUp(true);
    setError(null);
    try {
      const res = await apiFetch("/api/drive/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          rootFolderName: activeGroup.name,
          adminEmail: "" // Backend will detect from session
        }),
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro no setup");
      
      await fetchConfigAndFiles();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSettingUp(false);
    }
  };

  const handleShareManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sharingEmail) return;
    setIsSharing(true);
    try {
      const res = await apiFetch("/api/drive/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: sharingEmail }),
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Falha ao compartilhar");
      }
      
      setShareSuccess(true);
      setSharingEmail("");
      setTimeout(() => {
        setShareSuccess(false);
        setIsSharingModalOpen(false);
      }, 2000);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSharing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !config?.mainFolderId) return;

    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        const res = await apiFetch("/api/drive/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: file.name,
            mimeType: file.type,
            base64Data: base64,
            mainFolderId: config.mainFolderId
          }),
        });

        if (res.ok) {
          fetchConfigAndFiles();
        } else {
          throw new Error("Falha no upload");
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const filteredFiles = files.filter(f => 
    f.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-gray-400">
        <Loader2 className="animate-spin" size={32} />
        <p className="text-sm font-medium">Sincronizando com Google Drive...</p>
      </div>
    );
  }

  if (!config) {
    const isPersonal = activeGroup?.groupType === "personal";
    const showSetupButton = !isPersonal || isAdmin;

    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] bg-gray-50/50 p-10 text-center">
        <div className="w-24 h-24 rounded-[2.5rem] bg-indigo-50 flex items-center justify-center text-indigo-600 mb-8 shadow-xl shadow-indigo-900/5 border border-indigo-100">
          <FolderOpen size={48} strokeWidth={1.5} />
        </div>
        <h3 className="text-3xl font-black text-gray-900 tracking-tighter mb-4">Repositório de Documentos</h3>
        <p className="text-base text-gray-500 max-w-sm mb-10 leading-relaxed font-medium">
          Mantenha todos os exames, protocolos e documentos do grupo organizados em uma pasta exclusiva no seu Google Drive.
        </p>

        {error && (
          <div className="mb-8 p-4 bg-red-50 rounded-2xl border border-red-100 flex items-center gap-3 text-red-600 text-left max-w-md">
            <ShieldAlert size={20} className="shrink-0" />
            <p className="text-sm font-semibold">{error}</p>
          </div>
        )}

        {showSetupButton ? (
          <button
            onClick={handleSetup}
            disabled={isSettingUp}
            className="flex items-center gap-3 bg-indigo-600 text-white px-10 py-5 rounded-3xl font-black shadow-2xl shadow-indigo-600/30 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 group"
          >
            {isSettingUp ? <Loader2 className="animate-spin" size={20} /> : <Plus size={24} className="group-hover:rotate-90 transition-transform" /> }
            <span className="uppercase tracking-widest text-sm">Configurar Pasta de Grupo</span>
          </button>
        ) : (
          <div className="mb-8 p-6 bg-amber-50 rounded-2xl border border-amber-100 flex items-center gap-3 text-amber-700 text-left max-w-md font-bold">
            <ShieldAlert size={20} className="shrink-0 text-amber-600" />
            <p className="text-sm">A pasta principal deste grupo ainda não foi criada pelo administrador.</p>
          </div>
        )}
        
        <p className="mt-8 text-xs font-bold text-gray-400 uppercase tracking-[0.2em]">Sincronização Segura via Google OAuth</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-white">
      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-gray-50 bg-white sticky top-0 z-10">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 border border-indigo-100/50 shadow-sm">
                <FolderOpen size={28} />
              </div>
              <div>
                <h2 className="text-xl font-black text-gray-900 tracking-tight">{config.mainFolderName}</h2>
                <p className="text-sm font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
                  Pasta Drive Ativa
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsSharingModalOpen(true)}
                className="flex items-center gap-2 px-4 py-3 bg-gray-50 text-gray-700 rounded-2xl font-bold text-sm hover:bg-gray-100 transition-all active:scale-95 border border-gray-100"
              >
                <Share2 size={18} />
                <span className="hidden sm:inline">Compartilhar</span>
              </button>
              
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold text-sm hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 transition-all active:scale-95 disabled:opacity-50"
              >
                {isUploading ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
                <span>{isUploading ? "Enviando..." : "Novo Arquivo"}</span>
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                className="hidden" 
              />
            </div>
          </div>

          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-600 transition-colors" size={20} />
            <input
              type="text"
              placeholder="Buscar nos documentos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-gray-50/50 border border-gray-100 rounded-2xl py-4 pl-12 pr-12 focus:outline-none focus:ring-2 focus:ring-indigo-600/10 focus:border-indigo-600 focus:bg-white transition-all text-sm font-bold placeholder:text-gray-400"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <RefreshCcw size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-3 sm:p-6 bg-gray-50/30">
        <div className="max-w-6xl mx-auto">
          {filteredFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-300 mb-4">
                <FileText size={32} />
              </div>
              <h4 className="text-lg font-black text-gray-900">Nenhum arquivo encontrado</h4>
              <p className="text-sm font-medium text-gray-500 mt-1">Carregue documentos ou limpe sua busca.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              <AnimatePresence mode="popLayout">
                {filteredFiles.map((file) => (
                  <motion.div
                    key={file.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="group bg-white p-4 rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl hover:shadow-indigo-900/5 hover:-translate-y-1 transition-all cursor-pointer relative"
                    onClick={() => file.webViewLink && window.open(file.webViewLink, "_blank")}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center group-hover:bg-indigo-50 transition-colors">
                        {file.thumbnailLink ? (
                          <img src={file.thumbnailLink} alt="" className="w-full h-full object-cover rounded-2xl border border-gray-100" referrerPolicy="no-referrer" />
                        ) : (
                          <FileText className="text-gray-400 group-hover:text-indigo-600" size={24} />
                        )}
                      </div>
                      <button className="p-2 text-gray-400 hover:text-indigo-600 transition-colors">
                        <ExternalLink size={18} />
                      </button>
                    </div>
                    <div className="space-y-1 overflow-hidden">
                      <h4 className="font-bold text-gray-900 truncate leading-tight group-hover:text-indigo-600 transition-colors" title={file.name}>
                        {file.name}
                      </h4>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        {new Date(file.createdTime || "").toLocaleDateString("pt-BR")}
                        <span className="w-1 h-1 rounded-full bg-gray-300" />
                        Google Drive
                      </p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 border-t border-gray-50 bg-white text-center">
        <button 
          onClick={fetchConfigAndFiles}
          className="inline-flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] hover:text-indigo-600 transition-colors"
        >
          <RefreshCcw size={12} className={isLoading ? "animate-spin" : ""} />
          Atualizar Repositório
        </button>
      </div>

      {/* Manual Sharing Modal */}
      <AnimatePresence>
        {isSharingModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSharingModalOpen(false)}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <Share2 size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-gray-900 tracking-tight">Compartilhar Pasta</h3>
                    <p className="text-sm font-medium text-gray-500">Adicione um email para liberar acesso.</p>
                  </div>
                </div>

                <form onSubmit={handleShareManual} className="space-y-6">
                  <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">E-mail do Google</label>
                    <input
                      type="email"
                      required
                      placeholder="usuario@gmail.com"
                      value={sharingEmail}
                      onChange={(e) => setSharingEmail(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-5 focus:outline-none focus:ring-2 focus:ring-indigo-600/10 focus:border-indigo-600 transition-all font-bold"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      type="submit"
                      disabled={isSharing || !sharingEmail}
                      className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black flex items-center justify-center gap-3 shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all disabled:opacity-50"
                    >
                      {isSharing ? (
                        <Loader2 className="animate-spin" size={20} />
                      ) : shareSuccess ? (
                        <Check size={20} />
                      ) : (
                        "Liberar Acesso"
                      )}
                      {shareSuccess ? "Convidado com Sucesso" : "Compartilhar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsSharingModalOpen(false)}
                      className="w-full bg-white text-gray-500 py-3 rounded-2xl font-bold text-sm hover:bg-gray-50 transition-all"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>

                <div className="mt-8 pt-6 border-t border-gray-50">
                  <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Sugestões de Membros</h4>
                  <div className="space-y-3">
                    {activeGroupMembers
                      .filter(m => m.userEmail && m.status !== 'removed')
                      .slice(0, 3)
                      .map(member => (
                        <div key={member.userEmail} className="flex items-center justify-between group">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-200">
                              {member.photoURL ? (
                                <img src={member.photoURL} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-[10px] font-black text-gray-400">
                                  {member.displayName?.[0] || member.userEmail[0].toUpperCase()}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-gray-700">{member.displayName || "Membro"}</span>
                              <span className="text-[10px] text-gray-500">{member.userEmail}</span>
                            </div>
                          </div>
                          <button 
                            type="button"
                            onClick={() => setSharingEmail(member.userEmail)}
                            className="p-2 text-indigo-600 opacity-0 group-hover:opacity-100 transition-all hover:bg-indigo-50 rounded-lg"
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
