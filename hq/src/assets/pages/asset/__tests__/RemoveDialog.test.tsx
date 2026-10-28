// @vitest-environment jsdom
/** Remove names the agents that have it and asks first (board U3; D17). */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'

const remove = vi.fn()
const holders: { data: unknown } = { data: undefined }
vi.mock('wasp/client/operations', () => ({
  getAssetHolders: { name: 'h' }, removeLibraryAsset: { name: 'r' },
  useQuery: () => holders, useAction: () => remove,
}))

import { RemoveDialog } from '../dialogs/RemoveDialog'

beforeEach(() => { remove.mockReset().mockResolvedValue({ removed: true }) })
afterEach(cleanup)

describe('Remove @SC-1622 @SC-1637', () => {
  it('names the agents that have it, says their pages will show it as missing, and that its history is kept', async () => {
    holders.data = { everyAgent: false, agents: [{ id: 'g1', name: 'Ada' }, { id: 'g2', name: 'Priya' }] }
    const done = vi.fn()
    render(<RemoveDialog assetId="a1" title="Code Review" onClose={() => {}} onRemoved={done} />)
    expect(screen.getByRole('heading', { name: 'Remove Code Review?' })).toBeTruthy()
    expect(screen.getByTestId('remove-reach').textContent).toContain("Ada and Priya have it. They'll stop using it on their next turn. Their pages will show it as missing, with Install.")
    expect(screen.getByText(/Its history is kept, so it can be installed again with its versions and credit\./)).toBeTruthy()
    expect(remove).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(done).toHaveBeenCalled())
    expect(remove).toHaveBeenCalledWith({ assetId: 'a1', confirmed: true })
  })

  it('asks even when no agent has it, and says every agent when every agent does', () => {
    holders.data = { everyAgent: true, agents: [{ id: 'g1', name: 'Ada' }] }
    render(<RemoveDialog assetId="a1" title="Code Review" onClose={() => {}} onRemoved={() => {}} />)
    expect(screen.getByTestId('remove-reach').textContent).toContain('Every agent has it.')
    cleanup()
    holders.data = { everyAgent: false, agents: [] }
    render(<RemoveDialog assetId="a1" title="Code Review" onClose={() => {}} onRemoved={() => {}} />)
    expect(screen.getByTestId('remove-reach').textContent).toBe('No agent has it.')
    expect(remove).not.toHaveBeenCalled()
  })

  it("on a template, names what was made from it and says it stays as it is (UQ5)", () => {
    holders.data = { everyAgent: false, agents: [], made: [{ name: 'Priya', version: '2.0.0' }] }
    render(<RemoveDialog assetId="a1" title="Project manager" template onClose={() => {}} onRemoved={() => {}} />)
    expect(screen.getByTestId('remove-reach').textContent).toBe('Priya was made from it. It stays as it is.')
    expect(screen.getByText(/an administrator can put it back/)).toBeTruthy()
  })

  it('keeps the dialog open and says why when it is refused', async () => {
    holders.data = { everyAgent: false, agents: [] }
    remove.mockRejectedValue(new Error('Removing is for administrators. Ask an administrator. Nothing was changed.'))
    render(<RemoveDialog assetId="a1" title="Code Review" onClose={() => {}} onRemoved={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Nothing was changed.'))
  })
})
