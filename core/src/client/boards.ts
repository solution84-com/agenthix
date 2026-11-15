/**
 * A board as a client reads it from hq: its own fields, a project's boards with their counts, every board across the
 * person's projects, and one board opened. A board is a saved view (adr-0176): the project's Task state board is named
 * by the project's id. Dates are `Date`, as superjson carries them.
 */
import type { BoardWorkflowKind } from '../models/board.js'
import type { BoardKind, BoardFilter } from '../tasks/boardModel.js'
import type { BoardColour } from '../tasks/taskModel.js'
import type { AgentRef, TaskFields } from './tasks.js'
import type { RunWaitNote } from './runs.js'

export type { BoardWorkflowKind } from '../models/board.js'

/**
 * What a board is a view of (adr-0176): one type's columns (TYPE, with `typeId`), the task state, the
 * execution state, or one custom field's options (FIELD, with `fieldId`), with an optional filter.
 */
export type BoardViewSpec = { kind: BoardKind; typeId: string | null; fieldId: string | null; filter: BoardFilter }

/**
 * One column of a board as a view draws it: `key` is the type column's id, the task state, the
 * execution state, or the field option's id, by the board's kind.
 */
export type BoardViewColumn = { key: string; name: string; colour: BoardColour; count: number }

/** A board's own fields, its columns in their stored order. */
export type BoardFields = {
  id: string
  name: string
  projectId: string
  kind: BoardWorkflowKind
  /** What it is a view of. */
  view: BoardViewSpec
  /** A board is never archived now: always null. */
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type SprintView = {
  id: string
  /** The project whose one series it is in. */
  projectId: string
  number: number
  name: string | null
  /** "Sprint 12 · Pricing push" */
  label: string
  startDate: Date
  finishDate: Date
  finishedAt: Date | null
  daysLeft: number
}

/** A board in a project's list: each column's count, how many tasks need a person, its sprint. */
export type BoardSummary = {
  id: string
  name: string
  kind: BoardWorkflowKind
  archivedAt: Date | null
  /** What it is a view of. */
  view: BoardViewSpec
  /** Each of its columns with its count. */
  viewColumns: BoardViewColumn[]
  needsYouCount: number
  currentSprint: SprintView | null
}

/** A board in the Projects screen's Boards view, with its project. */
export type BoardAcrossProjects = BoardSummary & {
  project: { id: string; name: string; key: string; isPersonal: boolean }
}

/** A task as a board shows it: its agent, why its run waits, its key, and whether it needs a person. */
export type TaskCard = TaskFields & {
  assignedAgent: AgentRef | null
  runWait: RunWaitNote | null
  taskKey: string
  needsYou: boolean
}

/** One board opened (`getBoard`). */
export type BoardView = {
  id: string
  name: string
  kind: BoardWorkflowKind
  archivedAt: Date | null
  projectId: string
  project: { id: string; name: string; key: string }
  /** What it is a view of. */
  view: BoardViewSpec
  /** Its columns in order, each with its count. */
  viewColumns: BoardViewColumn[]
  /** The tasks in its columns — on a sprint board, the current sprint's — in the project's order. */
  tasks: TaskCard[]
  currentSprint: SprintView | null
}

// ── Arguments ──

export type ProjectBoardsArgs = { projectId: string; includeArchived?: boolean }
export type GetBoardArgs = { boardId: string; includeArchived?: boolean }
