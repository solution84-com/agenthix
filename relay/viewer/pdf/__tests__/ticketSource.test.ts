import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { failureOfError } from '../documentOptions'
import { readHostMessage } from '../messages'
import { TicketSource } from '../ticketSource'

const ORIGIN = 'https://files.example.com'
const FIRST = '/t/aaa.bbb.ccc'
const RENEWED = '/t/ddd.eee.fff'
const body = new Uint8Array(1000).map((_, i) => i % 256)

/** A relay serving `body` by range; a ticket in `ended` is refused as a ticket past its life is. */
function relay(ended: Set<string> = new Set(), status = 206) {
  return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(url)).pathname
    if (ended.has(path)) return new Response(null, { status: 403 })
    if (status === 409) return new Response(null, { status })
    if (status === 200) return new Response(body.slice(), { status })
    const [, start, end] = /bytes=(\d+)-(\d+)/.exec(new Headers(init?.headers).get('Range') ?? '')!.map(Number)
    const last = Math.min(end!, body.length - 1)
    return new Response(body.slice(start, last + 1), { status: 206, headers: { 'Content-Range': `bytes ${start}-${last}/${body.length}` } })
  })
}

describe('the viewer’s reads @SC-1489', () => {
  it('opens with the length and the first chunk, from its own origin, with no credentials', async () => {
    const fetch = relay()
    const opened = await new TicketSource(FIRST, ORIGIN, fetch).open(256)
    expect(opened.length).toBe(1000)
    expect([...opened.initialData]).toEqual([...body.slice(0, 256)])
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe(`${ORIGIN}${FIRST}`)
    expect(init).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer' })
    expect(new Headers(init?.headers).get('Range')).toBe('bytes=0-255')
  })

  it('reads by the renewed ticket once it has it, so a page past the first ticket’s life still draws', async () => {
    const ended = new Set<string>()
    const fetch = relay(ended)
    const source = new TicketSource(FIRST, ORIGIN, fetch)
    await source.open(256)
    ended.add(FIRST)
    await expect(source.read(256, 512)).rejects.toMatchObject({ name: 'TicketReadError', status: 403 })
    source.renew(RENEWED)
    expect([...(await source.read(256, 512))]).toEqual([...body.slice(256, 512)])
    expect(String(fetch.mock.calls.at(-1)![0])).toBe(`${ORIGIN}${RENEWED}`)
  })

  it('takes only a ticket’s path as a renewal: never an origin or another path', () => {
    const source = new TicketSource(FIRST, ORIGIN, relay())
    for (const path of ['https://evil.example/t/a.b.c', '//evil.example/t/a.b.c', '/relay/t/a.b.c', '/t/a.b.c/../x', '/viewer/pdf', '']) {
      source.renew(path)
      expect(source.path, path).toBe(FIRST)
    }
  })

  it('keeps only what was asked for when the relay sends the whole file', async () => {
    const source = new TicketSource(FIRST, ORIGIN, relay(new Set(), 200))
    expect((await source.open(256)).length).toBe(1000)
    expect([...(await source.read(10, 20))]).toEqual([...body.slice(10, 20)])
  })

  it('reports a changed file as changed', async () => {
    const error = await new TicketSource(FIRST, ORIGIN, relay(new Set(), 409)).open(256).catch((e: unknown) => e)
    expect(failureOfError(error)).toBe('changed')
  })

  it('reports a relay that does not answer as unavailable', async () => {
    const error = await new TicketSource(FIRST, ORIGIN, vi.fn(async () => { throw new TypeError('Failed to fetch') })).open(256)
      .catch((e: unknown) => e)
    expect(failureOfError(error)).toBe('unavailable')
  })
})

describe('the viewer’s default fetch @SC-1489', () => {
  it('calls fetch on its own, never as the source’s method, as a browser requires', async () => {
    // A browser's fetch throws "Illegal invocation" when called with any other `this`.
    const real = globalThis.fetch
    globalThis.fetch = function (this: unknown, input: RequestInfo | URL) {
      if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation')
      return Promise.resolve(new Response(body.slice(0, 256), {
        status: 206, headers: { 'Content-Range': 'bytes 0-255/1000', 'Content-Length': '256' },
      }))
    } as typeof fetch
    try {
      expect((await new TicketSource(FIRST, ORIGIN).open(256)).length).toBe(1000)
    } finally {
      globalThis.fetch = real
    }
  })
})

describe('the message hq’s page sends it @SC-1489', () => {
  it('is a renewed ticket’s path in its own envelope, and nothing else', () => {
    expect(readHostMessage({ source: 'pdf-viewer-host', version: 1, link: RENEWED })).toBe(RENEWED)
    for (const data of [
      { source: 'pdf-viewer', version: 1, link: RENEWED }, { source: 'pdf-viewer-host', version: 2, link: RENEWED },
      { source: 'pdf-viewer-host', version: 1, link: `${ORIGIN}${RENEWED}` }, { source: 'pdf-viewer-host', version: 1, link: 7 },
      { source: 'pdf-viewer-host', version: 1, link: '/relay/t/a.b.c' }, 'link=/t/a.b.c', null,
    ]) {
      expect(readHostMessage(data), JSON.stringify(data)).toBeNull()
    }
  })
})

describe('pdf.js over the viewer’s transport @SC-1489', () => {
  it('opens a real PDF read by range, and goes on reading by the renewed ticket', async () => {
    const pdf = new Uint8Array(readFileSync(join(import.meta.dirname, 'fixtures/javascript.pdf')))
    const ended = new Set<string>()
    const fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(url)).pathname
      if (ended.has(path)) return new Response(null, { status: 403 })
      const [, start, end] = /bytes=(\d+)-(\d+)/.exec(new Headers(init?.headers).get('Range') ?? '')!.map(Number)
      const last = Math.min(end!, pdf.length - 1)
      return new Response(pdf.slice(start, last + 1), { status: 206, headers: { 'Content-Range': `bytes ${start}-${last}/${pdf.length}` } })
    })
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const { rangeTransport } = await import('../ticketSource')
    const source = new TicketSource(FIRST, ORIGIN, fetch)
    const opened = await source.open(64)
    ended.add(FIRST)
    source.renew(RENEWED)
    const failures: unknown[] = []
    const task = pdfjs.getDocument({
      range: rangeTransport(source, opened, e => failures.push(e), pdfjs.PDFDataRangeTransport), rangeChunkSize: 64, disableAutoFetch: true,
      useWorkerFetch: false, useWasm: false, verbosity: 0,
    })
    const doc = await task.promise
    expect(doc.numPages).toBe(1)
    await doc.getPage(1)
    expect(failures).toEqual([])
    expect(fetch.mock.calls.slice(1).every(([url]) => String(url) === `${ORIGIN}${RENEWED}`)).toBe(true)
    expect(fetch.mock.calls.length).toBeGreaterThan(1)
    await task.destroy()
  })
})
