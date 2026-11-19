/**
 * The Log's PACE rows (adaptive pacing and the listening style): one with each turn's end, the pace in force then ("23
 * breaths · 9 in 10 under 1.5 s → finish wait 1.7 s · hums up to 1.3 s"); one with each change of style, with the light
 * model's words that caused it; neither cuts a stretch of your words. The SOUND row says what set its wait.
 */
import { describe, expect, it } from 'vitest'
import type { VoiceEvent } from '../../events'
import { learnedOf } from '../../pacing/pace'
import { PACING_SETTINGS } from '../../pacing/settings'
import { logTurns } from '../logTurns'
import { soundSteps } from '../otherSteps'
import { createTrailReader, emptyTrail } from '../pageTrail'
import { paceSteps } from '../paceSteps'

const T0 = 1_700_000_000_000
let seq = 0
const ev = (t: number, body: Record<string, unknown>) => ({ t, seq: seq++, ...body }) as unknown as VoiceEvent
const owner = [300, 500, 600, 700, 700, 900, 1_100, 1_200, 1_300, 1_300, 1_500, 2_600]

function trailOf(events: VoiceEvent[]) {
  const trail = emptyTrail()
  const read = createTrailReader(trail, () => T0)
  for (const e of events) read(e)
  return trail
}

describe('PACE in the Log @SC-2231 @SC-2232', () => {
  it('a row with each turn\'s end: the pace in force then, learned or not yet', () => {
    const trail = trailOf([
      ev(0, { kind: 'orchestration.floor', state: 'person-speaking' }),
      ev(500, { kind: 'orchestration.pace', heard: 3, breathMs: [700, 800, 900], learned: null }),
      ev(1_000, { kind: 'orchestration.ready', text: 'one', append: false }),
      ev(5_000, { kind: 'orchestration.pace', heard: 23, breathMs: owner, learned: learnedOf(owner, PACING_SETTINGS) }),
      ev(4_500, { kind: 'semantics.decision', answer: 'READY', confidence: 0.9, silenceMs: 500, by: 'model' }),
      ev(6_000, { kind: 'orchestration.ready', text: 'two', append: false, waitedMs: 1_700, paced: true }),
    ])
    const rows = paceSteps(trail)
    expect(rows.map(r => r.title)).toEqual([
      '3 breaths · not learned yet: the fixed finish wait and hum window',
      '23 breaths · 9 in 10 under 1.5 s → finish wait 1.7 s · hums up to 1.3 s',
    ])
    expect(rows.every(r => r.actor === 'PACE' && r.aside)).toBe(true)
    expect(soundSteps(trail)[1]!.detail).toBe('waited for 1.7 s of quiet, set by your pace')
  })

  it('a row with each change of style the reply set; the pace row then names the style', () => {
    const trail = trailOf([
      ev(1_000, { kind: 'listen.style', state: { hums: 'off', patient: true }, asked: 'patient' }),
      ev(1_500, { kind: 'semantics.decision', answer: 'READY', confidence: 0.9, silenceMs: 500, by: 'model' }),
      ev(2_000, { kind: 'orchestration.ready', text: 'and so', append: false, waitedMs: 1_500, patient: true }),
    ])
    const rows = paceSteps(trail)
    expect(rows.find(r => r.tag === 'style')).toMatchObject({
      title: 'patient → no hums · patient: waits longer, no line until the turn ends', detail: 'set by the reply',
    })
    expect(rows.find(r => r.tag === 'pace')!.detail).toBe('style: no hums · patient: waits longer, no line until the turn ends')
    expect(soundSteps(trail)[0]!.detail).toBe('waited for 1.5 s of quiet, set by your “let me finish”')
  })

  it('cuts no stretch of your words', () => {
    const at = T0 + 1_000
    const view = logTurns({
      steps: [{ id: 'p', at, actor: 'PACE', tag: 'style', aside: true, title: 'x' }],
      words: [{ at: T0, text: 'so the first' }, { at: T0 + 2_000, text: 'so the first thing is' }],
      speechStarts: [T0], messages: [],
    })
    expect(view.cards[0]!.steps.filter(s => s.actor === 'YOU')).toHaveLength(1)
  })
})
