import React, { useState, useEffect } from "react";
import { 
  Building2, 
  Stethoscope, 
  Activity, 
  Heart, 
  Zap,
  Plus,
  Trash2,
  Edit2,
  X,
  Loader2,
  ChevronRight,
  ArrowLeft,
  Users,
  Settings,
  Camera,
  Upload,
  FolderOpen,
  Image,
  Lock,
  Power,
  PowerOff,
  AlertCircle,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  setDoc,
  serverTimestamp,
  orderBy,
  getDocs
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useGroup } from "../contexts/GroupContext";
import { useAuth } from "../hooks/useAuth";
import { motion, AnimatePresence } from "motion/react";
import { OperationType, handleFirestoreError } from "../lib/firestoreUtils";
import { GroupIconBlue } from "./icons/GroupIcon";
import { CsvImportView } from "./CsvImportView";
import { PatientBatchRemovalView } from "./PatientBatchRemovalView";

type ConfigType = "hospitals" | "patient_statuses" | "procedureOptions" | "surgery_types" | "affinity" | "members" | "general" | "document_categories" | "image_types" | "import_csv" | "manage_patients";

interface ConfigItem {
  id: string;
  name: string;
  nome?: string; 
  groupId: string;
  active?: boolean;
}

export function GroupConfigs() {
  const { 
    activeGroup, 
    activeGroupMembers,
    companyName, 
    whatsappNumber, 
    imageAnalysisPrompt, 
    updateSettings, 
    toggleGroupStatus,
    terminateGroup,
    handleBackup,
    configsActiveTab: activeTab,
    setConfigsActiveTab: setActiveTab,
    apiFetch
  } = useGroup();
  const { user } = useAuth();
  
  const userRole = activeGroupMembers.find(m => m.userId === user?.uid)?.role;
  const isCreator = activeGroup?.createdBy === user?.uid;
  const isAdmin = userRole === "owner" || isCreator;
  
  const [items, setItems] = useState<ConfigItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [editingItem, setEditingItem] = useState<ConfigItem | null>(null);

  // Local settings for the general tab
  const [localCompanyName, setLocalCompanyName] = useState(companyName);
  const [localImageAnalysisPrompt, setLocalImageAnalysisPrompt] = useState(
    imageAnalysisPrompt,
  );
  const [localGroupPhotoURL, setLocalGroupPhotoURL] = useState(
    activeGroup?.photoURL || "",
  );
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalCompanyName(companyName);
    setLocalImageAnalysisPrompt(imageAnalysisPrompt);
    setLocalGroupPhotoURL(activeGroup?.photoURL || "");
  }, [companyName, imageAnalysisPrompt, activeGroup?.photoURL]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingPhoto(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = (reader.result as string).split(",")[1];
        const res = await fetch("/api/storage/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `group_${activeGroup?.id}_${Date.now()}.jpg`,
            mimeType: file.type,
            base64Data,
          }),
        });
        const data = await res.json();
        if (data.webViewLink) {
          setLocalGroupPhotoURL(data.webViewLink);
          // Auto-save the new photo URL to the group settings
          await updateSettings(
            localCompanyName,
            whatsappNumber,
            localImageAnalysisPrompt,
            data.webViewLink,
          );
        } else if (data.error) {
          const errorMessage = data.error + (data.suggestion ? ". Sugestão: " + data.suggestion : "");
          throw new Error(errorMessage + (data.details ? ": " + JSON.stringify(data.details) : ""));
        }
        setIsUploadingPhoto(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error(err);
      alert("Erro no upload da foto: " + err.message);
      setIsUploadingPhoto(false);
    }
  };

  const onUpdateSettings = async () => {
    setIsUpdatingSettings(true);
    try {
      await updateSettings(
        localCompanyName,
        whatsappNumber,
        localImageAnalysisPrompt,
        localGroupPhotoURL,
      );
      alert("Configurações atualizadas!");
    } catch (err) {
      console.error(err);
      alert("Erro ao atualizar configurações");
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  const handleUseDefaultIcon = async () => {
    // Generate a simple SVG data URI for the icon
    const svgString = `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" rx="25" fill="#2563EB" /><path d="M35 55C35 49.4772 39.4772 45 45 45C50.5228 45 55 49.4772 55 55V60H35V55Z" fill="white" /><circle cx="45" cy="35" r="7" fill="white" /><path d="M55 58C55 53.5817 58.5817 50 63 50C67.4183 50 71 53.5817 71 58V62H55V58Z" fill="white" style="opacity: 0.8" /><circle cx="63" cy="42" r="6" fill="white" style="opacity: 0.8" /></svg>`;
    const dataUri = `data:image/svg+xml;base64,${btoa(svgString)}`;
    
    setLocalGroupPhotoURL(dataUri);
    try {
      await updateSettings(
        localCompanyName,
        whatsappNumber,
        localImageAnalysisPrompt,
        dataUri,
      );
      alert("Ícone padrão aplicado!");
    } catch (err) {
      console.error("Failed to set default icon", err);
      alert("Erro ao aplicar ícone padrão");
    }
  };


  const handleToggleGroupActivation = async () => {
    if (!activeGroup) return;
    const isCurrentlyActive = activeGroup.status === "active";
    const isActivating = !isCurrentlyActive;
    
    const confirmMsg = isActivating 
      ? "Deseja reativar este grupo?" 
      : "Deseja DESATIVAR este grupo? Ele será movido para o final da lista e membros não poderão realizar ações até que seja reativado.";
    
    if (!confirm(confirmMsg)) return;

    try {
      setIsUpdatingSettings(true);
      await toggleGroupStatus(activeGroup.id, isActivating);
    } catch (err: any) {
      alert("Erro: " + err.message);
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  const handleTerminateGroup = async () => {
    if (!activeGroup) return;
    
    const confirmMsg = "ATENÇÃO: Deseja REMOVER este grupo permanentemente da sua lista e da lista de todos os membros? Esta ação não pode ser desfeita e o grupo não será mais acessível.";
    
    if (!confirm(confirmMsg)) return;

    try {
      setIsUpdatingSettings(true);
      await terminateGroup(activeGroup.id);
      alert("Grupo removido com sucesso!");
    } catch (err: any) {
      alert("Erro: " + err.message);
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  useEffect(() => {
    if (!activeTab || !activeGroup || activeTab === "general") {
      setItems([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    const colRef = collection(db, activeTab);
    const q = query(colRef, where("groupId", "==", activeGroup.id));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ConfigItem[];
      
      // Sort
      if (activeTab === "patient_statuses") {
        fetched.sort((a: any, b: any) => {
          const orderA = typeof a.sortOrder === "number" ? a.sortOrder : 999999;
          const orderB = typeof b.sortOrder === "number" ? b.sortOrder : 999999;
          if (orderA !== orderB) return orderA - orderB;
          const nameA = (a.name || a.nome || "").toLowerCase();
          const nameB = (b.name || b.nome || "").toLowerCase();
          return nameA.localeCompare(nameB);
        });
      } else {
        fetched.sort((a, b) => {
          const nameA = (a.name || a.nome || "").toLowerCase();
          const nameB = (b.name || b.nome || "").toLowerCase();
          return nameA.localeCompare(nameB);
        });
      }

      setItems(fetched);
      setIsLoading(false);
    }, (err) => {
      console.error("onSnapshot error:", err);
      setIsLoading(false);
      setError("Permissão negada ou falha na conexão.");
      // handleFirestoreError(err, OperationType.LIST, activeTab); // Don't throw here to avoid infinite spinner
    });

    return () => unsubscribe();
  }, [activeTab, activeGroup?.id]);

  const handleInitializeDefaults = async (forceType?: string) => {
    if (!activeGroup) return;
    
    const targetType = forceType || activeTab;
    if (!targetType) return;

    const defaults: Record<string, string[]> = {
      patient_statuses: ["Internado", "Pré-Operatório", "Em Cirurgia", "Recuperação", "Alta"],
      procedureOptions: ["Apendicectomia", "Colecistectomia", "Hernioplastia", "Histerectomia", "Artroscopia"],
      surgery_types: ["URGENTE", "ELETIVA"],
      affinity: ["Filho(a)", "Irmão/Irmã", "Pai/Mãe", "Cônjuge", "Avô/Avó", "Amigo(a)"],
      hospitals: ["Hospital Municipal", "Hospital Santa Maria", "Santa Casa"],
      document_categories: ["Saúde", "Seguros", "Imóveis", "Filhos", "Educação", "Financeiro"],
      image_types: ["raio x do tórax", "resposta de parecer", "evolução de alta", "descrição cirúrgica", "foto de ferida", "laudo de aih"]
    };

    const categoriesToInit = forceType === "all" ? Object.keys(defaults) : [targetType];
    
    setIsLoading(true);
    setError(null);
    try {
      for (const cat of categoriesToInit) {
        const itemsToCreate = defaults[cat] || [];
        if (itemsToCreate.length === 0) continue;

        // Check if cat already has items for this group to avoid duplicates if accidentally clicked
        const colRef = collection(db, cat);
        const q = query(colRef, where("groupId", "==", activeGroup.id));
        const existingSnap = await getDocs(q);
        
        // If not force type "all", or if empty, we create
        if (existingSnap.empty) {
          for (const itemName of itemsToCreate) {
            const data: any = {
               groupId: activeGroup.id,
               active: true,
               createdAt: serverTimestamp()
            };
            if (cat === "procedureOptions") data.nome = itemName;
            else data.name = itemName;
            
            await addDoc(collection(db, cat), data);
          }
        }
      }
      if (forceType === "all") {
        alert("Todos os padrões carregados com sucesso!");
      }
    } catch (e: any) {
      console.error("Initialize defaults error:", e);
      setError("Erro ao carregar padrões. Verifique suas permissões.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim() || !activeGroup || !activeTab) return;

    setIsLoading(true);
    setError(null);
    try {
      const data: any = {
        groupId: activeGroup.id,
        active: true,
      };

      // Handle the fact that some collections use 'name' and others use 'nome'
      if (activeTab === "procedureOptions") {
        data.nome = newItemName.trim();
      } else {
        data.name = newItemName.trim();
      }

      if (editingItem) {
        await setDoc(doc(db, activeTab, editingItem.id), data, { merge: true });
      } else {
        data.createdAt = serverTimestamp();
        await addDoc(collection(db, activeTab), data);
      }

      setNewItemName("");
      setEditingItem(null);
      setIsAdding(false);
    } catch (err: any) {
      console.error("Save error:", err);
      setError("Não foi possível salvar o registro.");
    } finally {
      setIsLoading(false);
    }
  };

  const checkUsage = async (item: ConfigItem) => {
    if (!activeTab || !activeGroup) return false;
    
    try {
      if (activeTab === "hospitals") {
        const q = query(collection(db, "patients"), where("hospitalId", "==", item.id));
        const snap = await getDocs(q);
        return !snap.empty;
      }
      if (activeTab === "patient_statuses") {
        const q = query(collection(db, "patients"), where("statusId", "==", item.id));
        const snap = await getDocs(q);
        return !snap.empty;
      }
      if (activeTab === "procedureOptions") {
        const q = query(collection(db, "groups", activeGroup.id, "calendario"), where("evento", "==", item.nome || item.name));
        const snap = await getDocs(q);
        return !snap.empty;
      }
      if (activeTab === "surgery_types") {
        const q = query(collection(db, "groups", activeGroup.id, "calendario"), where("tipo", "==", item.name || item.nome));
        const snap = await getDocs(q);
        return !snap.empty;
      }
      if (activeTab === "affinity") {
        const q = query(collection(db, "patients_contacts"), where("relationship", "==", item.name || item.nome));
        const snap = await getDocs(q);
        return !snap.empty;
      }
    } catch (e) {
      console.error("Usage check failed", e);
    }
    return false;
  };

  const handleDelete = async (item: ConfigItem) => {
    if (!activeTab || !confirm(`Tem certeza que deseja remover "${item.name || item.nome}"?`)) return;
    
    setIsLoading(true);
    try {
      if (activeTab === "patient_statuses") {
        const res = await apiFetch("/api/app/statuses/remove", {
          method: "POST",
          body: JSON.stringify({ statusId: item.id })
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP error ${res.status}`);
        }
        return;
      }

      const isUsed = await checkUsage(item);
      // For surgery_types, always soft delete to avoid breaking historical data
      if (isUsed || activeTab === "surgery_types") {
        // Soft delete (deactivate)
        await setDoc(doc(db, activeTab, item.id), { 
          active: false,
          status: "removed",
          updatedAt: serverTimestamp() 
        }, { merge: true });
        
        const msg = activeTab === "surgery_types" 
          ? "Este tipo de cirurgia foi marcado como removido para preservar dados históricos. Ele não aparecerá mais em novos registros."
          : "Este item está sendo usado em registros existentes. Ele foi desativado e não aparecerá mais em novos formulários, mas os registros antigos continuarão ativos.";
        alert(msg);
      } else {
        // Hard delete
        await deleteDoc(doc(db, activeTab, item.id));
      }
    } catch (error: any) {
      console.error("Delete error:", error);
      setError(error.message || "Não foi possível remover o item.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleActive = async (item: ConfigItem) => {
    if (!activeTab) return;
    try {
      await setDoc(doc(db, activeTab, item.id), { 
        active: !item.active,
        status: !item.active ? "active" : "removed",
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, activeTab);
    }
  };

  const handleMoveStatus = async (item: ConfigItem, direction: "up" | "down") => {
    if (!activeGroup || activeTab !== "patient_statuses") return;
    
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/app/statuses/reorder", {
        method: "POST",
        body: JSON.stringify({ statusId: item.id, direction })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error ${res.status}`);
      }
    } catch (err: any) {
      console.error("Move error:", err);
      setError(err.message || "Não foi possível alterar a ordem.");
    } finally {
      setIsLoading(false);
    }
  };

  const menuItems = [
    { id: "hospitals", label: "Hospitais", icon: <Building2 size={24} />, color: "text-blue-600", bg: "bg-blue-50", description: "Gerenciar unidades de atendimento", hidden: activeGroup?.groupType === "personal" },
    { id: "procedureOptions", label: "Procedimentos", icon: <Stethoscope size={24} />, color: "text-purple-600", bg: "bg-purple-50", description: "Configurar tipos de procedimentos", hidden: activeGroup?.groupType === "personal" },
    { id: "patient_statuses", label: "Status de Paciente", icon: <Activity size={24} />, color: "text-emerald-600", bg: "bg-emerald-50", description: "Etapas do fluxo de atendimento", hidden: activeGroup?.groupType === "personal" },
    { id: "surgery_types", label: "Tipos de Cirurgia", icon: <Zap size={24} />, color: "text-amber-600", bg: "bg-amber-50", description: "Categorias e prioridades", hidden: activeGroup?.groupType === "personal" },
    { id: "image_types", label: "Tipos de Imagem", icon: <Image size={24} />, color: "text-blue-600", bg: "bg-blue-50", description: "Categorias de anexos de imagem" },
    { id: "document_categories", label: "Categorias de Documento", icon: <FolderOpen size={24} />, color: "text-red-600", bg: "bg-red-50", description: "Organize seus documentos pessoais", hidden: activeGroup?.groupType !== "personal" },
    { id: "affinity", label: activeGroup?.groupType === "personal" ? "Parentesco" : "Afinidades", icon: <Heart size={24} />, color: "text-pink-600", bg: "bg-pink-50", description: "Graus de parentesco" },
    { id: "import_csv", label: "Importar pacientes via CSV", icon: <Upload size={24} />, color: "text-blue-600", bg: "bg-blue-50", description: "Importar e sincronizar pacientes via arquivo CSV" },
    { id: "manage_patients", label: "Gerenciar / Remover Pacientes", icon: <Users size={24} />, color: "text-red-600", bg: "bg-red-50", description: "Selecionar e remover vários pacientes em poucos cliques" },
    { id: "general", label: "Ajustes Gerais", icon: <Settings size={24} />, color: "text-indigo-600", bg: "bg-indigo-50", description: "Dados gerais e WhatsApp" },
  ].filter(item => !item.hidden);

  if (activeTab === "import_csv") {
    return <CsvImportView onBack={() => setActiveTab(null)} />;
  }

  if (activeTab === "manage_patients") {
    return <PatientBatchRemovalView onBack={() => setActiveTab(null)} />;
  }

  if (activeTab === "general") {
    return (
      <div className="flex flex-col h-full bg-white">
        <div className="flex items-center gap-4 mb-8">
          <button 
            onClick={() => setActiveTab(null)} 
            className="p-2 hover:bg-gray-100 rounded-xl transition-all text-gray-500"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-3">
            <div className={`p-2.5 bg-indigo-50 text-indigo-600 rounded-xl`}>
              <Settings size={24} />
            </div>
            <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Ajustes Gerais</h3>
          </div>
        </div>

        <div className="space-y-6 max-w-lg">
            <div className="flex flex-col items-center gap-3">
              <div className="relative group">
                <div className="w-24 h-24 rounded-[32px] bg-indigo-50 border-2 border-indigo-100 flex items-center justify-center overflow-hidden shadow-xl shadow-indigo-100/50">
                  {localGroupPhotoURL ? (
                    <img
                      src={localGroupPhotoURL}
                      alt="Group"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Camera size={32} className="text-indigo-300" />
                  )}
                  {isUploadingPhoto && (
                    <div className="absolute inset-0 bg-indigo-900/40 flex items-center justify-center">
                      <Loader2 size={24} className="animate-spin text-white" />
                    </div>
                  )}
                </div>
                <button
                  onClick={() => isAdmin && fileInputRef.current?.click()}
                  disabled={!isAdmin}
                  className={`absolute -bottom-2 -right-2 bg-white border border-gray-100 p-2.5 rounded-2xl text-indigo-600 shadow-xl transition-all ${
                    isAdmin ? "hover:scale-110 active:scale-95" : "opacity-50 cursor-not-allowed"
                  }`}
                  title={isAdmin ? "Upload Foto" : "Apenas o admin pode alterar a foto"}
                >
                  <Upload size={14} />
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                />
              </div>
              
              {isAdmin && (
                <button
                  onClick={handleUseDefaultIcon}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition-all active:scale-95"
                >
                  <Image size={12} />
                  <span className="text-[10px] font-black uppercase tracking-tight">Usar Ícone Azul</span>
                </button>
              )}
            </div>

          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">
              Nome da Empresa / Profissional
            </label>
            <input 
              type="text" 
              value={localCompanyName} 
              onChange={(e) => setLocalCompanyName(e.target.value)}
              placeholder="Ex: Dr. Silva ou Clínica Pro"
              disabled={!isAdmin}
              className={`w-full bg-gray-50 border border-gray-100 px-5 py-4 rounded-2xl text-sm font-bold outline-none transition-all ${
                isAdmin ? "focus:ring-4 focus:ring-indigo-100" : "opacity-70 cursor-not-allowed"
              }`}
            />
          </div>



          <div className="flex flex-col gap-3 pt-4">
            {!isAdmin && (
              <div className="bg-amber-50 border border-amber-100 px-4 py-3 rounded-2xl flex items-center gap-2 text-amber-700">
                <Lock size={14} className="shrink-0" />
                <span className="text-[10px] font-bold uppercase tracking-tight">Estas configurações podem ser alteradas apenas pelo Administrador.</span>
              </div>
            )}
            <div className="flex gap-3">
              <button 
                onClick={onUpdateSettings}
                disabled={isUpdatingSettings || !isAdmin}
                className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-xs hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isUpdatingSettings ? <Loader2 size={16} className="animate-spin" /> : "SALVAR ALTERAÇÕES"}
              </button>
            </div>

            {isAdmin && (
              <div className="pt-6 border-t border-gray-100 mt-2">
                <h4 className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-4 ml-1">Zona de Perigo</h4>
                <button
                  type="button"
                  onClick={handleToggleGroupActivation}
                  disabled={isUpdatingSettings}
                  className={`w-full py-4 rounded-2xl font-black text-xs transition-all flex items-center justify-center gap-2 shadow-xl ${
                    activeGroup?.status === "active"
                      ? "bg-amber-50 text-amber-600 hover:bg-amber-100 shadow-amber-50"
                      : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100 shadow-emerald-50"
                  }`}
                >
                  {activeGroup?.status === "active" ? <PowerOff size={16} /> : <Power size={16} />}
                  {activeGroup?.status === "active" ? "DESATIVAR GRUPO" : "REATIVAR GRUPO"}
                </button>
                
                {activeGroup?.status === "removed" && isCreator && (
                  <button
                    type="button"
                    onClick={handleTerminateGroup}
                    disabled={isUpdatingSettings}
                    className="w-full py-4 rounded-2xl font-black text-xs transition-all flex items-center justify-center gap-2 shadow-xl bg-red-50 text-red-600 hover:bg-red-100 shadow-red-50 mt-3"
                  >
                    <Trash2 size={16} />
                    REMOVER GRUPO DEFINITIVAMENTE
                  </button>
                )}
                
                <p className="text-[9px] text-gray-400 mt-3 text-center px-4 leading-normal">
                  {activeGroup?.status === "active" 
                    ? "Desativar o grupo impedirá qualquer tipo de trabalho ou modificação por parte dos membros."
                    : isCreator 
                      ? "O grupo está desativado (estado: removed). Você pode reativá-lo ou removê-lo definitivamente."
                      : "O grupo está desativado. Somente o criador pode removê-lo definitivamente."}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === "members") {
    return (
      <div className="flex flex-col h-full bg-white">
        <div className="flex items-center gap-4 mb-4">
          <button 
            onClick={() => setActiveTab(null)} 
            className="p-2 hover:bg-gray-100 rounded-xl transition-all text-gray-500"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-3">
            <div className={`p-2.5 bg-gray-100 text-gray-600 rounded-xl`}>
              <Users size={24} />
            </div>
            <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Equipe</h3>
          </div>
        </div>
        {/* We will render the member management part here by moving it from GroupSelector or calling a callback */}
        <div id="members-management-container">
           {/* This is a placeholder, I will integrate the logic in GroupSelector */}
        </div>
      </div>
    );
  }

  if (activeTab) {
    const currentTabInfo = menuItems.find(m => m.id === activeTab);
    return (
      <div className="flex flex-col bg-white">
        {/* Sub-Header inside Configs */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => {
                setActiveTab(null);
                setIsAdding(false);
                setEditingItem(null);
                setNewItemName("");
                setError(null);
              }} 
              className="p-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all text-gray-500 active:scale-95 shrink-0"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-3">
              <div className={`p-2.5 ${currentTabInfo?.bg} ${currentTabInfo?.color} rounded-xl shadow-inner shrink-0`}>
                {currentTabInfo?.icon}
              </div>
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-tight truncate">{currentTabInfo?.label}</h3>
            </div>
          </div>
          
          <button 
            onClick={() => {
              if (!isAdmin) return;
              setIsAdding(!isAdding);
              setEditingItem(null);
              setNewItemName("");
              setError(null);
            }}
            disabled={!isAdmin}
            className={`sm:ml-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 ${
              isAdding 
                ? "bg-gray-100 text-gray-500 shadow-none" 
                : isAdmin 
                  ? "bg-blue-600 text-white shadow-blue-100 hover:bg-blue-700"
                  : "bg-gray-200 text-gray-400 cursor-not-allowed opacity-50 shadow-none"
            }`}
          >
            {isAdding ? "CANCELAR" : (
              <>
                <Plus size={14} />
                NOVO REGISTRO
              </>
            )}
          </button>
        </div>

        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600"
          >
             <X size={16} />
             <span className="text-[10px] font-black uppercase tracking-widest">{error}</span>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {(isAdding || editingItem) && (
            <motion.form 
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              onSubmit={handleSave}
              className="bg-gray-50/80 p-5 rounded-[32px] border border-gray-100 mb-6 space-y-4 shadow-inner"
            >
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-2">
                  {editingItem ? "Editando Registro" : "Adicionar Novo"}
                </h4>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input 
                  type="text" 
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  placeholder={`Nome do(a) ${currentTabInfo?.label}...`}
                  className="flex-1 bg-white border border-gray-200 px-5 py-4 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-blue-100 outline-none transition-all shadow-sm"
                  autoFocus
                  required
                  disabled={isLoading}
                />
                <button 
                  type="submit"
                  disabled={!newItemName.trim() || isLoading}
                  className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black text-[10px] hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 uppercase tracking-widest disabled:opacity-50 disabled:shadow-none active:scale-95 flex items-center justify-center gap-2"
                >
                  {isLoading ? <Loader2 size={14} className="animate-spin" /> : (editingItem ? "ATUALIZAR" : "SALVAR")}
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="space-y-2 flex-1 min-h-0">
          {isLoading && !isAdding && !editingItem ? (
            <div className="flex flex-col items-center justify-center p-12 gap-4">
              <Loader2 className="animate-spin text-blue-600" size={32} />
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Carregando dados...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center p-12 bg-gray-50 rounded-[32px] border-2 border-dashed border-gray-100 flex flex-col items-center gap-4">
              <span className="text-gray-400 font-bold text-sm uppercase tracking-tight">Nenhum(a) {currentTabInfo?.label} cadastrado(a).</span>
              <button 
                onClick={() => handleInitializeDefaults()}
                disabled={isLoading}
                className="bg-white border border-gray-200 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-blue-600 hover:bg-blue-50 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {isLoading ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                Carregar Padrões
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:max-h-[40vh] md:overflow-y-auto overflow-y-visible px-1 py-1 custom-scrollbar">
              {items.map((item) => (
                <motion.div 
                  key={item.id}
                  layout
                  className={`bg-white border border-gray-100 p-4 rounded-2xl flex items-center justify-between group hover:shadow-lg hover:shadow-gray-200/50 transition-all ${(item.active === false || (item as any).status === 'removed') ? 'opacity-50 grayscale' : ''}`}
                >
                  <div className="flex flex-col">
                    <span className="font-bold text-sm text-gray-700 uppercase tracking-tight">{item.name || item.nome}</span>
                    {(item.active === false || (item as any).status === 'removed') && (
                      <span className="text-[8px] font-black text-red-500 uppercase tracking-wider">
                        {(item as any).status === 'removed' ? 'Removido' : 'Inativo'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 transition-all font-black text-[10px] uppercase">
                    {(item.active === false || (item as any).status === 'removed') ? (
                      <button 
                        onClick={() => handleToggleActive(item)}
                        className="px-3 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-xl transition-all"
                      >
                        Reativar
                      </button>
                    ) : (() => {
                      const activeItems = items.filter(i => i.active !== false && (i as any).status !== "removed");
                      const activeIndex = activeItems.findIndex(i => i.id === item.id);
                      return (
                        <>
                          {activeTab === "patient_statuses" && (
                            <>
                              <button
                                type="button"
                                disabled={isLoading || activeIndex <= 0}
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleMoveStatus(item, "up");
                                }}
                                className={`p-2 rounded-lg transition-all ${
                                  activeIndex <= 0 
                                    ? "text-gray-200 cursor-not-allowed" 
                                    : "text-gray-400 hover:text-blue-600 hover:bg-blue-50 cursor-pointer"
                                }`}
                                title="Mover para cima"
                              >
                                <ArrowUp size={14} />
                              </button>
                              <button
                                type="button"
                                disabled={isLoading || activeIndex === -1 || activeIndex === activeItems.length - 1}
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleMoveStatus(item, "down");
                                }}
                                className={`p-2 rounded-lg transition-all ${
                                  (activeIndex === -1 || activeIndex === activeItems.length - 1) 
                                    ? "text-gray-200 cursor-not-allowed" 
                                    : "text-gray-400 hover:text-blue-600 hover:bg-blue-50 cursor-pointer"
                                }`}
                                title="Mover para baixo"
                              >
                                <ArrowDown size={14} />
                              </button>
                            </>
                          )}
                          <button 
                            type="button"
                            onClick={() => {
                              setEditingItem(item);
                              setNewItemName(item.name || item.nome || "");
                              setIsAdding(false);
                            }}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer"
                            title="Editar"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button 
                            type="button"
                            onClick={() => handleDelete(item)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                            title="Remover"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      );
                    })()}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-blue-50 border border-blue-100 p-6 rounded-[32px] flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-black text-blue-900 uppercase tracking-tight">Configurações Rápidas</h3>
          <p className="text-xs font-semibold text-blue-600/70 uppercase tracking-wider mt-1">Carregue todos os padrões de uma só vez para este grupo</p>
        </div>
        <button 
          onClick={() => isAdmin && handleInitializeDefaults("all")}
          disabled={isLoading || !isAdmin}
          className="w-full sm:w-auto bg-blue-600 text-white px-8 py-4 rounded-2xl font-black text-xs hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 flex items-center justify-center gap-2 uppercase tracking-widest active:scale-95 disabled:opacity-50"
        >
          {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
          CARREGAR TODOS OS PADRÕES
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id as ConfigType)}
            className="flex items-center gap-5 p-6 bg-gray-50/50 border border-gray-100 rounded-[32px] hover:bg-white hover:shadow-xl hover:shadow-gray-200/50 transition-all text-left group"
          >
            <div className={`p-4 ${item.bg} ${item.color} rounded-[20px] transition-all group-hover:scale-110`}>
              {item.icon}
            </div>
            <div className="flex-1">
              <h4 className="text-[13px] font-black text-gray-900 uppercase tracking-tight leading-none mb-1.5">{item.label}</h4>
              <div className="flex flex-col gap-1">
                <p className="text-[9px] text-gray-400 font-medium">{item.description}</p>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest">Configurar</span>
                  <ChevronRight size={10} className="text-blue-300" />
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
