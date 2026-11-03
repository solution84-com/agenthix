/**
 * The agent's code-work tools on hq's data path (core's `codeWork/`): `commit` and `merge_into_main`, forwarded by
 * the run's site with the calling run's id. The branch and its copy are found from the run's own session (its task,
 * or its conversation's worker in the workspace), never from anything the agent says: a run that works on no branch
 * has neither tool. The run must be this capability's, still going, on the site the copy is on.
 *
 * - `commit`: the agent is the commit's author, the person the work is for its `On-behalf-of:` (*Defaults for review* 1).
 * - `update_from_main`: merges `main` into the branch in its copy, written as `commit` is; clashes are left in the
 *   copy with Git's markers for the agent to resolve, and its next `commit` finishes the merge.
 * - `merge_into_main`: as the person the work is for, and only when they may merge here (a Member or Admin, or the
 *   owner of their own storage). The tool's description says to use it only when the person asked.
 */
import { BRANCH_WORK_METHODS, COMMIT_RELOAD_NOTE, LIVE_PREVIEW_METHODS, isCommitMessage, type CommitToolResult, type MergeToolResult, type UpdateToolResult } from '@agenthix/core'
import { prisma } from 'wasp/server'
import { ControlPlaneError, type CallerContext } from '../server/controlplane/types'
import { personOfRun } from '../server/controlplane/runOnBehalfOf'
import * as siteRuntimeStore from '../sessions/siteRuntimeStore'
import { branchOfSession, liveCopyOf, refOfBranch, type BranchWithCopies } from './branchRows'
import { gitPersonForAgent, gitPersonForUser } from './gitPeople'
import { siteCall } from './siteCalls'
import { locateWorkspace } from './workspaceLocation'
import { emitBranchChange } from './workspaceEvents'
import { askToMerge, NoOneToAsk } from './mergeCard'
import { mainName } from './merge'
import { clashesLeftNote, updateNote } from './updateWords'
import { asBranchTool } from './refusals'
import { whoseOf } from './whose'
import { livePreviewOfSession, runsGoToPreviewSite } from '../livePreviews/runs'
import { bringBack } from '../livePreviews/back'
import { askSite } from '../livePreviews/siteAsk'
import { refusalWords } from '../livePreviews/words'
import { livePreviewOn } from '../livePreviews/store'

/**
 * `siteId` is the site the run is on, where its copy is; `homeSiteId` the site holding the workspace. They differ
 * only while the branch's live preview runs on another site: the run then works in the live preview's own copy
 * (`livePreviewId`), and its commits come back by bundle (livePreviews/back.ts).
 */
type CallingBranch = {
  branch: BranchWithCopies; copyId: string; siteId: string; homeSiteId: string; livePreviewId: string | null
  agentId: string; runId: string; person: string | null
}

async function callingBranch(ctx: CallerContext, runId: unknown, tool: string): Promise<CallingBranch> {
  if (ctx.kind !== 'run') throw new ControlPlaneError('forbidden', `${tool} is for an agent's run`)
  if (typeof runId !== 'string' || !runId || runId.length > 200) {
    throw new ControlPlaneError('invalid', `${tool} needs the run it is called from, which this site did not say. Nothing was changed.`)
  }
  const { claims } = ctx
  const run = await siteRuntimeStore.getRun(claims.siteId, runId)
  if (!run || run.sessionId !== claims.sessionId || (run.taskId ?? null) !== (claims.taskId ?? null)) {
    throw new ControlPlaneError('forbidden', `${tool} names a run that is not this one. Nothing was changed.`)
  }
  if (run.status !== 'RUNNING' && run.status !== 'PENDING') throw new ControlPlaneError('invalid', 'This run has already ended. Nothing was changed.')
  const onNone = new ControlPlaneError('invalid', `${tool} works only in a run on a code workspace's branch, and this run is on none. Nothing was changed.`)
  const branch = await branchOfSession(claims.sessionId)
  if (!branch) throw onNone
  const live = liveCopyOf(branch)
  const copy = live?.state === 'READY' ? live : null
  const home = copy ? (await prisma.executionSite.findUnique({ where: { id: copy.siteId }, select: { siteId: true } }))?.siteId ?? null : null
  // A run in a live preview's own copy on another site needs no copy on the workspace's site: a done task's is removed.
  const homeSiteId = home ?? (await locateWorkspace(branch.workspaceId))?.logicalSiteId ?? ''
  const common = { branch, agentId: claims.agentId, runId, person: await personOfRun(claims), homeSiteId }
  if (copy && home === claims.siteId) return { ...common, copyId: copy.folderId, siteId: claims.siteId, livePreviewId: null }
  const lp = await livePreviewOfSession(claims.sessionId)
  if (runsGoToPreviewSite(lp) && lp.logicalSiteId === claims.siteId) {
    return { ...common, copyId: lp.row.copyId, siteId: claims.siteId, livePreviewId: lp.row.id }
  }
  if (!copy) throw onNone
  throw new ControlPlaneError('forbidden', `${tool}: this run is not on the site its branch's copy is on. Nothing was changed.`)
}

export async function commitOp(ctx: CallerContext, args: { message: string; runId?: string }): Promise<CommitToolResult> {
  const at = await callingBranch(ctx, args?.runId, 'commit')
  const message = typeof args.message === 'string' ? args.message.trim() : ''
  if (!isCommitMessage(message)) throw new ControlPlaneError('invalid', 'commit needs a message saying what changed. Nothing was committed.')
  if (at.livePreviewId) return commitInPreview(at, message)
  return asBranchTool(async () => {
    const result = await siteCall(at.siteId, BRANCH_WORK_METHODS.commit, {
      workspace: refOfBranch(at.branch), copyId: at.copyId, branch: at.branch.name, message,
      author: await gitPersonForAgent(at.agentId),
      onBehalfOf: at.person ? await gitPersonForUser(at.person) : null,
      runId: at.runId,
    })
    if (!result.committed) {
      if (result.reason === 'clashes_left') return { committed: false, reason: 'clashes_left', paths: result.paths, note: clashesLeftNote(result.paths) }
      return { committed: false, reason: 'nothing_to_commit' }
    }
    emitBranchChange(at.branch, 'commits')
    return { committed: true, commit: result.commit, branch: at.branch.name, files: result.files, ...(await reloadNote(at)) }
  })
}

/** `commit` in a live preview's own copy on another site; its commits are then brought back by bundle. */
async function commitInPreview(at: CallingBranch, message: string): Promise<CommitToolResult> {
  const answer = await askSite(at.siteId, LIVE_PREVIEW_METHODS.commit, {
    livePreviewId: at.livePreviewId!, message, author: await gitPersonForAgent(at.agentId),
    onBehalfOf: at.person ? await gitPersonForUser(at.person) : null, runId: at.runId,
  }).catch(() => { throw new ControlPlaneError('unavailable', 'The site this run is on is not answering. Nothing was committed.') })
  if (!answer.ok) throw new ControlPlaneError('conflict', refusalWords(answer.refusal, 'The site this run is on', at.branch.name))
  if (!answer.result.committed) return { committed: false, reason: 'nothing_to_commit' }
  void bringBack(at.livePreviewId!).catch(() => {})
  return { committed: true, commit: answer.result.commit, branch: at.branch.name, files: answer.result.files, ...(await reloadNote(at)) }
}

/** The commit's note while the branch's live preview is open (W14 of the live preview walk). */
async function reloadNote(at: CallingBranch): Promise<{ note?: string }> {
  const open = await livePreviewOn(prisma, { workspaceId: at.branch.workspaceId, branchId: at.branch.id }).catch(() => null)
  return open ? { note: COMMIT_RELOAD_NOTE } : {}
}

export async function updateFromMainOp(ctx: CallerContext, args: { runId?: string }): Promise<UpdateToolResult> {
  const at = await callingBranch(ctx, args?.runId, 'update_from_main')
  return asBranchTool(async () => {
    const result = await siteCall(at.siteId, BRANCH_WORK_METHODS.updateFromMain, {
      workspace: refOfBranch(at.branch), copyId: at.copyId, branch: at.branch.name,
      author: await gitPersonForAgent(at.agentId),
      onBehalfOf: at.person ? await gitPersonForUser(at.person) : null,
      runId: at.runId,
    })
    const words = { branch: at.branch.name, main: await mainName(at.homeSiteId, refOfBranch(at.branch)) }
    switch (result.outcome) {
      case 'updated':
        emitBranchChange(at.branch, 'commits')
        return { updated: true, ...words, commit: result.commit, note: updateNote('updated', words) }
      case 'clashes':
      case 'merge_under_way':
        return { updated: false, reason: result.outcome, ...words, paths: result.paths, note: updateNote(result.outcome, words, result.paths) }
      default:
        return { updated: false, reason: result.outcome, ...words, note: updateNote(result.outcome, words) }
    }
  })
}

/** What a merge says when no summary was given: *Kernel for Mia · Login page*, as the dialog prefills it. */
async function defaultSummary(b: BranchWithCopies, agentId: string): Promise<string> {
  const [agent, whose] = await Promise.all([
    prisma.agent.findUnique({ where: { id: agentId }, select: { name: true } }),
    whoseOf([b]),
  ])
  const w = whose.get(b.id)
  const who = [agent?.name, w?.personName].filter(Boolean).join(' for ')
  return [who, w?.title ?? b.name].filter(Boolean).join(' · ')
}

export async function mergeIntoMainOp(ctx: CallerContext, args: { summary?: string; runId?: string }): Promise<MergeToolResult> {
  const at = await callingBranch(ctx, args?.runId, 'merge_into_main')
  if (!at.person) throw new ControlPlaneError('forbidden', 'merge_into_main asks the person the work is for, and this run is for no one. Nothing was merged.')
  const person = at.person
  const given = typeof args.summary === 'string' ? args.summary.trim() : ''
  const message = given || await defaultSummary(at.branch, at.agentId)
  if (!isCommitMessage(message)) throw new ControlPlaneError('invalid', 'merge_into_main needs a one-line summary. Nothing was merged.')
  return asBranchTool(async () => {
    try {
      // A live preview on another site holds commits that may not be back yet: they come back first.
      if (at.livePreviewId) await bringBack(at.livePreviewId)
      return await askToMerge({ branch: at.branch, logicalSiteId: at.homeSiteId, agentId: at.agentId, personId: person, message })
    } catch (err) {
      if (err instanceof NoOneToAsk) throw new ControlPlaneError('invalid', err.message)
      throw err
    }
  })
}
