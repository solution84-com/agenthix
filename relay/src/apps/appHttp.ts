/**
 * One HTTP request to a live app, carried on its own `app.serve` stream on the site's line (live preview spec section 4,
 * *The app*): the request's body toward the site, the site's head and the app's body back. Both directions are windowed
 * (a duplex stream), so a slow browser or a slow app holds back only its own stream: the browser's body is read only as
 * the site grants credit, and the site is granted credit only as the browser's response drains.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  APP_SERVE_METHOD, createAppResponseHeadReader, withoutCookieDomain, type AppResponseHead, type AppServeParams,
  type ContentErrorCode, type StreamMux,
} from '@agenthix/core'
import { answerSiteRefusal, answerWords, frameAncestors } from './appAnswers'

export type CarryOptions = {
  hqOrigin: string | null
  headTimeoutMs: number
  window: number
  creditStep: number
  carried(bytes: number): void
  /** Once, when the browser's response is over however it ended. */
  done(): void
}

/** The app's head as the browser gets it: its cookies kept to its own address, framing kept to hq and itself. */
export function writeAppHead(res: ServerResponse, head: Extract<AppResponseHead, { headers: unknown }>, hqOrigin: string | null): void {
  const headers = new Map<string, string[]>()
  for (const [name, value] of head.headers) {
    const kept = name === 'set-cookie' ? withoutCookieDomain(value) : value
    if (kept === null) continue
    headers.set(name, [...(headers.get(name) ?? []), kept])
  }
  headers.set('content-security-policy', [...(headers.get('content-security-policy') ?? []), frameAncestors(hqOrigin)])
  for (const [name, values] of headers) res.setHeader(name, values.length === 1 ? values[0] : values)
  res.writeHead(head.status)
}

function answerStreamError(res: ServerResponse, code: ContentErrorCode, hqOrigin: string | null): void {
  if (code === 'offline' || code === 'disconnected') {
    answerWords(res, 503, 'The site running this app went away. Try again in a moment.', hqOrigin, { 'Retry-After': '5' })
  } else if (code === 'timeout') {
    answerWords(res, 504, 'This app did not answer in time.', hqOrigin)
  } else {
    answerWords(res, 502, 'The site running this app could not carry this request.', hqOrigin)
  }
}

/** Opens the stream and carries the request; the returned function ends it at once (revoked, run out). */
export function carryAppRequest(
  mux: StreamMux, params: AppServeParams, req: IncomingMessage, res: ServerResponse, o: CarryOptions,
): () => void {
  const reader = createAppResponseHeadReader()
  let phase: 'head' | 'body' | 'done' = 'head'
  let id = -1
  let owed = 0
  let draining = false
  const step = Math.max(1, Math.min(o.creditStep, Math.floor(o.window / 2)))

  const grant = () => {
    if (phase === 'done' || owed === 0) return
    mux.credit(id, owed)
    owed = 0
  }
  const taken = (bytes: number, flowing: boolean) => {
    owed += bytes
    if (draining) return
    if (flowing) {
      if (owed >= step) grant()
      return
    }
    draining = true
    res.once('drain', () => {
      draining = false
      grant()
    })
  }
  const stop = () => {
    if (phase === 'done') return
    phase = 'done'
    clearTimeout(timer)
    mux.cancel(id)
    req.resume()
  }
  const timer = setTimeout(() => {
    if (phase !== 'head') return
    stop()
    answerStreamError(res, 'timeout', o.hqOrigin)
  }, o.headTimeoutMs)
  timer.unref?.()

  const pass = (bytes: Uint8Array) => {
    if (bytes.length === 0) return
    o.carried(bytes.length)
    taken(bytes.length, res.write(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)))
  }

  res.on('close', () => {
    stop()
    o.done()
  })

  id = mux.open(APP_SERVE_METHOD, params, {
    onData: chunk => {
      if (phase === 'body') return pass(chunk)
      if (phase !== 'head') return
      owed += chunk.length
      const read = reader.push(chunk)
      if (read.state === 'need-more') return
      clearTimeout(timer)
      if (read.state === 'invalid') {
        stop()
        return answerWords(res, 502, 'The site running this app answered in a way the relay does not read.', o.hqOrigin)
      }
      const head = read.head
      if ('refusal' in head) {
        stop()
        return answerSiteRefusal(res, head.refusal, o.hqOrigin)
      }
      // A WebSocket's answer on a plain request is not this protocol.
      if (head.status === 101) {
        stop()
        return answerWords(res, 502, 'The site running this app answered in a way the relay does not read.', o.hqOrigin)
      }
      try {
        writeAppHead(res, head, o.hqOrigin)
      } catch {
        stop()
        return answerWords(res, 502, 'This app answered with headers the relay cannot pass on.', o.hqOrigin)
      }
      phase = 'body'
      owed -= read.rest.length
      taken(0, true)
      pass(read.rest)
    },
    onEnd: () => {
      const was = phase
      phase = 'done'
      clearTimeout(timer)
      mux.end(id)
      req.resume()
      if (was === 'head') answerWords(res, 502, 'The site running this app ended without answering.', o.hqOrigin)
      else if (was === 'body') res.end()
    },
    onError: code => {
      const was = phase
      phase = 'done'
      clearTimeout(timer)
      req.resume()
      if (was === 'head') answerStreamError(res, code, o.hqOrigin)
      else if (was === 'body') res.destroy()
    },
  }, { window: o.window, duplex: true })

  sendBody(mux, id, req, () => phase === 'done')
  return () => {
    stop()
    res.destroy()
  }
}

/** The browser's body toward the site, read only as fast as the site's window lets it go. */
function sendBody(mux: StreamMux, id: number, req: IncomingMessage, over: () => boolean): void {
  req.on('data', (chunk: Buffer) => {
    if (over()) return
    req.pause()
    mux.write(id, new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength))
      .then(() => { if (!over()) req.resume() }, () => req.resume())
  })
  req.on('end', () => { if (!over()) mux.end(id) })
}
