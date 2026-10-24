import { beforeEach, describe, expect, it, vi } from 'vitest'

const findMany = vi.hoisted(() => vi.fn())
const reader = vi.hoisted(() => vi.fn())
vi.mock('wasp/server', () => ({ prisma: { operation: { findMany } } }))
vi.mock('../../conversations/readingRule', () => ({ requireConversationReader: reader }))

import { proposingConversations } from '../proposedIn'

beforeEach(() => { vi.clearAllMocks() })

describe('the conversation a version was proposed in @SC-1291', () => {
  it('names the newest conversation that ran the proposing run, when the reader may read it', async () => {
    findMany.mockResolvedValue([
      { runId: 'a', conversationId: 'c2', conversation: { title: 'Newer' } },
      { runId: 'a', conversationId: 'c1', conversation: { title: 'Older' } },
    ])
    reader.mockResolvedValue({})
    const found = await proposingConversations(['a', null, 'a'], 'u1')
    expect(found.get('a')).toEqual({ conversationId: 'c2', title: 'Newer' })
  })

  it('names nothing for a conversation the reader may not read', async () => {
    findMany.mockResolvedValue([{ runId: 'a', conversationId: 'c1', conversation: { title: 'Private' } }])
    reader.mockRejectedValue(new Error('Conversation not found'))
    expect((await proposingConversations(['a'], 'u1')).size).toBe(0)
  })

  it('reads nothing when no version has a proposing run', async () => {
    expect((await proposingConversations([null], 'u1')).size).toBe(0)
    expect(findMany).not.toHaveBeenCalled()
  })
})
