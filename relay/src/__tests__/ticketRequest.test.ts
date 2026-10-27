import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RELAY_STREAMS_PER_PERSON, refusalHead, type FileServeHead, type FileServeRefusal } from '@agenthix/core'
import { FakeSite, type SiteHandler } from '../test/fakeSite'
import { APP_ORIGIN, ask, startRelay, until, type Answer, type Harness } from '../test/harness'
import { passClaims, ticketClaims } from '../test/signer'

let relay: Harness
let site: FakeSite | null
const ok = (over: Partial<FileServeHead> = {}): FileServeHead =>
  ({ status: 200, size: 5, contentType: 'text/plain; charset=utf-8', purpose: 'preview', fileName: 'notes.txt', ...over }) as FileServeHead

async function withSite(handler: SiteHandler, over: Parameters<typeof startRelay>[0] = {}) {
  relay = await startRelay(over)
  site = await FakeSite.connect({ port: relay.port, pass: relay.signer.sign(passClaims()) }, handler)
  await until(() => relay.lines.current('site-1') !== null)
}
const ticket = (over: Record<string, unknown> = {}) => relay.signer.sign(ticketClaims(over))

function expectSecurityHeaders(a: Answer) {
  expect(a.headers['content-security-policy']).toBe('sandbox')
  expect(a.headers['x-content-type-options']).toBe('nosniff')
  expect(a.headers['referrer-policy']).toBe('no-referrer')
  expect(a.headers['access-control-allow-credentials']).toBeUndefined()
}

beforeEach(() => { site = null })
afterEach(async () => {
  await site?.close()
  await relay?.close()
})

describe('a browser asks for /t/<ticket> @SC-1474 @SC-1564', () => {
  it('passes the ticket to the site the ticket names, and answers its file', async () => {
    await withSite(() => ({ head: ok(), body: new TextEncoder().encode('hello') }))
    const t = ticket()
    const a = await ask(relay.port, `/t/${t}`)
    expect(a.status).toBe(200)
    expect(a.body.toString()).toBe('hello')
    expect(a.headers['content-type']).toBe('text/plain; charset=utf-8')
    expect(a.headers['content-length']).toBe('5')
    expect(a.headers['content-disposition']).toMatch(/^inline; filename="notes.txt"/)
    expect(a.headers['accept-ranges']).toBe('bytes')
    expectSecurityHeaders(a)
    expect(site!.opened[0]).toMatchObject({ method: 'files.serve', params: { ticket: t } })
  })

  it('sends a download as an attachment and an octet stream, whatever the site guessed', async () => {
    await withSite(() => ({ head: ok({ purpose: 'download', size: 8, contentType: 'text/html', fileName: 'résumé "x".html' }), body: new TextEncoder().encode('<b>x</b>') }))
    const a = await ask(relay.port, `/t/${ticket({ purpose: 'download' })}`)
    expect(a.headers['content-type']).toBe('application/octet-stream')
    expect(a.headers['content-disposition']).toBe(`attachment; filename="r_sum_ _x_.html"; filename*=UTF-8''r%C3%A9sum%C3%A9%20%22x%22.html`)
  })

  it('survives a file name that cannot be encoded', async () => {
    await withSite(() => ({ head: ok({ fileName: 'bad\ud800.txt' }), body: new TextEncoder().encode('hello') }))
    const a = await ask(relay.port, `/t/${ticket()}`)
    expect(a.status).toBe(200)
    expect(a.headers['content-disposition']).toBe('inline; filename="bad_.txt"')
  })

  it('replaces a content type that is not a plain media type', async () => {
    await withSite(() => ({ head: ok({ contentType: 'text/html\r\nSet-Cookie: a=b' }), body: new TextEncoder().encode('hello') }))
    expect((await ask(relay.port, `/t/${ticket()}`)).headers['content-type']).toBe('application/octet-stream')
  })

  it('gives CORS to the app\'s origin only, and never with credentials @SC-1475 @SC-1569', async () => {
    await withSite(() => ({ head: ok(), body: new TextEncoder().encode('hello') }))
    const mine = await ask(relay.port, `/t/${ticket()}`, { headers: { Origin: APP_ORIGIN } })
    expect(mine.headers['access-control-allow-origin']).toBe(APP_ORIGIN)
    expect(mine.headers['access-control-expose-headers']).toContain('Content-Range')
    expect(mine.headers.vary).toBe('Origin')
    expectSecurityHeaders(mine)
    const other = await ask(relay.port, `/t/${ticket()}`, { headers: { Origin: 'https://evil.example' } })
    expect(other.headers['access-control-allow-origin']).toBeUndefined()
    const preflight = await ask(relay.port, `/t/${ticket()}`, { method: 'OPTIONS', headers: { Origin: APP_ORIGIN } })
    expect(preflight.status).toBe(204)
    expect(preflight.headers['access-control-allow-headers']).toBe('Range')
    expect(preflight.headers['access-control-allow-credentials']).toBeUndefined()
  })

  it('passes the Range header on, and HEAD as a head-only request', async () => {
    await withSite(params => {
      const p = params as { headOnly?: boolean }
      return p.headOnly ? { head: ok() } : { head: ok({ status: 206, size: 10, range: { start: 2, end: 4 } }), body: new TextEncoder().encode('cde') }
    })
    const ranged = await ask(relay.port, `/t/${ticket()}`, { headers: { Range: 'bytes=2-4' } })
    expect(ranged.status).toBe(206)
    expect(ranged.headers['content-range']).toBe('bytes 2-4/10')
    expect(ranged.body.toString()).toBe('cde')
    expect(site!.opened[0].params).toMatchObject({ range: 'bytes=2-4' })
    const head = await ask(relay.port, `/t/${ticket()}`, { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(head.headers['content-length']).toBe('5')
    expect(site!.opened[1].params).toMatchObject({ headOnly: true })
  })

  it('never passes a cookie or an authorisation on to the site', async () => {
    await withSite(() => ({ head: ok(), body: new TextEncoder().encode('hello') }))
    await ask(relay.port, `/t/${ticket()}`, { headers: { Cookie: 'session=abc', Authorization: 'Bearer abc' } })
    expect(JSON.stringify(site!.opened[0].params)).not.toMatch(/session|Bearer/)
    expect(Object.keys(site!.opened[0].params as object).sort()).toEqual(['ticket'])
  })

  it.each([
    ['ticket-invalid', 403], ['ticket-expired', 403], ['changed', 409], ['not-found', 404],
    ['range-not-satisfiable', 416], ['busy', 503], ['failed', 500],
  ] as Array<[FileServeRefusal, number]>)('answers the site\'s %s refusal with %i and the security headers', async (refusal, status) => {
    await withSite(() => ({ head: refusalHead(refusal, 10) }))
    const a = await ask(relay.port, `/t/${ticket()}`, { headers: { Origin: APP_ORIGIN } })
    expect(a.status).toBe(status)
    expectSecurityHeaders(a)
    expect(a.headers['access-control-allow-origin']).toBe(APP_ORIGIN)
    if (refusal === 'range-not-satisfiable') expect(a.headers['content-range']).toBe('bytes */10')
  })
})

describe('what the relay refuses itself @SC-1476', () => {
  it('answers nothing on any host but the files host', async () => {
    await withSite(() => ({ head: ok(), body: new TextEncoder().encode('hello') }))
    for (const host of ['hq.example.com', 'localhost:4100', 'files.example.com.evil.com']) {
      const a = await ask(relay.port, `/t/${ticket()}`, { host })
      expect(a.status).toBe(404)
      expectSecurityHeaders(a)
    }
    expect(site!.opened).toEqual([])
  })

  it('answers no browser at all without a files host', async () => {
    await withSite(() => ({ head: ok() }), { filesHost: null })
    expect((await ask(relay.port, `/t/${ticket()}`)).status).toBe(404)
  })

  it('answers 404 for any other path and for a path that is not a ticket', async () => {
    await withSite(() => ({ head: ok() }))
    for (const path of ['/', '/t/', '/files/x', '/t/abc', `/t/${ticket()}/more`, '/t/a.b.c%2F..']) {
      expect((await ask(relay.port, path)).status).toBe(404)
    }
    expect(site!.opened).toEqual([])
  })

  it('answers only GET and HEAD', async () => {
    await withSite(() => ({ head: ok() }))
    const a = await ask(relay.port, `/t/${ticket()}`, { method: 'POST' })
    expect(a.status).toBe(405)
    expect(a.headers.allow).toBe('GET, HEAD')
  })

  it('answers 403 for a token that names no site and person', async () => {
    await withSite(() => ({ head: ok() }))
    expect((await ask(relay.port, `/t/${relay.signer.sign({ hello: 'x' })}`)).status).toBe(403)
  })

  it('answers 503 when the site the ticket names holds no line', async () => {
    await withSite(() => ({ head: ok() }))
    const a = await ask(relay.port, `/t/${ticket({ site: 'site-2', aud: 'site-2' })}`)
    expect(a.status).toBe(503)
    expectSecurityHeaders(a)
  })

  it('answers 502 for a site that sends no valid head, and 504 for one that never answers', async () => {
    // A head of `{}`: JSON, but not a head.
    await withSite(() => ({ raw: [new Uint8Array([0, 0, 0, 2, 0x7b, 0x7d])] }), { openTimeoutMs: 200 })
    expect((await ask(relay.port, `/t/${ticket()}`)).status).toBe(502)
    await site!.close()
    site = await FakeSite.connect({ port: relay.port, pass: relay.signer.sign(passClaims()) }, () => new Promise(() => {}))
    await until(() => relay.lines.sites().length === 1)
    expect((await ask(relay.port, `/t/${ticket()}`)).status).toBe(504)
    expect(site.opened[0].cancelled).toBe(true)
  })

  it(`allows ${RELAY_STREAMS_PER_PERSON} streams per person at once, then 429 @SC-1477 @SC-1571`, async () => {
    const waiting: Array<() => void> = []
    let hold = true
    const served = { head: ok(), body: new TextEncoder().encode('hello') }
    await withSite(() => (hold ? new Promise(resolve => waiting.push(() => resolve(served))) : served))
    const held = Array.from({ length: RELAY_STREAMS_PER_PERSON }, () => ask(relay.port, `/t/${ticket()}`))
    await until(() => site!.opened.length === RELAY_STREAMS_PER_PERSON)
    const refused = await ask(relay.port, `/t/${ticket()}`)
    expect(refused.status).toBe(429)
    expect(refused.headers['retry-after']).toBe('1')
    const someoneElse = ask(relay.port, `/t/${ticket({ person: 'person-2' })}`)
    await until(() => site!.opened.length === RELAY_STREAMS_PER_PERSON + 1)
    hold = false
    for (const go of waiting) go()
    expect((await Promise.all([...held, someoneElse])).every(a => a.status === 200)).toBe(true)
    await until(() => relay.load.openStreams === 0)
    expect((await ask(relay.port, `/t/${ticket()}`)).status).toBe(200)
  })

  it('cancels the site\'s stream when the browser goes away @SC-1477', async () => {
    await withSite(() => ({ head: ok({ size: 1_000_000 }), body: new Uint8Array(200_000), end: false }))
    await ask(relay.port, `/t/${ticket()}`, { abortAfterBytes: 1 })
    await until(() => site!.opened[0]?.cancelled === true)
    await until(() => relay.load.openStreams === 0)
  })

  it('cuts the response when the site sends more than its head promised @SC-1477', async () => {
    await withSite(() => ({ head: ok({ size: 3 }), body: new TextEncoder().encode('hello') }))
    const a = await ask(relay.port, `/t/${ticket()}`).catch(() => null)
    expect(a?.body.toString() ?? '').not.toBe('hello')
  })

  it('never logs a ticket, a path or a query @SC-1478 @SC-1563', async () => {
    const out = vi.spyOn(console, 'log')
    const err = vi.spyOn(console, 'error')
    const warn = vi.spyOn(console, 'warn')
    await withSite(() => ({ head: refusalHead('failed') }))
    const t = ticket()
    await ask(relay.port, `/t/${t}?q=secret-query`)
    await ask(relay.port, `/t/${t}`, { host: 'other.example' })
    await ask(relay.port, `/t/${ticket({ site: 'gone', aud: 'gone' })}`)
    const all = [...relay.logs, ...[out, err, warn].flatMap(s => s.mock.calls.map(c => c.join(' ')))].join('\n')
    expect(all).not.toContain(t.split('.')[1])
    expect(all).not.toContain('secret-query')
    expect(all).not.toContain('reports/q3.pdf')
    out.mockRestore(); err.mockRestore(); warn.mockRestore()
  })
})
