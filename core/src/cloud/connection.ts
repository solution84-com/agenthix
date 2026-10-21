/**
 * The connection protocol between an hq and Agenthix Cloud: the contract Cloud's server implements and hq is built
 * against. It is first-party: published with the code, so anyone can read what an hq says to Cloud, but no server or
 * client other than these two is supported on it. A change to it follows the compatibility rule every connection
 * follows (point 6). It is built from established standards rather than a scheme of its own:
 *
 * 1. **Device approval** — the OAuth 2.0 Device Authorization Grant (RFC 8628). hq asks for a connection at
 *    `CLOUD_CONNECT_DEVICE_PATH`, sending the public half of its Ed25519 key and its address, and is given a device
 *    code, a short user code and the page an organisation admin approves it on. hq polls `CLOUD_CONNECT_TOKEN_PATH`
 *    with the device code until the connection is approved, refused or expired.
 * 2. **Signed token requests** — JWT client authentication (RFC 7523 §2.2, OpenID Connect's `private_key_jwt`). Every
 *    request to the token, revocation and address endpoints carries a JWT hq signs with its private key, which never
 *    leaves hq. Once approved, hq gets short-lived access tokens this way; no long-lived secret is ever shipped in code
 *    or sent to hq.
 * 3. **Checking in** — while connected, hq signs for an access token at least every `CLOUD_CHECK_IN_INTERVAL_S`
 *    (55 minutes), whether or not it needs one, and once at start-up. Cloud reads each token request as hq being
 *    alive, so it can tell an hq that stopped (nothing for more than `CLOUD_CHECK_IN_MAX_GAP_S`) from one that is
 *    quiet; an hq Cloud disconnected learns it from that request's `invalid_client`. hq retries a check-in that found
 *    Cloud away within `CLOUD_CHECK_IN_RETRY_S`.
 * 4. **hq's address** — registered with the connection, and the only place Cloud sends a sign-in back to
 *    (./hqAddress.ts).
 * 5. **Disconnecting** — a signed request to `CLOUD_CONNECT_REVOKE_PATH` (in the manner of RFC 7009) revokes the key's
 *    registration. Cloud disconnecting from its side revokes it too, and hq learns of it from `invalid_client`.
 * 6. **The protocol's version** — every call hq makes carries `X-Cloud-Protocol-Version` (`CLOUD_PROTOCOL_VERSION`,
 *    1.0) and `User-Agent: hq/<release>`, and every answer carries Cloud's own. Two majors or more apart is refused
 *    with 426 by whichever side sees it first (./version.ts).
 *
 * Requests are `application/x-www-form-urlencoded`, as RFC 6749 has them; every answer is JSON. A refusal is the
 * RFC 6749 error shape, `{ error, error_description? }`, with status 400 (401 for `invalid_client`); the other
 * endpoints' answers and errors, and 429, are in ./answers.ts.
 *
 * The client's identifier is not issued by Cloud: it is the RFC 7638 thumbprint of hq's public key
 * (`cloudClientIdOf` in `@agenthix/core/cloud-crypto`), so both sides work it out from the key alone, and a new key is
 * a new client. Every connection is made outward from hq; nothing dials an hq.
 *
 * This module is types, constants and the checks each side runs on what the other sends. The signing and verifying
 * are in `@agenthix/core/cloud-crypto`, kept off the root entry like the host's.
 */
import { cloudHqAddressOf } from './hqAddress.js'

/** The one setting that says where Cloud is, in hq's, the Fleet Console's and the host service's environment. */
export const CLOUD_URL_SETTING = 'CLOUD_URL'
/** Where hq finds Cloud when `CLOUD_URL` is not set. */
export const DEFAULT_CLOUD_URL = 'https://cloud.agenthix.com'

/** Cloud's address as configured: `CLOUD_URL`, or Cloud's own address. Not yet checked: see `parseCloudBaseUrl`. */
export function configuredCloudUrl(env: Readonly<Record<string, string | undefined>>): string {
  return env[CLOUD_URL_SETTING]?.trim() || DEFAULT_CLOUD_URL
}

export const CLOUD_CONNECT_DEVICE_PATH = '/connect/device'
export const CLOUD_CONNECT_TOKEN_PATH = '/connect/token'
export const CLOUD_CONNECT_REVOKE_PATH = '/connect/revoke'

/** RFC 8628 §3.4: polling with the device code. */
export const DEVICE_CODE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'
/** RFC 6749 §4.4: an access token for the client itself, once the connection is approved. */
export const CLIENT_CREDENTIALS_GRANT_TYPE = 'client_credentials'
/** RFC 7523 §2.2: the client authenticates with a JWT it signed. */
export const JWT_BEARER_ASSERTION_TYPE = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'

/** The only signing algorithm: Ed25519, as JOSE names it (RFC 8037). */
export const CLOUD_ASSERTION_ALG = 'EdDSA'
/** The longest a client assertion may live; hq makes each for one request and signs it for a minute. */
export const CLOUD_ASSERTION_MAX_LIFETIME_S = 300
export const CLOUD_ASSERTION_LIFETIME_S = 60
/** How far apart the two clocks may be when an assertion's times are checked. */
export const CLOUD_ASSERTION_CLOCK_SKEW_S = 60

/** RFC 8628 §3.5: the poll interval when none is given, and what `slow_down` adds to it. */
export const DEVICE_POLL_DEFAULT_INTERVAL_S = 5
export const DEVICE_POLL_SLOW_DOWN_S = 5
const DEVICE_POLL_MAX_INTERVAL_S = 60
/** A connection request is approved within this, or it lapses. */
export const DEVICE_CODE_MAX_LIFETIME_S = 1800
/** An access token Cloud gives lives at most this long. */
export const CLOUD_ACCESS_TOKEN_MAX_LIFETIME_S = 3600

/** The check-in (point 3 above): how often hq signs for a token while connected, and the longest Cloud waits for one. */
export const CLOUD_CHECK_IN_INTERVAL_S = 55 * 60
export const CLOUD_CHECK_IN_RETRY_S = 5 * 60
export const CLOUD_CHECK_IN_MAX_GAP_S = 60 * 60

/**
 * The user code, as RFC 8628 §6.1 recommends it: eight letters from a set with no vowels (no words) and none easily
 * confused, shown as two groups of four, `WDJB-MJHT`. The admin checks that the code on Cloud's page is the one hq
 * shows before approving.
 */
export const USER_CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ'
export const USER_CODE = /^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$/

/** Opaque codes and tokens Cloud issues: base64url-ish, bounded. */
const OPAQUE = /^[A-Za-z0-9._~+/=-]{16,2048}$/
/** A base64url SHA-256 (43 characters), as a client id and a key thumbprint are. */
const THUMBPRINT = /^[A-Za-z0-9_-]{43}$/
/** An Ed25519 public key as it travels: 32 bytes, unpadded base64url. */
const ED25519_PUBLIC_KEY = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/
/** Cloud's id for an organisation, the one rule wherever it travels: the device approval, Cloud's operations, the console link. */
const ORGANISATION_ID = /^[A-Za-z0-9_-]{1,64}$/

/**
 * `POST /connect/device`. hq's half of a connection request: its public key, the address its people open it at, and
 * its organisation's name, which Cloud shows on the approval page so the admin knows which hq is asking.
 */
export type CloudDeviceRequest = {
  /** The Ed25519 public key, raw 32 bytes in unpadded base64url. */
  public_key: string
  /** Registered with the client on approval: where sign-ins come back to (`cloudHqAddressOf`'s form). */
  hq_address: string
  organisation_name: string
}

/** Cloud's answer (RFC 8628 §3.2). */
export type CloudDeviceAuthorization = {
  /** Secret to hq: it polls with it, and never shows it. */
  device_code: string
  /** What the admin checks, `WDJB-MJHT`. */
  user_code: string
  /** The page the admin approves on, on Cloud's own origin. */
  verification_uri: string
  /** The same page with the user code filled in. */
  verification_uri_complete: string
  expires_in: number
  interval: number
}

/**
 * `POST /connect/token` with `grant_type` set to `DEVICE_CODE_GRANT_TYPE`, `device_code`, and the client assertion
 * (`CloudClientAuthentication`) with the token endpoint's URL as its audience. Signing the poll proves the request
 * comes from the hq that holds the key, so nobody else can complete the connection with a device code they saw.
 */
export type CloudDevicePoll = CloudClientAuthentication & { grant_type: typeof DEVICE_CODE_GRANT_TYPE; device_code: string }

/** `POST /connect/token` with `grant_type` set to `client_credentials` and the client assertion: a fresh access token. */
export type CloudTokenRequest = CloudClientAuthentication & { grant_type: typeof CLIENT_CREDENTIALS_GRANT_TYPE }

/** `POST /connect/revoke` with the client assertion, its audience the revocation endpoint's URL. */
export type CloudRevokeRequest = CloudClientAuthentication

export type CloudClientAuthentication = {
  client_assertion_type: typeof JWT_BEARER_ASSERTION_TYPE
  /** A compact JWS (`CloudClientAssertionClaims`), signed with hq's Ed25519 key. */
  client_assertion: string
}

/**
 * The client assertion's claims (RFC 7523 §3). `iss` and `sub` are the client id; `aud` is the URL of the endpoint it
 * is sent to, exactly, so an assertion made for one endpoint is refused by another; `jti` is unique, and Cloud
 * refuses one it has seen while it could still be presented; `exp` is at most `CLOUD_ASSERTION_MAX_LIFETIME_S` after
 * `iat`. Its header is `{ alg: 'EdDSA', typ: 'JWT', kid: <client id> }`.
 */
export type CloudClientAssertionClaims = {
  iss: string
  sub: string
  aud: string
  jti: string
  iat: number
  exp: number
}

/** An access token (RFC 6749 §5.1). Short-lived; hq keeps it in memory only, and signs for another when it lapses. */
export type CloudAccessToken = {
  access_token: string
  token_type: 'Bearer'
  expires_in: number
}

/**
 * The answer to a poll once the admin approved: the first access token, the client id Cloud registered (which must be
 * the key's thumbprint), and the organisation on Cloud this hq is now connected to.
 */
export type CloudDeviceApproved = CloudAccessToken & {
  client_id: string
  cloud_organisation: { id: string; name: string }
}

/** RFC 8628 §3.5 and RFC 6749 §5.2: why a poll, a token request or a revocation was not answered with what it asked. */
export type CloudConnectErrorCode =
  | 'authorization_pending'
  | 'slow_down'
  | 'access_denied'
  | 'expired_token'
  | 'invalid_client'
  | 'invalid_grant'
  | 'invalid_request'
  | 'unsupported_grant_type'

export type CloudConnectError = { error: CloudConnectErrorCode; error_description?: string }

/**
 * `POST /connect/revoke`'s answer: also `revoked` when Cloud no longer holds the key, or never did, so it is safe to
 * repeat. An assertion that does not verify against a key Cloud still holds is `invalid_client`.
 */
export type CloudRevoked = { revoked: true }

/** What a poll comes to, as hq reads it. */
export type CloudDevicePollOutcome =
  | { kind: 'approved'; approved: CloudDeviceApproved }
  | { kind: 'pending' }
  | { kind: 'slowDown' }
  | { kind: 'refused' }
  | { kind: 'expired' }

const ERROR_CODES = new Set<string>([
  'authorization_pending', 'slow_down', 'access_denied', 'expired_token', 'invalid_client', 'invalid_grant',
  'invalid_request', 'unsupported_grant_type',
])

/**
 * The WHATWG URL, as Node and browsers provide it on `globalThis`. Core compiles without either's type library, so
 * the few members used here are typed by hand.
 */
export type CloudUrl = {
  readonly protocol: string
  readonly hostname: string
  readonly username: string
  readonly password: string
  readonly search: string
  readonly hash: string
  readonly pathname: string
  readonly origin: string
  toString(): string
}
const Url = (globalThis as unknown as { URL: new (input: string, base?: CloudUrl) => CloudUrl }).URL

function record(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function wholeSeconds(v: unknown, min: number, max: number): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null
}

function boundedText(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= max ? v : null
}

/**
 * Cloud's base URL as configured: https, or http only to this machine (for a stand-in in development). No path
 * beyond `/`, no query, no credentials. Null when it is none of these, so a typo never sends a key anywhere.
 */
export function parseCloudBaseUrl(text: string): CloudUrl | null {
  let url: CloudUrl
  try {
    url = new Url(text)
  } catch {
    return null
  }
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) return null
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) return null
  return url
}

/** The URL of one of Cloud's endpoints, which is also the audience of an assertion sent to it. */
export function cloudEndpoint(base: CloudUrl, path: string): string {
  return new Url(path, base).toString()
}

/** Cloud's side: a connection request, from the parsed form. Null when any part is missing or not valid. */
export function parseCloudDeviceRequest(form: Record<string, unknown>): CloudDeviceRequest | null {
  const key = form.public_key
  const address = cloudHqAddressOf(form.hq_address)
  const name = boundedText(form.organisation_name, 200)
  if (typeof key !== 'string' || !ED25519_PUBLIC_KEY.test(key) || !address || !name) return null
  return { public_key: key, hq_address: address, organisation_name: name }
}

/**
 * hq's side: Cloud's answer to a connection request. The approval page must be on Cloud's own origin, so a changed
 * answer cannot send the admin to approve somewhere else.
 */
export function parseCloudDeviceAuthorization(v: unknown, base: CloudUrl): CloudDeviceAuthorization | null {
  const d = record(v)
  if (!d) return null
  const expires = wholeSeconds(d.expires_in, 1, DEVICE_CODE_MAX_LIFETIME_S)
  const interval = d.interval === undefined ? DEVICE_POLL_DEFAULT_INTERVAL_S : wholeSeconds(d.interval, 1, DEVICE_POLL_MAX_INTERVAL_S)
  if (typeof d.device_code !== 'string' || !OPAQUE.test(d.device_code)) return null
  if (typeof d.user_code !== 'string' || !USER_CODE.test(d.user_code)) return null
  if (expires === null || interval === null) return null
  const page = onOrigin(d.verification_uri, base)
  const complete = onOrigin(d.verification_uri_complete, base)
  if (!page || !complete) return null
  return { device_code: d.device_code, user_code: d.user_code, verification_uri: page, verification_uri_complete: complete, expires_in: expires, interval }
}

function onOrigin(v: unknown, base: CloudUrl): string | null {
  if (typeof v !== 'string' || v.length > 2048) return null
  try {
    const url = new Url(v)
    return url.origin === base.origin && !url.username && !url.password ? url.toString() : null
  } catch {
    return null
  }
}

/** hq's side: an access token answer. */
export function parseCloudAccessToken(v: unknown): CloudAccessToken | null {
  const d = record(v)
  if (!d || typeof d.access_token !== 'string' || !OPAQUE.test(d.access_token)) return null
  if (typeof d.token_type !== 'string' || d.token_type.toLowerCase() !== 'bearer') return null
  const expires = wholeSeconds(d.expires_in, 1, CLOUD_ACCESS_TOKEN_MAX_LIFETIME_S)
  if (expires === null) return null
  return { access_token: d.access_token, token_type: 'Bearer', expires_in: expires }
}

/** hq's side: the answer to a poll once approved. The client id must be the one hq worked out from its key. */
export function parseCloudDeviceApproved(v: unknown, clientId: string): CloudDeviceApproved | null {
  const token = parseCloudAccessToken(v)
  const d = record(v)
  const org = record(d?.cloud_organisation)
  if (!token || !d || !org || d.client_id !== clientId) return null
  if (!isCloudOrganisationId(org.id)) return null
  const name = boundedText(org.name, 200)
  if (!name) return null
  return { ...token, client_id: clientId, cloud_organisation: { id: org.id, name } }
}

/** Either side: an RFC 6749 error answer. Null when it is not one. */
export function parseCloudConnectError(v: unknown): CloudConnectError | null {
  const d = record(v)
  if (!d || typeof d.error !== 'string' || !ERROR_CODES.has(d.error)) return null
  const description = typeof d.error_description === 'string' ? d.error_description.slice(0, 500) : undefined
  return { error: d.error as CloudConnectErrorCode, ...(description ? { error_description: description } : {}) }
}

/** hq's side: what a poll's answer comes to. Null when it is neither an approval nor an error the device flow names. */
export function readDevicePoll(status: number, body: unknown, clientId: string): CloudDevicePollOutcome | null {
  if (status === 200) {
    const approved = parseCloudDeviceApproved(body, clientId)
    return approved ? { kind: 'approved', approved } : null
  }
  const err = parseCloudConnectError(body)
  switch (err?.error) {
    case 'authorization_pending': return { kind: 'pending' }
    case 'slow_down': return { kind: 'slowDown' }
    case 'access_denied': return { kind: 'refused' }
    case 'expired_token': return { kind: 'expired' }
    default: return null
  }
}

/** Cloud's side: the client authentication on a token or revocation request. */
export function parseCloudClientAuthentication(form: Record<string, unknown>): CloudClientAuthentication | null {
  if (form.client_assertion_type !== JWT_BEARER_ASSERTION_TYPE) return null
  if (typeof form.client_assertion !== 'string' || form.client_assertion.length > 4096) return null
  return { client_assertion_type: JWT_BEARER_ASSERTION_TYPE, client_assertion: form.client_assertion }
}

export function isCloudClientId(v: unknown): v is string {
  return typeof v === 'string' && THUMBPRINT.test(v)
}

export function isCloudPublicKey(v: unknown): v is string {
  return typeof v === 'string' && ED25519_PUBLIC_KEY.test(v)
}

export function isCloudOrganisationId(v: unknown): v is string {
  return typeof v === 'string' && ORGANISATION_ID.test(v)
}
