/**
 * A task template (spec D16, adr-0174): a Library asset of the kind `task-template` holding task types with their
 * columns, custom fields with their options, or both. Installing one into a project adds them, and leaves alone a
 * type or field of the same name the project already has; what it adds is the project's own. It brings no tasks,
 * boards or skills. Task and Epic are in every project, so a template's types are always the project's own kind.
 *
 * Its content is one file, `task-template.json`, beside the manifest. It is read from untrusted packages, so every
 * field is checked and bounded and only the fields below come out. Pure: the caller parses the file's JSON.
 */
import {
  BOARD_COLOURS, COLUMN_NAME_MAX_LENGTH, PROJECT_TASK_TYPES_MAX, TASK_STATES, TASK_TYPE_NAME_MAX_LENGTH, TYPE_COLUMNS_MAX,
  isBoardColour, isTaskState, typeColumnProblems, type BoardColour, type TypeColumnDefinition,
} from './taskModel.js'
import {
  CUSTOM_FIELD_NAME_MAX_LENGTH, CUSTOM_FIELD_TYPES, FIELD_OPTIONS_MAX, FIELD_OPTION_NAME_MAX_LENGTH,
  PROJECT_CUSTOM_FIELDS_MAX, type CustomFieldType,
} from './boardModel.js'

export const TASK_TEMPLATE_FILE = 'task-template.json'
const ICON = /^[a-z][a-z0-9-]{0,39}$/
const CONTROL = /[\u0000-\u001f\u007f]/
const DEFAULT_ICON = 'task'

export type TaskTemplateType = { name: string; icon: string; columns: TypeColumnDefinition[] }
export type TaskTemplateOption = { name: string; colour: BoardColour }
export type TaskTemplateField = { name: string; type: CustomFieldType; options: TaskTemplateOption[] }
export type TaskTemplateContent = { types: TaskTemplateType[]; fields: TaskTemplateField[] }

export class TaskTemplateError extends Error {}

const fail = (message: string): never => { throw new TaskTemplateError(`${TASK_TEMPLATE_FILE}: ${message}`) }

function object(raw: unknown, at: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail(`${at} must be an object.`)
  return raw as Record<string, unknown>
}

function list(raw: unknown, at: string, max: number): unknown[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw) || raw.length > max) return fail(`${at} is a list of at most ${max}.`)
  return raw
}

function name(raw: unknown, at: string, max: number): string {
  if (typeof raw !== 'string' || CONTROL.test(raw)) return fail(`${at} must be one line of text.`)
  const text = raw.trim()
  if (text === '' || text.length > max) return fail(`${at} is 1 to ${max} characters.`)
  return text
}

function colour(raw: unknown, at: string): BoardColour {
  if (raw === undefined) return 'neutral'
  if (!isBoardColour(raw)) return fail(`${at} is one of ${BOARD_COLOURS.join(', ')}.`)
  return raw
}

function uniqueNames(items: Array<{ name: string }>, what: string): void {
  const seen = new Set<string>()
  for (const i of items) {
    const key = i.name.toLowerCase()
    if (seen.has(key)) fail(`two ${what} are named "${i.name}".`)
    seen.add(key)
  }
}

function column(raw: unknown, at: string): TypeColumnDefinition {
  const c = object(raw, at)
  if (!isTaskState(c.state)) return fail(`${at}'s "state" is one of ${TASK_STATES.join(', ')}.`)
  if (c.default !== undefined && typeof c.default !== 'boolean') return fail(`${at}'s "default" is true or false.`)
  return {
    name: name(c.name, `${at}'s "name"`, COLUMN_NAME_MAX_LENGTH),
    colour: colour(c.colour, `${at}'s "colour"`),
    state: c.state,
    defaultForState: c.default === true,
  }
}

// A state with one column needs no "default": that column is it.
function withDefaults(columns: TypeColumnDefinition[]): TypeColumnDefinition[] {
  return columns.map(c => {
    const inState = columns.filter(o => o.state === c.state)
    return inState.length === 1 ? { ...c, defaultForState: true } : c
  })
}

function type(raw: unknown, i: number): TaskTemplateType {
  const at = `type ${i + 1}`
  const t = object(raw, at)
  const icon = t.icon === undefined ? DEFAULT_ICON : t.icon
  if (typeof icon !== 'string' || !ICON.test(icon)) return fail(`${at}'s "icon" is an icon's name: lowercase letters, digits and hyphens.`)
  const typeName = name(t.name, `${at}'s "name"`, TASK_TYPE_NAME_MAX_LENGTH)
  const columns = withDefaults(list(t.columns, `${at}'s "columns"`, TYPE_COLUMNS_MAX).map((c, j) => column(c, `${at}, column ${j + 1}`)))
  const problems = typeColumnProblems(columns)
  if (problems.length) fail(`${typeName}: ${problems.join(' ')}`)
  return { name: typeName, icon, columns }
}

function field(raw: unknown, i: number): TaskTemplateField {
  const at = `field ${i + 1}`
  const f = object(raw, at)
  const fieldType = f.type ?? 'SINGLE_SELECT'
  if (!(CUSTOM_FIELD_TYPES as readonly unknown[]).includes(fieldType)) return fail(`${at}'s "type" is one of ${CUSTOM_FIELD_TYPES.join(', ')}.`)
  const options = list(f.options, `${at}'s "options"`, FIELD_OPTIONS_MAX).map((o, j) => {
    const op = object(o, `${at}, option ${j + 1}`)
    return { name: name(op.name, `${at}, option ${j + 1}'s "name"`, FIELD_OPTION_NAME_MAX_LENGTH), colour: colour(op.colour, `${at}, option ${j + 1}'s "colour"`) }
  })
  if (options.length === 0) fail(`${at} needs at least one option.`)
  uniqueNames(options, `options of ${at}`)
  return { name: name(f.name, `${at}'s "name"`, CUSTOM_FIELD_NAME_MAX_LENGTH), type: fieldType as CustomFieldType, options }
}

/** The template's content from its file's parsed JSON; throws `TaskTemplateError` saying what is wrong. */
export function readTaskTemplate(raw: unknown): TaskTemplateContent {
  const t = object(raw, 'the file')
  const types = list(t.types, '"types"', PROJECT_TASK_TYPES_MAX).map(type)
  const fields = list(t.fields, '"fields"', PROJECT_CUSTOM_FIELDS_MAX).map(field)
  if (types.length === 0 && fields.length === 0) fail('a task template holds at least one type or one field.')
  uniqueNames(types, 'types')
  uniqueNames(fields, 'fields')
  // Task and Epic are every project's own; a template's type of either name would only ever be left alone.
  for (const ty of types) if (/^(task|epic)$/i.test(ty.name)) fail(`"${ty.name}" is a type every project has; name it something else.`)
  return { types, fields }
}

/**
 * What installing it into a project would do (D16): the types and fields it adds, and those left alone because the
 * project already has one of that name, ignoring case. Said before the person confirms.
 */
export function taskTemplateInstallPlan(
  content: TaskTemplateContent, project: { typeNames: readonly string[]; fieldNames: readonly string[] },
): { addsTypes: TaskTemplateType[]; keepsTypes: string[]; addsFields: TaskTemplateField[]; keepsFields: string[] } {
  const types = new Set(project.typeNames.map(n => n.toLowerCase()))
  const fields = new Set(project.fieldNames.map(n => n.toLowerCase()))
  return {
    addsTypes: content.types.filter(t => !types.has(t.name.toLowerCase())),
    keepsTypes: content.types.filter(t => types.has(t.name.toLowerCase())).map(t => t.name),
    addsFields: content.fields.filter(f => !fields.has(f.name.toLowerCase())),
    keepsFields: content.fields.filter(f => fields.has(f.name.toLowerCase())).map(f => f.name),
  }
}
