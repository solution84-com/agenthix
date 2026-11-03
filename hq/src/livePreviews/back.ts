/**
 * Commits coming back from a live preview on another site (live preview spec section 5, *On another site*): while it
 * runs there, the branch's runs work in its own copy, and each commit comes back to the workspace's repository the same
 * way the branch went: a bundle of what the repository lacks, made on the preview's site, carried by a relay, and
 * brought back on the workspace's site in the commit helper, writing only that branch's name.
 *
 * hq keeps how far it got (`LivePreview.pendingBack`), so a stop, a restart or a site that was away finishes it. One
 * bringing back per live preview at a time; a move that arrives meanwhile is picked up by the next round.
 */
import { prisma } from 'wasp/server'
import { Prisma, type LivePreview } from '@prisma/client'
import {
  BRANCH_BRING_BACK_BUNDLE_METHOD, BRANCH_READ_METHODS, isCommitId, isGitBranchName,
  type CommitId, type LivePreviewPendingBack,
} from '@agenthix/core'
import { locateWorkspace, type LocatedWorkspace } from '../branches/workspaceLocation'
import { siteCall } from '../branches/siteCalls'
import { emitBranchChange } from '../branches/workspaceEvents'
import { askSite } from './siteAsk'
import { carryBundle, dropBundle } from './bundles'
import { livePreviewById, touchLivePreview } from './store'
import { Logger } from '../server/utils/logger'

const logger = new Logger('LivePreviewBack')

/** How many times a bundle is made again when the branch moved in the workspace's repository meanwhile. */
const TRIES = 3

const running = new Map<string, Promise<void>>()
const again = new Set<string>()

async function branchTip(ws: LocatedWorkspace, branch: string): Promise<CommitId | null> {
  const list = await siteCall(ws.logicalSiteId, BRANCH_READ_METHODS.list, { workspace: ws.ref, merged: [] })
  return list.branches.find(b => b.name === branch)?.head ?? null
}

async function keepPending(id: string, pending: LivePreviewPendingBack | null): Promise<void> {
  await prisma.livePreview.update({ where: { id }, data: { pendingBack: pending === null ? Prisma.DbNull : (pending as unknown as Prisma.InputJsonValue) } })
}

async function once(row: LivePreview): Promise<void> {
  if (row.copyKind !== 'BUNDLE' || row.onMain || !row.branchId) return
  const [ws, site] = await Promise.all([
    locateWorkspace(row.workspaceId),
    prisma.executionSite.findUnique({ where: { id: row.executionSiteId }, select: { siteId: true, label: true } }),
  ])
  if (!ws || !site) return
  const wsSite = await prisma.executionSite.findUnique({ where: { id: ws.executionSiteId }, select: { label: true } })
  const since = new Date().toISOString()
  for (let attempt = 0; attempt < TRIES; attempt++) {
    const previous = await branchTip(ws, row.branch)
    const pending: LivePreviewPendingBack = { since, head: row.headCommit ?? '', previous, step: 'make', bundleId: null, detail: null }
    await keepPending(row.id, pending)
    let bundleId: string | null = null
    try {
      const carried = await carryBundle({
        source: { kind: 'livePreview', livePreviewId: row.id }, prerequisites: previous ? [previous] : [],
        from: { siteId: site.siteId, executionSiteId: row.executionSiteId, name: site.label },
        to: { siteId: ws.logicalSiteId, executionSiteId: ws.executionSiteId, name: wsSite?.label ?? 'its site' },
        direction: 'back', personId: row.userId, workspaceId: row.workspaceId, branch: row.branch,
      })
      if (!carried.carried) {
        await keepPending(row.id, null)
        return
      }
      bundleId = carried.bundleId
      await keepPending(row.id, { ...pending, head: carried.head, step: 'bringBack', bundleId })
      const result = await askSite(ws.logicalSiteId, BRANCH_BRING_BACK_BUNDLE_METHOD, {
        workspace: ws.ref, branch: row.branch, bundleId, expectedPrevious: previous,
      })
      if (!result.brought) continue
      await keepPending(row.id, null)
      if (result.back.moved) {
        await prisma.workspaceBranch.update({ where: { id: row.branchId }, data: { updatedAt: new Date() } })
        emitBranchChange({ workspaceId: row.workspaceId, id: row.branchId, name: row.branch }, 'commits')
      }
      return
    } catch (err) {
      const detail = err instanceof Error ? err.message.slice(0, 500) : String(err)
      await keepPending(row.id, { ...pending, bundleId, detail })
      throw err
    } finally {
      if (bundleId) dropBundle(ws.logicalSiteId, bundleId)
    }
  }
  logger.warn(`live preview ${row.id}: ${row.branch} kept moving in the workspace's repository; tried ${TRIES} times`)
}

/** Brings the live preview's new commits back; a call while one runs is folded into one more round after it. */
export function bringBack(livePreviewId: string): Promise<void> {
  const current = running.get(livePreviewId)
  if (current) {
    again.add(livePreviewId)
    return current
  }
  const work = (async () => {
    try {
      do {
        again.delete(livePreviewId)
        const row = await livePreviewById(livePreviewId)
        if (row) await once(row)
      } while (again.has(livePreviewId))
    } finally {
      running.delete(livePreviewId)
    }
  })()
  running.set(livePreviewId, work)
  return work
}

/** Every live preview that still has commits to bring back: on a site's return, and on the sweep. */
export async function bringBackPending(): Promise<void> {
  const rows = await prisma.livePreview.findMany({
    where: { copyKind: 'BUNDLE', NOT: { pendingBack: { equals: Prisma.DbNull } } }, select: { id: true },
  })
  for (const r of rows) await bringBack(r.id).catch(() => {})
}

/** `livePreview.branchMoved`: counts only for a BUNDLE live preview hq opened on that site, on that branch. */
export async function handleBranchMoved(siteId: string, data: unknown): Promise<void> {
  const d = data && typeof data === 'object' ? (data as Record<string, unknown>) : null
  const row = await livePreviewById(d?.livePreviewId)
  const site = row ? await prisma.executionSite.findUnique({ where: { id: row.executionSiteId }, select: { siteId: true } }) : null
  const branch = d?.branch, head = d?.head
  if (!row || site?.siteId !== siteId || row.copyKind !== 'BUNDLE' || row.onMain || !isGitBranchName(branch) || branch !== row.branch || !isCommitId(head)) {
    logger.warn(`site ${siteId}: dropped a livePreview.branchMoved it may not send`)
    return
  }
  await prisma.livePreview.update({ where: { id: row.id }, data: { headCommit: head } })
  await touchLivePreview(row.id)
  await bringBack(row.id).catch(err => logger.warn(`live preview ${row.id}: commits not brought back yet: ${err instanceof Error ? err.message : String(err)}`))
}

export function __resetBackForTests(): void {
  running.clear()
  again.clear()
}
