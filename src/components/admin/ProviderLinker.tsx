import React, { useState, useEffect } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { db } from "../../lib/firebase";
import { collection, addDoc, query, onSnapshot, doc, where, deleteDoc, serverTimestamp } from "firebase/firestore";
import { useGroup } from "../../contexts/GroupContext";

interface ProviderLink {
  id: string;
  teamId: string;
  executante: string;
  prestador: string;
  doctorId: string;
  doctorName: string;
  active: boolean;
}

export function ProviderLinker({ doctors }: { doctors: any[] }) {
  const { activeGroup } = useGroup();
  const [links, setLinks] = useState<ProviderLink[]>([]);
  const [formData, setFormData] = useState({ executante: "", prestador: "", doctorId: "" });
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  useEffect(() => {
    if (!activeGroup) return;
    const q = query(
      collection(db, "doctor_provider_mappings"),
      where("teamId", "==", activeGroup.id)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProviderLink));
      setLinks(data.filter(l => l.active !== false));
    });
    return unsubscribe;
  }, [activeGroup]);

  const handleAdd = async () => {
    if (!formData.executante || !formData.prestador || !formData.doctorId || !activeGroup) return;
    const doctor = doctors.find(d => d.id === formData.doctorId);
    
    setLoadingAction("add");
    try {
      await addDoc(collection(db, "doctor_provider_mappings"), {
        teamId: activeGroup.id,
        executante: formData.executante.trim(),
        prestador: formData.prestador.trim(),
        doctorId: formData.doctorId,
        doctorName: doctor?.name || "",
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setFormData({ executante: "", prestador: "", doctorId: "" });
    } catch (e) {
      console.error("Error adding mapping:", e);
      alert("Erro ao adicionar vínculo.");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleDelete = async (link: ProviderLink) => {
    if (!confirm("Tem certeza que deseja excluir este vínculo?")) return;
    
    setLoadingAction(link.id);
    try {
      await deleteDoc(doc(db, "doctor_provider_mappings", link.id));
      setLinks(prev => prev.filter(l => l.id !== link.id));
    } catch (e) {
      console.error("Error deleting mapping:", e);
      alert("Erro ao remover vínculo: " + (e as Error).message);
    } finally {
      setLoadingAction(null);
    }
  };

  const doctorMap = new Map(doctors.map(d => [d.id, d]));

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-6">
      <h3 className="text-lg font-black text-gray-900 uppercase">Prestadores Vinculados</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <input placeholder="Executante" value={formData.executante} onChange={e => setFormData({...formData, executante: e.target.value})} className="p-3 border rounded-xl" />
        <input placeholder="Prestador" value={formData.prestador} onChange={e => setFormData({...formData, prestador: e.target.value})} className="p-3 border rounded-xl" />
        <select value={formData.doctorId} onChange={e => setFormData({...formData, doctorId: e.target.value})} className="p-3 border rounded-xl">
          <option value="">Selecione o Médico</option>
          {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>
      
      <button onClick={handleAdd} disabled={!!loadingAction} className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2">
        {loadingAction === "add" ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />} 
        Adicionar Prestador
      </button>

      <table className="w-full text-left text-sm mt-4">
        <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-[10px]">
          <tr>
            <th className="p-4">Executante</th>
            <th className="p-4">Prestador</th>
            <th className="p-4">Médico</th>
            <th className="p-4 text-center">Ações</th>
          </tr>
        </thead>
        <tbody>
          {links.map(l => {
            const doctor = doctorMap.get(l.doctorId);
            const doctorName = doctor?.name || l.doctorName || "Médico não encontrado";
            return (
              <tr key={l.id} className="border-t">
                <td className="p-4">{l.executante}</td>
                <td className="p-4">{l.prestador}</td>
                <td className="p-4">{doctorName}</td>
                <td className="p-4 text-center">
                  <button onClick={() => handleDelete(l)} className="text-rose-600 hover:text-rose-800 transition">
                    {loadingAction === l.id ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
