import { describe, expect, it } from 'vitest'
import type { VoiceEvent, VoiceEventBody } from '../../events'
import { createTrailReader, emptyTrail } from '../pageTrail'
import { toneSteps } from '../toneSteps'
import { createTraceReader } from '../trace'

const reading = (happy: number, final = false): VoiceEventBody =>
  ({ kind: 'tone.voice', final, emotion: [{ label: 'happy', confidence: happy }], style: [{ label: 'laughing', confidence: 0.83 }] })

function events(bodies: [number, VoiceEventBody][]): VoiceEvent[] {
  return bodies.map(([t, b], seq) => ({ ...b, t, seq }) as VoiceEvent)
}

const TELLING = events([
  [6_200, reading(0.71)], [6_300, reading(0.71)], [6_500, reading(0.71, true)], [6_550, reading(0.4)],
  [6_600, { kind: 'tone.hint', hint: 'laughing' }],
  [9_000, { kind: 'tone.hint', hint: null }],
])

describe('the voice profile and the voice hint in the Log @SC-2233 @SC-2234', () => {
  it('a VOICE row for each reading that changed, beside your words; a TONE row as the voice hint changes', () => {
    const trail = emptyTrail()
    const read = createTrailReader(trail, () => 6_200)
    for (const e of TELLING) read(e)
    expect(toneSteps(trail).map(s => [s.at, s.actor, s.title, s.detail ?? '', s.aside])).toEqual([
      [6_200, 'VOICE', 'happy 0.71 · laughing 0.83', 'on a partial transcript · reading 1', true],
      [6_550, 'VOICE', 'happy 0.40 · laughing 0.83', 'on a partial transcript · reading 4', true],
      [6_600, 'TONE', 'you sound laughing: offered to the light model and the listening read', '', true],
      [9_000, 'TONE', 'no voice hint offered', '', true],
    ])
  })

  it('the trace says every reading, numbered, with when it came and whether on a final, so how often they come can be judged', () => {
    const trace = createTraceReader()
    expect(TELLING.map(trace).filter(Boolean)).toEqual([
      '0.0s voice profile reading 1 (partial): happy 0.71 · laughing 0.83',
      '0.1s voice profile reading 2 (partial): happy 0.71 · laughing 0.83',
      '0.3s voice profile reading 3 (final): happy 0.71 · laughing 0.83',
      '0.3s voice profile reading 4 (partial): happy 0.40 · laughing 0.83',
      '0.4s voice hint: laughing',
      '2.8s voice hint: none',
    ])
  })
})
