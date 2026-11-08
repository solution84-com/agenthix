/**
 * What a task run's end does to the operations it carries out (workers and results spec, Results): they complete
 * with the run's result and the task's state after it, whether or not the task is finished. A run that asks for
 * approval leaves them waiting for it; a run paused for a scheduled change leaves them queued for its next start.
 */
import { isRunPausedReason, type RunStatusEvent } from '@agenthix/core'
import type { OperationResult } from '../../../shared/conversations/protocol'
import type { OperationEnd } from '../../contract'
import type { RunResultRow } from '../../../server/controlplane/runResults'
import { requestReason } from '../workers/runReads'

export type RunEndForOperation =
  | { kind: 'ended'; end: OperationEnd }
  | { kind: 'waitingForApproval'; reason: string; what: string }
  | { kind: 'queuedAgain' }

/** The longest last reply kept as the summary of a run that stated no result. */
export const LAST_WORDS_MAX = 2000

export const NO_RESULT_LINE = 'The work ended without saying what it achieved.'

export function resultOf(stated: RunResultRow | null, lastWords: string | null, taskState: string | null, runId: string): OperationResult {
  const base = { runId, ...(taskState ? { taskState } : {}) }
  if (stated?.stated && stated.result) return { summary: stated.result, stated: true, ...base }
  const words = lastWords?.trim()
  return { summary: words ? words.slice(0, LAST_WORDS_MAX) : NO_RESULT_LINE, stated: false, ...base }
}

/** "Run the command `npm test`", "Use deploy, publish": what a run asked to do, from its request. */
export function requestedWhat(request: unknown): string {
  const r = (request ?? {}) as { tools?: Array<{ name?: unknown }>; bashPatterns?: Array<{ pattern?: unknown }> }
  const tools = (r.tools ?? []).map(t => t.name).filter((n): n is string => typeof n === 'string' && n.length > 0)
  const commands = (r.bashPatterns ?? []).map(p => p.pattern).filter((p): p is string => typeof p === 'string' && p.length > 0)
  const parts = [...(tools.length ? [`Use ${tools.join(', ')}`] : []), ...commands.map(c => `Run the command \`${c}\``)]
  return parts.length ? parts.join('; ') : 'Use a tool that needs approval'
}

/**
 * `lastReply`: the run's whole last reply, when it could be read. A run that asks says why in it, as a conversation's
 * work does, and the card takes that sentence only (requestReason): never the reply itself, which may hold a result.
 */
export function runEndForOperation(e: RunStatusEvent, result: OperationResult, lastReply: string | null = null): RunEndForOperation {
  if (e.manifestPending) {
    const request = e.manifestPending.pendingManifest
    return { kind: 'waitingForApproval', reason: requestReason(lastReply ?? e.manifestPending.summary, request), what: requestedWhat(request) }
  }
  if (e.status === 'CANCELLED' && isRunPausedReason(e.error)) return { kind: 'queuedAgain' }
  if (e.status === 'COMPLETED') return { kind: 'ended', end: { state: 'COMPLETED', result } }
  if (e.status === 'FAILED') return { kind: 'ended', end: { state: 'FAILED', result, error: e.error?.trim() || 'It failed without saying why.' } }
  // Stopped by a person, or at its time or turn limit: the run's partial result stays with it.
  return { kind: 'ended', end: { state: 'CANCELLED', result, ...(e.error ? { error: e.error } : {}) } }
}
