/**
 * An agent's Start and Start all agents (spec D6, D17, adr-0175): a person's explicit act that puts the agent's ready
 * tasks they ticked in its line, on their behalf (adr-0095) at depth 0 (adr-0091). The agent takes them one at a time
 * in the project's rank order (agentLineOrder.ts): the first now if it is free, each next one when the run before it
 * ends — finished, failed or stopped (N3).
 *
 * Races. Each task is put in line by one conditional write that re-checks it is still ready for that agent — so two
 * Starts, a Start and a Run, or a Start and a move, a reassignment or a Stop each leave a task in line at most once —
 * and the agent's slot is claimed under the (agent, project) lock (taskSlotClaim.ts), so two Starts never start two
 * runs. A Stop that lands between the claim and the dispatch's acknowledgement cancels the run it started
 * (TaskRunner `stoppedDuringDispatch`).
 */
import { HttpError, prisma } from 'wasp/server'
import { taskRunner } from '../agents/TaskRunner'
import { askedToStart } from './taskQueueing'
import { personQueuer } from './taskOnBehalfOf'
import { notifyBoardsOfTasks } from './boardNotify'
import { readyWhere, START_PLAN_LIMIT } from './agentStartPlan'

export const STARTED_FROM_WORKROOM = 'started from the Workroom'

/** The ticked task ids a Start was given: a list of distinct ids, at most one dialog's worth. */
export function checkedTaskIds(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > START_PLAN_LIMIT || !raw.every(id => typeof id === 'string' && id.length > 0 && id.length <= 64)) {
    throw new HttpError(400, `Tick between 1 and ${START_PLAN_LIMIT} tasks to start. Nothing was changed.`)
  }
  return [...new Set(raw as string[])]
}

export type StartResult = { started: number; agents: number }

/** One agent's Start: the ticked tasks still ready for it go in its line, and it takes the first if it is free. */
export async function startAgent(projectId: string, agentId: string, taskIds: string[], userId: string): Promise<StartResult> {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } })
  if (!agent) throw new HttpError(404, 'That agent does not exist. Nothing was changed.')
  const now = new Date()
  const ready = await prisma.task.findMany({ where: { id: { in: taskIds }, ...readyWhere(projectId, now, agentId) }, select: { id: true } })
  if (ready.length === 0) return { started: 0, agents: 0 }
  const { count } = await prisma.task.updateMany({
    where: { id: { in: ready.map(t => t.id) }, ...readyWhere(projectId, now, agentId) },
    data: askedToStart('person', personQueuer(userId), STARTED_FROM_WORKROOM),
  })
  if (count === 0) return { started: 0, agents: 0 }
  await notifyBoardsOfTasks(ready.map(t => t.id))
  await taskRunner.triggerNext(agent, projectId)
  return { started: count, agents: 1 }
}

/** Start all agents: each ticked task still ready for its own agent goes in that agent's line; each free agent starts. */
export async function startAllAgents(projectId: string, taskIds: string[], userId: string): Promise<StartResult> {
  const now = new Date()
  const ready = await prisma.task.findMany({ where: { id: { in: taskIds }, ...readyWhere(projectId, now) }, select: { id: true, assignedAgentId: true } })
  if (ready.length === 0) return { started: 0, agents: 0 }
  const { count } = await prisma.task.updateMany({
    where: { id: { in: ready.map(t => t.id) }, ...readyWhere(projectId, now) },
    data: askedToStart('person', personQueuer(userId), STARTED_FROM_WORKROOM),
  })
  if (count === 0) return { started: 0, agents: 0 }
  await notifyBoardsOfTasks(ready.map(t => t.id))
  const agentIds = [...new Set(ready.map(t => t.assignedAgentId).filter((id): id is string => !!id))]
  const agents = await prisma.agent.findMany({ where: { id: { in: agentIds } } })
  // Each agent's slot is its own lock: they start side by side.
  await Promise.all(agents.map(agent => taskRunner.triggerNext(agent, projectId)))
  return { started: count, agents: agents.length }
}
