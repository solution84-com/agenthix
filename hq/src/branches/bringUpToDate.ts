/**
 * *Bring up to date* in the workspace view: the branch's own agent is asked to bring `main` into the branch, on behalf
 * of the person who pressed it, as a clash used to ask it (`clashAsk.ts`): for a conversation, a message from them in
 * it; for a task, a comment from them and the task run again. Pressing it needs what merging needs: a Member or Admin
 * of the project, or the owner of their own storage.
 */
import { HttpError } from 'wasp/server'
import { openBranchById, workOfBranch } from './branchRows'
import { reachWorkspace, requireUser } from './workspaceAccess'
import { askAgentAboutClash } from './clashAsk'
import { mainName } from './merge'

type Ctx = { user?: { id: string } | null }

export function updateAskText(branch: string, main: string): string {
  return `Please bring ${branch} up to date with ${main}: call update_from_main, resolve any clashes it names, check the work ` +
    'still works, and call commit if it asks you to finish the merge. Then tell me here that it is ready to merge. Do not ' +
    'merge it yourself, and do not start the app or open a live preview for this: I only need the branch ready to merge.'
}

export async function bringBranchUpToDate(args: { branchId: string }, context: Ctx): Promise<{ asked: true }> {
  const userId = requireUser(context)
  const branch = await openBranchById(null, args?.branchId)
  if (!branch) throw new HttpError(404, 'That branch is not open any more. Reload to see where it stands. Nothing was changed.')
  const ws = await reachWorkspace(branch.workspaceId, userId, 'work')
  const work = workOfBranch(branch)
  if (!work) throw new HttpError(409, `${branch.name} belongs to no conversation or task, so no agent can bring it up to date. Nothing was changed.`)
  const main = await mainName(ws.logicalSiteId, ws.ref)
  if (!(await askAgentAboutClash(work, userId, updateAskText(branch.name, main)))) {
    throw new HttpError(409, `${branch.name}'s agent could not be asked to bring it up to date. Ask it in the branch's chat. Nothing was changed.`)
  }
  return { asked: true }
}
