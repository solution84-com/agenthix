/**
 * A task's run states and priorities. A task's state moves to any other freely, so it has no table here; the system
 * alone moves its run state.
 */

import type { TaskRunState, TaskPriority } from '../models/task.js'

export const TASK_RUN_STATES: readonly TaskRunState[] = [
  'RUN_NONE', 'RUN_QUEUED', 'RUN_THROTTLED', 'RUN_ACTIVE', 'RUN_BLOCKED', 'RUN_FAILED',
]
export const TASK_PRIORITIES: readonly TaskPriority[] = ['low', 'medium', 'high']

export const DEFAULT_TASK_RUN_STATE: TaskRunState = 'RUN_NONE'
export const DEFAULT_TASK_PRIORITY: TaskPriority = 'medium'

/** Whether a run of the task is pending or going: queued in its agent's line, or running. (RUN_THROTTLED is deprecated.) */
export function isRunPending(state: TaskRunState): boolean {
  return state === 'RUN_QUEUED' || state === 'RUN_THROTTLED' || state === 'RUN_ACTIVE'
}
