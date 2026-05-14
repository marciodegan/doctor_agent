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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [isAdding, setIsAdding] = useState(false);

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

  const startEditing = (note: Note) => {
    setEditingId(note.id);
    setEditContent(note.content);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditContent("");
  };

  const handleUpdateNote = async (id: string) => {
    if (!editContent.trim()) return;
    try {
      await updateDoc(doc(db, "user_notes", id), {
        content: editContent.trim(),
        updatedAt: serverTimestamp()
      });
      setEditingId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `user_notes/${id}`);
    }
  };

  return (
    <div className="flex flex-col h-full bg-yellow-50/30">
      {/* Header */}
      <div className="bg-white border-b border-yellow-100 p-4 sticky top-0 z-20">
        <div className="max-w-xl mx-auto flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-yellow-50 flex items-center justify-center border border-yellow-100 text-yellow-600">
              <StickyNote size={22} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 tracking-tight">Minhas Notas</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Particulares</p>
            </div>
          </div>

          <form onSubmit={handleAddNote} className="relative">
            <div className="relative flex flex-col gap-2">
              <textarea 
                placeholder="Escreva algo rápido..."
                value={newNoteContent}
                onChange={(e) => setNewNoteContent(e.target.value)}
                className="w-full bg-slate-100 border-none rounded-xl py-3 px-4 text-sm font-bold text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-yellow-200 outline-none transition-all resize-none min-h-[80px]"
              />
              <button 
                type="submit"
                disabled={!newNoteContent.trim() || isAdding}
                className="w-full bg-yellow-500 hover:bg-yellow-600 disabled:opacity-50 text-white py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {isAdding ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                Salvar Nota
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="max-w-xl mx-auto space-y-3">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 grayscale opacity-30">
              <Loader2 size={40} className="animate-spin text-yellow-500 mb-2" />
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Carregando Notas...</p>
            </div>
          ) : notes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 grayscale opacity-30 text-center">
              <StickyNote size={60} className="text-slate-300 mb-4" />
              <p className="text-lg font-black text-slate-400">Nenhuma nota ainda</p>
              <p className="text-xs font-medium text-slate-400 mt-1 max-w-[200px]">
                Use o campo acima para salvar lembretes e anotações rápidas.
              </p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {notes.map((note) => (
                <motion.div
                  key={note.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="bg-white border border-yellow-100 p-4 rounded-2xl shadow-sm hover:shadow-md transition-all relative group"
                >
                  {editingId === note.id ? (
                    <div className="flex flex-col gap-2">
                      <textarea 
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-sm text-slate-700 outline-none focus:ring-1 focus:ring-yellow-400 min-h-[80px] resize-none"
                        autoFocus
                      />
                      <div className="flex items-center gap-2 justify-end">
                        <button 
                          onClick={cancelEditing}
                          className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
                        >
                          <X size={18} />
                        </button>
                        <button 
                          onClick={() => handleUpdateNote(note.id)}
                          className="bg-yellow-500 text-white p-2 rounded-lg font-bold text-xs flex items-center gap-1"
                        >
                          <Check size={16} /> Salvar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-slate-700 whitespace-pre-wrap leading-relaxed pr-8">
                        {note.content}
                      </p>
                      
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-50">
                        <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">
                          {note.createdAt?.toDate ? note.createdAt.toDate().toLocaleDateString('pt-BR') : 'Agora'}
                        </span>
                        
                        <div className="flex items-center gap-1 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => startEditing(note)}
                            className="p-2 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button 
                            onClick={() => handleRemoveNote(note.id)}
                            className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 bg-white border-t border-yellow-100">
        <div className="max-w-xl mx-auto flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
          <div className="flex items-center gap-2 font-black text-yellow-600">
            TOTAL DE NOTAS: {notes.length}
          </div>
          <div className="text-[8px] opacity-60">Sincronizado com sua conta</div>
        </div>
      </div>
    </div>
  );
};
