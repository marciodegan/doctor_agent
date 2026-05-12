import React, { useState, useEffect } from "react";
import { 
  ShoppingCart, 
  Plus, 
  Trash2, 
  Check, 
  Loader2,
  RefreshCw,
  Search,
  Grid
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
  writeBatch
} from "firebase/firestore";
import { PRESET_CATEGORIES, getCategoryForItem } from "../lib/shoppingListUtils";
import { db } from "../lib/firebase";
import { OperationType, handleFirestoreError } from "../lib/firestoreUtils";

export const ShoppingListConfig: React.FC = () => {
  const { activeGroup } = useGroup();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<string>(PRESET_CATEGORIES[0].id);
  const [isAdding, setIsAdding] = useState<string | null>(null);
  const [isBulkLoading, setIsBulkLoading] = useState(false);
  const [existingItems, setExistingItems] = useState<Set<string>>(new Set());

  const [searchTerm, setSearchTerm] = useState("");
  const [customItem, setCustomItem] = useState("");

  useEffect(() => {
    if (!activeGroup?.id) return;

    const q = query(collection(db, `groups/${activeGroup.id}/shopping_list`));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ids = new Set(snapshot.docs.map(doc => doc.id));
      setExistingItems(ids);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `groups/${activeGroup.id}/shopping_list`);
    });

    return () => unsubscribe();
  }, [activeGroup?.id]);

  const handleQuickAdd = async (name: string) => {
    if (!activeGroup?.id) return;
    
    // Normalize ID
    const itemId = name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_-]/g, "");

    if (!itemId) return;
    
    setIsAdding(itemId);
    try {
      const category = getCategoryForItem(name);
      await setDoc(doc(db, `groups/${activeGroup.id}/shopping_list`, itemId), {
        name,
        checked: false,
        category,
        addedBy: user?.uid || "system",
        updatedAt: serverTimestamp()
      }, { merge: true });
      if (customItem) setCustomItem("");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `groups/${activeGroup.id}/shopping_list/${itemId}`);
    } finally {
      setTimeout(() => setIsAdding(null), 1000);
    }
  };

  const handleBulkAdd = async (items: string[]) => {
    if (!activeGroup?.id) return;
    
    const itemsToAdd = items.filter(name => {
      const id = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, "");
      return !existingItems.has(id);
    });

    if (itemsToAdd.length === 0) return;
    
    setIsBulkLoading(true);
    try {
      const batch = writeBatch(db);
      itemsToAdd.forEach(name => {
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
          addedBy: user?.uid || "system",
          updatedAt: serverTimestamp()
        }, { merge: true });
      });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `groups/${activeGroup.id}/shopping_list/BATCH`);
    } finally {
      setIsBulkLoading(false);
    }
  };

  const currentCategory = PRESET_CATEGORIES.find(c => c.id === activeTab);
  
  const filteredItems = currentCategory?.items.filter(item => 
    item.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  return (
    <div className="space-y-6">
      <div className="bg-orange-50 border border-orange-100 p-5 rounded-[32px] flex items-start gap-4">
        <ShoppingCart className="text-orange-600 shrink-0 mt-0.5" size={24} />
        <div>
          <p className="text-[13px] font-black text-gray-900 uppercase tracking-tight mb-1">Configuração da Lista</p>
          <p className="text-[11px] text-gray-500 font-medium leading-relaxed">
            Adicione rapidamente produtos essenciais à lista de compras do seu grupo familiar. 
            Itens selecionados aparecerão instantaneamente para todos.
          </p>
        </div>
      </div>

      {/* Quick Custom Add */}
      <div className="relative">
        <Plus className="absolute left-4 top-1/2 -translate-y-1/2 text-orange-400" size={18} />
        <input 
          type="text"
          placeholder="Adicionar outro item..."
          value={customItem}
          onChange={(e) => setCustomItem(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd(customItem)}
          className="w-full bg-slate-100 border-none rounded-2xl py-4 pl-12 pr-4 text-sm font-bold text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-orange-200 outline-none transition-all"
        />
        {customItem.trim() && (
          <button 
            onClick={() => handleQuickAdd(customItem)}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-orange-600 text-white px-3 py-1.5 rounded-xl font-black text-[10px]"
          >
            ADICIONAR
          </button>
        )}
      </div>

      {/* Categories Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-4 no-scrollbar">
        {PRESET_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => {
              setActiveTab(cat.id);
              setSearchTerm("");
            }}
            className={`px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border ${
              activeTab === cat.id 
                ? "bg-orange-600 text-white border-orange-600 shadow-lg shadow-orange-100" 
                : "bg-white text-gray-400 border-gray-100 hover:border-orange-200"
            }`}
          >
            <span className="mr-2">{cat.icon}</span>
            {cat.label}
          </button>
        ))}
      </div>

      {/* Search in presets */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
        <input 
          type="text"
          placeholder={`Buscar em ${currentCategory?.label}...`}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-white border border-gray-100 rounded-xl py-2.5 pl-10 pr-4 text-xs font-semibold text-gray-600 outline-none focus:border-orange-300 transition-all"
        />
      </div>

      {/* Items Grid */}
      <AnimatePresence mode="wait">
        {currentCategory && (
          <motion.div 
            key={currentCategory.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">{currentCategory.label} sugeridos</h4>
              {filteredItems.some(name => !existingItems.has(name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, ""))) && (
                <button 
                  onClick={() => handleBulkAdd(filteredItems)}
                  disabled={isBulkLoading}
                  className="flex items-center gap-2 text-[10px] font-black text-orange-600 hover:bg-orange-50 px-3 py-1.5 rounded-lg transition-all border border-orange-100 disabled:opacity-50"
                >
                  {isBulkLoading ? <Loader2 size={12} className="animate-spin" /> : null}
                  {searchTerm ? "ADICIONAR RESULTADOS" : "ADICIONAR TODOS"}
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {filteredItems.length > 0 ? (
                filteredItems.map((name) => {
                  const id = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, "");
                  const exists = existingItems.has(id);
                  const loading = isAdding === id;

                  return (
                    <button
                      key={name}
                      onClick={() => !exists && handleQuickAdd(name)}
                      disabled={exists || loading}
                      className={`flex items-center justify-between p-4 rounded-2xl border transition-all text-left group ${
                        exists 
                          ? "bg-emerald-50 border-emerald-100 opacity-60 cursor-default" 
                          : "bg-white border-gray-100 hover:border-orange-300 hover:shadow-lg hover:shadow-gray-100"
                      }`}
                    >
                      <span className={`text-[13px] font-bold ${exists ? "text-emerald-700" : "text-gray-700"}`}>
                        {name}
                      </span>
                      <div className={`p-1.5 rounded-lg transition-all ${
                        exists ? "bg-emerald-200 text-emerald-700" : "bg-gray-50 text-gray-400 group-hover:bg-orange-50 group-hover:text-orange-600"
                      }`}>
                        {loading ? <Loader2 size={14} className="animate-spin" /> : exists ? <Check size={14} /> : <Plus size={14} />}
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="col-span-2 py-8 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-100">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Nenhum item encontrado</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="pt-6 border-t border-gray-100">
         <div className="bg-gray-50 rounded-[24px] p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
               <Grid className="text-gray-400" size={18} />
               <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Itens na lista atual: {existingItems.size}</p>
            </div>
            <button 
              onClick={() => handleBulkAdd(PRESET_CATEGORIES.flatMap(c => c.items))}
              disabled={isBulkLoading}
              className="flex items-center gap-2 text-[10px] font-black text-gray-900 border-2 border-gray-200 bg-white px-4 py-2 rounded-xl hover:bg-gray-900 hover:text-white hover:border-gray-900 transition-all shadow-sm disabled:opacity-50"
            >
              {isBulkLoading ? <Loader2 size={12} className="animate-spin" /> : null}
              CARREGAR LISTA COMPLETA
            </button>
         </div>
      </div>
    </div>
  );
};
