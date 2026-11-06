// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { ConversationMessageView } from '../../../shared/conversations/protocol'

const h = vi.hoisted(() => ({ task: undefined as unknown }))
vi.mock('wasp/client/operations', () => ({ useQuery: () => ({ data: h.task }), getTask: 'getTask', getOperationResult: 'getOperationResult', getAnswerFacts: 'getAnswerFacts', speakAnswer: () => undefined }))
vi.mock('../../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: () => null }))
vi.mock('../../../shared/components/MarkdownMessage', () => ({ MarkdownMessage: ({ content }: { content: string }) => <p>{content}</p> }))

import { MessageItem } from '../MessageItem'
import type { WorkContext } from '../WorkContext'

afterEach(cleanup)

const agent = { id: 'a1', name: 'Kernel', handle: 'kernel', avatarUrl: null }
function msg(over: Record<string, unknown>): ConversationMessageView {
  return {
    id: 'm1', seq: 1, clientMessageId: null, role: 'AGENT', authorId: null, agentId: 'a1', kind: 'TEXT',
    body: { text: 'Hello' }, spoken: false, interrupted: false, operationId: null, turnId: 't1', queueState: null,
    createdAt: '2026-10-16T10:24:00.000Z', ...over,
  } as ConversationMessageView
}
const work = (over: Partial<WorkContext> = {}): WorkContext => ({
  conversationId: 'c1', myId: 'u1', placePath: '/projects/AGX', ...over,
})
const draw = (m: ConversationMessageView, w?: WorkContext) => render(<MemoryRouter><MessageItem message={m} agent={agent} work={w ?? work()} /></MemoryRouter>)

describe('a reply in a task\'s thread after the task changed hands @SC-976', () => {
  it('keeps the name of the agent that wrote it', () => {
    const ada = { id: 'a0', name: 'Ada', handle: 'ada', avatarUrl: null }
    draw(msg({ agentId: 'a0' }), work({ agentsById: { a0: ada, a1: agent } }))
    expect(screen.getByText('Ada')).toBeTruthy()
    cleanup()
    draw(msg({ agentId: 'a1' }), work({ agentsById: { a0: ada, a1: agent } }))
    expect(screen.getByText('Kernel')).toBeTruthy()
  })
})

describe('the action line @SC-1010', () => {
  const action = (target?: { kind: string; id: string; label: string }) =>
    msg({ role: 'PLATFORM', kind: 'ACTION', body: { text: 'Created board Launch', toolName: 'create_board', target } })

  it('says what changed and opens the tool with the item marked', () => {
    draw(action({ kind: 'board', id: 'b1', label: 'Launch' }))
    expect(screen.getByTestId('action-line').textContent).toContain('Created board Launch')
    expect(screen.getByRole('link', { name: 'Show in Boards' }).getAttribute('href')).toBe('/projects/AGX?tool=boards&board=b1')
  })

  it('is only the line when there is nothing to show', () => {
    draw(action())
    expect(screen.getByTestId('action-line').textContent).toBe('Created board Launch')
    expect(screen.queryByRole('link')).toBeNull()
  })
})

describe('the task card @SC-1004', () => {
  const task = msg({ role: 'PLATFORM', kind: 'TASK', body: { taskId: 't1', taskKey: 'AGX-4', title: 'Cut the release' } })

  it('is two lines, the title, then what it is, its key, where it is and who has it, and opens the task', () => {
    h.task = { column: 'Review', status: 'IN_PROGRESS', assignedAgent: { name: 'Kernel' } }
    draw(task)
    const card = screen.getByTestId('task-card')
    expect(card.textContent).toContain('AGX-4')
    expect(card.textContent).toContain('Cut the release')
    expect(card.textContent).toContain('Review')
    expect(card.textContent).toBe('Cut the releaseTask AGX-4 · Review · Kernel')
    expect(card.getAttribute('href')).toBe('/tasks/AGX-4')
  })

  it('names the status when the task is in no column, and still draws before the task is read', () => {
    h.task = { column: null, status: 'TODO', assignedAgent: null }
    draw(task)
    expect(screen.getByTestId('task-card').textContent).toContain('Task AGX-4 · To do · no agent yet')
    cleanup()
    h.task = undefined
    draw(task)
    expect(screen.getByTestId('task-card').textContent).toContain('Cut the release')
  })
})

describe('whose message it is @SC-978', () => {
  const person = (authorId: string) => msg({ role: 'PERSON', agentId: null, authorId })
  const two = [{ id: 'u1', name: 'Avery', avatarUrl: null }, { id: 'u2', name: 'Sam', avatarUrl: null }]

  it('shows no author while only one person has spoken', () => {
    draw(person('u2'), work({ people: [two[1]!] }))
    expect(screen.getByTestId('person-message').textContent).toContain('You')
    expect(screen.queryByText('Sam')).toBeNull()
  })

  it('names another person once more than one has spoken, and keeps the viewer\'s own as You', () => {
    draw(person('u2'), work({ people: two }))
    expect(screen.getByTestId('person-message').textContent).toContain('Sam')
    cleanup()
    draw(person('u1'), work({ people: two }))
    expect(screen.getByTestId('person-message').textContent).toContain('You')
  })

  it('draws neither a request for the okay nor the answer to it: the work bar has them', () => {
    const request = msg({ role: 'PLATFORM', kind: 'APPROVAL_REQUEST', operationId: 'o1', seq: 1, body: { title: 'Run', reason: 'To test', askedBy: 'Kernel' } })
    const answer = msg({ role: 'PERSON', kind: 'APPROVAL_ANSWER', operationId: 'o1', seq: 2, authorId: 'u2', body: { answer: 'approve' } })
    const { container } = draw(request, work({ people: two }))
    expect(container.textContent).toBe('')
    cleanup()
    expect(draw(answer, work({ people: two })).container.textContent).toBe('')
  })
})
