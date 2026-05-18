import React, { useState, useEffect } from "react";
import { 
  StickyNote, 
  Plus, 
  Trash2, 
  Loader2,
  Trash,
  Edit2,
  Check,
  X
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../hooks/useAuth";
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc,
  updateDoc,
  doc, 
  deleteDoc, 
  serverTimestamp,
  orderBy,
  where
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { OperationType, handleFirestoreError } from "../lib/firestoreUtils";

interface Note {
  id: string;
  content: string;
  createdAt: any;
  updatedAt?: any;
}

export const PersonalNotes: React.FC = () => {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newNoteContent, setNewNoteContent] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!user?.uid) return;

    const q = query(
      collection(db, "user_notes"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedNotes = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Note[];
      
      setNotes(fetchedNotes);
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "user_notes");
    });

    return () => unsubscribe();
  }, [user?.uid]);

  const handleAddNote = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newNoteContent.trim() || !user?.uid) return;

    setIsAdding(true);
    try {
      await addDoc(collection(db, "user_notes"), {
        userId: user.uid,
        content: newNoteContent.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setNewNoteContent("");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "user_notes");
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveNote = async (id: string) => {
    try {
      await deleteDoc(doc(db, "user_notes", id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `user_notes/${id}`);
    }
  };

  const handleUpdateNote = async (id: string, newContent: string) => {
    if (!newContent.trim()) return;
    try {
      await updateDoc(doc(db, "user_notes", id), {
        content: newContent.trim(),
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `user_notes/${id}`);
    }
  };

  const filteredNotes = notes.filter(n => 
    n.content.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 p-4 z-20 shadow-sm">
        <div className="max-w-xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-yellow-50 flex items-center justify-center border border-yellow-100 text-yellow-600">
            <StickyNote size={22} />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900 tracking-tight">Minhas Notas</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Particulares</p>
          </div>
        </div>
      </div>

      {/* Sticky Form */}
      <div className="sticky top-[calc(3.25rem+env(safe-area-inset-top))] lg:top-[env(safe-area-inset-top)] z-30 bg-white border-b border-slate-100 px-4 py-3 shadow-sm">
        <div className="max-w-xl mx-auto flex flex-col gap-2">
          <form onSubmit={handleAddNote} className="relative">
            <Plus className="absolute left-3 top-1/2 -translate-y-1/2 text-yellow-500" size={18} />
            <input 
              type="text"
              placeholder="Escreva algo novo..."
              value={newNoteContent}
              onChange={(e) => setNewNoteContent(e.target.value)}
              className="w-full bg-slate-100 border border-slate-200 rounded-xl py-4 pl-10 pr-16 text-sm font-bold text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-yellow-500/20 focus:border-yellow-500 outline-none transition-all"
            />
            {newNoteContent.trim() && (
              <button 
                type="submit"
                disabled={isAdding}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-yellow-600 text-white px-3 py-1.5 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 flex items-center gap-1 shadow-lg shadow-yellow-600/20"
              >
                {isAdding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                ADD
              </button>
            )}
          </form>

          <div className="relative">
            <input 
              type="text"
              placeholder="Buscar nas notas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-100/50 border border-slate-100 rounded-xl py-2 px-4 text-xs font-semibold text-slate-600 placeholder:text-slate-400 outline-none transition-all"
            />
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 px-4 py-4">
        <div className="max-w-xl mx-auto space-y-3">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 grayscale opacity-30">
              <Loader2 size={40} className="animate-spin text-yellow-500 mb-2" />
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Sincronizando...</p>
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 grayscale opacity-30 text-center">
              <StickyNote size={60} className="text-slate-300 mb-4" />
              <p className="text-lg font-black text-slate-400">
                {searchTerm ? "Nenhuma nota encontrada" : "Sua lista está vazia"}
              </p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {filteredNotes.map((note) => (
                <motion.div
                  key={note.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="group flex items-center gap-4 p-4 bg-white rounded-2xl border border-slate-100 transition-all hover:border-blue-100 hover:shadow-xl hover:shadow-blue-900/5 shadow-sm"
                >
                  <div className="flex-1">
                    <input
                      type="text"
                      className="w-full bg-transparent border-none p-0 text-[15px] font-bold tracking-tight text-slate-700 focus:ring-0 outline-none"
                      defaultValue={note.content}
                      onBlur={(e) => {
                        if (e.target.value !== note.content) {
                          handleUpdateNote(note.id, e.target.value);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                    />
                    <div className="text-[9px] font-black text-slate-300 uppercase mt-1 tracking-wider">
                      {note.createdAt?.toDate ? note.createdAt.toDate().toLocaleDateString('pt-BR') : 'Recent'}
                    </div>
                  </div>
                  <button 
                    onClick={() => handleRemoveNote(note.id)}
                    className="p-2.5 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all flex items-center justify-center"
                    title="Excluir nota"
                  >
                    <Trash2 size={18} />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* Footer Info */}
      <div className="p-4 bg-white border-t border-slate-100">
        <div className="max-w-xl mx-auto flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
            TOTAL DE NOTAS: {notes.length}
          </div>
          <div>Sincronizado via Cloud</div>
        </div>
      </div>
    </div>
  );
};