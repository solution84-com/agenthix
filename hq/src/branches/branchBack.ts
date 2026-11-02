/**
 * What a site tells hq of the branches on it, and what hq tells the people who have a workspace open:
 *
 * - `branch.back` (site → hq): the site brought a branch's commits back on its own, on its sweep, at a run's end or
 *   on its return. Everything in it is checked against hq's own records: the copy must be one hq made, on the site
 *   that sent it, for that workspace and branch. Then the room hears `commits`.
 * - A run on a branch's work starting or ending: the room hears `working` or `stopped`. When the work is over (its
 *   task done or archived), its copy is removed (live preview spec, *Defaults for review* 8), unless a live preview
 *   runs from it (`copies.ts`).
 */
import { prisma } from 'wasp/server'
import { BRANCH_BACK_EVENT, isCommitId, isCopyId, isGitBranchName, type RunStatusEvent } from '@agenthix/core'
import { emitBranchChange } from './workspaceEvents'
import { livePreviewOnBranch, removeCopiesOf, retryRemovals } from './copies'
import { branchOfSession, liveCopyOf } from './branchRows'
import { onRunStatus, onSiteEvent } from '../sites/channel/siteEventHandler'
import { Logger } from '../server/utils/logger'

const logger = new Logger('BranchBack')

type BackEvent = {
  workspace: { ownerType: string; ownerId: string; workspaceId: string }
  copyId: string
  branch: string
  back: { head: string; moved: boolean }
}

/** The fields hq reads, each checked; null for a frame that does not fit. */
export function parseBranchBack(data: unknown): BackEvent | null {
  if (!data || typeof data !== 'object') return null
  const e = data as Record<string, unknown>
  const ws = e.workspace as Record<string, unknown> | undefined
  const back = e.back as Record<string, unknown> | undefined
  if (!ws || typeof ws.ownerType !== 'string' || typeof ws.ownerId !== 'string' || typeof ws.workspaceId !== 'string') return null
  if (!isCopyId(e.copyId) || !isGitBranchName(e.branch)) return null
  if (!back || !isCommitId(back.head) || typeof back.moved !== 'boolean') return null
  return {
    workspace: { ownerType: ws.ownerType, ownerId: ws.ownerId, workspaceId: ws.workspaceId },
    copyId: e.copyId,
    branch: e.branch,
    back: { head: back.head, moved: back.moved },
  }
}

export async function handleBranchBack(siteId: string, data: unknown): Promise<void> {
  const e = parseBranchBack(data)
  if (!e) {
    logger.warn(`site ${siteId}: rejected a malformed branch.back frame — dropped`)
    return
  }
  const copy = await prisma.branchCopy.findUnique({
    where: { folderId: e.copyId },
    include: { branch: true, site: { select: { siteId: true } } },
  })
  const b = copy?.branch
  if (!copy || !b || copy.site.siteId !== siteId || b.workspaceId !== e.workspace.workspaceId ||
      b.ownerType !== e.workspace.ownerType || b.ownerId !== e.workspace.ownerId || b.name !== e.branch) {
    logger.warn(`site ${siteId}: branch.back names a copy that is not its own, or not that branch — dropped`)
    return
  }
  if (!e.back.moved) return
  await prisma.workspaceBranch.update({ where: { id: b.id }, data: { updatedAt: new Date() } })
  emitBranchChange(b, 'commits')
}

const ENDED = new Set<RunStatusEvent['status']>(['COMPLETED', 'FAILED', 'CANCELLED'])

/** `siteId`: the site the frame came from, which must be the one the branch's copy is on. */
export async function branchRunChanged(e: Pick<RunStatusEvent, 'sessionId' | 'status'>, siteId: string): Promise<void> {
  const ended = ENDED.has(e.status)
  if (e.status !== 'RUNNING' && !ended) return
  const branch = await branchOfSession(e.sessionId)
  const copy = branch ? liveCopyOf(branch) : null
  if (!branch || !copy) return
  const site = await prisma.executionSite.findUnique({ where: { id: copy.siteId }, select: { siteId: true } })
  if (site?.siteId !== siteId) return
  emitBranchChange(branch, ended ? 'stopped' : 'working')
  if (ended && branch.taskId) {
    const task = await prisma.task.findUnique({ where: { id: branch.taskId }, select: { status: true, archived: true } })
    if (task && (task.status === 'DONE' || task.archived) && !(await livePreviewOnBranch(branch.id))) await removeCopiesOf(branch.id)
  }
}

/** On a site's return: copies hq asked it to remove while it was away. `siteId` is the site's own id. */
export async function retryCopyRemovals(siteId: string): Promise<void> {
  const site = await prisma.executionSite.findUnique({ where: { siteId }, select: { id: true } })
  if (site) await retryRemovals(site.id)
}

// Registered here, as TaskRunner registers itself: the channel never imports branch work (it reaches the channel).
onSiteEvent(BRANCH_BACK_EVENT, handleBranchBack)
onRunStatus('workspaceBranches', (e, siteId) => branchRunChanged(e, siteId))
