/**
 * Flow control per stream (spec part 6: "Download through a relay: no cap, streamed"; T10): the relay opens
 * `files.serve` with a window and grants credit as the browser takes the bytes, so a slow browser slows only its own
 * stream, nothing fails for being large, and the relay holds about a window per stream.
 */
import { createHash, randomBytes } from 'node:crypto'
import { request, type ServerResponse } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { encodeDataFrame, encodeStreamHead, type FileServeHead } from '@agenthix/core'
import { FakeSite, type SiteHandler } from '../test/fakeSite'
import { FILES_HOST, ask, startRelay, until, type Harness } from '../test/harness'
import { passClaims, ticketClaims } from '../test/signer'

let relay: Harness
let site: FakeSite | null = null
afterEach(async () => {
  await site?.close()
  site = null
  await relay?.close()
})

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')
const head = (size: number): FileServeHead =>
  ({ status: 200, size, contentType: 'application/octet-stream', purpose: 'download', fileName: 'big.bin' }) as FileServeHead

/** Every response the relay writes, so a test can watch what it holds for a browser. */
async function withSite(handler: SiteHandler, over: Parameters<typeof startRelay>[0] = {}) {
  relay = await startRelay(over)
  const responses: ServerResponse[] = []
  relay.server.on('request', (_req, res: ServerResponse) => responses.push(res))
  site = await FakeSite.connect({ port: relay.port, pass: relay.signer.sign(passClaims()) }, handler)
  await until(() => relay.lines.current('site-1') !== null)
  return responses
}

/** A browser that stops reading for `pauseMs` after every `every` bytes; resolves with what it got. */
function slowBrowser(path: string, every: number, pauseMs: number) {
  let paused: (() => void) | null = null
  const done = new Promise<{ status: number; bytes: number; hash: string; complete: boolean }>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: relay.port, path, headers: { Host: FILES_HOST } }, res => {
      const hash = createHash('sha256')
      let bytes = 0
      let sinceRest = 0
      res.on('data', (c: Buffer) => {
        hash.update(c)
        bytes += c.length
        sinceRest += c.length
        if (sinceRest >= every) {
          sinceRest = 0
          res.pause()
          paused = () => res.resume()
          setTimeout(() => { paused = null; res.resume() }, pauseMs)
        }
      })
      const finish = (complete: boolean) => resolve({ status: res.statusCode ?? 0, bytes, hash: hash.digest('hex'), complete })
      res.on('end', () => finish(true))
      res.on('error', () => finish(false))
      res.on('aborted', () => finish(false))
    })
    req.on('error', reject)
    req.end()
  })
  return { done, isPaused: () => paused !== null }
}

describe('flow control on a relay stream @SC-1484 @SC-1571', () => {
  it('carries a download of more than 64 MiB to a slow reader whole, holding about a window for it', async () => {
    const FILE = randomBytes(64 * 1024 * 1024 + 4321)
    const responses = await withSite(() => ({ head: head(FILE.length), body: FILE }))
    const t = relay.signer.sign(ticketClaims({ purpose: 'download' }))

    let mostHeld = 0
    const watch = setInterval(() => {
      for (const res of responses) mostHeld = Math.max(mostHeld, res.writableLength)
    }, 2)
    const browser = slowBrowser(`/t/${t}`, 4 * 1024 * 1024, 25)
    const got = await browser.done
    clearInterval(watch)

    expect(got.status).toBe(200)
    expect(got.complete).toBe(true)
    expect(got.bytes).toBe(FILE.length)
    expect(got.hash).toBe(sha(FILE))
    expect(site!.opened[0]?.failedWith).toBeUndefined()
    // The window, and the response's own buffer before it reports it is full.
    expect(mostHeld).toBeLessThanOrEqual(2 * 1024 * 1024 + 64 * 1024)
    await until(() => relay.load.openStreams === 0)
  }, 60_000)

  it('holds a stalled browser\'s stream at its window, without failing it, and finishes when it reads again', async () => {
    const SIZE = 8 * 1024 * 1024
    const window = 256 * 1024
    const responses = await withSite(() => ({ head: head(SIZE), body: new Uint8Array(SIZE) }), { window, creditStep: 64 * 1024 })
    let res: import('node:http').IncomingMessage | null = null
    const req = request({ host: '127.0.0.1', port: relay.port, path: `/t/${relay.signer.sign(ticketClaims())}`, headers: { Host: FILES_HOST } }, r => {
      res = r
      r.pause()
    })
    req.on('error', () => {})
    req.end()
    await until(() => res !== null)
    await new Promise(r => setTimeout(r, 300))

    expect(site!.opened[0]?.failedWith).toBeUndefined()
    expect(responses[0]!.writableLength).toBeLessThanOrEqual(window + 64 * 1024)
    expect(relay.load.bytesCarried).toBeLessThan(SIZE)

    let got = 0
    const ended = new Promise<void>(resolve => {
      res!.on('data', (c: Buffer) => { got += c.length })
      res!.on('end', () => resolve())
    })
    res!.resume()
    await ended
    expect(got).toBe(SIZE)
  })

  it('serves another browser at full speed while one stream of the same site is stalled', async () => {
    const SIZE = 4 * 1024 * 1024
    await withSite(() => ({ head: head(SIZE), body: new Uint8Array(SIZE) }), { window: 128 * 1024 })
    const stalled = request({ host: '127.0.0.1', port: relay.port, path: `/t/${relay.signer.sign(ticketClaims({ person: 'p-1' }))}`, headers: { Host: FILES_HOST } }, r => r.pause())
    stalled.on('error', () => {})
    stalled.end()
    await until(() => relay.load.openStreams === 1)

    const other = await ask(relay.port, `/t/${relay.signer.sign(ticketClaims({ person: 'p-2' }))}`)
    expect(other.status).toBe(200)
    expect(other.body.length).toBe(SIZE)
    stalled.destroy()
  })

  it('cuts the stream of a site that sends past the window it was given', async () => {
    const window = 64 * 1024
    await withSite(async (_params, opened) => {
      // Raw frames, as a site ignoring the window would send them.
      site!.ws.send(encodeDataFrame(opened.id, encodeStreamHead(head(10 * window))))
      for (let i = 0; i < 4; i++) site!.ws.send(encodeDataFrame(opened.id, new Uint8Array(window)))
      return { end: false }
    }, { window })
    const a = await ask(relay.port, `/t/${relay.signer.sign(ticketClaims())}`).catch(() => null)
    expect(a?.body.length ?? 0).toBeLessThan(10 * window)
    await until(() => site!.opened[0]?.failedWith === 'protocol')
    await until(() => relay.load.openStreams === 0)
  })
})
