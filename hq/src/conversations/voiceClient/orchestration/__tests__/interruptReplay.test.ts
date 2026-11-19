/**
 * The owner's interrupt of 18 Nov (20:59:41, page 17.8 s to 23.8 s), replayed through barge-in, the floor, the person's
 * words and the scheduler under the light model with a learned pace. They spoke over the reply for 1.2 s and went quiet;
 * the window closed in silence before their words came, so the reply came back for 0.4 s; the sound model's READY came
 * while it played and was lost, and the turn went only at the floor's timeout, 4.8 s after they stopped.
 * Now: the reply waits for the words, and the READY heard while it is ducked counts once it has stopped.
 */
import { describe, expect, it } from 'vitest'
import type { VoiceEventBody } from '../../events'
import type { Learned } from '../../pacing/pace'
import type { VoiceSettings } from '../../settings'
import { utterance } from '../../stt/utterance'
import { bargeIn } from '../bargeIn'
import { floor } from '../floor'
import { scheduler } from '../scheduler'
import { heard, KEEPING_UP, playing, rig, silence } from './setup'

const LIGHT: VoiceSettings = { ...KEEPING_UP, voiceListener: true, adaptiveVoice: true }
const LEARNED: Learned = { finishWaitMs: 1_200, latestPauseMs: 1_000, finishShareMs: 1_000, finishSharePct: 90, humShareMs: 900, humSharePct: 80 }
const READY: VoiceEventBody = { kind: 'semantics.decision', answer: 'READY', confidence: 0.93, silenceMs: 500, by: 'model' }

function setup(settings: VoiceSettings = LIGHT) {
  const r = rig([bargeIn, floor, utterance, scheduler], ['orchestration.playback', 'orchestration.ready', 'orchestration.send'], settings)
  r.at(0, { kind: 'orchestration.pace', heard: 6, breathMs: [], learned: LEARNED })
  r.at(16_000, { kind: 'reply.sentence', replyId: 'r1', index: 0, text: 'Here is the plan in full.' })
  r.at(16_000, playing('r1'))
  const actions = () => r.of('orchestration.playback').map(e => e.action)
  const sent = () => [...r.of('orchestration.ready'), ...r.of('orchestration.send')].map(e => ({ t: e.t, text: e.text }))
  return { ...r, actions, sent }
}

describe('a reply talked over waits for the words, and the finish heard meanwhile counts @SC-2239 @SC-2240', () => {
  it('replays 20:59: no resume, the reply stops by the words, the turn goes the learned wait after they stopped', () => {
    const s = setup()
    s.at(17_800, silence(false))
    s.at(19_000, silence(true))
    s.tickTo(19_550)
    s.at(19_600, READY)
    s.tickTo(19_650)
    s.at(19_700, heard('Actually keep it short.', 1, true))
    s.tickTo(23_800)
    expect(s.actions()).toEqual(['duck', 'stop'])
    expect(s.sent()).toEqual([{ t: 19_000 + LEARNED.finishWaitMs, text: 'Actually keep it short.' }])
  })

  it('counts the kept finish as soon as the reply stops when the learned wait has already passed', () => {
    const s = setup()
    s.at(17_800, silence(false))
    s.at(19_000, silence(true))
    s.tickTo(19_550)
    s.at(19_600, READY)
    s.tickTo(20_450)
    s.at(20_500, heard('Actually keep it short.', 1, true))
    s.tickTo(21_000)
    expect(s.actions()).toEqual(['duck', 'stop'])
    expect(s.sent()).toEqual([{ t: 20_550, text: 'Actually keep it short.' }])
  })

  it('forgets the kept finish when the person goes on', () => {
    const s = setup()
    s.at(17_800, silence(false))
    s.at(19_000, silence(true))
    s.at(19_600, READY)
    s.at(19_700, heard('Actually keep it', 1, false))
    s.at(19_800, silence(false))
    s.tickTo(21_500)
    expect(s.actions()).toEqual(['duck', 'stop'])
    expect(s.sent()).toEqual([])
  })

  it('in plain voice too, the finish heard while ducked sends the turn once the reply stops', () => {
    const s = setup(KEEPING_UP)
    s.at(17_800, silence(false))
    s.at(19_000, silence(true))
    s.at(19_600, READY)
    s.at(19_700, heard('Actually keep it short.', 1, true))
    s.tickTo(20_000)
    expect(s.sent()).toEqual([{ t: 19_750, text: 'Actually keep it short.' }])
  })
})
