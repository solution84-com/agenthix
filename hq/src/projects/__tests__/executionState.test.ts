import { describe, it, expect } from 'vitest'
import { runLimitReason } from '@agenthix/core'
import { executionStateFor, runAskOf, withExecutionState } from '../executionState'
import { LOST_ACCESS_REASON, MANIFEST_BLOCKED_REASON } from '../../agents/taskExecutionReasons'

describe("a task's execution state, from its run state (spec D2, N3, N4)", () => {
  it.each([
    ['RUN_QUEUED', false, 'WAITING'],
    ['RUN_THROTTLED', false, 'WAITING'],
    ['RUN_ACTIVE', false, 'RUNNING'],
    ['RUN_BLOCKED', false, 'NEEDS_YOU'],
    ['RUN_FAILED', false, 'FAILED'],
    ['RUN_NONE', true, 'FINISHED'],
    ['RUN_NONE', false, 'NOT_STARTED'],
  ] as const)('%s (a run that finished: %s) is %s', (runState, finished, state) => {
    expect(executionStateFor(runState, null, finished)).toBe(state)
  })

  it('reads what a blocked task waits for from its reason', () => {
    expect(runAskOf(MANIFEST_BLOCKED_REASON)).toBe('approval')
    expect(runAskOf(`${MANIFEST_BLOCKED_REASON} — ${runLimitReason('time', { timeLimitMinutes: 60, turnLimit: 100 })}`)).toBe('approval')
    expect(runAskOf(runLimitReason('turns', { timeLimitMinutes: 60, turnLimit: 100 }))).toBe('limit')
    expect(runAskOf(LOST_ACCESS_REASON)).toBe('access')
    expect(runAskOf(null)).toBe('answer')
  })

  it('a run state written with it carries its execution state, and nothing else changes', () => {
    expect(withExecutionState({ runState: 'RUN_NONE' as const, runStateReason: null }, true)).toEqual({ runState: 'RUN_NONE', runStateReason: null, executionState: 'FINISHED' })
    expect(withExecutionState({ runState: 'RUN_QUEUED' as const })).toEqual({ runState: 'RUN_QUEUED', executionState: 'WAITING' })
  })

  it('a stopped or withdrawn task is Not started again, whatever ran before (N4)', () => {
    expect(withExecutionState({ runState: 'RUN_NONE' as const, runStateReason: null }).executionState).toBe('NOT_STARTED')
  })
})
