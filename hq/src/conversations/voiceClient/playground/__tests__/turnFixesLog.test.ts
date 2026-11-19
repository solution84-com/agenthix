/**
 * The Log and the server's trace for the owner's playtest of 18 Nov: a light model's line dropped because you spoke
 * again (its LIGHT row says the line was not played, and why), and each false finish with the wait now in force (on the
 * SOUND row it happened to, and on the next one, which waited longer).
 */
import { describe, expect, it } from 'vitest'
import type { VoiceEvent } from '../../events'
import type { LightCallRow } from '../../../../shared/voicePlaygroundLight'
import { createTrailReader, emptyTrail } from '../pageTrail'
import { soundSteps } from '../otherSteps'
import { lightSteps } from '../lightSteps'
import { createTraceReader } from '../trace'

let seq = 0
const ev = (t: number, body: Record<string, unknown>) => ({ t, seq: seq++, ...body }) as unknown as VoiceEvent
const T0 = 1_700_000_000_000

function read(events: VoiceEvent[]) {
  const trail = emptyTrail()
  const reader = createTrailReader(trail, () => T0)
  events.forEach(reader)
  return trail
}

const callRow = (p: Partial<LightCallRow> & Pick<LightCallRow, 'id' | 'seq' | 'moment' | 'at'>): LightCallRow => ({
  keptOpen: false, quietMs: 0, workingMs: null, message: '', choice: 'keep_listening', words: null, answer: null, why: null,
  withReason: false, asked: null, nextCheck: 2, dropped: null, ms: 900, stale: false, overLimit: false, superseded: false,
  failed: false, inputTokens: 1, outputTokens: 1, ...p,
})

const HOLD = "Go on, I'm with you on the hike."

describe('a dropped line in the Log @SC-2229', () => {
  it('marks the LIGHT row\'s line as not played, and why', () => {
    const trail = read([
      ev(0, { kind: 'listen.ask', call: 6, moment: 'soundsFinished', text: 'my friend twisted her ankle', quietMs: 500 }),
      ev(1_150, { kind: 'listen.answer', call: 6, action: 'hand_over', nextCheckSecs: 4, say: HOLD, lineId: 'L6', turn: 'handedOver' }),
      ev(1_150, { kind: 'listen.drop', lineId: 'L6', call: 6, why: 'you spoke again' }),
    ])
    expect(trail.drops).toEqual([{ at: T0 + 1_150, lineId: 'L6', call: 6, why: 'you spoke again' }])
    const [step] = lightSteps([callRow({ id: 'c6', seq: 6, moment: 'soundsFinished', choice: 'hand_over', words: HOLD, at: T0 + 1_150, ms: 1_150 })], [], [], trail)
    expect(step!.detail).toMatch(/^its line was not played: you spoke again · /)
    expect(step!.attrs).toMatchObject({ line: 'not played' })
    // Never played, so no line step either.
    expect(lightSteps([], [], [], trail)).toEqual([])
  })

  it('says it in the trace', () => {
    const t = createTraceReader()
    t(ev(0, { kind: 'clock.tick' }))
    expect(t(ev(1_500, { kind: 'listen.drop', lineId: 'L6', why: 'you were speaking' }))).toBe("1.5s light model's line dropped, never heard: you were speaking")
  })
})

describe('false finishes in the Log @SC-2230', () => {
  it('the SOUND row it happened to says so and the wait now; the next says how long it waited', () => {
    const trail = read([
      ev(0, { kind: 'semantics.decision', answer: 'READY', confidence: 0.95, silenceMs: 500, by: 'model' }),
      ev(300, { kind: 'orchestration.ready', text: 'first hour was easy', append: false }),
      ev(700, { kind: 'orchestration.falseFinish', afterMs: 400, count: 1, waitMs: 1_000 }),
      ev(3_000, { kind: 'semantics.decision', answer: 'READY', confidence: 0.96, silenceMs: 500, by: 'model' }),
      ev(3_500, { kind: 'orchestration.ready', text: 'just forest', append: false, waitedMs: 1_000 }),
    ])
    const steps = soundSteps(trail)
    expect(steps.map(s => s.detail)).toEqual([
      'a false finish: you went on 0.4 s after it (1 this turn); READY now waits for 1.0 s of quiet',
      'waited for 1.0 s of quiet, after false finishes',
    ])
    expect(steps[0]!.attrs).toEqual({ 'false-finish': '1', 'wait-ms': '1000' })
  })

  it('says each in the trace, and a finish that waited longer', () => {
    const t = createTraceReader()
    t(ev(0, { kind: 'clock.tick' }))
    expect(t(ev(700, { kind: 'orchestration.falseFinish', afterMs: 400, count: 2, waitMs: 1_500 })))
      .toBe('0.7s false finish 2 this turn: you went on 0.4 s after the send; READY now waits for 1.5 s of quiet')
    expect(t(ev(3_000, { kind: 'orchestration.ready', text: 'x', append: false, waitedMs: 1_500 }))).toBe("3.0s sound model's finish counted after 1.5 s of quiet")
    expect(t(ev(4_000, { kind: 'orchestration.ready', text: 'y', append: false }))).toBeNull()
  })
})
