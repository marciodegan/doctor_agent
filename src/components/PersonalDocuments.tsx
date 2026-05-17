import React, { useState, useEffect, useRef } from "react";
import {
  FileText,
  Upload,
  Plus,
  File,
  Image as ImageIcon,
  Trash2,
  ExternalLink,
  Loader2,
  FolderOpen,
  ShieldCheck,
  Search,
  ChevronLeft,
  FolderPlus,
  User,
  MoreVertical,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useGroup } from "../contexts/GroupContext";
import { useAuth } from "../hooks/useAuth";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  iconLink?: string;
  thumbnailLink?: string;
  createdTime: string;
}

interface Category {
  id: string;
  name: string;
}

export const PersonalDocuments: React.FC = () => {
  const { 
    activeGroup, 
    activeGroupMembers, 
    setIsManagementOpen,
    setManagementMode,
    setConfigsActiveTab,
    apiFetch
  } = useGroup();
  const { user } = useAuth();
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [showUploadOptions, setShowUploadOptions] = useState(false);
  const [uploadTargetMemberId, setUploadTargetMemberId] = useState<string>("");

  const [driveConfig, setDriveConfig] = useState<{ mainFolderId?: string; mainFolderName?: string } | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [setupFolderName, setSetupFolderName] = useState("");
  const [isSettingUp, setIsSettingUp] = useState(false);

  // Listen to categories
  useEffect(() => {
    if (!activeGroup) return;

    const q = query(
      collection(db, "document_categories"),
      where("groupId", "==", activeGroup.id),
      where("active", "==", true)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const cats = snapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name || doc.data().nome
      }));
      setCategories(cats);
    });

    return () => unsubscribe();
  }, [activeGroup?.id]);

  const isOwner = activeGroupMembers.find(m => m.userId === user?.uid)?.role === "owner";
  const isCreator = activeGroup?.createdBy === user?.uid;
  const isAdmin = isOwner || isCreator;

  // Fetch Drive Config
  useEffect(() => {
    if (!activeGroup) return;

    const fetchConfig = async () => {
      try {
        const res = await apiFetch("/api/drive/config");
        if (!res.ok) throw new Error("Failed to fetch drive config");
        const data = await res.json();
        setDriveConfig(data);
        if (!data.mainFolderId) {
          setShowSetup(true);
        } else {
          setShowSetup(false);
        }
      } catch (error) {
        console.error("Config fetch error:", error);
      }
    };
    fetchConfig();
  }, [activeGroup?.id]);

  const setupDrive = async () => {
    if (!setupFolderName.trim() || !activeGroup) return;
    try {
      setIsSettingUp(true);
      const res = await apiFetch("/api/drive/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          rootFolderName: setupFolderName,
          adminEmail: user?.email 
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Erro desconhecido no servidor");
      }
      
      setDriveConfig(data);
      setShowSetup(false);
    } catch (error: any) {
      console.error("Setup error:", error);
      const msg = error.message;
      if (msg.toLowerCase().includes("insufficient permissions") || msg.toLowerCase().includes("grant") || msg.toLowerCase().includes("permission")) {
        alert("Erro de Permissão: Você precisa re-conectar sua conta Google para autorizar o acesso ao Drive. \n\nDetalhes: " + msg);
      } else {
        alert("Erro ao configurar pasta: " + msg);
      }
    } finally {
      setIsSettingUp(false);
    }
  };

  const fetchFiles = async () => {
    if (!activeGroup || !driveConfig?.mainFolderId) return;
    try {
      setIsLoading(true);
      const res = await apiFetch(
        `/api/drive/list?folderName=${encodeURIComponent(selectedCategory || "")}&mainFolderId=${driveConfig.mainFolderId}`,
      );
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to fetch files");
      }
      const data = await res.json();
      setFiles(data);
    } catch (error) {
      console.error("Error fetching files:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (activeGroup && selectedCategory && driveConfig?.mainFolderId) {
      fetchFiles();
    } else if (activeGroup && !selectedCategory) {
      setFiles([]);
      setIsLoading(false);
    }
  }, [activeGroup, selectedCategory, driveConfig?.mainFolderId]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCategory || !driveConfig?.mainFolderId) return;

    try {
      setIsUploading(true);
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = (reader.result as string).split(",")[1];
        
        // Include member prefix in filename to "keep track of which user id is each one"
        const memberInfo = activeGroupMembers.find(m => m.userId === uploadTargetMemberId);
        const prefix = memberInfo ? `[${memberInfo.displayName || "Membro"}] ` : "";
        const finalFileName = `${prefix}${file.name}`;

        const res = await apiFetch("/api/drive/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: finalFileName,
            mimeType: file.type,
            base64Data,
            folderName: selectedCategory,
            mainFolderId: driveConfig.mainFolderId
          }),
        });

        if (res.ok) {
          fetchFiles();
          setShowUploadOptions(false);
          setUploadTargetMemberId("");
        } else {
          const error = await res.json();
          alert(`Erro no upload: ${error.error}`);
        }
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Upload error:", error);
      setIsUploading(false);
    }
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/"))
      return <ImageIcon className="text-sky-500" size={20} />;
    if (mimeType.includes("pdf"))
      return <FileText className="text-sky-600" size={20} />;
    return <File className="text-blue-500" size={20} />;
  };

  const filteredFiles = files.filter((f) => {
    const matchesSearch = f.name.toLowerCase().includes(searchTerm.toLowerCase());
    if (selectedMemberId === "all") return matchesSearch;
    
    const member = activeGroupMembers.find(m => m.userId === selectedMemberId);
    if (!member) return matchesSearch;
    
    return matchesSearch && f.name.includes(`[${member.displayName || "Membro"}]`);
  });

  const filteredCategories = categories.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-gray-50/50">
      <div className="bg-white border-b border-gray-100 p-6 sticky top-0 z-20">
        <div className="flex flex-col gap-6 max-w-5xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-sky-50 flex items-center justify-center border border-sky-100">
                <ShieldCheck size={24} className="text-sky-600" />
              </div>
              <div>
                <h3 className="text-xl font-black text-gray-900 tracking-tight">
                  Meus Documentos
                </h3>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5 mt-0.5">
                  <FolderOpen size={12} className="text-sky-400" />
                  {selectedCategory ? `${selectedCategory}` : "Categorias"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isAdmin && driveConfig?.mainFolderId && (
                <button
                  onClick={async () => {
                    try {
                      setIsLoading(true);
                      const res = await apiFetch("/api/drive/sync-sharing", { method: "POST" });
                      if (res.ok) {
                        const data = await res.json();
                        alert(`Acessos sincronizados com ${data.sharedWithCount} membros.`);
                      } else {
                        throw new Error("Falha ao sincronizar");
                      }
                    } catch (e: any) {
                      alert("Erro ao sincronizar: " + e.message);
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                  className="bg-white border border-gray-100 text-gray-500 hover:text-sky-600 hover:bg-sky-50 p-2.5 rounded-xl transition-all flex items-center gap-2 active:scale-95 shadow-sm"
                  title="Sincronizar Permissões com Membros"
                >
                  <ShieldCheck size={18} />
                  <span className="text-xs font-black uppercase tracking-tight hidden sm:block">SINCRONIZAR</span>
                </button>
              )}
              {!selectedCategory && isAdmin && (
                <button
                  onClick={() => {
                    setManagementMode("configs");
                    setConfigsActiveTab("document_categories");
                    setIsManagementOpen(true);
                  }}
                  className="bg-white border border-gray-100 text-gray-500 hover:text-sky-600 hover:bg-sky-50 p-2.5 rounded-xl transition-all flex items-center gap-2 active:scale-95 shadow-sm"
                  title="Configurar Categorias"
                >
                  <FolderPlus size={18} />
                  <span className="text-xs font-black uppercase tracking-tight hidden sm:block">CATEGORIAS</span>
                </button>
              )}
              {selectedCategory && (
                <div className="relative">
                  <button
                    onClick={() => setShowUploadOptions(!showUploadOptions)}
                    disabled={isUploading}
                    className="bg-sky-600 text-white px-5 py-2.5 rounded-xl text-sm font-black shadow-lg shadow-sky-100 hover:bg-sky-700 transition-all flex items-center gap-2 active:scale-95 disabled:bg-gray-300 disabled:shadow-none"
                  >
                    {isUploading ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <Upload size={18} />
                    )}
                    {isUploading ? "ENVIANDO..." : "NOVO DOCUMENTO"}
                  </button>

                  <AnimatePresence>
                    {showUploadOptions && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 z-30"
                      >
                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Vincular a qual membro?</h4>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                           <button 
                            onClick={() => { setUploadTargetMemberId(""); fileInputRef.current?.click(); }}
                            className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-gray-50 flex items-center gap-2 transition-colors border border-transparent hover:border-gray-100"
                          >
                            <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500">
                               <Plus size={14} />
                            </div>
                            <span className="text-sm font-bold text-gray-600">Geral (Sem vínculo)</span>
                          </button>
                          {activeGroupMembers.map(m => (
                            <button 
                              key={m.userId}
                              onClick={() => { setUploadTargetMemberId(m.userId); fileInputRef.current?.click(); }}
                              className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-sky-50/50 flex items-center gap-2 transition-colors group border border-transparent hover:border-sky-100"
                            >
                              {m.photoURL ? (
                                <img src={m.photoURL} className="w-8 h-8 rounded-lg object-cover" />
                              ) : (
                                <div className="w-8 h-8 rounded-lg bg-sky-50 flex items-center justify-center text-sky-400">
                                  <User size={14} />
                                </div>
                              )}
                              <span className="text-sm font-bold text-gray-700 group-hover:text-sky-700">{m.displayName || "Membro"}</span>
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex items-center gap-3 flex-1">
              {selectedCategory && (
                <button 
                  onClick={() => setSelectedCategory(null)}
                  className="p-3 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-2xl transition-all active:scale-95 shrink-0"
                >
                  <ChevronLeft size={20} />
                </button>
              )}
              <div className="relative flex-1">
                <Search
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                  size={18}
                />
                <input
                  type="text"
                  placeholder={selectedCategory ? `Buscar em ${selectedCategory}...` : "Buscar categorias..."}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-gray-100 border-none rounded-2xl py-3.5 pl-12 pr-4 text-sm font-medium focus:ring-2 focus:ring-sky-100 transition-all"
                />
              </div>
            </div>

            {selectedCategory && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-hide">
                 <button 
                  onClick={() => setSelectedMemberId("all")}
                  className={`px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                    selectedMemberId === "all" 
                      ? "bg-sky-600 text-white shadow-lg shadow-sky-100" 
                      : "bg-white border border-gray-100 text-gray-400 hover:bg-gray-50"
                  }`}
                >
                  TODOS
                </button>
                {activeGroupMembers.map(m => (
                  <button 
                    key={m.userId}
                    onClick={() => setSelectedMemberId(m.userId)}
                    className={`px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap flex items-center gap-2 ${
                      selectedMemberId === m.userId 
                        ? "bg-sky-600 text-white shadow-lg shadow-sky-100" 
                        : "bg-white border border-gray-100 text-gray-400 hover:bg-gray-50"
                    }`}
                  >
                    {m.photoURL ? (
                      <img src={m.photoURL} className={`w-4 h-4 rounded-full object-cover ${selectedMemberId === m.userId ? "border border-white/50" : ""}`} />
                    ) : (
                      <User size={12} />
                    )}
                    {(m.displayName || "Membro").split(" ")[0]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-5xl mx-auto">
          {showSetup ? (
            isAdmin ? (
              <div className="bg-white rounded-[40px] border border-sky-100 p-10 flex flex-col items-center text-center shadow-xl shadow-sky-100/20 max-w-lg mx-auto">
                <div className="w-20 h-20 rounded-3xl bg-sky-50 flex items-center justify-center text-sky-500 mb-6 shadow-inner">
                  <FolderPlus size={40} />
                </div>
                <h3 className="text-2xl font-black text-gray-900 tracking-tight mb-2">Configurar Pasta Compartilhada</h3>
                <p className="text-sm font-medium text-gray-500 mb-8 max-w-sm">
                  Como administrador, você deve configurar a pasta principal no seu <strong>Google Drive</strong>. 
                  Ela será compartilhada automaticamente com todos os membros do grupo.
                </p>
                
                <div className="w-full space-y-4">
                  <input 
                    type="text"
                    placeholder="Ex: Documentos Dr. Agent - Grupo X"
                    value={setupFolderName}
                    onChange={(e) => setSetupFolderName(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold focus:ring-4 focus:ring-sky-100 transition-all outline-none"
                  />
                  <button 
                    onClick={setupDrive}
                    disabled={!setupFolderName.trim() || isSettingUp}
                    className="w-full bg-sky-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-sky-100 hover:bg-sky-700 active:scale-95 transition-all disabled:bg-gray-200 disabled:shadow-none"
                  >
                    {isSettingUp ? (
                      <Loader2 size={18} className="animate-spin mx-auto" />
                    ) : (
                      "CRIAR E COMPARTILHAR"
                    )}
                  </button>

                  <div className="pt-4 border-t border-gray-50 mt-4 flex flex-col items-center gap-2">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                      Problemas com permissão?
                    </p>
                    <button 
                      onClick={() => window.location.href = "/api/auth/google"}
                      className="text-[10px] font-black text-sky-600 hover:text-sky-700 uppercase tracking-widest flex items-center gap-1.5 py-1 px-3 bg-sky-50 rounded-lg"
                    >
                      RE-CONECTAR GOOGLE
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-[40px] border border-gray-100 p-10 flex flex-col items-center text-center shadow-sm max-w-lg mx-auto">
                <div className="w-20 h-20 rounded-3xl bg-gray-50 flex items-center justify-center text-gray-400 mb-6">
                  <FolderOpen size={40} />
                </div>
                <h3 className="text-2xl font-black text-gray-900 tracking-tight mb-2">Pasta em Configuração</h3>
                <p className="text-sm font-medium text-gray-500 mb-8 max-w-sm">
                  O administrador do grupo ainda não configurou a pasta do Google Drive. 
                  Por favor, aguarde a configuração inicial para acessar os documentos.
                </p>
                <div className="flex flex-col items-center gap-2">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    VOCÊ É O ADMIN?
                  </p>
                  <p className="text-[10px] text-gray-400">
                    Se você for o dono do grupo, verifique seu status de login.
                  </p>
                </div>
              </div>
            )
          ) : !selectedCategory ? (
            // Category View
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {categories.length === 0 ? (
                <div className="col-span-full py-20 flex flex-col items-center justify-center opacity-40">
                  <FolderPlus size={60} className="text-gray-300 mb-4" />
                  <p className="text-lg font-black text-gray-400">Sem categorias definidas</p>
                  <p className="text-sm font-medium text-gray-400 mt-1 mt-center max-w-xs text-center mb-6">
                    Defina seus tipos de documentos (ex: Saúde, Seguros) nas configurações da equipe.
                  </p>
                  <button 
                    onClick={() => {
                      setManagementMode("configs");
                      setConfigsActiveTab("document_categories");
                      setIsManagementOpen(true);
                    }}
                    className="bg-sky-600 text-white px-6 py-3 rounded-2xl text-sm font-black shadow-xl shadow-sky-100 hover:bg-sky-700 transition-all flex items-center gap-2 active:scale-95"
                  >
                    <Plus size={18} strokeWidth={3} />
                    ADICIONAR CATEGORIA
                  </button>
                </div>
              ) : (
                filteredCategories.map((cat) => (
                  <motion.button
                    key={cat.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      setSelectedCategory(cat.name);
                      setSearchTerm("");
                    }}
                    className="flex flex-col items-center gap-4 p-6 bg-white border border-gray-100 rounded-[40px] hover:shadow-xl hover:shadow-sky-200/20 transition-all group overflow-hidden relative"
                  >
                    <div className="w-16 h-16 rounded-[24px] bg-sky-50 flex items-center justify-center text-sky-500 group-hover:scale-110 transition-transform shadow-inner">
                      <FolderOpen size={32} />
                    </div>
                    <span className="font-black text-gray-900 text-[11px] uppercase tracking-wider text-center px-2">
                      {cat.name}
                    </span>
                  </motion.button>
                ))
              )}
            </div>
          ) : (
            // Files View
            <>
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <Loader2 className="animate-spin text-sky-500" size={40} />
                  <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">
                    Buscando arquivos no Drive...
                  </p>
                </div>
              ) : filteredFiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 grayscale opacity-40">
                  <FolderOpen size={60} className="text-gray-300 mb-4" />
                  <p className="text-lg font-black text-gray-400">
                    Nenhum arquivo
                  </p>
                  <p className="text-sm font-medium text-gray-400 mt-1 max-w-xs text-center">
                    Toque em "Novo Documento" para carregar arquivos para <strong>{selectedCategory}</strong> {selectedMemberId !== "all" ? `vinculados a ${(activeGroupMembers.find(m => m.userId === selectedMemberId)?.displayName || "este membro")}` : ""}.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <AnimatePresence>
                    {filteredFiles.map((file) => {
                      // Try to extract member name from prefix [Name]
                      const memberMatch = file.name.match(/^\[(.*?)\] /);
                      const memberName = memberMatch ? memberMatch[1] : null;
                      const cleanName = memberMatch ? file.name.slice(memberMatch[0].length) : file.name;

                      return (
                        <motion.div
                          key={file.id}
                          layout
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="group bg-white rounded-[32px] border border-gray-100 p-5 shadow-sm hover:shadow-xl transition-all relative overflow-hidden"
                        >
                          <div className="flex items-start gap-4">
                            <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center border border-gray-100 shrink-0">
                              {getFileIcon(file.mimeType)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                {memberName && (
                                  <span className="px-1.5 py-0.5 bg-sky-50 text-sky-600 rounded text-[8px] font-black uppercase tracking-tighter shrink-0 border border-sky-100/50">
                                    {memberName}
                                  </span>
                                )}
                              </div>
                              <h3
                                className="font-bold text-gray-900 text-[14px] leading-tight truncate mb-1"
                                title={cleanName}
                              >
                                {cleanName}
                              </h3>
                              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                                {new Date(file.createdTime).toLocaleDateString()} •{" "}
                                {file.mimeType.split("/")[1]?.toUpperCase() || "FILE"}
                              </p>
                            </div>
                          </div>

                          {file.thumbnailLink && (
                            <div className="mt-5 aspect-video rounded-2xl overflow-hidden border border-gray-100 bg-gray-50 relative group/img">
                               <img
                                src={file.thumbnailLink.replace("=s220", "=s600")}
                                alt={file.name}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/10 transition-colors" />
                            </div>
                          )}

                          <div className="mt-5 flex items-center gap-2">
                            <a
                              href={file.webViewLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1 bg-gray-50 hover:bg-sky-50 text-gray-600 hover:text-sky-700 px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all border border-gray-100 hover:border-sky-100"
                            >
                              <ExternalLink size={14} />
                              ABRIR NO DRIVE
                            </a>
                            <button className="p-3 bg-gray-50 hover:bg-gray-100 text-gray-400 rounded-2xl transition-all">
                               <MoreVertical size={16} />
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="p-6 bg-sky-50/50 border-t border-sky-100">
        <div className="max-w-5xl mx-auto flex items-start gap-4">
          <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center shrink-0 shadow-sm">
            <ShieldCheck size={20} className="text-sky-600" />
          </div>
          <div>
            <h4 className="text-[11px] font-black text-sky-900 leading-tight uppercase tracking-widest">
              Ambiente Seguro e Compartilhado
            </h4>
            <p className="text-[11px] text-sky-800/60 font-medium mt-1 leading-relaxed">
              Todos os documentos do grupo são salvos diretamente no **Google Drive** do administrador e compartilhados com a equipe. 
              Garantimos privacidade e controle total sobre os dados.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};