import { afterEach, describe, expect, it, vi } from 'vitest'
import { mintSpeechToken } from '../speechMint'
import { mintLimit } from '../mintLimit'

const KEY = 'iw-key-abcdefghijklmnopqrstuvwxyz0123'
const inworld = { providerId: 'p-iw', providerName: 'Inworld', vendor: 'inworld', model: 'inworld/inworld-stt-1', apiKey: KEY }
const assembly = { providerId: 'p-aai', providerName: 'AssemblyAI', vendor: 'assemblyai', model: 'universal-3-6-pro', apiKey: 'aai-key' }

const answer = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) })

const originalFetch = global.fetch
afterEach(() => { global.fetch = originalFetch })

describe('minting a listening token @SC-1835', () => {
  it('mints a single-use Inworld token with the key, and gives back the token alone with its model', async () => {
    const fetch = vi.fn().mockResolvedValue(answer(200, { accessToken: 'one-time', expireTime: '2026-11-09T10:10:00Z' }))
    global.fetch = fetch as never
    const got = await mintSpeechToken({ ...inworld, providerId: 'p-iw-1' })
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe('https://api.inworld.ai/auth/v1/tokens')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe(`Basic ${KEY}`)
    expect(JSON.parse(init.body)).toEqual({ single_use: true, ttl: '600s' })
    expect(got).toEqual({ ok: true, minted: { provider: 'inworld', token: 'one-time', expiresAt: '2026-11-09T10:10:00.000Z', config: { modelId: 'inworld/inworld-stt-1' } } })
    expect(JSON.stringify(got)).not.toContain(KEY)
  })

  it('mints AssemblyAI’s token as before, with its listening model', async () => {
    const fetch = vi.fn().mockResolvedValue(answer(200, { token: 'aai-token', expires_in_seconds: 600 }))
    global.fetch = fetch as never
    const got = await mintSpeechToken(assembly)
    expect(fetch.mock.calls[0]![0]).toBe('https://streaming.assemblyai.com/v3/token?expires_in_seconds=600')
    expect(got).toMatchObject({ ok: true, minted: { provider: 'assemblyai', token: 'aai-token', config: { speech_model: 'universal-3-6-pro' } } })
  })

  it('says what a refusal means for the provider’s health, with no key in its words', async () => {
    global.fetch = vi.fn().mockResolvedValue(answer(401, { code: 16, message: `bad key ${KEY}` })) as never
    const got = await mintSpeechToken({ ...inworld, providerId: 'p-iw-2' })
    expect(got).toMatchObject({ ok: false, failure: { kind: 'auth' } })
    expect(JSON.stringify(got)).not.toContain(KEY)
  })

  it('treats an answer with no token, or no answer at all, as the service not working', async () => {
    global.fetch = vi.fn().mockResolvedValue(answer(200, {})) as never
    expect(await mintSpeechToken({ ...inworld, providerId: 'p-iw-3' })).toMatchObject({ ok: false, failure: { kind: 'unavailable', message: expect.stringContaining('Unexpected response shape') } })
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNRESET')) as never
    expect(await mintSpeechToken({ ...inworld, providerId: 'p-iw-3' })).toMatchObject({ ok: false, failure: { kind: 'unavailable', message: expect.stringContaining('Could not reach Inworld') } })
  })

  it('mints no more than Inworld’s sixty a minute for one provider, and says it is not the provider’s fault', async () => {
    const fetch = vi.fn().mockResolvedValue(answer(200, { accessToken: 'one-time' }))
    global.fetch = fetch as never
    for (let i = 0; i < 60; i++) expect((await mintSpeechToken({ ...inworld, providerId: 'p-iw-busy' })).ok).toBe(true)
    const over = await mintSpeechToken({ ...inworld, providerId: 'p-iw-busy' })
    expect(over).toMatchObject({ ok: false, failure: { kind: null } })
    expect(fetch).toHaveBeenCalledTimes(60)
  })
})

describe('mintLimit', () => {
  it('frees room as the minute passes, per provider', () => {
    let now = 0
    const limit = mintLimit(2, () => now)
    expect([limit.take('a'), limit.take('a'), limit.take('a'), limit.take('b')]).toEqual([true, true, false, true])
    now = 59_999
    expect(limit.take('a')).toBe(false)
    now = 60_000
    expect(limit.take('a')).toBe(true)
  })
})
