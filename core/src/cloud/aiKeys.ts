/**
 * C8, the key rollover (part 6; ADR-0134 as amended): hq's Ed25519 identity key is replaced automatically every
 * `CLOUD_KEY_ROLLOVER_DAYS`, or at once when an admin asks, with no person approving it at Cloud.
 *
 * 1. hq makes the new key and stores it, marked pending, **before** it asks Cloud, so a crash leaves either a pending
 *    key to register again, or nothing changed.
 * 2. `POST /connect/keys`, form-encoded like the other `/connect/*` endpoints (`CloudKeyRegistration`): hq's usual
 *    client assertion, signed with the current key, its audience this endpoint; the new public key; and a proof that
 *    hq holds the new key, a JWT of at most a minute signed with it (`CloudKeyProofClaims`). Registering the same key
 *    again is answered as done, so an answer lost on the way is safe to ask again.
 * 3. From Cloud's answer (`CloudKeyRegistered`) hq signs with the new key. Every assertion names its key in the JWT
 *    header's `kid`, the RFC 7638 thumbprint of that key; `iss` and `sub` stay the client id, which is the thumbprint
 *    of the connection's first key for the life of the connection.
 * 4. Cloud accepts the old key until `old_key_retires_at` (24 hours), or not at all after `retire_old_now=true`, asked
 *    after a suspected leak; hq then destroys the old private key.
 *
 * Cloud away: the old key stays, and hq tries again at its next check-in. A key never expires by itself.
 * `invalid_client` during a rollover is a disconnection (X3). Connecting again still makes a new key and a new
 * client id, as today.
 */
import { isCloudClientId, isCloudPublicKey, JWT_BEARER_ASSERTION_TYPE, type CloudClientAuthentication } from './connection.js'

export const CLOUD_CONNECT_KEYS_PATH = '/connect/keys'

export const CLOUD_KEY_ROLLOVER_DAYS = 90
/** How long Cloud accepts the old key once the new one is registered, unless asked to retire it at once. */
export const CLOUD_OLD_KEY_OVERLAP_S = 24 * 60 * 60
/** The longest a proof may live; hq signs each for one request. */
export const CLOUD_KEY_PROOF_MAX_LIFETIME_S = 60

/** `POST /connect/keys`'s form. */
export type CloudKeyRegistration = CloudClientAuthentication & {
  /** The new Ed25519 public key, raw 32 bytes in unpadded base64url, as `CloudDeviceRequest.public_key`. */
  public_key: string
  /** A compact JWS (`CloudKeyProofClaims`) signed with the new key, its header's `kid` the new key's thumbprint. */
  proof: string
  /** `'true'` after a suspected leak: the old key stops at once. Absent otherwise. */
  retire_old_now?: 'true'
}

/** The proof's claims: `iss` and `sub` are the client id, `aud` this endpoint's URL, `jti` fresh. */
export type CloudKeyProofClaims = { iss: string; sub: string; aud: string; jti: string; iat: number; exp: number }

/** Cloud's answer: the new key's `kid`, and until when the old one is still accepted (ISO; now, with `retire_old_now`). */
export type CloudKeyRegistered = { kid: string; old_key_retires_at: string }

/** Cloud's side: the form of a key registration. Null when any part is missing or not its shape. */
export function parseCloudKeyRegistration(form: Record<string, unknown>): CloudKeyRegistration | null {
  if (form.client_assertion_type !== JWT_BEARER_ASSERTION_TYPE) return null
  if (typeof form.client_assertion !== 'string' || form.client_assertion.length > 4096) return null
  if (!isCloudPublicKey(form.public_key)) return null
  if (typeof form.proof !== 'string' || form.proof.length > 4096) return null
  if (form.retire_old_now !== undefined && form.retire_old_now !== 'true') return null
  return {
    client_assertion_type: JWT_BEARER_ASSERTION_TYPE,
    client_assertion: form.client_assertion,
    public_key: form.public_key,
    proof: form.proof,
    ...(form.retire_old_now === 'true' ? { retire_old_now: 'true' as const } : {}),
  }
}

/** hq's side: Cloud's answer. The `kid` must be the thumbprint hq worked out for the new key. */
export function parseCloudKeyRegistered(v: unknown, expectedKid: string): CloudKeyRegistered | null {
  const d = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  if (!d || !isCloudClientId(d.kid) || d.kid !== expectedKid) return null
  const at = d.old_key_retires_at
  if (typeof at !== 'string' || at.length > 40 || Number.isNaN(Date.parse(at))) return null
  return { kid: d.kid, old_key_retires_at: new Date(at).toISOString() }
}
