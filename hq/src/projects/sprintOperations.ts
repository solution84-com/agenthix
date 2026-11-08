/**
 * The operations over a project's sprints (adr-0176, spec D8, D13, N1, N7): reading the series and a sprint's tasks,
 * starting the series, planning one ahead, its length, a sprint's name and goal, planning tasks in and out, and
 * finishing the current one. Anyone who may work in the project may change them (spec Q9); anyone who can see it may
 * read them.
 */
import { HttpError } from 'wasp/server'
import { requireMayWorkInProject } from './membership'
import { requireProjectVisible } from './resourceEntitlement'
import { personActor } from './taskActivity'
import type { BoardCard } from './boardCardService'
import {
  addNextSprint as addNext, finishProjectSprint as finishSprintRecord, planIntoSprint, setSprintLength as setLength, sprintOf,
  startSprints as startSeries, takeOutOfSprint, unfinishedGoTo, updateProjectSprint as updateSprint, type SprintRow, type UnfinishedGoTo,
} from './projectSprintService'
import { readProjectSprints, readSprintTasks, type ProjectSprints } from './projectSprintView'
import { readSprintPlanning, type SprintPlanning } from './sprintPlanningView'

type Ctx = { user?: { id: string } | null }

function userOf(context: Ctx): { id: string } {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  return context.user
}

function text(value: unknown, what: string): string {
  if (typeof value !== 'string' || value === '') throw new HttpError(400, `${what} is required`)
  return value
}

const optionalText = (value: unknown, what: string): string | undefined => (value === undefined || value === null ? undefined : text(value, what))

function ids(value: unknown, what: string): string[] {
  if (!Array.isArray(value) || !value.every(v => typeof v === 'string')) throw new HttpError(400, `${what} must be a list of ids`)
  return value
}

/** A day, sent as a date or as "YYYY-MM-DD". */
function day(value: unknown): Date {
  const d = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null
  if (!d || Number.isNaN(d.getTime())) throw new HttpError(400, 'Say the day the first sprint begins, as a date. Nothing was changed.')
  return d
}

async function projectOfSprint(sprintId: string): Promise<string> {
  return (await sprintOf(text(sprintId, 'A sprint id'))).projectId
}

const CHANGING_SPRINTS = "Changing this project's sprints"

// ── Reads ──

export const getProjectSprints = async (args: { projectId: string }, context: Ctx): Promise<ProjectSprints> => {
  const user = userOf(context)
  const projectId = text(args.projectId, 'A project id')
  await requireProjectVisible(projectId, user.id)
  return readProjectSprints(projectId)
}

export const getProjectSprintTasks = async (args: { sprintId: string; includeArchived?: boolean }, context: Ctx): Promise<BoardCard[]> => {
  const user = userOf(context)
  await requireProjectVisible(await projectOfSprint(args.sprintId), user.id, 'Sprint not found')
  return readSprintTasks(args.sprintId, args.includeArchived === true)
}

/** What can be planned into a sprint: the project's Backlog and To do in no sprint, and its epics. */
export const getSprintPlanning = async (args: { projectId: string }, context: Ctx): Promise<SprintPlanning> => {
  const user = userOf(context)
  const projectId = text(args.projectId, 'A project id')
  await requireProjectVisible(projectId, user.id)
  return readSprintPlanning(projectId)
}

// ── The series ──

export const startSprints = async (args: { projectId: string; startDate: string | Date; days: number }, context: Ctx): Promise<SprintRow> => {
  const user = userOf(context)
  const projectId = text(args.projectId, 'A project id')
  await requireMayWorkInProject(projectId, user.id, CHANGING_SPRINTS)
  return startSeries(projectId, { startDate: day(args.startDate), days: args.days })
}

export const planNextSprint = async (args: { projectId: string }, context: Ctx): Promise<SprintRow> => {
  const user = userOf(context)
  const projectId = text(args.projectId, 'A project id')
  await requireMayWorkInProject(projectId, user.id, CHANGING_SPRINTS)
  return addNext(projectId)
}

export const setSprintLength = async (args: { projectId: string; days: number }, context: Ctx): Promise<SprintRow[]> => {
  const user = userOf(context)
  const projectId = text(args.projectId, 'A project id')
  await requireMayWorkInProject(projectId, user.id, CHANGING_SPRINTS)
  return setLength(projectId, args.days)
}

// ── A sprint ──

/** Renames a sprint or sets its goal; null clears either. */
export const updateProjectSprint = async (args: { sprintId: string; name?: string | null; goal?: string | null }, context: Ctx): Promise<SprintRow> => {
  const user = userOf(context)
  await requireMayWorkInProject(await projectOfSprint(args.sprintId), user.id, CHANGING_SPRINTS)
  return updateSprint(args.sprintId, { name: args.name, goal: args.goal })
}

/** Plans tasks into a sprint; a Backlog task moves to To do (N1). With one task, a place in the project's order. */
export const addTasksToSprint = async (
  args: { sprintId: string; taskIds: string[]; afterTaskId?: string | null; beforeTaskId?: string | null },
  context: Ctx,
): Promise<{ taskIds: string[] }> => {
  const user = userOf(context)
  await requireMayWorkInProject(await projectOfSprint(args.sprintId), user.id, 'Planning this sprint')
  const afterTaskId = optionalText(args.afterTaskId, 'afterTaskId')
  const beforeTaskId = optionalText(args.beforeTaskId, 'beforeTaskId')
  if (afterTaskId && beforeTaskId) throw new HttpError(400, 'Name the task to place it after, or the one to place it before, not both')
  const taskIds = await planIntoSprint(args.sprintId, ids(args.taskIds, 'taskIds'), { afterTaskId, beforeTaskId }, personActor(user.id))
  return { taskIds }
}

/** Takes tasks out of their sprint; their state and column stay. */
export const removeTasksFromSprint = async (args: { projectId: string; taskIds: string[] }, context: Ctx): Promise<{ taskIds: string[] }> => {
  const user = userOf(context)
  const projectId = text(args.projectId, 'A project id')
  await requireMayWorkInProject(projectId, user.id, 'Planning this sprint')
  return { taskIds: await takeOutOfSprint(projectId, ids(args.taskIds, 'taskIds'), personActor(user.id)) }
}

/** Finishes the current sprint; `unfinished` ("next" or "none") is required while any of its tasks is not done. */
export const finishProjectSprint = async (
  args: { sprintId: string; unfinished?: UnfinishedGoTo },
  context: Ctx,
): Promise<{ finished: SprintRow; next: SprintRow; movedTaskIds: string[]; unfinished: UnfinishedGoTo | null }> => {
  const user = userOf(context)
  await requireMayWorkInProject(await projectOfSprint(args.sprintId), user.id, 'Finishing this sprint')
  return finishSprintRecord(args.sprintId, unfinishedGoTo(args.unfinished), personActor(user.id))
}
