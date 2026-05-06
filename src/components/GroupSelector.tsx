import React, { useState } from "react";
import { useGroup } from "../contexts/GroupContext";
import { useAuth } from "../hooks/useAuth";
import { 
  Users, 
  Plus, 
  Settings, 
  LogOut, 
  Check, 
  Loader2,
  ChevronRight,
  Shield,
  UserPlus,
  X
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export function GroupSelector() {
  const { 
    groups, 
    invites, 
    activeGroup, 
    activeGroupMembers,
    setActiveGroupId, 
    createGroup, 
    inviteUser, 
    acceptInvite, 
    declineInvite,
    loading 
  } = useGroup();
  const { user, logout } = useAuth();
  const [isCreating, setIsCreating] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [error, setError] = useState("");
  const [isAccepting, setIsAccepting] = useState<string | null>(null);
  const [isDeclining, setIsDeclining] = useState<string | null>(null);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    try {
      setError("");
      await createGroup(newGroupName);
      setNewGroupName("");
      setIsCreating(false);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleAcceptInvite = async (groupId: string) => {
    try {
      setIsAccepting(groupId);
      await acceptInvite(groupId);
      setIsAccepting(null);
    } catch (err: any) {
      setError(err.message);
      setIsAccepting(null);
    }
  };

  const handleDeclineInvite = async (groupId: string) => {
    if (!confirm("Tem certeza que deseja recusar este convite?")) return;
    try {
      setIsDeclining(groupId);
      await declineInvite(groupId);
      setIsDeclining(null);
    } catch (err: any) {
      setError(err.message);
      setIsDeclining(null);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !activeGroup) return;
    try {
      setError("");
      await inviteUser(activeGroup.id, inviteEmail);
      setInviteEmail("");
      setIsInviting(false);
      alert("Convite enviado com sucesso!");
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="animate-spin text-blue-600" />
      </div>
    );
  }

  // If no groups AND no invites, force creation
  if (groups.length === 0 && invites.length === 0 && !isCreating) {
    return (
      <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-xl shadow-blue-500/5 max-w-md mx-auto">
        <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 mb-6 mx-auto">
          <Users size={32} />
        </div>
        <h2 className="text-2xl font-black text-gray-900 text-center mb-2">Bem-vindo ao Doctor Pro!</h2>
        <p className="text-gray-500 text-center mb-8">Para começar, crie o seu primeiro grupo de trabalho.</p>
        
        <button 
          onClick={() => setIsCreating(true)}
          className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
        >
          <Plus size={20} />
          Criar meu primeiro grupo
        </button>
      </div>
    );
  }

  // If no groups but has invites - show them prominently
  if (groups.length === 0 && invites.length > 0 && !isCreating) {
    return (
      <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-xl shadow-blue-500/5 max-w-md mx-auto">
        <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 mb-6 mx-auto">
          <Users size={32} />
        </div>
        <h2 className="text-2xl font-black text-gray-900 text-center mb-2">Convites Encontrados!</h2>
        <p className="text-gray-500 text-center mb-8">Você foi convidado para participar dos seguintes grupos:</p>
        
        <div className="space-y-3 mb-8">
          {invites.map((invite) => (
            <div key={invite.id} className="bg-gray-50 border border-gray-100 p-4 rounded-2xl">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center font-bold uppercase">
                    {invite.name.charAt(0)}
                  </div>
                  <div className="font-bold text-gray-900 uppercase text-sm">{invite.name}</div>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <button 
                  onClick={() => handleAcceptInvite(invite.id)}
                  disabled={isAccepting === invite.id || isDeclining === invite.id}
                  className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-md active:scale-95 disabled:opacity-50"
                >
                  {isAccepting === invite.id ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  ENTRAR NO GRUPO
                </button>
                <button 
                  onClick={() => handleDeclineInvite(invite.id)}
                  disabled={isAccepting === invite.id || isDeclining === invite.id}
                  className="w-full bg-white text-red-600 border border-red-100 font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-red-50 transition-all active:scale-95 disabled:opacity-50"
                >
                  {isDeclining === invite.id ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
                  RECUSAR CONVITE
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="pt-6 border-t border-gray-100">
           <button 
            onClick={() => setIsCreating(true)}
            className="w-full text-gray-400 font-bold text-xs hover:text-blue-600 transition-colors py-2 uppercase tracking-widest"
          >
            Ou crie seu próprio grupo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
            <Users size={20} />
          </div>
          <div>
            <h3 className="font-black text-gray-900 tracking-tight">Meus Grupos</h3>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none">Ambiente de Trabalho</p>
          </div>
        </div>
        <button 
          onClick={() => setIsCreating(!isCreating)}
          className="p-2 hover:bg-gray-100 rounded-xl transition-all text-gray-400 hover:text-blue-600"
        >
          <Plus size={20} />
        </button>
      </div>

      <AnimatePresence mode="wait">
        {isCreating ? (
          <motion.form 
            key="create-form"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            onSubmit={handleCreateGroup}
            className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-3"
          >
            <input 
              type="text"
              placeholder="Nome do grupo (ex: Equipe Cirúrgica)"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              className="w-full bg-white border border-gray-200 px-4 py-3 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              autoFocus
            />
            {error && <p className="text-xs text-red-500 font-bold px-1">{error}</p>}
            <div className="flex gap-2">
              <button 
                type="submit"
                className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl font-bold text-sm hover:bg-blue-700 transition-all shadow-sm"
              >
                CRIAR GRUPO
              </button>
              <button 
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-4 py-2.5 rounded-xl font-bold text-xs text-gray-400 hover:text-gray-600 transition-all border border-transparent hover:border-gray-200"
              >
                CANCELAR
              </button>
            </div>
          </motion.form>
        ) : (
          <motion.div 
            key="group-list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            {/* Invitations Section */}
            {invites.length > 0 && (
              <div className="space-y-3">
                <div className="text-[10px] font-bold text-blue-600 uppercase tracking-widest px-2">Convites Pendentes</div>
                {invites.map((invite) => (
                  <motion.div
                    key={invite.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-blue-50 border border-blue-100 p-4 rounded-2xl flex flex-col gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center font-bold text-xl">
                        {invite.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-sm text-gray-900 uppercase">{invite.name}</div>
                        <div className="text-[10px] text-blue-600 font-bold uppercase tracking-tight">Você foi convidado</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAcceptInvite(invite.id)}
                        disabled={isAccepting === invite.id || isDeclining === invite.id}
                        className="flex-[2] bg-blue-600 text-white py-2.5 rounded-xl font-bold text-xs hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
                      >
                        {isAccepting === invite.id ? (
                          <Loader2 className="animate-spin" size={14} />
                        ) : (
                          <Check size={14} />
                        )}
                        ACEITAR
                      </button>
                      <button
                        onClick={() => handleDeclineInvite(invite.id)}
                        disabled={isAccepting === invite.id || isDeclining === invite.id}
                        className="flex-1 bg-white border border-red-100 text-red-600 py-2.5 rounded-xl font-bold text-xs hover:bg-red-50 transition-all flex items-center justify-center gap-2"
                      >
                        {isDeclining === invite.id ? (
                          <Loader2 className="animate-spin" size={14} />
                        ) : (
                          <X size={14} />
                        )}
                        RECUSAR
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Active Groups List */}
            <div className="space-y-2">
              {groups.length > 0 && <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2">Meus Grupos</div>}
              {groups.map((group) => (
                <button
                  key={group.id}
                  onClick={() => setActiveGroupId(group.id)}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all border-2 group ${
                    activeGroup?.id === group.id 
                      ? "bg-blue-50 border-blue-600 shadow-sm" 
                      : "bg-white border-transparent hover:border-gray-100 hover:bg-gray-50"
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                    activeGroup?.id === group.id ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-400 group-hover:bg-gray-200"
                  }`}>
                    {group.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-bold text-sm text-gray-900 group-hover:text-blue-600 transition-colors uppercase tracking-tight">{group.name}</div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{activeGroup?.id === group.id ? "Ativo no momento" : "Clique para entrar"}</div>
                  </div>
                  {activeGroup?.id === group.id && <Check size={18} className="text-blue-600" />}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {activeGroup && (
        <div className="pt-4 border-t border-gray-100 space-y-4">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600">
                <Shield size={16} />
              </div>
              <div>
                <h4 className="text-xs font-bold text-gray-900">Gerenciar Grupo</h4>
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Colaboração</p>
              </div>
            </div>
            {activeGroupMembers.length > 0 && (
              <div className="flex -space-x-2">
                {activeGroupMembers.slice(0, 3).map((m, i) => (
                  <div key={i} title={m.userEmail} className={`w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-[8px] font-bold ${m.status === 'active' ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                    {m.userEmail.charAt(0).toUpperCase()}
                  </div>
                ))}
                {activeGroupMembers.length > 3 && (
                  <div className="w-6 h-6 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-[8px] font-bold text-gray-500">
                    +{activeGroupMembers.length - 3}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <button 
              onClick={() => setIsInviting(!isInviting)}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 text-gray-600 hover:text-blue-600 transition-all group"
            >
              <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                <UserPlus size={16} />
              </div>
              <span className="text-xs font-bold">Convidar Integrante</span>
              <ChevronRight size={14} className={`ml-auto transition-all ${isInviting ? "rotate-90" : "opacity-0 group-hover:opacity-100"}`} />
            </button>

            {isInviting && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="px-2"
              >
                <form onSubmit={handleInvite} className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 space-y-3">
                  <div className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1 italic">Convite por Email</div>
                  <input 
                    type="email"
                    placeholder="email@exemplo.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full bg-white border border-emerald-200 px-4 py-3 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    required
                  />
                  <button 
                    type="submit"
                    className="w-full bg-emerald-600 text-white py-2.5 rounded-xl font-bold text-sm hover:bg-emerald-700 transition-all shadow-sm"
                  >
                    ENVIAR CONVITE
                  </button>
                </form>
              </motion.div>
            )}
          </div>

          <div className="px-2 space-y-2">
             <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">Membros do Grupo</div>
             <div className="max-h-40 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                {activeGroupMembers.map((member) => (
                  <div key={member.userId + member.userEmail} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-2">
                       <div className={`w-1.5 h-1.5 rounded-full ${member.status === 'active' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                       <span className="text-[11px] font-medium text-gray-700 truncate max-w-[120px]">{member.userEmail}</span>
                    </div>
                    <span className={`text-[9px] font-bold uppercase tracking-wider ${
                      member.status === 'active' ? 'text-emerald-600' : 
                      member.status === 'cancelled' ? 'text-red-600' : 'text-amber-600'
                    }`}>
                      {member.status === 'active' ? 'Aceitou' : 
                       member.status === (('cancelled' as any)) ? 'Recusou' : 'Pendente'}
                    </span>
                  </div>
                ))}
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
