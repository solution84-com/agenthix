import { describe, expect, it, vi } from 'vitest'
import { createFileBytes, FileBytesError } from '../fileBytes'

const LINK = 'https://files.example.org/t/a.b.c'
const FILE = new TextEncoder().encode('0123456789')

function relay(status = 206, body: Uint8Array<ArrayBuffer> = FILE, headers: Record<string, string> = {}) {
  return vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const range = /bytes=(\d+)-(\d+)/.exec(new Headers(init?.headers).get('Range') ?? '')
    if (status !== 206 || !range) return new Response(body, { status, headers })
    const [start, end] = [Number(range[1]), Math.min(Number(range[2]), body.length - 1)]
    return new Response(body.slice(start, end + 1), {
      status, headers: { 'Content-Range': `bytes ${start}-${end}/${body.length}`, ...headers },
    })
  })
}

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

describe('createFileBytes @SC-1582', () => {
  it('reads the first bytes with a Range request and no credentials', async () => {
    const fetch = relay()
    const result = await createFileBytes(LINK, { fetch }).read(4)
    expect(text(result.bytes)).toBe('0123')
    expect(result.whole).toBe(false)
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe(LINK)
    expect(new Headers(init?.headers).get('Range')).toBe('bytes=0-3')
    expect(init?.credentials).toBe('omit')
  })

  it('says whole when the limit covers the file', async () => {
    const result = await createFileBytes(LINK, { fetch: relay() }).read(100)
    expect(text(result.bytes)).toBe('0123456789')
    expect(result.whole).toBe(true)
  })

  it('stops at the limit when the relay ignores the range', async () => {
    const result = await createFileBytes(LINK, { fetch: relay(200) }).read(3)
    expect(text(result.bytes)).toBe('012')
    expect(result.whole).toBe(false)
  })

  it('reads an empty file as whole', async () => {
    const result = await createFileBytes(LINK, { fetch: relay(416, new Uint8Array(0)) }).read(10)
    expect(result).toEqual({ bytes: new Uint8Array(0), whole: true })
  })

  it('reads a range by its inclusive offsets', async () => {
    const fetch = relay()
    expect(text(await createFileBytes(LINK, { fetch }).range(2, 5))).toBe('2345')
    expect(new Headers(fetch.mock.calls[0]![1]?.headers).get('Range')).toBe('bytes=2-5')
  })

  it('cuts a range out of a whole answer', async () => {
    expect(text(await createFileBytes(LINK, { fetch: relay(200) }).range(2, 5))).toBe('2345')
  })

  it('surfaces a 409 as changed', async () => {
    const bytes = createFileBytes(LINK, { fetch: relay(409) })
    await expect(bytes.read(4)).rejects.toMatchObject({ name: 'FileBytesError', reason: 'changed' })
    await expect(bytes.range(0, 1)).rejects.toMatchObject({ reason: 'changed' })
  })

  it('surfaces a network failure and a refusal as unavailable', async () => {
    const down = vi.fn(async () => { throw new TypeError('Failed to fetch') })
    await expect(createFileBytes(LINK, { fetch: down }).read(4)).rejects.toBeInstanceOf(FileBytesError)
    await expect(createFileBytes(LINK, { fetch: down }).read(4)).rejects.toMatchObject({ reason: 'unavailable' })
    for (const status of [403, 404, 502, 503]) {
      await expect(createFileBytes(LINK, { fetch: relay(status) }).read(4)).rejects.toMatchObject({ reason: 'unavailable' })
    }
  })

  it('passes the signal on, and an aborted read stays an abort', async () => {
    const controller = new AbortController()
    const fetch = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    const reading = createFileBytes(LINK, { fetch, signal: controller.signal }).read(4)
    expect(fetch.mock.calls[0]![1]?.signal).toBe(controller.signal)
    controller.abort()
    await expect(reading).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('refuses a limit or range that means nothing', async () => {
    const bytes = createFileBytes(LINK, { fetch: relay() })
    await expect(bytes.read(0)).rejects.toBeInstanceOf(RangeError)
    await expect(bytes.range(5, 2)).rejects.toBeInstanceOf(RangeError)
  })
})
