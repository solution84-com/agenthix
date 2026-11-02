/**
 * A person renaming or deleting a branch (live preview spec, *Branch names*; *Defaults for review* 9): a Member or
 * Admin of the project. Deleting is for an unmerged branch whose work is over: refused while an agent works on it.
 * The confirmation says how many commits are lost; the site counts them as it deletes.
 */
import { HttpError, prisma } from 'wasp/server'
import { BRANCH_WORK_METHODS, isWorkBranchName, WORK_BRANCH_NAME_MAX } from '@agenthix/core'
import { siteCall } from './siteCalls'
import { liveCopyOf, lockWork, lockWorkspaceNames, openBranchById, refOfBranch, workOfBranch } from './branchRows'
import { reachWorkspace, requireUser } from './workspaceAccess'
import { agentsWorking, isStarting } from './working'
import { emitBranchChange } from './workspaceEvents'
import { asBranchHttp } from './refusals'

/** Live previews' side of branch work, loaded when first needed: live previews reach branch work themselves. */
const livePreviews = () => import('../livePreviews/branchHooks')

type Ctx = { user?: { id: string } | null }

async function requireOpenBranch(branchId: unknown) {
  const b = await openBranchById(null, branchId)
  if (!b) throw new HttpError(404, 'That branch is not open any more. Reload to see where it stands. Nothing was changed.')
  return b
}

export async function renameBranch(args: { branchId: string; name: string }, context: Ctx): Promise<{ name: string }> {
  const userId = requireUser(context)
  const b = await requireOpenBranch(args?.branchId)
  const ws = await reachWorkspace(b.workspaceId, userId, 'work')
  const to = typeof args.name === 'string' ? args.name.trim() : ''
  if (to === b.name) return { name: to }
  if (!isWorkBranchName(to)) {
    throw new HttpError(400, `A branch name is lowercase letters and digits in words joined by hyphens, at most ${WORK_BRANCH_NAME_MAX} characters, such as add-login-page. Nothing was changed.`)
  }
  return asBranchHttp(async () => {
    await prisma.$transaction(async (tx) => {
      await lockWorkspaceNames(tx, b.workspaceId)
      const taken = await tx.workspaceBranch.findFirst({ where: { workspaceId: b.workspaceId, state: 'OPEN', name: to }, select: { id: true } })
      if (taken) throw new HttpError(409, `This workspace already has a branch called ${to}. Choose another name. Nothing was changed.`)
    })
    // Its live preview runs under the old name: stopped first, and its apps keep their addresses under the new one.
    await (await livePreviews()).stopBranchPreview(b.workspaceId, b.id, 'person')
    const done = await siteCall(ws.logicalSiteId, BRANCH_WORK_METHODS.rename, {
      workspace: ws.ref, from: b.name, to, copyId: liveCopyOf(b)?.folderId ?? null,
    })
    await prisma.workspaceBranch.updateMany({ where: { id: b.id, name: b.name }, data: { name: done.name } })
    await (await livePreviews()).renamedBranch(b.workspaceId, b.name, done.name)
    emitBranchChange({ ...b, name: done.name }, 'renamed')
    return { name: done.name }
  })
}

export async function deleteBranch(args: { branchId: string }, context: Ctx): Promise<{ lostCommits: number }> {
  const userId = requireUser(context)
  const b = await requireOpenBranch(args?.branchId)
  const ws = await reachWorkspace(b.workspaceId, userId, 'work')
  const work = workOfBranch(b)
  return asBranchHttp(async () => {
    const working = (await agentsWorking(ws.logicalSiteId, ws.ref, [b])).get(b.id)
    if (working) throw new HttpError(409, `${working} is working on this branch. Stop its work first, then delete the branch. Nothing was changed.`)
    const marked = await prisma.$transaction(async (tx) => {
      if (work) await lockWork(tx, work)
      if (isStarting(b.id)) return false
      const { count } = await tx.workspaceBranch.updateMany({ where: { id: b.id, state: 'OPEN' }, data: { state: 'DELETED', deletedAt: new Date() } })
      return count === 1
    })
    if (!marked) throw new HttpError(409, 'An agent has just started on this branch. Stop its work first, then delete the branch. Nothing was changed.')
    await (await livePreviews()).stopBranchPreview(b.workspaceId, b.id, 'person')
    try {
      const done = await siteCall(ws.logicalSiteId, BRANCH_WORK_METHODS.delete, {
        workspace: refOfBranch(b), branch: b.name, copyId: liveCopyOf(b)?.folderId ?? null,
      })
      await prisma.branchCopy.updateMany({ where: { branchId: b.id, state: { not: 'REMOVED' } }, data: { state: 'REMOVED', removedAt: new Date() } })
      emitBranchChange(b, 'deleted')
      return { lostCommits: done.lostCommits }
    } catch (err) {
      // The site deleted nothing: the branch is open again, as it was.
      await prisma.workspaceBranch.update({ where: { id: b.id }, data: { state: 'OPEN', deletedAt: null } })
      throw err
    }
  })
}
