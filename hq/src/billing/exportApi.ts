/**
 * `GET /api/v1/usage/export?month=YYYY-MM[&profile=<id>]`: the month's call costs as CSV, streamed a page at a time,
 * for organisation admins. The month is cut in the organisation's time zone.
 */
import { prisma } from 'wasp/server'
import type { UsageExportApi } from 'wasp/server/api'
import type { CostBasis, UsagePurpose } from '@agenthix/core'
import { isOrgAdmin } from '../projects/membership'
import { Logger } from '../server/utils/logger'
import { CSV_COLUMNS, csvLine, microsToDecimal } from './csv'
import { monthRange, parseMonth } from './months'
import { namesFor } from './report'

const logger = new Logger('UsageExport')
const PAGE = 1000

type CostRow = {
  callRowId: string; callId: string; at: Date; purpose: UsagePurpose; providerName: string; model: string
  inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; audioMs: number; characters: number
  billingProfileId: string; projectId: string | null; agentId: string | null; userId: string | null
  amountMicros: bigint | null; currency: string | null; basis: CostBasis; priceRef: string | null
}

async function page(from: Date, to: Date, profileId: string | null, after: { at: Date; id: string } | null): Promise<CostRow[]> {
  return prisma.$queryRaw<CostRow[]>`
    SELECT "callRowId", "callId", "at", "purpose"::text AS "purpose", "providerName", "model",
      "inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens", "audioMs", "characters",
      "billingProfileId", "projectId", "agentId", "userId", "amountMicros", "currency", "basis"::text AS "basis", "priceRef"
    FROM "UsageCallCost"
    WHERE "at" >= ${from} AND "at" < ${to}
      AND (${profileId}::text IS NULL OR "billingProfileId" = ${profileId})
      AND (${after?.at ?? null}::timestamp IS NULL OR ("at", "callRowId") > (${after?.at ?? null}::timestamp, ${after?.id ?? ''}))
    ORDER BY "at", "callRowId"
    LIMIT ${PAGE}`
}

async function linesOf(rows: CostRow[]): Promise<string> {
  const [projects, agents, people] = await Promise.all([
    namesFor('project', rows.flatMap(r => (r.projectId ? [r.projectId] : [])), rows.map(r => r.billingProfileId)),
    namesFor('agent', rows.flatMap(r => (r.agentId ? [r.agentId] : [])), []),
    namesFor('person', rows.flatMap(r => (r.userId ? [r.userId] : [])), []),
  ])
  const name = (m: Map<string, string>, id: string | null, gone: string) => (id === null ? null : m.get(id) ?? gone)
  return rows.map(r => csvLine([
    r.at.toISOString(), r.callId, r.purpose, projects.profile.get(r.billingProfileId) ?? r.billingProfileId,
    name(projects.key, r.projectId, 'Deleted project'), name(agents.key, r.agentId, 'Deleted agent'), name(people.key, r.userId, 'Former member'),
    r.providerName, r.model, r.inputTokens, r.outputTokens, r.cacheReadTokens, r.cacheWriteTokens, r.audioMs, r.characters,
    r.basis, r.amountMicros === null ? null : microsToDecimal(BigInt(r.amountMicros)), r.currency, r.priceRef,
  ])).join('')
}

export const usageExportHandler: UsageExportApi = async (req, res, context) => {
  if (!context.user) { res.status(401).json({ error: 'Not authenticated' }); return }
  if (!(await isOrgAdmin(context.user.id))) { res.status(403).json({ error: 'Only an organisation admin exports usage' }); return }
  const month = parseMonth(req.query.month)
  if (!month) { res.status(400).json({ error: 'month must be YYYY-MM' }); return }
  const profileId = typeof req.query.profile === 'string' && req.query.profile ? req.query.profile : null

  const org = await prisma.org.findFirst({ select: { timeZone: true } })
  const { from, to } = monthRange(month, org?.timeZone ?? 'UTC')
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="usage-${month}.csv"`)
  res.write(csvLine(CSV_COLUMNS))
  try {
    let after: { at: Date; id: string } | null = null
    for (;;) {
      const rows = await page(from, to, profileId, after)
      if (rows.length === 0) break
      res.write(await linesOf(rows))
      const last = rows[rows.length - 1]
      after = { at: last.at, id: last.callRowId }
      if (rows.length < PAGE) break
    }
    res.end()
  } catch (err) {
    // The header has gone: the connection is cut, so a partial file reads as a failed download, never as complete.
    logger.warn(`Usage export for ${month} failed part way: ${err instanceof Error ? err.message : String(err)}`)
    res.destroy(err instanceof Error ? err : undefined)
  }
}
