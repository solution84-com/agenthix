/**
 * Index derivations
 * =================
 * Pure reductions over the index types used by HQ and mobile catalogs.
 * Same functions feed the Phase 5 dashboard and the mobile lists in Phase 6.
 */

import type { Task, TaskRunState } from '../models/task.js'
import type { ProjectTaskCounts } from '../models/project.js'

export function countTasksByRunState(
  tasks: readonly Task[],
): Record<TaskRunState, number> {
  const out: Record<TaskRunState, number> = {
    RUN_NONE: 0, RUN_QUEUED: 0, RUN_ACTIVE: 0, RUN_BLOCKED: 0, RUN_FAILED: 0,
  }
  for (const t of tasks) out[t.runState]++
  return out
}

const OVERDUE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000

/**
 * A task is "overdue" if it's been open (not done) for longer than
 * the threshold without an update. Conservative — we don't yet have due
 * dates on Task, so this approximates staleness.
 */
export function isOverdue(task: Task, now: number = Date.now()): boolean {
  if (task.state === 'DONE') return false
  const updated = new Date(task.updatedAt).getTime()
  if (Number.isNaN(updated)) return false
  return now - updated > OVERDUE_THRESHOLD_MS
}

export function projectProgress(counts: ProjectTaskCounts): number {
  const total = counts.todo + counts.inProgress + counts.done
  if (total === 0) return 0
  return Math.round((counts.done / total) * 100)
}
