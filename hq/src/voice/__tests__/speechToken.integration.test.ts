import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prisma } from '../../test/db'

// SC-194 — "Requesting voice input with no speech-to-text provider configured
// returns 404 with a clear message; when the provider is unreachable/rejects
// the key returns 502 with the upstream reason."
//
// getSpeechToken reads the Provider row from the real test DB (integration,
// ADR-0035) and calls the AssemblyAI streaming token endpoint over fetch — the
// network is the only side-effecting collaborator, so it is stubbed.

// The action reads the provider through wasp/server's prisma, which the vitest
// alias does not provide — hand it the real test-DB client.
vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import { getSpeechToken } from '../speechTokenAction'
import { encryptProviderKey } from '../../server/providerService'

function ctx(user: { id: string } | undefined) {
  return { user, entities: { Provider: prisma.provider } } as any
}

// Everyone may talk to agents in their own Chat (adr-0102), so anyone signed in may have a token.
async function createUser() {
  const user = await prisma.user.create({ data: {} as any })
  await prisma.userSettings.create({ data: { userId: user.id, role: 'MEMBER' } })
  return user
}

describe('getSpeechToken @SC-194', () => {
  const originalFetch = global.fetch

  beforeEach(() => vi.clearAllMocks())
  afterEach(() => {
    global.fetch = originalFetch
  })

  it('returns 404 with a clear message when no speech-to-text provider is configured', async () => {
    const user = await createUser()
    global.fetch = vi.fn() as any

    await expect(getSpeechToken(undefined, ctx(user))).rejects.toMatchObject({
      statusCode: 404,
      message: expect.stringContaining('Speech to text is not set up'),
    })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('returns 502 with the upstream reason when AssemblyAI rejects the key', async () => {
    const user = await createUser()
    await prisma.provider.create({
      data: { service: 'stt', name: 'assemblyai', apiKey: encryptProviderKey('bad-key'), isEnabled: true } as any,
    })
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Invalid API key'),
    }) as any

    await expect(getSpeechToken(undefined, ctx(user))).rejects.toMatchObject({
      statusCode: 502,
      message: expect.stringContaining('401'),
    })
  })

  it('returns 502 when AssemblyAI is unreachable', async () => {
    const user = await createUser()
    await prisma.provider.create({
      data: { service: 'stt', name: 'assemblyai', apiKey: encryptProviderKey('some-key'), isEnabled: true } as any,
    })
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as any

    await expect(getSpeechToken(undefined, ctx(user))).rejects.toMatchObject({
      statusCode: 502,
      message: expect.stringContaining('Could not reach AssemblyAI'),
    })
  })

  it('returns the provider, a token and its expiry when AssemblyAI accepts the request', async () => {
    const user = await createUser()
    await prisma.provider.create({
      data: {
        service: 'stt',
        name: 'assemblyai',
        apiKey: encryptProviderKey('good-key'),
        isEnabled: true,
        config: { sampleRate: 16000 },
      } as any,
    })
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: 'tok-123', expires_in_seconds: 600 }),
    }) as any

    const result = await getSpeechToken(undefined, ctx(user))

    expect(result.provider).toBe('assemblyai')
    expect(result.token).toBe('tok-123')
    expect(typeof result.expiresAt).toBe('string')
    expect(result.config).toMatchObject({ sampleRate: 16000 })
  })

  it('sends the decrypted key upstream, and answers an empty config when none is stored', async () => {
    const user = await createUser()
    await prisma.provider.create({
      data: { service: 'stt', name: 'assemblyai', apiKey: encryptProviderKey('aai-key-123'), isEnabled: true } as any,
    })
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: 'tok', expires_in_seconds: 300 }),
    }) as any

    const result = await getSpeechToken(undefined, ctx(user))

    expect(result.config).toEqual({})
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain('https://streaming.assemblyai.com/v3/token')
    expect((init as { headers: Record<string, string> }).headers.Authorization).toBe('aai-key-123')
  })

  it('refuses a caller who is not signed in (401)', async () => {
    await expect(getSpeechToken(undefined, ctx(undefined))).rejects.toMatchObject({ statusCode: 401 })
  })

  // No organisation role withholds voice: a person with no settings row reaches the provider too.
  it('asks for a token for a caller with no settings row', async () => {
    const user = await prisma.user.create({ data: {} as any })
    await prisma.provider.create({
      data: { service: 'stt', name: 'assemblyai', apiKey: encryptProviderKey('k'), isEnabled: true } as any,
    })
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => '' }) as any

    await expect(getSpeechToken(undefined, ctx(user))).rejects.toMatchObject({ statusCode: 502 })
    expect(global.fetch).toHaveBeenCalled()
  })
})
