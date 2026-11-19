/**
 * The owner's playtest of 18 Nov (`fresh-owner-3.log`, the hiking story, page times in ms): the two hums it played that
 * should not have, replayed through the backchannel as the page's events came, in the order they came.
 *
 * - 23.2 s: "Uh-huh." as a calm continuer, "no answer from the hum service yet": its latest answer ("none", at 22.0 s)
 *   was forgotten when the turn was sent at 22.6 s, though the light model kept the turn open.
 * - 35.9 s: "Mm-hm.", 0.6 s after the light model handed the turn over at 35.3 s.
 */
import { describe, expect, it } from 'vitest'
import type { VoiceEventBody } from '../../events'
import { silence } from '../../orchestration/__tests__/setup'
import { WITH_SERVICE, answer, finished, setup, verdict } from './backchannelRig'

const held = (askedAt: number, humKind: 'none' | 'continuer' | 'sympathy', tone: 'calm' | 'curious' | 'gentle' | null): VoiceEventBody =>
  ({ kind: 'hum.held', call: 1, humKind, tone, askedAt, ms: 400, skipped: 0 }) as VoiceEventBody

const SO_FAR = 'So last weekend I finally went hiking up the falls. We really— wait, we left really early. About 6 in the morning.'
const ANKLE = `${SO_FAR} First hour. Was easy, just forest. Then it got steep and rocky and my friend twisted her ankle.`

describe('the owner\'s hiking story of 18 Nov, replayed @SC-2228 @SC-2229 @SC-2226', () => {
  it('23.2 s: the hum service\'s "none" outlives the send, so the "not yet" plays nothing and says why', () => {
    const s = setup(WITH_SERVICE)
    s.at(9_800, silence(false))
    s.at(10_000, { kind: 'stt.utterance', text: SO_FAR })
    s.at(21_000, held(20_600, 'continuer', 'curious'))
    s.at(21_800, silence(true))
    s.at(22_000, held(21_600, 'none', null))
    s.tickTo(22_250)
    s.at(22_300, verdict('READY', 500, 0.87))
    s.tickTo(22_550)
    s.all(22_600, finished(1, SO_FAR))
    s.at(22_600, { kind: 'stt.utterance', text: '' })
    s.tickTo(23_100)
    s.all(23_100, answer(1, 'notYet'))
    s.tickTo(23_900)
    s.at(24_000, silence(false))
    expect(s.hums()).toEqual([])
    expect(s.misses().map(m => m.why)).toEqual(['the hum service said none'])
  })

  it('35.9 s: no hum once the turn is handed over, a near miss instead', () => {
    const s = setup(WITH_SERVICE)
    s.at(31_500, silence(false))
    s.at(31_600, { kind: 'stt.utterance', text: ANKLE })
    s.at(34_100, silence(true))
    s.at(34_300, held(33_900, 'sympathy', 'gentle'))
    s.tickTo(34_550)
    s.at(34_600, verdict('READY', 500, 0.96))
    s.tickTo(34_850)
    s.all(34_900, finished(3, ANKLE))
    s.at(34_900, { kind: 'stt.utterance', text: '' })
    s.at(34_950, silence(false))
    s.at(35_300, silence(true))
    s.all(35_300, answer(3, 'handedOver'))
    s.tickTo(35_750)
    s.at(35_800, verdict('UNCERTAIN', 500, 0.19))
    s.tickTo(36_650)
    s.at(36_700, silence(false))
    expect(s.hums()).toEqual([])
    expect(s.misses().map(m => m.why)).toEqual(['the turn was handed over'])
  })
})
