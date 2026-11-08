/**
 * The types every project starts with (adr-0174): Task, whose columns are the four task states, and Epic, with the
 * same four. Both exist in every project and cannot be deleted. hq creates them with the project, and for a project
 * that has none yet when it is first read.
 */
import type { BoardColour, TaskState, TaskTypeKind, TypeColumnDefinition } from './taskModel.js'

export type TaskTypeDefinition = { name: string; icon: string; kind: TaskTypeKind; columns: TypeColumnDefinition[] }

const STATE_COLUMNS: ReadonlyArray<{ name: string; state: TaskState; colour: BoardColour }> = [
  { name: 'Backlog', state: 'BACKLOG', colour: 'neutral' },
  { name: 'To do', state: 'TODO', colour: 'neutral' },
  { name: 'In progress', state: 'IN_PROGRESS', colour: 'accent' },
  { name: 'Done', state: 'DONE', colour: 'success' },
]

/** One column per state, each its state's default, in the states' order. */
export function stateColumns(): TypeColumnDefinition[] {
  return STATE_COLUMNS.map(c => ({ ...c, defaultForState: true }))
}

export const TASK_TYPE_ICON = 'task'
export const EPIC_TYPE_ICON = 'epic'

/** Task first, then Epic: the order a new project lists them in. */
export function builtInTaskTypes(): TaskTypeDefinition[] {
  return [
    { name: 'Task', icon: TASK_TYPE_ICON, kind: 'TASK', columns: stateColumns() },
    { name: 'Epic', icon: EPIC_TYPE_ICON, kind: 'EPIC', columns: stateColumns() },
  ]
}

/**
 * A project's two built-in boards (adr-0176), which every project has without a stored row: they hold nothing of
 * their own. A saved board of either kind, with a filter, is a stored row like any other.
 */
export const BUILT_IN_BOARDS = [
  { name: 'Task state', kind: 'STATE' },
  { name: 'Execution', kind: 'EXECUTION' },
] as const
