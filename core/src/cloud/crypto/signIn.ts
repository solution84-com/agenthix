/**
 * The cryptography of signing in with an Agenthix account (../signIn.ts): the values one sign-in is bound by — PKCE's
 * verifier and challenge (RFC 7636, S256), `state` and `nonce` — and hq's checks on the ID token Cloud answers with.
 */
import { CLOUD_ASSERTION_CLOCK_SKEW_S } from '../connection.js'
import { isCloudFlowValue, isCloudSubject, type CloudIdTokenClaims } from '../signIn.js'
import { fromBase64url, fromUtf8, randomBytes, sha256, toBase64url, utf8 } from '../../host/crypto/webCrypto.js'

/** 32 random bytes, base64url: 43 characters, as RFC 7636 §4.1 recommends for a verifier. */
export function newCloudFlowValue(): string {
  return toBase64url(randomBytes(32))
}

export async function pkceChallengeOf(verifier: string): Promise<string> {
  return toBase64url(await sha256(utf8(verifier)))
}

/** The longest an ID token is accepted for after it was issued, whatever its `exp` says. */
const ID_TOKEN_MAX_AGE_S = 600

export type CloudIdTokenCheck =
  | { ok: true; subject: string }
  | { ok: false; reason: 'malformed' | 'wrong_issuer' | 'wrong_audience' | 'wrong_nonce' | 'expired' | 'not_yet_valid' }

function decodePart(part: string): Record<string, unknown> | null {
  const bytes = fromBase64url(part)
  if (!bytes) return null
  try {
    const v: unknown = JSON.parse(fromUtf8(bytes))
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function readClaims(c: Record<string, unknown>): CloudIdTokenClaims | null {
  const { iss, sub, aud, nonce, iat, exp } = c
  if (typeof iss !== 'string' || !isCloudSubject(sub) || typeof nonce !== 'string') return null
  if (typeof aud !== 'string' && !(Array.isArray(aud) && aud.every(a => typeof a === 'string'))) return null
  if (typeof iat !== 'number' || typeof exp !== 'number' || !Number.isInteger(iat) || !Number.isInteger(exp) || exp <= iat) return null
  return { iss, sub, aud, nonce, iat, exp }
}

/**
 * hq's checks on an ID token taken straight from Cloud's token endpoint (OpenID Connect Core §3.1.3.7): issued by
 * Cloud, for this hq alone (an `aud` listing anyone else is refused), carrying the nonce this sign-in sent, and
 * current. Its signature is not checked: TLS to the token endpoint, which hq authenticated to, stands in for it, as
 * §3.1.3.7 item 6 allows.
 */
export function checkCloudIdToken(
  idToken: string, expected: { issuer: string; clientId: string; nonce: string }, now: number = Date.now(),
): CloudIdTokenCheck {
  const parts = idToken.split('.')
  if (parts.length !== 3) return { ok: false, reason: 'malformed' }
  const header = decodePart(parts[0])
  const raw = decodePart(parts[1])
  if (!header || header.alg === 'none' || !raw) return { ok: false, reason: 'malformed' }
  const claims = readClaims(raw)
  if (!claims) return { ok: false, reason: 'malformed' }
  if (claims.iss !== expected.issuer) return { ok: false, reason: 'wrong_issuer' }
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (audience.length !== 1 || audience[0] !== expected.clientId) return { ok: false, reason: 'wrong_audience' }
  if (raw.azp !== undefined && raw.azp !== expected.clientId) return { ok: false, reason: 'wrong_audience' }
  if (!isCloudFlowValue(expected.nonce) || claims.nonce !== expected.nonce) return { ok: false, reason: 'wrong_nonce' }
  const seconds = Math.floor(now / 1000)
  if (claims.exp + CLOUD_ASSERTION_CLOCK_SKEW_S <= seconds) return { ok: false, reason: 'expired' }
  if (claims.iat + ID_TOKEN_MAX_AGE_S + CLOUD_ASSERTION_CLOCK_SKEW_S <= seconds) return { ok: false, reason: 'expired' }
  if (claims.iat - CLOUD_ASSERTION_CLOCK_SKEW_S > seconds) return { ok: false, reason: 'not_yet_valid' }
  return { ok: true, subject: claims.sub }
}
