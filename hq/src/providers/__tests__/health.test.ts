/**
 * `health.ts` moves a provider's state from what calls and checks say (part 1, S1–S5, F1–F3), records each change
 * with the actor hq, and keeps organisation admins' notices in step. Against an in-memory store and a fake vendor.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeProviderStore } from './fakeProviderStore'
import { FakeVendorChecks } from './fakeVendorChecks'
import { useProviderStore } from '../store'
import { useVendorChecks } from '../checks'
import { encryptSecret } from '../../server/crypto/secretCrypto'

const told = vi.hoisted(() => ({ synced: 0 }))
vi.mock('../notices', () => ({ syncProviderNotices: async () => { told.synced++ } }))

import { checkProvider, checkDueProviders, reportOutcome, setCloudProviderState, settled } from '../health'

const KEY = 'sk-test-fake-0000000000a3f9'
let store: FakeProviderStore
let vendor: FakeVendorChecks

async function provider(vendorName: 'anthropic' | 'cloud' = 'anthropic', state: 'works' | 'not_available' = 'works') {
  return store.create({
    name: vendorName === 'cloud' ? 'Agenthix Cloud' : 'Anthropic', vendor: vendorName, credentialKind: vendorName === 'cloud' ? 'none' : 'api_key',
    baseUrl: null, keyHint: vendorName === 'cloud' ? null : 'a3f9', secret: vendorName === 'cloud' ? null : encryptSecret(KEY),
    state, stateDetail: null, lastCheckedAt: new Date(), lastWorkedAt: new Date(),
  })
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-10-23T10:00:00Z'), toFake: ['Date'] })
  vi.stubEnv('SECRETS_MASTER_KEY', Buffer.alloc(32, 7).toString('base64'))
  store = new FakeProviderStore()
  vendor = new FakeVendorChecks()
  useProviderStore(store)
  useVendorChecks(vendor)
  told.synced = 0
})

afterEach(() => {
  useProviderStore(null)
  useVendorChecks(null)
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('reportOutcome @SC-1176', () => {
  it('an auth failure on a call is checked at once; confirmed, the key is refused, recorded, and admins are told', async () => {
    const p = await provider()
    vendor.answer(KEY, { ok: false, kind: 'auth', detail: `invalid x-api-key ${KEY}` })
    await reportOutcome(p.id, { ok: false, kind: 'auth', detail: 'authentication_error' })
    await settled()
    const after = await store.byId(p.id)
    expect(after).toMatchObject({ state: 'key_refused' })
    expect(after?.stateDetail).toContain('invalid x-api-key')
    expect(after?.stateDetail).not.toContain(KEY)
    expect(vendor.asked).toHaveLength(1)
    expect(store.records).toEqual([expect.objectContaining({ providerId: p.id, action: 'state_changed', actor: 'hq', byUserId: null })])
    expect(told.synced).toBeGreaterThan(0)
  })

  it('an auth failure the check does not confirm changes nothing', async () => {
    const p = await provider()
    await reportOutcome(p.id, { ok: false, kind: 'auth' })
    await settled()
    expect((await store.byId(p.id))?.state).toBe('works')
    expect(store.records).toEqual([])
  })

  it('one server error changes nothing; three, a minute apart, make it unreachable', async () => {
    const p = await provider()
    vendor.answer(KEY, { ok: false, kind: 'unavailable', detail: 'Overloaded' })
    await reportOutcome(p.id, { ok: false, kind: 'unavailable' })
    await settled()
    expect((await store.byId(p.id))?.state).toBe('works')
    vi.setSystemTime(new Date('2026-10-23T10:01:01Z'))
    await checkProvider(p.id)
    vi.setSystemTime(new Date('2026-10-23T10:02:02Z'))
    await checkProvider(p.id)
    expect(await store.byId(p.id)).toMatchObject({ state: 'unreachable', stateDetail: 'Overloaded' })
  })

  it('a rate limit is not a state, and asks for no check', async () => {
    const p = await provider()
    await reportOutcome(p.id, { ok: false, kind: 'rate-limit' })
    await settled()
    expect(vendor.asked).toEqual([])
    expect((await store.byId(p.id))?.state).toBe('works')
  })

  it('a success makes it work again, with the vendor message cleared', async () => {
    const p = await provider()
    await store.update(p.id, { state: 'out_of_credit', stateDetail: 'credit balance too low' })
    await reportOutcome(p.id, { ok: true })
    expect(await store.byId(p.id)).toMatchObject({ state: 'works', stateDetail: null })
    expect(store.records.map(r => r.detail)).toEqual(['Out of credit → works'])
  })

  it('an outcome for a provider that is gone is ignored', async () => {
    await expect(reportOutcome('gone', { ok: false, kind: 'auth' })).resolves.toBeUndefined()
  })
})

describe('checks @SC-1176', () => {
  it('checks what is due: hourly while it works, every five minutes while not, and never Agenthix Cloud', async () => {
    const working = await provider()
    const cloud = await provider('cloud', 'not_available')
    await store.update(working.id, { lastCheckedAt: new Date('2026-10-23T09:00:00Z') })
    expect(await checkDueProviders()).toBe(1)
    expect(vendor.asked.map(a => a.vendor)).toEqual(['anthropic'])
    expect((await store.byId(working.id))?.lastCheckedAt?.toISOString()).toBe('2026-10-23T10:00:00.000Z')
    expect(await checkDueProviders()).toBe(0)
    expect((await store.byId(cloud.id))?.state).toBe('not_available')
  })
})

describe("Agenthix Cloud's state @SC-1176", () => {
  it('is set from its answers, recorded, and only for Cloud', async () => {
    const cloud = await provider('cloud', 'not_available')
    await setCloudProviderState('disconnected', 'The connection was ended on Agenthix Cloud.')
    expect(await store.byId(cloud.id)).toMatchObject({ state: 'disconnected' })
    expect(store.records.at(-1)).toMatchObject({ action: 'state_changed', actor: 'hq' })
  })
})
