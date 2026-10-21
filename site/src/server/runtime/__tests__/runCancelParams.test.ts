import { describe, it, expect } from 'vitest'
import { runCancelParams } from '../dispatchParams'

describe('run.cancel params', () => {
  it('takes the reason paused, and reads one it does not know as no reason @SC-1153', () => {
    expect(runCancelParams.parse({ runId: 'r1', reason: 'paused', by: 'the scheduled upgrade of lab' })).toEqual({ runId: 'r1', reason: 'paused', by: 'the scheduled upgrade of lab' })
    expect(runCancelParams.parse({ runId: 'r1', reason: 'later' })).toEqual({ runId: 'r1', reason: undefined })
    expect(runCancelParams.safeParse({ runId: 'r1', by: '' }).success).toBe(false)
  })
})
