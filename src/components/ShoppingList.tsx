import React, { useState, useEffect } from "react";
import { 
  ShoppingCart, 
  Search, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  Circle, 
  Loader2,
  RefreshCw,
  MoreVertical,
  ChevronUp,
  X,
  MessageCircle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useGroup } from "../contexts/GroupContext";
import { useAuth } from "../hooks/useAuth";
import { 
  collection, 
  query, 
  onSnapshot, 
  setDoc, 
  doc, 
  deleteDoc, 
  serverTimestamp,
  orderBy,
  getDocs,
  writeBatch
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { OperationType, handleFirestoreError } from "../lib/firestoreUtils";
import { getCategoryForItem, CATEGORY_LABELS, PRESET_CATEGORIES } from "../lib/shoppingListUtils";

interface ShoppingItem {
  id: string;
  name: string;
  checked: boolean;
  category?: string;
  updatedAt?: any;
  updatedBy?: string;
  addedBy?: string;
}

const INITIAL_ITEMS = [
  "Arroz", "Feijão", "Açúcar", "Café", "Leite", 
  "Pão", "Manteiga", "Papel Higiênico", "Detergente", 
  "Sabonete", "Xampu", "Creme Dental", "Frutas", 
  "Legumes", "Carne", "Frango", "Ovos", "Óleo"
];

export const ShoppingList: React.FC = () => {
  const { activeGroup } = useGroup();
  const { user } = useAuth();
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [isSeeding, setIsSeeding] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [selectedQuickAddCat, setSelectedQuickAddCat] = useState<string | null>(null);

  useEffect(() => {
    if (!activeGroup?.id) return;

    const q = query(
      collection(db, `groups/${activeGroup.id}/shopping_list`),
      orderBy("name", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedItems = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ShoppingItem[];
      
      setItems(fetchedItems);
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `groups/${activeGroup.id}/shopping_list`);
    });

    return () => unsubscribe();
  }, [activeGroup?.id]);

  const handleToggleItem = async (item: ShoppingItem) => {
    if (!activeGroup?.id) return;
    
    try {
      const itemRef = doc(db, `groups/${activeGroup.id}/shopping_list`, item.id);
      await setDoc(itemRef, {
        checked: !item.checked,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `groups/${activeGroup.id}/shopping_list/${item.id}`);
    }
  };

  const handleAddItem = async (e?: React.FormEvent, nameOverride?: string) => {
    if (e) e.preventDefault();
    const itemName = nameOverride || newItemName.trim();
    if (!itemName || !activeGroup?.id) return;
    // Normalize ID: remove accents, lowercase, replace spaces, remove non-alphanumeric
    const itemId = itemName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_-]/g, "");

    if (!itemId) return;

    try {
      const category = getCategoryForItem(itemName);
      await setDoc(doc(db, `groups/${activeGroup.id}/shopping_list`, itemId), {
        name: itemName,
        checked: false,
        category,
        addedBy: user?.uid,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setNewItemName("");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `groups/${activeGroup.id}/shopping_list/${itemId}`);
    }
  };

  const handleRemoveItem = async (id: string) => {
    if (!activeGroup?.id) return;
    try {
      await deleteDoc(doc(db, `groups/${activeGroup.id}/shopping_list`, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `groups/${activeGroup.id}/shopping_list/${id}`);
    }
  };

  const seedInitialItems = async () => {
    if (!activeGroup?.id) return;
    setIsSeeding(true);
    try {
      const batch = writeBatch(db);
      INITIAL_ITEMS.forEach(name => {
        const id = name
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/\s+/g, "_")
          .replace(/[^a-z0-9_-]/g, "");
        
        const docRef = doc(db, `groups/${activeGroup.id}/shopping_list`, id);
        const category = getCategoryForItem(name);
        batch.set(docRef, {
          name,
          checked: false,
          category,
          addedBy: "system",
          updatedAt: serverTimestamp()
        }, { merge: true });
      });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `groups/${activeGroup.id}/shopping_list/BATCH`);
    } finally {
      setIsSeeding(false);
    }
  };

  const clearCheckedItems = async () => {
    if (!activeGroup?.id) return;
    const checkedItems = items.filter(i => i.checked);
    if (checkedItems.length === 0) return;

    try {
      const batch = writeBatch(db);
      checkedItems.forEach(item => {
        const docRef = doc(db, `groups/${activeGroup.id}/shopping_list`, item.id);
        batch.delete(docRef);
      });
      await batch.commit();
      setShowClearConfirm(false);
    } catch (error) {
      console.error("Error clearing items:", error);
    }
  };

  const shareToWhatsApp = () => {
    const checkedItems = items.filter(i => i.checked);
    if (checkedItems.length === 0) return;

    const title = `*🛒 Lista de Compras - ${activeGroup?.name || "Grupo"}*\n\n`;
    const list = checkedItems.map(item => `✅ ${item.name}`).join('\n');
    const message = encodeURIComponent(title + list);
    
    window.open(`https://wa.me/?text=${message}`, '_blank');
  };

  const sortedItems = [...items]
    .filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = !selectedQuickAddCat || item.category === selectedQuickAddCat;
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      // Unchecked items move to top, checked to bottom
      if (a.checked !== b.checked) {
        return a.checked ? 1 : -1;
      }
      
      // If both same check status, sort by category then name
      const catA = a.category || "others";
      const catB = b.category || "others";
      
      if (catA !== catB) {
        return catA.localeCompare(catB);
      }

      return a.name.localeCompare(b.name);
    });

  // Group items by category for the display
  const groupedItems: Record<string, ShoppingItem[]> = sortedItems.reduce((acc, item) => {
    const cat = item.checked ? "checked" : (item.category || "others");
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, ShoppingItem[]>);

  // Define order of categories
  const categoryOrder = [
    ...Object.keys(CATEGORY_LABELS).filter(k => k !== "others"),
    "others",
    "checked"
  ];

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 p-4 sticky top-0 z-20">
        <div className="max-w-xl mx-auto flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-orange-50 flex items-center justify-center border border-orange-100 text-orange-600">
                <ShoppingCart size={22} />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight">Lista de Compras</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Grupo: {activeGroup?.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <AnimatePresence>
                {showClearConfirm ? (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9, x: 20 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.9, x: 20 }}
                    className="flex items-center gap-1 bg-red-50 border border-red-100 p-1 rounded-xl"
                  >
                    <button 
                      onClick={() => setShowClearConfirm(false)}
                      className="px-2 py-1 text-[8px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={clearCheckedItems}
                      className="px-3 py-1 bg-red-600 text-white rounded-[10px] text-[8px] font-black uppercase tracking-widest"
                    >
                      Confirmar
                    </button>
                  </motion.div>
                ) : (
                  <>
                    {items.some(i => i.checked) && (
                      <motion.button 
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        onClick={shareToWhatsApp}
                        className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors"
                        title="Compartilhar no WhatsApp"
                      >
                        <MessageCircle size={18} />
                      </motion.button>
                    )}
                    {items.length > 0 && items.some(i => i.checked) && (
                      <motion.button 
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        onClick={() => setShowClearConfirm(true)}
                        className="p-2.5 bg-orange-50 text-orange-600 rounded-xl hover:bg-orange-100 transition-colors"
                        title="Limpar marcados"
                      >
                        <Trash2 size={18} />
                      </motion.button>
                    )}
                  </>
                )}
              </AnimatePresence>
              {items.length === 0 && !isLoading && (
                <button 
                  onClick={seedInitialItems}
                  disabled={isSeeding}
                  className="p-2.5 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors disabled:opacity-50"
                  title="Carregar lista básica"
                >
                  {isSeeding ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <form onSubmit={handleAddItem} className="relative">
              <Plus className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-400" size={18} />
              <input 
                type="text"
                placeholder="Adicionar produto..."
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                className="w-full bg-slate-100 border-none rounded-xl py-3 pl-10 pr-4 text-sm font-bold text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-orange-200 outline-none transition-all"
              />
              {newItemName.trim() && (
                <button 
                  type="submit"
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-orange-600 text-white p-1.5 rounded-lg font-black text-[10px]"
                >
                  ADD
                </button>
              )}
            </form>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text"
                placeholder="Filtrar na lista..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-100/50 border-none rounded-xl py-2.5 pl-10 pr-4 text-xs font-semibold text-slate-600 placeholder:text-slate-400 outline-none transition-all"
              />
            </div>

            {/* Quick Add Categorized */}
            <div className="flex flex-col gap-2 mt-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">
                  {selectedQuickAddCat ? "Adicionar da Categoria" : "Explorar Categorias"}
                </span>
                {selectedQuickAddCat && (
                  <button 
                    onClick={() => setSelectedQuickAddCat(null)}
                    className="flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full transition-all"
                  >
                    <X size={10} />
                    Limpar Filtro
                  </button>
                )}
              </div>
              <div className="flex overflow-x-auto gap-2 pb-2 scrollbar-hide -mx-1 px-1">
                {Object.entries(CATEGORY_LABELS).map(([id, info]) => {
                  if (id === "others") return null;
                  const isActive = selectedQuickAddCat === id;
                  return (
                    <button
                      key={id}
                      onClick={() => setSelectedQuickAddCat(isActive ? null : id)}
                      className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 border rounded-xl text-[10px] font-bold transition-all whitespace-nowrap ${
                        isActive 
                          ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200 scale-105 active:scale-100" 
                          : "bg-white border-slate-100 text-slate-600 hover:border-blue-200 active:scale-95"
                      }`}
                    >
                      <span className={isActive ? "scale-110" : ""}>{info.icon}</span>
                      <span>{info.label}</span>
                    </button>
                  );
                })}
              </div>

              <AnimatePresence>
                {selectedQuickAddCat && (
                  <motion.div
                    initial={{ opacity: 0, scaleY: 0 }}
                    animate={{ opacity: 1, scaleY: 1 }}
                    exit={{ opacity: 0, scaleY: 0 }}
                    style={{ originY: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="flex flex-col gap-2 p-3 bg-white rounded-2xl border border-slate-100 shadow-sm mb-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Toque para adicionar</span>
                        <span className="text-[10px] font-bold text-blue-500 bg-blue-50 px-2 rounded-md">Presets</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(PRESET_CATEGORIES.find(c => c.id === selectedQuickAddCat)?.items || [])
                          .filter(name => !items.some(i => i.name.toLowerCase() === name.toLowerCase()))
                          .map(name => (
                            <button
                              key={name}
                              onClick={() => handleAddItem(undefined, name)}
                              className="px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-xl text-[11px] font-bold text-slate-600 hover:bg-white hover:border-blue-200 hover:text-blue-600 transition-all active:scale-95 capitalize"
                            >
                              + {name}
                            </button>
                          ))}
                        {(PRESET_CATEGORIES.find(c => c.id === selectedQuickAddCat)?.items || [])
                          .filter(name => !items.some(i => i.name.toLowerCase() === name.toLowerCase())).length === 0 && (
                          <p className="text-[10px] font-medium text-slate-400 italic py-2">Todos os itens sugeridos já estão na sua lista!</p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="max-w-xl mx-auto space-y-2">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 grayscale opacity-30">
              <Loader2 size={40} className="animate-spin text-orange-500 mb-2" />
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Sincronizando Lista...</p>
            </div>
          ) : sortedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 grayscale opacity-30 text-center">
              <ShoppingCart size={60} className="text-slate-300 mb-4" />
              <p className="text-lg font-black text-slate-400">
                {selectedQuickAddCat 
                  ? `Nenhum item em ${CATEGORY_LABELS[selectedQuickAddCat]?.label || "esta categoria"}` 
                  : "Sua lista está vazia"}
              </p>
              <p className="text-xs font-medium text-slate-400 mt-1 max-w-[200px]">
                {selectedQuickAddCat 
                  ? "Adicione itens das sugestões acima ou limpe o filtro." 
                  : "Adicione itens manualmente ou carregue uma lista básica de mercado."}
              </p>
              {!selectedQuickAddCat && (
                <button 
                  onClick={seedInitialItems}
                  disabled={isSeeding}
                  className="mt-6 flex items-center gap-2 bg-orange-600 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-orange-100"
                >
                  {isSeeding ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  Carregar lista padrão
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {categoryOrder.map(catKey => {
                const groupItems = groupedItems[catKey];
                if (!groupItems || groupItems.length === 0) return null;

                const catInfo = catKey === "checked" 
                  ? { label: "Comprados", icon: "✅" }
                  : CATEGORY_LABELS[catKey];

                return (
                  <div key={catKey} className="space-y-2">
                    <div className="flex items-center gap-2 px-1 mb-2">
                      <span className="text-sm">{catInfo.icon}</span>
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                        {catInfo.label}
                      </h4>
                      <div className="flex-1 h-[1px] bg-slate-100 ml-2"></div>
                      <span className="text-[9px] font-bold text-slate-300 ml-2">{groupItems.length}</span>
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                      <AnimatePresence initial={false}>
                        {groupItems.map((item) => (
                          <motion.div
                            key={item.id}
                            layout
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ type: "spring", bounce: 0.2 }}
                            className={`group flex items-center gap-3 p-4 rounded-2xl border transition-all ${
                              item.checked 
                                ? "bg-emerald-50 border-emerald-100 shadow-sm" 
                                : "bg-white border-slate-100 hover:border-slate-200"
                            }`}
                          >
                            <button 
                              onClick={() => handleToggleItem(item)}
                              className={`shrink-0 transition-colors ${
                                item.checked ? "text-emerald-500" : "text-slate-300 group-hover:text-slate-400"
                              }`}
                            >
                              {item.checked ? <CheckCircle2 size={24} /> : <Circle size={24} />}
                            </button>
        
                            <div 
                              className="flex-1 cursor-pointer flex items-center gap-2"
                              onClick={() => handleToggleItem(item)}
                            >
                              {!item.checked && item.category && CATEGORY_LABELS[item.category] && (
                                <span className="text-xs grayscale opacity-60 group-hover:grayscale-0 group-hover:opacity-100 transition-all">
                                  {CATEGORY_LABELS[item.category].icon}
                                </span>
                              )}
                              <span className={`text-[15px] font-bold tracking-tight transition-all ${
                                item.checked ? "text-emerald-900" : "text-slate-700"
                              }`}>
                                {item.name}
                              </span>
                            </div>
        
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => handleRemoveItem(item.id)}
                                className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer Info */}
      <div className="p-4 bg-white border-t border-slate-100">
        <div className="max-w-xl mx-auto flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            COMPARTILHADO EM TEMPO REAL
          </div>
          <div>
            {items.filter(i => i.checked).length} / {items.length} ITENS
          </div>
        </div>
      </div>
    </div>
  );
};
