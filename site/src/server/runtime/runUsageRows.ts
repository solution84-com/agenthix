/**
 * `run.usage` (core's `runUsage.ts`) — run counts and tokens summed in the
 * database, grouped by session, agent or storage owner, so hq never pages run
 * rows to add them up.
 *
 * Raw SQL for the reason `statsRuns` gives: `usage` is a JSON column Prisma
 * cannot sum. The grouping is chosen from a fixed table below, never from the
 * caller's text, so `Prisma.raw` only ever sees this file's own fragments.
 */
import { Prisma } from '@prisma/client'
import { prisma } from '#db'
import {
  RUN_USAGE_MAX_ROWS,
  type RunUsageGrouping,
  type RunUsageParams,
  type RunUsageResult,
  type RunUsageRow,
  type WorkspaceOwnerType,
} from '@agenthix/core'

const NONE = 'NULL::text'

/** The six key columns each grouping fills, in RunUsageRow's order; the rest stay null. */
const KEYS: Record<RunUsageGrouping, { select: string[]; groupBy: string }> = {
  session: {
    select: [`r."agentId"`, `r."sessionId"`, `r."model"`, `(r."metadata"->'dispatch'->>'onBehalfOfUserId')`, NONE, NONE],
    groupBy: '1, 2, 3, 4',
  },
  agent: { select: [`r."agentId"`, NONE, NONE, NONE, NONE, NONE], groupBy: '1' },
  owner: { select: [NONE, NONE, NONE, NONE, `s."primaryOwnerType"::text`, `s."primaryOwnerId"`], groupBy: '5, 6' },
}
const KEY_NAMES = ['agentId', 'sessionId', 'model', 'onBehalfOfUserId', 'ownerType', 'ownerId'] as const

type SummedRow = {
  agentId: string | null
  sessionId: string | null
  model: string | null
  onBehalfOfUserId: string | null
  ownerType: string | null
  ownerId: string | null
  runCount: number
  inputTokens: bigint
  outputTokens: bigint
  cacheReadTokens: bigint
  cacheWriteTokens: bigint
  totalTokens: bigint
  lastRunAt: Date
}

const tokens = (field: string) => Prisma.raw(`COALESCE(SUM((r."usage"->>'${field}')::bigint), 0)::bigint`)

export function toUsageRow(row: SummedRow): RunUsageRow {
  return {
    agentId: row.agentId,
    sessionId: row.sessionId,
    model: row.model,
    onBehalfOfUserId: row.onBehalfOfUserId,
    ownerType: row.ownerType as WorkspaceOwnerType | null,
    ownerId: row.ownerId,
    runCount: Number(row.runCount),
    inputTokens: Number(row.inputTokens),
    outputTokens: Number(row.outputTokens),
    cacheReadTokens: Number(row.cacheReadTokens),
    cacheWriteTokens: Number(row.cacheWriteTokens),
    totalTokens: Number(row.totalTokens),
    lastRunAt: row.lastRunAt.toISOString(),
  }
}

export async function sumRunUsage(params: RunUsageParams): Promise<RunUsageResult> {
  const keys = KEYS[params.by]
  const conditions: Prisma.Sql[] = []
  if (params.agentId !== undefined) conditions.push(Prisma.sql`r."agentId" = ${params.agentId}`)
  if (params.since !== undefined) conditions.push(Prisma.sql`r."createdAt" >= ${new Date(params.since)}`)
  if (params.until !== undefined) conditions.push(Prisma.sql`r."createdAt" < ${new Date(params.until)}`)
  const where = conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty
  const keyColumns = Prisma.raw(keys.select.map((expr, i) => `${expr} AS "${KEY_NAMES[i]}"`).join(', '))

  const rows = await prisma.$queryRaw<SummedRow[]>`
    SELECT ${keyColumns},
           COUNT(*)::int AS "runCount",
           ${tokens('inputTokens')} AS "inputTokens",
           ${tokens('outputTokens')} AS "outputTokens",
           ${tokens('cacheReadTokens')} AS "cacheReadTokens",
           ${tokens('cacheWriteTokens')} AS "cacheWriteTokens",
           ${tokens('totalTokens')} AS "totalTokens",
           MAX(COALESCE(r."startedAt", r."createdAt")) AS "lastRunAt"
    FROM "AgentRun" r
    JOIN "AgentSession" s ON s."id" = r."sessionId"
    ${where}
    GROUP BY ${Prisma.raw(keys.groupBy)}
    ORDER BY "lastRunAt" DESC
    LIMIT ${RUN_USAGE_MAX_ROWS + 1}
  `
  return {
    rows: rows.slice(0, RUN_USAGE_MAX_ROWS).map(toUsageRow),
    truncated: rows.length > RUN_USAGE_MAX_ROWS,
  }
}
