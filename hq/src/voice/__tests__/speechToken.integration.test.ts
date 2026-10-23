import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prisma } from '../../test/db'
import { setUpVoiceProviders } from '../../conversations/voice/__tests__/voiceFixtures'

// SC-194 — "Requesting voice input with no working speech-to-text provider returns 503 with the outage message; when
// the provider is unreachable or rejects the key it returns 502 with the upstream reason, and the provider's health is
// told." The provider is resolved from the real test DB; the network is the only stand-in.

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
const report = vi.hoisted(() => vi.fn())
vi.mock('../../routing/resolver', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../routing/resolver')>()),
  reportCall: report,
}))

import { getSpeechToken } from '../speechTokenAction'

process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 5).toString('base64')

const ctx = (user: { id: string } | undefined) => ({ user, entities: {} }) as any

async function createUser() {
  const user = await prisma.user.create({ data: {} as any })
  await prisma.userSettings.create({ data: { userId: user.id, role: 'MEMBER' } })
  return user
}

describe('getSpeechToken @SC-194', () => {
  const originalFetch = global.fetch

  beforeEach(() => vi.clearAllMocks())
  afterEach(() => { global.fetch = originalFetch })

  it('returns 503 saying voice is down when no speech-to-text provider works', async () => {
    const user = await createUser()
    global.fetch = vi.fn() as any

    await expect(getSpeechToken(undefined, ctx(user))).rejects.toMatchObject({
      statusCode: 503,
      message: "Voice is down: speech to text isn't working. An organisation admin has been told.",
    })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('mints a token with the resolved provider and tells its health', async () => {
    const user = await createUser()
    const { stt } = await setUpVoiceProviders()
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token: 't', expires_in_seconds: 600 }) }) as any

    const token = await getSpeechToken(undefined, ctx(user))

    expect(token).toMatchObject({ provider: 'assemblyai', token: 't', config: { speech_model: 'universal-streaming-english' } })
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('streaming.assemblyai.com'), { headers: { Authorization: 'stt-key' } })
    expect(report).toHaveBeenCalledWith(stt!.id, null)
  })

  it('returns 502 with the upstream reason when the key is rejected, and reports an auth failure', async () => {
    const user = await createUser()
    const { stt } = await setUpVoiceProviders()
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, text: () => Promise.resolve('Invalid API key') }) as any

    await expect(getSpeechToken(undefined, ctx(user))).rejects.toMatchObject({ statusCode: 502, message: expect.stringContaining('401') })
    expect(report).toHaveBeenCalledWith(stt!.id, 'auth', 'Invalid API key')
  })

  it('returns 502 when the provider is unreachable', async () => {
    const user = await createUser()
    await setUpVoiceProviders()
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as any

    await expect(getSpeechToken(undefined, ctx(user))).rejects.toMatchObject({ statusCode: 502, message: expect.stringContaining('Could not reach') })
  })

  it('refuses a caller who is not signed in (401)', async () => {
    await expect(getSpeechToken(undefined, ctx(undefined))).rejects.toMatchObject({ statusCode: 401 })
  })
})
