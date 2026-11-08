/**
 * A task list's answer (T7), to hq's own pages: the rows of one page, the scorecards' counts and what each filter
 * offers. Not part of the client protocol: the mobile app reads `getTasks` and `getMyTasks`, which are unchanged.
 * Its shape is the one `@agenthix/ui/tasks`' `TaskListPageData` draws, so a page passes it on as it is.
 */
import type { ExecutionState, TaskState } from '@agenthix/core'
import type { TaskListCounts } from './taskListRules'

export type TaskListRowWire = {
  id: string
  key: string
  number: number
  title: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
  status: string
  runState: string
  runStateReason: string | null
  /** The task model's (adr-0174): its task state, and what an agent is doing with it, set by the system. */
  state: TaskState
  executionState: ExecutionState
  isEpic: boolean
  /** Its column's label; null in its board's Backlog. */
  columnLabel: string | null
  board: { id: string; name: string }
  /** Whether the line names the board: only when its project has more than one. */
  showBoard: boolean
  project: { id: string; key: string; name: string }
  agent: { id: string; name: string; handle: string } | null
  epic: { id: string; title: string } | null
  queuedBy: { you: true } | { you: false; name: string } | null
  /** An approval it waits for; on someone else's behalf it names them. */
  waitsOn: { what: 'okay'; who: 'you' | { name: string } } | null
  waitsForAgent: boolean
  latestRunCompleted: boolean
  workingSince: string | null
  updatedAt: string
  createdAt: string
  /** An epic's date chip: its milestone's, or its own plan date. */
  epicDate: { milestone: string | null; at: string } | null
  /** An epic's tasks: how many, how many done, how many need the reader. */
  progress: { done: number; total: number; needsYou: number } | null
}

export type TaskListOption = { id: string; name: string }

export type TaskListPageWire = {
  rows: TaskListRowWire[]
  hasMore: boolean
  /** Every task the list holds, before its search, filters and scorecard (the counts line's "of 8"). */
  total: number
  /** Over the filters, whichever scorecard is chosen. */
  counts: TaskListCounts & { waitingOn: { name: string; count: number }[] }
  options: {
    agents: TaskListOption[]
    boards: TaskListOption[]
    epics: TaskListOption[]
    queuedBy: TaskListOption[]
    waitingOn: TaskListOption[]
    projects: TaskListOption[]
  }
}
