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
import { BRANCH_WORK_METHODS, isCommitMessage, type CommitToolResult, type MergeToolResult, type UpdateToolResult } from '@agenthix/core'
import { prisma } from 'wasp/server'
import { ControlPlaneError, type CallerContext } from '../server/controlplane/types'
import { personOfRun } from '../server/controlplane/runOnBehalfOf'
import * as siteRuntimeStore from '../sessions/siteRuntimeStore'
import { branchOfSession, liveCopyOf, refOfBranch, type BranchWithCopies } from './branchRows'
import { gitPersonForAgent, gitPersonForUser } from './gitPeople'
import { siteCall } from './siteCalls'
import { emitBranchChange } from './workspaceEvents'
import { askToMerge, NoOneToAsk } from './mergeCard'
import { mainName } from './merge'
import { clashesLeftNote, updateNote } from './updateWords'
import { asBranchTool } from './refusals'
import { whoseOf } from './whose'

type CallingBranch = { branch: BranchWithCopies; copyId: string; siteId: string; agentId: string; runId: string; person: string | null }

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
  const branch = await branchOfSession(claims.sessionId)
  const copy = branch ? liveCopyOf(branch) : null
  if (!branch || !copy || copy.state !== 'READY') {
    throw new ControlPlaneError('invalid', `${tool} works only in a run on a code workspace's branch, and this run is on none. Nothing was changed.`)
  }
  const site = await prisma.executionSite.findUnique({ where: { id: copy.siteId }, select: { siteId: true } })
  if (site?.siteId !== claims.siteId) throw new ControlPlaneError('forbidden', `${tool}: this run is not on the site its branch's copy is on. Nothing was changed.`)
  return { branch, copyId: copy.folderId, siteId: claims.siteId, agentId: claims.agentId, runId, person: await personOfRun(claims) }
}

export async function commitOp(ctx: CallerContext, args: { message: string; runId?: string }): Promise<CommitToolResult> {
  const at = await callingBranch(ctx, args?.runId, 'commit')
  const message = typeof args.message === 'string' ? args.message.trim() : ''
  if (!isCommitMessage(message)) throw new ControlPlaneError('invalid', 'commit needs a message saying what changed. Nothing was committed.')
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
    return { committed: true, commit: result.commit, branch: at.branch.name, files: result.files }
  })
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
    const words = { branch: at.branch.name, main: await mainName(at.siteId, refOfBranch(at.branch)) }
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
      return await askToMerge({ branch: at.branch, logicalSiteId: at.siteId, agentId: at.agentId, personId: person, message })
    } catch (err) {
      if (err instanceof NoOneToAsk) throw new ControlPlaneError('invalid', err.message)
      throw err
    }
  })
}
