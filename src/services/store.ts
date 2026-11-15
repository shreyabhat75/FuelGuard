import { useSyncExternalStore } from 'react'
import type {
  Approval,
  AuditEvent,
  CorrectionProposal,
  Flag,
  FlagNote,
  FuelEntry,
  PumpStatementLine,
  ReconciliationResult,
} from '../types'
import { buses, dailyPrices, holidays, places, registerEntries, statementLines } from '../data/raw'
import { seededApprovals, seededAudit, seededFlags, seededNotes, users } from '../data/seed'

export type Lang = 'en' | 'kn'

export interface AppState {
  currentUserId: string | null
  lang: Lang
  /** demo offline toggle for the driver app */
  online: boolean
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

export { buses, dailyPrices, holidays, places, users }
