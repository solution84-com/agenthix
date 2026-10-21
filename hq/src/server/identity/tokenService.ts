/**
 * Mints and verifies hq-signed JWTs (spec §2/§2a). Identity and capability are
 * sibling tokens, deliberately not merged — different lifetimes and mint triggers.
 * Verification here is against hq's own stored public key (used by the renewal
 * endpoint and by the in-process runtime until the execution-runtime extraction moves it to site).
 */
import { SignJWT, jwtVerify, createLocalJWKSet, type JWTPayload } from 'jose'
import {
  HQ_TOKEN_ISSUER, IDENTITY_TOKEN_TTL_SECONDS, CAPABILITY_TTL_SECONDS,
  type CapabilityClaims, type IdentityTokenClaims,
} from '@agenthix/core'
import { getSigningKey, getPublicJwks, SIGNING_ALG } from './signingKeyService'

async function sign(payload: Record<string, unknown>, subject: string, audience: string, ttlSeconds: number) {
  const { kid, key } = await getSigningKey()
  const now = Math.floor(Date.now() / 1000)
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: SIGNING_ALG, kid })
    .setSubject(subject)
    .setIssuer(HQ_TOKEN_ISSUER)
    .setAudience(audience)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(key)
  return { token, expiresAt: (now + ttlSeconds) * 1000 }
}

export async function mintIdentityToken(input: { userId: string; role: IdentityTokenClaims['role']; orgId: string | null; siteId: string }) {
  return sign({ tokenType: 'identity', role: input.role, orgId: input.orgId }, input.userId, input.siteId, IDENTITY_TOKEN_TTL_SECONDS)
}

export async function signCapability(claims: Omit<CapabilityClaims, 'tokenType'>) {
  return sign({ ...claims, tokenType: 'capability' }, claims.userId, claims.siteId, CAPABILITY_TTL_SECONDS)
}

/**
 * Verify signature, algorithm, issuer, and expiry against hq's own public key.
 * `expectedType` guards against cross-use: identity and capability tokens share
 * an issuer, a key and a subject, so the only thing separating them is this claim.
 * `expectedAudience`, when given, pins the token to the Execution Site it was
 * minted for — a token minted for one site must not verify against another.
 * Throws on any failure.
 */
export async function verifyHqToken(
  token: string,
  expectedType?: 'identity' | 'capability',
  expectedAudience?: string,
): Promise<JWTPayload & Record<string, unknown>> {
  const jwks = createLocalJWKSet(await getPublicJwks())
  const { payload } = await jwtVerify(token, jwks, {
    issuer: HQ_TOKEN_ISSUER,
    algorithms: [SIGNING_ALG],
    ...(expectedAudience ? { audience: expectedAudience } : {}),
  })
  if (expectedType && payload.tokenType !== expectedType) {
    throw new Error(`Expected a ${expectedType} token, got ${String(payload.tokenType)}`)
  }
  return payload
}
