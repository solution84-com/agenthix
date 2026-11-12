// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'

const start = vi.fn()
const h = vi.hoisted(() => ({ demo: false }))
vi.mock('wasp/client/operations', () => ({
  startConversation: 'startConversation', getDemoInfo: 'getDemoInfo', useAction: () => start,
  useQuery: () => ({ data: h.demo ? { on: true, nextResetAt: '', agents: { kernel: { suggestedPrompts: ['How do approvals work?', 'Plan the first week after launch', 'Make a task for later', 'A fourth'] } } } : undefined }),
}))

import { FirstSuggestions } from '../components/FirstSuggestions'

afterEach(() => { cleanup(); h.demo = false })

describe('the first suggestions @SC-1037', () => {
  it('can be chosen again once the conversation is started, where they stay on screen (Home beside the dock)', async () => {
    start.mockResolvedValue({ conversationId: 'c9', messageId: 'm1' })
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes><Route path="*" element={<FirstSuggestions agent={{ id: 'k', name: 'Kernel' }} />} /></Routes>
      </MemoryRouter>,
    )
    const first = screen.getByRole('button', { name: 'What can you do?' }) as HTMLButtonElement
    fireEvent.click(first)
    await waitFor(() => expect(start).toHaveBeenCalled())
    await waitFor(() => expect(first.disabled).toBe(false))
  })

  it("in the demo are the first three of what the agent's scripts answer, not what the demo refuses @SC-1959", () => {
    h.demo = true
    render(<MemoryRouter><FirstSuggestions agent={{ id: 'k', name: 'Kernel', handle: 'kernel' }} /></MemoryRouter>)
    expect(screen.getAllByRole('button').map(b => b.textContent)).toEqual(['How do approvals work?', 'Plan the first week after launch', 'Make a task for later'])
    expect(screen.queryByText('Invite my team')).toBeNull()
  })

  it('outside the demo are the usual three @SC-1959 @SC-1979', () => {
    render(<MemoryRouter><FirstSuggestions agent={{ id: 'k', name: 'Kernel', handle: 'kernel' }} /></MemoryRouter>)
    expect(screen.getAllByRole('button').map(b => b.textContent)).toEqual(['What can you do?', 'Set up my first project', 'Invite my team'])
  })
})
