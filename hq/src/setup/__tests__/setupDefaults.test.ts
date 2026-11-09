import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { DEFAULT_LISTENING_MODEL, DEFAULT_VOICE, INWORLD_LISTENING_MODEL, VOICE_TTS_MODEL } from '../../voice/voiceModels'
import { encryptSecret } from '../../server/crypto/secretCrypto'
import { useVendorChecks } from '../../providers/checks'
import { useProviderStore } from '../../providers/store'
import { FakeProviderStore } from '../../providers/__tests__/fakeProviderStore'
import { FakeVendorChecks } from '../../providers/__tests__/fakeVendorChecks'
import { defaultModelOf } from '@agenthix/core'
import { clearInworldLists, setInworldList } from '../../routing/inworldModelStore'
import { modelsReachedBy } from '../../routing/modelKeys'
import { INWORLD_MODELS } from '../../routing/__tests__/inworldFixture'
import { firstListedModels, proposeDefaults, recommendedModel, type ProviderFact } from '../setupDefaults'

const p = (id: string, vendor: ProviderFact['vendor'], state: ProviderFact['state'] = 'works'): ProviderFact => ({ id, vendor, state })
const NONE = { conversation: null, stt: null, tts: null }

describe('the one model setup recommends @SC-1186', () => {
  it('is Claude Sonnet 5, to talk and to work, on an Anthropic key', () => {
    expect(recommendedModel('anthropic')).toBe('claude-sonnet-5')
  })

  it('is the latest alias of the same family behind OpenRouter', () => {
    expect(recommendedModel('openrouter')).toMatch(/claude-sonnet-latest$/)
  })

  it('comes from the catalogue by price band for a vendor with no preferred model', () => {
    expect(recommendedModel('openai')).toBeTruthy()
  })

  it('is none for a vendor that reaches no catalogued model', () => {
    expect(recommendedModel('cloud')).toBeNull()
    expect(recommendedModel('assemblyai')).toBeNull()
  })
})

describe('the defaults setup proposes @SC-1186', () => {
  it('are one default model, Inworld TTS 2 speaking as the default voice, and Inworld listening on the same key', () => {
    const got = proposeDefaults([p('a', 'anthropic'), p('s', 'assemblyai'), p('i', 'inworld')], NONE)
    expect(got).toEqual({
      conversation: { providerId: 'a', model: 'claude-sonnet-5' },
      tts: { providerId: 'i', model: VOICE_TTS_MODEL, voice: DEFAULT_VOICE },
      stt: { providerId: 'i', model: INWORLD_LISTENING_MODEL },
    })
  })

  it('listen through AssemblyAI’s default model when Inworld is not there or not working', () => {
    expect(proposeDefaults([p('a', 'anthropic'), p('s', 'assemblyai')], NONE).stt).toEqual({ providerId: 's', model: DEFAULT_LISTENING_MODEL })
    expect(proposeDefaults([p('s', 'assemblyai'), p('i', 'inworld', 'key_refused')], NONE).stt).toEqual({ providerId: 's', model: DEFAULT_LISTENING_MODEL })
  })

  it('leave alone what is already set', () => {
    const set = { providerId: 'a', model: 'claude-haiku-4-5' }
    const got = proposeDefaults([p('a', 'anthropic'), p('s', 'assemblyai'), p('i', 'inworld')], { ...NONE, conversation: set })
    expect(got.conversation).toEqual(set)
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

  it('is the first model the endpoint lists, for the default model', async () => {
    const row = await endpoint()
    vendor.lists(URL, ['qwen3-32b', 'llama-4'])
    const listed = await firstListedModels(await store.list())
    expect(listed.get(row.id)).toBe('qwen3-32b')
    expect(vendor.asked).toEqual([])
    const got = proposeDefaults([p(row.id, 'openai_compatible')], NONE, listed)
    expect(got.conversation).toEqual({ providerId: row.id, model: 'qwen3-32b' })
  })

  it('is left unset when the endpoint lists nothing or is not working', async () => {
    await endpoint()
    expect((await firstListedModels(await store.list())).size).toBe(0)
    const got = proposeDefaults([p('x', 'openai_compatible')], NONE, new Map())
    expect(got.conversation).toBeNull()
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

describe('the default model for an Inworld provider (adr-0184) @SC-1856', () => {
  const iw = (state: ProviderFact['state'] = 'works'): ProviderFact => ({ id: 'iw', vendor: 'inworld', state, types: ['llm', 'stt', 'tts'] })
  beforeEach(() => clearInworldLists())
  afterEach(() => clearInworldLists())

  it('is none while no list is read, and not a model of the catalogue', () => {
    expect(recommendedModel('inworld')).toBeNull()
    expect(proposeDefaults([iw()], NONE).conversation).toBeNull()
  })

  it('is the newest Claude Sonnet in the list, by the version in its name', () => {
    setInworldList('iw', INWORLD_MODELS)
    expect(recommendedModel('inworld')).toBe('anthropic/claude-sonnet-5-5')
    expect(proposeDefaults([iw()], NONE).conversation).toEqual({ providerId: 'iw', model: 'anthropic/claude-sonnet-5-5' })
  })

  it('is not proposed while the flag keeps Inworld from serving models', () => {
    setInworldList('iw', INWORLD_MODELS)
    expect(proposeDefaults([{ ...iw(), types: ['stt', 'tts'] }], NONE).conversation).toBeNull()
  })

  it('falls back to the price band, and says so, when the list holds no Sonnet', () => {
    setInworldList('iw', INWORLD_MODELS.filter(m => !m.id.includes('sonnet')))
    expect(defaultModelOf('inworld', modelsReachedBy('inworld'))).toMatchObject({ fellBack: true })
    expect(recommendedModel('inworld')).toBeTruthy()
  })
})
