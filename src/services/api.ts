import type {
  Approval,
  ApprovalDecision,
  AuditEvent,
  CorrectionProposal,
  Flag,
  FlagNote,
  FlagStatus,
  FuelEntry,
  PhotoAttachment,
  ReconciliationResult,
  ReviewerDecision,
  Role,
  User,
} from '../types'
import { store, type AppState, users } from './store'
import { runEntryChecks, reconcile } from '../utils/rules'
import { buses, dailyPrices, holidays } from './store'
import { dateKey } from '../utils/format'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

let uid = 0
const id = (p: string) => `${p}-${Date.now().toString(36)}-${(uid++).toString(36)}`

function nowIso() {
  return new Date().toISOString()
}

export function currentUser(s: AppState): User | null {
  return users.find((u) => u.id === s.currentUserId) ?? null
}

export function actorOf(s: AppState, userId?: string) {
  return (
    users.find((x) => x.id === (userId ?? s.currentUserId)) ?? {
      id: 'system',
      name: 'System (auto rule)',
      role: 'transport_manager' as const,
      username: 'system',
    }
  )
}

function addAudit(
  s: AppState,
  ev: Omit<AuditEvent, 'id' | 'actorId' | 'actorName' | 'timestamp'>,
): AppState {
  const actor = actorOf(s)
  return {
    ...s,
    audit: [
      { id: id('AUD'), actorId: actor.id, actorName: actor.name, timestamp: nowIso(), ...ev },
      ...s.audit,
    ],
  }
}

/* ------------------------------- auth ------------------------------- */

export async function login(userId: string) {
  await wait(450)
  store.set((s) => ({ ...addAudit(s, {
    entityType: 'entry',
    entityId: 'session',
    action: 'viewed',
    after: `Demo sign-in as ${users.find((u) => u.id === userId)?.name}`,
  }), currentUserId: userId }))
}

export function logout() {
  store.set((s) => ({ ...s, currentUserId: null }))
}

export function setLang(lang: AppState['lang']) {
  store.set((s) => ({ ...s, lang }))
}

export function setOnline(online: boolean) {
  store.set((s) => ({ ...s, online }))
}

/* ---------------------------- fuel entries ---------------------------- */

export interface SaveResult {
  entry: FuelEntry
  ruleHits: ReturnType<typeof runEntryChecks>
}

/** Creates flags for rule hits that matter, keeping plain-language copy. */
function flagsFromHits(entry: FuelEntry, hits: ReturnType<typeof runEntryChecks>): Flag[] {
  return hits.map((h) => ({
    id: id('FLG'),
    caseTitle: `${entry.busId} — ${h.code.replace(/_/g, ' ').toLowerCase()} on ${dateKey(entry.timestampClient)}`,
    ruleCode: h.code,
    targetType: 'entry' as const,
    targetIds: [entry.id],
    busCode: entry.busId,
    severity: h.severity,
    reason: h.reason,
    plainExplanation: h.explanation,
    evidenceSummary: h.evidence,
    amountAtIssue: h.amountAtIssue,
    status: 'needs_review' as const,
    confidence: 'Auto-check — needs human review.',
    createdAt: nowIso(),
  }))
}

export async function saveFuelEntry(
  entry: Omit<FuelEntry, 'id' | 'timestampServer' | 'status'>,
  opts: { offline: boolean },
): Promise<SaveResult> {
  await wait(700)
  const hits = runEntryChecks({ ...entry, id: 'NEW', status: 'saved' } as FuelEntry, {
    buses,
    prices: dailyPrices,
    holidays,
    entries: store.get().entries,
  })

  const newEntry: FuelEntry = {
    ...entry,
    id: `NEW-${id('').slice(-6).toUpperCase()}`,
    // In production the backend assigns this on receipt; demo shows "Demo server time".
    timestampServer: new Date(new Date(entry.timestampClient).getTime() + 1500).toISOString(),
    status: opts.offline ? 'pending_sync' : hits.length ? 'needs_review' : 'saved',
  }

  store.set((s) => {
    let next: AppState = {
      ...s,
      entries: [newEntry, ...s.entries],
      flags: opts.offline ? s.flags : [...flagsFromHits(newEntry, hits), ...s.flags],
    }
    next = addAudit(next, {
      entityType: 'entry',
      entityId: newEntry.id,
      action: 'created',
      after: `${newEntry.litres.toFixed(1)} L, ₹${newEntry.amount.toFixed(2)} at ${newEntry.pumpName}`,
      reason: opts.offline ? 'Saved offline — pending sync' : undefined,
    })
    return next
  })

  return { entry: newEntry, ruleHits: hits }
}

export async function syncPendingEntries(): Promise<number> {
  await wait(1200)
  const s = store.get()
  const pending = s.entries.filter((e) => e.status === 'pending_sync')
  if (pending.length === 0) return 0
  store.set((cur) => {
    const hitsByEntry = new Map<string, ReturnType<typeof runEntryChecks>>()
    const updated = cur.entries.map((e) => {
      if (e.status !== 'pending_sync') return e
      const hits = runEntryChecks(e, { buses, prices: dailyPrices, holidays, entries: cur.entries })
      hitsByEntry.set(e.id, hits)
      return { ...e, status: hits.length ? ('needs_review' as const) : ('saved' as const) }
    })
    const newFlags = pending.flatMap((e) => flagsFromHits(e, hitsByEntry.get(e.id) ?? []))
    let next: AppState = { ...cur, entries: updated, flags: [...newFlags, ...cur.flags] }
    for (const e of pending) {
      next = addAudit(next, {
        entityType: 'entry',
        entityId: e.id,
        action: 'synced',
        after: 'Offline draft synced to server',
      })
    }
    return next
  })
  return pending.length
}

/* ------------------------------- flags ------------------------------- */

export function setFlagStatus(
  flagId: string,
  status: FlagStatus,
  reason: string,
  escalateTo?: Role,
) {
  store.set((s) => {
    const flag = s.flags.find((f) => f.id === flagId)
    if (!flag) return s
    let next = {
      ...s,
      flags: s.flags.map((f) =>
        f.id === flagId
          ? {
              ...f,
              status,
              resolutionNote: reason,
              resolvedByName: actorOf(s).name,
              resolvedAt: nowIso(),
            }
          : f,
      ),
    }
    next = addAudit(next, {
      entityType: 'flag',
      entityId: flagId,
      action: escalateTo ? 'escalated' : 'status_changed',
      before: flag.status,
      after: status,
      reason,
    })
    if (escalateTo === 'principal') {
      const approval: Approval = {
        id: id('APR'),
        targetType: 'flag',
        targetId: flagId,
        title: flag.caseTitle,
        busCode: flag.busCode,
        amount: flag.amountAtIssue,
        submitterId: actorOf(s).id,
        submitterName: actorOf(s).name,
        submitterRole: actorOf(s).role ?? 'transport_manager',
        evidenceSummary: flag.evidenceSummary,
        reviewNotes: reason,
        decision: 'pending',
        createdAt: nowIso(),
      }
      next = { ...next, approvals: [approval, ...next.approvals] }
    }
    return next
  })
}

export function addFlagNote(flagId: string, text: string) {
  store.set((s) => {
    const actor = actorOf(s)
    const note: FlagNote = {
      id: id('N'),
      flagId,
      authorId: actor.id,
      authorName: actor.name,
      text,
      timestamp: nowIso(),
    }
    const next = { ...s, notes: [...s.notes, note] }
    return addAudit(next, {
      entityType: 'flag',
      entityId: flagId,
      action: 'note_added',
      after: text.slice(0, 80),
    })
  })
}

export function markFlagViewed(flagId: string) {
  store.set((s) => addAudit(s, { entityType: 'flag', entityId: flagId, action: 'viewed' }))
}

/* ---------------------------- corrections ---------------------------- */

export function proposeCorrection(
  entryId: string,
  field: CorrectionProposal['field'],
  originalValue: number,
  proposedValue: number,
  reason: string,
) {
  store.set((s) => {
    const actor = actorOf(s)
    const c: CorrectionProposal = {
      id: id('COR'),
      entryId,
      field,
      originalValue,
      proposedValue,
      reason,
      proposedById: actor.id,
      proposedByName: actor.name,
      status: 'pending',
      createdAt: nowIso(),
    }
    const next = { ...s, corrections: [...s.corrections, c] }
    return addAudit(next, {
      entityType: 'entry',
      entityId: entryId,
      action: 'correction_proposed',
      before: `${field}: ${originalValue}`,
      after: `${field}: ${proposedValue}`,
      reason,
    })
  })
}

/* ----------------------------- approvals ----------------------------- */

export function decideApproval(
  approvalId: string,
  decision: Exclude<ApprovalDecision, 'pending'>,
  reason: string,
) {
  store.set((s) => {
    const ap = s.approvals.find((a) => a.id === approvalId)
    if (!ap) return s
    const actor = actorOf(s)
    let next = {
      ...s,
      approvals: s.approvals.map((a) =>
        a.id === approvalId
          ? { ...a, decision, reason, decidedByName: actor.name, decidedAt: nowIso() }
          : a,
      ),
    }
    const action = decision === 'approved' ? 'approved' : decision === 'rejected' ? 'rejected' : 'info_requested'
    next = addAudit(next, {
      entityType: 'approval',
      entityId: approvalId,
      action,
      reason,
      after: decision,
    })
    if (ap.targetType === 'flag' && decision === 'approved') {
      next = {
        ...next,
        flags: next.flags.map((f) =>
          f.id === ap.targetId
            ? { ...f, status: 'resolved' as const, resolutionNote: reason, resolvedByName: actor.name, resolvedAt: nowIso() }
            : f,
        ),
      }
    }
    return next
  })
}

export function createApprovalForFlag(flagId: string, note: string, submitter: User) {
  store.set((s) => {
    const flag = s.flags.find((f) => f.id === flagId)
    if (!flag) return s
    const ap: Approval = {
      id: id('APR'),
      targetType: 'flag',
      targetId: flagId,
      title: flag.caseTitle,
      busCode: flag.busCode,
      amount: flag.amountAtIssue,
      submitterId: submitter.id,
      submitterName: submitter.name,
      submitterRole: submitter.role,
      evidenceSummary: flag.evidenceSummary,
      reviewNotes: note,
      decision: 'pending',
      createdAt: nowIso(),
    }
    let next = { ...s, approvals: [ap, ...s.approvals] }
    next = {
      ...next,
      flags: next.flags.map((f) => (f.id === flagId ? { ...f, status: 'escalated' as const } : f)),
    }
    return addAudit(next, { entityType: 'flag', entityId: flagId, action: 'escalated', after: 'Sent to principal approval queue', reason: note })
  })
}

/* --------------------------- reconciliation --------------------------- */

export async function loadDemoStatement() {
  await wait(900)
  store.set((s) => {
    const recs: ReconciliationResult[] = reconcile(s.entries, s.statementLines, buses, dailyPrices)
    const fileName = 'pump_statement_shree_lakshmi.csv'
    let next: AppState = { ...s, reconciliations: recs, statementFileName: fileName }
    next = addAudit(next, {
      entityType: 'statement',
      entityId: fileName,
      action: 'statement_loaded',
      after: `${s.statementLines.length} lines parsed`,
    })
    return next
  })
}

export function reviewReconciliation(
  recId: string,
  decision: ReviewerDecision,
  note: string,
) {
  store.set((s) => {
    const rec = s.reconciliations.find((r) => r.id === recId)
    if (!rec) return s
    let next = {
      ...s,
      reconciliations: s.reconciliations.map((r) =>
        r.id === recId
          ? {
              ...r,
              reviewerDecision: decision,
              reviewerNote: note,
              reviewedByName: actorOf(s).name,
              reviewedAt: nowIso(),
            }
          : r,
      ),
    }
    next = addAudit(next, {
      entityType: 'reconciliation',
      entityId: recId,
      action: 'reconciliation_reviewed',
      before: rec.matchStatus,
      after: decision,
      reason: note,
    })
    return next
  })
}

/* ------------------------------- misc ------------------------------- */

export function recordBusLookup(busCode: string, via: 'qr' | 'manual') {
  store.set((s) =>
    addAudit(s, {
      entityType: 'bus',
      entityId: busCode,
      action: 'bus_lookup',
      after: via === 'qr' ? 'QR scan' : 'Manual search',
    }),
  )
}

export function recordBusChange(fromBus: string, toBus: string) {
  store.set((s) =>
    addAudit(s, {
      entityType: 'bus',
      entityId: toBus,
      action: 'bus_changed',
      before: fromBus,
      after: toBus,
      reason: 'Bus changed after initial scan — recorded before submission',
    }),
  )
}

export function attachmentsFromDraft(
  odometer: PhotoAttachment | undefined,
  receipt: PhotoAttachment | undefined,
) {
  return { odometerPhoto: odometer, receiptPhoto: receipt }
}
