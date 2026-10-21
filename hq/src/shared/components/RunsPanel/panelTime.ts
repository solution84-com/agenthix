/** The times at the right of a panel item: when it happened, or how long it has been going. */

const DAY_MS = 24 * 60 * 60 * 1000

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** "10:12" today, "Yesterday", the weekday within the week, else the date ("3 Oct"). */
export function whenText(at: string | Date, now: Date = new Date()): string {
  const d = new Date(at)
  const days = Math.round((startOfDay(now) - startOfDay(d)) / DAY_MS)
  if (days <= 0) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  if (days === 1) return 'Yesterday'
  if (days < 7) return d.toLocaleDateString('en-GB', { weekday: 'short' })
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** How long since a start: "1 min" (never less), "12 min", "2 h", "3 d". */
export function forText(since: string | Date, now: Date = new Date()): string {
  const min = Math.max(1, Math.floor((now.getTime() - new Date(since).getTime()) / 60_000))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  return h < 24 ? `${h} h` : `${Math.floor(h / 24)} d`
}
