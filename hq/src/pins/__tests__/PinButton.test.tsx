// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const query: { data: unknown } = { data: [] }
const pin = vi.fn().mockResolvedValue(undefined)
const unpin = vi.fn().mockResolvedValue(undefined)

vi.mock('wasp/client/operations', () => ({
  getPins: { name: 'getPins' },
  pinItem: { name: 'pinItem' },
  unpinItem: { name: 'unpinItem' },
  useQuery: () => query,
  useAction: (op: { name: string }) => (op.name === 'pinItem' ? pin : unpin),
}))

import { PinButton } from '../components/PinButton'

beforeEach(() => {
  pin.mockClear()
  unpin.mockClear()
})

describe('PinButton @SC-491', () => {
  it('pins an item that is not pinned', async () => {
    query.data = []
    render(React.createElement(PinButton, { kind: 'PROJECT', itemId: 'proj' }))
    const button = screen.getByRole('button', { name: 'Pin' })
    expect(button.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(button)

    await waitFor(() => expect(pin).toHaveBeenCalledWith({ kind: 'PROJECT', itemId: 'proj' }))
    expect(unpin).not.toHaveBeenCalled()
  })

  it('unpins an item that is pinned', async () => {
    query.data = [{ id: 'p1', kind: 'PROJECT', itemId: 'proj', name: 'A', href: '/projects/A', avatarUrl: null }]
    render(React.createElement(PinButton, { kind: 'PROJECT', itemId: 'proj' }))
    const button = screen.getByRole('button', { name: 'Unpin' })
    expect(button.getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(button)

    await waitFor(() => expect(unpin).toHaveBeenCalledWith({ kind: 'PROJECT', itemId: 'proj' }))
  })

  it('does not treat a pin of another kind with the same id as this item', () => {
    query.data = [{ id: 'p1', kind: 'BOARD', itemId: 'proj', name: 'A', href: '/x', avatarUrl: null }]
    render(React.createElement(PinButton, { kind: 'PROJECT', itemId: 'proj' }))
    expect(screen.getByRole('button', { name: 'Pin' })).toBeTruthy()
  })

  it('waits for the pins to load before it can be pressed', () => {
    query.data = undefined
    render(React.createElement(PinButton, { kind: 'AGENT', itemId: 'a' }))
    expect((screen.getByRole('button', { name: 'Pin' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
