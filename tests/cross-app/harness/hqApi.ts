import { io, Socket } from 'socket.io-client'
import { HQ_URL } from './env'

export async function login(username: string, password: string): Promise<string> {
  const res = await fetch(`${HQ_URL}/auth/username/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) throw new Error(`login ${username}: ${res.status} ${await res.text()}`)
  return (await res.json()).sessionId
}

export async function op(server: string, name: string, args: unknown, token?: string) {
  const res = await fetch(`${server}/operations/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ json: args }),
  })
  const body: any = await res.json().catch(() => null)
  // superjson envelope: Date/BigInt revival metadata rides in body.meta —
  // suites asserting on timestamps must read `raw`, not the unwrapped json.
  // `body?.json ?? body` is wrong here: an operation that legitimately
  // returns null still comes back as the envelope `{ json: null }`, which is
  // itself truthy, so `?? body` never falls through to it — every caller
  // would silently see the whole envelope object instead of null. Check the
  // envelope shape explicitly instead of relying on nullish-coalescing.
  const json = body && typeof body === 'object' && 'json' in body ? body.json : body
  return { status: res.status, json, raw: body }
}

const openSockets = new Set<Socket>()

/**
 * Resolves once the socket has actually connected (or rejects on
 * 'connect_error'), so callers never race a still-handshaking socket.
 *
 * IMPORTANT: an INVALID sessionId still connects successfully — hq's socket
 * middleware swallows auth errors and proceeds with `socket.data.user`
 * unset rather than rejecting the handshake. Suites must never assert auth
 * by expecting this to reject; check the resulting socket's authenticated
 * behavior (or `socket.data`) instead.
 */
export function connectSocket(token: string): Promise<Socket> {
  // No custom `path` needed: verified against the generated code on this
  // branch — hq/.wasp/out/sdk/wasp/client/webSocket/WebSocketProvider.tsx
  // calls `io(config.apiUrl, { transports: ['websocket'], autoConnect: true })`
  // with no `path` override, and the server side
  // (hq/.wasp/out/server/src/webSocket/initialization.ts) constructs
  // `new Server(server, { cors: {...} })`, also with no `path` override. Both
  // sides fall back to Socket.IO's default `/socket.io/` path, so the client
  // here needs none either.
  return new Promise((resolvePromise, reject) => {
    const socket = io(HQ_URL, { auth: { sessionId: token }, transports: ['websocket'] })
    openSockets.add(socket)
    socket.once('disconnect', () => openSockets.delete(socket))
    socket.once('connect', () => resolvePromise(socket))
    socket.once('connect_error', (err) => {
      openSockets.delete(socket)
      reject(err)
    })
  })
}

/** Closes every socket connectSocket() has opened — suite teardown hook. */
export function closeAllSockets(): void {
  for (const socket of openSockets) socket.close()
  openSockets.clear()
}

export async function until<T>(fn: () => Promise<T | null | undefined | false>, what: string, ms = 90_000): Promise<T> {
  const end = Date.now() + ms
  let lastError: unknown
  for (;;) {
    try {
      const v = await fn()
      if (v) return v as T
    } catch (err) {
      lastError = err
    }
    if (Date.now() > end) {
      const cause =
        lastError instanceof Error
          ? lastError.message
          : lastError !== undefined
            ? String(lastError)
            : '(no error — fn kept resolving falsy)'
      throw new Error(`timed out waiting for ${what}: ${cause}`)
    }
    await new Promise(r => setTimeout(r, 1500))
  }
}
