/**
 * The hum service's cadence in the browser (adaptive voice listening, spec §The backchannel): while the person speaks,
 * their turn's words go to hq about once a second; one question at a time, a second skipped while one is in flight; an
 * answer older than 2 s dropped; none in silence, while the agent speaks, or with it off; the latest answer held.
 */
import { describe, expect, it } from 'vitest'
import type { VoiceEventBody } from '../../events'
import { floor } from '../../orchestration/floor'
import { playing, rig, silence, stopped } from '../../orchestration/__tests__/setup'
import type { VoiceSettings } from '../../settings'
import { humService } from '../service'
import { WITH_SERVICE as ON } from './backchannelRig'

function setup(settings: VoiceSettings = ON) {
  const r = rig([floor, humService], ['hum.ask', 'hum.held', 'hum.dropped'], settings)
  const asks = () => r.of('hum.ask').map(({ t, call, text, skipped }) => ({ t, call, text, skipped }))
  // What happens when, delivered in time order between the runtime's 50 ms ticks.
  const planned: [number, VoiceEventBody][] = []
  let now = 0
  const at = (t: number, body: VoiceEventBody) => { planned.push([t, body]) }
  const tickTo = (until: number) => {
    planned.sort((a, b) => a[0] - b[0])
    for (let next = now + 50; next <= until; next += 50) {
      while (planned.length && planned[0]![0] <= next) { const [t, body] = planned.shift()!; r.at(t, body) }
      r.at(next, { kind: 'clock.tick' })
      now = next
    }
  }
  const answer = (t: number, call: number, kind: 'continuer' | 'sympathy' | 'none' | null, ms = 400, failed?: 'off' | 'timeout' | 'failed') =>
    at(t, { kind: 'hum.answer', call, humKind: kind, tone: kind === 'sympathy' ? 'gentle' : kind ? 'calm' : null, ms, ...(failed && { failed }) })
  /** They speak from `from`, their words on screen at once and growing each 500 ms. */
  const speak = (from: number, to: number, words = 'so last weekend I went hiking up at the falls and on and on we went') => {
    at(from, silence(false))
    const all = words.split(' ')
    for (let t = from + 100, n = 2; t < to; t += 500, n += 2) at(t, { kind: 'stt.utterance', text: all.slice(0, n).join(' ') })
  }
  return { ...r, at, tickTo, asks, answer, speak }
}

describe('the hum service\'s cadence @SC-2228', () => {
  it('asks about once a second while they speak, with their turn\'s words so far', () => {
    const s = setup()
    s.speak(0, 3_000)
    s.answer(450, 1, 'continuer')
    s.answer(1_450, 2, 'continuer')
    s.tickTo(2_900)
    expect(s.asks().map(a => [a.t, a.call])).toEqual([[100, 1], [1_100, 2], [2_100, 3]])
    expect(s.asks().map(a => a.text)).toEqual(['so last', 'so last weekend I went hiking', 'so last weekend I went hiking up at the falls'])
  })

  it('runs one question at a time: a second is skipped while one is in flight, and counted', () => {
    const s = setup()
    s.speak(0, 5_000)
    s.tickTo(1_900)
    expect(s.asks()).toHaveLength(1)
    s.answer(1_960, 1, 'continuer')
    s.tickTo(2_300)
    expect(s.asks()).toHaveLength(2)
    expect(s.asks()[1]).toMatchObject({ call: 2, skipped: 1 })
  })

  it('drops an answer that came more than 2 s after its question, and asks again once one is that late', () => {
    const s = setup()
    s.speak(0, 6_000)
    s.tickTo(2_050)
    expect(s.asks()).toHaveLength(1)
    s.tickTo(2_400)
    // The question of 0.1 s is given up at 2.1 s: that second asks again.
    expect(s.asks()).toHaveLength(2)
    s.answer(2_450, 1, 'sympathy')
    s.tickTo(2_500)
    expect(s.of('hum.held')).toEqual([])
    expect(s.of('hum.dropped')).toMatchObject([{ call: 1, humKind: 'sympathy' }])
  })

  it('holds each answer in time, with when its question was asked and how long the call took', () => {
    const s = setup()
    s.speak(0, 3_000)
    s.answer(560, 1, 'sympathy', 410)
    s.tickTo(600)
    expect(s.of('hum.held')).toMatchObject([{ call: 1, humKind: 'sympathy', tone: 'gentle', askedAt: 100, ms: 410 }])
  })

  it('holds nothing new for a failed or timed out answer, and stops asking once hq says there is no hum service', () => {
    const s = setup()
    s.speak(0, 6_000)
    s.answer(500, 1, null, 2_000, 'timeout')
    s.tickTo(600)
    expect(s.of('hum.held')).toMatchObject([{ humKind: null, tone: null, fallback: 'timeout' }])
    s.answer(1_400, 2, null, 0, 'off')
    s.tickTo(1_500)
    expect(s.of('hum.held').at(-1)).toMatchObject({ humKind: null, fallback: 'off' })
    s.tickTo(5_000)
    expect(s.asks()).toHaveLength(2)
  })

  it('asks nothing in silence, while the agent speaks, or with the service, the backchannel or Adaptive voice off', () => {
    const quiet = setup()
    quiet.speak(0, 1_000)
    quiet.at(1_000, silence(true))
    quiet.answer(900, 1, 'continuer')
    quiet.tickTo(4_000)
    // The second is the pause's own, as it began; none after it.
    expect(quiet.asks().map(a => a.t)).toEqual([100, 1_000])

    const over = setup()
    over.at(0, playing('r1'))
    over.speak(10, 3_000)
    over.tickTo(3_000)
    over.at(3_000, stopped('r1', true))
    expect(over.asks()).toEqual([])

    for (const settings of [
      { ...ON, backchannel: { ...ON.backchannel, serviceOn: false } },
      { ...ON, backchannel: { ...ON.backchannel, on: false } },
      { ...ON, adaptiveVoice: false },
    ]) {
      const off = setup(settings)
      off.speak(0, 3_000)
      off.tickTo(3_000)
      expect(off.asks()).toEqual([])
    }
  })

  it('asks the next second only when their words have grown', () => {
    const s = setup()
    s.at(0, silence(false))
    s.at(100, { kind: 'stt.utterance', text: 'and then' })
    s.answer(500, 1, 'none')
    s.tickTo(3_000)
    expect(s.asks()).toHaveLength(1)
    s.at(3_060, { kind: 'stt.utterance', text: 'and then she fell' })
    s.tickTo(3_400)
    expect(s.asks().map(a => a.text)).toEqual(['and then', 'and then she fell'])
  })

  it('keeps a question through a send, since the turn may stay open, and forgets it once the turn ends @SC-2228', () => {
    const s = setup()
    s.speak(0, 1_000)
    s.at(500, { kind: 'stt.utterance', text: '' })
    s.answer(600, 1, 'sympathy')
    s.tickTo(700)
    expect(s.of('hum.held')).toHaveLength(1)

    const ended = setup()
    ended.speak(0, 1_000)
    ended.at(500, { kind: 'listen.turn', state: 'handedOver' })
    ended.answer(600, 1, 'sympathy')
    ended.tickTo(700)
    expect(ended.of('hum.held')).toEqual([])
    expect(ended.of('hum.dropped')).toHaveLength(1)
  })

  it('asks about the whole turn so far: the words a "not yet" kept, then the new ones', () => {
    const s = setup()
    s.at(0, silence(false))
    s.at(100, { kind: 'stt.utterance', text: 'we left really early' })
    s.at(900, silence(true))
    s.at(1_000, { kind: 'orchestration.send', text: 'we left really early', append: false, via: 'listen' })
    s.at(1_000, { kind: 'stt.utterance', text: '' })
    s.at(2_000, silence(false))
    s.at(2_100, { kind: 'stt.utterance', text: 'about six' })
    s.tickTo(3_000)
    expect(s.asks().map(a => a.text)).toEqual(['we left really early', 'we left really early about six'])
  })

  it('asks once more as a pause begins, on the words shown then, marked as the pause\'s', () => {
    const s = setup()
    s.speak(0, 1_600)
    s.answer(500, 1, 'none')
    s.answer(1_450, 2, 'none')
    s.at(1_500, { kind: 'stt.utterance', text: 'so last weekend I went hiking up' })
    s.at(1_600, silence(true))
    s.answer(1_950, 3, 'continuer', 350)
    s.tickTo(2_000)
    expect(s.of('hum.ask').map(({ t, call, text, atPause }) => ({ t, call, text, ...(atPause && { atPause }) }))).toEqual([
      { t: 100, call: 1, text: 'so last' }, { t: 1_100, call: 2, text: 'so last weekend I went hiking' },
      { t: 1_600, call: 3, text: 'so last weekend I went hiking up', atPause: true },
    ])
    expect(s.of('hum.held').map(({ call, humKind, atPause }) => ({ call, humKind, ...(atPause && { atPause }) }))).toEqual([
      { call: 1, humKind: 'none' }, { call: 2, humKind: 'none' }, { call: 3, humKind: 'continuer', atPause: true },
    ])
  })

  it('asks nothing at the pause while a call is in flight, whose answer then stands, nor on words already asked about', () => {
    const inFlight = setup()
    inFlight.speak(0, 1_300)
    inFlight.answer(500, 1, 'none')
    inFlight.at(1_250, { kind: 'stt.utterance', text: 'so last weekend I went hiking up' })
    inFlight.at(1_300, silence(true))
    inFlight.answer(1_500, 2, 'continuer')
    inFlight.tickTo(2_000)
    expect(inFlight.asks().map(a => a.t)).toEqual([100, 1_100])

    const same = setup()
    same.at(0, silence(false))
    same.at(100, { kind: 'stt.utterance', text: 'and then we walked on' })
    same.answer(500, 1, 'continuer')
    same.at(900, silence(true))
    same.tickTo(1_500)
    expect(same.asks().map(a => a.t)).toEqual([100])
  })

  it('a pause-start question late past 2 s is dropped, and the drop says it was the pause\'s', () => {
    const s = setup()
    s.speak(0, 1_600)
    s.answer(500, 1, 'none')
    s.answer(1_450, 2, 'none')
    s.at(1_500, { kind: 'stt.utterance', text: 'so last weekend I went hiking up' })
    s.at(1_600, silence(true))
    s.answer(3_700, 3, 'continuer', 2_100)
    s.tickTo(3_800)
    expect(s.of('hum.dropped').map(({ call, atPause }) => ({ call, atPause }))).toEqual([{ call: 3, atPause: true }])
  })
})


describe('the listening read\'s last sounds @SC-2228', () => {
  it('tells each question the words of the last three sounds the agent made in this conversation, oldest first', () => {
    const s = setup()
    s.speak(0, 3_000)
    s.answer(450, 1, 'continuer')
    for (const [t, text] of [[600, 'Mm-hm.'], [700, null], [800, 'Right.'], [900, 'Oh no.'], [1_000, 'Okay.']] as const) {
      s.at(t, { kind: 'backchannel.played', text, ...(text === null && { why: 'a line was playing' }) })
    }
    s.tickTo(1_200)
    expect(s.of('hum.ask').map(a => a.recent)).toEqual([undefined, ['Right.', 'Oh no.', 'Okay.']])
  })
})
