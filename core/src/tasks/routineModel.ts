/**
 * A routine is a repeatable run (adr-0177): a schedule, an agent, instructions and an optional model, in a project
 * or a person's own space, on or off. Each firing starts one run of the agent, with no task; the routine runs on
 * behalf of the last person who changed it. hq's one scheduler reads each routine's stored next due time.
 *
 * Reading a cron rule, its presets and the words it is read back in belong to the routine service; this is the
 * shape every part shares.
 */

/** No routine fires more often than this. */
export const ROUTINE_MIN_INTERVAL_MINUTES = 5
export const ROUTINE_TITLE_MAX_LENGTH = 120
export const ROUTINE_INSTRUCTIONS_MAX_LENGTH = 20_000
/** A cron rule's five fields, written as text: minute, hour, day of the month, month, day of the week. */
export const CRON_MAX_LENGTH = 120

/** A cron rule and the IANA timezone its wall-clock times are read in. */
export type RoutineSchedule = { cron: string; timezone: string }

export type RoutineFields = {
  id: string
  /** A project, or the person's own space (their personal project). */
  projectId: string
  title: string
  agentId: string | null
  instructions: string
  /** The model each run names (`<providerId>/<model>`); null follows the agent's own. */
  modelChoice: string | null
  schedule: RoutineSchedule
  /** When the scheduler next fires it; null while it is off. */
  nextDueAt: Date | null
  enabled: boolean
  /** The last person who changed it, including switching it on or off; its runs are on their behalf. */
  onBehalfOfUserId: string
  createdAt: Date
  updatedAt: Date
}

/** What a firing did: started a run, or skipped because the routine's last run was still going. */
export type RoutineFiring = { at: Date; outcome: 'started' | 'skipped'; runId: string | null }
