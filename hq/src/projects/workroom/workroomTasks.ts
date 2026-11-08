/**
 * What hq itself knows of the Workrooms it is asked for: each project's agents in their Workroom order, and the tasks
 * that are theirs at work, in line, waiting on a person or ready, read in a few queries for every project at once.
 * `mine` narrows the tasks to the viewer's runs (started by them or on their behalf, adr-0095), as Workrooms shows.
 */
import { prisma } from 'wasp/server'
import type { Prisma } from '@prisma/client'
import { LINE_ORDER } from '../../agents/agentLineOrder'
import { displaySiteName } from '../../shared/siteName'
import { readyWhere } from '../agentStartPlan'

/** The most tasks one read takes per kind; a Workroom far past it is a bigger problem than its counts. */
const TASK_LIMIT = 2000

export const WORK_TASK_SELECT = {
  id: true, projectId: true, number: true, title: true, assignedAgentId: true, rank: true,
  state: true, status: true, isEpic: true, runState: true, runStateReason: true, runId: true, runCount: true,
  scheduleNextDueAt: true, updatedAt: true, runStartedBy: true, queuedByUserId: true, queuedByAgentId: true,
  type: { select: { kind: true } },
} as const

export type WorkTask = Prisma.TaskGetPayload<{ select: typeof WORK_TASK_SELECT }>

export type WorkroomAgentRow = { agentId: string; name: string; handle: string; avatarUrl: string | null; role: string | null }

export type WorkroomProjectRow = {
  id: string
  key: string
  name: string
  personal: boolean
  siteName: string | null
  /** The site's own label, as a silent site is named. */
  siteLabel: string | null
  agents: WorkroomAgentRow[]
}

/** The viewer's runs (adr-0095): started by them, or on their behalf. */
export function mineTasks(me: string): Prisma.TaskWhereInput {
  return { OR: [{ onBehalfOfUserId: me }, { queuedByUserId: me }, { runOnBehalfOfUserId: me }] }
}

/** The projects with their agents, each project's in its Workroom order (dragged first, then when it was added). */
export async function workroomProjects(projectIds: string[]): Promise<WorkroomProjectRow[]> {
  const site = { select: { label: true, isDefault: true } } as const
  const rows = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    select: {
      id: true, key: true, name: true, personalOwnerId: true,
      executionSite: site, personalOwner: { select: { storagePlacement: { select: { site } } } },
      agents: {
        select: { position: true, createdAt: true, agent: { select: { id: true, name: true, handle: true, avatarUrl: true, role: true } } },
      },
    },
  })
  const byId = new Map(rows.map(r => [r.id, r]))
  return projectIds.flatMap((id) => {
    const r = byId.get(id)
    if (!r) return []
    const s = r.executionSite ?? r.personalOwner?.storagePlacement?.site ?? null
    const agents = [...r.agents].sort((a, b) =>
      (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER) || a.createdAt.getTime() - b.createdAt.getTime())
    return [{
      id: r.id, key: r.key, name: r.name, personal: r.personalOwnerId !== null, siteName: s ? displaySiteName(s) : null, siteLabel: s?.label ?? null,
      agents: agents.map(a => ({ agentId: a.agent.id, name: a.agent.name, handle: a.agent.handle, avatarUrl: a.agent.avatarUrl, role: a.agent.role })),
    }]
  })
}

/** At work, in line (or waiting for its Run at… time), and waiting on a person: every agent's, in rank order. */
export async function tasksAtWork(projectIds: string[], now: Date, me: string | null): Promise<WorkTask[]> {
  return prisma.task.findMany({
    where: {
      projectId: { in: projectIds },
      archived: false,
      assignedAgentId: { not: null },
      ...(me ? { AND: [mineTasks(me)] } : {}),
      OR: [
        { runState: { in: ['RUN_QUEUED', 'RUN_ACTIVE', 'RUN_BLOCKED', 'RUN_FAILED'] } },
        { scheduleNextDueAt: { gt: now } },
      ],
    },
    orderBy: LINE_ORDER,
    select: WORK_TASK_SELECT,
    take: TASK_LIMIT,
  })
}

/** How many tasks each agent's Start would run, per project: `${projectId}:${agentId}` → count. */
export async function readyCounts(projectIds: string[], now: Date, me: string | null): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  await Promise.all(projectIds.map(async (projectId) => {
    const rows = await prisma.task.groupBy({
      by: ['assignedAgentId'],
      where: { AND: [readyWhere(projectId, now), ...(me ? [mineTasks(me)] : [])] },
      _count: { _all: true },
    })
    for (const r of rows) if (r.assignedAgentId) out.set(`${projectId}:${r.assignedAgentId}`, r._count._all)
  }))
  return out
}

/** The projects where some task has ever been run. */
export async function projectsWithRuns(projectIds: string[]): Promise<Set<string>> {
  const rows = await prisma.task.groupBy({ by: ['projectId'], where: { projectId: { in: projectIds }, runCount: { gt: 0 } } })
  return new Set(rows.map(r => r.projectId))
}

/** The run numbers of the given runs (RunResult), by run id. */
export async function runNumbers(runIds: string[]): Promise<Map<string, number>> {
  if (runIds.length === 0) return new Map()
  const rows = await prisma.runResult.findMany({ where: { runId: { in: runIds } }, select: { runId: true, number: true } })
  return new Map(rows.flatMap(r => (r.number === null ? [] : [[r.runId, r.number] as [string, number]])))
}
