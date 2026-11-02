/**
 * Live previews on the organisation's sites as fleet admins see and set them, through the Fleet Console (live preview
 * spec section 5): `sites.livePreviews`, `sites.livePreviews.set` and `sites.livePreviews.stop` on the console link,
 * each only for a fleet admin. A fleet admin turns live previews on or off, sets or clears the limit, sets *Stop when
 * unused for*, sees whose live previews are open and what they use, and stops one; they never see inside one. Every
 * change is recorded and announced, and sent to the site, as at every connect. Turning live previews off stops every
 * one there, each person told; lowering the limit stops none.
 */
import { prisma } from 'wasp/server'
import {
  FLEET_LIVE_PREVIEWS_MAX, type FleetLivePreview, type LivePreviewLimit, type SiteLivePreviewsView,
} from '@agenthix/core'
import { ConsoleRefusal } from '../fleet/consoleMethods'
import { isFleetAdmin } from '../fleet/fleetAdminRole'
import { recordActivity } from '../fleet/activity'
import { siteChannelRegistry } from '../sites/channel'
import { peopleByIds } from '../server/identity/people'
import { capacityOf, guardReportedRecently, settingOf, SITE_SELECT, type SiteRow } from './sites'
import { livePreviewsOnSite } from './store'
import { sendSiteSetting } from './reconcile'
import { stopAs } from './stopping'
import { tellStoppedBy } from './notices'

async function mustBeFleetAdmin(userId: string): Promise<void> {
  if (!(await isFleetAdmin(userId))) throw new ConsoleRefusal('not_allowed', 'Only a fleet admin manages live previews on a site.')
}

async function siteOf(executionSiteId: string): Promise<SiteRow> {
  const site = await prisma.executionSite.findFirst({ where: { id: executionSiteId, status: { not: 'REVOKED' } }, select: SITE_SELECT })
  if (!site) throw new ConsoleRefusal('not_found', 'HQ has no site by that id.')
  return site
}

const STATE: Record<string, FleetLivePreview['state']> = { STARTING: 'starting', RUNNING: 'running', PAUSED: 'paused' }

async function viewOf(site: SiteRow): Promise<SiteLivePreviewsView> {
  const rows = (await livePreviewsOnSite(site.id)).slice(0, FLEET_LIVE_PREVIEWS_MAX)
  const [people, projects] = await Promise.all([
    peopleByIds([...new Set(rows.map(r => r.userId))]),
    prisma.project.findMany({
      where: { id: { in: [...new Set(rows.flatMap(r => (r.projectId ? [r.projectId] : [])))] } },
      select: { id: true, name: true, personalSpace: true },
    }),
  ])
  const livePreviews: FleetLivePreview[] = rows.map(r => {
    const project = projects.find(p => p.id === r.projectId)
    return {
      livePreviewId: r.id,
      projectName: project ? (project.personalSpace ? 'Your space' : project.name) : r.projectId ? 'A project' : 'Their own storage',
      workspaceName: r.workspaceName ?? 'A workspace',
      branch: r.branch,
      person: { id: r.userId, name: people.get(r.userId)?.name ?? 'Someone' },
      state: STATE[r.state] ?? 'running',
      openedAt: r.openedAt.toISOString(),
      lastUsedAt: r.lastUsedAt.toISOString(),
    }
  })
  const setting = settingOf(site)
  const problems: string[] = []
  if (!siteChannelRegistry.isOnline(site.siteId)) problems.push(`${site.label} isn't connected to HQ, so no live preview starts there until it is back.`)
  else if (setting.allowed && !(await guardReportedRecently(site.id))) {
    problems.push(`${site.label}'s guard hasn't reported in the last minute, so no live preview starts there. Make sure the site runs a version with live previews.`)
  }
  return {
    executionSiteId: site.id, allowed: setting.allowed, limit: setting.limit, idleMinutes: setting.idleMinutes,
    livePreviews, capacity: capacityOf(site.health), problems,
  }
}

export async function siteLivePreviewsView(byUserId: string, executionSiteId: string): Promise<SiteLivePreviewsView> {
  await mustBeFleetAdmin(byUserId)
  return viewOf(await siteOf(executionSiteId))
}

export async function setSiteLivePreviews(p: {
  byUserId: string; executionSiteId: string; allowed: boolean; limit: LivePreviewLimit; idleMinutes: number
}): Promise<{ view: SiteLivePreviewsView; stopped: string[] }> {
  await mustBeFleetAdmin(p.byUserId)
  const before = await siteOf(p.executionSiteId)
  const was = settingOf(before)
  await prisma.executionSite.update({
    where: { id: before.id }, data: { livePreviewsAllowed: p.allowed, livePreviewLimit: p.limit, livePreviewIdleMinutes: p.idleMinutes },
  })
  const subject = before.label
  const at = new Date()
  if (was.allowed !== p.allowed) {
    await recordActivity({ byUserId: p.byUserId, action: p.allowed ? 'livePreviews.on' : 'livePreviews.off', subject, at, announce: true })
  }
  if (was.limit !== p.limit) {
    await recordActivity({ byUserId: p.byUserId, action: 'livePreviews.limit', subject: `${subject}: ${p.limit ?? 'no limit'}`, at, announce: true })
  }
  if (was.idleMinutes !== p.idleMinutes) {
    await recordActivity({ byUserId: p.byUserId, action: 'livePreviews.idle', subject: `${subject}: ${p.idleMinutes} minutes`, at, announce: true })
  }
  // The site is told first, so it starts no more; then each live preview open there is stopped, and its person told.
  await sendSiteSetting(before.siteId)
  const stopped: string[] = []
  if (!p.allowed) {
    for (const row of await livePreviewsOnSite(before.id)) {
      if ((await stopAs(row, 'turnedOff')).stopped) {
        stopped.push(row.id)
        await tellStoppedBy(row, `A fleet admin turned live previews off on ${before.label}, which`)
      }
    }
  }
  return { view: await viewOf(await siteOf(before.id)), stopped }
}

export async function stopFleetLivePreview(p: { byUserId: string; executionSiteId: string; livePreviewId: string }): Promise<{ stopped: boolean }> {
  await mustBeFleetAdmin(p.byUserId)
  const site = await siteOf(p.executionSiteId)
  const row = await prisma.livePreview.findUnique({ where: { id: p.livePreviewId } })
  if (!row || row.executionSiteId !== site.id) throw new ConsoleRefusal('not_found', 'HQ has no live preview by that id on this site.')
  const { stopped } = await stopAs(row, 'fleetAdmin')
  if (!stopped) return { stopped: false }
  await recordActivity({
    byUserId: p.byUserId, action: 'livePreviews.stopped', subject: `${site.label}: ${row.workspaceName ?? 'a workspace'} · ${row.branch}`,
    at: new Date(), announce: true,
  })
  await tellStoppedBy(row, 'A fleet admin, in the Fleet Console,')
  return { stopped: true }
}
