/**
 * Reading runs in bulk: `run.list`'s filter, `run.stats`, and `run.listPage`.
 *
 * Split out of `runtimeData.ts` when that file passed the repository's
 * file-size limit; the method names stay in its `RUNTIME_METHODS`. Type
 * aliases rather than interfaces, for the reason that file gives.
 */
import type { RunRow } from './runtimeData.js'

/**
 * `run.list`'s filter. Results are always ordered `createdAt` descending, so
 * `limit: 1` means the newest row, not an arbitrary one.
 */
export type RunListFilter = {
  sessionId?: string
  taskId?: string
  agentId?: string
  activeOnly?: boolean // status in PENDING | RUNNING
  limit?: number
}


/**
 * `run.stats`'s (no-filter, for now) response — an aggregate computed on site
 * over EVERY AgentRun row, not a summed page of `run.list` results (finding 3:
 * summing `run.list({limit: 1000})` hq-side silently became "newest 1000
 * runs" once the run corpus passed that count, regressing what used to be a
 * genuine all-time total). `perAgent` carries only the three scalars a
 * dashboard breakdown needs — never full rows, so the wire payload stays
 * O(agent count), not O(run count).
 */
export type RunStatsResult = {
  totalRuns: number
  completedRuns: number
  failedRuns: number
  /**
   * Not in the original review note's proposed shape — added because
   * `DashboardSnapshot.runs.running` (core/src/dashboard.ts) needs an exact
   * RUNNING count, and deriving it as `totalRuns - completedRuns - failedRuns`
   * would silently fold PENDING and CANCELLED runs into "running" too.
   */
  runningRuns: number
  totalTokens: number
  perAgent: Array<{ agentId: string; runCount: number; totalTokens: number }>
}

/**
 * `run.listPage`'s params — `run.list`'s filter plus a required page size and
 * an exclusive cursor. `limit` is capped by the site exactly as `run.list`'s
 * is: one page-size ceiling for both, never a second number.
 *
 * `before` is a position, not a timestamp: two runs sharing a key to the
 * millisecond would make a page repeat a row or skip one, which is the whole
 * failure paging exists to prevent. Build it with `runPageCursor` and read it
 * with `parseRunPageCursor` — never by hand.
 */
export type RunListPageParams = RunListFilter & {
  limit: number
  before?: string
  /**
   * Only the runs of these tasks (at most `RUN_TASK_IDS_MAX`), so a caller that cares about some tasks pages
   * over their runs and not the whole history. Not part of `run.list`'s filter or `run.count`'s.
   */
  taskIds?: string[]
  /**
   * Only the runs of these sessions (at most `RUN_SESSION_IDS_MAX`): a person's conversations and the sessions of their
   * tasks, read in one request per site. Not part of `run.list`'s filter or `run.count`'s.
   */
  sessionIds?: string[]
}

/** The most session ids one `run.listPage` call may carry. */
export const RUN_SESSION_IDS_MAX = 2000

/** The most task ids one `run.listPage` call may carry. */
export const RUN_TASK_IDS_MAX = 2000

/**
 * `run.listPage`'s answer. `runs` is ordered by `runFeedKey` then `id`,
 * descending.
 *
 * `nextBefore` is the cursor for the row after the last one returned, or null
 * when this site has nothing further under this filter. It says only whether
 * THIS SITE is exhausted: a caller merging several sites decides its own
 * cursor from the rows it actually consumed, because a row this site returned
 * may well sit below another site's rows and belong to a later page.
 */
export type RunListPageResult = { runs: RunRow[]; nextBefore: string | null }
