/**
 * The voice profile in the backchannel (spec §Hum timing, the laugh): a laugh heard in the person's voice lets the next
 * pause laugh back, under the reaction spacing, whatever the hum service said; and a hum plays the read's own tone.
 */
import { describe, expect, it } from 'vitest'
import type { VoiceEventBody } from '../../events'
import { KEEPING_UP, silence } from '../../orchestration/__tests__/setup'
import type { VoiceSettings } from '../../settings'
import type { HumTone } from '../kinds'
import { setup, verdict } from './backchannelRig'

/** The product's defaults: plain hums after 6 s of speech, reactions after 3 s, a reaction held 4 s. */
const DEFAULTS: VoiceSettings = { ...KEEPING_UP, voiceListener: true, adaptiveVoice: true }
const withTone = (patch: Partial<VoiceSettings['tone']>): VoiceSettings => ({ ...DEFAULTS, tone: { ...DEFAULTS.tone, ...patch } })

let calls = 0
const held = (humKind: 'continuer' | 'agreement' | 'none', tone: HumTone | null): VoiceEventBody =>
  ({ kind: 'hum.held', call: ++calls, humKind, tone, askedAt: 0, ms: 400, skipped: 0 })
const laughing = (confidence: number): VoiceEventBody =>
  ({ kind: 'tone.voice', final: false, emotion: [{ label: 'happy', confidence: 0.7 }], style: [{ label: 'laughing', confidence }] })

/** They speak 3.5 s (enough for a reaction, not for a plain hum), with `during` while they speak, then pause. */
function telling(settings: VoiceSettings, during: VoiceEventBody[], text = 'and then the pizza landed on the cat') {
  const s = setup(settings)
  s.at(0, silence(false))
  s.at(100, { kind: 'stt.utterance', text })
  s.at(500, held('continuer', 'calm'))
  for (const b of during) s.at(1_500, b)
  s.at(3_500, silence(true))
  s.tickTo(3_950)
  s.at(4_000, verdict('UNCERTAIN'))
  s.tickTo(4_700)
  return s
}

const humsOf = (s: ReturnType<typeof setup>) => s.of('backchannel.hum').map(({ hum, tone, laugh, reactionSpacing }) =>
  ({ hum, tone, ...(laugh && { laugh }), ...(reactionSpacing && { reactionSpacing }) }))

describe('laughter heard @SC-2233', () => {
  it('laughing at 0.6 or more: the next pause laughs back, on the reaction spacing, though the hum service said continuer', () => {
    expect(humsOf(telling(DEFAULTS, [laughing(0.83)]))).toEqual([{ hum: 'amusement', tone: 'bright', laugh: true, reactionSpacing: true }])
  })

  it('even over a none from the hum service', () => {
    expect(humsOf(telling(DEFAULTS, [laughing(0.83), held('none', null)]))).toEqual([{ hum: 'amusement', tone: 'bright', laugh: true, reactionSpacing: true }])
  })

  it('under the bar, or with Tone off (no voice profile), nothing: 3.5 s of speech is too little for a plain hum', () => {
    expect(humsOf(telling(DEFAULTS, [laughing(0.5)]))).toEqual([])
    expect(humsOf(telling(withTone({ on: false }), [laughing(0.9)]))).toEqual([])
    expect(humsOf(telling(withTone({ laughConfidence: 0.9 }), [laughing(0.83)]))).toEqual([])
  })

  it('never after a question', () => {
    const s = telling(DEFAULTS, [laughing(0.9)], 'and the cat just looked at me, can you believe it?')
    expect(humsOf(s)).toEqual([])
    s.at(4_800, silence(false))
    expect(s.misses().map(m => m.why)).toEqual(['after a question'])
  })

  it('never over the agent: a laugh read while the agent\'s sound plays is not heard', () => {
    const s = telling(DEFAULTS, [
      { kind: 'phrase.at', text: '(laughs)', playing: true, backchannel: true }, laughing(0.9),
      { kind: 'phrase.at', text: '(laughs)', playing: false, backchannel: true },
    ])
    expect(humsOf(s)).toEqual([])
  })

  it('is answered once: the pause after the laugh back plays no second laugh', () => {
    const s = telling(DEFAULTS, [laughing(0.9)])
    s.at(4_800, silence(false))
    s.at(8_300, silence(true))
    s.tickTo(8_750)
    s.at(8_800, verdict('UNCERTAIN'))
    s.tickTo(9_500)
    expect(humsOf(s).map(h => h.hum)).toEqual(['amusement'])
  })
})

describe('a hum in the read\'s own tone (spec §The listening read) @SC-2234', () => {
  /** A plain hum's 6 s of speech and more, the hum service saying `kind` in `tone`. */
  function plain(settings: VoiceSettings, kind: 'continuer' | 'agreement', tone: HumTone) {
    const s = setup(settings)
    s.at(0, silence(false))
    s.at(100, { kind: 'stt.utterance', text: 'we finally got the keys to the new flat' })
    s.at(500, held(kind, tone))
    s.at(9_000, silence(true))
    s.tickTo(9_450)
    s.at(9_500, verdict('UNCERTAIN'))
    s.tickTo(10_000)
    return humsOf(s)
  }

  it('plays the read\'s tone as hq sent it (hq sends calm with Tone off)', () => {
    expect(plain(DEFAULTS, 'agreement', 'warm')).toEqual([{ hum: 'agreement', tone: 'warm' }])
    expect(plain(withTone({ on: false }), 'continuer', 'calm')).toEqual([{ hum: 'continuer', tone: 'calm' }])
  })

  it('a read that says amusement still laughs with Tone off: the laugh is the backchannel\'s', () => {
    const s = telling(withTone({ on: false }), [held('none', null)])
    s.at(4_800, silence(false))
    expect(humsOf(s)).toEqual([])
  })
})
