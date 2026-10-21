/**
 * A new Fleet Console tab signs in from an open one. The session's CSRF token lives in each tab's sessionStorage
 * (csrf.ts), so a new tab starts without it; it asks over a BroadcastChannel, and a signed-in tab answers with the
 * token, to that ask only. The new tab then checks the session with the server, as after signing in.
 *
 * A BroadcastChannel reaches only pages of the same origin — scheme, host and port — in the same browser profile:
 * a page served on another port of 127.0.0.1 is another origin and cannot join it, though it is sent the cookie. The
 * token goes nowhere else: never localStorage, a cookie or an address. Signing out in one tab tells the others to
 * drop it.
 */
import { csrfToken, forgetCsrfToken } from './csrf'

export const SESSION_CHANNEL = 'fleet-console-session'

/** How long a new tab waits for an open one to answer; on this machine an answer takes milliseconds. */
export const ASK_WAIT_MS = 250

type Message = { kind: 'ask'; id: string } | { kind: 'token'; id: string; token: string } | { kind: 'signedOut' }

function read(data: unknown): Message | null {
  if (typeof data !== 'object' || data === null) return null
  const m = data as Record<string, unknown>
  if (m.kind === 'signedOut') return { kind: 'signedOut' }
  if (typeof m.id !== 'string' || !m.id) return null
  if (m.kind === 'ask') return { kind: 'ask', id: m.id }
  if (m.kind === 'token' && typeof m.token === 'string' && m.token) return { kind: 'token', id: m.id, token: m.token }
  return null
}

function open(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel === 'function' ? new BroadcastChannel(SESSION_CHANNEL) : null
  } catch {
    return null
  }
}

/** Asks the open tabs for the session's token; null when none answers in time. */
export function askOpenTabs(waitMs = ASK_WAIT_MS): Promise<string | null> {
  const channel = open()
  if (!channel) return Promise.resolve(null)
  // Not crypto.randomUUID, which a browser gives only to a secure page: this one need not be.
  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('')
  return new Promise(resolve => {
    const done = (token: string | null) => {
      window.clearTimeout(timer)
      channel.close()
      resolve(token)
    }
    const timer = window.setTimeout(() => done(null), waitMs)
    channel.onmessage = e => {
      const m = read(e.data)
      if (m?.kind === 'token' && m.id === id) done(m.token)
    }
    channel.postMessage({ kind: 'ask', id } satisfies Message)
  })
}

let sharing: BroadcastChannel | null = null

/**
 * While the app is open: answers a new tab's ask with the token this tab holds, and, when another tab signs out,
 * drops it and calls `signedOutElsewhere`. Returns the way to stop.
 */
export function shareSession(signedOutElsewhere: () => void): () => void {
  const channel = open()
  if (!channel) return () => {}
  sharing = channel
  channel.onmessage = e => {
    const m = read(e.data)
    if (m?.kind === 'ask') {
      const token = csrfToken()
      if (token) channel.postMessage({ kind: 'token', id: m.id, token } satisfies Message)
    } else if (m?.kind === 'signedOut') {
      forgetCsrfToken()
      signedOutElsewhere()
    }
  }
  return () => {
    if (sharing === channel) sharing = null
    channel.close()
  }
}

/** Tells the other tabs this session was signed out. */
export function tellTabsSignedOut(): void {
  const message: Message = { kind: 'signedOut' }
  if (sharing) {
    sharing.postMessage(message)
    return
  }
  const channel = open()
  channel?.postMessage(message)
  channel?.close()
}
