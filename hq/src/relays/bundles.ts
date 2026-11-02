/**
 * A Git bundle carried between two sites through a relay (live preview spec section 5, *On another site*; adr-0169):
 * hq signs a bundle ticket naming both ends, the bundle and its SHA-256 and size, and orders the relay both sites hold
 * their lines to to carry it (`relay.bundle`). hq carries none of the bytes. The relay reports only what the sites
 * cannot (`relay.bundleReport`); the destination reports what it kept itself (`bundle.landed`, on its channel).
 */
import {
  RELAY_BUNDLE_FAILURES, RELAY_PROTOCOL_VERSION, type BundleTicketInput, type RelayBundleFailure, type RelayBundleOrder, type RelayBundleReport,
} from '@agenthix/core'

export type BundleCarryDeps = {
  sign(input: BundleTicketInput): Promise<{ token: string; jti: string }>
  /** Sends the order on the relay's link; false when hq holds no link to it now. */
  send(relayId: string, order: RelayBundleOrder): boolean
}

/** `started`: the relay has the order; its report and the destination's `bundle.landed` carry the transfer's end. */
export type BundleCarryResult = { started: true; transferId: string } | { started: false; reason: 'relay-offline' }

export function createBundleCarrier(deps: BundleCarryDeps) {
  return async function carryBundle(input: BundleTicketInput): Promise<BundleCarryResult> {
    const { token, jti } = await deps.sign(input)
    const order: RelayBundleOrder = {
      type: 'relay.bundle', version: RELAY_PROTOCOL_VERSION, transferId: jti, ticket: token, from: input.from.site, to: input.to.site,
    }
    return deps.send(input.relay, order) ? { started: true, transferId: jti } : { started: false, reason: 'relay-offline' }
  }
}

const text = (v: unknown, max = 512): v is string => typeof v === 'string' && v.length > 0 && v.length <= max

/** A `relay.bundleReport` read field by field; null for anything else. */
export function readBundleReport(f: Record<string, unknown>): RelayBundleReport | null {
  if (f.type !== 'relay.bundleReport' || !text(f.version, 32) || !text(f.transferId, 128)) return null
  const o = f.outcome
  if (typeof o !== 'object' || o === null || Array.isArray(o)) return null
  const out = o as Record<string, unknown>
  if (out.done === true) return { type: 'relay.bundleReport', version: f.version, transferId: f.transferId, outcome: { done: true } }
  if (out.done !== false || !(RELAY_BUNDLE_FAILURES as readonly unknown[]).includes(out.failure)) return null
  if (out.site !== undefined && !text(out.site, 128)) return null
  if (out.refusal !== undefined && !text(out.refusal, 64)) return null
  return {
    type: 'relay.bundleReport', version: f.version, transferId: f.transferId,
    outcome: {
      done: false, failure: out.failure as RelayBundleFailure,
      ...(out.site === undefined ? {} : { site: out.site as string }),
      ...(out.refusal === undefined ? {} : { refusal: out.refusal as string }),
    },
  }
}
