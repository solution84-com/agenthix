/**
 * A site on the relay's line, in the test's process: it dials the line with a pass and answers `files.serve` streams
 * with whatever the test's handler says — a head and bytes, or nothing at all.
 */
import WebSocket from 'ws'
import {
  RELAY_PROTOCOL_VERSION, RELAY_PROTOCOL_VERSION_HEADER, RELAY_SITE_ID_HEADER, RELAY_SITE_LINE_PATH, SITE_PROTOCOL_VERSION,
  SITE_PROTOCOL_VERSION_HEADER, StreamMux, encodeStreamHead, type FileServeHead,
} from '@agenthix/core'

export type Served = { head?: FileServeHead; body?: Uint8Array; raw?: Uint8Array[]; end?: boolean }
export type Opened = { id: number; method: string; params: unknown; cancelled: boolean; failedWith?: string }
export type SiteHandler = (params: unknown, opened: Opened) => Served | Promise<Served>

export type DialOptions = { port: number; pass: string; siteId?: string; headers?: Record<string, string> }

export function dialHeaders(o: DialOptions): Record<string, string> {
  return {
    Authorization: `Bearer ${o.pass}`,
    [RELAY_SITE_ID_HEADER]: o.siteId ?? 'site-1',
    [SITE_PROTOCOL_VERSION_HEADER]: SITE_PROTOCOL_VERSION,
    [RELAY_PROTOCOL_VERSION_HEADER]: RELAY_PROTOCOL_VERSION,
    ...o.headers,
  }
}

/** Dials and answers the HTTP status of the upgrade: 101 for a line taken, else the refusal's. */
export function dialStatus(o: DialOptions): Promise<{ status: number; headers: Record<string, unknown> }> {
  return new Promise(resolve => {
    const ws = new WebSocket(`ws://127.0.0.1:${o.port}${RELAY_SITE_LINE_PATH}`, { headers: dialHeaders(o) })
    ws.on('open', () => {
      ws.close()
      resolve({ status: 101, headers: {} })
    })
    ws.on('unexpected-response', (_req, res) => {
      res.resume()
      resolve({ status: res.statusCode ?? 0, headers: res.headers })
      ws.terminate()
    })
    ws.on('error', () => {})
  })
}

export class FakeSite {
  readonly opened: Opened[] = []
  private constructor(readonly ws: WebSocket, readonly mux: StreamMux) {}

  static async connect(o: DialOptions, handler: SiteHandler): Promise<FakeSite> {
    const ws = new WebSocket(`ws://127.0.0.1:${o.port}${RELAY_SITE_LINE_PATH}`, { headers: dialHeaders(o) })
    const mux = new StreamMux('server', {
      sendText: text => ws.send(text),
      sendBinary: bytes => new Promise((resolve, reject) => ws.send(bytes, err => (err ? reject(err) : resolve()))),
    })
    const site = new FakeSite(ws, mux)
    mux.onOpen = (id, method, params) => {
      const opened: Opened = { id, method, params, cancelled: false }
      site.opened.push(opened)
      mux.accept(id, {
        onData: () => {}, onEnd: () => {},
        onError: code => {
          opened.failedWith = code
          if (code === 'cancelled') opened.cancelled = true
        },
      })
      void (async () => {
        const served = await handler(params, opened)
        try {
          if (served.head) await mux.write(id, encodeStreamHead(served.head))
          for (const piece of served.raw ?? []) await mux.write(id, piece)
          if (served.body) await mux.write(id, served.body)
          if (served.end !== false) mux.end(id)
        } catch {
          // Cancelled while writing.
        }
      })()
    }
    ws.on('message', (data, isBinary) => {
      const buf = data as Buffer
      if (isBinary) mux.receiveBinary(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength))
      else mux.receiveText(buf.toString())
    })
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve())
      ws.once('unexpected-response', (_req, res) => reject(new Error(`refused ${res.statusCode}`)))
      ws.once('error', reject)
    })
    return site
  }

  close(): Promise<void> {
    return new Promise(resolve => {
      if (this.ws.readyState === WebSocket.CLOSED) return resolve()
      this.ws.once('close', () => resolve())
      this.ws.close()
    })
  }
}
