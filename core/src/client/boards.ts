/**
 * A board as a client reads it from hq (adr-0097): its own fields, a project's boards with their counts, every
 * board across the person's projects, and one board opened with its columns, its Backlog and the backlogs shown
 * beside it. Dates are `Date`, as superjson carries them; `nextAt` in a round line is ISO, as hq writes it.
 */
import type { BoardKind } from '../models/board.js'
import type { AgentRef, TaskFields } from './tasks.js'
import type { RunWaitNote } from './runs.js'

export type { BoardKind } from '../models/board.js'

/** A board column. Backlog is not one: a task in no column is in its board's Backlog. */
export type BoardColumn = {
  name: string
  label: string
  /** The state a task in it has: TODO, IN_PROGRESS or DONE. */
  status: string
  color: string
  order: number
  description?: string
  hint?: string
  /** A task entering it is queued for a run (adr-0087). */
  autoQueue?: boolean
}

/** A board's own fields, its columns in their stored order. */
export type BoardFields = {
  id: string
  name: string
  projectId: string
  kind: BoardKind
  templateId: string | null
  columns: BoardColumn[]
  /** Set while it is archived; never on Project Tasks. */
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type SprintView = {
  id: string
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
  kind: BoardKind
  archivedAt: Date | null
  templateId: string | null
  columns: Array<BoardColumn & { count: number }>
  backlogCount: number
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

export type RoundAgentProgress = { agentHandle: string; agentName: string; done: number; total: number }

/** What a throttled project's board shows above its columns: the round in progress, or when the next may start. */
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
  kind: BoardKind
  archivedAt: Date | null
  templateId: string | null
  projectId: string
  project: { id: string; name: string; key: string }
  /** Where a task taken off this board goes when no other board is named. */
  projectTasksBoardId: string
  columns: BoardColumn[]
  /** The tasks in its columns — on a sprint board, the current sprint's. */
  tasks: TaskCard[]
  /** Its Backlog: its tasks in no column. */
  backlog: TaskCard[]
  /** Other boards' backlogs the reader chose to show beside this one, each under its board. */
  showAlso: Array<{ boardId: string; boardName: string; tasks: TaskCard[] }>
  currentSprint: SprintView | null
  /** Null where the project's throttle is off. */
  roundLine: RoundLine | null
}

// ── Arguments ──

export type ProjectBoardsArgs = { projectId: string; includeArchived?: boolean }
export type GetBoardArgs = { boardId: string; includeArchived?: boolean }
