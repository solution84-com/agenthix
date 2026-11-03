/**
 * Copies of one subscription login across this site's harness homes, kept in
 * step while they run, and the refreshed token reported back to hq.
 *
 * hq hands a stored login to every run whose boundary uses it, and since
 * person-scoped execution each runner has a private harness home, so one login
 * can sit in several homes at once: a project's own and each member's in that
 * project. The harness refreshes the token in whichever home needs it first.
 * Whether the provider then retires the old refresh token could not be
 * established from the harness, and the harness behaves as if it might: it
 * takes a file lock around a refresh, re-reads the stored document first in
 * case another process already refreshed it, and treats an `invalid_grant`
 * as a dead token. So the other homes are assumed to be holding a token that
 * no longer works. This module puts the refreshed document into them before
 * their own refresh is due, which the harness picks up — it re-reads the
 * stored document before refreshing and after a refused request — and reports
 * it to hq against the grant the run was given, so the next run starts from
 * it rather than from the retired one.
 *
 * Only homes this process gave the same login are touched (`loginId`, set by
 * hq per sign-in), and only with a strictly fresher document. Nothing here
 * logs any part of a credential.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import type { RunCredential, SubscriptionRefreshedEvent } from '@agenthix/core'
import type { SiteRunCredential } from '../../server/modelRelay/runAccess'
import { hqConnectionManager } from '../../server/hq/hqConnection'
import { Logger } from '../../server/utils/logger'
import { homeDocumentExpiresAt, parseCredentialExpiresAt, readCredentialExpiresAt, serialiseCredentialHome } from './agentCredentials'
import { CREDENTIALS_FILE, readCredentialFile, withCredentialFolder, writeFileAtomicIn } from './credentialFile'
import { KeyedAsyncQueue } from './runQueue'

const logger = new Logger('SubscriptionLogins')

/**
 * The directory Claude Code creates as its lock while it refreshes a token in
 * this home. Taken here too, around a copy, so a copy never lands between the
 * harness reading the document and writing back what it refreshed.
 */
const HARNESS_REFRESH_LOCK = '.oauth_refresh.lock'

/**
 * How often running homes are checked for a refresh. The harness refreshes a
 * few minutes before the access token expires, and every copy shares that
 * expiry, so a copy has to reach the other homes well inside that margin.
 */
export const SUBSCRIPTION_SWEEP_INTERVAL_MS = 15_000

type Document = { oauthJson: string; expiresAt: number; grantId: string }

interface LoginCopies {
  /** Homes running with this login, each with the newest grant a run there was given. */
  homes: Map<string, { grantId: string; runs: number }>
  /** The freshest copy seen on this site. Held only while a home uses the login. */
  freshest: Document | null
  /** The freshest expiry hq is known to hold: what it handed out, or what was sent to it. */
  reportedExpiresAt: number
}

export type SubscriptionMembership = { home: string; loginId: string }

const logins = new Map<string, LoginCopies>()
/** Which login each home was last given a document from, so a home holding another login is overwritten, not kept. */
const loginOfHome = new Map<string, string>()
const loginOps = new KeyedAsyncQueue()
let sweeper: ReturnType<typeof setInterval> | null = null

/**
 * Counts a run into the copies of its login, before its credential is written.
 * Null for any credential that is not a subscription.
 */
export function joinSubscriptionLogin(home: string, credential: SiteRunCredential | null): SubscriptionMembership | null {
  if (credential?.kind !== 'subscription') return null
  const { grantId, loginId, oauthJson } = credential
  const copies = logins.get(loginId) ?? { homes: new Map(), freshest: null, reportedExpiresAt: 0 }
  logins.set(loginId, copies)

  const expiresAt = parseCredentialExpiresAt(oauthJson)
  if (!copies.freshest || expiresAt > copies.freshest.expiresAt) copies.freshest = { oauthJson, expiresAt, grantId }
  copies.reportedExpiresAt = Math.max(copies.reportedExpiresAt, expiresAt)

  const entry = copies.homes.get(home)
  copies.homes.set(home, { grantId, runs: (entry?.runs ?? 0) + 1 })
  startSweeper()
  return { home, loginId }
}

/**
 * Counts a run out, after a last look at its home. True when this site holds a
 * refreshed token hq has not been sent — the caller keeps the home's document
 * past the end of the run so it is not lost.
 */
export async function leaveSubscriptionLogin(membership: SubscriptionMembership): Promise<boolean> {
  const { home, loginId } = membership
  return loginOps.enqueue(loginId, async () => {
    const copies = logins.get(loginId)
    if (!copies) return false
    await sweepLogin(loginId, copies)
    const entry = copies.homes.get(home)
    if (entry && entry.runs > 1) copies.homes.set(home, { ...entry, runs: entry.runs - 1 })
    else copies.homes.delete(home)
    const unreported = !!copies.freshest && copies.freshest.expiresAt > copies.reportedExpiresAt
    if (copies.homes.size === 0) logins.delete(loginId)
    if (logins.size === 0) stopSweeper()
    return unreported
  })
}

/**
 * The document a run should be given: the freshest copy of its login on this
 * site when that is newer than what hq dispatched — hq may not have it yet.
 */
export function freshestDocumentFor(credential: Extract<RunCredential, { kind: 'subscription' }>): string {
  const freshest = logins.get(credential.loginId)?.freshest
  return freshest && freshest.expiresAt > parseCredentialExpiresAt(credential.oauthJson)
    ? freshest.oauthJson
    : credential.oauthJson
}

/** True when the home was last given another login's document; a home given none yet holds no other. */
export function homeHoldsAnotherLogin(home: string, loginId: string): boolean {
  const held = loginOfHome.get(home)
  return !!held && held !== loginId
}

/** Which login the home now holds a document from; undefined when its document is gone. */
export function noteHomeLogin(home: string, loginId: string | undefined): void {
  if (loginId) loginOfHome.set(home, loginId)
  else loginOfHome.delete(home)
}

/** One pass over every login in use. Exported for tests; the sweeper calls it on a timer. */
export async function sweepSubscriptionLogins(): Promise<void> {
  await Promise.all([...logins.keys()].map(loginId =>
    loginOps.enqueue(loginId, async () => {
      const copies = logins.get(loginId)
      if (copies) await sweepLogin(loginId, copies)
    }).catch((err: unknown) => logger.warn(`Checking a subscription login's copies failed: ${errorText(err)}`)),
  ))
}

async function sweepLogin(loginId: string, copies: LoginCopies): Promise<void> {
  const homes = [...copies.homes].filter(([home]) => loginOfHome.get(home) === loginId)

  for (const [home, { grantId }] of homes) {
    // The run writes its home: only a plain file holding a usable document,
    // whose expiry is within reach, is taken as a refresh (credentialFile.ts).
    const read = await readCredentialFile(home)
    if (read.state !== 'read') continue
    const oauthJson = read.text
    const expiresAt = homeDocumentExpiresAt(oauthJson)
    if (expiresAt === 0) continue
    if (!copies.freshest || expiresAt > copies.freshest.expiresAt) copies.freshest = { oauthJson, expiresAt, grantId }
  }
  const freshest = copies.freshest
  if (!freshest) return

  for (const [home] of homes) {
    await serialiseCredentialHome(home, () => copyInto(home, loginId, freshest)).catch((err: unknown) =>
      logger.warn(`Could not bring a subscription copy up to date in ${home}: ${errorText(err)}`),
    )
  }

  if (freshest.expiresAt > copies.reportedExpiresAt && hqConnectionManager.connectionState() === 'connected') {
    const event: SubscriptionRefreshedEvent = { grantId: freshest.grantId, oauthJson: freshest.oauthJson, expiresAt: freshest.expiresAt }
    hqConnectionManager.sendEvent('site.subscriptionRefreshed', event)
    copies.reportedExpiresAt = freshest.expiresAt
    logger.info(`Reported a refreshed subscription token to hq (grant ${freshest.grantId})`)
  }
}

/**
 * Writes the freshest copy into one home, when that home still holds this
 * login, still has a document at all (a home whose document was removed is
 * not refilled), and holds an older one. Skipped for this pass while the
 * harness holds its refresh lock there.
 */
async function copyInto(home: string, loginId: string, freshest: Document): Promise<void> {
  if (loginOfHome.get(home) !== loginId) return
  const onDisk = await readCredentialExpiresAt(home)
  if (onDisk === null || onDisk >= freshest.expiresAt) return

  await withCredentialFolder(home, async dir => {
    const lock = path.join(dir, HARNESS_REFRESH_LOCK)
    try {
      await fs.mkdir(lock)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') return
      throw err
    }
    try {
      await writeFileAtomicIn(dir, CREDENTIALS_FILE, freshest.oauthJson)
    } finally {
      await fs.rmdir(lock).catch(() => {})
    }
  })
}

function startSweeper(): void {
  if (sweeper) return
  sweeper = setInterval(() => void sweepSubscriptionLogins(), SUBSCRIPTION_SWEEP_INTERVAL_MS)
  sweeper.unref?.()
}

function stopSweeper(): void {
  if (sweeper) clearInterval(sweeper)
  sweeper = null
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Forgets every login and home — for tests only. */
export function _resetSubscriptionLoginsForTests(): void {
  stopSweeper()
  logins.clear()
  loginOfHome.clear()
}
