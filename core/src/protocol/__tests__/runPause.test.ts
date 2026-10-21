import { describe, it, expect } from 'vitest'
import { isRunPausedReason, runPausedReason } from '../runPause.js'
import { isRunLimitReason } from '../runLimits.js'

describe('a run paused at the end of its step', () => {
  it('records why it paused, in words, naming what paused it', () => {
    expect(runPausedReason('the scheduled upgrade of office-server')).toBe('Paused for the scheduled upgrade of office-server.')
    expect(runPausedReason(null)).toBe('Paused for a scheduled change.')
  })

  it('is told apart from a stop, a limit and a failure', () => {
    expect(isRunPausedReason(runPausedReason('the scheduled resize of lab'))).toBe(true)
    expect(isRunPausedReason(runPausedReason(null))).toBe(true)
    expect(isRunPausedReason('Cancelled by user')).toBe(false)
    expect(isRunPausedReason('Stopped by the scheduled upgrade of lab')).toBe(false)
    expect(isRunPausedReason(null)).toBe(false)
    expect(isRunLimitReason(runPausedReason(null))).toBe(false)
  })
})
