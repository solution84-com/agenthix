// @vitest-environment jsdom
/** *Save to the task* (T0): in a task's conversation, a message — the person's or the agent's — becomes a comment on the task. */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { ConversationMessageView } from '../../../shared/conversations/protocol'

const h = vi.hoisted(() => ({ addTaskComment: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  useQuery: () => ({ data: undefined, error: null, isLoading: false }),
  getAnswerFacts: 'getAnswerFacts', getTask: 'getTask', getOperationResult: 'getOperationResult', speakAnswer: vi.fn(),
  addTaskComment: h.addTaskComment,
}))
vi.mock('../../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: () => null }))
vi.mock('../../../shared/components/MarkdownMessage', () => ({ MarkdownMessage: ({ content }: { content: string }) => <p>{content}</p> }))

import { TurnBlockView } from '../TurnBlock'
import { PersonBubble } from '../MessageItem'
import { saveToTask } from '../SaveToTask'

afterEach(() => { cleanup(); h.addTaskComment.mockReset() })

const agent = { id: 'a1', name: 'Writer', handle: 'writer', avatarUrl: null }
function msg(kind: string, role: string, body: unknown): ConversationMessageView {
  return {
    id: `m-${role}`, seq: 1, clientMessageId: null, role, authorId: role === 'PERSON' ? 'u1' : null, agentId: role === 'AGENT' ? 'a1' : null, kind, body,
    spoken: false, interrupted: false, operationId: null, turnId: 't1', queueState: null, createdAt: '2026-11-05T18:10:00.000Z',
  } as ConversationMessageView
}

describe('Save to the task', () => {
  it("is under the agent's answer in a task's conversation, and saves its words", async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const answer = msg('TEXT', 'AGENT', { text: 'Use the tone of the About page.' })
    render(<MemoryRouter><TurnBlockView block={{ cards: [], words: [answer], set: [] } as never} agent={agent} work={{ conversationId: 'c1', myId: 'u1', saveToTask: save }} /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Save to the task' }))
    await waitFor(() => expect(save).toHaveBeenCalledWith('Use the tone of the About page.'))
    expect(await screen.findByRole('button', { name: 'Saved to the task' })).toBeTruthy()
  })

  it('is not offered outside a task\'s conversation', () => {
    const answer = msg('TEXT', 'AGENT', { text: 'Hello.' })
    render(<MemoryRouter><TurnBlockView block={{ cards: [], words: [answer], set: [] } as never} agent={agent} work={{ conversationId: 'c1', myId: 'u1' }} /></MemoryRouter>)
    expect(screen.queryByRole('button', { name: 'Save to the task' })).toBeNull()
  })

  it("is under the person's own message too", async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    render(<PersonBubble message={msg('TEXT', 'PERSON', { text: 'No prices on the home page.' }) as never} onSaveToTask={save} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save to the task' }))
    await waitFor(() => expect(save).toHaveBeenCalledWith('No prices on the home page.'))
  })

  it("writes the words as the person's comment on the task, and says why when HQ refuses", async () => {
    const show = vi.fn()
    h.addTaskComment.mockResolvedValueOnce({ id: 'c1' })
    await saveToTask('task-1', show)(' Keep it short. ')
    expect(h.addTaskComment).toHaveBeenCalledWith({ taskId: 'task-1', content: 'Keep it short.', savedFromConversation: true })
    h.addTaskComment.mockRejectedValueOnce(new Error('Viewers cannot comment. Nothing was changed.'))
    await expect(saveToTask('task-1', show)('Again')).rejects.toThrow()
    expect(show).toHaveBeenCalledWith(expect.objectContaining({ text: 'Viewers cannot comment. Nothing was changed.', retry: expect.any(Function) }))
  })
})
