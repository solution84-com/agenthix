/**
 * The hum service asked as a pause begins (spec §The backchannel): its answer, about the words shown then, replaces the
 * one held from while they spoke as soon as it comes; a hum due before it comes plays the held one. The floor, the hum
 * service and the backchannel together, the verdicts and hq's answers scripted.
 */
import { describe, expect, it } from 'vitest'
import type { VoiceEventBody } from '../../events'
import { floor } from '../../orchestration/floor'
import { rig, silence } from '../../orchestration/__tests__/setup'
import { humService } from '../service'
import { backchannel } from '../trigger'
import { WITH_SERVICE, verdict } from './backchannelRig'

const WORDS = 'so last weekend I finally went hiking up at the falls and we left really early about six in the morning'

function setup() {
  const r = rig([floor, humService, backchannel], ['hum.ask', 'hum.held', 'backchannel.hum', 'backchannel.miss'], WITH_SERVICE)
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
  const answer = (t: number, call: number, humKind: 'continuer' | 'none', ms = 400) =>
    at(t, { kind: 'hum.answer', call, humKind, tone: humKind === 'none' ? null : 'curious', ms })
  /** 5 s of speech, the words growing each 500 ms; each second's question answered `none` 400 ms later; a pause at 5 s. */
  at(0, silence(false))
  const all = WORDS.split(' ')
  for (let t = 100, n = 2; t < 5_000; t += 500, n += 2) at(t, { kind: 'stt.utterance', text: all.slice(0, n).join(' ') })
  for (let call = 1; call <= 5; call++) answer(call * 1_000 - 500, call, 'none')
  at(4_950, { kind: 'stt.utterance', text: WORDS })
  at(5_000, silence(true))
  const hums = () => r.of('backchannel.hum').map(({ t, hum, tone, from }) => ({ t, hum, tone, call: from?.call }))
  return { ...r, at, tickTo, answer, hums }
}

describe('the hum service asked as a pause begins @SC-2228', () => {
  it('its answer, come before the hum is due, is the one the hum plays', () => {
    const s = setup()
    s.answer(5_350, 6, 'continuer', 350)
    s.at(5_450, verdict('UNCERTAIN'))
    s.tickTo(5_600)
    expect(s.of('hum.ask').at(-1)).toMatchObject({ t: 5_000, call: 6, text: WORDS, atPause: true })
    expect(s.hums()).toEqual([{ t: 5_450, hum: 'continuer', tone: 'curious', call: 6 }])
  })

  it('a hum due before it comes plays the answer held, here none, so nothing plays', () => {
    const s = setup()
    s.at(5_450, verdict('UNCERTAIN'))
    s.answer(5_700, 6, 'continuer', 700)
    s.tickTo(5_800)
    expect(s.hums()).toEqual([])
    expect(s.of('backchannel.miss').map(m => m.why)).toEqual(['the hum service said none'])
  })
})
