/**
 * Every cap and first value in one object (spec §The light model, §When a turn ends, §The recap), and the playground's
 * way to change any of them: a partial set of values, merged and held within each setting's limits.
 */
import { describe, expect, it } from 'vitest'
import { LISTENER_SETTINGS, LISTENER_SETTING_LIMITS, listenerSettingsWith } from '../settings'

describe('the first values @SC-2222', () => {
  it('are the corrected spec\'s', () => {
    expect(LISTENER_SETTINGS.caps).toEqual({ acknowledge: 6, invite: 6, close_turn: 6, hold: 12, answer: 15 })
    expect(LISTENER_SETTINGS.schedule).toEqual({ quietFirst: 5, quietSecond: 15, quietThird: 30, workingFirst: 4, workingEvery: 8 })
    expect(LISTENER_SETTINGS).not.toHaveProperty('quietAfterWordsMs')
    expect(LISTENER_SETTINGS.soundsFinishedTimeoutMs).toBe(2000)
    expect(LISTENER_SETTINGS.callTimeoutMs).toBe(2000)
    expect(LISTENER_SETTINGS.notYetMaxSilenceMs).toBe(60_000)
    expect(LISTENER_SETTINGS.recentExchanges).toBe(6)
    expect(LISTENER_SETTINGS.recentLines).toBe(5)
    expect(LISTENER_SETTINGS.recapMaxWords).toBe(100)
    expect(LISTENER_SETTINGS.format).toBe('json')
    expect(LISTENER_SETTINGS.withAnswer).toBe(true)
  })

  it('every number has limits the playground shows, and the first value is within them', () => {
    const paths: [string, number][] = []
    const walk = (o: object, at: string) => {
      for (const [k, v] of Object.entries(o)) {
        const path = at ? `${at}.${k}` : k
        if (typeof v === 'number') paths.push([path, v])
        else if (v && typeof v === 'object') walk(v, path)
      }
    }
    walk(LISTENER_SETTINGS, '')
    for (const [path, value] of paths) {
      const limits = LISTENER_SETTING_LIMITS[path]
      expect(limits, path).toBeDefined()
      expect(value, path).toBeGreaterThanOrEqual(limits.min)
      expect(value, path).toBeLessThanOrEqual(limits.max)
    }
    expect(Object.keys(LISTENER_SETTING_LIMITS).sort()).toEqual(paths.map(([p]) => p).sort())
  })
})

describe('listenerSettingsWith @SC-2222', () => {
  it('changes only what it is given', () => {
    const s = listenerSettingsWith({ caps: { hold: 10 }, soundsFinishedTimeoutMs: 1500, format: 'tools', withAnswer: false })
    expect(s.caps).toEqual({ ...LISTENER_SETTINGS.caps, hold: 10 })
    expect(s.soundsFinishedTimeoutMs).toBe(1500)
    expect(s.format).toBe('tools')
    expect(s.withAnswer).toBe(false)
    expect(s.recentLines).toBe(LISTENER_SETTINGS.recentLines)
  })

  it('holds every number within its limits, and whole where it counts', () => {
    const s = listenerSettingsWith({ caps: { acknowledge: 0, hold: 500 }, recentExchanges: 2.6, callTimeoutMs: -1 })
    expect(s.caps.acknowledge).toBe(LISTENER_SETTING_LIMITS['caps.acknowledge'].min)
    expect(s.caps.hold).toBe(LISTENER_SETTING_LIMITS['caps.hold'].max)
    expect(s.recentExchanges).toBe(3)
    expect(s.callTimeoutMs).toBe(LISTENER_SETTING_LIMITS.callTimeoutMs.min)
  })

  it('ignores what is not a number where a number belongs, and keeps the quiet\'s checks in order', () => {
    const s = listenerSettingsWith({ caps: { acknowledge: Number.NaN }, schedule: { quietFirst: 40, quietSecond: Number.NaN, quietThird: 10 } })
    expect(s.caps.acknowledge).toBe(LISTENER_SETTINGS.caps.acknowledge)
    expect([s.schedule.quietFirst, s.schedule.quietSecond, s.schedule.quietThird]).toEqual([10, 15, 40])
  })

  it('never changes the first values themselves', () => {
    listenerSettingsWith({ caps: { acknowledge: 1 } })
    expect(LISTENER_SETTINGS.caps.acknowledge).toBe(6)
  })
})
