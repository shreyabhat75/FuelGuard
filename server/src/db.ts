import Database from 'better-sqlite3'
import { env } from './env'
import { MIGRATIONS } from './migrations'

export const db = new Database(env.dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

export function migrate() {
  const current = db.pragma('user_version', { simple: true }) as number
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue
    const run = db.transaction(() => {
      db.exec(m.sql)
      db.pragma(`user_version = ${m.version}`)
    })
    run()
    console.log(`[db] applied migration v${m.version} (${m.name})`)
  }
}
