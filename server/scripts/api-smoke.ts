/**
 * End-to-end API smoke test.
 * Boots a throwaway server instance (fresh SQLite DB) and exercises:
 * auth + RBAC, fuel entry creation with detection rules, offline-sync
 * idempotency, private evidence upload/serve, statement import + reconciliation,
 * flag review/escalation, maker-checker approvals, corrections, audit, GPS path.
 *
 * Run: npm run smoke   (from server/)
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const serverRoot = path.resolve(here, '..')
const repoRoot = path.resolve(serverRoot, '..')

const PORT = 4010
const BASE = `http://localhost:${PORT}/api`
const DB_FILE = path.join(repoRoot, 'server/data/smoke.db')
const UPLOAD_DIR = path.join(repoRoot, 'server/uploads-smoke')

for (const f of [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`]) {
  if (fs.existsSync(f)) fs.rmSync(f, { force: true })
}
if (fs.existsSync(UPLOAD_DIR)) fs.rmSync(UPLOAD_DIR, { recursive: true, force: true })

let pass = 0
let fail = 0
function ok(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

interface Res {
  status: number
  body: any
}
async function http(method: string, url: string, opts: { token?: string; json?: unknown; form?: FormData } = {}): Promise<Res> {
  const headers: Record<string, string> = {}
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`
  let body: BodyInit | undefined
  if (opts.form) body = opts.form
  else if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.json)
  }
  const res = await fetch(`${BASE}${url}`, { method, headers, body })
  let parsed: unknown
  try {
    parsed = await res.json()
  } catch {
    parsed = null
  }
  return { status: res.status, body: parsed }
}

const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

async function main() {
  console.log('[smoke] booting throwaway server on port', PORT)
  const child = spawn('node', ['--import', 'tsx', 'src/index.ts'], {
    cwd: serverRoot,
    env: {
      ...process.env,
      PORT: String(PORT),
      JWT_SECRET: 'smoke-test-secret',
      DB_DRIVER: 'sqlite',
      DB_PATH: 'server/data/smoke.db',
      UPLOAD_DIR: 'server/uploads-smoke',
      CORS_ORIGIN: '*',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout!.on('data', (d) => process.stdout.write(`[srv] ${d}`))
  child.stderr!.on('data', (d) => process.stderr.write(`[srv:err] ${d}`))

  try {
    // wait for boot
    let up = false
    for (let i = 0; i < 40; i++) {
      try {
        const r = await fetch(`${BASE}/health`)
        if (r.ok) {
          up = true
          break
        }
      } catch {
        await new Promise((r) => setTimeout(r, 500))
      }
    }
    if (!up) throw new Error('server did not boot in time')
    console.log('[smoke] server up\n')

    console.log('1. Health & auth')
    const health = await http('GET', '/health')
    ok('health is public', health.status === 200 && health.body.ok === true)
    const seededCounts = health.body.counts
    ok('all five demo accounts are active', seededCounts.activeUsers === 5, JSON.stringify(seededCounts))
    ok(
      'historical data seeded (112 entries / 82 statement lines / 9 flags)',
      seededCounts.entries === 112 && seededCounts.statementLines === 82 && seededCounts.flags === 9,
      JSON.stringify(seededCounts),
    )
    const unauth = await http('GET', '/buses')
    ok('unauthenticated request rejected (401)', unauth.status === 401)
    const badLogin = await http('POST', '/auth/login', { json: { username: 'driver', password: 'wrong' } })
    ok('wrong password rejected (401)', badLogin.status === 401)

    const tokens: Record<string, string> = {}
    for (const [username, label] of Object.entries({
      driver: 'driver',
      manager: 'manager',
      accountant: 'accountant',
      principal: 'principal',
      admin: 'admin',
    })) {
      const r = await http('POST', '/auth/login', { json: { username, password: 'demo123' } })
      ok(`login ${label}`, r.status === 200 && r.body.token && r.body.user?.role, JSON.stringify(r.body).slice(0, 120))
      tokens[label] = r.body.token
    }
    const me = await http('GET', '/auth/me', { token: tokens.driver })
    ok('auth/me returns the token user', me.status === 200 && me.body.user?.username === 'driver')

    console.log('2. Role scoping')
    const driverBuses = await http('GET', '/buses', { token: tokens.driver })
    ok('driver sees only own bus (VB-07)', driverBuses.status === 200 && driverBuses.body.buses.length === 1 && driverBuses.body.buses[0].busCode === 'VB-07')
    const managerBuses = await http('GET', '/buses', { token: tokens.manager })
    ok('manager sees all 8 buses', managerBuses.status === 200 && managerBuses.body.buses.length === 8)
    const driverEntries = await http('GET', '/fuel-entries', { token: tokens.driver })
    ok(
      'driver entries scoped to VB-07',
      driverEntries.status === 200 && driverEntries.body.entries.length > 0 && driverEntries.body.entries.every((e: any) => e.busId === 'VB-07'),
      `got ${driverEntries.body?.entries?.length ?? 0}`,
    )
    const managerEntries = await http('GET', '/fuel-entries', { token: tokens.manager })
    ok('manager sees all 112 register entries', managerEntries.status === 200 && managerEntries.body.total === 112, `total ${managerEntries.body?.total}`)
    const busInfo = managerBuses.body.buses.find((b: any) => b.busCode === 'VB-01')
    ok('bus shape matches contract (registration/tank)', busInfo?.registration === 'KA 99 VB 1001' && busInfo?.tankLitres === 180)
    const qr = await http('GET', '/buses/VB-07/qr', { token: tokens.driver })
    ok('QR payload contract', qr.status === 200 && qr.body.qrPayload === 'vpc-fleetfuel:bus:VB-07')

    console.log('3. Fuel entry creation + detection rules')
    const form = new FormData()
    form.append('busCode', 'VB-07')
    form.append('timestampClient', '2026-11-14T09:40:00+05:30')
    form.append('litres', '45')
    form.append('amount', '4012.4')
    form.append('fuelType', 'diesel')
    form.append('odometerKm', '52980')
    form.append('paidBy', 'driver')
    form.append('paymentMode', 'cash')
    form.append('pumpName', 'Highway Fuel Point')
    form.append('locationNote', 'denied')
    form.append('clientRef', 'draft-smoke-0001')
    const png = Buffer.from(PNG_B64, 'base64')
    form.append('odometerPhoto', new Blob([png], { type: 'image/png' }), 'odometer.png')
    const created = await http('POST', '/fuel-entries', { token: tokens.driver, form })
    if (!created.body.entry) throw new Error(`entry creation failed: ${JSON.stringify(created.body)}`)
    ok('entry created (201) even with rule hits', created.status === 201 && created.body.entry?.id?.startsWith('E-'), JSON.stringify(created.body).slice(0, 200))
    const savedEntry = created.body.entry
    ok(
      'rule hits persisted: RECEIPT_MISSING + LOCATION_UNAVAILABLE (odometer photo present)',
      Array.isArray(created.body.ruleHits) &&
        created.body.ruleHits.some((h: any) => h.code === 'RECEIPT_MISSING') &&
        created.body.ruleHits.some((h: any) => h.code === 'LOCATION_UNAVAILABLE') &&
        !created.body.ruleHits.some((h: any) => h.code === 'ODOMETER_PHOTO_MISSING'),
      JSON.stringify(created.body.ruleHits?.map((h: any) => h.code)),
    )
    ok('entry marked needs_review when rules fire', savedEntry.status === 'needs_review')
    ok('server timestamp assigned', Boolean(savedEntry.timestampServer))
    ok('evidence attached via multipart', savedEntry.odometerPhoto?.url?.includes('/evidence/'))

    const evFile = await http('GET', savedEntry.odometerPhoto.url, { token: tokens.driver })
    ok('evidence file served privately with auth', evFile.status === 200)
    const evFileAnon = await fetch(`${BASE}${savedEntry.odometerPhoto.url}`)
    ok('evidence blocked without auth (401)', evFileAnon.status === 401)

    const replay = new FormData()
    replay.append('busCode', 'VB-07')
    replay.append('timestampClient', '2026-11-14T09:40:00+05:30')
    replay.append('litres', '45')
    replay.append('amount', '4012.4')
    replay.append('fuelType', 'diesel')
    replay.append('odometerKm', '52980')
    replay.append('paidBy', 'driver')
    replay.append('paymentMode', 'cash')
    replay.append('pumpName', 'Highway Fuel Point')
    replay.append('clientRef', 'draft-smoke-0001')
    const dup = await http('POST', '/fuel-entries', { token: tokens.driver, form: replay })
    ok('offline sync idempotent (same clientRef → same entry, 200)', dup.status === 200 && dup.body.duplicate === true && dup.body.entry.id === savedEntry.id, `status ${dup.status}`)

    const wrongBus = new FormData()
    wrongBus.append('busCode', 'VB-03')
    wrongBus.append('timestampClient', '2026-11-14T10:00:00+05:30')
    wrongBus.append('litres', '30')
    wrongBus.append('amount', '2679.6')
    wrongBus.append('fuelType', 'diesel')
    wrongBus.append('odometerKm', '12000')
    wrongBus.append('paidBy', 'driver')
    wrongBus.append('paymentMode', 'cash')
    wrongBus.append('pumpName', 'Highway Fuel Point')
    const wrongBusRes = await http('POST', '/fuel-entries', { token: tokens.driver, form: wrongBus })
    ok('driver blocked from another bus (403)', wrongBusRes.status === 403)

    console.log('4. RBAC denials (server-side, not hidden buttons)')
    const driverFlags = await http('GET', '/flags', { token: tokens.driver })
    ok('driver cannot list flags (403)', driverFlags.status === 403)
    const driverRecon = await http('GET', '/reconciliation', { token: tokens.driver })
    ok('driver cannot view reconciliation (403)', driverRecon.status === 403)
    const accountantReview = await http('POST', '/flags/FLG-01/review', { token: tokens.accountant, json: { status: 'under_review', reason: 'attempting' } })
    ok('accountant cannot change flag status (403)', accountantReview.status === 403)
    const managerDecision = await http('POST', '/approvals/APR-01/decision', { token: tokens.manager, json: { decision: 'approved', reason: 'self attempt' } })
    ok('manager cannot decide approvals (403 role)', managerDecision.status === 403)

    console.log('5. Reconciliation')
    const recon = await http('GET', '/reconciliation', { token: tokens.accountant })
    const byStatus: Record<string, number> = {}
    for (const r of recon.body.reconciliation) byStatus[r.matchStatus] = (byStatus[r.matchStatus] ?? 0) + 1
    ok(
      'reconciliation categories match seeded findings',
      byStatus.matched === 75 && byStatus.rate_mismatch === 3 && byStatus.amount_mismatch === 1 && byStatus.register_missing === 1 && byStatus.unmatched_pump_bill === 1 && byStatus.possible_duplicate === 1,
      JSON.stringify(byStatus),
    )
    const seededReview = recon.body.reconciliation.find((r: any) => r.statementLineId === 'SLF/72152')
    ok('seeded reviewer decision preserved', seededReview?.reviewerDecision === 'needs_supplier_clarification')

    const csvPath = path.join(repoRoot, 'intern_pack/intern_pack/pump_statement_shree_lakshmi.csv')
    const stmtForm = new FormData()
    stmtForm.append('file', new Blob([fs.readFileSync(csvPath)], { type: 'text/csv' }), 'pump_statement_shree_lakshmi.csv')
    const stmtImport = await http('POST', '/statements/import', { token: tokens.accountant, form: stmtForm })
    ok('statement import returns 82 lines + category summary', stmtImport.status === 201 && stmtImport.body.lineCount === 82 && stmtImport.body.summary?.matched === 75, JSON.stringify(stmtImport.body?.summary))

    const driverUpload = await http('POST', '/statements/import', { token: tokens.driver, form: stmtForm })
    ok('driver cannot import statements (403)', driverUpload.status === 403)

    const decision = await http('POST', '/reconciliation/decision', {
      token: tokens.accountant,
      json: { billNo: 'SLF/71185', decision: 'needs_supplier_clarification', note: 'Payment ledger pending; bill shows ₹9,001.69 vs register ₹10,251.69.' },
    })
    ok('accountant can record reconciliation decision with mandatory note', decision.status === 200 && decision.body.result?.reviewerDecision === 'needs_supplier_clarification')
    const badDecision = await http('POST', '/reconciliation/decision', { token: tokens.accountant, json: { billNo: 'SLF/71185', decision: 'resolved', note: 'x' } })
    ok('short reviewer note rejected (400)', badDecision.status === 400)

    console.log('6. Flags: review → escalate → principal decision')
    const flagsList = await http('GET', '/flags?status=needs_review', { token: tokens.manager })
    ok('manager lists open flags (9 seeded + new)', flagsList.status === 200 && flagsList.body.flags.length >= 9, `got ${flagsList.body?.flags?.length}`)
    const underReview = await http('POST', '/flags/FLG-01/review', { token: tokens.manager, json: { status: 'under_review', reason: 'Requested September rate card from Shree Lakshmi Fuels.' } })
    ok('manager sets flag under_review (mandatory note)', underReview.status === 200 && underReview.body.flag?.status === 'under_review')
    const escalate = await http('POST', '/flags/FLG-01/review', { token: tokens.manager, json: { status: 'escalated', reason: '₹1,616 premium needs a principal decision on the debit note.' } })
    ok('escalation creates an approval', escalate.status === 200 && escalate.body.flag?.status === 'escalated' && Boolean(escalate.body.approvalId), JSON.stringify(escalate.body).slice(0, 160))
    const escalatedApprovalId = escalate.body.approvalId as string

    const principalApprovals = await http('GET', '/approvals', { token: tokens.principal })
    ok(
      'principal sees pending approvals (3 seeded + 1 escalated)',
      principalApprovals.status === 200 && principalApprovals.body.approvals.filter((a: any) => a.decision === 'pending').length >= 4,
      `pending ${principalApprovals.body?.approvals?.filter((a: any) => a.decision === 'pending')?.length}`,
    )
    const decided = await http('POST', `/approvals/${escalatedApprovalId}/decision`, { token: tokens.principal, json: { decision: 'approved', reason: 'Raise debit note with the pump; recovery to be tracked by office.' } })
    ok('principal approves with mandatory reason', decided.status === 200 && decided.body.approval?.decision === 'approved')
    const flagAfter = await http('GET', '/flags/FLG-01', { token: tokens.manager })
    ok('approved escalation resolves the flag', flagAfter.body.flag?.status === 'resolved' && flagAfter.body.flag?.resolvedByName === 'Dr. Suresh Rao')
    const reDecide = await http('POST', `/approvals/${escalatedApprovalId}/decision`, { token: tokens.principal, json: { decision: 'rejected', reason: 'double decision attempt' } })
    ok('double decision blocked (409)', reDecide.status === 409)

    console.log('7. Maker-checker: submitter cannot decide own claim')
    const adminEscalate = await http('POST', '/approvals', { token: tokens.admin, json: { flagId: 'FLG-05', reviewNotes: 'Admin escalation test for tank capacity case.' } })
    ok('admin can escalate a flag', adminEscalate.status === 201 && Boolean(adminEscalate.body.approval?.id), JSON.stringify(adminEscalate.body).slice(0, 160))
    const selfDecision = await http('POST', `/approvals/${adminEscalate.body.approval.id}/decision`, { token: tokens.admin, json: { decision: 'approved', reason: 'trying to approve own submission' } })
    ok('self-approval blocked (403 maker-checker)', selfDecision.status === 403, JSON.stringify(selfDecision.body))
    const principalDecideAdmin = await http('POST', `/approvals/${adminEscalate.body.approval.id}/decision`, { token: tokens.principal, json: { decision: 'rejected', reason: 'Tank spec must be verified with the workshop first.' } })
    ok('principal can reject (flag → rejected)', principalDecideAdmin.status === 200)

    console.log('8. Corrections (no hard delete, preserve history)')
    const correction = await http('POST', '/fuel-entries/F0052/corrections', {
      token: tokens.manager,
      json: { field: 'amount', proposedValue: 9001.69, reason: 'Pump bill SLF/71185 and the printed receipt both state ₹9,001.69.' },
    })
    ok('manager proposes correction (append-only)', correction.status === 201 && correction.body.correction?.status === 'pending')
    const corrEscalate = await http('POST', '/approvals', { token: tokens.manager, json: { correctionId: correction.body.correction.id, reviewNotes: 'Ledger confirms the pump figure; requesting approval to correct the register.' } })
    ok('correction escalated to principal', corrEscalate.status === 201)
    const corrDecision = await http('POST', `/approvals/${corrEscalate.body.approval.id}/decision`, { token: tokens.principal, json: { decision: 'approved', reason: 'Receipt and ledger agree; correct the register entry.' } })
    ok('principal approves correction', corrDecision.status === 200 && corrDecision.body.approval?.decision === 'approved')
    const entryAfter = await http('GET', '/fuel-entries/F0052', { token: tokens.manager })
    ok('entry updated via approved correction (history preserved in audit)', entryAfter.body.entry?.amount === 9001.69 && entryAfter.body.timeline?.length >= 2, `amount ${entryAfter.body?.entry?.amount}`)

    console.log('9. GPS evidence + dashboard + audit')
    const gpsParams = new URLSearchParams({ from: '2026-09-30 10:17', to: '2026-10-02 11:05' })
    const path08 = await http('GET', `/buses/VB-08/path?${gpsParams}`, { token: tokens.manager })
    ok(
      'GPS path between fills computed (F0071 → F0111 ≈ 172.7 km, 171 pings)',
      path08.status === 200 && path08.body.pingCount === 171 && path08.body.pathKm > 171 && path08.body.pathKm < 173.5,
      `pathKm ${path08.body?.pathKm}, pings ${path08.body?.pingCount}`,
    )
    const dashboard = await http('GET', '/dashboard', { token: tokens.principal })
    ok(
      'dashboard aggregates (≥112 entries, reconciliation summary present)',
      dashboard.status === 200 && dashboard.body.totals?.entries >= 112 && Boolean(dashboard.body.reconciliation),
      JSON.stringify(dashboard.body?.totals),
    )
    const auditEvents = await http('GET', '/audit?entityType=flag', { token: tokens.accountant })
    ok(
      'audit trail records flag lifecycle',
      auditEvents.status === 200 && auditEvents.body.events.length > 0 && auditEvents.body.events.some((e: any) => e.action === 'status_changed' && e.entityId === 'FLG-01'),
      `events ${auditEvents.body?.events?.length}`,
    )
    const bootstrap = await http('GET', '/bootstrap', { token: tokens.manager })
    ok(
      'bootstrap returns full office snapshot',
      bootstrap.status === 200 && bootstrap.body.entries?.length >= 112 && bootstrap.body.flags?.length >= 9 && bootstrap.body.statementLines?.length === 82 && bootstrap.body.reconciliation?.length === 82,
      JSON.stringify({ e: bootstrap.body?.entries?.length, f: bootstrap.body?.flags?.length }),
    )
    const driverBootstrap = await http('GET', '/bootstrap', { token: tokens.driver })
    ok(
      'driver bootstrap is scoped (own bus only)',
      driverBootstrap.status === 200 && driverBootstrap.body.entries?.every((e: any) => e.busId === 'VB-07') && driverBootstrap.body.flags?.length === 0,
    )
  } finally {
    child.kill()
  }

  console.log(`\n[smoke] ${pass} passed, ${fail} failed`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error('[smoke] fatal:', e)
  process.exit(1)
})
