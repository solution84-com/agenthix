import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { DEFAULT_LISTENING_MODEL, DEFAULT_VOICE, VOICE_TTS_MODEL } from '../../voice/voiceModels'
import { encryptSecret } from '../../server/crypto/secretCrypto'
import { useVendorChecks } from '../../providers/checks'
import { useProviderStore } from '../../providers/store'
import { FakeProviderStore } from '../../providers/__tests__/fakeProviderStore'
import { FakeVendorChecks } from '../../providers/__tests__/fakeVendorChecks'
import { firstListedModels, proposeDefaults, recommendedModels, type ProviderFact } from '../setupDefaults'

const p = (id: string, vendor: ProviderFact['vendor'], state: ProviderFact['state'] = 'works'): ProviderFact => ({ id, vendor, state })
const NONE = { conversation: null, worker: null, stt: null, tts: null }

describe('the models setup recommends @SC-1186', () => {
  it('are Claude Sonnet 5 to talk and Claude Opus 5 for work on an Anthropic key', () => {
    expect(recommendedModels('anthropic')).toEqual({ conversation: 'claude-sonnet-5', worker: 'claude-opus-5' })
  })

  it('are found by the same name behind OpenRouter', () => {
    const r = recommendedModels('openrouter')
    expect(r.conversation).toMatch(/claude-sonnet-5$/)
    expect(r.worker).toMatch(/claude-opus-5$/)
  })

  it('come from the catalogue by price band for a vendor with no preferred model', () => {
    const r = recommendedModels('openai')
    expect(r.conversation).toBeTruthy()
    expect(r.worker).toBeTruthy()
  })

  it('are none for a vendor that reaches no catalogued model', () => {
    expect(recommendedModels('cloud')).toEqual({ conversation: null, worker: null })
    expect(recommendedModels('assemblyai')).toEqual({ conversation: null, worker: null })
  })
})

describe('the defaults setup proposes @SC-1186', () => {
  it('are the recommended models, Inworld TTS 2 speaking as the default voice, and the default listening model', () => {
    const got = proposeDefaults([p('a', 'anthropic'), p('s', 'assemblyai'), p('i', 'inworld')], NONE)
    expect(got.conversation).toEqual({ providerId: 'a', model: 'claude-sonnet-5' })
    expect(got.worker).toEqual({ providerId: 'a', model: 'claude-opus-5' })
    expect(got.tts).toEqual({ providerId: 'i', model: VOICE_TTS_MODEL, voice: DEFAULT_VOICE })
    expect(got.stt).toEqual({ providerId: 's', model: DEFAULT_LISTENING_MODEL })
  })

  it('leave alone what is already set', () => {
    const set = { providerId: 'a', model: 'claude-haiku-4-5' }
    const got = proposeDefaults([p('a', 'anthropic'), p('s', 'assemblyai'), p('i', 'inworld')], { ...NONE, conversation: set })
    expect(got.conversation).toEqual(set)
    expect(got.worker).toEqual({ providerId: 'a', model: 'claude-opus-5' })
  })

  it('skip a provider that is not working', () => {
    const got = proposeDefaults([p('a', 'anthropic', 'key_refused'), p('b', 'anthropic'), p('i', 'inworld', 'key_refused')], NONE)
    expect(got.conversation?.providerId).toBe('b')
    expect(got.tts).toBeNull()
  })

  it('put every default on Agenthix Cloud when it is the only provider, models left to Cloud’s own catalogue', () => {
    const got = proposeDefaults([p('c', 'cloud')], NONE)
    expect(got.conversation).toBeNull()
    expect(got.tts).toEqual({ providerId: 'c', model: VOICE_TTS_MODEL, voice: DEFAULT_VOICE })
    expect(got.stt).toEqual({ providerId: 'c', model: DEFAULT_LISTENING_MODEL })
  })
})

describe('the defaults setup proposes for an own OpenAI-compatible endpoint', () => {
  const URL = 'https://llm.example.test/v1'
  let store: FakeProviderStore
  let vendor: FakeVendorChecks

  beforeEach(() => {
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
  })

  const endpoint = (state: ProviderFact['state'] = 'works') => store.create({
    name: 'Own', vendor: 'openai_compatible', credentialKind: 'api_key', baseUrl: URL, keyHint: 'fake', secret: encryptSecret('sk-test-fake'),
    state, stateDetail: null, lastCheckedAt: new Date(), lastWorkedAt: new Date(),
  })

  it('is the first model the endpoint lists, for both conversation and worker', async () => {
    const row = await endpoint()
    vendor.lists(URL, ['qwen3-32b', 'llama-4'])
    const listed = await firstListedModels(await store.list())
    expect(listed.get(row.id)).toBe('qwen3-32b')
    expect(vendor.asked).toEqual([])
    const got = proposeDefaults([p(row.id, 'openai_compatible')], NONE, listed)
    expect(got.conversation).toEqual({ providerId: row.id, model: 'qwen3-32b' })
    expect(got.worker).toEqual({ providerId: row.id, model: 'qwen3-32b' })
  })

  it('is left unset when the endpoint lists nothing or is not working', async () => {
    await endpoint()
    expect((await firstListedModels(await store.list())).size).toBe(0)
    const got = proposeDefaults([p('x', 'openai_compatible')], NONE, new Map())
    expect(got.conversation).toBeNull()
    expect(got.worker).toBeNull()
  })

  it('does not ask an endpoint that is not working', async () => {
    await endpoint('key_refused')
    vendor.lists(URL, ['qwen3-32b'])
    expect((await firstListedModels(await store.list())).size).toBe(0)
  })

  it('keeps a recommended model over a listed one', () => {
    const got = proposeDefaults([p('a', 'anthropic')], NONE, new Map([['a', 'other']]))
    expect(got.conversation?.model).toBe('claude-sonnet-5')
  })
})
