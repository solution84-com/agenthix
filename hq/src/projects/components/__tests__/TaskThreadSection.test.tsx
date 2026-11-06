// @vitest-environment jsdom
/**
 * A task's conversation from its page: the button that puts it in the chat panel, the first message that creates it,
 * and the reason when there is none.
 */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const h = vi.hoisted(() => ({
  conversation: undefined as unknown,
  dock: null as null | { openConversation: ReturnType<typeof vi.fn>; startNew: ReturnType<typeof vi.fn> },
  start: vi.fn(),
}))
vi.mock('wasp/client/operations', () => ({
  useQuery: () => ({ data: h.conversation }),
  getTaskConversation: 'getTaskConversation',
  getProjectByKey: 'getProjectByKey',
  startTaskConversation: (args: unknown) => h.start(args),
}))
vi.mock('../../../dock/DockContext', () => ({ useDock: () => h.dock }))
vi.mock('../../../conversations/components/MessageBox', () => ({
  MessageBox: ({ placeholder, onSend }: { placeholder: string; onSend: (t: string) => Promise<boolean> }) => (
    <button type="button" aria-label={placeholder} onClick={() => void onSend('Plan the release')}>box</button>
  ),
}))

import { TaskFirstMessage, TaskThreadSection } from '../TaskThreadSection'

const kernel = { id: 'a1', name: 'Kernel', handle: 'kernel', avatarUrl: null }
const view = (over: Record<string, unknown> = {}) => ({ conversation: null, canStart: true, refusal: null, lead: kernel, ...over })

beforeEach(() => {
  h.start.mockReset().mockResolvedValue({ conversationId: 'c1', messageId: 'm1' })
  h.dock = { openConversation: vi.fn(), startNew: vi.fn() }
})
afterEach(cleanup)

describe('Talk about this task @SC-976', () => {
  it('puts the task’s conversation in the chat panel once there is one', () => {
    h.conversation = view({ conversation: { id: 'c1' }, canStart: false })
    render(<TaskThreadSection taskId="t1" taskKey="AGX-4" />)
    fireEvent.click(screen.getByRole('button', { name: 'Talk about this task' }))
    expect(h.dock!.openConversation).toHaveBeenCalledWith('c1', null)
    expect(h.dock!.startNew).not.toHaveBeenCalled()
  })

  it('starts one in the panel the first time, about this task and led by its agent, in its project', () => {
    h.conversation = view()
    render(<TaskThreadSection taskId="t1" taskKey="AGX-4" />)
    fireEvent.click(screen.getByRole('button', { name: 'Talk about this task' }))
    expect(h.dock!.startNew).toHaveBeenCalledWith({ kind: 'project', key: 'AGX' }, null, { taskId: 't1', taskKey: 'AGX-4', agentName: 'Kernel' })
  })

  it('is off, saying why on hover, when the task has no agent or the person may not talk', () => {
    h.conversation = view({ canStart: false, refusal: 'Assign an agent to talk here.', lead: null })
    render(<TaskThreadSection taskId="t1" taskKey="AGX-4" />)
    const button = screen.getByRole('button', { name: 'Talk about this task' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.title).toBe('Assign an agent to talk here.')
  })

  it('has no message box and no thread of its own on the page', () => {
    h.conversation = view({ conversation: { id: 'c1' }, canStart: false })
    render(<TaskThreadSection taskId="t1" taskKey="AGX-4" />)
    expect(screen.queryByTestId('thread')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('draws nothing where there is no chat panel', () => {
    h.dock = null
    h.conversation = view()
    const { container } = render(<TaskThreadSection taskId="t1" taskKey="AGX-4" />)
    expect(container.textContent).toBe('')
  })
})

describe('a task’s first message @SC-976', () => {
  it('creates the conversation with it, under the agent’s name, and says which it is', async () => {
    const started = vi.fn()
    render(<TaskFirstMessage taskId="t1" agentName="Kernel" onStarted={started} />)
    fireEvent.click(screen.getByRole('button', { name: 'Message Kernel about this task…' }))
    await waitFor(() => expect(started).toHaveBeenCalledWith('c1'))
    expect(h.start.mock.calls[0][0]).toMatchObject({ taskId: 't1', text: 'Plan the release' })
    expect(typeof h.start.mock.calls[0][0].clientMessageId).toBe('string')
  })

  it('shows a refused first message in the server’s words', async () => {
    h.start.mockRejectedValue(new Error('Assign an agent to talk here.'))
    render(<TaskFirstMessage taskId="t1" agentName="Kernel" />)
    fireEvent.click(screen.getByRole('button', { name: /Message Kernel/ }))
    expect((await screen.findByRole('alert')).textContent).toContain('Assign an agent to talk here.')
  })
})
