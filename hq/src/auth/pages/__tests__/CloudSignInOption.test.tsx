// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { fakeFetch } from './fakes'

vi.mock('wasp/client/api', () => ({ getSessionId: () => null }))

import { ACCEPT_FIRST, CloudSignInOption } from '../parts/CloudSignInOption'

afterEach(cleanup)
const button = () => screen.getByRole('button', { name: 'Sign in with Agenthix Cloud' }) as HTMLButtonElement

describe('Sign in with Agenthix Cloud where hq offers no Cloud (adr-0189)', () => {
  it('is not drawn at all, before or after hq answers, on the sign-in page, an invitation or setup', async () => {
    for (const place of ['signIn', 'invite', 'setup'] as const) {
      const calls = fakeFetch({ '/api/auth/cloud/status': { status: 404, body: { message: 'Agenthix Cloud is not available in this organisation. Nothing was changed.' } } })
      const { container } = render(<CloudSignInOption org="Acme Corp" place={place} />)
      expect(container.textContent).toBe('')
      await waitFor(() => expect(calls.some(c => c.url === '/api/auth/cloud/status')).toBe(true))
      await new Promise(r => setTimeout(r, 0))
      expect(container.textContent).toBe('')
      cleanup()
    }
  })
})

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
    const greyed = button()
    expect(greyed.getAttribute('aria-disabled')).toBe('true')
    fireEvent.mouseEnter(greyed)
    expect(screen.getByTestId('tooltip').textContent).toBe(ACCEPT_FIRST)
    fireEvent.click(greyed)
    expect(screen.getByTestId('attention-text').textContent).toBe(ACCEPT_FIRST)
    expect(start).not.toHaveBeenCalled()
  })
})
