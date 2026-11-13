import { getSessionId } from 'wasp/client/api'

/**
 * The browser's side of signing in with an Agenthix account (src/cloud/cloudSignIn.ts). hq answers a start with
 * where to go and a binding for this tab; the binding is kept in this tab's session storage under the sign-in's
 * `state`, and handed back on return, so a sign-in finishes only in the tab that began it.
 */

export type CloudPurpose = 'signIn' | 'link'

const KEY = (state: string) => `cloud_sign_in:${state}`

type Kept = { binding: string; purpose: CloudPurpose }

/**
 * `withSession`: only for what is the signed-in person's own (linking, the link). Signing in sends none, since a
 * session this browser kept that has since ended would make hq refuse the request outright.
 */
async function call(method: 'GET' | 'POST', url: string, body?: unknown, withSession = true): Promise<{ status: number; data: Record<string, unknown> }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const session = withSession ? getSessionId() : null
  if (session) headers.Authorization = `Bearer ${session}`
  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data: data as Record<string, unknown> }
}

const SOMETHING_WRONG = 'Something went wrong. Try again.'

/**
 * Whether signing in with Cloud works: this hq is connected. False when hq cannot be asked; null when hq offers no
 * Agenthix Cloud at all (its flag is off, adr-0189: hq answers 404), so nothing about it is shown.
 */
export async function readCloudSignInConnected(): Promise<boolean | null> {
  try {
    const { status, data } = await call('GET', '/api/auth/cloud/status', undefined, false)
    if (status === 404) return null
    return status === 200 && data.connected === true
  } catch {
    return false
  }
}

/** Starts a sign-in or a link and leaves for Cloud; the words of a refusal when hq would not start one. */
export async function startCloudSignIn(purpose: CloudPurpose, password?: string, go: (url: string) => void = url => window.location.assign(url)): Promise<string | null> {
  try {
    const { status, data } = await call('POST', '/api/auth/cloud/start', { purpose, password }, purpose === 'link')
    if (status !== 200 || typeof data.authorizeUrl !== 'string' || typeof data.binding !== 'string') return String(data.error ?? SOMETHING_WRONG)
    const state = new URL(data.authorizeUrl).searchParams.get('state')
    if (!state) return SOMETHING_WRONG
    try {
      sessionStorage.setItem(KEY(state), JSON.stringify({ binding: data.binding, purpose } satisfies Kept))
    } catch {
      return 'This browser does not let HQ keep the sign-in while you are away. Allow site data, then try again.'
    }
    go(data.authorizeUrl)
    return null
  } catch {
    return SOMETHING_WRONG
  }
}

export type CloudReturn =
  | { ok: true; outcome: { kind: 'signedIn'; sessionId: string } | { kind: 'linked' } }
  | { ok: false; error: string; purpose: CloudPurpose }
  /** hq offers no Agenthix Cloud (its flag is off): there is nothing to finish. */
  | { ok: false; notOffered: true; purpose: CloudPurpose }

/** The browser is back from Cloud with these query parameters. */
export async function finishCloudSignIn(query: URLSearchParams): Promise<CloudReturn> {
  const state = query.get('state') ?? ''
  let kept: Kept | null = null
  try {
    kept = JSON.parse(sessionStorage.getItem(KEY(state)) ?? 'null') as Kept | null
    sessionStorage.removeItem(KEY(state))
  } catch { /* nothing kept: refused below */ }
  const purpose = kept?.purpose ?? 'signIn'
  try {
    const { status, data } = await call('POST', '/api/auth/cloud/finish', {
      state, binding: kept?.binding ?? '', code: query.get('code') ?? undefined, error: query.get('error') ?? undefined,
    }, purpose === 'link')
    if (status === 200 && data.kind === 'signedIn' && typeof data.sessionId === 'string') return { ok: true, outcome: { kind: 'signedIn', sessionId: data.sessionId } }
    if (status === 200 && data.kind === 'linked') return { ok: true, outcome: { kind: 'linked' } }
    if (status === 404) return { ok: false, notOffered: true, purpose }
    return { ok: false, error: String(data.error ?? SOMETHING_WRONG), purpose }
  } catch {
    return { ok: false, error: SOMETHING_WRONG, purpose }
  }
}

export type OwnCloudLink = { connected: boolean; linked: { linkedAt: string } | null }

export async function readOwnCloudLink(): Promise<OwnCloudLink | null> {
  try {
    const { status, data } = await call('GET', '/api/auth/cloud/link')
    return status === 200 ? (data as unknown as OwnCloudLink) : null
  } catch {
    return null
  }
}

export async function unlinkOwnCloudAccount(): Promise<boolean> {
  try {
    return (await call('POST', '/api/auth/cloud/unlink')).status === 200
  } catch {
    return false
  }
}
