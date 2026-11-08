/**
 * The tasks in line within the Runs history's scope, read as the Workroom reads them (`workroomTasks.ts`): every
 * agent's tasks at work and in line, in rank order, so each one's reason can be said. Narrowed afterwards to the task
 * asked for, so its reason stays the one its card shows.
 */
import { prisma } from 'wasp/server'
import type { Prisma } from '@prisma/client'
import { LINE_ORDER } from '../agents/agentLineOrder'
import { workroomProjects } from '../projects/workroom/workroomTasks'
import { namesOf } from './myRuns'
import { taskKeyOf } from './screenFilters'
import { lineRows, type LineRow, type LineTaskRow } from './historyLineRows'
import type { HistoryFilters } from './historyRules'

/** The most tasks one read takes; a scope far past it is a bigger problem than its Waiting tab. */
const LINE_LIMIT = 500

const LINE_SELECT = {
  id: true, projectId: true, number: true, title: true, runState: true, runStateReason: true, runCount: true,
  scheduleNextDueAt: true, updatedAt: true, runStartedBy: true, queuedByUserId: true, queuedByAgentId: true,
  onBehalfOfUserId: true, runOnBehalfOfUserId: true,
  project: { select: { key: true, name: true } },
  assignedAgent: { select: { id: true, name: true, avatarUrl: true } },
} as const

/** The rows of the tasks in line in the scope (`where`, the scope's tasks); none for a scope of replies or routines. */
export async function readLineRows(me: string, f: HistoryFilters, where: Prisma.TaskWhereInput | null, now: Date): Promise<LineRow[]> {
  if (!where || f.kind === 'reply' || f.kind === 'routine') return []
  const tasks: LineTaskRow[] = await prisma.task.findMany({
    where: {
      AND: [where, { archived: false, assignedAgentId: f.agentId ?? { not: null } }],
      OR: [
        { runState: { in: ['RUN_QUEUED', 'RUN_ACTIVE'] } },
        { runState: 'RUN_NONE', scheduleNextDueAt: { gt: now } },
      ],
    },
    orderBy: LINE_ORDER,
    select: LINE_SELECT,
    take: LINE_LIMIT,
  })
  if (tasks.length === 0) return []
  const userIds = new Set(tasks.flatMap(t => (t.queuedByUserId ? [t.queuedByUserId] : [])))
  const agentIds = new Set(tasks.flatMap(t => (t.queuedByAgentId ? [t.queuedByAgentId] : [])))
  const [projects, names] = await Promise.all([workroomProjects([...new Set(tasks.map(t => t.projectId))]), namesOf(userIds, agentIds)])
  const siteNames = new Map(projects.map(p => [p.id, p.siteName]))
  const wanted = f.taskKey ? taskKeyOf(f.taskKey) : null
  return lineRows(tasks, siteNames, me, names, now)
    .filter(r => !f.taskKey || (!!wanted && r.taskKey === `${wanted.key}-${wanted.number}`))
}
