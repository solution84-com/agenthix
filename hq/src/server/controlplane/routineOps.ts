/**
 * `create_routine` and `update_routine` — an agent setting up or changing a
 * routine (spec §3, adr-0092) under the same gate as a task's start time: only
 * in a run a person started directly, where the project lets agents set
 * schedules, on behalf of that person and recording the agent and its session.
 */
import { prisma } from 'wasp/server'
import { ControlPlaneError, type CallerContext } from './types'
import { requireProjectEntitlement } from './authorize'
import { requireMaySchedule, setterOf } from './scheduleOps'
import {
  NOT_YOURS_TO_MANAGE, createRoutine, mayManageRoutine, pauseRoutine, resumeRoutine, updateRoutine,
  type RoutineCreator,
} from '../../automation/routines'
import { RoutineError, toPriority, type RoutineTemplateInput } from '../../automation/routineTemplate'
import { isValidTimezone, type ScheduleRule } from '../../automation/scheduleRule'
import { readTimeIn } from '../../automation/zonedInput'
import { readingZone, type ReadingZone } from './personTimezone'

interface ScheduleArgs {
  rule?: ScheduleRule | null
  at?: string
  timezone?: string
}

interface CreateRoutineArgs extends ScheduleArgs {
  projectId: string
  title: string
  description?: string
  priority?: string
  labels?: string[]
  assignedAgentId?: string
  boardId?: string
  column?: string | null
}

interface UpdateRoutineArgs extends ScheduleArgs {
  routineId: string
  title?: string
  description?: string
  priority?: string
  labels?: string[]
  assignedAgentId?: string | null
  boardId?: string | null
  column?: string | null
  enabled?: boolean
}

/** The zone a routine's times are read in — and the `at`, if offset-less, read in it — before the schedule is checked. */
async function scheduleIn(args: ScheduleArgs, userId: string, fallback?: string) {
  if (args.timezone && !isValidTimezone(args.timezone)) throw new ControlPlaneError('invalid', `"${args.timezone}" is not a timezone`)
  const zone: ReadingZone = await readingZone(args.timezone, userId, fallback)
  return { zone, schedule: { rule: args.rule ?? null, at: readTimeIn(args.at, zone.timezone), timezone: zone.timezone } }
}

function asInvalid<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch(err => {
    if (err instanceof RoutineError) throw new ControlPlaneError('invalid', err.message)
    throw err
  })
}

export async function createRoutineOp(ctx: CallerContext, args: CreateRoutineArgs) {
  // A routine starts work, so it needs the role the browser asks of it (R-032).
  await requireProjectEntitlement(ctx, args.projectId, 'create_routine', 'work')
  await requireMaySchedule(ctx, args.projectId, 'create_routine')
  const creator: RoutineCreator = await setterOf(ctx, args.projectId, 'create_routine')
  const { zone, schedule } = await scheduleIn(args, creator.userId)
  return asInvalid(async () => {
    const template: RoutineTemplateInput = {
      title: args.title, description: args.description ?? null, priority: toPriority(args.priority),
      labels: args.labels ?? [], assignedAgentId: args.assignedAgentId ?? null,
      boardId: args.boardId ?? null, column: args.column,
    }
    const routine = await createRoutine(args.projectId, template, schedule, creator)
    return {
      routineId: routine.id, nextRoundAt: routine.nextRoundAt?.toISOString() ?? null,
      timezone: zone.timezone, ...(zone.note ? { note: zone.note } : {}),
    }
  })
}

export async function updateRoutineOp(ctx: CallerContext, args: UpdateRoutineArgs) {
  const routine = await prisma.routine.findUnique({ where: { id: args.routineId } })
  if (!routine) throw new ControlPlaneError('not_found', `Routine ${args.routineId} not found`)
  await requireProjectEntitlement(ctx, routine.projectId, 'update_routine', 'work')
  await requireMaySchedule(ctx, routine.projectId, 'update_routine')
  const actor = await setterOf(ctx, routine.projectId, 'update_routine')
  if (!(await mayManageRoutine(routine, actor.userId))) throw new ControlPlaneError('forbidden', NOT_YOURS_TO_MANAGE)

  // Only a change to the schedule reads times; when the person has no timezone, the routine's own stands.
  const scheduled = args.rule !== undefined ? await scheduleIn(args, actor.userId, routine.scheduleTimezone) : null
  return asInvalid(async () => {
    const template: Partial<RoutineTemplateInput> = {
      ...(args.title !== undefined ? { title: args.title } : {}),
      ...(args.description !== undefined ? { description: args.description } : {}),
      ...(args.priority !== undefined ? { priority: toPriority(args.priority) } : {}),
      ...(args.labels !== undefined ? { labels: args.labels } : {}),
      ...(args.assignedAgentId !== undefined ? { assignedAgentId: args.assignedAgentId } : {}),
      ...(args.boardId !== undefined ? { boardId: args.boardId, column: args.column } : {}),
      ...(args.boardId === undefined && args.column !== undefined ? { column: args.column } : {}),
    }
    const schedule = scheduled?.schedule
    if (Object.keys(template).length > 0 || schedule) await updateRoutine(routine.id, { template, schedule })
    if (args.enabled === false) await pauseRoutine(routine.id)
    if (args.enabled === true) await resumeRoutine(routine.id)
    const now = await prisma.routine.findUnique({ where: { id: routine.id } })
    return {
      routineId: routine.id, enabled: now?.enabled ?? false, nextRoundAt: now?.nextRoundAt?.toISOString() ?? null,
      ...(scheduled ? { timezone: scheduled.zone.timezone } : {}), ...(scheduled?.zone.note ? { note: scheduled.zone.note } : {}),
    }
  })
}
