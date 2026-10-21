/**
 * A boundary's automation as hq reports it (adr-0087, adr-0091): the org's
 * values, the project's own choice, and the stricter of the two that applies.
 */

export interface AutomationOrgValues {
  allowed: boolean
  intervalMinutes: number
  batchSize: number
  queueLimit: number
  agentSchedules: boolean
  /** Whether the org requires every project to throttle. */
  throttle: boolean
  maxDepth: number
}

export interface AutomationChoice {
  enabled: boolean
  intervalMinutes: number | null
  batchSize: number | null
  queueLimit: number | null
  agentSchedules: boolean
  throttle: boolean
  maxDepth: number | null
}

type LimitFlags = Record<
  'enabled' | 'intervalMinutes' | 'batchSize' | 'queueLimit' | 'agentSchedules' | 'throttle' | 'maxDepth',
  boolean
>

export interface AutomationEffectiveValues {
  enabled: boolean
  intervalMinutes: number
  batchSize: number
  queueLimit: number
  agentSchedules: boolean
  throttle: boolean
  maxDepth: number
  limitedByOrg: LimitFlags
}

export interface AutomationStatusView {
  org: AutomationOrgValues
  choice: AutomationChoice | null
  effective: AutomationEffectiveValues
  roundOpen: boolean
  lastRoundFinishedAt: string | null
  nextPulseAt: string | null
  queued: number
  throttled: number
  agentHeld: number
}

/** A project that chose nothing: automation off, every value the organisation's. */
export const NO_AUTOMATION_CHOICE: AutomationChoice = {
  enabled: false, intervalMinutes: null, batchSize: null, queueLimit: null, agentSchedules: false, throttle: false, maxDepth: null,
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
