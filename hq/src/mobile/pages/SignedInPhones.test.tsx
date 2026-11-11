// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const state = vi.hoisted(() => ({ phones: [] as any[] | undefined, error: null as unknown, refetch: vi.fn(), signOut: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  useQuery: () => ({ data: state.phones, error: state.error, dataUpdatedAt: 0, refetch: state.refetch }),
  getMyPhones: {},
  signOutPhone: (a: unknown) => state.signOut(a),
}))

import { SignedInPhones } from './SignedInPhones'

beforeEach(() => {
  state.error = null
  state.refetch.mockReset(); state.signOut.mockReset().mockResolvedValue(undefined)
  state.phones = [{ id: 'h1', deviceName: "Sam's phone", lastUsedAt: new Date('2030-01-02T10:00:00Z'), signedInAt: new Date() }]
})

describe('SignedInPhones @SC-1101 @SC-1935', () => {
  it('lists each phone and signs one out', async () => {
    render(<SignedInPhones />)
    expect(screen.getByText("Sam's phone")).toBeTruthy()
    expect(screen.getByText(/Last used/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: "Sign out Sam's phone" }))
    await waitFor(() => expect(state.signOut).toHaveBeenCalledWith({ id: 'h1' }))
    await waitFor(() => expect(state.refetch).toHaveBeenCalled())
  })

  it('puts the not-up-to-date line after the last phone, so no row moves', () => {
    state.error = new Error('Network Error')
    render(<SignedInPhones />)
    const phone = screen.getByText("Sam's phone").closest('li')!
    expect(phone.compareDocumentPosition(screen.getByText(/Not up to date/)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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
