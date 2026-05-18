import React from "react";
import {
  ShieldCheck,
} from "lucide-react";

export const PersonalDocuments: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-gray-50/50 p-10 text-center">
      <div className="w-20 h-20 rounded-3xl bg-gray-100 flex items-center justify-center text-gray-400 mb-6">
        <ShieldCheck size={40} />
      </div>
      <h3 className="text-2xl font-black text-gray-900 tracking-tight mb-2">Documentos em Breve</h3>
      <p className="text-sm font-medium text-gray-500 max-w-sm">
        A integração com armazenamento de documentos foi desativada por solicitação do administrador. 
        Estamos trabalhando em novas formas seguras de gerenciar seus arquivos.
      </p>
    </div>
  );
};