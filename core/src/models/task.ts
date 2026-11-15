import type { TaskState } from '../tasks/taskModel.js'

/**
 * Whether a run of a task is pending or going now. The system alone sets it; a
 * task's own state is its `state` (the state of its column). People see it through
 * the label table in `@agenthix/ui`, never as the raw value.
 */
export type TaskRunState =
  | 'RUN_NONE'
  | 'RUN_QUEUED'
  | 'RUN_ACTIVE'
  | 'RUN_BLOCKED'
  | 'RUN_FAILED'
export type TaskPriority = 'low' | 'medium' | 'high'

export interface Task {
  id: string
  siteId: string
  title: string
  number: number
  taskKey: string
  state: TaskState
  runState: TaskRunState
  priority: TaskPriority
  projectName: string
  assignedAgentName: string | null
  boardId: string | null
  updatedAt: string
}
