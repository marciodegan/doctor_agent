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
  UserPlus
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export function GroupSelector() {
  const { groups, invites, activeGroup, setActiveGroupId, createGroup, inviteUser, acceptInvite, loading } = useGroup();
  const { user, logout } = useAuth();
  const [isCreating, setIsCreating] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [error, setError] = useState("");
  const [isAccepting, setIsAccepting] = useState<string | null>(null);

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
                      <div className="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center font-bold">
                        {invite.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-sm text-gray-900 uppercase">{invite.name}</div>
                        <div className="text-[10px] text-blue-600 font-bold uppercase tracking-tight">Você foi convidado</div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleAcceptInvite(invite.id)}
                      disabled={isAccepting === invite.id}
                      className="w-full bg-blue-600 text-white py-2.5 rounded-xl font-bold text-xs hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
                    >
                      {isAccepting === invite.id ? (
                        <Loader2 className="animate-spin" size={14} />
                      ) : (
                        <Check size={14} />
                      )}
                      ENTRAR NO GRUPO {invite.name.toUpperCase()}
                    </button>
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
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600">
              <Shield size={16} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-gray-900">Gerenciar Grupo</h4>
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Colaboração</p>
            </div>
          </div>

          <button 
            onClick={() => setIsInviting(!isInviting)}
            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 text-gray-600 hover:text-blue-600 transition-all group"
          >
            <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
              <UserPlus size={16} />
            </div>
            <span className="text-xs font-bold">Convidar Integrante</span>
            <ChevronRight size={14} className="ml-auto opacity-0 group-hover:opacity-100 transition-all" />
          </button>

          {isInviting && (
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
          )}
        </div>
      )}
    </div>
  );
}
