// @vitest-environment jsdom
/** Connecting HQ to Agenthix Cloud from hq: the code to check, waiting, connected, and the ways it ends. */
import React from 'react'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const h = vi.hoisted(() => ({ state: undefined as unknown, connect: vi.fn(), disconnect: vi.fn(), refetch: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  getHqCloudConnection: 'getHqCloudConnection', connectHqToCloud: 'connectHqToCloud', disconnectHqFromCloud: 'disconnectHqFromCloud',
  useQuery: () => ({ data: h.state, error: undefined, refetch: h.refetch }),
  useAction: (op: string) => (op === 'connectHqToCloud' ? h.connect : h.disconnect),
}))

import { CloudConnectPanel } from '../CloudConnectPanel'

const off = { connection: null, connecting: null, lastAttempt: null, problem: null, runByCloud: false, aiAvailable: false }
const CONNECTING = { userCode: 'WDJB-MJHT', verificationUri: 'https://cloud.test/connect', verificationUriComplete: 'https://cloud.test/connect?user_code=WDJB-MJHT', expiresAt: '2026-10-23T10:15:00Z' }
const CONNECTED = { cloudOrganisationId: 'o1', name: 'Acme Robotics', connectedAt: '2026-10-23T10:01:00Z' }

beforeEach(() => { h.state = off; h.connect.mockReset().mockResolvedValue({}); h.disconnect.mockReset().mockResolvedValue({ disconnected: true }); h.refetch.mockReset().mockResolvedValue({}) })
afterEach(cleanup)

describe('the Agenthix Cloud connection panel', () => {
  it('asks for a connection and says who is told', async () => {
    render(<CloudConnectPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Connect Agenthix Cloud' }))
    await waitFor(() => expect(h.connect).toHaveBeenCalled())
    expect(screen.getByText(/Every organisation admin is told/)).toBeTruthy()
  })

  it('shows the code to check and the page to approve it on, and that it is waiting', () => {
    h.state = { ...off, connecting: CONNECTING }
    render(<CloudConnectPanel />)
    expect(screen.getByLabelText('Code to check').textContent).toBe('WDJB-MJHT')
    const link = screen.getByRole('link', { name: 'Approve on Agenthix Cloud ↗' })
    expect(link.getAttribute('href')).toBe(CONNECTING.verificationUriComplete)
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(screen.getByText(/Waiting for approval/)).toBeTruthy()
  })

  it('says connected, with Agenthix Cloud not available yet, and calls onConnected only when it becomes connected', () => {
    const onConnected = vi.fn()
    const { rerender } = render(<CloudConnectPanel onConnected={onConnected} />)
    h.state = { ...off, connecting: CONNECTING }
    rerender(<CloudConnectPanel onConnected={onConnected} />)
    expect(onConnected).not.toHaveBeenCalled()
    h.state = { ...off, connection: CONNECTED }
    rerender(<CloudConnectPanel onConnected={onConnected} />)
    expect(screen.getByText('Agenthix Cloud is connected')).toBeTruthy()
    expect(screen.getByText("Agenthix Cloud's models and voice aren't available yet.")).toBeTruthy()
    expect(onConnected).toHaveBeenCalledTimes(1)
  })

  it('does not call onConnected for a connection that was there already', () => {
    h.state = { ...off, connection: CONNECTED }
    const onConnected = vi.fn()
    render(<CloudConnectPanel onConnected={onConnected} />)
    expect(onConnected).not.toHaveBeenCalled()
  })

  it('says why an attempt ended and offers to connect again', () => {
    h.state = { ...off, lastAttempt: 'refused' }
    render(<CloudConnectPanel />)
    expect(screen.getByRole('alert').textContent).toContain('refused on Agenthix Cloud')
    expect(screen.getByRole('button', { name: 'Connect Agenthix Cloud' })).toBeTruthy()
  })

  it("shows the server's refusal in its words", async () => {
    h.connect.mockRejectedValue(new Error('Agenthix Cloud is busy — try again in 3 minutes.'))
    render(<CloudConnectPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Connect Agenthix Cloud' }))
    expect((await screen.findByText('Agenthix Cloud is busy — try again in 3 minutes.')).textContent).toBeTruthy()
  })

  it('disconnects only on Providers, after asking, and never on an HQ that Cloud runs', async () => {
    h.state = { ...off, connection: CONNECTED }
    const { rerender } = render(<CloudConnectPanel />)
    expect(screen.queryByRole('button', { name: 'Disconnect…' })).toBeNull()
    rerender(<CloudConnectPanel allowDisconnect />)
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect…' }))
    expect(h.disconnect).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
    await waitFor(() => expect(h.disconnect).toHaveBeenCalled())
    cleanup()
    h.state = { ...off, connection: CONNECTED, runByCloud: true }
    render(<CloudConnectPanel allowDisconnect />)
    expect(screen.queryByRole('button', { name: 'Disconnect…' })).toBeNull()
  })
})
