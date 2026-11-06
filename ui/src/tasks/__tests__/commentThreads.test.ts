import { describe, expect, it } from 'vitest'
import { replyParentId, threadComments } from '../commentThreads'

const c = (id: string, minute: number, parentId: string | null = null) => ({ id, parentId, createdAt: new Date(2026, 10, 6, 9, minute) })

describe("a task's comments, threaded one level", () => {
  it('puts each reply under its top comment, oldest first', () => {
    const threads = threadComments([c('b', 2), c('a', 1), c('a2', 4, 'a'), c('a1', 3, 'a')])
    expect(threads.map(t => [t.comment.id, t.replies.map(r => r.id)])).toEqual([['a', ['a1', 'a2']], ['b', []]])
  })

  it('attaches a reply to a reply to the top comment of its thread', () => {
    const threads = threadComments([c('a', 1), c('a1', 2, 'a'), c('a1x', 3, 'a1')])
    expect(threads).toHaveLength(1)
    expect(threads[0].replies.map(r => r.id)).toEqual(['a1', 'a1x'])
    expect(replyParentId([c('a', 1), c('a1', 2, 'a'), c('a1x', 3, 'a1')], 'a1x')).toBe('a')
    expect(replyParentId([c('a', 1), c('a1', 2, 'a')], 'a1')).toBe('a')
  })

  it('shows a reply whose comment is not in the list as a comment of its own', () => {
    expect(threadComments([c('r', 1, 'gone')]).map(t => t.comment.id)).toEqual(['r'])
  })
})
