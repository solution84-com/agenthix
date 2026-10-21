import { describe, it, expect } from 'vitest'
import {
  DEFAULT_RUN_LIMITS,
  effectiveRunLimits,
  isRunLimitReason,
  runLimitReason,
} from '../runLimits.js'

const org = { timeLimitMinutes: 60, turnLimit: 100 }

describe('effectiveRunLimits', () => {
  it('is the org value when the project chose nothing', () => {
    expect(effectiveRunLimits(org, null)).toEqual(org)
    expect(effectiveRunLimits(org, { timeLimitMinutes: null, turnLimit: null })).toEqual(org)
  })

  it('takes a project choice that is stricter', () => {
    expect(effectiveRunLimits(org, { timeLimitMinutes: 10, turnLimit: 20 })).toEqual({ timeLimitMinutes: 10, turnLimit: 20 })
  })

  it('never lets a project loosen the org value', () => {
    expect(effectiveRunLimits(org, { timeLimitMinutes: 600, turnLimit: 900 })).toEqual(org)
  })

  it('decides each limit on its own', () => {
    expect(effectiveRunLimits(org, { timeLimitMinutes: 5, turnLimit: 900 })).toEqual({ timeLimitMinutes: 5, turnLimit: 100 })
  })
})

describe('the reason a limit stops a run', () => {
  it('says 1 minute and 1 turn in the singular', () => {
    const one = { timeLimitMinutes: 1, turnLimit: 1 }
    expect(runLimitReason('time', one)).toContain('time limit of 1 minute.')
    expect(runLimitReason('turns', one)).toContain('turn limit of 1 turn.')
  })

  it('names the limit and is recognised from the recorded error', () => {
    const time = runLimitReason('time', DEFAULT_RUN_LIMITS)
    const turns = runLimitReason('turns', DEFAULT_RUN_LIMITS)
    expect(time).toContain('time limit of 60 minutes')
    expect(turns).toContain('turn limit of 100 turns')
    expect(isRunLimitReason(time)).toBe(true)
    expect(isRunLimitReason(turns)).toBe(true)
    expect(isRunLimitReason('Cancelled by user')).toBe(false)
    expect(isRunLimitReason(null)).toBe(false)
  })
})
