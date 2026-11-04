/**
 * Index derivations
 * =================
 * Pure reductions over the index types used by HQ and mobile catalogs.
 * Same functions feed the Phase 5 dashboard and the mobile lists in Phase 6.
 */

import type { Task, TaskStatus, TaskRunState } from '../models/task.js'
import type { ProjectTaskCounts } from '../models/project.js'

export interface TasksByStatus {
  todo: Task[]
  in_progress: Task[]
  done: Task[]
}

export function groupTasksByStatus(tasks: readonly Task[]): TasksByStatus {
  const out: TasksByStatus = { todo: [], in_progress: [], done: [] }
  for (const t of tasks) out[t.status].push(t)
  return out
}

export function countTasksByStatus(tasks: readonly Task[]): ProjectTaskCounts {
  let todo = 0, inProgress = 0, done = 0
  for (const t of tasks) {
    if (t.status === 'todo') todo++
    else if (t.status === 'in_progress') inProgress++
    else done++
  }
  return { todo, inProgress, done }
}

export function countTasksByRunState(
  tasks: readonly Task[],
): Record<TaskRunState, number> {
  const out: Record<TaskRunState, number> = {
    RUN_NONE: 0, RUN_QUEUED: 0, RUN_THROTTLED: 0, RUN_ACTIVE: 0, RUN_BLOCKED: 0, RUN_FAILED: 0,
  }
  for (const t of tasks) out[t.runState]++
  return out
}

const OVERDUE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000

/**
 * A task is "overdue" if it's been open (todo/in_progress) for longer than
 * the threshold without an update. Conservative — we don't yet have due
 * dates on Task, so this approximates staleness.
 */
export function isOverdue(task: Task, now: number = Date.now()): boolean {
  if (task.status === 'done') return false
  const updated = new Date(task.updatedAt).getTime()
  if (Number.isNaN(updated)) return false
  return now - updated > OVERDUE_THRESHOLD_MS
}

export function projectProgress(counts: ProjectTaskCounts): number {
  const total = counts.todo + counts.inProgress + counts.done
  if (total === 0) return 0
  return Math.round((counts.done / total) * 100)
}

export function statusBreakdown(
  tasks: readonly Task[],
): Array<{ status: TaskStatus; count: number; pct: number }> {
  const counts = countTasksByStatus(tasks)
  const total = tasks.length
  const safe = total === 0 ? 1 : total
  return [
    { status: 'todo' as const,        count: counts.todo,       pct: Math.round((counts.todo / safe) * 100) },
    { status: 'in_progress' as const, count: counts.inProgress, pct: Math.round((counts.inProgress / safe) * 100) },
    { status: 'done' as const,        count: counts.done,       pct: Math.round((counts.done / safe) * 100) },
  ]
}
