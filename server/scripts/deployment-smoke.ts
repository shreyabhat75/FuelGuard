/**
 * Read-only smoke test for a running deployment.
 *
 * PowerShell:
 *   $env:API_URL='https://fleetfuel-guard-api.onrender.com/api'; npm run smoke:deployment
 */

const rawBase = (process.env.API_URL ?? 'http://localhost:4000/api').replace(/\/+$/, '')
const base = /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`
const password = process.env.DEMO_PASSWORD ?? 'demo123'
const transient = new Set([502, 503, 504])

const accounts = [
  ['driver', 'driver'],
  ['manager', 'transport_manager'],
  ['accountant', 'accountant'],
  ['principal', 'principal'],
  ['admin', 'admin'],
] as const

async function request(path: string, init?: RequestInit): Promise<Response> {
  let lastError: unknown
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const response = await fetch(`${base}${path}`, init)
      if (!transient.has(response.status) || attempt === 5) return response
    } catch (error) {
      lastError = error
      if (attempt === 5) throw error
    }
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)))
  }
  throw lastError ?? new Error('Deployment did not respond')
}

async function json<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string }
  if (!response.ok) throw new Error(`${response.status}: ${body.error ?? 'request failed'}`)
  return body
}

async function main() {
  const health = await json<{ ok: boolean; db: string; counts: { activeUsers: number } }>(await request('/health'))
  if (!health.ok || health.db !== 'postgres' || health.counts.activeUsers < accounts.length) {
    throw new Error(`Unhealthy deployment: ${JSON.stringify(health)}`)
  }
  console.log(`health OK: db=${health.db}, activeUsers=${health.counts.activeUsers}`)

  let adminToken = ''
  for (const [username, expectedRole] of accounts) {
    const login = await json<{ token: string; user: { id: string; role: string } }>(
      await request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      }),
    )
    if (!login.token || login.user.role !== expectedRole) {
      throw new Error(`${username}: unexpected login response`)
    }
    if (username === 'admin') adminToken = login.token
    const headers = { Authorization: `Bearer ${login.token}` }
    const me = await json<{ user: { id: string } }>(await request('/auth/me', { headers }))
    const bootstrap = await json<{ user: { id: string }; entries: unknown[] }>(await request('/bootstrap', { headers }))
    if (me.user.id !== login.user.id || bootstrap.user.id !== login.user.id || !Array.isArray(bootstrap.entries)) {
      throw new Error(`${username}: authenticated session is inconsistent`)
    }
    console.log(`${username} OK: role=${expectedRole}, entries=${bootstrap.entries.length}`)
  }

  const directory = await json<{ users: unknown[] }>(
    await request('/users', { headers: { Authorization: `Bearer ${adminToken}` } }),
  )
  if (directory.users.length < accounts.length) throw new Error('Admin user directory is incomplete')
  console.log(`admin directory OK: users=${directory.users.length}`)

  console.log(`deployment smoke passed: ${accounts.length} accounts`)
}

main().catch((error) => {
  console.error('deployment smoke failed:', error)
  process.exit(1)
})
