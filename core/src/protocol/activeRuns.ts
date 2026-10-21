/**
 * The active-runs read (person-scoped execution spec §3, "Where the data comes
 * from"): what is running in one storage boundary, asked of the site each time.
 *
 * Its own method, `run.listActive`, beside `run.list` (`runtimeData.ts`) but
 * named here, so it joins `RUNTIME_METHODS` only when a site serves it. It is
 * a separate, narrow read rather than a `run.list` filter on purpose: `run.list`
 * returns whole rows with each run's input and output, and cannot filter by
 * boundary. This one carries ids and times only — never content — and hq
 * resolves the ids to names from its own records.
 *
 * Type aliases, not interfaces, for the reason `runtimeData.ts` gives.
 */
import type { WorkspaceOwnerType } from './siteData.js'

export const ACTIVE_RUNS_METHOD = 'run.listActive'

/** The boundary to list: whose storage the runs' sessions work in. */
export type ActiveRunsParams = {
  ownerType: WorkspaceOwnerType
  ownerId: string
}

/** One run that is PENDING or RUNNING. Ids and times only. */
export type ActiveRunRow = {
  runId: string
  sessionId: string
  agentId: string
  /** Null for a chat. */
  taskId: string | null
  status: 'PENDING' | 'RUNNING'
  /** When the run started; null while it is still PENDING. */
  startedAt: string | null
  /** When the run was created — the "since when" of a run that has not started. */
  createdAt: string
}

export type ActiveRunsResult = {
  runs: ActiveRunRow[]
}
