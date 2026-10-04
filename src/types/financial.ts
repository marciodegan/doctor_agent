export type ClosingStatus = "PROCESSING" | "PENDING" | "CONCILIADO" | "CONCILIADO_COM_AVISOS" | "COM_DIFERENCA" | "FECHADO";

export interface FinancialClosing {
  id: string;
  teamId: string;
  monthKey: string; // e.g., "SETEMBRO-26"
  status: ClosingStatus;
  informedValue: number;
  processedValue: number;
  releasedValue: number;
  glosaValue: number;
  netValue: number;
  taxValue: number;
  otherDebits: number;
  otherCredits: number;
  productionQuantity: number;
  pdfProductionQuantity: number;
  hasQuantityDivergence: boolean;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  closedBy?: string;
  reopenReason?: string;
}

export interface FinancialImport {
  id: string;
  teamId: string;
  closingId: string;
  providerName: string;
  batchNumber: string;
  files: string[];
  status: "PROCESSING" | "PENDING_REVIEW" | "IMPORTED" | "IMPORTED_WITH_WARNINGS" | "FAILED" | "CANCELLED";
  recordCount: number;
  valuesFound: {
    production: number;
    taxes: number;
    glosas: number;
    net: number;
  };
  errors: string[];
  warnings: string[];
  importedAt: string;
  importedBy: string;
}

export interface FinancialProduction {
  id: string;
  teamId: string;
  closingId: string;
  importId: string;
  protocol: string;
  date: string;
  patientName: string;
  patientCode: string;
  document: string;
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

export interface FinancialGlosa {
  id: string;
  teamId: string;
  closingId: string;
  importId: string;
  protocol: string;
  lot?: string;
  protocolDate: string;
  valueInformed: number;
  valueProcessed: number;
  valueReleased: number;
  glosaValue: number;
  doctorId?: string;
  doctorName?: string;
  allocationStatus: "ALLOCATED" | "PENDING_REVIEW" | "TEAM_TEAM";
  sourceDocument: string;
  createdAt: string;
}

export interface FinancialTax {
  id: string;
  closingId: string;
  importId: string;
  type: string;
  code: string;
  description: string;
  baseValue: number;
  taxValue: number;
  sourceDocument: string;
  createdAt: string;
}

export interface FinancialAdjustment {
  id: string;
  closingId: string;
  importId: string;
  type: string;
  code: string;
  description: string;
  amount: number;
  nature: "CREDIT" | "DEBIT";
  scope: "DOCTOR" | "TEAM" | "CLOSING";
  doctorId?: string;
  doctorName?: string;
  sourceDocument: string;
}

export interface FinancialTransaction {
  id: string;
  teamId: string;
  closingId: string;
  importId?: string;
  scope: "DOCTOR" | "TEAM" | "CLOSING";
  doctorId?: string;
  doctorName?: string;
  typeId: string;
  typeName: string;
  date: string;
  amount: number;
  nature: "CREDIT" | "DEBIT";
  observation: string;
  protocol?: string;
  guide?: string;
  title?: string;
  patient?: string;
  procedureCode?: string;
  source: "CSV" | "PDF" | "MANUAL";
  sourceFile?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface FinancialTransactionType {
  id: string;
  teamId: string;
  name: string;
  nature: "CREDIT" | "DEBIT";
  defaultScope: "DOCTOR" | "TEAM" | "CLOSING";
}

export interface FinancialAuditLog {
  id: string;
  teamId: string;
  closingId: string;
  userId: string;
  userName: string;
  action: string;
  fieldChanged?: string;
  oldValue?: string;
  newValue?: string;
  reason?: string;
  timestamp: string;
}

export interface FinancialPendency {
  id: string;
  type: string;
  description: string;
  severity: "INFO" | "WARNING" | "ERROR";
  resolved: boolean;
  protocol?: string;
}

export interface DoctorTeamMember {
  key: string;
  name: string;
  isTeamMember: boolean; // true for Rochele, Thais, Luis, Kathize; false for Thaynara, Tamara, Maria Eduarda, Camila, Luan
  teamSharePercent: number; // e.g. 29, 29, 29, 13 (percentual societário nominal)
  proporcaoHeartDinamica?: number; // e.g. 26.79, 28.97, 26.79, 17.45 (calculado dinamicamente com base nas receitas do período)
  disponivelPeriodo?: number; // Receitas recebidas pelo médico no período (base do rateio)
  specialty?: string;
  crm?: string;
}

export interface TeamFinancialSettings {
  teamId: string;
  doctors: DoctorTeamMember[];
  teamOnlySources: string[];
  teamOnlyExpenses: string[];
  updatedAt?: string;
}

