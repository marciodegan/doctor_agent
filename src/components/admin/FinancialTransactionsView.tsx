import React, { useState, useEffect } from "react";
import { useGroup } from "../../contexts/GroupContext";
import { Wallet, Plus, Search, Trash2, Edit3, Loader2, Check } from "lucide-react";

interface FinancialTransactionsViewProps {
  closingId: string | null;
}

export function FinancialTransactionsView({ closingId }: FinancialTransactionsViewProps) {
  const { activeGroup, apiFetch } = useGroup();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ amount: "", observation: "", typeName: "" });

  const fetchTransactions = async () => {
    if (!closingId || !activeGroup) return;
    try {
      setLoading(true);
      const res = await apiFetch(`/api/app/financial/closings/${closingId}/details`);
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions || []);
      }
    } catch (e) {
      console.error("Failed to load transactions:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [closingId, activeGroup]);

  const handleDelete = async (id: string) => {
    if (!confirm("Deseja realmente excluir este lançamento financeiro?")) return;
    try {
      const res = await apiFetch(`/api/app/financial/transactions/${id}`, { method: "DELETE" });
      if (res.ok) {
        setTransactions(transactions.filter(t => t.id !== id));
      }
    } catch (e: any) {
      alert("Erro ao excluir: " + e.message);
    }
  };

  const handleSaveEdit = async (id: string) => {
    try {
      const res = await apiFetch(`/api/app/financial/transactions/${id}`, {
        method: "PUT",
        body: JSON.stringify(editForm)
      });
      if (res.ok) {
        setEditingId(null);
        fetchTransactions();
      }
    } catch (e: any) {
      alert("Erro ao salvar: " + e.message);
    }
  };

  if (!closingId) {
    return (
      <div className="bg-white rounded-[32px] p-12 text-center border border-gray-200">
        <p className="text-sm text-gray-500 font-bold">Selecione um fechamento na aba <b>Fechamentos</b> para gerenciar o fluxo de caixa.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-blue-600" size={36} />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto pb-12">
      <div className="bg-white p-6 rounded-[28px] border border-gray-200 shadow-xs flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight">Fluxo de Caixa & Ocorrências</h2>
          <p className="text-xs text-gray-500">Lançamentos financeiros, débitos, créditos e retenções</p>
        </div>
      </div>

      <div className="bg-white rounded-[32px] border border-gray-200/80 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-gray-50 text-gray-400 font-black uppercase text-[10px] tracking-wider border-b border-gray-200">
                <th className="p-4 pl-6">Data</th>
                <th className="p-4">Tipo / Lançamento</th>
                <th className="p-4">Escopo</th>
                <th className="p-4">Observação</th>
                <th className="p-4">Origem</th>
                <th className="p-4 text-right pr-6">Valor (R$)</th>
                <th className="p-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-400 font-bold">Nenhum lançamento financeiro registrado neste fechamento.</td>
                </tr>
              ) : (
                transactions.map((tx: any) => {
                  const isEditing = editingId === tx.id;
                  return (
                    <tr key={tx.id} className="hover:bg-blue-50/20 transition-colors">
                      <td className="p-4 pl-6 font-bold text-gray-900">{tx.date}</td>
                      <td className="p-4">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.typeName}
                            onChange={e => setEditForm({ ...editForm, typeName: e.target.value })}
                            className="bg-white border border-gray-300 rounded-xl px-3 py-1.5 text-xs font-bold"
                          />
                        ) : (
                          <span className="font-bold text-gray-900">{tx.typeName}</span>
                        )}
                      </td>
                      <td className="p-4">
                        <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg text-[10px] font-black uppercase">
                          {tx.scope}
                        </span>
                      </td>
                      <td className="p-4">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.observation}
                            onChange={e => setEditForm({ ...editForm, observation: e.target.value })}
                            className="bg-white border border-gray-300 rounded-xl px-3 py-1.5 text-xs w-full"
                          />
                        ) : (
                          <span className="text-gray-500">{tx.observation}</span>
                        )}
                      </td>
                      <td className="p-4">
                        <span className="text-[10px] font-black bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md">{tx.source}</span>
                      </td>
                      <td className="p-4 text-right pr-6 font-black">
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.01"
                            value={editForm.amount}
                            onChange={e => setEditForm({ ...editForm, amount: e.target.value })}
                            className="bg-white border border-gray-300 rounded-xl px-3 py-1.5 text-xs w-28 text-right font-bold"
                          />
                        ) : (
                          <span className={tx.nature === "DEBIT" ? "text-rose-600" : "text-emerald-600"}>
                            {tx.nature === "DEBIT" ? "-R$ " : "R$ "}
                            {Number(tx.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {isEditing ? (
                            <button
                              onClick={() => handleSaveEdit(tx.id)}
                              className="p-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition"
                            >
                              <Check size={14} />
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingId(tx.id);
                                setEditForm({ amount: String(tx.amount || 0), observation: tx.observation || "", typeName: tx.typeName || "" });
                              }}
                              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition"
                            >
                              <Edit3 size={14} />
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(tx.id)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
