/**
 * A Git bundle carried between two sites' lines (live preview spec section 5, *On another site*): the source's head and bytes passed to the
 * destination with flow control on both, and only what the sites cannot say reported to hq. Fake sites on in-process
 * lines, no network.
 */
import { describe, expect, it } from 'vitest'
import {
  StreamMux, createBundleReadHeadReader, encodeBundleReadHead, encodeBundleWriteHead,
  type BundleReadHead, type RelayBundleReport,
} from '@agenthix/core'
import { BundleCarrier, readBundleOrder } from '../bundles/carryBundle'
import { Load } from '../load'
import { SiteLines, type LineSocket } from '../lines/siteLines'
import { until } from '../test/harness'

type Opened = { method: string; params: unknown; id: number; mux: StreamMux; got: Buffer[]; ended: boolean; failed: boolean }

/** A site on a line: each stream the relay opens is handed to `serve`. */
function fakeSite(lines: SiteLines, siteId: string, serve: (s: Opened) => void): void {
  let relaySide!: StreamMux
  const site = new StreamMux('server', {
    sendText: t => relaySide.receiveText(t),
    sendBinary: async b => relaySide.receiveBinary(b),
  })
  const socket: LineSocket = {
    send: (data, cb) => {
      if (typeof data === 'string') site.receiveText(data)
      else site.receiveBinary(data)
      cb?.()
    },
    close: () => {},
    readyState: 1,
    OPEN: 1,
  }
  relaySide = lines.add(siteId, socket)
  site.onOpen = (id, method, params) => {
    const opened: Opened = { method, params, id, mux: site, got: [], ended: false, failed: false }
    site.accept(id, {
      onData: b => {
        opened.got.push(Buffer.from(b))
        site.credit(id, b.length)
      },
      onEnd: () => { opened.ended = true },
      onError: () => { opened.failed = true },
    })
    serve(opened)
  }
}

const order = (from = 'site-a', to = 'site-b') => ({ type: 'relay.bundle' as const, version: '1.1', transferId: 'transfer_0123456789abcdefghij', ticket: 'eyJ.t.s', from, to })
const BYTES = Buffer.alloc(3 * 1024 * 1024, 7)

function setup(source: (s: Opened) => void, destination: (s: Opened) => void = () => {}) {
  const lines = new SiteLines()
  const reports: RelayBundleReport[] = []
  const load = new Load()
  const carrier = new BundleCarrier({ lines, load, log: () => {}, report: r => { reports.push(r) }, window: 64 * 1024 })
  const opened: Opened[] = []
  fakeSite(lines, 'site-a', s => { opened.push(s); source(s) })
  fakeSite(lines, 'site-b', s => { opened.push(s); destination(s) })
  return { carrier, reports, opened, load }
}

async function serveFile(s: Opened, head: BundleReadHead, bytes: Buffer): Promise<void> {
  await s.mux.write(s.id, encodeBundleReadHead(head))
  if (head.ok) await s.mux.write(s.id, bytes)
  s.mux.end(s.id)
}

describe('a bundle carried between two lines @SC-1753', () => {
  it('passes the source\'s head and every byte to the destination, within the source\'s window', async () => {
    const { carrier, reports, opened, load } = setup(s => { void serveFile(s, { ok: true, size: BYTES.length }, BYTES) }, s => {
      const wait = setInterval(() => {
        if (!s.ended) return
        clearInterval(wait)
        void s.mux.write(s.id, encodeBundleWriteHead({ ok: true, sha256: 'a'.repeat(64), size: BYTES.length })).then(() => s.mux.end(s.id))
      }, 5)
    })
    carrier.carry(order())
    await until(() => reports.length === 1, 5000)
    expect(reports[0]).toMatchObject({ type: 'relay.bundleReport', transferId: order().transferId, outcome: { done: true } })
    const write = opened.find(o => o.method === 'bundle.write')!
    expect(write.params).toEqual({ ticket: order().ticket })
    const all = Buffer.concat(write.got)
    const read = createBundleReadHeadReader().push(all)
    if (read.state !== 'head') throw new Error('no head')
    expect(read.head).toEqual({ ok: true, size: BYTES.length })
    expect(Buffer.from(read.rest).equals(BYTES)).toBe(true)
    expect(load.bytesCarried).toBeGreaterThan(0)
  })

  it('reports an end that holds no line, naming it, and opens nothing', () => {
    const { carrier, reports, opened } = setup(() => {})
    carrier.carry(order('site-a', 'site-gone'))
    expect(reports).toMatchObject([{ outcome: { done: false, failure: 'offline', site: 'site-gone' } }])
    expect(opened).toEqual([])
  })

  it('reports the source\'s refusal and never opens the destination', async () => {
    const { carrier, reports, opened } = setup(s => { void serveFile(s, { ok: false, refusal: 'not-found' }, Buffer.alloc(0)) })
    carrier.carry(order())
    await until(() => reports.length === 1)
    expect(reports[0].outcome).toEqual({ done: false, failure: 'source-refused', site: 'site-a', refusal: 'not-found' })
    expect(opened.map(o => o.method)).toEqual(['bundle.read'])
  })

  it('cancels the destination when the source breaks part-way, so nothing lands', async () => {
    const { carrier, reports, opened } = setup(s => {
      void s.mux.write(s.id, encodeBundleReadHead({ ok: true, size: BYTES.length })).then(() => s.mux.write(s.id, BYTES.subarray(0, 1000)))
        .then(() => s.mux.fail(s.id, 'handler_failed', 'disk went away'))
    })
    carrier.carry(order())
    await until(() => reports.length === 1)
    expect(reports[0].outcome).toMatchObject({ done: false, failure: 'broken', site: 'site-a' })
    await until(() => opened.find(o => o.method === 'bundle.write')?.failed === true)
  })

  it('reads only a well-formed order', () => {
    expect(readBundleOrder(order())).toEqual(order())
    expect(readBundleOrder({ ...order(), from: '../x' })).toBeNull()
    expect(readBundleOrder({ ...order(), ticket: '' })).toBeNull()
    expect(readBundleOrder({ ...order(), type: 'relay.revoke' })).toBeNull()
  })
})
