/** An Inworld provider's state, moved by the shapes Inworld answers with (classified as `checks.ts` reads them). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeProviderStore } from './fakeProviderStore'
import { FakeVendorChecks } from './fakeVendorChecks'
import { useProviderStore } from '../store'
import { classify, useVendorChecks } from '../checks'
import { encryptSecret } from '../../server/crypto/secretCrypto'

vi.mock('../notices', () => ({ syncProviderNotices: async () => undefined }))

import { checkProvider, reportOutcome, settled } from '../health'

const KEY = 'inworld-test-key-0000a3f9'
let store: FakeProviderStore
let vendor: FakeVendorChecks

const provider = () => store.create({
  name: 'Inworld', vendor: 'inworld', credentialKind: 'api_key', baseUrl: null, keyHint: 'a3f9', secret: encryptSecret(KEY),
  state: 'works', stateDetail: null, lastCheckedAt: new Date(), lastWorkedAt: new Date(),
})

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-11-10T10:00:00Z'), toFake: ['Date'] })
  vi.stubEnv('SECRETS_MASTER_KEY', Buffer.alloc(32, 7).toString('base64'))
  store = new FakeProviderStore()
  vendor = new FakeVendorChecks()
  useProviderStore(store)
  useVendorChecks(vendor)
})

afterEach(() => {
  useProviderStore(null)
  useVendorChecks(null)
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('an Inworld provider @SC-1852', () => {
  it('is key refused when a call fails on the key and the check says so', async () => {
    const p = await provider()
    vendor.answer(KEY, classify('inworld', 401, { error: { message: 'Invalid API key' } }))
    await reportOutcome(p.id, { ok: false, kind: 'auth' })
    await settled()
    expect(await store.byId(p.id)).toMatchObject({ state: 'key_refused', stateDetail: 'Invalid API key' })
  })

  it('is out of credit when the check says there is none', async () => {
    const p = await provider()
    vendor.answer(KEY, classify('inworld', 402, { error: { message: 'Payment required' } }))
    await checkProvider(p.id)
    expect(await store.byId(p.id)).toMatchObject({ state: 'out_of_credit', stateDetail: 'Payment required' })
  })

  it('stays working under a 429, whether a call or a check met it: a limit is not a bad key', async () => {
    const p = await provider()
    await reportOutcome(p.id, { ok: false, kind: 'rate-limit' })
    await settled()
    expect(vendor.asked).toEqual([])
    vendor.answer(KEY, classify('inworld', 429, { error: { message: 'Rate limit exceeded' } }))
    await checkProvider(p.id)
    expect(await store.byId(p.id)).toMatchObject({ state: 'works', stateDetail: null })
    expect(store.records).toEqual([])
  })

  it('is unreachable after three server errors a minute apart', async () => {
    const p = await provider()
    vendor.answer(KEY, classify('inworld', 503, null))
    await checkProvider(p.id)
    vi.setSystemTime(new Date('2026-11-10T10:01:01Z'))
    await checkProvider(p.id)
    vi.setSystemTime(new Date('2026-11-10T10:02:02Z'))
    await checkProvider(p.id)
    expect((await store.byId(p.id))?.state).toBe('unreachable')
  })
})
