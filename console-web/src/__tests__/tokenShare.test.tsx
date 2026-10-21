import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import { csrfToken, forgetCsrfToken, keepCsrfToken } from '../api/csrf'
import { askOpenTabs, SESSION_CHANNEL, shareSession } from '../api/tokenShare'
import { fakeServer, SAM, STATUS_OK } from './fakeServer'

// A new Fleet Console tab signs in from an open one: it asks over a same-origin BroadcastChannel, a signed-in tab
// answers with the session's token, and the new tab checks the session with the server before it opens anything.
// Here another tab is played by a channel of the same name.

let others: BroadcastChannel[] = []

/** Another tab of this origin: answers each ask with `token`, or stays silent when null. */
function otherTab(token: string | null): { channel: BroadcastChannel; heard: unknown[] } {
  const channel = new BroadcastChannel(SESSION_CHANNEL)
  const heard: unknown[] = []
  channel.onmessage = e => {
    heard.push(e.data)
    const m = e.data as { kind?: string; id?: string }
    if (m.kind === 'ask' && token) channel.postMessage({ kind: 'token', id: m.id, token })
  }
  others.push(channel)
  return { channel, heard }
}

beforeEach(() => window.history.replaceState(null, '', '/'))

afterEach(() => {
  cleanup()
  for (const c of others) c.close()
  others = []
  vi.unstubAllGlobals()
  forgetCsrfToken()
  sessionStorage.clear()
  localStorage.clear()
})

const sessionRoute = (expect: string) => (req: { headers: Record<string, string> }) =>
  req.headers['x-csrf-token'] === expect ? { status: 200, body: { user: SAM } } : { status: 401, body: { error: 'signed_out', message: 'Signed out.' } }

describe('a new tab signs in from an open one @SC-893', () => {
  it('takes the token a signed-in tab answers with, and checks it with the server before opening the shell', async () => {
    otherTab('tok-open')
    const requests = fakeServer({ 'GET /status': { status: 200, body: STATUS_OK }, 'GET /session': sessionRoute('tok-open') })
    render(<App />)
    expect(await screen.findByRole('navigation', { name: 'Fleet Console' })).toBeTruthy()
    expect(requests.find(r => r.path === '/session')?.headers['x-csrf-token']).toBe('tok-open')
    // Kept for this tab only: never localStorage, a cookie or the address.
    expect(localStorage.length).toBe(0)
    expect(document.cookie).toBe('')
    expect(window.location.href).not.toContain('tok-open')
  })

  it('with no signed-in tab open, shows sign-in and asks the server nothing about a session', async () => {
    otherTab(null)
    const requests = fakeServer({ 'GET /status': { status: 200, body: STATUS_OK } })
    render(<App />)
    expect(await screen.findByLabelText('Password')).toBeTruthy()
    expect(requests.some(r => r.path === '/session')).toBe(false)
    expect(csrfToken()).toBeNull()
  })

  it('a token the server no longer takes leaves the tab at sign-in, the token dropped', async () => {
    otherTab('tok-stale')
    fakeServer({ 'GET /status': { status: 200, body: STATUS_OK }, 'GET /session': sessionRoute('tok-current') })
    render(<App />)
    expect(await screen.findByLabelText('Password')).toBeTruthy()
    expect(csrfToken()).toBeNull()
  })

  it('ignores an answer to another tab’s ask, and anything that is not an answer', async () => {
    const { channel } = otherTab(null)
    channel.onmessage = e => {
      const m = e.data as { id: string }
      channel.postMessage({ kind: 'token', id: `${m.id}-other`, token: 'tok-not-yours' })
      channel.postMessage({ kind: 'token', id: m.id })
      channel.postMessage('tok-loose')
    }
    expect(await askOpenTabs(100)).toBeNull()
  })
})

describe('a signed-in tab @SC-893', () => {
  it('answers a new tab’s ask with its token, and nothing else', async () => {
    keepCsrfToken('tok-mine')
    const stop = shareSession(() => {})
    const { channel, heard } = otherTab(null)
    channel.postMessage({ kind: 'ask', id: 'a1' })
    await waitFor(() => expect(heard).toEqual([{ kind: 'token', id: 'a1', token: 'tok-mine' }]))
    stop()
  })

  it('answers nothing while it holds no token', async () => {
    const stop = shareSession(() => {})
    const { channel, heard } = otherTab(null)
    channel.postMessage({ kind: 'ask', id: 'a2' })
    await new Promise(r => setTimeout(r, 50))
    expect(heard).toEqual([])
    stop()
  })

  it('signing out in one tab tells the others, which drop the token and return to sign-in', async () => {
    keepCsrfToken('tok-1')
    fakeServer({ 'GET /status': { status: 200, body: STATUS_OK }, 'GET /session': sessionRoute('tok-1') })
    render(<App />)
    expect(await screen.findByRole('navigation', { name: 'Fleet Console' })).toBeTruthy()
    const { channel } = otherTab(null)
    channel.postMessage({ kind: 'signedOut' })
    expect(await screen.findByText('You signed out in another tab.')).toBeTruthy()
    expect(screen.getByLabelText('Password')).toBeTruthy()
    expect(csrfToken()).toBeNull()
  })

  it('signing out here tells the other tabs', async () => {
    keepCsrfToken('tok-2')
    fakeServer({
      'GET /status': { status: 200, body: STATUS_OK },
      'GET /session': sessionRoute('tok-2'),
      'DELETE /session': { status: 204 },
    })
    const { heard } = otherTab(null)
    window.history.replaceState(null, '', '/account')
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(heard).toContainEqual({ kind: 'signedOut' }))
    expect(csrfToken()).toBeNull()
  })
})
