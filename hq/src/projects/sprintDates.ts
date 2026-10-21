/** A sprint's dates and label (adr-0097). Pure. Dates are whole days, in UTC. */
import { HttpError } from 'wasp/server'

export const DEFAULT_SPRINT_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000

export type SprintDates = { startDate: Date; finishDate: Date }

function dayOf(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()))
}

export function firstSprintDates(start: Date, days: number): SprintDates {
  if (!Number.isInteger(days) || days < 1 || days > 366) throw new HttpError(400, 'A sprint lasts from 1 to 366 days')
  const startDate = dayOf(start)
  return { startDate, finishDate: new Date(startDate.getTime() + days * DAY_MS) }
}

/** The next sprint starts the day the last is finished, and lasts as long. */
export function nextSprintDates(prev: SprintDates, now: Date): SprintDates {
  const days = Math.max(1, Math.round((prev.finishDate.getTime() - prev.startDate.getTime()) / DAY_MS))
  return firstSprintDates(now, days)
}

export function sprintDaysLeft(sprint: SprintDates, now: Date): number {
  return Math.max(0, Math.round((sprint.finishDate.getTime() - dayOf(now).getTime()) / DAY_MS))
}

/** "Sprint 12", or "Sprint 12 · Pricing push": a rename keeps the number. */
export function sprintLabel(sprint: { number: number; name: string | null }): string {
  return sprint.name ? `Sprint ${sprint.number} · ${sprint.name}` : `Sprint ${sprint.number}`
}
