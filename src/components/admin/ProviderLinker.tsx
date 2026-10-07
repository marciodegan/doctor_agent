import React, { useState, useEffect } from "react";
import { Plus, Trash2, Check } from "lucide-react";
import { db } from "../../lib/firebase";
import { collection, addDoc, query, onSnapshot, doc, where, updateDoc } from "firebase/firestore";
import { useGroup } from "../../contexts/GroupContext";

interface ProviderLink {
  id: string;
  executante: string;
  prestador: string;
  medicoId: string;
  medicoName: string;
}

export function ProviderLinker({ doctors }: { doctors: any[] }) {
  const { activeGroup } = useGroup();
  const [links, setLinks] = useState<ProviderLink[]>([]);
  const [formData, setFormData] = useState({ executante: "", prestador: "", medicoId: "" });

  useEffect(() => {
    if (!activeGroup) return;
    const q = query(
      collection(db, "doctor_provider_mappings"),
      where("teamId", "==", activeGroup.id),
      where("active", "==", true)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setLinks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProviderLink)));
    });
    return unsubscribe;
  }, [activeGroup]);

  const handleAdd = async () => {
    if (!formData.executante || !formData.prestador || !formData.medicoId) return;
    const medico = doctors.find(d => d.id === formData.medicoId);
    await addDoc(collection(db, "doctor_provider_mappings"), {
      teamId: activeGroup!.id,
      executante: formData.executante,
      prestador: formData.prestador,
      doctorId: formData.medicoId,
      doctorName: medico?.name || "",
      active: true
    });
    setFormData({ executante: "", prestador: "", medicoId: "" });
  };

  const handleDelete = async (id: string) => {
    await updateDoc(doc(db, "doctor_provider_mappings", id), { active: false });
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-6">
      <h3 className="text-lg font-black text-gray-900 uppercase">Prestadores Vinculados</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <input placeholder="Executante" value={formData.executante} onChange={e => setFormData({...formData, executante: e.target.value})} className="p-3 border rounded-xl" />
        <input placeholder="Prestador" value={formData.prestador} onChange={e => setFormData({...formData, prestador: e.target.value})} className="p-3 border rounded-xl" />
        <select value={formData.medicoId} onChange={e => setFormData({...formData, medicoId: e.target.value})} className="p-3 border rounded-xl">
          <option value="">Selecione o Médico</option>
          {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>
      
      <button onClick={handleAdd} className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2">
        <Plus size={16} /> Adicionar Prestador
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
          {links.map(l => (
            <tr key={l.id} className="border-t">
              <td className="p-4">{l.executante}</td>
              <td className="p-4">{l.prestador}</td>
              <td className="p-4">{l.medicoName}</td>
              <td className="p-4 text-center">
                <button onClick={() => handleDelete(l.id)} className="text-rose-600"><Trash2 size={16} /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
