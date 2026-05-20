import React, { useState, useEffect } from "react";
import { 
  ShoppingCart, 
  Plus, 
  Trash2, 
  Loader2, 
  X, 
  ChevronLeft, 
  Settings, 
  Check, 
  Send, 
  Search,
  CheckSquare,
  Square,
  Edit2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../hooks/useAuth";
import { doc, setDoc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";

// Category configurations strictly as requested
const CATEGORIES = [
  { id: "meat", label: "Carnes e Proteínas", icon: "🥩" },
  { id: "hortifruti", label: "Hortifruti", icon: "🍎" },
  { id: "laticinios", label: "Laticínios e Frios", icon: "🧀" },
  { id: "padaria", label: "Padaria", icon: "🥖" },
  { id: "mercearia", label: "Mercearia", icon: "🥫" },
  { id: "limpeza", label: "Limpeza", icon: "🧹" },
  { id: "higiene", label: "Higiene", icon: "🧴" },
  { id: "bebidas", label: "Bebidas", icon: "🥤" }
];

// Presets exactly defined in the prompt
const DEFAULT_PRODUCTS = [
  // Carnes e Proteínas
  { id: "carne_bife", name: "Carne Bife", category: "meat" },
  { id: "carne_moida", name: "Carne Moída", category: "meat" },
  { id: "frango", name: "Frango", category: "meat" },
  { id: "peito_de_frango", name: "Peito de Frango", category: "meat" },
  { id: "coxa_de_frango", name: "Coxa de Frango", category: "meat" },
  { id: "sobrecoxa_de_frango", name: "Sobrecoxa de Frango", category: "meat" },
  { id: "asa_de_frango", name: "Asa de Frango", category: "meat" },
  { id: "file_de_frango", name: "Filé de Frango", category: "meat" },
  { id: "carne_de_panela", name: "Carne de Panela", category: "meat" },
  { id: "patinho", name: "Patinho", category: "meat" },
  { id: "alcatra", name: "Alcatra", category: "meat" },
  { id: "contrafile", name: "Contrafilé", category: "meat" },
  { id: "picanha", name: "Picanha", category: "meat" },
  { id: "coxao_mole", name: "Coxão Mole", category: "meat" },
  { id: "coxao_duro", name: "Coxão Duro", category: "meat" },
  { id: "maminha", name: "Maminha", category: "meat" },
  { id: "costela", name: "Costela", category: "meat" },
  { id: "linguica", name: "Linguiça", category: "meat" },
  { id: "salsicha", name: "Salsicha", category: "meat" },
  { id: "bacon", name: "Bacon", category: "meat" },
  { id: "presunto", name: "Presunto", category: "meat" },
  { id: "mortadela", name: "Mortadela", category: "meat" },
  { id: "peixe", name: "Peixe", category: "meat" },
  { id: "file_de_peixe", name: "Filé de Peixe", category: "meat" },
  { id: "salmao", name: "Salmão", category: "meat" },
  { id: "tilapia", name: "Tilápia", category: "meat" },
  { id: "atum", name: "Atum", category: "meat" },
  { id: "camarao", name: "Camarão", category: "meat" },
  { id: "ovos", name: "Ovos", category: "meat" },

  // Hortifruti
  { id: "banana", name: "Banana", category: "hortifruti" },
  { id: "maca", name: "Maçã", category: "hortifruti" },
  { id: "laranja", name: "Laranja", category: "hortifruti" },
  { id: "limao", name: "Limão", category: "hortifruti" },
  { id: "tomate", name: "Tomate", category: "hortifruti" },
  { id: "cebola", name: "Cebola", category: "hortifruti" },
  { id: "alho", name: "Alho", category: "hortifruti" },
  { id: "batata", name: "Batata", category: "hortifruti" },
  { id: "cenoura", name: "Cenoura", category: "hortifruti" },
  { id: "alface", name: "Alface", category: "hortifruti" },
  { id: "brocolis", name: "Brócolis", category: "hortifruti" },
  { id: "abobrinha", name: "Abobrinha", category: "hortifruti" },
  { id: "morango", name: "Morango", category: "hortifruti" },

  // Laticínios e Frios
  { id: "leite", name: "Leite", category: "laticinios" },
  { id: "queijo", name: "Queijo", category: "laticinios" },
  { id: "requeijao", name: "Requeijão", category: "laticinios" },
  { id: "iogurte", name: "Iogurte", category: "laticinios" },
  { id: "manteiga", name: "Manteiga", category: "laticinios" },
  { id: "creme_de_leite", name: "Creme de leite", category: "laticinios" },
  { id: "leite_condensado", name: "Leite condensado", category: "laticinios" },

  // Padaria
  { id: "pao_frances", name: "Pão francês", category: "padaria" },
  { id: "pao_de_forma", name: "Pão de forma", category: "padaria" },
  { id: "bolo", name: "Bolo", category: "padaria" },
  { id: "torrada", name: "Torrada", category: "padaria" },
  { id: "pao_de_queijo", name: "Pão de queijo", category: "padaria" },

  // Mercearia
  { id: "arroz", name: "Arroz", category: "mercearia" },
  { id: "feijao", name: "Feijão", category: "mercearia" },
  { id: "macarrao", name: "Macarrão", category: "mercearia" },
  { id: "molho_de_tomate", name: "Molho de tomate", category: "mercearia" },
  { id: "farinha", name: "Farinha", category: "mercearia" },
  { id: "acucar", name: "Açúcar", category: "mercearia" },
  { id: "sal", name: "Sal", category: "mercearia" },
  { id: "cafe", name: "Café", category: "mercearia" },
  { id: "oleo", name: "Óleo", category: "mercearia" },
  { id: "azeite", name: "Azeite", category: "mercearia" },
  { id: "chocolate", name: "Chocolate", category: "mercearia" },

  // Limpeza
  { id: "amaciante", name: "Amaciante", category: "limpeza" },
  { id: "sabao_em_po", name: "Sabão em pó", category: "limpeza" },
  { id: "detergente", name: "Detergente", category: "limpeza" },
  { id: "desinfetante", name: "Desinfetante", category: "limpeza" },
  { id: "agua_sanitaria", name: "Água sanitária", category: "limpeza" },
  { id: "esponja", name: "Esponja", category: "limpeza" },
  { id: "saco_de_lixo", name: "Saco de lixo", category: "limpeza" },

  // Higiene
  { id: "pasta_de_dente", name: "Pasta de dente", category: "higiene" },
  { id: "fio_dental", name: "Fio dental", category: "higiene" },
  { id: "sabonete", name: "Sabonete", category: "higiene" },
  { id: "shampoo", name: "Shampoo", category: "higiene" },
  { id: "condicionador", name: "Condicionador", category: "higiene" },
  { id: "papel_higienico", name: "Papel higiênico", category: "higiene" },
  { id: "desodorante", name: "Desodorante", category: "higiene" },

  // Bebidas
  { id: "agua_com_gas", name: "Água com gás", category: "bebidas" },
  { id: "agua_sem_gas", name: "Água sem gás", category: "bebidas" },
  { id: "refrigerante", name: "Refrigerante", category: "bebidas" },
  { id: "suco", name: "Suco", category: "bebidas" },
  { id: "cerveja_sem_alcool", name: "Cerveja sem álcool", category: "bebidas" }
];

interface CustomProduct {
  id: string;
  name: string;
  category: string;
}

interface UserShoppingConfig {
  disabledProductIds: string[];
  customProducts: CustomProduct[];
  cartItems: string[];
  whatsappNumber?: string;
}

interface ShoppingListProps {
  onBack?: () => void;
}

export const ShoppingList: React.FC<ShoppingListProps> = ({ onBack }) => {
  const { user } = useAuth();
  
  // Navigation & Sub-views status
  const [screen, setScreen] = useState<"list" | "config" | "cart">("list");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [configCategory, setConfigCategory] = useState<string>("meat");
  const [searchTerm, setSearchTerm] = useState("");
  const [newCustomName, setNewCustomName] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  // Core preferences state
  const [preferences, setPreferences] = useState<UserShoppingConfig>({
    disabledProductIds: [],
    customProducts: [],
    cartItems: [],
    whatsappNumber: ""
  });

  // Local state for phone input
  const [tempPhone, setTempPhone] = useState("");
  const [isEditingPhone, setIsEditingPhone] = useState(false);

  // Sync state with cloud Firestore + Local fallback
  useEffect(() => {
    if (!user?.uid) {
      const local = localStorage.getItem("personal_shopping_preferences");
      if (local) {
        try {
          setPreferences(JSON.parse(local));
        } catch (e) {
          console.error("Local preferences load error:", e);
        }
      }
      setIsLoading(false);
      return;
    }

    const docRef = doc(db, "users", user.uid, "shopping_list_config", "preferences");
    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as UserShoppingConfig;
        setPreferences({
          disabledProductIds: data.disabledProductIds || [],
          customProducts: data.customProducts || [],
          cartItems: data.cartItems || [],
          whatsappNumber: data.whatsappNumber || ""
        });
      } else {
        // Init state
        setPreferences({
          disabledProductIds: [],
          customProducts: [],
          cartItems: [],
          whatsappNumber: ""
        });
      }
      setIsLoading(false);
    }, (error) => {
      console.warn("Firestore blocked, running local session safety:", error);
      const local = localStorage.getItem("personal_shopping_preferences");
      if (local) {
        try {
          setPreferences(JSON.parse(local));
        } catch (e) {}
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  // Handle saving prefs
  const savePreferences = async (updated: UserShoppingConfig) => {
    setPreferences(updated);
    localStorage.setItem("personal_shopping_preferences", JSON.stringify(updated));

    if (user?.uid) {
      try {
        const docRef = doc(db, "users", user.uid, "shopping_list_config", "preferences");
        await setDoc(docRef, updated, { merge: true });
      } catch (error) {
        console.error("Firestore persistence error:", error);
      }
    }
  };

  // Get current active products
  const availableProducts = [
    ...DEFAULT_PRODUCTS.filter(p => !preferences.disabledProductIds.includes(p.id)),
    ...preferences.customProducts.filter(p => !preferences.disabledProductIds.includes(p.id))
  ];

  // Filtering products for the selection screen
  const filteredProducts = availableProducts.filter(product => {
    const matchesCategory = !selectedCategory || product.category === selectedCategory;
    const matchesSearch = !searchTerm || product.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Toggle products added in the cart
  const toggleCartItem = (name: string) => {
    const isAdded = preferences.cartItems.includes(name);
    const updatedCart = isAdded
      ? preferences.cartItems.filter(item => item !== name)
      : [...preferences.cartItems, name];

    savePreferences({
      ...preferences,
      cartItems: updatedCart
    });
  };

  // Trigger add customized option
  const handleAddCustomProduct = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCustomName.trim();
    if (!name) return;

    // Capitalize first character securely
    const capitalized = name.charAt(0).toUpperCase() + name.slice(1);
    const id = `custom_${Date.now()}`;

    const updatedCustom = [
      ...preferences.customProducts,
      { id, name: capitalized, category: configCategory }
    ];

    savePreferences({
      ...preferences,
      customProducts: updatedCustom
    });
    setNewCustomName("");
  };

  // Delete customized option
  const handleRemoveCustomProduct = (id: string, name: string) => {
    const updatedCustom = preferences.customProducts.filter(cp => cp.id !== id);
    const updatedCart = preferences.cartItems.filter(item => item !== name);
    const updatedDisabled = preferences.disabledProductIds.filter(did => did !== id);

    savePreferences({
      ...preferences,
      customProducts: updatedCustom,
      cartItems: updatedCart,
      disabledProductIds: updatedDisabled
    });
  };

  // Toggle item configured status in builder
  const toggleProductConfiguration = (id: string) => {
    const isDisabled = preferences.disabledProductIds.includes(id);
    const updatedDisabled = isDisabled
      ? preferences.disabledProductIds.filter(did => did !== id)
      : [...preferences.disabledProductIds, id];

    savePreferences({
      ...preferences,
      disabledProductIds: updatedDisabled
    });
  };

  // WhatsApp redirection link dispatch
  const handleSendToWhatsApp = (phoneToSend: string) => {
    const textHeader = `Minha lista de compras:\n\n`;
    const textBody = preferences.cartItems.map(item => `- ${item}`).join("\n");
    const fullMessage = encodeURIComponent(textHeader + textBody);
    
    const url = `https://wa.me/${phoneToSend}?text=${fullMessage}`;
    window.open(url, "_blank");
  };

  // Save number config and trigger wa.me
  const handleSavePhoneAndSend = () => {
    let clean = tempPhone.trim().replace(/\D/g, "");
    if (!clean) return;

    // Prepend Brazil country code if DDD prefix only
    if (clean.length === 11 || clean.length === 10) {
      clean = "55" + clean;
    }

    const updated = {
      ...preferences,
      whatsappNumber: clean
    };

    savePreferences(updated);
    setIsEditingPhone(false);
    handleSendToWhatsApp(clean);
  };

  // Loading Screen Layout
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 text-slate-400">
        <Loader2 className="animate-spin text-blue-500" size={32} />
        <p className="text-xs font-bold uppercase tracking-wider">Carregando lista...</p>
      </div>
    );
  }

  // SCREEN 1: THE CONFIGURATION BUILDER VIEW
  if (screen === "config") {
    return (
      <div className="flex flex-col lg:min-h-screen bg-slate-50">
        {/* Sticky Header */}
        <div className="bg-white border-b border-slate-100 p-4 sticky top-[calc(3.25rem+env(safe-area-inset-top))] lg:top-[env(safe-area-inset-top)] z-30 shadow-sm">
          <div className="max-w-xl mx-auto flex items-center justify-between">
            <button 
              onClick={() => setScreen("list")}
              className="flex items-center gap-1.5 p-2 rounded-xl text-slate-600 hover:bg-slate-50 transition-all font-black text-xs uppercase tracking-wider"
            >
              <ChevronLeft size={18} />
              <span>Voltar</span>
            </button>
            <div className="text-right">
              <h3 className="text-sm font-black text-slate-900 tracking-tight">Configurar Itens</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Monte sua lista base</p>
            </div>
          </div>
        </div>

        <div className="flex-1 px-4 py-6 max-w-xl mx-auto w-full space-y-6">
          {/* Helper card */}
          <div className="bg-orange-50/70 border border-orange-100 rounded-2xl p-4 text-xs font-semibold text-orange-900 leading-relaxed">
            Selecione quais produtos você quer disponíveis para compras Rápidas. Ative ou desative itens clicando na caixa de seleção. Adicione itens personalizados abaixo.
          </div>

          {/* Quick Custom Add Area */}
          <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm space-y-4">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
              Adicionar Produto Personalizado
            </span>
            <form onSubmit={handleAddCustomProduct} className="flex gap-2">
              <input
                type="text"
                placeholder="Ex: Iogurte Grego..."
                value={newCustomName}
                onChange={(e) => setNewCustomName(e.target.value)}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-all"
              />
              <button
                type="submit"
                className="bg-blue-600 text-white font-black text-xs uppercase px-5 rounded-xl hover:bg-blue-700 active:scale-95 transition-all shadow-md shadow-blue-500/10 flex items-center gap-1"
              >
                <Plus size={16} />
                <span>Add</span>
              </button>
            </form>
          </div>

          {/* Builder category horizontal tab list */}
          <div className="space-y-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-1">
              Selecione a categoria para gerenciar
            </span>
            <div className="flex overflow-x-auto gap-1.5 pb-2 scrollbar-hide -mx-4 px-4 sticky top-0 z-10 bg-slate-50/80 backdrop-blur-sm">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setConfigCategory(cat.id)}
                  className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all border ${
                    configCategory === cat.id
                      ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/10"
                      : "bg-white text-slate-500 border-slate-100 hover:border-slate-300"
                  }`}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Grid list of presets/custom items inside active configCategory */}
          <div className="bg-white border border-slate-100 rounded-3xl p-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-50 pb-3 mb-3">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {CATEGORIES.find(c => c.id === configCategory)?.label}
              </span>
              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                {
                  [
                    ...DEFAULT_PRODUCTS.filter(p => p.category === configCategory),
                    ...preferences.customProducts.filter(p => p.category === configCategory)
                  ].length
                } produtos
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                ...DEFAULT_PRODUCTS.filter(p => p.category === configCategory),
                ...preferences.customProducts.filter(p => p.category === configCategory)
              ].map(item => {
                const isEnabled = !preferences.disabledProductIds.includes(item.id);
                const isCustom = preferences.customProducts.some(cp => cp.id === item.id);

                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
                      isEnabled
                        ? "bg-white border-slate-100 shadow-sm"
                        : "bg-slate-50/50 border-slate-50 opacity-50"
                    }`}
                  >
                    <button
                      onClick={() => toggleProductConfiguration(item.id)}
                      className="flex-1 flex items-center gap-3 text-left"
                    >
                      <div className={`transition-colors ${isEnabled ? "text-blue-600" : "text-slate-300"}`}>
                        {isEnabled ? <CheckSquare size={20} /> : <Square size={20} />}
                      </div>
                      <span className={`text-sm font-bold tracking-tight ${isEnabled ? "text-slate-800" : "text-slate-400"}`}>
                        {item.name}
                      </span>
                    </button>

                    {isCustom && (
                      <button
                        onClick={() => handleRemoveCustomProduct(item.id, item.name)}
                        className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                        title="Excluir produto personalizado"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // SCREEN 2: CART REVIEW & WHATSAPP SENDER VIEW
  if (screen === "cart") {
    // Fill local reference variables based on preferences on open
    const hasPhone = !!preferences.whatsappNumber;
    if (hasPhone && !tempPhone) {
      setTempPhone(preferences.whatsappNumber || "");
    }

    return (
      <div className="flex flex-col lg:min-h-screen bg-slate-50">
        {/* Header */}
        <div className="bg-white border-b border-slate-100 p-4 sticky top-[calc(3.25rem+env(safe-area-inset-top))] lg:top-[env(safe-area-inset-top)] z-30 shadow-sm">
          <div className="max-w-xl mx-auto flex items-center justify-between">
            <button 
              onClick={() => {
                setScreen("list");
                setIsEditingPhone(false);
              }}
              className="flex items-center gap-1.5 p-2 rounded-xl text-slate-600 hover:bg-slate-50 transition-all font-black text-xs uppercase tracking-wider"
            >
              <ChevronLeft size={18} />
              <span>Voltar</span>
            </button>
            <div className="text-right">
              <h3 className="text-sm font-black text-slate-900 tracking-tight">Carrinho</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{preferences.cartItems.length} selecionados</p>
            </div>
          </div>
        </div>

        <div className="flex-1 px-4 py-6 max-w-xl mx-auto w-full flex flex-col justify-between">
          <div className="space-y-4">
            {preferences.cartItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 bg-white border border-slate-100 rounded-3xl text-center shadow-sm p-6">
                <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-500 mb-4 border border-blue-100">
                  <ShoppingCart size={28} />
                </div>
                <h4 className="text-base font-black text-slate-800">Carrinho Vazio</h4>
                <p className="text-xs text-slate-400 font-medium max-w-[200px] mt-1 mb-6">
                  Nenhum produto foi adicionado ainda. Toque em voltar para escolher produtos!
                </p>
                <button
                  onClick={() => setScreen("list")}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-black text-[10px] uppercase tracking-widest px-6 py-3 rounded-full shadow-lg shadow-blue-500/10 transition-all hover:scale-105 active:scale-95"
                >
                  Adicionar Produtos
                </button>
              </div>
            ) : (
              <div className="bg-white border border-slate-100 rounded-3xl shadow-sm p-5 space-y-4">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                  Revisar lista de compras
                </span>
                
                <div className="divide-y divide-slate-50 max-h-[45vh] overflow-y-auto pr-1">
                  {preferences.cartItems.map(itemName => (
                    <div key={itemName} className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                        <span className="text-sm font-bold text-slate-700">{itemName}</span>
                      </div>
                      <button
                        onClick={() => toggleCartItem(itemName)}
                        className="text-slate-300 hover:text-red-500 p-2.5 hover:bg-red-50 rounded-xl transition-all"
                        title="Remover do carrinho"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-slate-50 flex items-center justify-between text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  <span>Total de itens</span>
                  <span>{preferences.cartItems.length} produtos</span>
                </div>
              </div>
            )}
          </div>

          {preferences.cartItems.length > 0 && (
            <div className="space-y-4 mt-6">
              {/* WhatsApp Config Area */}
              {(!hasPhone || isEditingPhone) ? (
                <div className="bg-blue-50/50 border border-blue-100 p-5 rounded-3xl space-y-3 shadow-sm feedback-in">
                  <p className="text-xs font-black text-slate-800 uppercase tracking-wider">
                    Número do seu WhatsApp
                  </p>
                  <p className="text-[10px] text-slate-500 font-bold leading-relaxed">
                    Informe seu número com DDD para enviarmos a lista diretamente para ele. Ex: 11999999999
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="DDD + Número (Ex: 11999999999)"
                      value={tempPhone}
                      onChange={(e) => setTempPhone(e.target.value.replace(/\D/g, ""))}
                      className="flex-1 bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-all"
                    />
                    <button
                      onClick={handleSavePhoneAndSend}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase px-5 rounded-2xl transition-all active:scale-95 shadow-md shadow-blue-500/10"
                    >
                      Salvar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-100/50 border border-slate-100 rounded-2xl p-4 flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Envio configurado para</span>
                    <span className="text-xs font-bold text-slate-700">+{preferences.whatsappNumber}</span>
                  </div>
                  <button
                    onClick={() => {
                      setIsEditingPhone(true);
                      setTempPhone(preferences.whatsappNumber || "");
                    }}
                    className="flex items-center gap-1 text-[10px] font-black text-blue-600 hover:underline px-3 py-1.5 hover:bg-blue-50 rounded-xl transition-all"
                  >
                    <Edit2 size={12} />
                    <span>Alterar</span>
                  </button>
                </div>
              )}

              {/* ACTION SEND TO WHATSAPP BUTTON */}
              {hasPhone && !isEditingPhone && (
                <button
                  onClick={() => handleSendToWhatsApp(preferences.whatsappNumber!)}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 px-6 rounded-2xl font-black text-sm uppercase tracking-wider transition-all active:scale-98 shadow-xl shadow-emerald-600/10 hover:shadow-emerald-600/20 flex items-center justify-center gap-2"
                >
                  <Send size={18} />
                  <span>Enviar para mim no WhatsApp</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // SCREEN 3: MAIN LISTING (SELECTION IN CHIPS GRID)
  return (
    <div className="flex flex-col lg:min-h-screen bg-slate-50">
      {/* Sticky Top Section containing Header, Categories, and Search/Input */}
      <div className="sticky top-[calc(3.25rem+env(safe-area-inset-top))] lg:top-[env(safe-area-inset-top)] z-30 bg-white border-b border-slate-100 shadow-sm">
        {/* Header */}
        <div className="p-4 border-b border-slate-50 bg-white">
          <div className="max-w-xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              {onBack ? (
                <button 
                  onClick={onBack}
                  className="p-2 -ml-2 rounded-xl text-slate-600 hover:bg-slate-50 transition-all"
                >
                  <ChevronLeft size={20} />
                </button>
              ) : (
                <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center border border-blue-100 text-blue-600">
                  <ShoppingCart size={22} />
                </div>
              )}
              <div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight">Shopping Lista</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sua Lista do Dia</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Pulsing visual cart tracker */}
              {preferences.cartItems.length > 0 && (
                <button
                  onClick={() => setScreen("cart")}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-blue-500/15 active:scale-95 animate-pulse-subtle"
                >
                  <ShoppingCart size={15} />
                  <span>{preferences.cartItems.length} {preferences.cartItems.length === 1 ? "item" : "itens"}</span>
                </button>
              )}

              {/* Config loader button */}
              <button
                onClick={() => {
                  setScreen("config");
                  setSelectedCategory(null);
                }}
                className="p-2.5 bg-slate-100 hover:bg-slate-200/80 text-slate-600 rounded-2xl transition-all"
                title="Configurar produtos disponíveis"
              >
                <Settings size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Categories Tab Bar & Search Input Container */}
        <div className="px-4 py-3 bg-white space-y-3">
          <div className="max-w-xl mx-auto space-y-3">
            {/* Categories */}
            <div className="flex overflow-x-auto gap-2 pb-1 scrollbar-hide -mx-4 px-4">
              {CATEGORIES.map(cat => {
                const isActive = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(isActive ? null : cat.id)}
                    className={`shrink-0 flex items-center gap-1.5 px-4 py-2.5 border rounded-full text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                      isActive
                        ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/15 active:scale-95"
                        : "bg-white border-slate-100 text-slate-600 hover:border-slate-300 active:scale-95"
                    }`}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Filter Search Bar Input */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
              <input
                type="text"
                placeholder="Buscar produto cadastrado..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-100 border border-slate-200 rounded-xl py-3.5 pl-11 pr-4 text-xs font-bold text-slate-700 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid Area */}
      <div className="flex-1 px-4 py-6 max-w-xl mx-auto w-full space-y-6">
        {/* Active Products Block */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm min-h-[250px] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-50 pb-3 mb-4">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Toque para adicionar
              </span>
              {selectedCategory && (
                <button
                  onClick={() => setSelectedCategory(null)}
                  className="flex items-center gap-1 text-[10px] font-black text-blue-600 hover:underline bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-100/30 transition-all"
                >
                  <X size={12} />
                  <span>Limpar Filtro</span>
                </button>
              )}
            </div>

            {filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nenhum item visível</p>
                <p className="text-[10px] text-slate-400 mt-2 max-w-[220px]">
                  Todos os itens deste setor estão desabilitados nas configurações, ou não há resultados para sua pesquisa.
                </p>
                <button
                  onClick={() => setScreen("config")}
                  className="mt-4 text-[10px] font-black text-blue-600 hover:underline bg-blue-50 px-4 py-2 rounded-xl transition-all"
                >
                  Habilitar Produtos
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2.5 py-1">
                {filteredProducts.map(product => {
                  const isAdded = preferences.cartItems.includes(product.name);
                  return (
                    <button
                      key={product.id}
                      onClick={() => toggleCartItem(product.name)}
                      className={`px-3.5 py-2.5 rounded-full text-xs font-extrabold select-none flex items-center gap-1.5 transition-all outline-none duration-150 active:scale-95 ${
                        isAdded
                          ? "bg-green-550 bg-emerald-50 border border-emerald-200 text-emerald-700 shadow-sm"
                          : "bg-slate-50 border border-slate-100 text-slate-700 hover:border-blue-200 hover:bg-white"
                      }`}
                    >
                      <span className={`text-base font-black ${isAdded ? "text-emerald-600" : "text-slate-400"}`}>
                        {isAdded ? "✓" : "+"}
                      </span>
                      <span>{product.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick tracker footer */}
          <div className="pt-4 border-t border-slate-50 mt-6 flex items-center justify-between text-[9px] font-black uppercase text-slate-400 tracking-wider">
            <span>Sua Lista Hoje</span>
            <span>{preferences.cartItems.length} no carrinho</span>
          </div>
        </div>
      </div>
    </div>
  );
};
