// @vitest-environment jsdom
/**
 * Pairing a phone in the public demo: the demo's guard refuses it on the server, and that refusal is said in the
 * server's words, never as "Please try again".
 */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const h = vi.hoisted(() => ({ generate: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  useQuery: () => ({ data: undefined }),
  generateMobileAuthToken: () => h.generate(),
}))
vi.mock('../../settings/pages/SettingsSubpage', () => ({ SettingsSubpage: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('./SignedInPhones', () => ({ SignedInPhones: () => null }))
vi.mock('react-qr-code', () => ({ default: () => <svg data-testid="qr" /> }))

import { ConnectMobilePage } from './ConnectMobilePage'

beforeEach(() => { h.generate = vi.fn().mockResolvedValue({ token: 't1' }) })
afterEach(cleanup)

describe('Generate QR Code', () => {
  it("says a refusal from the server in the server's words, with no Try again @SC-2000", async () => {
    h.generate = vi.fn().mockRejectedValue(Object.assign(new Error("The demo can't do this. Nothing was changed."), { statusCode: 403, data: { demo: true } }))
    render(<ConnectMobilePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Generate QR Code' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe("The demo can't do this. Nothing was changed."))
    expect(screen.queryByText(/Please try again/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  it('makes a code outside the demo', async () => {
    render(<ConnectMobilePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Generate QR Code' }))
    await waitFor(() => expect(screen.getByTestId('qr')).toBeTruthy())
  })
})
