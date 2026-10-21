// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'

const start = vi.fn()
vi.mock('wasp/client/operations', () => ({ startConversation: 'startConversation', useAction: () => start }))

import { FirstSuggestions } from '../components/FirstSuggestions'

afterEach(cleanup)

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
})
