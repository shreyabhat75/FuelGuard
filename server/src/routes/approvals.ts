import { Router } from 'express'
import crypto from 'node:crypto'
import { z } from 'zod'
import { sqlAll, sqlGet, sqlRun } from '../db'
import { ah } from '../asyncHandler'
import { requireAuth, requireRole } from '../auth'
import { serializeApproval } from '../serializers'
import { audit } from '../helpers'
import { nowIso } from '../time'

export const approvalsRouter = Router()

/** GET /api/approvals — principal/admin see all; others see their own submissions. */
approvalsRouter.get('/approvals', requireAuth, ah(async (req, res) => {
  const user = req.user!
  const rows =
    user.role === 'principal' || user.role === 'admin'
      ? ((await sqlAll<Record<string, unknown>>('SELECT * FROM approvals ORDER BY created_at DESC')) as Record<string, unknown>[])
      : ((await sqlAll<Record<string, unknown>>('SELECT * FROM approvals WHERE submitter_id = ? ORDER BY created_at DESC', [user.id])) as Record<string, unknown>[])
  res.json({ approvals: await Promise.all(rows.map(serializeApproval)) })
}))

/** POST /api/approvals — escalate a flag or correction to the principal. */
approvalsRouter.post('/approvals', requireAuth, requireRole('transport_manager'), ah(async (req, res) => {
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
    const flag = (await sqlGet<Record<string, unknown>>('SELECT * FROM flags WHERE id = ?', [parsed.data.flagId])) as
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
    const corr = (await sqlGet<Record<string, unknown>>('SELECT * FROM corrections WHERE id = ?', [parsed.data.correctionId!])) as
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
    busCode = ((await sqlGet<{ bus_code: string }>('SELECT bus_code FROM fuel_entries WHERE id = ?', [String(corr.entry_id)])) as { bus_code: string } | undefined)?.bus_code ?? null
    amount = Math.abs(Number(corr.proposed_value) - Number(corr.original_value))
    evidenceSummary = `Proposed change: ${corr.field} ${corr.original_value} → ${corr.proposed_value}. Reason: ${corr.reason}`
  }

  const id = `APR-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
  await sqlRun(
    `INSERT INTO approvals (id, target_type, target_id, title, bus_code, amount, submitter_id,
      submitter_name, submitter_role, evidence_summary, review_notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
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
    ],
  )
  if (parsed.data.flagId) {
    await sqlRun("UPDATE flags SET status = 'escalated' WHERE id = ? AND status NOT IN ('resolved','rejected')", [parsed.data.flagId])
    await audit('flag', parsed.data.flagId, 'escalated', { id: user.id, name: user.name }, { after: `Escalated as ${id}` })
  }
  await audit('approval', id, 'created', { id: user.id, name: user.name })
  const row = (await sqlGet<Record<string, unknown>>('SELECT * FROM approvals WHERE id = ?', [id])) as Record<string, unknown>
  res.status(201).json({ approval: await serializeApproval(row) })
}))

/** POST /api/approvals/:id/decision — approve / reject / request info.
 *  Maker-checker enforced server-side: submitter cannot decide. */
approvalsRouter.post('/approvals/:id/decision', requireAuth, requireRole('principal'), ah(async (req, res) => {
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
  const approval = (await sqlGet<Record<string, unknown>>('SELECT * FROM approvals WHERE id = ?', [req.params.id])) as
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
  await sqlRun('UPDATE approvals SET decision = ?, reason = ?, decided_by = ?, decided_at = ? WHERE id = ?', [
    decision, reason, user.id, now, req.params.id,
  ])
  await audit('approval', req.params.id, decision, { id: user.id, name: user.name }, { reason })

  const targetId = String(approval.target_id)
  if (String(approval.target_type) === 'flag') {
    const flagStatus = decision === 'approved' ? 'resolved' : decision === 'rejected' ? 'rejected' : 'awaiting_evidence'
    if (decision === 'info_requested') {
      await audit('flag', targetId, 'info_requested', { id: user.id, name: user.name }, { reason })
    } else {
      await sqlRun('UPDATE flags SET status = ?, resolution_note = ?, resolved_by = ?, resolved_at = ? WHERE id = ?', [
        flagStatus, reason, user.id, now, targetId,
      ])
      await audit('flag', targetId, 'status_changed', { id: user.id, name: user.name }, {
        before: String(approval.title),
        after: flagStatus,
        reason,
      })
    }
  } else {
    const corr = (await sqlGet<Record<string, unknown>>('SELECT * FROM corrections WHERE id = ?', [targetId])) as
      | Record<string, unknown>
      | undefined
    if (corr && decision !== 'info_requested') {
      const newStatus = decision === 'approved' ? 'approved' : 'rejected'
      await sqlRun('UPDATE corrections SET status = ?, decided_by = ?, decided_at = ? WHERE id = ?', [
        newStatus, user.id, now, targetId,
      ])
      if (decision === 'approved') {
        const column = String(corr.field) === 'odometerKm' ? 'odometer_km' : String(corr.field)
        await sqlRun(`UPDATE fuel_entries SET ${column} = ? WHERE id = ?`, [
          Number(corr.proposed_value), String(corr.entry_id),
        ])
        await audit('entry', String(corr.entry_id), 'status_changed', { id: user.id, name: user.name }, {
          before: `${corr.field} = ${corr.original_value}`,
          after: `${corr.field} = ${corr.proposed_value}`,
          reason: `Correction ${corr.id} approved: ${reason}`,
        })
      }
    } else if (corr) {
      await audit('entry', String(corr.entry_id), 'info_requested', { id: user.id, name: user.name }, { reason })
    }
  }

  const row = (await sqlGet<Record<string, unknown>>('SELECT * FROM approvals WHERE id = ?', [req.params.id])) as Record<string, unknown>
  res.json({ approval: await serializeApproval(row) })
}))
