import React, { useState, useEffect } from "react";
import { Plus, Trash2, Loader2, Check } from "lucide-react";
import { db } from "../../lib/firebase";
import { collection, query, where, getDocs, addDoc, updateDoc, doc, serverTimestamp, deleteDoc } from "firebase/firestore";
import { DoctorProviderMapping } from "../../types/financial";
import { useGroup } from "../../contexts/GroupContext";

export function DoctorProviderMappingsManager() {
  const { activeGroup } = useGroup();
  const [mappings, setMappings] = useState<DoctorProviderMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [newExecutante, setNewExecutante] = useState("");
  const [newPrestador, setNewPrestador] = useState("");
  const [selectedDoctor, setSelectedDoctor] = useState(""); // Stores "key|name"
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    if (!activeGroup) return;
    fetchMappings();
  }, [activeGroup]);

  const fetchMappings = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "doctor_provider_mappings"), where("teamId", "==", activeGroup.id));
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DoctorProviderMapping));
      setMappings(data);
    } catch (e) {
      console.error("Error fetching mappings:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!newExecutante || !newPrestador || !selectedDoctor) return;
    
    const [doctorId, doctorName] = selectedDoctor.split("|");
    setAdding(true);
    try {
      const q = query(collection(db, "doctor_provider_mappings"), 
        where("teamId", "==", activeGroup.id),
        where("executante", "==", newExecutante),
        where("prestador", "==", newPrestador)
      );
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        alert("Já existe uma associação para essa combinação de Executante e Prestador.");
        setAdding(false);
        return;
      }

      await addDoc(collection(db, "doctor_provider_mappings"), {
        teamId: activeGroup.id,
        executante: newExecutante,
        prestador: newPrestador,
        doctorId,
        doctorName,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setNewExecutante("");
      setNewPrestador("");
      setSelectedDoctor("");
      fetchMappings();
    } catch (e) {
      console.error("Error adding mapping:", e);
      alert("Erro ao adicionar mapping");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (m: DoctorProviderMapping) => {
    if (!confirm(`Remover este vínculo?\nExecutante: ${m.executante}\nPrestador: ${m.prestador}\nMédico: ${m.doctorName}`)) return;
    
    setRemoving(m.id);
    try {
      await deleteDoc(doc(db, "doctor_provider_mappings", m.id));
      setMappings(mappings.filter(item => item.id !== m.id));
      alert("Vínculo removido com sucesso.");
    } catch (e) {
      console.error("Error removing mapping:", e);
      alert("Erro ao remover mapping.");
    } finally {
      setRemoving(null);
    }
  };

  const handleToggleActive = async (id: string, active: boolean) => {
    try {
      await updateDoc(doc(db, "doctor_provider_mappings", id), {
        active: !active,
        updatedAt: serverTimestamp()
      });
      fetchMappings();
    } catch (e) {
      console.error("Error updating mapping:", e);
    }
  };

  if (loading) return <div className="p-12 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" /></div>;

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-black text-gray-900 uppercase">Prestadores Vinculados</h3>
      
      <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <input placeholder="Executante" value={newExecutante} onChange={e => setNewExecutante(e.target.value)} className="p-3 border rounded-xl text-sm" />
          <input placeholder="Prestador" value={newPrestador} onChange={e => setNewPrestador(e.target.value)} className="p-3 border rounded-xl text-sm" />
          <select value={selectedDoctor} onChange={e => setSelectedDoctor(e.target.value)} className="p-3 border rounded-xl text-sm">
            <option value="">Selecione o Médico</option>
            {activeGroup?.doctors?.map((d: any) => (
              <option key={d.key} value={`${d.key}|${d.name}`}>{d.name}</option>
            ))}
          </select>
        </div>
        <button onClick={handleAdd} disabled={adding} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-blue-700 transition">
          {adding ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
          Adicionar Prestador
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-[10px]">
            <tr>
              <th className="p-4">Executante</th>
              <th className="p-4">Prestador</th>
              <th className="p-4">Médico</th>
              <th className="p-4 text-center">Ações</th>
            </tr>
          </thead>
          <tbody>
            {mappings.map(m => (
              <tr key={m.id} className="border-t">
                <td className="p-4">{m.executante}</td>
                <td className="p-4">{m.prestador}</td>
                <td className="p-4">{m.doctorName}</td>
                <td className="p-4 text-center flex items-center justify-center gap-2">
                  <button onClick={() => handleToggleActive(m.id, m.active)} className={m.active ? "text-emerald-600" : "text-gray-400"}>
                    <Check size={16} />
                  </button>
                  <button onClick={() => handleRemove(m)} className="text-rose-600 hover:text-rose-800 transition">
                    {removing === m.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
