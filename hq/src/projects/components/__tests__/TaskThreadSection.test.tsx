// @vitest-environment jsdom
/** A task's thread on its page: the box that creates it, the reason when there is none, reading marks it read. */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const h = vi.hoisted(() => ({
  conversation: undefined as unknown,
  agents: [] as unknown[],
  start: vi.fn(),
  markRead: vi.fn(),
  thread: vi.fn(),
}))
vi.mock('wasp/client/operations', () => ({
  useQuery: (query: string) => ({ data: query === 'getAgents' ? h.agents : h.conversation }),
  getTaskConversation: 'getTaskConversation',
  getAgents: 'getAgents',
  startTaskConversation: (args: unknown) => h.start(args),
  markConversationRead: (args: unknown) => h.markRead(args),
}))
vi.mock('../../../conversations/components/ConversationThread', () => ({
  ConversationThread: (props: { conversationId: string; onSeen?: (seq: number) => void }) => {
    h.thread(props)
    return <div data-testid="thread">{props.conversationId}</div>
  },
}))
vi.mock('../../../conversations/components/MessageBox', () => ({
  MessageBox: ({ placeholder, onSend }: { placeholder: string; onSend: (t: string) => Promise<boolean> }) => (
    <button type="button" aria-label={placeholder} onClick={() => void onSend('Plan the release')}>box</button>
  ),
}))

import { TaskThreadSection } from '../TaskThreadSection'

const kernel = { id: 'a1', name: 'Kernel', handle: 'kernel', avatarUrl: null }
const view = (over: Record<string, unknown> = {}) => ({ conversation: null, canStart: true, refusal: null, lead: kernel, ...over })

beforeEach(() => {
  h.start.mockReset().mockResolvedValue({ conversationId: 'c1', messageId: 'm1' })
  h.markRead.mockReset().mockResolvedValue(undefined)
  h.thread.mockReset()
  h.agents = [kernel, { id: 'a0', name: 'Ada', handle: 'ada', avatarUrl: null }]
})
afterEach(cleanup)

describe('a task\'s thread on its page @SC-976', () => {
  it('creates the thread with the first message, from the box under the agent\'s name', async () => {
    h.conversation = view()
    render(<TaskThreadSection taskId="t1" taskKey="AGX-4" />)
    fireEvent.click(screen.getByRole('button', { name: 'Message Kernel about this task…' }))
    await waitFor(() => expect(h.start).toHaveBeenCalledTimes(1))
    expect(h.start.mock.calls[0][0]).toMatchObject({ taskId: 't1', text: 'Plan the release' })
    expect(typeof h.start.mock.calls[0][0].clientMessageId).toBe('string')
  })

  it('shows a refused first message in the server\'s words', async () => {
    h.conversation = view()
    h.start.mockRejectedValue(new Error('Assign an agent to talk here.'))
    render(<TaskThreadSection taskId="t1" taskKey="AGX-4" />)
    fireEvent.click(screen.getByRole('button', { name: /Message Kernel/ }))
    expect((await screen.findByRole('alert')).textContent).toContain('Assign an agent to talk here.')
  })

  it('says to assign an agent when the task has none, with no box', () => {
    h.conversation = view({ canStart: false, refusal: 'Assign an agent to talk here.', lead: null })
    render(<TaskThreadSection taskId="t1" taskKey="AGX-4" />)
    expect(screen.getByRole('status').textContent).toBe('Assign an agent to talk here.')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('draws the thread once there is one, and gives it every agent by id so a reply keeps its writer\'s name', async () => {
    h.conversation = view({ conversation: { id: 'c1' }, canStart: false })
    render(<TaskThreadSection taskId="t1" taskKey="AGX-4" />)
    expect((await screen.findByTestId('thread')).textContent).toBe('c1')
    const props = h.thread.mock.calls[0][0] as { agentsById: Record<string, { name: string }> }
    expect(props.agentsById.a0.name).toBe('Ada')
    expect(props.agentsById.a1.name).toBe('Kernel')
  })

  it('marks the thread read up to what is on screen, once per new message', async () => {
    h.conversation = view({ conversation: { id: 'c1' }, canStart: false })
    render(<TaskThreadSection taskId="t1" taskKey="AGX-4" />)
    await screen.findByTestId('thread')
    const onSeen = (h.thread.mock.calls[0][0] as { onSeen: (n: number) => void }).onSeen
    await act(async () => { onSeen(3); onSeen(3); onSeen(2) })
    expect(h.markRead).toHaveBeenCalledTimes(1)
    expect(h.markRead).toHaveBeenCalledWith({ conversationId: 'c1', throughSeq: 3 })
    await act(async () => { onSeen(5) })
    expect(h.markRead).toHaveBeenLastCalledWith({ conversationId: 'c1', throughSeq: 5 })
  })
})
