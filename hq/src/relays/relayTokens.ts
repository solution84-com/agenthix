/**
 * The one place hq signs a file ticket or a relay pass (adr-0153), with hq's own RS256 key (signingKeyService.ts),
 * whose public half sites and relays fetch from `HQ_JWKS_PATH`. Both are verified by core's `verifyRelayToken`.
 */
import { SignJWT } from 'jose'
import {
  HQ_TOKEN_ISSUER, FILE_TICKET_TOKEN_TYPE, FILE_TICKET_TTL_SECONDS, RELAY_PASS_TOKEN_TYPE, RELAY_PASS_TTL_SECONDS,
  isTicketPurpose, mayBeShownBeforeSignIn, readFileRef, type FileTicketInput,
} from '@agenthix/core'
import { getSigningKey, SIGNING_ALG } from '../server/identity/signingKeyService'

export type SignedRelayToken = { token: string; expiresAt: number }

export type { FileTicketInput }

async function sign(
  claims: Record<string, unknown>,
  audience: string,
  ttlSeconds: number,
  subject?: string,
): Promise<SignedRelayToken> {
  const { kid, key } = await getSigningKey()
  const now = Math.floor(Date.now() / 1000)
  const jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: SIGNING_ALG, kid })
    .setIssuer(HQ_TOKEN_ISSUER)
    .setAudience(audience)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
  if (subject) jwt.setSubject(subject)
  return { token: await jwt.sign(key), expiresAt: (now + ttlSeconds) * 1000 }
}

/**
 * A ticket for one file at one version, for one person, through `relay`: a site's file (its audience the site), or an
 * upload hq keeps (its audience hq's relay, which serves it). Only `fileTickets.ts` calls this, so that every ticket
 * that leaves hq is recorded.
 */
export async function signFileTicket(input: FileTicketInput): Promise<SignedRelayToken> {
  // The verifier refuses these anyway; hq refusing to sign them keeps a caller's mistake out of a browser's link.
  if (!isTicketPurpose(input.purpose)) throw new Error('A file ticket must name an accepted purpose.')
  const file = readFileRef(input)
  if (!file || file.space !== input.space) throw new Error('A file ticket must name one file in its space.')
  if (!input.relay || !input.version) throw new Error('A file ticket must name its relay and version.')
  const personless = input.person === null && file.space === 'upload' && mayBeShownBeforeSignIn(file.path)
  if (!personless && !input.person) throw new Error('A file ticket must name its person.')
  const { purpose, version, person, relay } = input
  const base = { tokenType: FILE_TICKET_TOKEN_TYPE, purpose, version, person, relay, ...file }
  if (input.space === 'upload') return sign(base, relay, FILE_TICKET_TTL_SECONDS)
  if (!input.site) throw new Error('A file ticket for a site\'s file must name its site.')
  return sign({ ...base, site: input.site }, input.site, FILE_TICKET_TTL_SECONDS)
}

/** A pass that lets `siteId` hold a line to `relayId`: subject the site, audience the relay. */
export async function signRelayPass(input: { siteId: string; relayId: string }): Promise<SignedRelayToken> {
  if (!input.siteId || !input.relayId) throw new Error('A relay pass must name its site and relay.')
  return sign({ tokenType: RELAY_PASS_TOKEN_TYPE }, input.relayId, RELAY_PASS_TTL_SECONDS, input.siteId)
}
