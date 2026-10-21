/**
 * The dashboard's task counts. Done is the task's own state — its column's
 * status — never its run state, which says only whether a run is pending or
 * going (agents own schedule spec §6). A task that is not done counts by its
 * run state: running, blocked, failed, or idle (none pending, queued or
 * throttled).
 */
export type TaskCounts = { idle: number; running: number; blocked: number; done: number; failed: number; total: number }

export function countTasks(tasks: Array<{ status: string; runState: string }>): TaskCounts {
  const counts: TaskCounts = { idle: 0, running: 0, blocked: 0, done: 0, failed: 0, total: 0 }
  for (const t of tasks) {
    counts.total++
    if (t.status === 'DONE') counts.done++
    else if (t.runState === 'RUN_ACTIVE') counts.running++
    else if (t.runState === 'RUN_BLOCKED') counts.blocked++
    else if (t.runState === 'RUN_FAILED') counts.failed++
    else counts.idle++
  }
  return counts
}
