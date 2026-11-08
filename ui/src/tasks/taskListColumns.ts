/**
 * A task list's columns (spec T2, D4): Column, Agent and Due by default; Sprint, Priority and each single-select
 * custom field can be added from Fields ▾. Pure: the order they stand in and the grid they make.
 */
import type { TaskListColumn, TaskListFieldOption } from './taskListTypes'

export const DEFAULT_COLUMNS: readonly TaskListColumn[] = ['column', 'agent', 'due']

/** The fixed columns, in the order a line shows them; custom fields stand after Column. */
const FIXED: readonly TaskListColumn[] = ['column', 'sprint', 'priority', 'agent', 'due']

const LABEL: Record<string, string> = { column: 'Column', agent: 'Agent', due: 'Due', sprint: 'Sprint', priority: 'Priority' }

const WIDTH: Record<string, string> = { column: '8.5rem', agent: '9.5rem', due: '6.5rem', sprint: '7.5rem', priority: '6.5rem' }
const FIELD_WIDTH = '7.5rem'

export const fieldColumn = (fieldId: string): TaskListColumn => `field:${fieldId}`
export const fieldIdOf = (c: TaskListColumn): string | null => (c.startsWith('field:') ? c.slice('field:'.length) : null)

export function columnLabel(c: TaskListColumn, fields: TaskListFieldOption[]): string {
  const id = fieldIdOf(c)
  return id ? fields.find(f => f.id === id)?.name ?? 'Field' : LABEL[c] ?? c
}

/**
 * The columns chosen, in the order a line shows them: Column, then the custom fields in the project's order, then
 * Sprint, Priority, Agent and Due. A field the project no longer has is left out.
 */
export function orderedColumns(chosen: readonly TaskListColumn[], fields: TaskListFieldOption[]): TaskListColumn[] {
  const on = new Set(chosen)
  const custom = fields.map(f => fieldColumn(f.id)).filter(c => on.has(c))
  const fixed = FIXED.filter(c => on.has(c))
  const at = fixed.indexOf('column') + 1
  return [...fixed.slice(0, at), ...custom, ...fixed.slice(at)]
}

export function toggleColumn(chosen: readonly TaskListColumn[], c: TaskListColumn): TaskListColumn[] {
  return chosen.includes(c) ? chosen.filter(x => x !== c) : [...chosen, c]
}

/** The wide line's grid: an optional tick, the task, then each column at its width. */
export function columnsTemplate(columns: readonly TaskListColumn[], withTick: boolean): string {
  const widths = columns.map(c => (fieldIdOf(c) ? FIELD_WIDTH : WIDTH[c] ?? FIELD_WIDTH))
  return [...(withTick ? ['24px'] : []), 'minmax(0,1fr)', ...widths].join(' ')
}

/** A stored choice, read back: only the columns this list knows. */
export function parseColumns(stored: unknown): TaskListColumn[] | null {
  if (!Array.isArray(stored)) return null
  const known = stored.filter((c): c is TaskListColumn => typeof c === 'string' && (c in LABEL || /^field:[A-Za-z0-9_-]{1,64}$/.test(c)))
  return known
}
