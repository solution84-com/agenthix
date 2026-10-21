// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { fakeFetch } from './fakes'

vi.mock('wasp/client/api', () => ({ getSessionId: () => null }))

import { ACCEPT_FIRST, CloudSignInOption } from '../parts/CloudSignInOption'

afterEach(cleanup)
const button = () => screen.getByRole('button', { name: 'Sign in with Agenthix Cloud' }) as HTMLButtonElement

describe('Sign in with Agenthix Cloud beside an invitation or setup @SC-1110', () => {
  it('is greyed out on an invitation while HQ is not connected, with its reason', async () => {
    fakeFetch({ '/api/auth/cloud/status': { body: { connected: false } } })
    render(<CloudSignInOption org="Acme Corp" place="invite" />)
    expect(await screen.findByText("Not turned on for Acme Corp's HQ. Sign in with your username and password.")).toBeTruthy()
    expect(button().disabled).toBe(true)
  })

  it('is greyed out in setup with the reason that points to after setup', async () => {
    fakeFetch({ '/api/auth/cloud/status': { body: { connected: false } } })
    render(<CloudSignInOption org={null} place="setup" />)
    expect(await screen.findByText('Not turned on for this HQ yet. A fleet admin can turn it on after setup.')).toBeTruthy()
    expect(button().disabled).toBe(true)
  })

  it('on an invitation, when connected, says to accept with a password first and starts nothing', async () => {
    fakeFetch({ '/api/auth/cloud/status': { body: { connected: true } } })
    const start = vi.fn()
    render(<CloudSignInOption org="Acme Corp" place="invite" start={start} />)
    await waitFor(() => expect(button().disabled).toBe(false))
    fireEvent.click(button())
    expect(screen.getByRole('status').textContent).toBe(ACCEPT_FIRST)
    expect(start).not.toHaveBeenCalled()
  })
})
