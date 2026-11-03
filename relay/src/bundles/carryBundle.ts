/**
 * A Git bundle carried between two sites' lines (live preview spec section 5, *On another site*): hq orders it with
 * `relay.bundle`, and the relay opens `bundle.read` on the source's line and `bundle.write`, duplex, on the
 * destination's. On the write stream it sends the source's `BundleReadHead` first, then the bundle's bytes, then ends
 * its half; the destination answers one `BundleWriteHead`. It decides nothing and keeps nothing: each site verifies the
 * ticket itself, and the destination checks the bytes against the ticket's size and SHA-256 before it keeps them.
 *
 * Flow control on both ends: the source sends a window and then waits for credit, which the relay grants only once
 * the bytes it passed on were taken by the destination's window. A slow destination slows only this bundle, and the
 * relay holds about one window of it.
 *
 * The relay reports to hq only what the sites cannot: an end offline, the source's refusal, a stream that broke. The
 * destination reports what it kept itself (`bundle.landed`). The ticket is never logged.
 */
import {
  BUNDLE_METHODS, RELAY_PROTOCOL_VERSION, createBundleReadHeadReader, createBundleWriteHeadReader, encodeBundleReadHead,
  type RelayBundleFailure, type RelayBundleOrder, type RelayBundleReport, type StreamMux,
} from '@agenthix/core'
import type { Load } from '../load'
import type { Log } from '../log'
import type { SiteLines } from '../lines/siteLines'

export type BundleCarrierOptions = {
  lines: SiteLines
  load: Load
  log: Log
  report(report: RelayBundleReport): void
  /** How long the source has to answer its head. */
  openTimeoutMs?: number
  /** Bytes the source may send before it waits for credit. */
  window?: number
}

const OPEN_TIMEOUT_MS = 30_000
const WINDOW = 1024 * 1024
/** Bundles carried at once; an order past it is reported broken, and the person tries again. */
export const BUNDLES_CARRIED_AT_ONCE = 32
const MAX_TICKET = 16 * 1024
const ID = /^[A-Za-z0-9_-]{1,128}$/

export function readBundleOrder(v: unknown): RelayBundleOrder | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  if (o.type !== 'relay.bundle' || typeof o.version !== 'string') return null
  if (typeof o.transferId !== 'string' || !ID.test(o.transferId)) return null
  if (typeof o.ticket !== 'string' || o.ticket.length === 0 || o.ticket.length > MAX_TICKET) return null
  if (typeof o.from !== 'string' || !ID.test(o.from) || typeof o.to !== 'string' || !ID.test(o.to)) return null
  return { type: 'relay.bundle', version: o.version, transferId: o.transferId, ticket: o.ticket, from: o.from, to: o.to }
}

export class BundleCarrier {
  private readonly carrying = new Set<string>()

  constructor(private readonly options: BundleCarrierOptions) {}

  get carried(): number {
    return this.carrying.size
  }

  carry(order: RelayBundleOrder): void {
    const { transferId } = order
    const tell = (outcome: RelayBundleReport['outcome']) =>
      this.options.report({ type: 'relay.bundleReport', version: RELAY_PROTOCOL_VERSION, transferId, outcome })
    if (this.carrying.has(transferId)) return
    if (this.carrying.size >= BUNDLES_CARRIED_AT_ONCE) return tell({ done: false, failure: 'broken' })
    const source = this.options.lines.current(order.from)
    if (!source) return tell({ done: false, failure: 'offline', site: order.from })
    const destination = this.options.lines.current(order.to)
    if (!destination) return tell({ done: false, failure: 'offline', site: order.to })
    this.carrying.add(transferId)
    const stream = new CarriedBundle(order, source, destination, this.options, outcome => {
      this.carrying.delete(transferId)
      this.options.lines.settle(source)
      this.options.lines.settle(destination)
      tell(outcome)
    })
    stream.start()
  }
}

class CarriedBundle {
  private phase: 'head' | 'body' | 'ending' | 'done' = 'head'
  private readId = -1
  private writeId = -1
  private chain: Promise<void> = Promise.resolve()
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly order: RelayBundleOrder,
    private readonly source: StreamMux,
    private readonly destination: StreamMux,
    private readonly options: BundleCarrierOptions,
    private readonly finished: (outcome: RelayBundleReport['outcome']) => void,
  ) {}

  start(): void {
    const reader = createBundleReadHeadReader()
    this.timer = setTimeout(() => this.fail('broken', this.order.from), this.options.openTimeoutMs ?? OPEN_TIMEOUT_MS)
    this.timer.unref?.()
    this.readId = this.source.open(BUNDLE_METHODS.read, { ticket: this.order.ticket }, {
      onData: chunk => {
        if (this.phase === 'body') return this.pass(chunk)
        if (this.phase !== 'head') return
        const read = reader.push(chunk)
        if (read.state === 'need-more') return
        this.clearTimer()
        if (read.state === 'invalid') return this.fail('broken', this.order.from)
        if (!read.head.ok) return this.end({ done: false, failure: 'source-refused', site: this.order.from, refusal: read.head.refusal })
        this.openWrite(encodeBundleReadHead(read.head), chunk.length - read.rest.length)
        this.phase = 'body'
        this.pass(read.rest)
      },
      onEnd: () => {
        this.source.end(this.readId)
        if (this.phase === 'head') return this.fail('broken', this.order.from)
        if (this.phase !== 'body') return
        this.phase = 'ending'
        this.chain = this.chain.then(() => this.destination.end(this.writeId)).catch(() => this.fail('broken', this.order.to))
      },
      onError: () => {
        if (this.phase === 'head' || this.phase === 'body') this.fail('broken', this.order.from)
      },
    }, { window: this.options.window ?? WINDOW })
  }

  private openWrite(head: Uint8Array, headBytes: number): void {
    const reader = createBundleWriteHeadReader()
    let answered = false
    this.writeId = this.destination.open(BUNDLE_METHODS.write, { ticket: this.order.ticket }, {
      onData: chunk => {
        if (answered) return
        const read = reader.push(chunk)
        if (read.state === 'need-more') return
        answered = true
        // The destination's answer, whatever it is, is the bundle's end: what it says is its own report to hq.
        if (read.state === 'invalid') return this.fail('broken', this.order.to)
        this.end({ done: true })
      },
      onEnd: () => {
        if (!answered) this.fail('broken', this.order.to)
      },
      onError: () => {
        if (!answered) this.fail('broken', this.order.to)
      },
    }, { duplex: true })
    this.chain = this.chain.then(() => this.destination.write(this.writeId, head)).then(() => this.grant(headBytes))
  }

  /** Passes `bytes` on once what went before has; credit goes back to the source only once the destination took them. */
  private pass(bytes: Uint8Array): void {
    if (bytes.length === 0) return
    const chunk = bytes.slice()
    this.chain = this.chain
      .then(async () => {
        if (this.phase === 'done') return
        await this.destination.write(this.writeId, chunk)
        this.options.load.carry(chunk.length)
        this.grant(chunk.length)
      })
      .catch(() => this.fail('broken', this.order.to))
  }

  private grant(bytes: number): void {
    if (this.phase === 'done' || bytes <= 0) return
    try {
      this.source.credit(this.readId, bytes)
    } catch { /* the source's stream is over */ }
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private fail(failure: RelayBundleFailure, site: string): void {
    this.end({ done: false, failure, site })
  }

  private end(outcome: RelayBundleReport['outcome']): void {
    if (this.phase === 'done') return
    this.phase = 'done'
    this.clearTimer()
    this.source.cancel(this.readId)
    if (this.writeId !== -1) {
      if (outcome.done) this.destination.end(this.writeId)
      else this.destination.cancel(this.writeId)
    }
    if (!outcome.done) this.options.log(`a bundle between ${this.order.from} and ${this.order.to} did not finish: ${outcome.failure}`)
    this.finished(outcome)
  }
}
