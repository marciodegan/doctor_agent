import React, { useState, useEffect } from "react";
import { Plus, Trash2, Loader2, Check } from "lucide-react";
import { db } from "../../lib/firebase";
import { collection, query, where, getDocs, addDoc, doc, serverTimestamp, deleteDoc } from "firebase/firestore";
import { DoctorProviderMapping, Doctor } from "../../types/financial";
import { useGroup } from "../../contexts/GroupContext";

export function DoctorProviderMappingsManager() {
  const { activeGroup } = useGroup();
  const [mappings, setMappings] = useState<DoctorProviderMapping[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [newExecutante, setNewExecutante] = useState("");
  const [newPrestador, setNewPrestador] = useState("");
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    if (!activeGroup) return;
    fetchData();
  }, [activeGroup]);

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([fetchDoctors(), fetchMappings()]);
    setLoading(false);
  };

  const fetchDoctors = async () => {
    console.log("[Doctors] carregando");
    try {
      const doctorsRef = collection(db, "doctors");
      const doctorsSnapshot = await getDocs(doctorsRef);
      const doctorsData = doctorsSnapshot.docs
        .map(d => ({ id: d.id, ...d.data() } as Doctor))
        .filter(d => d.active !== false);
      
      console.log("[Doctors] quantidade:", doctorsData.length);
      console.log("[Doctors] dados:", doctorsData);
      setDoctors(doctorsData);
    } catch (error) {
      console.error("[Doctors] ERRO AO CARREGAR MÉDICOS", error);
    }
  };

  const fetchMappings = async () => {
    console.log("[Mappings] carregando", { teamId: activeGroup.id });
    try {
      const q = query(collection(db, "doctor_provider_mappings"), where("teamId", "==", activeGroup.id));
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(documentSnapshot => ({
        id: documentSnapshot.id,
        ...documentSnapshot.data()
      })) as DoctorProviderMapping[];
      
      data.forEach(m => console.log("[Mappings] registro:", { id: m.id, teamId: m.teamId, doctorId: m.doctorId }));
      
      setMappings(data);
      console.log("[Mappings] carregado");
    } catch (error) {
      console.error("[Mappings] erro", error);
    }
  };

  const handleAdd = async () => {
    if (!newExecutante || !newPrestador || !selectedDoctorId || !activeGroup) return;
    
    const selectedDoctor = doctors.find(d => d.id === selectedDoctorId);
    if (!selectedDoctor) return;

    const payload = {
      teamId: activeGroup.id,
      doctorId: selectedDoctor.id,
      doctorName: selectedDoctor.name,
      executante: newExecutante.trim(),
      prestador: newPrestador.trim(),
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    console.log("[Mapping] criando", payload);
    setAdding(true);
    try {
      await addDoc(collection(db, "doctor_provider_mappings"), payload);
      console.log("[Mapping] criado");
      setNewExecutante("");
      setNewPrestador("");
      setSelectedDoctorId("");
      fetchMappings();
    } catch (error) {
      console.error("[Mapping] erro", error);
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteMapping = async (mapping: DoctorProviderMapping) => {
    console.log("[Mapping] tentativa de exclusão", {
      id: mapping.id,
      teamId: mapping.teamId,
      executante: mapping.executante,
      prestador: mapping.prestador,
      doctorId: mapping.doctorId
    });

    if (!mapping.id) {
      console.error("[Mapping] ID DO DOCUMENTO AUSENTE", mapping);
      return;
    }

    setRemoving(mapping.id);
    try {
      const mappingRef = doc(db, "doctor_provider_mappings", mapping.id);
      await deleteDoc(mappingRef);
      console.log("[Mapping] excluído com sucesso:", mapping.id);
      setMappings(prev => prev.filter(item => item.id !== mapping.id));
    } catch (error) {
      console.error("[Mapping] ERRO AO EXCLUIR", { error, mappingId: mapping.id, teamId: mapping.teamId });
    } finally {
      setRemoving(null);
    }
  };

  if (loading) return <div className="p-12 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" /></div>;

  const doctorMap = new Map(doctors.map(doctor => [doctor.id, doctor]));

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-black text-gray-900 uppercase">Prestadores Vinculados</h3>
      
      <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <input placeholder="Executante" value={newExecutante} onChange={e => setNewExecutante(e.target.value)} className="p-3 border rounded-xl text-sm" />
          <input placeholder="Prestador" value={newPrestador} onChange={e => setNewPrestador(e.target.value)} className="p-3 border rounded-xl text-sm" />
          <select value={selectedDoctorId} onChange={e => setSelectedDoctorId(e.target.value)} className="p-3 border rounded-xl text-sm">
            <option value="">Selecione o Médico</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
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
            {mappings.map(m => {
              const doctor = doctorMap.get(m.doctorId);
              const displayDoctorName = doctor?.name || m.doctorName || "Médico não encontrado";
              return (
                <tr key={m.id} className="border-t">
                  <td className="p-4">{m.executante}</td>
                  <td className="p-4">{m.prestador}</td>
                  <td className="p-4">{displayDoctorName}</td>
                  <td className="p-4 text-center flex items-center justify-center gap-2">
                    <button onClick={() => handleDeleteMapping(m)} className="text-rose-600 hover:text-rose-800 transition">
                      {removing === m.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
