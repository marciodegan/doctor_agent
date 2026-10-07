import React, { useState } from 'react';
import { Save, Check, AlertCircle, Settings2 } from 'lucide-react';
import { TeamFinancialSettings } from '../types/financial';

interface TeamRateioConfigProps {
  teamSettings: TeamFinancialSettings;
  setTeamSettings: (settings: TeamFinancialSettings) => void;
  onSave: () => Promise<void>;
  saving: boolean;
  success: boolean;
}

export function TeamRateioConfig({ teamSettings, setTeamSettings, onSave, saving, success }: TeamRateioConfigProps) {
  const teamSumPercent = teamSettings.doctors
    .filter(d => d.isTeamMember)
    .reduce((acc, d) => acc + (Number(d.teamSharePercent) || 0), 0);

  const recalculateHeartProportions = (docs: any[]) => {
    const teamMembers = docs.filter(d => d.isTeamMember);
    const sumDisponivel = teamMembers.reduce((acc, d) => acc + (Number(d.disponivelPeriodo) || 0), 0);
    return docs.map(d => {
      if (d.isTeamMember && sumDisponivel > 0 && d.disponivelPeriodo !== undefined) {
        const dyn = Math.round(((Number(d.disponivelPeriodo) || 0) / sumDisponivel) * 10000) / 100;
        return { ...d, proporcaoHeartDinamica: dyn };
      }
      return d;
    });
  };

  return (
    <div className="bg-white rounded-[32px] border border-gray-200 shadow-xl p-6 lg:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Settings2 size={22} className="text-emerald-600" />
            <h3 className="font-black text-gray-900 text-base uppercase tracking-tight">
              Definição de Membros da Equipe & Percentuais de Rateio
            </h3>
          </div>
          <p className="text-xs text-gray-500 font-medium mt-1">
            Defina quais médicos fazem parte da equipe para rateio de receitas institucionais.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 ${
            teamSumPercent === 100 
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200" 
              : "bg-amber-50 text-amber-800 border border-amber-200"
          }`}>
            <span>Soma dos % da Equipe: {teamSumPercent}%</span>
            {teamSumPercent === 100 ? <Check size={14} /> : <AlertCircle size={14} />}
          </div>

          <button
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20 active:scale-95 transition cursor-pointer"
          >
            <Save size={15} />
            <span>{saving ? "Salvando..." : "Salvar Configuração"}</span>
          </button>
        </div>
      </div>

      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 font-bold flex items-center gap-2">
          <Check size={16} />
          <span>Configurações salvas com sucesso!</span>
        </div>
      )}

      <div className="overflow-x-auto border border-gray-200 rounded-2xl">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-gray-100 text-gray-700 font-black uppercase text-[10px] tracking-wider border-b border-gray-200">
              <th className="p-3.5 pl-6">Médico</th>
              <th className="p-3.5">Especialidade</th>
              <th className="p-3.5 text-center">Membro da Equipe?</th>
              <th className="p-3.5 text-center bg-emerald-50 text-emerald-900">Participa UNIMED?</th>
              <th className="p-3.5 text-center">% Nominal (Entradas)</th>
              <th className="p-3.5 text-center bg-blue-50 text-blue-900">PROPORÇÃO HEART (Despesas)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
            {teamSettings.doctors.map((doc, idx) => (
              <tr key={doc.key} className={doc.isTeamMember ? "bg-emerald-50/20" : "bg-white"}>
                <td className="p-3.5 pl-6 font-black text-gray-900">{doc.name}</td>
                <td className="p-3.5 text-gray-500">{doc.specialty || "-"}</td>
                <td className="p-3.5 text-center">
                  <input
                    type="checkbox"
                    checked={doc.isTeamMember}
                    onChange={(e) => {
                      const updated = [...teamSettings.doctors];
                      updated[idx].isTeamMember = e.target.checked;
                      if (!e.target.checked) {
                        updated[idx].teamSharePercent = 0;
                        updated[idx].proporcaoHeartDinamica = 0;
                      }
                      const recalced = recalculateHeartProportions(updated);
                      setTeamSettings({ ...teamSettings, doctors: recalced });
                    }}
                    className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
                  />
                </td>
                <td className="p-3.5 text-center bg-emerald-50/30">
                  <input
                    type="checkbox"
                    checked={Boolean(doc.participaUnimed)}
                    onChange={(e) => {
                      const updated = [...teamSettings.doctors];
                      updated[idx].participaUnimed = e.target.checked;
                      setTeamSettings({ ...teamSettings, doctors: updated });
                    }}
                    className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
                  />
                </td>
                <td className="p-3.5 text-center">
                  {doc.isTeamMember ? (
                    <div className="inline-flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={doc.teamSharePercent}
                        onChange={(e) => {
                          const updated = [...teamSettings.doctors];
                          updated[idx].teamSharePercent = parseFloat(e.target.value) || 0;
                          const recalced = recalculateHeartProportions(updated);
                          setTeamSettings({ ...teamSettings, doctors: recalced });
                        }}
                        className="w-16 bg-white border border-gray-300 rounded-lg px-2 py-1 text-center font-black text-emerald-700"
                      />
                      <span className="font-bold text-gray-500">%</span>
                    </div>
                  ) : (
                    <span className="text-gray-400 font-bold">0%</span>
                  )}
                </td>
                <td className="p-3.5 text-center bg-blue-50/40">
                  {doc.isTeamMember ? (
                    <span className="px-2.5 py-1 bg-blue-100 text-blue-900 border border-blue-200 rounded-lg font-black text-xs">
                      {(doc.proporcaoHeartDinamica || 0).toFixed(2)}%
                    </span>
                  ) : (
                    <span className="text-gray-400 font-bold">0%</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
