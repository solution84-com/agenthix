/**
 * `run.usage` — what runs on one site add up to, summed on the site rather
 * than by paging rows to hq: an agent's usage for a person, a project and the
 * organisation over a period, an agent's last run, and a place's last run.
 *
 * Grouped, never per run, so the answer stays the size of the groups and not
 * of the run history. `by` picks the grouping:
 *
 *  - `session` — one row per (agent, session, model, person the dispatch named).
 *    hq resolves each session to its person and project from its own records,
 *    because only hq knows a task's person and current project.
 *  - `agent` — one row per agent.
 *  - `owner` — one row per storage owner the runs' sessions work in (a project,
 *    or a person's own space).
 *
 * A row's fields that are not part of its grouping are null.
 *
 * What the run rows carry is token counts by kind and the model; nothing else.
 * Cost and energy are not recorded on a run, so hq estimates both from these
 * tokens (`calculateCost`, `tokensToKwh`). `onBehalfOfUserId` is recorded only
 * when a person started the run (`RunDispatchPayload.onBehalfOfUserId`); a run
 * nobody started is its task's person's, which hq knows and the site does not.
 */
import type { WorkspaceOwnerType } from './siteData.js'

export const RUN_USAGE_METHOD = 'run.usage'

/** The most rows one answer carries; past it the answer says `truncated`. */
export const RUN_USAGE_MAX_ROWS = 5000

export type RunUsageGrouping = 'session' | 'agent' | 'owner'

export const RUN_USAGE_GROUPINGS: readonly RunUsageGrouping[] = ['session', 'agent', 'owner']

export type RunUsageParams = {
  by: RunUsageGrouping
  /** Only this agent's runs. */
  agentId?: string
  /** ISO timestamps on a run's creation: from `since` inclusive, to `until` exclusive. */
  since?: string
  until?: string
}

export type RunUsageRow = {
  agentId: string | null
  sessionId: string | null
  model: string | null
  onBehalfOfUserId: string | null
  ownerType: WorkspaceOwnerType | null
  ownerId: string | null
  runCount: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  totalTokens: number
  /** The newest run's start, or its creation when it never started. ISO. */
  lastRunAt: string
}

export type RunUsageResult = { rows: RunUsageRow[]; truncated: boolean }
