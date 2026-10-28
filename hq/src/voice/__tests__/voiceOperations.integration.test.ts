import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createUser, createUserWithRole } from '../../test/factories'

// SC-091 an agent's voice · SC-206 previewing a voice, open to anyone signed in (adr-0102). Against the real test database; the upstream services (fetch) and the
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

import { getCachedVoices } from '../voiceCache'
import { getVoiceServices, listInworldVoices } from '../voiceSettingsQueries'
import { previewVoice } from '../voicePreviewAction'
import { setUpVoiceProviders } from '../../conversations/voice/__tests__/voiceFixtures'

const ctx = (user?: { id: string }) =>
  ({ user, entities: { Provider: prisma.provider, UserSettings: prisma.userSettings, Agent: prisma.agent } }) as any

const upstream = vi.fn()
const originalFetch = globalThis.fetch
beforeEach(() => {
  upstream.mockReset().mockResolvedValue({ ok: true, status: 200, statusText: 'OK', text: async () => '' })
  globalThis.fetch = upstream as unknown as typeof fetch
})
afterEach(() => { globalThis.fetch = originalFetch })

describe('getVoiceServices: which speech services work, for any member @SC-1205', () => {
  it('names each working service by its provider, as a value, with nothing else about it', async () => {
    const member = await createUserWithRole('MEMBER')
    const { tts } = await setUpVoiceProviders()
    await prisma.aiProvider.update({ where: { id: tts!.id }, data: { state: 'key_refused' } })

    expect(await getVoiceServices(undefined, ctx(member))).toEqual({ speechToText: { provider: 'assemblyai' }, textToSpeech: null })
  })

  it('answers a person with no settings row, and refuses a caller not signed in (401)', async () => {
    const noRow = await createUser()
    await setUpVoiceProviders()
    expect(await getVoiceServices(undefined, ctx(noRow))).toEqual({ speechToText: { provider: 'assemblyai' }, textToSpeech: { provider: 'inworld' } })
    await expect(getVoiceServices(undefined, ctx())).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('listInworldVoices @SC-1206', () => {
  it('needs a working text to speech provider (503) and a signed-in caller (401)', async () => {
    const viewer = await createUserWithRole('MEMBER')
    await expect(listInworldVoices({ providerId: 'p' }, ctx(viewer))).rejects.toMatchObject({ statusCode: 503 })
    await expect(listInworldVoices({ providerId: 'p' }, ctx())).rejects.toMatchObject({ statusCode: 401 })
  })

  it('lists the voices of the provider named, with its key', async () => {
    const viewer = await createUserWithRole('MEMBER')
    const { tts } = await setUpVoiceProviders()
    expect(await listInworldVoices({ providerId: tts!.id }, ctx(viewer))).toEqual([])
    expect(getCachedVoices).toHaveBeenCalledWith(tts!.id, expect.any(String))
  })

  it('refuses a provider that is not a text to speech provider (503)', async () => {
    const viewer = await createUserWithRole('MEMBER')
    const { stt } = await setUpVoiceProviders()
    await expect(listInworldVoices({ providerId: stt!.id }, ctx(viewer))).rejects.toMatchObject({ statusCode: 503 })
  })
})

describe('previewVoice @SC-206 @SC-1206', () => {
  it('answers 503 saying voice is not set up when no text to speech provider was added', async () => {
    const operator = await createUserWithRole('MEMBER')
    await expect(previewVoice({ providerId: 'p', voiceId: 'v', description: 'd' }, ctx(operator)))
      .rejects.toMatchObject({ statusCode: 503, message: "Voice isn't set up: no text to speech provider has been added. An organisation admin can add one." })
  })

  it('answers base64 audio and the phrase when a provider works', async () => {
    const operator = await createUserWithRole('MEMBER')
    const { tts } = await setUpVoiceProviders()

    const result = await previewVoice({ providerId: tts!.id, voiceId: 'v', description: 'd' }, ctx(operator))

    expect(result).toEqual({ phrase: 'hello there', audio: Buffer.from('audio').toString('base64') })
  })

  it('refuses a caller who is not signed in (401)', async () => {
    await expect(previewVoice({ providerId: 'p', voiceId: 'v', description: 'd' }, ctx())).rejects.toMatchObject({ statusCode: 401 })
  })

  // No organisation role withholds voice (adr-0102): a person with no settings row previews too.
  it('previews for a person with no settings row', async () => {
    const { tts } = await setUpVoiceProviders()
    const result = await previewVoice({ providerId: tts!.id, voiceId: 'v', description: 'd' }, ctx(await createUser()))
    expect(result).toEqual({ phrase: 'hello there', audio: Buffer.from('audio').toString('base64') })
  })
})
