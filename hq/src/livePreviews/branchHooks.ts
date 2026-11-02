/**
 * What branch work does to live previews (live preview spec sections 3 to 5):
 *
 * - a branch merged and closed, deleted, or whose copy is removed stops its live preview;
 * - a merge first brings back the commits a live preview on another site holds;
 * - `main` moving brings `main`'s live preview, and every live preview's own copy on another site, up to its new tip
 *   (`livePreview.refresh`), so `update_from_main` runs there as on the workspace's site;
 * - a rename stops the branch's live preview and carries its apps to the new name, so their addresses stay;
 * - a workspace removed stops all its live previews and forgets its apps; every other site that ran one of them is
 *   told the workspace is gone (`workspace.delete`), so its services' volumes and approvals go there too.
 */
import { HttpError, prisma } from 'wasp/server'
import type { LivePreview } from '@prisma/client'
import { LIVE_PREVIEW_METHODS, type LivePreviewStopper } from '@agenthix/core'
import { locateWorkspace } from '../branches/workspaceLocation'
import { siteCall } from '../branches/siteCalls'
import { deleteWorkspaceAt } from '../storage/workspaceStore'
import { BRANCH_READ_METHODS } from '@agenthix/core'
import { Logger } from '../server/utils/logger'
import { LIVE, livePreviewOn } from './store'
import { stopAs } from './stopping'
import { bringBack } from './back'
import { carryBundle, dropBundle } from './bundles'
import { askSite } from './siteAsk'
import { NOTHING } from './words'

const logger = new Logger('LivePreviewBranches')

export async function stopBranchPreview(workspaceId: string, branchId: string, by: LivePreviewStopper): Promise<void> {
  const row = await livePreviewOn(prisma, { workspaceId, branchId })
  if (row) await stopAs(row, by).catch(err => logger.warn(`live preview ${row.id} not stopped: ${err instanceof Error ? err.message : String(err)}`))
}

/** Before a merge: the branch's commits on another site come back, or the merge is refused in words. */
export async function bringBackBeforeMerge(branchId: string): Promise<void> {
  const row = await prisma.livePreview.findFirst({ where: { branchId, copyKind: 'BUNDLE', state: { in: LIVE } } })
  if (!row) return
  try {
    await bringBack(row.id)
  } catch {
    throw new HttpError(503, `${row.branch}'s live preview runs on another site, and its latest commits could not be brought back to merge. Try again in a minute. ${NOTHING}`)
  }
}

export async function renamedBranch(workspaceId: string, from: string, to: string): Promise<void> {
  await prisma.liveApp.updateMany({ where: { workspaceId, branch: from }, data: { branch: to } })
}

export async function workspaceRemoved(workspaceId: string, deps: { deleteAt: typeof deleteWorkspaceAt } = { deleteAt: deleteWorkspaceAt }): Promise<void> {
  const rows = await prisma.livePreview.findMany({ where: { workspaceId, state: { in: LIVE } } })
  for (const row of rows) await stopAs(row, 'person').catch(() => {})
  await prisma.liveApp.deleteMany({ where: { workspaceId } })
  // The workspace's own site is told by the workspace's removal itself.
  const home = await locateWorkspace(workspaceId)
  const ran = await prisma.livePreview.findMany({
    where: { workspaceId, ...(home ? { executionSiteId: { not: home.executionSiteId } } : {}) },
    distinct: ['executionSiteId'], select: { executionSiteId: true },
  })
  for (const { executionSiteId } of ran) {
    const site = await prisma.executionSite.findUnique({ where: { id: executionSiteId }, select: { siteId: true } })
    if (!site) continue
    await deps.deleteAt(site.siteId, workspaceId)
      .catch(err => logger.warn(`site ${site.siteId} not told workspace ${workspaceId} is gone: ${err instanceof Error ? err.message : String(err)}`))
  }
}

async function refreshOne(row: LivePreview, mainHead: string, home: { siteId: string; executionSiteId: string; name: string }): Promise<void> {
  const site = await prisma.executionSite.findUnique({ where: { id: row.executionSiteId }, select: { siteId: true, label: true } })
  if (!site) return
  let bundleId: string | null = null
  if (row.copyKind === 'BUNDLE') {
    const ws = await locateWorkspace(row.workspaceId)
    if (!ws) return
    const carried = await carryBundle({
      source: { kind: 'main', workspace: ws.ref }, prerequisites: [],
      from: home, to: { siteId: site.siteId, executionSiteId: row.executionSiteId, name: site.label },
      direction: 'toPreview', personId: row.userId, workspaceId: row.workspaceId, branch: row.branch,
    })
    if (!carried.carried) return
    bundleId = carried.bundleId
  }
  try {
    const answer = await askSite(site.siteId, LIVE_PREVIEW_METHODS.refresh, { livePreviewId: row.id, head: mainHead, bundleId })
    if (answer.ok && row.onMain) await prisma.livePreview.updateMany({ where: { id: row.id, state: { in: LIVE } }, data: { headCommit: answer.head } })
  } finally {
    if (bundleId) dropBundle(site.siteId, bundleId)
  }
}

/** `main` moved (a merge, a restore, a version from GitHub): its live preview and the live previews' own copies follow. */
export async function mainMoved(workspaceId: string): Promise<void> {
  const rows = await prisma.livePreview.findMany({
    where: { workspaceId, state: { in: ['RUNNING', 'PAUSED'] }, OR: [{ copyKind: 'MAIN' }, { copyKind: 'BUNDLE' }] },
  })
  if (rows.length === 0) return
  const ws = await locateWorkspace(workspaceId)
  if (!ws) return
  const [list, homeSite] = await Promise.all([
    siteCall(ws.logicalSiteId, BRANCH_READ_METHODS.list, { workspace: ws.ref, merged: [] }),
    prisma.executionSite.findUnique({ where: { id: ws.executionSiteId }, select: { label: true } }),
  ])
  const home = { siteId: ws.logicalSiteId, executionSiteId: ws.executionSiteId, name: homeSite?.label ?? 'its site' }
  for (const row of rows) {
    await refreshOne(row, list.main.head, home)
      .catch(err => logger.warn(`live preview ${row.id} not brought up to main: ${err instanceof Error ? err.message : String(err)}`))
  }
}
