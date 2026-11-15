import { Router } from 'express'
import crypto from 'node:crypto'
import { z } from 'zod'
import { db } from '../db'
import { requireAuth, requireRole } from '../auth'
import { serializeFlag, serializeFlagNote, serializeEntry } from '../serializers'
import { audit } from '../helpers'
import { nowIso } from '../time'

export const flagsRouter = Router()

/** GET /api/flags — office view, filterable by status/bus. */
flagsRouter.get('/flags', requireAuth, requireRole('transport_manager', 'accountant', 'principal'), (req, res) => {
  const clauses: string[] = []
  const params: unknown[] = []
  const q = req.query as Record<string, string | undefined>
  if (q.status) {
    clauses.push('status = ?')
    params.push(q.status)
  }
  if (q.busCode) {
    clauses.push('bus_code LIKE ?')
    params.push(`%${q.busCode}%`)
  }
  const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''
  const rows = db.prepare(`SELECT * FROM flags${where} ORDER BY created_at DESC`).all(...params) as Record<string, unknown>[]
  res.json({ flags: rows.map(serializeFlag) })
})

/** GET /api/flags/:id — detail with notes and timeline; first office view is audited. */
flagsRouter.get('/flags/:id', requireAuth, requireRole('transport_manager', 'accountant', 'principal'), (req, res) => {
  const user = req.user!
  const row = db.prepare('SELECT * FROM flags WHERE id = ?').get(req.params.id) as
    | Record<string, unknown>
    | undefined
  if (!row) {
    res.status(404).json({ error: 'Flag not found' })
    return
  }
  if (!row.viewed_by_office) {
    db.prepare('UPDATE flags SET viewed_by_office = 1 WHERE id = ?').run(req.params.id)
    audit('flag', req.params.id, 'viewed', { id: user.id, name: user.name })
  }
  const notes = db
    .prepare('SELECT * FROM flag_notes WHERE flag_id = ? ORDER BY created_at')
    .all(req.params.id) as Record<string, unknown>[]
  const timeline = db
    .prepare("SELECT * FROM audit_events WHERE entity_type = 'flag' AND entity_id = ? ORDER BY created_at DESC")
    .all(req.params.id) as Record<string, unknown>[]
  const entryIds = JSON.parse(String(row.entry_ids)) as string[]
  const entries = entryIds.length
    ? (
        db
          .prepare(`SELECT e.*, u.name AS created_name FROM fuel_entries e LEFT JOIN users u ON u.id = e.created_by
                    WHERE e.id IN (${entryIds.map(() => '?').join(',')})`)
          .all(...entryIds) as Record<string, unknown>[]
      ).map(serializeEntry)
    : []
  res.json({
    flag: serializeFlag(row),
    notes: notes.map(serializeFlagNote),
    timeline: timeline.map((a) => ({
      id: String(a.id),
      entityType: 'flag',
      entityId: req.params.id,
      action: a.action,
      before: a.before ?? undefined,
      after: a.after ?? undefined,
      reason: a.reason ?? undefined,
      actorId: a.actor_id ?? 'system',
      actorName: a.actor_name,
      timestamp: a.created_at,
    })),
    entries,
  })
})

flagsRouter.post('/flags/:id/notes', requireAuth, requireRole('transport_manager', 'accountant', 'principal'), (req, res) => {
  const user = req.user!
  const schema = z.object({ text: z.string().min(3).max(2000) })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Note text required (3–2000 chars)', details: parsed.error.flatten() })
    return
  }
  const flag = db.prepare('SELECT id FROM flags WHERE id = ?').get(req.params.id)
  if (!flag) {
    res.status(404).json({ error: 'Flag not found' })
    return
  }
  const id = `N-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
  db.prepare(`
    INSERT INTO flag_notes (id, flag_id, author_id, author_name, author_role, text, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, req.params.id, user.id, user.name, user.role, parsed.data.text, nowIso())
  audit('flag', req.params.id, 'note_added', { id: user.id, name: user.name }, { after: parsed.data.text.slice(0, 120) })
  res.status(201).json({ note: serializeFlagNote(db.prepare('SELECT * FROM flag_notes WHERE id = ?').get(id) as Record<string, unknown>) })
})

/** POST /api/flags/:id/review — mandatory note on every state change.
 *  Escalating creates an approval for the principal (maker = current user). */
flagsRouter.post('/flags/:id/review', requireAuth, requireRole('transport_manager'), (req, res) => {
  const user = req.user!
  const schema = z.object({
    status: z.enum(['under_review', 'awaiting_evidence', 'resolved', 'escalated', 'rejected']),
    reason: z.string().min(5).max(2000),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'status + mandatory reason (5+ chars) required', details: parsed.error.flatten() })
    return
  }
  const flag = db.prepare('SELECT * FROM flags WHERE id = ?').get(req.params.id) as
    | Record<string, unknown>
    | undefined
  if (!flag) {
    res.status(404).json({ error: 'Flag not found' })
    return
  }
  const before = String(flag.status)
  const after = parsed.data.status
  if (before === 'resolved' || before === 'rejected') {
    res.status(409).json({ error: `Flag already ${before}; history is preserved and cannot be reopened` })
    return
  }
  if (before === after) {
    res.status(409).json({ error: `Flag is already ${after}` })
    return
  }

  const now = nowIso()
  const updates: Record<string, unknown> = { status: after }
  if (after === 'resolved' || after === 'rejected') {
    updates.resolution_note = parsed.data.reason
    updates.resolved_by = user.id
    updates.resolved_at = now
  }
  const setClause = Object.keys(updates).map((k) => `${k} = ?`).join(', ')
  db.prepare(`UPDATE flags SET ${setClause} WHERE id = ?`).run(
    ...Object.values(updates), req.params.id,
  )
  audit('flag', req.params.id, 'status_changed', { id: user.id, name: user.name }, {
    before, after, reason: parsed.data.reason,
  })

  let approvalId: string | undefined
  if (after === 'escalated') {
    approvalId = `APR-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
    db.prepare(`
      INSERT INTO approvals (id, target_type, target_id, title, bus_code, amount, submitter_id,
        submitter_name, submitter_role, evidence_summary, review_notes, created_at)
      VALUES (?, 'flag', ?, ?, ?, ?, ?, ?, 'transport_manager', ?, ?, ?)`).run(
      approvalId,
      req.params.id,
      String(flag.title),
      flag.bus_code ? String(flag.bus_code) : null,
      Number(flag.amount_at_issue ?? 0),
      user.id,
      user.name,
      String(flag.evidence_summary ?? ''),
      parsed.data.reason,
      now,
    )
    audit('approval', approvalId, 'created', { id: user.id, name: user.name }, { after: `Escalation of ${req.params.id}` })
  }

  res.json({
    flag: serializeFlag(db.prepare('SELECT * FROM flags WHERE id = ?').get(req.params.id) as Record<string, unknown>),
    approvalId,
  })
})
