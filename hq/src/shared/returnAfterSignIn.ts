/**
 * Where to go once a person has signed in: the address they first opened
 * (getting-in spec, Signing in), and a preview's access check (adr-0071).
 * Wasp's sign-in always lands on `/`, so the app shell remembers the page that
 * sent them to sign in and takes them back to it afterwards
 * (useReturnAfterSignIn.ts).
 *
 * Only a path on hq's own origin is ever kept or returned: anything that could
 * leave hq — another scheme, `//host`, a backslash a browser reads as a slash
 * — is dropped, so this can never become an open redirect. Kept per tab, for a
 * few minutes, and read once.
 */
const KEY = 'agenthix:return-after-sign-in'
const TTL_MS = 10 * 60 * 1000

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** The same path, when it stays on hq's own origin; otherwise null. */
export function safeReturnPath(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//')) return null
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return null
  const base = 'http://hq.invalid'
  let url: URL
  try {
    url = new URL(raw, base)
  } catch {
    return null
  }
  if (url.origin !== base) return null
  return `${url.pathname}${url.search}${url.hash}`
}

export function rememberReturnPath(path: string, store: Store, now = Date.now()): void {
  const safe = safeReturnPath(path)
  if (!safe) return
  try {
    store.setItem(KEY, JSON.stringify({ path: safe, at: now }))
  } catch {
    // Storage refused (private mode, quota): the person lands on `/` as before.
  }
}

export function takeReturnPath(store: Store, now = Date.now()): string | null {
  let raw: string | null
  try {
    raw = store.getItem(KEY)
    store.removeItem(KEY)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const { path, at } = JSON.parse(raw) as { path?: unknown; at?: unknown }
    if (typeof at !== 'number' || now - at > TTL_MS || now < at) return null
    return safeReturnPath(path)
  } catch {
    return null
  }
}

/** The ways in, which are never a page to come back to. */
const WAYS_IN = ['/login', '/invite', '/reset-password']

export function isWayIn(pathname: string): boolean {
  return WAYS_IN.some(p => pathname === p || pathname.startsWith(`${p}/`))
}
