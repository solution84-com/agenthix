/**
 * The one place hq signs a file ticket, an app ticket, a bundle ticket or a relay pass (adr-0153, adr-0169), with hq's
 * own RS256 key (signingKeyService.ts), whose public half sites and relays fetch from `HQ_JWKS_PATH`. Each is verified
 * by core's `verifyRelayToken`.
 */
import { randomBytes } from 'node:crypto'
import { SignJWT } from 'jose'
import {
  APP_TICKET_ENTRY_SECONDS, APP_TICKET_TOKEN_TYPE, APP_TICKET_TTL_SECONDS, BUNDLE_TICKET_TOKEN_TYPE, BUNDLE_TICKET_TTL_SECONDS,
  isAppId, type AppTicketInput, type BundleTicketInput,
  HQ_TOKEN_ISSUER, FILE_TICKET_TOKEN_TYPE, FILE_TICKET_TTL_SECONDS, RELAY_PASS_TOKEN_TYPE, RELAY_PASS_TTL_SECONDS,
  isTicketPurpose, mayBeShownBeforeSignIn, readFileRef, type FileTicketInput,
} from '@agenthix/core'
import { getSigningKey, SIGNING_ALG } from '../server/identity/signingKeyService'

export type SignedRelayToken = { token: string; expiresAt: number }

export type { FileTicketInput }

async function sign(
  claims: Record<string, unknown> | ((now: number) => Record<string, unknown>),
  audience: string,
  ttlSeconds: number,
  subject?: string,
): Promise<SignedRelayToken> {
  const { kid, key } = await getSigningKey()
  const now = Math.floor(Date.now() / 1000)
  if (typeof claims === 'function') claims = claims(now)
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

export type SignedAppTicket = SignedRelayToken & { jti: string; enterBy: number }

/**
 * An app ticket (core's relay/appTickets.ts): one app, one person, one live preview, one relay, for 15 minutes, entered
 * within 60 seconds; its audience the site serving the app. Only `appTickets.ts` calls this, so every one is in hq's book.
 */
export async function signAppTicket(input: Omit<AppTicketInput, 'enterBy'>): Promise<SignedAppTicket> {
  for (const k of ['site', 'relay', 'person', 'livePreviewId', 'workspaceId', 'siteTicket'] as const) {
    if (!input[k]) throw new Error(`An app ticket must name its ${k}.`)
  }
  if (!isAppId(input.appId)) throw new Error("An app ticket must name an app's id.")
  if (input.entry !== 'renew' && input.entry !== input.cookie) throw new Error("An app ticket's entry and cookie must agree.")
  const jti = randomBytes(24).toString('base64url')
  let enterBy = 0
  const signed = await sign(now => {
    enterBy = now + APP_TICKET_ENTRY_SECONDS
    return { ...input, tokenType: APP_TICKET_TOKEN_TYPE, jti, enterBy }
  }, input.site, APP_TICKET_TTL_SECONDS)
  return { ...signed, jti, enterBy }
}

/**
 * A bundle ticket (core's relay/appTickets.ts): one Git bundle, at its SHA-256 and size, from one site to another,
 * through `relay` (its audience). Its `jti`, 144 random bits, is how each end takes it once and how hq knows the transfer.
 */
export async function signBundleTicket(input: BundleTicketInput): Promise<SignedRelayToken & { jti: string }> {
  for (const k of ['relay', 'person', 'bundleId', 'workspaceId', 'branch'] as const) {
    if (!input[k]) throw new Error(`A bundle ticket must name its ${k}.`)
  }
  if (!input.from?.site || !input.to?.site || input.from.site === input.to.site) {
    throw new Error('A bundle ticket goes from one site to another.')
  }
  if (!/^[0-9a-f]{64}$/.test(input.sha256) || !Number.isSafeInteger(input.size) || input.size <= 0) {
    throw new Error("A bundle ticket must name the bundle's hash and size.")
  }
  const jti = randomBytes(18).toString('base64url')
  const claims = {
    tokenType: BUNDLE_TICKET_TOKEN_TYPE, jti, relay: input.relay, person: input.person, bundleId: input.bundleId,
    direction: input.direction, workspaceId: input.workspaceId, branch: input.branch,
    from: { site: input.from.site }, to: { site: input.to.site }, sha256: input.sha256, size: input.size,
  }
  const signed = await sign(claims, input.relay, BUNDLE_TICKET_TTL_SECONDS)
  return { ...signed, jti }
}
