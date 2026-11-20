import type {
  Approval,
  ApprovalDecision,
  AuditEvent,
  Bus,
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
import { store, type AppState } from './store'
import { runEntryChecks, reconcile } from '../utils/rules'
import { buses, dailyPrices, holidays } from './store'
import { dateKey } from '../utils/format'
import * as rest from './rest'
import { API_MODE } from './rest'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

let uid = 0
const id = (p: string) => `${p}-${Date.now().toString(36)}-${(uid++).toString(36)}`

function nowIso() {
  return new Date().toISOString()
}

export function currentUser(s: AppState): User | null {
  return s.users.find((u) => u.id === s.currentUserId) ?? null
}

export function actorOf(s: AppState, userId?: string) {
  return (
    s.users.find((x) => x.id === (userId ?? s.currentUserId)) ?? {
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

export async function authenticate(username: string, password: string): Promise<User> {
  const cleanUsername = username.trim().toLowerCase()
  if (API_MODE) {
    const user = await rest.loginWithCredentials(cleanUsername, password)
    return user
  }
  await wait(350)
  const s = store.get()
  const user = s.users.find((u) => u.username.toLowerCase() === cleanUsername)

  if (!user) {
    throw new Error('Invalid username or password. Please verify your credentials.')
  }

  // Check password
  const validPassword = user.password || 'demo'
  if (password !== validPassword && password !== 'demo' && password !== 'demo123') {
    throw new Error('Invalid username or password. Please verify your credentials.')
  }

  if (user.status === 'suspended') {
    throw new Error('This account has been suspended by the administrator. Contact your system admin for assistance.')
  }

  store.set((state) => ({
    ...addAudit(state, {
      entityType: 'user',
      entityId: user.id,
      action: 'viewed',
      after: `Authenticated session initiated for ${user.name} (@${user.username})`,
    }),
    currentUserId: user.id,
  }))

  return user
}

export async function login(userId: string) {
  if (API_MODE) return rest.login(userId)
  await wait(450)
  store.set((s) => ({ ...addAudit(s, {
    entityType: 'entry',
    entityId: 'session',
    action: 'viewed',
    after: `Sign-in as ${s.users.find((u) => u.id === userId)?.name}`,
  }), currentUserId: userId }))
}

export function logout() {
  if (API_MODE) {
    rest.logout()
    return
  }
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
  if (API_MODE && !opts.offline) return rest.saveFuelEntry(entry)
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
  if (API_MODE) return rest.syncPendingEntries()
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
  if (API_MODE) {
    const serverStatus =
      escalateTo === 'principal' ? 'escalated' : status === 'needs_review' ? null : status
    if (serverStatus) void rest.setFlagStatus(flagId, serverStatus, reason).catch(() => undefined)
    return
  }
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
  if (API_MODE) {
    void rest.addFlagNote(flagId, text).catch(() => undefined)
    return
  }
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
  if (API_MODE) {
    rest.markFlagViewed(flagId)
    return
  }
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
  if (API_MODE) {
    void rest.proposeCorrection(entryId, field, proposedValue, reason).catch(() => undefined)
    return
  }
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
  if (API_MODE) {
    void rest.decideApproval(approvalId, decision, reason).catch(() => undefined)
    return
  }
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
  if (API_MODE) {
    void rest.createApprovalForFlag(flagId, note).catch(() => undefined)
    return
  }
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
  if (API_MODE) return rest.loadDemoStatement()
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
  if (API_MODE && decision !== 'none') {
    void rest
      .reviewReconciliation(
        recId,
        decision as 'resolved' | 'needs_supplier_clarification' | 'authorised_exception',
        note,
      )
      .catch(() => undefined)
    return
  }
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

/* ------------------------- admin & user management ------------------------- */

export async function createUser(data: {
  name: string
  role: Role
  username: string
  password?: string
  phone?: string
  busCode?: string
}): Promise<User> {
  await wait(300)
  const newUser: User = {
    id: `U-${Date.now().toString(36).toUpperCase()}`,
    name: data.name.trim(),
    role: data.role,
    username: data.username.trim().toLowerCase(),
    password: data.password?.trim() || 'demo123',
    phone: data.phone?.trim() || '',
    busCode: data.role === 'driver' ? data.busCode : undefined,
    status: 'active',
    createdAt: nowIso(),
    lastLogin: undefined,
  }

  store.set((s) => {
    let updatedBuses = s.buses
    if (newUser.role === 'driver' && newUser.busCode) {
      updatedBuses = s.buses.map((b) =>
        b.busCode === newUser.busCode ? { ...b, driverName: newUser.name } : b
      )
    }

    return addAudit(
      {
        ...s,
        users: [newUser, ...s.users],
        buses: updatedBuses,
      },
      {
        entityType: 'user',
        entityId: newUser.id,
        action: 'created',
        after: `Provisioned ${newUser.role} account for ${newUser.name} (@${newUser.username})`,
      }
    )
  })

  return newUser
}

export async function updateUserCredentials(data: {
  userId: string
  username?: string
  password?: string
  status?: 'active' | 'suspended'
  phone?: string
  busCode?: string
  reason: string
}): Promise<void> {
  await wait(300)
  store.set((s) => {
    const existing = s.users.find((u) => u.id === data.userId)
    if (!existing) return s

    const updatedUser: User = {
      ...existing,
      username: data.username !== undefined ? data.username.trim().toLowerCase() : existing.username,
      password: data.password !== undefined ? data.password.trim() : existing.password,
      status: data.status !== undefined ? data.status : existing.status,
      phone: data.phone !== undefined ? data.phone.trim() : existing.phone,
      busCode: data.busCode !== undefined ? data.busCode : existing.busCode,
    }

    let updatedBuses = s.buses
    if (updatedUser.role === 'driver' && data.busCode !== undefined) {
      updatedBuses = s.buses.map((b) => {
        if (b.busCode === data.busCode) {
          return { ...b, driverName: updatedUser.name }
        }
        if (b.busCode === existing.busCode && b.busCode !== data.busCode) {
          return { ...b, driverName: 'Unassigned' }
        }
        return b
      })
    }

    const changes = [
      data.username && `username: @${existing.username} → @${data.username}`,
      data.password && 'password updated',
      data.status && `status: ${existing.status ?? 'active'} → ${data.status}`,
      data.busCode !== undefined && `allocated bus: ${existing.busCode ?? 'none'} → ${data.busCode || 'none'}`,
    ]
      .filter(Boolean)
      .join(', ')

    return addAudit(
      {
        ...s,
        users: s.users.map((u) => (u.id === data.userId ? updatedUser : u)),
        buses: updatedBuses,
      },
      {
        entityType: 'user',
        entityId: data.userId,
        action: 'updated',
        before: `${existing.name} (@${existing.username})`,
        after: `Admin credential update (${changes}). Reason: ${data.reason}`,
      }
    )
  })
}

export async function toggleUserStatus(userId: string, reason: string): Promise<void> {
  await wait(200)
  store.set((s) => {
    const existing = s.users.find((u) => u.id === userId)
    if (!existing) return s
    const newStatus = existing.status === 'suspended' ? 'active' : 'suspended'
    return addAudit(
      {
        ...s,
        users: s.users.map((u) => (u.id === userId ? { ...u, status: newStatus } : u)),
      },
      {
        entityType: 'user',
        entityId: userId,
        action: 'updated',
        before: `Status: ${existing.status ?? 'active'}`,
        after: `Status changed to ${newStatus}. Reason: ${reason}`,
      }
    )
  })
}

export async function createBus(data: {
  busCode: string
  registration: string
  tankLitres: number
  fuelType: 'diesel' | 'petrol' | 'cng'
  driverName?: string
  gpsDevice?: string
}): Promise<Bus> {
  await wait(300)
  const code = data.busCode.trim().toUpperCase()
  const newBus: Bus = {
    id: code,
    busCode: code,
    registration: data.registration.trim().toUpperCase(),
    tankLitres: data.tankLitres,
    fuelType: data.fuelType,
    driverName: data.driverName?.trim() || 'Unassigned',
    gpsDevice: data.gpsDevice?.trim() || `GPS-${code}`,
  }

  store.set((s) => {
    let updatedUsers = s.users
    if (newBus.driverName && newBus.driverName !== 'Unassigned') {
      updatedUsers = s.users.map((u) =>
        u.role === 'driver' && u.name === newBus.driverName ? { ...u, busCode: newBus.busCode } : u
      )
    }

    return addAudit(
      {
        ...s,
        buses: [...s.buses, newBus],
        users: updatedUsers,
      },
      {
        entityType: 'bus',
        entityId: newBus.busCode,
        action: 'created',
        after: `Added bus ${newBus.busCode} (${newBus.registration}, ${newBus.tankLitres}L, driver: ${newBus.driverName})`,
      }
    )
  })

  return newBus
}

export async function allocateBusDriver(data: {
  busCode: string
  driverId: string | null
  reason?: string
}): Promise<void> {
  await wait(250)
  store.set((s) => {
    const targetBus = s.buses.find((b) => b.busCode === data.busCode)
    if (!targetBus) return s

    const driver = data.driverId ? s.users.find((u) => u.id === data.driverId) : null
    const newDriverName = driver ? driver.name : 'Unassigned'
    const prevDriverName = targetBus.driverName

    const updatedBuses = s.buses.map((b) =>
      b.busCode === data.busCode ? { ...b, driverName: newDriverName } : b
    )

    const updatedUsers = s.users.map((u) => {
      if (driver && u.id === driver.id) {
        return { ...u, busCode: data.busCode }
      }
      if (u.role === 'driver' && u.busCode === data.busCode && (!driver || u.id !== driver.id)) {
        return { ...u, busCode: undefined }
      }
      return u
    })

    return addAudit(
      {
        ...s,
        buses: updatedBuses,
        users: updatedUsers,
      },
      {
        entityType: 'bus',
        entityId: data.busCode,
        action: 'updated',
        before: `Bus ${data.busCode} driver: ${prevDriverName}`,
        after: `Bus ${data.busCode} allocated to driver: ${newDriverName}. Reason: ${data.reason || 'Fleet reallocation'}`,
      }
    )
  })
}

