/**
 * The pulse's rules (spec §2), pure so they can be tested on their own. With
 * the throttle off a boundary has no rounds: each agent's line simply runs. The
 * rules below are the throttle's.
 *
 * - **Leading edge, measured from a round's end.** A boundary whose last round
 *   finished at least an interval ago is due now, so the first task queued
 *   into a quiet boundary starts at once; otherwise it is due an interval
 *   after that round finished, however long the round took.
 * - **A round finishes** when none of the tasks it let through is still queued
 *   or running (RUN_QUEUED, RUN_ACTIVE) — each finished, failed, blocked,
 *   stopped or withdrawn. While one is still in its agent's line or running,
 *   the round is open and the pulse is not due at all.
 * - **To the minute.** The scheduler ticks at the top of each minute, so a due
 *   time is rounded up to its minute (never shortening an interval) and a tick
 *   counts everything due within its own minute.
 * - **A batch per agent.** Each agent with throttled tasks gets up to the batch
 *   size of its own, highest priority first, then longest queued; agents do
 *   not compete with each other for priority.
 */

const MINUTE_MS = 60_000

/**
 * When the pulse may next fire, given when its last round finished: an interval
 * later, rounded up to the minute — except that the few milliseconds a tick
 * takes do not push it a whole minute on (a round closed at 2:10:00.003 is due
 * at 2:40, not 2:41).
 */
export function pulseDueAt(lastRoundFinishedAt: Date | null, intervalMinutes: number, now: Date): Date {
  if (!lastRoundFinishedAt) return now
  const at = lastRoundFinishedAt.getTime() + intervalMinutes * MINUTE_MS
  return new Date(Math.ceil((at - DUE_GRACE_MS) / MINUTE_MS) * MINUTE_MS)
}

const STILL_IN_ROUND = new Set(['RUN_QUEUED', 'RUN_ACTIVE'])

/** Whether a round is over, given the run states of the tasks it started. */
export function roundFinished(states: string[]): boolean {
  return states.every(s => !STILL_IN_ROUND.has(s))
}

const PRIORITY_RANK: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 }

export interface QueuedTask {
  id: string
  assignedAgentId: string | null
  priority: string
  createdAt: Date
}

/** Each agent's batch: up to `batchSize` of its own throttled tasks, by priority then age. */
export function selectBatches<T extends QueuedTask>(tasks: T[], batchSize: number): Map<string, T[]> {
  const ordered = [...tasks].sort((a, b) =>
    (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1) || a.createdAt.getTime() - b.createdAt.getTime(),
  )
  const batches = new Map<string, T[]>()
  for (const t of ordered) {
    if (!t.assignedAgentId) continue
    const batch = batches.get(t.assignedAgentId) ?? []
    if (batch.length >= batchSize) continue
    batch.push(t)
    batches.set(t.assignedAgentId, batch)
  }
  return batches
}

/**
 * A tick's timer can fire a moment before the minute it is for; its minute is
 * read this much later, so a tick at 2:39:59.999 still counts as the 2:40 tick.
 */
export const DUE_GRACE_MS = 2_000

/**
 * The latest due time that counts as due on a tick at `now`: the end of the
 * tick's minute. Something due at 2:40:00.001 — a due time computed a few
 * milliseconds into a tick — fires on the 2:40 tick, not the 2:41 one.
 */
export function dueBy(now: Date): Date {
  const minute = Math.floor((now.getTime() + DUE_GRACE_MS) / MINUTE_MS) * MINUTE_MS
  return new Date(minute + MINUTE_MS - 1)
}
