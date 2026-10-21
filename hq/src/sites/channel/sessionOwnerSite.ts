/**
 * Which Execution Site owns a session, for site event intake: a `run.stream` or
 * `run.status` frame may touch a session only when the site sending it is the
 * one hq dispatches that session's runs to. Resolved with the same resolver
 * dispatch uses (dispatchSiteResolution.ts's `resolveSiteIdForSession`), so a
 * legitimate frame always matches.
 *
 * A small TTL cache holding the PROMISE, not the resolved value: the opening
 * burst of frames for a new session lands in one tick, and every frame
 * awaiting the same promise resumes in arrival order at the cost of one
 * lookup. Unknown sessions are cached too (null) — that is exactly what a
 * probing frame repeats — and are evicted first when the cache is full.
 *
 * A lookup that fails (a dropped database connection, a timeout) is not an
 * answer. It is retried inside that same promise, with a short pause, before
 * the frame is dropped: sites do not resend frames, and a lost terminal frame
 * leaves hq's copy of the session unfinished. A failure is never cached.
 * A refusal — an unplaced workspace, a project naming no site — IS an answer,
 * and is treated as one: null, cached, dropped once, never retried.
 *
 * A cached answer can be overtaken by a placement change — a task moved to a
 * project on another site, a session given a new primary location — and the
 * new site's frames would then be dropped until the entry expired.
 * Rather than every writer of placement having to remember this cache, a frame
 * the cached answer refuses re-asks before it is dropped: the stale entry is
 * replaced by a fresh lookup, and the frame is judged by that. Frames already
 * waiting on the stale entry follow the replacement rather than each starting
 * their own. A refusal re-asks at most once per OWNER_RECHECK_MIN_MS per
 * session, so a site repeatedly sending frames for a session it does not own
 * costs one lookup a second, not one per frame.
 */
import { HttpError, prisma } from 'wasp/server'
import { Logger } from '../../server/utils/logger'
import type { SessionProjectFields } from '../../sessions/sessionProject'

const logger = new Logger('SiteEvents')

const SESSION_OWNER_TTL_MS = 60_000
const SESSION_OWNER_CACHE_CAP = 500
export const OWNER_LOOKUP_ATTEMPTS = 3
const OWNER_LOOKUP_RETRY_DELAYS_MS = [50, 200]
export const OWNER_RECHECK_MIN_MS = 1_000

type Entry = {
  owner: Promise<string | null>
  created: number
  expires: number
  resolved: string | null | undefined
  warnedSites: Set<string>
  // The fields that say which project the session works in, taken from the same
  // row the owner lookup already reads so the activity feed needs no second query.
  project: SessionProjectFields | undefined
  // The person whose session it is, from the same row, for the person's own socket events.
  userId?: string | null
}
const cache = new Map<string, Entry>()

export function __resetSessionOwnerCacheForTests(): void {
  cache.clear()
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function lookUpOwner(sessionId: string): Promise<{ owner: string | null; project?: SessionProjectFields; userId?: string | null }> {
  const row = await prisma.agentSession.findUnique({
    where: { id: sessionId },
    select: { taskId: true, agentId: true, primaryOwnerType: true, primaryOwnerId: true, primaryWorkspaceId: true, userId: true, sessionType: true },
  })
  if (!row) {
    logger.warn(`site event(s) for unknown session ${sessionId} — dropped`)
    return { owner: null }
  }
  const project = { taskId: row.taskId, primaryOwnerType: row.primaryOwnerType, primaryOwnerId: row.primaryOwnerId }
  // Dynamic on purpose: dispatchSiteResolution → dispatchService → siteRuntimeStore
  // → channel/index → TaskRunner → siteEventHandler. A static import would let
  // TaskRunner's module-level onRunStatus() run before siteEventHandler has
  // finished initialising whenever siteEventHandler is loaded first.
  const { resolveSiteIdForSession } = await import('../../agents/dispatchSiteResolution')
  try {
    return { owner: await resolveSiteIdForSession(row), project, userId: row.userId }
  } catch (err) {
    // "I cannot tell you where this lives" is an ANSWER, not a failed lookup:
    // the location is unplaced, or names a project with no site, and asking
    // again in 50ms cannot change that. Retrying it would spend a quarter
    // second per frame, forever, on a session whose frames are dropped either
    // way. Returned as null so it is cached and dropped once, like an unknown
    // session — distinct from the database failures the retry below exists for.
    if (err instanceof HttpError) {
      logger.warn(`site event(s) for session ${sessionId}: its location cannot be resolved (${err.message}) — dropped`)
      return { owner: null }
    }
    throw err
  }
}

async function lookUpOwnerWithRetry(sessionId: string): Promise<{ owner: string | null; project?: SessionProjectFields; userId?: string | null }> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await lookUpOwner(sessionId)
    } catch (err) {
      if (attempt >= OWNER_LOOKUP_ATTEMPTS) throw err
      logger.warn(`owner lookup for session ${sessionId} failed (attempt ${attempt} of ${OWNER_LOOKUP_ATTEMPTS}) — retrying: ${describeError(err)}`)
      await new Promise((resolve) => setTimeout(resolve, OWNER_LOOKUP_RETRY_DELAYS_MS[attempt - 1]))
    }
  }
}

function evictOneIfOverCap(): void {
  if (cache.size <= SESSION_OWNER_CACHE_CAP) return
  for (const [key, entry] of cache) {
    if (entry.resolved === null) {
      cache.delete(key)
      return
    }
  }
  const oldestKey = cache.keys().next().value
  if (oldestKey !== undefined) cache.delete(oldestKey)
}

function ownerOf(sessionId: string, replacing?: Entry): Entry {
  const now = Date.now()
  const cached = cache.get(sessionId)
  if (!replacing && cached && cached.expires > now) {
    cache.delete(sessionId)
    cache.set(sessionId, cached)
    return cached
  }
  if (replacing) cache.delete(sessionId)
  const entry: Entry = {
    owner: null as unknown as Promise<string | null>,
    created: now,
    expires: now + SESSION_OWNER_TTL_MS,
    resolved: undefined,
    // Carried over so a re-asked refusal does not warn again for the same site.
    warnedSites: new Set(replacing?.warnedSites),
    project: undefined,
  }
  entry.owner = lookUpOwnerWithRetry(sessionId).then(({ owner, project, userId }) => {
    if (cache.get(sessionId) === entry) {
      entry.resolved = owner
      entry.project = project
      entry.userId = userId
    }
    return owner
  })
  cache.set(sessionId, entry)
  evictOneIfOverCap()
  return entry
}

/** The project-naming fields of a session whose owner lookup has resolved, or undefined when not cached. */
export function cachedSessionProjectFields(sessionId: string): SessionProjectFields | undefined {
  const entry = cache.get(sessionId)
  return entry && entry.expires > Date.now() ? entry.project : undefined
}

/** The person whose session it is, once its owner lookup has resolved; undefined when not cached. */
export function cachedSessionUserId(sessionId: string): string | null | undefined {
  const entry = cache.get(sessionId)
  return entry && entry.expires > Date.now() ? entry.userId : undefined
}

/** The owner an entry settles on, or undefined when the lookup failed outright (the entry is then evicted). */
async function settle(sessionId: string, entry: Entry): Promise<string | null | undefined> {
  try {
    return await entry.owner
  } catch (err) {
    if (cache.get(sessionId) === entry) cache.delete(sessionId)
    logger.warn(
      `site event intake: owner lookup for session ${sessionId} failed after ${OWNER_LOOKUP_ATTEMPTS} attempts (${describeError(err)}) — frame dropped`,
    )
    return undefined
  }
}

/**
 * The entry a refused frame should be judged by instead, or null when the
 * refusal stands: another frame already replaced the entry, or this one is
 * young enough to be taken as current.
 */
function recheckEntry(sessionId: string, entry: Entry): Entry | null {
  const current = cache.get(sessionId)
  if (current && current !== entry && current.expires > Date.now()) return current
  if (Date.now() - entry.created < OWNER_RECHECK_MIN_MS) return null
  return ownerOf(sessionId, entry)
}

/** True only when `siteId` is the site that owns `sessionId`. Never throws. */
export async function sessionOwnedBy(sessionId: string, siteId: string): Promise<boolean> {
  let entry = ownerOf(sessionId)
  let owner = await settle(sessionId, entry)
  if (owner === undefined) return false
  if (owner !== siteId) {
    const fresh = recheckEntry(sessionId, entry)
    if (fresh) {
      entry = fresh
      owner = await settle(sessionId, entry)
      if (owner === undefined) return false
    }
  }
  if (owner === null) return false
  if (owner !== siteId) {
    // Once per foreign site per cache entry: a stream of foreign frames would otherwise log every frame.
    if (!entry.warnedSites.has(siteId)) {
      entry.warnedSites.add(siteId)
      logger.warn(`site ${siteId}: event for session ${sessionId}, which belongs to site ${owner} — dropped`)
    }
    return false
  }
  return true
}
