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
  X,
  ArrowLeft,
  Trash2,
  User,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { GroupConfigs } from "./GroupConfigs";

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
    isManagementOpen,
    setIsManagementOpen,
    loading,
  } = useGroup();
  const { user } = useAuth();
  const [isCreating, setIsCreating] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupType, setNewGroupType] = useState<"professional" | "personal">(
    "professional",
  );
  const [error, setError] = useState("");
  const [isAccepting, setIsAccepting] = useState<string | null>(null);
  const [isDeclining, setIsDeclining] = useState<string | null>(null);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    try {
      setError("");
      await createGroup(newGroupName, newGroupType);
      setNewGroupName("");
      setNewGroupType("professional");
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
        <h2 className="text-2xl font-black text-gray-900 text-center mb-2">
          Bem-vindo ao Doctor Pro!
        </h2>
        <p className="text-gray-500 text-center mb-8">
          Para começar, crie o seu primeiro grupo de trabalho.
        </p>

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
        <h2 className="text-2xl font-black text-gray-900 text-center mb-2">
          Convites Encontrados!
        </h2>
        <p className="text-gray-500 text-center mb-8">
          Você foi convidado para participar dos seguintes grupos:
        </p>

        <div className="space-y-3 mb-8">
          {invites.map((invite) => (
            <div
              key={invite.id}
              className="bg-gray-50 border border-gray-100 p-4 rounded-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center font-bold uppercase">
                    {(invite.name || "G").charAt(0)}
                  </div>
                  <div className="font-bold text-gray-900 uppercase text-sm">
                    {invite.name}
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => handleAcceptInvite(invite.id)}
                  disabled={
                    isAccepting === invite.id || isDeclining === invite.id
                  }
                  className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-md active:scale-95 disabled:opacity-50"
                >
                  {isAccepting === invite.id ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Check size={16} />
                  )}
                  ENTRAR NO GRUPO
                </button>
                <button
                  onClick={() => handleDeclineInvite(invite.id)}
                  disabled={
                    isAccepting === invite.id || isDeclining === invite.id
                  }
                  className="w-full bg-white text-red-600 border border-red-100 font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-red-50 transition-all active:scale-95 disabled:opacity-50"
                >
                  {isDeclining === invite.id ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <LogOut size={16} />
                  )}
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
    <div className="space-y-2.5">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-6 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-blue-200">
            <Users size={12} />
          </div>
          <div>
            <h3 className="text-xs font-black text-gray-900 tracking-tight leading-none mb-0.5">
              Grupos
            </h3>
            <p className="text-[7px] font-bold text-gray-400 uppercase tracking-widest leading-none">
              Workspace
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="p-1 hover:bg-gray-100 rounded-md transition-all text-gray-400 hover:text-blue-600"
        >
          <Plus size={14} />
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

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setNewGroupType("professional")}
                className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-1 ${
                  newGroupType === "professional"
                    ? "bg-blue-50 border-blue-600 text-blue-600"
                    : "bg-white border-gray-100 text-gray-400 hover:border-gray-200"
                }`}
              >
                <Shield size={16} />
                <span className="text-[10px] font-black uppercase tracking-tight">
                  Profissional
                </span>
              </button>
              <button
                type="button"
                onClick={() => setNewGroupType("personal")}
                className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-1 ${
                  newGroupType === "personal"
                    ? "bg-rose-50 border-rose-600 text-rose-600"
                    : "bg-white border-gray-100 text-gray-400 hover:border-gray-200"
                }`}
              >
                <User size={16} />
                <span className="text-[10px] font-black uppercase tracking-tight">
                  Pessoal
                </span>
              </button>
            </div>

            <p className="text-[8px] text-gray-400 font-bold uppercase tracking-widest text-center px-2">
              {newGroupType === "professional"
                ? "Indicado para hospitais, clínicas e equipes médicas."
                : "Indicado para documentos familiares, seguros e uso pessoal."}
            </p>

            {error && (
              <p className="text-xs text-red-500 font-bold px-1">{error}</p>
            )}
            <div className="flex flex-col gap-2">
              <button
                type="submit"
                className="w-full bg-blue-600 text-white py-2.5 rounded-xl font-bold text-[11px] hover:bg-blue-700 transition-all shadow-sm uppercase tracking-widest"
              >
                CRIAR GRUPO
              </button>
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="w-full py-2 rounded-lg font-bold text-[9px] text-gray-400 hover:text-gray-600 transition-all border border-transparent hover:border-gray-100 uppercase tracking-widest"
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
            className="space-y-3"
          >
            {/* Invitations Section */}
            {invites.length > 0 && (
              <div className="space-y-2">
                <div className="text-[9px] font-bold text-blue-600 uppercase tracking-widest px-2">
                  Convites Pendentes
                </div>
                {invites.map((invite) => (
                  <motion.div
                    key={invite.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-blue-50 border border-blue-100 p-3 rounded-xl flex flex-col gap-2.5"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center font-bold text-lg">
                        {(invite.name || "G").charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-[13px] text-gray-900 uppercase leading-none mb-1">
                          {invite.name}
                        </div>
                        <div className="text-[9px] text-blue-600 font-bold uppercase tracking-tight">
                          Convidado
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleAcceptInvite(invite.id)}
                        disabled={
                          isAccepting === invite.id || isDeclining === invite.id
                        }
                        className="flex-[2] bg-blue-600 text-white py-2 rounded-lg font-bold text-[10px] hover:bg-blue-700 transition-all flex items-center justify-center gap-1.5"
                      >
                        {isAccepting === invite.id ? (
                          <Loader2 className="animate-spin" size={12} />
                        ) : (
                          <Check size={12} />
                        )}
                        ACEITAR
                      </button>
                      <button
                        onClick={() => handleDeclineInvite(invite.id)}
                        disabled={
                          isAccepting === invite.id || isDeclining === invite.id
                        }
                        className="flex-1 bg-white border border-red-100 text-red-600 py-2 rounded-lg font-bold text-[10px] hover:bg-red-50 transition-all flex items-center justify-center gap-1.5"
                      >
                        {isDeclining === invite.id ? (
                          <Loader2 className="animate-spin" size={12} />
                        ) : (
                          <X size={12} />
                        )}
                        NÃO
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Active Groups List */}
            <div className="space-y-1">
              {groups.length > 0 && (
                <div className="text-[8px] font-bold text-gray-400 uppercase tracking-widest px-2">
                  Ativos
                </div>
              )}
              {groups.map((group) => (
                <div key={group.id} className="relative group/item">
                  <button
                    onClick={() => setActiveGroupId(group.id)}
                    className={`w-full flex items-center gap-2.5 p-2 rounded-xl transition-all border-2 ${
                      activeGroup?.id === group.id
                        ? "bg-blue-50 border-blue-600 shadow-sm"
                        : "bg-white border-transparent hover:border-gray-100 hover:bg-gray-50"
                    }`}
                  >
                    <div
                      className={`w-6 h-6 rounded-md flex items-center justify-center transition-all shrink-0 overflow-hidden ${
                        activeGroup?.id === group.id
                          ? group.groupType === "personal"
                            ? "bg-rose-600 text-white"
                            : "bg-blue-600 text-white"
                          : "bg-gray-100 text-gray-400 group-hover:bg-gray-200"
                      }`}
                    >
                      {group.photoURL ? (
                        <img
                          src={group.photoURL}
                          alt={group.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-[10px] font-black">
                          {(group.name || "G").charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <div className="flex items-center gap-1.5">
                        <div className="font-bold text-[11px] text-gray-900 group-hover:text-blue-600 transition-colors uppercase tracking-tight truncate">
                          {group.name}
                        </div>
                        {group.groupType === "personal" && (
                          <div
                            className="w-1.5 h-1.5 bg-rose-500 rounded-full shrink-0"
                            title="Grupo Pessoal"
                          />
                        )}
                      </div>
                      <div className="text-[7px] font-bold text-gray-400 uppercase tracking-widest leading-none">
                        {activeGroup?.id === group.id ? "Em uso" : "Selecionar"}
                      </div>
                    </div>
                    {activeGroup?.id === group.id && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsManagementOpen(true);
                          }}
                          className="p-1 px-1.5 bg-emerald-100 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-md transition-all flex items-center gap-1 group/btn shadow-sm"
                          title="Gerenciar Equipe"
                        >
                          <Shield size={10} />
                          <span className="text-[8px] font-black uppercase tracking-tighter">
                            Time
                          </span>
                        </button>
                        <Check size={12} className="text-blue-600" />
                      </div>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
