/**
 * What a board shows and what a drop on it changes (adr-0176, spec D3, D4, data model "How each board kind reads it"),
 * as pure rules the board services apply to rows they read. A board is a saved view: its kind says what its columns
 * are (one type's columns, the four task states, the six execution states, or one custom field's options with "No
 * value" first), and its filter only hides cards.
 */
import {
  EXECUTION_STATE_LABELS, EXECUTION_STATES, TASK_STATE_LABELS, TASK_STATES, isBoardColour,
  type BoardColour, type BoardFilter, type BoardKind, type ExecutionState, type TaskState, type TaskTypeKind,
} from '@agenthix/core'

/** What a board is a view of; a saved board's row holds the same, a built-in or unsaved one is sent as it is. */
export type BoardSpec = { kind: BoardKind; typeId: string | null; fieldId: string | null; filter: BoardFilter }

/** The two built-in boards, on every project, with no row. */
export const BUILT_IN_BOARDS = [
  { key: 'state', kind: 'STATE', name: 'Task state' },
  { key: 'execution', kind: 'EXECUTION', name: 'Execution' },
] as const satisfies ReadonlyArray<{ key: string; kind: BoardKind; name: string }>

/** The column of a field board that holds the tasks with no value in the field. */
export const NO_VALUE_KEY = 'none'

/** A task as the board rules read it. `optionId` is its value in the board's field, on a field board only. */
export type BoardTaskRow = {
  id: string
  typeId: string | null
  typeKind: TaskTypeKind | null
  columnId: string | null
  state: TaskState
  executionState: ExecutionState
  sprintId: string | null
  epicId: string | null
  assignedAgentId: string | null
  optionId?: string | null
}

/** A column a board draws. `key` is what a drop names: a type's column id, a state, an execution state, or an option id. */
export type BoardColumnDef = { key: string; name: string; colour: BoardColour; state: TaskState | null }

type ColumnSource = { id: string; name: string; colour: string; state: TaskState }
type OptionSource = { id: string; name: string; colour: string }

const colour = (c: string): BoardColour => (isBoardColour(c) ? c : 'neutral')

export function boardColumns(
  kind: BoardKind,
  source: { typeColumns?: readonly ColumnSource[]; options?: readonly OptionSource[] },
): BoardColumnDef[] {
  switch (kind) {
    case 'TYPE':
      return (source.typeColumns ?? []).map(c => ({ key: c.id, name: c.name, colour: colour(c.colour), state: c.state }))
    case 'STATE':
      return TASK_STATES.map(s => ({ key: s, name: TASK_STATE_LABELS[s], colour: 'neutral' as const, state: s }))
    case 'EXECUTION':
      return EXECUTION_STATES.map(s => ({ key: s, name: EXECUTION_STATE_LABELS[s], colour: 'neutral' as const, state: null }))
    case 'FIELD':
      return [
        { key: NO_VALUE_KEY, name: 'No value', colour: 'neutral' as const, state: null },
        ...(source.options ?? []).map(o => ({ key: o.id, name: o.name, colour: colour(o.colour), state: null })),
      ]
  }
}

/** Whether a task is on the board at all, before its filter: a type's board holds that type's tasks; an epic is never run, so never on the execution board. */
export function isOnBoard(spec: Pick<BoardSpec, 'kind' | 'typeId'>, row: BoardTaskRow): boolean {
  if (spec.kind === 'TYPE') return row.typeId !== null && row.typeId === spec.typeId
  if (spec.kind === 'EXECUTION') return row.typeKind !== 'EPIC'
  return true
}

/** The column a task sits in on this board. */
export function columnKeyOf(kind: BoardKind, row: BoardTaskRow): string | null {
  switch (kind) {
    case 'TYPE': return row.columnId
    case 'STATE': return row.state
    case 'EXECUTION': return row.executionState
    case 'FIELD': return row.optionId ?? NO_VALUE_KEY
  }
}

/**
 * Whether the filter keeps a task. `currentSprintId` is the project's current sprint, for a filter to the current
 * sprint (null when it has none, which keeps nothing); "Not in a sprint" keeps the tasks in none. A Type filter keeps
 * one type's tasks. A filter only hides cards: it never changes one.
 */
export function matchesFilter(filter: BoardFilter, row: BoardTaskRow, currentSprintId: string | null): boolean {
  if (filter.sprint) {
    if ('none' in filter.sprint) {
      if (row.sprintId !== null) return false
    } else {
      const sprintId = 'current' in filter.sprint ? currentSprintId : filter.sprint.sprintId
      if (sprintId === null || row.sprintId !== sprintId) return false
    }
  }
  if (filter.epicId && row.epicId !== filter.epicId) return false
  if (filter.agentId && row.assignedAgentId !== filter.agentId) return false
  if (filter.typeId && row.typeId !== filter.typeId) return false
  return true
}

/** Where a card dropped on a column goes, by the board's kind; or why it may not be dropped there. */
export type DropChange =
  | { sets: 'column'; columnId: string }
  | { sets: 'state'; state: TaskState }
  | { sets: 'field'; optionId: string | null }
  | { sets: 'rank' }
  | { refused: string }

export const EXECUTION_NOT_DRAGGED =
  'The execution board is set by the system and is not dragged: Run, Stop and answers are on the task. Nothing was changed.'
export const NOT_A_COLUMN = 'That is not one of this board\'s columns. Nothing was changed.'
export const NOT_ON_BOARD = 'That task is not on this board. Nothing was changed.'

/**
 * A drop on a type's column sets the task's column (so its state); on a state, the state (the task lands on its type's
 * default column for it); on a field's option, that value. A drop in the column it is already in changes only its
 * rank, so a reorder within a state never moves the task off the column it was on.
 */
export function dropChange(spec: BoardSpec, columns: readonly BoardColumnDef[], row: BoardTaskRow, targetKey: string): DropChange {
  if (spec.kind === 'EXECUTION') return { refused: EXECUTION_NOT_DRAGGED }
  if (!isOnBoard(spec, row)) return { refused: NOT_ON_BOARD }
  if (!columns.some(c => c.key === targetKey)) return { refused: NOT_A_COLUMN }
  if (columnKeyOf(spec.kind, row) === targetKey) return { sets: 'rank' }
  switch (spec.kind) {
    case 'TYPE': return { sets: 'column', columnId: targetKey }
    case 'STATE': return { sets: 'state', state: targetKey as TaskState }
    case 'FIELD': return { sets: 'field', optionId: targetKey === NO_VALUE_KEY ? null : targetKey }
  }
}

/** Rows in rank order, into the board's columns; a row whose column the board does not draw is left out. */
export function groupIntoColumns<R extends BoardTaskRow>(kind: BoardKind, columns: readonly BoardColumnDef[], rows: readonly R[]): Map<string, R[]> {
  const grouped = new Map<string, R[]>(columns.map(c => [c.key, []]))
  for (const row of rows) {
    const key = columnKeyOf(kind, row)
    if (key !== null) grouped.get(key)?.push(row)
  }
  return grouped
}

/** Whether a task needs the person, from its stored execution state: an ask, or a failed run of open work (N3). */
export function rowNeedsYou(row: Pick<BoardTaskRow, 'executionState' | 'state' | 'typeKind'>): boolean {
  if (row.typeKind === 'EPIC') return false
  return row.executionState === 'NEEDS_YOU' || (row.executionState === 'FAILED' && row.state !== 'DONE')
}
