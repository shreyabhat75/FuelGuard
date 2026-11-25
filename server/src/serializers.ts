import { sqlAll, sqlGet } from './db'
import { isoIST } from './time'
import type { StatementLine } from './reconcile'

type Row = Record<string, unknown>
const s = (v: unknown): string | null => (v == null ? null : String(v))
const n = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0))
const j = <T,>(v: unknown, fallback: T): T => {
  try {
    return v == null ? fallback : (JSON.parse(String(v)) as T)
  } catch {
    return fallback
  }
}

export interface ApiPhoto {
  id: string
  kind: 'odometer' | 'receipt'
  name: string
  url: string
  demo: boolean
  status: 'done'
}

export function serializeUser(u: Row) {
  const out: Record<string, unknown> = {
    id: s(u.id),
    name: s(u.name),
    role: s(u.role),
    username: s(u.username),
  }
  const busCode = s(u.bus_code)
  if (busCode) out.busCode = busCode
  if (u.active != null) out.status = n(u.active) ? 'active' : 'suspended'
  const phone = s(u.phone)
  if (phone) out.phone = phone
  const createdAt = s(u.created_at)
  if (createdAt) out.createdAt = createdAt
  const lastLogin = s(u.last_login)
  if (lastLogin) out.lastLogin = lastLogin
  if (u.password_hash != null) out.passwordSet = Boolean(s(u.password_hash))
  return out
}

export function serializeBus(b: Row) {
  return {
    id: s(b.bus_code),
    busCode: s(b.bus_code),
    registration: s(b.reg_no),
    tankLitres: n(b.tank_litres),
    fuelType: s(b.fuel_type),
    driverName: s(b.driver_name),
    gpsDevice: s(b.gps_device),
  }
}

export function serializeEvidence(e: Row): ApiPhoto {
  return {
    id: s(e.id) as string,
    kind: s(e.kind) as 'odometer' | 'receipt',
    name: s(e.file_name) as string,
    url: `/evidence/${s(e.id)}/file`,
    demo: Boolean(n(e.demo)),
    status: 'done',
  }
}

export async function serializeEntry(e: Row) {
  const evidence = (await sqlAll<Row>(
    `SELECT id, entry_id, kind, file_name, mime, size, demo, created_by, created_at
     FROM evidence WHERE entry_id = ? ORDER BY created_at`,
    [s(e.id)],
  )) as Row[]
  const odometer = evidence.find((x) => s(x.kind) === 'odometer')
  const receipt = evidence.find((x) => s(x.kind) === 'receipt')
  const location =
    e.location_lat != null && e.location_lng != null
      ? { lat: n(e.location_lat), lng: n(e.location_lng), accuracyM: e.location_accuracy != null ? n(e.location_accuracy) : undefined }
      : null
  const activityNotes = j<string[]>(e.activity_notes, [])
  return {
    id: s(e.id),
    busId: s(e.bus_code),
    timestampClient: isoIST(s(e.ts_client) as string),
    timestampServer: isoIST(s(e.ts_server) as string),
    litres: n(e.litres),
    amount: n(e.amount),
    fuelType: s(e.fuel_type),
    odometerKm: n(e.odometer_km),
    paidBy: s(e.paid_by) ?? 'driver',
    paymentMode: s(e.payment_mode),
    pumpName: s(e.pump_name),
    billNo: s(e.bill_no) ?? undefined,
    odometerPhoto: odometer ? serializeEvidence(odometer) : undefined,
    receiptPhoto: receipt ? serializeEvidence(receipt) : undefined,
    receiptOnFile: e.receipt_on_file == null ? undefined : Boolean(n(e.receipt_on_file)),
    location,
    locationNote: s(e.location_note) ?? undefined,
    createdBy: s(e.created_by),
    createdByName: s(e.created_name) ?? s(e.created_by) ?? '',
    status: s(e.status),
    ...(activityNotes.length ? { activityNotes } : {}),
    source: s(e.source),
  }
}

export async function serializeEntries(rows: Row[]) {
  return Promise.all(rows.map(serializeEntry))
}

export async function serializeFlag(f: Row) {
  const entryIds = j<string[]>(f.entry_ids, [])
  const billNos = j<string[]>(f.bill_nos, [])
  const targetType = entryIds.length > 0 ? (billNos.length > 0 ? 'register_pair' : 'entry') : 'statement'
  const resolvedBy = f.resolved_by
    ? await sqlGet<Row>('SELECT name FROM users WHERE id = ?', [s(f.resolved_by) as string])
    : undefined
  return {
    id: s(f.id),
    caseTitle: s(f.title),
    ruleCode: s(f.rule_code),
    targetType,
    targetIds: entryIds.length > 0 ? entryIds : billNos,
    busCode: s(f.bus_code) ?? undefined,
    severity: s(f.severity),
    reason: s(f.reason),
    plainExplanation: s(f.plain_explanation),
    evidenceSummary: s(f.evidence_summary),
    amountAtIssue: n(f.amount_at_issue),
    status: s(f.status),
    confidence: s(f.confidence),
    createdAt: s(f.created_at),
    relatedBillNos: billNos.length ? billNos : undefined,
    resolutionNote: s(f.resolution_note) ?? undefined,
    resolvedByName: resolvedBy ? s(resolvedBy.name) ?? undefined : undefined,
    resolvedAt: s(f.resolved_at) ?? undefined,
    figures: j(f.figures, []),
  }
}

export function serializeFlagNote(x: Row) {
  return {
    id: s(x.id),
    flagId: s(x.flag_id),
    authorId: s(x.author_id) ?? 'system',
    authorName: s(x.author_name),
    text: s(x.text),
    timestamp: s(x.created_at),
  }
}

export async function serializeApproval(a: Row) {
  const decidedBy = a.decided_by
    ? await sqlGet<Row>('SELECT name FROM users WHERE id = ?', [s(a.decided_by) as string])
    : undefined
  return {
    id: s(a.id),
    targetType: s(a.target_type),
    targetId: s(a.target_id),
    title: s(a.title),
    busCode: s(a.bus_code) ?? undefined,
    amount: n(a.amount),
    submitterId: s(a.submitter_id),
    submitterName: s(a.submitter_name),
    submitterRole: s(a.submitter_role),
    evidenceSummary: s(a.evidence_summary),
    reviewNotes: s(a.review_notes),
    decision: s(a.decision) ?? 'pending',
    reason: s(a.reason) ?? undefined,
    decidedByName: decidedBy ? s(decidedBy.name) ?? undefined : undefined,
    decidedAt: s(a.decided_at) ?? undefined,
    createdAt: s(a.created_at),
  }
}

export async function serializeCorrection(c: Row) {
  const proposer = await sqlGet<Row>('SELECT name FROM users WHERE id = ?', [s(c.proposed_by) as string])
  return {
    id: s(c.id),
    entryId: s(c.entry_id),
    field: s(c.field),
    originalValue: Number(s(c.original_value)),
    proposedValue: Number(s(c.proposed_value)),
    reason: s(c.reason),
    proposedById: s(c.proposed_by),
    proposedByName: proposer ? s(proposer.name) ?? '' : '',
    status: s(c.status),
    createdAt: s(c.created_at),
  }
}

export function serializeAudit(a: Row) {
  return {
    id: String(n(a.id)),
    entityType: s(a.entity_type),
    entityId: s(a.entity_id),
    action: s(a.action),
    before: s(a.before) ?? undefined,
    after: s(a.after) ?? undefined,
    reason: s(a.reason) ?? undefined,
    actorId: s(a.actor_id) ?? 'system',
    actorName: s(a.actor_name),
    timestamp: s(a.created_at),
  }
}

export function serializeStatementLine(l: Row) {
  return {
    id: s(l.bill_no),
    billNo: s(l.bill_no),
    date: isoIST(s(l.date) as string),
    vehicleNo: s(l.vehicle_no),
    litres: n(l.litres),
    rate: n(l.rate),
    amount: n(l.amount),
  }
}

export interface ReconLike {
  billNo: string
  entryIds: string[]
  matchStatus: string
  difference: number
  entrySide?: { litres: number; amount: number; rate?: number }
  reviewerDecision: string
  reviewerNote: string | null
  reviewedByName: string | null
  reviewedAt: string | null
}

export function serializeReconciliation(r: ReconLike) {
  return {
    id: `REC-${r.billNo.replace(/\W/g, '')}`,
    statementLineId: r.billNo,
    entryIds: r.entryIds,
    matchStatus: r.matchStatus,
    difference: r.difference,
    entrySide: r.entrySide
      ? { litres: r.entrySide.litres, amount: r.entrySide.amount, rate: r.entrySide.rate }
      : undefined,
    reviewerDecision: r.reviewerDecision || 'none',
    reviewerNote: r.reviewerNote ?? undefined,
    reviewedByName: r.reviewedByName ?? undefined,
    reviewedAt: r.reviewedAt ?? undefined,
  }
}

export async function loadStatementLines(): Promise<StatementLine[]> {
  const rows = (await sqlAll<Row>('SELECT * FROM pump_statement_lines ORDER BY date, bill_no')) as Row[]
  return rows.map(
    (l): StatementLine => ({
      billNo: s(l.bill_no) as string,
      date: s(l.date) as string,
      vehicleNo: s(l.vehicle_no) as string,
      litres: n(l.litres),
      rate: n(l.rate),
      amount: n(l.amount),
    }),
  )
}
