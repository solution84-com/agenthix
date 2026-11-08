/**
 * Status state machines
 * =====================
 * Pure transition table for TaskStatus, consumed by web mutations and
 * mobile UI guards — single source of truth for what's reachable from where.
 * A task's run state has no table here: the system alone moves it.
 */

import type { TaskStatus, TaskRunState, TaskPriority } from '../models/task.js'

const TASK_STATUS_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  todo: ['in_progress', 'done'],
  in_progress: ['todo', 'done'],
  done: ['todo', 'in_progress'],
}

export const TASK_STATUSES: readonly TaskStatus[] = ['todo', 'in_progress', 'done']
export const TASK_RUN_STATES: readonly TaskRunState[] = [
  'RUN_NONE', 'RUN_QUEUED', 'RUN_THROTTLED', 'RUN_ACTIVE', 'RUN_BLOCKED', 'RUN_FAILED',
]
export const TASK_PRIORITIES: readonly TaskPriority[] = ['low', 'medium', 'high']

export const DEFAULT_TASK_STATUS: TaskStatus = 'todo'
export const DEFAULT_TASK_RUN_STATE: TaskRunState = 'RUN_NONE'
export const DEFAULT_TASK_PRIORITY: TaskPriority = 'medium'

export function canTransitionStatus(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return true
  return TASK_STATUS_TRANSITIONS[from].includes(to)
}

export function nextTaskStatuses(from: TaskStatus): readonly TaskStatus[] {
  return TASK_STATUS_TRANSITIONS[from]
}

export function isTerminalStatus(status: TaskStatus): boolean {
  return status === 'done'
}

/** Whether a run of the task is pending or going: queued in its agent's line, or running. (RUN_THROTTLED is deprecated.) */
export function isRunPending(state: TaskRunState): boolean {
  return state === 'RUN_QUEUED' || state === 'RUN_THROTTLED' || state === 'RUN_ACTIVE'
}
