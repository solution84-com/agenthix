/**
 * Merge into main (live preview spec, part 3): a branch's changes since it left `main`, or since its last merge, go
 * in as one squashed version, counted from the merge base hq keeps. The site refuses when `main` is not the one the
 * person saw (`main_moved`), so two merges at once make one version and the other is told; hq's own record of the
 * last merge moves only from the value it was read with.
 *
 * - A clash merges nothing, and goes to the branch's agent at once, on the person's behalf (`clashAsk.ts`).
 * - While an agent works on the branch, a merge is a checkpoint: the branch stays open and its next merge brings in
 *   what came after.
 * - Otherwise the branch closes: it leaves the repository, its copy goes, and its work says it was merged.
 */
import { HttpError, prisma } from 'wasp/server'
import { BRANCH_READ_METHODS, BRANCH_WORK_METHODS, MAIN_WORK_METHODS, isCommitId, isCommitMessage, type WorkspaceRepoRef } from '@agenthix/core'
import { siteCall } from './siteCalls'
import { liveCopyOf, lockWork, mergeBaseOf, refOfBranch, workOfBranch, type BranchWithCopies } from './branchRows'
import { gitPersonForUser } from './gitPeople'
import { isStarting, isWorking } from './working'
import { emitBranchChange, emitMainChange } from './workspaceEvents'
import { askAgentAboutClash, clashAskText, sayMerged } from './clashAsk'
import { pullMainFirst, pushMainAfter } from './githubMain'
import { removeCopiesOf } from './copies'
import type { MergeBranchResult } from './views'
import { Logger } from '../server/utils/logger'

const logger = new Logger('BranchMerge')

export type MergeAsk = {
  branch: BranchWithCopies
  logicalSiteId: string
  /** The person merging: who pressed *Merge*, or who told the agent to. */
  personId: string
  message: string
  expectedMain: string
  /** False when the branch's own agent merges: it is told of a clash in the tool's answer. */
  askAgentOnClash?: boolean
}

export function requireMergeInput(message: unknown, expectedMain: unknown): { message: string; expectedMain: string } {
  const text = typeof message === 'string' ? message.trim() : ''
  if (!isCommitMessage(text)) throw new HttpError(400, 'A merge needs a summary: a few words saying what the work does. Nothing was changed.')
  if (!isCommitId(expectedMain)) throw new HttpError(400, 'A merge names the version of main it was shown. Reload and try again. Nothing was changed.')
  return { message: text, expectedMain }
}

export async function mergeBranch(ask: MergeAsk): Promise<MergeBranchResult> {
  const b = ask.branch
  const ref = refOfBranch(b)
  await pullMainFirst(ask.logicalSiteId, ref, ask.personId)
  const result = await siteCall(ask.logicalSiteId, MAIN_WORK_METHODS.merge, {
    workspace: ref, branch: b.name, base: mergeBaseOf(b), expectedMain: ask.expectedMain,
    message: ask.message, author: await gitPersonForUser(ask.personId),
  })
  if (!result.merged) {
    if (result.reason === 'main_moved') return { outcome: 'main_moved' }
    if (result.reason === 'nothing_to_merge') return { outcome: 'nothing_to_merge' }
    const work = workOfBranch(b)
    const main = await mainName(ask.logicalSiteId, ref)
    const agentAsked = work && ask.askAgentOnClash !== false ? await askAgentAboutClash(work, ask.personId, clashAskText(b.name, main, result.clashes)) : false
    return { outcome: 'clash', clashes: result.clashes, agentAsked }
  }

  const { count } = await prisma.workspaceBranch.updateMany({
    where: { id: b.id, lastMergedCommit: b.lastMergedCommit },
    data: { lastMergedCommit: result.mergedCommit, lastMergedVersion: result.version.commit },
  })
  if (count === 0) logger.warn(`branch ${b.id} was merged twice at once; its merge base is the later one`)
  emitBranchChange(b, 'merged')
  emitMainChange(b.workspaceId, 'merged', result.version.number, b.id)
  const github = await pushMainAfter(ask.logicalSiteId, ref, ask.personId)
  const branchClosed = await closeAfterMerge(b, ask.logicalSiteId, ask.personId, result.version.number)
  return { outcome: 'merged', versionNumber: result.version.number, branchClosed, github }
}

export async function mainName(logicalSiteId: string, ref: WorkspaceRepoRef): Promise<string> {
  try {
    return (await siteCall(logicalSiteId, BRANCH_READ_METHODS.list, { workspace: ref, merged: [] })).main.name
  } catch {
    return 'main'
  }
}

/** Closes the branch unless an agent works on it, or a run is starting on it under the work's lock. */
async function closeAfterMerge(b: BranchWithCopies, logicalSiteId: string, personId: string, version: number): Promise<boolean> {
  const work = workOfBranch(b)
  if (!work) return false
  try {
    if (await isWorking(logicalSiteId, b)) return false
  } catch (err) {
    logger.warn(`branch ${b.id} kept open: could not tell whether an agent works on it: ${err instanceof Error ? err.message : String(err)}`)
    return false
  }
  const closed = await prisma.$transaction(async (tx) => {
    await lockWork(tx, work)
    if (isStarting(b.id)) return false
    const { count } = await tx.workspaceBranch.updateMany({ where: { id: b.id, state: 'OPEN' }, data: { state: 'MERGED', mergedAt: new Date() } })
    return count === 1
  })
  if (!closed) return false
  await leaveRepository(b, logicalSiteId)
  emitBranchChange(b, 'closed')
  await sayMerged(work, personId, b.name, await mainName(logicalSiteId, refOfBranch(b)), version)
  return true
}

/** A merged branch leaves the repository with its copy; if the site cannot be asked now, the copy is asked again later. */
async function leaveRepository(b: BranchWithCopies, logicalSiteId: string): Promise<void> {
  const copy = liveCopyOf(b)
  try {
    await siteCall(logicalSiteId, BRANCH_WORK_METHODS.delete, { workspace: refOfBranch(b), branch: b.name, copyId: copy?.folderId ?? null })
    await prisma.branchCopy.updateMany({ where: { branchId: b.id, state: { in: ['MAKING', 'READY', 'REMOVING'] } }, data: { state: 'REMOVED', removedAt: new Date() } })
  } catch (err) {
    logger.warn(`merged branch ${b.name} not removed from the repository: ${err instanceof Error ? err.message : String(err)}`)
    await removeCopiesOf(b.id)
  }
}
