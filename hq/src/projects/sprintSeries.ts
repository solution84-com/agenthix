/**
 * A project's one series of sprints (spec D8, D13, N7), as pure rules over whole days in UTC. Each sprint runs from
 * its start date to its finish date, both days included; the next starts the day after. The current sprint is the
 * lowest-numbered one not finished: it is finished only explicitly, and after its last day it stays current, shown
 * as overdue. The series' length is its newest sprint's.
 */
const DAY_MS = 24 * 60 * 60 * 1000

export const SPRINT_DAYS_MAX = 366
/** How many sprints after the current one may be planned ahead. */
export const UPCOMING_SPRINTS_MAX = 2
export const SPRINT_NAME_MAX_LENGTH = 120
export const SPRINT_GOAL_MAX_LENGTH = 200

export type SprintSpan = { startDate: Date; finishDate: Date }
export type SeriesSprint = SprintSpan & { id: string; number: number; finishedAt: Date | null }

export function dayOf(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()))
}

const addDays = (day: Date, n: number): Date => new Date(day.getTime() + n * DAY_MS)

/** What is wrong with a sprint's length in days; null when nothing is. */
export function sprintDaysProblem(days: unknown): string | null {
  return typeof days === 'number' && Number.isInteger(days) && days >= 1 && days <= SPRINT_DAYS_MAX
    ? null
    : `A sprint lasts from 1 to ${SPRINT_DAYS_MAX} days. Nothing was changed.`
}

export function spanFrom(start: Date, days: number): SprintSpan {
  const startDate = dayOf(start)
  return { startDate, finishDate: addDays(startDate, days - 1) }
}

export function sprintDays(s: SprintSpan): number {
  return Math.max(1, Math.round((dayOf(s.finishDate).getTime() - dayOf(s.startDate).getTime()) / DAY_MS) + 1)
}

/** The sprint after `prev` in the series: from the day after its last, `days` long (its own length by default). */
export function nextSpan(prev: SprintSpan, days = sprintDays(prev)): SprintSpan {
  return spanFrom(addDays(dayOf(prev.finishDate), 1), days)
}

export function sortedSeries<S extends { number: number }>(sprints: readonly S[]): S[] {
  return [...sprints].sort((a, b) => a.number - b.number)
}

export function currentOf<S extends SeriesSprint>(sprints: readonly S[]): S | null {
  return sortedSeries(sprints).find(s => s.finishedAt === null) ?? null
}

export type SeriesParts<S> = { current: S | null; upcoming: S[]; past: S[] }

/** Current, then the upcoming in order, and the past newest first. */
export function seriesParts<S extends SeriesSprint>(sprints: readonly S[]): SeriesParts<S> {
  const ordered = sortedSeries(sprints)
  const current = ordered.find(s => s.finishedAt === null) ?? null
  return {
    current,
    upcoming: ordered.filter(s => s.finishedAt === null && s !== current),
    past: ordered.filter(s => s.finishedAt !== null).reverse(),
  }
}

/** The series' length: its newest sprint's. Null for a project with no sprints. */
export function seriesDays(sprints: readonly SeriesSprint[]): number | null {
  const newest = sortedSeries(sprints).at(-1)
  return newest ? sprintDays(newest) : null
}

/** Days left of a sprint, today included; 0 once its last day has passed. */
export function daysLeft(s: SprintSpan, now: Date): number {
  return Math.max(0, Math.round((dayOf(s.finishDate).getTime() - dayOf(now).getTime()) / DAY_MS) + 1)
}

/** How many days ago an unfinished sprint's last day was; 0 while it is not past it (N7). */
export function daysOverdue(s: SprintSpan & { finishedAt: Date | null }, now: Date): number {
  if (s.finishedAt) return 0
  return Math.max(0, Math.round((dayOf(now).getTime() - dayOf(s.finishDate).getTime()) / DAY_MS))
}

/**
 * New dates for the upcoming sprints when the series' length changes: each follows the one before, from the
 * current sprint (whose own dates stay: it is under way), `days` long.
 */
export function relaidUpcoming<S extends SeriesSprint>(current: SprintSpan, upcoming: readonly S[], days: number): Array<{ id: string } & SprintSpan> {
  let prev: SprintSpan = current
  return sortedSeries(upcoming).map(s => {
    const span = nextSpan(prev, days)
    prev = span
    return { id: s.id, ...span }
  })
}

/** "Sprint 12", or "Sprint 12 · Pricing push": a rename keeps the number. */
export function sprintTitle(s: { number: number; name: string | null }): string {
  return s.name ? `Sprint ${s.number} · ${s.name}` : `Sprint ${s.number}`
}
