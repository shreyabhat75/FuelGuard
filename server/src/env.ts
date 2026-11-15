import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const resolve = (p: string, fallback: string) => {
  const v = process.env[p]
  return v && v.trim() ? v.trim() : fallback
}

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..')

export const env = {
  port: Number(resolve('PORT', '4000')),
  jwtSecret: resolve('JWT_SECRET', 'dev-only-secret-change-me'),
  /** Primary: PostgreSQL. DB_DRIVER=auto → fall back to SQLite when PG is unreachable. */
  databaseUrl: resolve('DATABASE_URL', 'postgresql://postgres:Shreya@localhost:5433/FuelGuard'),
  dbDriver: resolve('DB_DRIVER', 'auto') as 'auto' | 'postgres' | 'sqlite',
  dbPath: path.resolve(repoRoot, resolve('DB_PATH', 'server/data/fleetfuel.db')),
  uploadDir: path.resolve(repoRoot, resolve('UPLOAD_DIR', 'server/uploads')),
  dataDir: path.resolve(repoRoot, resolve('DATA_DIR', 'intern_pack/intern_pack')),
  corsOrigins: resolve('CORS_ORIGIN', 'http://localhost:5173').split(',').map((s) => s.trim()),
  tokenTtlHours: Number(resolve('TOKEN_TTL_HOURS', '12')),
  isDev: resolve('NODE_ENV', 'development') !== 'production',
}

if (env.isDev && env.jwtSecret === 'dev-only-secret-change-me') {
  console.warn('[env] JWT_SECRET not set — using development-only default. Set it in production.')
}

fs.mkdirSync(path.dirname(env.dbPath), { recursive: true })
fs.mkdirSync(env.uploadDir, { recursive: true })
