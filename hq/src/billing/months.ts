/**
 * The report's months (part 5, rule 6): rows are stored in UTC, and a month is cut at midnight on the first in the
 * organisation's time zone (`Org.timeZone`).
 */
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/

export function parseMonth(v: unknown): string | null {
  return typeof v === 'string' && MONTH.test(v) ? v : null
}

function parts(at: Date, timeZone: string): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const n: Record<string, number> = {}
  for (const p of f.formatToParts(at)) if (p.type !== 'literal') n[p.type] = Number(p.value)
  return { year: n.year, month: n.month, day: n.day, hour: n.hour, minute: n.minute, second: n.second }
}

/** How far the zone's wall clock is ahead of UTC at that moment, in milliseconds. */
function offsetMs(at: Date, timeZone: string): number {
  const p = parts(at, timeZone)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(at.getTime() / 1000) * 1000
}

/** The moment the zone's wall clock reads midnight on the first of the month. */
function startOf(year: number, month: number, timeZone: string): Date {
  const wall = Date.UTC(year, month - 1, 1)
  let at = wall - offsetMs(new Date(wall), timeZone)
  // Once more at the guess, in case the offset differs there (a change of daylight saving near midnight).
  at = wall - offsetMs(new Date(at), timeZone)
  return new Date(at)
}

/** `[from, to)` in UTC for a month (`YYYY-MM`) in a time zone. */
export function monthRange(month: string, timeZone: string): { from: Date; to: Date } {
  const m = MONTH.exec(month)
  if (!m) throw new Error(`Not a month: ${month}`)
  const year = Number(m[1])
  const mon = Number(m[2])
  return { from: startOf(year, mon, timeZone), to: startOf(mon === 12 ? year + 1 : year, mon === 12 ? 1 : mon + 1, timeZone) }
}

/** The month (`YYYY-MM`) a moment falls in, in a time zone. */
export function monthOf(at: Date, timeZone: string): string {
  const p = parts(at, timeZone)
  return `${p.year}-${String(p.month).padStart(2, '0')}`
}
