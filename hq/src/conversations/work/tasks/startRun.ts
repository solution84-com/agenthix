/**
 * Starting a task's run for a conversation, as the person it answers would press Run (workers and results spec,
 * Results): the person must work in the task's project and the task must be runnable. The run is the person's, at
 * depth 0. Its operation is created before the run is
 * asked to start, so the run's first event always finds it.
 */
import type { PickedSkill } from '@agenthix/core'
import { prisma } from 'wasp/server'
import type { Agent } from '@prisma/client'
import { taskRunner } from '../../../agents/TaskRunner'
import { replaceTaskRequests } from '../../../agents/manifestRequests'
import { LOST_ACCESS_RUN_REFUSAL } from '../../../agents/taskExecutionReasons'
import { notifyBoardsOfTasks } from '../../../projects/boardNotify'
import { requireProjectEntitlement } from '../../../server/controlplane/authorize'
import { LOST_ACCESS_REASON, personQueuer } from '../../../projects/taskOnBehalfOf'
import { askedToStart } from '../../../projects/taskQueueing'
import type { ContinuationObligation } from '../../../shared/conversations/protocol'
import type { ToolCallOutcome, TurnCapability } from '../../contract'
import { settleOperation } from '../../coordinator/mailbox'
import { createTaskOperation } from './taskOperations'
import { EPIC_NOT_RUN } from '../../../projects/epicRules'

export const QUEUED_IN_CONVERSATION = 'queued in a conversation'

export type RunnableTask = { id: string; projectId: string; title: string; key: string; agent: Agent }

/**
 * The task, queued for its run as the person's, or why it cannot be. Throws ControlPlaneError when the turn may
 * not work on it: the person must work in its project, and a turn in a project or a task's thread reaches only
 * that project, as for every other tool a turn calls.
 */
export async function queueAsPerson(capability: TurnCapability & { actingUserId: string }, taskId: string, tool: string): Promise<RunnableTask | { refusal: string }> {
  const personId = capability.actingUserId
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true, projectId: true, title: true, number: true, runState: true, runStateReason: true,
      type: { select: { kind: true } }, assignedAgent: true, project: { select: { key: true } },
    },
  })
  if (!task) return { refusal: 'There is no such task' }
  await requireProjectEntitlement({ kind: 'turn', turn: capability }, task.projectId, tool, 'work')
  const key = `${task.project.key}-${task.number}`
  if (task.type?.kind === 'EPIC') return { refusal: EPIC_NOT_RUN }
  if (!task.assignedAgent) return { refusal: `${key} has no agent assigned to do it` }
  if (task.runState === 'RUN_BLOCKED' && task.runStateReason === LOST_ACCESS_REASON) return { refusal: LOST_ACCESS_RUN_REFUSAL }
  // A run started elsewhere is not this conversation's to follow: its result goes to the task.
  if (task.runState === 'RUN_ACTIVE') return { refusal: `${key} is already running; its result will be on the task` }

  if (task.runState !== 'RUN_QUEUED') {
    const { count } = await prisma.task.updateMany({
      where: { id: taskId, runState: { in: ['RUN_NONE', 'RUN_FAILED', 'RUN_BLOCKED'] } },
      data: askedToStart('person', personQueuer(personId), QUEUED_IN_CONVERSATION),
    })
    if (count === 0) return { refusal: `A run of ${key} was queued or started by something else first` }
    await notifyBoardsOfTasks([taskId])
    // Running again replaces a request the last run left unanswered, as a person's Run does.
    await replaceTaskRequests(taskId)
  }
  return { id: task.id, projectId: task.projectId, title: task.title, key, agent: task.assignedAgent }
}

/**
 * Creates the operation for the queued task and asks for its run. A run that cannot start now and is not held
 * for later ends the operation at once, quietly, and the lead is told why instead.
 */
export async function startTaskOperation(input: {
  capability: TurnCapability & { actingUserId: string }
  task: RunnableTask
  toolName: string
  idempotencyKey: string
  continuation: ContinuationObligation | null
  brief?: string | null
  skill?: PickedSkill | null
  /** The model the person's words named for this run: a picker value, checked. */
  model?: string | null
}): Promise<ToolCallOutcome> {
  const { capability, task, toolName, idempotencyKey, continuation, brief, skill, model } = input
  const admitted = await createTaskOperation({
    capability, toolName, idempotencyKey, continuation, brief, skill, model,
    title: `${task.key} ${task.title}`, taskId: task.id, projectId: task.projectId, state: 'QUEUED',
  })
  if (admitted.alreadyRunning) return { status: 'accepted', operationId: admitted.operationId }
  const { operationId } = admitted

  const { outcome, reason } = await taskRunner.runTask(task.id, task.agent, 'person', capability.actingUserId)
  if (outcome === 'failed') {
    const after = await prisma.task.findUnique({ where: { id: task.id }, select: { runState: true } })
    // Held for its site, or for a scheduled change: it starts when that is over, and its operation waits for it.
    if (after?.runState === 'RUN_QUEUED') return { status: 'accepted', operationId }
    const why = reason ?? 'its run could not start'
    await settleOperation(operationId, { state: 'FAILED', error: why, noReport: true })
    return { status: 'refused', reason: `${task.key} did not start: ${why}` }
  }
  return { status: 'accepted', operationId }
}
