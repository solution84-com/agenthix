/**
 * hq's own calls (part 5, U1): the conversation's turns, titles, summaries and the voice sample phrase. One row per
 * model call, from the AI SDK's usage for each step (`onStepFinish`), with a call id hq makes for it. A call whose
 * access carries no costing (a test's) writes nothing.
 */
import { randomUUID } from 'node:crypto'
import { NO_USAGE, type UsagePurpose } from '@agenthix/core'
import type { ResolvedAccess, TurnUsage } from '../../conversations/contract'
import { Logger } from '../../server/utils/logger'
import { ledger } from '../store'
import type { CallCosting, LedgerCall } from '../types'

const logger = new Logger('Ledger')

/** The row for one step of a call on this access. Null when the access is not costed. */
export function hqCallRow(access: ResolvedAccess, usage: TurnUsage, at: Date, callId: string = randomUUID()): LedgerCall | null {
  const costing = access.costing
  if (!costing) return null
  return {
    ...costing, callId, at,
    providerId: access.providerId, providerName: access.providerName, vendor: access.provider, model: access.model,
    usage: { ...NO_USAGE, ...usage },
  }
}

/** Writes the step's row in the background: a ledger that cannot be written is logged and never fails the call. */
export function recordHqCall(access: ResolvedAccess, usage: TurnUsage): void {
  const row = hqCallRow(access, usage, new Date())
  if (!row) return
  void ledger().then(l => l.writeCall(row)).catch(err => logger.warn(`A call's ledger row was not written: ${err instanceof Error ? err.message : String(err)}`))
}

/** The same access, its calls costed for another purpose: a title or a summary on the turn's own access. */
export function costedFor(access: ResolvedAccess, purpose: UsagePurpose): ResolvedAccess {
  if (!access.costing) return access
  const { turnId: _turn, ...rest } = access.costing
  return { ...access, costing: { ...rest, purpose } }
}

/** The same access, its calls costed to a turn. */
export function costedToTurn(access: ResolvedAccess, turnId: string): ResolvedAccess {
  return access.costing ? { ...access, costing: { ...access.costing, turnId } } : access
}

export type { CallCosting }
