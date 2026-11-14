/** The web search key checked with Exa: what each answer means, and the request it sends. Exa itself is never asked. */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { EXA_SEARCH_URL, exaKeyCheck, exaVerdict } from '../webSearchKeyCheck'

const KEY = 'exa-0123456789abcdef0123'

afterEach(() => { vi.unstubAllGlobals() })

describe('what an Exa answer says of a key @SC-2142', () => {
  it('works on a 2xx', () => {
    expect(exaVerdict(200, { results: [] }, KEY)).toEqual({ ok: true })
  })

  it('is refused on 401, 402 and 403, keeping Exa’s message with the key masked out', () => {
    expect(exaVerdict(401, { error: `Invalid API key ${KEY}`, tag: 'INVALID_API_KEY' }, KEY))
      .toEqual({ ok: false, outcome: 'refused', detail: 'Invalid API key …' })
    expect(exaVerdict(402, { error: 'No more credits', tag: 'NO_MORE_CREDITS' }, KEY)).toMatchObject({ outcome: 'refused' })
    expect(exaVerdict(403, null, KEY)).toEqual({ ok: false, outcome: 'refused', detail: null })
  })

  it('could not be checked on Exa’s own errors, a rate limit or any other answer', () => {
    for (const status of [400, 429, 500, 503, 504]) expect(exaVerdict(status, null, KEY)).toMatchObject({ ok: false, outcome: 'unchecked' })
  })
})

describe('the check @SC-2142', () => {
  it('sends Exa its smallest search with the key in x-api-key, and no page contents', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    expect(await exaKeyCheck.check(KEY)).toEqual({ ok: true })
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(EXA_SEARCH_URL)
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['x-api-key']).toBe(KEY)
    expect(JSON.parse(init.body as string)).toEqual({ query: 'Exa', numResults: 1 })
    expect(init.redirect).toBe('error')
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('could not be checked when Exa does not answer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Object.assign(new Error('timed out'), { name: 'TimeoutError' })))
    expect(await exaKeyCheck.check(KEY)).toEqual({ ok: false, outcome: 'unchecked', detail: null })
  })

  it('refused on a 401 whose body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 401 })))
    expect(await exaKeyCheck.check(KEY)).toEqual({ ok: false, outcome: 'refused', detail: null })
  })
})
