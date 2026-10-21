/**
 * An agent's usage for a period (every screen reviewed spec §3): **yours** —
 * the runs on your behalf — and **the organisation's** — every run — shown to
 * every member on the agent's place; **a project's** — every run in it — to its
 * members; and the organisation's **by project** to organisation admins, on
 * Organisation › Agents. One run counts in each. A private project the admin is
 * not on is never named there: all of them are summed into one line,
 * `privateProjects`, as people's own spaces are into `ownSpaces`.
 *
 * Every site is asked once for the period's sums by session (`run.usage`), and
 * each session is resolved to its person and project from hq's own records
 * (`usageTotals.ts`). Cost and energy are estimates from the tokens; the run
 * rows carry nothing else.
 */
import type { GetAgentUsage } from 'wasp/server/operations'
import { HttpError, prisma } from 'wasp/server'
import type { SiteSilence } from '@agenthix/core'
import { requireProjectVisible } from '../projects/resourceEntitlement'
import { entitledProjectsFilter } from '../projects/membership'
import { readRunUsage } from '../sessions/runUsageRead'
import { usageTotals, addTotals, emptyTotals, type UsageSession, type UsageTotals, type UsageBreakdown } from './usageTotals'

type ProjectRow = { id: string; key: string; name: string }

/** The admin's view by project: those they can see named, the rest summed into one line. */
async function byProjectFor(userId: string, byProject: UsageBreakdown['byProject'], projects: ProjectRow[]) {
  const visible = new Set((await prisma.project.findMany({
    where: { id: { in: [...byProject.keys()] }, ...entitledProjectsFilter(userId) },
    select: { id: true },
  })).map(p => p.id))
  const projectById = new Map(projects.map(p => [p.id, p]))
  const named: NonNullable<AgentUsageView['byProject']> = []
  const privateProjects = emptyTotals()
  for (const [id, usage] of byProject) {
    const p = projectById.get(id)
    if (p && visible.has(id)) named.push({ project: { id: p.id, key: p.key, name: p.name }, usage })
    else if (p) addTotals(privateProjects, usage)
  }
  return { named, privateProjects }
}

type Args = {
  agentId: string
  /** ISO timestamps; from `since` inclusive to `until` exclusive. Either may be left open. */
  since?: string | null
  until?: string | null
  /** Also this project's usage; needs membership of it. */
  projectId?: string | null
}

export type AgentUsageView = {
  period: { since: string | null; until: string | null }
  yours: UsageTotals
  organisation: UsageTotals
  project: UsageTotals | null
  /** Organisation admins only, and only the projects they can see; null for anyone else. */
  byProject: Array<{ project: { id: string; key: string; name: string }; usage: UsageTotals }> | null
  /** Runs in private projects the organisation admin is not on, together and unnamed; null for anyone else. */
  privateProjects: UsageTotals | null
  /** Runs in people's own spaces together, for organisation admins; null for anyone else. */
  ownSpaces: UsageTotals | null
  /** Sites whose runs are missing from these totals. */
  unanswered: SiteSilence[]
  /** A site had more groups than one answer carries; the totals are short. */
  truncated: boolean
}

function isoOrNull(value: string | null | undefined, name: string): string | null {
  if (value === undefined || value === null) return null
  const at = new Date(value)
  if (Number.isNaN(at.getTime())) throw new HttpError(400, `${name} is not a time`)
  return at.toISOString()
}

export const getAgentUsage: GetAgentUsage<Args, AgentUsageView> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const userId = context.user.id
  const agent = await prisma.agent.findUnique({ where: { id: args.agentId }, select: { id: true } })
  if (!agent) throw new HttpError(404, 'Agent not found')
  if (args.projectId) await requireProjectVisible(args.projectId, userId)
  const since = isoOrNull(args.since, 'since')
  const until = isoOrNull(args.until, 'until')

  const [usage, settings] = await Promise.all([
    readRunUsage({ by: 'session', agentId: agent.id, ...(since ? { since } : {}), ...(until ? { until } : {}) }),
    prisma.userSettings.findUnique({ where: { userId }, select: { role: true } }),
  ])
  const sessionIds = [...new Set(usage.rows.map(r => r.sessionId).filter((id): id is string => !!id))]
  const sessions = await prisma.agentSession.findMany({
    where: { id: { in: sessionIds } },
    select: {
      id: true, userId: true, sessionType: true, primaryOwnerType: true, primaryOwnerId: true,
      task: { select: { projectId: true, onBehalfOfUserId: true } },
    },
  })
  const projectIds = [...new Set(sessions.map(s => s.task?.projectId ?? (s.primaryOwnerType === 'project' ? s.primaryOwnerId : null)).filter((id): id is string => !!id))]
  const projects = await prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, key: true, name: true, personalOwnerId: true } })

  const totals = usageTotals(usage.rows, new Map<string, UsageSession>(sessions.map(({ id, ...s }) => [id, s])), {
    personId: userId,
    projectId: args.projectId ?? undefined,
    personalProjectIds: new Set(projects.filter(p => p.personalOwnerId).map(p => p.id)),
  })
  const isOrgAdmin = settings?.role === 'ADMIN'
  const admins = isOrgAdmin ? await byProjectFor(userId, totals.byProject, projects) : null
  return {
    period: { since, until },
    yours: totals.person!,
    organisation: totals.organisation,
    project: totals.project,
    byProject: admins?.named ?? null,
    privateProjects: admins?.privateProjects ?? null,
    ownSpaces: isOrgAdmin ? totals.ownSpaces : null,
    unanswered: usage.unanswered,
    truncated: usage.truncated,
  }
}
