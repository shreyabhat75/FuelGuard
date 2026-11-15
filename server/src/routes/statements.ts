import { Router } from 'express'
import multer from 'multer'
import crypto from 'node:crypto'
import { z } from 'zod'
import { db } from '../db'
import { requireAuth, requireRole } from '../auth'
import { csvObjects, normaliseDdMmYyyy, num } from '../csv'
import { serializeReconciliation } from '../serializers'
import { audit, computeReconciliation } from '../helpers'
import { nowIso } from '../time'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
})

export const statementsRouter = Router()

/** POST /api/statements/import — multipart CSV upload (accountant/manager/admin). */
statementsRouter.post('/statements/import', requireAuth, requireRole('accountant', 'transport_manager'), upload.single('file'), (req, res) => {
  const user = req.user!
  let text = ''
  if (req.file) text = req.file.buffer.toString('utf8')
  else if (typeof req.body?.csv === 'string') text = req.body.csv
  else {
    res.status(400).json({ error: 'Upload a CSV file (field "file") or send csv text' })
    return
  }

  const rows = csvObjects(text)
  if (rows.length === 0) {
    res.status(400).json({ error: 'No rows found in CSV' })
    return
  }
  const required = ['date', 'vehicle_no', 'bill_no', 'litres', 'rate', 'amount']
  const missing = required.filter((c) => !(c in rows[0]))
  if (missing.length) {
    res.status(400).json({ error: `CSV is missing columns: ${missing.join(', ')}` })
    return
  }

  const fileId = `STMT-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
  const fileName = req.file?.originalname ?? 'pasted-statement.csv'
  db.prepare(`
    INSERT INTO pump_statement_files (id, file_name, uploaded_by, uploaded_at, line_count)
    VALUES (?, ?, ?, ?, ?)`).run(fileId, fileName, user.id, nowIso(), rows.length)

  const stmt = db.prepare(`
    INSERT INTO pump_statement_lines (bill_no, file_id, date, vehicle_no, litres, rate, amount)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (bill_no) DO UPDATE SET
      file_id = excluded.file_id, date = excluded.date, vehicle_no = excluded.vehicle_no,
      litres = excluded.litres, rate = excluded.rate, amount = excluded.amount`)
  let inserted = 0
  db.transaction(() => {
    for (const r of rows) {
      const res2 = stmt.run(
        r.bill_no,
        fileId,
        normaliseDdMmYyyy(r.date),
        r.vehicle_no,
        num(r.litres, 0),
        num(r.rate, 0),
        num(r.amount, 0),
      )
      if (res2.changes > 0) inserted++
    }
  })()

  audit('statement', fileId, 'statement_loaded', { id: user.id, name: user.name }, {
    after: `${fileName} (${rows.length} lines, ${inserted} new)`,
  })

  const results = computeReconciliation()
  const summary = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.matchStatus] = (acc[r.matchStatus] ?? 0) + 1
    return acc
  }, {})
  res.status(201).json({ fileId, fileName, lineCount: rows.length, newLines: inserted, summary, reconciliation: results.map(serializeReconciliation) })
})

/** GET /api/reconciliation — live match computation + persisted reviewer state. */
statementsRouter.get('/reconciliation', requireAuth, requireRole('accountant', 'transport_manager', 'principal'), (_req, res) => {
  res.json({ reconciliation: computeReconciliation().map(serializeReconciliation) })
})

/** POST /api/reconciliation/decision — mandatory note (accountant/manager/admin).
 *  billNo travels in the body because pump bill numbers contain slashes. */
statementsRouter.post('/reconciliation/decision', requireAuth, requireRole('accountant', 'transport_manager'), (req, res) => {
  const user = req.user!
  const schema = z.object({
    billNo: z.string().min(3),
    decision: z.enum(['resolved', 'needs_supplier_clarification', 'authorised_exception']),
    note: z.string().min(5).max(2000),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'billNo + decision + mandatory note (5+ chars) required', details: parsed.error.flatten() })
    return
  }
  const { billNo, decision, note } = parsed.data
  const computed = computeReconciliation().find((r) => r.billNo === billNo)
  if (!computed) {
    res.status(404).json({ error: `No statement line with bill_no ${billNo}` })
    return
  }
  db.prepare(`
    INSERT INTO reconciliation_results (bill_no, entry_ids, match_status, difference, reviewer_decision, reviewer_note, reviewed_by, reviewed_at, reviewed_at_ts)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (bill_no) DO UPDATE SET
      entry_ids = excluded.entry_ids, match_status = excluded.match_status, difference = excluded.difference,
      reviewer_decision = excluded.reviewer_decision, reviewer_note = excluded.reviewer_note,
      reviewed_by = excluded.reviewed_by, reviewed_at = excluded.reviewed_at, reviewed_at_ts = excluded.reviewed_at_ts`).run(
    billNo,
    JSON.stringify(computed.entryIds),
    computed.matchStatus,
    computed.difference,
    decision,
    note,
    user.id,
    nowIso(),
    nowIso(),
  )
  audit('reconciliation', billNo, 'reconciliation_reviewed', { id: user.id, name: user.name }, {
    after: decision,
    reason: note,
  })
  const merged = computeReconciliation().find((r) => r.billNo === billNo)!
  res.json({ result: serializeReconciliation(merged) })
})
