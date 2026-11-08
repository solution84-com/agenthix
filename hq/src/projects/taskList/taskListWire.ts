/**
 * A task list's answer (spec T1–T5), to hq's own pages: the rows of one page, the scorecards' counts and what each
 * filter offers. Not part of the client protocol: the mobile app reads `getTasks` and `getMyTasks`. Its shape is the
 * one `@agenthix/ui/tasks`' `TaskListPageData` draws, so a page passes it on as it is.
 */
import type { ExecutionState, TaskState, TaskTypeKind } from '@agenthix/core'
import type { TaskListCounts } from './taskListRules'

export type TaskListRowWire = {
  id: string
  key: string
  number: number
  title: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
  /** Its task state, and what an agent is doing with it (adr-0174), set by the system. */
  state: TaskState
  executionState: ExecutionState
  type: { name: string; icon: string; kind: TaskTypeKind }
  /** Its column, by name; a task not placed yet shows its state's name. */
  column: { id: string | null; name: string }
  isEpic: boolean
  project: { id: string; key: string; name: string }
  agent: { id: string; name: string; handle: string } | null
  /** What its run is doing, after the state, in its avatar's words ("asked you something"). */
  runDetail: string | null
  epic: { id: string; title: string } | null
  sprint: { id: string; name: string } | null
  /** `YYYY-MM-DD`: an epic's milestone date or its plan's finish, a task's plan finish. */
  due: string | null
  late: boolean
  /** Its value in each custom field, by the field's id. */
  fields: Record<string, { optionId: string; name: string }>
  updatedAt: string
  createdAt: string
  /** An epic's tasks: how many, how many done, and how many stand in each open state. */
  progress: { done: number; total: number; backlog: number; todo: number; inProgress: number } | null
}

export type TaskListOption = { id: string; name: string }
export type TaskListFieldOption = TaskListOption & { options: TaskListOption[] }

export type TaskListPageWire = {
  rows: TaskListRowWire[]
  hasMore: boolean
  /** Every task the list holds, before its search, filters and scorecard. */
  total: number
  /** Over the filters, whichever scorecard is chosen. */
  counts: TaskListCounts
  options: {
    /** Types and columns are named, so their id is their name. */
    types: TaskListOption[]
    columns: TaskListOption[]
    epics: TaskListOption[]
    sprints: TaskListOption[]
    agents: TaskListOption[]
    projects: TaskListOption[]
    /** A project's single-select fields with their options; none on Your tasks. */
    fields: TaskListFieldOption[]
  }
}
