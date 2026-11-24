import { Router } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { z } from 'zod'
import { requireAuth, requireRole } from '../auth'
import { ah } from '../asyncHandler'
import { sqlAll, sqlGet, sqlRun, withTransaction } from '../db'
import { audit } from '../helpers'
import { serializeBus, serializeUser } from '../serializers'
import { nowIso } from '../time'

type Row = Record<string, unknown>

const roleSchema = z.enum(['driver', 'transport_manager', 'accountant', 'principal', 'admin'])
const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(60)
  .regex(/^[a-z0-9._-]+$/i, 'Use letters, numbers, dots, underscores or hyphens')

const createUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  role: roleSchema,
  username: usernameSchema,
  password: z.string().min(6).max(128),
  phone: z.string().trim().max(40).optional(),
  busCode: z.string().trim().min(2).max(30).nullable().optional(),
})

const updateUserSchema = z
  .object({
    username: usernameSchema.optional(),
    password: z.string().min(6).max(128).optional(),
    status: z.enum(['active', 'suspended']).optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    busCode: z.string().trim().min(2).max(30).nullable().optional(),
    reason: z.string().trim().min(5).max(1000),
  })
  .refine(
    (value) =>
      value.username !== undefined ||
      value.password !== undefined ||
      value.status !== undefined ||
      value.phone !== undefined ||
      value.busCode !== undefined,
    { message: 'At least one user field must change' },
  )

const createBusSchema = z.object({
  busCode: z.string().trim().min(2).max(30).regex(/^[A-Z0-9-]+$/i),
  registration: z.string().trim().min(3).max(60),
  tankLitres: z.coerce.number().int().positive().max(1000),
  fuelType: z.enum(['diesel', 'petrol', 'cng']),
  gpsDevice: z.string().trim().min(2).max(80).optional(),
  driverId: z.string().trim().min(2).nullable().optional(),
})

const allocateSchema = z.object({
  driverId: z.string().trim().min(2).nullable(),
  reason: z.string().trim().min(5).max(1000),
})

async function assignDriver(busCode: string, driverId: string | null): Promise<void> {
  const bus = await sqlGet<Row>('SELECT * FROM buses WHERE bus_code = ?', [busCode])
  if (!bus) throw Object.assign(new Error(`Unknown bus ${busCode}`), { status: 404 })

  const currentDriver = await sqlGet<Row>("SELECT * FROM users WHERE role = 'driver' AND bus_code = ?", [busCode])
  if (currentDriver && String(currentDriver.id) !== driverId) {
    await sqlRun('UPDATE users SET bus_code = NULL WHERE id = ?', [currentDriver.id])
  }

  if (!driverId) {
    await sqlRun("UPDATE buses SET driver_name = 'Unassigned' WHERE bus_code = ?", [busCode])
    return
  }

  const driver = await sqlGet<Row>('SELECT * FROM users WHERE id = ?', [driverId])
  if (!driver || driver.role !== 'driver') {
    throw Object.assign(new Error('Selected user is not a driver'), { status: 400 })
  }
  if (Number(driver.active) !== 1) {
    throw Object.assign(new Error('A suspended driver cannot be assigned'), { status: 409 })
  }

  const previousBus = driver.bus_code == null ? null : String(driver.bus_code)
  if (previousBus && previousBus !== busCode) {
    await sqlRun("UPDATE buses SET driver_name = 'Unassigned' WHERE bus_code = ?", [previousBus])
  }
  await sqlRun('UPDATE users SET bus_code = NULL WHERE bus_code = ? AND id <> ?', [busCode, driverId])
  await sqlRun('UPDATE users SET bus_code = ? WHERE id = ?', [busCode, driverId])
  await sqlRun('UPDATE buses SET driver_name = ? WHERE bus_code = ?', [driver.name, busCode])
}

export const adminRouter = Router()

adminRouter.get('/users', requireAuth, requireRole('admin'), ah(async (_req, res) => {
  const rows = await sqlAll<Row>("SELECT * FROM users WHERE id <> 'U-SYS' ORDER BY name")
  res.json({ users: rows.map(serializeUser) })
}))

adminRouter.post('/users', requireAuth, requireRole('admin'), ah(async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid user', details: parsed.error.flatten() })
    return
  }
  const input = parsed.data
  const username = input.username.toLowerCase()
  if (await sqlGet('SELECT id FROM users WHERE username = ?', [username])) {
    res.status(409).json({ error: `Username @${username} is already in use` })
    return
  }
  if (input.busCode && input.role !== 'driver') {
    res.status(400).json({ error: 'Only drivers can be assigned to a bus' })
    return
  }
  if (input.busCode && !(await sqlGet('SELECT bus_code FROM buses WHERE bus_code = ?', [input.busCode]))) {
    res.status(404).json({ error: `Unknown bus ${input.busCode}` })
    return
  }

  const id = `U-${crypto.randomBytes(5).toString('hex').toUpperCase()}`
  const now = nowIso()
  await withTransaction(async () => {
    await sqlRun(
      `INSERT INTO users (id, username, name, role, bus_code, password_hash, active, phone, created_at)
       VALUES (?, ?, ?, ?, NULL, ?, 1, ?, ?)`,
      [id, username, input.name, input.role, bcrypt.hashSync(input.password, 10), input.phone || null, now],
    )
    if (input.busCode) await assignDriver(input.busCode, id)
    await audit('user', id, 'created', { id: req.user!.id, name: req.user!.name }, {
      after: `${input.role} account @${username}${input.busCode ? ` assigned to ${input.busCode}` : ''}`,
    })
  })

  const row = (await sqlGet<Row>('SELECT * FROM users WHERE id = ?', [id]))!
  res.status(201).json({ user: serializeUser(row) })
}))

adminRouter.patch('/users/:id', requireAuth, requireRole('admin'), ah(async (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid user update', details: parsed.error.flatten() })
    return
  }
  const existing = await sqlGet<Row>('SELECT * FROM users WHERE id = ?', [req.params.id])
  if (!existing || existing.id === 'U-SYS') {
    res.status(404).json({ error: 'User not found' })
    return
  }
  const input = parsed.data
  if (input.status === 'suspended' && req.user!.id === req.params.id) {
    res.status(409).json({ error: 'You cannot suspend your own account' })
    return
  }
  const username = (input.username ?? String(existing.username)).toLowerCase()
  const duplicate = await sqlGet<Row>('SELECT id FROM users WHERE username = ? AND id <> ?', [username, req.params.id])
  if (duplicate) {
    res.status(409).json({ error: `Username @${username} is already in use` })
    return
  }
  if (input.busCode !== undefined && input.busCode !== null && existing.role !== 'driver') {
    res.status(400).json({ error: 'Only drivers can be assigned to a bus' })
    return
  }
  if (input.busCode && !(await sqlGet('SELECT bus_code FROM buses WHERE bus_code = ?', [input.busCode]))) {
    res.status(404).json({ error: `Unknown bus ${input.busCode}` })
    return
  }

  await withTransaction(async () => {
    await sqlRun(
      `UPDATE users SET username = ?, password_hash = ?, active = ?, phone = ? WHERE id = ?`,
      [
        username,
        input.password ? bcrypt.hashSync(input.password, 10) : existing.password_hash,
        input.status === undefined ? existing.active : input.status === 'active' ? 1 : 0,
        input.phone === undefined ? existing.phone : input.phone || null,
        req.params.id,
      ],
    )
    if (input.busCode !== undefined) {
      const oldBus = existing.bus_code == null ? null : String(existing.bus_code)
      if (oldBus && oldBus !== input.busCode) {
        await sqlRun("UPDATE buses SET driver_name = 'Unassigned' WHERE bus_code = ?", [oldBus])
      }
      if (input.busCode) await assignDriver(input.busCode, req.params.id)
      else await sqlRun('UPDATE users SET bus_code = NULL WHERE id = ?', [req.params.id])
    }
    await audit('user', req.params.id, 'updated', { id: req.user!.id, name: req.user!.name }, {
      before: `@${existing.username}; status=${Number(existing.active) ? 'active' : 'suspended'}; bus=${existing.bus_code ?? 'none'}`,
      after: `@${username}; status=${input.status ?? (Number(existing.active) ? 'active' : 'suspended')}; bus=${input.busCode === undefined ? existing.bus_code ?? 'none' : input.busCode ?? 'none'}${input.password ? '; password reset' : ''}`,
      reason: input.reason,
    })
  })

  const row = (await sqlGet<Row>('SELECT * FROM users WHERE id = ?', [req.params.id]))!
  res.json({ user: serializeUser(row) })
}))

adminRouter.post('/buses', requireAuth, requireRole('admin'), ah(async (req, res) => {
  const parsed = createBusSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid bus', details: parsed.error.flatten() })
    return
  }
  const input = parsed.data
  const busCode = input.busCode.toUpperCase()
  const registration = input.registration.toUpperCase()
  if (await sqlGet('SELECT bus_code FROM buses WHERE bus_code = ?', [busCode])) {
    res.status(409).json({ error: `Bus ${busCode} already exists` })
    return
  }
  if (await sqlGet('SELECT bus_code FROM buses WHERE reg_no = ?', [registration])) {
    res.status(409).json({ error: `Registration ${registration} already exists` })
    return
  }
  if (input.driverId) {
    const driver = await sqlGet<Row>('SELECT role, active FROM users WHERE id = ?', [input.driverId])
    if (!driver || driver.role !== 'driver') {
      res.status(400).json({ error: 'Selected user is not a driver' })
      return
    }
  }

  await withTransaction(async () => {
    await sqlRun(
      `INSERT INTO buses (bus_code, reg_no, tank_litres, fuel_type, seats, driver_name, gps_device, created_at)
       VALUES (?, ?, ?, ?, 50, 'Unassigned', ?, ?)`,
      [busCode, registration, input.tankLitres, input.fuelType, input.gpsDevice ?? `GPS-${busCode}`, nowIso()],
    )
    if (input.driverId) await assignDriver(busCode, input.driverId)
    await audit('bus', busCode, 'created', { id: req.user!.id, name: req.user!.name }, {
      after: `${registration}; ${input.tankLitres} L; ${input.fuelType}${input.driverId ? `; driver=${input.driverId}` : ''}`,
    })
  })

  const row = (await sqlGet<Row>('SELECT * FROM buses WHERE bus_code = ?', [busCode]))!
  res.status(201).json({ bus: serializeBus(row) })
}))

adminRouter.patch('/buses/:code/driver', requireAuth, requireRole('transport_manager', 'admin'), ah(async (req, res) => {
  const parsed = allocateSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid allocation', details: parsed.error.flatten() })
    return
  }
  const busCode = req.params.code.toUpperCase()
  const before = await sqlGet<Row>('SELECT * FROM buses WHERE bus_code = ?', [busCode])
  if (!before) {
    res.status(404).json({ error: 'Bus not found' })
    return
  }

  await withTransaction(async () => {
    await assignDriver(busCode, parsed.data.driverId)
    await audit('bus', busCode, 'bus_changed', { id: req.user!.id, name: req.user!.name }, {
      before: `driver=${before.driver_name}`,
      after: `driver=${parsed.data.driverId ?? 'unassigned'}`,
      reason: parsed.data.reason,
    })
  })

  const row = (await sqlGet<Row>('SELECT * FROM buses WHERE bus_code = ?', [busCode]))!
  res.json({ bus: serializeBus(row) })
}))
