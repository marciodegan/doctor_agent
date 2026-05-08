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
  Settings
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
import { motion, AnimatePresence } from "motion/react";
import { OperationType, handleFirestoreError } from "../lib/firestoreUtils";

type ConfigType = "hospitals" | "patient_statuses" | "procedureOptions" | "surgery_types" | "affinity" | "members" | "general";

interface ConfigItem {
  id: string;
  name: string;
  nome?: string; 
  groupId: string;
  active?: boolean;
}

export function GroupConfigs() {
  const { activeGroup, companyName, whatsappNumber, imageAnalysisPrompt, updateSettings, handleBackup } = useGroup();
  const [activeTab, setActiveTab] = useState<ConfigType | null>(null);
  const [items, setItems] = useState<ConfigItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [editingItem, setEditingItem] = useState<ConfigItem | null>(null);

  // Local settings for the general tab
  const [localCompanyName, setLocalCompanyName] = useState(companyName);
  const [localWhatsappNumber, setLocalWhatsappNumber] = useState(whatsappNumber);
  const [localImageAnalysisPrompt, setLocalImageAnalysisPrompt] = useState(imageAnalysisPrompt);
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);

  useEffect(() => {
    setLocalCompanyName(companyName);
    setLocalWhatsappNumber(whatsappNumber);
    setLocalImageAnalysisPrompt(imageAnalysisPrompt);
  }, [companyName, whatsappNumber, imageAnalysisPrompt]);

  const onUpdateSettings = async () => {
    setIsUpdatingSettings(true);
    try {
      await updateSettings(localCompanyName, localWhatsappNumber, localImageAnalysisPrompt);
      alert("Configurações atualizadas!");
    } catch (err) {
      console.error(err);
      alert("Erro ao atualizar configurações");
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  const onHandleBackup = async () => {
    if (!confirm("Deseja realizar o backup dos dados deste grupo?")) return;
    setIsBackingUp(true);
    try {
      await handleBackup();
      alert("Backup realizado com sucesso!");
    } catch (err) {
      alert("Erro no backup");
    } finally {
      setIsBackingUp(false);
    }
  };

  useEffect(() => {
    if (!activeTab || !activeGroup || activeTab === "general") {
      setItems([]);
      return;
    }

    setIsLoading(true);
    const colRef = collection(db, activeTab);
    const q = query(colRef, where("groupId", "==", activeGroup.id));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ConfigItem[];
      
      // Sort alphabetically
      fetched.sort((a, b) => {
        const nameA = (a.name || a.nome || "").toLowerCase();
        const nameB = (b.name || b.nome || "").toLowerCase();
        return nameA.localeCompare(nameB);
      });

      setItems(fetched);
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, activeTab);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [activeTab, activeGroup?.id]);

  const handleInitializeDefaults = async () => {
    if (!activeTab || !activeGroup) return;
    
    const defaults: Record<string, string[]> = {
      patient_statuses: ["Internado", "Pré-Operatório", "Em Cirurgia", "Recuperação", "Alta"],
      procedureOptions: ["Apendicectomia", "Colecistectomia", "Hernioplastia", "Histerectomia", "Artroscopia"],
      surgery_types: ["URGENTE", "ELETIVA"],
      affinity: ["Filho(a)", "Irmão/Irmã", "Pai/Mãe", "Cônjuge", "Avô/Avó", "Amigo(a)"],
      hospitals: ["Hospital Municipal", "Hospital Santa Maria", "Santa Casa"]
    };

    const itemsToCreate = defaults[activeTab] || [];
    if (itemsToCreate.length === 0) return;

    setIsLoading(true);
    try {
      for (const itemName of itemsToCreate) {
        const data: any = {
           groupId: activeGroup.id,
           active: true,
           createdAt: serverTimestamp()
        };
        if (activeTab === "procedureOptions") data.nome = itemName;
        else data.name = itemName;
        
        await addDoc(collection(db, activeTab), data);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, activeTab);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim() || !activeGroup || !activeTab) return;

    try {
      const data: any = {
        groupId: activeGroup.id,
        active: true,
      };

      // Handle the fact that some collections use 'name' and others use 'nome'
      if (activeTab === "procedureOptions") {
        data.nome = newItemName;
      } else {
        data.name = newItemName;
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
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, activeTab);
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
      const isUsed = await checkUsage(item);
      if (isUsed) {
        // Soft delete (deactivate)
        await setDoc(doc(db, activeTab, item.id), { active: false }, { merge: true });
        alert("Este item está sendo usado em registros existentes. Ele foi desativado e não aparecerá mais em novos formulários, mas os registros antigos continuarão ativos.");
      } else {
        // Hard delete
        await deleteDoc(doc(db, activeTab, item.id));
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, activeTab);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleActive = async (item: ConfigItem) => {
    if (!activeTab) return;
    try {
      await setDoc(doc(db, activeTab, item.id), { active: !item.active }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, activeTab);
    }
  };

  const menuItems = [
    { id: "hospitals", label: "Hospitais", icon: <Building2 size={24} />, color: "text-blue-600", bg: "bg-blue-50" },
    { id: "patient_statuses", label: "Status", icon: <Activity size={24} />, color: "text-emerald-600", bg: "bg-emerald-50" },
    { id: "procedureOptions", label: "Procedimentos", icon: <Stethoscope size={24} />, color: "text-purple-600", bg: "bg-purple-50" },
    { id: "surgery_types", label: "Tipos de Cirurgia", icon: <Zap size={24} />, color: "text-amber-600", bg: "bg-amber-50" },
    { id: "affinity", label: "Afinidades", icon: <Heart size={24} />, color: "text-pink-600", bg: "bg-pink-50" },
    { id: "general", label: "Ajustes Gerais", icon: <Settings size={24} />, color: "text-indigo-600", bg: "bg-indigo-50" },
    { id: "members", label: "Equipe / Membros", icon: <Users size={24} />, color: "text-gray-600", bg: "bg-gray-100" },
  ];

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
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Nome da Empresa / Profissional</label>
            <input 
              type="text" 
              value={localCompanyName} 
              onChange={(e) => setLocalCompanyName(e.target.value)}
              placeholder="Ex: Dr. Silva ou Clínica Pro"
              className="w-full bg-gray-50 border border-gray-100 px-5 py-4 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-indigo-100 outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">WhatsApp (Envio de Agenda)</label>
            <input 
              type="text" 
              value={localWhatsappNumber} 
              onChange={(e) => setLocalWhatsappNumber(e.target.value)}
              placeholder="Ex: 5511999998888"
              className="w-full bg-gray-50 border border-gray-100 px-5 py-4 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-indigo-100 outline-none transition-all"
            />
            <p className="text-[9px] text-gray-400 mt-2 ml-1">Inclua o código do país (55 para Brasil) e DDD. Sem espaços ou traços.</p>
          </div>

          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Prompt de Análise de Imagem (AI)</label>
            <textarea 
              value={localImageAnalysisPrompt} 
              onChange={(e) => setLocalImageAnalysisPrompt(e.target.value)}
              placeholder="Instruções para a IA analisar as fotos..."
              rows={4}
              className="w-full bg-gray-50 border border-gray-100 px-5 py-4 rounded-2xl text-sm font-medium focus:ring-4 focus:ring-indigo-100 outline-none transition-all resize-none"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button 
              onClick={onUpdateSettings}
              disabled={isUpdatingSettings || isBackingUp}
              className="flex-[2] bg-blue-600 text-white py-4 rounded-2xl font-black text-xs hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isUpdatingSettings ? <Loader2 size={16} className="animate-spin" /> : "SALVAR ALTERAÇÕES"}
            </button>
            <button 
              onClick={onHandleBackup}
              disabled={isUpdatingSettings || isBackingUp}
              className="flex-1 bg-emerald-600 text-white py-4 rounded-2xl font-black text-xs hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isBackingUp ? <Loader2 size={16} className="animate-spin" /> : "BACKUP"}
            </button>
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
      <div className="flex flex-col h-full bg-white">
        <div className="flex items-center gap-4 mb-8">
          <button 
            onClick={() => {
              setActiveTab(null);
              setIsAdding(false);
              setEditingItem(null);
            }} 
            className="p-2 hover:bg-gray-100 rounded-xl transition-all text-gray-500"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-3">
            <div className={`p-2.5 ${currentTabInfo?.bg} ${currentTabInfo?.color} rounded-xl`}>
              {currentTabInfo?.icon}
            </div>
            <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">{currentTabInfo?.label}</h3>
          </div>
          <button 
            onClick={() => {
              setIsAdding(true);
              setEditingItem(null);
              setNewItemName("");
            }}
            className="ml-auto flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-black uppercase hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
          >
            <Plus size={16} />
            ADICIONAR
          </button>
        </div>

        <AnimatePresence>
          {(isAdding || editingItem) && (
            <motion.form 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              onSubmit={handleSave}
              className="bg-gray-50 p-6 rounded-[32px] border border-gray-100 mb-8 space-y-4"
            >
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                  {editingItem ? "Editar Item" : "Novo Item"}
                </h4>
                <button type="button" onClick={() => { setIsAdding(false); setEditingItem(null); }} className="text-gray-400 hover:text-gray-600">
                  <X size={16} />
                </button>
              </div>
              <div className="flex gap-3">
                <input 
                  type="text" 
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  placeholder="Digite o nome..."
                  className="flex-1 bg-white border border-gray-200 px-5 py-4 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-blue-100 outline-none transition-all shadow-sm"
                  autoFocus
                />
                <button 
                  type="submit"
                  className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black text-xs hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 uppercase tracking-widest"
                >
                  SALVAR
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="animate-spin text-blue-600" size={32} />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center p-12 bg-gray-50 rounded-[32px] border-2 border-dashed border-gray-100 flex flex-col items-center gap-4">
              <span className="text-gray-400 font-bold text-sm">Nenhum item cadastrado.</span>
              <button 
                onClick={handleInitializeDefaults}
                className="bg-white border border-gray-200 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-blue-600 hover:bg-blue-50 transition-all"
              >
                Carregar Padrões
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {items.map((item) => (
                <motion.div 
                  key={item.id}
                  layout
                  className={`bg-white border border-gray-100 p-4 rounded-2xl flex items-center justify-between group hover:shadow-lg hover:shadow-gray-200/50 transition-all ${item.active === false ? 'opacity-50 grayscale' : ''}`}
                >
                  <div className="flex flex-col">
                    <span className="font-bold text-sm text-gray-700 uppercase tracking-tight">{item.name || item.nome}</span>
                    {item.active === false && (
                      <span className="text-[8px] font-black text-red-500 uppercase tracking-wider">Inativo</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    {item.active === false ? (
                      <button 
                        onClick={() => handleToggleActive(item)}
                        className="p-2 text-emerald-500 hover:bg-emerald-50 rounded-lg text-[9px] font-black uppercase"
                      >
                        Reativar
                      </button>
                    ) : (
                      <>
                        <button 
                          onClick={() => {
                            setEditingItem(item);
                            setNewItemName(item.name || item.nome || "");
                            setIsAdding(false);
                          }}
                          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button 
                          onClick={() => handleDelete(item)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
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
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Configurar</span>
              <ChevronRight size={10} className="text-gray-300" />
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
