/**
 * A person's timezone: an IANA zone name such as Australia/Sydney. Client- and
 * server-safe — the browser reports one, hq validates it before storing it.
 */

/** Region/City style names, plus UTC. Rules out offsets ("+10:00") and abbreviations ("EST") the runtime may also accept. */
const IANA_SHAPE = /^(?:UTC|[A-Za-z][A-Za-z_]*(?:\/[A-Za-z0-9_+-]+)+)$/

/** The zone name when `value` is a real IANA zone the runtime knows, otherwise null. */
export function normalizeTimezone(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.trim()
  if (!IANA_SHAPE.test(name)) return null
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: name })
    return name
  } catch {
    return null
  }
}

/** The date and time `now` is in `timezone`, as a person would read it: "Sunday 4 October 2026, 14:05". */
export function localDateTimeText(timezone: string, now: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  return `${get('weekday')} ${get('day')} ${get('month')} ${get('year')}, ${get('hour')}:${get('minute')}`
}
