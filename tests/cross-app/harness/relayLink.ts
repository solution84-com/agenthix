// A WebSocket client for hq's two host-management links (/console-link and
// /host-link), speaking their frames as core's relay.ts defines them. The
// stand-in Fleet Console and host service (fleetConsole.ts) are built on it.
//
// `ws` is loaded from hq's own node_modules, as db.ts loads each app's Prisma
// client: this package has no dependency of its own on it, and Node's built-in
// WebSocket cannot send the Authorization header both links require.
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { HOST_PROTOCOL_VERSION, HOST_PROTOCOL_VERSION_HEADER } from '../../../core/dist/index.js'
import { HQ_ROOT, HQ_URL } from './env'

type WsLike = {
  readyState: number
  send(data: string): void
  close(code?: number): void
  terminate(): void
  on(event: 'message', fn: (data: Buffer) => void): void
  on(event: 'close', fn: (code: number) => void): void
  on(event: 'error', fn: (err: Error) => void): void
  once(event: 'open', fn: () => void): void
  once(event: 'unexpected-response', fn: (req: unknown, res: { statusCode?: number }) => void): void
}

const require = createRequire(import.meta.url)
const WebSocket: new (url: string, options: { headers: Record<string, string> }) => WsLike = require(
  join(HQ_ROOT, 'node_modules/ws'),
)
const OPEN = 1

// `any`: a payload's shape depends on the frame's type, and the tests read only the fields they assert on.
export type Frame = { version: string; type: string; payload: any; requestId?: string; replyTo?: string }

type Waiter = { match: (f: Frame) => boolean; resolve: (f: Frame) => void }

/** An upgrade hq refused, with the HTTP status it answered. */
export class LinkRefused extends Error {
  constructor(readonly status: number) {
    super(`hq refused the link with HTTP ${status}`)
  }
}

export class RelayLink {
  private readonly unread: Frame[] = []
  private readonly waiters: Waiter[] = []
  /** Resolves with the close code once hq (or this side) closes the link. */
  readonly closed: Promise<number>

  private constructor(private readonly ws: WsLike) {
    this.closed = new Promise(resolve => ws.on('close', code => resolve(code)))
    ws.on('error', () => {})
    ws.on('message', raw => {
      let f: Frame
      try {
        f = JSON.parse(raw.toString())
      } catch {
        return
      }
      // hq terminates a link silent for two ping intervals.
      if (f.type === 'ping') return void this.send('pong', {})
      const i = this.waiters.findIndex(w => w.match(f))
      if (i >= 0) this.waiters.splice(i, 1)[0].resolve(f)
      else this.unread.push(f)
    })
  }

  /** Dials one of the links; rejects with LinkRefused when hq answers the upgrade with an HTTP status instead. */
  static dial(path: string, headers: Record<string, string>): Promise<RelayLink> {
    const ws = new WebSocket(HQ_URL.replace(/^http/, 'ws') + path, {
      headers: { [HOST_PROTOCOL_VERSION_HEADER]: HOST_PROTOCOL_VERSION, ...headers },
    })
    return new Promise((resolve, reject) => {
      ws.once('open', () => resolve(new RelayLink(ws)))
      ws.once('unexpected-response', (_req, res) => {
        reject(new LinkRefused(res.statusCode ?? 0))
        ws.terminate()
      })
      ws.on('error', err => reject(err))
    })
  }

  get open(): boolean {
    return this.ws.readyState === OPEN
  }

  send(type: string, payload: unknown, extra: { requestId?: string; replyTo?: string } = {}): void {
    if (this.open) this.ws.send(JSON.stringify({ version: HOST_PROTOCOL_VERSION, type, payload, ...extra }))
  }

  /** The first frame of this type, or of one of these types, (and match) not read yet, waiting for it if need be. */
  next(type: string | string[], match: (f: Frame) => boolean = () => true, ms = 30_000): Promise<Frame> {
    const types = Array.isArray(type) ? type : [type]
    const test = (f: Frame) => types.includes(f.type) && match(f)
    const i = this.unread.findIndex(test)
    if (i >= 0) return Promise.resolve(this.unread.splice(i, 1)[0])
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        match: test,
        resolve: f => {
          clearTimeout(timer)
          resolve(f)
        },
      }
      const timer = setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(waiter), 1)
        reject(new Error(`no '${types.join("' or '")}' frame within ${ms / 1000}s`))
      }, ms)
      this.waiters.push(waiter)
    })
  }

  /** Whether a frame of this type arrives within `ms`: for checking that something was NOT passed on. */
  async receives(type: string | string[], match: (f: Frame) => boolean = () => true, ms = 3_000): Promise<boolean> {
    return this.next(type, match, ms).then(() => true, () => false)
  }

  close(): void {
    this.ws.close()
  }
}
