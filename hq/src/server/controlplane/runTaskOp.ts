/**
 * run_task — control-plane service layer, split from taskOps.ts (see its header for the shared conventions).
 *
 * It starts a run of a queued task and returns at once: when the run has started, or is waiting for its agent's
 * running task in the project. It never waits for the run to end. A conversation's turn has its own run_task
 * (conversations/work/tasks), which starts the run as the person's and follows it as an operation.
 */
import { prisma } from 'wasp/server'
import type { TaskRunState } from '@prisma/client'
import { ControlPlaneError, type CallerContext } from './types'
import { loadTaskScoped } from './taskScoped'
import { taskRunner } from '../../agents/TaskRunner'
import { startedByOf } from './runStarter'
import { effectiveForProject } from '../../automation/automationStore'

export async function runTaskOp(ctx: CallerContext, args: { taskId: string }) {
  // A conversation starts a run as an operation of its own, never as a quick call (turnCaller.ts).
  if (ctx.kind === 'turn') throw new ControlPlaneError('forbidden', 'run_task is not available in a conversation')
  await loadTaskScoped(ctx, args.taskId, 'run_task', 'work')

  const task = await prisma.task.findUnique({
    where: { id: args.taskId },
    include: { assignedAgent: true },
  })
  if (!task) {
    throw new ControlPlaneError('not_found', `Task ${args.taskId} not found`)
  }
  if (!task.assignedAgent) {
    throw new ControlPlaneError('invalid', `Task ${args.taskId} has no assigned agent`)
  }
  if (!task.boardId) {
    throw new ControlPlaneError('invalid', `Task ${args.taskId} is on no board — move it to a board before executing`)
  }
  // run_task starts a queued task and nothing else; anything else says so.
  if (task.runState !== 'RUN_QUEUED' && task.runState !== 'RUN_THROTTLED') {
    throw new ControlPlaneError('invalid', `Task ${args.taskId} ${NOT_QUEUED[task.runState]} — run_task starts only a queued task`)
  }

  // Starting other tasks is the pulse's job: a run no person started leaves
  // queued work for it. Only a run a person started may start one directly, at
  // their request — and the run it starts is the agent's, not the person's
  // (adr-0091): it carries the turn limit and cannot call run_task itself, so
  // one press of Run can never become an unbounded chain of runs counted as the
  // person's. A person's own connection starts it as the person.
  const callerStartedBy = startedByOf(ctx)
  if (callerStartedBy !== 'person') {
    const { enabled } = await effectiveForProject(task.projectId)
    const fate = enabled
      ? 'it starts when its agent is free'
      : "it waits for a person to run it or turn automation on for the project"
    throw new ControlPlaneError(
      'forbidden',
      `run_task is not available in a run the ${callerStartedBy} started — leave the task queued; ${fate}`,
    )
  }
  const startedBy = ctx.kind === 'connection' ? 'person' : 'agent'
  // A person's own connection starts it on their behalf; an agent's start is nobody's.
  const personId = ctx.kind === 'connection' ? ctx.connection.userId : null

  // No wrap-and-rethrow here (plan 5b-2 task 5 review, I3): a taskRunner
  // failure has no domain error type worth translating, so it propagates
  // uncaught rather than forwarding err.message into a 400 body — dataApi.ts's
  // generic catch turns it into an opaque 500 instead.
  const { outcome, reason } = await taskRunner.runTask(args.taskId, task.assignedAgent, startedBy, personId)
  if (outcome === 'skipped') {
    throw new ControlPlaneError('conflict', `Task ${args.taskId} was started by something else first`)
  }
  const updated = await prisma.task.findUnique({
    where: { id: args.taskId },
    select: { runState: true },
  })
  return {
    taskId: args.taskId,
    runState: updated?.runState ?? 'unknown',
    ...(outcome === 'waiting' ? { note: "It starts when this agent's running task in this project finishes" } : {}),
    ...(outcome === 'failed' ? { note: `It did not start: ${reason}` } : {}),
  }
}

/** Why run_task refuses a task, by its run state. */
export const NOT_QUEUED: Record<TaskRunState, string> = {
  RUN_NONE: 'is not queued',
  RUN_QUEUED: 'is queued',
  RUN_THROTTLED: 'is throttled',
  RUN_ACTIVE: 'is already running',
  RUN_BLOCKED: 'is blocked until a person acts on it',
  RUN_FAILED: 'failed its last run, and waits for a person',
}
