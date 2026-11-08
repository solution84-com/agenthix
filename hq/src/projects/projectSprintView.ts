/**
 * What the Sprints screen reads (spec D13, N7, the Sprints design): the current sprint and how it is going by task
 * state, what is at work now, each upcoming sprint with what is planned in it, the past sprints with what was done and
 * what moved on, and the series' length. Counts include archived tasks, so a past sprint's record does not shrink when
 * its done tasks are swept away. Access is the caller's to check; this only reads.
 */
import { prisma } from 'wasp/server'
import { TASK_STATES, type TaskState } from '@agenthix/core'
import { boardCard, readCards, type BoardCard } from './boardCardService'
import { seriesOf, sprintOf, type SprintRow } from './projectSprintService'
import { daysLeft, daysOverdue, seriesDays, seriesParts, sprintTitle, UPCOMING_SPRINTS_MAX } from './sprintSeries'

export type SprintSummary = SprintRow & {
  title: string
  status: 'current' | 'upcoming' | 'past'
  daysLeft: number
  /** Days since its last day while it is current and not finished (N7); 0 otherwise. */
  daysOverdue: number
  counts: Record<TaskState, number> & { total: number }
  /** What its tasks' runs are doing now: a line linking to the Workroom, not a count of the plan. */
  atWork: { running: number; needsYou: number; waiting: number }
  /** Tasks per agent in it ("Load"): a count of tasks, no estimates. Every agent of the project is listed, 0 included. */
  load: Array<{ agentId: string; name: string; count: number }>
  /** The epics its tasks belong to, with how many of its tasks each has. */
  epics: Array<{ epicId: string; key: string; title: string; count: number }>
}

export type ProjectSprints = {
  /** The series' length in days; null with no sprints. */
  lengthDays: number | null
  current: SprintSummary | null
  upcoming: SprintSummary[]
  past: SprintSummary[]
  /** Whether another sprint can be planned ahead. */
  mayPlanAhead: boolean
}

type TaskFacts = { sprintId: string | null; state: TaskState; executionState: string; assignedAgentId: string | null; epicId: string | null }

/** The names a summary shows: the project's agents (in the order they joined) and the epics' keys and titles. */
type Names = { agents: Array<{ id: string; name: string }>; epics: Map<string, { key: string; title: string }> }

function summary(s: SprintRow, status: SprintSummary['status'], tasks: TaskFacts[], now: Date, names: Names): SprintSummary {
  const counts = Object.fromEntries(TASK_STATES.map(st => [st, 0])) as Record<TaskState, number>
  const load = new Map<string, number>()
  const epics = new Map<string, number>()
  const atWork = { running: 0, needsYou: 0, waiting: 0 }
  for (const t of tasks) {
    counts[t.state]++
    if (t.assignedAgentId) load.set(t.assignedAgentId, (load.get(t.assignedAgentId) ?? 0) + 1)
    if (t.epicId) epics.set(t.epicId, (epics.get(t.epicId) ?? 0) + 1)
    if (t.executionState === 'RUNNING') atWork.running++
    else if (t.executionState === 'WAITING') atWork.waiting++
    else if (t.executionState === 'NEEDS_YOU' || (t.executionState === 'FAILED' && t.state !== 'DONE')) atWork.needsYou++
  }
  return {
    ...s, title: sprintTitle(s), status,
    daysLeft: status === 'past' ? 0 : daysLeft(s, now),
    daysOverdue: status === 'current' ? daysOverdue(s, now) : 0,
    counts: { ...counts, total: tasks.length },
    atWork,
    load: [
      ...names.agents.map(a => ({ agentId: a.id, name: a.name, count: load.get(a.id) ?? 0 })),
      // An agent that has left the project still holds its tasks here.
      ...[...load].filter(([id]) => !names.agents.some(a => a.id === id)).map(([agentId, count]) => ({ agentId, name: 'An agent no longer here', count })),
    ],
    epics: [...epics].flatMap(([epicId, count]) => {
      const epic = names.epics.get(epicId)
      return epic ? [{ epicId, ...epic, count }] : []
    }),
  }
}

async function namesOf(projectId: string, tasks: TaskFacts[]): Promise<Names> {
  const epicIds = [...new Set(tasks.map(t => t.epicId).filter((id): id is string => !!id))]
  const [members, epics] = await Promise.all([
    prisma.projectAgent.findMany({ where: { projectId }, select: { agent: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } }),
    prisma.task.findMany({ where: { id: { in: epicIds }, projectId }, select: { id: true, number: true, title: true, project: { select: { key: true } } } }),
  ])
  return {
    agents: members.map(m => m.agent),
    epics: new Map(epics.map(e => [e.id, { key: `${e.project.key}-${e.number}`, title: e.title }])),
  }
}

export async function readProjectSprints(projectId: string, now = new Date()): Promise<ProjectSprints> {
  const series = await seriesOf(prisma, projectId)
  const tasks = await prisma.task.findMany({
    where: { projectId, sprintId: { in: series.map(s => s.id) } },
    select: { sprintId: true, state: true, executionState: true, assignedAgentId: true, epicId: true },
  })
  const bySprint = new Map<string, TaskFacts[]>()
  for (const t of tasks) bySprint.set(t.sprintId!, [...(bySprint.get(t.sprintId!) ?? []), t])
  const parts = seriesParts(series)
  const names = await namesOf(projectId, tasks)
  const of = (s: SprintRow, status: SprintSummary['status']) => summary(s, status, bySprint.get(s.id) ?? [], now, names)
  return {
    lengthDays: seriesDays(series),
    current: parts.current ? of(parts.current, 'current') : null,
    upcoming: parts.upcoming.map(s => of(s, 'upcoming')),
    past: parts.past.map(s => of(s, 'past')),
    mayPlanAhead: parts.current !== null && parts.upcoming.length < UPCOMING_SPRINTS_MAX,
  }
}

/** A sprint's tasks, past ones included, as cards in rank order; archived ones only when asked for. */
export async function readSprintTasks(sprintId: string, includeArchived = false): Promise<BoardCard[]> {
  const sprint = await sprintOf(sprintId)
  const cards = await readCards({ projectId: sprint.projectId, sprintId, ...(includeArchived ? { archived: undefined } : {}) })
  return cards.map(boardCard)
}
