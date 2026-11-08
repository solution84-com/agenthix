/**
 * What Settings › Custom fields offers (spec D4, D16) and why something is greyed, as the server enforces it: single
 * select only; names unique in the project (a field) or the field (an option), ignoring case; at most so many fields
 * and options; archiving keeps every value, deleting takes them with it. Pure.
 */
import {
  BOARD_COLOURS, CUSTOM_FIELD_NAME_MAX_LENGTH, FIELD_OPTION_NAME_MAX_LENGTH, FIELD_OPTIONS_MAX, PROJECT_CUSTOM_FIELDS_MAX,
  type CustomFieldView,
} from '@agenthix/core'

export const VIEWER_CANNOT_CHANGE_FIELDS = "Viewers can't change the project's custom fields."
export const ARCHIVED_FIELD_WHY = 'It is archived: bring it back first'

export { BOARD_COLOURS, CUSTOM_FIELD_NAME_MAX_LENGTH, FIELD_OPTION_NAME_MAX_LENGTH }

/** Why another field can't be added, or null. */
export function newFieldWhy(fieldCount: number, mayChange: boolean): string | null {
  if (!mayChange) return VIEWER_CANNOT_CHANGE_FIELDS
  if (fieldCount >= PROJECT_CUSTOM_FIELDS_MAX) return `A project has at most ${PROJECT_CUSTOM_FIELDS_MAX} fields: delete one it no longer uses first`
  return null
}

/** Why another option can't be added to the field, or null. */
export function newOptionWhy(field: Pick<CustomFieldView, 'options' | 'archivedAt'>, mayChange: boolean): string | null {
  if (!mayChange) return VIEWER_CANNOT_CHANGE_FIELDS
  if (field.archivedAt) return ARCHIVED_FIELD_WHY
  if (field.options.length >= FIELD_OPTIONS_MAX) return `A field has at most ${FIELD_OPTIONS_MAX} options`
  return null
}

/** What is wrong with a name before it is sent, or null: empty, too long, or one the list already has. */
export function nameProblem(name: string, max: number, taken: readonly string[], what: 'field' | 'option'): string | null {
  const n = name.trim()
  if (n === '') return `Give the ${what} a name`
  if (n.length > max) return `${what === 'field' ? 'A field' : 'An option'}'s name is at most ${max} characters`
  if (taken.some(t => t.toLowerCase() === n.toLowerCase())) {
    return what === 'field' ? `This project already has a field named "${n}"` : `This field already has an option named "${n}"`
  }
  return null
}

/** New field's options, one per line: blank lines dropped, each trimmed. */
export function optionLines(text: string): string[] {
  return text.split('\n').map(l => l.trim()).filter(Boolean)
}

/** What is wrong with the options typed for a new field, or null. */
export function optionLinesProblem(lines: readonly string[]): string | null {
  if (lines.length > FIELD_OPTIONS_MAX) return `A field has at most ${FIELD_OPTIONS_MAX} options`
  const long = lines.find(l => l.length > FIELD_OPTION_NAME_MAX_LENGTH)
  if (long) return `"${long}" is longer than ${FIELD_OPTION_NAME_MAX_LENGTH} characters`
  const seen = new Set<string>()
  for (const l of lines) {
    if (seen.has(l.toLowerCase())) return `Two options are named "${l}"`
    seen.add(l.toLowerCase())
  }
  return null
}

/** `ids` with `id` moved one place up or down; null at the end it cannot pass. */
export function movedOne(ids: readonly string[], id: string, by: -1 | 1): string[] | null {
  const i = ids.indexOf(id)
  const j = i + by
  if (i < 0 || j < 0 || j >= ids.length) return null
  const out = [...ids]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}

/** `ids` with `dragged` put before `target` (or last for null): the order after a drop; null when nothing moves. */
export function droppedBefore(ids: readonly string[], dragged: string, target: string | null): string[] | null {
  if (dragged === target) return null
  const rest = ids.filter(id => id !== dragged)
  const at = target === null ? rest.length : rest.indexOf(target)
  if (at < 0) return null
  const out = [...rest.slice(0, at), dragged, ...rest.slice(at)]
  return out.every((id, i) => id === ids[i]) ? null : out
}

/** The words of the delete confirm: what goes with the field. */
export function deleteFieldWords(name: string, use: { taskCount: number; boardCount: number } | undefined): string {
  if (!use) return `Deleting ${name} takes its options with it.`
  const values = use.taskCount === 0 ? 'No task has a value in it' : `${use.taskCount} ${use.taskCount === 1 ? 'task loses its value' : 'tasks lose their values'}`
  const boards = use.boardCount === 0 ? '' : ` and ${use.boardCount} ${use.boardCount === 1 ? 'board of it goes' : 'boards of it go'}`
  return `${values}${boards}. No task moves and no task's state changes. To keep the values, archive it instead.`
}
