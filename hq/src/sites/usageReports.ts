/**
 * An Execution Site's usage reports (models from one place, part 5, *How each source reports usage*): the site's model
 * relay reports each upstream call of an agent's run, with the vendor's usage and the upstream status, over
 * `POST HQ_USAGE_REPORT_PATH` with the site's machine credential.
 *
 * Each report is kept once per call id in `RelayUsageReport`, which the ledger reads to write the call's
 * `UsageEntry`; hq answers the call ids it now holds, including those it already had, so the site can forget them. A
 * report hq cannot read is left out of the answer and logged. A report seen for the first time also feeds the
 * provider's health (`providers/health.ts`), so an agent's failing calls move a provider's state as hq's own do.
 */
import type { UsageReportApi } from 'wasp/server/api'
import { prisma } from 'wasp/server'
import { USAGE_REPORT_BATCH_MAX, parseUsageReport, type UsageReport, type UsageReportAcknowledged } from '@agenthix/core'
import { reportOutcome } from '../providers/health'
import { Logger } from '../server/utils/logger'
import { authenticateSite } from './registrationService'

const logger = new Logger('UsageReports')

export type UsageReportDeps = {
  /** The call ids of these that are already kept. */
  known: (callIds: string[]) => Promise<string[]>
  keep: (siteId: string, reports: UsageReport[]) => Promise<void>
  outcome: typeof reportOutcome
}

const realDeps: UsageReportDeps = {
  known: async callIds => (await prisma.relayUsageReport.findMany({ where: { callId: { in: callIds } }, select: { callId: true } })).map(r => r.callId),
  keep: async (siteId, reports) => {
    await prisma.relayUsageReport.createMany({
      skipDuplicates: true,
      data: reports.map(r => ({
        callId: r.callId, siteId, runId: r.runId, providerId: r.providerId, model: r.model, at: new Date(r.at),
        hasUsage: r.usage !== null, ...(r.usage ?? {}), upstreamStatus: r.upstreamStatus, errorKind: r.errorKind ?? null,
      })),
    })
  },
  outcome: reportOutcome,
}

/** What a call came to, for the provider's health. */
function healthOutcome(r: UsageReport): Parameters<typeof reportOutcome>[1] {
  if (r.errorKind) return { ok: false, kind: r.errorKind, detail: `Upstream status ${r.upstreamStatus}` }
  return { ok: true }
}

/** Keeps a site's reports and answers the call ids now held. */
export async function keepUsageReports(siteId: string, reports: UsageReport[], deps: UsageReportDeps = realDeps): Promise<string[]> {
  const unique = [...new Map(reports.map(r => [r.callId, r])).values()]
  if (unique.length === 0) return []
  const known = new Set(await deps.known(unique.map(r => r.callId)))
  const fresh = unique.filter(r => !known.has(r.callId))
  if (fresh.length) await deps.keep(siteId, fresh)
  for (const r of fresh) {
    void deps.outcome(r.providerId, healthOutcome(r))
      .catch(err => logger.warn(`Could not record a call's outcome: ${err instanceof Error ? err.message : String(err)}`))
  }
  return unique.map(r => r.callId)
}

export const usageReportHandler: UsageReportApi = async (req, res) => {
  const auth = req.headers.authorization
  const siteId = req.headers['x-site-id']
  if (!auth?.startsWith('Bearer ') || typeof siteId !== 'string' || !siteId) {
    res.status(401).json({ error: 'unauthorized' }); return
  }
  const site = await authenticateSite(siteId, auth.slice('Bearer '.length))
  if (!site) { res.status(401).json({ error: 'unauthorized' }); return }

  const body = (req.body ?? {}) as { reports?: unknown }
  if (!Array.isArray(body.reports) || body.reports.length > USAGE_REPORT_BATCH_MAX) {
    res.status(400).json({ error: `reports must be a list of at most ${USAGE_REPORT_BATCH_MAX}` }); return
  }
  const reports: UsageReport[] = []
  for (const raw of body.reports) {
    const report = parseUsageReport(raw)
    if (report) reports.push(report)
  }
  const refused = body.reports.length - reports.length
  if (refused > 0) logger.warn(`${refused} usage report(s) from site ${siteId} could not be read and were left out`)
  try {
    const acknowledged = await keepUsageReports(siteId, reports)
    res.json({ acknowledged } satisfies UsageReportAcknowledged)
  } catch (err) {
    logger.warn(`Usage reports from site ${siteId} not kept: ${err instanceof Error ? err.message : String(err)}`)
    res.status(503).json({ error: 'Usage reports could not be kept; send them again' })
  }
}
