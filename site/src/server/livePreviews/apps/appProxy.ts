/**
 * One `app.serve` stream carried to the app's port (live preview spec section 4, *The app*): an HTTP request, or a
 * WebSocket the app accepts, over a connection made inside the live preview's own network (`appConnect.ts`). The site
 * addresses the app itself (`Host: localhost:<port>`, as a dev server expects),
 * passes the browser's request headers as the relay gave them, and answers with core's head, then the body or the
 * app's messages. Backpressure holds both ways: the relay's bytes are credited only as the app takes them, and the
 * app's body is read only as fast as the relay's window lets it go.
 */
import { request as httpRequest, type IncomingMessage } from 'node:http'
import WebSocket from 'ws'
import {
  APP_HOP_BY_HOP_HEADERS, APP_WS_MAX_MESSAGE_BYTES, appRefusalHead, createAppWsReader, encodeAppResponseHead,
  encodeAppWsMessage, isAppResponseHead, type AppHeader, type AppRequestHead, type AppResponseHead,
} from '@agenthix/core'
import type { Duplex } from 'node:stream'
import type { ContentStream } from '../../hq/content/contentStream'

const HOP = new Set<string>(APP_HOP_BY_HOP_HEADERS)
/** Messages the browser sent that the app has not taken yet; past it the relay's stream waits. */
const MAX_BUFFERED_TO_APP = 1024 * 1024

/** The app's port, and the connection to it the request travels over. */
export type Target = { port: number; connect: () => Duplex }

function headersFor(request: AppRequestHead, target: Target): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [name, value] of request.headers) {
    if (HOP.has(name) || name.startsWith('sec-websocket-')) continue
    out[name] = name in out ? `${out[name]}${name === 'cookie' ? '; ' : ', '}${value}` : value
  }
  out.host = `localhost:${target.port}`
  return out
}

function appHeaders(raw: string[]): AppHeader[] {
  const out: AppHeader[] = []
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const name = raw[i].toLowerCase()
    if (!HOP.has(name)) out.push([name, raw[i + 1]])
  }
  return out
}

/** Writes the head; a head the relay could not read (too many headers, an odd value) is answered as a failure. */
function writeHead(stream: ContentStream, head: AppResponseHead): void {
  stream.write(Buffer.from(encodeAppResponseHead(isAppResponseHead(head) ? head : appRefusalHead('failed'))))
}

export function endWith(stream: ContentStream, head: AppResponseHead): Promise<void> {
  return new Promise(resolve => {
    if (stream.destroyed || stream.writableEnded) return resolve()
    stream.once('close', () => resolve())
    stream.end(Buffer.from(encodeAppResponseHead(head)), () => resolve())
  })
}

export function proxyHttp(stream: ContentStream, request: AppRequestHead, target: Target): Promise<void> {
  return new Promise(resolve => {
    let answered = false
    const req = httpRequest({
      host: 'localhost', port: target.port, method: request.method, path: request.target,
      headers: headersFor(request, target), setHost: false,
      createConnection: () => target.connect() as unknown as import('node:net').Socket,
    })
    const fail = () => {
      if (!answered) {
        answered = true
        void endWith(stream, appRefusalHead('app-unreachable')).then(resolve)
      } else {
        stream.destroy()
        resolve()
      }
    }
    req.on('error', fail)
    req.on('response', (res: IncomingMessage) => {
      answered = true
      const head: AppResponseHead = { status: res.statusCode ?? 502, headers: appHeaders(res.rawHeaders) }
      writeHead(stream, head)
      if (!isAppResponseHead(head)) {
        res.destroy()
        stream.end()
        return resolve()
      }
      res.pipe(stream)
      res.on('end', () => resolve())
      res.on('error', () => { stream.destroy(); resolve() })
    })
    stream.on('close', () => {
      req.destroy()
      resolve()
    })
    stream.pipe(req)
  })
}

export function proxySocket(stream: ContentStream, request: AppRequestHead, target: Target): Promise<void> {
  return new Promise(resolve => {
    const protocols = request.websocket?.protocols ?? []
    const app = new WebSocket(`ws://localhost:${target.port}${request.target}`, protocols, {
      headers: headersFor(request, target), perMessageDeflate: false, maxPayload: APP_WS_MAX_MESSAGE_BYTES, followRedirects: false,
      createConnection: () => target.connect() as unknown as import('node:net').Socket,
    })
    let opened = false
    let upgraded = false
    let done = false
    const finish = () => {
      if (done) return
      done = true
      resolve()
    }
    app.on('unexpected-response', (_req, res) => {
      opened = true
      writeHead(stream, { status: res.statusCode === 101 ? 502 : res.statusCode ?? 502, headers: appHeaders(res.rawHeaders) })
      res.pipe(stream)
      res.on('end', finish)
      res.on('error', () => { stream.destroy(); finish() })
    })
    app.on('error', () => {
      if (!opened) {
        opened = true
        void endWith(stream, appRefusalHead('app-unreachable')).then(finish)
        return
      }
      stream.destroy()
      finish()
    })
    app.on('open', () => {
      opened = true
      upgraded = true
      writeHead(stream, { status: 101, headers: [], websocket: { protocol: app.protocol || null } })
      const reader = createAppWsReader()
      stream.on('data', (chunk: Buffer) => {
        const read = reader.push(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength))
        if ('invalid' in read) {
          app.close(1009)
          stream.destroy()
          return
        }
        for (const m of read.messages) {
          if (m.kind === 'close') {
            const b = Buffer.from(m.payload)
            try {
              if (b.length >= 2) app.close(b.readUInt16BE(0), b.subarray(2).toString('utf8'))
              else app.close()
            } catch {
              app.close()
            }
            continue
          }
          app.send(Buffer.from(m.payload), { binary: m.kind === 'binary' }, () => {
            if (stream.isPaused() && app.bufferedAmount < MAX_BUFFERED_TO_APP) stream.resume()
          })
        }
        if (app.bufferedAmount >= MAX_BUFFERED_TO_APP) stream.pause()
      })
      stream.on('end', () => app.close())
    })
    app.on('message', (data, isBinary) => {
      const payload = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer)
      if (!stream.write(Buffer.from(encodeAppWsMessage({ kind: isBinary ? 'binary' : 'text', payload })))) {
        app.pause()
        stream.once('drain', () => app.resume())
      }
    })
    app.on('close', (code, reason) => {
      if (upgraded && !stream.destroyed && !stream.writableEnded) {
        const payload = code >= 1000 && code < 5000 && code !== 1005 && code !== 1006
          ? Buffer.concat([Buffer.from([code >> 8, code & 255]), reason])
          : Buffer.alloc(0)
        stream.end(Buffer.from(encodeAppWsMessage({ kind: 'close', payload })))
      }
      finish()
    })
    stream.on('close', () => {
      app.terminate()
      finish()
    })
  })
}
