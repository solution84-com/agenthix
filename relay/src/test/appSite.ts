/**
 * A site on the relay's line that answers `app.serve` the way the test says: it reads the request's head and body,
 * then writes a head (core's framing) and a body, or for a WebSocket a `101` and echoes every message back. Credit for
 * the relay's bytes is granted as they arrive, as a real site does once it has taken them.
 */
import WebSocket from 'ws'
import {
  APP_SERVE_METHOD, APP_TICKET_ENTRY_SECONDS, APP_TICKET_TTL_SECONDS, HQ_TOKEN_ISSUER, RELAY_SITE_LINE_PATH, StreamMux,
  createAppWsReader, encodeAppResponseHead, encodeAppWsMessage, type AppResponseHead, type AppServeParams,
} from '@agenthix/core'
import { dialHeaders, type DialOptions } from './fakeSite'

export type AppAsked = { params: AppServeParams; body: Buffer; id: number; cancelled: boolean }
export type AppAnswer = { head: AppResponseHead; body?: Buffer | string; endAfter?: boolean }
export type AppHandler = (asked: AppAsked) => AppAnswer | Promise<AppAnswer>

export const APP_ID = 'abcdefghijklmnopqrstuvwxyz'
export const OTHER_APP_ID = 'zyxwvutsrqponmlkjihgfedcba'
export const PATTERN = 'https://p-{id}.preview.example.com'
export const appHost = (id = APP_ID) => `p-${id}.preview.example.com`
export const appOrigin = (id = APP_ID) => `https://${appHost(id)}`

let serial = 0
export function appTicketClaims(over: Record<string, unknown> = {}): Record<string, unknown> {
  const iat = Math.floor(Date.now() / 1000)
  serial++
  return {
    iss: HQ_TOKEN_ISSUER, aud: 'site-1', iat, exp: iat + APP_TICKET_TTL_SECONDS, tokenType: 'app-ticket',
    jti: `ticket-id-of-enough-randomness-${serial}`, site: 'site-1', relay: 'relay-1', person: 'person-1', livePreviewId: 'preview-1',
    workspaceId: 'ws-1', appId: APP_ID, entry: 'frame', cookie: 'frame', enterBy: iat + APP_TICKET_ENTRY_SECONDS,
    siteTicket: 'site-ticket', ...over,
  }
}

export class AppSite {
  readonly asked: AppAsked[] = []
  private constructor(readonly ws: WebSocket, readonly mux: StreamMux) {}

  static async connect(o: DialOptions, handler: AppHandler): Promise<AppSite> {
    const ws = new WebSocket(`ws://127.0.0.1:${o.port}${RELAY_SITE_LINE_PATH}`, { headers: dialHeaders(o) })
    const mux = new StreamMux('server', {
      sendText: text => ws.send(text),
      sendBinary: bytes => new Promise((resolve, reject) => ws.send(bytes, err => (err ? reject(err) : resolve()))),
    })
    const site = new AppSite(ws, mux)
    mux.onOpen = (id, method, params) => {
      if (method !== APP_SERVE_METHOD) return mux.fail(id, 'unknown_method', method)
      const asked: AppAsked = { params: params as AppServeParams, body: Buffer.alloc(0), id, cancelled: false }
      site.asked.push(asked)
      const ws = asked.params.request.websocket !== undefined
      const reader = createAppWsReader()
      let answered: Promise<void> | null = null
      const answer = async () => {
        const a = await handler(asked)
        await mux.write(id, encodeAppResponseHead(a.head))
        if (a.body !== undefined) await mux.write(id, Buffer.from(a.body))
        if (ws ? a.endAfter === true : a.endAfter !== false) mux.end(id)
      }
      mux.accept(id, {
        onData: chunk => {
          mux.credit(id, chunk.length)
          if (!ws) {
            asked.body = Buffer.concat([asked.body, Buffer.from(chunk)])
            return
          }
          const read = reader.push(chunk)
          if ('invalid' in read) return
          for (const m of read.messages) {
            void answered?.then(() => mux.write(id, encodeAppWsMessage(m.kind === 'close' ? m : { kind: m.kind, payload: m.payload })))
              .then(() => { if (m.kind === 'close') mux.end(id) })
              .catch(() => {})
          }
        },
        onEnd: () => {
          if (!ws) answered = answer().catch(() => {})
        },
        onError: code => {
          if (code === 'cancelled') asked.cancelled = true
        },
      })
      if (ws) answered = answer().catch(() => {})
    }
    ws.on('message', (data, isBinary) => {
      const buf = data as Buffer
      if (isBinary) mux.receiveBinary(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength))
      else mux.receiveText(buf.toString())
    })
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve())
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
