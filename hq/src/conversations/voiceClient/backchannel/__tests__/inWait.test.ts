/**
 * A pause inside the false-finish wait may hum (spec §The backchannel, §When a turn ends): after a false finish this
 * turn, the sound model's READY is held until the quiet it needs, and the turn is not sent yet, so the pause is
 * hum-eligible under the ordinary pause rules, as for UNCERTAIN. Once the wait runs out, no hum; with no false finish
 * this turn (no wait), READY still means no hum. The floor, the scheduler and the backchannel, the verdicts scripted.
 */
import { describe, expect, it } from 'vitest'
import type { VoiceEventBody } from '../../events'
import { floor } from '../../orchestration/floor'
import { scheduler } from '../../orchestration/scheduler'
import { rig, silence } from '../../orchestration/__tests__/setup'
import type { VoiceSettings } from '../../settings'
import { backchannel } from '../trigger'
import { ON, verdict } from './backchannelRig'

function setup(settings: VoiceSettings = ON) {
  const r = rig([floor, scheduler, backchannel], ['backchannel.hum', 'backchannel.miss', 'orchestration.ready', 'orchestration.finishHeld'], settings)
  const hums = () => r.of('backchannel.hum').map(({ t, pausedMs, verdict: v, inWait }) => ({ t, pausedMs, verdict: v, ...(inWait && { inWait }) }))
  const misses = () => r.of('backchannel.miss').map(({ t, why }) => ({ t, why }))
  /** 5 s of speech, a READY at 0.5 s of quiet that is sent at once, and the person going on at once: a false finish. */
  const falseFinish = (sttWords?: VoiceEventBody) => {
    r.at(0, silence(false))
    r.at(100, { kind: 'stt.utterance', text: 'so last weekend I went hiking' })
    r.at(2_500, { kind: 'stt.utterance', text: 'so last weekend I went hiking up at' })
    r.at(4_800, { kind: 'stt.utterance', text: 'so last weekend I went hiking up at the falls.' })
    if (sttWords) r.at(4_900, sttWords)
    r.at(5_000, silence(true))
    r.tickTo(5_450)
    r.at(5_500, verdict('READY', 500, 0.95))
    r.at(5_600, silence(false))
  }
  /** Then 4 s more speech and a pause from 10 s, READY at 0.5 s of quiet: held until 11.0 s (one false finish, 1.0 s). */
  const breath = () => {
    r.at(5_700, { kind: 'stt.utterance', text: 'we left really early,' })
    r.at(7_500, { kind: 'stt.utterance', text: 'we left really early, about six' })
    r.at(9_800, { kind: 'stt.utterance', text: 'we left really early, about six in the morning.' })
    r.at(10_000, silence(true))
    r.tickTo(10_450)
    r.at(10_500, verdict('READY', 500, 0.92))
  }
  return { ...r, hums, misses, falseFinish, breath }
}

describe('a pause inside the false-finish wait may hum @SC-2230 @SC-2226', () => {
  it('hums while READY is held by the wait, and says it was in the wait', () => {
    const s = setup()
    s.falseFinish()
    s.breath()
    expect(s.of('orchestration.finishHeld')).toMatchObject([{ t: 10_500, waitMs: 1_000, until: 11_000 }])
    s.tickTo(10_550)
    expect(s.hums()).toEqual([{ t: 10_550, pausedMs: 550, verdict: 'READY', inWait: true }])
    // A second READY in the same pause is held by the same wait, said once.
    s.at(10_600, verdict('READY', 600, 0.93))
    s.tickTo(11_000)
    expect(s.of('orchestration.finishHeld')).toHaveLength(1)
    expect(s.of('orchestration.ready').map(e => e.t)).toEqual([5_500, 11_000])
  })

  /** The hum window opens at 1.1 s, after the 1.0 s wait: by then READY counts. */
  const LATE: VoiceSettings = { ...ON, backchannel: { ...ON.backchannel, pauseMs: 1_100 } }

  it('no hum once the wait has run out and the turn is sent, though the pause is still in the hum window', () => {
    const s = setup(LATE)
    s.falseFinish()
    s.breath()
    s.tickTo(11_250)
    expect(s.of('orchestration.ready').map(e => e.t)).toEqual([5_500, 11_000])
    s.at(11_300, silence(false))
    expect(s.hums()).toEqual([])
    expect(s.misses().filter(m => m.t > 10_000).map(m => m.why)).toEqual(['the sound model said finished'])
  })

  it('no hum once the wait has run out, even while the words are still awaited and nothing is sent', () => {
    // STT has not heard to the end of the speech: READY counts at 11.0 s, but the message waits for its words.
    const s = setup({ ...LATE, inbound: { ...LATE.inbound, readyHeardMs: 200, catchUpGraceMs: 5_000 } })
    s.falseFinish({ kind: 'stt.words', text: 'falls.', words: [{ text: 'falls.', startAt: 4_500, endAt: 4_950 }], committed: true, order: 1 })
    s.breath()
    s.tickTo(11_250)
    expect(s.of('orchestration.ready').map(e => e.t)).toEqual([5_500])
    expect(s.hums()).toEqual([])
  })

  it('READY with no false finish this turn still means no hum', () => {
    const s = setup()
    s.at(0, silence(false))
    s.at(100, { kind: 'stt.utterance', text: 'so last weekend I went hiking' })
    s.at(4_800, { kind: 'stt.utterance', text: 'so last weekend I went hiking up at the falls.' })
    s.at(5_000, silence(true))
    s.tickTo(5_450)
    s.at(5_500, verdict('READY', 500, 0.95))
    s.tickTo(6_200)
    expect(s.of('orchestration.finishHeld')).toEqual([])
    expect(s.hums()).toEqual([])
  })

  it('the person going on ends the wait: the next pause\'s READY is held afresh', () => {
    const s = setup()
    s.falseFinish()
    s.breath()
    s.tickTo(10_550)
    s.at(10_700, silence(false))
    s.at(12_500, { kind: 'stt.utterance', text: 'the first hour was easy' })
    s.at(14_400, { kind: 'stt.utterance', text: 'the first hour was easy, just forest.' })
    s.at(14_600, silence(true))
    s.tickTo(15_050)
    s.at(15_100, verdict('READY', 500, 0.9))
    s.tickTo(15_200)
    s.at(15_300, silence(false))
    // Only 3.9 s of speech since the hum at 10.55 s: held back by the count, not by READY.
    expect(s.hums()).toHaveLength(1)
    expect(s.misses().filter(m => m.t > 10_000).map(m => m.why)).toEqual(["only 3.9 s of speech since the agent's last sound"])
    expect(s.of('orchestration.finishHeld').map(e => e.until)).toEqual([11_000, 15_600])
  })
})
