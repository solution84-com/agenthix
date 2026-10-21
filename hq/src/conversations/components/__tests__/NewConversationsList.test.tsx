// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

vi.mock('wasp/client/operations', () => ({
  getConversations: 'getConversations',
  useQuery: () => ({
    data: [
      { id: 'c1', title: 'Plan my week', lastMessageAt: '2026-10-18T10:00:00Z', status: 'ACTIVE', agent: { id: 'k', name: 'Kernel', avatarUrl: null, handle: 'kernel' } },
      { id: 'c2', title: 'Release checklist', lastMessageAt: '2026-10-18T09:00:00Z', status: 'ACTIVE', agent: { id: 'k', name: 'Kernel', avatarUrl: null, handle: 'kernel' } },
    ],
    isLoading: false,
    error: null,
  }),
}))
vi.mock('../../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: () => <i /> }))
vi.mock('../../archive/ArchivedConversations', () => ({ ArchivedConversations: () => null }))
vi.mock('@agenthix/ui/primitives', () => ({ FilterSelect: () => null, SearchField: () => null }))
vi.mock('../NewConversationBox', () => ({ NewConversationBox: () => null }))

import { NewConversationsList } from '../NewConversationsList'
import type { Place } from '../../../places/placeTypes'

const place = { basePath: '/chat' } as Place

function renderAt(at: string) {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <NewConversationsList place={place} header={null} home="PERSON" boxPlaceholder="Ask…" noAgentsNotice="None" />
    </MemoryRouter>,
  )
}

const row = (title: string) => screen.getByText(title).closest('a')!

afterEach(cleanup)

describe('a place’s list of conversations @SC-1028', () => {
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
