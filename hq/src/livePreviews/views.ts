/**
 * A live preview as the screens read it (`types.ts`), and who may stop it: a person stops their own; a project Admin
 * any in the project; the owner any in their own storage. A Viewer reads it and stops nothing.
 */
import { prisma } from 'wasp/server'
import type { LiveApp, LivePreview } from '@prisma/client'
import { APP_STATES, type AppState, type LivePreviewStateName } from '@agenthix/core'
import { projectRole } from '../projects/membership'
import { peopleByIds } from '../server/identity/people'
import { appAddress } from '../relays'
import { questionsOf, servicesOf } from './questions'
import type { LiveAppView, LivePreviewSiteView, LivePreviewView } from './types'
import { LIVE } from './store'
import { settingOf, SITE_SELECT } from './sites'
import { liveWorkflowsOf } from './workflowSecrets'
import { startableApps } from './knownApps'

const STATE: Record<LivePreview['state'], LivePreviewStateName> = {
  STARTING: 'starting', RUNNING: 'running', PAUSED: 'paused', STOPPED: 'stopped',
}

/** Whether `userId` may stop this live preview from HQ, and as whom. Null when they may not. */
export async function stopperOf(
  row: Pick<LivePreview, 'userId' | 'ownerType' | 'ownerId' | 'projectId'>, userId: string,
): Promise<'person' | 'projectAdmin' | null> {
  if (row.userId === userId) return 'person'
  if (row.ownerType === 'user') return row.ownerId === userId ? 'person' : null
  const projectId = row.projectId ?? row.ownerId
  return (await projectRole(projectId, userId)) === 'ADMIN' ? 'projectAdmin' : null
}

export function appView(app: LiveApp): LiveAppView {
  return {
    appId: app.id, name: app.name, folder: app.folder, command: app.command, port: app.port,
    state: (APP_STATES.find(s => s === app.state) ?? 'stopped') as AppState,
    since: app.since.toISOString(), detail: app.detail,
    lastLines: Array.isArray(app.lastLines) ? (app.lastLines as unknown[]).filter((l): l is string => typeof l === 'string') : [],
    address: appAddress(app.id),
  }
}

export async function siteViewOf(executionSiteId: string): Promise<LivePreviewSiteView> {
  const [site, open] = await Promise.all([
    prisma.executionSite.findUnique({ where: { id: executionSiteId }, select: SITE_SELECT }),
    prisma.livePreview.count({ where: { executionSiteId, state: { in: LIVE } } }),
  ])
  return { executionSiteId, name: site?.label ?? 'A site', open, limit: site ? settingOf(site).limit : null }
}

export async function viewOf(row: LivePreview, userId: string, mayWork: boolean): Promise<LivePreviewView> {
  const live = row.state !== 'STOPPED'
  const [site, people, apps, stopper, workflows, startable] = await Promise.all([
    siteViewOf(row.executionSiteId),
    peopleByIds([row.userId]),
    // Only what this live preview ran: an app of the branch it never started reads as not here.
    prisma.liveApp.findMany({ where: { workspaceId: row.workspaceId, branch: row.branch }, orderBy: { name: 'asc' } }),
    mayWork ? stopperOf(row, userId) : Promise.resolve(null),
    live ? liveWorkflowsOf({ type: row.ownerType, id: row.ownerId }) : Promise.resolve({ start: false, reload: false }),
    live ? startableApps(row) : Promise.resolve([]),
  ])
  return {
    livePreviewId: row.id,
    workspaceId: row.workspaceId,
    branchId: row.branchId,
    branch: row.branch,
    onMain: row.onMain,
    state: STATE[row.state],
    reason: row.reason,
    detail: row.detail,
    since: row.since.toISOString(),
    site,
    startedBy: { id: row.userId, name: people.get(row.userId)?.name ?? 'Someone' },
    yours: row.userId === userId,
    mayStop: live && stopper !== null,
    mayResume: mayWork && row.state === 'PAUSED' && row.reason === 'guard',
    autoReload: row.autoReload,
    openedAt: row.openedAt.toISOString(),
    lastUsedAt: row.lastUsedAt.toISOString(),
    apps: apps.map(a => (a.livePreviewId === row.id ? appView(a) : { ...appView(a), state: 'stopped' as const, detail: null, lastLines: [] })),
    startable,
    services: live ? servicesOf(row.id) : [],
    questions: live && mayWork ? questionsOf(row.id) : [],
    workflows,
  }
}
