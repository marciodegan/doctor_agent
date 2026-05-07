import React, { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { useGroup } from "../contexts/GroupContext";
import { db } from "../lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { Camera, Loader2, Check, User as UserIcon, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export function Profile({ onHose }: { onHose?: () => void }) {
  const { user } = useAuth();
  const { updateProfile } = useGroup();
  const [displayName, setDisplayName] = useState("");
  const [photoURL, setPhotoURL] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!user) return;
    
    const fetchProfile = async () => {
      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setDisplayName(data.displayName || "");
          setPhotoURL(data.photoURL || "");
        }
      } catch (err) {
        console.error("Error fetching profile:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setSaving(true);
    setError("");
    setSuccess(false);
    
    try {
      await updateProfile(displayName, photoURL);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || "Erro ao salvar perfil");
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);
    setError("");

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = (reader.result as string).split(",")[1];
        
        const res = await fetch("/api/storage/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `avatars/${user.uid}_${Date.now()}.jpg`,
            mimeType: file.type,
            base64Data
          })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");

        setPhotoURL(data.url);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setError(err.message || "Erro no upload");
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-xl shadow-blue-500/5 overflow-hidden">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-black text-gray-900 tracking-tight">Meu Perfil</h3>
        {onHose && (
          <button onClick={onHose} className="p-2 hover:bg-gray-100 rounded-xl transition-all text-gray-400">
            <X size={20} />
          </button>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="flex flex-col items-center">
          <div className="relative group">
            <div className="w-24 h-24 rounded-full bg-gray-100 border-4 border-white shadow-lg overflow-hidden flex items-center justify-center text-gray-400">
              {photoURL ? (
                <img src={photoURL} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <UserIcon size={40} />
              )}
              
              {uploading && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white">
                  <Loader2 className="animate-spin" size={20} />
                </div>
              )}
            </div>
            
            <label className="absolute bottom-0 right-0 p-2 bg-blue-600 text-white rounded-full shadow-lg border-2 border-white cursor-pointer hover:bg-blue-700 transition-all">
              <Camera size={14} />
              <input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} disabled={uploading} />
            </label>
          </div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-4">Foto do Perfil</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 px-1">Nome de Exibição</label>
            <input 
              type="text"
              placeholder="Seu nome"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 px-4 py-3 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm"
              required
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 px-1">Email (Somente leitura)</label>
            <input 
              type="email"
              value={user?.email || ""}
              disabled
              className="w-full bg-gray-50 border border-gray-100 px-4 py-3 rounded-2xl text-sm font-medium text-gray-400 outline-none cursor-not-allowed italic"
            />
          </div>
        </div>

        {error && <p className="text-xs text-red-500 font-bold px-1">{error}</p>}

        <button 
          type="submit"
          disabled={saving || uploading}
          className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 active:scale-95 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="animate-spin" size={20} />
          ) : success ? (
            <Check size={20} />
          ) : (
            "SALVAR ALTERAÇÕES"
          )}
        </button>
      </form>
    </div>
  );
}
