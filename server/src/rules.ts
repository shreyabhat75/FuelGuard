/**
 * Server-side detection engine — same rule codes, thresholds and wording as
 * the frontend reference implementation (src/utils/rules.ts). A rule creates
 * a flag; it never blocks saving an entry.
 */
import { dateKey, parseTs } from './time'

export type Severity = 'high' | 'medium' | 'low'

export interface RuleHit {
  code: string
  severity: Severity
  reason: string
  explanation: string
  evidence: string
  amountAtIssue: number
}

export interface BusRef {
  busCode: string
  tankLitres: number
}

export interface EntryRef {
  id: string
  busCode: string
  tsClient: string
  litres: number
  amount: number
  odometerKm: number
  paymentMode: string
}

export interface NewEntryInput {
  id: string
  busCode: string
  tsClient: string
  litres: number
  amount: number
  paymentMode: string
  pumpName: string
  odometerKm: number
  hasOdometerPhoto: boolean
  hasReceiptPhoto: boolean
  receiptOnFile?: boolean
  locationLat: number | null
  locationNote?: string
}

export interface CheckCtx {
  bus?: BusRef
  prices: { date: string; price: number }[]
  holidays: { date: string; name: string }[]
  /** other entries for the same bus, newest first */
  busEntries: EntryRef[]
}

function publishedPrice(prices: { date: string; price: number }[], date: string): { price: number; exact: boolean } {
  if (prices.length === 0) return { price: 0, exact: false }
  const sorted = [...prices].sort((a, b) => a.date.localeCompare(b.date))
  let last = sorted[0]
  for (const p of sorted) {
    if (p.date <= date) last = p
    else break
  }
  return { price: last.price, exact: last.date === date }
}

export function runEntryChecks(entry: NewEntryInput, ctx: CheckCtx): RuleHit[] {
  const hits: RuleHit[] = []
  const day = dateKey(entry.tsClient)
  const rate = entry.litres > 0 ? entry.amount / entry.litres : 0

  if (ctx.bus) {
    const pub = publishedPrice(ctx.prices, day)
    const diff = rate - pub.price
    if (Math.abs(diff) >= 1) {
      hits.push({
        code: 'RATE_MISMATCH',
        severity: 'high',
        reason: `Rate ₹${rate.toFixed(2)}/L differs from published ₹${pub.price.toFixed(2)}/L by ₹${diff.toFixed(2)}/L.`,
        explanation: `The amount paid works out to ₹${rate.toFixed(2)} per litre, but the published diesel price for ${day} is ₹${pub.price.toFixed(2)}. This may be a pump pricing issue or a data-entry error; the entry is saved and marked for review.`,
        evidence: `Rate charged ₹${rate.toFixed(2)}/L vs published ₹${pub.price.toFixed(2)}/L on ${entry.litres.toFixed(1)} L. Difference ₹${(diff * entry.litres).toFixed(2)}.`,
        amountAtIssue: Math.round(Math.abs(diff * entry.litres) * 100) / 100,
      })
    } else if (Math.abs(diff) >= 0.5) {
      hits.push({
        code: 'RATE_MISMATCH',
        severity: 'medium',
        reason: `Rate ₹${rate.toFixed(2)}/L is ₹${diff.toFixed(2)}/L off the published price.`,
        explanation: 'The per-litre rate is slightly off the published price. Saved and marked for review.',
        evidence: `Rate charged ₹${rate.toFixed(2)}/L vs published ₹${pub.price.toFixed(2)}/L.`,
        amountAtIssue: Math.round(Math.abs(diff * entry.litres) * 100) / 100,
      })
    }

    if (entry.litres > ctx.bus.tankLitres) {
      hits.push({
        code: 'TANK_CAPACITY',
        severity: 'high',
        reason: `Recorded ${entry.litres.toFixed(1)} L exceeds the ${ctx.bus.tankLitres} L tank of ${ctx.bus.busCode}.`,
        explanation: `The litres recorded (${entry.litres.toFixed(1)} L) are more than the stated tank capacity (${ctx.bus.tankLitres} L). Either the tank record is outdated or the volume is wrong. The entry is saved; verify the tank specification before concluding anything.`,
        evidence: `Recorded ${entry.litres.toFixed(1)} L vs stated tank ${ctx.bus.tankLitres} L (excess ${(entry.litres - ctx.bus.tankLitres).toFixed(1)} L).`,
        amountAtIssue: 0,
      })
    }
  }

  const sameDay = ctx.busEntries.filter(
    (e) => e.id !== entry.id && dateKey(e.tsClient) === day,
  )
  const dup = sameDay.find(
    (e) =>
      Math.abs(e.litres - entry.litres) <= 0.5 &&
      Math.abs(e.odometerKm - entry.odometerKm) <= 1,
  )
  if (dup) {
    hits.push({
      code: 'DUPLICATE_ENTRY',
      severity: 'high',
      reason: `Very similar to ${dup.id} from the same day (litres and odometer match).`,
      explanation: `This fill looks almost identical to ${dup.id} recorded earlier today. It may be an honest double entry. The new entry is still saved and marked for review — please confirm only one fill happened.`,
      evidence: `${dup.id}: ${dup.litres.toFixed(1)} L, ₹${dup.amount.toFixed(2)}, odometer ${dup.odometerKm} km.`,
      amountAtIssue: 0,
    })
  }

  const earlier = [...ctx.busEntries]
    .filter((e) => e.id !== entry.id && parseTs(e.tsClient).getTime() < parseTs(entry.tsClient).getTime())
    .sort((a, b) => parseTs(b.tsClient).getTime() - parseTs(a.tsClient).getTime())[0]
  if (earlier && entry.litres >= 25) {
    const hours = (parseTs(entry.tsClient).getTime() - parseTs(earlier.tsClient).getTime()) / 3_600_000
    const kmDelta = entry.odometerKm - earlier.odometerKm
    if (hours > 0 && hours <= 24 && kmDelta < 100) {
      hits.push({
        code: 'SHORT_INTERVAL',
        severity: 'medium',
        reason: `Second fill of ${entry.litres.toFixed(1)} L only ${kmDelta} km after the previous fill (${hours.toFixed(1)} h earlier).`,
        explanation: `A refill of ${entry.litres.toFixed(1)} L just ${kmDelta} km after the last fill is unusual. The tank may not have been full before, or there is a special trip. Saved and marked for review.`,
        evidence: `Previous fill ${earlier.id}: ${earlier.litres.toFixed(1)} L. Odometer ${earlier.odometerKm} → ${entry.odometerKm} (+${kmDelta} km).`,
        amountAtIssue: 0,
      })
    }
  }

  const holiday = ctx.holidays.find((h) => h.date === day)
  if (holiday) {
    hits.push({
      code: 'HOLIDAY_FILL',
      severity: entry.paymentMode === 'cash' ? 'medium' : 'low',
      reason: `Fuel fill recorded on a college holiday (${holiday.name}).`,
      explanation: `The college calendar marks ${day} as a holiday (${holiday.name}). A special trip is possible. The entry is saved and flagged for a routine check.`,
      evidence: `Entry on ${day} (${holiday.name}), ${entry.paymentMode === 'cash' ? 'paid in cash' : 'college account'}.`,
      amountAtIssue: 0,
    })
  }

  if (entry.paymentMode === 'cash' && !entry.hasReceiptPhoto && entry.receiptOnFile !== true) {
    hits.push({
      code: 'RECEIPT_MISSING',
      severity: 'low',
      reason: 'Cash fill saved without a receipt photo.',
      explanation: 'Cash claims need the pump receipt for reimbursement. Please hand the receipt to the office; the entry is saved meanwhile.',
      evidence: `Cash ₹${entry.amount.toFixed(2)} at ${entry.pumpName}, no receipt attached.`,
      amountAtIssue: 0,
    })
  }

  if (!entry.hasOdometerPhoto) {
    hits.push({
      code: 'ODOMETER_PHOTO_MISSING',
      severity: 'low',
      reason: 'Saved without an odometer photo.',
      explanation: 'The odometer reading could not be photographed. The office may ask for a photo later; the entry is saved.',
      evidence: 'No odometer photo attached at save time.',
      amountAtIssue: 0,
    })
  }

  if (entry.locationLat == null) {
    hits.push({
      code: 'LOCATION_UNAVAILABLE',
      severity: 'low',
      reason: entry.locationNote === 'denied' ? 'Location permission denied.' : 'Device location unavailable.',
      explanation: 'The fill was saved without GPS location. The pump can be verified manually with the receipt; nothing was invented to fill the gap.',
      evidence: `No coordinates recorded (${entry.locationNote ?? 'unavailable'}).`,
      amountAtIssue: 0,
    })
  }

  return hits
}
