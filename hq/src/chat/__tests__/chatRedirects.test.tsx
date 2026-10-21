// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router'

const state = vi.hoisted(() => ({
  session: undefined as Record<string, unknown> | undefined,
  project: undefined as Record<string, unknown> | undefined,
}))

vi.mock('wasp/client/operations', () => ({
  getSession: 'getSession',
  getProject: 'getProject',
  useQuery: (query: string) => ({ data: query === 'getSession' ? state.session : state.project }),
}))
vi.mock('../../shared/providers/VoiceCallProvider', () => ({ useVoiceCall: () => ({ start: () => undefined, prepare: () => undefined }) }))
vi.mock('../../shared/layouts/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('../../shared/components/ChatPanel/PanelChatView', () => ({ PanelChatView: () => <span>the session here</span> }))
vi.mock('../../projects/place/useProjectPlace', () => ({
  useProjectPlace: () => ({ project: state.project, place: state.project ? { basePath: '/projects/ME', breadcrumbs: [{ label: 'Projects', href: '/projects' }], backHref: '/projects', homePath: '/projects/ME' } : undefined, isLoading: false }),
}))
vi.mock('../../places/components/PlaceScreen', () => ({ PlaceScreen: () => <span>the project place</span> }))

import { ChatSessionPage } from '../../sessions/pages/ChatSessionPage'
import { ProjectConversationsPage } from '../../projects/pages/ProjectConversationsPage'

function Where() {
  const { pathname, search } = useLocation()
  return <output data-testid="where">{pathname + search}</output>
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/sessions/:id" element={<ChatSessionPage />} />
        <Route path="/projects/:key" element={<ProjectConversationsPage />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )
}

const chat = (fields: Record<string, unknown>) => ({ sessionType: 'chat', taskId: null, primaryOwnerType: null, primaryOwnerId: null, agent: null, primaryLocation: null, ...fields })

beforeEach(() => {
  state.session = undefined
  state.project = undefined
})

describe('a session by its address @SC-508', () => {
  it('shows a task’s session where it is', () => {
    state.session = chat({ sessionType: 'task', taskId: 't1' })
    renderAt('/sessions/s1')
    expect(screen.getByText('the session here')).toBeTruthy()
  })

  it('sends the personal project’s address to your space, keeping the open section', () => {
    state.project = { id: 'p1', key: 'ME', name: 'My tasks', personalOwnerId: 'u1' }
    renderAt('/projects/ME?tool=tasks')
    expect(screen.getByTestId('where').textContent).toBe('/space?tool=tasks')
  })

  it('leaves any other project where it is', () => {
    state.project = { id: 'p2', key: 'AGX', name: 'Agenthix', personalOwnerId: null }
    renderAt('/projects/AGX')
    expect(screen.getByText('the project place')).toBeTruthy()
  })
})

describe('a chat from before, by its session address @SC-1019', () => {
  it('does not open, wherever it was held: it goes to Chat', () => {
    for (const fields of [{}, { primaryOwnerType: 'project', primaryOwnerId: 'p1' }, { primaryOwnerType: 'workspace', primaryOwnerId: 'w1' }]) {
      state.session = chat(fields)
      const view = renderAt('/sessions/s1')
      expect(screen.getByTestId('where').textContent).toBe('/chat')
      expect(screen.queryByText('the session here')).toBeNull()
      view.unmount()
    }
  })

  it('shows nothing of it while it is still being read', () => {
    renderAt('/sessions/s1')
    expect(screen.queryByText('the session here')).toBeNull()
  })
})
