// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router'

vi.mock('wasp/client/operations', () => ({ getConversation: 'getConversation', useQuery: () => ({ data: { title: 'Release', agent: null } }) }))
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: { id: 'u1' } }) }))
vi.mock('../../shared/useUsername', () => ({ useUsername: () => 'sam' }))
vi.mock('../useChatPlace', () => ({ useChatPlace: () => ({ basePath: '/chat', homePath: '/space', breadcrumbs: [{ label: 'Chat', href: '/chat' }] }) }))
vi.mock('../../projects/place/useProjectPlace', () => ({
  useProjectPlace: () => ({
    project: { id: 'p1', key: 'AGX', name: 'Agenthix', personalOwnerId: null },
    place: { basePath: '/projects/AGX', homePath: '/projects/AGX', breadcrumbs: [{ label: 'Projects', href: '/projects' }] },
    isLoading: false,
  }),
}))
vi.mock('../../conversations/components/NewConversationsList', () => ({ NewConversationsList: () => <span>the space's list</span> }))
vi.mock('../components/ChatList', () => ({ ChatList: () => <span>the list</span> }))
vi.mock('../../conversations/components/ConversationThread', () => ({ ConversationThread: () => <span>the conversation</span> }))
vi.mock('../../places/components/PlaceScreen', () => ({
  PlaceScreen: ({ section, conversations, isPlace }: { section?: string; conversations: React.ReactNode; isPlace?: boolean }) => (
    <div data-testid="screen" data-section={section ?? 'from the address'} data-place={isPlace === false ? 'no' : 'yes'}>{conversations}</div>
  ),
}))

import { ChatPage } from '../pages/ChatPage'
import { SpacePage } from '../pages/SpacePage'
import { ChatThreadPage } from '../../conversations/pages/ChatThreadPage'
import { ProjectThreadPage } from '../../conversations/pages/ProjectThreadPage'

function Where() {
  const { pathname, search } = useLocation()
  return <output data-testid="where">{pathname + search}</output>
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/space" element={<SpacePage />} />
        <Route path="/chat/t/:conversationId" element={<ChatThreadPage />} />
        <Route path="/projects/:key/t/:conversationId" element={<ProjectThreadPage />} />
        <Route path="*" element={null} />
      </Routes>
      <Where />
    </MemoryRouter>,
  )
}

const where = () => screen.getByTestId('where').textContent
const section = () => screen.getByTestId('screen').getAttribute('data-section')

describe('your space and the Chat page @SC-1027', () => {
  it('shows your space’s sections at /space, the section from the address', () => {
    renderAt('/space?tool=files')
    expect(where()).toBe('/space?tool=files')
    expect(section()).toBe('from the address')
  })

  it('shows the Chat page on your space’s Conversations section', () => {
    renderAt('/chat')
    expect(section()).toBe('conversations')
    expect(screen.getByText('the list')).toBeTruthy()
  })

  it('shows only the conversation list at /chat, which is not a place’s sections', () => {
    renderAt('/chat')
    expect(screen.getByTestId('screen').getAttribute('data-place')).toBe('no')
  })

  it('is a place’s screen at /space', () => {
    renderAt('/space')
    expect(screen.getByTestId('screen').getAttribute('data-place')).toBe('yes')
  })

  it('keeps a new conversation’s agent in the Chat page’s address', () => {
    renderAt('/chat?agent=a1')
    expect(where()).toBe('/chat?agent=a1')
  })

  it('sends a former tool address of Chat to that section of your space, with the rest of its query', () => {
    renderAt('/chat?tool=files&file=notes.md')
    expect(where()).toBe('/space?tool=files&file=notes.md')
  })
})

describe('a conversation’s own page @SC-1027', () => {
  it('is on its place’s Conversations section, in your space and in a project', () => {
    for (const path of ['/chat/t/c1', '/projects/AGX/t/c1']) {
      const view = renderAt(path)
      expect(section()).toBe('conversations')
      expect(screen.getByText('the conversation')).toBeTruthy()
      view.unmount()
    }
  })

  it('sends a tool’s address to that section of its place', () => {
    const view = renderAt('/chat/t/c1?tool=agents&agent=a1&focus=permissions')
    expect(where()).toBe('/space?tool=agents&agent=a1&focus=permissions')
    view.unmount()
    renderAt('/projects/AGX/t/c1?tool=tasks')
    expect(where()).toBe('/projects/AGX?tool=tasks')
  })
})
