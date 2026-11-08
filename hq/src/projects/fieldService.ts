/**
 * A project's custom fields and their options, and a task's values in them (spec D4): single select only, for now.
 * A field is an extra view: a task may have a value in many, so it can be on many boards, and no value ever touches
 * the task state. No auth, no HTTP: the operations check who may (fieldOperations.ts).
 */
import { HttpError, prisma } from 'wasp/server'
import { Prisma } from '@prisma/client'
import {
  CUSTOM_FIELD_NAME_MAX_LENGTH, FIELD_OPTION_NAME_MAX_LENGTH, FIELD_OPTIONS_MAX, isBoardColour, PROJECT_CUSTOM_FIELDS_MAX,
  type BoardColour, type CustomFieldView, type TaskFieldValue,
} from '@agenthix/core'
import { triggerSnapshotPush } from '../server/dashboard/debouncedPush'
import { notifyBoardsOfTasks } from './boardNotify'
import { recordTaskActivity, type TaskActor } from './taskActivity'

const FIELD_SELECT = {
  id: true, projectId: true, name: true, type: true, order: true, madeFromVersionId: true, archivedAt: true,
  options: { select: { id: true, fieldId: true, name: true, colour: true, order: true }, orderBy: { order: 'asc' } },
} satisfies Prisma.CustomFieldSelect

type FieldRow = Prisma.CustomFieldGetPayload<{ select: typeof FIELD_SELECT }>

export function customFieldView(f: FieldRow): CustomFieldView {
  return { ...f, options: f.options.map(o => ({ ...o, colour: colourOf(o.colour) })) }
}

const colourOf = (c: string): BoardColour => (isBoardColour(c) ? c : 'neutral')

function checkedName(raw: unknown, max: number, what: string): string {
  const name = typeof raw === 'string' ? raw.trim() : ''
  if (name === '' || name.length > max) throw new HttpError(400, `${what} is 1 to ${max} characters. Nothing was changed.`)
  return name
}

const fieldName = (raw: unknown) => checkedName(raw, CUSTOM_FIELD_NAME_MAX_LENGTH, "A field's name")
const optionName = (raw: unknown) => checkedName(raw, FIELD_OPTION_NAME_MAX_LENGTH, "An option's name")

function checkedColour(raw: unknown): BoardColour {
  if (raw === undefined || raw === null) return 'neutral'
  if (!isBoardColour(raw)) throw new HttpError(400, 'That is not one of the colours a field\'s option may have. Nothing was changed.')
  return raw
}

const FIELD_NAME_TAKEN = (name: string) => `This project already has a field named "${name}". Choose another name. Nothing was changed.`
const OPTION_NAME_TAKEN = (name: string) => `This field already has an option named "${name}". Choose another name. Nothing was changed.`

function takenOnWrite(err: unknown, message: string): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new HttpError(409, message)
  throw err
}

async function refuseTakenFieldName(projectId: string, name: string, exceptId?: string): Promise<void> {
  const taken = await prisma.customField.findFirst({
    where: { projectId, name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  })
  if (taken) throw new HttpError(409, FIELD_NAME_TAKEN(name))
}

function refuseRepeatedNames(names: string[]): void {
  const seen = new Set<string>()
  for (const n of names) {
    if (seen.has(n.toLowerCase())) throw new HttpError(400, `Two options are named "${n}". Nothing was changed.`)
    seen.add(n.toLowerCase())
  }
}

async function fieldOf(fieldId: string) {
  const field = await prisma.customField.findUnique({ where: { id: fieldId }, select: { id: true, projectId: true, archivedAt: true, _count: { select: { options: true } } } })
  if (!field) throw new HttpError(404, 'Field not found')
  return field
}

async function viewOf(fieldId: string): Promise<CustomFieldView> {
  return customFieldView(await prisma.customField.findUniqueOrThrow({ where: { id: fieldId }, select: FIELD_SELECT }))
}

const ARCHIVED_FIELD = 'That field is archived: bring it back first. Nothing was changed.'

// ── Fields ──

export async function listCustomFields(projectId: string, includeArchived = false): Promise<CustomFieldView[]> {
  const rows = await prisma.customField.findMany({
    where: { projectId, ...(includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    select: FIELD_SELECT,
  })
  return rows.map(customFieldView)
}

export type NewOption = { name: unknown; colour?: unknown }

/** A new single-select field, last in the project's list, with the options given in their order. */
export async function createCustomField(params: { projectId: string; name: unknown; options?: NewOption[] }): Promise<CustomFieldView> {
  const name = fieldName(params.name)
  const options = (params.options ?? []).map(o => ({ name: optionName(o.name), colour: checkedColour(o.colour) }))
  if (options.length > FIELD_OPTIONS_MAX) throw new HttpError(400, `A field has at most ${FIELD_OPTIONS_MAX} options. Nothing was changed.`)
  refuseRepeatedNames(options.map(o => o.name))
  await refuseTakenFieldName(params.projectId, name)
  const count = await prisma.customField.count({ where: { projectId: params.projectId } })
  if (count >= PROJECT_CUSTOM_FIELDS_MAX) {
    throw new HttpError(409, `A project has at most ${PROJECT_CUSTOM_FIELDS_MAX} fields: delete one it no longer uses first. Nothing was changed.`)
  }
  const last = await prisma.customField.findFirst({ where: { projectId: params.projectId }, orderBy: { order: 'desc' }, select: { order: true } })
  const created = await prisma.customField.create({
    data: {
      projectId: params.projectId, name, type: 'SINGLE_SELECT', order: (last?.order ?? -1) + 1,
      options: { create: options.map((o, order) => ({ ...o, order })) },
    },
    select: FIELD_SELECT,
  }).catch(err => takenOnWrite(err, FIELD_NAME_TAKEN(name)))
  triggerSnapshotPush()
  return customFieldView(created)
}

export async function renameCustomField(fieldId: string, rawName: unknown): Promise<CustomFieldView> {
  const field = await fieldOf(fieldId)
  const name = fieldName(rawName)
  await refuseTakenFieldName(field.projectId, name, fieldId)
  await prisma.customField.update({ where: { id: fieldId }, data: { name } }).catch(err => takenOnWrite(err, FIELD_NAME_TAKEN(name)))
  return viewOf(fieldId)
}

/** The project's fields in a new order; every field, archived ones too, named once. */
export async function reorderCustomFields(projectId: string, fieldIds: string[]): Promise<CustomFieldView[]> {
  const fields = await prisma.customField.findMany({ where: { projectId }, select: { id: true } })
  const known = new Set(fields.map(f => f.id))
  if (fieldIds.length !== known.size || new Set(fieldIds).size !== fieldIds.length || !fieldIds.every(id => known.has(id))) {
    throw new HttpError(400, "Name every one of the project's fields once, in their new order. Nothing was changed.")
  }
  await prisma.$transaction(fieldIds.map((id, order) => prisma.customField.update({ where: { id }, data: { order } })))
  return listCustomFields(projectId, true)
}

/** Archiving hides a field from lists and its boards, and keeps every value; bringing it back shows them again. */
export async function setCustomFieldArchived(fieldId: string, archived: boolean): Promise<CustomFieldView> {
  await fieldOf(fieldId)
  await prisma.customField.update({ where: { id: fieldId }, data: { archivedAt: archived ? new Date() : null } })
  triggerSnapshotPush()
  return viewOf(fieldId)
}

/** What deleting a field takes with it, for the confirm that says so: the tasks' values and the boards of it. */
export async function customFieldUse(fieldId: string): Promise<{ taskCount: number; boardCount: number }> {
  await fieldOf(fieldId)
  const [taskCount, boardCount] = await Promise.all([
    prisma.taskFieldValue.count({ where: { fieldId } }),
    prisma.board.count({ where: { fieldId, view: { not: null } } }),
  ])
  return { taskCount, boardCount }
}

/** Deletes a field with its options, every task's value in it and the boards of it. No task moves. */
export async function deleteCustomField(fieldId: string): Promise<void> {
  await fieldOf(fieldId)
  const valued = await prisma.taskFieldValue.findMany({ where: { fieldId }, select: { taskId: true } })
  await prisma.customField.delete({ where: { id: fieldId } })
  await notifyBoardsOfTasks(valued.map(v => v.taskId))
  triggerSnapshotPush()
}

// ── Options ──

async function refuseTakenOptionName(fieldId: string, name: string, exceptId?: string): Promise<void> {
  const taken = await prisma.fieldOption.findFirst({
    where: { fieldId, name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  })
  if (taken) throw new HttpError(409, OPTION_NAME_TAKEN(name))
}

async function optionOf(optionId: string) {
  const option = await prisma.fieldOption.findUnique({ where: { id: optionId }, select: { id: true, fieldId: true, field: { select: { projectId: true, archivedAt: true } } } })
  if (!option) throw new HttpError(404, 'Option not found')
  return option
}

/** A new option, last in the field's list. Anyone who may work in the project may add one. */
export async function addFieldOption(params: { fieldId: string; name: unknown; colour?: unknown }): Promise<CustomFieldView> {
  const field = await fieldOf(params.fieldId)
  if (field.archivedAt) throw new HttpError(400, ARCHIVED_FIELD)
  const name = optionName(params.name)
  const colour = checkedColour(params.colour)
  if (field._count.options >= FIELD_OPTIONS_MAX) throw new HttpError(409, `A field has at most ${FIELD_OPTIONS_MAX} options. Nothing was changed.`)
  await refuseTakenOptionName(field.id, name)
  const last = await prisma.fieldOption.findFirst({ where: { fieldId: field.id }, orderBy: { order: 'desc' }, select: { order: true } })
  await prisma.fieldOption.create({ data: { fieldId: field.id, name, colour, order: (last?.order ?? -1) + 1 } })
    .catch(err => takenOnWrite(err, OPTION_NAME_TAKEN(name)))
  return viewOf(field.id)
}

export async function updateFieldOption(params: { optionId: string; name?: unknown; colour?: unknown }): Promise<CustomFieldView> {
  const option = await optionOf(params.optionId)
  const data: { name?: string; colour?: BoardColour } = {}
  if (params.name !== undefined) {
    data.name = optionName(params.name)
    await refuseTakenOptionName(option.fieldId, data.name, option.id)
  }
  if (params.colour !== undefined) data.colour = checkedColour(params.colour)
  await prisma.fieldOption.update({ where: { id: option.id }, data }).catch(err => takenOnWrite(err, OPTION_NAME_TAKEN(data.name ?? '')))
  return viewOf(option.fieldId)
}

export async function reorderFieldOptions(fieldId: string, optionIds: string[]): Promise<CustomFieldView> {
  await fieldOf(fieldId)
  const options = await prisma.fieldOption.findMany({ where: { fieldId }, select: { id: true } })
  const known = new Set(options.map(o => o.id))
  if (optionIds.length !== known.size || new Set(optionIds).size !== optionIds.length || !optionIds.every(id => known.has(id))) {
    throw new HttpError(400, "Name every one of the field's options once, in their new order. Nothing was changed.")
  }
  await prisma.$transaction(optionIds.map((id, order) => prisma.fieldOption.update({ where: { id }, data: { order } })))
  return viewOf(fieldId)
}

/** Removes an option: the tasks that had it are left with no value in the field. */
export async function removeFieldOption(optionId: string): Promise<CustomFieldView> {
  const option = await optionOf(optionId)
  const valued = await prisma.taskFieldValue.findMany({ where: { optionId }, select: { taskId: true } })
  await prisma.fieldOption.delete({ where: { id: optionId } })
  await notifyBoardsOfTasks(valued.map(v => v.taskId))
  return viewOf(option.fieldId)
}

// ── A task's values ──

export async function taskFieldValues(taskId: string): Promise<TaskFieldValue[]> {
  return prisma.taskFieldValue.findMany({
    where: { taskId, field: { archivedAt: null } },
    select: { fieldId: true, optionId: true },
    orderBy: { field: { order: 'asc' } },
  })
}

export const FIELD_NOT_IN_PROJECT = "That field is not one of this task's project's. Nothing was changed."
export const OPTION_NOT_OF_FIELD = "That option is not one of this field's. Nothing was changed."

/** Sets a task's value in a field to one option, or clears it with null. It never touches the task's state. */
export async function setTaskFieldValue(taskId: string, fieldId: string, optionId: string | null, actor: TaskActor = null): Promise<TaskFieldValue[]> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } })
  if (!task) throw new HttpError(404, 'Task not found')
  const field = await prisma.customField.findUnique({ where: { id: fieldId }, select: { projectId: true, archivedAt: true } })
  if (!field || field.projectId !== task.projectId) throw new HttpError(400, FIELD_NOT_IN_PROJECT)
  if (field.archivedAt) throw new HttpError(400, ARCHIVED_FIELD)
  const changed = await writeFieldValue(prisma, taskId, fieldId, optionId)
  if (changed) {
    await recordTaskActivity({ taskId, kind: 'EDITED', actor, detail: { fields: [`field:${fieldId}`] } })
    await notifyBoardsOfTasks([taskId])
  }
  return taskFieldValues(taskId)
}

type FieldValueDb = Pick<Prisma.TransactionClient, 'taskFieldValue' | 'fieldOption'>

/** Writes one value, checking the option is the field's; true when it changed. For a caller that has checked the task and field. */
export async function writeFieldValue(db: FieldValueDb, taskId: string, fieldId: string, optionId: string | null): Promise<boolean> {
  const before = await db.taskFieldValue.findUnique({ where: { taskId_fieldId: { taskId, fieldId } }, select: { optionId: true } })
  if ((before?.optionId ?? null) === optionId) return false
  if (optionId === null) {
    await db.taskFieldValue.deleteMany({ where: { taskId, fieldId } })
    return true
  }
  const option = await db.fieldOption.findUnique({ where: { id: optionId }, select: { fieldId: true } })
  if (!option || option.fieldId !== fieldId) throw new HttpError(400, OPTION_NOT_OF_FIELD)
  await db.taskFieldValue.upsert({
    where: { taskId_fieldId: { taskId, fieldId } },
    create: { taskId, fieldId, optionId },
    update: { optionId },
  })
  return true
}
