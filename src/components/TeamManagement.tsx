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
  X,
  ArrowLeft,
  Trash2,
  MessageCircle,
  ExternalLink
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { GroupConfigs } from "./GroupConfigs";

export function TeamManagement() {
  const { 
    activeGroup, 
    activeGroupMembers,
    inviteUser, 
    removeMember,
    updateMemberRole,
    cancelInvite,
    isManagementOpen,
    setIsManagementOpen,
    managementMode,
    setManagementMode,
    setConfigsActiveTab
  } = useGroup();
  const { user } = useAuth();
  const [inviteEmail, setInviteEmail] = useState("");
  const [lastInvitedEmail, setLastInvitedEmail] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState<string | null>(null);
  const [isUpdatingRole, setIsUpdatingRole] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<{ id: string, email: string, status: string } | null>(null);
  const [error, setError] = useState("");

  const currentUserMembership = activeGroupMembers.find(m => m.userId === user?.uid);
  const isOwner = currentUserMembership?.role === "owner";

  // Reset to dashboard when opened (unless specified otherwise via external triggers)
  React.useEffect(() => {
    if (!isManagementOpen) {
      setManagementMode("dashboard");
      setConfigsActiveTab(null);
    }
  }, [isManagementOpen]);

  const visibleMembers = activeGroupMembers.filter(m => m.status !== 'removed');
  const conectados = visibleMembers.filter(m => m.status === 'active' || m.status === 'conectado');
  const pendentes = visibleMembers.filter(m => m.status === 'pending');
  const outros = visibleMembers.filter(m => m.status !== 'active' && m.status !== 'conectado' && m.status !== 'pending');

  const MemberCard = ({ member }: { member: any }) => (
    <div key={(member.userId || '') + member.userEmail} className={`bg-gray-50/50 border border-gray-100 p-4 rounded-3xl flex items-center justify-between group/card transition-all hover:bg-white hover:shadow-xl hover:shadow-gray-200/50 pointer-events-auto ${member.status === 'removed' ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <div className={`w-10 h-10 rounded-xl overflow-hidden shadow-sm flex items-center justify-center transition-all ${member.status === 'active' || member.status === 'conectado' ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
            {member.photoURL ? (
              <img src={member.photoURL} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs font-black uppercase">{(member.displayName || member.userEmail || "M").charAt(0)}</span>
            )}
          </div>
          <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${
            (member.status === 'active' || member.status === 'conectado') ? 'bg-emerald-500' : 
            member.status === 'pending' ? 'bg-amber-400' : 'bg-gray-400'
          }`} />
        </div>
        
        <div className="flex flex-col min-w-0">
          <span className="text-[13px] font-black text-gray-900 truncate uppercase tracking-tight leading-tight">
            {member.displayName || (member.userEmail?.split('@')[0])}
          </span>
          <span className="text-[9px] font-bold text-gray-400 truncate leading-none mt-0.5">{member.userEmail}</span>
          <div className="flex items-center gap-2 mt-1">
             <span className={`text-[7px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded-md ${member.role === 'owner' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                {member.role === 'owner' ? 'Administrador' : 'Membro'}
             </span>
             <span className={`text-[7px] font-black uppercase tracking-tighter ${
                (member.status === 'active' || member.status === 'conectado') ? 'text-emerald-500' : 
                member.status === 'pending' ? 'text-amber-500' : 'text-gray-400'
             }`}>
                {(member.status === 'active' || member.status === 'conectado') ? 'Conectado' : 
                 member.status === 'pending' ? 'Pendente' : 'Removido'}
             </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
         {member.status === 'pending' && (
           <button
             onClick={() => {
               const text = `Olá! Convidei você para participar do grupo "${activeGroup.name}" no sistema Doctor Pro. 🩺\n\nAcesse para aceitar o convite: ${window.location.origin}`;
               const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
               window.open(url, '_blank');
             }}
             className="w-8 h-8 flex items-center justify-center bg-emerald-100 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-xl transition-all shrink-0"
             title="Enviar convite por WhatsApp"
           >
             <MessageCircle size={14} />
           </button>
         )}

         {isOwner && member.userId && member.userId !== user?.uid && (member.status === 'active' || member.status === 'conectado') && (
           <button
             onClick={() => handleToggleAdmin(member.userId, member.role)}
             disabled={isUpdatingRole === member.userId}
             className={`w-8 h-8 flex items-center justify-center rounded-xl transition-all shrink-0 ${
               member.role === 'owner' 
                 ? "bg-blue-600 text-white shadow-lg shadow-blue-100" 
                 : "bg-gray-100 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
             }`}
             title={member.role === 'owner' ? "Remover admin" : "Tornar admin"}
           >
             {isUpdatingRole === member.userId ? (
               <Loader2 size={14} className="animate-spin" />
             ) : (
               <Shield size={14} />
             )}
           </button>
         )}

         {isOwner && member.userId !== user?.uid && member.status !== 'removed' && (
           <button
             onClick={() => {
               if (member.status === 'active' || member.status === 'conectado') {
                 setMemberToRemove({ id: member.userId, email: member.userEmail, status: member.status });
               } else {
                 handleRemoveMember(member.userId, member.userEmail, member.status);
               }
             }}
             disabled={isRemoving === (member.userId || member.userEmail)}
             className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all shrink-0"
             title={(member.status === 'active' || member.status === 'conectado') ? "Remover do grupo" : "Cancelar convite"}
           >
             {isRemoving === (member.userId || member.userEmail) ? (
               <Loader2 size={14} className="animate-spin" />
             ) : (
               <Trash2 size={14} />
             )}
           </button>
         )}
      </div>
    </div>
  );

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !activeGroup) return;
    try {
      setError("");
      const email = inviteEmail.trim();
      await inviteUser(activeGroup.id, email);
      setLastInvitedEmail(email);
      setInviteEmail("");
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRemoveMember = async (targetUserId: string, email: string, status: string) => {
    if (!activeGroup) return;
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

  const handleToggleAdmin = async (targetUserId: string, currentRole: string) => {
    if (!activeGroup || !targetUserId) return;
    const newRole = currentRole === "owner" ? "member" : "owner";
    const confirmMsg = newRole === "owner" 
      ? "Deseja conceder permissão de Administrador a este membro? Ele poderá gerenciar configurações e outros membros."
      : "Deseja remover a permissão de Administrador deste membro?";
    
    if (!confirm(confirmMsg)) return;

    try {
      setIsUpdatingRole(targetUserId);
      await updateMemberRole(activeGroup.id, targetUserId, newRole);
      setIsUpdatingRole(null);
    } catch (err: any) {
      alert(err.message || "Erro ao atualizar permissão");
      setIsUpdatingRole(null);
    }
  };

  if (!isManagementOpen || !activeGroup) return null;

  return (
    <AnimatePresence>
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
          className="bg-white rounded-[32px] shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-white"
        >
          {/* Header */}
          <div className="p-6 sm:p-8 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl overflow-hidden flex items-center justify-center text-white shadow-xl shadow-blue-100 shrink-0">
                {activeGroup.photoURL ? (
                  <img src={activeGroup.photoURL} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-blue-600 flex items-center justify-center">
                    <Users size={24} />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl font-black text-gray-900 tracking-tight leading-none mb-1 uppercase truncate">{activeGroup.name}</h2>
                <p className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-widest leading-none truncate">
                  {activeGroup.groupType === 'personal' ? 'Membros da Família' : 'Equipe e Colaboração'}
                </p>
              </div>
            </div>
            <button 
              onClick={() => {
                setIsManagementOpen(false);
                setManagementMode("dashboard");
              }}
              className="p-2 sm:p-3 hover:bg-gray-100 rounded-2xl transition-all text-gray-400 hover:text-gray-900 shrink-0"
            >
              <X size={24} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-10 custom-scrollbar">
            {managementMode === "dashboard" ? (
              <div className="space-y-8">
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                    <button 
                      onClick={() => setManagementMode("members")}
                      className="flex flex-col items-center justify-center gap-4 p-8 bg-blue-50/50 border-2 border-blue-100 rounded-[40px] hover:bg-blue-600 hover:text-white hover:border-blue-500 hover:shadow-2xl hover:shadow-blue-200 transition-all group relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                         <Users size={80} />
                      </div>
                      <div className="p-4 bg-white text-blue-600 rounded-[24px] shadow-lg group-hover:scale-110 transition-all">
                        <Users size={32} />
                      </div>
                      <div className="text-center">
                        <h4 className="text-[15px] font-black uppercase tracking-tight mb-1">
                          {activeGroup.groupType === 'personal' ? 'Integrantes' : 'Membros'}
                        </h4>
                        <p className="text-[9px] font-bold uppercase tracking-widest opacity-60 group-hover:text-blue-50">
                          {activeGroup.groupType === 'personal' ? 'Família & Convites' : 'Equipe & Convites'}
                        </p>
                      </div>
                    </button>

                    <button 
                      onClick={() => setManagementMode("configs")}
                      className="flex flex-col items-center justify-center gap-4 p-8 bg-emerald-50/50 border-2 border-emerald-100 rounded-[40px] hover:bg-emerald-600 hover:text-white hover:border-emerald-500 hover:shadow-2xl hover:shadow-emerald-200 transition-all group relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                         <Settings size={80} />
                      </div>
                      <div className="p-4 bg-white text-emerald-600 rounded-[24px] shadow-lg group-hover:scale-110 transition-all">
                        <Settings size={32} />
                      </div>
                      <div className="text-center">
                        <h4 className="text-[15px] font-black uppercase tracking-tight mb-1">Configurações</h4>
                        <p className="text-[9px] font-bold uppercase tracking-widest opacity-60 group-hover:text-emerald-50">Ajustes do Grupo</p>
                      </div>
                    </button>
                 </div>

                 <div className="pt-8 border-t border-gray-100">
                    <div className="bg-gray-50 rounded-[24px] p-4 flex items-start gap-4">
                       <Shield className="text-blue-600 shrink-0 mt-0.5" size={20} />
                       <div>
                          <p className="text-[11px] font-black text-gray-900 uppercase tracking-tight mb-1">Privacidade Garantida</p>
                          <p className="text-[10px] text-gray-500 font-medium leading-relaxed">As alterações feitas aqui afetam todos os membros da equipe {activeGroup.name}. A sincronização é feita em tempo real.</p>
                       </div>
                    </div>
                 </div>
              </div>
            ) : managementMode === "configs" ? (
              <div className="space-y-6">
                <div className="flex items-center gap-4 mb-4">
                   <button 
                     onClick={() => setManagementMode("dashboard")}
                     className="p-3 bg-gray-100 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-2xl transition-all"
                   >
                     <ArrowLeft size={20} />
                   </button>
                   <div>
                      <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Ajustes do Grupo</h3>
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">Hospitais, Procedimentos e Status</p>
                   </div>
                </div>
                <GroupConfigs />
              </div>
            ) : (
              <div className="space-y-10">
                <div className="flex items-center gap-4 mb-4">
                   <button 
                     onClick={() => setManagementMode("dashboard")}
                     className="p-3 bg-gray-100 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-2xl transition-all"
                   >
                     <ArrowLeft size={20} />
                   </button>
                   <div>
                      <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">
                        {activeGroup.groupType === 'personal' ? 'Membros da Família' : 'Membros da Equipe'}
                      </h3>
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">Gestão de Acessos e Convites</p>
                   </div>
                </div>
                
                {/* Invite Section */}
                <div className="space-y-4 bg-blue-50/30 p-6 rounded-[32px] border border-blue-100/50">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] flex items-center gap-2">
                       <UserPlus size={14} />
                       {activeGroup.groupType === 'personal' ? 'Convidar Novo Integrante' : 'Convidar Novo Médico'}
                    </h3>
                  </div>
              
              {isOwner ? (
                <form onSubmit={handleInvite} className="flex flex-col gap-3">
                  <input 
                    type="email"
                    placeholder="email@exemplo.com"
                    value={inviteEmail}
                    onChange={(e) => {
                      setInviteEmail(e.target.value);
                      if (lastInvitedEmail) setLastInvitedEmail(null);
                    }}
                    className="w-full bg-white border border-gray-200 px-5 py-4 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-blue-100 outline-none transition-all"
                    required
                  />
                  <button 
                    type="submit"
                    className="w-full bg-blue-600 text-white px-8 py-4 rounded-2xl font-black text-sm hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 active:scale-95"
                  >
                    ENVIAR CONVITE
                  </button>

                  <AnimatePresence>
                    {lastInvitedEmail && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl space-y-3"
                      >
                        <div className="flex items-center gap-3 text-emerald-700">
                          <Check size={18} />
                          <span className="text-xs font-bold">Convite enviado para {lastInvitedEmail}!</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const text = `Olá! Convidei você para participar do grupo "${activeGroup.name}" no sistema Doctor Pro. 🩺\n\nAcesse para aceitar o convite: ${window.location.origin}`;
                            const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
                            window.open(url, '_blank');
                          }}
                          className="w-full bg-emerald-600 text-white px-4 py-3 rounded-xl font-black text-xs hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 uppercase tracking-widest shadow-lg shadow-emerald-100"
                        >
                          <MessageCircle size={16} />
                          Enviar por WhatsApp
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </form>
              ) : (
                <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex items-center gap-3 text-amber-700">
                   <Shield size={18} />
                   <span className="text-xs font-bold">Somente administradores podem convidar membros.</span>
                </div>
              )}
            </div>

            {/* Member List Section */}
            <div className="space-y-8">
              {conectados.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-gray-50 pb-2">
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                       <Check size={14} className="text-emerald-500" />
                       {activeGroup.groupType === 'personal' ? 'Integrantes Conectados' : 'Membros Conectados'} ({conectados.length})
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {conectados.map(member => <MemberCard key={(member.userId || '') + member.userEmail} member={member} />)}
                  </div>
                </div>
              )}

              {pendentes.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-gray-50 pb-2">
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                       <Loader2 size={14} className="text-amber-500" />
                       Convites Pendentes ({pendentes.length})
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {pendentes.map(member => <MemberCard key={(member.userId || '') + member.userEmail} member={member} />)}
                  </div>
                </div>
              )}

              {outros.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-gray-50 pb-2">
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">
                       Outros ({outros.length})
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {outros.map(member => <MemberCard key={(member.userId || '') + member.userEmail} member={member} />)}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  </motion.div>

      {/* Internal Removal Confirmation */}
      {memberToRemove && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            className="bg-white rounded-[32px] shadow-2xl p-8 max-w-sm w-full text-center space-y-6"
          >
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
              <Shield size={32} />
            </div>
            
            <div className="space-y-2">
              <h3 className="text-xl font-black text-gray-900 tracking-tight uppercase">Remover Integrante</h3>
              <p className="text-sm text-gray-500 font-medium">
                Deseja remover <span className="font-bold text-gray-900">{memberToRemove.email}</span>? 
                O acesso será revogado imediatamente.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setMemberToRemove(null)}
                className="flex-1 px-6 py-4 rounded-2xl font-black text-xs text-gray-500 hover:bg-gray-100 transition-all uppercase tracking-widest"
              >
                VOLTAR
              </button>
              <button
                onClick={async () => {
                  const { id, email, status } = memberToRemove;
                  setMemberToRemove(null);
                  await handleRemoveMember(id, email, status);
                }}
                className="flex-1 bg-red-600 text-white px-6 py-4 rounded-2xl font-black text-xs hover:bg-red-700 transition-all shadow-xl shadow-red-100 uppercase tracking-widest"
              >
                REMOVER
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
