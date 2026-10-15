import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc, collection, deleteDoc, doc, getDocs, orderBy, query,
  serverTimestamp, updateDoc, where
} from "firebase/firestore";
import { ArrowDownRight, ArrowUpRight, Banknote, Building2, CalendarDays, CircleDollarSign, Landmark, Plus, RefreshCw, Trash2, Wallet, X } from "lucide-react";
import { useGroup } from "../../contexts/GroupContext";
import { db } from "../../lib/firebase";

type CashAccount = {
  id: string; name: string; institution: string; kind: "bank" | "cash" | "other";
  openingBalance: number; active: boolean;
};
type CashTransaction = {
  id: string; accountId: string; date: string; description: string; observation: string;
  nature: "ENTRY" | "EXIT"; amount: number; createdAt?: any;
};

const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
const today = () => new Date().toLocaleDateString("en-CA");
const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const buttonClass = "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export function OfficialCashFlowView() {
  const { activeGroup } = useGroup();
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedAccount, setSelectedAccount] = useState("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [accountForm, setAccountForm] = useState({ name: "", institution: "", kind: "bank" as CashAccount["kind"], openingBalance: "0" });
  const [transactionForm, setTransactionForm] = useState({ accountId: "", date: today(), nature: "ENTRY" as CashTransaction["nature"], description: "", amount: "", observation: "" });

  const groupId = activeGroup?.id;
  const accountsRef = () => collection(db, "groups", groupId!, "official_cash_accounts");
  const transactionsRef = () => collection(db, "groups", groupId!, "official_cash_transactions");

  const loadData = async () => {
    if (!groupId) { setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const [accountSnap, transactionSnap] = await Promise.all([
        getDocs(query(accountsRef(), orderBy("name"))),
        getDocs(query(transactionsRef(), orderBy("date", "desc")))
      ]);
      setAccounts(accountSnap.docs.map(d => ({ id: d.id, ...d.data() } as CashAccount)));
      setTransactions(transactionSnap.docs.map(d => ({ id: d.id, ...d.data() } as CashTransaction)));
    } catch (e: any) {
      console.error("Erro ao carregar fluxo de caixa oficial", e);
      setError("Não foi possível carregar o fluxo. Verifique as permissões do Firestore e tente novamente.");
    } finally { setLoading(false); }
  };

  useEffect(() => { void loadData(); }, [groupId]);

  const accountBalances = useMemo(() => {
    const result: Record<string, number> = {};
    for (const account of accounts) result[account.id] = Number(account.openingBalance || 0);
    for (const transaction of [...transactions].sort((a, b) => a.date.localeCompare(b.date))) {
      if (result[transaction.accountId] === undefined) continue;
      const amount = Math.abs(Number(transaction.amount || 0));
      result[transaction.accountId] += transaction.nature === "ENTRY" ? amount : -amount;
    }
    return result;
  }, [accounts, transactions]);

  const visibleTransactions = useMemo(() => transactions.filter(t =>
    (selectedAccount === "ALL" || t.accountId === selectedAccount) &&
    (!startDate || t.date >= startDate) && (!endDate || t.date <= endDate)
  ), [transactions, selectedAccount, startDate, endDate]);

  const totalBalance = accounts.filter(a => a.active !== false).reduce((sum, a) => sum + (accountBalances[a.id] || 0), 0);
  const totalEntries = visibleTransactions.filter(t => t.nature === "ENTRY").reduce((sum, t) => sum + Math.abs(Number(t.amount || 0)), 0);
  const totalExits = visibleTransactions.filter(t => t.nature === "EXIT").reduce((sum, t) => sum + Math.abs(Number(t.amount || 0)), 0);
  const accountName = (id: string) => accounts.find(a => a.id === id)?.name || "Conta removida";

  const saveAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!groupId || !accountForm.name.trim()) return;
    setSaving(true); setError("");
    try {
      await addDoc(accountsRef(), {
        name: accountForm.name.trim(), institution: accountForm.institution.trim(),
        kind: accountForm.kind, openingBalance: Number(accountForm.openingBalance || 0),
        active: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: "user"
      });
      setAccountForm({ name: "", institution: "", kind: "bank", openingBalance: "0" });
      setShowAccountForm(false); await loadData();
    } catch (e) { console.error(e); setError("Não foi possível salvar a conta."); }
    finally { setSaving(false); }
  };

  const saveTransaction = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!groupId || !transactionForm.accountId || !transactionForm.description.trim() || !(Number(transactionForm.amount) > 0)) {
      setError("Informe a conta, a descrição e um valor maior que zero."); return;
    }
    setSaving(true); setError("");
    try {
      await addDoc(transactionsRef(), {
        accountId: transactionForm.accountId, date: transactionForm.date,
        nature: transactionForm.nature, description: transactionForm.description.trim(),
        amount: Number(transactionForm.amount), observation: transactionForm.observation.trim(),
        createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      });
      setTransactionForm({ accountId: selectedAccount !== "ALL" ? selectedAccount : (accounts.find(a => a.active !== false)?.id || ""), date: today(), nature: "ENTRY", description: "", amount: "", observation: "" });
      setShowTransactionForm(false); await loadData();
    } catch (e) { console.error(e); setError("Não foi possível salvar o lançamento."); }
    finally { setSaving(false); }
  };

  const removeTransaction = async (transaction: CashTransaction) => {
    if (!groupId || !window.confirm("Excluir este lançamento do fluxo de caixa oficial?")) return;
    try { await deleteDoc(doc(transactionsRef(), transaction.id)); await loadData(); }
    catch (e) { console.error(e); setError("Não foi possível excluir o lançamento."); }
  };

  const removeAccount = async (account: CashAccount) => {
    if (!groupId) return;
    if (transactions.some(t => t.accountId === account.id)) {
      setError("Esta conta possui lançamentos. Para preservar o histórico, não é possível excluí-la."); return;
    }
    if (!window.confirm(`Excluir a conta "${account.name}"?`)) return;
    try { await deleteDoc(doc(accountsRef(), account.id)); await loadData(); }
    catch (e) { console.error(e); setError("Não foi possível excluir a conta."); }
  };

  if (!groupId) return <div className="m-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">Selecione um grupo para acessar o fluxo de caixa oficial.</div>;

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-6 p-4 pb-28 md:p-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-blue-700"><CircleDollarSign size={16}/> Financeiro independente</div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 md:text-3xl">Fluxo de Caixa Oficial</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Controle as entradas e saídas reais de dinheiro, separado das ocorrências e dos fechamentos da matriz.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={buttonClass + " border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"} onClick={() => void loadData()}><RefreshCw size={16}/> Atualizar</button>
          <button className={buttonClass + " bg-blue-600 text-white hover:bg-blue-700"} onClick={() => { setError(""); setShowAccountForm(true); }}><Plus size={17}/> Nova conta</button>
          <button className={buttonClass + " bg-emerald-600 text-white hover:bg-emerald-700"} disabled={accounts.filter(a => a.active !== false).length === 0} onClick={() => { setError(""); setTransactionForm(f => ({ ...f, accountId: selectedAccount !== "ALL" ? selectedAccount : (accounts.find(a => a.active !== false)?.id || "") })); setShowTransactionForm(true); }}><Plus size={17}/> Lançamento</button>
        </div>
      </div>

      {error && <div className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"><span>{error}</span><button onClick={() => setError("")} aria-label="Fechar aviso"><X size={16}/></button></div>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard label="Saldo total das contas" value={money(totalBalance)} hint="Saldo atual consolidado" icon={<Wallet size={19}/>} />
        <SummaryCard label="Entradas no período" value={money(totalEntries)} hint="Conforme os filtros aplicados" icon={<ArrowDownRight size={19}/>} positive />
        <SummaryCard label="Saídas no período" value={money(totalExits)} hint={`Saldo do período: ${money(totalEntries - totalExits)}`} icon={<ArrowUpRight size={19}/>} />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div><h2 className="font-bold text-slate-900">Saldos por conta</h2><p className="text-xs text-slate-500">Saldo inicial + entradas − saídas</p></div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{accounts.length} conta(s)</span>
        </div>
        {accounts.length === 0 && !loading ? <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Cadastre sua primeira conta bancária ou caixa para começar.</div> :
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {accounts.map(account => <div key={account.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">{account.kind === "cash" ? <Banknote size={20}/> : account.kind === "bank" ? <Landmark size={20}/> : <Building2 size={20}/>}</div>
                  <div className="min-w-0"><p className="truncate font-bold text-slate-800">{account.name}</p><p className="truncate text-xs text-slate-500">{account.institution || (account.kind === "cash" ? "Dinheiro em caixa" : "Sem instituição")}</p></div>
                </div>
                <button className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => void removeAccount(account)} title="Excluir conta"><Trash2 size={15}/></button>
              </div>
              <p className="mt-4 text-xs font-medium text-slate-500">Saldo atual</p><p className={`mt-1 text-xl font-black ${(accountBalances[account.id] || 0) < 0 ? "text-rose-600" : "text-slate-900"}`}>{money(accountBalances[account.id] || 0)}</p>
              <p className="mt-1 text-[11px] text-slate-400">Saldo inicial: {money(account.openingBalance || 0)}</p>
            </div>)}
          </div>}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4 md:p-5">
          <div className="mb-4"><h2 className="font-bold text-slate-900">Movimentações</h2><p className="text-xs text-slate-500">Histórico independente do fluxo de ocorrências</p></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="text-xs font-semibold text-slate-600">Conta<select className={inputClass + " mt-1"} value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)}><option value="ALL">Todas as contas</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
            <label className="text-xs font-semibold text-slate-600">Data inicial<input type="date" className={inputClass + " mt-1"} value={startDate} onChange={e => setStartDate(e.target.value)}/></label>
            <label className="text-xs font-semibold text-slate-600">Data final<input type="date" className={inputClass + " mt-1"} value={endDate} onChange={e => setEndDate(e.target.value)}/></label>
            <div className="flex items-end"><button className={buttonClass + " w-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"} onClick={() => { setSelectedAccount("ALL"); setStartDate(""); setEndDate(""); }}><X size={15}/> Limpar filtros</button></div>
          </div>
        </div>
        {loading ? <div className="p-12 text-center text-sm text-slate-500">Carregando fluxo de caixa...</div> : visibleTransactions.length === 0 ? <div className="p-12 text-center text-sm text-slate-500">Nenhuma movimentação encontrada para os filtros selecionados.</div> :
          <div className="overflow-x-auto"><table className="w-full min-w-[850px] border-collapse text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600"><tr>{["Data","Lançamento","Conta","Observação","Valor","Saldo da conta",""].map((h,i)=><th key={i} className="border-b border-slate-200 px-4 py-3 font-bold">{h}</th>)}</tr></thead>
            <tbody>{visibleTransactions.map(t => {
              const running = (accounts.find(a => a.id === t.accountId)?.openingBalance || 0) + transactions.filter(x => x.accountId === t.accountId && x.date <= t.date).reduce((sum,x) => sum + (x.nature === "ENTRY" ? 1 : -1) * Math.abs(Number(x.amount || 0)), 0);
              return <tr key={t.id} className="hover:bg-blue-50/40">
                <td className="whitespace-nowrap border-b border-slate-100 px-4 py-3 text-slate-600">{t.date.split("-").reverse().join("/")}</td>
                <td className="border-b border-slate-100 px-4 py-3"><div className="flex items-center gap-2 font-semibold text-slate-800">{t.nature === "ENTRY" ? <ArrowDownRight size={16} className="text-emerald-600"/> : <ArrowUpRight size={16} className="text-rose-600"}/>{t.description}</div></td>
                <td className="border-b border-slate-100 px-4 py-3 text-slate-600">{accountName(t.accountId)}</td>
                <td className="max-w-[220px] truncate border-b border-slate-100 px-4 py-3 text-slate-500" title={t.observation}>{t.observation || " "}</td>
                <td className={`whitespace-nowrap border-b border-slate-100 px-4 py-3 text-right font-bold ${t.nature === "ENTRY" ? "text-emerald-700" : "text-rose-700"}`}>{t.nature === "ENTRY" ? "+" : "−"}{money(Math.abs(Number(t.amount || 0)))}</td>
                <td className="whitespace-nowrap border-b border-slate-100 px-4 py-3 text-right font-semibold text-slate-700">{money(running)}</td>
                <td className="border-b border-slate-100 px-3 py-3 text-right"><button className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Excluir lançamento" onClick={() => void removeTransaction(t)}><Trash2 size={15}/></button></td>
              </tr>;
            })}</tbody>
            <tfoot className="bg-slate-50 font-bold text-slate-800"><tr><td colSpan={4} className="px-4 py-3">Total do período filtrado</td><td className="px-4 py-3 text-right">{money(totalEntries-totalExits)}</td><td colSpan={2}></td></tr></tfoot>
          </table></div>}
      </section>

      {showAccountForm && <Modal title="Cadastrar conta" onClose={() => setShowAccountForm(false)}><form onSubmit={saveAccount} className="space-y-4">
        <label className="block text-sm font-semibold text-slate-700">Nome da conta<input autoFocus required className={inputClass + " mt-1"} placeholder="Ex.: Conta principal, Dinheiro em caixa" value={accountForm.name} onChange={e => setAccountForm(f => ({...f,name:e.target.value}))}/></label>
        <label className="block text-sm font-semibold text-slate-700">Banco ou instituição (opcional)<input className={inputClass + " mt-1"} placeholder="Ex.: Banco do Brasil" value={accountForm.institution} onChange={e => setAccountForm(f => ({...f,institution:e.target.value}))}/></label>
        <label className="block text-sm font-semibold text-slate-700">Tipo<select className={inputClass + " mt-1"} value={accountForm.kind} onChange={e => setAccountForm(f => ({...f,kind:e.target.value as CashAccount["kind"]}))}><option value="bank">Conta bancária</option><option value="cash">Dinheiro em caixa</option><option value="other">Outra conta</option></select></label>
        <label className="block text-sm font-semibold text-slate-700">Saldo inicial<input type="number" step="0.01" className={inputClass + " mt-1"} value={accountForm.openingBalance} onChange={e => setAccountForm(f => ({...f,openingBalance:e.target.value}))}/><span className="mt-1 block text-xs font-normal text-slate-500">Informe o saldo existente antes do primeiro lançamento.</span></label>
        <button disabled={saving} className={buttonClass + " w-full bg-blue-600 text-white hover:bg-blue-700"}>{saving ? "Salvando..." : "Salvar conta"}</button>
      </form></Modal>}

      {showTransactionForm && <Modal title="Novo lançamento" onClose={() => setShowTransactionForm(false)}><form onSubmit={saveTransaction} className="space-y-4">
        <label className="block text-sm font-semibold text-slate-700">Conta<select required className={inputClass + " mt-1"} value={transactionForm.accountId} onChange={e => setTransactionForm(f => ({...f,accountId:e.target.value}))}><option value="">Selecione uma conta</option>{accounts.filter(a => a.active !== false).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="block text-sm font-semibold text-slate-700">Data<input type="date" required className={inputClass + " mt-1"} value={transactionForm.date} onChange={e => setTransactionForm(f => ({...f,date:e.target.value}))}/></label><label className="block text-sm font-semibold text-slate-700">Tipo<select className={inputClass + " mt-1"} value={transactionForm.nature} onChange={e => setTransactionForm(f => ({...f,nature:e.target.value as CashTransaction["nature"]}))}><option value="ENTRY">Entrada</option><option value="EXIT">Saída</option></select></label></div>
        <label className="block text-sm font-semibold text-slate-700">Descrição<input required className={inputClass + " mt-1"} placeholder="Ex.: Recebimento, aluguel, cartão" value={transactionForm.description} onChange={e => setTransactionForm(f => ({...f,description:e.target.value}))}/></label>
        <label className="block text-sm font-semibold text-slate-700">Valor (R$)<input type="number" min="0.01" step="0.01" required className={inputClass + " mt-1"} placeholder="0,00" value={transactionForm.amount} onChange={e => setTransactionForm(f => ({...f,amount:e.target.value}))}/></label>
        <label className="block text-sm font-semibold text-slate-700">Observação (opcional)<textarea rows={2} className={inputClass + " mt-1"} value={transactionForm.observation} onChange={e => setTransactionForm(f => ({...f,observation:e.target.value}))}/></label>
        <button disabled={saving} className={buttonClass + " w-full bg-emerald-600 text-white hover:bg-emerald-700"}>{saving ? "Salvando..." : "Salvar lançamento"}</button>
      </form></Modal>}
    </div>
  );
}

function SummaryCard({ label, value, hint, icon, positive = false }: { label: string; value: string; hint: string; icon: React.ReactNode; positive?: boolean }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5"><div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-slate-500">{label}</span><span className={`rounded-xl p-2 ${positive ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>{icon}</span></div><p className="mt-3 text-2xl font-black tracking-tight text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-500">{hint}</p></div>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl md:p-6"><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-bold text-slate-900">{title}</h2><button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18}/></button></div>{children}</div></div>;
}
