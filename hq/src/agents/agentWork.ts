/**
 * The rows `agentNow.ts` reads: agents' tasks and routines in a set of projects,
 * in three queries whatever the number of agents or tasks. hq's own records
 * only — a task's run state is hq's (adr-0087), so nothing here asks a site.
 *
 * Done tasks are counted, not loaded: a busy agent's history would otherwise be
 * read in full to say one number. A done task that is still blocked is loaded,
 * because it still needs a person.
 */
import { prisma } from 'wasp/server'
import type { WorkRoutine, WorkTask, TaskStateCounts } from './agentNow'
import { countByState } from './agentNow'

export type AgentWork = {
  tasks: WorkTask[]
  routines: WorkRoutine[]
  /** Done tasks not loaded above, by `${agentId}:${projectId}`. */
  doneCounts: Map<string, number>
}

export const workKey = (agentId: string, projectId: string) => `${agentId}:${projectId}`

export async function readAgentWork(args: { projectIds: string[]; agentIds?: string[] }): Promise<AgentWork> {
  if (args.projectIds.length === 0 || args.agentIds?.length === 0) return { tasks: [], routines: [], doneCounts: new Map() }
  const assigned = args.agentIds ? { in: args.agentIds } : { not: null }
  const scope = { projectId: { in: args.projectIds }, archived: false, assignedAgentId: assigned }
  const [tasks, done, routines] = await Promise.all([
    prisma.task.findMany({
      where: { ...scope, OR: [{ status: { not: 'DONE' } }, { runState: 'RUN_BLOCKED' }] },
      select: {
        id: true, number: true, title: true, projectId: true, status: true, runState: true, runStateReason: true,
        assignedAgentId: true, scheduleNextDueAt: true, lastWorkedAt: true, updatedAt: true,
        project: { select: { key: true, name: true } },
      },
      orderBy: [{ updatedAt: 'desc' }],
    }),
    prisma.task.groupBy({
      by: ['assignedAgentId', 'projectId'],
      where: { ...scope, status: 'DONE', runState: { not: 'RUN_BLOCKED' } },
      _count: { _all: true },
    }),
    prisma.routine.findMany({
      where: { projectId: { in: args.projectIds }, agentId: assigned },
      select: { id: true, title: true, projectId: true, enabled: true, nextDueAt: true, agentId: true, project: { select: { name: true } } },
    }),
  ])
  return {
    tasks: tasks.map(({ project, ...t }) => ({ ...t, projectKey: project.key, projectName: project.name })),
    routines: routines.map(({ project, ...r }) => ({ ...r, projectName: project.name })),
    doneCounts: new Map(done.map(g => [workKey(g.assignedAgentId ?? '', g.projectId), g._count._all])),
  }
}

/** One agent's share of the work, optionally in one project only. */
export function workOf(work: AgentWork, agentId: string, projectId?: string): { tasks: WorkTask[]; routines: WorkRoutine[]; counts: TaskStateCounts } {
  const here = (p: string) => projectId === undefined || p === projectId
  const tasks = work.tasks.filter(t => t.assignedAgentId === agentId && here(t.projectId))
  const routines = work.routines.filter(r => r.agentId === agentId && here(r.projectId))
  const counts = countByState(tasks)
  for (const [key, n] of work.doneCounts) {
    const [a, p] = key.split(':')
    if (a === agentId && here(p)) {
      counts.done += n
      counts.total += n
    }
  }
  return { tasks, routines, counts }
}
