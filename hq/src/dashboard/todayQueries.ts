/**
 * Today on the Organisation page, for admins (every screen reviewed spec §3),
 * in place of the Dashboard page's numbers. Running now comes from each site's
 * last health report, which hq already holds; runs today and spend this month
 * from `run.usage`, which asks every site once for each figure
 * (`sessions/runUsageRead.ts`); tasks from hq's own rows. `unanswered` names a
 * site whose runs are missing from the totals, so a total that leaves one out
 * says so.
 *
 * Organisation-wide, and only counts: tasks are those of the organisation's
 * projects, a person's own space not among them, and no project is named.
 */
import { parseSiteHealth, type SiteSilence } from '@agenthix/core'
import { prisma } from 'wasp/server'
import { requireRole } from '../server/identity/requireRole'
import { readRunUsage } from '../sessions/runUsageRead'
import { runCount, runningNow, spend, startOfDay, startOfMonth, startOfWeek } from './todayNumbers'

type Ctx = { user?: { id: string } | null }

export type TodayNumbers = {
  running: number
  mostAtOnce: number
  /** Sites that are connected and have reported their health. */
  sitesReporting: number
  runsToday: number
  tasksDoneThisWeek: number
  openTasks: number
  /** Projects with at least one open task. */
  projectsWithOpenTasks: number
  spendThisMonth: { costUsd: number; totalTokens: number; unpricedTokens: number }
  unanswered: SiteSilence[]
}

const ORG_PROJECT = { personalOwnerId: null }
const OPEN_TASK = { archived: false, status: { not: 'DONE' as const }, project: ORG_PROJECT }

export const getTodayNumbers = async (_args: unknown, context: Ctx): Promise<TodayNumbers> => {
  await requireRole(context, 'ADMIN', "Reading today's numbers")
  const now = new Date()
  const [sites, today, month, doneThisWeek, openTasks, openByProject] = await Promise.all([
    prisma.executionSite.findMany({ where: { status: 'ONLINE', revokedAt: null }, select: { health: true } }),
    readRunUsage({ by: 'agent', since: startOfDay(now).toISOString() }),
    readRunUsage({ by: 'session', since: startOfMonth(now).toISOString() }),
    prisma.task.count({ where: { status: 'DONE', doneAt: { gte: startOfWeek(now) }, project: ORG_PROJECT } }),
    prisma.task.count({ where: OPEN_TASK }),
    prisma.task.groupBy({ by: ['projectId'], where: OPEN_TASK }),
  ])
  const live = runningNow(sites.map(s => parseSiteHealth(s.health)))
  const unanswered = new Map([...today.unanswered, ...month.unanswered].map(s => [s.siteId, s]))
  return {
    running: live.running,
    mostAtOnce: live.mostAtOnce,
    sitesReporting: live.sites,
    runsToday: runCount(today.rows),
    tasksDoneThisWeek: doneThisWeek,
    openTasks,
    projectsWithOpenTasks: openByProject.length,
    spendThisMonth: spend(month.rows),
    unanswered: [...unanswered.values()],
  }
}
