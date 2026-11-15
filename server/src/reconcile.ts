/**
 * Reconciliation engine — port of the frontend matcher (src/utils/rules.ts
 * `reconcile`). Compares pump statement lines with credit-account register
 * fills. Both sides are kept intact; results only describe the comparison.
 */
import { dateKey } from './time'
import { normReg } from './csv'

export type MatchStatus =
  | 'matched'
  | 'amount_mismatch'
  | 'rate_mismatch'
  | 'unmatched_pump_bill'
  | 'register_missing'
  | 'possible_duplicate'

export interface StatementLine {
  billNo: string
  date: string
  vehicleNo: string
  litres: number
  rate: number
  amount: number
}

export interface ReconcileEntry {
  id: string
  busCode: string
  tsClient: string
  litres: number
  amount: number
  paymentMode: string
}

export interface ReconcileResult {
  billNo: string
  entryIds: string[]
  matchStatus: MatchStatus
  difference: number
  entrySide?: { litres: number; amount: number; rate?: number }
}

function publishedPrice(prices: { date: string; price: number }[], date: string): number {
  if (prices.length === 0) return 0
  const sorted = [...prices].sort((a, b) => a.date.localeCompare(b.date))
  let last = sorted[0]
  for (const p of sorted) {
    if (p.date <= date) last = p
    else break
  }
  return last.price
}

export function reconcile(  lines: StatementLine[],
  entries: ReconcileEntry[],
  busByReg: Map<string, string>,
  prices: { date: string; price: number }[],
): ReconcileResult[] {
  const credit = entries.filter((e) => e.paymentMode === 'credit_account')

  return lines.map((line) => {
    const busCode = busByReg.get(normReg(line.vehicleNo))

    if (!busCode) {
      return { billNo: line.billNo, entryIds: [], matchStatus: 'unmatched_pump_bill' as const, difference: line.amount }
    }

    const day = dateKey(line.date)
    const candidates = credit.filter(
      (e) => e.busCode === busCode && dateKey(e.tsClient) === day,
    )
    const exact = candidates.filter(
      (e) => Math.abs(e.litres - line.litres) <= 0.5 && Math.abs(e.amount - line.amount) <= 0.5,
    )

    if (exact.length >= 2) {
      const pub = publishedPrice(prices, day)
      const rateDiff = Math.abs(line.rate - pub)
      return {
        billNo: line.billNo,
        entryIds: exact.map((e) => e.id),
        matchStatus: (rateDiff > 0.05 ? 'rate_mismatch' : 'possible_duplicate') as MatchStatus,
        difference: rateDiff > 0.05 ? Math.round(Math.abs((line.rate - pub) * line.litres) * 100) / 100 : 0,
        entrySide: { litres: exact[0].litres, amount: exact[0].amount, rate: line.rate },
      }
    }

    const litreMatch = candidates.filter((e) => Math.abs(e.litres - line.litres) <= 0.5)
    if (litreMatch.length === 0) {
      return { billNo: line.billNo, entryIds: [], matchStatus: 'register_missing' as const, difference: line.amount }
    }

    const e = litreMatch.sort(
      (a, b) => Math.abs(a.amount - line.amount) - Math.abs(b.amount - line.amount),
    )[0]
    const amountDiff = Math.round((e.amount - line.amount) * 100) / 100
    if (Math.abs(amountDiff) > 0.5) {
      return {
        billNo: line.billNo,
        entryIds: [e.id],
        matchStatus: 'amount_mismatch' as const,
        difference: Math.abs(amountDiff),
        entrySide: { litres: e.litres, amount: e.amount, rate: e.amount / e.litres },
      }
    }

    const pub = publishedPrice(prices, day)
    const rateDiff = Math.round((line.rate - pub) * 100) / 100
    if (Math.abs(rateDiff) > 0.05) {
      return {
        billNo: line.billNo,
        entryIds: [e.id],
        matchStatus: 'rate_mismatch' as const,
        difference: Math.round(Math.abs(rateDiff * line.litres) * 100) / 100,
        entrySide: { litres: e.litres, amount: e.amount, rate: line.rate },
      }
    }

    return {
      billNo: line.billNo,
      entryIds: [e.id],
      matchStatus: 'matched' as const,
      difference: 0,
      entrySide: { litres: e.litres, amount: e.amount, rate: line.rate },
    }
  })
}
