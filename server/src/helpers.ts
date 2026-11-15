import type { Request } from 'express'
import { db } from './db'
import { normReg } from './csv'
import { nowIso } from './time'
import { reconcile, type ReconcileResult } from './reconcile'
import type { AuthUser } from './auth'
import { loadStatementLines } from './serializers'

export type AuditAction =
  | 'created' | 'viewed' | 'status_changed' | 'note_added' | 'correction_proposed'
  | 'escalated' | 'approved' | 'rejected' | 'info_requested' | 'synced'
  | 'bus_lookup' | 'bus_changed' | 'reconciliation_reviewed' | 'statement_loaded'

export function audit(
  entityType: 'entry' | 'flag' | 'approval' | 'bus' | 'reconciliation' | 'statement' | 'evidence',
  entityId: string,
  action: AuditAction,
  actor: { id: string | null; name: string },
  extra?: { before?: string; after?: string; reason?: string },
): void {
  db.prepare(
    `INSERT INTO audit_events (entity_type, entity_id, action, before, after, reason, actor_id, actor_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(entityType, entityId, action, extra?.before ?? null, extra?.after ?? null, extra?.reason ?? null, actor.id, actor.name, nowIso())
}

export function nextFlagId(): string {
  const rows = db.prepare("SELECT id FROM flags WHERE id LIKE 'FLG-%'").all() as { id: string }[]
  const max = rows.reduce((acc, r) => {
    const v = Number(r.id.replace('FLG-', ''))
    return Number.isFinite(v) ? Math.max(acc, v) : acc
  }, 0)
  return `FLG-${String(max + 1).padStart(2, '0')}`
}

export function nextEntryId(): string {
  const rows = db.prepare("SELECT id FROM fuel_entries WHERE id LIKE 'E-%'").all() as { id: string }[]
  const max = rows.reduce((acc, r) => {
    const v = Number(r.id.replace('E-', ''))
    return Number.isFinite(v) ? Math.max(acc, v) : acc
  }, 0)
  return `E-${String(max + 1).padStart(5, '0')}`
}

export interface ReconciliationRow extends ReconcileResult {
  reviewerDecision: string
  reviewerNote: string | null
  reviewedByName: string | null
  reviewedAt: string | null
}

/** Live computation over the database, with persisted reviewer state merged in. */
export function computeReconciliation(): ReconciliationRow[] {
  const lines = loadStatementLines()
  const entries = (
    db.prepare('SELECT id, bus_code, ts_client, litres, amount, payment_mode FROM fuel_entries').all() as Record<string, unknown>[]
  ).map((e) => ({
    id: String(e.id),
    busCode: String(e.bus_code),
    tsClient: String(e.ts_client),
    litres: Number(e.litres),
    amount: Number(e.amount),
    paymentMode: String(e.payment_mode),
  }))
  const busByReg = new Map<string, string>()
  for (const b of db.prepare('SELECT bus_code, reg_no FROM buses').all() as Record<string, unknown>[]) {
    busByReg.set(normReg(String(b.reg_no)), String(b.bus_code))
  }
  const prices = (db.prepare('SELECT date, price FROM diesel_prices ORDER BY date').all() as Record<string, unknown>[]).map((p) => ({
    date: String(p.date),
    price: Number(p.price),
  }))

  const computed = reconcile(lines, entries, busByReg, prices)
  const reviewerRows = new Map(
    (db.prepare('SELECT * FROM reconciliation_results').all() as Record<string, unknown>[]).map((r) => [
      String(r.bill_no),
      r,
    ]),
  )

  // Refresh the persisted computation snapshot (preserving reviewer fields).
  const upsert = db.prepare(`
    INSERT INTO reconciliation_results (bill_no, entry_ids, match_status, difference, entry_litres, entry_amount)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (bill_no) DO UPDATE SET
      entry_ids = excluded.entry_ids,
      match_status = excluded.match_status,
      difference = excluded.difference,
      entry_litres = excluded.entry_litres,
      entry_amount = excluded.entry_amount`)
  db.transaction(() => {
    for (const c of computed) {
      const side = c.entrySide
      upsert.run(
        c.billNo,
        JSON.stringify(c.entryIds),
        c.matchStatus,
        c.difference,
        side?.litres ?? null,
        side?.amount ?? null,
      )
    }
  })()

  return computed.map((c) => {
    const r = reviewerRows.get(c.billNo)
    const reviewedBy = r?.reviewed_by
      ? (db.prepare('SELECT name FROM users WHERE id = ?').get(String(r.reviewed_by)) as { name: string } | undefined)
      : undefined
    return {
      ...c,
      reviewerDecision: r ? String(r.reviewer_decision ?? 'none') : 'none',
      reviewerNote: r && r.reviewer_note ? String(r.reviewer_note) : null,
      reviewedByName: reviewedBy?.name ?? null,
      reviewedAt: r && r.reviewed_at ? String(r.reviewed_at) : null,
    }
  })
}

/** Role-scoping helper for entry lists. */
export function entryScope(user: AuthUser): { where: string; params: unknown[] } {
  if (user.role === 'driver') return { where: 'WHERE e.bus_code = ?', params: [user.busCode] }
  return { where: '', params: [] }
}

export interface Paged {
  page: number
  pageSize: number
  offset: number
}

export function paged(req: Request, defaultSize = 200): Paged {
  const page = Math.max(1, Number(req.query.page ?? 1) || 1)
  const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize ?? defaultSize) || defaultSize))
  return { page, pageSize, offset: (page - 1) * pageSize }
}
