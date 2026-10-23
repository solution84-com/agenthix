/** What hq's routine queries return to the browser (automation/routineQueries.ts). */

/** A routine's repeat, as automation/scheduleRule.ts stores it. */
export type RoutineRule =
  | { kind: 'interval'; every: number; unit: 'minutes' | 'hours' | 'days' }
  | { kind: 'weekly'; time: string; weekdays: number[] }

export type PersonRef = {
  userId: string
  username: string | null
}

/** What became of a round (automation/roundState.ts): its square's colour and its line's words. */
export type RoundState = 'done' | 'failed' | 'needsYou' | 'running' | 'waiting'

/** How many rounds a routine's squares show (spec §3). */
export const LAST_ROUNDS = 10

export type RoutineSummary = {
  id: string
  title: string
  rule: RoutineRule | null
  timezone: string
  enabled: boolean
  pausedReason: string | null
  nextRoundAt: string | null
  onBehalfOf: PersonRef
  agentName: string | null
  /** Where its rounds start, in words: "Release board › To do". */
  place: string
  canManage: boolean
  /** Its last rounds' states, oldest first, up to LAST_ROUNDS — the waiting one last. */
  lastRounds: RoundState[]
}

/** A routine in the Projects screen's Routines view: where it lives, beside what its list row says. */
export type RoutineAcross = RoutineSummary & {
  /** Its project; for the person's own Chat, `key` is null and `name` is "Chat". */
  project: { id: string; key: string | null; name: string }
}

export type RoutineRound = {
  id: string
  key: string
  title: string
  status: string
  /** Its board column; null in the Backlog. */
  column: string | null
  runState: string
  /** Why its run state is what it is: a failure, or what it waits for. */
  reason: string | null
  archived: boolean
  roundAt: string | null
  createdAt: string
  waiting: boolean
  state: RoundState
  /** How long its latest run took, in milliseconds; null when it has none or its site did not answer. */
  tookMs: number | null
}

export type RoutineDetail = RoutineSummary & {
  projectId: string
  projectKey: string
  /** Its project is the person's own Chat. */
  isPersonal: boolean
  description: string | null
  priority: string
  labels: string[]
  assignedAgentId: string | null
  /** The model each round's run names (`<providerId>/<model>`); null follows the default. */
  modelChoice: string | null
  /** null: Project Tasks. */
  boardId: string | null
  /** null: the board's Backlog. */
  column: string | null
  scheduleAt: string
  createdBy: string
  onBehalfOfHasAccess: boolean
  isProjectAdmin: boolean
  candidates: PersonRef[]
  /** Newest first, up to the `rounds` asked for. */
  rounds: RoutineRound[]
  /** More rounds than were read. */
  moreRounds: boolean
}
