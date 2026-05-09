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
    setConfigsActiveTab
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

  const baseFolderName = `DoctorPro_${activeGroup?.name || "Documents"}`;
  const currentFolderName = selectedCategory 
    ? `${baseFolderName}_${selectedCategory}` 
    : baseFolderName;

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

  const fetchFiles = async () => {
    if (!activeGroup) return;
    try {
      setIsLoading(true);
      const res = await fetch(
        `/api/drive/list?folderName=${encodeURIComponent(currentFolderName)}`,
      );
      if (!res.ok) throw new Error("Failed to fetch files");
      const data = await res.json();
      setFiles(data);
    } catch (error) {
      console.error("Error fetching files:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (activeGroup && selectedCategory) {
      fetchFiles();
    } else if (activeGroup && !selectedCategory) {
      setFiles([]);
      setIsLoading(false);
    }
  }, [activeGroup, selectedCategory]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCategory) return;

    try {
      setIsUploading(true);
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = (reader.result as string).split(",")[1];
        
        // Include member prefix in filename to "keep track of which user id is each one"
        const memberInfo = activeGroupMembers.find(m => m.userId === uploadTargetMemberId);
        const prefix = memberInfo ? `[${memberInfo.displayName || "Membro"}] ` : "";
        const finalFileName = `${prefix}${file.name}`;

        const res = await fetch("/api/drive/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: finalFileName,
            mimeType: file.type,
            base64Data,
            folderName: currentFolderName,
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
      return <ImageIcon className="text-pink-500" size={20} />;
    if (mimeType.includes("pdf"))
      return <FileText className="text-red-500" size={20} />;
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
              <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center border border-red-100">
                <ShieldCheck size={24} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-xl font-black text-gray-900 tracking-tight">
                  Meus Documentos
                </h3>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5 mt-0.5">
                  <FolderOpen size={12} className="text-red-400" />
                  {selectedCategory ? `${selectedCategory}` : "Categorias"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!selectedCategory && isOwner && (
                <button
                  onClick={() => {
                    setManagementMode("configs");
                    setConfigsActiveTab("document_categories");
                    setIsManagementOpen(true);
                  }}
                  className="bg-white border border-gray-100 text-gray-500 hover:text-red-600 hover:bg-red-50 p-2.5 rounded-xl transition-all flex items-center gap-2 active:scale-95 shadow-sm"
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
                    className="bg-red-600 text-white px-5 py-2.5 rounded-xl text-sm font-black shadow-lg shadow-red-100 hover:bg-red-700 transition-all flex items-center gap-2 active:scale-95 disabled:bg-gray-300 disabled:shadow-none"
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
                              className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-red-50/50 flex items-center gap-2 transition-colors group border border-transparent hover:border-red-100"
                            >
                              {m.photoURL ? (
                                <img src={m.photoURL} className="w-8 h-8 rounded-lg object-cover" />
                              ) : (
                                <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center text-red-400">
                                  <User size={14} />
                                </div>
                              )}
                              <span className="text-sm font-bold text-gray-700 group-hover:text-red-700">{m.displayName || "Membro"}</span>
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
                  className="w-full bg-gray-100 border-none rounded-2xl py-3.5 pl-12 pr-4 text-sm font-medium focus:ring-2 focus:ring-red-100 transition-all"
                />
              </div>
            </div>

            {selectedCategory && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-hide">
                 <button 
                  onClick={() => setSelectedMemberId("all")}
                  className={`px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                    selectedMemberId === "all" 
                      ? "bg-red-600 text-white shadow-lg shadow-red-100" 
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
                        ? "bg-red-600 text-white shadow-lg shadow-red-100" 
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
          {!selectedCategory ? (
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
                    className="bg-red-600 text-white px-6 py-3 rounded-2xl text-sm font-black shadow-xl shadow-red-100 hover:bg-red-700 transition-all flex items-center gap-2 active:scale-95"
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
                    className="flex flex-col items-center gap-4 p-6 bg-white border border-gray-100 rounded-[40px] hover:shadow-xl hover:shadow-red-200/20 transition-all group overflow-hidden relative"
                  >
                    <div className="absolute top-0 right-0 p-4 opacity-5">
                      <FolderOpen size={80} />
                    </div>
                    <div className="w-16 h-16 rounded-[24px] bg-red-50 flex items-center justify-center text-red-500 group-hover:scale-110 transition-transform shadow-inner">
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
                  <Loader2 className="animate-spin text-red-500" size={40} />
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
                                  <span className="px-1.5 py-0.5 bg-red-50 text-red-600 rounded text-[8px] font-black uppercase tracking-tighter shrink-0 border border-red-100/50">
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
                              className="flex-1 bg-gray-50 hover:bg-red-50 text-gray-600 hover:text-red-700 px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all border border-gray-100 hover:border-red-100"
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

      <div className="p-6 bg-red-50/50 border-t border-red-100">
        <div className="max-w-5xl mx-auto flex items-start gap-4">
          <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center shrink-0 shadow-sm">
            <ShieldCheck size={20} className="text-red-600" />
          </div>
          <div>
            <h4 className="text-[11px] font-black text-red-900 leading-tight uppercase tracking-widest">
              Ambiente Seguro e Privado
            </h4>
            <p className="text-[11px] text-red-800/60 font-medium mt-1 leading-relaxed">
              Todos os seus documentos são criptografados e salvos diretamente no **Google Drive** do administrador. 
              Sua privacidade e soberania de dados são nossa prioridade.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};


