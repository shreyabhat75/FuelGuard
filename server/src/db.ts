/**
 * Unified async database layer.
 *
 * Primary engine: PostgreSQL (DATABASE_URL). If PostgreSQL is unreachable at
 * boot and DB_DRIVER=auto, the server falls back to SQLite (DB_PATH) with the
 * identical schema. Every query is written with `?` placeholders; the adapter
 * translates them to `$1..$n` for PostgreSQL, and normalises COUNT(*) to int.
 */
import Database from 'better-sqlite3'
import pg from 'pg'
import { env } from './env'
import { MIGRATIONS, type Dialect } from './migrations'

export type { Dialect }

export let dialect: Dialect = 'sqlite'
export let sqliteDb: Database.Database | null = null
export let pgClient: pg.Client | null = null
export let dbFallback = false

/** Boot-time engine selection. Forced modes never silently change. Idempotent. */
export async function connectDb(): Promise<Dialect> {
  if (sqliteDb || pgClient) return dialect
  if (env.dbDriver !== 'sqlite') {
    const masked = env.databaseUrl.replace(/:[^:@/]+@/, ':***@')
    const client = new pg.Client({ connectionString: env.databaseUrl, connectionTimeoutMillis: 4000 })
    try {
      await client.connect()
      pgClient = client
      dialect = 'postgres'
      console.log(`[db] PostgreSQL connected (${masked})`)
      return dialect
    } catch (e) {
      try {
        await client.end()
      } catch {
        /* ignore */
      }
      if (env.dbDriver === 'postgres') {
        throw new Error(`DB_DRIVER=postgres but PostgreSQL is unreachable: ${(e as Error).message}`)
      }
      dbFallback = true
      console.warn(`[db] PostgreSQL unreachable (${(e as Error).message}) — falling back to SQLite at ${env.dbPath}`)
    }
  }
  dialect = 'sqlite'
  sqliteDb = new Database(env.dbPath)
  sqliteDb.pragma('journal_mode = WAL')
  sqliteDb.pragma('foreign_keys = ON')
  console.log(`[db] SQLite opened at ${env.dbPath}`)
  return dialect
}

function translateSql(sql: string): string {
  if (dialect === 'sqlite') return sql
  let i = 0
  return sql
    .replace(/COUNT\s*\(\s*\*\s*\)/g, 'COUNT(*)::int')
    .replace(/\?/g, () => `$${++i}`)
}

export async function sqlAll<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  if (dialect === 'postgres') {
    const r = await pgClient!.query(translateSql(sql), params)
    return r.rows as T[]
  }
  return sqliteDb!.prepare(sql).all(...params) as T[]
}

export async function sqlGet<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  if (dialect === 'postgres') {
    const r = await pgClient!.query(translateSql(sql), params)
    return (r.rows[0] ?? undefined) as T | undefined
  }
  return sqliteDb!.prepare(sql).get(...params) as T | undefined
}

export async function sqlRun(sql: string, params: unknown[] = []): Promise<{ changes: number }> {
  if (dialect === 'postgres') {
    const r = await pgClient!.query(translateSql(sql), params)
    return { changes: r.rowCount ?? 0 }
  }
  const r = sqliteDb!.prepare(sql).run(...params)
  return { changes: r.changes }
}

/** Multi-statement DDL / scripts (no parameters). */
export async function sqlExec(sql: string): Promise<void> {
  if (dialect === 'postgres') {
    await pgClient!.query(sql)
    return
  }
  sqliteDb!.exec(sql)
}

let txChain: Promise<unknown> = Promise.resolve()

/**
 * Serialized transactions on the single connection (same concurrency model as
 * better-sqlite3). Only used for multi-write sequences; statements inside run
 * on the transaction's connection.
 */
export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  const task = txChain.catch(() => undefined).then(async () => {
    if (dialect === 'postgres') {
      await pgClient!.query('BEGIN')
      try {
        const out = await fn()
        await pgClient!.query('COMMIT')
        return out
      } catch (e) {
        try {
          await pgClient!.query('ROLLBACK')
        } catch {
          /* connection already broken */
        }
        throw e
      }
    }
    sqliteDb!.exec('BEGIN')
    try {
      const out = await fn()
      sqliteDb!.exec('COMMIT')
      return out
    } catch (e) {
      try {
        sqliteDb!.exec('ROLLBACK')
      } catch {
        /* ignore */
      }
      throw e
    }
  })
  txChain = task.catch(() => undefined)
  return task as Promise<T>
}

export async function migrate(): Promise<void> {
  if (dialect === 'postgres') {
    await pgClient!.query(
      'CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)',
    )
    const r = await pgClient!.query('SELECT version FROM _migrations')
    const applied = new Set(r.rows.map((x: Record<string, unknown>) => Number(x.version)))
    for (const m of MIGRATIONS) {
      if (applied.has(m.version)) continue
      await pgClient!.query('BEGIN')
      try {
        await pgClient!.query(m.sql('postgres'))
        await pgClient!.query('INSERT INTO _migrations (version, name, applied_at) VALUES ($1, $2, $3)', [
          m.version,
          m.name,
          new Date().toISOString(),
        ])
        await pgClient!.query('COMMIT')
      } catch (e) {
        try {
          await pgClient!.query('ROLLBACK')
        } catch {
          /* ignore */
        }
        throw e
      }
      console.log(`[db] applied migration v${m.version} (${m.name}) [postgres]`)
    }
    return
  }
  const current = sqliteDb!.pragma('user_version', { simple: true }) as number
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue
    sqliteDb!.transaction(() => {
      sqliteDb!.exec(m.sql('sqlite'))
      sqliteDb!.pragma(`user_version = ${m.version}`)
    })()
    console.log(`[db] applied migration v${m.version} (${m.name}) [sqlite]`)
  }
}

/** Batched idempotent insert helper (identical dialect SQL: ON CONFLICT DO NOTHING). */
export async function bulkInsert(table: string, cols: string[], rows: unknown[][], batchSize = 250): Promise<number> {
  let n = 0
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize)
    const valuesSql = chunk.map(() => `(${cols.map(() => '?').join(',')})`).join(',')
    const r = await sqlRun(
      `INSERT INTO ${table} (${cols.join(',')}) VALUES ${valuesSql} ON CONFLICT DO NOTHING`,
      chunk.flat(),
    )
    n += r.changes
  }
  return n
}
