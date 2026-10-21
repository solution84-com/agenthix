// @vitest-environment jsdom
/** The org's Exa key on Organisation › Settings › Model access: saved and removed, never shown back. */
import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

const { useQuery, setWebSearchKey, deleteWebSearchKey } = vi.hoisted(() => ({
  useQuery: vi.fn(),
  setWebSearchKey: vi.fn(),
  deleteWebSearchKey: vi.fn(),
}))

vi.mock('wasp/client/operations', () => ({
  useQuery,
  useAction: (fn: unknown) => fn,
  getWebSearchKeyStatus: 'getWebSearchKeyStatus',
  setWebSearchKey,
  deleteWebSearchKey,
}))

import { WebSearchKeyBlock } from '../WebSearchKeyBlock'

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  setWebSearchKey.mockResolvedValue({ ok: true })
  deleteWebSearchKey.mockResolvedValue({ ok: true })
})

describe('WebSearchKeyBlock', () => {
  it('saves a key', async () => {
    useQuery.mockReturnValue({ data: { present: false }, isLoading: false })
    render(<WebSearchKeyBlock />)
    fireEvent.change(screen.getByLabelText('Exa API key'), { target: { value: 'exa-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }))
    await waitFor(() => expect(setWebSearchKey).toHaveBeenCalledWith({ secret: 'exa-1' }))
  })

  it('removes a stored key and offers no way to read it', async () => {
    useQuery.mockReturnValue({ data: { present: true }, isLoading: false })
    render(<WebSearchKeyBlock />)
    expect(screen.queryByLabelText('Exa API key')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Remove key' }))
    await waitFor(() => expect(deleteWebSearchKey).toHaveBeenCalled())
  })

  it('shows a refusal from the server', async () => {
    useQuery.mockReturnValue({ data: { present: false }, isLoading: false })
    setWebSearchKey.mockRejectedValue(new Error('requires the ADMIN or higher role'))
    render(<WebSearchKeyBlock />)
    fireEvent.change(screen.getByLabelText('Exa API key'), { target: { value: 'exa-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }))
    expect(await screen.findByText(/requires the ADMIN/)).toBeTruthy()
  })
})
