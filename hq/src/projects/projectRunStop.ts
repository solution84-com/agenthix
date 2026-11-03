/**
 * Stopping a project's running and queued work before the project is deleted.
 *
 * A run left going after its project is gone keeps the project's storage
 * mounted, recreates its folder if it was still queued, and keeps asking hq for
 * git credentials on its behalf. So `deleteProject` stops every active run of
 * the project's sessions first, and deletes nothing until the sites holding them
 * have confirmed that none is left: a site that cannot be reached, or runs still
 * active when the wait runs out, refuse the delete. It fails closed, because the
 * person can simply try again, while a run that outlives its project cannot be
 * called back.
 *
 * A cancel marks the run CANCELLED on its site at once, and a queued run
 * re-reads its row before it launches and skips anything no longer PENDING, so
 * a re-list normally comes back empty straight after the cancels. The wait
 * covers the cases where it does not: a run dispatched while the delete is in
 * flight.
 *
 * `stopRunsOfSessions` is the same wait for any set of sessions; a place's Stop
 * all (placeRunStop.ts) uses it with its own refusal.
 */
import { HttpError, prisma } from 'wasp/server'
import type { Prisma } from '@prisma/client'
import type { RunRow } from '@agenthix/core'
import * as siteRuntimeStore from '../sessions/siteRuntimeStore'
import { resolveSiteIdForSession } from '../agents/dispatchSiteResolution'
import { SiteUnreachableError } from '../storage/workspaceStore'
import { Logger } from '../server/utils/logger'

const logger = new Logger('Projects')

/** `run.list`'s own ceiling on the site; a page this full may be hiding rows. */
const SITE_LIST_LIMIT = 1000

export type StopProjectRunsOptions = {
  timeoutMs?: number
  intervalMs?: number
  sleep?: (ms: number) => Promise<void>
  /** The name of the person stopping them, recorded as "Stopped by". */
  by?: string
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Runs that could not be confirmed stopped: `status` 409 when they outlasted the wait, 503 when a site could not be asked. */
export class RunsNotConfirmedStopped extends Error {
  constructor(readonly detail: string, readonly status: number) {
    super(detail)
  }
}

function notConfirmed(detail: string, status = 409): HttpError {
  return new HttpError(
    status,
    `This project's running work could not be confirmed stopped, so nothing was deleted: ${detail}. Try again.`,
  )
}

/** Which site each of the sessions `where` selects runs on, grouped by site. */
export async function sessionsBySite(where: Prisma.AgentSessionWhereInput, fallbackSiteId: string | null): Promise<Map<string, Set<string>>> {
  const sessions = await prisma.agentSession.findMany({
    where,
    select: {
      id: true, userId: true, sessionType: true, taskId: true,
      primaryOwnerType: true, primaryOwnerId: true, primaryWorkspaceId: true,
    },
  })

  const bySite = new Map<string, Set<string>>()
  for (const session of sessions) {
    let siteId: string | null
    try {
      siteId = await resolveSiteIdForSession(session)
    } catch {
      // A session whose workspace placement is gone ran, if anywhere, on the
      // project's own site — the only one left that could still hold its runs.
      siteId = fallbackSiteId
    }
    if (siteId === null) {
      logger.warn(`stopping runs: session ${session.id} has no site to ask about its runs`)
      continue
    }
    if (!bySite.has(siteId)) bySite.set(siteId, new Set())
    bySite.get(siteId)!.add(session.id)
  }
  return bySite
}

async function activeRunsOnSite(siteId: string, sessionIds: Set<string>): Promise<RunRow[]> {
  const page = await siteRuntimeStore.listRuns(siteId, { activeOnly: true, limit: SITE_LIST_LIMIT })
  if (page.length < SITE_LIST_LIMIT) return page.filter((run) => sessionIds.has(run.sessionId))
  const perSession = await Promise.all(
    [...sessionIds].map((sessionId) => siteRuntimeStore.listRuns(siteId, { sessionId, activeOnly: true })),
  )
  return perSession.flat()
}

/**
 * One round: every active run of the project's sessions on every site, or null
 * for a site that is revoked. A revoked site's socket is closed for good and hq
 * can neither ask nor tell it anything again, so waiting on it would make the
 * project undeletable forever while stopping nothing.
 */
async function listActive(bySite: Map<string, Set<string>>): Promise<Array<{ siteId: string; run: RunRow }>> {
  const active: Array<{ siteId: string; run: RunRow }> = []
  for (const [siteId, sessionIds] of bySite) {
    try {
      for (const run of await activeRunsOnSite(siteId, sessionIds)) active.push({ siteId, run })
    } catch (err) {
      if (err instanceof SiteUnreachableError && err.revoked) {
        bySite.delete(siteId)
        continue
      }
      throw err
    }
  }
  return active
}

/**
 * Cancels every active run of the sessions `where` selects and waits, bounded,
 * until no site reports one; returns how many runs it cancelled. Throws
 * `RunsNotConfirmedStopped` when a site cannot be reached or runs are still
 * active at the bound. `fallbackSiteId` is asked about a session whose own
 * placement is gone.
 */
export async function stopRunsOfSessions(
  where: Prisma.AgentSessionWhereInput,
  fallbackSiteId: string | null,
  options: StopProjectRunsOptions = {},
): Promise<number> {
  const timeoutMs = options.timeoutMs ?? 30_000
  const intervalMs = options.intervalMs ?? 1_000
  const sleep = options.sleep ?? defaultSleep

  const bySite = await sessionsBySite(where, fallbackSiteId)
  if (bySite.size === 0) return 0

  const deadline = Date.now() + timeoutMs
  const cancelled = new Set<string>()
  try {
    for (let round = 0; ; round++) {
      const active = await listActive(bySite)
      if (active.length === 0) return cancelled.size
      if (round > 0 && Date.now() >= deadline) {
        throw new RunsNotConfirmedStopped(`${active.length} run(s) were still active after ${Math.round(timeoutMs / 1000)}s`, 409)
      }
      for (const { siteId, run } of active) {
        await siteRuntimeStore.cancelRun(siteId, run.id, undefined, options.by)
        cancelled.add(run.id)
      }
      // The cancels are recorded on the site before they return, so the first
      // re-list is immediate; only a run that is still there is waited on.
      if (round > 0) await sleep(intervalMs)
    }
  } catch (err) {
    if (err instanceof RunsNotConfirmedStopped || err instanceof HttpError) throw err
    throw new RunsNotConfirmedStopped(err instanceof Error ? err.message : String(err), 503)
  }
}

/**
 * Cancels every active run of the project's sessions and waits, bounded, until
 * no site reports one. Throws an HttpError — and the caller must then delete
 * nothing — when a site cannot be reached or runs are still active at the bound.
 */
export async function stopProjectRuns(
  projectId: string,
  projectSiteId: string | null,
  options: StopProjectRunsOptions = {},
): Promise<void> {
  // A task session carries the project as its primary owner (dispatchService
  // sets it), but the task link is matched too so no task session is missed.
  const where = { OR: [{ primaryOwnerType: 'project' as const, primaryOwnerId: projectId }, { task: { projectId } }] }
  try {
    await stopRunsOfSessions(where, projectSiteId, options)
  } catch (err) {
    if (err instanceof RunsNotConfirmedStopped) throw notConfirmed(err.detail, err.status)
    throw err
  }
}
