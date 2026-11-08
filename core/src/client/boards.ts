/**
 * A board as a client reads it from hq: its own fields, a project's boards with their counts, every board across the
 * person's projects, and one board opened. A board is a saved view (adr-0176): the project's Task state board is named
 * by the project's id, and every field that described a board that owned its tasks has its empty value. Dates are
 * `Date`, as superjson carries them; `nextAt` in a round line is ISO, as hq writes it.
 */
import type { BoardWorkflowKind } from '../models/board.js'
import type { BoardKind, BoardFilter } from '../tasks/boardModel.js'
import type { BoardColour } from '../tasks/taskModel.js'
import type { AgentRef, TaskFields } from './tasks.js'
import type { RunWaitNote } from './runs.js'

export type { BoardWorkflowKind } from '../models/board.js'

/**
 * A board column. Backlog is not one: a task in no column is in its board's Backlog.
 * @deprecated since 1.16; stops working in 3.0. Use `BoardViewColumn` instead.
 */
export type BoardColumn = {
  name: string
  label: string
  /** The state a task in it has: TODO, IN_PROGRESS or DONE. */
  status: string
  color: string
  order: number
  description?: string
  hint?: string
  /**
   * A task entering it is queued for a run (adr-0087).
   * @deprecated since 1.16; stops working in 3.0. Nothing replaces it.
   */
  autoQueue?: boolean
}

/**
 * What a board is a view of (since 1.16, adr-0176): one type's columns (TYPE, with `typeId`), the task state, the
 * execution state, or one custom field's options (FIELD, with `fieldId`), with an optional filter.
 */
export type BoardViewSpec = { kind: BoardKind; typeId: string | null; fieldId: string | null; filter: BoardFilter }

/**
 * One column of a board as a view draws it (since 1.16): `key` is the type column's id, the task state, the
 * execution state, or the field option's id, by the board's kind.
 */
export type BoardViewColumn = { key: string; name: string; colour: BoardColour; count: number }

/** A board's own fields, its columns in their stored order. */
export type BoardFields = {
  id: string
  name: string
  projectId: string
  kind: BoardWorkflowKind
  /**
   * Boards are not shared; task templates are.
   * @deprecated since 1.16; stops working in 3.0. Nothing replaces it.
   */
  templateId: string | null
  /** @deprecated since 1.16; stops working in 3.0. Use `view` instead. */
  columns: BoardColumn[]
  /** What it is a view of (since 1.16). */
  view?: BoardViewSpec
  /** A board is never archived now: always null. */
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type SprintView = {
  id: string
  /** The project whose one series it is in (since 1.16). */
  projectId?: string
  number: number
  name: string | null
  /** "Sprint 12 · Pricing push" */
  label: string
  startDate: Date
  finishDate: Date
  finishedAt: Date | null
  daysLeft: number
}

/** A board in a project's list: each column's count, its Backlog's, how many tasks need a person, its sprint. */
export type BoardSummary = {
  id: string
  name: string
  kind: BoardWorkflowKind
  archivedAt: Date | null
  /**
   * Boards are not shared; task templates are.
   * @deprecated since 1.16; stops working in 3.0. Nothing replaces it.
   */
  templateId: string | null
  /** @deprecated since 1.16; stops working in 3.0. Use `viewColumns` instead. */
  columns: Array<BoardColumn & { count: number }>
  /**
   * Backlog is a task state.
   * @deprecated since 1.16; stops working in 3.0. Use `viewColumns` instead.
   */
  backlogCount: number
  /** What it is a view of (since 1.16). */
  view?: BoardViewSpec
  /** Each of its columns with its count (since 1.16). */
  viewColumns?: BoardViewColumn[]
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

/**
 * Rounds are gone (adr-0175).
 * @deprecated since 1.16; stops working in 3.0. Nothing replaces it.
 */
export type RoundAgentProgress = { agentHandle: string; agentName: string; done: number; total: number }

/**
 * What a throttled project's board shows above its columns: the round in progress, or when the next may start.
 * @deprecated since 1.16; stops working in 3.0. Nothing replaces it.
 */
export type RoundLine = {
  automationOn: boolean
  open: boolean
  agents: RoundAgentProgress[]
  /** When the next round may start (ISO); null while one is open, or nothing is due. */
  nextAt: string | null
  throttled: number
}

/** One board opened (`getBoard`). */
export type BoardView = {
  id: string
  name: string
  kind: BoardWorkflowKind
  archivedAt: Date | null
  /**
   * Boards are not shared; task templates are.
   * @deprecated since 1.16; stops working in 3.0. Nothing replaces it.
   */
  templateId: string | null
  projectId: string
  project: { id: string; name: string; key: string }
  /**
   * Where a task taken off this board goes when no other board is named.
   * @deprecated since 1.16; stops working in 3.0. Nothing replaces it.
   */
  projectTasksBoardId: string
  /** @deprecated since 1.16; stops working in 3.0. Use `viewColumns` instead. */
  columns: BoardColumn[]
  /** What it is a view of (since 1.16). */
  view?: BoardViewSpec
  /** Its columns in order, each with its count (since 1.16). */
  viewColumns?: BoardViewColumn[]
  /** The tasks in its columns — on a sprint board, the current sprint's. In the project's order from 1.16. */
  tasks: TaskCard[]
  /**
   * Its Backlog: its tasks in no column.
   * @deprecated since 1.16; stops working in 3.0. Use `tasks` instead.
   */
  backlog: TaskCard[]
  /**
   * Other boards' backlogs the reader chose to show beside this one, each under its board.
   * @deprecated since 1.16; stops working in 3.0. Nothing replaces it.
   */
  showAlso: Array<{ boardId: string; boardName: string; tasks: TaskCard[] }>
  currentSprint: SprintView | null
  /**
   * Null where the project's throttle is off.
   * @deprecated since 1.16; stops working in 3.0. Nothing replaces it.
   */
  roundLine: RoundLine | null
}

// ── Arguments ──

export type ProjectBoardsArgs = { projectId: string; includeArchived?: boolean }
export type GetBoardArgs = { boardId: string; includeArchived?: boolean }
