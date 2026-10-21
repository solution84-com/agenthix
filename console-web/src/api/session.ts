/** Signing in and out, and what the sign-in page needs before anyone has (console/src/http/routes/session.ts). */
import { api, ApiError } from './client'
import { csrfToken, forgetCsrfToken, keepCsrfToken } from './csrf'
import { askOpenTabs, tellTabsSignedOut } from './tokenShare'

/** The Fleet Console's connection to HQ (console/src/hq/link.ts). */
export type HqLinkState = 'connecting' | 'connected' | 'disconnected' | 'refused' | 'versionMismatch'

export type ConsoleStatus = {
  machineName: string
  version: string
  hq: HqLinkState
  /** Whether any HQ account holds the role; unknown while HQ does not answer. */
  fleetAdmins: 'some' | 'none' | 'unknown'
}

export type SessionUser = { id: string; name: string }

/** A holder of the role, as HQ lists them (`FleetAdminAccount` in core); `since` is null when HQ does not say. */
export type FleetAdmin = { id: string; name: string; username: string; organisationAdmin: boolean; since: string | null }

/** The signed-in person's HQ account. */
export type Account = { username: string; organisationAdmin: boolean; since: string | null }

/** The organisation's name and the address people open HQ at; either is null when HQ did not give it. */
export type HqFacts = { organisationName: string | null; address: string | null }

export type SessionDetails = { account: Account | null; hq: HqFacts | null }

export function getStatus(): Promise<ConsoleStatus> {
  return api<ConsoleStatus>('/status')
}

/** `second` is the authenticator code or a recovery code, asked for only through remote access. */
export async function signIn(username: string, password: string, second: { code: string } | { recoveryCode: string } | null = null): Promise<SessionUser> {
  const { user, csrfToken: token } = await api<{ user: SessionUser; csrfToken: string }>('/session', {
    method: 'POST', body: { username, password, ...second }, signedOutOn401: false,
  })
  keepCsrfToken(token)
  return user
}

/**
 * The person signed in on this tab, or null. A new tab asks an open one for the token (tokenShare.ts); without it the
 * cookie opens nothing, so the server is asked nothing.
 */
export async function currentSession(): Promise<SessionUser | null> {
  if (!csrfToken()) {
    const token = await askOpenTabs()
    if (!token) return null
    keepCsrfToken(token)
  }
  try {
    const { user } = await api<{ user: SessionUser }>('/session')
    return user
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null
    throw err
  }
}

/** What HQ says of the signed-in person and of itself; null for each while HQ does not answer. */
export async function sessionDetails(): Promise<SessionDetails> {
  const { account, hq } = await api<{ account?: Account | null; hq?: HqFacts | null }>('/session')
  return { account: account ?? null, hq: hq ?? null }
}

export async function signOut(): Promise<void> {
  try {
    await api<void>('/session', { method: 'DELETE', signedOutOn401: false })
  } finally {
    forgetCsrfToken()
    tellTabsSignedOut()
  }
}

export async function fleetAdmins(): Promise<FleetAdmin[]> {
  const { admins } = await api<{ admins: FleetAdmin[] }>('/fleet-admins')
  return admins
}
