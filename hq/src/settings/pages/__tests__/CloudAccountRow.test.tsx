// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { fakeFetch } from '../../../auth/pages/__tests__/fakes'

vi.mock('wasp/client/api', () => ({ getSessionId: () => 'session-now' }))
vi.mock('../CloudAskRow', () => ({ CloudAskRow: () => <div>asking row</div> }))

import { CloudAccountRow } from '../CloudAccountRow'

afterEach(cleanup)

describe('Settings › Sign-in › Agenthix account @SC-1094', () => {
  it('hands over to the ask row while HQ is not connected, and offers no Link @SC-1111', async () => {
    fakeFetch({ '/api/auth/cloud/link': { body: { connected: false, linked: null } } })
    render(<CloudAccountRow />)
    expect(await screen.findByText('asking row')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Link' })).toBeNull()
  })

  it('asks for the password before going to Cloud to link, and shows a refusal', async () => {
    fakeFetch({ '/api/auth/cloud/link': { body: { connected: true, linked: null } } })
    const start = vi.fn().mockResolvedValue('Your password is not right.')
    render(<CloudAccountRow start={start} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Link' }))
    fireEvent.change(screen.getByLabelText('Your password, to confirm it is you'), { target: { value: 'pw-typed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Agenthix Cloud' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Your password is not right.')
    expect(start).toHaveBeenCalledWith('link', 'pw-typed')
  })

  it('shows a linked account and unlinks it', async () => {
    const calls = fakeFetch({
      '/api/auth/cloud/link': { body: { connected: true, linked: { linkedAt: '2026-01-01T00:00:00.000Z' } } },
      '/api/auth/cloud/unlink': { body: { unlinked: true } },
    })
    render(<CloudAccountRow />)
    expect(await screen.findByText('Linked · you can sign in with Agenthix Cloud')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Unlink' }))
    await waitFor(() => expect(screen.getByText('Not linked')).toBeTruthy())
    expect(calls.some(c => c.url === '/api/auth/cloud/unlink' && c.init?.method === 'POST')).toBe(true)
  })
})
