import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ findFirst: vi.fn() }))
vi.mock('wasp/server', () => ({ prisma: { org: { findFirst: db.findFirst } } }))

import {
  forgetFeatureSwitches, freshFeatureSwitches, isOrgFeatureOn, orgFeatureSwitches, readStoredSwitches, switchesOf,
  SWITCHES_CACHE_MS,
} from '../switches'

beforeEach(() => { forgetFeatureSwitches(); db.findFirst.mockReset() })
afterEach(() => { vi.useRealTimers() })

describe("the organisation's stored switches @SC-1768", () => {
  it('keeps a listed flag with a boolean, and who changed it and when', () => {
    const at = '2026-11-03T10:00:00.000Z'
    expect(readStoredSwitches({ marketplace: { on: true, byUserId: 'u1', at } }))
      .toEqual({ marketplace: { on: true, byUserId: 'u1', at } })
  })

  it('ignores a flag no longer listed, a value of another shape, and inherited properties', () => {
    const inherited = Object.create({ marketplace: { on: true } })
    expect(readStoredSwitches({ gone: { on: true }, usageBilling: { on: 'yes' }, marketplace: true })).toEqual({})
    expect(readStoredSwitches(inherited)).toEqual({})
    for (const raw of [null, 'x', 1, [], undefined]) expect(readStoredSwitches(raw)).toEqual({})
  })

  it('reads as the rule takes them', () => {
    const at = '2026-11-03T10:00:00.000Z'
    expect(switchesOf({ marketplace: { on: false, byUserId: null, at } })).toEqual({ marketplace: false })
  })
})

describe('reading the switches @SC-1768', () => {
  it('reads the database once every few seconds, and shares a read under way', async () => {
    vi.useFakeTimers()
    db.findFirst.mockResolvedValue({ featureSwitches: { marketplace: { on: true } } })
    expect(freshFeatureSwitches()).toBeNull()
    const [a, b] = await Promise.all([orgFeatureSwitches(), orgFeatureSwitches()])
    expect(a).toEqual({ marketplace: true })
    expect(b).toBe(a)
    expect(freshFeatureSwitches()).toEqual({ marketplace: true })
    await orgFeatureSwitches()
    expect(db.findFirst).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(SWITCHES_CACHE_MS + 1)
    expect(freshFeatureSwitches()).toBeNull()
    await orgFeatureSwitches()
    expect(db.findFirst).toHaveBeenCalledTimes(2)
  })

  it('reads again at once once forgotten, as after a switch changes', async () => {
    db.findFirst.mockResolvedValueOnce({ featureSwitches: {} }).mockResolvedValueOnce({ featureSwitches: { marketplace: { on: true } } })
    expect(await orgFeatureSwitches()).toEqual({})
    forgetFeatureSwitches()
    expect(await orgFeatureSwitches()).toEqual({ marketplace: true })
  })

  it('keeps no failed read: the caller sees the error, and the next asks again', async () => {
    db.findFirst.mockRejectedValueOnce(new Error('database down')).mockResolvedValueOnce(null)
    await expect(orgFeatureSwitches()).rejects.toThrow('database down')
    expect(await orgFeatureSwitches()).toEqual({})
  })

  it('decides a flag by the rule with them: a preview flag stays off in a test run unless switched on', async () => {
    db.findFirst.mockResolvedValueOnce(null)
    expect(await isOrgFeatureOn('marketplace')).toBe(false)
    forgetFeatureSwitches()
    db.findFirst.mockResolvedValueOnce({ featureSwitches: { marketplace: { on: true, byUserId: 'u1', at: 'x' } } })
    expect(await isOrgFeatureOn('marketplace')).toBe(true)
  })
})
