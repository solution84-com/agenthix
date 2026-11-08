import type { ExecutionState, RunDetail } from '@agenthix/core'
import type { HistoryGroup, HistoryKindOfRow, HistoryNote } from './historyTypes'

export type GetRunPageArgs = {
  runId: string
  /** The run's session; left out, a task's run is found by its id. */
  sessionId?: string
}

/** A run before or after this one in its task, by its stored number. */
export type RunNeighbour = { runId: string; sessionId: string; number: number; status: RunDetail['status']; endedAt: string | null; at: string }

/**
 * A run's own page (RN1, the Runs design): the run in full, as the Runs screen opened it, and what the page says
 * beside it: its number, where it sits, who started it and for whom, its limits, what it took and cost, and the runs
 * before and after it.
 */
export type RunPageView = {
  detail: RunDetail
  kind: HistoryKindOfRow
  number: number | null
  taskId: string | null
  group: HistoryGroup
  ring: ExecutionState | null
  note: HistoryNote | null
  /** "you", "Kai", "an agent", "on its schedule". */
  startedBy: string
  /** "you", "Kai"; null when nobody is behind it. */
  onBehalfOf: string | null
  /** The limits the run was given; `turnLimit` only where turns count (not a person's own start). */
  limits: { timeLimitMinutes: number; turnLimit: number | null } | null
  tookMs: number | null
  cost: number | null
  tokens: number | null
  previous: RunNeighbour | null
  next: RunNeighbour | null
  /** The task's latest run, failed, so it can be run again from here. */
  mayRunAgain: boolean
  /** Work or a task's run a conversation asked for that could not run on its first model: what it ran on instead, and why. */
  modelNote: string | null
}
