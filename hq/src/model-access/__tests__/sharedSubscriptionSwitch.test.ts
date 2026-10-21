import { describe, it, expect } from 'vitest'
import { sharedSubscriptionAllowedForTesting } from '../sharedSubscriptionSwitch'

const on = { HQ_DEV_SHARED_SUBSCRIPTION: 'true' }

describe('sharedSubscriptionAllowedForTesting', () => {
  it('is honoured in development and test builds', () => {
    expect(sharedSubscriptionAllowedForTesting({ ...on, NODE_ENV: 'development' })).toBe(true)
    expect(sharedSubscriptionAllowedForTesting({ ...on, NODE_ENV: 'test' })).toBe(true)
  })

  it('is refused in production', () => {
    expect(sharedSubscriptionAllowedForTesting({ ...on, NODE_ENV: 'production' })).toBe(false)
  })

  it('is refused when NODE_ENV is unset or unrecognised, not only in production', () => {
    expect(sharedSubscriptionAllowedForTesting(on)).toBe(false)
    expect(sharedSubscriptionAllowedForTesting({ ...on, NODE_ENV: 'staging' })).toBe(false)
  })

  it('is off without the switch', () => {
    expect(sharedSubscriptionAllowedForTesting({ NODE_ENV: 'development' })).toBe(false)
  })
})
