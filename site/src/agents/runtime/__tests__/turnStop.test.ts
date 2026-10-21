import { describe, it, expect } from 'vitest'
import { turnStop } from '../turnStop'

describe('turnStop @SC-523 @SC-777', () => {
  it('keeps the words for a person stopping a run, and for a new message', () => {
    expect(turnStop('stopped').error).toBe('Cancelled by user')
    expect(turnStop('interrupted').error).toBe('Interrupted by a new message')
    expect(turnStop(undefined).error).toBe('Cancelled')
  })

  it('names the person who stopped or interrupted the run, and why it stopped', () => {
    expect(turnStop({ by: 'ana', interrupted: false })).toEqual({ error: 'Stopped by ana', cause: 'person', by: 'ana' })
    expect(turnStop({ by: 'ben', interrupted: true })).toEqual({ error: 'Interrupted by ben', cause: 'new_message', by: 'ben' })
    expect(turnStop(undefined)).toMatchObject({ cause: 'harness', by: null })
  })

  it('records a reason that names the limit a run was stopped by', () => {
    const limits = { timeLimitMinutes: 45, turnLimit: 80 }
    expect(turnStop({ limit: 'time', limits }).error).toContain('time limit of 45 minutes')
    expect(turnStop({ limit: 'turns', limits })).toMatchObject({ error: expect.stringContaining('turn limit of 80 turns'), cause: 'turn_limit' })
  })

  it('records a pause for a scheduled change, naming the change, so hq carries the run on afterwards', () => {
    expect(turnStop({ paused: true, by: 'the scheduled upgrade of lab' })).toEqual({ error: 'Paused for the scheduled upgrade of lab.', cause: 'paused', by: 'the scheduled upgrade of lab' })
    expect(turnStop({ paused: true, by: null })).toEqual({ error: 'Paused for a scheduled change.', cause: 'paused', by: null })
  })
})
