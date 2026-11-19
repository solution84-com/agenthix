/**
 * Adaptive pacing's estimate (spec §When a turn ends → *Adaptive pacing*): from the person's most recent 12 breaths,
 * once there are 5, the finish wait is just past 9 in 10 of them (+0.2 s, within 0.5–2.5 s) and the hum window's latest
 * start is 8 in 10 of them (within 0.8–2.0 s); the false-finish steps step up from the learned wait; `patient` adds 1 s.
 */
import { describe, expect, it } from 'vitest'
import { VOICE_SETTINGS, type VoiceSettings } from '../../settings'
import { finishWaitNow, inForce, learnedOf, shareUnder, withBreath } from '../pace'
import { PACING_SETTINGS, readPacing } from '../settings'

const P = PACING_SETTINGS
const LIGHT: VoiceSettings = { ...VOICE_SETTINGS, voiceListener: true, adaptiveVoice: true }

describe('the share of breaths under a length', () => {
  it('is the nearest rank: 9 in 10 of ten breaths is the ninth', () => {
    const ten = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1_000]
    expect(shareUnder(ten, 90)).toBe(900)
    expect(shareUnder(ten, 80)).toBe(800)
    expect(shareUnder([1_300, 200, 700], 90)).toBe(1_300)
  })
})

describe('what the breaths set @SC-2231', () => {
  it('nothing before 5 breaths: today\'s fixed values', () => {
    expect(learnedOf([700, 800, 900, 1_000], P)).toBeNull()
    expect(learnedOf([700, 800, 900, 1_000, 1_100], P)).not.toBeNull()
  })

  it('the finish wait is just past 9 in 10 of them (+0.2 s); hums up to 8 in 10 of them', () => {
    // The owner's pace of 18 Nov: 9 in 10 under 1.5 s, 8 in 10 under 1.3 s.
    const breaths = [300, 500, 600, 700, 700, 900, 1_100, 1_200, 1_300, 1_300, 1_500, 2_600]
    expect(learnedOf(breaths, P)).toMatchObject({ finishShareMs: 1_500, finishWaitMs: 1_700, humShareMs: 1_300, latestPauseMs: 1_300 })
  })

  it('keeps only the most recent 12, so it follows the talk as it goes', () => {
    let breaths: number[] = []
    for (let i = 0; i < 12; i++) breaths = withBreath(breaths, 2_000, P)
    for (let i = 0; i < 12; i++) breaths = withBreath(breaths, 400, P)
    expect(breaths).toHaveLength(12)
    expect(learnedOf(breaths, P)!.finishWaitMs).toBe(600)
  })

  it('holds each within its limits: wait 0.5–2.5 s, hum window 0.8–2.0 s', () => {
    const quick = learnedOf([100, 150, 200, 200, 250], P)!
    expect(quick).toMatchObject({ finishWaitMs: 500, latestPauseMs: 800 })
    const slow = learnedOf([2_800, 2_900, 2_900, 3_000, 3_000], P)!
    expect(slow).toMatchObject({ finishWaitMs: 2_500, latestPauseMs: 2_000 })
  })

  it('the limits are Tuning settings, an upper limit never under its lower one', () => {
    const p = readPacing({ finishMinMs: 1_000, finishMaxMs: 600, humSharePct: 70, minBreaths: 3, keep: 2 })
    expect(p).toMatchObject({ finishMinMs: 1_000, finishMaxMs: 1_000, humSharePct: 70, minBreaths: 3, keep: 3 })
    expect(readPacing('junk')).toEqual(PACING_SETTINGS)
  })

  it('is not in force with adaptive pacing switched off', () => {
    const learned = learnedOf([900, 900, 900, 900, 900], P)
    expect(inForce(learned, LIGHT)).toBe(learned)
    expect(inForce(learned, { ...LIGHT, pacing: { ...P, on: false } })).toBeNull()
  })
})

describe('the quiet READY waits for', () => {
  const learned = learnedOf([1_500, 1_500, 1_500, 1_500, 1_500], P)!

  it('with nothing learned, no false finish and no patience, nothing changes: READY counts as it comes', () => {
    expect(finishWaitNow(LIGHT, null, 0, false)).toEqual({ waitMs: 500, applies: false })
  })

  it('starts at the learned wait in every turn; the false finishes step up from it (1.7 → 2.2 → 2.5)', () => {
    expect(finishWaitNow(LIGHT, learned, 0, false)).toEqual({ waitMs: 1_700, applies: true })
    expect(finishWaitNow(LIGHT, learned, 1, false).waitMs).toBe(2_200)
    expect(finishWaitNow(LIGHT, learned, 2, false).waitMs).toBe(2_500)
    expect(finishWaitNow(LIGHT, learned, 5, false).waitMs).toBe(2_500)
  })

  it('a quick speaker\'s steps start low (0.8 → 1.3 → 1.8)', () => {
    const quick = learnedOf([400, 500, 500, 600, 600], P)
    expect([0, 1, 2].map(n => finishWaitNow(LIGHT, quick, n, false).waitMs)).toEqual([800, 1_300, 1_800])
  })

  it('patient adds 1.0 s on top of the learned wait, and applies without one; never past the 3 s pause cap', () => {
    expect(finishWaitNow(LIGHT, learned, 0, true)).toEqual({ waitMs: 2_700, applies: true })
    expect(finishWaitNow(LIGHT, null, 0, true)).toEqual({ waitMs: 1_500, applies: true })
    expect(finishWaitNow(LIGHT, learned, 1, true).waitMs).toBe(3_000)
  })
})
