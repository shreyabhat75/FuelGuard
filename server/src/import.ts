/**
 * Idempotent import of all seven supplied CSVs + seed of demo accounts,
 * seeded investigation cases (findings), reviewer decisions and audit trail.
 * Every write uses a natural unique key with ON CONFLICT DO NOTHING / upsert,
 * so re-running this never duplicates rows — on either engine.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import bcrypt from 'bcryptjs'
import { env } from './env'
import { bulkInsert, connectDb, dialect, migrate, sqlGet, sqlRun, withTransaction } from './db'
import { csvObjects, normaliseDdMmYyyy, num } from './csv'
import { nowIso } from './time'

type Row = Record<string, string>

function readCsv(name: string): Row[] {
  const p = path.join(env.dataDir, name)
  if (!fs.existsSync(p)) {
    console.warn(`[import] missing data file: ${p}`)
    return []
  }
  return csvObjects(fs.readFileSync(p, 'utf8'))
}

const normRegisterTs = (ts: string): string => {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?$/.exec(ts.trim())
  if (!m) return ts.trim()
  return `${m[1]} ${m[2]}:${m[3] ?? '00'}`
}

export async function importBuses(): Promise<number> {
  const rows = readCsv('buses.csv')
  const now = nowIso()
  return bulkInsert(
    'buses',
    ['bus_code', 'reg_no', 'tank_litres', 'fuel_type', 'seats', 'driver_name', 'gps_device', 'created_at'],
    rows.map((r) => [
      r.bus_code,
      r.reg_no,
      num(r.tank_litres, 0),
      r.fuel_type || 'diesel',
      num(r.seats, 0),
      r.driver_name,
      r.gps_device,
      now,
    ]),
  )
}

const DEMO_PASSWORD = 'demo123'

export async function seedUsers(): Promise<void> {
  const hash = bcrypt.hashSync(DEMO_PASSWORD, 10)
  const systemHash = bcrypt.hashSync(bcrypt.genSaltSync(12), 10) // not login-able
  const users: [string, string, string, string, string | null, string, number][] = [
    ['U-SYS', 'system', 'Import System', 'admin', null, systemHash, 0],
    ['U-DRV-07', 'driver', 'Hanumanthappa G', 'driver', 'VB-07', hash, 1],
    ['U-TM', 'manager', 'Ravi S', 'transport_manager', null, hash, 1],
    ['U-ACC', 'accountant', 'Lakshmi Devi', 'accountant', null, hash, 1],
    ['U-PRIN', 'principal', 'Dr. Suresh Rao', 'principal', null, hash, 1],
    ['U-ADMIN', 'admin', 'System Admin', 'admin', null, hash, 1],
  ]
  const now = nowIso()
  await withTransaction(async () => {
    for (const [id, username, name, role, bus_code, password_hash, active] of users) {
      await sqlRun(
        `INSERT INTO users (id, username, name, role, bus_code, password_hash, active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO NOTHING`,
        [id, username, name, role, bus_code, password_hash, active, now],
      )
    }
  })
}

export async function importRegister(): Promise<number> {
  const rows = readCsv('fuel_register.csv')
  const tsServer = nowIso()
  return bulkInsert(
    'fuel_entries',
    [
      'id', 'bus_code', 'ts_client', 'ts_server', 'litres', 'amount', 'fuel_type', 'odometer_km',
      'paid_by', 'payment_mode', 'pump_name', 'bill_no', 'receipt_on_file', 'created_by',
      'source', 'status', 'created_at',
    ],
    rows.map((r) => [
      r.entry_id,
      r.bus_code,
      normRegisterTs(r.timestamp),
      tsServer,
      num(r.litres, 0),
      num(r.amount_rs, 0),
      r.fuel_type || 'diesel',
      num(r.odometer_km, 0),
      r.paid_by || null,
      r.payment_mode === 'cash' ? 'cash' : 'credit_account',
      r.pump_name,
      r.bill_no && r.bill_no !== '' ? r.bill_no : null,
      r.receipt_on_file === 'Y' ? 1 : 0,
      'U-SYS',
      'register',
      'saved',
      tsServer,
    ]),
  )
}

export async function importStatement(): Promise<{ lines: number; fileId: string }> {
  const rows = readCsv('pump_statement_shree_lakshmi.csv')
  const fileId = 'STMT-SLF-IMPORT'
  await sqlRun(
    `INSERT INTO pump_statement_files (id, file_name, uploaded_by, uploaded_at, line_count)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET line_count = excluded.line_count`,
    [fileId, 'pump_statement_shree_lakshmi.csv', 'U-ACC', nowIso(), rows.length],
  )
  const lines = await bulkInsert(
    'pump_statement_lines',
    ['bill_no', 'file_id', 'date', 'vehicle_no', 'litres', 'rate', 'amount'],
    rows.map((r) => [
      r.bill_no,
      fileId,
      normaliseDdMmYyyy(r.date),
      r.vehicle_no,
      num(r.litres, 0),
      num(r.rate, 0),
      num(r.amount, 0),
    ]),
  )
  return { lines, fileId }
}

export async function importReference(): Promise<void> {
  const priceRows = readCsv('diesel_price.csv').map((r) => [r.date, num(r.diesel_rs_per_litre, 0)])
  await bulkInsert('diesel_prices', ['date', 'price'], priceRows)
  const holidayRows = readCsv('college_calendar.csv').map((r) => [r.date, r.holiday])
  await bulkInsert('college_calendar', ['date', 'holiday'], holidayRows)
  const placeRows = readCsv('places.csv').map((r) => [r.place, num(r.lat, 0), num(r.lng, 0)])
  await bulkInsert('places', ['place', 'lat', 'lng'], placeRows)
}

export async function importGpsPings(): Promise<number> {
  const rows = readCsv('gps_pings.csv')
  return bulkInsert(
    'gps_pings',
    ['bus_code', 'ts', 'lat', 'lng'],
    rows.map((r) => [r.bus_code, normRegisterTs(r.timestamp), num(r.lat, 0), num(r.lng, 0)]),
    500,
  )
}

/* ------------------------------------------------------------------ */
/* Seeded investigation cases (mirrors findings.csv / the MVP seed).   */
/* ------------------------------------------------------------------ */

interface SeededFlag {
  id: string
  rule_code: string
  title: string
  bus_code: string | null
  severity: 'high' | 'medium' | 'low'
  reason: string
  plain_explanation: string
  evidence_summary: string
  entry_ids: string[]
  bill_nos: string[]
  amount_at_issue: number
  confidence: string
  figures: { label: string; value: string; highlight?: boolean }[]
  created_at: string
}

const SEEDED_FLAGS: SeededFlag[] = [
  {
    id: 'FLG-01',
    rule_code: 'RATE_PREMIUM',
    title: 'VB-03 — repeated pump rate premium',
    bus_code: 'VB-03',
    severity: 'high',
    reason: 'Charged rate is ₹4.00/L above the published daily price on three fills (404.0 L total).',
    plain_explanation:
      'Three Shree Lakshmi Fuels bills for VB-03 charge ₹93.27–₹93.48 per litre while the published retail price for the same days is ₹89.27–₹89.48. The difference is exactly ₹4 per litre every time. This points to a pump pricing issue. It is not proof that anyone at the college did anything wrong.',
    evidence_summary:
      'Pump bills SLF/71007 (05 Sep), SLF/71111 (11 Sep), SLF/71251 (19 Sep) match register entries F0041/F0048/F0056 on litres (131.9 / 130.8 / 141.3 L). Rates charged ₹93.27/₹93.27/₹93.48 vs published ₹89.27/₹89.27/₹89.48. Difference ₹1,616.00.',
    entry_ids: ['F0041', 'F0048', 'F0056'],
    bill_nos: ['SLF/71007', 'SLF/71111', 'SLF/71251'],
    amount_at_issue: 1616.0,
    confidence: 'High confidence in the price discrepancy; medium confidence on the cause.',
    figures: [
      { label: 'Total litres at premium rate', value: '404.0 L' },
      { label: 'Premium per litre', value: '₹4.00', highlight: true },
      { label: 'Total difference', value: '₹1,616.00', highlight: true },
    ],
    created_at: '2026-10-25T09:00:00+05:30',
  },
  {
    id: 'FLG-02',
    rule_code: 'AMOUNT_MISMATCH',
    title: 'VB-02 — register amount differs from pump bill',
    bus_code: 'VB-02',
    severity: 'high',
    reason: 'Register shows ₹10,251.69 but the pump statement shows ₹9,001.69 for the same fill (₹1,250.00 gap).',
    plain_explanation:
      'Both sides record 100.6 L on 16 Sep 2026, but the amounts differ by ₹1,250.00. The receipt is marked as on file, so the original receipt and payment ledger must be checked before deciding who is right. No conclusion has been reached.',
    evidence_summary:
      'F0052 (register): 100.6 L, ₹10,251.69. SLF/71185 (statement): 100.6 L, ₹9,001.69 at ₹89.48/L. Difference ₹1,250.00. Receipt marked on file in the paper register.',
    entry_ids: ['F0052'],
    bill_nos: ['SLF/71185'],
    amount_at_issue: 1250.0,
    confidence: 'High confidence in the mismatch; medium confidence on the cause.',
    figures: [
      { label: 'Litres (both sides agree)', value: '100.6 L' },
      { label: 'Register amount', value: '₹10,251.69' },
      { label: 'Pump statement amount', value: '₹9,001.69' },
      { label: 'Difference', value: '₹1,250.00', highlight: true },
    ],
    created_at: '2026-10-25T09:05:00+05:30',
  },
  {
    id: 'FLG-03',
    rule_code: 'UNKNOWN_VEHICLE',
    title: 'Pump bill for a vehicle not in the fleet',
    bus_code: null,
    severity: 'high',
    reason: 'Bill SLF/72152 is for KA 99 MX 4417 — no such registration in the 8-bus roster.',
    plain_explanation:
      'The pump statement bills 42.0 L (₹3,749.34) to KA 99 MX 4417 on 06-09-2026. That vehicle is not one of the college’s eight buses and no fuel-register entry matches it. The college account may have paid for an outside vehicle; authorisation is unknown.',
    evidence_summary:
      'SLF/72152: 06-09-2026, KA 99 MX 4417, 42.0 L @ ₹89.27/L, ₹3,749.34. No roster match (fleet: KA 99 VB 1001–1008). No register match by litres/date/amount.',
    entry_ids: [],
    bill_nos: ['SLF/72152'],
    amount_at_issue: 3749.34,
    confidence: 'High confidence in the roster mismatch; medium confidence on unauthorised use.',
    figures: [
      { label: 'Roster size', value: '8 buses (KA 99 VB 1001–1008)' },
      { label: 'Billed vehicle', value: 'KA 99 MX 4417', highlight: true },
      { label: 'Roster match', value: 'None', highlight: true },
    ],
    created_at: '2026-10-25T09:10:00+05:30',
  },
  {
    id: 'FLG-04',
    rule_code: 'REGISTER_MISSING',
    title: 'VB-03 — pump bill missing from the register',
    bus_code: 'VB-03',
    severity: 'medium',
    reason: 'Pump bill SLF/72169 (48.0 L, ₹4,286.88) has no matching fuel-register entry.',
    plain_explanation:
      'On 18-10-2026 the pump billed VB-03 for 48.0 L, but the paper register has no fill for VB-03 that day. The GPS log only shows three pings near the depot, so the trip and fill cannot be independently confirmed. The fill may have been missed in the register; do not assume theft.',
    evidence_summary:
      'SLF/72169: 18-10-2026, KA 99 VB 1003, 48.0 L @ ₹89.31/L, ₹4,286.88. Register has no VB-03 entry on 18-10-2026 (nearest: F0087 on 14-10, F0096 on 22-10). GPS log: 3 depot-area pings only.',
    entry_ids: [],
    bill_nos: ['SLF/72169'],
    amount_at_issue: 4286.88,
    confidence: 'High confidence in the missing register match; low–medium confidence on the cause.',
    figures: [
      { label: 'GPS pings for VB-03 that day', value: '3 — all near the depot', highlight: true },
      { label: 'Register entries for VB-03 that day', value: '0', highlight: true },
    ],
    created_at: '2026-10-25T09:15:00+05:30',
  },
  {
    id: 'FLG-05',
    rule_code: 'TANK_CAPACITY',
    title: 'VB-06 — recorded litres exceed tank capacity',
    bus_code: 'VB-06',
    severity: 'high',
    reason: '195.2 L was recorded for a bus whose stated tank is 160 L (35.2 L above capacity).',
    plain_explanation:
      'Entry F0078 (07-10-2026) records 195.2 L, but the roster lists VB-06 with a 160 L tank. The pump statement agrees with the recorded litres, so either the tank specification in the roster is wrong, or the recorded volume is. Verify the vehicle’s tank specification before drawing any conclusion.',
    evidence_summary:
      'F0078: 195.2 L, ₹17,466.50 @ ₹89.48/L. SLF/71589 matches litres and amount. Roster tank: 160 L. Excess: 35.2 L (22%).',
    entry_ids: ['F0078'],
    bill_nos: ['SLF/71589'],
    amount_at_issue: 0,
    confidence: 'High confidence in the capacity conflict; medium confidence on data accuracy.',
    figures: [
      { label: 'Stated tank capacity', value: '160 L' },
      { label: 'Recorded fill', value: '195.2 L', highlight: true },
      { label: 'Excess over capacity', value: '35.2 L (+22%)', highlight: true },
    ],
    created_at: '2026-10-25T09:20:00+05:30',
  },
  {
    id: 'FLG-06',
    rule_code: 'DUPLICATE_ENTRY',
    title: 'VB-04 — likely duplicate register line',
    bus_code: 'VB-04',
    severity: 'medium',
    reason: 'Two register lines repeat the same fill (113.8 L, ₹10,163.48, odometer 72,634) 47 minutes apart.',
    plain_explanation:
      'F0093 (10:00) and F0112 (10:47) on 19-10-2026 record identical litres, amount and odometer, but the pump statement contains only one matching bill (SLF/71822). This looks like an honest double-entry in the register, not fuel theft — no second pump bill exists.',
    evidence_summary:
      'F0093 10:00 written by Ravi (transport manager); F0112 10:47 written by Raghavendra. Identical values. One pump bill SLF/71822 (113.8 L @ ₹89.31).',
    entry_ids: ['F0093', 'F0112'],
    bill_nos: ['SLF/71822'],
    amount_at_issue: 0,
    confidence: 'Honest error — high confidence.',
    figures: [
      { label: 'Time between the two lines', value: '47 minutes', highlight: true },
      { label: 'Matching pump bills found', value: '1 (not two)', highlight: true },
    ],
    created_at: '2026-10-25T09:25:00+05:30',
  },
  {
    id: 'FLG-07',
    rule_code: 'HOLIDAY_CASH',
    title: 'VB-08 — holiday cash fill without receipt',
    bus_code: 'VB-08',
    severity: 'medium',
    reason: 'Cash fill on Gandhi Jayanti (02-10-2026) with no receipt; odometer +97 km while the GPS path is ≈172.7 km.',
    plain_explanation:
      'Entry F0111 records 60.0 L / ₹5,368.80 paid in cash on a college holiday, with no receipt on file. Between the previous fill and this one the odometer moved 97 km but the GPS path is about 172.7 km. A special holiday trip, a device fault or an odometer issue could explain this; the case needs review, not a verdict.',
    evidence_summary:
      'F0111: 02-10-2026 11:05, VB-08, 60.0 L, ₹5,368.80, cash, no receipt. Holiday: Gandhi Jayanti. Odometer interval +97 km vs GPS path ≈172.7 km (gap ≈75.7 km).',
    entry_ids: ['F0111'],
    bill_nos: [],
    amount_at_issue: 0,
    confidence: 'Medium confidence; cannot be verified from available data.',
    figures: [
      { label: 'College calendar', value: '02-10-2026 — Gandhi Jayanti (holiday)', highlight: true },
      { label: 'Odometer since previous fill', value: '+97 km', highlight: true },
      { label: 'GPS path since previous fill', value: '≈172.7 km', highlight: true },
      { label: 'Unexplained gap', value: '≈75.7 km', highlight: true },
    ],
    created_at: '2026-10-25T09:30:00+05:30',
  },
  {
    id: 'FLG-08',
    rule_code: 'SHORT_INTERVAL',
    title: 'VB-02 — unusual same-day refill pattern',
    bus_code: 'VB-02',
    severity: 'medium',
    reason: '34.0 L fill at 17:56 came 8 h after a 114.3 L fill at 09:51, with the odometer up only 41 km.',
    plain_explanation:
      'On 12-10-2026 VB-02 took 114.3 L in the morning and another 34.0 L in the evening, yet the odometer moved only 41 km between the two. The pump statement supports the second bill (SLF/72126), so fuel was really dispensed. The tank state and the reason for the refill are unknown.',
    evidence_summary:
      'F0083 09:51: 114.3 L, ₹10,208.13. F0109 17:56: 34.0 L, ₹3,036.54. Odometer 61,400 → 61,441 (+41 km). Statement bills SLF/71673 + SLF/72126 match both lines.',
    entry_ids: ['F0083', 'F0109'],
    bill_nos: ['SLF/71673', 'SLF/72126'],
    amount_at_issue: 0,
    confidence: 'Medium confidence; verify tank state and trip purpose.',
    figures: [
      { label: 'Hours between fills', value: '8.1 h' },
      { label: 'Odometer between fills', value: '+41 km', highlight: true },
      { label: 'Typical daily distance (fleet)', value: '≈100–200 km' },
    ],
    created_at: '2026-10-25T09:35:00+05:30',
  },
  {
    id: 'FLG-09',
    rule_code: 'RECEIPT_MISSING',
    title: 'Cash claims without receipts (3 entries)',
    bus_code: 'VB-07; VB-08',
    severity: 'medium',
    reason: 'Three cash claims totalling ₹33,295.16 have no receipt on file.',
    plain_explanation:
      'F0002 (VB-08, 04 Aug), F0044 (VB-07, 07 Sep) and F0098 (VB-07, 23 Oct) are cash fills with receipt_on_file = N. Missing paperwork is a control gap that should be fixed, but on its own it is not evidence of misuse. F0111 is handled separately because it also falls on a holiday and has the odometer/GPS gap.',
    evidence_summary:
      'F0002 ₹9,981.44; F0044 ₹11,426.56; F0098 ₹11,887.16. All cash, all Highway Fuel Point, receipt_on_file = N. Total ₹33,295.16.',
    entry_ids: ['F0002', 'F0044', 'F0098'],
    bill_nos: [],
    amount_at_issue: 33295.16,
    confidence: 'High confidence in the missing-document fact; low confidence in any fraud.',
    figures: [
      { label: 'Cash claims without receipt', value: '3' },
      { label: 'Total amount', value: '₹33,295.16', highlight: true },
    ],
    created_at: '2026-10-25T09:40:00+05:30',
  },
]

const SEEDED_NOTES = [
  {
    id: 'N-001',
    flag_id: 'FLG-01',
    author_id: 'U-ACC',
    author_name: 'Lakshmi Devi',
    author_role: 'accountant',
    text: 'The ₹4/L premium repeats on every SLF bill in September for VB-03. Asked the pump for their September rate card.',
    created_at: '2026-10-26T11:20:00+05:30',
  },
  {
    id: 'N-002',
    flag_id: 'FLG-02',
    author_id: 'U-TM',
    author_name: 'Ravi S',
    author_role: 'transport_manager',
    text: 'Pulled the original receipt from the file tray — it is faded. Need the payment ledger before deciding.',
    created_at: '2026-10-27T16:45:00+05:30',
  },
  {
    id: 'N-003',
    flag_id: 'FLG-06',
    author_id: 'U-TM',
    author_name: 'Ravi S',
    author_role: 'transport_manager',
    text: 'Raghavendra typed the 10:47 line the same morning. Almost certainly a double entry while copying the logbook.',
    created_at: '2026-10-27T17:02:00+05:30',
  },
]

const SEEDED_APPROVALS = [
  {
    id: 'APR-01',
    target_type: 'flag',
    target_id: 'FLG-02',
    title: 'VB-02 — amount mismatch vs pump bill SLF/71185',
    bus_code: 'VB-02',
    amount: 1250.0,
    submitter_id: 'U-TM',
    submitter_name: 'Ravi S',
    submitter_role: 'transport_manager',
    evidence_summary: 'Register F0052 ₹10,251.69 vs statement ₹9,001.69 (100.6 L both sides). Receipt on file but faded; payment ledger pending.',
    review_notes: 'Escalating for a decision on whether to raise a debit note with the pump or book a correction.',
    created_at: '2026-10-28T10:10:00+05:30',
  },
  {
    id: 'APR-02',
    target_type: 'flag',
    target_id: 'FLG-03',
    title: 'Pump bill SLF/72152 — vehicle not in fleet (KA 99 MX 4417)',
    bus_code: null,
    amount: 3749.34,
    submitter_id: 'U-TM',
    submitter_name: 'Ravi S',
    submitter_role: 'transport_manager',
    evidence_summary: '42.0 L / ₹3,749.34 on 06-09-2026 billed to the college credit account for a vehicle not on the roster.',
    review_notes: 'No register or roster match. Needs a principal decision on recovery and on who authorised the fill.',
    created_at: '2026-10-28T10:15:00+05:30',
  },
  {
    id: 'APR-03',
    target_type: 'flag',
    target_id: 'FLG-04',
    title: 'VB-03 — statement-only bill SLF/72169 (₹4,286.88)',
    bus_code: 'VB-03',
    amount: 4286.88,
    submitter_id: 'U-TM',
    submitter_name: 'Ravi S',
    submitter_role: 'transport_manager',
    evidence_summary: 'Pump billed 48.0 L on 18-10-2026; no register entry; GPS shows only depot pings that day.',
    review_notes: 'Either a missed register line or an unlogged fill. Requesting the driver’s trip sheet.',
    created_at: '2026-10-28T10:20:00+05:30',
  },
]

const SEEDED_RECONCILIATION_REVIEW = [
  {
    bill_no: 'SLF/72152',
    reviewer_decision: 'needs_supplier_clarification',
    reviewer_note: 'Awaiting Shree Lakshmi Fuels’ authorisation record for a vehicle outside the roster.',
    match_status: 'unmatched_pump_bill',
    difference: 3749.34,
    reviewed_by: 'U-ACC',
    reviewed_at: '2026-10-27T12:05:00+05:30',
  },
  {
    bill_no: 'SLF/72169',
    reviewer_decision: 'needs_supplier_clarification',
    reviewer_note: 'Principal asked for the driver’s trip sheet for 18-10-2026 before deciding.',
    match_status: 'register_missing',
    difference: 4286.88,
    reviewed_by: 'U-ACC',
    reviewed_at: '2026-10-27T12:10:00+05:30',
  },
]

const SEEDED_AUDIT = [
  { entity_type: 'statement', entity_id: 'STMT-SLF-IMPORT', action: 'statement_loaded', after: 'pump_statement_shree_lakshmi.csv (Aug–Oct 2026, 82 lines)', actor_id: 'U-ACC', actor_name: 'Lakshmi Devi', created_at: '2026-10-24T09:30:00+05:30' },
  { entity_type: 'flag', entity_id: 'FLG-01', action: 'created', after: 'Flag raised by reconciliation rule RATE_PREMIUM', actor_id: null, actor_name: 'FleetFuel Guard (auto)', created_at: '2026-10-25T09:00:00+05:30' },
  { entity_type: 'entry', entity_id: 'F0052', action: 'viewed', actor_id: 'U-TM', actor_name: 'Ravi S', created_at: '2026-10-27T16:40:00+05:30' },
  { entity_type: 'flag', entity_id: 'FLG-06', action: 'status_changed', before: 'needs_review', after: 'needs_review', reason: 'Preliminary look — awaiting pump confirmation', actor_id: 'U-TM', actor_name: 'Ravi S', created_at: '2026-10-27T17:00:00+05:30' },
]

export async function seedFlagsAndCases(): Promise<void> {
  await withTransaction(async () => {
    for (const f of SEEDED_FLAGS) {
      await sqlRun(
        `INSERT INTO flags (id, rule_code, title, bus_code, severity, reason, plain_explanation,
          evidence_summary, entry_ids, bill_nos, amount_at_issue, confidence, figures, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'needs_review', ?)
        ON CONFLICT (id) DO NOTHING`,
        [
          f.id, f.rule_code, f.title, f.bus_code, f.severity, f.reason, f.plain_explanation,
          f.evidence_summary, JSON.stringify(f.entry_ids), JSON.stringify(f.bill_nos),
          f.amount_at_issue, f.confidence, JSON.stringify(f.figures), f.created_at,
        ],
      )
    }
    for (const n of SEEDED_NOTES) {
      await sqlRun(
        `INSERT INTO flag_notes (id, flag_id, author_id, author_name, author_role, text, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO NOTHING`,
        [n.id, n.flag_id, n.author_id, n.author_name, n.author_role, n.text, n.created_at],
      )
    }
    for (const a of SEEDED_APPROVALS) {
      await sqlRun(
        `INSERT INTO approvals (id, target_type, target_id, title, bus_code, amount, submitter_id,
          submitter_name, submitter_role, evidence_summary, review_notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO NOTHING`,
        [
          a.id, a.target_type, a.target_id, a.title, a.bus_code, a.amount, a.submitter_id,
          a.submitter_name, a.submitter_role, a.evidence_summary, a.review_notes, a.created_at,
        ],
      )
    }
    for (const r of SEEDED_RECONCILIATION_REVIEW) {
      await sqlRun(
        `INSERT INTO reconciliation_results (bill_no, match_status, difference, reviewer_decision,
          reviewer_note, reviewed_by, reviewed_at, reviewed_at_ts)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (bill_no) DO NOTHING`,
        [r.bill_no, r.match_status, r.difference, r.reviewer_decision, r.reviewer_note, r.reviewed_by, r.reviewed_at, r.reviewed_at],
      )
    }
    for (let i = 0; i < SEEDED_AUDIT.length; i++) {
      const a = SEEDED_AUDIT[i]
      await sqlRun(
        `INSERT INTO audit_events (id, entity_type, entity_id, action, before, after, reason, actor_id, actor_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT DO NOTHING`,
        [i + 1, a.entity_type, a.entity_id, a.action, (a as { before?: string }).before ?? null, (a as { after?: string }).after ?? null, (a as { reason?: string }).reason ?? null, a.actor_id, a.actor_name, a.created_at],
      )
    }

    // Entries referenced by seeded cases are marked needs_review.
    const entryIds = SEEDED_FLAGS.flatMap((f) => f.entry_ids)
    await sqlRun(
      `UPDATE fuel_entries SET status = 'needs_review'
       WHERE status = 'saved' AND id IN (${entryIds.map(() => '?').join(',')})`,
      entryIds,
    )
  })

  // PostgreSQL: explicit seed ids do not advance the serial sequence — fix it.
  if (dialect === 'postgres') {
    await sqlRun(
      `SELECT setval(pg_get_serial_sequence('audit_events','id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM audit_events), 1))`,
    )
  }
}

export interface ImportReport {
  buses: number
  registerEntries: number
  statementLines: number
  gpsPings: number
  prices: number
  holidays: number
  places: number
}

const count = async (table: string): Promise<number> => {
  const r = await sqlGet<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)
  return Number(r?.n ?? 0)
}

export async function runImport(): Promise<ImportReport> {
  await connectDb()
  await migrate()
  await importBuses()
  await seedUsers()
  await importReference()
  const report: ImportReport = {
    buses: await importBuses(),
    registerEntries: await importRegister(),
    statementLines: (await importStatement()).lines,
    gpsPings: await importGpsPings(),
    prices: await count('diesel_prices'),
    holidays: await count('college_calendar'),
    places: await count('places'),
  }
  await seedFlagsAndCases()
  return report
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (invokedDirectly) {
  runImport()
    .then(async (report) => {
      const counts = {
        users: await count('users'),
        buses: await count('buses'),
        entries: await count('fuel_entries'),
        statementLines: await count('pump_statement_lines'),
        gpsPings: await count('gps_pings'),
        flags: await count('flags'),
        approvals: await count('approvals'),
      }
      console.log('[import] new rows this run:', report)
      console.log('[import] totals in database:', counts)
      process.exit(0)
    })
    .catch((e) => {
      console.error('[import] failed:', e)
      process.exit(1)
    })
}
