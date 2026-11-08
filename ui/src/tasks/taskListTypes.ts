/**
 * A task list as hq answers it (spec T1–T5, Y1): one page of rows, the scorecards' counts and what each filter
 * offers. hq's `getTaskList` and `getMyTaskList` answer exactly this shape.
 */
import type { ExecutionState, TaskState, TaskTypeKind } from '@agenthix/core'

/** A scorecard: a task state, Late or No agent; All is no card. Never a run state (D9). */
export type TaskListCard = 'backlog' | 'todo' | 'inProgress' | 'done' | 'late' | 'noAgent'
export type TaskListSort = 'rank' | 'priority' | 'due' | 'updated' | 'newest'

export type TaskListRow = {
  id: string
  key: string
  number: number
  title: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
  state: TaskState
  /** What its agent is doing with it now (D2): its avatar's ring. */
  executionState: ExecutionState | null
  type: { name: string; icon: string; kind: TaskTypeKind }
  /** Its column, by name only (never the task state beside it). */
  column: { id: string | null; name: string }
  project: { id: string; key: string; name: string }
  agent: { id: string; name: string; handle: string } | null
  /** Why its run waits or stops, as stored: the ring's words after its state. */
  runDetail: string | null
  epic: { id: string; title: string } | null
  sprint: { id: string; name: string } | null
  /** `YYYY-MM-DD`. */
  due: string | null
  late: boolean
  /** Its value in each custom field, by the field's id. */
  fields: Record<string, { optionId: string; name: string }>
  updatedAt: string
  createdAt: string
  /** An epic's tasks: how many, how many done, and how many in each open state. */
  progress: { done: number; total: number; backlog: number; todo: number; inProgress: number } | null
}

export type TaskListCounts = { all: number } & Record<TaskListCard, number>

export type TaskListOption = { id: string; name: string }
export type TaskListFieldOption = TaskListOption & { options: TaskListOption[] }

export type TaskListPageData = {
  rows: TaskListRow[]
  hasMore: boolean
  /** Every task the list holds, before its search, filters and scorecard. */
  total?: number
  counts: TaskListCounts
  options: {
    /** Types and columns are named, so their id is their name. */
    types: TaskListOption[]
    columns: TaskListOption[]
    epics: TaskListOption[]
    sprints: TaskListOption[]
    agents: TaskListOption[]
    projects: TaskListOption[]
    fields: TaskListFieldOption[]
  }
}

/** The filters a list has in use; an absent one filters nothing. */
export type TaskListFilters = {
  type?: string
  column?: string
  state?: TaskState
  epicId?: string
  sprintId?: string
  agentId?: string
  priority?: 'LOW' | 'MEDIUM' | 'HIGH'
  /** One custom field's option. */
  optionId?: string
  projectId?: string
  archived?: boolean
}

/** Which list: a project's Tasks, or Your tasks across every project. */
export type TaskListKind = 'project' | 'mine'

/** A line's extra column (Fields ▾): a fixed one, or a custom field by `field:<id>`. */
export type TaskListColumn = 'column' | 'agent' | 'due' | 'sprint' | 'priority' | `field:${string}`
