/**
 * Reaction hums (spec §The backchannel), at the product's defaults: a reaction (sympathy, news, delight, amusement)
 * needs only 1.0 s of the person's speech since the agent's last sound, not 2.5 s, and once the hum service answers
 * one, a plainer answer or `none` does not replace it for 4 s, or until it plays.
 *
 * The replay is the owner's playtest of 18 Nov (`fresh-owner-3.log`, the hiking story from 08:23:11, page times in ms):
 * "Uh-huh." at 20.9 s, then sympathy answered at 22.9, 23.9 and 25.4 s, and the breath at 23.7 s held back by "only
 * 1.5 s of speech since the agent's last sound". The "Aw." never played.
 */
import { describe, expect, it } from 'vitest'
import type { VoiceEventBody } from '../../events'
import { KEEPING_UP, silence } from '../../orchestration/__tests__/setup'
import type { VoiceSettings } from '../../settings'
import type { HumTone } from '../kinds'
import { setup, verdict } from './backchannelRig'

/**
 * The product's values when the owner played this, the hum service on: plain hums spaced by 2.5 s of speech, reactions
 * by 1 s, and two in a row allowed. `spacing.test.ts` tests the values of 19 Nov.
 */
const DEFAULTS: VoiceSettings = {
  ...KEEPING_UP, voiceListener: true, adaptiveVoice: true,
  backchannel: { ...KEEPING_UP.backchannel, speechMs: 2_500, reactionSpeechMs: 1_000, reactionGapSpeechMs: 0 },
}

type Kind = 'none' | 'continuer' | 'receipt' | 'sympathy' | 'delight'
const TONE: Record<Kind, 'calm' | 'gentle' | 'bright' | null> = { none: null, continuer: 'calm', receipt: 'calm', sympathy: 'gentle', delight: 'bright' }
let calls = 0
const held = (humKind: Kind, ms = 450, tone: HumTone | null = TONE[humKind]): VoiceEventBody =>
  ({ kind: 'hum.held', call: ++calls, humKind, tone, askedAt: 0, ms, skipped: 0 }) as VoiceEventBody
const said = (text: string): VoiceEventBody => ({ kind: 'stt.utterance', text })

const ANKLE = 'So last weekend I finally went hiking up the falls. We really— wait, we left early, about 6 in the morning. '
  + 'The first hour was easy, just forest. Then it got steep and rocky and my friend twisted her ankle.'

/** The 08:23 turn, from the voice that the "Uh-huh." followed; where page times disagree, the server's order is kept. */
const turn0823: [number, VoiceEventBody][] = [
  [16_200, silence(false)], [16_300, said('So last weekend I finally went hiking up the falls. We really— wait, we left early,')],
  [17_200, held('continuer', 730, 'curious')], [18_000, held('continuer', 550, 'curious')], [19_300, held('continuer', 830, 'curious')],
  [20_000, held('continuer', 530)], [20_200, silence(true)], [20_700, verdict('UNCERTAIN', 500, 0.62)],
  // "Uh-huh." plays; READY at 2 s, held by the false-finish wait, comes just before their voice.
  [22_150, verdict('READY', 2_000, 0.62)], [22_150, { kind: 'orchestration.finishHeld', waitMs: 2_500, until: 22_700 }],
  [22_200, silence(false)], [22_300, said(ANKLE)], [22_900, held('sympathy', 470)], [23_700, silence(true)],
  [23_900, held('sympathy', 460)], [24_200, verdict('UNCERTAIN', 500, 0.02)], [24_370, silence(false)],
  [25_400, held('sympathy', 540)],
  // The words at the 26.0 s pause are not in the log; its reply opens "Good question", so they end on one.
  [25_900, said(`${ANKLE} Anyway, what should I do`)], [26_000, silence(true)], [26_500, held('none', 490)],
  [26_500, verdict('READY', 500, 0.94)], [26_500, { kind: 'orchestration.finishHeld', waitMs: 2_500, until: 28_500 }],
]

function replay(timeline: [number, VoiceEventBody][], settings = DEFAULTS, until = 27_000) {
  const s = setup(settings)
  for (const [t, body] of timeline) {
    s.tickTo(t - 1)
    s.at(t, body)
  }
  s.tickTo(until)
  return s
}

const humsOf = (s: ReturnType<typeof setup>) => s.of('backchannel.hum').map(({ hum, tone, speechMs, reactionSpacing, reactionHeld }) =>
  ({ hum, tone, speechMs, ...(reactionSpacing && { reactionSpacing }), ...(reactionHeld && { reactionHeld }) }))

describe('the owner\'s hiking story of 18 Nov at 08:23, replayed: a reaction is not held back by the hum before it @SC-2228', () => {
  it('the breath at 23.7 s hums sympathy on 1.5 s of speech, and the question at 26.0 s gets no second one', () => {
    const s = replay(turn0823)
    expect(humsOf(s)).toEqual([
      { hum: 'continuer', tone: 'calm', speechMs: 4_000 },
      { hum: 'sympathy', tone: 'gentle', speechMs: 1_500, reactionSpacing: true },
    ])
    expect(s.of('backchannel.hum')[1]!.t).toBeGreaterThan(24_200)
    expect(s.of('backchannel.hum')[1]!.t).toBeLessThan(24_370)
    s.at(27_100, silence(false))
    // The words do not end as a question does by `endsOnQuestion` ("Anyway, …"): the hum service's none, in the pause,
    // wins over the sympathy held, and a plain hum's spacing is the rule that holds it back.
    expect(s.misses().map(m => m.why)).toEqual(['only 1.6 s of speech since the agent\'s last sound'])
  })

  it('with a reaction spaced as a plain hum is, the sympathy is held back as it was', () => {
    const s = replay(turn0823, { ...DEFAULTS, backchannel: { ...DEFAULTS.backchannel, reactionSpeechMs: 2_500 } })
    expect(humsOf(s).map(h => h.hum)).toEqual(['continuer'])
    expect(s.misses()[0]!.why).toBe('only 1.5 s of speech since the agent\'s last sound (a sympathy hum needs 2.5 s)')
  })
})

/** They speak from `from` to `to` with the answers given, then pause; the sound model unsure at 0.5 s. */
function telling(answers: [number, VoiceEventBody][], from = 0, to = 4_000, settings = DEFAULTS) {
  const timeline: [number, VoiceEventBody][] = [
    [from, silence(false)], [from + 100, said('and then we walked on and my friend fell')], ...answers,
    [to, silence(true)], [to + 500, verdict('UNCERTAIN')],
  ]
  return replay(timeline.sort((a, b) => a[0] - b[0]), settings, to + 1_000)
}

describe('a reaction stays held @SC-2226 @SC-2228', () => {
  it('a plainer answer, or none, after it does not replace it: it plays, and says it was held', () => {
    const s = telling([[2_000, held('sympathy')], [3_000, held('continuer')], [3_600, held('none')]])
    expect(humsOf(s)).toEqual([{ hum: 'sympathy', tone: 'gentle', speechMs: 4_000, reactionHeld: true }])
    expect(s.of('backchannel.hum')[0]!.from).toMatchObject({ at: 2_000 })
  })

  it('a later reaction replaces it', () => {
    const s = telling([[2_000, held('sympathy')], [3_000, held('delight')], [3_500, held('receipt')]])
    expect(humsOf(s)).toEqual([{ hum: 'delight', tone: 'bright', speechMs: 4_000, reactionHeld: true }])
  })

  it('once its hold runs out, the latest answer stands', () => {
    const s = telling([[500, held('sympathy')], [4_800, held('continuer')]], 0, 5_000)
    expect(humsOf(s)).toEqual([{ hum: 'continuer', tone: 'calm', speechMs: 5_000 }])
  })

  it('once it has played, the next answer replaces it as before', () => {
    const s = telling([[2_000, held('sympathy')]])
    s.at(5_000, silence(false))
    s.at(5_500, held('continuer'))
    s.at(8_000, silence(true))
    s.tickTo(8_450)
    s.at(8_500, verdict('UNCERTAIN'))
    s.tickTo(9_000)
    expect(humsOf(s).map(h => h.hum)).toEqual(['sympathy', 'continuer'])
  })

  it('never after a question: their words ending on one hold it back, whatever the hum service held', () => {
    const s = telling([[2_000, held('sympathy')], [3_000, said('and my friend fell. What would you do')], [3_600, held('none')]])
    expect(s.hums()).toEqual([])
    s.at(5_100, silence(false))
    expect(s.misses().map(m => m.why)).toEqual(['after a question'])
  })

  it('a none that comes after the pause began wins for that pause, and the reaction stays held for the next', () => {
    const s = telling([[3_000, held('sympathy')], [4_200, held('none')]])
    expect(s.hums()).toEqual([])
    s.at(5_100, silence(false))
    expect(s.misses().map(m => m.why)).toEqual(['the hum service said none as you paused, over the sympathy held'])
    s.at(6_200, silence(true))
    s.tickTo(6_650)
    s.at(6_700, verdict('UNCERTAIN'))
    s.tickTo(6_800)
    expect(humsOf(s)).toMatchObject([{ hum: 'sympathy', reactionHeld: true }])
  })

  it('a hold of 0 keeps none: the latest answer stands', () => {
    const s = telling([[2_000, held('sympathy')], [3_000, held('continuer')]], 0, 4_000, { ...DEFAULTS, backchannel: { ...DEFAULTS.backchannel, reactionHoldMs: 0 } })
    expect(humsOf(s).map(h => h.hum)).toEqual(['continuer'])
  })
})

describe('the spacing of a plain hum is as it was @SC-2228', () => {
  it('a continuer on 1.5 s of speech since the agent\'s last sound is held back; a reaction on 0.8 s says what it needs', () => {
    const plain = telling([[1_000, held('continuer')]])
    plain.at(5_000, silence(false))
    plain.at(6_500, silence(true))
    plain.tickTo(6_950)
    plain.at(7_000, verdict('UNCERTAIN'))
    plain.tickTo(7_500)
    plain.at(7_600, silence(false))
    expect(plain.misses().map(m => m.why)).toEqual(['only 1.5 s of speech since the agent\'s last sound'])

    const reaction = telling([[1_000, held('continuer')]])
    reaction.at(5_000, silence(false))
    reaction.at(5_500, held('sympathy'))
    reaction.at(5_800, silence(true))
    reaction.tickTo(6_250)
    reaction.at(6_300, verdict('UNCERTAIN'))
    reaction.tickTo(6_800)
    reaction.at(6_900, silence(false))
    expect(reaction.misses().map(m => m.why)).toEqual(['only 0.8 s of speech since the agent\'s last sound (a sympathy hum needs 1.0 s)'])
  })
})
