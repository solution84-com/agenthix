/**
 * hq's start in demo mode reaches no vendor: the Inworld model list is not read (setup.ts asks
 * `shouldStartInworldModelsRefresh`, as here). The real fetcher stays in place in demo mode, so a read would reach
 * Inworld and fail this test through the provider guard every test runs under (test/noProviderCalls.ts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeProviderStore } from '../../providers/__tests__/fakeProviderStore'
import { useProviderStore } from '../../providers/store'
import { encryptSecret } from '../../server/crypto/secretCrypto'
import { INWORLD_MODELS } from '../../routing/__tests__/inworldFixture'

vi.mock('../../setup/setupDefaults', () => ({ fillEmptyDefaults: async () => {} }))

import { fetchInworldModels, startInworldModelsRefresh, useInworldListFetcher } from '../../routing/inworldModelsRefresh'
import { clearInworldLists } from '../../routing/inworldModelStore'
import { shouldStartArchiveSweep, shouldStartInworldModelsRefresh } from '../seed/decision'

const startAsSetupDoes = (env: Record<string, string>) => {
  if (shouldStartInworldModelsRefresh(env)) startInworldModelsRefresh()
}
const settle = () => new Promise(resolve => setTimeout(resolve, 20))

beforeEach(async () => {
  vi.stubEnv('SECRETS_MASTER_KEY', Buffer.alloc(32, 7).toString('base64'))
  vi.useFakeTimers({ toFake: ['setInterval'] })
  const store = new FakeProviderStore()
  useProviderStore(store)
  await store.create({
    name: 'Inworld', vendor: 'inworld', credentialKind: 'api_key', baseUrl: null, keyHint: 'fake',
    secret: encryptSecret('sk-demo-not-a-key'), state: 'works', stateDetail: null, lastCheckedAt: new Date(), lastWorkedAt: new Date(),
  })
  clearInworldLists()
})
afterEach(() => {
  useProviderStore(null)
  useInworldListFetcher(null)
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe("hq's start in demo mode @SC-1960 @SC-1978", () => {
  it('reads no Inworld model list, so reaches no vendor', async () => {
    const reads: string[] = []
    useInworldListFetcher(key => { reads.push(key); return fetchInworldModels(key) })
    startAsSetupDoes({ DEMO_MODE: 'true' })
    await settle()
    await vi.advanceTimersByTimeAsync(2 * 60 * 60_000)
    expect(reads).toEqual([])
  })

  it('starts no archive sweep of the sample\'s Done tasks', () => {
    expect(shouldStartArchiveSweep({ DEMO_MODE: 'true' })).toBe(false)
    expect(shouldStartArchiveSweep({})).toBe(true)
  })

  it('with the setting off, reads the list as before @SC-1979', async () => {
    const reads: string[] = []
    useInworldListFetcher(async key => { reads.push(key); return { ok: true, models: INWORLD_MODELS } })
    startAsSetupDoes({})
    await settle()
    expect(reads).toEqual(['sk-demo-not-a-key'])
  })
})
