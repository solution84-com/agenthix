/**
 * The backchannel hums as the light model keeps the turn open (spec §The backchannel): a *sounds finished* call
 * answered "not yet" with no line of its own means they paused at a sentence end mid-telling. It hums then, though the
 * sound model said finished, if the speech count allows; never with a line, never once they speak again.
 */
import { describe, expect, it } from 'vitest'
import { silence } from '../../orchestration/__tests__/setup'
import { answer, finished, setup, verdict } from './backchannelRig'

/** 5 s of speech, a pause the sound model calls finished, the turn sent at 0.8 s. */
function sentence(s: ReturnType<typeof setup>, text = 'and then we walked on to the falls.') {
  s.at(0, silence(false))
  s.at(100, { kind: 'stt.utterance', text })
  s.at(5_000, silence(true))
  s.tickTo(5_450)
  s.at(5_500, verdict('READY'))
  s.tickTo(5_800)
  s.all(5_800, finished(1, text))
}

describe('a hum as the light model keeps the turn open @SC-2226', () => {
  it('hums on the next tick after a "not yet" with no line, though the sound model said finished', () => {
    const s = setup()
    sentence(s)
    s.tickTo(6_500)
    expect(s.hums()).toEqual([])
    s.all(6_520, answer(1, 'notYet'))
    s.tickTo(6_700)
    expect(s.hums()).toEqual([{ t: 6_570, pausedMs: 1_570, speechMs: 5_000, verdict: 'READY', notYet: true }])
  })

  it('once for a call: the same answer delivered again hums nothing more', () => {
    const s = setup()
    sentence(s)
    s.all(6_520, answer(1, 'notYet'))
    s.tickTo(6_700)
    s.all(6_720, answer(1, 'notYet'))
    s.tickTo(7_000)
    expect(s.hums()).toHaveLength(1)
  })

  it('never when the answer carries a line: one sound at a time', () => {
    const s = setup()
    sentence(s)
    s.all(6_520, answer(1, 'line'))
    s.tickTo(7_000)
    expect(s.hums()).toEqual([])
    expect(s.misses()).toEqual([{ t: 6_520, why: 'the light model said a line of its own' }])
  })

  it('never on a hand over, which ended the turn: no near miss either', () => {
    const s = setup()
    sentence(s)
    s.all(6_520, answer(1, 'handedOver'))
    s.tickTo(7_000)
    s.at(9_000, silence(false))
    expect(s.hums()).toEqual([])
    expect(s.misses()).toEqual([])
  })

  it('not once they speak again before the answer', () => {
    const s = setup()
    sentence(s)
    s.at(6_200, silence(false))
    s.all(6_520, answer(1, 'notYet'))
    s.tickTo(7_000)
    expect(s.hums()).toEqual([])
    expect(s.misses()).toEqual([{ t: 6_570, why: 'you spoke again before the light model said not yet' }])
  })

  it('only as the speech count allows', () => {
    const s = setup()
    s.at(0, silence(false))
    s.at(2_000, silence(true))
    s.tickTo(2_450)
    s.at(2_500, verdict('READY'))
    s.all(2_800, finished(1, 'I went hiking.'))
    s.all(3_500, answer(1, 'notYet'))
    s.tickTo(3_700)
    expect(s.hums()).toEqual([])
    expect(s.misses()).toEqual([{ t: 3_550, why: "only 2.0 s of speech since the agent's last sound" }])
  })

  it('not after a question, nor on an answer to a later check in the quiet', () => {
    const s = setup()
    sentence(s, 'so what do you think?')
    s.all(6_520, answer(1, 'notYet'))
    s.tickTo(7_000)
    expect(s.misses()).toEqual([{ t: 6_570, why: 'after a question' }])
    const q = setup()
    sentence(q)
    q.all(6_520, [{ kind: 'listen.ask', call: 2, moment: 'quiet', text: 'x', quietMs: 5_000, keptOpen: true }])
    q.all(6_600, answer(2, 'notYet'))
    q.tickTo(7_000)
    expect(q.hums()).toEqual([])
  })
})
