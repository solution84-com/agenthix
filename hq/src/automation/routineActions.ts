/**
 * A person's routine actions (adr-0177, N6). Each needs someone who may work in the routine's project (adr-0102),
 * and any change, switching on or off included, makes the routine run on behalf of whoever made it. Run now is one
 * run on behalf of whoever pressed it, and changes nothing about whose routine it is.
 */
import { HttpError, prisma } from 'wasp/server'
import type { CreateRoutine, DeleteRoutine, RunRoutineNow, UpdateRoutine } from 'wasp/server/operations'
import { ROUTINE_FAILING_TYPE } from '../notifications/notificationKinds'
import { clearPersistentNotification } from '../notifications/persistent'
import { requireMayWorkInProject } from '../projects/membership'
import { checkedTaskModel } from '../models-settings/taskModelChoice'
import { RoutineError, changeRoutine, createRoutine as create, deleteRoutine as remove, type RoutineChange } from './routines'
import { runRoutineNow as fireNow } from './routineFiring'

type Ctx = { user?: { id: string } | null }

export type RoutineArgs = {
  title: string
  agentId: string | null
  instructions: string
  cron: string
  timezone: string
  /** `<providerId>/<model>`; null or left out follows the agent's own. */
  modelChoice?: string | null
}

async function asHttp<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof RoutineError) throw new HttpError(400, err.message)
    throw err
  }
}

function signedIn(context: Ctx): string {
  if (!context.user) throw new HttpError(401)
  return context.user.id
}

async function routineToWorkIn(routineId: string, userId: string, what: string) {
  const routine = await prisma.routine.findUnique({ where: { id: routineId } })
  if (!routine) throw new HttpError(404, 'Routine not found')
  await requireMayWorkInProject(routine.projectId, userId, what)
  return routine
}

const text = (v: unknown): v is string => typeof v === 'string'
const agentRef = (v: unknown): v is string | null => v === null || (text(v) && v.length > 0)

export const createRoutine: CreateRoutine<{ projectId: string } & RoutineArgs, { id: string }> = async (args, context) => {
  const userId = signedIn(context)
  await requireMayWorkInProject(args.projectId, userId, 'Making a routine')
  if (![args.title, args.instructions, args.cron, args.timezone].every(text) || !agentRef(args.agentId ?? null)) {
    throw new HttpError(400, 'A routine needs a name, instructions, a schedule and a timezone. Nothing was changed.')
  }
  const modelChoice = await asHttp(() => checkedTaskModel(args.modelChoice, { projectId: args.projectId, userId, agentId: args.agentId }))
  const routine = await asHttp(() => create(args.projectId, {
    title: args.title, agentId: args.agentId ?? null, instructions: args.instructions, cron: args.cron, timezone: args.timezone, modelChoice,
  }, { kind: 'person', userId }))
  return { id: routine.id }
}

export const updateRoutine: UpdateRoutine<{ routineId: string } & Partial<RoutineArgs> & { enabled?: boolean }, { id: string }> = async (args, context) => {
  const userId = signedIn(context)
  const routine = await routineToWorkIn(args.routineId, userId, 'Changing this routine')
  const change: RoutineChange = {}
  for (const key of ['title', 'instructions', 'cron', 'timezone'] as const) {
    if (args[key] !== undefined) {
      if (!text(args[key])) throw new HttpError(400, `A routine's ${key} must be text`)
      change[key] = args[key]
    }
  }
  if (args.agentId !== undefined) {
    if (!agentRef(args.agentId)) throw new HttpError(400, "A routine's agent is an agent's id, or none. Nothing was changed.")
    change.agentId = args.agentId
  }
  if (args.enabled !== undefined) change.enabled = args.enabled === true
  if (args.modelChoice !== undefined) {
    change.modelChoice = await asHttp(() => checkedTaskModel(args.modelChoice, {
      projectId: routine.projectId, userId, agentId: change.agentId ?? routine.agentId,
    }))
  }
  await asHttp(() => changeRoutine(routine.id, change, { kind: 'person', userId }))
  return { id: routine.id }
}

export const deleteRoutine: DeleteRoutine<{ routineId: string }, void> = async (args, context) => {
  const userId = signedIn(context)
  const routine = await routineToWorkIn(args.routineId, userId, 'Deleting this routine')
  await remove(routine.id)
  await clearPersistentNotification(ROUTINE_FAILING_TYPE, routine.id)
}

/** Run now: one run on the presser's behalf, listed as started by them; whose routine it is stays as it was. */
export const runRoutineNow: RunRoutineNow<{ routineId: string }, { routineRunId: string; state: string; reason: string | null }> = async (args, context) => {
  const userId = signedIn(context)
  const routine = await routineToWorkIn(args.routineId, userId, 'Running this routine now')
  const run = await asHttp(() => fireNow(routine.id, userId))
  return { routineRunId: run.id, state: run.state, reason: run.reason }
}
