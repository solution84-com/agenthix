/** Inworld as a vendor hq may call and hand to a run: only while its language-model flag is on. */
import { withFeature } from '@agenthix/core/testing'
import { describe, expect, it, vi } from 'vitest'
import { isFeatureOn } from '@agenthix/core'

const db = vi.hoisted(() => ({ row: null as Record<string, unknown> | null }))
vi.mock('wasp/server', () => ({ prisma: { aiProvider: { findUnique: async () => db.row } } }))
vi.mock('../../features/switches', () => ({
  featureFacts: async () => ({ env: process.env, switches: {} }),
  isOrgFeatureOn: async (flag: Parameters<typeof isFeatureOn>[0]) => isFeatureOn(flag, { env: process.env, switches: {} }),
}))
vi.mock('../../providers/store', () => ({
  providerStore: () => ({ credentialOf: async () => ({ key: 'inworld-test-key', baseUrl: null }) }),
}))
vi.mock('../../server/crypto/secretCrypto', () => ({ decryptStoredSecret: () => null }))
vi.mock('../../sites/subscriptionGrants', () => ({ grantSubscription: async () => null }))

import { hqCallAccess, runProviderDescriptor } from '../reaching'

const resolution = { model: { providerId: 'p1', model: 'anthropic/claude-sonnet-5-5' }, vendor: 'inworld' as const, providerName: 'Inworld' }
const row = { id: 'p1', vendor: 'inworld', credentialKind: 'api_key', baseUrl: null, secret: 'x', ownerUserId: null, termsAcceptedAt: null }

describe('Inworld with its flag off @SC-1851', () => {
  it('is not a vendor hq calls, and a run is not given it', async () => {
    db.row = row
    expect(await hqCallAccess(resolution)).toBeNull()
    expect(await runProviderDescriptor('p1')).toBeNull()
  })
})

withFeature('inworldLanguageModels', () => {
  describe('Inworld with its flag on @SC-1851', () => {
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
})
