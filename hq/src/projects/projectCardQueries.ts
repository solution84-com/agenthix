/**
 * The Projects screen's card line (every screen reviewed spec §3): for each
 * project the person can see — theirs, and every open one, which they may
 * join (adr-0099) — what is happening in it now: how many of its
 * tasks need a person, how many are running, how many are open — when it last
 * ran anything, and when anything in it last changed, which orders the list.
 * The rest of the card (name, avatar, description) is `getProjects`.
 *
 * Needs you and running are hq's own task state (the Tasks tool's rule,
 * `needsYou.ts`). The last run is asked of every site once, summed by the
 * storage owner the runs worked in: a project, or — for a person's own project —
 * their own space.
 */
import type { GetProjectCards } from 'wasp/server/operations'
import { HttpError, prisma } from 'wasp/server'
import type { ProjectCard, ProjectCardsView } from '@agenthix/core'
import { visibleProjectsFilter } from './membership'
import { needsYou, NEEDS_YOU_SELECT } from './needsYou'
import { NO_AGENT_REASON } from '../agents/taskExecutionReasons'
import { readRunUsage, lastRunBy } from '../sessions/runUsageRead'

/** Declared in core's client protocol, since the mobile app reads them too. */
export type { ProjectCard, ProjectCardLine, ProjectCardsView } from '@agenthix/core'

export const getProjectCards: GetProjectCards<void, ProjectCardsView> = async (_args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const me = context.user.id
  const projects = await prisma.project.findMany({
    where: visibleProjectsFilter(me),
    select: { id: true, updatedAt: true, personalOwnerId: true, personalSpace: true, members: { where: { userId: me }, select: { role: true } } },
  })
  const ids = projects.map(p => p.id)
  const [tasks, usage] = await Promise.all([
    // Only the tasks that can need a person or be running: needsYou is false for the rest.
    prisma.task.findMany({
      where: {
        projectId: { in: ids },
        archived: false,
        OR: [
          { runState: { in: ['RUN_BLOCKED', 'RUN_FAILED', 'RUN_ACTIVE', 'RUN_QUEUED', 'RUN_THROTTLED'] } },
          { runStateReason: NO_AGENT_REASON },
        ],
      },
      select: { ...NEEDS_YOU_SELECT, projectId: true },
    }),
    readRunUsage({ by: 'owner' }),
  ])
  const [open, touched] = await Promise.all([
    prisma.task.groupBy({ by: ['projectId'], where: { projectId: { in: ids }, archived: false, status: { not: 'DONE' } }, _count: { _all: true } }),
    prisma.task.groupBy({ by: ['projectId'], where: { projectId: { in: ids } }, _max: { updatedAt: true } }),
  ])
  const openBy = new Map(open.map(g => [g.projectId, g._count._all]))
  const touchedBy = new Map(touched.map(g => [g.projectId, g._max.updatedAt]))
  const lastRun = lastRunBy(usage.rows, row => (row.ownerType && row.ownerId ? `${row.ownerType}:${row.ownerId}` : null))
  const cards = projects.map((p): ProjectCard => {
    const here = tasks.filter(t => t.projectId === p.id)
    const waiting = here.filter(needsYou)
    const ranAt = lastRun.get(p.personalOwnerId && p.personalSpace ? `user:${p.personalOwnerId}` : `project:${p.id}`) ?? null
    return {
      projectId: p.id,
      isMember: p.personalOwnerId ? p.personalOwnerId === me : p.members.length > 0,
      needsYouCount: waiting.length,
      runningCount: here.filter(t => t.runState === 'RUN_ACTIVE' && !needsYou(t)).length,
      lastRunAt: ranAt,
      openCount: openBy.get(p.id) ?? 0,
      lastActivityAt: latest([p.updatedAt.toISOString(), touchedBy.get(p.id)?.toISOString() ?? null, ranAt]),
    }
  })
  return { cards, unanswered: usage.unanswered }
}

/** The latest of some ISO times, any of them absent. */
function latest(times: Array<string | null>): string | null {
  return times.reduce<string | null>((a, b) => (b && (!a || Date.parse(b) > Date.parse(a)) ? b : a), null)
}
