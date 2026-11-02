/**
 * A branch's runs while its live preview runs on another site (live preview spec section 5, *On another site*): the
 * live preview cannot share the branch's copy there, so the branch's runs go to that site and work in the live
 * preview's own copy, and each commit comes back by bundle (`back.ts`). Also the claim a run's capability carries for
 * its app tools (`CapabilityLivePreview`): set only while its branch has a live preview on the site the run is on.
 */
import { prisma } from 'wasp/server'
import type { LivePreview } from '@prisma/client'
import type { CapabilityLivePreview } from '@agenthix/core'
import { branchOfSession } from '../branches/branchRows'
import { livePreviewOn } from './store'

export type SessionLivePreview = { row: LivePreview; logicalSiteId: string }

/** The live preview of the branch a run's session works on, with the site it runs on; null when it has none. */
export async function livePreviewOfSession(sessionId: string): Promise<SessionLivePreview | null> {
  const branch = await branchOfSession(sessionId)
  if (!branch) return null
  const row = await livePreviewOn(prisma, { workspaceId: branch.workspaceId, branchId: branch.id })
  if (!row) return null
  const site = await prisma.executionSite.findUnique({ where: { id: row.executionSiteId }, select: { siteId: true, status: true } })
  return site && site.status !== 'REVOKED' ? { row, logicalSiteId: site.siteId } : null
}

/** The site a task's runs go to when its branch's live preview runs on another site; null when they go as usual. */
export async function previewSiteOfTask(taskId: string): Promise<string | null> {
  const branch = await prisma.workspaceBranch.findFirst({ where: { taskId, state: 'OPEN' }, select: { id: true, workspaceId: true } })
  if (!branch) return null
  const row = await livePreviewOn(prisma, { workspaceId: branch.workspaceId, branchId: branch.id })
  return previewSiteOf(row)
}

/** The same for a session's runs. */
export async function previewSiteOfSession(sessionId: string): Promise<string | null> {
  const lp = await livePreviewOfSession(sessionId)
  return runsGoToPreviewSite(lp) ? lp.logicalSiteId : null
}

async function previewSiteOf(row: LivePreview | null): Promise<string | null> {
  if (!row || row.copyKind !== 'BUNDLE' || (row.state !== 'RUNNING' && row.state !== 'PAUSED')) return null
  const site = await prisma.executionSite.findUnique({ where: { id: row.executionSiteId }, select: { siteId: true, status: true } })
  return site && site.status !== 'REVOKED' ? site.siteId : null
}

/** Whether a run on this branch goes to the live preview's site: its own copy there is made, so the run can work in it. */
export function runsGoToPreviewSite(lp: SessionLivePreview | null): lp is SessionLivePreview {
  return !!lp && lp.row.copyKind === 'BUNDLE' && (lp.row.state === 'RUNNING' || lp.row.state === 'PAUSED')
}

/**
 * Where a run works, and its live-preview claim. `workspaceSiteId` is the site holding the workspace; `runSiteId`, for
 * a renewal, the site the run is on, which a renewal never moves: a run that started on the workspace's site stays
 * there until it ends.
 */
export async function runSiteAndClaim(
  sessionId: string, workspaceSiteId: string, runSiteId: string | null,
): Promise<{ siteId: string; livePreview: CapabilityLivePreview | null }> {
  const lp = await livePreviewOfSession(sessionId)
  let siteId = workspaceSiteId
  if (runsGoToPreviewSite(lp)) siteId = runSiteId === workspaceSiteId ? workspaceSiteId : lp.logicalSiteId
  if (!lp || lp.logicalSiteId !== siteId) return { siteId, livePreview: null }
  return { siteId, livePreview: { livePreviewId: lp.row.id, workspaceId: lp.row.workspaceId, branch: lp.row.branch } }
}

/**
 * The live preview a run's app tools act on, read from hq's rows at each call rather than from its signed claim: a run
 * keeps one capability for minutes, and a live preview opens and stops at any time. It is the live preview of the
 * branch the run's session works on, on the site the run is on, where it shares the copy the run works in; `elsewhere`
 * when the branch's live preview runs on another site.
 */
export async function livePreviewOfRun(sessionId: string, runSiteId: string): Promise<SessionLivePreview | 'elsewhere' | null> {
  const lp = await livePreviewOfSession(sessionId)
  if (!lp) return null
  return lp.logicalSiteId === runSiteId ? lp : 'elsewhere'
}
