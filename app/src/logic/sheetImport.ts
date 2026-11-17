/**
 * Import of the league's old score sheet (CSV export of the Google Sheet): one cross table per month, "Coach" in the
 * corner, coach names across and down, scores as "ROW:COLUMN" (e.g. 2:1). The mirrored half may be filled too.
 */

const MONTHS: Record<string, number> = {
  jan: 1, januar: 1, january: 1, feb: 2, februar: 2, february: 2, mär: 3, mar: 3, märz: 3, maerz: 3, march: 3, apr: 4, april: 4,
  mai: 5, may: 5, jun: 6, juni: 6, june: 6, jul: 7, juli: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  okt: 10, oct: 10, oktober: 10, october: 10, nov: 11, november: 11, dez: 12, dec: 12, dezember: 12, december: 12,
}
const STOP = new Set(['pts', 'points', 'punkte', 'pkt', 'rank', 'platz'])
const norm = (s: string) => s.trim().toLowerCase()

/** CSV with quoted fields; `;` as separator when the file uses it (German spreadsheet exports). */
export function parseCsv(text: string): string[][] {
  const head = text.slice(0, 2000)
  const sep = (head.match(/;/g)?.length ?? 0) > (head.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++
      else if (c === '"') q = false
      else cell += c
    } else if (c === '"') q = true
    else if (c === sep) row.push(cell), (cell = '')
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell), rows.push(row), (row = []), (cell = '')
    } else cell += c
  }
  if (cell || row.length) row.push(cell), rows.push(row)
  return rows
}

export interface SheetGame {
  /** 'YYYY-MM' */
  month: string
  /** coach names as written in the sheet; score is a:b */
  a: string
  b: string
  sa: number
  sb: number
}
export interface SheetParse {
  /** every coach in the sheet, in sheet order */
  coaches: string[]
  /** every month table found ('YYYY-MM'), also empty ones */
  months: string[]
  games: SheetGame[]
  warnings: string[]
}

const monthOf = (cell: string) => MONTHS[norm(cell).replace(/\.$/, '')]

/** `today` decides the year: the first month is this year's, unless it lies more than a month ahead (then last year's). */
export function parseLeagueSheet(text: string, today = new Date()): SheetParse {
  const rows = parseCsv(text)
  const coaches: string[] = []
  const seen = new Map<string, string>()
  const months: string[] = []
  const games: SheetGame[] = []
  const warnings: string[] = []
  let year = 0
  let prev = 0
  for (let i = 0; i < rows.length; i++) {
    const c0 = rows[i].findIndex((c) => norm(c) === 'coach' || norm(c) === 'trainer')
    if (c0 < 0) continue
    // the header row: names to the right of "Coach", up to the first gap or the points column
    const cols: { col: number; name: string }[] = []
    for (let c = c0 + 1; c < rows[i].length; c++) {
      const name = rows[i][c].trim()
      if (!name || STOP.has(norm(name))) break
      cols.push({ col: c, name })
    }
    if (cols.length < 2) continue
    // month name: in one of the rows just above
    let m = 0
    for (let k = i - 1; k >= Math.max(0, i - 3) && !m; k--) for (const cell of rows[k]) if ((m = monthOf(cell) ?? 0)) break
    if (!m) {
      m = prev ? (prev % 12) + 1 : today.getMonth() + 1
      warnings.push(`No month name above the table in row ${i + 1}: taken as month ${m}.`)
    }
    if (!year) year = today.getFullYear() - (m > today.getMonth() + 2 ? 1 : 0)
    else if (m < prev) year++
    prev = m
    const month = `${year}-${String(m).padStart(2, '0')}`
    months.push(month)
    for (const { name } of cols) {
      if (!seen.has(norm(name))) (seen.set(norm(name), name), coaches.push(name))
    }
    // score cells, keyed by the pair in header order (upper half preferred, the mirrored half as a fallback/check)
    const cell = new Map<string, { sa: number; sb: number }>()
    const idx = new Map(cols.map((x, j) => [norm(x.name), j]))
    for (let r = i + 1; r < rows.length; r++) {
      const who = rows[r][c0]?.trim()
      if (!who) break
      const ri = idx.get(norm(who))
      if (ri == null) break
      for (const [cj, { col }] of cols.entries()) {
        if (cj === ri) continue
        const v = rows[r][col]?.trim()
        if (!v || norm(v) === 'x') continue
        const s = v.match(/^(\d{1,2})\s*[:\-–]\s*(\d{1,2})$/)
        if (!s) {
          warnings.push(`${month}: “${v}” (${who} vs ${cols[cj].name}) isn't a score, skipped.`)
          continue
        }
        cell.set(`${ri}|${cj}`, { sa: Number(s[1]), sb: Number(s[2]) })
      }
    }
    for (let x = 0; x < cols.length; x++)
      for (let y = x + 1; y < cols.length; y++) {
        const up = cell.get(`${x}|${y}`)
        const down = cell.get(`${y}|${x}`)
        const s = up ?? (down && { sa: down.sb, sb: down.sa })
        if (!s) continue
        if (up && down && (up.sa !== down.sb || up.sb !== down.sa))
          warnings.push(`${month}: ${cols[x].name} vs ${cols[y].name} reads ${up.sa}:${up.sb} and ${down.sa}:${down.sb} (mirrored): took ${up.sa}:${up.sb}.`)
        games.push({ month, a: seen.get(norm(cols[x].name))!, b: seen.get(norm(cols[y].name))!, ...s })
      }
  }
  if (!months.length) warnings.push('No table with “Coach” in its corner found.')
  return { coaches, months, games, warnings }
}

/** Noon on the 1st of the month: the date a sheet result is shown and sorted by. */
export function monthDate(month: string) {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1, 12).getTime()
}
export const fmtMonth = (month: string) => new Date(monthDate(month)).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
