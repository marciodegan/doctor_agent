import React, { useState, useEffect } from "react";
import { Plus, Trash2, Loader2, UserPlus, Save, X } from "lucide-react";
import { db } from "../../lib/firebase";
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, deleteDoc } from "firebase/firestore";
import { useGroup } from "../../contexts/GroupContext";
import { TeamRateioConfig } from "../TeamRateioConfig";
import { ProviderLinker } from "./ProviderLinker";

interface Doctor {
  id: string;
  name: string;
  specialty: string;
  crm: string;
  active: boolean;
  valorLimite?: number;
}

export function DoctorManager() {
  const { activeGroup, apiFetch } = useGroup();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [teamSettings, setTeamSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);
  
  const [isEditing, setIsEditing] = useState<Doctor | null>(null);
  const [formData, setFormData] = useState({ name: "", specialty: "", crm: "", valorLimite: "0" });

  const mergedDoctors = React.useMemo(() => {
    if (!teamSettings) return [];
    return doctors.map(d => {
      const existing = teamSettings.doctors.find((td: any) => td.key === d.id);
      return existing ? { ...existing, name: d.name, specialty: d.specialty, crm: d.crm, valorLimite: Number(existing.valorLimite ?? d.valorLimite) || 0 } : {
        key: d.id,
        name: d.name,
        specialty: d.specialty,
        crm: d.crm,
        valorLimite: Number(d.valorLimite) || 0,
        isTeamMember: false,
        teamSharePercent: 0,
        proporcaoHeartDinamica: 0,
        disponivelPeriodo: 0,
        participaUnimed: false,
        unimedDistributionRule: "EQUAL"
      };
    });
  }, [doctors, teamSettings]);

  useEffect(() => {
    if (!activeGroup?.id) {
      setDoctors([]);
      setLoading(false);
      return;
    }

    let unsubscribeDoctors: (() => void) | undefined;
    let cancelled = false;
    setDoctors([]);
    setLoading(true);

    const subscribeToTeamDoctors = async () => {
      try {
        // The endpoint only migrates legacy unscoped doctors to Heart.
        // Other teams never inherit the legacy catalog.
        await apiFetch("/api/app/financial/doctors/migrate-legacy", {
          method: "POST",
          body: JSON.stringify({})
        });
      } catch (error) {
        console.error("Migração inicial de médicos antigos:", error);
      }
      if (cancelled) return;
      const doctorsCol = collection(db, "doctors");
      const qDoctors = query(doctorsCol, where("teamId", "==", activeGroup.id));
      unsubscribeDoctors = onSnapshot(qDoctors, (snapshot) => {
        const data = snapshot.docs.map(item => ({ id: item.id, ...item.data() } as Doctor));
        setDoctors(data);
        setLoading(false);
      }, (error) => {
        console.error("Falha ao carregar médicos da equipe:", error);
        setDoctors([]);
        setLoading(false);
      });
    };
    subscribeToTeamDoctors();

    const fetchTeamSettings = async () => {
        try {
          const res = await apiFetch("/api/app/financial/team-settings");
          if (res.ok) {
            const data = await res.json();
            setTeamSettings(data);
          }
        } catch (e) {
          console.error("Failed to load team settings:", e);
        }
      };
      fetchTeamSettings();

    return () => {
      cancelled = true;
      unsubscribeDoctors?.();
    };
  }, [activeGroup?.id]);

  const handleSaveSettings = async () => {
    try {
      setSavingSettings(true);
      const updatedSettings = { ...teamSettings, doctors: mergedDoctors };

      const res = await apiFetch("/api/app/financial/team-settings", {
        method: "POST",
        body: JSON.stringify(updatedSettings)
      });
      if (res.ok) {
        await Promise.all(mergedDoctors.map(async (doctor: any) => {
          const firestoreDoctor = doctors.find(d => d.id === doctor.key);
          if (firestoreDoctor) {
            await updateDoc(doc(db, "doctors", firestoreDoctor.id), {
              teamId: activeGroup?.id,
              valorLimite: Math.max(0, Number(doctor.valorLimite) || 0),
              updatedAt: serverTimestamp()
            });
          }
        }));
        setTeamSettings(updatedSettings);
        setSettingsSuccess(true);
        setTimeout(() => setSettingsSuccess(false), 3000);
      }
    } catch (e: any) {
      alert("Erro ao salvar configurações da equipe: " + e.message);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.specialty) return;
    
    if (isEditing) {
      await updateDoc(doc(db, "doctors", isEditing.id), {
        ...formData,
        teamId: activeGroup?.id,
        valorLimite: Math.max(0, Number(formData.valorLimite) || 0),
        updatedAt: serverTimestamp()
      });
    } else {
      if (!activeGroup?.id) return;
      await addDoc(collection(db, "doctors"), {
        ...formData,
        teamId: activeGroup.id,
        valorLimite: Math.max(0, Number(formData.valorLimite) || 0),
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
    setFormData({ name: "", specialty: "", crm: "", valorLimite: "0" });
    setIsEditing(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este médico?")) return;
    await deleteDoc(doc(db, "doctors", id));
  };

  if (loading) return <div className="p-12 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" /></div>;

  return (
    <div className="space-y-12">
      <div className="space-y-6">
        <h3 className="text-lg font-black text-gray-900 uppercase">Gerenciar Médicos</h3>
        
        <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
          <h4 className="font-bold">{isEditing ? "Editar Médico" : "Novo Médico"}</h4>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <input placeholder="Nome" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="p-3 border rounded-xl" />
            <input placeholder="Especialidade" value={formData.specialty} onChange={e => setFormData({...formData, specialty: e.target.value})} className="p-3 border rounded-xl" />
            <input placeholder="CRM" value={formData.crm} onChange={e => setFormData({...formData, crm: e.target.value})} className="p-3 border rounded-xl" />
            <input type="number" min="0" step="0.01" placeholder="Valor Limite (R$)" value={formData.valorLimite} onChange={e => setFormData({...formData, valorLimite: e.target.value})} className="p-3 border rounded-xl" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2">
              <Save size={16} /> {isEditing ? "Atualizar" : "Salvar"}
            </button>
            {isEditing && (
              <button onClick={() => {setIsEditing(null); setFormData({name: "", specialty: "", crm: "", valorLimite: "0"})}} className="bg-gray-200 px-6 py-2 rounded-xl font-bold">
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
                <th className="p-4">Valor Limite</th>
                <th className="p-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {doctors.map(d => (
                <tr key={d.id} className="border-t">
                  <td className="p-4">{d.name}</td>
                  <td className="p-4">{d.specialty}</td>
                  <td className="p-4">{d.crm}</td>
                  <td className="p-4 font-mono">{(Number(d.valorLimite) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                  <td className="p-4 text-center flex justify-center gap-2">
                    <button onClick={() => {setIsEditing(d); setFormData({name: d.name, specialty: d.specialty, crm: d.crm, valorLimite: String(d.valorLimite ?? 0)})}} className="text-blue-600">Editar</button>
                    <button onClick={() => handleDelete(d.id)} className="text-rose-600"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        <ProviderLinker doctors={doctors} />
      </div>

      {teamSettings && (
        <TeamRateioConfig 
          teamSettings={{ ...teamSettings, doctors: mergedDoctors }}
          setTeamSettings={(newSettings) => setTeamSettings(newSettings)}
          onSave={handleSaveSettings}
          saving={savingSettings}
          success={settingsSuccess}
        />
      )}
    </div>
  );
}
