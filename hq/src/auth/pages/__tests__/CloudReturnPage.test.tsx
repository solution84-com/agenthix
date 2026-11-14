// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import { ACME, fakeFetch } from './fakes'

const api = vi.hoisted(() => ({ setSessionId: vi.fn() }))
vi.mock('wasp/client/api', () => ({ getSessionId: () => 'session-now', setSessionId: api.setSessionId }))

import { CloudReturnPage } from '../CloudReturnPage'

const STATE = 's'.repeat(43)
const BINDING = 'b'.repeat(43)

function open(finish: { status?: number; body: unknown }, query = `state=${STATE}&code=the-code-from-cloud`) {
  const calls = fakeFetch({ '/api/org/public-identity': { body: { shows: 'name', ...ACME } }, '/api/auth/cloud/finish': finish })
  const leave = vi.fn()
  render(<MemoryRouter initialEntries={[`/login/cloud?${query}`]}><Routes><Route path="/login/cloud" element={<CloudReturnPage leave={leave} />} /></Routes></MemoryRouter>)
  return { calls, leave }
}

beforeEach(() => { api.setSessionId.mockReset(); sessionStorage.clear() })
afterEach(cleanup)

describe('back from Agenthix Cloud where hq offers no Cloud (adr-0189) @SC-2125', () => {
  it('goes back to signing in, saying nothing of Cloud, and keeps no session', async () => {
    sessionStorage.setItem(`cloud_sign_in:${STATE}`, JSON.stringify({ binding: BINDING, purpose: 'signIn' }))
    const { leave } = open({ status: 404, body: { message: 'Agenthix Cloud is not available in this organisation. Nothing was changed.' } })
    await waitFor(() => expect(leave).toHaveBeenCalledWith('/login'))
    expect(api.setSessionId).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain('Cloud')
  })
})

describe('back from Agenthix Cloud @SC-1093', () => {
  it("hands HQ the code with this tab's binding, keeps the session HQ made, and goes Home", async () => {
    sessionStorage.setItem(`cloud_sign_in:${STATE}`, JSON.stringify({ binding: BINDING, purpose: 'signIn' }))
    const { calls, leave } = open({ body: { kind: 'signedIn', sessionId: 'new-session' } })
    await waitFor(() => expect(leave).toHaveBeenCalledWith('/'))
    expect(api.setSessionId).toHaveBeenCalledWith('new-session')
    expect(JSON.parse(calls.find(c => c.url === '/api/auth/cloud/finish')!.init!.body as string)).toEqual({ state: STATE, binding: BINDING, code: 'the-code-from-cloud' })
    expect(sessionStorage.getItem(`cloud_sign_in:${STATE}`)).toBeNull()
    // A session this browser kept from before is not sent: one that has ended would have hq refuse the request.
    expect((calls.find(c => c.url === '/api/auth/cloud/finish')!.init!.headers as Record<string, string>).Authorization).toBeUndefined()
  })

  it('goes back to Settings once an account is linked', async () => {
    sessionStorage.setItem(`cloud_sign_in:${STATE}`, JSON.stringify({ binding: BINDING, purpose: 'link' }))
    const { calls, leave } = open({ body: { kind: 'linked' } })
    await waitFor(() => expect(leave).toHaveBeenCalledWith('/settings#settings-sign-in'))
    expect((calls.find(c => c.url === '/api/auth/cloud/finish')!.init!.headers as Record<string, string>).Authorization).toBe('Bearer session-now')
    expect(api.setSessionId).not.toHaveBeenCalled()
  })

  it("shows HQ's words when an account is not linked, with the way back to sign in", async () => {
    sessionStorage.setItem(`cloud_sign_in:${STATE}`, JSON.stringify({ binding: BINDING, purpose: 'signIn' }))
    const words = 'This Agenthix account is not linked to anyone in this HQ. Sign in with your username and password, then link it in Settings › Sign-in first.'
    const { leave } = open({ status: 403, body: { error: words, reason: 'not_linked' } })
    expect(await screen.findByText(words)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to sign in' }).getAttribute('href')).toBe('/login')
    expect(leave).not.toHaveBeenCalled()
    expect(api.setSessionId).not.toHaveBeenCalled()
  })

  it('sends an empty binding from a tab that did not start the sign-in, so HQ refuses it', async () => {
    const { calls } = open({ status: 400, body: { error: 'This sign-in ran out of time or was started in another tab. Start again.' } })
    expect(await screen.findByText(/started in another tab/)).toBeTruthy()
    expect(JSON.parse(calls.find(c => c.url === '/api/auth/cloud/finish')!.init!.body as string).binding).toBe('')
  })
})
