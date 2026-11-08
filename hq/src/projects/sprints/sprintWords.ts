/**
 * The Sprints screen's words (spec D13, N7, the Sprints design), as pure functions. A sprint's dates are whole days in
 * UTC, its finish date its last day; they are written only here, never on a task (D8).
 */
import type { TaskState } from '@agenthix/core'

const DAY_MS = 24 * 60 * 60 * 1000
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
// Three letters each, as the designs write them ("22 Sep"); the browser's en-GB short month is "Sept".
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayMonth = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`

/** "3–14 Nov", "22 Sep–3 Oct", with the year only when it is not this year: "29 Dec 2026–9 Jan 2027". */
export function sprintSpanText(start: Date, finish: Date, now: Date = new Date()): string {
  const thisYear = now.getUTCFullYear()
  const y1 = start.getUTCFullYear()
  const y2 = finish.getUTCFullYear()
  if (y1 !== y2) return `${dayMonth(start)} ${y1}–${dayMonth(finish)} ${y2}`
  const year = y2 === thisYear ? '' : ` ${y2}`
  if (start.getUTCMonth() === finish.getUTCMonth()) return `${start.getUTCDate()}–${dayMonth(finish)}${year}`
  return `${dayMonth(start)}–${dayMonth(finish)}${year}`
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** How the current sprint stands in time: "7 days left", "last day", "ended 2 days ago" (N7), or "starts in 3 days". */
export function sprintTimeText(s: { startDate: Date; daysLeft: number; daysOverdue: number }, now: Date = new Date()): string {
  if (s.daysOverdue > 0) return s.daysOverdue === 1 ? 'ended yesterday' : `ended ${s.daysOverdue} days ago`
  const toStart = Math.round((utcDay(s.startDate) - utcDay(now)) / DAY_MS)
  if (toStart > 0) return toStart === 1 ? 'starts tomorrow' : `starts in ${toStart} days`
  if (s.daysLeft <= 1) return 'last day'
  return `${s.daysLeft} days left`
}

/** A sprint's length in words: "2 weeks", "1 week", "10 days". */
export function lengthText(days: number): string {
  return days % 7 === 0 ? plural(days / 7, 'week') : plural(days, 'day')
}

/** The page's first line: "One series for the project: 2 weeks each, from Monday." The weekday only for whole weeks. */
export function seriesLine(days: number, start: Date | null, phone = false): string {
  const from = start && days % 7 === 0 ? `, from ${WEEKDAYS[start.getUTCDay()]}` : ''
  return `${phone ? 'One series' : 'One series for the project'}: ${lengthText(days)} each${from}.`
}

export type StateCounts = Record<TaskState, number> & { total: number }

/** The parts of a sprint's bar and its words, in state order, leaving out a state with none. */
export const BAR_STATES: ReadonlyArray<{ state: TaskState; label: string }> = [
  { state: 'BACKLOG', label: 'Backlog' },
  { state: 'TODO', label: 'To do' },
  { state: 'IN_PROGRESS', label: 'In progress' },
  { state: 'DONE', label: 'Done' },
]

export function barParts(counts: StateCounts): Array<{ state: TaskState; label: string; count: number }> {
  // Backlog is shown only when a task has gone back to it; To do, In progress and Done always.
  return BAR_STATES.map(p => ({ ...p, count: counts[p.state] })).filter(p => p.state !== 'BACKLOG' || p.count > 0)
}

export const tasksText = (n: number) => plural(n, 'task')

/** "At work now: 2 running · 1 needs you · 1 waiting"; null when nothing is. */
export function atWorkText(a: { running: number; needsYou: number; waiting: number }): string | null {
  const parts = [
    a.running ? `${a.running} running` : null,
    a.needsYou ? `${a.needsYou} needs you` : null,
    a.waiting ? `${a.waiting} waiting` : null,
  ].filter(Boolean)
  return parts.length ? `At work now: ${parts.join(' · ')}` : null
}

/** A past sprint in one line: "9 done · 2 moved to Sprint 4", "7 done", "5 done · 1 left in no sprint". */
export function pastLine(s: { number: number; counts: StateCounts; unfinishedCount: number | null; unfinishedMovedOn: boolean }): string {
  const done = `${s.counts.DONE} done`
  const left = s.unfinishedCount ?? 0
  if (left === 0) return done
  return s.unfinishedMovedOn ? `${done} · ${left} moved to Sprint ${s.number + 1}` : `${done} · ${left} left in no sprint`
}

/** An upcoming sprint's plan: "4 tasks planned", or "Nothing planned yet". */
export function plannedText(total: number): string {
  return total === 0 ? 'Nothing planned yet' : `${tasksText(total)} planned`
}

/** Today as a date field's value, "YYYY-MM-DD", in the person's own day. */
export function todayValue(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${m}-${d}`
}

/** The next Monday from `now` (today when it is one), as a date field's value: the first sprint's usual start. */
export function nextMondayValue(now: Date = new Date()): string {
  const ahead = (8 - now.getDay()) % 7
  return todayValue(new Date(now.getFullYear(), now.getMonth(), now.getDate() + ahead))
}
