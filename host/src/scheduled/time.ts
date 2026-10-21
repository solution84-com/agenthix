/**
 * A scheduled change's time as a person types it and reads it (host-management spec §14; the CLI board's
 * *agenthix scheduled*): in the machine's time zone — the host service's container's, which the CLI shares —
 * and said back in words, `Sun 18 Oct at 02:00`.
 */

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const FULL_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_MS = 24 * 60 * 60_000

export type ParsedTime = { ok: true; at: Date } | { ok: false; problem: string }

const EXAMPLES = '"Sun 18 Oct 04:00", "2026-10-18 04:00", "tomorrow 04:00" or "04:00"'

function clock(text: string): [number, number] | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  return h < 24 && min < 60 ? [h, min] : null
}

/** A local date and time, refused when the calendar does not have it (31 Feb) rather than rolled over. */
function local(year: number, month: number, day: number, [h, min]: [number, number]): Date | null {
  const d = new Date(year, month, day, h, min, 0, 0)
  return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day ? d : null
}

const monthOf = (name: string): number => MONTHS.findIndex(m => name.toLowerCase().startsWith(m.toLowerCase()))

/** Reads `--at`'s value. Only a time on its own, or with today or tomorrow, takes its day from `now`. */
export function parseTime(input: string, now: Date): ParsedTime {
  const text = input.trim().replace(/\s+/g, ' ').replace(/ at /i, ' ')
  const bad: ParsedTime = { ok: false, problem: `Not a time this reads: "${input}". Write it like ${EXAMPLES}.` }
  if (/[T ]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(text) && /^\d{4}-\d{2}-\d{2}/.test(text)) {
    const t = Date.parse(text.replace(' ', 'T'))
    return Number.isNaN(t) ? bad : { ok: true, at: new Date(t) }
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}:\d{2})$/.exec(text)
  if (iso) {
    const c = clock(iso[4])
    const at = c && local(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), c)
    return at ? { ok: true, at } : bad
  }
  const relative = /^(?:(today|tomorrow) )?(\d{1,2}:\d{2})$/i.exec(text)
  if (relative) {
    const c = clock(relative[2])
    if (!c) return bad
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const offset = relative[1]?.toLowerCase() === 'tomorrow' ? 1 : 0
    let at = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset, c[0], c[1])
    // A bare time that has passed today is tomorrow's; "today" says which day was meant, so it stays and is refused.
    if (!relative[1] && at.getTime() <= now.getTime()) at = new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1, c[0], c[1])
    return { ok: true, at }
  }
  const named = /^(?:([A-Za-z]{3,9}),? )?(\d{1,2}) ([A-Za-z]{3,9})(?: (\d{4}))? (\d{1,2}:\d{2})$/.exec(text)
  if (named) {
    const month = monthOf(named[3])
    const c = clock(named[5])
    if (month < 0 || !c) return bad
    const day = Number(named[2])
    let at = local(named[4] ? Number(named[4]) : now.getFullYear(), month, day, c)
    // Without a year, a date well behind us is next year's.
    if (at && !named[4] && at.getTime() < now.getTime() - DAY_MS) at = local(now.getFullYear() + 1, month, day, c)
    if (!at) return { ok: false, problem: `There is no ${day} ${MONTHS[month]}${named[4] ? ` ${named[4]}` : ''}.` }
    const weekday = named[1] ? DAYS.findIndex(d => d.toLowerCase() === named[1].slice(0, 3).toLowerCase()) : null
    if (weekday !== null && weekday !== at.getDay()) {
      const said = weekday < 0 ? `"${named[1]}"` : `a ${FULL_DAYS[weekday]}`
      return { ok: false, problem: `${day} ${MONTHS[month]} ${at.getFullYear()} is a ${FULL_DAYS[at.getDay()]}, not ${said}. Nothing was scheduled.` }
    }
    return { ok: true, at }
  }
  return bad
}

const two = (n: number) => String(n).padStart(2, '0')

/** `02:00`, in the machine's zone. */
export const clockText = (d: Date): string => `${two(d.getHours())}:${two(d.getMinutes())}`

/** `Sun 18 Oct`, with the year only when it is not this one. */
export function dayText(d: Date, now: Date): string {
  const year = d.getFullYear() === now.getFullYear() ? '' : ` ${d.getFullYear()}`
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}${year}`
}

/** `Sun 18 Oct at 02:00`. */
export const whenText = (d: Date, now: Date): string => `${dayText(d, now)} at ${clockText(d)}`

/** `Sun 18 Oct 02:00`, the list's column. */
export const whenColumn = (d: Date, now: Date): string => `${dayText(d, now)} ${clockText(d)}`

/** `in 3 days`, `in about 2 hours`, `in 25 minutes`. */
export function fromNow(d: Date, now: Date): string {
  const minutes = Math.max(1, Math.round((d.getTime() - now.getTime()) / 60_000))
  if (minutes < 90) return `in ${minutes} minute${minutes === 1 ? '' : 's'}`
  const hours = Math.round(minutes / 60)
  if (hours < 36) return `in about ${hours} hours`
  const days = Math.round(minutes / (24 * 60))
  return `in ${days} days`
}
