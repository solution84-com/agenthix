// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const h = vi.hoisted(() => ({ rename: vi.fn(async () => ({ message: 'acme is shown as “Acme Corp”.' })), other: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  useQuery: () => ({
    data: [
      { id: null, name: 'agenthix', displayName: 'Agenthix', kind: 'built-in', issuer: null, identity: null, repository: null, refs: null, keyId: null, status: 'trusted', removable: false, addedById: null, addedAt: null, installed: 23 },
      { id: 'p1', name: 'acme', displayName: 'Acme', kind: 'key', issuer: null, identity: null, repository: null, refs: null, keyId: 'SHA256:4f1c', status: 'trusted', removable: true, addedById: null, addedAt: null, installed: 2 },
    ],
    error: undefined, refetch: vi.fn(),
  }),
  useAction: (op: string) => (op === 'renameTrustedPublisher' ? h.rename : h.other),
  listTrustedPublishers: 'listTrustedPublishers', removeTrustedPublisher: 'removeTrustedPublisher',
  renameTrustedPublisher: 'renameTrustedPublisher', trustPublisher: 'trustPublisher', addTrustedPublisher: 'addTrustedPublisher',
}))

import { TrustedPublishersSection } from '../TrustedPublishersSection'

afterEach(cleanup)

describe('trusted publishers (board R2) @SC-1615', () => {
  it('says how many each has installed, and renames only the name shown', async () => {
    render(<TrustedPublishersSection />)
    expect(screen.getByTestId('publishers').textContent).toContain('23 installed')
    expect(screen.getByTestId('publishers').textContent).toContain('2 installed')
    expect(screen.getAllByRole('button', { name: 'Rename' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    fireEvent.change(screen.getByLabelText('Name shown for acme'), { target: { value: 'Acme Corp' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(h.rename).toHaveBeenCalledWith({ id: 'p1', displayName: 'Acme Corp' }))
    expect(screen.queryByText('acme is shown as “Acme Corp”.')).toBeNull()
  })
})
