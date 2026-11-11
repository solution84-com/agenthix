// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

vi.mock('wasp/client/operations', () => ({
  getConversations: 'getConversations',
  useQuery: () => ({
    data: [
      { id: 'c1', title: 'Plan my week', lastMessageAt: '2026-10-18T10:00:00Z', status: 'ACTIVE', agent: { id: 'k', name: 'Kernel', avatarUrl: null, handle: 'kernel' } },
      { id: 'c2', title: 'Release checklist', lastMessageAt: '2026-10-18T09:00:00Z', status: 'ACTIVE', agent: { id: 'k', name: 'Kernel', avatarUrl: null, handle: 'kernel' } },
    ],
    isLoading: false,
    error: h.error,
    dataUpdatedAt: 0,
    refetch: () => undefined,
  }),
}))
const h = vi.hoisted(() => ({ dock: null as null | { startNew: ReturnType<typeof vi.fn> }, error: null as unknown }))
vi.mock('../../../dock/DockContext', () => ({ useDock: () => h.dock }))
vi.mock('../../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: () => <i /> }))
vi.mock('../../archive/ArchivedConversations', () => ({ ArchivedConversations: () => null }))
vi.mock('@agenthix/ui/primitives', async (importOriginal) => ({ ...(await importOriginal<typeof import('@agenthix/ui/primitives')>()), FilterSelect: () => null, SearchField: () => null }))

import { NewConversationsList } from '../NewConversationsList'
import type { Place } from '../../../places/placeTypes'

const place = { basePath: '/projects/AGX' } as Place

function renderAt(at: string) {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <NewConversationsList place={place} header={null} home="PERSON" />
    </MemoryRouter>,
  )
}

const row = (title: string) => screen.getByText(title).closest('a')!

afterEach(() => { cleanup(); h.dock = null; h.error = null })

describe('a place’s list of conversations @SC-1028 @SC-1929', () => {
  it('marks the conversation open in the dock as the current row', () => {
    renderAt('/chat?c=c2')
    expect(row('Release checklist').getAttribute('aria-current')).toBe('page')
    expect(row('Plan my week').getAttribute('aria-current')).toBeNull()
  })

  it('marks no row when no conversation is open', () => {
    renderAt('/chat')
    expect(screen.getAllByTestId('conversation-row').some((r) => r.hasAttribute('aria-current'))).toBe(false)
  })
})

describe('a place’s list when it could not be read again', () => {
  it('puts the not-up-to-date line after the last row, so no row moves', () => {
    h.error = new Error('Network Error')
    renderAt('/projects/AGX')
    const rows = screen.getAllByTestId('conversation-row')
    expect(rows[rows.length - 1]!.compareDocumentPosition(screen.getByText(/Not up to date/)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('a place’s list has no box to write in (the board’s f5)', () => {
  it('holds only the list: rows open in the chat, and no message box is drawn', () => {
    renderAt('/projects/AGX')
    expect(screen.queryByTestId('new-box')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('starts a conversation in this place, in the chat panel, from New conversation here', () => {
    h.dock = { startNew: vi.fn() }
    renderAt('/projects/AGX')
    fireEvent.click(screen.getByRole('button', { name: 'New conversation here' }))
    expect(h.dock.startNew).toHaveBeenCalledWith({ kind: 'project', key: 'AGX' })
  })
})
