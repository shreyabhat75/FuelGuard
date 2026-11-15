export const inr = (n: number, opts: { compact?: boolean } = {}) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...(opts.compact ? { notation: 'compact' } : {}),
  }).format(n)

export const inr0 = (n: number) =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)

export const num = (n: number, digits = 1) =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits }).format(n)

/** "Mon, 02 Nov 2026" */
export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

/** "02 Nov 2026, 11:05 AM" */
export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })

export const dateKey = (iso: string) => iso.slice(0, 10)

export const monthKey = (iso: string) => iso.slice(0, 7)

export const monthLabel = (key: string) =>
  new Date(`${key}-01T00:00:00+05:30`).toLocaleDateString('en-IN', { month: 'short' })

export const relDays = (iso: string) => {
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (d <= 0) return 'today'
  if (d === 1) return 'yesterday'
  return `${d} days ago`
}
