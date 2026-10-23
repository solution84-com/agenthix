import { describe, it, expect } from 'vitest'
import { FEATURE_FLAGS, isDevelopmentBuild, isFeatureOn, type FeatureFlag } from '../featureFlags.js'

describe('feature flags (ADR-0116)', () => {
  it('names usageBilling, with the feature and when the flag goes', () => {
    expect(FEATURE_FLAGS.usageBilling.feature).toMatch(/Cloud/)
    expect(FEATURE_FLAGS.usageBilling.removeWhen.length).toBeGreaterThan(0)
  })

  it('is on in development and in tests', () => {
    expect(isFeatureOn('usageBilling', { NODE_ENV: 'development' })).toBe(true)
    expect(isFeatureOn('usageBilling', { NODE_ENV: 'test' })).toBe(true)
  })

  it('is off in production, and anything not plainly development or a test counts as production', () => {
    for (const NODE_ENV of ['production', undefined, '', 'staging', 'Development', ' development']) {
      expect(isFeatureOn('usageBilling', { NODE_ENV })).toBe(false)
      expect(isDevelopmentBuild({ NODE_ENV })).toBe(false)
    }
  })

  it('every flag is off in production until a release turns it on in the list', () => {
    for (const flag of Object.keys(FEATURE_FLAGS) as FeatureFlag[]) {
      expect(isFeatureOn(flag, { NODE_ENV: 'production' })).toBe(FEATURE_FLAGS[flag].onInProduction)
    }
  })
})
