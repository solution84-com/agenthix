/** The conversation's record as the screen reads it (every screen reviewed, *What a conversation shows*). */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const usernames = vi.hoisted(() => vi.fn())
vi.mock('../../projects/onBehalfOfOperations', () => ({ usernames }))

import { withConversationRecord, conversationRows, namedPeople, tryAgainPrompt } from '../conversationRecord'

const at = (m: number) => new Date(Date.UTC(2026, 9, 10, 10, m)).toISOString()
const request = { tools: [{ name: 'web_fetch', reason: 'https://example.com/notes' }], bashPatterns: [{ pattern: 'npm install sdk@0.9.2' }] }

beforeEach(() => {
  usernames.mockReset()
  usernames.mockResolvedValue(new Map([['u-ana', 'Ana']]))
})

describe('the conversation record @SC-699', () => {
  const rows = [
    { role: 'USER' as const, content: 'Check the notes.', runId: 'r1', createdAt: at(44) },
    { role: 'SYSTEM' as const, kind: 'APPROVAL_REQUESTED' as const, content: '', runId: 'r1', createdAt: at(46),
      approval: { status: 'APPROVED' as const, request, decidedById: 'u-ana', decidedAt: at(52), reason: null } },
    { role: 'SYSTEM' as const, kind: 'CONTEXT_SUMMARISED' as const, content: '', runId: 'r2', createdAt: at(53),
      detail: { trigger: 'manual' as const, summary: 'What we agreed.', tokensBefore: 188_000, byId: 'u-me' } },
    { role: 'SYSTEM' as const, kind: 'RUN_FAILED' as const, content: '', runId: 'r3', createdAt: at(55), detail: { reason: 'The model provider was overloaded.' } },
  ]

  it('words an approval as Notifications does, naming who answered @SC-696', () => {
    const [, card] = conversationRows(rows, 'u-me', new Map([['u-ana', 'Ana']]))
    expect(card.approvalCard).toEqual({
      answer: 'approved',
      items: [
        { does: 'Fetch a web page', why: 'https://example.com/notes', command: false },
        { does: 'npm install sdk@0.9.2', why: null, command: true },
      ],
      decidedBy: 'Ana', decidedByYou: false, decidedAt: at(52), reason: null, allowedFor: 'this_run',
    })
  })

  it('says the viewer asked for a summary, as "You summarised" @SC-698', () => {
    const summary = conversationRows(rows, 'u-me', new Map())[2]
    expect(summary).toMatchObject({ summarisedBy: null, summarisedByYou: true })
  })

  it('looks up only the people other than the viewer', () => {
    expect(namedPeople(rows, 'u-me')).toEqual(['u-ana'])
  })

  it("gives the header's facts: replies, the failed ones, Try again's failure and the agent's memory @SC-697 @SC-699", async () => {
    const use = { tokens: 1, summarisesAt: null, window: 2, at: at(55) }
    const { conversation } = await withConversationRecord(rows, 'u-me', use)
    expect(conversation).toEqual({
      replies: 1, failed: 1, contextUse: use,
      latestFailure: { runId: 'r3', reason: 'The model provider was overloaded.', message: 'Check the notes.' },
    })
    expect(usernames).toHaveBeenCalledWith(['u-ana'])
  })
})

describe('what Try again tells the agent @SC-695', () => {
  it('Try again sends the same message, saying the last attempt failed', () => {
    expect(tryAgainPrompt({ runId: 'r3', reason: 'The model provider was overloaded.', message: 'Check the notes.' }))
      .toBe('[Your last reply to this message did not finish. The model provider was overloaded. The person asked you to try again.]\n\nCheck the notes.')
  })
})
