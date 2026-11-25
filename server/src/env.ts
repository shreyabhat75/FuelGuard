import path from 'node:path'
import fs from 'node:fs'

const resolve = (p: string, fallback: string) => {
  const v = process.env[p]
  return v && v.trim() ? v.trim() : fallback
}

const origin = (value: string) => {
  const trimmed = value.trim().replace(/\/$/, '')
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

// All documented commands run from either the repository root or server/.
// Avoid import.meta.url here because the production build is a CommonJS bundle.
const cwd = process.cwd()
const repoRoot = path.basename(cwd).toLowerCase() === 'server' ? path.dirname(cwd) : cwd

/**
 * Minimal .env loader: reads `server/.env` (gitignored) and fills process.env
 * for keys not already set — real environment variables always win. No dotenv
 * dependency needed; secrets therefore never live in code or the repo.
 */
const envFile = path.join(repoRoot, 'server', '.env')
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
  }
}

const nodeEnv = resolve('NODE_ENV', 'development')
const corsValues = [resolve('CORS_ORIGIN', 'http://localhost:5173'), process.env.CORS_ORIGIN_FALLBACK]
  .filter((value): value is string => Boolean(value?.trim()))
const corsOrigins = corsValues.some((value) => value.trim() === '*')
  ? '*'
  : [...new Set(corsValues.flatMap((value) => value.split(',').map(origin)))]

export const env = {
  port: Number(resolve('PORT', '4000')),
  jwtSecret: resolve('JWT_SECRET', 'dev-only-secret-change-me'),
  /** Primary: PostgreSQL. DB_DRIVER=auto → fall back to SQLite when PG is unreachable.
   *  Credentials come from DATABASE_URL (set in server/.env, gitignored) — never in code. */
  databaseUrl: resolve('DATABASE_URL', 'postgresql://postgres@localhost:5433/FuelGuard'),
  dbDriver: resolve('DB_DRIVER', 'auto') as 'auto' | 'postgres' | 'sqlite',
  dbPath: path.resolve(repoRoot, resolve('DB_PATH', 'server/data/fleetfuel.db')),
  uploadDir: path.resolve(repoRoot, resolve('UPLOAD_DIR', 'server/uploads')),
  dataDir: path.resolve(repoRoot, resolve('DATA_DIR', 'intern_pack/intern_pack')),
  // Render service references expose a bare hostname; normalise it to an HTTPS origin.
  corsOrigins,
  tokenTtlHours: Number(resolve('TOKEN_TTL_HOURS', '12')),
  nodeEnv,
  isDev: nodeEnv !== 'production',
}

if (env.isDev && env.jwtSecret === 'dev-only-secret-change-me') {
  console.warn('[env] JWT_SECRET not set — using development-only default. Set it in production.')
}

fs.mkdirSync(path.dirname(env.dbPath), { recursive: true })
fs.mkdirSync(env.uploadDir, { recursive: true })
