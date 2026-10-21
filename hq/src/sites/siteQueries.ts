/**
 * The Execution Sites list and a site's own page (every screen reviewed spec
 * §3), for organisation admins. The pending requests are `getPendingSiteApprovals`.
 */
import type { GetSiteList, GetSiteDetail, GetFleetAccess } from 'wasp/server/operations'
import { HttpError, prisma } from 'wasp/server'
import { SITE_PROTOCOL_VERSION } from '@agenthix/core'
import { assertAdmin } from './assertAdmin'
import { isFleetAdmin } from '../fleet/fleetAdminRole'
import { canSeeFigures, loadOf, siteIsCloud, withoutFigures } from './siteFigures'
import { currentDefaultSiteCause } from './defaultSiteCause'
import { scheduledBySite } from './scheduled/siteSchedule'
import { readSiteFacts, type SiteFacts } from './siteFacts'
import { siteStanding } from './siteStanding'
import { hqStartedListeningAt } from './siteNotifications'
import { siteChannelRegistry } from './channel'
import { listAllWorkspaces } from '../storage/workspaceStore'
import { visibleProjectsFilter } from '../projects/membership'
import { tasksRunOnSite } from '../projects/personalProject'
import { PERSON_SELECT, missingPerson, personSummary, type PersonSummary } from '../server/identity/personSummary'
import { Logger } from '../server/utils/logger'
import { displaySiteName } from '../shared/siteName'
import type { SiteDetail, SiteListEntry } from './siteViews'

const logger = new Logger('SiteQueries')

async function people(ids: (string | null)[]): Promise<Map<string, PersonSummary>> {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))]
  if (wanted.length === 0) return new Map()
  const rows = await prisma.user.findMany({ where: { id: { in: wanted } }, select: PERSON_SELECT })
  const found = new Map(rows.map(r => [r.id, personSummary(r)]))
  return new Map(wanted.map(id => [id, found.get(id) ?? missingPerson(id)]))
}

/** Fleet admins get the machine's figures and versions; everyone else the sentence and the load (siteFigures.ts). */
function entry(site: SiteFacts, who: Map<string, PersonSummary>, now: Date, fleetAdmin: boolean, scheduled: SiteListEntry['scheduled']): SiteListEntry {
  const { group, problems } = siteStanding(site, now, hqStartedListeningAt())
  const full: SiteListEntry = {
    id: site.id, siteId: site.siteId, label: displaySiteName(site), status: site.status, connected: site.status === 'ONLINE',
    isDefault: site.isDefault, registeredAt: site.registeredAt, lastSeenAt: site.lastSeenAt,
    protocolVersion: site.protocolVersion, hqProtocol: SITE_PROTOCOL_VERSION,
    projectCount: site.projectCount, waiting: site.waiting,
    figures: true, load: loadOf(site.health), health: site.health, healthReportedAt: site.healthReportedAt,
    removal: site.revoked
      ? { at: site.revokedAt, by: site.revokedById ? who.get(site.revokedById) ?? null : null, leftByItself: site.leftByItself }
      : null,
    group, problems,
    hosting: siteIsCloud(site) ? 'cloud' : 'self-hosted', scheduled, cause: causeOf(site),
  }
  return canSeeFigures(fleetAdmin, site) ? full : withoutFigures(full)
}

/** Only hq's own site has a cause hq's machine reported, and only while it is away since it was last heard from. */
function causeOf(site: SiteFacts): SiteListEntry['cause'] {
  const reported = site.isDefault && site.status !== 'ONLINE' ? currentDefaultSiteCause() : null
  return reported && (!site.lastSeenAt || reported.at > site.lastSeenAt) ? reported.cause : null
}

export const getSiteList: GetSiteList<void, SiteListEntry[]> = async (_args, context) => {
  const me = await assertAdmin(context)
  const fleetAdmin = await isFleetAdmin(me)
  const sites = await readSiteFacts()
  const who = await people(sites.map(s => s.revokedById))
  const now = new Date()
  const scheduled = await scheduledBySite(sites, now)
  return sites.map(s => entry(s, who, now, fleetAdmin, scheduled.get(s.siteId) ?? null))
}

export const getSiteDetail: GetSiteDetail<{ executionSiteId: string }, SiteDetail> = async (args, context) => {
  const me = await assertAdmin(context)
  const fleetAdmin = await isFleetAdmin(me)
  if (typeof args?.executionSiteId !== 'string') throw new HttpError(400, 'executionSiteId is required')
  const [site] = await readSiteFacts({ id: args.executionSiteId })
  if (!site) throw new HttpError(404, 'No such Execution Site')
  const who = await people([site.revokedById, site.createdById])
  const visible = visibleProjectsFilter(me)

  const [projects, workspaceCount, peopleWithFiles, running] = await Promise.all([
    prisma.project.findMany({
      where: { AND: [{ executionSiteId: site.id }, visible] },
      select: { id: true, name: true, key: true },
      orderBy: { name: 'asc' },
    }),
    prisma.workspacePlacement.count({ where: { siteId: site.id } }),
    prisma.userStoragePlacement.count({ where: { siteId: site.id } }),
    prisma.task.findMany({
      where: { AND: [tasksRunOnSite(site.siteId), { runState: 'RUN_ACTIVE', project: visible }] },
      select: { title: true, number: true, project: { select: { key: true } }, assignedAgent: { select: { name: true } } },
      orderBy: { updatedAt: 'desc' },
    }),
  ])

  return {
    ...entry(site, who, new Date(), fleetAdmin, (await scheduledBySite([site])).get(site.siteId) ?? null),
    siteUrl: site.siteUrl,
    approvedBy: site.createdById ? who.get(site.createdById) ?? null : null,
    createdById: site.createdById,
    projects,
    hiddenProjects: site.projectCount - projects.length,
    workspaces: { count: workspaceCount, named: await namedWorkspaces(site, projects) },
    peopleWithFiles,
    runningTasks: running.map(t => ({ key: `${t.project.key}-${t.number}`, title: t.title, agentName: t.assignedAgent?.name ?? null })),
  }
}

/** Asked of the site; a workspace is named only in a project the caller may see here. */
async function namedWorkspaces(site: SiteFacts, projects: { id: string; name: string }[]): Promise<SiteDetail['workspaces']['named']> {
  if (site.status !== 'ONLINE' || !siteChannelRegistry.isOnline(site.siteId)) return null
  try {
    const names = new Map(projects.map(p => [p.id, p.name]))
    const rows = await listAllWorkspaces(site.siteId)
    return rows
      .filter(w => w.ownerType === 'project' && names.has(w.ownerId))
      .map(w => ({ id: w.id, name: w.name, projectName: names.get(w.ownerId) ?? null }))
  } catch (err) {
    logger.warn(`could not list the workspaces on site ${site.siteId}`, err)
    return null
  }
}

/**
 * Whether the caller holds the fleet admin role, so a screen can say why it shows no figures, versions or logs. It only
 * explains; every query that returns them checks the role itself (`assertFleetAdmin`).
 */
export const getFleetAccess: GetFleetAccess<void, { fleetAdmin: boolean }> = async (_args, context) => {
  if (!context.user) throw new HttpError(401)
  return { fleetAdmin: await isFleetAdmin(context.user.id) }
}
