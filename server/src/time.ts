/**
 * Time helpers. Historical CSV timestamps are IST strings ("YYYY-MM-DD HH:MM[:SS]").
 * App-created timestamps arrive as ISO strings (UTC or with offset).
 * Stored text keeps the original form; comparisons use these parsers.
 */

const IST_OFFSET_MIN = 330

export function parseTs(ts: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(ts.trim())
  if (m) {
    // IST wall clock → UTC instant
    const [, y, mo, d, h, mi, s] = m
    return new Date(
      Date.UTC(+y, +mo - 1, +d, +h, +mi, s ? +s : 0) - IST_OFFSET_MIN * 60_000,
    )
  }
  return new Date(ts)
}

/** Date key (YYYY-MM-DD) for any stored timestamp, evaluated in IST. */
export function dateKey(ts: string): string {
  const d = parseTs(ts)
  const shifted = new Date(d.getTime() + IST_OFFSET_MIN * 60_000)
  return shifted.toISOString().slice(0, 10)
}

/** ISO string with +05:30 offset for API output of IST wall-clock timestamps. */
export function isoIST(ts: string): string {
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(ts.trim())) {
    return ts.trim().replace(' ', 'T') + (ts.length === 16 ? ':00' : '') + '+05:30'
  }
  return ts
}

export function nowIso(): string {
  return new Date().toISOString()
}

/** Path distance between two lat/lng points, in km. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const toRad = (v: number) => (v * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}
