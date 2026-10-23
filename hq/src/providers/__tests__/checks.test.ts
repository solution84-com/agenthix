import { afterEach, describe, expect, it, vi } from 'vitest'
import { classify, probeFor, realVendorChecks } from '../checks'

afterEach(() => vi.unstubAllGlobals())

describe('probeFor @SC-1181', () => {
  it('asks each vendor something that costs nothing', () => {
    expect(probeFor({ vendor: 'anthropic', key: 'k', baseUrl: null }).url).toBe('https://api.anthropic.com/v1/models')
    expect(probeFor({ vendor: 'openrouter', key: 'k', baseUrl: null }).url).toBe('https://openrouter.ai/api/v1/key')
    expect(probeFor({ vendor: 'assemblyai', key: 'k', baseUrl: null }).url).toContain('/v3/token')
    expect(probeFor({ vendor: 'inworld', key: 'k', baseUrl: null }).url).toBe('https://api.inworld.ai/tts/v1/voices')
  })

  it("lists a custom endpoint's models, without a key header when it has none", () => {
    expect(probeFor({ vendor: 'openai_compatible', key: null, baseUrl: 'https://llm.example.test/v1/' })).toEqual({ url: 'https://llm.example.test/v1/models', headers: {} })
  })
})

describe('classify @SC-1181', () => {
  it('reads refusals of the key, of money, of load and of the server', () => {
    expect(classify('anthropic', 401, { error: { message: 'invalid x-api-key' } })).toEqual({ ok: false, kind: 'auth', detail: 'invalid x-api-key' })
    expect(classify('openai', 429, { error: { message: 'You exceeded your current quota' } })).toMatchObject({ kind: 'quota' })
    expect(classify('openai', 429, { error: { message: 'Rate limit reached' } })).toMatchObject({ kind: 'rate-limit' })
    expect(classify('anthropic', 529, null)).toMatchObject({ kind: 'unavailable' })
    expect(classify('google', 400, { error: { message: 'API key not valid. Please pass a valid API key.' } })).toMatchObject({ kind: 'auth' })
    expect(classify('openai_compatible', 404, null)).toMatchObject({ kind: 'invalid' })
  })

  it('an OpenRouter key whose limit is used up is out of credit', () => {
    expect(classify('openrouter', 200, { data: { limit_remaining: 0 } })).toMatchObject({ ok: false, kind: 'quota' })
    expect(classify('openrouter', 200, { data: { limit_remaining: null } })).toEqual({ ok: true })
  })
})

describe('realVendorChecks @SC-1181', () => {
  it('sends the key only in its header, and an unreachable vendor is unavailable', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    expect(await realVendorChecks.check({ vendor: 'openai', key: 'sk-test-fake-0123', baseUrl: null })).toEqual({ ok: true })
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).not.toContain('sk-test-fake')
    expect(init.headers).toEqual({ Authorization: 'Bearer sk-test-fake-0123' })

    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed') }))
    expect(await realVendorChecks.check({ vendor: 'openai', key: 'sk-test-fake-0123', baseUrl: null })).toMatchObject({ ok: false, kind: 'unavailable' })
  })
})
