/**
 * The ledger's own shapes in hq (models from one place, part 5, *The ledger*). core's `billing/ledger.ts` holds the
 * enumerations and the arithmetic; these are what hq's sources hand the writer, and what the writer stores.
 */
import type { CallUsage, CostBasis, UsageEntryKind, UsagePurpose } from '@agenthix/core'

/** Where a call came from, as plain ids: none cascades, so deleting anything never deletes cost. */
export type CallPlace = {
  projectId?: string | null
  agentId?: string | null
  userId?: string | null
  conversationId?: string | null
  runId?: string | null
  turnId?: string | null
}

/**
 * Who a call's cost belongs to and on what basis, fixed when the call was resolved (part 4): it travels with the call
 * to whatever writes its row.
 */
export type CallCosting = CallPlace & {
  purpose: UsagePurpose
  /** The resolver's basis: `INCLUDED` for a subscription, `AWAITING_ACTUAL` through Cloud, else priced or unpriced. */
  basis: CostBasis
  /** Empty while no default profile exists yet; the writer then uses the default it makes. */
  billingProfileId: string
}

/** One call, as a source reports it to the writer. */
export type LedgerCall = CallCosting & {
  callId: string
  /** When the call ended. */
  at: Date
  providerId: string
  providerName: string
  /** The provider's vendor, which names the price list's row. */
  vendor: string
  model: string
  usage: CallUsage
  /** False when the answer carried no usage that could be read: written unpriced. */
  hasUsage?: boolean
}

/** A row as it is inserted. `amountMicros` is whole millionths of `currency`, never a floating-point number. */
export type NewUsageEntry = Required<CallPlace> & CallUsage & {
  at: Date
  kind: UsageEntryKind
  callId: string
  refersTo: string | null
  purpose: UsagePurpose
  providerId: string
  providerName: string
  model: string
  amountMicros: bigint | null
  currency: string | null
  basis: CostBasis
  priceRef: string | null
  billingProfileId: string
}

/** A `CALL` row as it is read back, for the rows that point at it. */
export type StoredCall = NewUsageEntry & { id: string }
