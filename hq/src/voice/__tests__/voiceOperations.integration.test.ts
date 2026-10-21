import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createUser, createUserWithRole } from '../../test/factories'

// SC-089 save a voice provider · SC-090 remove one · SC-091 an agent's voice ·
// SC-206 previewing a voice, open to anyone signed in (adr-0102). Against the real test database; the upstream services (fetch) and the
// voice cache, which calls them, are the only stand-ins.

process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 3).toString('base64')

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})
vi.mock('../voiceCache', () => ({
  getCachedPhrase: vi.fn(async () => 'hello there'),
  getCachedAudio: vi.fn(async () => Buffer.from('audio')),
  getCachedVoices: vi.fn(async () => []),
}))

import { saveVoiceProvider, deleteVoiceProvider } from '../voiceSettingsActions'
import { getVoiceProvider, getVoiceServices, listInworldVoices } from '../voiceSettingsQueries'
import { updateAgentVoice } from '../agentVoiceActions'
import { previewVoice } from '../voicePreviewAction'
import { decryptProviderKey, encryptProviderKey, looksEncrypted } from '../../server/providerService'
import { encryptSecret } from '../../server/crypto/secretCrypto'

const ctx = (user?: { id: string }) =>
  ({ user, entities: { Provider: prisma.provider, UserSettings: prisma.userSettings, Agent: prisma.agent } }) as any

const upstream = vi.fn()
const originalFetch = globalThis.fetch
beforeEach(() => {
  upstream.mockReset().mockResolvedValue({ ok: true, status: 200, statusText: 'OK', text: async () => '' })
  globalThis.fetch = upstream as unknown as typeof fetch
})
afterEach(() => { globalThis.fetch = originalFetch })

const stored = (name: string) => prisma.provider.findFirstOrThrow({ where: { name } })

describe('saveVoiceProvider @SC-089', () => {
  it('checks the key upstream, then stores it encrypted with its config', async () => {
    const admin = await createUserWithRole('ADMIN')

    const saved = await saveVoiceProvider(
      { service: 'stt', name: 'assemblyai', apiKey: ' aai-key ', config: { format_turns: true } },
      ctx(admin),
    )

    const row = await stored('assemblyai')
    expect(saved.id).toBe(row.id)
    expect(row).toMatchObject({ service: 'stt', config: { format_turns: true }, isEnabled: true })
    expect(looksEncrypted(row.apiKey)).toBe(true)
    expect(decryptProviderKey(row.apiKey)).toBe('aai-key')
    expect(upstream).toHaveBeenCalledWith(expect.stringContaining('streaming.assemblyai.com'), { headers: { Authorization: 'aai-key' } })
  })

  it('replaces the key of an existing provider rather than adding a second', async () => {
    const admin = await createUserWithRole('ADMIN')
    await saveVoiceProvider({ service: 'stt', name: 'assemblyai', apiKey: 'old-key' }, ctx(admin))
    await saveVoiceProvider({ service: 'stt', name: 'assemblyai', apiKey: 'new-key' }, ctx(admin))

    expect(await prisma.provider.count()).toBe(1)
    expect(decryptProviderKey((await stored('assemblyai')).apiKey)).toBe('new-key')
  })

  it('a config-only save (__keep__) changes the config and keeps the stored key', async () => {
    const admin = await createUserWithRole('ADMIN')
    await saveVoiceProvider({ service: 'stt', name: 'assemblyai', apiKey: 'aai-key' }, ctx(admin))
    upstream.mockClear()

    await saveVoiceProvider({ service: 'stt', name: 'assemblyai', apiKey: '__keep__', config: { vad_threshold: 0.6 } }, ctx(admin))

    const row = await stored('assemblyai')
    expect(row.config).toEqual({ vad_threshold: 0.6 })
    expect(decryptProviderKey(row.apiKey)).toBe('aai-key')
    expect(upstream).not.toHaveBeenCalled()
  })

  it('a config-only save for a provider that does not exist is 404', async () => {
    const admin = await createUserWithRole('ADMIN')
    await expect(saveVoiceProvider({ service: 'stt', name: 'assemblyai', apiKey: '__keep__', config: {} }, ctx(admin)))
      .rejects.toMatchObject({ statusCode: 404 })
  })

  it('refuses a key the upstream service rejects, or an empty key (400), storing nothing', async () => {
    const admin = await createUserWithRole('ADMIN')
    upstream.mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized', text: async () => 'bad key' })

    await expect(saveVoiceProvider({ service: 'tts', name: 'inworld', apiKey: 'nope' }, ctx(admin)))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('Inworld rejected the key (401') })
    await expect(saveVoiceProvider({ service: 'tts', name: 'inworld', apiKey: '  ' }, ctx(admin)))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(await prisma.provider.count()).toBe(0)
  })

  it('refuses a caller who is not signed in (401) or not an admin (403)', async () => {
    const operator = await createUserWithRole('MEMBER')
    await expect(saveVoiceProvider({ service: 'stt', name: 'assemblyai', apiKey: 'k' }, ctx())).rejects.toMatchObject({ statusCode: 401 })
    await expect(saveVoiceProvider({ service: 'stt', name: 'assemblyai', apiKey: 'k' }, ctx(operator))).rejects.toMatchObject({ statusCode: 403 })
    expect(await prisma.provider.count()).toBe(0)
  })
})

describe('deleteVoiceProvider @SC-090', () => {
  it('removes the provider named, and only it', async () => {
    const admin = await createUserWithRole('ADMIN')
    await prisma.provider.createMany({
      data: [
        { service: 'stt', name: 'assemblyai', apiKey: encryptProviderKey('a') },
        { service: 'tts', name: 'inworld', apiKey: encryptProviderKey('b') },
      ],
    })

    await deleteVoiceProvider({ service: 'stt', name: 'assemblyai' }, ctx(admin))

    expect((await prisma.provider.findMany()).map((p) => p.name)).toEqual(['inworld'])
  })

  it('refuses a caller who is not signed in (401) or not an admin (403)', async () => {
    const operator = await createUserWithRole('MEMBER')
    await prisma.provider.create({ data: { service: 'stt', name: 'assemblyai', apiKey: encryptProviderKey('a') } })
    await expect(deleteVoiceProvider({ service: 'stt', name: 'assemblyai' }, ctx())).rejects.toMatchObject({ statusCode: 401 })
    await expect(deleteVoiceProvider({ service: 'stt', name: 'assemblyai' }, ctx(operator))).rejects.toMatchObject({ statusCode: 403 })
    expect(await prisma.provider.count()).toBe(1)
  })
})

describe('getVoiceProvider: the provider settings, for whoever may change them', () => {
  it('shows an admin each configured provider with a masked key, and null for one not configured', async () => {
    const admin = await createUserWithRole('ADMIN')
    await prisma.provider.create({ data: { service: 'tts', name: 'inworld', apiKey: encryptProviderKey('sk-inworld-1234') } })

    const result = await getVoiceProvider(undefined, ctx(admin))

    expect(result.assemblyai).toBeNull()
    expect(result.inworld).toMatchObject({ service: 'tts', apiKeyPrefix: '••••1234', isEnabled: true })
  })

  it('isolates a row that will not decrypt: it stays listed, marked unreadable, and its sibling is unaffected', async () => {
    const admin = await createUserWithRole('ADMIN')
    await prisma.provider.createMany({
      data: [
        { service: 'tts', name: 'inworld', apiKey: encryptSecret('sk-inworld-1234') },
        // Three non-empty base64 runs — looks encrypted, is not real ciphertext.
        { service: 'stt', name: 'assemblyai', apiKey: 'aGVsbG8=.d29ybGQ=.Zm9vYmFy' },
      ],
    })

    const result = await getVoiceProvider(undefined, ctx(admin))

    expect(result.inworld?.apiKeyPrefix).toBe('••••1234')
    expect(result.assemblyai).toMatchObject({ isEnabled: true, apiKeyPrefix: expect.stringContaining('SECRETS_MASTER_KEY') })
  })

  it('refuses a member (403), a person with no settings row (403) and a caller not signed in (401)', async () => {
    const member = await createUserWithRole('MEMBER')
    const noRow = await createUser()
    await prisma.provider.create({ data: { service: 'tts', name: 'inworld', apiKey: encryptProviderKey('sk-inworld-1234') } })
    await expect(getVoiceProvider(undefined, ctx(member))).rejects.toMatchObject({ statusCode: 403 })
    await expect(getVoiceProvider(undefined, ctx(noRow))).rejects.toMatchObject({ statusCode: 403 })
    await expect(getVoiceProvider(undefined, ctx())).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('getVoiceServices: which speech services are set up, for any member', () => {
  it('names each enabled service by its provider, as a value, with nothing else about it', async () => {
    const member = await createUserWithRole('MEMBER')
    await prisma.provider.createMany({
      data: [
        { service: 'stt', name: 'assemblyai', apiKey: encryptProviderKey('aai-key'), config: { format_turns: true } },
        { service: 'tts', name: 'inworld', apiKey: encryptProviderKey('sk-inworld-1234'), isEnabled: false },
      ],
    })

    expect(await getVoiceServices(undefined, ctx(member))).toEqual({ speechToText: { provider: 'assemblyai' }, textToSpeech: null })
  })

  it('answers a person with no settings row, and refuses a caller not signed in (401)', async () => {
    const noRow = await createUser()
    await prisma.provider.create({ data: { service: 'tts', name: 'inworld', apiKey: encryptProviderKey('k') } })
    expect(await getVoiceServices(undefined, ctx(noRow))).toEqual({ speechToText: null, textToSpeech: { provider: 'inworld' } })
    await expect(getVoiceServices(undefined, ctx())).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('listInworldVoices', () => {
  it('needs an active Inworld provider (404) and a signed-in caller (401)', async () => {
    const viewer = await createUserWithRole('MEMBER')
    await prisma.provider.create({ data: { service: 'tts', name: 'inworld', apiKey: encryptProviderKey('k'), isEnabled: false } })
    await expect(listInworldVoices(undefined, ctx(viewer))).rejects.toMatchObject({ statusCode: 404 })
    await expect(listInworldVoices(undefined, ctx())).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('updateAgentVoice @SC-091', () => {
  it("sets the agent's voice, leaving fields not passed alone", async () => {
    const admin = await createUserWithRole('ADMIN')
    const agent = await createAgent({ voiceId: 'Old', voiceTtsModel: 'm1' })

    await updateAgentVoice({ agentId: agent.id, voiceEnabled: true, voiceId: 'Ashley' }, ctx(admin))

    expect(await prisma.agent.findUniqueOrThrow({ where: { id: agent.id } }))
      .toMatchObject({ voiceEnabled: true, voiceId: 'Ashley', voiceTtsModel: 'm1' })
  })

  it('answers 404 for an agent that does not exist', async () => {
    const admin = await createUserWithRole('ADMIN')
    await expect(updateAgentVoice({ agentId: 'missing', voiceEnabled: true }, ctx(admin))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('refuses a caller who is not signed in (401) or not an admin (403), changing nothing', async () => {
    const operator = await createUserWithRole('MEMBER')
    const agent = await createAgent()
    await expect(updateAgentVoice({ agentId: agent.id, voiceEnabled: true }, ctx())).rejects.toMatchObject({ statusCode: 401 })
    await expect(updateAgentVoice({ agentId: agent.id, voiceEnabled: true }, ctx(operator))).rejects.toMatchObject({ statusCode: 403 })
    expect((await prisma.agent.findUniqueOrThrow({ where: { id: agent.id } })).voiceEnabled).toBe(false)
  })
})

describe('previewVoice @SC-206', () => {
  it('answers 404 with a clear message when no active TTS provider exists', async () => {
    const operator = await createUserWithRole('MEMBER')
    await expect(previewVoice({ voiceId: 'v', description: 'd' }, ctx(operator)))
      .rejects.toMatchObject({ statusCode: 404, message: 'No active voice provider configured' })
  })

  it('answers base64 audio and the phrase when a provider is configured', async () => {
    const operator = await createUserWithRole('MEMBER')
    await prisma.provider.create({ data: { service: 'tts', name: 'inworld', apiKey: encryptProviderKey('k ') } })

    const result = await previewVoice({ voiceId: 'v', description: 'd' }, ctx(operator))

    expect(result).toEqual({ phrase: 'hello there', audio: Buffer.from('audio').toString('base64') })
  })

  it('refuses a caller who is not signed in (401)', async () => {
    await expect(previewVoice({ voiceId: 'v', description: 'd' }, ctx())).rejects.toMatchObject({ statusCode: 401 })
  })

  // No organisation role withholds voice (adr-0102): a person with no settings row previews too.
  it('previews for a person with no settings row', async () => {
    await prisma.provider.create({ data: { service: 'tts', name: 'inworld', apiKey: encryptProviderKey('k') } })
    const result = await previewVoice({ voiceId: 'v', description: 'd' }, ctx(await createUser()))
    expect(result).toEqual({ phrase: 'hello there', audio: Buffer.from('audio').toString('base64') })
  })
})
