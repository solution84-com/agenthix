/**
 * Dangling-copy reconciler (@SC-346 half-completion detection, plan 5d-2
 * task 10). hq's own `AgentSession` row is a copy of a session that actually
 * lives on site (D3) — if a dispatch or delete crashed hq before this copy
 * itself got cleaned up (or was told about a deletion never applied on hq's
 * side), the two can drift: hq believes a session exists that site has no
 * record of at all. There is no live signal for that drift — it only shows up
 * when someone asks. This reconciler asks, once per site reconnect and once
 * at boot, and marks what it finds so the UI can show it rather than the
 * session silently behaving as if nothing is wrong.
 *
 * `siteRuntimeStore.getSession` returning `null` (a definitive "no such
 * session" answer) is the signal that flags a copy `dangling`; a non-null
 * result on an already-flagged copy clears the flag (drift can heal — hq can
 * legitimately create a session row before site is seeded, e.g.
 * `dispatchTaskRun`'s session upsert when the site call that would seed it fails
 * with `SiteUnreachableError`; a later successful dispatch seeds site and the
 * next reconcile must not leave that copy mislabeled forever). Flagged copies
 * are therefore re-checked on every run, not skipped. The same answer also carries
 * the session's title: a copy still holding the placeholder is given the title site's
 * row has, through the same compare-and-set a live frame's title goes through. A `SiteUnreachableError`
 * — the site went offline mid-check, or is not the one asked here — is not
 * evidence of anything and is skipped, leaving whatever flag state the copy
 * already had untouched; only `onSiteConnected`'s CONNECTED-site check should
 * ever call this for a site that just proved it is reachable, but a race is
 * still possible between that check and each individual request landing.
 *
 * Chunked, not `Promise.all`-ed over the whole table: this is a boot/
 * reconnect task, not a hot path, and firing hundreds of concurrent channel
 * requests at a site that just connected is exactly the kind of thundering
 * herd a boot task should not create.
 *
 * `sites/channel/index.ts` importing this module to call
 * `reconcileDanglingSessions` from `onSiteConnected`, while this module
 * imports `siteChannelRegistry` from that same channel package, closes a
 * cycle — the same benign shape `reconcileService.ts`'s header comment
 * already accepts for this codebase: every binding across it resolves at
 * call time (inside function bodies here, never at module-eval time).
 */
import { prisma } from 'wasp/server'
import type { Prisma } from '@prisma/client'
import { siteChannelRegistry } from '../sites/channel'
import * as siteRuntimeStore from './siteRuntimeStore'
import { resolveSiteIdForSession } from '../agents/dispatchSiteResolution'
import type { SessionLocationFields } from '../storage/primaryLocationService'
import { SiteUnreachableError } from '../storage/workspaceStore'
import { applySiteTitle, UNTITLED_SESSION_TITLE } from './siteSessionTitle'
import { Logger } from '../server/utils/logger'

const logger = new Logger('DanglingSessionReconciler')

const CHUNK_SIZE = 10

type CandidateSession = SessionLocationFields & { id: string; taskId: string | null; agentId: string; metadata: unknown; title: string | null }

/**
 * Checks every hq `AgentSession` copy that resolves to `siteId` — including
 * already-flagged ones, since a flag can heal — and two-ways the result:
 * marks `metadata.dangling = true` on any copy site has no record of, and
 * clears an existing `dangling` flag on any copy site confirms. Safe to call
 * repeatedly — an already-confirmed, never-flagged row is a cheap no-op past
 * the channel round trip.
 */
export async function reconcileDanglingSessions(siteId: string): Promise<{ checked: number; flagged: number; unflagged: number }> {
  if (!siteChannelRegistry.isOnline(siteId)) return { checked: 0, flagged: 0, unflagged: 0 }

  const sessions: CandidateSession[] = await prisma.agentSession.findMany({
    where: { status: { not: 'ARCHIVED' } },
    select: { id: true, taskId: true, agentId: true, metadata: true, title: true, primaryOwnerType: true, primaryOwnerId: true, primaryWorkspaceId: true, userId: true, sessionType: true },
  })

  let checked = 0
  let flagged = 0
  let unflagged = 0

  for (let i = 0; i < sessions.length; i += CHUNK_SIZE) {
    const chunk = sessions.slice(i, i + CHUNK_SIZE)
    await Promise.all(chunk.map(async (session) => {
      const meta = (session.metadata ?? {}) as Record<string, unknown>

      let resolvedSiteId: string
      try {
        resolvedSiteId = await resolveSiteIdForSession(session)
      } catch (err) {
        logger.warn(`site resolution failed for session ${session.id}: ${err instanceof Error ? err.message : String(err)}`)
        return
      }
      if (resolvedSiteId !== siteId) return

      checked++
      try {
        const row = await siteRuntimeStore.getSession(siteId, session.id)
        if (row === null) {
          if (meta.dangling !== true) {
            await prisma.agentSession.update({
              where: { id: session.id },
              data: { metadata: { ...meta, dangling: true } },
            })
            flagged++
          }
        } else {
          if (meta.dangling === true) {
            const { dangling: _unused, ...rest } = meta
            await prisma.agentSession.update({
              where: { id: session.id },
              data: { metadata: rest as Prisma.InputJsonValue },
            })
            unflagged++
          }
          // A title site gave the session whose frame never reached hq (its run
          // was skipped, or hq was unreachable when it was sent) is otherwise never
          // delivered: site's row is no longer untitled, so nothing names it again.
          if (session.title === UNTITLED_SESSION_TITLE && row.title && row.title !== UNTITLED_SESSION_TITLE) {
            await applySiteTitle(session.id, row.title)
          }
        }
      } catch (err) {
        if (err instanceof SiteUnreachableError) return // unreachable mid-check — not evidence, skip
        logger.warn(`dangling check failed for session ${session.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }))
  }

  if (flagged > 0 || unflagged > 0) {
    logger.info(`site ${siteId}: checked ${checked} session(s), flagged ${flagged}, unflagged ${unflagged}`)
  }
  return { checked, flagged, unflagged }
}

/** Runs the reconciler for every site currently connected — the boot-time entry point. */
export async function reconcileDanglingSessionsForOnlineSites(): Promise<void> {
  for (const siteId of siteChannelRegistry.onlineSiteIds) {
    try {
      await reconcileDanglingSessions(siteId)
    } catch (err) {
      logger.error(`dangling-session reconcile failed for site ${siteId}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}
