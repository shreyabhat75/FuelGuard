// Quick engine smoke test (run via esbuild bundle + node). Not part of the app bundle.
import { registerEntries, statementLines, buses, dailyPrices, holidays } from '../src/data/raw'
import { runEntryChecks, reconcile, publishedPrice } from '../src/utils/rules'
import type { FuelEntry } from '../src/types'

let failures = 0
const ok = (cond: boolean, name: string) => {
  if (!cond) {
    failures++
    console.log('FAIL:', name)
  } else {
    console.log('ok  :', name)
  }
}

// dataset shape
ok(registerEntries.length === 112, '112 register entries')
ok(statementLines.length === 82, '82 statement lines')

// published price fallback
const nov = publishedPrice(dailyPrices, '2026-11-02')
ok(nov.price === 89.31 && !nov.exact, 'Nov price falls back to last published 89.31')

// rate mismatch on F0041 (93.27 charged vs 89.27 published)
const f0041 = registerEntries.find((e) => e.id === 'F0041')!
const hits41 = runEntryChecks(f0041, { buses, prices: dailyPrices, holidays, entries: registerEntries })
ok(hits41.some((h) => h.code === 'RATE_MISMATCH' && h.severity === 'high'), 'F0041 rate mismatch flagged high')
ok(hits41.some((h) => h.code === 'TANK_CAPACITY' === false), 'F0041 no capacity flag')

// capacity on F0078
const f0078 = registerEntries.find((e) => e.id === 'F0078')!
ok(
  runEntryChecks(f0078, { buses, prices: dailyPrices, holidays, entries: registerEntries }).some(
    (h) => h.code === 'TANK_CAPACITY',
  ),
  'F0078 tank capacity flagged',
)

// duplicate pair F0093 vs F0112 (checking F0112 against full register incl F0093)
const f0112 = registerEntries.find((e) => e.id === 'F0112')!
ok(
  runEntryChecks(f0112, { buses, prices: dailyPrices, holidays, entries: registerEntries }).some(
    (h) => h.code === 'DUPLICATE_ENTRY',
  ),
  'F0112 duplicate flagged',
)

// short interval F0109 after F0083
const f0109 = registerEntries.find((e) => e.id === 'F0109')!
ok(
  runEntryChecks(f0109, { buses, prices: dailyPrices, holidays, entries: registerEntries }).some(
    (h) => h.code === 'SHORT_INTERVAL',
  ),
  'F0109 short interval flagged',
)

// holiday + cash + no receipt on F0111
const f0111 = registerEntries.find((e) => e.id === 'F0111')!
const hits111 = runEntryChecks(f0111, { buses, prices: dailyPrices, holidays, entries: registerEntries })
ok(hits111.some((h) => h.code === 'HOLIDAY_FILL' && h.severity === 'medium'), 'F0111 holiday flagged medium')
ok(hits111.some((h) => h.code === 'RECEIPT_MISSING'), 'F0111 receipt missing flagged')

// reconciliation categories
const recs = reconcile(registerEntries, statementLines, buses, dailyPrices)
const byBill = (b: string) => recs.find((r) => r.statementLineId === b)
ok(byBill('SLF/71185')?.matchStatus === 'amount_mismatch', '71185 amount mismatch')
ok(byBill('SLF/71185')?.difference === 1250, '71185 difference ₹1250')
ok(byBill('SLF/71007')?.matchStatus === 'rate_mismatch', '71007 rate mismatch')
ok(byBill('SLF/71251')?.matchStatus === 'rate_mismatch', '71251 rate mismatch')
ok(byBill('SLF/72152')?.matchStatus === 'unmatched_pump_bill', '72152 unmatched (unknown vehicle)')
ok(byBill('SLF/72169')?.matchStatus === 'register_missing', '72169 register missing')
ok(byBill('SLF/71822')?.matchStatus === 'possible_duplicate', '71822 possible duplicate (two identical lines)')
ok(byBill('SLF/71589')?.matchStatus === 'matched', '71589 matched (capacity flag handled separately)')
const cat: Record<string, number> = {}
recs.forEach((r) => (cat[r.matchStatus] = (cat[r.matchStatus] ?? 0) + 1))
console.log('categories:', JSON.stringify(cat))
ok((cat.matched ?? 0) + (cat.amount_mismatch ?? 0) + (cat.rate_mismatch ?? 0) === 79, '79 numerically-consistent lines')
ok(Object.values(cat).reduce((a, b) => a + b, 0) === 82, 'all 82 lines categorised')

// a demo new entry that should trigger 3 rules: capacity + rate + duplicate-ish
const demoEntry: Omit<FuelEntry, 'timestampServer' | 'status'> = {
  id: 'NEW-TEST',
  busId: 'VB-06',
  timestampClient: '2026-11-02T10:30:00.000Z',
  litres: 205,
  amount: 205 * 93.27,
  fuelType: 'diesel',
  odometerKm: 59999,
  paidBy: 'driver',
  paymentMode: 'cash',
  pumpName: 'Highway Fuel Point',
  location: null,
  locationNote: 'denied',
  createdBy: 'U-DRV-07',
  createdByName: 'Hanumanthappa G',
}
const demoHits = runEntryChecks({ ...demoEntry, id: 'NEW-TEST', status: 'saved' } as FuelEntry, {
  buses,
  prices: dailyPrices,
  holidays,
  entries: registerEntries,
})
const codes = new Set(demoHits.map((h) => h.code))
ok(codes.has('TANK_CAPACITY'), 'demo entry triggers tank capacity')
ok(codes.has('RATE_MISMATCH'), 'demo entry triggers rate mismatch')
ok(codes.has('LOCATION_UNAVAILABLE') || codes.has('RECEIPT_MISSING'), 'demo entry triggers location/receipt rule')
console.log('demo hits:', demoHits.map((h) => h.code).join(', '))

if (failures > 0) {
  console.log(`\n${failures} FAILURES`)
  process.exit(1)
}
console.log('\nAll engine checks passed.')
