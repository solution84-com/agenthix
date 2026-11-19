import { describe, expect, it } from 'vitest'
import type { PlaygroundDecision, PlaygroundEntry } from '../../../../shared/voicePlayground'
import { decisionRows } from '../decisions'

const person = (id: string, text: string, turnId: string, at: number): PlaygroundEntry => ({ id, role: 'person', text, at, turnId, spoken: true })
const agent = (id: string, turnId: string, p: Partial<PlaygroundEntry>): PlaygroundEntry => ({ id, role: 'agent', text: '', at: 0, turnId, state: 'COMPLETED', ...p })

describe("the Log's decision rows @SC-1840", () => {
  it('shows a hold with its reason and how long after the turn was sent it came', () => {
    const d: PlaygroundDecision[] = [{ turnId: 't1', kind: 'held', text: 'Ended on "and".', at: 1_800 }]
    const rows = decisionRows([person('p1', 'Move it to Thursday and', 't1', 1_000), agent('a1', 't1', { withdrawn: true })], d)
    expect(rows).toEqual([{ turnId: 't1', said: 'Move it to Thursday and', outcome: 'Held, kept listening', detail: 'Ended on "and".', gap: '+0.80 s', at: 1_800, held: true }])
  })

  it('shows an opening sentence with the work started, and a plain reply', () => {
    const d: PlaygroundDecision[] = [{ turnId: 't2', kind: 'work', text: 'Pull the bill', at: 3_000 }]
    const rows = decisionRows([
      person('p2', 'Review the bill', 't2', 2_000), agent('a2', 't2', { text: 'Let me pull up the bill. More after.', firstTextAt: 3_100 }),
      person('p3', 'Two plus two?', 't3', 5_000), agent('a3', 't3', { text: 'Four.', firstTextAt: 5_900 }),
    ], d)
    expect(rows.map(r => r.outcome)).toEqual(['Opening sentence, work started', 'Plain reply'])
    expect(rows[0]).toMatchObject({ detail: '“Let me pull up the bill.” · work: Pull the bill', gap: '+1.10 s' })
    expect(rows[1]).toMatchObject({ detail: 'Four.', gap: '+0.90 s', at: 5_900, held: false })
  })

  it('carries the reply\'s tone, from its tag, for the HEAVY row (spec §Tone) @SC-2234', () => {
    const d: PlaygroundDecision[] = [{ turnId: 't8', kind: 'tone', text: 'gentle', at: 1_000 }]
    const rows = decisionRows([person('p8', 'My dog died', 't8', 0), agent('a8', 't8', { text: 'I am so sorry.', firstTextAt: 900 })], d)
    expect(rows[0]).toMatchObject({ outcome: 'Plain reply', tone: 'gentle' })
    expect(decisionRows([person('p9', 'Hi', 't9', 0), agent('a9', 't9', { text: 'Hi.' })], [])[0]).not.toHaveProperty('tone')
  })

  it('says when work started with no opening sentence', () => {
    const d: PlaygroundDecision[] = [{ turnId: 't5', kind: 'work', text: 'Stale tasks', at: 1_000 }]
    const rows = decisionRows([person('p5', 'Find the stale tasks', 't5', 0), agent('a5', 't5', {})], d)
    expect(rows[0]).toMatchObject({ outcome: 'Work started, no opening sentence', detail: 'work: Stale tasks', gap: '' })
  })

  it('marks a reply dropped when the person went on, one still running, and one that failed', () => {
    const rows = decisionRows([
      person('p4', 'Hello there', 't4', 0), agent('a4', 't4', { state: 'CANCELLED', withdrawn: true }),
      person('p6', 'And then', 't6', 0), agent('a6', 't6', { state: 'RUNNING' }),
      person('p7', 'Why', 't7', 0), agent('a7', 't7', { state: 'FAILED', error: 'No key' }),
    ], [])
    expect(rows.map(r => [r.outcome, r.detail])).toEqual([['Dropped (they went on)', ''], ['Thinking…', ''], ['Failed', 'No key']])
  })

  it('joins the messages one turn answered', () => {
    const rows = decisionRows([person('p1', 'So I was', 't1', 0), person('p2', 'thinking.', 't1', 500), agent('a1', 't1', { text: 'Go on.', firstTextAt: 1_500 })], [])
    expect(rows[0]).toMatchObject({ said: 'So I was thinking.', gap: '+1.00 s' })
  })
})
