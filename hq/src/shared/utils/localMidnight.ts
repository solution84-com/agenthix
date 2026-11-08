/** The start of the viewer's today, in their own timezone, as an ISO instant: what "today" means on their screen. */
export function localMidnight(now: Date = new Date()): string {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}
