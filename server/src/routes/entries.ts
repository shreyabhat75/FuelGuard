import { Router } from 'express'
import multer from 'multer'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { z } from 'zod'
import { db } from '../db'
import { env } from '../env'
import { requireAuth, requireRole } from '../auth'
import { serializeEntry, serializeCorrection, serializeFlag, serializeFlagNote, serializeEvidence } from '../serializers'
import { runEntryChecks } from '../rules'
import { audit, entryScope, nextEntryId, nextFlagId, paged } from '../helpers'
import { nowIso } from '../time'

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, env.uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase().slice(0, 8) || '.jpg'
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`)
  },
})
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 2 },
  fileFilter: (_req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
    if (!ok) cb(new Error('Only JPEG, PNG or WebP images are accepted'))
    else cb(null, true)
  },
})

const entrySchema = z.object({
  busCode: z.string().min(2),
  timestampClient: z.string().min(10),
  litres: z.coerce.number().positive(),
  amount: z.coerce.number().positive(),
  fuelType: z.enum(['diesel', 'petrol', 'cng']),
  odometerKm: z.coerce.number().int().nonnegative(),
  paidBy: z.string().min(1),
  paymentMode: z.enum(['credit_account', 'cash', 'upi', 'card']),
  pumpName: z.string().min(1),
  billNo: z.string().optional(),
  location: z
    .object({ lat: z.number(), lng: z.number(), accuracyM: z.number().optional() })
    .nullable()
    .optional(),
  locationNote: z.enum(['denied', 'unavailable', 'skipped']).optional(),
  receiptOnFile: z.boolean().optional(),
  clientRef: z.string().min(6).max(120).optional(),
  activityNotes: z.array(z.string()).max(20).optional(),
})

const TITLE_BY_CODE: Record<string, string> = {
  RATE_MISMATCH: 'Rate differs from published price',
  TANK_CAPACITY: 'Litres exceed tank capacity',
  DUPLICATE_ENTRY: 'Likely duplicate fill',
  SHORT_INTERVAL: 'Unusual same-day refill pattern',
  HOLIDAY_FILL: 'Fill on a college holiday',
  RECEIPT_MISSING: 'Cash fill without receipt',
  ODOMETER_PHOTO_MISSING: 'Saved without odometer photo',
  LOCATION_UNAVAILABLE: 'Saved without GPS location',
}

const ENTRY_SELECT = `
  SELECT e.*, u.name AS created_name FROM fuel_entries e
  LEFT JOIN users u ON u.id = e.created_by`

export const entriesRouter = Router()

/** GET /api/fuel-entries — filtered, paginated list (driver scoped to own bus). */
entriesRouter.get('/fuel-entries', requireAuth, (req, res) => {
  const user = req.user!
  const scope = entryScope(user)
  const clauses = [scope.where.replace(/^WHERE /, '')].filter(Boolean)
  const params: unknown[] = [...scope.params]
  const q = req.query as Record<string, string | undefined>
  if (q.bus) {
    clauses.push('e.bus_code = ?')
    params.push(q.bus)
  }
  if (q.status) {
    clauses.push('e.status = ?')
    params.push(q.status)
  }
  if (q.payment) {
    clauses.push('e.payment_mode = ?')
    params.push(q.payment)
  }
  if (q.from) {
    clauses.push('e.ts_client >= ?')
    params.push(q.from)
  }
  if (q.to) {
    clauses.push('e.ts_client <= ?')
    params.push(q.to)
  }
  if (q.q) {
    clauses.push('(e.id LIKE ? OR e.pump_name LIKE ? OR e.bill_no LIKE ? OR e.paid_by LIKE ?)')
    const like = `%${q.q}%`
    params.push(like, like, like, like)
  }
  const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''
  const { page, pageSize, offset } = paged(req)
  const total = (
    db.prepare(`SELECT COUNT(*) AS n FROM fuel_entries e${where}`).get(...params) as { n: number }
  ).n
  const rows = db
    .prepare(`${ENTRY_SELECT}${where} ORDER BY e.ts_client DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset) as Record<string, unknown>[]
  res.json({ page, pageSize, total, entries: rows.map(serializeEntry) })
})

/** POST /api/fuel-entries — create entry; rules may add flags but never block the save. */
entriesRouter.post('/fuel-entries', requireAuth, requireRole('driver', 'transport_manager'), upload.fields([
  { name: 'odometerPhoto', maxCount: 1 },
  { name: 'receiptPhoto', maxCount: 1 },
]), (req, res) => {
  const user = req.user!
  const files = (req.files ?? {}) as Record<string, Express.Multer.File[]>
  const body: Record<string, unknown> = { ...req.body }
  if (body.location) {
    try {
      body.location = typeof body.location === 'string' ? JSON.parse(String(body.location)) : body.location
    } catch {
      body.location = null
    }
  }
  if (body.activityNotes) {
    try {
      body.activityNotes =
        typeof body.activityNotes === 'string' ? JSON.parse(String(body.activityNotes)) : body.activityNotes
    } catch {
      body.activityNotes = []
    }
  }
  if (body.receiptOnFile === 'true') body.receiptOnFile = true
  if (body.receiptOnFile === 'false' || body.receiptOnFile === '') body.receiptOnFile = undefined

  const parsed = entrySchema.safeParse(body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid entry', details: parsed.error.flatten() })
    return
  }
  const input = parsed.data

  const bus = db.prepare('SELECT * FROM buses WHERE bus_code = ?').get(input.busCode) as
    | { bus_code: string; tank_litres: number }
    | undefined
  if (!bus) {
    res.status(404).json({ error: `Unknown bus ${input.busCode}` })
    return
  }
  if (user.role === 'driver' && user.busCode !== input.busCode) {
    res.status(403).json({ error: 'Drivers can only submit entries for their assigned bus' })
    return
  }

  // Offline sync idempotency: same clientRef returns the already-saved entry.
  if (input.clientRef) {
    const existing = db
      .prepare('SELECT id FROM fuel_entries WHERE client_ref = ?')
      .get(input.clientRef) as { id: string } | undefined
    if (existing) {
      const row = db.prepare(`${ENTRY_SELECT} WHERE e.id = ?`).get(existing.id) as Record<string, unknown>
      res.json({ entry: serializeEntry(row), ruleHits: [], duplicate: true })
      return
    }
  }

  const id = nextEntryId()
  const tsServer = nowIso()
  db.prepare(`
    INSERT INTO fuel_entries (
      id, bus_code, ts_client, ts_server, litres, amount, fuel_type, odometer_km, paid_by,
      payment_mode, pump_name, bill_no, location_lat, location_lng, location_accuracy,
      location_note, receipt_on_file, activity_notes, created_by, client_ref, source, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'app', 'saved', ?)`).run(
    id,
    input.busCode,
    input.timestampClient,
    tsServer,
    input.litres,
    input.amount,
    input.fuelType,
    input.odometerKm,
    input.paidBy,
    input.paymentMode,
    input.pumpName,
    input.billNo ?? null,
    input.location?.lat ?? null,
    input.location?.lng ?? null,
    input.location?.accuracyM ?? null,
    input.locationNote ?? null,
    input.receiptOnFile === true ? 1 : null,
    input.activityNotes?.length ? JSON.stringify(input.activityNotes) : null,
    user.id,
    input.clientRef ?? null,
    tsServer,
  )

  // Evidence files (private storage; served via authenticated endpoint only).
  const evidenceStmt = db.prepare(`
    INSERT INTO evidence (id, entry_id, kind, file_path, file_name, mime, size, demo, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`)
  for (const kind of ['odometer', 'receipt'] as const) {
    const f = files[kind === 'odometer' ? 'odometerPhoto' : 'receiptPhoto']?.[0]
    if (f) {
      evidenceStmt.run(
        crypto.randomUUID(),
        id,
        kind,
        f.filename,
        f.originalname || `${kind}.jpg`,
        f.mimetype,
        f.size,
        user.id,
        tsServer,
      )
    }
  }

  // Detection: context = same-bus history (including the new entry).
  const busEntries = db
    .prepare('SELECT id, bus_code, ts_client, litres, amount, odometer_km, payment_mode FROM fuel_entries WHERE bus_code = ? ORDER BY ts_client DESC LIMIT 60')
    .all(input.busCode) as Record<string, unknown>[]
  const prices = db.prepare('SELECT date, price FROM diesel_prices ORDER BY date').all() as { date: string; price: number }[]
  const holidays = db.prepare('SELECT date, holiday AS name FROM college_calendar').all() as { date: string; name: string }[]
  const evidenceRows = db.prepare('SELECT kind FROM evidence WHERE entry_id = ?').all(id) as { kind: string }[]

  const hits = runEntryChecks(
    {
      id,
      busCode: input.busCode,
      tsClient: input.timestampClient,
      litres: input.litres,
      amount: input.amount,
      paymentMode: input.paymentMode,
      pumpName: input.pumpName,
      odometerKm: input.odometerKm,
      hasOdometerPhoto: evidenceRows.some((e) => e.kind === 'odometer'),
      hasReceiptPhoto: evidenceRows.some((e) => e.kind === 'receipt'),
      receiptOnFile: input.receiptOnFile,
      locationLat: input.location?.lat ?? null,
      locationNote: input.locationNote,
    },
    {
      bus: { busCode: bus.bus_code, tankLitres: bus.tank_litres },
      prices,
      holidays,
      busEntries: busEntries.map((e) => ({
        id: String(e.id),
        busCode: String(e.bus_code),
        tsClient: String(e.ts_client),
        litres: Number(e.litres),
        amount: Number(e.amount),
        odometerKm: Number(e.odometer_km),
        paymentMode: String(e.payment_mode),
      })),
    },
  )

  const flagIds: string[] = []
  const flagStmt = db.prepare(`
    INSERT INTO flags (id, rule_code, title, bus_code, severity, reason, plain_explanation,
      evidence_summary, entry_ids, bill_nos, amount_at_issue, confidence, figures, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, 'Auto-generated at save time.', '[]', 'needs_review', ?)`)
  for (const hit of hits) {
    const flagId = nextFlagId()
    flagIds.push(flagId)
    flagStmt.run(
      flagId,
      hit.code,
      `${input.busCode} — ${TITLE_BY_CODE[hit.code] ?? hit.code}`,
      input.busCode,
      hit.severity,
      hit.reason,
      hit.explanation,
      hit.evidence,
      JSON.stringify([id]),
      hit.amountAtIssue,
      tsServer,
    )
    audit('flag', flagId, 'created', { id: null, name: 'FleetFuel Guard (auto)' }, { after: `${hit.code} on ${id}` })
  }

  const status = hits.length > 0 ? 'needs_review' : 'saved'
  if (hits.length > 0) {
    db.prepare('UPDATE fuel_entries SET status = ? WHERE id = ?').run(status, id)
  }
  audit('entry', id, 'created', { id: user.id, name: user.name }, {
    after: `${input.litres.toFixed(1)} L, ₹${input.amount.toFixed(2)} at ${input.pumpName}`,
  })

  const row = db.prepare(`${ENTRY_SELECT} WHERE e.id = ?`).get(id) as Record<string, unknown>
  res.status(201).json({ entry: serializeEntry(row), ruleHits: hits, flagIds })
})

/** GET /api/fuel-entries/:id — full detail: entry, flags, notes, corrections, timeline. */
entriesRouter.get('/fuel-entries/:id', requireAuth, (req, res) => {
  const user = req.user!
  const row = db.prepare(`${ENTRY_SELECT} WHERE e.id = ?`).get(req.params.id) as
    | Record<string, unknown>
    | undefined
  if (!row) {
    res.status(404).json({ error: 'Entry not found' })
    return
  }
  if (user.role === 'driver' && row.bus_code !== user.busCode) {
    res.status(403).json({ error: 'Not your bus' })
    return
  }
  const allFlags = (db.prepare('SELECT * FROM flags ORDER BY created_at').all() as Record<string, unknown>[]).filter(
    (f) => (JSON.parse(String(f.entry_ids)) as string[]).includes(req.params.id),
  )
  const flagIds = allFlags.map((f) => String(f.id))
  const notes = flagIds.length
    ? (db.prepare(`SELECT * FROM flag_notes WHERE flag_id IN (${flagIds.map(() => '?').join(',')}) ORDER BY created_at`).all(...flagIds) as Record<string, unknown>[])
    : []
  const corrections = db
    .prepare('SELECT * FROM corrections WHERE entry_id = ? ORDER BY created_at')
    .all(req.params.id) as Record<string, unknown>[]
  const timeline = db
    .prepare('SELECT * FROM audit_events WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC')
    .all('entry', req.params.id) as Record<string, unknown>[]

  if (user.role !== 'driver') {
    audit('entry', req.params.id, 'viewed', { id: user.id, name: user.name })
  }

  res.json({
    entry: serializeEntry(row),
    flags: allFlags.map(serializeFlag),
    notes: notes.map(serializeFlagNote),
    corrections: corrections.map(serializeCorrection),
    timeline: timeline.map((a) => ({
      id: String(a.id),
      entityType: 'entry',
      entityId: req.params.id,
      action: a.action,
      before: a.before ?? undefined,
      after: a.after ?? undefined,
      reason: a.reason ?? undefined,
      actorId: a.actor_id ?? 'system',
      actorName: a.actor_name,
      timestamp: a.created_at,
    })),
  })
})

/** POST /api/fuel-entries/:id/corrections — append-only correction proposal. */
entriesRouter.post('/fuel-entries/:id/corrections', requireAuth, requireRole('transport_manager'), (req, res) => {
  const user = req.user!
  const schema = z.object({
    field: z.enum(['litres', 'amount', 'odometerKm']),
    proposedValue: z.coerce.number(),
    reason: z.string().min(5),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid correction', details: parsed.error.flatten() })
    return
  }
  const entry = db.prepare('SELECT * FROM fuel_entries WHERE id = ?').get(req.params.id) as
    | Record<string, unknown>
    | undefined
  if (!entry) {
    res.status(404).json({ error: 'Entry not found' })
    return
  }
  const originalValue = Number(entry[parsed.data.field === 'odometerKm' ? 'odometer_km' : parsed.data.field])
  const id = `COR-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
  db.prepare(`
    INSERT INTO corrections (id, entry_id, field, original_value, proposed_value, reason, proposed_by, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`).run(
    id,
    req.params.id,
    parsed.data.field,
    String(originalValue),
    String(parsed.data.proposedValue),
    parsed.data.reason,
    user.id,
    nowIso(),
  )
  audit('entry', req.params.id, 'correction_proposed', { id: user.id, name: user.name }, {
    after: `${parsed.data.field}: ${originalValue} → ${parsed.data.proposedValue}`,
    reason: parsed.data.reason,
  })
  const row = db.prepare('SELECT * FROM corrections WHERE id = ?').get(id) as Record<string, unknown>
  res.status(201).json({ correction: serializeCorrection(row) })
})

/** POST /api/fuel-entries/:id/evidence — attach photos after the fact (retry path). */
entriesRouter.post('/fuel-entries/:id/evidence', requireAuth, requireRole('driver', 'transport_manager'), upload.fields([
  { name: 'odometerPhoto', maxCount: 1 },
  { name: 'receiptPhoto', maxCount: 1 },
]), (req, res) => {
  const user = req.user!
  const entry = db.prepare('SELECT * FROM fuel_entries WHERE id = ?').get(req.params.id) as
    | Record<string, unknown>
    | undefined
  if (!entry) {
    res.status(404).json({ error: 'Entry not found' })
    return
  }
  if (user.role === 'driver' && entry.bus_code !== user.busCode) {
    res.status(403).json({ error: 'Not your bus' })
    return
  }
  const files = (req.files ?? {}) as Record<string, Express.Multer.File[]>
  const out: { id: string; kind: string }[] = []
  for (const kind of ['odometer', 'receipt'] as const) {
    const f = files[kind === 'odometer' ? 'odometerPhoto' : 'receiptPhoto']?.[0]
    if (!f) continue
    const evidenceId = crypto.randomUUID()
    db.prepare(`
      INSERT INTO evidence (id, entry_id, kind, file_path, file_name, mime, size, demo, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`).run(
      evidenceId, req.params.id, kind, f.filename, f.originalname || `${kind}.jpg`, f.mimetype, f.size, user.id, nowIso(),
    )
    out.push({ id: evidenceId, kind })
  }
  audit('entry', req.params.id, 'synced', { id: user.id, name: user.name }, {
    after: out.length ? `Evidence attached: ${out.map((o) => o.kind).join(', ')}` : 'No files provided',
  })
  const evidenceRows = db.prepare('SELECT * FROM evidence WHERE entry_id = ?').all(req.params.id) as Record<string, unknown>[]
  res.status(201).json({ evidence: evidenceRows.map(serializeEvidence), attached: out })
})

/** GET /api/evidence/:id/file — private download (auth required, driver scoped). */
entriesRouter.get('/evidence/:id/file', requireAuth, (req, res) => {
  const user = req.user!
  const ev = db.prepare('SELECT * FROM evidence WHERE id = ?').get(req.params.id) as
    | { id: string; entry_id: string; file_path: string; mime: string; demo: number }
    | undefined
  if (!ev) {
    res.status(404).json({ error: 'Evidence not found' })
    return
  }
  if (user.role === 'driver') {
    const entry = db.prepare('SELECT bus_code FROM fuel_entries WHERE id = ?').get(ev.entry_id) as
      | { bus_code: string }
      | undefined
    if (!entry || entry.bus_code !== user.busCode) {
      res.status(403).json({ error: 'Not your bus' })
      return
    }
  }
  if (ev.demo) {
    res.status(404).json({ error: 'Demo placeholder — no stored file' })
    return
  }
  const filePath = path.join(env.uploadDir, ev.file_path)
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File missing from storage' })
    return
  }
  res.setHeader('Content-Type', ev.mime)
  res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`)
  fs.createReadStream(filePath).pipe(res)
})
