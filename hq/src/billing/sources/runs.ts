/**
 * An agent's runs on the ledger (part 5, U2 and U3). When hq dispatches a run it keeps what the run is costed to
 * (`RunCosting`): the run's place, its billing profile and its own provider, decided with the resolution. The relay's
 * usage reports name only the run, so they are written to that place (relay.ts). A run on a person's own Claude
 * subscription is not relayed: when it ends, one *included* row is written from the run's own report, the tokens its
 * session added, with the run's id as its call id.
 */
import { prisma } from 'wasp/server'
import { NO_USAGE, type RunDispatchPayload, type RunStatusEvent } from '@agenthix/core'
import { Logger } from '../../server/utils/logger'
import { ledger } from '../store'
import type { LedgerCall } from '../types'

const logger = new Logger('Ledger')

type SessionTotals = { totalInputTokens: number; totalOutputTokens: number; totalCacheReadTokens: number; totalCacheWriteTokens: number }

export type RunCostingRow = {
  runId: string; siteId: string; sessionId: string; agentId: string; userId: string | null; projectId: string | null
  conversationId: string | null; billingProfileId: string; providerId: string | null; model: string | null; subscription: boolean
  baseInputTokens: number; baseOutputTokens: number; baseCacheReadTokens: number; baseCacheWriteTokens: number
  /** Read from the database; a row just made by `runCostingOf` has none yet. */
  dispatchedAt?: Date
}

/** What a dispatched run is costed to, from what it was sent and hq's copy of its session. */
export function runCostingOf(
  siteId: string, runId: string, payload: RunDispatchPayload,
  session: (SessionTotals & { conversationId: string | null }) | null,
): RunCostingRow {
  const access = payload.context.modelAccess
  const seed = payload.session
  const projectId = payload.context.task?.projectId ?? (seed.primaryOwnerType === 'project' ? seed.primaryOwnerId : null)
  return {
    runId, siteId, sessionId: seed.id, agentId: seed.agentId,
    userId: payload.onBehalfOfUserId ?? seed.userId ?? null,
    projectId: projectId ?? null,
    conversationId: session?.conversationId ?? null,
    billingProfileId: access?.billingProfileId ?? '',
    providerId: access?.model.providerId ?? null,
    model: access?.model.model ?? null,
    subscription: access?.provider.kind === 'subscription',
    baseInputTokens: session?.totalInputTokens ?? 0,
    baseOutputTokens: session?.totalOutputTokens ?? 0,
    baseCacheReadTokens: session?.totalCacheReadTokens ?? 0,
    baseCacheWriteTokens: session?.totalCacheWriteTokens ?? 0,
  }
}

/** Kept once per run; a cost that cannot be kept is logged and never stops the run. */
export async function recordRunCosting(siteId: string, runId: string, payload: RunDispatchPayload): Promise<void> {
  try {
    const session = await prisma.agentSession.findUnique({
      where: { id: payload.session.id },
      select: { conversationId: true, totalInputTokens: true, totalOutputTokens: true, totalCacheReadTokens: true, totalCacheWriteTokens: true },
    })
    const row = runCostingOf(siteId, runId, payload, session)
    await prisma.runCosting.createMany({ data: [row], skipDuplicates: true })
  } catch (err) {
    logger.warn(`What run ${runId} is costed to was not kept: ${err instanceof Error ? err.message : String(err)}`)
  }
}

const TERMINAL = new Set<RunStatusEvent['status']>(['COMPLETED', 'FAILED', 'CANCELLED'])

/** A subscription run's one row, from its ending frame's session totals less those it began with. */
export function subscriptionRunRow(costing: RunCostingRow, e: RunStatusEvent, providerName: string, at: Date): LedgerCall | null {
  if (!costing.subscription || !TERMINAL.has(e.status) || !costing.providerId) return null
  const p = e.sessionPatch
  const added = (total: number | undefined, base: number) => Math.max(0, (total ?? base) - base)
  return {
    callId: costing.runId, at, purpose: 'worker', basis: 'INCLUDED', billingProfileId: costing.billingProfileId,
    providerId: costing.providerId, providerName, vendor: 'anthropic', model: costing.model ?? '',
    usage: {
      ...NO_USAGE,
      inputTokens: added(p?.totalInputTokens, costing.baseInputTokens),
      outputTokens: added(p?.totalOutputTokens, costing.baseOutputTokens),
      cacheReadTokens: added(p?.totalCacheReadTokens, costing.baseCacheReadTokens),
      cacheWriteTokens: added(p?.totalCacheWriteTokens, costing.baseCacheWriteTokens),
    },
    projectId: costing.projectId, agentId: costing.agentId, userId: costing.userId, conversationId: costing.conversationId, runId: costing.runId,
  }
}

/** The run-status listener: a frame sent again finds the row already written (one per call id). */
export async function ledgerSubscriptionRun(e: RunStatusEvent, siteId: string): Promise<void> {
  if (!TERMINAL.has(e.status)) return
  const costing = await prisma.runCosting.findUnique({ where: { runId: e.runId } })
  if (!costing || !costing.subscription || costing.siteId !== siteId) return
  const provider = costing.providerId
    ? await prisma.aiProvider.findUnique({ where: { id: costing.providerId }, select: { name: true } })
    : null
  const row = subscriptionRunRow(costing, e, provider?.name ?? 'Claude subscription', new Date())
  if (row) await (await ledger()).writeCall(row)
}
