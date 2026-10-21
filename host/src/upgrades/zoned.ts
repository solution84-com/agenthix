/**
 * Wall-clock times in an IANA time zone, for a maintenance window Cloud sets in its owner's zone while the machine
 * runs in UTC. Done with `Intl` at the moment of evaluation, so a change of clocks moves the instant, never the hour.
 */

export function validTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

const formats = new Map<string, Intl.DateTimeFormat>()
function formatIn(zone: string): Intl.DateTimeFormat {
  let f = formats.get(zone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
    formats.set(zone, f)
  }
  return f
}

export type Wall = { year: number; month: number; day: number; hour: number; minute: number }

/** The wall clock in `zone` at `at`. */
export function wallIn(zone: string, at: Date): Wall {
  const p: Record<string, number> = {}
  for (const part of formatIn(zone).formatToParts(at)) if (part.type !== 'literal') p[part.type] = Number(part.value)
  return { year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute }
}

/** How far `zone` is ahead of UTC at `at`, in ms. */
function offsetAt(zone: string, at: Date): number {
  const w = wallIn(zone, at)
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute) - Math.floor(at.getTime() / 60_000) * 60_000
}

/**
 * The instant the wall clock in `zone` reads this time. A time the clocks skip is read as the hour after the gap; one
 * they repeat, as its first occurrence.
 */
export function instantOf(zone: string, year: number, month: number, day: number, minuteOfDay: number): Date {
  const asUtc = Date.UTC(year, month - 1, day, 0, minuteOfDay)
  const first = asUtc - offsetAt(zone, new Date(asUtc))
  const second = asUtc - offsetAt(zone, new Date(first))
  if (second === first) return new Date(first)
  const reads = (t: number) => { const w = wallIn(zone, new Date(t)); return w.hour * 60 + w.minute === minuteOfDay && w.day === day }
  if (reads(Math.min(first, second))) return new Date(Math.min(first, second))
  return new Date(Math.max(first, second))
}
