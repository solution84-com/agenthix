/** `provider add|list|remove` on hq's control socket: the actor *machine*, and no key in any answer. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeProviderStore } from './fakeProviderStore'
import { FakeVendorChecks } from './fakeVendorChecks'
import { useProviderStore } from '../store'
import { useVendorChecks } from '../checks'

vi.mock('../notices', () => ({ announceProviderChange: async () => {}, syncProviderNotices: async () => {} }))
vi.mock('../../features/switches', async () => (await import('../../test/switchesWithoutDatabase')).switchesWithoutDatabase())
vi.mock('../../setup/setupDefaults', () => ({ fillEmptyDefaults: async () => {} }))

import { providerCommand, supplyCloudAfterConnect } from '../machineCommands'
import { withFeature } from '@agenthix/core/testing'

const KEY = 'sk-test-fake-0000000000a3f9'
let store: FakeProviderStore

beforeEach(() => {
  vi.stubEnv('SECRETS_MASTER_KEY', Buffer.alloc(32, 7).toString('base64'))
  vi.stubEnv('HQ_RUN_BY_CLOUD', '')
  store = new FakeProviderStore()
  useProviderStore(store)
  useVendorChecks(new FakeVendorChecks())
})

afterEach(() => {
  useProviderStore(null)
  useVendorChecks(null)
  vi.unstubAllEnvs()
})

describe('provider command @SC-1180', () => {
  it('adds as the machine, and neither the answer nor the list carries the key', async () => {
    const added = await providerCommand(['add', 'anthropic', KEY])
    expect(added).toMatchObject({ ok: true, text: 'Added Anthropic (key ending …a3f9). Every organisation admin has been told.' })
    expect(store.records[0]).toMatchObject({ action: 'added', actor: 'machine', byUserId: null })
    const listed = await providerCommand(['list'])
    expect(listed.ok && listed.text).toContain('Anthropic (anthropic)  LLM  works  key ending …a3f9')
    expect(JSON.stringify([added, listed])).not.toContain(KEY.slice(0, -4))
  })

  it('adds a custom endpoint with its name and address', async () => {
    const added = await providerCommand(['add', 'openai_compatible', '', 'Lab server', 'http://lab.example.test/v1'])
    expect(added).toMatchObject({ ok: true, data: { provider: { name: 'Lab server', baseUrl: 'http://lab.example.test/v1', keyHint: null } } })
  })

  it('removes by vendor, the last provider of a type too, and says so for one there is not', async () => {
    await providerCommand(['add', 'anthropic', KEY])
    await providerCommand(['add', 'openai', KEY])
    expect(await providerCommand(['remove', 'openai'])).toMatchObject({ ok: true })
    expect(await providerCommand(['remove', 'anthropic'])).toMatchObject({ ok: true })
    expect(await providerCommand(['remove', 'inworld'])).toMatchObject({ ok: false, code: 'not_found' })
  })

  it('answers its usage for anything else', async () => {
    expect(await providerCommand(['add', 'nobody', KEY])).toMatchObject({ ok: false, code: 'usage' })
    expect(await providerCommand(['rotate'])).toMatchObject({ ok: false, code: 'usage' })
  })
})

describe('supplyCloudAfterConnect while Agenthix Cloud is off (adr-0189) @SC-2123', () => {
  it('adds nothing, even on a machine Cloud runs, and never fails the connect', async () => {
    vi.stubEnv('HQ_RUN_BY_CLOUD', 'true')
    await supplyCloudAfterConnect()
    expect(await store.list()).toEqual([])
  })
})

withFeature('cloud', () => {
  describe('supplyCloudAfterConnect @SC-1179 @SC-1172', () => {
    it("adds Agenthix Cloud with the actor Cloud's controller, on a machine Cloud runs only", async () => {
      await supplyCloudAfterConnect()
      expect(await store.list()).toEqual([])
      vi.stubEnv('HQ_RUN_BY_CLOUD', 'true')
      await supplyCloudAfterConnect()
      expect((await store.list()).map(p => [p.vendor, p.state])).toEqual([['cloud', 'not_available']])
      expect(store.records[0]).toMatchObject({ actor: 'cloud_controller' })
    })
  })
})
