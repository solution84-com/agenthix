/**
 * What a task run's end does to the operations it carries out (workers and results spec, Results): completed with
 * the run's result and the task's state after it, stated or not; failed or stopped with what it left; waiting when
 * it asked for approval; queued again when paused for a scheduled change.
 */
import { describe, it, expect } from 'vitest'
import { runPausedReason, type RunStatusEvent } from '@agenthix/core'
import { ASKED_LINE, LAST_WORDS_MAX, NO_RESULT_LINE, requestedWhat, resultOf, runEndForOperation } from '../runEnd'

function frame(overrides: Partial<RunStatusEvent> = {}): RunStatusEvent {
  return {
    runId: 'run-1', sessionId: 's1', taskId: 't1', agentId: 'a1', agentHandle: 'dev', status: 'COMPLETED',
    error: null, sessionPatch: null, manifestPending: null, ...overrides,
  }
}

describe("a run's result @SC-970", () => {
  it('is what the run stated, marked stated, with the task\'s state after it', () => {
    expect(resultOf({ result: 'Released 1.2', stated: true }, 'ignored', 'Release', 'run-1'))
      .toEqual({ summary: 'Released 1.2', stated: true, taskState: 'Release', runId: 'run-1' })
  })

  it('is its last words, marked not stated, when it stated none', () => {
    expect(resultOf({ result: null, stated: false }, '  I changed the resize step.  ', 'Review', 'run-1'))
      .toEqual({ summary: 'I changed the resize step.', stated: false, taskState: 'Review', runId: 'run-1' })
  })

  it('says it ended without saying what it achieved when it left no words either', () => {
    expect(resultOf(null, null, null, 'run-1')).toEqual({ summary: NO_RESULT_LINE, stated: false, runId: 'run-1' })
  })

  it('keeps no more of its last words than fit', () => {
    expect(resultOf(null, 'x'.repeat(LAST_WORDS_MAX * 2), null, 'run-1').summary).toHaveLength(LAST_WORDS_MAX)
  })
})

describe('the end of the run, for its operations @SC-970', () => {
  const result = { summary: 'Done', stated: true, runId: 'run-1' }

  it('completes them when the run completed', () => {
    expect(runEndForOperation(frame(), result)).toEqual({ kind: 'ended', end: { state: 'COMPLETED', result } })
  })

  it('fails them with the run\'s error, keeping what it left', () => {
    expect(runEndForOperation(frame({ status: 'FAILED', error: 'Out of memory' }), result))
      .toEqual({ kind: 'ended', end: { state: 'FAILED', result, error: 'Out of memory' } })
  })

  it('cancels them when the run was stopped', () => {
    expect(runEndForOperation(frame({ status: 'CANCELLED', error: 'Stopped by Sam' }), result))
      .toEqual({ kind: 'ended', end: { state: 'CANCELLED', result, error: 'Stopped by Sam' } })
  })

  it('queues them again when the run was paused for a scheduled change, since the task runs again after it', () => {
    expect(runEndForOperation(frame({ status: 'CANCELLED', error: runPausedReason(null) }), result)).toEqual({ kind: 'queuedAgain' })
  })

  it('leaves them waiting for approval when the run asked, with its own words as the reason and what it asked to do', () => {
    const e = frame({ manifestPending: { runId: 'run-1', summary: 'To measure the resize step', pendingManifest: { tools: [{ name: 'benchmark' }], bashPatterns: [] } } })
    expect(runEndForOperation(e, result)).toEqual({ kind: 'waitingForApproval', reason: 'To measure the resize step', what: 'Use benchmark' })
  })

  it('gives a reason of its own when the run said none', () => {
    const e = frame({ status: 'CANCELLED', manifestPending: { runId: 'run-1', summary: null, pendingManifest: { tools: [], bashPatterns: [] } } })
    expect(runEndForOperation(e, result)).toMatchObject({ kind: 'waitingForApproval', reason: ASKED_LINE })
  })
})

describe('what a run asked to do @SC-970', () => {
  it('names its tools and its commands', () => {
    expect(requestedWhat({ tools: [{ name: 'deploy' }, { name: 'publish' }], bashPatterns: [{ pattern: 'npm test' }] }))
      .toBe('Use deploy, publish; Run the command `npm test`')
  })

  it('says a tool needs approval when the request names nothing', () => {
    expect(requestedWhat(null)).toBe('Use a tool that needs approval')
  })
})
