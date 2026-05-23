import React, { useState, useEffect, useRef } from "react";
import { 
  FolderOpen, 
  Plus, 
  Trash2, 
  Loader2, 
  Image as ImageIcon, 
  X, 
  Sparkles, 
  AlertCircle 
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useGroup } from "../contexts/GroupContext";
import { ai } from "../lib/gemini";
import { db } from "../lib/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import ReactMarkdown from "react-markdown";

interface PersonalImage {
  id: string;
  data: string;
  descricao: string;
  link: string;
  aiResposta: string;
}

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

export const PersonalDocuments: React.FC = () => {
  const { activeGroup, apiFetch, imageAnalysisPrompt } = useGroup();
  
  const [images, setImages] = useState<PersonalImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState<Record<string, boolean>>({});
  
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const [categories, setCategories] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load document categories from Firestore for quick suggestions
  useEffect(() => {
    if (!activeGroup?.id) return;
    const q = query(
      collection(db, "document_categories"),
      where("groupId", "==", activeGroup.id)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs
        .map(doc => doc.data().nome || doc.data().name)
        .filter(Boolean);
      if (list.length === 0) {
        setCategories(["Saúde", "Seguros", "Identificação", "Finanças", "Outros"]);
      } else {
        setCategories(list);
      }
    }, (error) => {
      console.warn("Error subscribing to document_categories:", error);
      setCategories(["Saúde", "Seguros", "Saúde e Exames", "Identificação", "Finanças", "Outros"]);
    });
    return () => unsubscribe();
  }, [activeGroup?.id]);

  // Fetch upload coordinates/patient-report
  const fetchImages = async () => {
    if (!activeGroup?.id) return;
    setIsLoading(true);
    try {
      const res = await apiFetch(`/api/app/patient-report/personal_${activeGroup.id}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.imagens) {
        setImages(data.imagens);
      }
    } catch (err: any) {
      console.error("Error fetching personal images:", err);
      setErrorMsg("Ocorreu um erro ao carregar os documentos.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchImages();
  }, [activeGroup?.id]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setErrorMsg(null);
      const reader = new FileReader();
      reader.onload = (event) => {
        setSelectedImage(event.target?.result as string);
      };
      reader.onerror = () => {
        setErrorMsg("Não foi possível ler o arquivo.");
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedImage) {
      setErrorMsg("Selecione uma imagem antes de enviar.");
      return;
    }
    if (!activeGroup?.id) return;

    setIsUploading(true);
    setErrorMsg(null);

    try {
      const mimeType = selectedImage.split(";")[0].split(":")[1];
      const base64Data = selectedImage.split(",")[1];
      const patientId = `personal_${activeGroup.id}`;

      const ext = mimeType.split("/")[1] || "jpg";
      const extResolved = ext === "quicktime" ? "mov" : ext;

      const res = await apiFetch("/api/app/upload-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: patientId,
          description: description || "Documento Pessoal",
          mimeType: mimeType,
          base64Data: base64Data,
          fileName: `Doc_Personal_${activeGroup.id}_${Date.now()}.${extResolved}`
        })
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // Clean form on success
      setSelectedImage(null);
      setDescription("");
      setShowUploadForm(false);
      
      // Refresh listing
      await fetchImages();
    } catch (err: any) {
      console.error("Upload error:", err);
      setErrorMsg(err.message || "Ocorreu um erro ao fazer upload da imagem.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveImage = async (fileId: string) => {
    if (!confirm("Tem certeza que deseja excluir esta imagem?")) return;
    
    try {
      const res = await apiFetch("/api/app/files/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      // Update state directly for instant feedback addition
      setImages(prev => prev.filter(img => img.id !== fileId));
    } catch (err: any) {
      alert("Erro ao remover arquivo: " + err.message);
    }
  };

  const handleAiAnalyze = async (fileId: string, url: string) => {
    setIsAnalyzing(prev => ({ ...prev, [fileId]: true }));
    try {
      // 1. Check Quota
      const qRes = await apiFetch("/api/ai/check-quota");
      const qData = await qRes.json();
      if (qData.remaining <= 0) throw new Error(qData.error || "Você atingiu sua cota de 10 análises diárias.");

      // 2. Fetch image base64
      const imgFetchRes = await fetch(url);
      const blob = await imgFetchRes.blob();
      const mimeType = blob.type;
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
        reader.readAsDataURL(blob);
      });

      // 3. Call Gemini
      const prompt = imageAnalysisPrompt || "Aja como um assistente pessoal inteligente. Analise esta imagem ou documento de forma clara, objetiva e útil, destacando os pontos principais, valores, dados de CNH/RG, exames de saúde se houver, ou detalhes de contas/seguros.";
      const result = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
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

      // Refresh list to pull updated analysis
      await fetchImages();
    } catch (err: any) {
      alert("Erro na IA: " + err.message);
    } finally {
      setIsAnalyzing(prev => ({ ...prev, [fileId]: false }));
    }
  };

  return (
    <div className="flex flex-col bg-slate-50 min-h-[80vh] pb-10">
      {/* Upper bar / Header */}
      <div className="bg-white border-b border-slate-100 shadow-sm px-6 py-5">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center border border-slate-100 text-slate-500 shadow-sm">
              <FolderOpen size={24} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 tracking-tight">Arquivos do Grupo</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Documentos & Imagens Pessoais</p>
            </div>
          </div>
          
          <button
            onClick={() => setShowUploadForm(!showUploadForm)}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-all active:scale-95 shadow-md shadow-blue-600/10 self-start sm:self-auto cursor-pointer"
          >
            {showUploadForm ? <X size={14} /> : <Plus size={14} />}
            <span>{showUploadForm ? "Cancelar" : "Anexar Imagem"}</span>
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto w-full px-6 pt-6">
        <AnimatePresence>
          {showUploadForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-8 overflow-hidden"
              id="upload-form-container"
            >
              <form onSubmit={handleUpload} className="bg-white rounded-2xl border border-slate-150 p-6 shadow-sm flex flex-col gap-5">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <span className="text-xs font-black text-slate-800 uppercase tracking-wider">Novo Anexo Pessoal</span>
                </div>

                {errorMsg && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 text-red-600 text-xs font-bold rounded-xl border border-red-100">
                    <AlertCircle size={16} />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-bold text-slate-400 ml-1 tracking-wider">Descrição / Título</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Ex: Contrato de aluguel, Holerite, Exame de Sangue"
                    className="w-full bg-slate-55 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none transition-all placeholder:text-slate-400"
                  />
                  
                  {/* Category Suggestion badgets */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {categories.map((cat, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setDescription(cat)}
                        className={`px-3 py-1 text-[10px] font-bold rounded-lg border transition-all ${
                          description === cat 
                            ? "bg-blue-50 border-blue-200 text-blue-600" 
                            : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-500"
                        }`}
                      >
                              </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-bold text-slate-400 ml-1 tracking-wider">Selecione o arquivo de imagem ou vídeo</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />

                  {selectedImage ? (
                    <div className="relative w-full aspect-video md:aspect-[3/1] rounded-xl overflow-hidden border border-slate-200 group bg-slate-900 flex items-center justify-center">
                      {isVideoUrl(selectedImage) ? (
                        <video src={selectedImage} controls className="h-full w-full object-contain" />
                      ) : (
                        <img src={selectedImage} alt="Preview" className="h-full w-full object-contain" />
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedImage(null)}
                        className="absolute top-3 right-3 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-all shadow-lg flex items-center gap-1.5 active:scale-95 text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm cursor-pointer"
                      >
                        <X size={12} strokeWidth={2.5} />
                        Remover
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full aspect-video md:aspect-[3/1] bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center text-slate-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50/50 transition-all gap-2 cursor-pointer"
                    >
                      <ImageIcon size={32} />
                      <span className="text-xs font-semibold">Toque para selecionar imagem ou vídeo</span>
                    </button>
                  )}
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={isUploading || !selectedImage}
                    className={`px-6 py-3 transition-all rounded-xl font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer ${
                      selectedImage && !isUploading
                        ? "bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/10 active:scale-95"
                        : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                    }`}
                  >
                    {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    <span>Enviar Documento</span>
                  </button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* List of images */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-350">
            <Loader2 size={40} className="animate-spin text-blue-500 mb-3" />
            <p className="text-xs font-black uppercase tracking-widest">Buscando documentos...</p>
          </div>
        ) : images.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center bg-white border border-slate-100 rounded-2xl p-8 shadow-sm">
            <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300 border border-slate-100 mb-4 shadow-inner">
              <ImageIcon size={24} />
            </div>
            <h4 className="text-base font-black text-slate-700 tracking-tight mb-1">Nenhum documento anexado</h4>
            <p className="text-xs text-slate-405 font-medium max-w-xs leading-relaxed mb-4">Anexe comprovantes, exames, fotos ou notas importantes usando o botão acima.</p>
            {!showUploadForm && (
              <button
                onClick={() => setShowUploadForm(true)}
                className="px-4 py-2 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 rounded-xl hover:bg-blue-100 transition-all cursor-pointer"
              >
                Anexar o Primeiro
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8" id="documents-grid">
            {images.map((img) => (
              <div 
                key={img.id}
                className="flex flex-col bg-white rounded-2xl border border-slate-150 shadow-sm overflow-hidden"
              >
                {/* Image panel */}
                <div className="relative aspect-video w-full bg-slate-900 border-b border-slate-100 group">
                  {isVideoUrl(img.link) ? (
                    <video 
                      src={img.link} 
                      controls
                      playsInline muted preload="metadata"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <img 
                      src={img.link} 
                      alt={img.descricao} 
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover transition-all duration-300 group-hover:scale-102"
                    />
                  )}
                  
                  {/* Delete button bar */}
                  <div className="absolute top-3 right-3 flex items-center gap-1.5">
                    <button
                      onClick={() => handleRemoveImage(img.id)}
                      className="p-2 bg-red-650 hover:bg-red-700 text-white rounded-xl shadow-md flex items-center justify-center active:scale-90 transition-all cursor-pointer backdrop-blur-sm"
                      title="Excluir documento"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  {/* Thumbnail Date Badge */}
                  <div className="absolute bottom-3 left-3 px-2.5 py-1 bg-black/55 text-white text-[9px] font-black uppercase tracking-widest rounded-lg backdrop-blur-sm">
                    {img.data}
                  </div>
                </div>

                {/* Info and Description */}
                <div className="p-5 flex flex-col gap-4">
                  <div className="flex flex-col">
                    <h4 className="text-sm font-black text-slate-800 tracking-tight leading-snug">
                      {img.descricao}
                    </h4>
                  </div>

                  {/* AI Analysis segment */}
                  {img.aiResposta ? (
                    <div className="bg-slate-50 rounded-xl border border-slate-100 p-4 flex flex-col gap-2">
                      <div className="flex items-center gap-1.5 text-[9px] font-black text-indigo-600 uppercase tracking-widest border-b border-indigo-100/50 pb-1.5">
                        <Sparkles size={11} className="text-indigo-500 fill-indigo-100" />
                        <span>Análise Inteligente (IA)</span>
                      </div>
                      <div className="text-xs text-slate-600 leading-relaxed font-medium prose prose-sm max-w-none">
                        <ReactMarkdown>{img.aiResposta}</ReactMarkdown>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-start">
                      <button
                        onClick={() => handleAiAnalyze(img.id, img.link)}
                        disabled={isAnalyzing[img.id]}
                        className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-650 font-black text-[9px] uppercase tracking-wider rounded-lg border border-indigo-100/45 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                      >
                        {isAnalyzing[img.id] ? (
                          <Loader2 size={11} className="animate-spin text-indigo-600" />
                        ) : (
                          <Sparkles size={11} className="text-indigo-500" />
                        )}
                        <span>{isAnalyzing[img.id] ? "Analisando..." : "Análise Inteligente"}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
