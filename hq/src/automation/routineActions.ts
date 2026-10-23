/**
 * A person's routine actions (spec §3). Each is a change to the project, so it
 * needs someone who works in it (adr-0102). Editing, pausing, deleting and
 * unlinking are for the routine's person or a project admin; only a project
 * admin takes a routine over.
 */
import { HttpError, prisma } from 'wasp/server'
import type {
  CreateRoutine, UpdateRoutine, PauseRoutine, ResumeRoutine, DeleteRoutine, UnlinkRoutineRound, MakeTaskRoutine,
  RunRoutineNow, SkipRoutineRound,
} from 'wasp/server/operations'
import { runTask } from '../projects/actions'
import { ROUTINE_FAILING_TYPE } from '../notifications/notificationKinds'
import { clearPersistentNotification } from '../notifications/persistent'
import { requireProjectAdmin, requireMayWorkInProject } from '../projects/membership'
import { requireTaskAccess } from '../projects/resourceEntitlement'
import { personMayWorkInProject } from '../projects/taskOnBehalfOf'
import { NOT_YOURS_TO_SCHEDULE, mayScheduleTask } from './taskSchedule'
import {
  NOT_YOURS_TO_MANAGE, createRoutine as create, deleteRoutine as remove, makeRoutineFromTask, mayManageRoutine,
  pauseRoutine as pause, resumeRoutine as resume, unlinkRound, updateRoutine as update,
} from './routines'
import { RoutineError, toPriority, type RoutineScheduleInput, type RoutineTemplateInput } from './routineTemplate'
import { checkedTaskModel } from '../models-settings/taskModelChoice'
import { skipWaitingRound, takeWaitingRoundNow } from './routineNextRound'

type Ctx = { user?: { id: string } | null }

export type RoutineTemplateArgs = {
  title: string
  description?: string | null
  priority?: string
  labels?: string[]
  assignedAgentId?: string | null
  /** null for Project Tasks. */
  boardId?: string | null
  /** A column of the board; null for its Backlog; left out, the board's first column (Project Tasks' Backlog). */
  column?: string | null
  /** The model each round's run names (`<providerId>/<model>`); null or left out follows the default. */
  modelChoice?: string | null
}

function toTemplate(t: RoutineTemplateArgs): RoutineTemplateInput {
  return {
    title: t.title, description: t.description ?? null, priority: toPriority(t.priority), labels: t.labels ?? [],
    assignedAgentId: t.assignedAgentId ?? null, boardId: t.boardId ?? null, column: t.column,
    ...(t.modelChoice !== undefined ? { modelChoice: t.modelChoice } : {}),
  }
}

/** The template as given, its model checked for the project, the agent that will run it and the person. */
async function toCheckedTemplate(t: RoutineTemplateArgs, where: { projectId: string; userId: string; agentId?: string | null }): Promise<RoutineTemplateInput> {
  const template = toTemplate(t)
  if (t.modelChoice === undefined) return template
  return { ...template, modelChoice: await checkedTaskModel(t.modelChoice, { ...where, agentId: template.assignedAgentId ?? where.agentId }) }
}

async function asHttp<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof RoutineError) throw new HttpError(400, err.message)
    throw err
  }
}

async function managed(routineId: string, context: Ctx, what: string) {
  if (!context.user) throw new HttpError(401)
  const routine = await prisma.routine.findUnique({ where: { id: routineId } })
  if (!routine) throw new HttpError(404, 'Routine not found')
  await requireMayWorkInProject(routine.projectId, context.user.id, what)
  if (!(await mayManageRoutine(routine, context.user.id))) throw new HttpError(403, NOT_YOURS_TO_MANAGE)
  return { routine, userId: context.user.id }
}

export const createRoutine: CreateRoutine<
  { projectId: string; template: RoutineTemplateArgs; schedule: RoutineScheduleInput },
  { id: string }
> = async (args, context) => {
  if (!context.user) throw new HttpError(401)
  await requireMayWorkInProject(args.projectId, context.user.id, 'Setting up a routine')
  const userId = context.user.id
  const template = await asHttp(() => toCheckedTemplate(args.template, { projectId: args.projectId, userId }))
  const routine = await asHttp(() => create(args.projectId, template, args.schedule, { kind: 'person', userId }))
  return { id: routine.id }
}

export const makeTaskRoutine: MakeTaskRoutine<{ taskId: string; schedule: RoutineScheduleInput }, { id: string }> = async (args, context) => {
  if (!context.user) throw new HttpError(401)
  await requireTaskAccess(args.taskId, context.user.id, 'Making this task a routine')
  if (!(await mayScheduleTask(args.taskId, context.user.id))) throw new HttpError(403, NOT_YOURS_TO_SCHEDULE)
  const userId = context.user.id
  const routine = await asHttp(() => makeRoutineFromTask(args.taskId, args.schedule, { kind: 'person', userId }))
  return { id: routine.id }
}

export const updateRoutine: UpdateRoutine<
  { routineId: string; template?: RoutineTemplateArgs; schedule?: RoutineScheduleInput; onBehalfOfUserId?: string },
  { id: string }
> = async (args, context) => {
  const { routine, userId } = await managed(args.routineId, context, 'Changing this routine')
  const takingOver = args.onBehalfOfUserId !== undefined && args.onBehalfOfUserId !== routine.onBehalfOfUserId
  if (takingOver) {
    await requireProjectAdmin(routine.projectId, userId, 'Choosing who this routine is done on behalf of')
    if (!(await personMayWorkInProject(routine.projectId, args.onBehalfOfUserId!))) {
      throw new HttpError(400, 'That person cannot work in this project')
    }
  }
  const template = args.template ? await asHttp(() => toCheckedTemplate(args.template!, { projectId: routine.projectId, userId, agentId: routine.assignedAgentId })) : undefined
  await asHttp(() => update(routine.id, {
    template,
    schedule: args.schedule,
    onBehalfOfUserId: takingOver ? args.onBehalfOfUserId : undefined,
  }))
  return { id: routine.id }
}

export const pauseRoutine: PauseRoutine<{ routineId: string }, void> = async (args, context) => {
  const { routine } = await managed(args.routineId, context, 'Pausing this routine')
  await pause(routine.id)
}

export const resumeRoutine: ResumeRoutine<{ routineId: string }, void> = async (args, context) => {
  const { routine } = await managed(args.routineId, context, 'Turning this routine on')
  await asHttp(() => resume(routine.id))
}

export const deleteRoutine: DeleteRoutine<{ routineId: string }, void> = async (args, context) => {
  const { routine } = await managed(args.routineId, context, 'Deleting this routine')
  await remove(routine.id)
  await clearPersistentNotification(ROUTINE_FAILING_TYPE, routine.id)
}

/**
 * Run now (spec §3): the waiting round starts at once, as Run starts a task —
 * by this person — while a fresh round waits for the same time.
 */
export const runRoutineNow: RunRoutineNow<{ routineId: string }, { taskId: string }> = async (args, context) => {
  const { routine } = await managed(args.routineId, context, 'Running this routine now')
  const { taskId } = await asHttp(() => takeWaitingRoundNow(routine.id))
  await runTask({ taskId }, context as Parameters<typeof runTask>[1])
  return { taskId }
}

export const skipRoutineRound: SkipRoutineRound<{ routineId: string }, void> = async (args, context) => {
  const { routine } = await managed(args.routineId, context, 'Skipping this round')
  await asHttp(() => skipWaitingRound(routine.id))
}

export const unlinkRoutineRound: UnlinkRoutineRound<{ taskId: string }, void> = async (args, context) => {
  const task = await prisma.task.findUnique({ where: { id: args.taskId }, select: { routineId: true } })
  if (!task?.routineId) throw new HttpError(400, 'This task is not a round of a routine')
  await managed(task.routineId, context, 'Unlinking a round')
  await unlinkRound(args.taskId)
}
