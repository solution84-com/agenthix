// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router'
import { ACME, fakeFetch } from './fakes'

const mocks = vi.hoisted(() => ({ login: vi.fn() }))
vi.mock('wasp/client/auth', () => ({ login: mocks.login }))
vi.mock('wasp/client/api', () => ({ getSessionId: () => null }))
vi.mock('wasp/client', () => ({ config: { apiUrl: 'http://hq.test' } }))

import { ResetPasswordPage, untilText } from '../ResetPasswordPage'

function Where() { const { pathname } = useLocation(); return <output data-testid="where">{pathname}</output> }
const view = (over: Record<string, unknown> = {}) => ({
  body: { person: { name: 'Dana Ruiz', handle: 'dana' }, madeBy: { name: 'Avery' }, expiresAt: new Date(Date.now() + 3_600_000).toISOString(), org: ACME, ...over },
})
const open = (answers: Parameters<typeof fakeFetch>[0]) => {
  fakeFetch({ '/api/org/public-identity': { body: { shows: 'cover', ...ACME } }, ...answers })
  render(
    <MemoryRouter initialEntries={['/reset-password/tok']}>
      <Routes><Route path="/reset-password/:token?" element={<><ResetPasswordPage /><Where /></>} /><Route path="*" element={<Where />} /></Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => { mocks.login.mockReset().mockResolvedValue(undefined); window.sessionStorage.clear() })
afterEach(cleanup)

describe('The reset page @SC-716 @SC-1935', () => {
  it('names the account and who made the link, with the organisation beside it', async () => {
    open({ '/api/auth/password-reset/read': view() })
    await screen.findByText('Dana Ruiz')
    expect(screen.getByText(/@dana/)).toBeTruthy()
    expect(screen.getByText(/Reset link from Avery/)).toBeTruthy()
    expect(screen.getByText('Your sign-ins on other browsers and your phone end.')).toBeTruthy()
    expect(screen.getByTestId('org-cover').textContent).toContain('Acme Corp')
  })

  it("says the link came from HQ's machine when no one made it in the app", async () => {
    open({ '/api/auth/password-reset/read': view({ madeBy: null }) })
    expect(await screen.findByText(/Reset link from HQ's machine/)).toBeTruthy()
  })

  it('sets the password, signs them in and goes to Home', async () => {
    open({ '/api/auth/password-reset/read': view(), '/api/auth/password-reset': { body: { username: 'dana' } } })
    await screen.findByText('Dana Ruiz')
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'a-new-password' } })
    fireEvent.change(screen.getByLabelText('Again'), { target: { value: 'a-new-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Set password and sign in' }))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/'))
    expect(mocks.login).toHaveBeenCalledWith({ username: 'dana', password: 'a-new-password' })
  })

  it('refuses two different passwords before asking the server', async () => {
    open({ '/api/auth/password-reset/read': view() })
    await screen.findByText('Dana Ruiz')
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'a-new-password' } })
    fireEvent.change(screen.getByLabelText('Again'), { target: { value: 'another-one-here' } })
    fireEvent.click(screen.getByRole('button', { name: 'Set password and sign in' }))
    expect((await screen.findByText('The two passwords are not the same')).closest('p')?.id).toBe('again-error')
    expect(mocks.login).not.toHaveBeenCalled()
  })

  it('offers Sign in instead for a link that no longer works @SC-717', async () => {
    open({ '/api/auth/password-reset/read': { status: 410, body: { error: 'This reset link has expired. Ask for a new one.' } } })
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe("This reset link doesn't work")
    expect(screen.getByText('This reset link has expired. Ask for a new one.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Sign in instead' })).toBeTruthy()
  })
})

describe('untilText', () => {
  it('says tomorrow for the next day and only the time for today', () => {
    const now = new Date(2026, 9, 11, 14, 0)
    expect(untilText(new Date(2026, 9, 12, 14, 2).toISOString(), now)).toBe('works until tomorrow 14:02')
    expect(untilText(new Date(2026, 9, 11, 15, 0).toISOString(), now)).toBe('works until 15:00')
  })
})

describe('The reset page when HQ fails @SC-716', () => {
  it('retries a 502 and then says HQ did not answer, not that the link is bad', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      open({ '/api/auth/password-reset/read': { status: 502, body: {} } })
      await vi.advanceTimersByTimeAsync(20_000)
      expect(screen.queryByText("This reset link doesn't work.")).toBeNull()
      expect(await screen.findByRole('button', { name: 'Try again' })).toBeTruthy()
    } finally { vi.useRealTimers() }
  })
})
