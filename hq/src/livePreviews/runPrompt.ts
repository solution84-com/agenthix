/**
 * What a run's prompt says of its branch's live preview (`RunCodeWork.openLivePreview`): whether one is open on the site
 * the run goes to, and which apps run in it. A run that is not told reaches for something else to "start the live
 * preview" (W12 of the live preview walk). A snapshot at dispatch; the app tools find the live preview again at each call.
 */
import { prisma } from 'wasp/server'
import type { RunOpenLivePreview } from '@agenthix/core'
import { livePreviewOn } from './store'

export async function livePreviewForPrompt(workspaceId: string, branchId: string, runSiteId: string): Promise<RunOpenLivePreview | null> {
  const row = await livePreviewOn(prisma, { workspaceId, branchId })
  if (!row) return null
  const site = await prisma.executionSite.findUnique({ where: { id: row.executionSiteId }, select: { siteId: true } })
  if (site?.siteId !== runSiteId) return null
  const apps = await prisma.liveApp.findMany({ where: { livePreviewId: row.id, state: { in: ['starting', 'running'] } }, select: { name: true }, orderBy: { name: 'asc' } })
  return { paused: row.state === 'PAUSED', runningApps: apps.map(a => a.name) }
}
