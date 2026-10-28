// @vitest-environment jsdom
/** *Ask an agent to edit* names who will answer and where before anything is sent, and lets the person pick (finding 14). */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const start = vi.fn()
const openConversation = vi.fn()
const choices = [
  { id: 'k', name: 'Kernel', handle: 'kernel', avatarUrl: null, role: null },
  { id: 'a', name: 'Ada', handle: 'ada', avatarUrl: null, role: 'Writer' },
]

vi.mock('wasp/client/operations', () => ({
  startConversation: {}, getConversationAgentChoices: {},
  useAction: () => start,
  useQuery: () => ({ data: choices }),
}))
vi.mock('../../../../dock/DockContext', () => ({ useDock: () => ({ openConversation }) }))
vi.mock('../../../../conversations/components/AgentPicker', () => ({
  AgentPicker: ({ agents, selectedId, onSelect }: { agents: typeof choices; selectedId: string; onSelect: (id: string) => void }) => (
    <select aria-label="Agent" value={selectedId} onChange={e => onSelect(e.target.value)}>
      {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select>
  ),
}))

import { AskAgentBox } from '../AskAgentBox'

afterEach(() => { cleanup(); start.mockReset() })

describe('Ask an agent to edit @SC-1627', () => {
  it('opens as a dialog over the page, not inline, and Cancel and Escape close it', () => {
    const onClose = vi.fn()
    render(<AskAgentBox identity="org/notes" where="Library" onClose={onClose} onAsked={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Ask an agent to edit' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Ask an agent to edit' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('says the main agent answers in Your space, and asks it', async () => {
    start.mockResolvedValue({ conversationId: 'c1' })
    render(<AskAgentBox identity="org/notes" where="Library" onClose={vi.fn()} onAsked={vi.fn()} />)
    expect(screen.getByTestId('ask-who').textContent).toBe('Kernel will answer, in a new conversation in Your space.')
    fireEvent.change(screen.getByLabelText(/What should the agent change/), { target: { value: 'Add a step' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ask Kernel' }))
    await waitFor(() => expect(start).toHaveBeenCalled())
    expect(start.mock.calls[0][0]).toMatchObject({ home: 'PERSON', agentId: 'k', skill: { name: 'platform-skill-creator' } })
    expect(openConversation).toHaveBeenCalledWith('c1', null)
  })

  it('asks the agent the person picks instead', async () => {
    start.mockResolvedValue({ conversationId: 'c2' })
    render(<AskAgentBox identity="org/notes" where="Library" onClose={vi.fn()} onAsked={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Agent'), { target: { value: 'a' } })
    expect(screen.getByTestId('ask-who').textContent).toBe('Ada will answer, in a new conversation in Your space.')
    fireEvent.change(screen.getByLabelText(/What should the agent change/), { target: { value: 'Add a step' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ask Ada' }))
    await waitFor(() => expect(start).toHaveBeenCalled())
    expect(start.mock.calls[0][0]).toMatchObject({ agentId: 'a' })
  })
})
