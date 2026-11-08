import type { BoardKind, ExecutionState, TaskState } from '@agenthix/core'

// What the board screens draw (adr-0176): a board is a saved view of a project's tasks in columns. The client that
// reads a board shapes its data into these; dates may arrive as strings or Dates.

type When = string | Date | null

/** A task as a board card draws it (board cards layout C): the key line, the title, and its assignee when it has one. */
export interface ViewCardData {
  id: string
  /** "WEB-14". */
  key: string
  title: string
  priority: string
  type: { id: string; name: string; icon: string; kind: string } | null
  state: TaskState
  executionState: ExecutionState
  agent: { id: string; name: string; avatarUrl?: string | null } | null
  /** An epic's progress: how many of its tasks are done. */
  epicProgress?: { done: number; total: number } | null
}

/** One column of a board: `key` is what a drop names (a type's column id, a state, an execution state, an option). */
export interface ViewColumnData {
  key: string
  name: string
  /** The task state a type's or the state board's column sits in; null on the execution and field boards. */
  state: TaskState | null
  count: number
  cards: ViewCardData[]
}

/** Where a card is dropped: its column, and the visible card above it (or, at a column's top, the one below). */
export interface CardDrop {
  card: ViewCardData
  column: string
  afterTaskId: string | null
  beforeTaskId: string | null
}

/** A row of a list of boards: the board, what it groups by and its filter in words, its spread, what needs you. */
export interface BoardRowData {
  /** "state", "execution" or a saved board's id. */
  key: string
  name: string
  builtIn: boolean
  kind: BoardKind
  /** "Bug's columns · Sprint: current", "every type, by task state". */
  what: string
  /** Each column with its count, in the board's order; `state` is the task state a column sits in, where it has one. */
  spread: Array<{ key: string; name: string; count: number; state: TaskState | null }>
  needsYouCount: number
  lastMovedAt: When
}

/** One of a menu's choices, with a line under it. */
export interface ViewChoice {
  value: string
  label: string
  hint?: string
}
