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
  Maximize,
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
    removeMember,
    cancelInvite,
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
  const [isRemoving, setIsRemoving] = useState<string | null>(null);
  const [isManagementOpen, setIsManagementOpen] = useState(false);

  const currentUserMembership = activeGroupMembers.find(m => m.userId === user?.uid);
  const isOwner = currentUserMembership?.role === "owner";

  const sortedMembers = [...activeGroupMembers].sort((a, b) => {
    const statusPriority: Record<string, number> = {
      active: 1,
      pending: 2,
      removed: 3,
      cancelled: 4
    };
    return (statusPriority[a.status] || 99) - (statusPriority[b.status] || 99);
  });

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

  const handleRemoveMember = async (targetUserId: string, email: string, status: string) => {
    const label = status === "active" ? "remover este membro" : "cancelar este convite";
    if (!activeGroup || !confirm(`Tem certeza que deseja ${label}?`)) return;
    
    try {
      setIsRemoving(targetUserId || email);
      if (status === "active") {
        await removeMember(activeGroup.id, targetUserId);
      } else {
        await cancelInvite(activeGroup.id, email);
      }
      setIsRemoving(null);
    } catch (err: any) {
      alert(err.message || "Erro ao remover");
      setIsRemoving(null);
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
                    {(invite.name || "G").charAt(0)}
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
                        {(invite.name || "G").charAt(0).toUpperCase()}
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
                    {(group.name || "G").charAt(0).toUpperCase()}
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

      {/* Full Management Modal */}
      <AnimatePresence>
        {isManagementOpen && activeGroup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white rounded-[32px] shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden border border-white"
            >
              {/* Header */}
              <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-100">
                    <Users size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-gray-900 tracking-tight leading-none mb-1 uppercase">{activeGroup.name}</h2>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest leading-none">Gerenciamento de Equipe e Colaboração</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsManagementOpen(false)}
                  className="p-3 hover:bg-gray-100 rounded-2xl transition-all text-gray-400 hover:text-gray-900"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
                {/* Invite Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                       <UserPlus size={16} className="text-blue-600" />
                       Convidar Novo Integrante
                    </h3>
                  </div>
                  
                  {isOwner ? (
                    <form onSubmit={handleInvite} className="flex gap-2">
                      <input 
                        type="email"
                        placeholder="email@exemplo.com"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        className="flex-1 bg-gray-50 border border-gray-200 px-6 py-4 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-blue-100 outline-none transition-all"
                        required
                      />
                      <button 
                        type="submit"
                        className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black text-sm hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 active:scale-95"
                      >
                        ENVIAR
                      </button>
                    </form>
                  ) : (
                    <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex items-center gap-3 text-amber-700">
                       <Shield size={18} />
                       <span className="text-xs font-bold">Somente administradores podem convidar novos membros.</span>
                    </div>
                  )}
                </div>

                {/* Member List Section */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between border-b border-gray-50 pb-2">
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">
                       Membros da Equipe ({activeGroupMembers.filter(m => m.status !== 'removed').length})
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {sortedMembers.map((member) => (
                      <div key={(member.userId || '') + member.userEmail} className={`bg-gray-50/50 border border-gray-100 p-4 rounded-3xl flex items-center justify-between group/card transition-all hover:bg-white hover:shadow-xl hover:shadow-gray-200/50 pointer-events-auto ${member.status === 'removed' ? 'opacity-50' : ''}`}>
                        <div className="flex items-center gap-4">
                          <div className="relative">
                            <div className={`w-12 h-12 rounded-2xl overflow-hidden shadow-sm flex items-center justify-center transition-all ${member.status === 'active' ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                              {member.photoURL ? (
                                <img src={member.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-sm font-black">{(member.displayName || member.userEmail || "M").charAt(0).toUpperCase()}</span>
                              )}
                            </div>
                            <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${
                              member.status === 'active' ? 'bg-emerald-500' : 
                              member.status === 'pending' ? 'bg-amber-400' : 'bg-gray-400'
                            }`} />
                          </div>
                          
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-black text-gray-900 truncate uppercase tracking-tight">
                              {member.displayName || (member.userEmail?.split('@')[0])}
                            </span>
                            <span className="text-[10px] font-bold text-gray-400 truncate">{member.userEmail}</span>
                            <div className="flex items-center gap-2 mt-1">
                               <span className={`text-[8px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded-md ${member.role === 'owner' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                                  {member.role === 'owner' ? 'Administrador' : 'Membro'}
                               </span>
                               <span className={`text-[8px] font-black uppercase tracking-tighter ${
                                  member.status === 'active' ? 'text-emerald-500' : 
                                  member.status === 'pending' ? 'text-amber-500' : 'text-gray-400'
                               }`}>
                                  {member.status === 'active' ? 'Conectado' : 
                                   member.status === 'pending' ? 'Convidado' : 'Removido'}
                               </span>
                            </div>
                          </div>
                        </div>

                        {isOwner && member.userId !== user?.uid && member.status !== 'removed' && (
                          <button
                            onClick={() => handleRemoveMember(member.userId, member.userEmail, member.status)}
                            disabled={isRemoving === (member.userId || member.userEmail)}
                            className="w-10 h-10 flex items-center justify-center text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-2xl transition-all opacity-0 group-hover/card:opacity-100"
                            title={member.status === 'active' ? "Remover do grupo" : "Cancelar convite"}
                          >
                            {isRemoving === (member.userId || member.userEmail) ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <LogOut size={18} />
                            )}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              
              {/* Footer */}
              <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-center">
                 <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] italic">
                   Doctor Pro Colaboração Segura
                 </p>
              </div>
            </motion.div>
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
            <button 
              onClick={() => setIsManagementOpen(true)}
              className="p-1.5 hover:bg-emerald-50 text-emerald-600 rounded-lg transition-all"
              title="Abrir Gerenciamento Completo"
            >
              <Maximize size={16} />
            </button>
          </div>

          <div className="flex -space-x-2 px-2 pb-2">
            {activeGroupMembers.slice(0, 5).map((m, i) => (
              <div 
                key={i} 
                title={m.userEmail || "Membro"} 
                className={`w-7 h-7 rounded-full border-2 border-white flex items-center justify-center overflow-hidden shadow-sm ${m.status === 'active' ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500'}`}
              >
                {m.photoURL ? (
                  <img src={m.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[8px] font-bold uppercase">{(m.displayName || m.userEmail || "M").charAt(0)}</span>
                )}
              </div>
            ))}
            {activeGroupMembers.length > 5 && (
              <div className="w-7 h-7 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-[8px] font-bold text-gray-500 shadow-sm">
                +{activeGroupMembers.length - 5}
              </div>
            )}
          </div>

          <div className="space-y-1">
            {isOwner ? (
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
            ) : (
              <div className="w-full flex items-center gap-3 p-3 rounded-xl text-gray-400">
                <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center">
                  <Shield size={16} className="opacity-50" />
                </div>
                <span className="text-xs font-bold italic">Somente admin pode convidar</span>
              </div>
            )}

            {isInviting && isOwner && (
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
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">Membros da Equipe</div>
              <div className="max-h-56 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {sortedMembers.map((member) => (
                  <div key={(member.userId || '') + member.userEmail} className={`flex items-center justify-between p-2 rounded-xl hover:bg-gray-50 transition-colors group/member ${member.status === 'removed' ? 'opacity-50' : ''}`}>
                    <div className="flex items-center gap-3">
                      <div className="relative shrink-0">
                        <div className={`w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center border border-white shadow-sm ${member.status === 'active' ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                          {member.photoURL ? (
                            <img src={member.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[11px] font-black">{(member.displayName || member.userEmail || "M").charAt(0).toUpperCase()}</span>
                          )}
                        </div>
                        <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                          member.status === 'active' ? 'bg-emerald-500' : 
                          member.status === 'pending' ? 'bg-amber-400' : 'bg-gray-400'
                        }`} />
                      </div>
                      <div className="flex flex-col min-w-0 pr-2">
                        <span className="text-[11px] font-black text-gray-800 truncate uppercase tracking-tight leading-none mb-0.5">
                          {member.displayName || (member.userEmail?.split('@')[0])}
                        </span>
                        <span className="text-[9px] font-bold text-gray-400 truncate leading-none mb-1 lowercase">
                          {member.userEmail}
                        </span>
                        <div className="flex items-center gap-1.5 leading-none">
                           <span className={`text-[7px] font-black uppercase tracking-widest ${
                              member.status === 'active' ? 'text-emerald-500' : 
                              member.status === 'pending' ? 'text-amber-500' : 'text-gray-400'
                           }`}>
                             {member.status === 'active' ? 'Conectado' : 
                              member.status === 'pending' ? 'Convidado' : 'Removido'}
                           </span>
                           <span className="text-[7px] text-gray-300">•</span>
                           <span className="text-[7px] font-black uppercase text-gray-400 tracking-tighter">
                             {member.role === 'owner' ? 'Admin' : 'Membro'}
                           </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
        </div>
      )}
    </div>
  );
}
