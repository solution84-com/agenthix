import { describe, expect, it } from 'vitest'
import type { TimedWord } from '../../events'
import { begin, cut, heard, NO_WORDS, resumePoint, type HeardWords, type ReconcilerState, type WordsOut } from '../reconciler'

const w = (text: string, startAt: number, endAt = startAt + 200): TimedWord => ({ text, startAt, endAt })
const msg = (words: TimedWord[], committed = false, turn: number | null = 0, text?: string): HeardWords =>
  ({ text: text ?? words.map(x => x.text).join(' '), words, committed, turn })

function run(steps: Array<(s: ReconcilerState) => { state: ReconcilerState; emit: WordsOut[] }>) {
  let state = NO_WORDS
  const out: WordsOut[] = []
  for (const step of steps) { const r = step(state); state = r.state; out.push(...r.emit) }
  return { state, out }
}

describe('the reconciler', () => {
  it('tells provisional from committed, and gives each turn one order', () => {
    const { out } = run([
      s => heard(s, 0, msg([w('book', 0)])),
      s => heard(s, 0, msg([w('book', 0), w('the', 200)])),
      s => heard(s, 0, msg([w('Book', 0), w('the', 200), w('room.', 400)], true, 0, 'Book the room.')),
      s => heard(s, 0, msg([w('thanks', 2_000)], false, 1)),
    ])
    expect(out.map(o => [o.order, o.committed, o.text])).toEqual([
      [0, false, 'book'], [0, false, 'book the'], [0, true, 'Book the room.'], [1, false, 'thanks'],
    ])
  })

  it('never changes a committed turn: anything more from it is ignored', () => {
    const { out } = run([
      s => heard(s, 0, msg([w('yes', 0)], true)),
      s => heard(s, 0, msg([w('yes', 0), w('no', 200)], true)),
      s => heard(s, 0, msg([w('yes', 0)], false)),
    ])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ committed: true, text: 'yes' })
  })

  it('carries the turn across a replacement, lining up the two connections by time', () => {
    const { out, state } = run([
      s => heard(s, 0, msg([w('move', 0), w('the', 200), w('meet', 400)])),
      (s) => { const c = cut(s, 0, 'carry'); expect(c.from).toBe(400); return c },
      s => ({ state: begin(s, 1, 400), emit: [] }),
      // The new connection hears from just before 400: a word it hears again before that point is left out.
      s => heard(s, 1, msg([w('the', 150, 350), w('meeting', 400, 700), w('tomorrow', 700, 1_000)])),
      s => heard(s, 1, msg([w('the', 150, 350), w('meeting', 400, 700), w('tomorrow.', 700, 1_000)], true, 0)),
    ])
    expect(out.map(o => [o.order, o.committed, o.text])).toEqual([
      [0, false, 'move the meet'],
      [0, false, 'move the meeting tomorrow'],
      [0, true, 'move the meeting tomorrow.'],
    ])
    expect(state.committedUntil).toBe(1_000)
  })

  it('commits the turn as heard at a send, and hears the next connection from its end', () => {
    const c = run([s => heard(s, 0, msg([w('done', 0)]))])
    const step = cut(c.state, 0, 'commit')
    expect(step.emit).toEqual([{ text: 'done', words: [w('done', 0)], committed: true, order: 0 }])
    expect(step.from).toBe(200)
    const next = heard(begin(step.state, 1, step.from), 1, msg([w('done', 0), w('and', 300)]))
    expect(next.emit).toEqual([{ text: 'and', words: [w('and', 300)], committed: false, order: 1 }])
  })

  it('replaced twice before the next connection hears anything: heard from the same point, no word lost', () => {
    let s = heard(NO_WORDS, 0, msg([w('a', 0), w('b', 200)])).state
    const first = cut(s, 0, 'carry')
    s = begin(first.state, 1, first.from)
    const second = cut(s, 1, 'carry')
    expect(second.from).toBe(first.from)
    expect(resumePoint(second.state)).toBe(200)
    const out = heard(begin(second.state, 2, second.from), 2, msg([w('b', 200), w('c', 400)], true))
    expect(out.emit[0]).toMatchObject({ text: 'a b c', committed: true, order: 0 })
  })

  it('keeps untimed words as they come', () => {
    const { out } = run([s => heard(s, 0, { text: 'hello there', words: [], committed: true, turn: 3 })])
    expect(out).toEqual([{ text: 'hello there', words: [], committed: true, order: 0 }])
  })

  it('finishes a turn the service left open when it starts the next', () => {
    const { out } = run([
      s => heard(s, 0, msg([w('one', 0)], false, 0)),
      s => heard(s, 0, msg([w('two', 1_000)], false, 1)),
    ])
    expect(out.map(o => [o.order, o.committed, o.text])).toEqual([[0, false, 'one'], [0, true, 'one'], [1, false, 'two']])
  })
})
