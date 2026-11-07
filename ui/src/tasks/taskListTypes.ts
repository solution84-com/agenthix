/**
 * A task list as hq answers it (T7): one page of rows, the scorecards' counts and what each filter offers. hq's
 * `getTaskList` and `getMyTaskList` answer exactly this shape.
 */
import type { TaskWaitsOn } from './taskStateWords'

export type TaskListCard = 'needsYou' | 'running' | 'waiting' | 'notStarted' | 'done'
export type TaskListSort = 'importance' | 'priority' | 'planDate' | 'updated' | 'newest'

export type TaskListRow = {
  id: string
  key: string
  number: number
  title: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
  status: string
  runState: string
  runStateReason: string | null
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
  waitsOn: TaskWaitsOn | null
  waitsForAgent: boolean
  latestRunCompleted: boolean
  workingSince: string | null
  updatedAt: string
  createdAt: string
  epicDate: { milestone: string | null; at: string } | null
  progress: { done: number; total: number; needsYou: number } | null
}

export type TaskListCounts = {
  all: number
  needsYou: { count: number; okay: number; failed: number; noAgent: number }
  running: { count: number }
  waiting: { count: number }
  notStarted: { count: number }
  done: { count: number; finished: number }
  /** Waiting on someone else's okay, by that person, most first. */
  waitingOn: { name: string; count: number }[]
}

export type TaskListOption = { id: string; name: string }

export type TaskListPageData = {
  rows: TaskListRow[]
  hasMore: boolean
  /** Every task the list holds, before its search, filters and scorecard. */
  total?: number
  counts: TaskListCounts
  options: {
    agents: TaskListOption[]
    boards: TaskListOption[]
    epics: TaskListOption[]
    queuedBy: TaskListOption[]
    waitingOn: TaskListOption[]
    projects: TaskListOption[]
  }
}

/** The filters a list has in use; an absent one filters nothing. */
export type TaskListFilters = {
  type?: 'task' | 'epic'
  epicId?: string
  agentId?: string
  boardId?: string
  priority?: 'LOW' | 'MEDIUM' | 'HIGH'
  queuedByUserId?: string
  waitingOnUserId?: string
  projectId?: string
  archived?: boolean
}

/** Which list: a project's Tasks, or Your tasks across every project. */
export type TaskListKind = 'project' | 'mine'
