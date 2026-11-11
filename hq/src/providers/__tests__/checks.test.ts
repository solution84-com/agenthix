import { afterEach, describe, expect, it, vi } from 'vitest'
import { inworldLlmAuthorization } from '../../shared/inworldLlm'
import { RATE_LIMIT_BACKOFF_MS, classify, modelIdsOf, probeFor, realVendorChecks, unreachableDetail } from '../checks'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('probeFor @SC-1181', () => {
  it('asks each vendor something that costs nothing', () => {
    expect(probeFor({ vendor: 'anthropic', key: 'k', baseUrl: null }).url).toBe('https://api.anthropic.com/v1/models')
    expect(probeFor({ vendor: 'openrouter', key: 'k', baseUrl: null }).url).toBe('https://openrouter.ai/api/v1/key')
    expect(probeFor({ vendor: 'assemblyai', key: 'k', baseUrl: null }).url).toContain('/v3/token')
    expect(probeFor({ vendor: 'inworld', key: 'k', baseUrl: null }).url).toBe('https://api.inworld.ai/tts/v1/voices')
  })

  it('asks Inworld one thing: its voices, or, as a model provider, its model list with the key in the one header', () => {
    expect(probeFor({ vendor: 'inworld', key: 'k', baseUrl: null }, true)).toEqual({
      url: 'https://api.inworld.ai/llm/v1alpha/models', headers: { Authorization: inworldLlmAuthorization('k') },
    })
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

describe('classify, Inworld (recorded shapes) @SC-1852', () => {
  it('a wrong key is refused, with its own message', () => {
    expect(classify('inworld', 401, { error: { message: 'Invalid API key' } })).toEqual({ ok: false, kind: 'auth', detail: 'Invalid API key' })
    expect(classify('inworld', 401, null)).toMatchObject({ kind: 'auth', detail: 'The key was refused.' })
  })

  it('no credit is out of credit, by status or by its message', () => {
    expect(classify('inworld', 402, { error: { message: 'Payment required' } })).toMatchObject({ kind: 'quota', detail: 'Payment required' })
    expect(classify('inworld', 403, { error: { message: 'Insufficient credits' } })).toMatchObject({ kind: 'quota' })
    expect(classify('inworld', 403, { error: { message: 'Forbidden' } })).toMatchObject({ kind: 'auth' })
    expect(classify('inworld', 403, { error: { message: 'Insufficient permissions' } })).toMatchObject({ kind: 'auth' })
    expect(classify('inworld', 403, { error: { message: 'Quota for this project' } })).toMatchObject({ kind: 'auth' })
  })

  it('a limit is a limit and never a bad key', () => {
    expect(classify('inworld', 429, { error: { message: 'Rate limit exceeded' } })).toEqual({ ok: false, kind: 'rate-limit', detail: 'Rate limit exceeded' })
    expect(classify('inworld', 429, null)).toMatchObject({ kind: 'rate-limit' })
    expect(classify('inworld', 429, { error: { message: 'Rate limit exceeded' } })).not.toMatchObject({ kind: 'auth' })
  })

  it('a server error is unavailable, and a model list is fine', () => {
    expect(classify('inworld', 503, null)).toMatchObject({ kind: 'unavailable' })
    expect(classify('inworld', 200, { models: [] })).toEqual({ ok: true })
  })
})

describe('realVendorChecks, Inworld @SC-1852', () => {
  const target = { vendor: 'inworld', key: 'inworld-test-key', baseUrl: null } as const
  const limited = () => new Response(JSON.stringify({ error: { message: 'Rate limit exceeded' } }), { status: 429 })

  it('is one call to the model list', async () => {
    const fetch = vi.fn(async (_url: string) => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    expect(await realVendorChecks.check(target)).toEqual({ ok: true })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][0]).toBe('https://api.inworld.ai/llm/v1alpha/models')
  })

  it('as a model provider, is still working when the model list is refused but its voices answer', async () => {
    const fetch = vi.fn(async (url: string) => url.includes('/llm/')
      ? new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403 })
      : new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    expect(await realVendorChecks.check(target)).toEqual({ ok: true })
    expect(fetch.mock.calls.map(c => c[0])).toEqual(['https://api.inworld.ai/llm/v1alpha/models', 'https://api.inworld.ai/tts/v1/voices'])
  })

  it('as a model provider, reports a refused key over an unreachable one when both asks fail', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url.includes('/llm/')) throw new Error('down')
      return new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 })
    })
    vi.stubGlobal('fetch', fetch)
    expect(await realVendorChecks.check(target)).toMatchObject({ ok: false, kind: 'auth' })
    fetch.mockImplementation(async (url: string) => {
      if (url.includes('/tts/')) throw new Error('down')
      return new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403 })
    })
    expect(await realVendorChecks.check(target)).toMatchObject({ ok: false, kind: 'auth' })
  })

  it('retries a limit with a back-off and succeeds when it lifts', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    const fetch = vi.fn().mockImplementationOnce(async () => limited()).mockImplementation(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    const done = realVendorChecks.check(target)
    await vi.runAllTimersAsync()
    expect(await done).toEqual({ ok: true })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('reports a limit that stays as a limit after the back-offs, not as a refused key', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    const fetch = vi.fn(async () => limited())
    vi.stubGlobal('fetch', fetch)
    const done = realVendorChecks.check(target)
    await vi.runAllTimersAsync()
    expect(await done).toMatchObject({ ok: false, kind: 'rate-limit' })
    // Each attempt asks the model list and then the voice list.
    expect(fetch).toHaveBeenCalledTimes(2 * (1 + RATE_LIMIT_BACKOFF_MS.length))
  })

  it('does not retry a refused key', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'Invalid API key' } }), { status: 401 }))
    vi.stubGlobal('fetch', fetch)
    expect(await realVendorChecks.check(target)).toMatchObject({ ok: false, kind: 'auth' })
    expect(fetch).toHaveBeenCalledTimes(2)
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

describe('listModels @SC-1181', () => {
  const target = { vendor: 'openai_compatible', key: 'sk-test-fake', baseUrl: 'https://llm.example.test/v1' } as const

  it("reads the ids of an OpenAI-style models answer and ignores anything else", async () => {
    expect(modelIdsOf({ data: [{ id: 'a' }, { id: '' }, { name: 'b' }, 'c', { id: 'd' }] })).toEqual(['a', 'd'])
    expect(modelIdsOf({ models: [] })).toEqual([])
    expect(modelIdsOf(null)).toEqual([])
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'm1' }, { id: 'm2' }] }), { status: 200 })))
    expect(await realVendorChecks.listModels(target)).toEqual(['m1', 'm2'])
  })

  it('is none when the endpoint refuses, cannot be reached, or the vendor is not a custom endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })))
    expect(await realVendorChecks.listModels(target)).toEqual([])
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down') }))
    expect(await realVendorChecks.listModels(target)).toEqual([])
    expect(await realVendorChecks.listModels({ ...target, vendor: 'openai' })).toEqual([])
  })
})

describe('unreachableDetail', () => {
  it('tells a custom endpoint that it must be reachable from the site, not only from HQ', () => {
    expect(unreachableDetail('openai_compatible', false)).toMatch(/could not be reached\..*host\.docker\.internal/)
    expect(unreachableDetail('openai', false)).toBe('It could not be reached.')
    expect(unreachableDetail('openai', true)).toBe('It did not answer in time.')
  })
})
