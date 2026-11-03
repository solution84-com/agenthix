import { describe, expect, it } from 'vitest'
import {
  LIVE_PREVIEW_IDLE_MINUTES_DEFAULT, LIVE_PREVIEW_LIMIT_DEFAULT, LIVE_PREVIEW_LIMIT_MAX, LIVE_PREVIEW_STOP_REASONS,
  livePreviewIsLive, livePreviewLimitAllows, parseLivePreviewIdleMinutes, parseLivePreviewLimit,
} from '../livePreview.js'
import { GUARD_RESPONSE, GUARD_RESPONSES, GUARD_SIGNALS, parseGuardSignal } from '../guard.js'

describe('live previews at once @SC-1759', () => {
  it('has no limit by default, and stops none when a limit is lowered', () => {
    expect(LIVE_PREVIEW_LIMIT_DEFAULT).toBeNull()
    expect(livePreviewLimitAllows(null, 1000)).toBe(true)
    expect(livePreviewLimitAllows(2, 1)).toBe(true)
    expect(livePreviewLimitAllows(2, 5)).toBe(false)
  })

  it('reads a limit as a whole number in range, or null for none', () => {
    expect(parseLivePreviewLimit(null)).toBeNull()
    expect(parseLivePreviewLimit(6)).toBe(6)
    for (const bad of [0, LIVE_PREVIEW_LIMIT_MAX + 1, 2.5, '6', undefined]) expect(parseLivePreviewLimit(bad)).toBeUndefined()
  })
})

describe('the idle stop @SC-1759', () => {
  it('is two hours unless the fleet admin sets another', () => {
    expect(LIVE_PREVIEW_IDLE_MINUTES_DEFAULT).toBe(120)
    expect(parseLivePreviewIdleMinutes(30)).toBe(30)
    for (const bad of [0, 1, 30.5, null, '120']) expect(parseLivePreviewIdleMinutes(bad)).toBeUndefined()
  })
})

describe("a live preview's states @SC-1759", () => {
  it('is live until it stops, and says why it stopped', () => {
    const since = '2026-11-01T10:00:00.000Z'
    expect(livePreviewIsLive({ state: 'starting', since })).toBe(true)
    expect(livePreviewIsLive({ state: 'paused', since, reason: 'lineLost', signal: null, detail: 'x' })).toBe(true)
    expect(livePreviewIsLive({ state: 'stopped', since, reason: 'idle', signal: null, detail: 'x' })).toBe(false)
    for (const r of ['person', 'projectAdmin', 'fleetAdmin', 'idle', 'turnedOff', 'guard', 'resources']) {
      expect(LIVE_PREVIEW_STOP_REASONS).toContain(r)
    }
  })
})

describe('the guard @SC-1759', () => {
  it('has one response for every signal', () => {
    expect(Object.keys(GUARD_RESPONSE).sort()).toEqual([...GUARD_SIGNALS].sort())
    for (const response of Object.values(GUARD_RESPONSE)) expect(GUARD_RESPONSES).toContain(response)
    expect(GUARD_RESPONSE.offTemplate).toBe('stopPreview')
    expect(GUARD_RESPONSE.notMadeBySite).toBe('stopPreview')
    expect(GUARD_RESPONSE.guardDown).toBe('stopPreview')
    expect(GUARD_RESPONSE.blockedAddresses).toBe('pause')
  })

  it('reads only the signals it knows', () => {
    expect(parseGuardSignal('unexpectedPort')).toBe('unexpectedPort')
    expect(parseGuardSignal('gitWrite')).toBeNull()
    expect(parseGuardSignal('toString')).toBeNull()
  })
})
