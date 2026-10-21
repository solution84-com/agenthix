/**
 * hq's side of signing in with Claude (spec §6.3). The site runs the login in a
 * throwaway container (`site/src/server/login/claudeLogin.ts`); this module
 * calls it over the control channel, checks the site is new enough, and keeps
 * hq's own short memory of who started which login, so that only that person
 * can finish or cancel it and only for the boundary it was started for.
 *
 * ## Nothing here checks who may act for a boundary
 *
 * A caller must have run `requireOwnerAccess` first, as the actions in
 * `model-access/claudeLoginActions.ts` do. This module only enforces that the
 * person finishing a login is the person who started it.
 *
 * ## The memory is in process, on purpose
 *
 * A login lives ten minutes. An hq restart forgets it and the person starts
 * again; that does not justify a table. The site removes its own container
 * after the same ten minutes, so a forgotten login leaves nothing behind.
 *
 * ## Secrets
 *
 * `completeLogin` returns the credentials file's text. It is never logged here
 * and nothing this module throws carries it or the code.
 */
import {
  CLAUDE_LOGIN_METHODS,
  type ClaudeLoginCancelParams,
  type ClaudeLoginCancelResult,
  type ClaudeLoginFinishParams,
  type ClaudeLoginFinishResult,
  type ClaudeLoginStartParams,
  type ClaudeLoginStartResult,
  type ClaudeLoginMethod,
  type SiteMethodParams,
  type SiteMethodResult,
} from '@agenthix/core'
import { prisma } from 'wasp/server'
import { SiteUnreachableError, reasonFor } from '../storage/workspaceStore'
import { siteChannelRegistry, ChannelRequestFailed } from './channel'
import { isPlausibleOauthDocument } from './oauthDocument'
import { requireDefaultSiteId } from './localSite'
import { displaySiteName } from '../shared/siteName'

export type LoginOwner = { ownerType: 'org' | 'project' | 'user'; ownerId: string }

/** The site gives a login ten minutes; hq forgets it at the same moment. */
export const LOGIN_MEMORY_MS = 10 * 60 * 1000

/**
 * The channel's default is fifteen seconds. The site itself waits up to 30 s
 * for the link and up to 60 s for the container to finish, so hq's backstop
 * sits just past each: reaching it means the site stopped answering.
 */
const START_TIMEOUT_MS = 45_000
const FINISH_TIMEOUT_MS = 75_000

/** A login hq does not hold for this person: never started, expired, finished, or someone else's. */
export class ClaudeLoginUnknownError extends Error {
  constructor() {
    super('That sign-in is no longer open — start again')
    this.name = 'ClaudeLoginUnknownError'
  }
}

/** The site finished, but what it handed back is not a Claude credentials document. */
export class ClaudeLoginRejectedError extends Error {
  constructor() {
    super('The sign-in finished but did not return a usable credential — start again')
    this.name = 'ClaudeLoginRejectedError'
  }
}

type Remembered = { siteId: string; owner: LoginOwner; startedBy: string; startedAt: number }
const logins = new Map<string, Remembered>()

export function _resetLoginsForTests(): void {
  logins.clear()
}

function prune(): void {
  const cutoff = Date.now() - LOGIN_MEMORY_MS
  for (const [id, login] of logins) if (login.startedAt <= cutoff) logins.delete(id)
}

/** The login's own record, only for the person who started it. */
function heldBy(loginId: string, requestedBy: string): Remembered | null {
  prune()
  const login = logins.get(loginId)
  return login && login.startedBy === requestedBy ? login : null
}

/** Which boundary this person's open login is for, or null when they hold none by that id. */
export function peekLoginOwner(loginId: string, requestedBy: string): LoginOwner | null {
  return heldBy(loginId, requestedBy)?.owner ?? null
}

/** `expiresAt` in milliseconds, read from the number Claude writes; null when there is none. */
export function oauthExpiresAt(oauthJson: string): number | null {
  try {
    const claudeAiOauth = (JSON.parse(oauthJson) as { claudeAiOauth?: { expiresAt?: unknown } } | null)?.claudeAiOauth
    const expiresAt = claudeAiOauth?.expiresAt
    return typeof expiresAt === 'number' && Number.isFinite(expiresAt) ? expiresAt : null
  } catch {
    return null
  }
}

type SiteInfo = { label: string; status: string | null; protocolVersion: string | null }

async function siteInfo(siteId: string): Promise<SiteInfo> {
  const site = await prisma.executionSite
    .findUnique({ where: { siteId }, select: { label: true, isDefault: true, status: true, protocolVersion: true } })
    .catch(() => null)
  return { label: site ? displaySiteName(site) : siteId, status: site?.status ?? null, protocolVersion: site?.protocolVersion ?? null }
}

async function translateFailure(siteId: string, err: unknown): Promise<never> {
  const code = err instanceof ChannelRequestFailed ? err.code : null
  if (code === 'offline' || code === 'timeout' || code === 'disconnected') {
    const site = await siteInfo(siteId)
    throw new SiteUnreachableError(site.label, siteId, reasonFor(site.status), site.protocolVersion)
  }
  throw err
}

async function call<M extends ClaudeLoginMethod>(siteId: string, method: M, params: SiteMethodParams<M>, timeoutMs?: number): Promise<SiteMethodResult<M>> {
  try {
    return await siteChannelRegistry.request(siteId, method, params, timeoutMs)
  } catch (err) {
    return translateFailure(siteId, err)
  }
}

export async function beginLogin(owner: LoginOwner, startedBy: string): Promise<{ loginId: string; url: string }> {
  const siteId = await requireDefaultSiteId()
  const params: ClaudeLoginStartParams = {}
  const { loginId, url } = await call(siteId, CLAUDE_LOGIN_METHODS.start, params, START_TIMEOUT_MS)
  prune()
  logins.set(loginId, { siteId, owner, startedBy, startedAt: Date.now() })
  return { loginId, url }
}

/**
 * A finish that fails, for any reason, ends the login: the site has already
 * removed its container, so a second try would only meet an unknown id.
 */
export async function completeLogin(
  loginId: string,
  requestedBy: string,
  code: string,
): Promise<{ owner: LoginOwner; oauthJson: string }> {
  const login = heldBy(loginId, requestedBy)
  if (!login) throw new ClaudeLoginUnknownError()
  logins.delete(loginId)
  const params: ClaudeLoginFinishParams = { loginId, code }
  const { oauthJson } = await call(login.siteId, CLAUDE_LOGIN_METHODS.finish, params, FINISH_TIMEOUT_MS)
  const expiresAt = oauthExpiresAt(oauthJson)
  if (expiresAt === null || !isPlausibleOauthDocument(oauthJson, expiresAt)) throw new ClaudeLoginRejectedError()
  return { owner: login.owner, oauthJson }
}

/**
 * Best effort: the id is forgotten first, and an unreachable site is not an
 * error — it removes an abandoned login itself after ten minutes. Idempotent,
 * and quiet for an id this person does not hold.
 */
export async function abandonLogin(loginId: string, requestedBy: string): Promise<void> {
  const login = heldBy(loginId, requestedBy)
  if (!login) return
  logins.delete(loginId)
  const params: ClaudeLoginCancelParams = { loginId }
  try {
    await call(login.siteId, CLAUDE_LOGIN_METHODS.cancel, params)
  } catch (err) {
    if (err instanceof SiteUnreachableError || err instanceof ChannelRequestFailed) return
    throw err
  }
}
