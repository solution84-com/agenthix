import { describe, expect, it } from 'vitest'
import { withThreadMarks } from '../threadMarks'
import { card } from './boardFixtures'

describe('the board\'s thread marks @SC-978', () => {
  it('marks a task that has a thread with this viewer\'s unread count, and leaves the others as they were', () => {
    const a = card({ id: 'a' })
    const b = card({ id: 'b' })
    const c = card({ id: 'c' })
    const out = withThreadMarks([a, b, c], [
      { taskId: 'a', conversationId: 'c1', unread: 3 },
      { taskId: 'c', conversationId: 'c2', unread: 0 },
    ])
    expect(out.map((x) => x.threadUnread)).toEqual([3, undefined, 0])
    expect(out[1]).toBe(b)
  })

  it('returns the same cards when no task has a thread', () => {
    const cards = [card()]
    expect(withThreadMarks(cards, [])).toBe(cards)
  })
})
