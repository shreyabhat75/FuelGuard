import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import type { NextFunction, Request, RequestHandler, Response } from 'express'
import type { JwtPayload } from 'jsonwebtoken'
import { sqlGet, sqlRun } from './db'
import { env } from './env'
import { nowIso } from './time'
import { ah } from './asyncHandler'

export interface AuthUser {
  id: string
  username: string
  name: string
  role: 'driver' | 'transport_manager' | 'accountant' | 'principal' | 'admin'
  busCode: string | null
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

function signToken(user: AuthUser): string {
  return jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, {
    expiresIn: `${env.tokenTtlHours}h`,
  })
}

export const loginHandler = ah(async (req: Request, res: Response): Promise<void> => {
  const { username, password } = (req.body ?? {}) as { username?: string; password?: string }
  if (!username || !password) {
    res.status(400).json({ error: 'username and password are required' })
    return
  }
  const row = await sqlGet<{
    id: string
    username: string
    name: string
    role: AuthUser['role']
    bus_code: string | null
    password_hash: string
    active: number
  }>('SELECT id, username, name, role, bus_code, password_hash, active FROM users WHERE username = ?', [
    String(username),
  ])

  if (!row || !bcrypt.compareSync(String(password), row.password_hash)) {
    res.status(401).json({ error: 'Invalid username or password' })
    return
  }
  if (!row.active) {
    res.status(403).json({ error: 'This account is disabled' })
    return
  }
  const user: AuthUser = { id: row.id, username: row.username, name: row.name, role: row.role, busCode: row.bus_code }
  await sqlRun(
    "INSERT INTO audit_events (entity_type, entity_id, action, actor_id, actor_name, created_at) VALUES ('entry','login','viewed',?,?,?)",
    [user.id, user.name, nowIso()],
  )
  res.json({ token: signToken(user), user })
})

const requireAuthInner = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : undefined
  if (!token) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }
  try {
    const payload = jwt.verify(token, env.jwtSecret) as JwtPayload
    const row = await sqlGet<{
      id: string
      username: string
      name: string
      role: AuthUser['role']
      bus_code: string | null
      active: number
    }>('SELECT id, username, name, role, bus_code, active FROM users WHERE id = ?', [payload.sub as string])
    if (!row || !row.active) {
      res.status(401).json({ error: 'Account no longer active' })
      return
    }
    req.user = { id: row.id, username: row.username, name: row.name, role: row.role, busCode: row.bus_code }
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

export const requireAuth: RequestHandler = (req, res, next) => {
  requireAuthInner(req, res, next).catch(next)
}

const OFFICE = ['transport_manager', 'accountant', 'principal', 'admin'] as const

/** Role gate. Admin passes every office gate. */
export function requireRole(...allowed: readonly (typeof OFFICE[number] | 'driver')[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user
    if (!user) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }
    const ok = allowed.includes(user.role) || (user.role === 'admin' && allowed.some((r) => (OFFICE as readonly string[]).includes(r)))
    if (!ok) {
      res.status(403).json({ error: `Requires role: ${allowed.join(' or ')}` })
      return
    }
    next()
  }
}
