import { describe, expect, it, vi } from 'vitest'

const readMessages = vi.hoisted(() => vi.fn(async () => []))
vi.mock('wasp/server', () => ({
  HttpError: class extends Error {
    constructor(public statusCode: number, message: string) {
      super(message)
    }
  },
  prisma: {},
}))
vi.mock('../readingRule', () => ({ requireConversationReader: async () => ({ id: 'c1' }), readConversationAs: vi.fn(), CLOSED_WITH_ITS_PROJECT: 'x' }))
vi.mock('../store/messages', () => ({ readMessages, readWaitingMessages: vi.fn() }))
vi.mock('../../projects/membership', () => ({ projectStanding: vi.fn() }))
vi.mock('../primaryAgent', () => ({ toAgentView: vi.fn() }))
vi.mock('../access/talkingModel', () => ({ choiceValue: vi.fn(), resolveTalking: vi.fn() }))
vi.mock('../voice/availability', () => ({ loadVoiceFacts: vi.fn(), voiceStartedAt: vi.fn(), voiceView: vi.fn() }))
vi.mock('../people', () => ({ peopleOf: vi.fn() }))

import { getConversationMessages } from '../conversationQueries'

const ctx = { user: { id: 'u1' } }

describe('getConversationMessages arguments', () => {
  it.each(['abc', NaN, 1.5, Infinity])('refuses a limit of %s with 400', async limit => {
    await expect(getConversationMessages({ conversationId: 'c1', limit } as never, ctx)).rejects.toMatchObject({ statusCode: 400 })
    expect(readMessages).not.toHaveBeenCalled()
  })

  it('refuses a beforeSeq that is not a whole number with 400', async () => {
    await expect(getConversationMessages({ conversationId: 'c1', beforeSeq: 'x' } as never, ctx)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('still answers with no limit', async () => {
    await expect(getConversationMessages({ conversationId: 'c1' }, ctx)).resolves.toEqual({ messages: [], hasMore: false })
  })
})
