/**
 * Whether the person spoke after a call was asked is judged by the order events came, not their times: a voice's start
 * is often dated a little before the call that went out first (the owner's log of 18 Nov: "153.8s turn sent", then
 * "153.6s speaking"). Its line is dropped all the same, though they are quiet again when the answer comes.
 */
import { describe, expect, it } from 'vitest'
import { floor } from '../../orchestration/floor'
import { scheduler } from '../../orchestration/scheduler'
import { KEEPING_UP, rig, silence } from '../../orchestration/__tests__/setup'
import type { VoiceSettings } from '../../settings'
import { listenerTrigger } from '../trigger'

const LIGHT: VoiceSettings = { ...KEEPING_UP, voiceListener: true, adaptiveVoice: true }
const ready = { kind: 'semantics.decision', answer: 'READY', confidence: 0.9, silenceMs: 500, by: 'model' } as const

function setup() {
  const r = rig([floor, scheduler, listenerTrigger], ['listen.play', 'listen.drop', 'listen.ask'], LIGHT)
  r.at(0, silence(false))
  r.at(100, { kind: 'stt.utterance', text: 'my friend twisted her ankle' })
  r.at(1_000, silence(true))
  r.at(1_500, ready)
  return r
}

const hold = { kind: 'listen.answer', call: 1, action: 'hand_over', nextCheckSecs: 4, say: 'Go on.', lineId: 'L1', turn: 'handedOver' } as const

describe('a line\'s call and the person\'s voice, by the order they came @SC-2229', () => {
  it('a voice dated before the call but come after it drops the line, though they are quiet again', () => {
    const r = setup()
    expect(r.of('listen.ask')).toHaveLength(1)
    r.at(1_450, silence(false))
    r.at(1_800, silence(true))
    r.at(2_400, hold)
    expect(r.of('listen.play')).toEqual([])
    expect(r.of('listen.drop')).toMatchObject([{ lineId: 'L1', call: 1 }])
  })

  it('a voice that came before the call does not', () => {
    const r = rig([floor, scheduler, listenerTrigger], ['listen.play', 'listen.drop'], LIGHT)
    r.at(0, silence(false))
    r.at(100, { kind: 'stt.utterance', text: 'my friend twisted her ankle' })
    r.at(1_000, silence(true))
    r.at(1_500, ready)
    r.at(2_400, hold)
    expect(r.of('listen.play')).toMatchObject([{ lineId: 'L1' }])
    expect(r.of('listen.drop')).toEqual([])
  })
})
