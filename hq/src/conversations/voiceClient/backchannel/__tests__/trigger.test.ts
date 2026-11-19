/**
 * The backchannel's rules (adaptive voice listening, spec §The backchannel): a hum is due in a pause of 0.4 to 1.2 s
 * the sound model says is not the end, after 4 s of the person's speech since the agent's last sound; never twice in a
 * pause, never after a question, never while the agent speaks or its audio plays; only with Adaptive voice on.
 */
import { describe, expect, it } from 'vitest'
import { playing, silence, stopped } from '../../orchestration/__tests__/setup'
import { ON, setup, verdict } from './backchannelRig'

describe('when the backchannel hums @SC-2226', () => {
  it('in a pause the sound model says is not the end, after 4 s of speech, as soon as its verdict comes', () => {
    const s = setup()
    s.talk(0, 4_500)
    s.tickTo(5_600)
    expect(s.hums()).toEqual([{ t: 5_050, pausedMs: 550, speechMs: 4_500, verdict: 'UNCERTAIN' }])
  })

  it('counts their speech, not the time: pauses between do not count', () => {
    const s = setup()
    s.talk(0, 2_000)
    s.tickTo(4_000)
    s.talk(4_000, 5_500)
    s.tickTo(7_000)
    expect(s.hums()).toEqual([])
    s.talk(7_000, 8_000)
    s.tickTo(9_000)
    expect(s.hums()).toMatchObject([{ speechMs: 4_500 }])
  })

  it('not when the sound model says they finished, nor before it says anything', () => {
    const s = setup()
    s.talk(0, 4_500, 'and that was it', 'READY')
    s.tickTo(5_600)
    s.at(6_000, silence(false))
    s.at(12_000, silence(true))
    s.tickTo(13_300)
    expect(s.hums()).toEqual([])
  })

  it('not in a pause past 1.2 s: a verdict that comes late gets none', () => {
    const s = setup()
    s.at(0, silence(false))
    s.at(4_500, silence(true))
    s.tickTo(5_750)
    s.at(5_750, verdict('KEEP_LISTENING', 1_250))
    s.tickTo(6_500)
    expect(s.hums()).toEqual([])
  })

  it('once a pause; the next pause may have one, spaced by the speech count alone', () => {
    const s = setup({ ...ON, backchannel: { ...ON.backchannel, speechMs: 2_000 } })
    s.talk(0, 4_500)
    s.tickTo(5_700)
    expect(s.hums()).toHaveLength(1)
    s.talk(6_000, 8_500)
    s.tickTo(9_600)
    expect(s.hums()).toHaveLength(2)
  })

  it('not right after a question they asked', () => {
    const s = setup()
    s.talk(0, 4_500, 'so what do you think?')
    s.tickTo(5_600)
    s.talk(6_000, 11_000, 'and can you tell me what happened next')
    s.tickTo(12_300)
    expect(s.hums()).toEqual([])
  })

  it('never while the agent speaks, and the agent\'s sound starts their speech counting again', () => {
    const s = setup()
    s.at(0, silence(false))
    s.at(3_000, playing('r1'))
    s.at(3_100, stopped('r1', false))
    s.at(5_000, silence(true))
    s.tickTo(5_450)
    s.at(5_500, verdict('UNCERTAIN'))
    s.tickTo(6_300)
    expect(s.hums()).toEqual([])
  })

  it('never while a line or stored phrase of the agent\'s plays', () => {
    const s = setup()
    s.talk(0, 4_500)
    s.at(4_950, { kind: 'phrase.at', text: 'Right.', playing: true, lineId: 'L1' })
    s.tickTo(5_800)
    expect(s.hums()).toEqual([])
  })

  it('never while the agent holds the floor, its reply being worked out', () => {
    const s = setup()
    s.talk(0, 4_500)
    s.at(4_950, { kind: 'orchestration.send', text: 'x', append: false, via: 'listen' })
    s.tickTo(5_800)
    expect(s.hums()).toEqual([])
  })

  it('only with Adaptive voice and the light model on, the backchannel switched on, and until hq says no light model listens', () => {
    for (const settings of [
      { ...ON, adaptiveVoice: false }, { ...ON, voiceListener: false }, { ...ON, backchannel: { ...ON.backchannel, on: false } },
    ]) {
      const s = setup(settings)
      s.talk(0, 4_500)
      s.tickTo(5_600)
      expect(s.hums()).toEqual([])
      expect(s.misses()).toEqual([])
    }
    const s = setup()
    s.at(0, { kind: 'listen.answer', call: 1, action: 'keep_listening', nextCheckSecs: 5, off: true })
    s.talk(0, 4_500)
    s.tickTo(5_600)
    expect(s.hums()).toEqual([])
  })
})
