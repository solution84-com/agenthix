import type { PrismaClient } from '@prisma/client'
import type { DashboardSnapshot } from '@agenthix/core'
import { readRecentActivity } from './activity'
import { foldRunStats } from './runStatsFold'
import { askEverySite } from '../../sites/combinedRead'
import * as siteRuntimeStore from '../../sessions/siteRuntimeStore'
import { entitledProjectsFilter } from '../../projects/membership'
import { sessionsInEntitledProjects } from '../../sessions/sessionEntitlement'
import { countTasks } from '../../shared/taskCounts'

const BLENDED_COST_PER_TOKEN = 0.000003
const RECENT_ACTIVITY_LIMIT = 10

/**
 * One viewer's snapshot. `viewerId` is required rather than optional: the
 * recent-projects list carries a project's name and description, so a snapshot
 * composed without a viewer would push a private project to whoever received
 * it (spec §6.4). The project, task and active-session counts are scoped to the
 * same viewer, so no figure tells a person that a private project exists. The
 * run and token figures are the exception: each site sums them over every run it
 * holds and does not say which project a run belonged to, so they stay
 * organisation-wide.
 */
export async function composeSnapshot(prisma: PrismaClient, viewerId: string): Promise<DashboardSnapshot> {
  const entitled = entitledProjectsFilter(viewerId)
  const [
    siteConfig,
    agentCount,
    projectCount,
    taskCount,
    agents,
    projects,
    tasks,
    sessions,
    runs,
  ] = await Promise.all([
    prisma.siteConfig.findFirst(),
    prisma.agent.count(),
    prisma.project.count({ where: entitled }),
    prisma.task.count({ where: { project: entitled } }),
    prisma.agent.findMany({
      select: { id: true, handle: true, name: true, avatarUrl: true },
    }),
    prisma.project.findMany({
      where: entitled,
      take: 5,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true, key: true, name: true, description: true, updatedAt: true,
        boards: { select: { id: true } },
        tasks: { select: { status: true } },
      },
    }),
    prisma.task.findMany({ where: { project: entitled }, select: { status: true, runState: true } }),
    prisma.agentSession.findMany({
      where: { status: 'ACTIVE', ...sessionsInEntitledProjects(viewerId) },
      select: { id: true, agentId: true, status: true },
    }),
    // Runs live on the Execution Sites, and this read belongs to no single one
    // of them: it asks every site the organisation has and sums what comes
    // back. A site that is asleep costs its own figures and nothing else — the
    // rest of the dashboard is still true, and `unanswered` says whose numbers
    // are missing from the totals, so "no runs" and "cannot ask" stay apart.
    // `run.stats` is an aggregate each site computes over all of its own runs,
    // so a total never regresses to "however many rows the last page fetched".
    // Asked alongside hq's own reads rather than after them: a sleeping site
    // costs the whole snapshot one deadline, not one deadline plus the
    // database.
    askEverySite((site) => siteRuntimeStore.runStats(site.siteId)),
  ])

  const stats = foldRunStats(runs.answers)

  // Active sessions per agent
  const activePerAgent = new Map<string, number>()
  for (const s of sessions) {
    activePerAgent.set(s.agentId, (activePerAgent.get(s.agentId) ?? 0) + 1)
  }

  // Tokens per agent, sourced from the aggregate's own per-agent breakdown.
  const tokensPerAgent = new Map(stats.perAgent.map((p) => [p.agentId, { tokens: p.totalTokens, runCount: p.runCount }]))
  const totalTokens = stats.totalTokens
  const runCounts = { total: stats.totalRuns, completed: stats.completedRuns, failed: stats.failedRuns, running: stats.runningRuns }

  // Top agents by tokens
  const topAgents = agents
    .map(a => {
      const rec = tokensPerAgent.get(a.id) ?? { tokens: 0, runCount: 0 }
      return {
        id: a.id,
        handle: a.handle,
        name: a.name,
        avatarUrl: a.avatarUrl ?? null,
        tokens: rec.tokens,
        estimatedCost: rec.tokens * BLENDED_COST_PER_TOKEN,
        runCount: rec.runCount,
        activeSessionCount: activePerAgent.get(a.id) ?? 0,
      }
    })
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 5)

  // Recent projects with derived counts
  const recentProjects = projects.map(p => ({
    id: p.id,
    key: p.key,
    name: p.name,
    description: p.description ?? null,
    boardCount: p.boards.length,
    taskCount: p.tasks.length,
    doneTaskCount: p.tasks.filter(t => t.status === 'DONE').length,
    updatedAt: p.updatedAt.toISOString(),
  }))

  // Task counts: done by the task's own state, the rest by run state
  const taskCounts = countTasks(tasks)

  // An entry that names a project (project_created, task_closed) carries that
  // project's identity in its summary text just as recentProjects does, so it
  // gets the same treatment — dropped for a viewer not entitled to it. Order
  // matters: filter the FULL ring first, then slice to the display limit.
  // Slicing first would filter only within the raw top 10 and hand an
  // excluded viewer a shorter feed instead of a filtered one — the same
  // entries a member sees, minus a few, is a stronger identity leak than an
  // empty one. Entries with no projectId (session_started, run_completed,
  // agent_added) never named a project and are always kept.
  const rawActivity = readRecentActivity()
  const activityProjectIds = [...new Set(rawActivity.map((a) => a.projectId).filter((id): id is string => !!id))]
  let entitledActivityProjectIds: Set<string> | null = null
  if (activityProjectIds.length > 0) {
    const entitled = await prisma.project.findMany({
      where: { AND: [{ id: { in: activityProjectIds } }, entitledProjectsFilter(viewerId)] },
      select: { id: true },
    })
    entitledActivityProjectIds = new Set(entitled.map((p) => p.id))
  }
  const recentActivity = rawActivity
    .filter((a) => !a.projectId || entitledActivityProjectIds?.has(a.projectId))
    .slice(0, RECENT_ACTIVITY_LIMIT)
    .map(({ projectId: _projectId, ...entry }) => entry)

  return {
    siteId: siteConfig?.siteId ?? 'unknown',
    capturedAt: new Date().toISOString(),
    totals: {
      agents: agentCount,
      projects: projectCount,
      tasks: taskCount,
      activeSessions: sessions.length,
    },
    taskCounts,
    runs: runCounts,
    financial: {
      totalTokens,
      estimatedCost: totalTokens * BLENDED_COST_PER_TOKEN,
    },
    recentProjects,
    topAgents,
    recentActivity,
    unanswered: runs.unanswered,
  }
}
