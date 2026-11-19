/**
 * False finishes stretch the wait (the owner's playtest of 18 Nov: 6 of 8 *sounds finished* calls came at 0.5 s of quiet,
 * and the person went on within a second). Under the light model each false finish this turn makes the sound model's
 * READY need 0.5 s more quiet before it ends the turn: 0.5, 1.0, 1.5, then 2.0 s at most, never past the pause cap; the count
 * starts afresh each turn. The scheduler and the pause timer, with the sound model's verdicts scripted.
 */
import { describe, expect, it } from 'vitest'
import type { VoiceEventBody } from '../../events'
import type { VoiceSettings } from '../../settings'
import { scheduler } from '../scheduler'
import { KEEPING_UP, playing, rig, silence } from './setup'

const LIGHT: VoiceSettings = { ...KEEPING_UP, voiceListener: true, adaptiveVoice: true }
const READY = (silenceMs = 500): VoiceEventBody => ({ kind: 'semantics.decision', answer: 'READY', confidence: 0.9, silenceMs, by: 'model' })

function setup(settings: VoiceSettings = LIGHT) {
  const r = rig([scheduler], ['orchestration.ready', 'orchestration.send', 'orchestration.falseFinish'], settings)
  const readies = () => r.of('orchestration.ready').map(({ t, waitedMs }) => ({ t, ...(waitedMs !== undefined && { waitedMs }) }))
  const finishes = () => r.of('orchestration.falseFinish').map(({ t, afterMs, count, waitMs }) => ({ t, afterMs, count, waitMs }))
  /** They speak from `at` for 1 s, words on screen, then go quiet; the sound model says READY at 0.5 s of quiet. */
  const sentence = (at: number, text = 'we left really early') => {
    r.at(at, silence(false))
    r.at(at + 100, { kind: 'stt.utterance', text })
    r.at(at + 1_000, silence(true))
    r.tickTo(at + 1_500)
    r.at(at + 1_500, READY())
  }
  return { ...r, readies, finishes, sentence }
}

describe('false finishes stretch the quiet READY waits for @SC-2230', () => {
  it('with none this turn, READY at 0.5 s of quiet ends the turn at once', () => {
    const s = setup()
    s.sentence(0)
    expect(s.readies()).toEqual([{ t: 1_500 }])
  })

  it('each false finish adds 0.5 s: 1.0 s, 1.5 s, then 2.0 s, and no more', () => {
    const s = setup()
    s.sentence(0)
    // They go on 0.4 s after the send: a false finish.
    s.sentence(1_900, 'about six in the morning')
    expect(s.finishes()).toEqual([{ t: 1_900, afterMs: 400, count: 1, waitMs: 1_000 }])
    // READY at 0.5 s of quiet (3.4 s) waits for 1.0 s of it.
    expect(s.readies()).toHaveLength(1)
    s.tickTo(3_850)
    expect(s.readies()).toHaveLength(1)
    s.tickTo(3_900)
    expect(s.readies()[1]).toEqual({ t: 3_900, waitedMs: 1_000 })

    s.sentence(4_200, 'first hour was easy')
    s.tickTo(6_700)
    expect(s.readies()[2]).toEqual({ t: 6_700, waitedMs: 1_500 })
    s.sentence(6_900, 'just forest')
    s.tickTo(9_900)
    expect(s.readies()[3]).toEqual({ t: 9_900, waitedMs: 2_000 })
    s.sentence(10_100, 'then it got steep')
    s.tickTo(13_100)
    expect(s.finishes().map(f => [f.count, f.waitMs])).toEqual([[1, 1_000], [2, 1_500], [3, 2_000], [4, 2_000]])
    expect(s.readies()[4]).toEqual({ t: 13_100, waitedMs: 2_000 })
  })

  it('speaking during the wait cancels that READY; a READY never sent is no false finish', () => {
    const s = setup()
    s.sentence(0)
    s.sentence(1_900, 'about six')
    s.at(3_600, silence(false))
    s.tickTo(4_500)
    expect(s.readies()).toHaveLength(1)
    expect(s.finishes()).toHaveLength(1)
  })

  it('going on more than 1 s after the send is no false finish', () => {
    const s = setup()
    s.sentence(0)
    s.sentence(2_600, 'and then')
    expect(s.finishes()).toEqual([])
    expect(s.readies()).toEqual([{ t: 1_500 }, { t: 4_100 }])
  })

  it('never waits past the pause cap: the cap still ends the turn', () => {
    const s = setup({ ...LIGHT, listener: { ...LIGHT.listener, finishWaitStepMs: 5_000, finishWaitMostMs: 10_000 } })
    s.sentence(0)
    s.sentence(1_900, 'about six')
    s.tickTo(6_000)
    expect(s.finishes()[0]!.waitMs).toBe(LIGHT.pause.capMs)
    expect(s.readies()).toHaveLength(2)
    expect(s.readies()[1]!.t).toBeLessThanOrEqual(2_900 + LIGHT.pause.capMs)
  })

  it('starts afresh at a new turn: once the reply is heard, or the light model closes the turn', () => {
    const s = setup()
    s.sentence(0)
    s.sentence(1_900, 'about six')
    s.tickTo(4_000)
    s.at(4_100, playing('r1'))
    s.sentence(10_000, 'thanks')
    expect(s.readies().at(-1)).toEqual({ t: 11_500 })

    const c = setup()
    c.sentence(0)
    c.sentence(1_900, 'about six')
    c.tickTo(4_000)
    c.at(4_100, { kind: 'listen.turn', state: 'closed' })
    c.sentence(10_000, 'thanks')
    expect(c.readies().at(-1)).toEqual({ t: 11_500 })
  })

  it('plain voice, without the light model, never waits longer', () => {
    const s = setup(KEEPING_UP)
    s.sentence(0)
    s.sentence(1_900, 'about six')
    expect(s.finishes()).toEqual([])
    expect(s.of('orchestration.send').map(e => e.t)).toEqual([1_500, 3_400])
  })
})
