// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

const ops = vi.hoisted(() => ({ data: { connected: false, linked: false, asked: false, cloudOrigin: null } as any, ask: vi.fn(), refetch: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  useQuery: () => ({ data: ops.data, refetch: ops.refetch }),
  getMyCloudSignIn: 'getMyCloudSignIn',
  askForCloudSignIn: ops.ask,
}))

import { CloudAskRow } from '../CloudAskRow'

beforeEach(() => {
  ops.data = { connected: false, linked: false, asked: false, cloudOrigin: null }
  ops.ask.mockReset().mockResolvedValue({ asked: true })
  ops.refetch.mockReset().mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('Settings › Sign-in › Agenthix account, HQ not connected @SC-1111', () => {
  it('says what the account would give and offers to ask a fleet admin', () => {
    render(<CloudAskRow />)
    expect(screen.getByText(/one Agenthix account signs you in to every organisation you belong to/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ask a fleet admin to turn it on' }))
    expect(ops.ask).toHaveBeenCalledTimes(1)
  })

  it('once asked says "You asked" and has no button', async () => {
    ops.data = { ...ops.data, asked: true }
    render(<CloudAskRow />)
    expect(screen.getByText(/^You asked\./)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('says so when the ask could not be sent, and keeps the button', async () => {
    ops.ask.mockRejectedValue(new Error('down'))
    render(<CloudAskRow />)
    fireEvent.click(screen.getByRole('button', { name: 'Ask a fleet admin to turn it on' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Could not send that'))
    expect(screen.getByRole('button', { name: 'Ask a fleet admin to turn it on' })).toBeTruthy()
  })
})
