import { describe, it, expect } from 'vitest'
import {
  FEATURE_FLAGS, FEATURE_FLAG_NAMES, FEATURE_STAGES, NO_FEATURE_SWITCHES, featureStates, isDevelopmentBuild, isFeatureOn,
  isFeatureOnAt, isOnByDefault, isSwitchable, isSwitchableAt, parseFeatureSwitches, stageOf, type FeatureFlagEntry,
  type FeatureStage, type FeatureSwitches,
} from '../featureFlags.js'

const DEVELOPMENT = { NODE_ENV: 'development' }
const TEST = { NODE_ENV: 'test' }
const PRODUCTION = { NODE_ENV: 'production' }

// A flag the list does not hold, so every stage can be checked whatever the list holds today.
const on = (stage: FeatureStage, env: { NODE_ENV?: string }, choice?: unknown) =>
  isFeatureOnAt('trial', stage, { env, switches: (choice === undefined ? {} : { trial: choice }) as FeatureSwitches })

describe('the flag list (adr-0172)', () => {
  it('gives every flag a stage, what it holds back and when it goes, and a released one its minor release', () => {
    for (const flag of FEATURE_FLAG_NAMES) {
      const entry = FEATURE_FLAGS[flag] as FeatureFlagEntry
      expect(FEATURE_STAGES).toContain(entry.stage)
      expect(entry.feature.length).toBeGreaterThan(0)
      expect(entry.removeWhen.length).toBeGreaterThan(0)
      if (entry.stage === 'released') expect(entry.releasedIn).toMatch(/^\d+\.\d+$/)
      else expect(entry.releasedIn).toBeUndefined()
    }
  })

  it('holds usageBilling and marketplace at preview', () => {
    expect(FEATURE_FLAGS.usageBilling.stage).toBe('preview')
    expect(FEATURE_FLAGS.usageBilling.feature).toMatch(/Cloud/)
    expect(FEATURE_FLAGS.marketplace.stage).toBe('preview')
    expect(FEATURE_FLAGS.marketplace.feature).toMatch(/Marketplace/)
  })
})

describe('the rule, stage by stage (spec 7, Stages)', () => {
  it('experimental: off in development unless switched on; off in production and cannot be switched on', () => {
    expect(on('experimental', DEVELOPMENT)).toBe(false)
    expect(on('experimental', DEVELOPMENT, true)).toBe(true)
    expect(on('experimental', DEVELOPMENT, false)).toBe(false)
    expect(on('experimental', PRODUCTION)).toBe(false)
    expect(on('experimental', PRODUCTION, true)).toBe(false)
  })

  it('preview: on in development unless switched off; off in production whatever the switch', () => {
    expect(on('preview', DEVELOPMENT)).toBe(true)
    expect(on('preview', DEVELOPMENT, false)).toBe(false)
    expect(on('preview', DEVELOPMENT, true)).toBe(true)
    expect(on('preview', PRODUCTION)).toBe(false)
    expect(on('preview', PRODUCTION, true)).toBe(false)
  })

  it('beta: on in development unless switched off; in production off unless the organisation switches it on', () => {
    expect(on('beta', DEVELOPMENT)).toBe(true)
    expect(on('beta', DEVELOPMENT, false)).toBe(false)
    expect(on('beta', PRODUCTION)).toBe(false)
    expect(on('beta', PRODUCTION, true)).toBe(true)
    expect(on('beta', PRODUCTION, false)).toBe(false)
  })

  it('released: on unless switched off, in development and in production alike', () => {
    expect(on('released', DEVELOPMENT)).toBe(true)
    expect(on('released', DEVELOPMENT, false)).toBe(false)
    expect(on('released', PRODUCTION)).toBe(true)
    expect(on('released', PRODUCTION, true)).toBe(true)
    expect(on('released', PRODUCTION, false)).toBe(false)
  })

  it('in production a switch can only turn a beta on or a released flag off', () => {
    for (const stage of FEATURE_STAGES) {
      const moves = on(stage, PRODUCTION, true) !== on(stage, PRODUCTION) || on(stage, PRODUCTION, false) !== on(stage, PRODUCTION)
      expect(moves).toBe(stage === 'beta' || stage === 'released')
    }
  })

  it('a test run is a development build in what it lets be switched, but with no switch runs as shipped', () => {
    for (const stage of ['experimental', 'preview', 'beta'] as const) {
      expect(on(stage, TEST)).toBe(false)
      expect(on(stage, TEST, true)).toBe(true)
      expect(on(stage, TEST, false)).toBe(false)
    }
    expect(on('released', TEST)).toBe(true)
    expect(on('released', TEST, false)).toBe(false)
  })

  it('counts anything not plainly development or a test as production', () => {
    for (const NODE_ENV of ['production', undefined, '', 'staging', 'Development', ' development', 'TEST']) {
      expect(isDevelopmentBuild({ NODE_ENV })).toBe(false)
      expect(on('preview', { NODE_ENV })).toBe(false)
      expect(on('experimental', { NODE_ENV }, true)).toBe(false)
      expect(on('beta', { NODE_ENV }, true)).toBe(true)
      expect(on('released', { NODE_ENV }, false)).toBe(false)
    }
  })

  it('ignores a switch that is not a boolean, or is not the flag\'s own', () => {
    for (const garbage of ['true', 'false', 0, 1, null, {}, [true]]) {
      expect(on('beta', PRODUCTION, garbage)).toBe(false)
      expect(on('released', PRODUCTION, garbage)).toBe(true)
      expect(on('experimental', DEVELOPMENT, garbage)).toBe(false)
      expect(on('preview', DEVELOPMENT, garbage)).toBe(true)
    }
    const inherited = Object.create({ trial: true }) as FeatureSwitches
    expect(isFeatureOnAt('trial', 'beta', { env: PRODUCTION, switches: inherited })).toBe(false)
    for (const switches of [null, undefined, 'trial', 42]) {
      expect(isFeatureOnAt('trial', 'beta', { env: PRODUCTION, switches: switches as unknown as FeatureSwitches })).toBe(false)
    }
  })

  it('isFeatureOn reads the stage from the list', () => {
    expect(isFeatureOn('marketplace', { env: DEVELOPMENT, switches: NO_FEATURE_SWITCHES })).toBe(true)
    expect(isFeatureOn('marketplace', { env: DEVELOPMENT, switches: { marketplace: false } })).toBe(false)
    expect(isFeatureOn('marketplace', { env: PRODUCTION, switches: { marketplace: true } })).toBe(false)
    expect(isFeatureOn('usageBilling', { env: TEST, switches: NO_FEATURE_SWITCHES })).toBe(false)
  })
})

describe('each stage\'s default and switch', () => {
  it('defaults: development on from preview; production and a test run only released', () => {
    expect(FEATURE_STAGES.map(s => isOnByDefault(s, DEVELOPMENT))).toEqual([false, true, true, true])
    expect(FEATURE_STAGES.map(s => isOnByDefault(s, PRODUCTION))).toEqual([false, false, false, true])
    expect(FEATURE_STAGES.map(s => isOnByDefault(s, TEST))).toEqual([false, false, false, true])
  })

  it('switches: any in a development build; in production a beta and a released flag', () => {
    expect(FEATURE_STAGES.map(s => isSwitchableAt(s, DEVELOPMENT))).toEqual([true, true, true, true])
    expect(FEATURE_STAGES.map(s => isSwitchableAt(s, TEST))).toEqual([true, true, true, true])
    expect(FEATURE_STAGES.map(s => isSwitchableAt(s, PRODUCTION))).toEqual([false, false, true, true])
    for (const flag of FEATURE_FLAG_NAMES) expect(isSwitchable(flag, PRODUCTION)).toBe(isSwitchableAt(stageOf(flag), PRODUCTION))
  })
})

describe('every flag at once', () => {
  it('answers each listed flag: its stage, whether it is on and by default, its switch, and the production screen', () => {
    const facts = { env: DEVELOPMENT, switches: { usageBilling: false } }
    const states = featureStates(facts)
    expect(Object.keys(states).sort()).toEqual([...FEATURE_FLAG_NAMES].sort())
    for (const flag of FEATURE_FLAG_NAMES) {
      expect(states[flag].stage).toBe(stageOf(flag))
      expect(states[flag].on).toBe(isFeatureOn(flag, facts))
    }
    expect(states.usageBilling).toEqual({ stage: 'preview', on: false, onByDefault: true, switchable: true, shownInProduction: false })
  })

  it('in production, a preview flag is off, takes no switch and is not on the screen', () => {
    const states = featureStates({ env: PRODUCTION, switches: { marketplace: true } })
    expect(states.marketplace).toEqual({ stage: 'preview', on: false, onByDefault: false, switchable: false, shownInProduction: false })
  })
})

describe('switches received from another program', () => {
  it('keeps a listed flag\'s boolean and drops everything else', () => {
    expect(parseFeatureSwitches({ marketplace: true, usageBilling: false })).toEqual({ marketplace: true, usageBilling: false })
    expect(parseFeatureSwitches({ marketplace: 'true', usageBilling: 1, unknownFlag: true })).toEqual({})
    expect(parseFeatureSwitches(JSON.parse('{"__proto__": {"marketplace": true}, "constructor": true}'))).toEqual({})
  })

  it('answers no switches for anything that is not a plain object, and never throws', () => {
    for (const raw of [undefined, null, 'marketplace', 7, true, [true], ['marketplace']]) {
      expect(parseFeatureSwitches(raw)).toEqual({})
    }
    const hostile = new Proxy({}, { getOwnPropertyDescriptor: () => { throw new Error('no') }, get: () => { throw new Error('no') } })
    expect(parseFeatureSwitches(hostile)).toEqual({})
  })
})
