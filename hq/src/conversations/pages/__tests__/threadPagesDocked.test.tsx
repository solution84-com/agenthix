// @vitest-environment jsdom
/**
 * Under the root shell, a conversation's own page draws no thread at any width: the shell opens it in the dock and
 * replaces the address (spec §3, §12). With no shell above it, the page shows the conversation as before.
 */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'

vi.mock('wasp/client/operations', () => ({ getConversation: 'getConversation', useQuery: () => ({ data: { title: 'Release', agent: null } }) }))
vi.mock('../../../chat/useChatPlace', () => ({ useChatPlace: () => ({ basePath: '/chat', homePath: '/space', breadcrumbs: [] }) }))
vi.mock('../../../projects/place/useProjectPlace', () => ({
  useProjectPlace: () => ({
    project: { id: 'p1', key: 'AGX', name: 'Agenthix', personalOwnerId: null },
    place: { basePath: '/projects/AGX', homePath: '/projects/AGX', breadcrumbs: [] },
    isLoading: false,
  }),
}))
vi.mock('../../../chat/components/ChatLoading', () => ({ ChatLoading: () => <span>waiting</span> }))
vi.mock('../../../projects/place/ProjectPlaceMissing', () => ({ ProjectPlaceMissing: () => <span>waiting</span> }))
vi.mock('../../components/ConversationThread', () => ({ ConversationThread: () => <span>the conversation</span> }))
vi.mock('../../../places/components/PlaceScreen', () => ({
  PlaceScreen: ({ conversations }: { conversations: React.ReactNode }) => <div>{conversations}</div>,
}))

import { ChatThreadPage } from '../ChatThreadPage'
import { ProjectThreadPage } from '../ProjectThreadPage'
import { DockContext, type DockValue } from '../../../dock/DockContext'
import type { DockWidth } from '../../../dock/useDockWidth'

const dock = (width: DockWidth): DockValue => ({
  open: null, draft: null, width, openConversation: () => {}, startNew: () => {}, close: () => {},
  position: 'docked', setPosition: () => {},
})

function renderAt(path: string, value: DockValue | null) {
  return render(
    <DockContext.Provider value={value}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/chat/t/:conversationId" element={<ChatThreadPage />} />
          <Route path="/projects/:key/t/:conversationId" element={<ProjectThreadPage />} />
        </Routes>
      </MemoryRouter>
    </DockContext.Provider>,
  )
}

afterEach(cleanup)

describe('a conversation’s own page @SC-1027', () => {
  it.each(['/chat/t/c1', '/projects/AGX/t/c1'])('draws no thread at %s under the root shell, at every width', (path) => {
    for (const width of ['wide', 'medium', 'narrow'] as const) {
      renderAt(path, dock(width))
      expect(screen.getByText('waiting')).toBeTruthy()
      expect(screen.queryByText('the conversation')).toBeNull()
      cleanup()
    }
  })

  it.each(['/chat/t/c1', '/projects/AGX/t/c1'])('shows the conversation at %s with no shell above it', (path) => {
    renderAt(path, null)
    expect(screen.getByText('the conversation')).toBeTruthy()
  })
})
