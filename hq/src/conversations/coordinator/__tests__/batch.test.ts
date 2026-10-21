/**
 * Which waiting messages one turn takes (conversation layer spec, A message while a reply streams): in order,
 * and several only when they are consecutive messages by one author — a change of author is a new turn.
 */
import { describe, it, expect } from 'vitest'
import { nextBatch, type PendingMessage } from '../batch'

const at = (s: number) => new Date(Date.UTC(2026, 9, 16, 9, 0, s))
const msg = (seq: number, authorId: string | null): PendingMessage => ({ id: `m${seq}`, seq, authorId, createdAt: at(seq), queueState: null })

describe('nextBatch @SC-946', () => {
  it('takes nothing when nothing waits', () => {
    expect(nextBatch([])).toEqual([])
  })

  it("takes every consecutive message by the first message's author, in order", () => {
    expect(nextBatch([msg(3, 'a'), msg(4, 'a'), msg(5, 'a')]).map(m => m.seq)).toEqual([3, 4, 5])
  })

  it('stops at a change of author, which is the next turn', () => {
    expect(nextBatch([msg(3, 'a'), msg(4, 'b'), msg(5, 'a')]).map(m => m.seq)).toEqual([3])
  })

  it('orders by seq whatever order they were read in', () => {
    expect(nextBatch([msg(5, 'a'), msg(3, 'a'), msg(4, 'b')]).map(m => m.seq)).toEqual([3])
  })
})
