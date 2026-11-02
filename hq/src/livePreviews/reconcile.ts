/**
 * Keeping hq's rows and the sites' live previews in step (live preview spec section 4, *States*; section 5):
 *
 * - **At every connect**, a site is told its setting (`site.livePreviews`), then hq compares what it runs with what hq
 *   holds: one hq does not hold as live is stopped there (an opening that went silent, a stop the site never heard),
 *   and one hq holds that the site no longer runs is marked stopped. The apps of each that runs follow what the site
 *   lists (`appSync.ts`): after a restart none survived.
 * - **Every minute**, the idle stop: a running live preview nobody has had open, with no run going on its branch, for
 *   its site's *Stop when unused for*, stops. An opening the site never answered is given up. Commits still to come
 *   back from another site are tried again.
 *
 * None of it runs while the live preview's flag is off (adr-0172).
 */
import { prisma } from 'wasp/server'
import type { LivePreview } from '@prisma/client'
import {
  LIVE_PREVIEW_METHODS, SITE_LIVE_PREVIEWS_METHOD, livePreviewIsLive, type LivePreviewSummary, type RunStatusEvent,
} from '@agenthix/core'
import { siteChannelRegistry } from '../sites/channel'
import { onRunStatus } from '../sites/channel/siteEventHandler'
import { branchOfSession } from '../branches/branchRows'
import { isWorking } from '../branches/working'
import { locateWorkspace } from '../branches/workspaceLocation'
import { Logger } from '../server/utils/logger'
import { askSite, OPEN_TIMEOUT_MS } from './siteAsk'
import { settingOf, SITE_SELECT } from './sites'
import { LIVE, livePreviewOn, moveFromSummary, moveLivePreview, touchLivePreview } from './store'
import { detailFor } from './opening'
import { afterStopped, releaseCopyAfterStop, stopAs, stopOnSite } from './stopping'
import { bringBackPending } from './back'
import { followSiteApps } from './appSync'
import { livePreviewFeatureOn, whileLivePreviewOn } from './flag'

const logger = new Logger('LivePreviewReconcile')

/** Tells the site its setting; a site that is offline is told at its next connect. Never throws. */
export async function sendSiteSetting(siteId: string): Promise<void> {
  const site = await prisma.executionSite.findFirst({ where: { siteId, status: { not: 'REVOKED' } }, select: SITE_SELECT })
  if (!site || !siteChannelRegistry.isOnline(siteId)) return
  try {
    await askSite(siteId, SITE_LIVE_PREVIEWS_METHOD, settingOf(site))
  } catch (err) {
    logger.warn(`site ${siteId} did not take its live-preview setting: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** Compares what the site runs with what hq holds, and brings them into step. */
export async function reconcileSite(siteId: string, now = Date.now()): Promise<void> {
  const site = await prisma.executionSite.findFirst({ where: { siteId, status: { not: 'REVOKED' } }, select: { id: true, label: true } })
  if (!site) return
  const listed = await askSite(siteId, LIVE_PREVIEW_METHODS.list, {})
  const theirs = new Map<string, LivePreviewSummary>()
  for (const s of Array.isArray(listed?.livePreviews) ? listed.livePreviews : []) {
    if (s && typeof s.livePreviewId === 'string' && s.state && livePreviewIsLive(s.state)) theirs.set(s.livePreviewId, s)
  }
  const ours = await prisma.livePreview.findMany({ where: { id: { in: [...theirs.keys()] } } })
  const byId = new Map(ours.map(r => [r.id, r]))
  for (const [id, s] of theirs) {
    const row = byId.get(id)
    if (!row || row.executionSiteId !== site.id || !LIVE.includes(row.state) || row.workspaceId !== s.workspaceId || row.branch !== s.branch) {
      const stopped = await stopOnSite(siteId, id, 'person')
      if (stopped.answered && row && row.executionSiteId === site.id && !LIVE.includes(row.state)) await releaseCopyAfterStop(row)
      continue
    }
    await moveLivePreview(row.id, moveFromSummary(s, detailFor(site.label)))
    await followSiteApps(siteId, site.label, row).catch(err =>
      logger.warn(`site ${siteId}: the apps of live preview ${row.id} not read: ${err instanceof Error ? err.message : String(err)}`))
  }
  const live = await prisma.livePreview.findMany({ where: { executionSiteId: site.id, state: { in: LIVE } } })
  for (const row of live) {
    if (theirs.has(row.id)) continue
    // An opening still waiting on the site's answer is the opening's to settle.
    if (row.state === 'STARTING' && now - row.openedAt.getTime() < OPEN_TIMEOUT_MS * 2) continue
    const moved = await moveLivePreview(row.id, {
      state: 'STOPPED', reason: row.state === 'STARTING' ? 'failed' : 'person', signal: null, since: new Date(), stoppedAt: new Date(),
      detail: `It was no longer running on ${site.label}. Its branch and its work are untouched; start it again when you want it.`,
    })
    if (moved) {
      await afterStopped(moved)
      await releaseCopyAfterStop(moved)
    }
  }
}

export async function onSiteConnected(siteId: string): Promise<void> {
  if (!(await livePreviewFeatureOn())) return
  await sendSiteSetting(siteId)
  try {
    await reconcileSite(siteId)
  } catch (err) {
    logger.warn(`site ${siteId}: live previews not reconciled: ${err instanceof Error ? err.message : String(err)}`)
  }
  await bringBackPending().catch(() => {})
}

/** Whether a run is going on the live preview's branch now: on the site its runs go to. Unknown counts as yes. */
async function runGoing(row: LivePreview): Promise<boolean> {
  if (!row.branchId) return false
  const branch = await prisma.workspaceBranch.findUnique({ where: { id: row.branchId } })
  if (!branch) return false
  try {
    const site = row.copyKind === 'BUNDLE'
      ? (await prisma.executionSite.findUnique({ where: { id: row.executionSiteId }, select: { siteId: true } }))?.siteId
      : (await locateWorkspace(row.workspaceId))?.logicalSiteId
    return site ? await isWorking(site, branch) : true
  } catch {
    return true
  }
}

/** The idle stop and the openings never answered; one pass. */
export async function sweepOnce(now = new Date()): Promise<number> {
  let stopped = 0
  const rows = await prisma.livePreview.findMany({ where: { state: { in: LIVE } } })
  const sites = new Map((await prisma.executionSite.findMany({
    where: { id: { in: [...new Set(rows.map(r => r.executionSiteId))] } }, select: SITE_SELECT,
  })).map(s => [s.id, s]))
  for (const row of rows) {
    const site = sites.get(row.executionSiteId)
    if (row.state === 'STARTING') {
      if (now.getTime() - row.openedAt.getTime() > OPEN_TIMEOUT_MS * 3) {
        const moved = await moveLivePreview(row.id, {
          state: 'STOPPED', reason: 'failed', signal: null, since: now, stoppedAt: now,
          detail: `${site?.label ?? 'Its site'} never said it started. Nothing was left running; start it again.`,
        })
        if (moved && site && (await stopOnSite(site.siteId, row.id, 'person')).answered) await releaseCopyAfterStop(moved)
        if (moved) stopped++
      }
      continue
    }
    if (row.state !== 'RUNNING' || !site) continue
    const idleMs = settingOf(site).idleMinutes * 60_000
    if (now.getTime() - row.lastUsedAt.getTime() < idleMs) continue
    if (await runGoing(row)) {
      await touchLivePreview(row.id, now)
      continue
    }
    if ((await stopAs(row, 'idle')).stopped) stopped++
  }
  return stopped
}

export function startLivePreviewSweep(intervalMs = 60_000): void {
  setInterval(() => { void sweepTick() }, intervalMs).unref()
}

/** One minute's work: nothing while the live preview's flag is off. */
export async function sweepTick(): Promise<void> {
  try {
    if (!(await livePreviewFeatureOn())) return
  } catch (err) {
    return logger.error('live preview sweep: the feature switches could not be read', err)
  }
  await Promise.all([
    sweepOnce().catch(err => logger.error('live preview sweep failed', err)),
    bringBackPending().catch(() => {}),
  ])
}

/** A run starting or ending on a branch keeps its live preview in use. */
async function runChanged(e: Pick<RunStatusEvent, 'sessionId' | 'status'>): Promise<void> {
  const branch = await branchOfSession(e.sessionId)
  if (!branch) return
  const row = await livePreviewOn(prisma, { workspaceId: branch.workspaceId, branchId: branch.id })
  if (row) await touchLivePreview(row.id)
}

onRunStatus('livePreviews', whileLivePreviewOn(runChanged))
