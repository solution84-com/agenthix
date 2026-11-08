/**
 * A task's execution state (core's `executionStateOf`), written by hq in the same write that changes its run state,
 * so lists and boards filter on a stored value and a late frame from an earlier run, which that write's condition
 * already turns away, can never set it either.
 *
 * What hq knows of a task's latest run and its pending ask is its run state and the stored reason:
 *   - queued or throttled is in its agent's line (Waiting);
 *   - active is a run going (Running);
 *   - blocked is a pending ask (Needs you): a tool request, a run limit, a lost access, or else an answer;
 *   - failed is a failed run (Failed);
 *   - none is Finished only when written by a run that ended on its own (`finished`); every other way back to no
 *     run pending (a Stop, a withdrawal from the line, a dismissed failure, a released hold) is Not started (N4).
 */
import type { Prisma, TaskExecutionState, TaskRunState } from '@prisma/client'
import { executionStateOf, isRunLimitReason, type ExecutionFacts, type RunAsk } from '@agenthix/core'
import { LOST_ACCESS_REASON, MANIFEST_BLOCKED_REASON } from '../agents/taskExecutionReasons'

/** What a blocked task waits for a person to do, from its stored reason. */
export function runAskOf(reason: string | null): RunAsk {
  if (reason?.startsWith(MANIFEST_BLOCKED_REASON)) return 'approval'
  if (reason === LOST_ACCESS_REASON) return 'access'
  if (isRunLimitReason(reason)) return 'limit'
  return 'answer'
}

export function executionFactsOf(runState: TaskRunState, reason: string | null, finished = false): ExecutionFacts {
  switch (runState) {
    case 'RUN_QUEUED':
    case 'RUN_THROTTLED': return { inLine: true, latestRun: null, ask: null }
    case 'RUN_ACTIVE': return { inLine: false, latestRun: { outcome: 'running' }, ask: null }
    case 'RUN_BLOCKED': return { inLine: false, latestRun: null, ask: runAskOf(reason) }
    case 'RUN_FAILED': return { inLine: false, latestRun: { outcome: 'failed' }, ask: null }
    case 'RUN_NONE': return { inLine: false, latestRun: finished ? { outcome: 'finished' } : null, ask: null }
  }
}

export function executionStateFor(runState: TaskRunState, reason: string | null = null, finished = false): TaskExecutionState {
  return executionStateOf(executionFactsOf(runState, reason, finished))
}

type RunStateData = { runState: TaskRunState; runStateReason?: string | Prisma.NullableStringFieldUpdateOperationsInput | null }

/**
 * `data` with the execution state its run state gives, for any task write that sets `runState`. `finished`: the
 * write is a run's own end with nothing left to do.
 */
export function withExecutionState<T extends RunStateData>(data: T, finished = false): T & { executionState: TaskExecutionState } {
  const reason = typeof data.runStateReason === 'string' ? data.runStateReason : null
  return { ...data, executionState: executionStateFor(data.runState, reason, finished) }
}
