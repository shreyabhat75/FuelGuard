/** RFC-4180-ish CSV parser: quoted fields, escaped quotes, CRLF/LF, BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const src = text.replace(/^\uFEFF/, '')
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += c
      i++
      continue
    }
    if (c === '"') {
      inQuotes = true
      i++
      continue
    }
    if (c === ',') {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
      continue
    }
    field += c
    i++
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.length > 1 || (r[0] ?? '').trim() !== '')
}

/** Map rows to objects using the header row; values are trimmed strings. */
export function csvObjects(text: string): Record<string, string>[] {
  const rows = parseCsv(text)
  if (rows.length === 0) return []
  const header = rows[0].map((h) => h.trim())
  return rows.slice(1).map((r) => {
    const o: Record<string, string> = {}
    header.forEach((h, idx) => {
      o[h] = (r[idx] ?? '').trim()
    })
    return o
  })
}

/** DD-MM-YYYY (pump statements) → YYYY-MM-DD */
export function normaliseDdMmYyyy(s: string): string {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s.trim())
  if (!m) return s.trim()
  return `${m[3]}-${m[2]}-${m[1]}`
}

export const num = (s: string | undefined, fallback = NaN): number => {
  if (s === undefined || s === '') return fallback
  const n = Number(s)
  return Number.isFinite(n) ? n : fallback
}

export const normReg = (s: string) => s.replace(/\s+/g, '').toUpperCase()
