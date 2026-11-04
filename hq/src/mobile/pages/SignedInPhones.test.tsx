// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const state = vi.hoisted(() => ({ phones: [] as any[] | undefined, refetch: vi.fn(), signOut: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  useQuery: () => ({ data: state.phones, refetch: state.refetch }),
  getMyPhones: {},
  signOutPhone: (a: unknown) => state.signOut(a),
}))

import { SignedInPhones } from './SignedInPhones'

beforeEach(() => {
  state.refetch.mockReset(); state.signOut.mockReset().mockResolvedValue(undefined)
  state.phones = [{ id: 'h1', deviceName: "Sam's phone", lastUsedAt: new Date('2030-01-02T10:00:00Z'), signedInAt: new Date() }]
})

describe('SignedInPhones @SC-1101', () => {
  it('lists each phone and signs one out', async () => {
    render(<SignedInPhones />)
    expect(screen.getByText("Sam's phone")).toBeTruthy()
    expect(screen.getByText(/Last used/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: "Sign out Sam's phone" }))
    await waitFor(() => expect(state.signOut).toHaveBeenCalledWith({ id: 'h1' }))
    await waitFor(() => expect(state.refetch).toHaveBeenCalled())
  })

  it('says so when no phone is signed in', () => {
    state.phones = []
    render(<SignedInPhones />)
    expect(screen.getByText('No phone is signed in as you.')).toBeTruthy()
  })

  it('shows a refusal in plain words', async () => {
    state.signOut.mockRejectedValue(new Error('x'))
    render(<SignedInPhones />)
    fireEvent.click(screen.getByRole('button', { name: /Sign out/ }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Could not sign that phone out/)
  })
})
