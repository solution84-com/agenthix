// @vitest-environment jsdom
/**
 * What the thread tells the one who shows it (the dock): whether work is under way and approvals are waiting, and
 * that the conversation was deleted or archived. Without these callbacks it goes to its list, as on its own page.
 */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'

const h = vi.hoisted(() => ({ thread: {} as Record<string, unknown>, archive: vi.fn() }))
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: { id: 'u1' } }) }))
vi.mock('wasp/client/operations', () => ({
  archiveConversation: (args: unknown) => h.archive(args),
  setConversationKeep: vi.fn(),
}))
vi.mock('../../../shared/providers/VoiceCallProvider', () => ({
  useVoiceCall: () => ({ voice: { conversationId: null, phase: 'off', partial: '' }, revealLimit: () => null }),
}))
vi.mock('../../hooks/useConversationThread', () => ({ useConversationThread: () => h.thread }))
vi.mock('../../hooks/useSummariseNow', () => ({ useSummariseNow: () => ({ summarising: false, failure: null, dismiss: vi.fn(), summarise: vi.fn() }) }))
vi.mock('../../../agents/profile/AgentProfileCard', () => ({ AgentProfileTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('../../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: () => <i /> }))
vi.mock('../ThreadMessages', () => ({ ThreadMessages: () => null }))
vi.mock('../ConversationComposer', () => ({ ConversationComposer: () => null }))
vi.mock('../ConversationHeaderTools', () => ({
  ConversationHeaderTools: ({ onDelete }: { onDelete: () => void }) => <button type="button" onClick={onDelete}>Delete…</button>,
}))
vi.mock('../DeleteConversationDialog', () => ({
  // Stands in for the confirm: what it calls once the server has deleted or archived the conversation.
  DeleteConversationDialog: ({ onDeleted, onArchive }: { onDeleted: () => void; onArchive?: () => Promise<void> }) => (
    <div>
      <button type="button" onClick={onDeleted}>deleted</button>
      <button type="button" onClick={() => void onArchive?.()}>archive</button>
    </div>
  ),
}))

import { ConversationThread } from '../ConversationThread'

const view = {
  id: 'c1', home: 'PERSON', projectId: null, taskId: null, title: 'Budget', status: 'ACTIVE', closedReason: null,
  agent: { id: 'a1', name: 'Kernel', handle: 'kernel', avatarUrl: null }, openedById: 'u1', activeTurnId: null,
  accessProblem: null, accessOffer: null, canSpeak: true, people: [], keep: false,
}
const op = (operationId: string, state: string) => ({ operationId, state, createdAt: `2026-10-18T10:0${operationId}:00Z` })

beforeEach(() => {
  h.archive.mockReset().mockResolvedValue(undefined)
  h.thread = {
    view, viewError: null, loaded: true, messages: [], waiting: [], stream: null, running: false, activityRows: [],
    liveLines: {}, actionError: null, clearError: vi.fn(),
  }
})
afterEach(cleanup)

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>
}

function renderThread(props: Partial<React.ComponentProps<typeof ConversationThread>> = {}) {
  return render(
    <MemoryRouter initialEntries={['/tasks']}>
      <Routes>
        <Route path="/tasks" element={<ConversationThread conversationId="c1" listPath="/chat" {...props} />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('the thread’s activity @SC-1033', () => {
  it('reports nothing under way when no work is live and no reply runs', () => {
    const onActivity = vi.fn()
    h.thread.activityRows = [op('1', 'COMPLETED')]
    renderThread({ onActivity })
    expect(onActivity).toHaveBeenLastCalledWith({ working: false, needYou: 0 })
  })

  it('reports live work and the approvals waiting, as its work bar counts them', () => {
    const onActivity = vi.fn()
    h.thread.activityRows = [op('1', 'RUNNING'), op('2', 'WAITING_FOR_APPROVAL'), op('3', 'WAITING_FOR_APPROVAL'), op('4', 'COMPLETED')]
    renderThread({ onActivity })
    expect(onActivity).toHaveBeenLastCalledWith({ working: true, needYou: 2 })
  })

  it('reports a reply the moment it starts', () => {
    const onActivity = vi.fn()
    const { rerender } = renderThread({ onActivity })
    expect(onActivity).toHaveBeenLastCalledWith({ working: false, needYou: 0 })
    h.thread = { ...h.thread, running: true }
    rerender(
      <MemoryRouter initialEntries={['/tasks']}>
        <Routes><Route path="/tasks" element={<ConversationThread conversationId="c1" listPath="/chat" onActivity={onActivity} />} /></Routes>
      </MemoryRouter>,
    )
    expect(onActivity).toHaveBeenLastCalledWith({ working: true, needYou: 0 })
  })
})

describe('deleting or archiving @SC-1030', () => {
  it('goes to the list after a delete or an archive when nobody is told', async () => {
    renderThread()
    fireEvent.click(screen.getAllByText('Delete…')[0])
    fireEvent.click(screen.getByText('deleted'))
    expect(screen.getByTestId('where').textContent).toBe('/chat')
    cleanup()
    renderThread()
    fireEvent.click(screen.getAllByText('Delete…')[0])
    await act(async () => { fireEvent.click(screen.getByText('archive')) })
    expect(h.archive).toHaveBeenCalledWith({ conversationId: 'c1' })
    expect(screen.getByTestId('where').textContent).toBe('/chat')
  })

  it('tells the one who shows it instead, and stays where it is', async () => {
    const onDeleted = vi.fn()
    const onArchived = vi.fn()
    renderThread({ onDeleted, onArchived })
    fireEvent.click(screen.getAllByText('Delete…')[0])
    fireEvent.click(screen.getByText('deleted'))
    expect(onDeleted).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('deleted')).toBeNull()
    fireEvent.click(screen.getAllByText('Delete…')[0])
    fireEvent.click(screen.getByText('archive'))
    await waitFor(() => expect(onArchived).toHaveBeenCalledTimes(1))
    expect(h.archive).toHaveBeenCalledWith({ conversationId: 'c1' })
    expect(screen.queryByTestId('where')).toBeNull()
  })
})
