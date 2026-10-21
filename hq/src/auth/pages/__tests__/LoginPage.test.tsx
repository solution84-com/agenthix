// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import { ACME, fakeFetch } from './fakes'

const auth = vi.hoisted(() => ({ login: vi.fn() }))
vi.mock('wasp/client/auth', () => ({ login: auth.login }))
vi.mock('wasp/client', () => ({ config: { apiUrl: 'http://hq.test' } }))
vi.mock('wasp/client/api', () => ({ getSessionId: () => null }))

import { LoginPage, signInMessage } from '../LoginPage'

const identity = (over: Record<string, unknown> = {}) => ({ body: { shows: 'cover', ...ACME, ...over } })
const open = async (answers: Parameters<typeof fakeFetch>[0] = {}) => {
  fakeFetch({ '/api/auth/bootstrap-status': { body: { bootstrapRequired: false } }, '/api/org/public-identity': identity(), ...answers })
  render(<MemoryRouter initialEntries={['/login']}><Routes><Route path="/login" element={<LoginPage />} /><Route path="/" element={<span>Home</span>} /></Routes></MemoryRouter>)
  await screen.findByRole('heading', { level: 1 })
}
const fill = (u: string, p: string) => {
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: u } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: p } })
}

beforeEach(() => { auth.login.mockReset(); localStorage.clear() })
afterEach(cleanup)

describe('Signing in', () => {
  it("shows the organisation's cover, name, handle and vision beside one title and one action @SC-712", async () => {
    await open()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Sign in')
    expect(screen.getByText("to Acme Corp's HQ")).toBeTruthy()
    const cover = screen.getByTestId('org-cover')
    expect(cover.textContent).toContain('Acme Corp')
    expect(cover.textContent).toContain('@acmecorp')
    expect(cover.textContent).toContain('Software that helps small shops sell online.')
    expect(screen.getByText('A')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
    expect(screen.getByLabelText('Remember my username')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Forgot your password?' })).toBeTruthy()
    expect(screen.getByText('New here? Ask an admin of Acme Corp for an invitation.')).toBeTruthy()
    expect(screen.getByText('Powered by Agenthix')).toBeTruthy()
  })

  it('shows only the name when the admin chose that, and no cover at all when they chose nothing @SC-712', async () => {
    await open({ '/api/org/public-identity': identity({ shows: 'name', handle: null, vision: null }) })
    expect(screen.getByTestId('org-cover').textContent).toBe('Acme Corp')
    cleanup()
    await open({ '/api/org/public-identity': identity({ shows: 'nothing', name: null, handle: null, vision: null }) })
    expect(screen.queryByTestId('org-cover')).toBeNull()
    expect(screen.getByText('to HQ')).toBeTruthy()
  })

  it('signs in and goes to Home, remembering only the username when asked @SC-713', async () => {
    auth.login.mockResolvedValue(undefined)
    await open()
    fill('dana', 'a-long-password')
    fireEvent.click(screen.getByLabelText('Remember my username'))
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await screen.findByText('Home')
    expect(auth.login).toHaveBeenCalledWith({ username: 'dana', password: 'a-long-password' })
    expect(localStorage.getItem('agenthix_remembered_credentials')).toBe('{"username":"dana"}')
  })

  it("says a wrong password in the same words whichever was wrong @SC-713", async () => {
    auth.login.mockRejectedValue({ statusCode: 401, message: 'Invalid credentials' })
    await open()
    fill('dana', 'nope')
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect((await screen.findByRole('alert')).textContent).toBe("That username and password don't match.")
    expect(screen.queryByText('Invalid credentials')).toBeNull()
  })

  it('tells someone who tried too often to wait, in the words the limit gave @SC-713', () => {
    expect(signInMessage({ statusCode: 429, message: 'Too many wrong passwords from here. Try again in 15 minutes.' }))
      .toEqual({ kind: 'message', text: 'Too many wrong passwords from here. Try again in 15 minutes.' })
  })

  it('gives a removed person their own page, not an error inside the form @SC-713 @SC-717', async () => {
    auth.login.mockRejectedValue({ statusCode: 403, message: 'This account has been removed from the organisation.' })
    await open()
    fill('sam', 'whatever1')
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('You no longer have access to Acme Corp'))
    expect(screen.getByText(/ask an admin to reactivate it/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeTruthy()
  })

  it('explains a forgotten password without naming anyone @SC-715', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Forgot your password?' }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Forgot your password?')
    expect(screen.getByText("HQ doesn't keep email addresses, so it can't send you a link.")).toBeTruthy()
    expect(screen.getByText(/Ask an admin of Acme Corp/)).toBeTruthy()
    expect(screen.getByText(/Organisation › People/)).toBeTruthy()
    expect(screen.getByText(/agenthix reset-password/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }))
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
  })

  it("on a fresh HQ points to the setup link instead of a code field @SC-709", async () => {
    await open({ '/api/auth/bootstrap-status': { body: { bootstrapRequired: true } } })
    expect(screen.getByText(/setup link printed in HQ's log/)).toBeTruthy()
    expect(screen.queryByLabelText('Password')).toBeNull()
  })

  it('fills in a remembered username', async () => {
    localStorage.setItem('agenthix_remembered_credentials', '{"username":"dana"}')
    await open()
    await waitFor(() => expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe('dana'))
    expect((screen.getByLabelText('Remember my username') as HTMLInputElement).checked).toBe(true)
  })
})

describe('Sign in with Agenthix Cloud @SC-1109', () => {
  const cloudButton = () => screen.getByRole('button', { name: 'Sign in with Agenthix Cloud' }) as HTMLButtonElement

  it('is greyed out with its reason while HQ is not connected, and carries no link to Cloud', async () => {
    await open({ '/api/auth/cloud/status': { body: { connected: false } } })
    expect(await screen.findByText(/Not turned on for .*HQ. Sign in with your username and password./)).toBeTruthy()
    expect(cloudButton().disabled).toBe(true)
    expect(document.querySelector('a[href*="cloud"]')).toBeNull()
  })

  it('starts the sign-in at HQ and goes where HQ answers, keeping the binding for this tab @SC-1091', async () => {
    const authorizeUrl = `https://cloud.test/connect/authorize?state=${'s'.repeat(43)}`
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    const calls = fakeFetch({
      '/api/auth/bootstrap-status': { body: { bootstrapRequired: false } },
      '/api/org/public-identity': identity(),
      '/api/auth/cloud/status': { body: { connected: true } },
      '/api/auth/cloud/start': { body: { authorizeUrl, binding: 'b'.repeat(43) } },
    })
    render(<MemoryRouter initialEntries={['/login']}><Routes><Route path="/login" element={<LoginPage />} /></Routes></MemoryRouter>)
    await waitFor(() => expect(cloudButton().disabled).toBe(false))
    fireEvent.click(cloudButton())
    await waitFor(() => expect(assign).toHaveBeenCalledWith(authorizeUrl))
    expect(JSON.parse(calls.find(c => c.url === '/api/auth/cloud/start')!.init!.body as string)).toEqual({ purpose: 'signIn' })
    expect(JSON.parse(sessionStorage.getItem(`cloud_sign_in:${'s'.repeat(43)}`)!)).toEqual({ binding: 'b'.repeat(43), purpose: 'signIn' })
    vi.unstubAllGlobals()
  })
})
