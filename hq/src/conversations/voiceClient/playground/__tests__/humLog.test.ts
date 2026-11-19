/**
 * The hum service in the playground's Log (spec §The backchannel): each answer kept from the page's events, a played hum
 * with its kind, tone, words and the answer it came from, and one folded line per card with the kinds and the calls'
 * speed.
 */
import { describe, expect, it } from 'vitest'
import type { VoiceEvent } from '../../events'
import { createTrailReader, emptyTrail } from '../pageTrail'
import { backchannelSteps } from '../otherSteps'
import { logTurns } from '../logTurns'
import { serviceLine } from '../serviceLine'

const T0 = 1_700_000_000_000
let seq = 0
const ev = (t: number, body: Record<string, unknown>) => ({ t, seq: seq++, ...body }) as unknown as VoiceEvent

function read(events: VoiceEvent[]) {
  const trail = emptyTrail()
  const reader = createTrailReader(trail, () => T0)
  for (const e of events) reader(e)
  return trail
}

const held = (t: number, humKind: string, tone: string | null, ms: number, skipped = 0) =>
  ev(t, { kind: 'hum.held', call: t, humKind, tone, askedAt: t - ms, ms, skipped })

const telling = [
  ev(0, { kind: 'stt.utterance', text: 'so last weekend' }),
  held(1_000, 'none', null, 400),
  held(2_400, 'continuer', 'calm', 420),
  held(3_400, 'continuer', 'calm', 470, 1),
  ev(4_000, { kind: 'hum.dropped', call: 9, humKind: 'news', tone: 'calm', ms: 2_300, waitedMs: 2_300, skipped: 0 }),
  held(7_500, 'sympathy', 'gentle', 510),
  ev(8_000, { kind: 'backchannel.hum', pausedMs: 700, verdict: 'UNCERTAIN', speechMs: 5_000, hum: 'sympathy', tone: 'gentle', from: { call: 7_500, at: 7_500, ms: 510 } }),
  ev(8_005, { kind: 'backchannel.played', text: 'Oh no.', hum: 'sympathy', tone: 'gentle', made: 'new', pausedMs: 705 }),
]

describe('the hum service in the Log @SC-2228 @SC-2227', () => {
  it('keeps each answer, held or dropped, with its call\'s time', () => {
    const trail = read(telling)
    expect(trail.humAnswers.map(a => [a.at - T0, a.kind, a.tone, a.ms, a.dropped ?? false])).toEqual([
      [1_000, 'none', null, 400, false], [2_400, 'continuer', 'calm', 420, false], [3_400, 'continuer', 'calm', 470, false],
      [4_000, 'news', 'calm', 2_300, true], [7_500, 'sympathy', 'gentle', 510, false],
    ])
  })

  it('shows a played hum with its kind, tone, the word picked and whether it was made new, from the answer it came from', () => {
    const steps = backchannelSteps(read(telling))
    const hum = steps.find(s => s.tag === 'hum')!
    expect(hum.title).toBe('sympathy · gentle · “Oh no.” · made new')
    expect(hum.from).toBe(steps.find(s => s.tag === 'service' && s.at === T0 + 7_500)!.id)
    expect(hum.detail).toMatch(/^its call took 0\.51 s · paused 0\.7 s/)
    expect(steps.filter(s => s.tag === 'service').map(s => s.title)).toEqual([
      'none', 'continuer calm', 'continuer calm', 'news calm, dropped: it came 2.30 s after its question', 'sympathy gentle',
    ])
  })

  it('folds the answers into one line per card, which cuts none of your words, and times the hum from the answer', () => {
    const view = logTurns({
      steps: backchannelSteps(read(telling)),
      words: [{ at: T0, text: 'so last weekend' }, { at: T0 + 7_000, text: 'so last weekend my friend twisted her ankle' }],
      speechStarts: [T0], messages: [],
    })
    const [card] = view.cards
    expect(card!.steps.filter(s => s.actor === 'YOU')).toHaveLength(1)
    expect(card!.steps.find(s => s.tag === 'hum')!.detail).toMatch(/^from the hum service's answer at 7\.5 s · its call took 0\.51 s/)
    expect(serviceLine(card!.steps)).toBe(
      '5 hum service answers: none ×1, continuer calm ×2, sympathy gentle ×1 · median 0.47 s · slowest 2.30 s · 1 skipped · 1 dropped')
  })

  it('says nothing for a card with no answers', () => {
    expect(serviceLine([{}, {}])).toBeNull()
  })
})
