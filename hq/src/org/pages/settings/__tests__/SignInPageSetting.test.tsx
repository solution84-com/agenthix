// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ identity: undefined as unknown, save: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  getOrgIdentity: 'getOrgIdentity', setSignInShows: 'setSignInShows',
  useQuery: () => ({ data: mocks.identity }),
  useAction: () => mocks.save,
}))

import { SignInPageSetting } from '../SignInPageSetting'

beforeEach(() => { mocks.identity = { signInShows: 'cover' }; mocks.save.mockReset().mockResolvedValue({ shows: 'name' }) })
afterEach(cleanup)

describe('Organisation › Settings › Sign-in page @SC-712', () => {
  it('offers the whole cover, the name only, or nothing, with the current one chosen', () => {
    render(<SignInPageSetting />)
    const radios = screen.getAllByRole('radio')
    expect(radios.map(r => r.querySelector('span')!.textContent)).toEqual(['The whole cover', 'The name only', 'Nothing'])
    expect(radios.map(r => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false'])
  })

  it('saves the admin\'s choice', async () => {
    render(<SignInPageSetting />)
    fireEvent.click(screen.getByRole('radio', { name: /The name only/ }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ shows: 'name' }))
  })

  it('says so when it cannot be saved', async () => {
    mocks.save.mockRejectedValue(new Error('Only an admin can choose that'))
    render(<SignInPageSetting />)
    fireEvent.click(screen.getByRole('radio', { name: /Nothing/ }))
    expect((await screen.findByRole('alert')).textContent).toBe('Only an admin can choose that')
  })
})
