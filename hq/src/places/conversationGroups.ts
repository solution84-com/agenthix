/**
 * A place's conversations, grouped by how recently anything happened in them
 * (every screen reviewed spec §4). Days are the person's calendar days, so a
 * conversation from 23:50 last night is Yesterday, not Today.
 */
export type RecencyLabel = 'Today' | 'Yesterday' | 'Last 7 days' | 'Older'

export interface RecencyGroup<T> {
  label: RecencyLabel
  rows: T[]
}

const LABELS: RecencyLabel[] = ['Today', 'Yesterday', 'Last 7 days', 'Older']
const DAY_MS = 24 * 60 * 60 * 1000

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** Whole calendar days between `then` and `now`; Math.round absorbs a daylight-saving hour. */
function daysAgo(then: Date, now: Date): number {
  return Math.round((startOfDay(now) - startOfDay(then)) / DAY_MS)
}

function labelFor(days: number): RecencyLabel {
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days <= 7) return 'Last 7 days'
  return 'Older'
}

export function groupByRecency<T>(rows: T[], dateOf: (row: T) => Date | string, now: Date = new Date()): RecencyGroup<T>[] {
  const buckets = new Map<RecencyLabel, T[]>(LABELS.map((l) => [l, []]))
  for (const row of rows) buckets.get(labelFor(daysAgo(new Date(dateOf(row)), now)))!.push(row)
  return LABELS.filter((l) => buckets.get(l)!.length > 0).map((label) => ({ label, rows: buckets.get(label)! }))
}

const pad = (n: number) => String(n).padStart(2, '0')
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** A row's time: the time of day today, the day and month earlier this year, with the year before that. */
export function rowTime(value: Date | string, now: Date = new Date()): string {
  const d = new Date(value)
  if (daysAgo(d, now) === 0) return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const dayMonth = `${d.getDate()} ${MONTHS[d.getMonth()]}`
  return d.getFullYear() === now.getFullYear() ? dayMonth : `${dayMonth} ${d.getFullYear()}`
}
