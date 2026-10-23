/**
 * The ledger writer (part 5, the eight rules): append-only. Each call is one `CALL` row, kept once per call id by the
 * partial unique index `UsageEntry_call_callId_key`, so a report that arrives twice counts once. Cloud's actual cost
 * and any correction are new rows pointing at their call (`refersTo`); no row is ever changed or deleted. Money is
 * whole millionths in a `bigint`, with its currency.
 */
import { CLOUD_ACTUAL_PRICE_REF, NO_USAGE, isCurrencyCode } from '@agenthix/core'
import { priceCall, type PricingOptions } from './pricing'
import type { LedgerCall, NewUsageEntry, StoredCall } from './types'

export interface LedgerStore {
  /** Inserts a `CALL` row unless its call id has one; whether it was written. */
  insertCall(row: NewUsageEntry): Promise<boolean>
  findCall(callId: string): Promise<StoredCall | null>
  /** Inserts an `ACTUAL` or `CORRECTION` row. */
  append(row: NewUsageEntry): Promise<void>
  /** The default billing profile's id, made from the organisation's name if there is none yet. */
  defaultProfileId(): Promise<string>
  /** Whether an `ACTUAL` row with this amount already points at the call. */
  hasActual(callRowId: string, amountMicros: bigint, currency: string): Promise<boolean>
}

export type Actual = { callId: string; amountMicros: bigint; currency: string; at: Date }
export type Correction = { callId: string; amountMicros: bigint; currency: string; at?: Date }

function requireMoney(amountMicros: bigint, currency: string): void {
  if (typeof amountMicros !== 'bigint') throw new Error('An amount is whole millionths as a bigint')
  if (!isCurrencyCode(currency)) throw new Error(`Not a currency code: ${currency}`)
}

/** A row that points at a call: the call's place and profile, no usage of its own. */
function pointingAt(call: StoredCall, fields: Pick<NewUsageEntry, 'kind' | 'at' | 'amountMicros' | 'currency' | 'basis' | 'priceRef'>): NewUsageEntry {
  const { id, ...from } = call
  return { ...from, ...NO_USAGE, ...fields, refersTo: id }
}

export function createLedger(store: LedgerStore, pricing: PricingOptions) {
  return {
    async writeCall(call: LedgerCall): Promise<boolean> {
      const price = priceCall(call, pricing)
      const billingProfileId = call.billingProfileId || await store.defaultProfileId()
      return store.insertCall({
        at: call.at, kind: 'CALL', callId: call.callId, refersTo: null, purpose: call.purpose,
        providerId: call.providerId, providerName: call.providerName, model: call.model,
        ...call.usage, ...price, billingProfileId,
        projectId: call.projectId ?? null, agentId: call.agentId ?? null, userId: call.userId ?? null,
        conversationId: call.conversationId ?? null, runId: call.runId ?? null, turnId: call.turnId ?? null,
      })
    },

    /** Agenthix Cloud's figure for a call written earlier; false when the call is unknown or the figure is already in. */
    async writeActual(actual: Actual): Promise<boolean> {
      requireMoney(actual.amountMicros, actual.currency)
      const call = await store.findCall(actual.callId)
      if (!call) return false
      if (await store.hasActual(call.id, actual.amountMicros, actual.currency)) return false
      await store.append(pointingAt(call, {
        kind: 'ACTUAL', at: actual.at, amountMicros: actual.amountMicros, currency: actual.currency, basis: 'ACTUAL',
        priceRef: CLOUD_ACTUAL_PRICE_REF,
      }))
      return true
    },

    /** A fix to a call's cost: a new row whose amount is the call's cost from now on. */
    async writeCorrection(correction: Correction): Promise<boolean> {
      requireMoney(correction.amountMicros, correction.currency)
      const call = await store.findCall(correction.callId)
      if (!call) return false
      await store.append(pointingAt(call, {
        kind: 'CORRECTION', at: correction.at ?? new Date(), amountMicros: correction.amountMicros, currency: correction.currency,
        basis: call.basis, priceRef: call.priceRef,
      }))
      return true
    },
  }
}

export type Ledger = ReturnType<typeof createLedger>
