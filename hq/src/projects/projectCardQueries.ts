/**
 * The Projects screen's card line (every screen reviewed spec §3): for each
 * project the person can see — theirs, and every open one, which they may
 * join (adr-0099) — what is happening in it now: how many of its
 * tasks need a person, how many are running — and when it last ran anything,
 * for "Quiet · last run yesterday". The rest of the card (name, avatar, boards,
 * tasks done) is `getProjects`.
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
    select: { id: true, personalOwnerId: true, members: { where: { userId: me }, select: { role: true } } },
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
  const lastRun = lastRunBy(usage.rows, row => (row.ownerType && row.ownerId ? `${row.ownerType}:${row.ownerId}` : null))
  const cards = projects.map((p): ProjectCard => {
    const here = tasks.filter(t => t.projectId === p.id)
    const waiting = here.filter(needsYou)
    return {
      projectId: p.id,
      isMember: p.personalOwnerId ? p.personalOwnerId === me : p.members.length > 0,
      needsYouCount: waiting.length,
      runningCount: here.filter(t => t.runState === 'RUN_ACTIVE' && !needsYou(t)).length,
      lastRunAt: lastRun.get(p.personalOwnerId ? `user:${p.personalOwnerId}` : `project:${p.id}`) ?? null,
    }
  })
  return { cards, unanswered: usage.unanswered }
}
