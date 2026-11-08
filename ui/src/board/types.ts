import type { ExecutionState } from '@agenthix/core'
import type { RunWaitNote } from '../tasks/runState'

// What the Boards tool shows (every screen reviewed spec §3, adr-0097). The client that reads a board shapes its
// data into these; dates may arrive as strings or Dates.

export type BoardKind = 'PROJECT_TASKS' | 'WORKFLOW' | 'SPRINTS'

type When = string | Date | null

/** A board's column. Backlog is no column: a task in none is in the board's Backlog. */
export interface BoardColumnInfo {
  name: string
  label: string
  /** The task state a column maps to: TODO, IN_PROGRESS or DONE. */
  status: string
  order: number
  /** A task entering it is queued for a run. */
  autoQueue?: boolean
  [extra: string]: unknown
}

export interface BoardColumnCount extends BoardColumnInfo {
  count: number
}

export interface SprintInfo {
  id: string
  number: number
  name: string | null
  /** "Sprint 12 · Pricing push" */
  label: string
  startDate: When | undefined
  finishDate: When | undefined
  finishedAt: When
  daysLeft: number
}

/** A past sprint in the ▾ list, with how many of its tasks finished. */
export interface PastSprint extends SprintInfo {
  taskCount: number
  doneCount: number
}

/** One board in the list. */
export interface BoardListItem {
  id: string
  name: string
  kind: BoardKind
  archivedAt: When
  columns: BoardColumnCount[]
  backlogCount: number
  needsYouCount: number
  currentSprint: SprintInfo | null
}

export interface BoardCardAgent {
  id: string
  name: string
  handle?: string | null
}

/** A task as a board draws it. */
export interface BoardCardData {
  id: string
  taskKey: string
  title: string
  priority: string
  status: string
  column: string | null
  boardId: string | null
  runState: string
  runStateReason: string | null
  runWait?: RunWaitNote | null
  /** What its agent is doing with it now (D2): its avatar's ring. */
  executionState?: ExecutionState | null
  assignedAgent: BoardCardAgent | null
  /** A run waits for a person, or work has no agent to start it. */
  needsYou: boolean
  scheduleNextDueAt?: When
  lastWorkedAt?: When
  updatedAt?: When
  doneAt?: When
  createdAt?: When
  /** An epic groups tasks and is marked on its card. */
  isEpic?: boolean
  /** A round of a routine, and its round time, when it starts. */
  routineId?: string | null
  roundAt?: When
  /** The task has a conversation: how many of its messages this viewer has not read (0: none). Absent: no conversation. */
  threadUnread?: number | null
}

/** Another board's Backlog, shown beside this one's under its board's name. */
export interface ShowAlsoGroup {
  boardId: string
  boardName: string
  tasks: BoardCardData[]
}

export interface ShowAlsoOption {
  boardId: string
  name: string
  backlogCount: number
}

/** How the columns are laid out: side by side with room, stacked as groups when narrow, one at a time on a phone. */
export type BoardLayout = 'columns' | 'stacked' | 'chips'

export interface BoardTemplateOption {
  id: string
  name: string
  description?: string | null
}

export interface NewBoardInput {
  name: string
  kind: 'WORKFLOW' | 'SPRINTS'
  /** Empty: the three default columns. */
  templateId: string
}

/** A throttled project's round, as its board shows it above the columns (agents own schedule spec §6). */
export interface BoardRoundLine {
  automationOn: boolean
  open: boolean
  agents: Array<{ agentHandle: string; agentName: string; done: number; total: number }>
  nextAt: string | null
  throttled: number
}
