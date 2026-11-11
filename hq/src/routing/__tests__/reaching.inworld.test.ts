/** Inworld as a vendor hq may call and hand to a run, with no switch. */
import { describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ row: null as Record<string, unknown> | null }))
vi.mock('wasp/server', () => ({ prisma: { aiProvider: { findUnique: async () => db.row } } }))
vi.mock('../../providers/store', () => ({
  providerStore: () => ({ credentialOf: async () => ({ key: 'inworld-test-key', baseUrl: null }) }),
}))
vi.mock('../../server/crypto/secretCrypto', () => ({ decryptStoredSecret: () => null }))
vi.mock('../../sites/subscriptionGrants', () => ({ grantSubscription: async () => null }))

import { hqCallAccess, runProviderDescriptor } from '../reaching'

const resolution = { model: { providerId: 'p1', model: 'anthropic/claude-sonnet-5-5' }, vendor: 'inworld' as const, providerName: 'Inworld' }
const row = { id: 'p1', vendor: 'inworld', credentialKind: 'api_key', baseUrl: null, secret: 'x', ownerUserId: null, termsAcceptedAt: null }

describe('Inworld as a model provider @SC-1851', () => {
  it('is called by hq as the vendor, with the model id as given', async () => {
    expect(await hqCallAccess(resolution)).toEqual({
      providerId: 'p1', providerName: 'Inworld', provider: 'inworld', model: 'anthropic/claude-sonnet-5-5', apiKey: 'inworld-test-key',
    })
  })

  it('gives a run its descriptor with the vendor and the key', async () => {
    db.row = row
    expect(await runProviderDescriptor('p1')).toEqual({ kind: 'api_key', providerId: 'p1', vendor: 'inworld', apiKey: 'inworld-test-key' })
  })

  it('still never hands a run a person-owned provider or a vendor hq does not call', async () => {
    db.row = { ...row, ownerUserId: 'u1' }
    expect(await runProviderDescriptor('p1')).toBeNull()
    expect(await hqCallAccess({ ...resolution, vendor: 'assemblyai' })).toBeNull()
  })
})
