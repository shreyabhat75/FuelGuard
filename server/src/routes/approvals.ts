import { Router } from 'express'
import crypto from 'node:crypto'
import { z } from 'zod'
import { db } from '../db'
import { requireAuth, requireRole } from '../auth'
import { serializeApproval } from '../serializers'
import { audit } from '../helpers'
import { nowIso } from '../time'

export const approvalsRouter = Router()

/** GET /api/approvals — principal/admin see all; others see their own submissions. */
approvalsRouter.get('/approvals', requireAuth, (req, res) => {
  const user = req.user!
  const rows =
    user.role === 'principal' || user.role === 'admin'
      ? (db.prepare('SELECT * FROM approvals ORDER BY created_at DESC').all() as Record<string, unknown>[])
      : (db.prepare('SELECT * FROM approvals WHERE submitter_id = ? ORDER BY created_at DESC').all(user.id) as Record<string, unknown>[])
  res.json({ approvals: rows.map(serializeApproval) })
})

/** POST /api/approvals — escalate a flag or correction to the principal. */
approvalsRouter.post('/approvals', requireAuth, requireRole('transport_manager'), (req, res) => {
  const user = req.user!
  const schema = z.object({
    flagId: z.string().optional(),
    correctionId: z.string().optional(),
    reviewNotes: z.string().min(5).max(2000),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Provide flagId or correctionId and reviewNotes (5+ chars)', details: parsed.error.flatten() })
    return
  }
  if (Boolean(parsed.data.flagId) === Boolean(parsed.data.correctionId)) {
    res.status(400).json({ error: 'Provide exactly one of flagId or correctionId' })
    return
  }

  let title: string
  let busCode: string | null = null
  let amount = 0
  let evidenceSummary = ''

  if (parsed.data.flagId) {
    const flag = db.prepare('SELECT * FROM flags WHERE id = ?').get(parsed.data.flagId) as
      | Record<string, unknown>
      | undefined
    if (!flag) {
      res.status(404).json({ error: 'Flag not found' })
      return
    }
    if (String(flag.status) === 'resolved' || String(flag.status) === 'rejected') {
      res.status(409).json({ error: 'Flag case is already closed' })
      return
    }
    title = String(flag.title)
    busCode = flag.bus_code ? String(flag.bus_code) : null
    amount = Number(flag.amount_at_issue ?? 0)
    evidenceSummary = String(flag.evidence_summary ?? '')
  } else {
    const corr = db.prepare('SELECT * FROM corrections WHERE id = ?').get(parsed.data.correctionId!) as
      | Record<string, unknown>
      | undefined
    if (!corr) {
      res.status(404).json({ error: 'Correction not found' })
      return
    }
    if (String(corr.status) !== 'pending') {
      res.status(409).json({ error: 'Correction is not pending' })
      return
    }
    title = `Correction of ${corr.field} on ${corr.entry_id}`
    busCode = (db.prepare('SELECT bus_code FROM fuel_entries WHERE id = ?').get(String(corr.entry_id)) as { bus_code: string } | undefined)?.bus_code ?? null
    amount = Math.abs(Number(corr.proposed_value) - Number(corr.original_value))
    evidenceSummary = `Proposed change: ${corr.field} ${corr.original_value} → ${corr.proposed_value}. Reason: ${corr.reason}`
  }

  const id = `APR-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
  db.prepare(`
    INSERT INTO approvals (id, target_type, target_id, title, bus_code, amount, submitter_id,
      submitter_name, submitter_role, evidence_summary, review_notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id,
    parsed.data.flagId ? 'flag' : 'correction',
    parsed.data.flagId ?? parsed.data.correctionId!,
    title,
    busCode,
    amount,
    user.id,
    user.name,
    user.role,
    evidenceSummary,
    parsed.data.reviewNotes,
    nowIso(),
  )
  if (parsed.data.flagId) {
    db.prepare("UPDATE flags SET status = 'escalated' WHERE id = ? AND status NOT IN ('resolved','rejected')").run(parsed.data.flagId)
    audit('flag', parsed.data.flagId, 'escalated', { id: user.id, name: user.name }, { after: `Escalated as ${id}` })
  }
  audit('approval', id, 'created', { id: user.id, name: user.name })
  res.status(201).json({ approval: serializeApproval(db.prepare('SELECT * FROM approvals WHERE id = ?').get(id) as Record<string, unknown>) })
})

/** POST /api/approvals/:id/decision — approve / reject / request info.
 *  Maker-checker enforced server-side: submitter cannot decide. */
approvalsRouter.post('/approvals/:id/decision', requireAuth, requireRole('principal'), (req, res) => {
  const user = req.user!
  const schema = z.object({
    decision: z.enum(['approved', 'rejected', 'info_requested']),
    reason: z.string().min(5).max(2000),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'decision + mandatory reason (5+ chars) required', details: parsed.error.flatten() })
    return
  }
  const approval = db.prepare('SELECT * FROM approvals WHERE id = ?').get(req.params.id) as
    | Record<string, unknown>
    | undefined
  if (!approval) {
    res.status(404).json({ error: 'Approval not found' })
    return
  }
  if (approval.decision) {
    res.status(409).json({ error: 'This approval already has a recorded decision' })
    return
  }
  if (String(approval.submitter_id) === user.id) {
    res.status(403).json({ error: 'You cannot review your own submission (maker-checker)' })
    return
  }

  const { decision, reason } = parsed.data
  const now = nowIso()
  db.prepare('UPDATE approvals SET decision = ?, reason = ?, decided_by = ?, decided_at = ? WHERE id = ?').run(
    decision, reason, user.id, now, req.params.id,
  )
  audit('approval', req.params.id, decision, { id: user.id, name: user.name }, { reason })

  const targetId = String(approval.target_id)
  if (String(approval.target_type) === 'flag') {
    const flagStatus = decision === 'approved' ? 'resolved' : decision === 'rejected' ? 'rejected' : 'awaiting_evidence'
    if (decision === 'info_requested') {
      audit('flag', targetId, 'info_requested', { id: user.id, name: user.name }, { reason })
    } else {
      db.prepare('UPDATE flags SET status = ?, resolution_note = ?, resolved_by = ?, resolved_at = ? WHERE id = ?').run(
        flagStatus, reason, user.id, now, targetId,
      )
      audit('flag', targetId, 'status_changed', { id: user.id, name: user.name }, {
        before: String(approval.title),
        after: flagStatus,
        reason,
      })
    }
  } else {
    const corr = db.prepare('SELECT * FROM corrections WHERE id = ?').get(targetId) as
      | Record<string, unknown>
      | undefined
    if (corr && decision !== 'info_requested') {
      const newStatus = decision === 'approved' ? 'approved' : 'rejected'
      db.prepare('UPDATE corrections SET status = ?, decided_by = ?, decided_at = ? WHERE id = ?').run(
        newStatus, user.id, now, targetId,
      )
      if (decision === 'approved') {
        const column = String(corr.field) === 'odometerKm' ? 'odometer_km' : String(corr.field)
        db.prepare(`UPDATE fuel_entries SET ${column} = ? WHERE id = ?`).run(
          Number(corr.proposed_value), String(corr.entry_id),
        )
        audit('entry', String(corr.entry_id), 'status_changed', { id: user.id, name: user.name }, {
          before: `${corr.field} = ${corr.original_value}`,
          after: `${corr.field} = ${corr.proposed_value}`,
          reason: `Correction ${corr.id} approved: ${reason}`,
        })
      }
    } else if (corr) {
      audit('entry', String(corr.entry_id), 'info_requested', { id: user.id, name: user.name }, { reason })
    }
  }

  res.json({ approval: serializeApproval(db.prepare('SELECT * FROM approvals WHERE id = ?').get(req.params.id) as Record<string, unknown>) })
})
