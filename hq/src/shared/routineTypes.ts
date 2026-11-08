/** What hq's routine queries return to the browser (automation/routineQueries.ts), adr-0177. */

export type PersonRef = {
  userId: string
  username: string | null
}

/** One routine run's state, as its mark and its line say it. */
export type RoutineRunStateView = 'STARTING' | 'RUNNING' | 'FINISHED' | 'FAILED' | 'STOPPED' | 'SKIPPED'

/** How many of its last runs a routine's list shows (its marks). */
export const LAST_RUNS = 10

export type RoutineRunView = {
  id: string
  /** Run 15; null for a skipped firing. */
  number: number | null
  /** The scheduled time it fired for; null for Run now. */
  dueAt: string | null
  /** A person's Run now: who pressed it. */
  startedBy: PersonRef | null
  onBehalfOf: PersonRef
  state: RoutineRunStateView
  /** What the run waits for a person to do (core's RunAsk), or null. */
  ask: string | null
  /** Why it failed, did not start, or was skipped. */
  reason: string | null
  /** Its session, to open the run; null when it never reached a site. */
  sessionId: string | null
  runId: string | null
  startedAt: string
  endedAt: string | null
}

export type RoutineSummary = {
  id: string
  projectId: string
  title: string
  agent: { id: string; name: string } | null
  /** The cron rule and its timezone, and the rule read back in words. */
  cron: string
  timezone: string
  scheduleWords: string | null
  enabled: boolean
  /** Why it is off when the system switched it off. */
  pausedReason: string | null
  nextDueAt: string | null
  onBehalfOf: PersonRef
  modelChoice: string | null
  /** The reader may change it: they may work in its project (N6). */
  canChange: boolean
  /** Its last runs, newest first, up to LAST_RUNS. */
  lastRuns: RoutineRunView[]
}

/** A routine in the Routines place across projects: where it lives, beside its summary. */
export type RoutineAcross = RoutineSummary & {
  /** Its project; for the person's own space, `key` is null and `name` is "Chat". */
  project: { id: string; key: string | null; name: string }
}

export type RoutineDetail = RoutineSummary & {
  projectKey: string
  /** Its project is the person's own space. */
  isPersonal: boolean
  instructions: string
  /** The next three times, from now. */
  nextTimes: string[]
  createdBy: string
  /** Newest first, up to the `runs` asked for. */
  runs: RoutineRunView[]
  moreRuns: boolean
}
