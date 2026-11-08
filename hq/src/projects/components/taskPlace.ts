/**
 * A task's place on its page (D10, D12, D14): the choices its header's Type and Column chips offer, and the tasks
 * Move to top and Move to bottom place it beside. Pure, so the rules are tested without a server.
 */
import { TASK_STATE_LABELS, defaultColumnFor, type TaskState, type TaskTypeView, type TypeColumnFields } from '@agenthix/core'

/** One row of a chip's menu. */
export interface PlaceChoice {
  id: string
  label: string
  /** A type's icon, drawn before its name. */
  icon?: string
  /** A line under the label: where the task lands, or what becomes of its agent. */
  hint?: string
  /** Known in advance not to work: the row is greyed, and this says why. */
  disabledWhy?: string
  current: boolean
}

export const EPIC_HAS_RUNS = 'It has runs; an epic is never run'
export const EPIC_IN_AN_EPIC = 'It is filed under an epic; an epic belongs to none'
export const EPIC_HAS_TASKS = 'Tasks are filed under it; move them out first'

/** What the Type menu needs of the task. */
export interface TypeChoiceTask {
  typeId: string | null
  state: TaskState
  isEpic: boolean
  hasRuns: boolean
  inAnEpic: boolean
  hasEpicTasks: boolean
  agentName: string | null
}

/**
 * The project's types, open ones only, the task's own kept where it is archived. Changing the type keeps the state,
 * so a type whose landing column is not named for the state says where the task lands. Epic is greyed on a task that
 * has runs or sits in an epic; an epic with tasks under it cannot become another type.
 */
export function typeChoices(types: readonly TaskTypeView[], task: TypeChoiceTask): PlaceChoice[] {
  return types
    .filter(t => !t.archivedAt || t.id === task.typeId)
    .map(t => {
      const current = t.id === task.typeId
      const epic = t.kind === 'EPIC'
      const landing = defaultColumnFor(t.columns, task.state)
      const lands = !current && landing && landing.name !== TASK_STATE_LABELS[task.state] ? `lands on ${landing.name}` : undefined
      let disabledWhy: string | undefined
      if (!current && epic && task.hasRuns) disabledWhy = EPIC_HAS_RUNS
      else if (!current && epic && task.inAnEpic) disabledWhy = EPIC_IN_AN_EPIC
      else if (!current && !epic && task.isEpic && task.hasEpicTasks) disabledWhy = EPIC_HAS_TASKS
      const hint = disabledWhy ?? (!current && epic
        ? (task.agentName ? `${task.agentName} stays, to manage it; an epic never runs` : 'An epic is never run')
        : lands)
      return { id: t.id, label: t.name, icon: t.icon, hint, disabledWhy, current }
    })
}

/** The type's own columns, in their order: names only, never the state behind them. */
export function columnChoices(type: TaskTypeView | null | undefined, columnId: string | null): PlaceChoice[] {
  return [...(type?.columns ?? [])]
    .sort((a, b) => a.order - b.order)
    .map(c => ({ id: c.id, label: c.name, current: c.id === columnId }))
}

/** The task's column, found in its type; null until both are known. */
export function columnOf(type: TaskTypeView | null | undefined, columnId: string | null | undefined): TypeColumnFields | null {
  return type?.columns.find(c => c.id === columnId) ?? null
}

type Ordered = { id: string; number: number; rank?: string | null }

/**
 * The tasks to place this one before (top) or after (bottom) in the project's one order: ranked tasks by rank, then
 * the unranked ones by number, as the server ranks them. Null where it is already there or alone.
 */
export function orderNeighbours(tasks: readonly Ordered[], selfId: string): { top: string | null; bottom: string | null } {
  const sorted = [...tasks].sort((a, b) => {
    if (a.rank && b.rank) return a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : a.number - b.number
    if (a.rank) return -1
    if (b.rank) return 1
    return a.number - b.number
  })
  if (!sorted.some(t => t.id === selfId)) return { top: null, bottom: null }
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  return { top: first.id === selfId ? null : first.id, bottom: last.id === selfId ? null : last.id }
}

/** Where a new task of this type starts: the column it was added from, else the type's Backlog column (N2). */
export function startsIn(type: TaskTypeView | null | undefined, columnId: string | null): TypeColumnFields | null {
  if (!type) return null
  return columnOf(type, columnId) ?? defaultColumnFor(type.columns, 'BACKLOG')
}
