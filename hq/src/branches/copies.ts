/**
 * Removing a branch's working copy (live preview spec, *Defaults for review* 8): when its branch is merged with no
 * agent on it, when its task is done or archived, when its conversation is archived, and when its branch or its
 * workspace is deleted. The branch stays in the workspace's repository. A copy is marked REMOVING first, so a site out
 * of reach is asked again later (`retryRemovals`); the site's removal is safe to ask twice.
 *
 * A live preview runs from its branch's copy (live preview spec section 4), and finishing the work is not one of the
 * reasons it stops: a done task's copy is kept while a live preview runs from it, and removed when that stops.
 */
import { prisma } from 'wasp/server'
import { BRANCH_WORK_METHODS, BranchWorkError } from '@agenthix/core'
import { siteCall } from './siteCalls'
import { refOfBranch } from './branchRows'
import { isWorking } from './working'
import { Logger } from '../server/utils/logger'

const logger = new Logger('BranchCopies')

/** Marks the branch's live copies REMOVING and asks their site to remove them; never throws. */
export async function removeCopiesOf(branchId: string): Promise<void> {
  // A live preview binding the copy stops first (live preview spec section 4); loaded when first needed, as live
  // previews reach branch work themselves.
  const branch = await prisma.workspaceBranch.findUnique({ where: { id: branchId }, select: { workspaceId: true } })
  if (branch) await (await import('../livePreviews/branchHooks')).stopBranchPreview(branch.workspaceId, branchId, 'person').catch(() => {})
  await prisma.branchCopy.updateMany({ where: { branchId, state: { in: ['MAKING', 'READY'] } }, data: { state: 'REMOVING' } })
  await askRemovals({ branchId })
}

/** Whether a live preview runs from the branch's copy now, or is starting or paused there. */
export async function livePreviewOnBranch(branchId: string): Promise<boolean> {
  return (await prisma.livePreview.count({ where: { branchId, copyKind: 'BRANCH', state: { in: ['STARTING', 'RUNNING', 'PAUSED'] } } })) > 0
}

/**
 * Removes the branch's copies when its work is over: its task done or archived, no live preview running from the copy
 * and no agent working on it. Called when a run on it ends and when its live preview stops; never throws.
 */
export async function removeCopiesOfFinishedWork(branchId: string): Promise<void> {
  const branch = await prisma.workspaceBranch.findUnique({
    where: { id: branchId },
    include: { copies: { where: { state: { in: ['MAKING', 'READY'] } }, include: { site: { select: { siteId: true } } } } },
  })
  if (!branch?.taskId || !branch.copies.length) return
  const task = await prisma.task.findUnique({ where: { id: branch.taskId }, select: { status: true, archived: true } })
  if (!task || (task.status !== 'DONE' && !task.archived)) return
  if (await livePreviewOnBranch(branchId)) return
  const working = await isWorking(branch.copies[0].site.siteId, branch).catch(() => true)
  if (working) return
  await removeCopiesOf(branchId)
}

/** Asks again for every copy still marked REMOVING: on a site's return. */
export async function retryRemovals(executionSiteId: string): Promise<void> {
  await askRemovals({ siteId: executionSiteId })
}

async function askRemovals(where: { branchId: string } | { siteId: string }): Promise<void> {
  const copies = await prisma.branchCopy.findMany({
    where: { ...where, state: 'REMOVING' },
    include: { branch: { select: { ownerType: true, ownerId: true, workspaceId: true } }, site: { select: { siteId: true } } },
  })
  for (const copy of copies) {
    try {
      await siteCall(copy.site.siteId, BRANCH_WORK_METHODS.removeCopy, { workspace: refOfBranch(copy.branch), copyId: copy.folderId })
      await prisma.branchCopy.update({ where: { id: copy.id }, data: { state: 'REMOVED', removedAt: new Date() } })
    } catch (err) {
      // The site's own record has no such copy: there is nothing left to remove.
      if (err instanceof BranchWorkError && err.code === 'no_copy') {
        await prisma.branchCopy.update({ where: { id: copy.id }, data: { state: 'REMOVED', removedAt: new Date() } })
        continue
      }
      logger.warn(`copy ${copy.folderId} not removed yet; asked again when its site is back: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}
