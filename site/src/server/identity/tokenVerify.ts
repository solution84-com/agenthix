/**
 * Local verification of hq-issued JWTs (spec §2) — the site side of the trust
 * bridge. Pure: takes any jose key set, so tests use a local one and production
 * uses the cached remote JWKS from verifyHqToken.ts.
 *
 * Pins algorithm, issuer and expiry, and optionally the token type: identity and
 * capability tokens share an issuer, a key and a subject, so `tokenType` is the
 * only thing separating them. This is the network boundary — verify strictly.
 */
import { jwtVerify, type JWTPayload, type createLocalJWKSet, type createRemoteJWKSet } from 'jose'
import { HQ_TOKEN_ISSUER } from '@agenthix/core'

type KeySet = ReturnType<typeof createLocalJWKSet> | ReturnType<typeof createRemoteJWKSet>

const HQ_TOKEN_ALG = 'RS256'

export async function verifyWithKeySet(
  token: string,
  keySet: KeySet,
  expectedType?: 'identity' | 'capability',
  expectedAudience?: string,
): Promise<JWTPayload & Record<string, unknown>> {
  const { payload } = await jwtVerify(token, keySet, {
    issuer: HQ_TOKEN_ISSUER,
    algorithms: [HQ_TOKEN_ALG],
    ...(expectedAudience ? { audience: expectedAudience } : {}),
  })
  if (expectedType && payload.tokenType !== expectedType) {
    throw new Error(`Expected a ${expectedType} token, got ${String(payload.tokenType)}`)
  }
  return payload
}
