// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'

const username = vi.hoisted(() => vi.fn(() => 'Avery'))

vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: { id: 'u1' } }) }))
vi.mock('../../shared/useUsername', () => ({ useUsername: username }))
vi.mock('../useChatPlace', () => ({ useChatPlace: () => ({ basePath: '/chat' }) }))
vi.mock('../../places/components/PlaceScreen', () => ({ PlaceScreen: () => <span>the chat place</span> }))
vi.mock('../../places/components/PlaceMobileHeader', () => ({ PlaceMobileHeader: () => null }))
vi.mock('../../conversations/components/NewConversationsList', () => ({ NewConversationsList: () => null }))
vi.mock('../components/ChatPlaceHeader', () => ({ ChatPlaceHeader: () => null }))
vi.mock('../components/ChatLoading', () => ({ ChatLoading: () => null }))

import { ChatPage } from '../pages/ChatPage'

describe('ChatPage hooks', () => {
  it('calls the same hooks whether or not the address redirects to a tool of your space', () => {
    render(
      <MemoryRouter initialEntries={['/chat?tool=agents']}>
        <Routes>
          <Route path="/chat" element={<ChatPage />} />
          <Route path="*" element={<span>moved on</span>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('moved on')).toBeTruthy()
    expect(username).toHaveBeenCalled()
  })
})
