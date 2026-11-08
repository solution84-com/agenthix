/**
 * An agent's tool starting a task (adr-0175): after the start gate (startGate.ts) let the call through, the task is
 * put in its agent's line — from no run pending, never over one queued, going, failed or blocked — and claimed. It
 * runs now when the agent is free in the project, else next in rank order.
 */
import { prisma } from 'wasp/server'
import type { Agent } from '@prisma/client'
import { taskRunner, type RunTaskResult } from '../../agents/TaskRunner'
import { askedToStart } from '../../projects/taskQueueing'
import { notifyBoardsOfTasks } from '../../projects/boardNotify'
import { notBeforeItsTime } from '../../projects/notBeforeItsTime'
import type { Queuer } from '../../projects/taskOnBehalfOf'
import type { StartGate } from './startGate'

export const STARTED_BY_TOOL_REASON = 'started by an agent'

type Allowed = Extract<StartGate, { refusal: null }>

/**
 * Puts the task in line and starts it. Returns null when it had a run pending, going, failed or blocked, or a start
 * time still to come, meanwhile: nothing was changed.
 */
export async function startByTool(task: { id: string; projectId: string }, agent: Agent, gate: Allowed, queuer: Queuer): Promise<RunTaskResult | null> {
  const { count } = await prisma.task.updateMany({
    where: {
      id: task.id, projectId: task.projectId, assignedAgentId: agent.id, runState: 'RUN_NONE', isEpic: false, archived: false,
      ...notBeforeItsTime(new Date()),
    },
    data: askedToStart(gate.startedBy, queuer, STARTED_BY_TOOL_REASON, gate.depth),
  })
  if (count === 0) return null
  await notifyBoardsOfTasks([task.id])
  return taskRunner.runTask(task.id, agent, gate.startedBy, gate.personId)
}
