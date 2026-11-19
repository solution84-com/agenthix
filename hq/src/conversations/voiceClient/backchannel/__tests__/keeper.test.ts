/**
 * The sound keeper (spec §The sound keeper, B3) with the hum timing (B2): the common sounds warmed as voice starts, a
 * read's kind and tone asked of hq as it comes, a word of the due kind picked at the breath among those here in its
 * tone and never one of the last three played, else nothing; never a word of another kind or tone, never later; and
 * the speech a sound never played counted again.
 */
import { describe, expect, it } from 'vitest'
import type { VoiceEventBody } from '../../events'
import { floor } from '../../orchestration/floor'
import { rig, silence } from '../../orchestration/__tests__/setup'
import { backchannel } from '../trigger'
import { keeper } from '../keeper'
import { soundKey, type HumKind, type HumTone } from '../kinds'
import { WITH_SERVICE } from './backchannelRig'

let calls = 0
const read = (humKind: HumKind, tone: HumTone): VoiceEventBody =>
  ({ kind: 'hum.held', call: ++calls, humKind, tone, askedAt: 0, ms: 400, skipped: 0 })
const failed: VoiceEventBody = { kind: 'hum.held', call: 999, humKind: null, tone: null, askedAt: 0, ms: 2_000, skipped: 0, fallback: 'timeout' }
const here = (hum: HumKind, tone: HumTone, words: string, made: 'new' | 'kept' = 'kept', ok = true): VoiceEventBody =>
  ({ kind: 'hum.sound', key: soundKey(words, tone), words, tone, hum, ok, ...(ok && { made }) })
const verdictOf = (answer: 'UNCERTAIN'): VoiceEventBody => ({ kind: 'semantics.decision', answer, confidence: 0.6, silenceMs: 500, by: 'model' })

function setup(settings = WITH_SERVICE) {
  const r = rig([floor, backchannel, keeper], ['hum.speak', 'backchannel.hum', 'backchannel.sound', 'backchannel.unplayed', 'backchannel.miss'], settings)
  /** They speak from `from` for 5 s (over a plain hum's 4 s), `during` at 1 s in; a pause the sound model calls not finished at 0.5 s. */
  const telling = (from: number, during: VoiceEventBody[] = []) => {
    r.at(from, silence(false))
    r.at(from + 100, { kind: 'stt.utterance', text: 'and then my friend twisted her ankle' })
    for (const b of during) r.at(from + 1_000, b)
    r.at(from + 5_000, silence(true))
    r.tickTo(from + 5_450)
    r.at(from + 5_500, verdictOf('UNCERTAIN'))
    r.tickTo(from + 5_600)
  }
  /** The speaker played what the keeper started. */
  const played = (t: number) => {
    const last = r.of('backchannel.sound').at(-1)!
    r.at(t, { kind: 'backchannel.played', text: last.words, hum: last.hum, tone: last.tone, made: last.made, pausedMs: last.pausedMs })
  }
  const sounds = () => r.of('backchannel.sound').map(({ words, hum, tone, made }) => ({ words, hum, tone, made }))
  const speaks = () => r.of('hum.speak').map(({ hum, tone, warm }) => ({ hum, tone, ...(warm && { warm }) }))
  return { ...r, telling, played, sounds, speaks }
}

describe('the sound keeper @SC-2228 @SC-2237', () => {
  it('warms the common sounds as voice starts: the continuers and receipts in calm, and a laugh', () => {
    const s = setup()
    s.tickTo(100)
    s.tickTo(500)
    expect(s.speaks()).toEqual([
      { hum: 'continuer', tone: 'calm', warm: true }, { hum: 'receipt', tone: 'calm', warm: true }, { hum: 'amusement', tone: 'bright', warm: true },
    ])
  })

  it('asks for the common sounds again until one comes, as voice may not be held on hq yet; at most five times', () => {
    const warms = (s: ReturnType<typeof setup>) => s.speaks().filter(x => x.warm && x.hum === 'continuer').length
    const answered = setup()
    answered.tickTo(100)
    answered.tickTo(2_200)
    expect(warms(answered)).toBe(2)
    answered.at(2_300, here('continuer', 'calm', 'Mm-hm.', 'new'))
    answered.tickTo(9_000)
    expect(warms(answered)).toBe(2)
    const silent = setup()
    silent.tickTo(100)
    for (let t = 1_000; t <= 20_000; t += 1_000) silent.tickTo(t)
    expect(warms(silent)).toBe(5)
  })

  it('asks hq for a read\'s kind in its tone as each read comes, so the set fills', () => {
    calls = 0
    const s = setup()
    s.telling(0, [read('sympathy', 'gentle'), read('sympathy', 'gentle')])
    expect(s.speaks().filter(x => !x.warm)).toEqual([{ hum: 'sympathy', tone: 'gentle' }, { hum: 'sympathy', tone: 'gentle' }])
  })

  it('plays a made word of the due kind and tone at the breath, made new the first time and already made after', () => {
    const s = setup()
    s.telling(0, [read('sympathy', 'gentle'), here('sympathy', 'gentle', 'Oh no.', 'new')])
    s.played(5_610)
    s.telling(5_700, [read('sympathy', 'gentle'), here('sympathy', 'gentle', 'Aw.')])
    s.played(11_310)
    expect(s.sounds()).toEqual([
      { words: 'Oh no.', hum: 'sympathy', tone: 'gentle', made: 'new' },
      // "Oh no." is among the last three played: the other made word plays.
      { words: 'Aw.', hum: 'sympathy', tone: 'gentle', made: 'kept' },
    ])
  })

  it('never plays a word of another kind or another tone: nothing, and why', () => {
    const s = setup()
    s.telling(0, [here('continuer', 'calm', 'Mm-hm.'), here('sympathy', 'warm', 'Aw.'), here('agreement', 'gentle', 'Yeah.'), read('sympathy', 'gentle')])
    expect(s.sounds()).toEqual([])
    expect(s.of('backchannel.unplayed').at(-1)).toMatchObject({ why: 'no sympathy sound in a gentle tone made yet', speechMs: 5_000 })
  })

  it('picks a word the kinds share for either kind: "Yeah." is a continuer and an agreement', () => {
    const s = setup()
    s.telling(0, [here('continuer', 'calm', 'Yeah.'), read('agreement', 'calm')])
    expect(s.sounds()).toEqual([{ words: 'Yeah.', hum: 'agreement', tone: 'calm', made: 'kept' }])
  })

  it('never one of the last three played: nothing when every made word was', () => {
    const s = setup()
    s.telling(0, [here('receipt', 'calm', 'Right.'), read('receipt', 'calm')])
    s.played(5_610)
    s.telling(5_700, [])
    expect(s.sounds().map(x => x.words)).toEqual(['Right.'])
    expect(s.of('backchannel.unplayed').at(-1)).toMatchObject({ why: 'every receipt sound made in a calm tone was among the last 3 played' })
  })

  it('a late sound is never played: a reaction made after its breath is dropped, not played at a later one', () => {
    calls = 0
    const s = setup()
    s.telling(0, [read('sympathy', 'gentle')])
    expect(s.of('backchannel.unplayed')).toMatchObject([{ why: 'no sympathy sound in a gentle tone made yet' }])
    // Its sound comes just after the breath, then they go on; the next breath has the same read and no newer one.
    s.at(5_700, here('sympathy', 'gentle', 'Oh no.'))
    s.telling(5_800, [])
    expect(s.sounds()).toEqual([])
    expect(s.of('backchannel.hum')).toHaveLength(1)
    expect(s.of('backchannel.miss').at(-1)!.why).toMatch(/sympathy was for an earlier breath/)
  })

  it('a failed read leaves the last one standing: a word of its kind plays', () => {
    const s = setup()
    s.telling(0, [read('receipt', 'calm'), here('receipt', 'calm', 'Right.'), failed])
    expect(s.sounds().map(x => x.words)).toEqual(['Right.'])
    expect(s.of('backchannel.hum')[0]!.fallback).toMatch(/ran out of time: its last answer stands/)
  })

  it('a sound that could not be made is not kept', () => {
    const s = setup()
    s.telling(0, [here('continuer', 'calm', 'Mm-hm.', 'new', false), read('continuer', 'calm')])
    expect(s.sounds()).toEqual([])
    expect(s.of('backchannel.unplayed').at(-1)!.why).toBe('no continuer sound in a calm tone made yet')
  })

  it('a sound the speaker could not start is not counted as played, and its speech counts again', () => {
    const s = setup()
    s.telling(0, [read('receipt', 'calm'), here('receipt', 'calm', 'Right.')])
    s.at(5_610, { kind: 'backchannel.played', text: null, why: 'a line was playing' })
    expect(s.of('backchannel.unplayed')).toMatchObject([{ why: 'a line was playing', speechMs: 5_000 }])
    s.at(5_700, silence(false))
    s.at(6_700, silence(true))
    s.tickTo(7_150)
    s.at(7_200, verdictOf('UNCERTAIN'))
    s.tickTo(7_300)
    // "Right." never played, so it is not among the last three: it plays now.
    expect(s.sounds().map(x => x.words)).toEqual(['Right.', 'Right.'])
  })

  it('asks for nothing while the person asked for no hums', () => {
    const s = setup()
    s.at(0, { kind: 'listen.style', state: { hums: 'off', patient: false } })
    s.telling(100, [read('sympathy', 'gentle')])
    expect(s.speaks()).toEqual([])
  })
})
