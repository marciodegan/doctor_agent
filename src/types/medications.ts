export interface Medication {
  id: string;
  groupId: string;
  genericName: string;
  commercialName: string;
  category: string;
  activeIngredient: string;
  concentration: number;
  concentrationUnit: string; // e.g., "mg", "mcg", "g"
  dosageForm: string; // e.g., "Injetável", "Comprimido"
  presentation: string; // e.g., "Ampola 2ml", "Frasco 10ml"
  volumePerUnit: number; // e.g., 2, 10
  stockUnit: string; // e.g., "Ampola", "Frasco"
  routeOfAdministration: string; // e.g., "EV", "IM", "VO"
  manufacturer: string;
  highVigilance: boolean;
  controlled: boolean;
  requiresDoubleCheck: boolean;
  allowsFractioning: boolean;
  roundingRule: 'ceil' | 'floor' | 'nearest' | 'exact';
  minStock: number;
  reorderPoint: number;
  idealStock: number;
  storageCondition: string;
  observations: string;
  status: 'active' | 'inactive';
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface ProtocolMedication {
  medicationId: string;
  genericName: string;
  formulaType: 'dose_per_weight' | 'fixed' | 'dose_per_weight_time' | 'dose_per_bsa';
  formulaValue: number; // e.g., 2 mg/kg, 50 mg
  minDose?: number;
  maxDose?: number;
  roundingRule: 'ceil' | 'floor' | 'nearest' | 'exact';
  resultUnit: string;
  frequency: string;
  duration: string;
  internalGuidelines: string;
  mandatoryWarnings: string;
}

export interface Protocol {
  id: string;
  groupId: string;
  name: string;
  description: string;
  procedureType: string;
  specialty: string;
  minAge?: number;
  maxAge?: number;
  minWeight?: number;
  maxWeight?: number;
  applicationConditions: string;
  exclusionCriteria: string;
  version: number;
  effectiveDate: string;
  status: 'draft' | 'under_review' | 'approved' | 'published' | 'inactive';
  createdBy: string;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
  publishedBy?: string;
  publishedAt?: string;
  medications: ProtocolMedication[];
}

export interface InventoryLocation {
  id: string;
  groupId: string;
  name: string;
  type: 'central' | 'hospital' | 'surgery_center' | 'room' | 'bag' | 'other';
  description: string;
  status: 'active' | 'inactive';
}

export interface InventoryBatch {
  id: string;
  groupId: string;
  medicationId: string;
  genericName: string;
  batchNumber: string;
  expiryDate: string; // YYYY-MM-DD
  initialQuantity: number;
  quantityAvailable: number;
  quantityReserved: number;
  quantityUnavailable: number;
  locationId: string;
  locationName: string;
  supplier: string;
  entryDate: string;
  createdBy: string;
}

export type StockMovementType =
  | 'entry'
  | 'reservation'
  | 'separation'
  | 'administration'
  | 'return'
  | 'waste'
  | 'loss'
  | 'expiry'
  | 'inventory_adjustment'
  | 'transfer';

export interface StockMovement {
  id: string;
  groupId: string;
  batchId: string;
  medicationId: string;
  genericName: string;
  type: StockMovementType;
  quantity: number;
  locationId: string;
  surgeryId?: string;
  patientId?: string;
  patientName?: string;
  userId: string;
  userName: string;
  description: string;
  timestamp: string;
}

export interface MedicationPlanItem {
  medicationId: string;
  genericName: string;
  formulaType: string;
  formulaValue: number;
  calculatedDose: number;
  calculatedVolume: number;
  doseUnit: string;
  adjustedDose: number;
  adjustedVolume: number;
  isAdjusted: boolean;
  justification?: string;
  warnings: string[];
  highVigilance: boolean;
  requiresDoubleCheck: boolean;
  doubleChecked: boolean;
  doubleCheckedBy?: string;
  status: 'pending' | 'separated' | 'administered' | 'returned' | 'wasted' | 'lost';
  quantitySeparated: number;
  quantityAdministered: number;
  quantityReturned: number;
  quantityWasted: number;
  quantityLost: number;
  batchId?: string;
  batchNumber?: string;
}

export interface MedicationPlan {
  id: string; // Matches surgeryId / eventId
  groupId: string;
  surgeryId: string;
  patientId?: string;
  patientName: string;
  protocolId: string;
  protocolName: string;
  protocolVersion: number;
  status: 'pending' | 'calculated' | 'confirmed' | 'separated' | 'finished' | 'cancelled';
  patientWeight: number;
  patientAge: number;
  patientAllergies: string[];
  patientRestrictions: string;
  calculatedBy: string;
  calculatedAt: string;
  confirmedBy?: string;
  confirmedAt?: string;
  items: MedicationPlanItem[];
  createdAt: string;
  updatedAt: string;
}

export interface StockReservation {
  id: string;
  groupId: string;
  surgeryId: string;
  medicationId: string;
  batchId: string;
  quantity: number;
  status: 'active' | 'used' | 'cancelled';
}

export interface DoubleCheck {
  id: string;
  groupId: string;
  surgeryId: string;
  planId: string;
  medicationId: string;
  witnessUserId: string;
  witnessName: string;
  witnessEmail: string;
  timestamp: string;
  status: 'approved' | 'rejected';
  notes?: string;
}

export interface AuditLog {
  id: string;
  groupId: string;
  userId: string;
  userName: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  timestamp: string;
}

export type CalculatedPlanItem = MedicationPlanItem;
