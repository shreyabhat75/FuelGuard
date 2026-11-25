import { Router } from 'express'
import { sqlAll, sqlGet } from '../db'
import { ah } from '../asyncHandler'
import { dialect } from '../db'
import { requireAuth, requireRole } from '../auth'
import {
  serializeApproval,
  serializeAudit,
  serializeBus,
  serializeEntries,
  serializeFlag,
  serializeFlagNote,
  serializeCorrection,
  serializeStatementLine,
  serializeReconciliation,
  serializeUser,
} from '../serializers'
import { computeReconciliation, entryScope } from '../helpers'

export const miscRouter = Router()

/** GET /api/health — public liveness probe. */
miscRouter.get('/health', ah(async (_req, res) => {
  const counts = {
    activeUsers: Number((await sqlGet<{ n: number }>('SELECT COUNT(*) AS n FROM users WHERE active = 1'))!.n),
    buses: Number((await sqlGet<{ n: number }>('SELECT COUNT(*) AS n FROM buses'))!.n),
    entries: Number((await sqlGet<{ n: number }>('SELECT COUNT(*) AS n FROM fuel_entries'))!.n),
    statementLines: Number((await sqlGet<{ n: number }>('SELECT COUNT(*) AS n FROM pump_statement_lines'))!.n),
    gpsPings: Number((await sqlGet<{ n: number }>('SELECT COUNT(*) AS n FROM gps_pings'))!.n),
    flags: Number((await sqlGet<{ n: number }>('SELECT COUNT(*) AS n FROM flags'))!.n),
  }
  res.json({ ok: true, name: 'fleetfuel-server', time: new Date().toISOString(), db: dialect, counts })
}))

/** GET /api/reference — prices, holidays, places (small static tables). */
miscRouter.get('/reference', requireAuth, ah(async (_req, res) => {
  res.json({
    prices: ((await sqlAll<Record<string, unknown>>('SELECT date, price FROM diesel_prices ORDER BY date')) as Record<string, unknown>[]).map((p) => ({ date: p.date, price: p.price })),
    holidays: ((await sqlAll<Record<string, unknown>>('SELECT date, holiday FROM college_calendar ORDER BY date')) as Record<string, unknown>[]).map((h) => ({ date: h.date, name: h.holiday })),
    places: ((await sqlAll<Record<string, unknown>>('SELECT * FROM places')) as Record<string, unknown>[]).map((p) => ({ place: p.place, lat: p.lat, lng: p.lng })),
  })
}))

/** GET /api/audit — office roles; filterable by entity. */
miscRouter.get('/audit', requireAuth, requireRole('transport_manager', 'accountant', 'principal'), ah(async (req, res) => {
  const clauses: string[] = []
  const params: unknown[] = []
  const q = req.query as Record<string, string | undefined>
  if (q.entityType) {
    clauses.push('entity_type = ?')
    params.push(q.entityType)
  }
  if (q.entityId) {
    clauses.push('entity_id = ?')
    params.push(q.entityId)
  }
  const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''
  const limit = Math.min(1000, Number(q.limit ?? 500) || 500)
  const rows = (await sqlAll<Record<string, unknown>>(
    `SELECT * FROM audit_events${where} ORDER BY created_at DESC, id DESC LIMIT ?`,
    [...params, limit],
  )) as Record<string, unknown>[]
  res.json({ events: rows.map(serializeAudit) })
}))

/** GET /api/dashboard — aggregated KPIs for the office dashboard. */
miscRouter.get('/dashboard', requireAuth, requireRole('transport_manager', 'accountant', 'principal'), ah(async (_req, res) => {
  const totals = (await sqlGet<{ entries: number; litres: number; amount: number }>(
    `SELECT COUNT(*) AS entries, COALESCE(SUM(litres),0) AS litres, COALESCE(SUM(amount),0) AS amount FROM fuel_entries`,
  )) as { entries: number; litres: number; amount: number }
  const modes = (await sqlAll<{ payment_mode: string; entries: number; amount: number }>(
    `SELECT payment_mode, COUNT(*) AS entries, COALESCE(SUM(amount),0) AS amount FROM fuel_entries GROUP BY payment_mode`,
  )) as { payment_mode: string; entries: number; amount: number }[]
  const monthly = (await sqlAll<{ month: string; entries: number; litres: number; amount: number }>(
    `SELECT substr(ts_client,1,7) AS month, COUNT(*) AS entries, COALESCE(SUM(litres),0) AS litres, COALESCE(SUM(amount),0) AS amount
     FROM fuel_entries GROUP BY month ORDER BY month`,
  )) as { month: string; entries: number; litres: number; amount: number }[]
  const perBus = (await sqlAll<{ bus_code: string; entries: number; litres: number; amount: number; km: number }>(
    `SELECT bus_code,
            COUNT(*) AS entries,
            COALESCE(SUM(litres),0) AS litres,
            COALESCE(SUM(amount),0) AS amount,
            MAX(odometer_km) - MIN(odometer_km) AS km
     FROM fuel_entries GROUP BY bus_code ORDER BY bus_code`,
  )) as { bus_code: string; entries: number; litres: number; amount: number; km: number }[]
  const flagCounts = (await sqlAll<{ status: string; n: number }>(
    'SELECT status, COUNT(*) AS n FROM flags GROUP BY status',
  )) as { status: string; n: number }[]
  const pendingApprovals = Number((await sqlGet<{ n: number }>("SELECT COUNT(*) AS n FROM approvals WHERE decision IS NULL"))!.n)
  const recent = (await sqlAll<Record<string, unknown>>(
    `SELECT e.*, u.name AS created_name FROM fuel_entries e LEFT JOIN users u ON u.id = e.created_by
     ORDER BY e.ts_client DESC LIMIT 8`,
  )) as Record<string, unknown>[]
  const recon = await computeReconciliation()
  const reconSummary = recon.reduce<Record<string, number>>((acc, r) => {
    acc[r.matchStatus] = (acc[r.matchStatus] ?? 0) + 1
    return acc
  }, {})
  res.json({
    totals: { ...totals, buses: Number((await sqlGet<{ n: number }>('SELECT COUNT(*) AS n FROM buses'))!.n) },
    modes: modes.map((m) => ({ mode: m.payment_mode, entries: m.entries, amount: m.amount })),
    monthly: monthly.map((m) => ({ month: m.month, entries: m.entries, litres: m.litres, amount: m.amount })),
    perBus: perBus.map((b) => ({
      busCode: b.bus_code,
      entries: b.entries,
      litres: b.litres,
      amount: b.amount,
      km: b.km,
      litresPer100Km: b.km > 100 ? Math.round(((b.litres / b.km) * 100) * 100) / 100 : null,
    })),
    flags: Object.fromEntries(flagCounts.map((f) => [f.status, f.n])),
    pendingApprovals,
    reconciliation: reconSummary,
    recent: await serializeEntries(recent),
  })
}))

/** GET /api/bootstrap — one role-scoped snapshot of everything the UI needs. */
miscRouter.get('/bootstrap', requireAuth, ah(async (req, res) => {
  const user = req.user!
  const isOffice = user.role !== 'driver'

  const busRows =
    user.role === 'driver'
      ? ((await sqlAll<Record<string, unknown>>('SELECT * FROM buses WHERE bus_code = ?', [user.busCode])) as Record<string, unknown>[])
      : ((await sqlAll<Record<string, unknown>>('SELECT * FROM buses ORDER BY bus_code')) as Record<string, unknown>[])
  const { where, params } = entryScope(user)
  // Limit bootstrap snapshot to the 200 most recent entries; the full paginated
  // list at GET /api/fuel-entries is used for deeper views.
  const entryRows = (await sqlAll<Record<string, unknown>>(
    `SELECT e.*, u.name AS created_name FROM fuel_entries e LEFT JOIN users u ON u.id = e.created_by ${where}
     ORDER BY e.ts_client DESC LIMIT 200`,
    params,
  )) as Record<string, unknown>[]

  const reference = {
    prices: ((await sqlAll<Record<string, unknown>>('SELECT date, price FROM diesel_prices ORDER BY date')) as Record<string, unknown>[]).map((p) => ({ date: p.date, price: p.price })),
    holidays: ((await sqlAll<Record<string, unknown>>('SELECT date, holiday AS name FROM college_calendar ORDER BY date')) as Record<string, unknown>[]).map((h) => ({ date: h.date, name: h.name })),
  }

  if (!isOffice) {
    const me = (await sqlGet<Record<string, unknown>>('SELECT * FROM users WHERE id = ?', [user.id])) as Record<string, unknown>
    res.json({
      user: serializeUser(me),
      buses: busRows.map(serializeBus),
      entries: await serializeEntries(entryRows),
      flags: [],
      flagNotes: [],
      approvals: [],
      corrections: [],
      statementLines: [],
      reconciliation: [],
      audit: [],
      ...reference,
    })
    return
  }

  const flagRows = (await sqlAll<Record<string, unknown>>('SELECT * FROM flags ORDER BY created_at')) as Record<string, unknown>[]
  const flagNotes = (await sqlAll<Record<string, unknown>>('SELECT * FROM flag_notes ORDER BY created_at')) as Record<string, unknown>[]
  const approvalRows = (await sqlAll<Record<string, unknown>>('SELECT * FROM approvals ORDER BY created_at DESC')) as Record<string, unknown>[]
  const correctionRows = (await sqlAll<Record<string, unknown>>('SELECT * FROM corrections ORDER BY created_at DESC')) as Record<string, unknown>[]
  const statementRows = (await sqlAll<Record<string, unknown>>('SELECT * FROM pump_statement_lines ORDER BY date, bill_no')) as Record<string, unknown>[]
  const auditRows = (await sqlAll<Record<string, unknown>>(
    'SELECT * FROM audit_events ORDER BY created_at DESC, id DESC LIMIT 1000',
  )) as Record<string, unknown>[]
  const me = (await sqlGet<Record<string, unknown>>('SELECT * FROM users WHERE id = ?', [user.id])) as Record<string, unknown>
  const userRows =
    user.role === 'admin'
      ? await sqlAll<Record<string, unknown>>("SELECT * FROM users WHERE id <> 'U-SYS' ORDER BY name")
      : user.role === 'transport_manager'
        ? await sqlAll<Record<string, unknown>>(
            "SELECT * FROM users WHERE role = 'driver' OR id = ? ORDER BY name",
            [user.id],
          )
        : []

  res.json({
    user: serializeUser(me),
    users: userRows.map(serializeUser),
    buses: busRows.map(serializeBus),
    entries: await serializeEntries(entryRows),
    flags: await Promise.all(flagRows.map(serializeFlag)),
    flagNotes: flagNotes.map(serializeFlagNote),
    approvals: await Promise.all(approvalRows.map(serializeApproval)),
    corrections: await Promise.all(correctionRows.map(serializeCorrection)),
    statementLines: statementRows.map(serializeStatementLine),
    reconciliation: (await computeReconciliation()).map(serializeReconciliation),
    audit: auditRows.map(serializeAudit),
    ...reference,
  })
}))
