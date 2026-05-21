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
  FolderOpen,
  Folder,
  FolderPlus,
  ArrowLeft,
  ChevronRight,
  Edit3,
  X,
  Download,
  Image as ImageIcon
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
  const { user, login } = useAuth();
  const isAdmin = activeGroup?.createdBy === user?.uid;
  const [config, setConfig] = useState<DriveConfig | null>(null);
  const [files, setFiles] = useState<DriveFile[]>([]);
  
  // Loading states
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  
  // Navigation states
  const [currentFolder, setCurrentFolder] = useState<{ id: string; name: string } | null>(null);
  const [folderHistory, setFolderHistory] = useState<{ id: string; name: string }[]>([]);
  
  // Modals / forms
  const [searchTerm, setSearchTerm] = useState("");
  const [isSharingModalOpen, setIsSharingModalOpen] = useState(false);
  const [sharingEmail, setSharingEmail] = useState("");
  const [isSharing, setIsSharing] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Folder creation
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  // Renaming folder
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [isRenamingSubmit, setIsRenamingSubmit] = useState(false);

  // Image / file preview lightbox
  const [previewFile, setPreviewFile] = useState<DriveFile | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Fetch drive configuration and set root folder
  const fetchConfig = async () => {
    setIsLoading(true);
    setError(null);
    setNeedsLogin(false);
    try {
      const configRes = await apiFetch("/api/drive/config");
      if (configRes.ok) {
        const configData = await configRes.json();
        if (configData.mainFolderId) {
          setConfig(configData);
          const rootFolder = {
            id: configData.mainFolderId,
            name: configData.mainFolderName || "Pasta Principal"
          };
          setCurrentFolder(rootFolder);
          setFolderHistory([]);
          
          // Immediately pull files for root folder
          setIsLoadingFiles(true);
          const filesRes = await apiFetch(`/api/drive/list?mainFolderId=${configData.mainFolderId}&parentFolderId=${configData.mainFolderId}`);
          if (filesRes.ok) {
            const filesData = await filesRes.json();
            setFiles(Array.isArray(filesData) ? filesData : []);
          } else {
            if (filesRes.status === 401 || filesRes.status === 403) {
              // Try auto-heal self-share
              if (user?.email) {
                console.log("[Drive] Auto-healing: self-share on load for", user.email);
                const shareRes = await apiFetch("/api/drive/share", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ email: user.email })
                });
                if (shareRes.ok) {
                  const retryRes = await apiFetch(`/api/drive/list?mainFolderId=${configData.mainFolderId}&parentFolderId=${configData.mainFolderId}`);
                  if (retryRes.ok) {
                    const retryData = await retryRes.json();
                    setFiles(Array.isArray(retryData) ? retryData : []);
                    setIsLoadingFiles(false);
                    return;
                  }
                }
              }
              setNeedsLogin(true);
              setError("Sua sessão do Google expirou ou não está autorizada. Por favor, conecte para visualizar estes arquivos.");
            } else {
              const filesErr = await filesRes.json().catch(() => ({}));
              setError(filesErr.error || "Erro ao carregar arquivos da lista.");
            }
          }
        } else {
          setConfig(null);
          setCurrentFolder(null);
          setFolderHistory([]);
          setFiles([]);
        }
      } else {
        if (configRes.status === 401 || configRes.status === 403) {
          setNeedsLogin(true);
          setError("Sua sessão do Google Drive não está conectada. Por favor, faça login com o Google para ver os arquivos.");
        } else {
          const configErr = await configRes.json().catch(() => ({}));
          setError(configErr.error || "Erro ao carregar a configuração do Drive.");
        }
        setConfig(null);
        setCurrentFolder(null);
        setFolderHistory([]);
        setFiles([]);
      }
    } catch (err: any) {
      console.error("Drive config error:", err);
      setError("Não foi possível carregar a integração com Google Drive. Certifique-se de estar conectado com sua conta Google.");
    } finally {
      setIsLoading(false);
      setIsLoadingFiles(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, [activeGroup?.id]);

  // Fetch files inside the current folder
  const fetchFiles = async (folderId: string) => {
    if (!config?.mainFolderId) return;
    setIsLoadingFiles(true);
    try {
      const filesRes = await apiFetch(`/api/drive/list?mainFolderId=${config.mainFolderId}&parentFolderId=${folderId}`);
      if (filesRes.ok) {
        const filesData = await filesRes.json();
        setFiles(Array.isArray(filesData) ? filesData : []);
      } else {
        if (filesRes.status === 401 || filesRes.status === 403) {
          if (user?.email) {
            console.log("[Drive] Auto-healing: self-share during navigation for", user.email);
            const shareRes = await apiFetch("/api/drive/share", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: user.email })
            });
            if (shareRes.ok) {
              const retryRes = await apiFetch(`/api/drive/list?mainFolderId=${config.mainFolderId}&parentFolderId=${folderId}`);
              if (retryRes.ok) {
                const retryData = await retryRes.json();
                setFiles(Array.isArray(retryData) ? retryData : []);
                setIsLoadingFiles(false);
                return;
              }
            }
          }
          setNeedsLogin(true);
          setError("Sua sessão do Google Drive expirou. Por favor, conecte sua conta Google.");
        } else {
          const filesErr = await filesRes.json().catch(() => ({}));
          setError(filesErr.error || "Não foi possível resgatar arquivos desta pasta.");
        }
      }
    } catch (err) {
      console.error("Error loading files:", err);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  useEffect(() => {
    if (config?.mainFolderId && currentFolder?.id) {
      // Skip fetching on initial loading since the config fetch already handled it
      if (!isLoading) {
        fetchFiles(currentFolder.id);
      }
    }
  }, [currentFolder?.id]);

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
          adminEmail: "" 
        }),
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro no setup");
      
      await fetchConfig();
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

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim() || !currentFolder?.id) return;
    setIsCreatingFolder(true);
    try {
      const res = await apiFetch("/api/drive/create-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newFolderName.trim(),
          parentFolderId: currentFolder.id
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao criar subpasta");
      }

      setNewFolderName("");
      setIsFolderModalOpen(false);
      await fetchFiles(currentFolder.id);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleRenameFolderSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!renameValue.trim() || !currentFolder) return;
    setIsRenamingSubmit(true);
    try {
      const res = await apiFetch("/api/drive/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newName: renameValue.trim() })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Não foi possível renomear a pasta.");
      }

      const updatedName = renameValue.trim();
      setCurrentFolder(prev => prev ? { ...prev, name: updatedName } : null);
      if (config) {
        setConfig(prev => prev ? { ...prev, mainFolderName: updatedName } : null);
      }
      setIsRenaming(false);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsRenamingSubmit(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !config?.mainFolderId || !currentFolder?.id) return;

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
            mainFolderId: config.mainFolderId,
            parentFolderId: currentFolder.id 
          }),
        });

        if (res.ok) {
          fetchFiles(currentFolder.id);
        } else {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Falha no upload");
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

  // Navigating lower in directory stack
  const handleFolderClick = (folder: DriveFile) => {
    if (!currentFolder) return;
    setFolderHistory(prev => [...prev, currentFolder]);
    setCurrentFolder({ id: folder.id, name: folder.name });
  };

  // Navigating up in directory stack
  const handleGoBack = () => {
    if (folderHistory.length === 0) return;
    const previous = folderHistory[folderHistory.length - 1];
    setFolderHistory(prev => prev.slice(0, -1));
    setCurrentFolder(previous);
  };

  // Breadcrumb fast jumps
  const handleJumpToFolder = (index: number) => {
    if (index === -1) {
      if (!config?.mainFolderId) return;
      setCurrentFolder({ id: config.mainFolderId, name: config.mainFolderName || "Pasta Principal" });
      setFolderHistory([]);
    } else {
      const target = folderHistory[index];
      setCurrentFolder(target);
      setFolderHistory(prev => prev.slice(0, index));
    }
  };

  const startRenameWorkflow = () => {
    if (!currentFolder) return;
    setRenameValue(currentFolder.name);
    setIsRenaming(true);
  };

  const filteredFiles = files.filter(f => 
    f.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-gray-400">
        <Loader2 className="animate-spin text-indigo-600" size={36} />
        <p className="text-sm font-semibold text-gray-500">Sincronizando com Google Drive...</p>
      </div>
    );
  }

  if (needsLogin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[450px] bg-slate-50/50 p-10 text-center">
        <div className="w-24 h-24 rounded-[2.5rem] bg-indigo-50 flex items-center justify-center text-indigo-600 mb-8 shadow-xl shadow-indigo-900/5 border border-indigo-100">
          <ShieldAlert size={48} strokeWidth={1.5} />
        </div>
        <h3 className="text-2xl font-black text-gray-900 tracking-tighter mb-4">Conexão Necessária</h3>
        <p className="text-base text-gray-500 max-w-sm mb-8 leading-relaxed font-medium">
          Acesse a pasta de arquivos autorizando a sua conta do Google. Todos os exames do grupo são armazenados no Drive.
        </p>

        <button
          onClick={login}
          className="flex items-center gap-3 bg-indigo-600 text-white px-10 py-5 rounded-3xl font-black shadow-2xl shadow-indigo-600/30 hover:bg-indigo-700 active:scale-95 transition-all cursor-pointer"
        >
          <ExternalLink size={20} />
          <span className="uppercase tracking-widest text-sm">Conectar ao Google</span>
        </button>
        
        <p className="mt-8 text-xs font-bold text-gray-400 uppercase tracking-[0.2em]">Integração via Google Workspace</p>
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
            {isSettingUp ? <Loader2 className="animate-spin" size={20} /> : <Plus size={24} className="group-hover:rotate-90 transition-transform" />}
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
    <div className="flex flex-col bg-white min-h-[500px]">
      {/* Header with Breadcrumb and controls */}
      <div className="p-4 sm:p-6 border-b border-gray-150 bg-white sticky top-0 z-10 shadow-sm">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div 
                className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 border border-indigo-100 shadow-sm cursor-pointer hover:bg-indigo-100 transition-colors shrink-0"
                onClick={() => handleJumpToFolder(-1)}
                title="Ir para a pasta principal"
              >
                <FolderOpen size={28} />
              </div>
              <div className="overflow-hidden">
                {isRenaming ? (
                  <form onSubmit={handleRenameFolderSubmit} className="flex items-center gap-2 max-w-md">
                    <input
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      required
                      placeholder="Nome da pasta"
                      className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-base font-bold focus:outline-none focus:ring-2 focus:ring-indigo-600/30"
                      disabled={isRenamingSubmit}
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={isRenamingSubmit}
                      className="p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md disabled:opacity-50"
                    >
                      {isRenamingSubmit ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsRenaming(false)}
                      disabled={isRenamingSubmit}
                      className="p-2 bg-gray-150 hover:bg-gray-200 text-gray-700 rounded-xl"
                    >
                      <X size={16} />
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-black text-gray-900 tracking-tight truncate max-w-sm sm:max-w-md md:max-w-lg">
                      {currentFolder?.name}
                    </h2>
                    {isAdmin && (
                      <button
                        onClick={startRenameWorkflow}
                        className="p-1 px-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-transparent hover:border-indigo-100"
                        title="Renomear esta pasta"
                      >
                        <Edit3 size={15} />
                      </button>
                    )}
                  </div>
                )}
                
                {/* Visual breadcrumbs path */}
                <div className="flex items-center flex-wrap gap-1 mt-1 text-xs font-semibold text-gray-500">
                  <span 
                    onClick={() => handleJumpToFolder(-1)} 
                    className="hover:text-indigo-600 cursor-pointer uppercase tracking-wider text-[10px]"
                  >
                    Drive do Grupo
                  </span>
                  {folderHistory.map((hist, index) => (
                    <React.Fragment key={hist.id}>
                      <ChevronRight size={12} className="text-gray-300" />
                      <span 
                        onClick={() => handleJumpToFolder(index)}
                        className="hover:text-indigo-600 cursor-pointer truncate max-w-[100px]"
                        title={hist.name}
                      >
                        {hist.name}
                      </span>
                    </React.Fragment>
                  ))}
                  {folderHistory.length > 0 && currentFolder && (
                    <>
                      <ChevronRight size={12} className="text-gray-300" />
                      <span className="text-indigo-600 font-bold truncate max-w-[120px]" title={currentFolder.name}>
                        {currentFolder.name}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center flex-wrap gap-2">
              {folderHistory.length > 0 && (
                <button
                  onClick={handleGoBack}
                  className="flex items-center gap-2 px-4 py-3 bg-white text-gray-700 rounded-2xl font-bold text-sm hover:bg-gray-50 transition-all active:scale-95 border border-gray-200 shadow-sm"
                >
                  <ArrowLeft size={16} />
                  <span>Voltar</span>
                </button>
              )}

              <button
                onClick={() => setIsFolderModalOpen(true)}
                className="flex items-center gap-2 px-4 py-3 bg-white text-indigo-600 rounded-2xl font-bold text-sm hover:bg-indigo-50 transition-all active:scale-95 border border-indigo-200"
              >
                <FolderPlus size={18} />
                <span>Nova Pasta</span>
              </button>

              <button
                onClick={() => setIsSharingModalOpen(true)}
                className="flex items-center gap-2 px-4 py-3 bg-gray-50 text-gray-700 rounded-2xl font-bold text-sm hover:bg-gray-100 transition-all active:scale-95 border border-gray-100"
              >
                <Share2 size={18} />
                <span>Compartilhar</span>
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
                <X size={18} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Files Display & Grid */}
      <div className="p-4 sm:p-6 bg-gray-50/40 flex-1 flex flex-col justify-between">
        <div className="max-w-6xl mx-auto w-full">
          {isLoadingFiles ? (
            <div className="flex flex-col items-center justify-center py-24 text-center text-gray-450 gap-3">
              <Loader2 className="animate-spin text-indigo-600" size={32} />
              <p className="text-sm font-bold text-gray-500">Buscando conteúdo da pasta...</p>
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center bg-white border border-gray-100 rounded-[2.5rem] shadow-sm">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400 mb-4">
                <FileText size={32} />
              </div>
              <h4 className="text-lg font-black text-gray-900">Nenhum item nesta pasta</h4>
              <p className="text-sm font-medium text-gray-500 mt-1 max-w-xs">Esta pasta está vazia. Comece criando um novo arquivo ou criando subpastas!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              <AnimatePresence mode="popLayout">
                {filteredFiles.map((file) => {
                  const isFolder = file.mimeType === "application/vnd.google-apps.folder";
                  const isImage = file.mimeType.startsWith("image/");
                  
                  return (
                    <motion.div
                      key={file.id}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className={`group bg-white p-4 rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl hover:shadow-indigo-900/5 hover:-translate-y-1 transition-all cursor-pointer relative flex flex-col justify-between ${isFolder ? 'border-amber-100/60 hover:border-amber-300' : ''}`}
                      onClick={() => {
                        if (isFolder) {
                          handleFolderClick(file);
                        } else if (isImage) {
                          setPreviewFile(file);
                        } else {
                          // Standard documents
                          setPreviewFile(file);
                        }
                      }}
                    >
                      {/* Thumbnail or Icon wrapper */}
                      <div className="mb-4 aspect-video rounded-2xl bg-gray-50 border border-gray-100 overflow-hidden flex items-center justify-center group-hover:bg-indigo-50/20 transition-colors relative">
                        {isFolder ? (
                          <div className="flex flex-col items-center gap-2 text-amber-500">
                            <Folder size={44} strokeWidth={1.5} className="fill-amber-500/10" />
                          </div>
                        ) : isImage ? (
                          <img 
                            src={`/api/drive/file/${file.id}`} 
                            alt={file.name} 
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" 
                            referrerPolicy="no-referrer"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-2 text-indigo-500">
                            <FileText size={44} strokeWidth={1.5} className="text-indigo-600/80" />
                          </div>
                        )}

                        {/* Hover Overlay info */}
                        <div className="absolute inset-0 bg-gray-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl">
                          <button className="p-3 bg-white hover:bg-gray-100 text-gray-850 rounded-2xl shadow-lg transform translate-y-3 group-hover:translate-y-0 transition-all font-bold text-xs flex items-center gap-2">
                            <span>{isFolder ? "Abrir Pasta" : (isImage ? "Visualizar" : "Ver Detalhes")}</span>
                          </button>
                        </div>
                      </div>

                      {/* File details info */}
                      <div className="space-y-1 px-1">
                        <h4 className="font-bold text-gray-900 truncate leading-tight group-hover:text-indigo-600 transition-colors" title={file.name}>
                          {file.name}
                        </h4>
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                            {file.createdTime ? new Date(file.createdTime).toLocaleDateString("pt-BR") : "Desconhecido"}
                            <span className="w-1 h-1 rounded-full bg-gray-300" />
                            {isFolder ? "Pasta" : "Google Drive"}
                          </p>
                          {!isFolder && file.webViewLink && (
                            <a 
                              href={file.webViewLink} 
                              target="_blank" 
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()} 
                              className="text-gray-400 hover:text-indigo-600 p-1 rounded hover:bg-gray-50 transition-colors"
                              title="Abrir diretamente no Google Drive"
                            >
                              <ExternalLink size={14} />
                            </a>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Footer repository bar */}
      <div className="p-4 border-t border-gray-100 bg-white text-center flex flex-col sm:flex-row items-center justify-between max-w-6xl w-full mx-auto gap-4">
        <p className="text-xs text-gray-400 font-semibold">
          Conectado à pasta principal: <strong className="text-gray-600">{config.mainFolderName}</strong>
        </p>
        <button 
          onClick={() => {
            if (currentFolder) fetchFiles(currentFolder.id);
          }}
          className="inline-flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] hover:text-indigo-600 transition-colors"
        >
          <RefreshCcw size={12} className={isLoadingFiles ? "animate-spin text-indigo-600" : ""} />
          Atualizar Pasta Atual
        </button>
      </div>

      {/* Modern Lightbox File Viewer / Image Preview Modal */}
      <AnimatePresence>
        {previewFile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPreviewFile(null)}
              className="absolute inset-0 bg-gray-950/90 backdrop-blur-md"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-4xl bg-gray-900 rounded-[2rem] overflow-hidden shadow-2xl flex flex-col md:flex-row max-h-[85vh]"
            >
              <button 
                onClick={() => setPreviewFile(null)}
                className="absolute right-4 top-4 z-10 p-3 bg-black/60 text-white rounded-full hover:bg-black/80 transition-all focus:outline-none"
              >
                <X size={20} />
              </button>

              {/* Left Column: Big media display */}
              <div className="flex-1 bg-black flex items-center justify-center p-6 min-h-[300px] md:min-h-[450px]">
                {previewFile.mimeType.startsWith("image/") ? (
                  <img 
                    src={`/api/drive/file/${previewFile.id}`} 
                    alt={previewFile.name} 
                    className="max-w-full max-h-[60vh] object-contain rounded-xl"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-4 text-gray-400">
                    <div className="w-20 h-20 rounded-3xl bg-gray-800 flex items-center justify-center text-indigo-400 border border-gray-700">
                      <FileText size={40} />
                    </div>
                    <span className="text-sm font-bold uppercase tracking-wider text-gray-500">Visualização indisponível para este formato</span>
                  </div>
                )}
              </div>

              {/* Right Column: Information pane */}
              <div className="w-full md:w-80 bg-gray-900 border-t md:border-t-0 md:border-l border-gray-850 p-6 flex flex-col justify-between text-white md:max-h-full overflow-y-auto">
                <div className="space-y-6">
                  <div>
                    <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.25em]">Informações do Arquivo</span>
                    <h3 className="text-lg font-black mt-1 tracking-tight break-words">{previewFile.name}</h3>
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-xs border-t border-gray-800 pt-4">
                      <div>
                        <span className="text-gray-500 block">Tipo:</span>
                        <span className="font-bold text-gray-300 truncate block">{previewFile.mimeType.split("/")[1]?.toUpperCase() || "Desconhecido"}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 block">Criado em:</span>
                        <span className="font-bold text-gray-300">{previewFile.createdTime ? new Date(previewFile.createdTime).toLocaleDateString("pt-BR") : "N/D"}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-6 border-t border-gray-800 mt-6">
                  <a
                    href={`/api/drive/file/${previewFile.id}`}
                    download={previewFile.name}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-indigo-600/20 transition-all active:scale-95 text-center"
                  >
                    <Download size={16} />
                    <span>Baixar Arquivo</span>
                  </a>

                  {previewFile.webViewLink && (
                    <a
                      href={previewFile.webViewLink}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-4 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-2xl font-bold text-xs uppercase tracking-wider transition-all text-center border border-gray-700"
                    >
                      <ExternalLink size={16} />
                      <span>Abrir no Google Drive</span>
                    </a>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create Folder Modal */}
      <AnimatePresence>
        {isFolderModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsFolderModalOpen(false)}
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
                    <FolderPlus size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-gray-900 tracking-tight">Criar Nova Pasta</h3>
                    <p className="text-sm font-medium text-gray-500">Crie uma subpasta organizada dentro deste diretório.</p>
                  </div>
                </div>

                <form onSubmit={handleCreateFolder} className="space-y-6">
                  <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Nome da Pasta</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Exames de Rotina, Protocolos..."
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-150 rounded-2xl py-4 px-5 focus:outline-none focus:ring-2 focus:ring-indigo-600/10 focus:border-indigo-600 transition-all font-bold text-gray-800 placeholder:text-gray-405"
                      autoFocus
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      type="submit"
                      disabled={isCreatingFolder || !newFolderName.trim()}
                      className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black flex items-center justify-center gap-3 shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all disabled:opacity-50"
                    >
                      {isCreatingFolder ? (
                        <Loader2 className="animate-spin" size={20} />
                      ) : (
                        "Criar Pasta"
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsFolderModalOpen(false)}
                      className="w-full bg-white text-gray-500 py-3 rounded-2xl font-bold text-sm hover:bg-gray-50 transition-all"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
                        <div key={member.userEmail} className="flex items-center justify-between group-hover:bg-gray-50 p-1 rounded-xl transition-all">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gray-150 flex items-center justify-center overflow-hidden border border-gray-200">
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
                            className="p-1 px-2.5 text-[10px] font-black text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors uppercase tracking-wider"
                          >
                            Selecionar
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
