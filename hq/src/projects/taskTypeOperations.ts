/**
 * The operations over a task's place in the plan and a project's task types and their columns (adr-0174). Anyone
 * who may work in the project may change them (spec Q9); anyone who can see it may read them. Each argument is
 * checked here, since Wasp hands an operation whatever the request carried.
 */
import { HttpError, prisma } from 'wasp/server'
import { isTaskState, type TaskFields, type TaskState, type TaskTypeView } from '@agenthix/core'
import { requireMayWorkInProject } from './membership'
import { requireProjectVisible, requireTaskAccess } from './resourceEntitlement'
import { personActor } from './taskActivity'
import { taskFields } from './taskWire'
import { moveTask as moveTaskRecord } from './taskColumnService'
import { createTaskType as createType, deleteTaskType as deleteType, listTaskTypes, reorderTaskTypes as reorderTypes, setTaskTypeArchived, updateTaskType as updateType } from './taskTypeService'
import {
  addTypeColumn as addColumn, moveColumnToState as moveColumn, removeTypeColumn as removeColumn, reorderTypeColumns as reorderColumns,
  setDefaultColumn as setDefault, tasksInColumn, updateTypeColumn as updateColumn,
} from './typeColumnService'

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

function state(value: unknown): TaskState {
  if (!isTaskState(value)) throw new HttpError(400, 'state must be BACKLOG, TODO, IN_PROGRESS or DONE')
  return value
}

function ids(value: unknown, what: string): string[] {
  if (!Array.isArray(value) || !value.every(v => typeof v === 'string')) throw new HttpError(400, `${what} must be a list of ids`)
  return value
}

async function projectOfType(typeId: string): Promise<string> {
  const type = await prisma.taskType.findUnique({ where: { id: typeId }, select: { projectId: true } })
  if (!type) throw new HttpError(404, 'Task type not found')
  return type.projectId
}

async function projectOfColumn(columnId: string): Promise<string> {
  const column = await prisma.typeColumn.findUnique({ where: { id: columnId }, select: { type: { select: { projectId: true } } } })
  if (!column) throw new HttpError(404, 'Column not found')
  return column.type.projectId
}

const CHANGING_TYPES = "Changing this project's task types"

// ── A task's place ──

export type MoveTaskArgs = {
  taskId: string
  columnId?: string
  state?: TaskState
  typeId?: string
  afterTaskId?: string | null
  beforeTaskId?: string | null
}

/** Moves a task to a column, a state or a type, and to a place in the project's order; any of them, at once. */
export const moveTask = async (args: MoveTaskArgs, context: Ctx): Promise<TaskFields> => {
  const user = userOf(context)
  const taskId = text(args.taskId, 'A task id')
  await requireTaskAccess(taskId, user.id, 'Moving this task')
  const afterTaskId = optionalText(args.afterTaskId, 'afterTaskId')
  const beforeTaskId = optionalText(args.beforeTaskId, 'beforeTaskId')
  if (afterTaskId && beforeTaskId) throw new HttpError(400, 'Name the task to place it after, or the one to place it before, not both')
  const moved = await moveTaskRecord(taskId, {
    columnId: optionalText(args.columnId, 'columnId'),
    state: args.state === undefined ? undefined : state(args.state),
    typeId: optionalText(args.typeId, 'typeId'),
    afterTaskId, beforeTaskId,
  }, personActor(user.id))
  return taskFields(moved)
}

// ── Types ──

export const getTaskTypes = async (args: { projectId: string; includeArchived?: boolean }, context: Ctx): Promise<TaskTypeView[]> => {
  const user = userOf(context)
  await requireProjectVisible(args.projectId, user.id)
  return listTaskTypes(args.projectId, args.includeArchived === true)
}

export const createTaskType = async (args: { projectId: string; name: string; icon?: string }, context: Ctx): Promise<TaskTypeView> => {
  const user = userOf(context)
  await requireMayWorkInProject(text(args.projectId, 'A project id'), user.id, CHANGING_TYPES)
  return createType({ projectId: args.projectId, name: args.name, icon: args.icon })
}

export const updateTaskType = async (args: { typeId: string; name?: string; icon?: string }, context: Ctx): Promise<TaskTypeView> => {
  const user = userOf(context)
  await requireMayWorkInProject(await projectOfType(text(args.typeId, 'A type id')), user.id, CHANGING_TYPES)
  return updateType({ typeId: args.typeId, name: args.name, icon: args.icon })
}

export const reorderTaskTypes = async (args: { projectId: string; typeIds: string[] }, context: Ctx): Promise<TaskTypeView[]> => {
  const user = userOf(context)
  await requireMayWorkInProject(text(args.projectId, 'A project id'), user.id, CHANGING_TYPES)
  return reorderTypes(args.projectId, ids(args.typeIds, 'typeIds'))
}

export const archiveTaskType = async (args: { typeId: string; archived?: boolean }, context: Ctx): Promise<TaskTypeView> => {
  const user = userOf(context)
  await requireMayWorkInProject(await projectOfType(text(args.typeId, 'A type id')), user.id, CHANGING_TYPES)
  return setTaskTypeArchived(args.typeId, args.archived !== false)
}

export const deleteTaskType = async (args: { typeId: string }, context: Ctx): Promise<void> => {
  const user = userOf(context)
  await requireMayWorkInProject(await projectOfType(text(args.typeId, 'A type id')), user.id, CHANGING_TYPES)
  await deleteType(args.typeId)
}

// ── Columns ──

export const addTypeColumn = async (args: { typeId: string; name: string; colour?: string; state: TaskState }, context: Ctx): Promise<TaskTypeView> => {
  const user = userOf(context)
  await requireMayWorkInProject(await projectOfType(text(args.typeId, 'A type id')), user.id, CHANGING_TYPES)
  return addColumn({ typeId: args.typeId, name: args.name, colour: args.colour, state: state(args.state) })
}

export const updateTypeColumn = async (args: { columnId: string; name?: string; colour?: string }, context: Ctx): Promise<TaskTypeView> => {
  const user = userOf(context)
  await requireMayWorkInProject(await projectOfColumn(text(args.columnId, 'A column id')), user.id, CHANGING_TYPES)
  return updateColumn({ columnId: args.columnId, name: args.name, colour: args.colour })
}

export const reorderTypeColumns = async (args: { typeId: string; columnIds: string[] }, context: Ctx): Promise<TaskTypeView> => {
  const user = userOf(context)
  await requireMayWorkInProject(await projectOfType(text(args.typeId, 'A type id')), user.id, CHANGING_TYPES)
  return reorderColumns(args.typeId, ids(args.columnIds, 'columnIds'))
}

export const setDefaultTypeColumn = async (args: { columnId: string }, context: Ctx): Promise<TaskTypeView> => {
  const user = userOf(context)
  await requireMayWorkInProject(await projectOfColumn(text(args.columnId, 'A column id')), user.id, CHANGING_TYPES)
  return setDefault(args.columnId)
}

/** What moving a column to another state changes: the tasks it holds, for the dialog that names them. */
export const getTypeColumnTasks = async (args: { columnId: string }, context: Ctx) => {
  const user = userOf(context)
  await requireProjectVisible(await projectOfColumn(text(args.columnId, 'A column id')), user.id, 'Column not found')
  return tasksInColumn(args.columnId)
}

export const moveTypeColumnToState = async (args: { columnId: string; state: TaskState }, context: Ctx) => {
  const user = userOf(context)
  await requireMayWorkInProject(await projectOfColumn(text(args.columnId, 'A column id')), user.id, CHANGING_TYPES)
  return moveColumn(args.columnId, state(args.state))
}

export const removeTypeColumn = async (args: { columnId: string }, context: Ctx): Promise<TaskTypeView> => {
  const user = userOf(context)
  await requireMayWorkInProject(await projectOfColumn(text(args.columnId, 'A column id')), user.id, CHANGING_TYPES)
  return removeColumn(args.columnId)
}
