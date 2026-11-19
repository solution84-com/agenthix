/**
 * The hum set (spec §The backchannel): tellings cut into their words second by second and at each marked point, each
 * point scored for kind (right, near, wrong) and apart for tone, and the set run through the hum service's own call
 * with a scripted model; speed over every call.
 */
import { describe, expect, it } from 'vitest'
import { isHumTone } from '../../../voiceClient/backchannel/kinds'
import { humSummary, runHumTelling, scorePoint } from '../humSet/run'
import { TELLINGS, cutsOf } from '../humSet/tellings'
import { ACCESS, scriptedModel } from '../../../voice/playground/light/__tests__/fakes'

describe('the hum set\'s tellings @SC-2228', () => {
  it('has the tellings the brief names, each mark a kind in tones there are', () => {
    expect(TELLINGS.map(t => t.id)).toEqual(['hiking', 'launch', 'launch-moved', 'packing', 'dilemma', 'good-news', 'question-at-end'])
    for (const t of TELLINGS) {
      expect(t.words.split('|').length - 1).toBe(t.marks.length)
      for (const m of t.marks) if (m.kind !== 'none') for (const tone of m.tones ?? []) expect(isHumTone(tone)).toBe(true)
    }
    const hiking = TELLINGS[0]!
    expect(cutsOf(hiking).find(c => c.mark === 1)!.text).toMatch(/falls We left really early, about 6 in the morning$/)
    expect(cutsOf(hiking).find(c => c.mark === 3)!.text).toMatch(/twisted her ankle$/)
    expect(cutsOf(TELLINGS.find(t => t.id === 'launch-moved')!).find(c => c.mark === 0)!.text).toMatch(/okay, just so you know I moved the launch to next Friday$/)
    expect(TELLINGS.find(t => t.id === 'dilemma')!.marks[1]).toEqual({ kind: 'none' })
    expect(cutsOf(TELLINGS.find(t => t.id === 'question-at-end')!).at(-1)).toMatchObject({ text: expect.stringMatching(/revenue dropped\?$/), mark: 2 })
  })

  it('reads as the live transcript does: no full stop or ! in the words, a question keeps its ?, and no other cut ends in punctuation', () => {
    for (const t of TELLINGS) {
      expect(t.words).not.toMatch(/[.!]/)
      for (const cut of cutsOf(t)) expect(cut.text).not.toMatch(/[.,!;:]$/)
    }
    // A comma the speaker said mid-turn stays inside the words, but not at the end of what is shown.
    expect(cutsOf(TELLINGS.find(t => t.id === 'packing')!).find(c => c.mark === 0)!.text).toBe("For the trip I've packed the tent")
  })

  it('cuts a telling into its words as they grow, second by second, and at each point', () => {
    const cuts = cutsOf({ id: 'x', title: '', words: 'one two three four five. | six seven', marks: [{ kind: 'continuer' }] })
    // 2.5 words a second: two words at 1 s, five at 2 s, which is the point too.
    expect(cuts).toEqual([
      { atMs: 1_000, text: 'one two', mark: null },
      { atMs: 2_000, text: 'one two three four five', mark: 0 },
    ])
  })
})

describe('scoring a point', () => {
  it('counts the kind right, near or wrong, and the tone apart, only where the kind was right', () => {
    const want = { kind: 'sympathy' as const, tones: ['gentle' as const], near: ['news' as const] }
    expect(scorePoint(want, { kind: 'sympathy', tone: 'gentle' })).toEqual({ kind: 'right', tone: true })
    expect(scorePoint(want, { kind: 'sympathy', tone: 'warm' })).toEqual({ kind: 'right', tone: false })
    expect(scorePoint(want, { kind: 'news', tone: 'calm' })).toEqual({ kind: 'near', tone: null })
    expect(scorePoint(want, { kind: 'continuer', tone: 'calm' })).toEqual({ kind: 'wrong', tone: null })
    expect(scorePoint({ kind: 'none' }, { kind: 'none', tone: null })).toEqual({ kind: 'right', tone: null })
    expect(scorePoint({ kind: 'none' }, null)).toEqual({ kind: 'no answer', tone: null })
  })
})

describe('running the hum set', () => {
  it('times every call and scores the marked points, a perfect model passing them all', async () => {
    const model = scriptedModel([
      [/ankle\n\nThey have just paused\.$/, 'sympathy gentle | Oh no.'], [/(falls|morning)\n\nThey have just paused\.$/, 'continuer calm | Mm-hm.'], [/./, 'none'],
    ])
    const r = await runHumTelling(TELLINGS[0]!, model, ACCESS)
    expect(r.calls).toBe(cutsOf(TELLINGS[0]!).length)
    expect(r.points.map(p => [p.kind, p.tone])).toEqual([['right', true], ['right', true], ['right', null], ['right', true], ['right', null]])
    const h = humSummary([r])
    expect(h).toMatchObject({ points: 5, right: 5, near: 0, toned: 3, toneRight: 3, failed: 0 })
    expect(h.medianMs).toBeLessThanOrEqual(h.p90Ms)
  })
})
