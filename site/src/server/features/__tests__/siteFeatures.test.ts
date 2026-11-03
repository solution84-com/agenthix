import { describe, it, expect, afterEach, vi } from 'vitest'
import { FEATURE_FLAG_NAMES, isFeatureOnAt, stageOf, type FeatureFlag } from '@agenthix/core'
import { withFeature } from '@agenthix/core/testing'
import {
  currentSwitches, featureMethod, FeatureNotAvailableError, isSiteFeatureOn, requireFeature, resetSiteFeaturesForTests,
  withRequestSwitches,
} from '../siteFeatures'

afterEach(() => {
  vi.unstubAllEnvs()
  resetSiteFeaturesForTests()
})

const ALL_ON = Object.fromEntries(FEATURE_FLAG_NAMES.map(f => [f, true]))

describe("the site's feature gate @SC-1775", () => {
  it('runs as shipped in a test run: no flag before preview is on without a switch', () => {
    for (const flag of FEATURE_FLAG_NAMES) {
      expect(isSiteFeatureOn(flag)).toBe(stageOf(flag) === 'released')
    }
  })

  it.each(FEATURE_FLAG_NAMES.filter(f => stageOf(f) === 'experimental' || stageOf(f) === 'preview'))(
    'keeps %s off on a production site even when hq sends it switched on',
    (flag: FeatureFlag) => {
      vi.stubEnv('NODE_ENV', 'production')
      expect(isSiteFeatureOn(flag, { [flag]: true })).toBe(false)
      withRequestSwitches(ALL_ON, () => {
        expect(isSiteFeatureOn(flag)).toBe(false)
        expect(() => requireFeature(flag)).toThrow(FeatureNotAvailableError)
      })
    },
  )

  it('in production takes hq only at its word for a beta (on) and a released flag (off), and nothing earlier', () => {
    const facts = (switches: Record<string, boolean>) => ({ env: { NODE_ENV: 'production' }, switches })
    expect(isFeatureOnAt('x', 'experimental', facts({ x: true }))).toBe(false)
    expect(isFeatureOnAt('x', 'preview', facts({ x: true }))).toBe(false)
    expect(isFeatureOnAt('x', 'beta', facts({ x: true }))).toBe(true)
    expect(isFeatureOnAt('x', 'released', facts({ x: false }))).toBe(false)
  })

  it("treats any NODE_ENV that does not say development or test as production", () => {
    vi.stubEnv('NODE_ENV', '')
    expect(isSiteFeatureOn('usageBilling', { usageBilling: true })).toBe(false)
    vi.stubEnv('NODE_ENV', 'Development')
    expect(isSiteFeatureOn('usageBilling', { usageBilling: true })).toBe(false)
  })

  it("uses the request's switches while it is answered, and keeps them as the latest for doors that are not requests", async () => {
    expect(currentSwitches()).toEqual({})
    await withRequestSwitches({ usageBilling: true }, async () => {
      await new Promise(r => setTimeout(r, 1))
      expect(currentSwitches()).toEqual({ usageBilling: true })
      expect(isSiteFeatureOn('usageBilling')).toBe(true)
    })
    expect(currentSwitches()).toEqual({ usageBilling: true })
  })

  it('keeps two requests answered at once apart', async () => {
    const seen: unknown[] = []
    await Promise.all([
      withRequestSwitches({ usageBilling: true }, async () => { await new Promise(r => setTimeout(r, 5)); seen.push(currentSwitches()) }),
      withRequestSwitches({}, async () => { seen.push(currentSwitches()) }),
    ])
    expect(seen).toEqual([{}, { usageBilling: true }])
  })

  it('drops whatever is not a listed flag with a boolean, and a request with no switches means none', () => {
    withRequestSwitches({ usageBilling: 'yes', notAFlag: true, marketplace: false }, () => {
      expect(currentSwitches()).toEqual({ marketplace: false })
    })
    withRequestSwitches(undefined, () => expect(currentSwitches()).toEqual({}))
    withRequestSwitches(JSON.parse('{"__proto__": {"usageBilling": true}}'), () => {
      expect(isSiteFeatureOn('usageBilling')).toBe(false)
    })
  })

  it('refuses a flagged method before its handler runs, saying nothing was changed', async () => {
    const handler = vi.fn(async () => 'done')
    const method = featureMethod('usageBilling', handler)
    await expect(withRequestSwitches({}, () => method({}))).rejects.toThrow(/not available.*Nothing was changed\.$/)
    expect(handler).not.toHaveBeenCalled()
    await expect(withRequestSwitches({ usageBilling: true }, () => method({}))).resolves.toBe('done')
  })

  withFeature('usageBilling', () => {
    it('is on inside withFeature, whatever hq sent', () => {
      expect(isSiteFeatureOn('usageBilling', {})).toBe(true)
    })
  })
})
