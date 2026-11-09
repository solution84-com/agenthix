/** Reading and keeping Inworld's model list: the last good list survives a failed read, the flag empties it, a removed provider's goes. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseInworldModels } from '@agenthix/core'
import { FakeProviderStore } from '../../providers/__tests__/fakeProviderStore'
import { useProviderStore } from '../../providers/store'
import { encryptSecret } from '../../server/crypto/secretCrypto'
import { INWORLD_BODY, INWORLD_MODELS } from './inworldFixture'

const flag = vi.hoisted(() => ({ on: true }))
const filled = vi.hoisted(() => ({ times: 0 }))
vi.mock('../../features/switches', () => ({ isOrgFeatureOn: async () => flag.on }))
vi.mock('../../setup/setupDefaults', () => ({ fillEmptyDefaults: async () => { filled.times += 1 } }))

import { clearInworldLists, inworldListOf, inworldListState } from '../inworldModelStore'
import {
  refreshAllInworldModels, refreshInworldModels, useInworldListFetcher, fetchInworldModels, retryInworldModels, refreshMissingInBackground,
  INWORLD_RETRY_MS, MAX_LIST_BYTES,
} from '../inworldModelsRefresh'
import { modelsReachedBy } from '../modelKeys'

let store: FakeProviderStore
let seen: string[]
let next: Awaited<ReturnType<typeof fetchInworldModels>>

const add = (vendor: 'inworld' | 'anthropic') => store.create({
  name: vendor, vendor, credentialKind: 'api_key', baseUrl: null, keyHint: 'fake', secret: encryptSecret(`key-for-${vendor}`),
  state: 'works', stateDetail: null, lastCheckedAt: new Date(), lastWorkedAt: new Date(),
})

beforeEach(() => {
  vi.stubEnv('SECRETS_MASTER_KEY', Buffer.alloc(32, 7).toString('base64'))
  store = new FakeProviderStore()
  useProviderStore(store)
  flag.on = true
  filled.times = 0
  seen = []
  next = { ok: true, models: INWORLD_MODELS }
  useInworldListFetcher(async key => { seen.push(key); return next })
  clearInworldLists()
})
afterEach(() => {
  useProviderStore(null)
  useInworldListFetcher(null)
  clearInworldLists()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('reading the list @SC-1853', () => {
  it('reads it with the provider\'s key and holds it per provider', async () => {
    const row = await add('inworld')
    expect(inworldListState(row.id)).toBe('not_read_yet')
    expect(await refreshInworldModels(row.id)).toBe(true)
    expect(seen).toEqual(['key-for-inworld'])
    expect(inworldListOf(row.id)?.models).toHaveLength(INWORLD_MODELS.length)
    expect(modelsReachedBy('inworld').length).toBe(INWORLD_MODELS.length)
  })

  it('keeps the last good list when a read fails, and says nothing is reached when there was none', async () => {
    const row = await add('inworld')
    next = { ok: false, detail: 'Inworld could not be reached.' }
    expect(await refreshInworldModels(row.id)).toBe(false)
    expect(modelsReachedBy('inworld')).toEqual([])
    next = { ok: true, models: INWORLD_MODELS }
    await refreshInworldModels(row.id)
    next = { ok: false, detail: 'Inworld answered 403.' }
    expect(await refreshInworldModels(row.id)).toBe(false)
    expect(modelsReachedBy('inworld').length).toBe(INWORLD_MODELS.length)
  })

  it('reads nothing for a provider that is not Inworld', async () => {
    const row = await add('anthropic')
    expect(await refreshInworldModels(row.id)).toBe(false)
    expect(seen).toEqual([])
  })

  it('holds nothing, and drops what it held, while the flag is off', async () => {
    const row = await add('inworld')
    await refreshInworldModels(row.id)
    flag.on = false
    expect(await refreshInworldModels(row.id)).toBe(false)
    expect(modelsReachedBy('inworld')).toEqual([])
    flag.on = true
    await refreshAllInworldModels()
    flag.on = false
    await refreshAllInworldModels()
    expect(inworldListOf(row.id)).toBeNull()
  })

  it('reads only the missing lists when asked, and drops a removed provider\'s', async () => {
    const row = await add('inworld')
    await refreshAllInworldModels(true)
    await refreshAllInworldModels(true)
    expect(seen).toHaveLength(1)
    await store.remove(row.id)
    await refreshAllInworldModels(true)
    expect(inworldListOf(row.id)).toBeNull()
  })
})

describe('reading again and filling defaults @SC-1853', () => {
  it('fills the empty defaults once, after the first list a provider gets, not after a refresh of it', async () => {
    const row = await add('inworld')
    await refreshInworldModels(row.id)
    expect(filled.times).toBe(1)
    await refreshInworldModels(row.id)
    expect(filled.times).toBe(1)
  })

  it('on its minute, reads the lists that are missing and nothing once each has one', async () => {
    await add('inworld')
    await retryInworldModels()
    expect(seen).toHaveLength(1)
    await retryInworldModels()
    expect(seen).toHaveLength(1)
  })

  it('on its minute after a failed read, tries again, and reads every list when the flag has just turned on', async () => {
    flag.on = false
    const row = await add('inworld')
    await retryInworldModels()
    expect(seen).toEqual([])
    flag.on = true
    next = { ok: false, detail: 'Inworld could not be reached.' }
    await retryInworldModels()
    expect(seen).toHaveLength(1)
    await retryInworldModels()
    expect(seen).toHaveLength(2)
    next = { ok: true, models: INWORLD_MODELS }
    await retryInworldModels()
    expect(inworldListOf(row.id)).not.toBeNull()
    expect(filled.times).toBe(1)
  })

  it('a query starts the read without waiting for it, and does not call Inworld again within a minute of a failure', async () => {
    await add('inworld')
    let release: () => void = () => {}
    useInworldListFetcher(async key => { seen.push(key); await new Promise<void>(r => { release = r }); return { ok: false, detail: 'x' } })
    const t = 10_000_000
    refreshMissingInBackground(t)
    await vi.waitFor(() => expect(seen).toHaveLength(1))
    release()
    await vi.waitFor(() => expect(release).toBeTruthy())
    await new Promise(r => setTimeout(r, 10))
    refreshMissingInBackground(t + 1000)
    await new Promise(r => setTimeout(r, 10))
    expect(seen).toHaveLength(1)
    useInworldListFetcher(async key => { seen.push(key); return next })
    refreshMissingInBackground(t + INWORLD_RETRY_MS + 1)
    await vi.waitFor(() => expect(seen).toHaveLength(2))
  })
})

describe('the fetch @SC-1853', () => {
  it('does not read an answer over the size cap, declared or streamed', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 200, headers: { 'content-length': String(MAX_LIST_BYTES + 1) } }))
    expect(await fetchInworldModels('k')).toMatchObject({ ok: false, detail: expect.stringContaining('too large') })
    const chunk = new Uint8Array(1024 * 1024).fill(32)
    let pulled = 0
    vi.stubGlobal('fetch', async () => new Response(new ReadableStream({
      pull(c) { pulled += 1; c.enqueue(chunk); if (pulled > 20) c.close() },
    }), { status: 200 }))
    expect(await fetchInworldModels('k')).toMatchObject({ ok: false, detail: expect.stringContaining('too large') })
    expect(pulled).toBeLessThan(10)
  })

  it('asks the one address with a Bearer key and reads the answer defensively', async () => {
    const calls: Array<{ url: string; auth: string }> = []
    vi.stubGlobal('fetch', async (url: string, init: { headers: Record<string, string> }) => {
      calls.push({ url, auth: init.headers.Authorization })
      return new Response(JSON.stringify(INWORLD_BODY), { status: 200 })
    })
    const got = await fetchInworldModels('k-1')
    expect(calls).toEqual([{ url: 'https://api.inworld.ai/llm/v1alpha/models', auth: 'Bearer k-1' }])
    expect(got).toEqual({ ok: true, models: parseInworldModels(INWORLD_BODY) })
  })

  it('fails on a refused key, an answer that is not a list, and an unreachable service', async () => {
    vi.stubGlobal('fetch', async () => new Response('{"code":7,"message":"Invalid authorization credentials"}', { status: 403 }))
    expect(await fetchInworldModels('bad')).toMatchObject({ ok: false })
    vi.stubGlobal('fetch', async () => new Response('<html>', { status: 200 }))
    expect(await fetchInworldModels('k')).toMatchObject({ ok: false })
    vi.stubGlobal('fetch', async () => { throw new Error('down') })
    expect(await fetchInworldModels('k')).toMatchObject({ ok: false })
  })
})
