/**
 * hq's schedule of checks (adaptive voice listening, spec §When it is asked): hq decides when the light model is asked
 * again, the light model only what it says. A turn kept open is checked at 5, 15 and 30 s of quiet, then at the 60 s
 * limit; while the heavy model works, at 4 s and then every 8 s.
 */
import { describe, expect, it } from 'vitest'
import { LISTENER_SETTINGS, listenerSettingsWith, type ListenerSettings } from '../../listener'
import { isLastQuietCheck, nextCheckSecs } from '../schedule'

const quiet = (quietMs: number, s: ListenerSettings = LISTENER_SETTINGS) => nextCheckSecs({ kind: 'quiet', quietMs }, s)
const working = (workingMs: number, s: ListenerSettings = LISTENER_SETTINGS) => nextCheckSecs({ kind: 'working', workingMs }, s)

describe('the schedule in a quiet', () => {
  it('has its first values in the listener settings', () => {
    expect(LISTENER_SETTINGS.schedule).toEqual({ quietFirst: 5, quietSecond: 15, quietThird: 30, workingFirst: 4, workingEvery: 8 })
  })

  it('asks at 5, 15 and 30 s of quiet, in that order, then at the limit', () => {
    let at = 700
    const times: number[] = []
    for (let i = 0; i < 4; i++) {
      at += quiet(at) * 1000
      times.push(at)
    }
    expect(times).toEqual([5000, 15_000, 30_000, LISTENER_SETTINGS.notYetMaxSilenceMs])
  })

  it('counts from the quiet now, so a slow call does not push the check later', () => {
    expect(quiet(1500)).toBe(3.5)
    expect(quiet(5800)).toBeCloseTo(9.2)
    expect(quiet(16_000)).toBe(14)
  })

  it('never waits less than a second, even just before a check is due', () => {
    expect(quiet(4600)).toBe(1)
  })

  it('past the limit, keeps the last gap', () => {
    expect(quiet(60_000)).toBe(30)
    expect(quiet(75_000)).toBe(30)
  })

  it('starts again from the first check when new words reset the quiet', () => {
    expect(quiet(15_000)).toBe(15)
    expect(quiet(300)).toBe(4.7)
  })

  it('follows the Tuning: changed values, held in order', () => {
    const s = listenerSettingsWith({ schedule: { quietFirst: 20, quietSecond: 3, quietThird: 10 } })
    expect([s.schedule.quietFirst, s.schedule.quietSecond, s.schedule.quietThird]).toEqual([3, 10, 20])
    expect(quiet(500, s)).toBe(2.5)
    expect(quiet(3000, s)).toBe(7)
  })

  it('knows the last check before the limit', () => {
    expect(isLastQuietCheck(30_000, LISTENER_SETTINGS)).toBe(true)
    expect(isLastQuietCheck(31_200, LISTENER_SETTINGS)).toBe(true)
    expect(isLastQuietCheck(29_700, LISTENER_SETTINGS)).toBe(true)
    expect(isLastQuietCheck(15_000, LISTENER_SETTINGS)).toBe(false)
    expect(isLastQuietCheck(5000, LISTENER_SETTINGS)).toBe(false)
    expect(isLastQuietCheck(60_000, LISTENER_SETTINGS)).toBe(false)
  })
})

describe('the schedule while the heavy model works', () => {
  it('asks at 4 s, then every 8 s', () => {
    let at = 0
    const times: number[] = []
    for (let i = 0; i < 4; i++) {
      at += working(at) * 1000
      times.push(at)
    }
    expect(times).toEqual([4000, 12_000, 20_000, 28_000])
  })

  it('keeps the cadence when a check came late', () => {
    expect(working(5000)).toBe(7)
    expect(working(12_500)).toBe(7.5)
  })
})
