/**
 * Removing a branch's working copy (live preview spec, *Defaults for review* 8): when its branch is merged with no
 * agent on it, when its task is done or archived, when its conversation is archived, and when its branch or its
 * workspace is deleted. The branch stays in the workspace's repository. A copy is marked REMOVING first, so a site out
 * of reach is asked again later (`retryRemovals`); the site's removal is safe to ask twice.
 */
import { prisma } from 'wasp/server'
import { BRANCH_WORK_METHODS, BranchWorkError } from '@agenthix/core'
import { siteCall } from './siteCalls'
import { refOfBranch } from './branchRows'
import { Logger } from '../server/utils/logger'

const logger = new Logger('BranchCopies')

/** Marks the branch's live copies REMOVING and asks their site to remove them; never throws. */
export async function removeCopiesOf(branchId: string): Promise<void> {
  await prisma.branchCopy.updateMany({ where: { branchId, state: { in: ['MAKING', 'READY'] } }, data: { state: 'REMOVING' } })
  await askRemovals({ branchId })
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
