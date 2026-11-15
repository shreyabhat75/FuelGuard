import { Router } from 'express'
import { sqlAll, sqlGet } from '../db'
import { ah } from '../asyncHandler'
import { requireAuth, requireRole } from '../auth'
import { serializeBus, serializeEntries } from '../serializers'
import { haversineKm, isoIST } from '../time'
import { audit } from '../helpers'

export const busesRouter = Router()

/** GET /api/buses — buses allowed for the current user (driver sees own bus only). */
busesRouter.get('/buses', requireAuth, ah(async (req, res) => {
  const user = req.user!
  const rows =
    user.role === 'driver'
      ? ((await sqlAll<Record<string, unknown>>('SELECT * FROM buses WHERE bus_code = ? ORDER BY bus_code', [
          user.busCode,
        ])) as Record<string, unknown>[])
      : ((await sqlAll<Record<string, unknown>>('SELECT * FROM buses ORDER BY bus_code')) as Record<string, unknown>[])
  res.json({ buses: rows.map(serializeBus) })
}))

busesRouter.get('/buses/:code', requireAuth, ah(async (req, res) => {
  const user = req.user!
  if (user.role === 'driver' && user.busCode !== req.params.code) {
    res.status(403).json({ error: 'Not your bus' })
    return
  }
  const row = (await sqlGet<Record<string, unknown>>('SELECT * FROM buses WHERE bus_code = ?', [req.params.code])) as
    | Record<string, unknown>
    | undefined
  if (!row) {
    res.status(404).json({ error: 'Bus not found' })
    return
  }
  const entries = (await sqlAll<Record<string, unknown>>(
    `SELECT e.*, u.name AS created_name FROM fuel_entries e LEFT JOIN users u ON u.id = e.created_by
     WHERE e.bus_code = ? ORDER BY e.ts_client DESC LIMIT 100`,
    [req.params.code],
  )) as Record<string, unknown>[]
  res.json({ bus: serializeBus(row), entries: await serializeEntries(entries) })
}))

/** GET /api/buses/:code/qr — QR payload for the printable bus tag. */
busesRouter.get('/buses/:code/qr', requireAuth, ah(async (req, res) => {
  const row = (await sqlGet<Record<string, unknown>>('SELECT * FROM buses WHERE bus_code = ?', [req.params.code])) as
    | Record<string, unknown>
    | undefined
  if (!row) {
    res.status(404).json({ error: 'Bus not found' })
    return
  }
  res.json({
    busCode: row.bus_code,
    regNo: row.reg_no,
    qrPayload: `vpc-fleetfuel:bus:${row.bus_code}`,
  })
}))

/**
 * GET /api/buses/:code/path — GPS path summary for evidence.
 * Two modes:
 *   ?date=YYYY-MM-DD                          → pings within that day
 *   ?from=TS&to=TS                            → path between two fills
 *     (from is exclusive, to inclusive; full "YYYY-MM-DD[ HH:MM[:SS]]" or bare date)
 * Missing GPS is reported as-is, never as fraud.
 */
busesRouter.get('/buses/:code/path', requireAuth, requireRole('transport_manager', 'accountant'), ah(async (req, res) => {
  const q = req.query as Record<string, string | undefined>
  const TS = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/
  let from: string | undefined
  let to: string | undefined
  if (q.from || q.to) {
    from = q.from
    to = q.to
    if (!from || !to || !TS.test(from) || !TS.test(to)) {
      res.status(400).json({ error: 'from and to must be YYYY-MM-DD[ HH:MM[:SS]] timestamps' })
      return
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) to = `${to} 23:59:59`
  } else if (q.date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(q.date)) {
      res.status(400).json({ error: 'date query param must be YYYY-MM-DD' })
      return
    }
    from = `${q.date} 00:00:00`
    to = `${q.date} 23:59:59`
  } else {
    res.status(400).json({ error: 'Provide date=YYYY-MM-DD or from/to timestamps' })
    return
  }

  const pings = (
    (await sqlAll<{ ts: string; lat: number; lng: number }>(
      'SELECT ts, lat, lng FROM gps_pings WHERE bus_code = ? AND ts > ? AND ts <= ? ORDER BY ts',
      [req.params.code, from!, to!],
    )) as { ts: string; lat: number; lng: number }[]
  ).map((p) => ({ timestamp: isoIST(p.ts), lat: p.lat, lng: p.lng }))

  let pathKm = 0
  for (let i = 1; i < pings.length; i++) {
    pathKm += haversineKm(pings[i - 1].lat, pings[i - 1].lng, pings[i].lat, pings[i].lng)
  }
  pathKm = Math.round(pathKm * 10) / 10

  await audit('bus', req.params.code, 'bus_lookup', { id: req.user!.id, name: req.user!.name }, { after: `${from} → ${to}` })
  res.json({
    busCode: req.params.code,
    from,
    to,
    pingCount: pings.length,
    pathKm,
    coverage: pings.length > 1 ? 'ok' : pings.length === 1 ? 'single-ping' : 'no-data',
    note:
      pings.length === 0
        ? 'No GPS pings recorded for this interval (possible tracker outage) — not evidence of wrongdoing.'
        : undefined,
    pings,
  })
}))
