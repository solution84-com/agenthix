/**
 * AgentRun row access — plan 5d-2 task 3. AgentRun is authored BY SITE (the
 * runtime creates rows as a run executes), so ids and createdAt come from
 * Prisma's own defaults — unlike sessionRows.ts's hq-seeded AgentSession.
 */
import { Prisma, type AgentRun } from '@prisma/client'
import { prisma } from '#db'
import {
  parseContextUse,
  parseRunPageCursor,
  runPageCursor,
  type RunRow,
  type RunListFilter,
  type RunListPageParams,
  type RunListPageResult,
  type RunStatsResult,
  type TokenUsage,
  type JsonValue,
} from '@agenthix/core'

/** Fallback page size when the caller passes no `limit`. */
const DEFAULT_LIST_LIMIT = 100
/** Hard ceiling regardless of what a caller passes — a filter is a page size,
 *  not a way to pull an entire run history into memory in one call. */
const MAX_LIST_LIMIT = 1000

function runWhere(filter: Omit<RunListFilter, 'limit'>): Prisma.AgentRunWhereInput {
  return {
    ...(filter.sessionId !== undefined ? { sessionId: filter.sessionId } : {}),
    ...(filter.taskId !== undefined ? { taskId: filter.taskId } : {}),
    ...(filter.agentId !== undefined ? { agentId: filter.agentId } : {}),
    ...(filter.activeOnly ? { status: { in: ['PENDING', 'RUNNING'] as const } } : {}),
  }
}

function toRunRow(run: AgentRun): RunRow {
  return {
    id: run.id,
    agentId: run.agentId,
    sessionId: run.sessionId,
    taskId: run.taskId,
    routineId: run.routineId,
    parentRunId: run.parentRunId,
    rootRunId: run.rootRunId,
    status: run.status as RunRow['status'],
    inputText: run.inputText,
    outputText: run.outputText,
    thought: run.thought,
    model: run.model,
    error: run.error,
    usage: run.usage as TokenUsage | null,
    // The stored JSON columns, read back as the runtime wrote them.
    diagnosticLog: run.diagnosticLog as JsonValue,
    manifestStatus: run.manifestStatus as RunRow['manifestStatus'],
    pendingManifest: run.pendingManifest as RunRow['pendingManifest'],
    approvedManifest: run.approvedManifest as RunRow['approvedManifest'],
    manifestDecidedById: run.manifestDecidedById,
    manifestDecidedAt: run.manifestDecidedAt?.toISOString() ?? null,
    contextUse: parseContextUse(run.contextUse),
    auditSummary: run.auditSummary as RunRow['auditSummary'],
    metadata: run.metadata as JsonValue,
    startedAt: run.startedAt ? run.startedAt.toISOString() : null,
    endedAt: run.endedAt ? run.endedAt.toISOString() : null,
    createdAt: run.createdAt.toISOString(),
    agentPackageDigest: run.agentPackageDigest,
    orgPackageDigest: run.orgPackageDigest,
    platformPackageDigest: run.platformPackageDigest,
    skillsUsed: run.skillsUsed as RunRow['skillsUsed'],
  }
}

export async function getRun(id: string): Promise<RunRow | null> {
  const run = await prisma.agentRun.findUnique({ where: { id } })
  return run ? toRunRow(run) : null
}

/**
 * Always ordered `createdAt` descending (core's RunListFilter contract) —
 * `limit: 1` means newest. `limit` is clamped to [1, MAX_LIST_LIMIT]: a
 * missing limit falls back to DEFAULT_LIST_LIMIT, an oversized one is capped,
 * and a zero or negative one — which would otherwise ask Prisma for the
 * *last* N rows and silently invert the newest-first ordering into
 * oldest-first — is floored to 1 instead.
 */
export async function listRuns(filter: RunListFilter): Promise<RunRow[]> {
  const take = Math.min(Math.max(1, filter.limit ?? DEFAULT_LIST_LIMIT), MAX_LIST_LIMIT)
  const runs = await prisma.agentRun.findMany({
    where: runWhere(filter),
    orderBy: { createdAt: 'desc' },
    take,
  })
  return runs.map(toRunRow)
}

/**
 * `run.listPage` — the same rows `listRuns` serves, ordered so they can be
 * paged: `COALESCE("startedAt", "createdAt")` descending, with `id` as the
 * tiebreak. `id` is not decoration — two runs can share a key to the
 * millisecond, and without a second key a page repeats a row or skips one.
 *
 * **The coalesce is what makes every row reachable.** `startedAt` is null
 * until a run launches and stays null for ever on one that failed or was
 * cancelled before it did, so every site always holds a block of null-keyed
 * rows. Keyed on `startedAt` alone that block has no safe place: sorted last
 * it is unreachable, because `startedAt < :cursor` can never be true of a
 * null, so once a page reached it the site would answer every later page with
 * nothing and its started history would never be asked for again; sorted
 * first, a dispatch failure from months ago pins itself to the top of the feed
 * for ever. Coalescing takes the null out of the key instead of choosing which
 * of those to live with. `runFeedKey` in core is the same rule, for hq's merge.
 *
 * Raw SQL because Prisma cannot order by an expression. The filter is built
 * from the same `RunListFilter` fields `runWhere` reads — keep the two in step;
 * they are one rule in two dialects.
 *
 * `before` is exclusive and compares the PAIR as a row value, so it lands
 * exactly between two rows however many share a key. A cursor that does not
 * parse is treated as absent — the first page, never an error, because a
 * person with a stale link can do nothing with a failure.
 *
 * `limit` passes through the same clamp `listRuns` applies. One page-size
 * ceiling for both reads; a second number here is how they come to disagree.
 */
export async function listRunsPage(params: RunListPageParams): Promise<RunListPageResult> {
  const take = Math.min(Math.max(1, params.limit ?? DEFAULT_LIST_LIMIT), MAX_LIST_LIMIT)
  const conditions: Prisma.Sql[] = []
  if (params.sessionId !== undefined) conditions.push(Prisma.sql`"sessionId" = ${params.sessionId}`)
  if (params.taskId !== undefined) conditions.push(Prisma.sql`"taskId" = ${params.taskId}`)
  if (params.agentId !== undefined) conditions.push(Prisma.sql`"agentId" = ${params.agentId}`)
  if (params.activeOnly) conditions.push(Prisma.sql`"status" IN ('PENDING', 'RUNNING')`)
  if (params.taskIds !== undefined) {
    if (params.taskIds.length === 0) return { runs: [], nextBefore: null }
    conditions.push(Prisma.sql`"taskId" IN (${Prisma.join(params.taskIds)})`)
  }
  if (params.sessionIds !== undefined) {
    if (params.sessionIds.length === 0) return { runs: [], nextBefore: null }
    conditions.push(Prisma.sql`"sessionId" IN (${Prisma.join(params.sessionIds)})`)
  }

  const cursor = parseRunPageCursor(params.before)
  if (cursor) {
    conditions.push(
      Prisma.sql`(COALESCE("startedAt", "createdAt"), "id") < (${new Date(cursor.at)}, ${cursor.id})`,
    )
  }

  const where = conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty
  const runs = await prisma.$queryRaw<AgentRun[]>`
    SELECT * FROM "AgentRun"
    ${where}
    ORDER BY COALESCE("startedAt", "createdAt") DESC, "id" DESC
    LIMIT ${take}
  `

  const rows = runs.map(toRunRow)
  const oldest = rows.at(-1)
  // A short page is the end of this site's history under this filter. A full
  // one may or may not be — saying "there may be more" and returning nothing
  // next time is the honest error to make; claiming the end and hiding rows is not.
  return { runs: rows, nextBefore: rows.length === take && oldest ? runPageCursor(oldest) : null }
}

export async function countRuns(filter: Omit<RunListFilter, 'limit'>): Promise<{ count: number }> {
  const count = await prisma.agentRun.count({ where: runWhere(filter) })
  return { count }
}

type PerAgentTokenRow = { agentId: string; runCount: number; totalTokens: bigint }

/**
 * `run.stats` (finding 3) — an org-wide aggregate over EVERY run, computed in
 * the database rather than by paging rows to hq and summing there (the bug
 * being fixed: `listRuns({limit: 1000})` silently became "newest 1000 runs"
 * once the corpus passed that count). Two queries, both narrow:
 *  - `groupBy(status)` for the status counts — a native Prisma aggregation.
 *  - `$queryRaw` for per-agent token totals — `usage` is a JSON column with
 *    no Prisma-level numeric aggregation, so this sums the one field needed
 *    (`usage->>'totalTokens'`) directly in SQL instead of selecting every run
 *    row (including its content payloads) into memory to add up in JS.
 */
export async function statsRuns(): Promise<RunStatsResult> {
  const [statusGroups, perAgentRows] = await Promise.all([
    prisma.agentRun.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.$queryRaw<PerAgentTokenRow[]>`
      SELECT "agentId",
             COUNT(*)::int AS "runCount",
             COALESCE(SUM((("usage"->>'totalTokens'))::bigint), 0) AS "totalTokens"
      FROM "AgentRun"
      GROUP BY "agentId"
    `,
  ])

  let totalRuns = 0
  let completedRuns = 0
  let failedRuns = 0
  let runningRuns = 0
  for (const group of statusGroups) {
    totalRuns += group._count._all
    if (group.status === 'COMPLETED') completedRuns = group._count._all
    else if (group.status === 'FAILED') failedRuns = group._count._all
    else if (group.status === 'RUNNING') runningRuns = group._count._all
  }

  let totalTokens = 0
  const perAgent = perAgentRows.map((row) => {
    const tokens = Number(row.totalTokens)
    totalTokens += tokens
    return { agentId: row.agentId, runCount: row.runCount, totalTokens: tokens }
  })

  return { totalRuns, completedRuns, failedRuns, runningRuns, totalTokens, perAgent }
}
