import React, { useState } from "react";
import { 
  LayoutDashboard, 
  Wallet, 
  FileCheck2, 
  Stethoscope, 
  AlertOctagon, 
  ReceiptText, 
  UploadCloud, 
  Settings2, 
  ArrowLeft, 
  ShieldCheck,
  Building2,
  Calendar,
  CheckCircle2,
  Lock,
  Unlock,
  RefreshCw,
  Plus,
  ChevronRight,
  TrendingUp,
  FileText,
  TableProperties,
  Tag,
  UserPlus
} from "lucide-react";
import { FinancialClosingsView } from "./FinancialClosingsView";
import { FinancialImportWizard } from "./FinancialImportWizard";
import { DoctorDashboardView } from "./DoctorDashboardView";
import { DoctorManager } from "./DoctorManager";
import { FinancialTransactionsView } from "./FinancialTransactionsView";
import { ExcelDashboardView } from "./ExcelDashboardView";
import { TransactionTypesManager } from "./TransactionTypesManager";
import { useGroup } from "../../contexts/GroupContext";

interface AdministrationFullscreenProps {
  onClose: () => void;
  initialTab?: string;
}

export function AdministrationFullscreen({ onClose, initialTab = "excel_dashboard" }: AdministrationFullscreenProps) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [selectedClosingId, setSelectedClosingId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const { activeGroup } = useGroup();

  return (
    <div className="fixed inset-0 z-[200] bg-[#f8fafc] flex flex-col h-full w-full overflow-hidden text-gray-900 font-sans">
      {/* Top Administration Navigation Header */}
      <header className="h-16 bg-white border-b border-gray-200/80 px-6 flex items-center justify-between shrink-0 shadow-xs z-20">
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="flex items-center gap-2 text-gray-500 hover:text-blue-600 bg-gray-50 hover:bg-blue-50 px-3.5 py-2 rounded-xl transition font-bold text-xs cursor-pointer"
          >
            <ArrowLeft size={16} />
            <span>Voltar ao Workspace</span>
          </button>
          <div className="h-5 w-[1px] bg-gray-200" />
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black shadow-md shadow-blue-500/20">
              <ShieldCheck size={18} />
            </div>
            <div>
              <h1 className="font-black text-sm uppercase tracking-tight text-gray-900">ADMINISTRAÇÃO &gt; FINANCEIRO</h1>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{activeGroup?.name || "Gestão Financeira e Fechamentos"}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsImporting(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-black text-xs tracking-wider transition shadow-lg shadow-blue-500/20 active:scale-95 cursor-pointer"
          >
            <UploadCloud size={16} />
            <span>Importar Documentos (PDF/CSV)</span>
          </button>
        </div>
      </header>

      {/* Main Hub Body with Sidebar & Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Tabs */}
        <aside className="w-64 bg-white border-r border-gray-200/80 flex flex-col p-4 gap-1.5 shrink-0 overflow-y-auto">
          <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-3 py-2">Módulos Financeiros</div>
          
          <TabButton
            icon={<TableProperties size={18} />}
            label="Dashboard Excel"
            active={activeTab === "excel_dashboard"}
            onClick={() => { setActiveTab("excel_dashboard"); setIsImporting(false); }}
          />
          <TabButton
            icon={<FileCheck2 size={18} />}
            label="Fechamentos"
            active={activeTab === "fechamentos"}
            onClick={() => { setActiveTab("fechamentos"); setIsImporting(false); }}
          />
          <TabButton
            icon={<Wallet size={18} />}
            label="Fluxo de Caixa (Ocorrências)"
            active={activeTab === "fluxo"}
            onClick={() => { setActiveTab("fluxo"); setIsImporting(false); }}
          />
          <TabButton
            icon={<Stethoscope size={18} />}
            label="Produção por Médico"
            active={activeTab === "medicos"}
            onClick={() => { setActiveTab("medicos"); setIsImporting(false); }}
          />
          <TabButton
            icon={<UserPlus size={18} />}
            label="Gerenciar Médicos"
            active={activeTab === "gerenciar_medicos"}
            onClick={() => { setActiveTab("gerenciar_medicos"); setIsImporting(false); }}
          />
          <TabButton
            icon={<AlertOctagon size={18} />}
            label="Glosas & Rateios"
            active={activeTab === "glosas"}
            onClick={() => { setActiveTab("glosas"); setIsImporting(false); }}
          />
          <TabButton
            icon={<ReceiptText size={18} />}
            label="Impostos & Tributos"
            active={activeTab === "impostos"}
            onClick={() => { setActiveTab("impostos"); setIsImporting(false); }}
          />
          <TabButton
            icon={<UploadCloud size={18} />}
            label="Importações & Upload"
            active={activeTab === "importacoes"}
            onClick={() => { setActiveTab("importacoes"); setIsImporting(false); }}
          />
          <TabButton
            icon={<Tag size={18} />}
            label="Tipos de Lançamento"
            active={activeTab === "tipos_lancamento"}
            onClick={() => { setActiveTab("tipos_lancamento"); setIsImporting(false); }}
          />
          <TabButton
            icon={<Settings2 size={18} />}
            label="Configurações Financeiras"
            active={activeTab === "config"}
            onClick={() => { setActiveTab("config"); setIsImporting(false); }}
          />

          <div className="mt-auto pt-4 border-t border-gray-100 px-3">
            <div className="p-3 bg-emerald-50/70 rounded-2xl border border-emerald-100/60 space-y-1">
              <span className="text-[10px] font-black text-emerald-800 uppercase block tracking-wider">Planilha Inteligente Ativa</span>
              <p className="text-[10px] text-emerald-700 font-medium leading-relaxed">Taxas, glosas e ocorrências vinculadas diretamente ao fluxo de caixa.</p>
            </div>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 bg-gray-50 overflow-y-auto p-6 lg:p-8">
          {isImporting ? (
            <FinancialImportWizard
              onClose={() => setIsImporting(false)}
              onComplete={(closingId) => {
                setIsImporting(false);
                setSelectedClosingId(closingId);
                setActiveTab("excel_dashboard");
              }}
            />
          ) : activeTab === "excel_dashboard" ? (
            <ExcelDashboardView closingId={selectedClosingId} />
          ) : activeTab === "fechamentos" ? (
            <FinancialClosingsView
              selectedClosingId={selectedClosingId}
              onSelectClosing={setSelectedClosingId}
              onOpenImport={() => setIsImporting(true)}
            />
          ) : activeTab === "medicos" ? (
            <DoctorDashboardView closingId={selectedClosingId} />
          ) : activeTab === "gerenciar_medicos" ? (
            <DoctorManager />
          ) : activeTab === "fluxo" ? (
            <FinancialTransactionsView closingId={selectedClosingId} />
          ) : activeTab === "importacoes" ? (
            <FinancialImportWizard
              onClose={() => setActiveTab("excel_dashboard")}
              onComplete={(closingId) => {
                setSelectedClosingId(closingId);
                setActiveTab("excel_dashboard");
              }}
            />
          ) : activeTab === "tipos_lancamento" ? (
            <TransactionTypesManager />
          ) : activeTab === "config" ? (
            <ExcelDashboardView closingId={selectedClosingId} initialSubTab="config_equipe" />
          ) : activeTab === "glosas" ? (
            <ExcelDashboardView closingId={selectedClosingId} initialSubTab="ocorrencias_fluxo" />
          ) : activeTab === "impostos" ? (
            <ExcelDashboardView closingId={selectedClosingId} initialSubTab="lotes_unimed" />
          ) : (
            <div className="max-w-4xl mx-auto py-12 text-center space-y-4">
              <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
                <FileText size={32} />
              </div>
              <h3 className="text-xl font-black text-gray-900 uppercase">Módulo em Execução</h3>
              <p className="text-sm text-gray-500">Selecione uma opção no menu lateral para visualizar os dados financeiros.</p>
              <button
                onClick={() => setActiveTab("excel_dashboard")}
                className="px-6 py-3 bg-blue-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-xl shadow-blue-500/20"
              >
                Abrir Dashboard Excel
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function TabButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 w-full px-4 py-3 rounded-2xl font-bold text-xs transition-all cursor-pointer ${
        active 
          ? "bg-blue-600 text-white shadow-xl shadow-blue-500/20" 
          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
      }`}
    >
      {icon}
      <span>{label}</span>
      {active && <ChevronRight size={14} className="ml-auto opacity-80" />}
    </button>
  );
}
