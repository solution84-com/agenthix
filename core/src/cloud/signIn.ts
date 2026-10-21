/**
 * Signing in to an hq with an Agenthix account, and asking Cloud to email an hq's members before planned downtime:
 * what the connection (./connection.ts) carries once it is made. Built from established standards:
 *
 * 1. **Sign-in is OpenID Connect**, the authorization code flow with PKCE (RFC 7636, `S256`), hq being the client the
 *    connection registered. hq sends the person's browser to `CLOUD_AUTHORIZE_PATH` with `state` and `nonce`; Cloud
 *    sends it back with a code to the redirect URI, which must be `cloudSignInRedirectUri` of the address registered
 *    for that client, exactly (./hqAddress.ts), or Cloud shows an error page and sends nothing back. hq exchanges the
 *    code at `CLOUD_CONNECT_TOKEN_PATH` with the same redirect URI, its code verifier and a client assertion
 *    (RFC 7523), as every request to the token endpoint is signed.
 *    The answer carries an ID token whose `sub` names the person's Agenthix account.
 * 2. **hq asks only for `openid`**: the account's subject and nothing else. No claim lists the other organisations the
 *    person belongs to, and hq would refuse to read one.
 * 3. **The ID token comes straight from the token endpoint** over TLS, to an authenticated client, so hq checks its
 *    issuer, audience, nonce and times and relies on TLS for where it came from (OpenID Connect Core §3.1.3.7, 6).
 * 4. **Downtime email**: hq posts `CloudDowntimeNotice` as JSON to `CLOUD_DOWNTIME_NOTICE_PATH` with a bearer access
 *    token it signed for (`client_credentials`), and Cloud answers `CloudDowntimeAccepted` (./answers.ts has its
 *    errors). Cloud emails the named accounts the day before the change, in words for its `kind`. Posting the same
 *    `notice_id` again replaces the last; `withdrawn` cancels it. hq keeps no email service of its own.
 *
 * The endpoints are fixed paths on Cloud's base URL, as the connection's are; the issuer is Cloud's origin.
 */
import { cloudEndpoint, type CloudAccessToken, type CloudClientAuthentication, type CloudUrl } from './connection.js'
import { SCHEDULED_CHANGE_KINDS, type ScheduledChangeKind } from '../host/scheduledChange.js'

export const CLOUD_AUTHORIZE_PATH = '/connect/authorize'
export const CLOUD_DOWNTIME_NOTICE_PATH = '/connect/notices/downtime'

/** RFC 6749 §4.1.3. */
export const AUTHORIZATION_CODE_GRANT_TYPE = 'authorization_code'
/** The only scope hq asks for: the subject, and nothing that names another organisation. */
export const CLOUD_SIGN_IN_SCOPE = 'openid'
export const PKCE_METHOD = 'S256'
/** How long a person has between leaving hq for Cloud and coming back. */
export const CLOUD_SIGN_IN_MAX_WAIT_S = 600

/** `state`, `nonce` and a PKCE verifier: 43 to 128 unreserved characters (RFC 7636 §4.1). */
const FLOW_VALUE = /^[A-Za-z0-9._~-]{43,128}$/
const CODE = /^[A-Za-z0-9._~+/=-]{16,2048}$/
const SUBJECT_MAX = 255

/** The query hq sends the browser to `CLOUD_AUTHORIZE_PATH` with (OpenID Connect Core §3.1.2.1, RFC 7636 §4.3). */
export type CloudAuthorizeRequest = {
  response_type: 'code'
  client_id: string
  redirect_uri: string
  scope: typeof CLOUD_SIGN_IN_SCOPE
  state: string
  nonce: string
  code_challenge: string
  code_challenge_method: typeof PKCE_METHOD
}

/** `POST /connect/token`, exchanging the code. */
export type CloudAuthorizationCodeRequest = CloudClientAuthentication & {
  grant_type: typeof AUTHORIZATION_CODE_GRANT_TYPE
  code: string
  redirect_uri: string
  code_verifier: string
}

export type CloudIdTokenAnswer = CloudAccessToken & { id_token: string }

/**
 * The ID token's claims hq reads (OpenID Connect Core §2). `aud` is hq's client id; `nonce` is the one hq sent.
 * Anything else in it is ignored.
 */
export type CloudIdTokenClaims = { iss: string; sub: string; aud: string | string[]; nonce: string; iat: number; exp: number }

export type CloudDowntimeNotice = {
  /** hq's own id for the change: posting it again replaces the last notice. */
  notice_id: string
  /** Which scheduled change: the host service's closed list, one email's words for each. */
  kind: ScheduledChangeKind
  /** When the change starts, ISO 8601. */
  at: string
  expected_minutes: number | null
  /** Whether it stops all of hq or one site's work. */
  affects: 'hq' | 'site'
  /** The Agenthix accounts (`sub`) of the members it affects who linked one; Cloud emails these and no one else. */
  recipients: string[]
  /** True when the change was called off: Cloud sends nothing for it. */
  withdrawn: boolean
}

export const CLOUD_DOWNTIME_MAX_RECIPIENTS = 10_000

function record(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

export function isCloudFlowValue(v: unknown): v is string {
  return typeof v === 'string' && FLOW_VALUE.test(v)
}

export function isCloudSubject(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= SUBJECT_MAX && !/[\s\u0000-\u001f]/.test(v)
}

export function isCloudAuthorizationCode(v: unknown): v is string {
  return typeof v === 'string' && CODE.test(v)
}

/** Cloud's issuer identifier: its origin, as the ID token's `iss` must name it exactly. */
export function cloudIssuer(base: CloudUrl): string {
  return base.origin
}

/** The address hq sends the person's browser to. */
export function cloudAuthorizeUrl(base: CloudUrl, request: Omit<CloudAuthorizeRequest, 'response_type' | 'scope' | 'code_challenge_method'>): string {
  const full: CloudAuthorizeRequest = { response_type: 'code', scope: CLOUD_SIGN_IN_SCOPE, code_challenge_method: PKCE_METHOD, ...request }
  const query = Object.entries(full).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
  return `${cloudEndpoint(base, CLOUD_AUTHORIZE_PATH)}?${query}`
}

/** Cloud's side: an authorize request, from its query. Null when it is not one hq would send. */
export function parseCloudAuthorizeRequest(query: Record<string, unknown>): CloudAuthorizeRequest | null {
  const q = query
  if (q.response_type !== 'code' || q.scope !== CLOUD_SIGN_IN_SCOPE || q.code_challenge_method !== PKCE_METHOD) return null
  if (typeof q.client_id !== 'string' || typeof q.redirect_uri !== 'string' || q.redirect_uri.length > 2048) return null
  if (!isCloudFlowValue(q.state) || !isCloudFlowValue(q.nonce) || typeof q.code_challenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(q.code_challenge)) return null
  return {
    response_type: 'code', client_id: q.client_id, redirect_uri: q.redirect_uri, scope: CLOUD_SIGN_IN_SCOPE,
    state: q.state, nonce: q.nonce, code_challenge: q.code_challenge, code_challenge_method: PKCE_METHOD,
  }
}

/** Cloud's side: the code exchange, from the parsed form (its client authentication is checked separately). */
export function parseCloudAuthorizationCodeRequest(form: Record<string, unknown>): Omit<CloudAuthorizationCodeRequest, keyof CloudClientAuthentication> | null {
  if (form.grant_type !== AUTHORIZATION_CODE_GRANT_TYPE || !isCloudAuthorizationCode(form.code)) return null
  if (typeof form.redirect_uri !== 'string' || form.redirect_uri.length > 2048 || !isCloudFlowValue(form.code_verifier)) return null
  return { grant_type: AUTHORIZATION_CODE_GRANT_TYPE, code: form.code, redirect_uri: form.redirect_uri, code_verifier: form.code_verifier }
}

/** hq's side: the token endpoint's answer to a code exchange. Only the ID token is used; the access token is dropped. */
export function parseCloudIdTokenAnswer(v: unknown): { id_token: string } | null {
  const d = record(v)
  if (!d || typeof d.id_token !== 'string' || d.id_token.length > 8192 || d.id_token.split('.').length !== 3) return null
  return { id_token: d.id_token }
}

/** Cloud's side: a downtime notice, from the JSON body. Null when any part is missing or not valid. */
export function parseCloudDowntimeNotice(v: unknown): CloudDowntimeNotice | null {
  const d = record(v)
  if (!d) return null
  const { notice_id: id, kind, at, expected_minutes: minutes, affects, recipients, withdrawn } = d
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null
  const known = SCHEDULED_CHANGE_KINDS.find(k => k === kind)
  if (!known) return null
  if (typeof at !== 'string' || at.length > 40 || Number.isNaN(Date.parse(at))) return null
  if (minutes !== null && !(typeof minutes === 'number' && Number.isInteger(minutes) && minutes >= 0 && minutes <= 10_080)) return null
  if (affects !== 'hq' && affects !== 'site') return null
  if (!Array.isArray(recipients) || recipients.length > CLOUD_DOWNTIME_MAX_RECIPIENTS || !recipients.every(isCloudSubject)) return null
  if (typeof withdrawn !== 'boolean') return null
  return { notice_id: id, kind: known, at, expected_minutes: minutes, affects, recipients: [...recipients], withdrawn }
}
