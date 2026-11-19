import { useSyncExternalStore } from 'react'
import type {
  Approval,
  AuditEvent,
  Bus,
  CorrectionProposal,
  Flag,
  FlagNote,
  FuelEntry,
  PumpStatementLine,
  ReconciliationResult,
  User,
} from '../types'
import { buses as rawBuses, dailyPrices, holidays, places, registerEntries, statementLines } from '../data/raw'
import { seededApprovals, seededAudit, seededFlags, seededNotes } from '../data/seed'

export type Lang = 'en' | 'kn'

export const initialUsers: User[] = [
  {
    id: 'U-ADMIN',
    name: 'Anand Kumar',
    role: 'admin',
    username: 'admin',
    password: 'demo',
    status: 'active',
    phone: '+91 98450 99999',
    createdAt: '2026-08-01T09:00:00+05:30',
    lastLogin: '2026-10-31T17:45:00+05:30',
  },
  {
    id: 'U-DRV-07',
    name: 'Hanumanthappa G',
    role: 'driver',
    busCode: 'VB-07',
    username: 'driver',
    password: 'demo',
    status: 'active',
    phone: '+91 98450 12345',
    createdAt: '2026-08-01T09:00:00+05:30',
    lastLogin: '2026-10-31T08:15:00+05:30',
  },
  {
    id: 'U-TM',
    name: 'Ravi S',
    role: 'transport_manager',
    username: 'manager',
    password: 'demo',
    status: 'active',
    phone: '+91 98450 23456',
    createdAt: '2026-08-01T09:00:00+05:30',
    lastLogin: '2026-10-31T16:30:00+05:30',
  },
  {
    id: 'U-ACC',
    name: 'Lakshmi Devi',
    role: 'accountant',
    username: 'accountant',
    password: 'demo',
    status: 'active',
    phone: '+91 98450 34567',
    createdAt: '2026-08-01T09:00:00+05:30',
    lastLogin: '2026-10-30T18:00:00+05:30',
  },
  {
    id: 'U-PRIN',
    name: 'Dr. Suresh Rao',
    role: 'principal',
    username: 'principal',
    password: 'demo',
    status: 'active',
    phone: '+91 98450 45678',
    createdAt: '2026-08-01T09:00:00+05:30',
    lastLogin: '2026-10-29T14:20:00+05:30',
  },
]

export interface AppState {
  currentUserId: string | null
  lang: Lang
  /** demo offline toggle for the driver app */
  online: boolean
  users: User[]
  buses: Bus[]
  entries: FuelEntry[]
  flags: Flag[]
  notes: FlagNote[]
  statementLines: PumpStatementLine[]
  statementFileName: string
  reconciliations: ReconciliationResult[]
  approvals: Approval[]
  corrections: CorrectionProposal[]
  audit: AuditEvent[]
}

export const initialAppState: AppState = {
  currentUserId: null,
  lang: 'en',
  online: true,
  users: initialUsers,
  buses: rawBuses,
  entries: registerEntries,
  flags: seededFlags,
  notes: seededNotes,
  statementLines,
  statementFileName: 'pump_statement_shree_lakshmi.csv',
  reconciliations: [],
  approvals: seededApprovals,
  corrections: [],
  audit: seededAudit,
}

let state: AppState = initialAppState
const listeners = new Set<() => void>()

export const store = {
  get: () => state,
  set(updater: (s: AppState) => AppState) {
    state = updater(state)
    listeners.forEach((l) => l())
  },
  subscribe(l: () => void) {
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  },
  reset() {
    state = initialAppState
    listeners.forEach((l) => l())
  },
}

function subscribeAndSnapshot() {
  return state
}

/** Subscribes the component to the whole store; derive slices with useMemo. */
export function useAppState(): AppState {
  return useSyncExternalStore(store.subscribe, subscribeAndSnapshot, subscribeAndSnapshot)
}

export { rawBuses as buses, dailyPrices, holidays, places, initialUsers as users }
