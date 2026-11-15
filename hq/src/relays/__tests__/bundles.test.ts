/** A bundle carried through a relay: hq signs the ticket and orders the relay; it reads the relay's report field by field. */
import { withFeature } from '@agenthix/core/testing'
import { describe, it, expect } from 'vitest'
import { RELAY_PROTOCOL_VERSION, type RelayBundleOrder } from '@agenthix/core'
import { createBundleCarrier, readBundleReport } from '../bundles'

const input = {
  relay: 'relay-1', person: 'u1', bundleId: 'b1', direction: 'toPreview' as const, workspaceId: 'w1', branch: 'add-login',
  from: { site: 'site-a' }, to: { site: 'site-b' }, sha256: 'c'.repeat(64), size: 12,
}

withFeature('livePreview', () => {
describe('carrying a bundle @SC-1715', () => {
  it('orders the relay with the ticket, between the two sites it names', async () => {
    const sent: Array<[string, RelayBundleOrder]> = []
    const carry = createBundleCarrier({ sign: async () => ({ token: 'tok', jti: 'jti-1' }), send: (r, o) => { sent.push([r, o]); return true } })
    expect(await carry(input)).toEqual({ started: true, transferId: 'jti-1' })
    expect(sent).toEqual([['relay-1', { type: 'relay.bundle', version: RELAY_PROTOCOL_VERSION, transferId: 'jti-1', ticket: 'tok', from: 'site-a', to: 'site-b' }]])
  })

  it('says so when hq holds no link to the relay', async () => {
    const carry = createBundleCarrier({ sign: async () => ({ token: 'tok', jti: 'jti-1' }), send: () => false })
    expect(await carry(input)).toEqual({ started: false, reason: 'relay-offline' })
  })

  it('reads a report it can, and nothing else', () => {
    const base = { type: 'relay.bundleReport', version: '1.0', transferId: 't1' }
    expect(readBundleReport({ ...base, outcome: { done: true } })).toEqual({ ...base, outcome: { done: true } })
    expect(readBundleReport({ ...base, outcome: { done: false, failure: 'source-refused', site: 'site-a', refusal: 'not-found' } }))
      .toMatchObject({ outcome: { done: false, failure: 'source-refused', site: 'site-a', refusal: 'not-found' } })
    expect(readBundleReport({ ...base, outcome: { done: false, failure: 'made-up' } })).toBeNull()
    expect(readBundleReport({ ...base, transferId: '' , outcome: { done: true } })).toBeNull()
    expect(readBundleReport({ ...base, outcome: null })).toBeNull()
  })
})
})
