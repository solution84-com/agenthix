/**
 * hq's typed store over the site channel for the runtime data contract
 * (plan 5d-2 task 6) — session/run/transcript/toolcall lifecycle+reads, plus
 * the dispatch/control methods (`run.dispatch`, `run.cancel`, `run.approve`,
 * `run.reject`, `agent.stop`, `agent.promptPreview`), all served by the site
 * (site/src/server/hq/channelMethods.ts). One typed function per `RUNTIME_METHODS` entry
 * (core/src/protocol/runtimeData.ts) — every method name is read from that
 * const, never re-typed as a string literal here.
 *
 * Mirrors `../storage/workspaceStore.ts`'s own conventions exactly: a single
 * private `request<R>()` wrapper over `siteChannelRegistry.request`, the same
 * `ChannelRequestFailed` code mapping, and the same `SiteUnreachableError`
 * class (imported, not redeclared — one "the site is unreachable" type for
 * every store hq has over the channel). See that module's own doc comment for
 * why `offline`/`timeout`/`disconnected` all collapse to one error and every
 * other channel failure propagates unchanged.
 *
 * Every function here takes the target `siteId` (the logical `SiteConfig.siteId`,
 * not `ExecutionSite.id`) first — this store never resolves placement itself;
 * callers (dispatchService.ts, and later callers of the reads/lifecycle
 * methods) already know which site a session/run lives on.
 */
import {
  RUNTIME_METHODS,
  type SessionSeed,
  type SessionRow,
  type RunRow,
  type RunListFilter,
  type RunListPageParams,
  type RunListPageResult,
  type RunStatsResult,
  type RunDispatchPayload,
  type RunDispatchResult,
  type TranscriptRow,
  type TranscriptListParams,
  type ToolCallRow,
  type AgentConfigPayload,
  type AgentPromptPreviewResult,
  type RunPackages,
  type ActiveRunsParams,
  type ActiveRunsResult,
  type RunCancelReason,
  type RunUsageParams,
  type RunUsageResult,
  type SiteMethodName,
  type SiteMethodParams,
  type SiteMethodResult,
} from '@agenthix/core'
import { siteChannelRegistry, ChannelRequestFailed } from '../sites/channel'
import { prisma } from 'wasp/server'
import { SiteUnreachableError, reasonFor } from '../storage/workspaceStore'
import { deliverPackages } from '../packages/packageDelivery'
import { displaySiteName } from '../shared/siteName'
import { namedShortRuns } from '../sites/resources/runResourceWords'
import { recordRunCosting } from '../billing/sources/runs'

/** ExecutionSite.status values that matter to SiteUnreachableError's message — see schema.prisma. */
const REVOKED = 'REVOKED'

/**
 * The wire's own backstop (runtimeChannelMethods.ts's `sessionSeedParams`/
 * `sessionRenameParams`) rejects a title over 500 chars — truncate here so a
 * long task/session title never round-trips as a hard failure. Exported: a
 * `SessionSeed` embedded directly in a `run.dispatch` payload (dispatchService.ts)
 * never passes through this store's own `createSession`/`renameSession`, so
 * that path needs the exact same bound applied to its own seed construction —
 * one truncation rule, shared, rather than a second copy that could drift.
 */
export const TITLE_MAX_LENGTH = 500

export function truncateTitle(title: string): string
export function truncateTitle(title: string | null): string | null
export function truncateTitle(title: string | null): string | null {
  if (title === null) return null
  return title.length > TITLE_MAX_LENGTH ? title.slice(0, TITLE_MAX_LENGTH) : title
}

export const DELETE_SESSIONS_EMPTY_SELECTOR_MESSAGE =
  'siteRuntimeStore.deleteSessionsBy requires at least one of userId, taskId, agentId, or ids — refusing to send an empty selector across the wire'

type SiteInfo = { label: string; status: string | null; protocolVersion: string | null }

/** Same shape and purpose as workspaceStore.ts's own private helper — kept
 *  local rather than shared, so this store's error path never depends on
 *  workspace-specific code beyond the `SiteUnreachableError` class itself. */
async function siteInfoForLogicalSiteId(logicalSiteId: string): Promise<SiteInfo> {
  const site = await prisma.executionSite
    .findUnique({ where: { siteId: logicalSiteId }, select: { label: true, isDefault: true, status: true, protocolVersion: true } })
    .catch(() => null)
  return { label: site ? displaySiteName(site) : logicalSiteId, status: site?.status ?? null, protocolVersion: site?.protocolVersion ?? null }
}

/** The one place every runtime channel call funnels through — see workspaceStore.ts's own `request` for the full rationale. */
async function request<M extends SiteMethodName>(siteId: string, method: M, params: SiteMethodParams<M>): Promise<SiteMethodResult<M>> {
  try {
    return await siteChannelRegistry.request(siteId, method, params)
  } catch (err) {
    if (err instanceof ChannelRequestFailed && (err.code === 'offline' || err.code === 'timeout' || err.code === 'disconnected')) {
      const site = await siteInfoForLogicalSiteId(siteId)
      throw new SiteUnreachableError(site.label, siteId, reasonFor(site.status), site.protocolVersion)
    }
    throw err
  }
}

/**
 * A revoked site never runs anything again, so dispatch refuses it before
 * reaching the channel — a revoked site's socket is closed, and failing as
 * merely "offline" would have callers wait for a reconnect that never comes.
 * A lookup failure is not a refusal: the channel call below still fails
 * honestly if the site really is gone.
 */
async function refuseRevokedSite(siteId: string): Promise<void> {
  let site: { label: string; status: string } | null = null
  try {
    site = await prisma.executionSite.findUnique({ where: { siteId }, select: { label: true, status: true } })
  } catch {
    return
  }
  if (site?.status === REVOKED) throw new SiteUnreachableError(site.label, siteId, 'revoked')
}

// ── Session lifecycle ───────────────────────────────────────────────────────

export function createSession(siteId: string, seed: SessionSeed): Promise<{ ok: true }> {
  return request(siteId, RUNTIME_METHODS.sessionCreate, { ...seed, title: truncateTitle(seed.title) })
}

export function getSession(siteId: string, id: string): Promise<SessionRow | null> {
  return request(siteId, RUNTIME_METHODS.sessionGet, { id })
}

export function renameSession(siteId: string, id: string, title: string): Promise<{ updated: boolean }> {
  return request(siteId, RUNTIME_METHODS.sessionRename, { id, title: truncateTitle(title) })
}

export function archiveSession(siteId: string, id: string): Promise<{ updated: boolean }> {
  return request(siteId, RUNTIME_METHODS.sessionArchive, { id })
}

export function deleteSession(siteId: string, id: string): Promise<{ deleted: boolean }> {
  return request(siteId, RUNTIME_METHODS.sessionDelete, { id })
}

export type SessionDeleteManySelector = {
  userId?: string
  taskId?: string
  agentId?: string
  ids?: string[]
}

export async function deleteSessionsBy(siteId: string, selector: SessionDeleteManySelector): Promise<{ deleted: number }> {
  // Same refusal `sessionDeleteMany` (runtimeChannelMethods.ts) makes on an
  // empty selector, made hq-side too — a caller bug here must never reach the
  // wire and delete every session on the site.
  if (
    selector.userId === undefined &&
    selector.taskId === undefined &&
    selector.agentId === undefined &&
    selector.ids === undefined
  ) {
    throw new Error(DELETE_SESSIONS_EMPTY_SELECTOR_MESSAGE)
  }
  return request(siteId, RUNTIME_METHODS.sessionDeleteMany, selector)
}

export function clearSessionRuns(siteId: string, id: string): Promise<{ deleted: number }> {
  return request(siteId, RUNTIME_METHODS.sessionClearRuns, { id })
}

// ── Run reads ────────────────────────────────────────────────────────────

export function getRun(siteId: string, id: string): Promise<RunRow | null> {
  return request(siteId, RUNTIME_METHODS.runGet, { id })
}

export function listRuns(siteId: string, filter: RunListFilter): Promise<RunRow[]> {
  return request(siteId, RUNTIME_METHODS.runList, filter)
}

/**
 * `run.listPage` — `listRuns`'s rows, paged by a cursor instead of an offset. A separate METHOD NAME, not a flag on
 * `run.list`: a site that does not know it fails loudly rather than returning the newest rows again, which a merged
 * feed would page over forever. Callers go through `mergedRunFeed.ts` rather
 * than calling this per site.
 */
export function listRunsPage(siteId: string, params: RunListPageParams): Promise<RunListPageResult> {
  return request(siteId, RUNTIME_METHODS.runListPage, params)
}

/** May be fed the exact same `RunListFilter` object `listRuns` was — `run.count`
 *  accepts (and discards) `limit` at the wire boundary rather than requiring
 *  callers to strip it first (runtimeChannelMethods.ts's `runCountFilterParams`). */
export function countRuns(siteId: string, filter: RunListFilter): Promise<{ count: number }> {
  return request(siteId, RUNTIME_METHODS.runCount, filter)
}

/**
 * `opts.tail` (finding 1) selects the NEWEST `opts.limit` entries instead of
 * the oldest — still returned oldest→newest. The default (no `opts`) is
 * unchanged: the oldest `limit` (or the transport's own default) entries.
 */
export async function listTranscript(
  siteId: string,
  sessionId: string,
  opts?: Omit<TranscriptListParams, 'sessionId'>,
): Promise<TranscriptRow[]> {
  const rows = await request(siteId, RUNTIME_METHODS.transcriptList, { sessionId, limit: opts?.limit, tail: opts?.tail, toolUseIds: opts?.toolUseIds })
  // A run that stopped for lack of resources reads with the site's name, which only hq knows.
  return namedShortRuns(siteId, rows)
}

export function listToolCalls(siteId: string, runId: string): Promise<ToolCallRow[]> {
  return request(siteId, RUNTIME_METHODS.toolCallList, { runId })
}

/**
 * `run.stats` (finding 3) — an org-wide aggregate over every run on this
 * site, not a page of rows. `getDashboardStats`/`composeSnapshot` use this
 * instead of summing `listRuns({limit: 1000})` themselves, which silently
 * regressed to "newest 1000 runs" once a site's run corpus passed that count.
 */
export function runStats(siteId: string): Promise<RunStatsResult> {
  return request(siteId, RUNTIME_METHODS.runStats, {})
}

/**
 * `run.listActive` (person-scoped execution spec §3) — a boundary's PENDING
 * and RUNNING runs, ids and times only. `activeRuns.ts` is what turns these
 * ids into the names the running-now view and `list_active_runs` show; this
 * store fails with `SiteUnreachableError` the same way every other read here
 * does, never an empty list.
 */
export function listActiveRuns(siteId: string, params: ActiveRunsParams): Promise<ActiveRunsResult> {
  return request(siteId, RUNTIME_METHODS.runListActive, params)
}

/**
 * `run.usage` — run counts and tokens summed on the site, grouped by session,
 * agent or storage owner (core's `runUsage.ts`). Callers go through
 * `runUsageRead.ts`, which asks every site and states the protocol floor.
 */
export function runUsage(siteId: string, params: RunUsageParams): Promise<RunUsageResult> {
  return request(siteId, RUNTIME_METHODS.runUsage, params)
}

// ── Dispatch + control (site does not serve these yet — Task 8) ────────────

export async function dispatchRun(siteId: string, payload: RunDispatchPayload): Promise<RunDispatchResult> {
  await refuseRevokedSite(siteId)
  await deliverPackages(siteId, payload.context.packages)
  const result: RunDispatchResult = await request(siteId, RUNTIME_METHODS.runDispatch, payload)
  // What the run is costed to, for the relay's usage reports and a subscription run's own (billing/sources/runs.ts).
  await recordRunCosting(siteId, result.runId, payload)
  return result
}

/** `by` is the name of the person who stopped it. */
export async function cancelRun(siteId: string, runId: string, reason?: RunCancelReason, by?: string): Promise<void> {
  await request(siteId, RUNTIME_METHODS.runCancel, { runId, reason, ...(by ? { by } : {}) })
}

/**
 * Marks a task's or a conversation's request APPROVED on site, leaving
 * pendingManifest in place — manifestActions.approveManifest calls this BEFORE
 * starting the next run, which is given what was approved (site's
 * nextRunApproval.ts). `{ approved: false }` (never a throw) when the run is
 * missing, not PENDING_APPROVAL, or no longer the newest run of its session.
 */
export async function approveRun(siteId: string, runId: string, decidedBy?: string): Promise<{ approved: boolean }> {
  return request(siteId, RUNTIME_METHODS.runApprove, { runId, ...(decidedBy ? { decidedBy } : {}) })
}

export async function rejectRun(siteId: string, runId: string, reason?: string, decidedBy?: string): Promise<void> {
  await request(siteId, RUNTIME_METHODS.runReject, { runId, reason, ...(decidedBy ? { decidedBy } : {}) })
}

/** Marks an unanswered request replaced by something newer in its task or conversation. */
export async function replaceRequest(siteId: string, runId: string): Promise<void> {
  await request(siteId, RUNTIME_METHODS.runReject, { runId, replaced: true })
}

export async function stopAgent(siteId: string, handle: string): Promise<void> {
  await request(siteId, RUNTIME_METHODS.agentStop, { handle })
}

/**
 * Asks the site to remove the agent's own directory — its credential home. The
 * handle is all that crosses: the site derives the path from its own root, so
 * hq never names one. `removed: false` means the agent never ran there.
 */
export async function removeAgentDirectory(siteId: string, handle: string): Promise<{ removed: boolean }> {
  return request(siteId, RUNTIME_METHODS.agentRemoveDirectory, { handle })
}

/**
 * Site's `agent.promptPreview` handler assembles the prompt with its own
 * `AgentPromptBuilder`, which needs the full agent config and the session
 * type whose section builder to use.
 */
export async function promptPreview(
  siteId: string,
  args: { agent: AgentConfigPayload; sessionType: SessionSeed['sessionType']; packages: RunPackages },
): Promise<AgentPromptPreviewResult> {
  await deliverPackages(siteId, args.packages)
  return request(siteId, RUNTIME_METHODS.agentPromptPreview, args)
}
