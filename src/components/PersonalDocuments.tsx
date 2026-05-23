import React from "react";
import { FolderOpen } from "lucide-react";

// TODO: Replace Google Drive document storage with Firebase Storage.
// Required security flow:
// 1. User must be authenticated.
// 2. User must be member of groupId.
// 3. Patient must belong to groupId.
// 4. File must belong to patientId.
// 5. Only then allow upload/view/delete.

export const PersonalDocuments: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 py-12 text-center bg-transparent">
      <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100/80 text-slate-400 mb-6 shadow-sm">
        <FolderOpen size={28} />
      </div>
      
      <h2 className="text-xl font-black text-slate-800 tracking-tight mb-2">
        Arquivos do paciente
      </h2>
      
      <p className="text-sm text-slate-500 font-medium max-w-sm leading-relaxed mb-6">
        O armazenamento de arquivos está sendo migrado para uma estrutura segura com Firebase Storage.
      </p>
      
      <button
        disabled
        className="px-6 py-2.5 bg-slate-100 text-slate-400 text-xs font-bold rounded-xl uppercase tracking-widest transition-all cursor-not-allowed border border-slate-200/50"
      >
        Em breve
      </button>
    </div>
  );
};
