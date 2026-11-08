/**
 * run_task — control-plane service layer, split from taskOps.ts (see its header for the shared conventions).
 *
 * An agent's tool starting a task (adr-0175): a task with no run pending, or one already in its agent's line. It
 * returns at once: when the run has started, or is waiting for its agent's running task in the project. It never
 * waits for the run to end. Who may start one, and at what depth, is the start gate's (startGate.ts). A
 * conversation's turn has its own run_task (conversations/work/tasks), which starts the run as the person's and
 * follows it as an operation.
 */
import { prisma } from 'wasp/server'
import type { TaskRunState } from '@prisma/client'
import { ControlPlaneError, type CallerContext } from './types'
import { loadTaskScoped } from './taskScoped'
import { taskRunner, type RunTaskResult } from '../../agents/TaskRunner'
import { callerQueuer } from './runOnBehalfOf'
import { startGate } from './startGate'
import { startByTool } from './startByTool'
import { OWN_TASK } from './runTaskWords'
import { EPIC_NOT_RUN } from '../../projects/epicRules'

export { OWN_TASK }

export async function runTaskOp(ctx: CallerContext, args: { taskId: string }) {
  // A conversation starts a run as an operation of its own, never as a quick call (turnCaller.ts).
  if (ctx.kind === 'turn') throw new ControlPlaneError('forbidden', 'run_task is not available in a conversation')
  const scoped = await loadTaskScoped(ctx, args.taskId, 'run_task', 'work')
  if (ctx.kind === 'run' && ctx.claims.taskId === scoped.id) throw new ControlPlaneError('forbidden', OWN_TASK)

  const task = await prisma.task.findUnique({
    where: { id: args.taskId },
    include: { assignedAgent: true },
  })
  if (!task) {
    throw new ControlPlaneError('not_found', `Task ${args.taskId} not found`)
  }
  if (task.isEpic) throw new ControlPlaneError('invalid', EPIC_NOT_RUN)
  if (task.archived) {
    throw new ControlPlaneError('invalid', `Task ${args.taskId} is archived: bring it back with update_task (archived: false) first. Nothing was changed.`)
  }
  if (!task.assignedAgent) {
    throw new ControlPlaneError('invalid', `Task ${args.taskId} has no agent to do it: assign one with update_task first. Nothing was changed.`)
  }
  if (task.runState !== 'RUN_NONE' && task.runState !== 'RUN_QUEUED') {
    throw new ControlPlaneError('invalid', `Task ${args.taskId} ${NOT_STARTABLE[task.runState]}. Nothing was changed.`)
  }
  if (task.scheduleNextDueAt && task.scheduleNextDueAt.getTime() > Date.now()) {
    throw new ControlPlaneError('invalid', `Task ${args.taskId} has a start time still to come; it starts then. Nothing was changed.`)
  }

  const gate = await startGate(ctx)
  if (gate.refusal !== null) throw new ControlPlaneError('forbidden', `run_task: ${gate.refusal}`)

  // No wrap-and-rethrow here (plan 5b-2 task 5 review, I3): a taskRunner
  // failure has no domain error type worth translating, so it propagates
  // uncaught rather than forwarding err.message into a 400 body — dataApi.ts's
  // generic catch turns it into an opaque 500 instead.
  const result: RunTaskResult | null = task.runState === 'RUN_QUEUED'
    ? await taskRunner.runTask(args.taskId, task.assignedAgent, gate.startedBy, gate.personId)
    : await startByTool(task, task.assignedAgent, gate, callerQueuer(ctx))
  if (!result || result.outcome === 'skipped') {
    throw new ControlPlaneError('conflict', `Task ${args.taskId} was started or changed by something else first`)
  }
  const updated = await prisma.task.findUnique({
    where: { id: args.taskId },
    select: { runState: true },
  })
  return {
    taskId: args.taskId,
    runState: updated?.runState ?? 'unknown',
    ...(result.outcome === 'waiting' ? { note: "It starts when this agent's running task in this project finishes" } : {}),
    ...(result.outcome === 'failed' ? { note: `It did not start: ${result.reason}` } : {}),
  }
}

/** Why run_task refuses a task, by its run state. */
export const NOT_STARTABLE: Record<TaskRunState, string> = {
  RUN_NONE: 'has no run pending',
  RUN_QUEUED: 'is waiting in its agent\'s line',
  RUN_ACTIVE: 'is already running',
  RUN_BLOCKED: 'is blocked until a person acts on it',
  RUN_FAILED: 'failed its last run, and waits for a person',
}
