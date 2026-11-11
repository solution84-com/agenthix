// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ data: undefined as unknown, save: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  getTrustedPackageScopes: 'getTrustedPackageScopes', setTrustedPackageScopes: 'setTrustedPackageScopes',
  useQuery: () => ({ data: mocks.data }),
  useAction: () => mocks.save,
}))

import { TrustedPackageScopesSetting, scopesOf } from '../TrustedPackageScopesSetting'

beforeEach(() => { mocks.data = { scopes: ['@fernhill'] }; mocks.save.mockReset() })
afterEach(cleanup)

describe('Organisation › Settings › Trusted package scopes @SC-1711', () => {
  it('shows the scopes trusted now, one per line', () => {
    render(<TrustedPackageScopesSetting />)
    expect((screen.getByLabelText('Trusted npm scopes') as HTMLTextAreaElement).value).toBe('@fernhill')
  })

  it('saves what the admin typed, split on lines, commas and spaces', async () => {
    mocks.save.mockResolvedValue({ scopes: ['@fernhill', '@garden'] })
    render(<TrustedPackageScopesSetting />)
    fireEvent.change(screen.getByLabelText('Trusted npm scopes'), { target: { value: '@fernhill, @garden' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save scopes' }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ scopes: ['@fernhill', '@garden'] }))
    // A saved setting says nothing more: the field already shows what was saved.
    expect(screen.queryByText(/^Saved\./)).toBeNull()
  })

  it("shows HQ's refusal as it came", async () => {
    mocks.save.mockRejectedValue(new Error('fernhill is not an npm scope: a scope starts with @, like @fernhill. Nothing was changed.'))
    render(<TrustedPackageScopesSetting />)
    fireEvent.click(screen.getByRole('button', { name: 'Save scopes' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Nothing was changed\./)
  })

  it('reads scopes typed in any of the usual ways', () => {
    expect(scopesOf(' @a\n@b, @c  ')).toEqual(['@a', '@b', '@c'])
  })
})
