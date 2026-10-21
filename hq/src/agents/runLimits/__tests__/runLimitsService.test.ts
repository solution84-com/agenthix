import { describe, it, expect } from 'vitest'

import {
  RunLimitsValidationError,
  validateOrgRunLimits,
  validateProjectRunLimits,
} from '../runLimitsService'

const ORG = { timeLimitMinutes: 60, turnLimit: 100 }

// Which limits a run gets, and whether a site is sent them, is runLimitsService.integration.test.ts's subject.

describe('validation', () => {
  it('accepts whole numbers inside the bounds for the org', () => {
    expect(validateOrgRunLimits({ timeLimitMinutes: 90, turnLimit: 200 })).toEqual({ timeLimitMinutes: 90, turnLimit: 200 })
  })

  it.each([
    [{ timeLimitMinutes: 0, turnLimit: 10 }],
    [{ timeLimitMinutes: 1441, turnLimit: 10 }],
    [{ timeLimitMinutes: 30.5, turnLimit: 10 }],
    [{ timeLimitMinutes: 30, turnLimit: 0 }],
    [{ timeLimitMinutes: 30, turnLimit: 1001 }],
    [{ timeLimitMinutes: 30 }],
    [{ timeLimitMinutes: '30', turnLimit: 10 }],
  ])('refuses %j for the org', values => {
    expect(() => validateOrgRunLimits(values)).toThrow(RunLimitsValidationError)
  })

  it('lets a project choose less than the org, or nothing, and refuses more', () => {
    expect(validateProjectRunLimits({ timeLimitMinutes: 30, turnLimit: null }, ORG)).toEqual({ timeLimitMinutes: 30, turnLimit: null })
    expect(validateProjectRunLimits({ timeLimitMinutes: 60, turnLimit: 100 }, ORG)).toEqual({ timeLimitMinutes: 60, turnLimit: 100 })
    expect(() => validateProjectRunLimits({ timeLimitMinutes: 61, turnLimit: null }, ORG)).toThrow(/can only be tightened/)
    expect(() => validateProjectRunLimits({ timeLimitMinutes: null, turnLimit: 101 }, ORG)).toThrow(/can only be tightened/)
  })
})
