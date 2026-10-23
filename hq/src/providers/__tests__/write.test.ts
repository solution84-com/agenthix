/**
 * The provider store's one write module (models from one place, part 1): its three actors and no other, the vendor's
 * check before anything is stored, the refusals, a record and an announcement for every write, and no key in any
 * answer. Against an in-memory store; `store.integration.test.ts` covers the database.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProviderActor } from '@agenthix/core'
import { FakeProviderStore } from './fakeProviderStore'
import { FakeVendorChecks } from './fakeVendorChecks'
import { useProviderStore } from '../store'
import { useVendorChecks } from '../checks'

const told = vi.hoisted(() => ({ announced: [] as Array<{ action: string; lines: string[]; by: string }>, synced: 0 }))
vi.mock('../notices', () => ({
  announceProviderChange: async (c: { action: string; lines: string[]; by: string }) => { told.announced.push(c) },
  syncProviderNotices: async () => { told.synced++ },
}))

import {
  ProviderRefusal, addProvider, removeProvider, renameProvider, replaceProviderKey, revokeProvider, supplyCloudProvider,
} from '../write'

const KEY = 'sk-test-fake-0000000000a3f9'
const ADMIN: ProviderActor = { kind: 'organisation_admin', userId: 'admin-1' }
const MACHINE: ProviderActor = { kind: 'machine' }

let store: FakeProviderStore
let vendor: FakeVendorChecks

beforeEach(() => {
  vi.stubEnv('SECRETS_MASTER_KEY', Buffer.alloc(32, 7).toString('base64'))
  vi.stubEnv('HQ_RUN_BY_CLOUD', '')
  store = new FakeProviderStore()
  vendor = new FakeVendorChecks()
  useProviderStore(store)
  useVendorChecks(vendor)
  told.announced.length = 0
  told.synced = 0
})

afterEach(() => {
  useProviderStore(null)
  useVendorChecks(null)
  vi.unstubAllEnvs()
})

const refusal = async (p: Promise<unknown>) => {
  const err = await p.then(() => null, e => e)
  expect(err).toBeInstanceOf(ProviderRefusal)
  return err as ProviderRefusal
}

async function threeProviders() {
  const llm = (await addProvider(ADMIN, { vendor: 'anthropic', key: KEY })).provider
  const stt = (await addProvider(ADMIN, { vendor: 'assemblyai', key: 'aai-test-fake-000011' })).provider
  const tts = (await addProvider(ADMIN, { vendor: 'inworld', key: 'iw-test-fake-000022' })).provider
  told.announced.length = 0
  store.records.length = 0
  return { llm, stt, tts }
}

describe('actors', () => {
  it('an organisation admin, the machine and, on a machine Cloud runs, its controller may write', async () => {
    await addProvider(ADMIN, { vendor: 'anthropic', key: KEY })
    await addProvider(MACHINE, { vendor: 'openai', key: KEY })
    vi.stubEnv('HQ_RUN_BY_CLOUD', 'true')
    await supplyCloudProvider({ kind: 'cloud_controller' })
    expect((await store.list()).map(p => p.vendor)).toEqual(['anthropic', 'openai', 'cloud'])
    expect(store.records.map(r => [r.action, r.actor, r.byUserId])).toEqual([
      ['added', 'organisation_admin', 'admin-1'], ['added', 'machine', null], ['added', 'cloud_controller', null],
    ])
  })

  it('refuses someone who is not, or no longer, an organisation admin, and stores nothing', async () => {
    const r = await refusal(addProvider({ kind: 'organisation_admin', userId: 'member-1' }, { vendor: 'anthropic', key: KEY }))
    expect(r.code).toBe('not_allowed')
    expect(await store.list()).toEqual([])
    expect(vendor.asked).toEqual([])
  })

  it("refuses Cloud's controller on a machine Cloud does not run, and for anything but Agenthix Cloud", async () => {
    expect((await refusal(supplyCloudProvider({ kind: 'cloud_controller' }))).code).toBe('not_allowed')
    vi.stubEnv('HQ_RUN_BY_CLOUD', 'true')
    expect((await refusal(addProvider({ kind: 'cloud_controller' }, { vendor: 'anthropic', key: KEY }))).code).toBe('not_allowed')
  })

  it('refuses any other actor', async () => {
    const forged = { kind: 'hq' } as unknown as ProviderActor
    expect((await refusal(addProvider(forged, { vendor: 'anthropic', key: KEY }))).code).toBe('not_allowed')
    expect((await refusal(supplyCloudProvider(forged))).code).toBe('not_allowed')
  })
})

describe('add', () => {
  it("checks the key with the vendor first, and stores nothing when it is refused, saying the vendor's words", async () => {
    vendor.answer(KEY, { ok: false, kind: 'auth', detail: `invalid x-api-key ${KEY}` })
    const r = await refusal(addProvider(ADMIN, { vendor: 'anthropic', key: KEY }))
    expect(r.code).toBe('refused_by_vendor')
    expect(r.message).toContain('Anthropic refused this key: invalid x-api-key')
    expect(r.message).not.toContain(KEY)
    expect(await store.list()).toEqual([])
    expect(told.announced).toEqual([])
  })

  it('stores the key encrypted, keeps only its last four characters in the clear, and answers no key', async () => {
    const answer = await addProvider(ADMIN, { vendor: 'anthropic', key: KEY, name: ' Anthropic (main) ' })
    expect(JSON.stringify(answer)).not.toContain(KEY.slice(0, -4))
    expect(answer.provider).toMatchObject({ name: 'Anthropic (main)', keyHint: 'a3f9', state: 'works' })
    const secret = store.secretOf(answer.provider.id)
    expect(secret).not.toBeNull()
    expect(secret).not.toContain(KEY)
    expect(JSON.stringify(await store.list())).not.toContain(KEY.slice(0, -4))
    expect(await store.credentialOf(answer.provider.id)).toEqual({ key: KEY, baseUrl: null })
  })

  it('refuses a second provider of the same vendor', async () => {
    await addProvider(ADMIN, { vendor: 'anthropic', key: KEY })
    expect((await refusal(addProvider(ADMIN, { vendor: 'anthropic', key: KEY }))).code).toBe('conflict')
  })

  it('needs a key, except for a custom endpoint, which needs its address', async () => {
    expect((await refusal(addProvider(ADMIN, { vendor: 'openai', key: '' }))).code).toBe('usage')
    expect((await refusal(addProvider(ADMIN, { vendor: 'openai_compatible', key: '' }))).code).toBe('usage')
    expect((await refusal(addProvider(ADMIN, { vendor: 'openai', key: KEY, baseUrl: 'https://x.test' }))).code).toBe('usage')
    const local = await addProvider(ADMIN, { vendor: 'openai_compatible', key: '', baseUrl: 'http://llm.internal.test:8080/v1' })
    expect(local.provider).toMatchObject({ baseUrl: 'http://llm.internal.test:8080/v1', keyHint: null })
  })

  it("is announced to every organisation admin, with a custom endpoint's address", async () => {
    await addProvider(MACHINE, { vendor: 'openai_compatible', key: KEY, baseUrl: 'https://llm.example.test/v1' })
    expect(told.announced).toHaveLength(1)
    expect(told.announced[0]).toMatchObject({ action: 'added' })
    expect(told.announced[0].lines.join(' ')).toContain('https://llm.example.test/v1')
  })

  it('Agenthix Cloud is added with no key, and reads not available yet', async () => {
    vi.stubEnv('HQ_RUN_BY_CLOUD', 'true')
    const { provider } = await supplyCloudProvider({ kind: 'cloud_controller' })
    expect(provider).toMatchObject({ vendor: 'cloud', keyHint: null, state: 'not_available' })
    expect(store.secretOf(provider.id)).toBeNull()
    expect((await supplyCloudProvider({ kind: 'cloud_controller' })).provider.id).toBe(provider.id)
    expect(store.records).toHaveLength(1)
  })
})

describe('replace a key', () => {
  it('checks the new key before the old one is dropped; refused, nothing changes', async () => {
    const { llm } = await threeProviders()
    const next = 'sk-test-fake-1111111111b4c5'
    vendor.answer(next, { ok: false, kind: 'auth', detail: 'invalid x-api-key' })
    expect((await refusal(replaceProviderKey(ADMIN, { id: llm.id, key: next }))).code).toBe('refused_by_vendor')
    expect((await store.credentialOf(llm.id))?.key).toBe(KEY)
  })

  it('takes the new key, makes it work again, and changes nothing else', async () => {
    const { llm } = await threeProviders()
    await store.update(llm.id, { state: 'key_refused', stateDetail: 'invalid x-api-key' })
    const next = 'sk-test-fake-1111111111b4c5'
    const { provider } = await replaceProviderKey(ADMIN, { id: llm.id, key: next })
    expect(provider).toMatchObject({ id: llm.id, name: llm.name, keyHint: 'b4c5', state: 'works', stateDetail: null })
    expect(JSON.stringify(provider)).not.toContain(next.slice(0, -4))
    expect((await store.credentialOf(llm.id))?.key).toBe(next)
    expect(store.records.map(r => r.action)).toEqual(['key_replaced'])
    expect(told.announced.map(a => a.action)).toEqual(['key_replaced'])
  })

  it('Agenthix Cloud has no key to replace', async () => {
    vi.stubEnv('HQ_RUN_BY_CLOUD', 'true')
    const { provider } = await supplyCloudProvider({ kind: 'cloud_controller' })
    expect((await refusal(replaceProviderKey(ADMIN, { id: provider.id, key: KEY }))).code).toBe('usage')
  })
})

describe('rename', () => {
  it('renames, recorded with the old and new names', async () => {
    const { llm } = await threeProviders()
    await renameProvider(ADMIN, { id: llm.id, name: 'Anthropic, research' })
    expect((await store.byId(llm.id))?.name).toBe('Anthropic, research')
    expect(store.records[0]).toMatchObject({ action: 'renamed', providerName: 'Anthropic, research' })
    expect(store.records[0].detail).toContain('Anthropic')
  })

  it('refuses an empty name and one too long', async () => {
    const { llm } = await threeProviders()
    expect((await refusal(renameProvider(ADMIN, { id: llm.id, name: '  ' }))).code).toBe('usage')
    expect((await refusal(renameProvider(ADMIN, { id: llm.id, name: 'x'.repeat(81) }))).code).toBe('usage')
  })
})

describe('remove and revoke', () => {
  it('a removal that would leave no provider of a type is refused; a revoke never is', async () => {
    const { stt } = await threeProviders()
    const r = await refusal(removeProvider(ADMIN, { id: stt.id }))
    expect(r.code).toBe('last_of_type')
    expect(await store.byId(stt.id)).not.toBeNull()
    const revoked = await revokeProvider(ADMIN, { id: stt.id })
    expect(await store.byId(stt.id)).toBeNull()
    expect(revoked.impact.goesDown).toEqual(['stt'])
    expect(store.records.map(r => r.action)).toEqual(['revoked'])
  })

  it('before setup is finished, removing is not refused', async () => {
    const { stt } = await threeProviders()
    store.finished = false
    await removeProvider(ADMIN, { id: stt.id })
    expect(await store.byId(stt.id)).toBeNull()
  })

  it('says what falls to what, records it and tells every organisation admin', async () => {
    const { llm } = await threeProviders()
    const openai = (await addProvider(ADMIN, { vendor: 'openai', key: KEY })).provider
    told.announced.length = 0
    store.uses.set(llm.id, { defaults: ['worker'], agents: [{ id: 'k', name: 'Kernel' }] })
    const { impact } = await removeProvider(ADMIN, { id: llm.id })
    expect(impact.defaults).toEqual([{ slot: 'worker', to: { id: openai.id, name: 'OpenAI' } }])
    expect(impact.agents).toEqual([{ id: 'k', name: 'Kernel' }])
    expect(impact.goesDown).toEqual([])
    expect(told.announced[0].action).toBe('removed')
    expect(told.announced[0].lines.join(' ')).toContain('via OpenAI')
    expect(store.records.at(-1)).toMatchObject({ action: 'removed', actor: 'organisation_admin' })
    expect(told.synced).toBeGreaterThan(0)
  })

  it('an unknown provider is not found', async () => {
    expect((await refusal(removeProvider(ADMIN, { id: 'nope' }))).code).toBe('not_found')
  })
})
