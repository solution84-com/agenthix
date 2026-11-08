/**
 * `create_routine` and `update_routine`: an agent making or changing a routine (adr-0177) under the same gate as a
 * task's start time: only in a run a person started directly, where the project lets agents set schedules, and on
 * behalf of that person, recording the agent and its session. Anyone who may work in the project may change a
 * routine (N6); the change then makes it run on behalf of the run's person. A routine's own run never makes or
 * changes routines, whoever started it, so a routine cannot remake itself or spawn others.
 */
import { prisma } from 'wasp/server'
import { isTimezone } from '@agenthix/core'
import { ControlPlaneError, type CallerContext } from './types'
import { requireProjectEntitlement } from './authorize'
import { requireMaySchedule, setterOf } from './scheduleOps'
import { RoutineError, changeRoutine, createRoutine, type RoutineActor, type RoutineChange } from '../../automation/routines'
import { checkedTaskModel } from '../../models-settings/taskModelChoice'
import { readingZone } from './personTimezone'

interface CreateRoutineArgs {
  projectId: string
  title: string
  agentId: string
  instructions: string
  cron: string
  timezone?: string
  modelChoice?: string
}

interface UpdateRoutineArgs {
  routineId: string
  title?: string
  agentId?: string
  instructions?: string
  cron?: string
  timezone?: string
  modelChoice?: string | null
  enabled?: boolean
}

/** A run of a routine: its session is the one hq made for that firing, or for a Run now (routineDispatch.ts). */
async function refuseInRoutineRun(ctx: CallerContext, tool: string): Promise<void> {
  if (ctx.kind !== 'run') return
  const run = await prisma.routineRun.findUnique({ where: { sessionId: ctx.claims.sessionId }, select: { id: true } })
  if (run) {
    throw new ControlPlaneError(
      'forbidden',
      `${tool} is not available in a run of a routine: a routine's run cannot make or change routines. A person can ` +
        'change it on its Routines page. Nothing was changed.',
    )
  }
}

function asInvalid<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch(err => {
    if (err instanceof RoutineError) throw new ControlPlaneError('invalid', err.message)
    throw err
  })
}

function checkZone(timezone: string | undefined): void {
  if (timezone !== undefined && !isTimezone(timezone)) throw new ControlPlaneError('invalid', `"${timezone}" is not a timezone`)
}

async function modelFor(raw: unknown, projectId: string, actor: RoutineActor, agentId: string | null): Promise<string | null> {
  try {
    return await checkedTaskModel(raw, { projectId, userId: actor.userId, agentId })
  } catch (err) {
    throw new ControlPlaneError('invalid', err instanceof Error ? err.message : 'That model cannot be used here')
  }
}

export async function createRoutineOp(ctx: CallerContext, args: CreateRoutineArgs) {
  // A routine starts work, so it needs the role the browser asks of it (R-032).
  await requireProjectEntitlement(ctx, args.projectId, 'create_routine', 'work')
  await requireMaySchedule(ctx, args.projectId, 'create_routine')
  await refuseInRoutineRun(ctx, 'create_routine')
  const actor: RoutineActor = await setterOf(ctx, args.projectId, 'create_routine')
  checkZone(args.timezone)
  const zone = await readingZone(args.timezone, actor.userId)
  const modelChoice = await modelFor(args.modelChoice, args.projectId, actor, args.agentId)
  return asInvalid(async () => {
    const routine = await createRoutine(args.projectId, {
      title: args.title, agentId: args.agentId, instructions: args.instructions, cron: args.cron, timezone: zone.timezone, modelChoice,
    }, actor)
    return {
      routineId: routine.id, nextRunAt: routine.nextDueAt?.toISOString() ?? null,
      timezone: zone.timezone, ...(zone.note ? { note: zone.note } : {}),
    }
  })
}

export async function updateRoutineOp(ctx: CallerContext, args: UpdateRoutineArgs) {
  const routine = await prisma.routine.findUnique({ where: { id: args.routineId } })
  if (!routine) throw new ControlPlaneError('not_found', `Routine ${args.routineId} not found`)
  await requireProjectEntitlement(ctx, routine.projectId, 'update_routine', 'work')
  await requireMaySchedule(ctx, routine.projectId, 'update_routine')
  await refuseInRoutineRun(ctx, 'update_routine')
  const actor: RoutineActor = await setterOf(ctx, routine.projectId, 'update_routine')
  checkZone(args.timezone)
  // A new cron rule is read in the zone named, else the person's; the routine's own when they have none.
  const zone = args.cron !== undefined || args.timezone !== undefined ? await readingZone(args.timezone, actor.userId, routine.timezone) : null
  const change: RoutineChange = {
    ...(args.title !== undefined ? { title: args.title } : {}),
    ...(args.agentId !== undefined ? { agentId: args.agentId } : {}),
    ...(args.instructions !== undefined ? { instructions: args.instructions } : {}),
    ...(args.cron !== undefined ? { cron: args.cron } : {}),
    ...(zone ? { timezone: zone.timezone } : {}),
    ...(args.enabled !== undefined ? { enabled: args.enabled } : {}),
  }
  if (args.modelChoice !== undefined) change.modelChoice = await modelFor(args.modelChoice, routine.projectId, actor, args.agentId ?? routine.agentId)
  return asInvalid(async () => {
    const now = await changeRoutine(routine.id, change, actor)
    return {
      routineId: now.id, enabled: now.enabled, nextRunAt: now.nextDueAt?.toISOString() ?? null,
      ...(zone ? { timezone: zone.timezone } : {}), ...(zone?.note ? { note: zone.note } : {}),
    }
  })
}
