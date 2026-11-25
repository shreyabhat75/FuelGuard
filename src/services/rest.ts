/**
 * REST client for the FleetFuel Guard backend.
 * Enabled with VITE_API_MODE=rest; the default mock service in api.ts is
 * untouched so the app still works fully offline.
 */
import { store } from './store'
import type { Bus, FuelEntry, PhotoAttachment, Role, User } from '../types'
import type { RuleHit } from '../utils/rules'
import { RAW } from '../data/raw'

export const API_MODE = import.meta.env.VITE_API_MODE === 'rest'

/** Debounce helper so rapid successive actions fire only one /bootstrap call. */
let _bootstrapTimer: ReturnType<typeof setTimeout> | null = null
function scheduleBootstrap(): void {
  if (_bootstrapTimer) clearTimeout(_bootstrapTimer)
  _bootstrapTimer = setTimeout(() => {
    _bootstrapTimer = null
    fetchBootstrap().catch(() => undefined)
  }, 800)
}

function apiUrl(value?: string): string {
  let raw = (value?.trim() || (import.meta.env.PROD ? 'https://fleetfuel-guard-api.onrender.com/api' : 'http://localhost:4000/api')).replace(/\/+$/, '')
  // If Render or cloud hosting passed an internal bare service name without a domain (e.g. "fleetfuel-guard-api"):
  if (!raw.includes('.') && !raw.includes('localhost') && !raw.includes(':')) {
    raw = `${raw}.onrender.com`
  }
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  return /\/api$/i.test(withProtocol) ? withProtocol : `${withProtocol}/api`
}

// Render's fromService.host value has no scheme or /api suffix; full URLs still work locally.
export const API_URL = apiUrl(import.meta.env.VITE_API_URL as string | undefined)

let token: string = localStorage.getItem('ffg_token') ?? ''

const DEMO_USERNAMES: Record<string, string> = {
  'U-ADMIN': 'admin',
  'U-DRV-07': 'driver',
  'U-TM': 'manager',
  'U-ACC': 'accountant',
  'U-PRIN': 'principal',
}

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase()
  const canRetry = method === 'GET' || method === 'HEAD' || path === '/auth/login'
  const attempts = canRetry ? 6 : 1
  let lastError: Error | undefined

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let res: Response
    try {
      res = await fetch(`${API_URL}${path}`, {
        ...init,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers ?? {}) },
      })
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unable to reach the API')
      if (attempt + 1 < attempts) {
        await sleep(1000 * (attempt + 1))
        continue
      }
      throw lastError
    }

    if ([502, 503, 504].includes(res.status) && attempt + 1 < attempts) {
      await sleep(1200 * (attempt + 1))
      continue
    }
    if (res.status === 401 && !path.startsWith('/auth/login')) {
      token = ''
      localStorage.removeItem('ffg_token')
      store.set((s) => ({ ...s, currentUserId: null }))
    }
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      body = null
    }
    if (!res.ok) {
      const fallback = [502, 503, 504].includes(res.status)
        ? 'The API is waking up. Wait a few seconds and try again.'
        : `Request failed (${res.status})`
      throw new Error((body as { error?: string } | null)?.error ?? fallback)
    }
    return body as T
  }

  throw lastError ?? new Error('Unable to reach the API')
}

export function checkApiHealth() {
  return req<{ ok: boolean; db: string; counts: Record<string, number> }>('/health')
}

export function hasSession(): boolean {
  return Boolean(token)
}

/** Evidence URLs need the token inline because they render inside <img> tags. */
function absUrl(u?: string): string | undefined {
  if (!u) return undefined
  if (u.startsWith('/evidence/')) {
    const sep = u.includes('?') ? '&' : '?'
    return `${API_URL}${u}${sep}token=${encodeURIComponent(token)}`
  }
  return u
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEntry(e: any): FuelEntry {
  return {
    ...e,
    odometerPhoto: e.odometerPhoto ? { ...e.odometerPhoto, url: absUrl(e.odometerPhoto.url) } : undefined,
    receiptPhoto: e.receiptPhoto ? { ...e.receiptPhoto, url: absUrl(e.receiptPhoto.url) } : undefined,
  }
}

/** Replaces the data slices of the store with a fresh server snapshot. */
export async function fetchBootstrap(): Promise<void> {
  const b = await req<Record<string, unknown>>('/bootstrap')
  const serverUser = b.user as User
  const serverUsers = (b.users as User[] | undefined) ?? []
  store.set((s) => ({
    ...s,
    currentUserId: serverUser.id ?? s.currentUserId,
    users: serverUsers.length
      ? serverUsers
      : s.users.some((u) => u.id === serverUser.id)
        ? s.users.map((u) => (u.id === serverUser.id ? { ...u, ...serverUser } : u))
        : [serverUser, ...s.users],
    buses: (b.buses as Bus[] | undefined) ?? s.buses,
    entries: ((b.entries as unknown[]) ?? []).map(mapEntry),
    flags: (b.flags as never[]) ?? [],
    notes: (b.flagNotes as never[]) ?? [],
    statementLines: (b.statementLines as never[]) ?? [],
    statementFileName: ((b.statementLines as unknown[]) ?? []).length ? 'pump_statement_shree_lakshmi.csv' : '',
    reconciliations: (b.reconciliation as never[]) ?? [],
    approvals: (b.approvals as never[]) ?? [],
    corrections: (b.corrections as never[]) ?? [],
    audit: (b.audit as never[]) ?? [],
  }))
}

export async function login(
  userId: string,
  credentials?: { username: string; password: string },
): Promise<User> {
  const username = credentials?.username.trim() || DEMO_USERNAMES[userId] || userId
  const password = credentials?.password || 'demo123'
  const r = await req<{ token: string; user: User }>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  token = r.token
  localStorage.setItem('ffg_token', token)
  await fetchBootstrap()
  return r.user
}

export async function loginWithCredentials(username: string, password: string): Promise<User> {
  const r = await req<{ token: string; user: { id: string; username: string; name: string; role: Role; busCode?: string } }>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  token = r.token
  localStorage.setItem('ffg_token', token)
  await fetchBootstrap()
  const user: User = {
    id: r.user.id,
    name: r.user.name,
    role: r.user.role,
    username: r.user.username,
    busCode: r.user.busCode,
  }
  return user
}

/** Keeps the session across page reloads when a token exists. */
export async function restoreSession(): Promise<void> {
  if (!token) return
  try {
    await fetchBootstrap()
  } catch {
    token = ''
    localStorage.removeItem('ffg_token')
  }
}

export function logout(): void {
  token = ''
  localStorage.removeItem('ffg_token')
  store.set((s) => ({
    ...s,
    currentUserId: null,
    entries: [],
    flags: [],
    notes: [],
    statementLines: [],
    statementFileName: '',
    reconciliations: [],
    approvals: [],
    corrections: [],
    audit: [],
  }))
}

export async function createUser(input: {
  name: string
  role: Role
  username: string
  password: string
  phone?: string
  busCode?: string
}): Promise<User> {
  const result = await req<{ user: User }>('/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, busCode: input.busCode || null }),
  })
  await fetchBootstrap()
  return result.user
}

export async function updateUser(input: {
  userId: string
  username?: string
  password?: string
  status?: 'active' | 'suspended'
  phone?: string
  busCode?: string
  reason: string
}): Promise<User> {
  const result = await req<{ user: User }>(`/users/${encodeURIComponent(input.userId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: input.username,
      password: input.password || undefined,
      status: input.status,
      phone: input.phone,
      busCode: input.busCode === undefined ? undefined : input.busCode || null,
      reason: input.reason,
    }),
  })
  await fetchBootstrap()
  return result.user
}

export async function createBus(input: {
  busCode: string
  registration: string
  tankLitres: number
  fuelType: 'diesel' | 'petrol' | 'cng'
  gpsDevice?: string
  driverId?: string
}): Promise<Bus> {
  const result = await req<{ bus: Bus }>('/buses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, driverId: input.driverId || null }),
  })
  await fetchBootstrap()
  return result.bus
}

export async function allocateBusDriver(input: {
  busCode: string
  driverId: string | null
  reason: string
}): Promise<Bus> {
  const result = await req<{ bus: Bus }>(`/buses/${encodeURIComponent(input.busCode)}/driver`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ driverId: input.driverId, reason: input.reason }),
  })
  await fetchBootstrap()
  return result.bus
}

async function photoToBlob(photo?: PhotoAttachment): Promise<File | null> {
  if (!photo?.url) return null
  try {
    const res = await fetch(photo.url)
    if (!res.ok) return null
    const blob = await res.blob()
    const ext = (blob.type.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg')
    return new File([blob], photo.name || `photo.${ext}`, { type: blob.type || 'image/jpeg' })
  } catch {
    return null
  }
}

function buildEntryForm(entry: Omit<FuelEntry, 'id' | 'timestampServer' | 'status'>, clientRef: string): FormData {
  const fd = new FormData()
  const set = (k: string, v: unknown) => {
    if (v !== undefined && v !== null && v !== '') fd.append(k, String(v))
  }
  set('busCode', entry.busId)
  set('timestampClient', entry.timestampClient)
  set('litres', entry.litres)
  set('amount', entry.amount)
  set('fuelType', entry.fuelType)
  set('odometerKm', entry.odometerKm)
  set('paidBy', entry.paidBy)
  set('paymentMode', entry.paymentMode)
  set('pumpName', entry.pumpName)
  set('billNo', entry.billNo)
  if (entry.location) fd.append('location', JSON.stringify(entry.location))
  set('locationNote', entry.locationNote)
  if (entry.receiptOnFile != null) fd.append('receiptOnFile', String(entry.receiptOnFile))
  if (entry.activityNotes?.length) fd.append('activityNotes', JSON.stringify(entry.activityNotes))
  fd.append('clientRef', clientRef)
  return fd
}

export interface SaveResult {
  entry: FuelEntry
  ruleHits: RuleHit[]
}

export async function saveFuelEntry(
  entry: Omit<FuelEntry, 'id' | 'timestampServer' | 'status'>,
): Promise<SaveResult> {
  const fd = buildEntryForm(
    entry,
    `app|${entry.busId}|${entry.timestampClient}|${entry.odometerKm}|${entry.litres}`,
  )
  const odo = await photoToBlob(entry.odometerPhoto)
  if (odo) fd.append('odometerPhoto', odo)
  const rc = await photoToBlob(entry.receiptPhoto)
  if (rc) fd.append('receiptPhoto', rc)

  const r = await req<{ entry: unknown; ruleHits: RuleHit[] }>('/fuel-entries', { method: 'POST', body: fd })
  const mapped = mapEntry(r.entry)
  store.set((s) => ({
    ...s,
    entries: [mapped, ...s.entries.filter((x) => x.id !== mapped.id)],
  }))
  void fetchBootstrap().catch(() => undefined)
  return { entry: mapped, ruleHits: r.ruleHits }
}

/** Replays locally queued drafts; the server dedupes via clientRef. */
export async function syncPendingEntries(): Promise<number> {
  const pending = store.get().entries.filter((e) => e.status === 'pending_sync')
  let synced = 0
  for (const e of pending) {
    try {
      const fd = buildEntryForm(e, e.id)
      const odo = await photoToBlob(e.odometerPhoto)
      if (odo) fd.append('odometerPhoto', odo)
      const rc = await photoToBlob(e.receiptPhoto)
      if (rc) fd.append('receiptPhoto', rc)
      await req('/fuel-entries', { method: 'POST', body: fd })
      synced++
    } catch {
      // keep the draft pending; it will retry on the next sync
    }
  }
  if (synced > 0) await fetchBootstrap()
  return synced
}

export async function setFlagStatus(
  flagId: string,
  status: 'under_review' | 'escalated' | 'resolved' | 'rejected' | 'awaiting_evidence' | 'needs_review',
  reason: string,
): Promise<void> {
  if (status === 'needs_review') return
  await req(`/flags/${flagId}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, reason }),
  })
  scheduleBootstrap()
}

export async function addFlagNote(flagId: string, text: string): Promise<void> {
  await req(`/flags/${flagId}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  scheduleBootstrap()
}

export function markFlagViewed(flagId: string): void {
  void req(`/flags/${flagId}`).catch(() => undefined)
}

export async function proposeCorrection(
  entryId: string,
  field: string,
  proposedValue: number,
  reason: string,
): Promise<void> {
  await req(`/fuel-entries/${entryId}/corrections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ field, proposedValue, reason }),
  })
  scheduleBootstrap()
}

export async function decideApproval(
  approvalId: string,
  decision: 'approved' | 'rejected' | 'info_requested',
  reason: string,
): Promise<void> {
  await req(`/approvals/${approvalId}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision, reason }),
  })
  scheduleBootstrap()
}

export async function createApprovalForFlag(flagId: string, note: string): Promise<void> {
  await req('/approvals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flagId, reviewNotes: note }),
  })
  scheduleBootstrap()
}

/** Sends the bundled demo statement to the real import endpoint. */
export async function loadDemoStatement(): Promise<void> {
  const fd = new FormData()
  fd.append('file', new Blob([RAW.statement], { type: 'text/csv' }), 'pump_statement_shree_lakshmi.csv')
  const r = await req<{ fileName: string }>('/statements/import', { method: 'POST', body: fd })
  await fetchBootstrap()
  store.set((s) => ({ ...s, statementFileName: r.fileName }))
}

export async function reviewReconciliation(
  recId: string,
  decision: 'resolved' | 'needs_supplier_clarification' | 'authorised_exception',
  note: string,
): Promise<void> {
  const rec = store.get().reconciliations.find((r) => r.id === recId)
  const billNo = rec?.statementLineId ?? recId.replace(/^REC-/, '')
  await req('/reconciliation/decision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ billNo, decision, note }),
  })
  scheduleBootstrap()
}
