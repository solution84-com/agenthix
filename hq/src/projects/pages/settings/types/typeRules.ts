/**
 * What Settings › Task types offers for each type and column, and why something is greyed (spec D10, D12; adr-0174),
 * as the server enforces it: Task and Epic are never archived or deleted; a type with open tasks is not archived; only
 * a type nothing ever used is deleted; every state keeps a column, and a column holding tasks is not removed. Pure.
 */
import { TASK_STATES, TASK_STATE_LABELS, type TaskState, type TaskTypeView, type TypeColumnFields } from '@agenthix/core'
import type { TaskTypeUse } from '../../../taskTypeUse'

export const VIEWER_CANNOT_CHANGE_TYPES = "Viewers can't change the project's task types."
export const BUILT_IN_KEPT = 'Every project has Task and Epic'
export const OPEN_TASKS_KEEP_IT = 'Open tasks still use it: change their type first'
export const ONLY_NEVER_USED = 'Only a type no task has ever used'

export type TypeAction = 'edit' | 'archive' | 'restore' | 'delete'
export type TypeMenuItem = { action: TypeAction; label: string; hint?: string; disabledWhy?: string; danger?: boolean }

/** The line under a type's name: built in, or the Library template it came from, and (on a phone) its task count. */
export function typeSubline(type: Pick<TaskTypeView, 'kind' | 'archivedAt'>, use: TaskTypeUse | undefined, withCount = false): string {
  const parts: string[] = []
  if (type.kind === 'TASK') parts.push('Built in', 'New task starts here')
  else if (type.kind === 'EPIC') parts.push('Built in', 'groups tasks, never run')
  else if (use?.madeFrom) parts.push(`From the Library: ${use.madeFrom.title} ${use.madeFrom.version}`)
  else parts.push('Made in this project')
  if (type.archivedAt) parts.push('Archived')
  if (withCount) parts.push(tasksWords(use?.tasks ?? 0))
  return parts.join(' · ')
}

export const tasksWords = (n: number) => `${n} ${n === 1 ? 'task' : 'tasks'}`

/** A type's ⋯: Edit columns, then Archive (or Bring back) and Delete, each greyed with why when it can't be done. */
export function typeMenu(type: Pick<TaskTypeView, 'kind' | 'archivedAt'>, use: TaskTypeUse | undefined, mayChange: boolean): TypeMenuItem[] {
  const viewer = mayChange ? undefined : VIEWER_CANNOT_CHANGE_TYPES
  const items: TypeMenuItem[] = [{ action: 'edit', label: 'Edit columns', disabledWhy: viewer }]
  if (type.kind !== 'CUSTOM') {
    items.push({ action: 'delete', label: 'Delete', disabledWhy: BUILT_IN_KEPT })
    return items
  }
  if (type.archivedAt) items.push({ action: 'restore', label: 'Bring back', hint: 'New tasks can be made in it again', disabledWhy: viewer })
  else {
    const open = (use?.open ?? 0) > 0
    items.push({ action: 'archive', label: 'Archive type', disabledWhy: viewer ?? (open ? OPEN_TASKS_KEEP_IT : undefined), hint: open ? OPEN_TASKS_KEEP_IT : undefined })
  }
  const used = use?.used ?? false
  items.push({ action: 'delete', label: 'Delete', danger: true, disabledWhy: viewer ?? (used ? ONLY_NEVER_USED : undefined), hint: used ? ONLY_NEVER_USED : undefined })
  return items
}

/** Why a column's ✕ is greyed, or null when it can be removed. */
export function columnRemoveWhy(column: Pick<TypeColumnFields, 'id' | 'state'>, columns: readonly Pick<TypeColumnFields, 'id' | 'state'>[], held: number): string | null {
  if (!columns.some(c => c.id !== column.id && c.state === column.state)) {
    return `Each state needs a column: a task set to ${TASK_STATE_LABELS[column.state]} lands on it.`
  }
  if (held > 0) return `It holds ${tasksWords(held)}: move ${held === 1 ? 'it' : 'them'} to another column first.`
  return null
}

/** The states a column can move to: every state but its own. */
export function otherStates(state: TaskState): TaskState[] {
  return TASK_STATES.filter(s => s !== state)
}

/** "Backlog, To do or Done: the states Testing is not in." */
export function otherStatesHint(column: Pick<TypeColumnFields, 'name' | 'state'>): string {
  const names = otherStates(column.state).map(s => TASK_STATE_LABELS[s])
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}: the states ${column.name} is not in.`
}

/** What moving a column to `state` does to its tasks, said in its dialog before the person confirms. */
export function moveColumnWords(column: Pick<TypeColumnFields, 'name'>, state: TaskState, tasks: readonly { key: string; title: string }[]): string {
  const label = TASK_STATE_LABELS[state]
  if (tasks.length === 0) return `It holds no tasks, so no task's state changes.`
  const named = tasks.slice(0, 3).map(t => `${t.key} ${t.title}`).join(', ')
  const more = tasks.length > 3 ? ` and ${tasks.length - 3} more` : ''
  const then = state === 'DONE' ? ' Done always means done.' : ''
  return `${tasks.length === 1 ? 'Its 1 task' : `Its ${tasks.length} tasks`} will be ${label}: ${named}${more}.${then}`
}

/**
 * The column ids of a type, with one column moved up or down within its state: the order `reorderTypeColumns` takes.
 * Null when it is already first or last in its state.
 */
export function movedWithinState(columns: readonly Pick<TypeColumnFields, 'id' | 'state'>[], columnId: string, by: -1 | 1): string[] | null {
  const at = columns.findIndex(c => c.id === columnId)
  const to = at + by
  if (at < 0 || to < 0 || to >= columns.length || columns[to]!.state !== columns[at]!.state) return null
  const ids = columns.map(c => c.id)
  ;[ids[at], ids[to]] = [ids[to]!, ids[at]!]
  return ids
}

/** The column ids with `dragged` dropped just before `target` (both in one state), or null when nothing moves. */
export function droppedBefore(columns: readonly Pick<TypeColumnFields, 'id' | 'state'>[], dragged: string, target: string | null, state: TaskState): string[] | null {
  const from = columns.find(c => c.id === dragged)
  if (!from || from.state !== state || dragged === target) return null
  const rest = columns.filter(c => c.id !== dragged)
  const lastInState = rest.reduce((last, c, i) => (c.state === state ? i : last), -1)
  const at = target ? rest.findIndex(c => c.id === target) : lastInState + 1
  if (at < 0) return null
  const ids = rest.map(c => c.id)
  ids.splice(at, 0, dragged)
  return ids.join() === columns.map(c => c.id).join() ? null : ids
}

/** "Bug and Feature request are already in this project." */
export function alreadyHereWords(names: string[]): string | null {
  const unique = [...new Set(names)]
  if (unique.length === 0) return null
  const list = unique.length === 1 ? unique[0] : `${unique.slice(0, -1).join(', ')} and ${unique[unique.length - 1]}`
  return `${list} ${unique.length === 1 ? 'is' : 'are'} already in this project.`
}
