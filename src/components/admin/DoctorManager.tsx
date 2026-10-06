import React, { useState, useEffect } from "react";
import { Plus, Trash2, Loader2, UserPlus, Save, X } from "lucide-react";
import { db } from "../../lib/firebase";
import { collection, query, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, deleteDoc } from "firebase/firestore";
import { useGroup } from "../../contexts/GroupContext";

interface Doctor {
  id: string;
  name: string;
  specialty: string;
  crm: string;
  active: boolean;
}

export function DoctorManager() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState<Doctor | null>(null);
  const [formData, setFormData] = useState({ name: "", specialty: "", crm: "" });

  useEffect(() => {
    const q = query(collection(db, "doctors"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Doctor));
      setDoctors(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSave = async () => {
    if (!formData.name || !formData.specialty) return;
    
    if (isEditing) {
      await updateDoc(doc(db, "doctors", isEditing.id), {
        ...formData,
        updatedAt: serverTimestamp()
      });
    } else {
      await addDoc(collection(db, "doctors"), {
        ...formData,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
    setFormData({ name: "", specialty: "", crm: "" });
    setIsEditing(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este médico?")) return;
    await deleteDoc(doc(db, "doctors", id));
  };

  if (loading) return <div className="p-12 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" /></div>;

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-black text-gray-900 uppercase">Gerenciar Médicos</h3>
      
      <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
        <h4 className="font-bold">{isEditing ? "Editar Médico" : "Novo Médico"}</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input placeholder="Nome" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="p-3 border rounded-xl" />
          <input placeholder="Especialidade" value={formData.specialty} onChange={e => setFormData({...formData, specialty: e.target.value})} className="p-3 border rounded-xl" />
          <input placeholder="CRM" value={formData.crm} onChange={e => setFormData({...formData, crm: e.target.value})} className="p-3 border rounded-xl" />
        </div>
        <div className="flex gap-2">
          <button onClick={handleSave} className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2">
            <Save size={16} /> {isEditing ? "Atualizar" : "Salvar"}
          </button>
          {isEditing && (
            <button onClick={() => {setIsEditing(null); setFormData({name: "", specialty: "", crm: ""})}} className="bg-gray-200 px-6 py-2 rounded-xl font-bold">
              <X size={16} /> Cancelar
            </button>
          )}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-[10px]">
            <tr>
              <th className="p-4">Nome</th>
              <th className="p-4">Especialidade</th>
              <th className="p-4">CRM</th>
              <th className="p-4 text-center">Ações</th>
            </tr>
          </thead>
          <tbody>
            {doctors.map(d => (
              <tr key={d.id} className="border-t">
                <td className="p-4">{d.name}</td>
                <td className="p-4">{d.specialty}</td>
                <td className="p-4">{d.crm}</td>
                <td className="p-4 text-center flex justify-center gap-2">
                  <button onClick={() => {setIsEditing(d); setFormData({name: d.name, specialty: d.specialty, crm: d.crm})}} className="text-blue-600">Editar</button>
                  <button onClick={() => handleDelete(d.id)} className="text-rose-600"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
