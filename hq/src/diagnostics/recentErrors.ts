/**
 * Recent errors, grouped by what failed (logs and diagnostics spec): the last
 * 24 hours, or all 7 days kept. Each group says how often and when last, and
 * what to do; a task run's links to its run, a site's to the site.
 *
 * What a group may name follows who is reading. The page is the whole
 * organisation's, for admins, but a project is named only when the reader may
 * see that it exists, and its run is linked only when they may open its work.
 * A chat run is never more than the error, the agent and the site (adr-0041):
 * its rows hold nothing else.
 */
import { prisma } from 'wasp/server'
import { entitledProjectsFilter, visibleProjectsFilter } from '../projects/membership'
import { CONDITION_GAP_MS, RECENT_ERRORS_KEPT_MS, type ErrorOrigin } from './recordedErrors'
import { displaySiteName } from '../shared/siteName'

export type RecentErrorsRange = '24h' | '7d'

export type RecentErrorGroup = {
  key: string
  origin: ErrorOrigin
  title: string
  /** What to do, in plain words. */
  advice: string
  /** Occurrences in the range; for a site's condition, the stretches it lasted. */
  count: number
  firstAt: Date
  lastAt: Date
  /** A site's condition seen on the last check: still going on. */
  ongoing: boolean
  /** The last occurrence's error as reported, secrets removed. */
  detail: string | null
  site: { executionSiteId: string | null; siteId: string; label: string } | null
  agent: { id: string; name: string } | null
  /** A task run's project, when the reader may see it. */
  project: { id: string; name: string; key: string } | null
  /** The last task run's address on the Runs screen, when the reader may open it. */
  runLink: string | null
  siteLink: string | null
  /** A run in a conversation: shown without the person, the conversation or a link. */
  chatRun: boolean
}

export type RecentErrors = { range: RecentErrorsRange; since: Date; groups: RecentErrorGroup[] }

const RANGE_MS: Record<RecentErrorsRange, number> = { '24h': 24 * 60 * 60 * 1000, '7d': RECENT_ERRORS_KEPT_MS }

type Row = Awaited<ReturnType<typeof readRows>>[number]

function readRows(since: Date) {
  return prisma.recordedError.findMany({ where: { lastAt: { gte: since } }, orderBy: { lastAt: 'desc' } })
}

function ids(rows: Row[], pick: (r: Row) => string | null): string[] {
  return [...new Set(rows.map(pick).filter((v): v is string => !!v))]
}

export async function readRecentErrors(readerId: string, range: RecentErrorsRange, now: Date = new Date()): Promise<RecentErrors> {
  const since = new Date(now.getTime() - RANGE_MS[range])
  const rows = await readRows(since)

  const [sites, agents, visible, entitled] = await Promise.all([
    prisma.executionSite.findMany({ where: { siteId: { in: ids(rows, r => r.siteId) } }, select: { id: true, siteId: true, label: true, isDefault: true } }),
    prisma.agent.findMany({ where: { id: { in: ids(rows, r => r.agentId) } }, select: { id: true, name: true } }),
    prisma.project.findMany({
      where: { AND: [{ id: { in: ids(rows, r => r.projectId) } }, visibleProjectsFilter(readerId)] },
      select: { id: true, name: true, key: true },
    }),
    prisma.project.findMany({ where: { AND: [{ id: { in: ids(rows, r => r.projectId) } }, entitledProjectsFilter(readerId)] }, select: { id: true } }),
  ])
  const siteBy = new Map(sites.map(s => [s.siteId, s]))
  const agentBy = new Map(agents.map(a => [a.id, a]))
  const projectBy = new Map(visible.map(p => [p.id, p]))
  const mayOpen = new Set(entitled.map(p => p.id))

  const groups = new Map<string, Row[]>()
  for (const row of rows) groups.set(row.groupKey, [...(groups.get(row.groupKey) ?? []), row])

  return {
    range,
    since,
    groups: [...groups.entries()].map(([key, list]) => {
      const last = list[0]
      const site = last.siteId ? siteBy.get(last.siteId) : undefined
      const project = last.projectId ? projectBy.get(last.projectId) ?? null : null
      const canOpen = !!last.runId && !!last.projectId && mayOpen.has(last.projectId)
      return {
        key,
        origin: last.origin as ErrorOrigin,
        title: last.title,
        advice: last.advice,
        count: list.length,
        firstAt: list.reduce((a, r) => (r.firstAt < a ? r.firstAt : a), last.firstAt),
        lastAt: last.lastAt,
        ongoing: last.origin === 'site' && now.getTime() - last.lastAt.getTime() <= CONDITION_GAP_MS,
        detail: last.detail,
        site: last.siteId ? { executionSiteId: site?.id ?? null, siteId: last.siteId, label: site ? displaySiteName(site) : 'A removed site' } : null,
        agent: last.agentId ? agentBy.get(last.agentId) ?? null : null,
        project,
        runLink: canOpen ? `/runs/${last.runId}?session=${last.sessionId}` : null,
        siteLink: site ? `/admin/where-work-runs/${site.id}` : null,
        chatRun: last.origin === 'run' && !last.projectId,
      }
    }),
  }
}
