/**
 * What an agent's Start, and Start all agents, would run (spec D17, the Workroom's Start dialogs): each agent's ready
 * tasks in the project's rank order, and what cannot run and why. Read-only; the start itself is agentStart.ts.
 *
 * A task is **ready** for its agent when it sits in a To do column, has never been run (Not started), has no run
 * pending, is not archived, is not an epic, and has no start time still to come. Cannot run: an epic (never run), a
 * task whose Run at… time is still to come, and — for Start all agents — a task with no agent.
 */
import { prisma } from 'wasp/server'
import type { Prisma } from '@prisma/client'
import { LINE_ORDER } from '../agents/agentLineOrder'
import { notBeforeItsTime } from './notBeforeItsTime'
import { NOT_AN_EPIC } from './epicRules'

/** The most tasks one dialog lists; a line longer than this is started in parts. */
export const START_PLAN_LIMIT = 500

/** Not yet run and not pending, in a To do column, in sight. */
function toDoNotStarted(projectId: string): Prisma.TaskWhereInput {
  return { projectId, state: 'TODO', archived: false, runState: 'RUN_NONE', executionState: 'NOT_STARTED' }
}


/** The tasks an agent's Start may put in its line now. Every start re-checks it in the same write. */
export function readyWhere(projectId: string, now: Date, agentId?: string): Prisma.TaskWhereInput {
  return {
    ...toDoNotStarted(projectId),
    ...NOT_AN_EPIC,
    assignedAgentId: agentId ?? { not: null },
    ...notBeforeItsTime(now),
  }
}

export type StartPlanTask = {
  id: string
  key: string
  title: string
  typeName: string | null
  columnName: string | null
}

export type CantRunReason = 'epic' | 'startTime' | 'noAgent'

export type CantRunTask = StartPlanTask & { agentId: string | null; reason: CantRunReason; startsAt?: string }

export type StartPlanAgent = {
  agentId: string
  name: string
  handle: string
  avatarUrl: string | null
  /** Its tasks running now in the project, which its ready tasks follow. */
  running: Array<{ id: string; key: string; title: string }>
  ready: StartPlanTask[]
}

export type StartPlan = { agents: StartPlanAgent[]; cantRun: CantRunTask[] }

const TASK_SELECT = {
  id: true, number: true, title: true, assignedAgentId: true, scheduleNextDueAt: true,
  type: { select: { name: true, kind: true } },
  typeColumn: { select: { name: true } },
} as const

/** The plan for one agent's Start (`agentId`), or for Start all agents (none). */
export async function startPlan(projectId: string, agentId: string | null, now: Date = new Date()): Promise<StartPlan> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { key: true } })
  const [tasks, running, projectAgents] = await Promise.all([
    prisma.task.findMany({
      where: { ...toDoNotStarted(projectId), ...(agentId ? { assignedAgentId: agentId } : {}) },
      orderBy: LINE_ORDER,
      select: TASK_SELECT,
      take: START_PLAN_LIMIT,
    }),
    prisma.task.findMany({
      where: { projectId, runState: 'RUN_ACTIVE', ...(agentId ? { assignedAgentId: agentId } : { assignedAgentId: { not: null } }) },
      orderBy: LINE_ORDER,
      select: { id: true, number: true, title: true, assignedAgentId: true },
    }),
    agentId ? Promise.resolve([]) : prisma.projectAgent.findMany({ where: { projectId }, select: { agentId: true } }),
  ])
  const keyOf = (t: { number: number }) => `${project.key}-${t.number}`
  const shown = (t: (typeof tasks)[number]): StartPlanTask => ({
    id: t.id, key: keyOf(t), title: t.title, typeName: t.type?.name ?? null, columnName: t.typeColumn?.name ?? null,
  })

  const ready = new Map<string, StartPlanTask[]>()
  const cantRun: CantRunTask[] = []
  for (const t of tasks) {
    const base = { ...shown(t), agentId: t.assignedAgentId }
    if (t.type?.kind === 'EPIC') cantRun.push({ ...base, reason: 'epic' })
    else if (t.scheduleNextDueAt && t.scheduleNextDueAt.getTime() > now.getTime()) {
      cantRun.push({ ...base, reason: 'startTime', startsAt: t.scheduleNextDueAt.toISOString() })
    } else if (!t.assignedAgentId) cantRun.push({ ...base, reason: 'noAgent' })
    else ready.set(t.assignedAgentId, [...(ready.get(t.assignedAgentId) ?? []), shown(t)])
  }

  const agentIds = agentId ? [agentId] : [...new Set([...projectAgents.map(a => a.agentId), ...ready.keys()])]
  const agents = await prisma.agent.findMany({ where: { id: { in: agentIds } }, select: { id: true, name: true, handle: true, avatarUrl: true } })
  const order = new Map(agentIds.map((id, i) => [id, i]))
  return {
    agents: agents
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
      .map(a => ({
        agentId: a.id, name: a.name, handle: a.handle, avatarUrl: a.avatarUrl,
        running: running.filter(t => t.assignedAgentId === a.id).map(t => ({ id: t.id, key: keyOf(t), title: t.title })),
        ready: ready.get(a.id) ?? [],
      })),
    // A single agent's Start never names a task with no agent: it is not that agent's.
    cantRun: agentId ? cantRun.filter(t => t.agentId === agentId) : cantRun,
  }
}
