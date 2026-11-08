/**
 * A project's automation rules as hq reports them (adr-0175, adr-0091): the
 * organisation's limits, and whether the project lets its agents set start times
 * when a person asks. Nothing else starts work, so nothing else is set here.
 */

export interface AutomationOrgValues {
  agentSchedules: boolean
  maxDepth: number
}

export interface AutomationStatusView {
  org: AutomationOrgValues
  /** The project's own choice, kept as chosen; it applies only where the organisation allows it too. */
  agentSchedules: boolean
  agentsMaySchedule: boolean
}

/** The run limits (spec §7): the org's, and the project's own, null where it takes the org's. */
export interface AutomationRunLimits {
  org: { timeLimitMinutes: number; turnLimit: number }
  own: { timeLimitMinutes: number | null; turnLimit: number | null }
}

/** Something automation cannot move on its own, named with its fix. */
export type AutomationStuckItem =
  | { kind: 'noAgent'; taskId: string; key: string; title: string }
  | { kind: 'lostAccess'; taskId: string; key: string; title: string }
  | { kind: 'routinePaused'; routineId: string; title: string; reason: string }

/** One thing that will start: a routine's next run, or a start time set on a task. */
export type AutomationLaterItem =
  | { kind: 'routine'; at: string; routineId: string; title: string }
  | { kind: 'task'; at: string; taskId: string; key: string; title: string }

/** "Today 9:00", "Tomorrow 9:00", "Mon 10:00" within the week, else the date. */
export function whenLabel(iso: string, now: Date = new Date()): string {
  const at = new Date(iso)
  const time = at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOfDay(at) - startOfDay(now)) / 86_400_000)
  if (days === 0) return `Today ${time}`
  if (days === 1) return `Tomorrow ${time}`
  if (days > 1 && days < 7) return `${at.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`
  return `${at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${time}`
}
