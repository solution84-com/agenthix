// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router'
import { ACME, fakeFetch } from './fakes'

const mocks = vi.hoisted(() => ({ login: vi.fn(), logout: vi.fn(), me: null as unknown }))
vi.mock('wasp/client/auth', () => ({ login: mocks.login, logout: mocks.logout, useAuth: () => ({ data: mocks.me }) }))
vi.mock('wasp/client/api', () => ({ getSessionId: () => null }))
vi.mock('wasp/client', () => ({ config: { apiUrl: 'http://hq.test' } }))

import { InvitePage } from '../InvitePage'

const invitation = (over: Record<string, unknown> = {}) => ({
  body: {
    valid: true, kind: 'invitation', role: 'MEMBER', note: 'Dana — design', invitedBy: { name: 'Avery', handle: 'avery' }, fromHqMachine: false,
    projects: [
      { key: 'WEB', name: 'Website Redesign', description: 'Redesign the company website', memberCount: 6 },
      { key: 'MER', name: 'Merchant app', description: null, memberCount: 1 },
    ],
    people: [{ name: 'Avery Chen', role: 'ADMIN' }, { name: 'Priya Nair', role: 'MEMBER' }], morePeople: 9, needsModel: true,
    expiresAt: '2026-10-16T12:00:00Z', org: ACME, ...over,
  },
})
function Where() { const { pathname, search, state } = useLocation(); return <output data-testid="where">{pathname}{search}{state ? JSON.stringify(state) : ''}</output> }

const open = async (answers: Parameters<typeof fakeFetch>[0], path = '/invite/tok123') => {
  const calls = fakeFetch({ '/api/org/public-identity': { body: { shows: 'cover', ...ACME } }, ...answers })
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/invite/:token?" element={<><InvitePage /><Where /></>} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )
  return calls
}

beforeEach(() => {
  for (const m of [mocks.login, mocks.logout]) m.mockReset()
  mocks.me = null
  mocks.login.mockResolvedValue(undefined)
  mocks.logout.mockResolvedValue(undefined)
  window.sessionStorage.clear()
})
afterEach(cleanup)

describe('The invitation page @SC-718', () => {
  it('says who invited them and what they join, with the invitation\'s label and close date, and asks their name', async () => {
    await open({ '/api/auth/validate-invite': invitation() })
    await screen.findByRole('heading', { name: 'Join Acme Corp' })
    const summary = screen.getByText(/invited you to join/).parentElement!
    expect(summary.textContent).toContain('Avery invited you to join Acme Corp as a Member, and to Website Redesign and Merchant app.')
    expect(summary.textContent).toContain('Invitation for "Dana — design" · open until 16 Oct')
    expect(screen.getByLabelText(/Your name/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Join Acme Corp' })).toBeTruthy()
    expect(screen.queryByText(/Invite code verified/)).toBeNull()
    expect(screen.getByTestId('org-cover').textContent).toContain('Acme Corp')
  })

  it('is onboarding\'s Join in the organisation\'s identity: the step count, people already there and the projects joined, no Agenthix header', async () => {
    await open({ '/api/auth/validate-invite': invitation() })
    await screen.findByRole('heading', { name: 'Join Acme Corp' })
    expect(screen.getByText('Step 1 of 3 · Join')).toBeTruthy()
    expect(screen.getByText('Already at Acme Corp')).toBeTruthy()
    expect(screen.getByText('Priya Nair')).toBeTruthy()
    expect(screen.getByText('and 9 more')).toBeTruthy()
    expect(screen.getByText('Projects you are joining')).toBeTruthy()
    expect(screen.getByText('6 people')).toBeTruthy()
    expect(screen.getByText('1 person')).toBeTruthy()
    expect(screen.getByText('Powered by Agenthix')).toBeTruthy()
    expect(screen.queryByTestId('setup-brand')).toBeNull()
  })

  it('counts two steps when the organisation provides model access', async () => {
    await open({ '/api/auth/validate-invite': invitation({ needsModel: false }) })
    await screen.findByRole('heading', { name: 'Join Acme Corp' })
    expect(screen.getByText('Step 1 of 2 · Join')).toBeTruthy()
  })

  it('takes the key out of the address and never shows a code field', async () => {
    await open({ '/api/auth/validate-invite': invitation() })
    await screen.findByRole('heading', { name: 'Join Acme Corp' })
    expect(screen.getByTestId('where').textContent).toBe('/invite')
    expect(screen.queryByPlaceholderText(/code/i)).toBeNull()
  })

  it('joins, signs in and carries on at onboarding\'s You step', async () => {
    const calls = await open({
      '/api/auth/validate-invite': invitation(),
      '/api/auth/accept-invite': { body: { success: true, landAt: '/projects/WEB' } },
    })
    await screen.findByRole('heading', { name: 'Join Acme Corp' })
    fireEvent.change(screen.getByLabelText(/Your name/), { target: { value: 'Dana Ruiz' } })
    fireEvent.change(screen.getByLabelText(/Username/), { target: { value: 'dana' } })
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'a-long-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Join Acme Corp' }))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/onboarding?step=you'))
    expect(JSON.parse(String(calls.find(c => c.url === '/api/auth/accept-invite')!.init!.body))).toEqual({ token: 'tok123', name: 'Dana Ruiz', username: 'dana', password: 'a-long-password' })
    expect(mocks.login).toHaveBeenCalledWith({ username: 'dana', password: 'a-long-password' })
  })

  it('asks before replacing a signed-in person, and Cancel leaves them where they are @SC-719', async () => {
    mocks.me = { id: 'u1', identities: { username: { id: 'avery' } } }
    await open({ '/api/auth/validate-invite': invitation() })
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe("You're signed in as avery")
    expect(screen.getByText(/This invitation is for someone new/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sign out and continue' }))
    await waitFor(() => expect(mocks.logout).toHaveBeenCalled())
    await screen.findByRole('heading', { name: 'Join Acme Corp' })
  })

  it('cancels back to Home when signed in', async () => {
    mocks.me = { id: 'u1', identities: { username: { id: 'avery' } } }
    await open({ '/api/auth/validate-invite': invitation() })
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(screen.getByTestId('where').textContent).toBe('/')
    expect(mocks.logout).not.toHaveBeenCalled()
  })
})

describe('The first-admin link @SC-709', () => {
  it('opens setup\'s first step with no code field', async () => {
    await open({ '/api/auth/validate-invite': invitation({ kind: 'first_admin', role: 'ADMIN', invitedBy: null, projects: [], note: null, org: { ...ACME, name: 'My Organisation' } }) })
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Set up Agenthix for your organisation')
    expect(screen.getByText("You're the first person here, so you'll be its admin.")).toBeTruthy()
    expect(screen.getByText('Step 1 of 4')).toBeTruthy()
    expect(screen.getByTestId('brand-side').textContent).toContain('Agenthix')
    expect(screen.getByTestId('setup-brand').textContent).toBe('Agenthix')
    expect(screen.queryByText('Powered by Agenthix')).toBeNull()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy()
    expect(screen.queryByText(/First-admin key|Setup code/)).toBeNull()
  })

  it('goes on to the organisation step after the account is made', async () => {
    await open({
      '/api/auth/validate-invite': invitation({ kind: 'first_admin', role: 'ADMIN', invitedBy: null, projects: [], note: null }),
      '/api/auth/accept-invite': { body: { success: true, landAt: '/setup' } },
    })
    fireEvent.change(await screen.findByLabelText(/Your name/), { target: { value: 'Avery Chen' } })
    fireEvent.change(screen.getByLabelText(/Username/), { target: { value: 'avery' } })
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'a-long-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/setup'))
  })
})

describe('An invitation that no longer works @SC-718 @SC-717', () => {
  const refused = (reason: string, error: string, askWho: string | null, status = 410) => ({ status, body: { valid: false, reason, error, askWho } })

  it('says it expired and who to ask, with Sign in instead', async () => {
    await open({ '/api/auth/validate-invite': refused('expired', 'This invitation has expired.', 'Avery') })
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('This invitation has expired')
    expect(screen.getByText('Ask Avery for a new one.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Sign in instead' }).getAttribute('href')).toBe('/login')
  })

  it('names the organisation\'s admins when the inviter is not known', async () => {
    await open({ '/api/auth/validate-invite': refused('used', 'This invitation has already been used.', null) })
    expect(await screen.findByText('Ask an admin of Acme Corp for a new one.')).toBeTruthy()
  })

  it('says only that an unknown link does not work', async () => {
    await open({ '/api/auth/validate-invite': refused('unknown', "This invitation link doesn't work.", null, 404) })
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe("This invitation link doesn't work")
    expect(screen.queryByText(/Ask/)).toBeNull()
  })

  it('says the HQ is already set up for the first-admin link after setup, with Sign in @SC-709 @SC-717', async () => {
    await open({ '/api/auth/validate-invite': refused('already_set_up', 'Already set up', null) })
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe("Acme Corp's HQ is already set up")
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/login')
  })

  describe('a setup link, by how far setup has got @SC-709 @SC-717', () => {
    const NO_ORG = { shows: 'nothing', name: null, handle: null, vision: null, avatarUrl: null, coverUrl: null }
    const as = (claimState: string) => ({ '/api/org/public-identity': { body: { ...NO_ORG, claimState } } })

    it('before the first account, an expired link names the command for a new one and offers no sign-in', async () => {
      await open({ ...as('unclaimed'), '/api/auth/validate-invite': refused('expired', 'x', null) })
      expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('This setup link has expired')
      expect(screen.getByText('agenthix hq invite-admin')).toBeTruthy()
      expect(screen.queryByRole('link', { name: /Sign in/ })).toBeNull()
    })

    it('before the first account, a replaced or unknown link says the same', async () => {
      await open({ ...as('unclaimed'), '/api/auth/validate-invite': refused('revoked', 'x', null) })
      expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('This setup link was replaced by a newer one')
      cleanup()
      await open({ ...as('unclaimed'), '/api/auth/validate-invite': refused('unknown', 'x', null, 404) })
      expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe("This setup link doesn't work")
    })

    it('once the first account exists but setup is not finished, a spent link sends the person to sign in', async () => {
      await open({ ...as('setting_up'), '/api/auth/validate-invite': refused('already_set_up', 'x', null) })
      expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('This setup link was already used')
      expect(screen.getByText(/setup carries on where it stopped/)).toBeTruthy()
      expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/login')
    })
  })

  it('has no link to read at all without a key', async () => {
    await open({}, '/invite')
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe("This invitation link doesn't work")
  })
})
