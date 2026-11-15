import { Router } from 'express'
import multer from 'multer'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { z } from 'zod'
import { sqlAll, sqlGet, sqlRun, withTransaction } from '../db'
import { env } from '../env'
import { ah } from '../asyncHandler'
import { requireAuth, requireRole } from '../auth'
import { serializeEntry, serializeEntries, serializeCorrection, serializeFlag, serializeFlagNote, serializeEvidence } from '../serializers'
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
entriesRouter.get('/fuel-entries', requireAuth, ah(async (req, res) => {
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
  const total = (await sqlGet<{ n: number }>(`SELECT COUNT(*) AS n FROM fuel_entries e${where}`, params))!.n
  const rows = (await sqlAll<Record<string, unknown>>(
    `${ENTRY_SELECT}${where} ORDER BY e.ts_client DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  )) as Record<string, unknown>[]
  res.json({ page, pageSize, total, entries: await serializeEntries(rows) })
}))

/** POST /api/fuel-entries — create entry; rules may add flags but never block the save. */
entriesRouter.post('/fuel-entries', requireAuth, requireRole('driver', 'transport_manager'), upload.fields([
  { name: 'odometerPhoto', maxCount: 1 },
  { name: 'receiptPhoto', maxCount: 1 },
]), ah(async (req, res) => {
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

  const bus = await sqlGet<{ bus_code: string; tank_litres: number }>('SELECT * FROM buses WHERE bus_code = ?', [
    input.busCode,
  ])
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
    const existing = await sqlGet<{ id: string }>('SELECT id FROM fuel_entries WHERE client_ref = ?', [
      input.clientRef,
    ])
    if (existing) {
      const row = (await sqlGet<Record<string, unknown>>(`${ENTRY_SELECT} WHERE e.id = ?`, [existing.id])) as Record<string, unknown>
      res.json({ entry: await serializeEntry(row), ruleHits: [], duplicate: true })
      return
    }
  }

  const id = await nextEntryId()
  const tsServer = nowIso()

  // Detection: context = same-bus history (including the new entry).
  const busEntries = (await sqlAll<Record<string, unknown>>(
    'SELECT id, bus_code, ts_client, litres, amount, odometer_km, payment_mode FROM fuel_entries WHERE bus_code = ? ORDER BY ts_client DESC LIMIT 60',
    [input.busCode],
  )) as Record<string, unknown>[]
  const prices = (await sqlAll<{ date: string; price: number }>('SELECT date, price FROM diesel_prices ORDER BY date')) as {
    date: string
    price: number
  }[]
  const holidays = (await sqlAll<{ date: string; name: string }>('SELECT date, holiday AS name FROM college_calendar')) as {
    date: string
    name: string
  }[]

  const evidenceRows: { kind: string }[] = []
  const flagIds: string[] = []
  let ruleHits: ReturnType<typeof runEntryChecks> = []

  await withTransaction(async () => {
    await sqlRun(
      `INSERT INTO fuel_entries (
        id, bus_code, ts_client, ts_server, litres, amount, fuel_type, odometer_km, paid_by,
        payment_mode, pump_name, bill_no, location_lat, location_lng, location_accuracy,
        location_note, receipt_on_file, activity_notes, created_by, client_ref, source, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'app', 'saved', ?)`,
      [
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
      ],
    )

    // Evidence files (private storage; served via authenticated endpoint only).
    for (const kind of ['odometer', 'receipt'] as const) {
      const f = files[kind === 'odometer' ? 'odometerPhoto' : 'receiptPhoto']?.[0]
      if (f) {
        evidenceRows.push({ kind })
        await sqlRun(
          `INSERT INTO evidence (id, entry_id, kind, file_path, file_name, mime, size, demo, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
          [crypto.randomUUID(), id, kind, f.filename, f.originalname || `${kind}.jpg`, f.mimetype, f.size, user.id, tsServer],
        )
      }
    }

    const hits = (ruleHits = runEntryChecks(
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
    ))

    for (const hit of hits) {
      const flagId = await nextFlagId()
      flagIds.push(flagId)
      await sqlRun(
        `INSERT INTO flags (id, rule_code, title, bus_code, severity, reason, plain_explanation,
          evidence_summary, entry_ids, bill_nos, amount_at_issue, confidence, figures, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, 'Auto-generated at save time.', '[]', 'needs_review', ?)`,
        [
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
        ],
      )
      await audit('flag', flagId, 'created', { id: null, name: 'FleetFuel Guard (auto)' }, { after: `${hit.code} on ${id}` })
    }

    if (hits.length > 0) {
      await sqlRun('UPDATE fuel_entries SET status = ? WHERE id = ?', ['needs_review', id])
    }
    await audit('entry', id, 'created', { id: user.id, name: user.name }, {
      after: `${input.litres.toFixed(1)} L, ₹${input.amount.toFixed(2)} at ${input.pumpName}`,
    })
  })

  const row = (await sqlGet<Record<string, unknown>>(`${ENTRY_SELECT} WHERE e.id = ?`, [id])) as Record<string, unknown>
  const savedEntry = await serializeEntry(row)
  res.status(201).json({ entry: savedEntry, ruleHits, flagIds })
}))

/** GET /api/fuel-entries/:id — full detail: entry, flags, notes, corrections, timeline. */
entriesRouter.get('/fuel-entries/:id', requireAuth, ah(async (req, res) => {
  const user = req.user!
  const row = (await sqlGet<Record<string, unknown>>(`${ENTRY_SELECT} WHERE e.id = ?`, [req.params.id])) as
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
  const allFlags = ((await sqlAll<Record<string, unknown>>('SELECT * FROM flags ORDER BY created_at')) as Record<string, unknown>[]).filter(
    (f) => (JSON.parse(String(f.entry_ids)) as string[]).includes(req.params.id),
  )
  const flagIds = allFlags.map((f) => String(f.id))
  const notes = flagIds.length
    ? ((await sqlAll<Record<string, unknown>>(
        `SELECT * FROM flag_notes WHERE flag_id IN (${flagIds.map(() => '?').join(',')}) ORDER BY created_at`,
        flagIds,
      )) as Record<string, unknown>[])
    : []
  const corrections = (await sqlAll<Record<string, unknown>>(
    'SELECT * FROM corrections WHERE entry_id = ? ORDER BY created_at',
    [req.params.id],
  )) as Record<string, unknown>[]
  const timeline = (await sqlAll<Record<string, unknown>>(
    'SELECT * FROM audit_events WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC',
    ['entry', req.params.id],
  )) as Record<string, unknown>[]

  if (user.role !== 'driver') {
    await audit('entry', req.params.id, 'viewed', { id: user.id, name: user.name })
  }

  res.json({
    entry: await serializeEntry(row),
    flags: await Promise.all(allFlags.map(serializeFlag)),
    notes: notes.map(serializeFlagNote),
    corrections: await Promise.all(corrections.map(serializeCorrection)),
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
}))

/** POST /api/fuel-entries/:id/corrections — append-only correction proposal. */
entriesRouter.post('/fuel-entries/:id/corrections', requireAuth, requireRole('transport_manager'), ah(async (req, res) => {
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
  const entry = (await sqlGet<Record<string, unknown>>('SELECT * FROM fuel_entries WHERE id = ?', [req.params.id])) as
    | Record<string, unknown>
    | undefined
  if (!entry) {
    res.status(404).json({ error: 'Entry not found' })
    return
  }
  const originalValue = Number(entry[parsed.data.field === 'odometerKm' ? 'odometer_km' : parsed.data.field])
  const id = `COR-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
  await sqlRun(
    `INSERT INTO corrections (id, entry_id, field, original_value, proposed_value, reason, proposed_by, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    [id, req.params.id, parsed.data.field, String(originalValue), String(parsed.data.proposedValue), parsed.data.reason, user.id, nowIso()],
  )
  await audit('entry', req.params.id, 'correction_proposed', { id: user.id, name: user.name }, {
    after: `${parsed.data.field}: ${originalValue} → ${parsed.data.proposedValue}`,
    reason: parsed.data.reason,
  })
  const row = (await sqlGet<Record<string, unknown>>('SELECT * FROM corrections WHERE id = ?', [id])) as Record<string, unknown>
  res.status(201).json({ correction: await serializeCorrection(row) })
}))

/** POST /api/fuel-entries/:id/evidence — attach photos after the fact (retry path). */
entriesRouter.post('/fuel-entries/:id/evidence', requireAuth, requireRole('driver', 'transport_manager'), upload.fields([
  { name: 'odometerPhoto', maxCount: 1 },
  { name: 'receiptPhoto', maxCount: 1 },
]), ah(async (req, res) => {
  const user = req.user!
  const entry = (await sqlGet<Record<string, unknown>>('SELECT * FROM fuel_entries WHERE id = ?', [req.params.id])) as
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
    await sqlRun(
      `INSERT INTO evidence (id, entry_id, kind, file_path, file_name, mime, size, demo, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [evidenceId, req.params.id, kind, f.filename, f.originalname || `${kind}.jpg`, f.mimetype, f.size, user.id, nowIso()],
    )
    out.push({ id: evidenceId, kind })
  }
  await audit('entry', req.params.id, 'synced', { id: user.id, name: user.name }, {
    after: out.length ? `Evidence attached: ${out.map((o) => o.kind).join(', ')}` : 'No files provided',
  })
  const evidenceRows = (await sqlAll<Record<string, unknown>>('SELECT * FROM evidence WHERE entry_id = ?', [
    req.params.id,
  ])) as Record<string, unknown>[]
  res.status(201).json({ evidence: evidenceRows.map(serializeEvidence), attached: out })
}))

/** GET /api/evidence/:id/file — private download (auth required, driver scoped). */
entriesRouter.get('/evidence/:id/file', requireAuth, ah(async (req, res) => {
  const user = req.user!
  const ev = await sqlGet<{ id: string; entry_id: string; file_path: string; mime: string; demo: number }>(
    'SELECT * FROM evidence WHERE id = ?',
    [req.params.id],
  )
  if (!ev) {
    res.status(404).json({ error: 'Evidence not found' })
    return
  }
  if (user.role === 'driver') {
    const entry = await sqlGet<{ bus_code: string }>('SELECT bus_code FROM fuel_entries WHERE id = ?', [ev.entry_id])
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
}))
