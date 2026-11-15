/**
 * Refreshed subscription tokens coming back to hq. A subscription is a person's own Claude login, stored as an
 * `AiProvider` they own (models from one place, part 4).
 *
 * The harness refreshes a subscription login's token in place during a run,
 * inside the run's own harness home on the site. hq is the only lasting holder
 * of the login, so unless the refreshed token comes back, hq's copy lapses
 * and every later run is handed a dead one.
 *
 * A token may come back only against a GRANT: hq's own record, made when it
 * handed the login to a run (`grantSubscription`), of which stored login went
 * to which site, for which session and runner. The report names the grant and
 * nothing else, so it can never point at a login hq did not give that site:
 *
 *  - the grant must exist, belong to the reporting site, and be unexpired;
 *  - the grant must have been made to a run of the login's own holder: a
 *    login is only ever replaced by its holder's runs;
 *  - the document must be a usable OAuth credentials document whose own
 *    `expiresAt` agrees with the report's, lies in the future, and no further
 *    off than an access token lasts (`REFRESHED_EXPIRY_CEILING_MS`), so a
 *    document claiming a far expiry cannot outrank every real refresh after it;
 *  - the stored login must still be the sign-in that was handed over
 *    (`termsAcceptedAt`, set at every sign-in and never by a refresh), so a
 *    late report cannot put an earlier account back after someone signed in
 *    again; and
 *  - the report must be strictly fresher than what is stored.
 *
 * The last two are one conditional update rather than a read and a write, so
 * two sites (or two homes) reporting at once cannot let the older land last.
 * Several homes refresh one shared login independently, and freshest-wins is
 * what settles them: hq keeps the newest and hands it to the next run.
 *
 * Nothing here logs any part of a credential.
 */
import { createHash } from 'node:crypto'
import { prisma } from 'wasp/server'
import {
  type CapabilityRunner,
  type SubscriptionRefreshedEvent,
} from '@agenthix/core'
import { encryptSecret } from '../server/crypto/secretCrypto'
import { Logger } from '../server/utils/logger'
import { isPlausibleOauthDocument } from './oauthDocument'

const logger = new Logger('SubscriptionGrants')

/**
 * How long a report against a grant is accepted. Long enough for a long run,
 * and for a refresh held on the site while hq was unreachable to arrive once
 * the connection is back.
 */
export const SUBSCRIPTION_GRANT_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * The furthest from now a refreshed token's expiry may lie. An access token
 * lasts hours; the site applies the same bound before it copies or reports a
 * document.
 */
export const REFRESHED_EXPIRY_CEILING_MS = 7 * 24 * 60 * 60 * 1000

/** Where a run handed a subscription goes: the site, and who it runs for. */
export type GrantTarget = { siteId: string; runner: CapabilityRunner }

/** The stored sign-in a subscription document came from. */
export type StoredLogin = { providerId: string; signedInAt: Date }

/**
 * An opaque name for one sign-in of one stored login, the same for every run
 * handed it. The site groups the harness homes holding copies of one login by
 * it; it says nothing a site could use to address the login itself.
 */
export function loginIdOf(login: StoredLogin): string {
  return createHash('sha256')
    .update(`${login.providerId}:${login.signedInAt.getTime()}`)
    .digest('hex')
    .slice(0, 32)
}

function runnerId(runner: CapabilityRunner): string | null {
  if (runner.kind === 'person') return runner.userId
  if (runner.kind === 'project') return runner.projectId
  return null
}

/** A subscription as hq reads it from its store, before it is handed to a run as a grant. */
export type UngrantedSubscription = { kind: 'subscription'; provider: 'anthropic'; oauthJson: string }

/**
 * A subscription handed to a run, as its provider descriptor carries it: `grantId` names this one hand-over, to this
 * site for this run; `loginId` the stored sign-in the document came from.
 */
export type GrantedSubscription = UngrantedSubscription & { grantId: string; loginId: string }

/**
 * Records that `login` is being handed to a run on `target.siteId`, and names
 * the grant on the credential the run is given.
 */
export async function grantSubscription(
  credential: UngrantedSubscription,
  login: StoredLogin,
  target: GrantTarget,
  now: Date = new Date(),
): Promise<GrantedSubscription> {
  await prisma.subscriptionGrant.deleteMany({ where: { expiresAt: { lt: now } } })
  const grant = await prisma.subscriptionGrant.create({
    data: {
      providerId: login.providerId,
      signedInAt: login.signedInAt,
      siteId: target.siteId,
      runnerKind: target.runner.kind,
      runnerId: runnerId(target.runner),
      expiresAt: new Date(now.getTime() + SUBSCRIPTION_GRANT_TTL_MS),
    },
    select: { id: true },
  })
  return { ...credential, grantId: grant.id, loginId: loginIdOf(login) }
}

/**
 * A refreshed document hq would hand to the next run: it parses, carries an
 * access and a refresh token, and its expiry agrees with the report's, has not
 * passed, and is within the ceiling. A refresh that is already expired is not one.
 */
export function isUsableRefreshedDocument(oauthJson: string, declaredExpiresAt: number, now: number): boolean {
  if (!isPlausibleOauthDocument(oauthJson, declaredExpiresAt)) return false
  if (declaredExpiresAt <= now || declaredExpiresAt > now + REFRESHED_EXPIRY_CEILING_MS) return false
  const oauth = (JSON.parse(oauthJson) as { claudeAiOauth: Record<string, unknown> }).claudeAiOauth
  const nonEmpty = (v: unknown) => typeof v === 'string' && v.length > 0
  return nonEmpty(oauth.accessToken) && nonEmpty(oauth.refreshToken)
}

export type RefreshOutcome =
  | 'accepted'
  | 'unknown-grant'
  | 'grant-expired'
  | 'not-the-holder'
  | 'not-a-usable-document'
  | 'not-fresher-or-signed-in-again'

/**
 * Stores a refreshed token reported against a grant, if every rule in this
 * module's own comment holds. Returns what happened rather than throwing, so
 * the caller logs one line either way.
 */
export async function acceptSubscriptionRefresh(
  siteId: string,
  event: SubscriptionRefreshedEvent,
  now: number = Date.now(),
): Promise<RefreshOutcome> {
  const grant = await prisma.subscriptionGrant.findUnique({
    where: { id: event.grantId },
    select: { siteId: true, providerId: true, signedInAt: true, expiresAt: true, runnerKind: true, runnerId: true },
  })
  // A grant made to another site answers exactly as a grant that does not
  // exist: a site learns nothing about what hq handed to its siblings.
  if (!grant || grant.siteId !== siteId) return 'unknown-grant'
  if (grant.expiresAt.getTime() <= now) return 'grant-expired'
  if (grant.runnerKind !== 'person' || !grant.runnerId) return 'not-the-holder'
  const login = await prisma.aiProvider.findUnique({ where: { id: grant.providerId }, select: { ownerUserId: true } })
  if (!login || login.ownerUserId !== grant.runnerId) return 'not-the-holder'
  if (!isUsableRefreshedDocument(event.oauthJson, event.expiresAt, now)) return 'not-a-usable-document'

  const refreshedExpiresAt = new Date(event.expiresAt)
  const { count } = await prisma.aiProvider.updateMany({
    where: {
      id: grant.providerId,
      credentialKind: 'subscription',
      ownerUserId: grant.runnerId,
      termsAcceptedAt: grant.signedInAt,
      OR: [{ expiresAt: null }, { expiresAt: { lt: refreshedExpiresAt } }],
    },
    data: { secret: encryptSecret(event.oauthJson), expiresAt: refreshedExpiresAt },
  })
  return count === 1 ? 'accepted' : 'not-fresher-or-signed-in-again'
}

const GRANT_ID_MAX_LENGTH = 100
const REFRESHED_OAUTH_JSON_MAX_LENGTH = 64 * 1024

function validateSubscriptionRefreshedEvent(e: unknown): SubscriptionRefreshedEvent | null {
  if (!e || typeof e !== 'object') return null
  const frame = e as Record<string, unknown>
  if (typeof frame.grantId !== 'string' || frame.grantId.length === 0 || frame.grantId.length > GRANT_ID_MAX_LENGTH) return null
  if (typeof frame.oauthJson !== 'string' || frame.oauthJson.length === 0 || frame.oauthJson.length > REFRESHED_OAUTH_JSON_MAX_LENGTH) return null
  if (typeof frame.expiresAt !== 'number' || !Number.isFinite(frame.expiresAt)) return null
  return { grantId: frame.grantId, oauthJson: frame.oauthJson, expiresAt: frame.expiresAt }
}

/**
 * The wire entry point for `site.subscriptionRefreshed`. Never throws: a
 * malformed frame, a refusal, or a store failure is logged and dropped, the
 * channel's posture for every one-way event.
 */
export async function handleSubscriptionRefreshedEvent(siteId: string, data: unknown): Promise<void> {
  const event = validateSubscriptionRefreshedEvent(data)
  if (!event) {
    logger.warn(`site ${siteId}: rejected a malformed site.subscriptionRefreshed event — dropped`)
    return
  }
  try {
    const outcome = await acceptSubscriptionRefresh(siteId, event)
    if (outcome === 'accepted') logger.info(`site ${siteId}: stored a refreshed subscription token (grant ${event.grantId})`)
    else logger.warn(`site ${siteId}: refused a refreshed subscription token (grant ${event.grantId}): ${outcome}`)
  } catch (err) {
    logger.error(`site ${siteId}: storing a refreshed subscription token failed (grant ${event.grantId})`, err)
  }
}
