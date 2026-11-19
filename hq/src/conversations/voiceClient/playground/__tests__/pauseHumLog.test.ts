/**
 * The Log and the server's trace for lane 25: the hum service's answers to a question asked as a pause began are marked
 * as the pause's, on each row and in the card's one line; a hum in the false-finish wait says READY was held, not
 * "not finished"; and the trace says a READY held by the wait.
 */
import { describe, expect, it } from 'vitest'
import type { VoiceEvent } from '../../events'
import { createTrailReader, emptyTrail } from '../pageTrail'
import { backchannelSteps } from '../otherSteps'
import { serviceLine } from '../serviceLine'
import { createTraceReader } from '../trace'

const T0 = 1_700_000_000_000
let seq = 0
const ev = (t: number, body: Record<string, unknown>) => ({ t, seq: seq++, ...body }) as unknown as VoiceEvent

function steps(events: VoiceEvent[]) {
  const trail = emptyTrail()
  const reader = createTrailReader(trail, () => T0)
  for (const e of events) reader(e)
  return backchannelSteps(trail)
}

const telling = [
  ev(1_000, { kind: 'hum.held', call: 1, humKind: 'none', tone: null, askedAt: 600, ms: 400, skipped: 0 }),
  ev(5_350, { kind: 'hum.held', call: 2, humKind: 'continuer', tone: 'curious', askedAt: 5_000, ms: 350, skipped: 0, atPause: true }),
  ev(5_500, { kind: 'backchannel.hum', pausedMs: 500, verdict: 'READY', inWait: true, speechMs: 5_000, hum: 'continuer', tone: 'curious', from: { call: 2, at: 5_350, ms: 350 } }),
  ev(5_505, { kind: 'backchannel.played', text: 'Mm.', hum: 'continuer', tone: 'curious', take: 1 }),
  ev(7_800, { kind: 'hum.dropped', call: 3, humKind: 'news', tone: 'calm', ms: 2_100, waitedMs: 2_100, skipped: 0, atPause: true }),
]

describe('pause-start answers and hums in the wait, in the Log @SC-2228 @SC-2230', () => {
  it('marks each answer to a pause-start question, held or dropped', () => {
    const service = steps(telling).filter(s => s.tag === 'service')
    expect(service.map(s => s.detail)).toEqual([
      'call 0.40 s', 'call 0.35 s · asked as the pause began', 'call 2.10 s · asked as the pause began',
    ])
  })

  it('counts them in the card\'s one line', () => {
    expect(serviceLine(steps(telling))).toBe(
      '3 hum service answers: none ×1, continuer curious ×1 · median 0.40 s · slowest 2.10 s · none skipped · 1 dropped · 2 asked as a pause began')
  })

  it('says a hum in the wait came while READY was held, not that the sound model said not finished', () => {
    const hum = steps(telling).find(s => s.tag === 'hum')!
    expect(hum.detail).toBe("its call took 0.35 s · paused 0.5 s · READY, held by the false-finish wait · 5 s of your speech since the agent's last sound")
  })

  it('says each in the trace', () => {
    const t = createTraceReader()
    t(ev(0, { kind: 'clock.tick' }))
    expect(t(ev(5_000, { kind: 'hum.held', call: 2, humKind: 'continuer', tone: 'curious', askedAt: 4_650, ms: 350, skipped: 0, atPause: true })))
      .toBe('5.0s hum service (asked as the pause began): continuer curious in 0.35 s')
    expect(t(ev(5_500, { kind: 'orchestration.finishHeld', waitMs: 1_000, until: 6_000 })))
      .toBe("5.5s sound model's finish held: false finishes this turn ask for 1.0 s of quiet")
    expect(t(ev(5_600, { kind: 'backchannel.hum', pausedMs: 600, verdict: 'READY', inWait: true, speechMs: 5_000, hum: 'continuer', tone: 'curious' })))
      .toBe('5.6s backchannel: a continuer curious hum is due (paused 0.6 s, READY held by the false-finish wait, 5.0 s of speech)')
  })
})
