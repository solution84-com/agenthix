/** Waiting for a bundle to land: only the destination's word ends a wait, and only for that transfer. */
import { afterEach, describe, expect, it, vi } from 'vitest'

const relays = vi.hoisted(() => ({ listener: null as null | ((r: { transferId: string; outcome: { done: boolean } }) => void) }))
vi.mock('../../sites/channel', () => ({ siteChannelRegistry: {}, ChannelRequestFailed: class extends Error {} }))
vi.mock('../../relays', () => ({
  bundleRelayFor: vi.fn(async () => 'relay-1'),
  carryBundle: vi.fn(async () => ({ started: true, transferId: 'jti-1' })),
  onBundleReport: vi.fn((l: typeof relays.listener) => { relays.listener = l }),
}))
const asks = vi.hoisted(() => ({ make: { ok: true, result: { made: true, bundleId: 'b', head: 'a'.repeat(40), sha256: 'f'.repeat(64), size: 10 } } as unknown }))
vi.mock('../siteAsk', () => ({ askSite: vi.fn(async (_s: string, method: string) => (method === 'bundle.make' ? asks.make : { dropped: true })) }))

import { __resetBundlesForTests, bundleLanded, carryBundle } from '../bundles'

const ask = {
  source: { kind: 'branch' as const, workspace: { ownerType: 'project' as const, ownerId: 'p', workspaceId: 'w' }, branch: 'b' },
  prerequisites: [], from: { siteId: 'home', executionSiteId: 'H', name: 'home' }, to: { siteId: 'away', executionSiteId: 'A', name: 'away' },
  direction: 'toPreview' as const, personId: 'u', workspaceId: 'w', branch: 'b',
}

afterEach(() => __resetBundlesForTests())

describe('carrying a bundle @SC-1715', () => {
  it('ends when the destination says it landed', async () => {
    const carried = carryBundle(ask, 5000)
    await new Promise(r => setTimeout(r, 10))
    expect(bundleLanded('home', { transferId: 'jti-1', result: { ok: true, sha256: 'f'.repeat(64), size: 10 } })).toBe(false)
    expect(bundleLanded('away', { transferId: 'jti-1', result: { ok: true, sha256: 'f'.repeat(64), size: 10 } })).toBe(true)
    await expect(carried).resolves.toMatchObject({ carried: true, head: 'a'.repeat(40) })
  })

  it('fails at once when the relay reports it could not carry it', async () => {
    const carried = carryBundle(ask, 5000)
    await new Promise(r => setTimeout(r, 10))
    relays.listener!({ transferId: 'jti-1', outcome: { done: false } })
    await expect(carried).rejects.toMatchObject({ statusCode: 502 })
  })

  it('fails when nothing lands in time', async () => {
    await expect(carryBundle(ask, 20)).rejects.toMatchObject({ statusCode: 502 })
  })
})
