export type Role = 'driver' | 'transport_manager' | 'accountant' | 'principal'

export interface User {
  id: string
  name: string
  role: Role
  /** driver only: bus code they are assigned to */
  busCode?: string
  username: string
}

export interface Bus {
  id: string
  busCode: string
  registration: string
  tankLitres: number
  fuelType: 'diesel' | 'petrol' | 'cng'
  driverName: string
  gpsDevice: string
}

export type EntryStatus = 'saved' | 'needs_review' | 'pending_sync'

export type PaymentMode = 'credit_account' | 'cash'
export type PaidBy = 'driver' | 'transport_manager' | 'other' | 'college_account'

export interface GeoPoint {
  lat: number
  lng: number
  accuracyM?: number
}

export interface PhotoAttachment {
  id: string
  kind: 'odometer' | 'receipt'
  name: string
  /** object URL or demo placeholder data URI */
  url: string
  demo: boolean
  status: 'done' | 'error'
}

export interface FuelEntry {
  id: string
  busId: string
  timestampClient: string
  /** assigned by backend on receipt; in demo mode = "Demo server time" */
  timestampServer: string
  litres: number
  amount: number
  fuelType: 'diesel' | 'petrol' | 'cng'
  odometerKm: number
  paidBy: PaidBy
  paymentMode: PaymentMode
  pumpName: string
  billNo?: string
  odometerPhoto?: PhotoAttachment
  receiptPhoto?: PhotoAttachment
  /** paper register only: receipt exists in the office file */
  receiptOnFile?: boolean
  location: GeoPoint | null
  /** why location is null, when it is */
  locationNote?: 'denied' | 'unavailable' | 'skipped'
  createdBy: string
  createdByName: string
  status: EntryStatus
  /** local activity notes captured during entry (e.g. bus changed after QR) */
  activityNotes?: string[]
  /** index into the seeded dataset when this row mirrors the paper register */
  registerRef?: string
}

export type FlagStatus = 'needs_review' | 'under_review' | 'awaiting_evidence' | 'escalated' | 'resolved'
export type Severity = 'high' | 'medium' | 'low'

export interface Flag {
  id: string
  caseTitle: string
  ruleCode: string
  /** what the rule flagged: an entry, statement line(s), or a register pair */
  targetType: 'entry' | 'statement' | 'register_pair'
  targetIds: string[]
  busCode?: string
  severity: Severity
  reason: string
  plainExplanation: string
  evidenceSummary: string
  amountAtIssue: number
  status: FlagStatus
  confidence: string
  createdAt: string
  relatedBillNos?: string[]
  resolutionNote?: string
  resolvedByName?: string
  resolvedAt?: string
  /** structured figures for evidence cards (GPS paths, pings, excess litres…) */
  figures?: { label: string; value: string; highlight?: boolean }[]
}

export interface FlagNote {
  id: string
  flagId: string
  authorId: string
  authorName: string
  text: string
  timestamp: string
}

export interface PumpStatementLine {
  id: string
  billNo: string
  date: string
  vehicleNo: string
  litres: number
  rate: number
  amount: number
}

export type ReconciliationStatus =
  | 'matched'
  | 'amount_mismatch'
  | 'rate_mismatch'
  | 'unmatched_pump_bill'
  | 'register_missing'
  | 'possible_duplicate'

export type ReviewerDecision =
  | 'none'
  | 'resolved'
  | 'needs_supplier_clarification'
  | 'authorised_exception'

export interface ReconciliationResult {
  id: string
  statementLineId: string
  entryIds: string[]
  matchStatus: ReconciliationStatus
  /** absolute ₹ difference between statement and register amounts */
  difference: number
  entrySide?: { litres: number; amount: number; rate?: number }
  reviewerDecision: ReviewerDecision
  reviewerNote?: string
  reviewedByName?: string
  reviewedAt?: string
}

export type ApprovalDecision = 'pending' | 'approved' | 'rejected' | 'info_requested'

export interface Approval {
  id: string
  /** what is being approved: a flag case or a correction proposal */
  targetType: 'flag' | 'correction'
  targetId: string
  title: string
  busCode?: string
  amount: number
  submitterId: string
  submitterName: string
  submitterRole: Role
  evidenceSummary: string
  reviewNotes: string
  decision: ApprovalDecision
  reason?: string
  decidedByName?: string
  decidedAt?: string
  createdAt: string
}

export type AuditAction =
  | 'created'
  | 'viewed'
  | 'status_changed'
  | 'note_added'
  | 'correction_proposed'
  | 'escalated'
  | 'approved'
  | 'rejected'
  | 'info_requested'
  | 'synced'
  | 'bus_lookup'
  | 'bus_changed'
  | 'reconciliation_reviewed'
  | 'statement_loaded'

export interface AuditEvent {
  id: string
  entityType: 'entry' | 'flag' | 'approval' | 'bus' | 'reconciliation' | 'statement'
  entityId: string
  action: AuditAction
  before?: string
  after?: string
  reason?: string
  actorId: string
  actorName: string
  timestamp: string
}

export interface CorrectionProposal {
  id: string
  entryId: string
  field: 'litres' | 'amount' | 'odometerKm'
  originalValue: number
  proposedValue: number
  reason: string
  proposedById: string
  proposedByName: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
}

export interface DailyPrice {
  date: string
  price: number
}

export interface Holiday {
  date: string
  name: string
}
