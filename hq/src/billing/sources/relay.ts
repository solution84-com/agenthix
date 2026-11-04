/**
 * An agent's calls through the site relay (part 5, U2): each report the relay sent (`RelayUsageReport`, kept once per
 * call id by `sites/usageReports.ts`) is written to the ledger and marked `ledgeredAt`, as reports arrive and in a
 * periodic sweep. The run's place and billing profile come from what hq kept when it dispatched the run
 * (`RunCosting`); a report whose run hq does not know yet waits a little, in case it arrived before the dispatch was
 * kept, and is then written to the default profile so no cost is lost.
 */
import { prisma } from 'wasp/server'
import { NO_USAGE, type AiProviderCredentialKind, type CostBasis } from '@agenthix/core'
import { Logger } from '../../server/utils/logger'
import { ledger } from '../store'
import type { LedgerCall } from '../types'
import type { RunCostingRow } from './runs'

const logger = new Logger('Ledger')

/** How long a report waits for its run's costing before it goes to the default profile. */
export const WAIT_FOR_RUN_MS = 2 * 60_000
const BATCH = 200

export type RelayReportRow = {
  callId: string; siteId: string; runId: string; providerId: string; model: string; at: Date; receivedAt: Date; hasUsage: boolean
  inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number
}

export type RelayProvider = { name: string; vendor: string; credentialKind: AiProviderCredentialKind }

function basisOf(provider: RelayProvider | null): CostBasis {
  if (provider?.credentialKind === 'subscription') return 'INCLUDED'
  return provider?.vendor === 'cloud' ? 'AWAITING_ACTUAL' : 'ESTIMATED'
}

/**
 * When a call is booked: the time the site gave, kept between when hq dispatched the run (when it is known) and when
 * the report arrived, since the site chooses its own value and a call cannot come before its run or after its report.
 */
export function ledgerTime(r: Pick<RelayReportRow, 'at' | 'receivedAt'>, dispatchedAt?: Date): Date {
  const latest = r.receivedAt.getTime()
  const earliest = dispatchedAt ? dispatchedAt.getTime() : -Infinity
  return new Date(Math.min(latest, Math.max(earliest, r.at.getTime())))
}

/** The costing of a report's run, if the report comes from the site the run was dispatched to; any other is no run's. */
export function costingForReport<C extends { siteId: string }>(r: Pick<RelayReportRow, 'siteId'>, costing: C | undefined): C | null {
  return costing && costing.siteId === r.siteId ? costing : null
}

/** The ledger row for one report. A provider removed since keeps its id, and is priced by nothing. */
export function relayCallRow(r: RelayReportRow, costing: RunCostingRow | null, provider: RelayProvider | null): LedgerCall {
  return {
    callId: r.callId, at: ledgerTime(r, costing?.dispatchedAt), purpose: 'worker', basis: basisOf(provider),
    billingProfileId: costing?.billingProfileId ?? '',
    providerId: r.providerId, providerName: provider?.name ?? 'Removed provider', vendor: provider?.vendor ?? '', model: r.model,
    usage: { ...NO_USAGE, inputTokens: r.inputTokens, outputTokens: r.outputTokens, cacheReadTokens: r.cacheReadTokens, cacheWriteTokens: r.cacheWriteTokens },
    hasUsage: r.hasUsage,
    projectId: costing?.projectId ?? null, agentId: costing?.agentId ?? null, userId: costing?.userId ?? null,
    conversationId: costing?.conversationId ?? null, runId: r.runId,
  }
}

/** Whether the report is written now: its run is known, or it has waited long enough. */
export function readyToLedger(r: Pick<RelayReportRow, 'receivedAt'>, known: boolean, now: Date): boolean {
  return known || now.getTime() - r.receivedAt.getTime() >= WAIT_FOR_RUN_MS
}

let draining: Promise<number> | null = null

/** Writes the reports not yet on the ledger; how many it wrote. One drain at a time in this process. */
export function ledgerRelayReports(now: () => Date = () => new Date()): Promise<number> {
  draining ??= drain(now).finally(() => { draining = null })
  return draining
}

async function drain(now: () => Date): Promise<number> {
  let written = 0
  let after: Date | undefined
  for (;;) {
    const rows = await prisma.relayUsageReport.findMany({
      where: { ledgeredAt: null, ...(after ? { receivedAt: { gt: after } } : {}) }, orderBy: { receivedAt: 'asc' }, take: BATCH,
    })
    if (rows.length === 0) return written
    after = rows[rows.length - 1].receivedAt
    const [costings, providers] = await Promise.all([
      prisma.runCosting.findMany({ where: { runId: { in: [...new Set(rows.map(r => r.runId))] } } }),
      prisma.aiProvider.findMany({ where: { id: { in: [...new Set(rows.map(r => r.providerId))] } }, select: { id: true, name: true, vendor: true, credentialKind: true } }),
    ])
    const costingOf = new Map(costings.map(c => [c.runId, c]))
    const providerOf = new Map(providers.map(p => [p.id, p]))
    for (const r of rows) {
      const costing = costingForReport(r, costingOf.get(r.runId))
      if (!readyToLedger(r, costing !== null, now())) continue
      if (!costing) logger.warn(`Usage of run ${r.runId} (call ${r.callId}) written to the default billing profile: hq kept no costing for the run`)
      if (!r.hasUsage) logger.warn(`Call ${r.callId} of run ${r.runId} carried no usage the relay could read: written unpriced`)
      const row = relayCallRow(r, costing, providerOf.get(r.providerId) ?? null)
      try {
        await prisma.$transaction(async tx => {
          await (await ledger(tx)).writeCall(row)
          await tx.relayUsageReport.update({ where: { callId: r.callId }, data: { ledgeredAt: now() } })
        })
        written++
      } catch (err) {
        logger.warn(`Call ${r.callId} not written to the ledger, tried again later: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    if (rows.length < BATCH) return written
  }
}
