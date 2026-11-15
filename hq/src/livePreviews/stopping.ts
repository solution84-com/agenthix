/**
 * Stopping a live preview (live preview spec section 4, *States*): a person stops their own; a project Admin any in the
 * project; a fleet admin any, from the Fleet Console; and it stops when unused for the site's idle time, when live
 * previews are turned off on its site, and when its branch is merged and closed. Stopping never loses work: the branch
 * is in the workspace's repository, and a live preview on another site first brings its commits back.
 *
 * hq's row moves to STOPPED first, so an opening still waiting on the site follows with a stop of its own, then the site
 * is asked. A site that does not answer has its container stopped when it is next heard (`reconcile.ts`).
 */
import { HttpError, prisma } from 'wasp/server'
import type { LivePreview } from '@prisma/client'
import { LIVE_PREVIEW_METHODS, type LivePreviewStopper } from '@agenthix/core'
import { askSite, SiteFailed, SiteSilent } from './siteAsk'
import { LIVE, livePreviewById, moveLivePreview } from './store'
import { appTickets } from '../relays'
import { forgetLivePreview } from './questions'
import { emitLivePreviewChange } from './socket'
import { NOTHING, stoppedDetail } from './words'
import { stopperOf } from './views'
import { removeCopiesOfFinishedWork } from '../branches/copies'
import { Logger } from '../server/utils/logger'

const logger = new Logger('LivePreviewStop')

export type SiteStop = { answered: boolean; pendingBack: boolean }

/** Asks the site to stop it; a live preview the site does not hold has stopped there. Never throws. */
export async function stopOnSite(siteId: string, livePreviewId: string, by: LivePreviewStopper): Promise<SiteStop> {
  try {
    const answer = await askSite(siteId, LIVE_PREVIEW_METHODS.stop, { livePreviewId, by })
    if (answer.ok) return { answered: true, pendingBack: answer.pendingBack }
    return { answered: true, pendingBack: false }
  } catch (err) {
    if (!(err instanceof SiteSilent) && !(err instanceof SiteFailed)) throw err
    logger.warn(`live preview ${livePreviewId} not stopped on ${siteId} yet; asked again when it is heard: ${err.message}`)
    return { answered: false, pendingBack: false }
  }
}

async function siteOf(row: Pick<LivePreview, 'executionSiteId'>): Promise<{ siteId: string; name: string } | null> {
  const s = await prisma.executionSite.findUnique({ where: { id: row.executionSiteId }, select: { siteId: true, label: true } })
  return s ? { siteId: s.siteId, name: s.label } : null
}

/** What stopping leaves behind in hq: its apps read as stopped, its questions forgotten, its tickets cut off. */
export async function afterStopped(row: Pick<LivePreview, 'id' | 'workspaceId' | 'branchId'>): Promise<void> {
  await prisma.liveApp.updateMany({ where: { livePreviewId: row.id, state: { not: 'stopped' } }, data: { state: 'stopped', since: new Date() } })
  forgetLivePreview(row.id)
  appTickets.revoke({ livePreviews: [row.id] })
  emitLivePreviewChange(row, 'apps')
}

/**
 * Once the site no longer runs it: a done task's copy, kept while the live preview ran from it, is removed when no
 * agent works on it either (`branches/copies.ts`). Never throws.
 */
export async function releaseCopyAfterStop(row: Pick<LivePreview, 'id' | 'branchId' | 'copyKind'>): Promise<void> {
  if (!row.branchId || row.copyKind !== 'BRANCH') return
  await removeCopiesOfFinishedWork(row.branchId)
    .catch(err => logger.warn(`live preview ${row.id}: its done task's copy not removed yet: ${err instanceof Error ? err.message : String(err)}`))
}

/**
 * Stops the live preview as `by`. `stopped` is false for one already stopped. A live preview on another site with
 * commits not yet back has them brought back (`back.ts`), then is stopped again with nothing pending.
 */
export async function stopAs(row: LivePreview, by: LivePreviewStopper, detail?: string): Promise<{ stopped: boolean }> {
  const site = await siteOf(row)
  const name = site?.name ?? 'its site'
  const moved = await moveLivePreview(row.id, {
    state: 'STOPPED', reason: by, detail: detail ?? stoppedDetail(by, name), since: new Date(), stoppedAt: new Date(),
  })
  if (!moved) return { stopped: false }
  await afterStopped(row)
  if (!site) return { stopped: true }
  const answer = await stopOnSite(site.siteId, row.id, by)
  if (answer.pendingBack) {
    // Loaded when first needed: bringing commits back reaches the opening path, which reaches this module.
    const { bringBack } = await import('./back')
    await bringBack(row.id).catch(err => logger.warn(`live preview ${row.id}: commits not brought back yet: ${err instanceof Error ? err.message : String(err)}`))
    await stopOnSite(site.siteId, row.id, by)
  }
  // A site that did not answer may still bind the copy: it goes once the site is heard (`reconcile.ts`).
  if (answer.answered) await releaseCopyAfterStop(row)
  return { stopped: true }
}

/** *Stop* in the workspace view: the person's own, or any in the project for a project Admin. */
export async function stopLivePreview(userId: string, livePreviewId: unknown): Promise<{ stopped: boolean }> {
  const row = await livePreviewById(livePreviewId)
  if (!row) throw new HttpError(404, `This live preview is not there. ${NOTHING}`)
  const as = await stopperOf(row, userId)
  if (!as) {
    throw new HttpError(403, `Only the person who started this live preview, or an admin of its project, may stop it. ${NOTHING}`)
  }
  if (!LIVE.includes(row.state)) return { stopped: false }
  return stopAs(row, as)
}
