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
  X
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

interface ShoppingItem {
  id: string;
  name: string;
  checked: boolean;
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

  const handleAddItem = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newItemName.trim() || !activeGroup?.id) return;

    const itemName = newItemName.trim();
    // Normalize ID: remove accents, lowercase, replace spaces, remove non-alphanumeric
    const itemId = itemName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_-]/g, "");

    if (!itemId) return;

    try {
      await setDoc(doc(db, `groups/${activeGroup.id}/shopping_list`, itemId), {
        name: itemName,
        checked: false,
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
        batch.set(docRef, {
          name,
          checked: false,
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

  const sortedItems = [...items]
    .filter(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      // Checked items move to top
      if (a.checked !== b.checked) {
        return a.checked ? -1 : 1;
      }
      // Unchecked items sorted alphabetically
      return a.name.localeCompare(b.name);
    });

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
                  items.length > 0 && items.some(i => i.checked) && (
                    <motion.button 
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      onClick={() => setShowClearConfirm(true)}
                      className="p-2.5 bg-orange-50 text-orange-600 rounded-xl hover:bg-orange-100 transition-colors"
                      title="Limpar marcados"
                    >
                      <Trash2 size={18} />
                    </motion.button>
                  )
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
              <p className="text-lg font-black text-slate-400">Sua lista está vazia</p>
              <p className="text-xs font-medium text-slate-400 mt-1 max-w-[200px]">
                Adicione itens manualmente ou carregue uma lista básica de mercado.
              </p>
              <button 
                onClick={seedInitialItems}
                disabled={isSeeding}
                className="mt-6 flex items-center gap-2 bg-orange-600 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-orange-100"
              >
                {isSeeding ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                Carregar lista padrão
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              <AnimatePresence initial={false}>
                {sortedItems.map((item) => (
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
                      className="flex-1 cursor-pointer"
                      onClick={() => handleToggleItem(item)}
                    >
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
