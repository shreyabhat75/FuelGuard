import type {
  Bus,
  DailyPrice,
  FuelEntry,
  Holiday,
  PumpStatementLine,
  ReconciliationResult,
  Severity,
} from '../types'
import { dateKey } from './format'

/** Published price for a date; falls back to the most recent earlier price. */
export function publishedPrice(prices: DailyPrice[], date: string): { price: number; exact: boolean } {
  const sorted = [...prices].sort((a, b) => a.date.localeCompare(b.date))
  let last = sorted[0]
  for (const p of sorted) {
    if (p.date <= date) last = p
    else break
  }
  return { price: last.price, exact: last.date === date }
}

export function holidayFor(holidays: Holiday[], date: string): Holiday | undefined {
  return holidays.find((h) => h.date === date)
}

export interface RuleHit {
  code: string
  severity: Severity
  reason: string
  explanation: string
  evidence: string
  amountAtIssue: number
}

/**
 * Demo checks run when a fuel entry is saved.
 * A hit never blocks the entry and never equals "fraud confirmed" — it only asks for review.
 */
export function runEntryChecks(
  entry: FuelEntry,
  ctx: { buses: Bus[]; prices: DailyPrice[]; holidays: Holiday[]; entries: FuelEntry[] },
): RuleHit[] {
  const hits: RuleHit[] = []
  const bus = ctx.buses.find((b) => b.busCode === entry.busId)
  const day = dateKey(entry.timestampClient)
  const rate = entry.litres > 0 ? entry.amount / entry.litres : 0

  if (bus) {
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

    if (entry.litres > bus.tankLitres) {
      hits.push({
        code: 'TANK_CAPACITY',
        severity: 'high',
        reason: `Recorded ${entry.litres.toFixed(1)} L exceeds the ${bus.tankLitres} L tank of ${bus.busCode}.`,
        explanation: `The litres recorded (${entry.litres.toFixed(1)} L) are more than the stated tank capacity (${bus.tankLitres} L). Either the tank record is outdated or the volume is wrong. The entry is saved; verify the tank specification before concluding anything.`,
        evidence: `Recorded ${entry.litres.toFixed(1)} L vs stated tank ${bus.tankLitres} L (excess ${(entry.litres - bus.tankLitres).toFixed(1)} L).`,
        amountAtIssue: 0,
      })
    }
  }

  const sameDay = ctx.entries.filter(
    (e) => e.id !== entry.id && e.busId === entry.busId && dateKey(e.timestampClient) === day,
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

  const earlier = ctx.entries
    .filter((e) => e.busId === entry.busId && e.timestampClient < entry.timestampClient)
    .sort((a, b) => b.timestampClient.localeCompare(a.timestampClient))[0]
  if (earlier && entry.litres >= 25) {
    const hours =
      (new Date(entry.timestampClient).getTime() - new Date(earlier.timestampClient).getTime()) /
      3_600_000
    const kmDelta = entry.odometerKm - earlier.odometerKm
    if (hours > 0 && hours <= 24 && kmDelta < 100) {
      hits.push({
        code: 'SHORT_INTERVAL',
        severity: 'medium',
        reason: `Second fill of ${entry.litres.toFixed(1)} L only ${kmDelta} km after the previous fill (${hours.toFixed(1)} h earlier).`,
        explanation: `A refill of ${entry.litres.toFixed(1)} L just ${kmDelta} km after the last fill is unusual. The tank may not have been full before, or there is a special trip. Saved and marked for review.`,
        evidence: `Previous fill ${earlier.id} at ${earlier.timestampClient.slice(11, 16)}: ${earlier.litres.toFixed(1)} L. Odometer ${earlier.odometerKm} → ${entry.odometerKm} (+${kmDelta} km).`,
        amountAtIssue: 0,
      })
    }
  }

  const holiday = holidayFor(ctx.holidays, day)
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

  if (entry.paymentMode === 'cash' && !entry.receiptPhoto) {
    hits.push({
      code: 'RECEIPT_MISSING',
      severity: 'low',
      reason: 'Cash fill saved without a receipt photo.',
      explanation: 'Cash claims need the pump receipt for reimbursement. Please hand the receipt to the office; the entry is saved meanwhile.',
      evidence: `Cash ₹${entry.amount.toFixed(2)} at ${entry.pumpName}, no receipt attached.`,
      amountAtIssue: 0,
    })
  }

  if (!entry.odometerPhoto) {
    hits.push({
      code: 'ODOMETER_PHOTO_MISSING',
      severity: 'low',
      reason: 'Saved without an odometer photo.',
      explanation: 'The odometer reading could not be photographed. The office may ask for a photo later; the entry is saved.',
      evidence: 'No odometer photo attached at save time.',
      amountAtIssue: 0,
    })
  }

  if (!entry.location) {
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

const normReg = (s: string) => s.replace(/\s+/g, '').toUpperCase()

/**
 * Matches each pump statement line against register entries (credit account fills).
 * Both sides are kept intact; the result only describes the comparison.
 */
export function reconcile(
  entries: FuelEntry[],
  lines: PumpStatementLine[],
  buses: Bus[],
  prices: DailyPrice[],
): ReconciliationResult[] {
  const byReg = new Map(buses.map((b) => [normReg(b.registration), b.busCode]))
  const credit = entries.filter((e) => e.paymentMode === 'credit_account')

  return lines.map((line) => {
    const base = {
      id: `REC-${line.billNo.replace(/\W/g, '')}`,
      statementLineId: line.billNo,
      reviewerDecision: 'none' as const,
    }
    const busCode = byReg.get(normReg(line.vehicleNo))

    if (!busCode) {
      return {
        ...base,
        entryIds: [],
        matchStatus: 'unmatched_pump_bill' as const,
        difference: line.amount,
      }
    }

    const day = dateKey(line.date)
    const candidates = credit.filter(
      (e) => e.busId === busCode && dateKey(e.timestampClient) === day,
    )
    const exact = candidates.filter(
      (e) => Math.abs(e.litres - line.litres) <= 0.5 && Math.abs(e.amount - line.amount) <= 0.5,
    )

    if (exact.length >= 2) {
      const pub = publishedPrice(prices, day)
      const rateDiff = Math.abs(line.rate - pub.price)
      return {
        ...base,
        entryIds: exact.map((e) => e.id),
        matchStatus: (rateDiff > 0.05 ? 'rate_mismatch' : 'possible_duplicate') as ReconciliationResult['matchStatus'],
        difference: rateDiff > 0.05 ? Math.round(Math.abs((line.rate - pub.price) * line.litres) * 100) / 100 : 0,
        entrySide: { litres: exact[0].litres, amount: exact[0].amount, rate: line.rate },
      }
    }

    const litreMatch = candidates.filter((e) => Math.abs(e.litres - line.litres) <= 0.5)
    if (litreMatch.length === 0) {
      return {
        ...base,
        entryIds: [],
        matchStatus: 'register_missing' as const,
        difference: line.amount,
      }
    }

    const e = litreMatch.sort(
      (a, b) => Math.abs(a.amount - line.amount) - Math.abs(b.amount - line.amount),
    )[0]
    const amountDiff = Math.round((e.amount - line.amount) * 100) / 100
    if (Math.abs(amountDiff) > 0.5) {
      return {
        ...base,
        entryIds: [e.id],
        matchStatus: 'amount_mismatch' as const,
        difference: Math.abs(amountDiff),
        entrySide: { litres: e.litres, amount: e.amount, rate: e.amount / e.litres },
      }
    }

    const pub = publishedPrice(prices, day)
    const rateDiff = Math.round((line.rate - pub.price) * 100) / 100
    if (Math.abs(rateDiff) > 0.05) {
      return {
        ...base,
        entryIds: [e.id],
        matchStatus: 'rate_mismatch' as const,
        difference: Math.round(Math.abs(rateDiff * line.litres) * 100) / 100,
        entrySide: { litres: e.litres, amount: e.amount, rate: line.rate },
      }
    }

    return {
      ...base,
      entryIds: [e.id],
      matchStatus: 'matched' as const,
      difference: 0,
      entrySide: { litres: e.litres, amount: e.amount, rate: line.rate },
    }
  })
}
