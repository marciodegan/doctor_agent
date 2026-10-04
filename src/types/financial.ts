export type ClosingStatus = "ABERTO" | "EM_CONFERENCIA" | "CONCILIADO" | "CONCILIADO_COM_AVISOS" | "FECHADO";

export interface FinancialClosing {
  id: string;
  teamId: string;
  nome: string; // ex: SETEMBRO-26
  mes: number;
  ano: number;
  status: ClosingStatus;
  valorInformado: number;
  valorProcessado: number;
  valorLiberado: number;
  valorGlosa: number;
  valorImpostos: number;
  valorOutrosDebitos: number;
  valorOutrosCreditos: number;
  valorLiquido: number;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialImport {
  id: string;
  teamId: string;
  closingId: string;
  batchNumber: string; // ex: 10944
  providerName: string;
  files: { name: string; type: string }[];
  status: "PROCESSING" | "PENDING_REVIEW" | "IMPORTED" | "IMPORTED_WITH_WARNINGS" | "FAILED";
  summary: {
    totalProductionXls: number;
    totalProductionPdf: number;
    totalGlosas: number;
    totalTaxes: number;
    netValue: number;
  };
  warnings: string[];
  importedAt: string;
  importedBy: string;
}

export interface FinancialProductionRecord {
  id: string;
  teamId: string;
  closingId: string;
  importId: string;
  protocol: string;
  date: string;
  patientName: string;
  patientCode?: string;
  document?: string;
  quantity: number;
  ambCode: string;
  procedureDescription: string;
  honorValue: number;
  operationalValue: number;
  filmValue: number;
  administrativeFee: number;
  executingProvider: string;
  paymentProvider: string;
  protocolProvider: string;
  doctorId?: string;
  doctorName?: string;
  createdAt: string;
}

export interface FinancialGlosaRecord {
  id: string;
  teamId: string;
  closingId: string;
  importId: string;
  protocol: string;
  lot?: string;
  protocolDate?: string;
  valueInformed: number;
  valueProcessed: number;
  valueReleased: number;
  glosaValue: number;
  doctorId?: string;
  doctorName?: string;
  allocationStatus: "ALLOCATED" | "PENDING_REVIEW" | "UNASSIGNED";
  sourceDocument: string;
  createdAt: string;
}

export interface FinancialTaxRecord {
  id: string;
  teamId: string;
  closingId: string;
  importId: string;
  type: string; // IRRF, PIS, COFINS, CSLL
  code?: string;
  description: string;
  baseValue: number;
  taxValue: number;
  sourceDocument: string;
  createdAt: string;
}

export interface FinancialAdjustmentRecord {
  id: string;
  teamId: string;
  closingId: string;
  importId: string;
  type: string;
  code?: string;
  description: string;
  amount: number;
  nature: "CREDIT" | "DEBIT";
  scope: "DOCTOR" | "TEAM" | "CLOSING";
  doctorId?: string;
  doctorName?: string;
  sourceDocument: string;
  createdAt: string;
}

export interface FinancialTransaction {
  id: string;
  teamId: string;
  closingId: string;
  importId?: string;
  scope: "DOCTOR" | "TEAM" | "CLOSING";
  doctorId?: string;
  doctorName?: string;
  tipoLancamentoNome: string;
  dataLancamento: string;
  valor: number;
  natureza: "CREDITO" | "DEBITO";
  observacao?: string;
  protocol?: string;
  origem: "PDF" | "CSV" | "MANUAL";
  createdAt: string;
  updatedAt: string;
}

export interface FinancialTransactionType {
  id: string;
  teamId: string;
  nome: string;
  naturezaPadrao: "CREDITO" | "DEBITO";
}

export interface FinancialReconciliation {
  id: string;
  teamId: string;
  closingId: string;
  importId: string;
  productionStatus: "OK" | "WARNING" | "ERROR";
  productionDiff: number;
  glosaStatus: "OK" | "WARNING" | "ERROR";
  glosaDiff: number;
  taxStatus: "OK" | "WARNING" | "ERROR";
  taxDiff: number;
  netStatus: "OK" | "WARNING" | "ERROR";
  netDiff: number;
  overallStatus: "CONCILIADO" | "CONCILIADO_COM_AVISOS" | "COM_DIFERENCA";
  messages: string[];
  updatedAt: string;
}

export interface FinancialAuditLog {
  id: string;
  teamId: string;
  closingId: string;
  userId: string;
  userEmail: string;
  action: string;
  details: string;
  createdAt: string;
}
