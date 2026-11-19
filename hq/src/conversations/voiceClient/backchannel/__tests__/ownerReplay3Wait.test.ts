/**
 * The owner's playtest of 18 Nov (`fresh-owner-3.log`, the hiking story from 07:12:20, page times in ms), with the
 * false-finish wait at 2.5 s: after the false finish at 8.8 s, five sentence-end breaths (17.3, 20.1, 21.7, 25.8 and
 * 29.2 s) each had READY held by the wait, and none hummed ("the sound model said finished"). Replayed through the
 * floor, the scheduler and the backchannel, with the hum service's answers as they came, a pause in the wait now goes
 * by the ordinary pause rules. That gives one more hum, not five:
 *
 * - 17.3 s: only 3.9 s of speech since the hum at 12.5 s (13.4 to 17.3 s).
 * - 20.1 s: the answer held is the `none` that came at 20.4 s, before READY at 20.6 s (its call went out at 20.0 s,
 *   in flight at the pause's start, so no pause-start call either).
 * - 21.7 s: hums, the continuer curious held from 21.5 s, at READY in the wait. (No call was in flight, so the hum
 *   service is now asked here too; its answer is not in the log, and would land about when the verdict did. This
 *   replays the wait's rule alone, with the answers the log has.)
 * - 25.8 s: only 2.4 s of speech since that hum.
 * - 29.2 s: the `none` that came at 29.5 s, before READY at 29.7 s.
 *
 * The log's order is kept where it matters: a voice dated a little before the verdict delivered ahead of it is placed
 * just after it, and at 12.5 s the verdict came 27 ms before the hum service's answer, both before the next tick.
 */
import { describe, expect, it } from 'vitest'
import type { HumTone } from '../kinds'
import type { VoiceEventBody } from '../../events'
import { floor } from '../../orchestration/floor'
import { scheduler } from '../../orchestration/scheduler'
import { rig, silence } from '../../orchestration/__tests__/setup'
import type { VoiceSettings } from '../../settings'
import { backchannel } from '../trigger'
import { WITH_SERVICE, verdict } from './backchannelRig'

/** The owner's wait: 2.5 s of quiet after the first false finish. */
const PLAYED: VoiceSettings = {
  ...WITH_SERVICE, listener: { ...WITH_SERVICE.listener, finishWaitMs: 500, finishWaitStepMs: 2_000, finishWaitMostMs: 2_500 },
}

type Kind = 'none' | 'continuer' | 'news'
const answers: [number, Kind, HumTone | null, number][] = [
  [8_600, 'none', null, 630], [10_200, 'none', null, 410], [11_300, 'news', 'bright', 380], [12_470, 'continuer', 'curious', 430],
  [14_000, 'continuer', 'curious', 400], [15_800, 'none', null, 520], [16_800, 'continuer', 'curious', 420],
  [19_500, 'continuer', 'calm', 470], [20_400, 'none', null, 360], [21_500, 'continuer', 'curious', 410],
  [25_200, 'continuer', 'calm', 1_600], [26_000, 'none', null, 380], [27_400, 'continuer', 'curious', 380],
  [28_400, 'none', null, 370], [29_500, 'none', null, 450],
]

/** The words on screen as they grew, each a little before the voice ended (STT's last words, as it caught up). */
const said = (t: number, text: string): [number, VoiceEventBody] => [t, { kind: 'stt.utterance', text }]
const S1 = 'I finally went hiking up at the falls.'
const S2 = `${S1} We left really early, about 6 in the morning.`
const S3 = `${S2} The first hour was easy,`
const S4 = `${S3} just forest.`
const S5 = `${S4} Then it got steep and rocky.`
const S6 = `${S5} And my friend twisted her`

/** Speech (on, off) and the sound model's verdict in each pause, as the log has them. */
const timeline: [number, VoiceEventBody][] = [
  [6_400, silence(false)], said(6_600, 'So last'), [6_800, silence(true)], [7_250, verdict('UNCERTAIN', 500, 0.01)],
  [7_300, silence(false)], said(7_800, 'So last weekend'), [8_000, silence(true)], [8_500, verdict('READY', 500, 0.95)],
  // 0.3 s after the send: false finish 1, and READY now waits for 2.5 s of quiet.
  [8_800, silence(false)], said(9_500, 'I finally went'), said(11_700, S1), [11_900, silence(true)],
  [12_460, verdict('UNCERTAIN', 500, 0.68)], [12_900, verdict('UNCERTAIN', 1_000, 0.68)],
  [13_400, silence(false)], said(15_000, `${S1} We left really early,`), said(17_100, S2), [17_300, silence(true)],
  [17_800, verdict('READY', 500, 0.92)],
  [18_800, silence(false)], said(19_900, S3), [20_100, silence(true)], [20_600, verdict('READY', 500, 0.97)],
  [20_800, silence(false)], said(21_500, S4), [21_700, silence(true)], [22_200, verdict('READY', 500, 0.92)],
  [23_400, silence(false)], said(25_600, S5), [25_800, silence(true)], [26_400, verdict('READY', 500, 0.94)],
  [26_800, silence(false)], said(29_000, S6), [29_200, silence(true)], [29_700, verdict('READY', 500, 0.91)],
]

function replay() {
  const r = rig([floor, scheduler, backchannel], ['backchannel.hum', 'backchannel.miss', 'orchestration.ready', 'orchestration.finishHeld'], PLAYED)
  const events: [number, VoiceEventBody][] = [
    ...timeline,
    ...answers.map(([t, humKind, tone, ms], i): [number, VoiceEventBody] =>
      [t, { kind: 'hum.held', call: i + 1, humKind, tone, askedAt: t - ms, ms, skipped: 0 }]),
  ].sort((a, b) => a[0] - b[0])
  for (const [t, body] of events) {
    r.tickTo(t - 1)
    r.at(t, body)
  }
  r.tickTo(31_800)
  return r
}

describe('the owner\'s hiking story of 18 Nov, with READY held by the false-finish wait @SC-2226 @SC-2230', () => {
  it('a breath in the wait goes by the pause rules: one hums, the others say the rule that held them back', () => {
    const r = replay()
    expect(r.of('backchannel.hum').map(({ t, verdict: v, inWait, hum, tone }) => ({ t, verdict: v, ...(inWait && { inWait }), hum, tone }))).toEqual([
      { t: 12_520, verdict: 'UNCERTAIN', hum: 'continuer', tone: 'curious' },
      { t: 22_250, verdict: 'READY', inWait: true, hum: 'continuer', tone: 'curious' },
    ])
    expect(r.of('backchannel.miss').filter(m => m.t > 13_000).map(m => [m.t, m.why])).toEqual([
      [18_800, 'only 3.9 s of speech since the agent\'s last sound'],
      [20_650, 'the hum service said none'],
      [26_800, 'only 2.4 s of speech since the agent\'s last sound'],
      [29_750, 'the hum service said none'],
    ])
  })

  it('every one of those READYs was held by the wait, and the turn was sent only when the last ran out', () => {
    const r = replay()
    expect(r.of('orchestration.finishHeld').map(e => e.until)).toEqual([19_800, 22_600, 24_200, 28_300, 31_700])
    expect(r.of('orchestration.ready').map(e => e.t)).toEqual([8_500, 31_700])
  })
})
