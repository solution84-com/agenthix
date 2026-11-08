/**
 * The execution state, defined once (spec D2, D18, N3, N4): what an agent is doing with a task now, set only by the
 * system from the task's latest run and whatever that run is waiting for a person to answer. It never follows from
 * the task state, and it never sets it: a run ending leaves the task in its column.
 *
 * And what counts as *needing the person*, the one rule hq, the site and every screen count with: a task asking for
 * an okay or an answer, a failed run of an open task, a routine run asking or failed. A reply in a conversation
 * asks in that conversation, so it is not counted here.
 */
import type { TaskState, TaskTypeKind } from './taskModel.js'

export const EXECUTION_STATES = ['NOT_STARTED', 'WAITING', 'RUNNING', 'NEEDS_YOU', 'FAILED', 'FINISHED'] as const
export type ExecutionState = (typeof EXECUTION_STATES)[number]

export const EXECUTION_STATE_LABELS: Readonly<Record<ExecutionState, string>> = {
  NOT_STARTED: 'Not started',
  WAITING: 'Waiting',
  RUNNING: 'Running',
  NEEDS_YOU: 'Needs you',
  FAILED: 'Failed',
  FINISHED: 'Finished',
}

export function isExecutionState(value: unknown): value is ExecutionState {
  return typeof value === 'string' && (EXECUTION_STATES as readonly string[]).includes(value)
}

/**
 * How a run went, as far as the execution state cares: going now, finished, failed, or stopped by a person (Stop,
 * Stop every run). A run stopped at its time or turn limit is `finished` or `stopped` with the ask `limit`.
 */
export type RunOutcome = 'running' | 'finished' | 'failed' | 'stopped'

/**
 * What a run waits for a person to do: an okay for a tool request (`approval`), an answer to its question
 * (`answer`), a decision to let it carry on past its time or turn limit (`limit`), or someone to stand in for the
 * person it ran for, who lost access (`access`).
 */
export const RUN_ASKS = ['approval', 'answer', 'limit', 'access'] as const
export type RunAsk = (typeof RUN_ASKS)[number]

export type ExecutionFacts = {
  /** In its agent's line (started, not yet taken), or due to start at its Run at… time. */
  inLine: boolean
  latestRun: { outcome: RunOutcome } | null
  ask: RunAsk | null
}

/**
 * The state from the facts, in this order: a pending ask is Needs you; a run going is Running; a task in line is
 * Waiting (a failure does not hold the line, N3); then the latest run's outcome. A person's Stop leaves it Not
 * started (N4), as if it had never been started.
 */
export function executionStateOf(f: ExecutionFacts): ExecutionState {
  if (f.ask) return 'NEEDS_YOU'
  if (f.latestRun?.outcome === 'running') return 'RUNNING'
  if (f.inLine) return 'WAITING'
  switch (f.latestRun?.outcome) {
    case 'failed': return 'FAILED'
    case 'finished': return 'FINISHED'
    default: return 'NOT_STARTED'
  }
}

/** Why something is under *Needs you*: one of the asks, or a failed run. */
export type NeedsPersonReason = RunAsk | 'failed'

export type NeedsPersonSubject =
  | ({ kind: 'task'; taskState: TaskState; typeKind?: TaskTypeKind } & ExecutionFacts)
  | { kind: 'routine'; latestRun: { outcome: RunOutcome } | null; ask: RunAsk | null }

/**
 * Why it needs the person, or null when it does not. An epic is never run, so never counted. A failed run of a task
 * already Done, or one taken back into line, waits for nobody.
 */
export function needsPersonReason(s: NeedsPersonSubject): NeedsPersonReason | null {
  if (s.kind === 'task' && s.typeKind === 'EPIC') return null
  if (s.ask) return s.ask
  if (s.latestRun?.outcome !== 'failed') return null
  if (s.kind === 'task' && (s.taskState === 'DONE' || s.inLine)) return null
  return 'failed'
}

export function needsThePerson(s: NeedsPersonSubject): boolean {
  return needsPersonReason(s) !== null
}

/** Which state shows a ring on the agent's avatar (D18): Waiting, Running, Needs you and Failed; the others none. */
export function executionStateHasRing(state: ExecutionState): boolean {
  return state === 'WAITING' || state === 'RUNNING' || state === 'NEEDS_YOU' || state === 'FAILED'
}

/** The three kinds of run (RU5): a task's run, a reply in a conversation, and a routine's run. */
export const RUN_KINDS = ['TASK', 'REPLY', 'ROUTINE'] as const
export type RunKind = (typeof RUN_KINDS)[number]
