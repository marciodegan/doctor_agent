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
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useGroup } from "../contexts/GroupContext";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  iconLink?: string;
  thumbnailLink?: string;
  createdTime: string;
}

export const PersonalDocuments: React.FC = () => {
  const { activeGroup } = useGroup();
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const folderName = `DoctorPro_${activeGroup?.name || "Documents"}`;

  const fetchFiles = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(
        `/api/drive/list?folderName=${encodeURIComponent(folderName)}`,
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
    if (activeGroup) {
      fetchFiles();
    }
  }, [activeGroup]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = (reader.result as string).split(",")[1];

        const res = await fetch("/api/drive/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: file.name,
            mimeType: file.type,
            base64Data,
            folderName,
          }),
        });

        if (res.ok) {
          fetchFiles();
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

  const filteredFiles = files.filter((f) =>
    f.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="flex flex-col h-full bg-gray-50/50">
      <div className="bg-white border-b border-gray-100 p-6 sticky top-0 z-10">
        <div className="flex flex-col gap-6 max-w-5xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center border border-red-100">
                <ShieldCheck size={24} className="text-red-600" />
              </div>
              <div>
                <h1 className="text-xl font-black text-gray-900 tracking-tight">
                  Meus Documentos
                </h1>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5 mt-0.5">
                  <FolderOpen size={12} className="text-red-400" />
                  Google Drive / {folderName}
                </p>
              </div>
            </div>

            <button
              onClick={() => fileInputRef.current?.click()}
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
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>

          <div className="relative">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
              size={18}
            />
            <input
              type="text"
              placeholder="Buscar em meus arquivos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-gray-100 border-none rounded-2xl py-3.5 pl-12 pr-4 text-sm font-medium focus:ring-2 focus:ring-red-100 transition-all"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-5xl mx-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="animate-spin text-red-500" size={40} />
              <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">
                Sincronizando com Drive...
              </p>
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 grayscale opacity-40">
              <FolderOpen size={60} className="text-gray-300 mb-4" />
              <p className="text-lg font-black text-gray-400">
                Nenhum documento encontrado
              </p>
              <p className="text-sm font-medium text-gray-400 mt-1">
                Carregue fotos, apólices de seguro ou documentos da família.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <AnimatePresence>
                {filteredFiles.map((file) => (
                  <motion.div
                    key={file.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="group bg-white rounded-2xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-all relative overflow-hidden"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center border border-gray-100 shrink-0">
                        {getFileIcon(file.mimeType)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3
                          className="font-bold text-gray-900 text-[14px] leading-snug truncate mb-1"
                          title={file.name}
                        >
                          {file.name}
                        </h3>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                          {new Date(file.createdTime).toLocaleDateString()} •{" "}
                          {file.mimeType.split("/")[1]?.toUpperCase() || "FILE"}
                        </p>
                      </div>
                    </div>

                    {file.thumbnailLink && (
                      <div className="mt-4 aspect-video rounded-xl overflow-hidden border border-gray-100 bg-gray-50">
                        <img
                          src={file.thumbnailLink.replace("=s220", "=s600")}
                          alt={file.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      </div>
                    )}

                    <div className="mt-4 flex items-center gap-2">
                      <a
                        href={file.webViewLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 bg-gray-50 hover:bg-gray-100 text-gray-600 px-3 py-2 rounded-lg text-xs font-black flex items-center justify-center gap-2 transition-colors border border-gray-100"
                      >
                        <ExternalLink size={14} />
                        VER NO DRIVE
                      </a>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      <div className="p-6 bg-amber-50 border-t border-amber-100">
        <div className="max-w-5xl mx-auto flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <ShieldCheck size={20} className="text-amber-600" />
          </div>
          <div>
            <h4 className="text-sm font-black text-amber-900 leading-tight">
              Privacidade Garantida
            </h4>
            <p className="text-xs text-amber-800/70 font-medium mt-1">
              Seus documentos são salvos diretamente no **seu Google Drive**. A
              equipe do Doctor Pro não tem acesso aos seus arquivos pessoais
              fora deste ambiente.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
