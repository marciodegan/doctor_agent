import React, { useState, useEffect } from "react";
import { X, User, Building2, Activity, Plus, Stethoscope, Loader2 } from "lucide-react";
import { useGroup } from "../contexts/GroupContext";

interface NewPatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function NewPatientModal({ isOpen, onClose, onSuccess }: NewPatientModalProps) {
  const { apiFetch } = useGroup();
  const [nome, setNome] = useState("");
  const [fone, setFone] = useState("");
  const [idade, setIdade] = useState("");
  const [cpf, setCpf] = useState("");
  const [hospitalName, setHospitalName] = useState("");
  const [status, setStatus] = useState("Em Andamento");
  const [procedimento, setProcedimento] = useState("");
  const [hospitals, setHospitals] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    // Fetch hospitals and statuses
    apiFetch("/api/app/hospitals")
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setHospitals(data);
      })
      .catch(e => console.warn("Failed to load hospitals", e));

    apiFetch("/api/patients?full=true")
      .then(res => res.json())
      .then(data => {
        if (data && Array.isArray(data.statuses)) {
          setStatuses(data.statuses);
        }
      })
      .catch(e => console.warn("Failed to load statuses", e));
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      setError("Nome do paciente é obrigatório.");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const res = await apiFetch("/api/app/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nome.trim(),
          fone: fone.trim(),
          idade: idade.trim(),
          cpf: cpf.trim(),
          hospitalName: hospitalName.trim(),
          status: status.trim(),
          procedimento: procedimento.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao cadastrar paciente");
      }

      setNome("");
      setFone("");
      setIdade("");
      setCpf("");
      setHospitalName("");
      setProcedimento("");
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Erro ao cadastrar paciente");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-gray-100 space-y-6 relative animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <User size={20} />
            </div>
            <div>
              <h3 className="text-xl font-black text-gray-900 tracking-tight">Novo Paciente</h3>
              <p className="text-xs text-gray-500 font-medium">Cadastre um novo paciente no workspace</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 bg-gray-50 hover:bg-gray-100 rounded-xl flex items-center justify-center text-gray-500 transition"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-100 text-red-600 rounded-xl text-xs font-semibold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">
              Nome Completo *
            </label>
            <input
              type="text"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Maria da Silva"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-medium focus:outline-none focus:border-blue-600 focus:bg-white transition"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">
                Hospital / Unidade
              </label>
              <input
                type="text"
                list="hospitals-list"
                value={hospitalName}
                onChange={(e) => setHospitalName(e.target.value)}
                placeholder="Ex: Hospital Central"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-medium focus:outline-none focus:border-blue-600 focus:bg-white transition"
              />
              <datalist id="hospitals-list">
                {hospitals.map(h => (
                  <option key={h.id} value={h.nome || h.name} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">
                Status / Condição
              </label>
              <input
                type="text"
                list="statuses-list"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                placeholder="Ex: Pré-operatório, UTI"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-medium focus:outline-none focus:border-blue-600 focus:bg-white transition"
              />
              <datalist id="statuses-list">
                {statuses.map(s => (
                  <option key={s.id} value={s.nome || s.name} />
                ))}
              </datalist>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">
              Procedimento / Cirurgia
            </label>
            <input
              type="text"
              value={procedimento}
              onChange={(e) => setProcedimento(e.target.value)}
              placeholder="Ex: Revascularização do Miocárdio"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-medium focus:outline-none focus:border-blue-600 focus:bg-white transition"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">
                Idade
              </label>
              <input
                type="text"
                value={idade}
                onChange={(e) => setIdade(e.target.value)}
                placeholder="Ex: 58"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-medium focus:outline-none focus:border-blue-600 focus:bg-white transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">
                Telefone
              </label>
              <input
                type="text"
                value={fone}
                onChange={(e) => setFone(e.target.value)}
                placeholder="(11) 99999-9999"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-medium focus:outline-none focus:border-blue-600 focus:bg-white transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">
                CPF / Prontuário
              </label>
              <input
                type="text"
                value={cpf}
                onChange={(e) => setCpf(e.target.value)}
                placeholder="000.000.000-00"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-medium focus:outline-none focus:border-blue-600 focus:bg-white transition"
              />
            </div>
          </div>

          <div className="pt-4 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3.5 rounded-2xl text-sm font-bold text-gray-600 hover:bg-gray-100 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-sm font-bold shadow-xl shadow-blue-500/20 active:scale-95 transition flex items-center gap-2 disabled:opacity-50"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              <span>Cadastrar Paciente</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
