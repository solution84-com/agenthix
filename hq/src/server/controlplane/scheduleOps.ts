/**
 * `set_task_schedule` — an agent setting or clearing a task's start time (spec
 * §3); it starts once. Only when a person asked: the run must be one a person started
 * directly, and the task's project must allow agents to set schedules (off by
 * default, and only where the org allows it). A run no person started is
 * refused, so unattended work can never schedule work (adr-0175).
 */
import { prisma } from 'wasp/server'
import { ControlPlaneError, type CallerContext } from './types'
import { requireProjectEntitlement } from './authorize'
import { startedByOf } from './runStarter'
import { originOfRun } from './runOnBehalfOf'
import { readingZone } from './personTimezone'
import { readTimeIn } from '../../automation/zonedInput'
import { isValidTimezone } from '../../automation/scheduleRule'
import { projectAgentsMaySchedule } from '../../automation/automationStore'
import {
  NOT_YOURS_TO_SCHEDULE, ScheduleError, clearTaskSchedule, mayScheduleTask, setTaskSchedule,
  type ScheduleInput, type ScheduleSetter,
} from '../../automation/taskSchedule'

interface SetTaskScheduleArgs extends ScheduleInput {
  taskId: string
  clear?: boolean
  /** IANA zone an offset-less `at` is read in; default is the run's person's. */
  timezone?: string
}

export async function setTaskScheduleOp(ctx: CallerContext, args: SetTaskScheduleArgs) {
  const task = await prisma.task.findUnique({ where: { id: args.taskId }, select: { id: true, projectId: true } })
  if (!task) throw new ControlPlaneError('not_found', `Task ${args.taskId} not found`)
  // Setting a start time is starting work, as in the browser (R-032).
  await requireProjectEntitlement(ctx, task.projectId, 'set_task_schedule', 'work')

  await requireMaySchedule(ctx, task.projectId, 'set_task_schedule')

  // The agent acts for its run's person, who must be one who may schedule this task.
  const setter = await setterOf(ctx, task.projectId)
  if (!(await mayScheduleTask(task.id, setter.userId))) throw new ControlPlaneError('forbidden', NOT_YOURS_TO_SCHEDULE)

  if (args.clear) {
    await clearTaskSchedule(task.id)
    return { taskId: task.id, scheduled: false }
  }
  if (args.timezone && !isValidTimezone(args.timezone)) throw new ControlPlaneError('invalid', `"${args.timezone}" is not a timezone`)
  const zone = await readingZone(args.timezone, setter.userId)
  try {
    const stored = await setTaskSchedule(task.id, { at: readTimeIn(args.at, zone.timezone) }, setter)
    return {
      taskId: task.id,
      scheduled: true,
      startsAt: stored.scheduleNextDueAt?.toISOString() ?? null,
      timezone: zone.timezone,
      ...(zone.note ? { note: zone.note } : {}),
    }
  } catch (err) {
    if (err instanceof ScheduleError) throw new ControlPlaneError('invalid', err.message)
    throw err
  }
}

/**
 * The gate every scheduling tool shares (spec §3): only in a run a person
 * started directly, and for an agent only where the project lets agents set
 * schedules when asked (off by default, and only where the org allows it).
 */
export async function requireMaySchedule(ctx: CallerContext, projectId: string, tool: string): Promise<void> {
  // Setting a start time starts work later, which a conversation commissions as its own operation.
  if (ctx.kind === 'turn') throw new ControlPlaneError('forbidden', `${tool} is not available in a conversation`)
  const startedBy = startedByOf(ctx)
  if (startedBy !== 'person') {
    throw new ControlPlaneError(
      'forbidden',
      `${tool} is only available when a person asked for it — this run was started by the ${startedBy}`,
    )
  }
  // A person's connection is that person acting, as on the page itself (adr-0090).
  if (ctx.kind === 'run' && !(await projectAgentsMaySchedule(projectId))) {
    throw new ControlPlaneError(
      'forbidden',
      "This project does not let agents set schedules. A person can set one themselves, or a project admin can turn on " +
        '"agents may set start times when asked" in the project\'s automation rules.',
    )
  }
}

/**
 * Who sets it: the agent, in its run's session, on behalf of the person that
 * run is for (adr-0089) — a chat's person, or for a task run the person its
 * task is done on behalf of; or a connection's person, through it. That person
 * must still reach the project.
 */
export async function setterOf(ctx: CallerContext, projectId: string, tool = 'set_task_schedule'): Promise<ScheduleSetter> {
  const origin = await originOfRun(ctx, projectId, tool)
  if (ctx.kind === 'connection') {
    return { kind: 'person', userId: origin.onBehalfOfUserId, connectionId: ctx.connection.connectionId }
  }
  if (ctx.kind === 'turn') throw new ControlPlaneError('forbidden', `${tool} is not available in a conversation`)
  return { kind: 'agent', agentId: ctx.claims.agentId, sessionId: ctx.claims.sessionId, userId: origin.onBehalfOfUserId }
}
