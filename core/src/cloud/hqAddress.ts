/**
 * hq's address, as Cloud registers it with the connection: the only place Cloud may send a person's browser back to
 * after they sign in to that hq (./signIn.ts). The redirect URI is matched exactly against the one registered, never
 * against a pattern or what the request names (RFC 9700 §2.1, OAuth 2.0 Security Best Current Practice), so a sign-in
 * code and its `state` cannot be sent to an address someone else chose.
 *
 * Cloud registers the address with the client, and replaces it only from a request hq signed:
 *
 * 1. **Device approval**: `hq_address` in the connection request (`CloudDeviceRequest`), registered when the admin
 *    approves it.
 * 2. **Cloud connecting an hq it runs**: `hqAddress` in hq's answer to `organisation.key` (host/cloudOperations.ts),
 *    registered with the key.
 * 3. **A new address**: hq posts it to `CLOUD_CONNECT_ADDRESS_PATH`, form-encoded with a client assertion whose audience
 *    is that endpoint, as every request to the connection's endpoints is signed. hq does so at start-up and whenever its
 *    address is not the one it last registered; Cloud answers the address as it now holds it. Its refusals are those of
 *    the revocation endpoint: `invalid_client` (401) for a key Cloud no longer holds, `invalid_request` (400) for an
 *    address that is not one.
 *
 * Until an address is registered for a client, Cloud sends no sign-in back to it: its authorize page shows an error.
 */
import type { CloudClientAuthentication } from './connection.js'

export const CLOUD_CONNECT_ADDRESS_PATH = '/connect/address'

/** On hq: where Cloud sends the person's browser back to, under hq's address. */
export const CLOUD_SIGN_IN_CALLBACK_PATH = '/login/cloud'

const ADDRESS_MAX = 500

type WhatwgUrl = { protocol: string; username: string; password: string; search: string; hash: string; pathname: string; origin: string }
const Url = (globalThis as unknown as { URL: new (input: string) => WhatwgUrl }).URL

/** `POST /connect/address`: hq's address now, and the client assertion. */
export type CloudAddressRequest = CloudClientAuthentication & { hq_address: string }

/** Cloud's answer: the address it now sends sign-ins back to. */
export type CloudAddressRegistered = { hq_address: string }

/**
 * An address in the one form both sides compare: http or https, its origin and path with no trailing slash, and no
 * credentials, query or fragment. Null when it is not one.
 */
export function cloudHqAddressOf(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > ADDRESS_MAX) return null
  let url: WhatwgUrl
  try {
    url = new Url(v)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.username || url.password || url.search || url.hash || v.includes('?') || v.includes('#')) return null
  const address = `${url.origin}${url.pathname.replace(/\/+$/, '')}`
  return address.length <= ADDRESS_MAX ? address : null
}

/** The redirect URI for a registered address: the address with `CLOUD_SIGN_IN_CALLBACK_PATH`, which hq sends and Cloud expects. */
export function cloudSignInRedirectUri(hqAddress: string): string {
  return `${cloudHqAddressOf(hqAddress) ?? hqAddress.replace(/\/+$/, '')}${CLOUD_SIGN_IN_CALLBACK_PATH}`
}

/** Cloud's side: whether an authorize request's or a code exchange's `redirect_uri` is the client's registered one, exactly. */
export function isCloudRedirectUriFor(redirectUri: string, registeredHqAddress: string): boolean {
  const registered = cloudHqAddressOf(registeredHqAddress)
  return registered !== null && redirectUri === `${registered}${CLOUD_SIGN_IN_CALLBACK_PATH}`
}

/** Cloud's side: an address change, from the parsed form (its client authentication is checked separately). */
export function parseCloudAddressRequest(form: Record<string, unknown>): Omit<CloudAddressRequest, keyof CloudClientAuthentication> | null {
  const address = cloudHqAddressOf(form.hq_address)
  return address ? { hq_address: address } : null
}

/** hq's side: Cloud's answer to an address change. */
export function parseCloudAddressRegistered(v: unknown): CloudAddressRegistered | null {
  const d = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  const address = cloudHqAddressOf(d?.hq_address)
  return address ? { hq_address: address } : null
}
