// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const h = vi.hoisted(() => ({
  preview: { data: undefined as unknown, error: null as unknown, isLoading: false },
  remove: vi.fn(),
}))
vi.mock('wasp/client/operations', () => ({
  getConversationDeletePreview: 'getConversationDeletePreview',
  deleteConversation: (...a: unknown[]) => h.remove(...a),
  useQuery: () => h.preview,
}))

import { DeleteConversationDialog } from '../DeleteConversationDialog'

const onClose = vi.fn()
const onDeleted = vi.fn()
beforeEach(() => {
  onClose.mockReset()
  onDeleted.mockReset()
  h.remove.mockReset().mockResolvedValue(undefined)
  h.preview = {
    data: { stops: ['Profile the image pipeline · Shop'], leaves: ['SHOP-214'], canArchive: true, messages: 12, runs: 2 }, error: null, isLoading: false,
  }
})
afterEach(cleanup)

describe('the delete confirm @SC-975', () => {
  it('names the work that stops and the work that carries on', () => {
    render(<DeleteConversationDialog conversationId="c1" onClose={onClose} onDeleted={onDeleted} />)
    expect(screen.getByTestId('delete-stops').textContent).toContain('Profile the image pipeline · Shop')
    expect(screen.getByTestId('delete-leaves').textContent).toContain('SHOP-214')
  })

  it('counts the messages and the workers\' runs that go', () => {
    render(<DeleteConversationDialog conversationId="c1" onClose={onClose} onDeleted={onDeleted} />)
    expect(screen.getByTestId('delete-counts').textContent).toBe('Deleting is permanent. It takes with it 12 messages and 2 runs of its work in the background.')
  })

  it('deletes on Delete, and then tells the screen', async () => {
    render(<DeleteConversationDialog conversationId="c1" onClose={onClose} onDeleted={onDeleted} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(onDeleted).toHaveBeenCalled())
    expect(h.remove).toHaveBeenCalledWith({ conversationId: 'c1' })
  })

  it('offers Archive beside Delete when it can be archived and archiving is offered', async () => {
    const archive = vi.fn().mockResolvedValue(undefined)
    render(<DeleteConversationDialog conversationId="c1" onClose={onClose} onDeleted={onDeleted} onArchive={archive} />)
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    await waitFor(() => expect(archive).toHaveBeenCalled())
    expect(h.remove).not.toHaveBeenCalled()
  })

  it('offers no Archive when it cannot be archived', () => {
    h.preview.data = { stops: [], leaves: [], canArchive: false, messages: 1, runs: 0 }
    render(<DeleteConversationDialog conversationId="c1" onClose={onClose} onDeleted={onDeleted} onArchive={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull()
  })

  it('shows the server\'s words when deleting is refused, and stays open', async () => {
    h.remove.mockRejectedValue(new Error('Only who opened it can delete it'))
    render(<DeleteConversationDialog conversationId="c1" onClose={onClose} onDeleted={onDeleted} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Only who opened it can delete it')
    expect(onDeleted).not.toHaveBeenCalled()
  })
})
