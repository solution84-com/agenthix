/**
 * The operations over a project's custom fields, their options, and a task's values in them (spec D4). Anyone who
 * may work in the project may define fields, add an option and set a value (spec Q9, "anyone in the project may add
 * a field option"); anyone who can see it may read them. Each argument is checked here.
 */
import { HttpError, prisma } from 'wasp/server'
import type { CustomFieldView, TaskFieldValue } from '@agenthix/core'
import { requireMayWorkInProject } from './membership'
import { requireProjectVisible, requireTaskAccess, requireTaskVisible } from './resourceEntitlement'
import { personActor } from './taskActivity'
import {
  addFieldOption as addOption, createCustomField as createField, customFieldUse, deleteCustomField as deleteField,
  listCustomFields, removeFieldOption as removeOption, renameCustomField as renameField, reorderCustomFields as reorderFields,
  reorderFieldOptions as reorderOptions, setCustomFieldArchived, setTaskFieldValue as setValue, taskFieldValues,
  updateFieldOption as updateOption, type NewOption,
} from './fieldService'

type Ctx = { user?: { id: string } | null }

function userOf(context: Ctx): { id: string } {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  return context.user
}

function text(value: unknown, what: string): string {
  if (typeof value !== 'string' || value === '') throw new HttpError(400, `${what} is required`)
  return value
}

function ids(value: unknown, what: string): string[] {
  if (!Array.isArray(value) || !value.every(v => typeof v === 'string')) throw new HttpError(400, `${what} must be a list of ids`)
  return value
}

async function projectOfField(fieldId: string): Promise<string> {
  const field = await prisma.customField.findUnique({ where: { id: text(fieldId, 'A field id') }, select: { projectId: true } })
  if (!field) throw new HttpError(404, 'Field not found')
  return field.projectId
}

async function projectOfOption(optionId: string): Promise<string> {
  const option = await prisma.fieldOption.findUnique({ where: { id: text(optionId, 'An option id') }, select: { field: { select: { projectId: true } } } })
  if (!option) throw new HttpError(404, 'Option not found')
  return option.field.projectId
}

const CHANGING_FIELDS = "Changing this project's fields"

// ── Fields ──

export const getCustomFields = async (args: { projectId: string; includeArchived?: boolean }, context: Ctx): Promise<CustomFieldView[]> => {
  const user = userOf(context)
  await requireProjectVisible(text(args.projectId, 'A project id'), user.id)
  return listCustomFields(args.projectId, args.includeArchived === true)
}

/** What deleting a field takes with it, for the confirm. */
export const getCustomFieldUse = async (args: { fieldId: string }, context: Ctx): Promise<{ taskCount: number; boardCount: number }> => {
  const user = userOf(context)
  await requireProjectVisible(await projectOfField(args.fieldId), user.id, 'Field not found')
  return customFieldUse(args.fieldId)
}

export const createCustomField = async (args: { projectId: string; name: string; options?: NewOption[] }, context: Ctx): Promise<CustomFieldView> => {
  const user = userOf(context)
  await requireMayWorkInProject(text(args.projectId, 'A project id'), user.id, CHANGING_FIELDS)
  if (args.options !== undefined && !Array.isArray(args.options)) throw new HttpError(400, 'options must be a list')
  return createField({ projectId: args.projectId, name: args.name, options: args.options })
}

export const renameCustomField = async (args: { fieldId: string; name: string }, context: Ctx): Promise<CustomFieldView> => {
  const user = userOf(context)
  await requireMayWorkInProject(await projectOfField(args.fieldId), user.id, CHANGING_FIELDS)
  return renameField(args.fieldId, args.name)
}

export const reorderCustomFields = async (args: { projectId: string; fieldIds: string[] }, context: Ctx): Promise<CustomFieldView[]> => {
  const user = userOf(context)
  await requireMayWorkInProject(text(args.projectId, 'A project id'), user.id, CHANGING_FIELDS)
  return reorderFields(args.projectId, ids(args.fieldIds, 'fieldIds'))
}

/** `archived` defaults to true; false brings the field back. */
export const archiveCustomField = async (args: { fieldId: string; archived?: boolean }, context: Ctx): Promise<CustomFieldView> => {
  const user = userOf(context)
  await requireMayWorkInProject(await projectOfField(args.fieldId), user.id, CHANGING_FIELDS)
  return setCustomFieldArchived(args.fieldId, args.archived !== false)
}

export const deleteCustomField = async (args: { fieldId: string }, context: Ctx): Promise<void> => {
  const user = userOf(context)
  await requireMayWorkInProject(await projectOfField(args.fieldId), user.id, CHANGING_FIELDS)
  await deleteField(args.fieldId)
}

// ── Options ──

export const addFieldOption = async (args: { fieldId: string; name: string; colour?: string }, context: Ctx): Promise<CustomFieldView> => {
  const user = userOf(context)
  await requireMayWorkInProject(await projectOfField(args.fieldId), user.id, CHANGING_FIELDS)
  return addOption({ fieldId: args.fieldId, name: args.name, colour: args.colour })
}

export const updateFieldOption = async (args: { optionId: string; name?: string; colour?: string }, context: Ctx): Promise<CustomFieldView> => {
  const user = userOf(context)
  await requireMayWorkInProject(await projectOfOption(args.optionId), user.id, CHANGING_FIELDS)
  return updateOption({ optionId: args.optionId, name: args.name, colour: args.colour })
}

export const reorderFieldOptions = async (args: { fieldId: string; optionIds: string[] }, context: Ctx): Promise<CustomFieldView> => {
  const user = userOf(context)
  await requireMayWorkInProject(await projectOfField(args.fieldId), user.id, CHANGING_FIELDS)
  return reorderOptions(args.fieldId, ids(args.optionIds, 'optionIds'))
}

export const removeFieldOption = async (args: { optionId: string }, context: Ctx): Promise<CustomFieldView> => {
  const user = userOf(context)
  await requireMayWorkInProject(await projectOfOption(args.optionId), user.id, CHANGING_FIELDS)
  return removeOption(args.optionId)
}

// ── A task's values ──

export const getTaskFieldValues = async (args: { taskId: string }, context: Ctx): Promise<TaskFieldValue[]> => {
  const user = userOf(context)
  await requireTaskVisible(text(args.taskId, 'A task id'), user.id)
  return taskFieldValues(args.taskId)
}

/** Sets a task's value in a field; `optionId` null clears it. */
export const setTaskFieldValue = async (args: { taskId: string; fieldId: string; optionId: string | null }, context: Ctx): Promise<TaskFieldValue[]> => {
  const user = userOf(context)
  await requireTaskAccess(text(args.taskId, 'A task id'), user.id, 'Changing this task')
  const optionId = args.optionId === null || args.optionId === undefined ? null : text(args.optionId, 'An option id')
  return setValue(args.taskId, text(args.fieldId, 'A field id'), optionId, personActor(user.id))
}
