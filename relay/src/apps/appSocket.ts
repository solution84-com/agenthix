/**
 * One WebSocket to a live app (a dev server's hot reload, the app's own sockets), carried on its own `app.serve`
 * stream: the handshake is answered only once the site says the app accepted it (`101` and the subprotocol it chose),
 * then messages pass both ways framed by core's `encodeAppWsMessage`. Pings stay on each hop; `ws` answers the
 * browser's. The site's messages are credited only once the browser's socket has taken them.
 */
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocketServer, type WebSocket } from 'ws'
import {
  APP_SERVE_METHOD, APP_WS_MAX_MESSAGE_BYTES, createAppResponseHeadReader, createAppWsReader, encodeAppWsMessage,
  type AppServeParams, type AppWsMessage, type StreamMux,
} from '@agenthix/core'
import { refuseSocket, refuseSocketForSite } from './appAnswers'

export type SocketOptions = {
  headTimeoutMs: number
  window: number
  carried(bytes: number): void
  done(): void
}

const chosen = new WeakMap<IncomingMessage, string | null>()

const wss = new WebSocketServer({
  noServer: true,
  maxPayload: APP_WS_MAX_MESSAGE_BYTES,
  perMessageDeflate: false,
  handleProtocols: (_offered, req) => chosen.get(req) ?? false,
})

function closePayload(code: number, reason: Buffer): Uint8Array {
  const out = Buffer.alloc(2 + reason.length)
  out.writeUInt16BE(code, 0)
  reason.copy(out, 2)
  return out
}

function closeFrom(payload: Uint8Array): { code: number; reason: string } | null {
  if (payload.length < 2) return null
  const b = Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength)
  return { code: b.readUInt16BE(0), reason: b.subarray(2, 125).toString('utf8') }
}

export function carryAppSocket(
  mux: StreamMux, params: AppServeParams, req: IncomingMessage, socket: Duplex, upgradeHead: Buffer, o: SocketOptions,
): () => void {
  const head = createAppResponseHeadReader()
  const messages = createAppWsReader()
  let phase: 'head' | 'open' | 'done' = 'head'
  let id = -1
  let browser: WebSocket | null = null
  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    clearTimeout(timer)
    o.done()
  }
  const end = () => {
    if (phase === 'done') return
    phase = 'done'
    mux.cancel(id)
    if (browser) browser.terminate()
    else socket.destroy()
    finish()
  }
  const timer = setTimeout(() => {
    if (phase !== 'head') return
    phase = 'done'
    mux.cancel(id)
    refuseSocket(socket, 504, 'This app did not answer in time.')
    finish()
  }, o.headTimeoutMs)
  timer.unref?.()
  socket.on('close', () => { if (!browser) end() })

  const toBrowser = (m: AppWsMessage) => {
    const ws = browser
    if (!ws) return
    o.carried(m.payload.length)
    if (m.kind === 'close') {
      const c = closeFrom(m.payload)
      try {
        ws.close(c?.code, c?.reason)
      } catch {
        ws.close()
      }
      return
    }
    const bytes = m.payload.length + 5
    ws.send(Buffer.from(m.payload.buffer, m.payload.byteOffset, m.payload.byteLength), { binary: m.kind === 'binary' }, () => {
      if (phase === 'open') mux.credit(id, bytes)
    })
  }

  const opened = (rest: Uint8Array, protocol: string | null) => {
    chosen.set(req, protocol)
    wss.handleUpgrade(req, socket, upgradeHead, ws => {
      browser = ws
      if (phase !== 'head') {
        ws.terminate()
        return
      }
      phase = 'open'
      ws.on('message', (data, isBinary) => {
        if (phase !== 'open') return
        const buf = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer)
        ws.pause()
        mux.write(id, encodeAppWsMessage({ kind: isBinary ? 'binary' : 'text', payload: buf }))
          .then(() => ws.resume(), () => end())
      })
      ws.on('close', (code, reason) => {
        if (phase === 'open') {
          phase = 'done'
          const payload = code >= 1000 && code < 5000 && code !== 1005 && code !== 1006 ? closePayload(code, reason) : new Uint8Array(0)
          mux.write(id, encodeAppWsMessage({ kind: 'close', payload }))
            .then(() => mux.end(id), () => mux.cancel(id))
        }
        finish()
      })
      ws.on('error', () => end())
      if (rest.length) siteBytes(rest)
    })
  }

  const siteBytes = (chunk: Uint8Array) => {
    const read = messages.push(chunk)
    if ('invalid' in read) {
      browser?.close(1009)
      end()
      return
    }
    for (const m of read.messages) toBrowser(m)
  }

  id = mux.open(APP_SERVE_METHOD, params, {
    onData: chunk => {
      if (phase === 'open') return siteBytes(chunk)
      if (phase !== 'head' || browser) return
      const read = head.push(chunk)
      if (read.state === 'need-more') return
      clearTimeout(timer)
      if (read.state === 'invalid') {
        phase = 'done'
        mux.cancel(id)
        refuseSocket(socket, 502, 'The site running this app answered in a way the relay does not read.')
        return finish()
      }
      if (chunk.length > read.rest.length) mux.credit(id, chunk.length - read.rest.length)
      const h = read.head
      if ('refusal' in h) {
        phase = 'done'
        mux.cancel(id)
        refuseSocketForSite(socket, h.refusal)
        return finish()
      }
      if (h.status !== 101 || !h.websocket) {
        phase = 'done'
        mux.cancel(id)
        refuseSocket(socket, h.status === 101 ? 502 : h.status, 'This app did not take the connection.')
        return finish()
      }
      opened(read.rest, h.websocket.protocol)
    },
    onEnd: () => {
      mux.end(id)
      if (phase === 'head' && !browser) {
        phase = 'done'
        refuseSocket(socket, 502, 'The site running this app ended without answering.')
        return finish()
      }
      if (phase === 'open') {
        phase = 'done'
        browser?.close()
      }
    },
    onError: () => {
      if (phase === 'done') return
      if (phase === 'head' && !browser) {
        phase = 'done'
        refuseSocket(socket, 502, 'The site running this app could not carry this connection.')
        return finish()
      }
      phase = 'done'
      browser?.terminate()
      finish()
    },
  }, { window: o.window, duplex: true })
  return end
}
