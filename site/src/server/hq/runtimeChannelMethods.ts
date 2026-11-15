/**
 * Runtime channel methods — plan 5d-2 task 4. Wire-boundary validation for
 * the session/run/transcript/toolcall lifecycle and reads that
 * `channelMethods.ts` registers under `RUNTIME_METHODS`.
 *
 * Unlike workspaceRows.ts (plan 5c), the runtime row modules
 * (`site/src/server/runtime/*.ts`) take TYPED params — Task 3 deliberately
 * left wire validation for this task, at the channel boundary, so this
 * module holds the zod schemas instead of the row modules. Same defensive
 * stance as workspaceRows.ts: params arrive as `unknown` off the wire from
 * hq, and every handler here validates its own shape before delegating.
 */
import { z, ZodError, type ZodType } from 'zod'
import { RUNTIME_METHODS, RUN_TASK_IDS_MAX, RUN_SESSION_IDS_MAX, TRANSCRIPT_TOOL_USE_IDS_MAX, RUN_USAGE_GROUPINGS, type RunUsageParams, type RunUsageResult, SESSION_TYPES, WORKSPACE_OWNER_TYPES, type ActiveRunsResult, type RunListFilter, type RunListPageParams, type RunListPageResult, type RunStatsResult, type SessionSeed, type TranscriptListParams } from '@agenthix/core'
import * as sessionRows from '../runtime/sessionRows'
import * as runRows from '../runtime/runRows'
import * as activeRunsRows from '../runtime/activeRunsRows'
import * as runUsageRows from '../runtime/runUsageRows'
import * as transcriptRows from '../runtime/transcriptRows'
import * as toolCallRows from '../runtime/toolCallRows'
import { endConversations } from '../runtime/conversationEnding'

/**
 * A raw ZodError's `.message` is a multi-issue JSON blob — unreadable in a
 * `handler_failed` channel.error that an operator reads as plain text
 * (hqConnection.ts's `payload.message`). Collapse it to the first issue's
 * path and message on one line instead, prefixed with the method name so a
 * log line is self-locating without cross-referencing the request.
 */
function parseParams<T>(schema: ZodType<T>, params: unknown, method: string): T {
  try {
    return schema.parse(params)
  } catch (err) {
    if (err instanceof ZodError) {
      const issue = err.issues[0]
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)'
      throw new Error(`${method}: ${path} — ${issue.message}`)
    }
    throw err
  }
}

/** Handler-side default and hard cap for transcript reads — transcriptRows.ts
 *  itself is deliberately uncapped; this is the only gate a caller's `limit` passes through.
 *  The default (tail-less, "oldest N") stays 500 — MAX_TRANSCRIPT_LIMIT alone raised to 1000
 *  (finding 1) so hq's full-transcript callers can request `{ tail: true, limit: 1000 }` for
 *  the newest-1000 degradation without a second cap fighting them at this boundary. */
const DEFAULT_TRANSCRIPT_LIMIT = 500
const MAX_TRANSCRIPT_LIMIT = 1000

export const SESSION_DELETE_MANY_EMPTY_SELECTOR_MESSAGE =
  'session.deleteMany requires at least one of userId, taskId, agentId, or ids — an empty selector would delete every session on this site'

const idParams = z.object({ id: z.string().min(1) })

const sessionSeedParams = z
  .object({
    id: z.string().min(1),
    sessionKey: z.string().min(1),
    agentId: z.string().min(1),
    userId: z.string().min(1),
    sessionType: z.enum(SESSION_TYPES),
    taskId: z.string().min(1).nullable(),
    // Same bound as session.rename's title param below — one limit for the
    // field, whichever path writes it. hq is expected to truncate before
    // sending (plan 5d-2 task 6); this is the boundary's own backstop.
    title: z.string().max(500).nullable(),
    model: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()),
    primaryOwnerType: z.enum(WORKSPACE_OWNER_TYPES).nullable(),
    primaryOwnerId: z.string().min(1).nullable(),
    primaryWorkspaceId: z.string().min(1).nullable(),
    runtime: z.string().min(1).nullable(),
    createdAt: z.string().datetime(),
  })

export async function sessionCreate(params: unknown): Promise<{ ok: true }> {
  const parsed = parseParams(sessionSeedParams, params, RUNTIME_METHODS.sessionCreate) satisfies Omit<SessionSeed, 'metadata'>
  // Read off the wire, so its metadata is JSON already.
  await sessionRows.upsertSessionFromSeed({ ...parsed, metadata: parsed.metadata as SessionSeed['metadata'] })
  return { ok: true }
}

export async function sessionGet(params: unknown) {
  const { id } = parseParams(idParams, params, RUNTIME_METHODS.sessionGet)
  return sessionRows.getSession(id)
}

const sessionRenameParams = z.object({ id: z.string().min(1), title: z.string().min(1).max(500) })

export async function sessionRename(params: unknown): Promise<{ updated: boolean }> {
  const { id, title } = parseParams(sessionRenameParams, params, RUNTIME_METHODS.sessionRename)
  const updated = await sessionRows.renameSession(id, title)
  return { updated }
}

export async function sessionArchive(params: unknown): Promise<{ updated: boolean }> {
  const { id } = parseParams(idParams, params, RUNTIME_METHODS.sessionArchive)
  const updated = await sessionRows.archiveSession(id)
  return { updated }
}

export async function sessionDelete(params: unknown): Promise<{ deleted: boolean }> {
  const { id } = parseParams(idParams, params, RUNTIME_METHODS.sessionDelete)
  // Its processes, harness and staging go with it (adr-0083).
  await endConversations({ id })
  const deleted = await sessionRows.deleteSession(id)
  return { deleted }
}

const sessionDeleteManyParams = z
  .object({
    userId: z.string().min(1).optional(),
    taskId: z.string().min(1).optional(),
    agentId: z.string().min(1).optional(),
    ids: z.array(z.string().min(1)).nonempty().optional(),
  })

export async function sessionDeleteMany(params: unknown): Promise<{ deleted: number }> {
  const where = parseParams(sessionDeleteManyParams, params, RUNTIME_METHODS.sessionDeleteMany)
  // An empty selector would resolve to an empty Prisma `where`, matching and
  // deleting every AgentSession row on this site — refuse it rather than
  // trust that hq always sends a narrowing field.
  if (where.userId === undefined && where.taskId === undefined && where.agentId === undefined && where.ids === undefined) {
    throw new Error(SESSION_DELETE_MANY_EMPTY_SELECTOR_MESSAGE)
  }
  await endConversations(sessionRows.sessionSelectorWhere(where))
  const deleted = await sessionRows.deleteSessionsBy(where)
  return { deleted }
}

export async function sessionClearRuns(params: unknown): Promise<{ deleted: number }> {
  const { id } = parseParams(idParams, params, RUNTIME_METHODS.sessionClearRuns)
  const deleted = await sessionRows.clearSessionRuns(id)
  return { deleted }
}

export async function runGet(params: unknown) {
  const { id } = parseParams(idParams, params, RUNTIME_METHODS.runGet)
  return runRows.getRun(id)
}

const runListFilterParams = z
  .object({
    sessionId: z.string().min(1).optional(),
    taskId: z.string().min(1).optional(),
    agentId: z.string().min(1).optional(),
    activeOnly: z.boolean().optional(),
    limit: z.number().int().optional(),
  })

export async function runList(params: unknown) {
  const filter = parseParams(runListFilterParams, params, RUNTIME_METHODS.runList) satisfies RunListFilter
  return runRows.listRuns(filter)
}

const runListPageParams = z
  .object({
    sessionId: z.string().min(1).optional(),
    taskId: z.string().min(1).optional(),
    agentId: z.string().min(1).optional(),
    activeOnly: z.boolean().optional(),
    limit: z.number().int(),
    taskIds: z.array(z.string().min(1)).max(RUN_TASK_IDS_MAX).optional(),
    sessionIds: z.array(z.string().min(1)).max(RUN_SESSION_IDS_MAX).optional(),
    // Opaque to this boundary on purpose: its format is core's
    // (`runPageCursor`), and runRows.ts treats one it cannot read as the first
    // page rather than an error. Validating the shape here as well would turn
    // a stale link into a failure a person cannot act on.
    before: z.string().min(1).optional(),
  })

/**
 * `run.listPage` — a new NAME beside `run.list`, not an option on it. A site
 * older than this method would accept an unknown parameter and return the
 * newest rows again, and hq would page over the same rows forever; an unknown
 * name answers `unknown_method`, which hq reports as the version to upgrade.
 */
export async function runListPage(params: unknown): Promise<RunListPageResult> {
  const page = parseParams(runListPageParams, params, RUNTIME_METHODS.runListPage) satisfies RunListPageParams
  return runRows.listRunsPage(page)
}

const runCountFilterParams = z
  .object({
    sessionId: z.string().min(1).optional(),
    taskId: z.string().min(1).optional(),
    agentId: z.string().min(1).optional(),
    activeOnly: z.boolean().optional(),
    // Accepted-and-ignored: hq feeds one RunListFilter object to both run.list
    // and run.count, and RunListFilter carries `limit`. Typed here so its
    // value is still checked.
    limit: z.number().int().optional(),
  })

export async function runCount(params: unknown): Promise<{ count: number }> {
  const { limit: _ignoredLimit, ...filter } = parseParams(runCountFilterParams, params, RUNTIME_METHODS.runCount)
  return runRows.countRuns(filter)
}

const runStatsParams = z.object({})

export async function runStats(params: unknown): Promise<RunStatsResult> {
  parseParams(runStatsParams, params, RUNTIME_METHODS.runStats)
  return runRows.statsRuns()
}

const activeRunsParams = z.object({ ownerType: z.enum(WORKSPACE_OWNER_TYPES), ownerId: z.string().min(1) })

export async function runListActive(params: unknown): Promise<ActiveRunsResult> {
  const { ownerType, ownerId } = parseParams(activeRunsParams, params, RUNTIME_METHODS.runListActive)
  return activeRunsRows.listActiveRuns({ ownerType, ownerId })
}

const runUsageParams = z
  .object({
    by: z.enum(RUN_USAGE_GROUPINGS as [RunUsageParams['by'], ...RunUsageParams['by'][]]),
    agentId: z.string().min(1).optional(),
    since: z.string().datetime().optional(),
    until: z.string().datetime().optional(),
  })

export async function runUsage(params: unknown): Promise<RunUsageResult> {
  const usage = parseParams(runUsageParams, params, RUNTIME_METHODS.runUsage) satisfies RunUsageParams
  return runUsageRows.sumRunUsage(usage)
}

const transcriptListParams = z
  .object({
    sessionId: z.string().min(1),
    limit: z.number().int().positive().optional(),
    tail: z.boolean().optional(),
    toolUseIds: z.array(z.string().min(1)).max(TRANSCRIPT_TOOL_USE_IDS_MAX).optional(),
  })

export async function transcriptList(params: unknown) {
  const { sessionId, limit, tail, toolUseIds } = parseParams(transcriptListParams, params, RUNTIME_METHODS.transcriptList) satisfies TranscriptListParams
  // Default AND cap at MAX_TRANSCRIPT_LIMIT here — the row module
  // (transcriptRows.ts) stays uncapped, this is the only gate. `.positive()`
  // above already refused a zero/negative limit at the boundary, so this
  // Math.min only ever narrows a too-large value, never inverts one.
  const capped = Math.min(limit ?? DEFAULT_TRANSCRIPT_LIMIT, MAX_TRANSCRIPT_LIMIT)
  return transcriptRows.listTranscript(sessionId, { limit: capped, tail, toolUseIds })
}

const toolCallListParams = z.object({ runId: z.string().min(1) })

export async function toolCallList(params: unknown) {
  const { runId } = parseParams(toolCallListParams, params, RUNTIME_METHODS.toolCallList)
  return toolCallRows.listToolCalls(runId)
}
