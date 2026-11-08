/**
 * A project's task types (adr-0174, spec D10): add, rename, reorder, archive, and delete one never used. Task and
 * Epic are made with the project (taskTypes.ts) and are never archived or deleted. A type's columns are
 * typeColumnService.ts. No auth, no HTTP: the operations check who may (taskTypeOperations.ts).
 */
import { HttpError, prisma } from 'wasp/server'
import { Prisma } from '@prisma/client'
import {
  isBoardColour, PROJECT_TASK_TYPES_MAX, stateColumns, TASK_TYPE_NAME_MAX_LENGTH, typeColumnProblems,
  type TaskTypeView, type TypeColumnDefinition,
} from '@agenthix/core'
import { triggerSnapshotPush } from '../server/dashboard/debouncedPush'
import { ensureBuiltInTaskTypes } from './taskTypes'

// The same rule a task template's icon follows (core's taskTemplate.ts).
const ICON = /^[a-z][a-z0-9-]{0,39}$/

export const BUILT_IN_TYPE_KEPT = 'Task and Epic are in every project: they cannot be archived or deleted. Nothing was changed.'

const VIEW_SELECT = {
  id: true, projectId: true, name: true, icon: true, kind: true, madeFromVersionId: true, archivedAt: true, order: true,
  columns: { select: { id: true, typeId: true, name: true, colour: true, order: true, state: true, defaultForState: true }, orderBy: { order: 'asc' } },
} satisfies Prisma.TaskTypeSelect

type TypeRow = Prisma.TaskTypeGetPayload<{ select: typeof VIEW_SELECT }>

export function taskTypeView(t: TypeRow): TaskTypeView {
  return {
    id: t.id, projectId: t.projectId, name: t.name, icon: t.icon, kind: t.kind, madeFromVersionId: t.madeFromVersionId, archivedAt: t.archivedAt,
    columns: t.columns.map(c => ({ ...c, colour: isBoardColour(c.colour) ? c.colour : 'neutral' })),
  }
}

export function checkedTypeName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim() : ''
  if (name === '' || name.length > TASK_TYPE_NAME_MAX_LENGTH) {
    throw new HttpError(400, `A task type's name is 1 to ${TASK_TYPE_NAME_MAX_LENGTH} characters. Nothing was changed.`)
  }
  return name
}

function checkedIcon(raw: unknown): string {
  if (typeof raw !== 'string' || !ICON.test(raw)) throw new HttpError(400, "An icon is named by lowercase letters, digits and hyphens. Nothing was changed.")
  return raw
}

async function refuseTakenName(projectId: string, name: string, exceptTypeId?: string): Promise<void> {
  const taken = await prisma.taskType.findFirst({
    where: { projectId, name: { equals: name, mode: 'insensitive' }, ...(exceptTypeId ? { id: { not: exceptTypeId } } : {}) },
    select: { id: true },
  })
  if (taken) throw new HttpError(409, `This project already has a task type named "${name}". Choose another name. Nothing was changed.`)
}

function nameTakenOnWrite(err: unknown, name: string): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    throw new HttpError(409, `This project already has a task type named "${name}". Choose another name. Nothing was changed.`)
  }
  throw err
}

export async function listTaskTypes(projectId: string, includeArchived = false): Promise<TaskTypeView[]> {
  await ensureBuiltInTaskTypes(projectId)
  const rows = await prisma.taskType.findMany({
    where: { projectId, ...(includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    select: VIEW_SELECT,
  })
  return rows.map(taskTypeView)
}

async function typeOf(typeId: string) {
  const type = await prisma.taskType.findUnique({ where: { id: typeId }, select: { id: true, projectId: true, kind: true, name: true, archivedAt: true } })
  if (!type) throw new HttpError(404, 'Task type not found')
  return type
}

/** A new type of the project's own, with the columns given, or one per task state. Last in the project's list. */
export async function createTaskType(params: { projectId: string; name: unknown; icon?: unknown; columns?: TypeColumnDefinition[] }): Promise<TaskTypeView> {
  const name = checkedTypeName(params.name)
  const icon = params.icon === undefined ? 'task' : checkedIcon(params.icon)
  const columns = (params.columns ?? stateColumns()).map(c => ({ ...c, name: c.name.trim() }))
  const problems = typeColumnProblems(columns)
  if (problems.length > 0) throw new HttpError(400, `${problems.join(' ')} Nothing was changed.`)
  if (columns.some(c => !isBoardColour(c.colour))) throw new HttpError(400, 'A column has a colour this HQ does not know. Nothing was changed.')
  await ensureBuiltInTaskTypes(params.projectId)
  await refuseTakenName(params.projectId, name)
  const count = await prisma.taskType.count({ where: { projectId: params.projectId } })
  if (count >= PROJECT_TASK_TYPES_MAX) throw new HttpError(400, `A project has at most ${PROJECT_TASK_TYPES_MAX} task types. Nothing was changed.`)
  const last = await prisma.taskType.aggregate({ where: { projectId: params.projectId }, _max: { order: true } })
  const created = await prisma.taskType.create({
    data: {
      projectId: params.projectId, name, icon, kind: 'CUSTOM', order: (last._max.order ?? -1) + 1,
      columns: { create: columns.map((c, order) => ({ name: c.name, colour: c.colour, state: c.state, defaultForState: c.defaultForState, order })) },
    },
    select: VIEW_SELECT,
  }).catch(err => nameTakenOnWrite(err, name))
  triggerSnapshotPush()
  return taskTypeView(created)
}

export async function updateTaskType(params: { typeId: string; name?: unknown; icon?: unknown }): Promise<TaskTypeView> {
  const type = await typeOf(params.typeId)
  const name = params.name === undefined ? undefined : checkedTypeName(params.name)
  const icon = params.icon === undefined ? undefined : checkedIcon(params.icon)
  if (name !== undefined) await refuseTakenName(type.projectId, name, type.id)
  const updated = await prisma.taskType.update({
    where: { id: type.id },
    data: { ...(name !== undefined ? { name } : {}), ...(icon !== undefined ? { icon } : {}) },
    select: VIEW_SELECT,
  }).catch(err => nameTakenOnWrite(err, name ?? type.name))
  triggerSnapshotPush()
  return taskTypeView(updated)
}

/** `typeIds`: every one of the project's types, in their new order. */
export async function reorderTaskTypes(projectId: string, typeIds: string[]): Promise<TaskTypeView[]> {
  const types = await prisma.taskType.findMany({ where: { projectId }, select: { id: true } })
  const known = new Set(types.map(t => t.id))
  if (typeIds.length !== known.size || new Set(typeIds).size !== typeIds.length || typeIds.some(id => !known.has(id))) {
    throw new HttpError(400, "Name every one of the project's task types, each once, in their new order. Nothing was changed.")
  }
  await prisma.$transaction(typeIds.map((id, order) => prisma.taskType.update({ where: { id }, data: { order } })))
  triggerSnapshotPush()
  return listTaskTypes(projectId, true)
}

/** Open tasks: not Done, and not archived. */
function openTasksOf(typeId: string) {
  return prisma.task.count({ where: { typeId, state: { not: 'DONE' }, archived: false } })
}

/**
 * Archives a type of the project's own with no open tasks: it leaves the lists of types new tasks are made in,
 * and its Done tasks keep it. `archived: false` brings it back.
 */
export async function setTaskTypeArchived(typeId: string, archived: boolean): Promise<TaskTypeView> {
  const type = await typeOf(typeId)
  if (type.kind !== 'CUSTOM') throw new HttpError(400, BUILT_IN_TYPE_KEPT)
  if (archived) {
    const open = await openTasksOf(type.id)
    if (open > 0) {
      throw new HttpError(409, `"${type.name}" has ${open} open ${open === 1 ? 'task' : 'tasks'}: move ${open === 1 ? 'it' : 'them'} to Done or to another type first. Nothing was changed.`)
    }
  }
  // Conditional on its open tasks still being none, so a task made in it meanwhile keeps it in use.
  const { count } = await prisma.taskType.updateMany({
    where: { id: type.id, ...(archived ? { tasks: { none: { state: { not: 'DONE' }, archived: false } } } : {}) },
    data: { archivedAt: archived ? new Date() : null },
  })
  if (count === 0) throw new HttpError(409, `"${type.name}" has an open task now: move it to Done or to another type first. Nothing was changed.`)
  triggerSnapshotPush()
  return taskTypeView(await prisma.taskType.findUniqueOrThrow({ where: { id: type.id }, select: VIEW_SELECT }))
}

/** Deletes a type of the project's own that no task and no board has ever used. */
export async function deleteTaskType(typeId: string): Promise<void> {
  const type = await typeOf(typeId)
  if (type.kind !== 'CUSTOM') throw new HttpError(400, BUILT_IN_TYPE_KEPT)
  const { count } = await prisma.taskType.deleteMany({ where: { id: type.id, tasks: { none: {} }, boards: { none: {} } } })
  if (count === 0) throw new HttpError(409, `"${type.name}" has been used by tasks or boards, so it is kept: archive it instead. Nothing was changed.`)
  triggerSnapshotPush()
}
