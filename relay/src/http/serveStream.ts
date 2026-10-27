/**
 * One `files.serve` stream answered to one browser: open it on the site's line, read the site's head, answer its
 * status and headers, then pass the bytes on as they come; cancel it when the browser goes away.
 *
 * Pausing the shared line would stall every stream of that site, so the stream is opened with a window instead: the
 * site sends that much and then waits for credit, which is granted only as the browser's response drains. A slow
 * browser slows its own stream alone, a download of any size streams, and the relay holds about one window per stream.
 * A site that sends past its window has its stream failed by the multiplexer, and the browser's response is cut.
 */
import type { ServerResponse } from 'node:http'
import {
  FILE_SERVE_REFUSALS, createStreamHeadReader, type ContentErrorCode, type FileServeHead, type FileServeRefusal, type RelayDoor, type StreamMux,
} from '@agenthix/core'
import { BARE_REFUSAL, bareRefuses } from './door'
import { answerPlain, promisedLength, setFileHeaders, type ServedHead } from './responseHeaders'

export type ServeOptions = {
  door: RelayDoor
  headOnly: boolean
  openTimeoutMs: number
  /** Bytes the site may send before it waits for credit. */
  window: number
  /** Credit is granted once this much is owed, rather than per frame; held to half the window at most. */
  creditStep: number
  carried(bytes: number): void
  /** Called once, when the browser's response is over however it ended. */
  done(): void
}

const REFUSAL_WORDS: Record<FileServeRefusal, string> = {
  'ticket-invalid': 'This link is not valid. Open the file again from HQ.',
  'ticket-expired': 'This link has expired. Open the file again from HQ.',
  changed: 'The file changed since this link was made. Open it again from HQ.',
  'not-found': 'Not found.',
  'range-not-satisfiable': 'The range asked for is outside the file.',
  busy: 'The site that holds this file is busy. Try again in a moment.',
  failed: 'The site could not read this file.',
}

export function answerRefusal(res: ServerResponse, refusal: FileServeRefusal, size?: number): void {
  const headers: Record<string, string> = {}
  if (refusal === 'range-not-satisfiable' && size !== undefined) headers['Content-Range'] = `bytes */${size}`
  if (refusal === 'busy') headers['Retry-After'] = '2'
  answerPlain(res, FILE_SERVE_REFUSALS[refusal], REFUSAL_WORDS[refusal], headers)
}

function answerStreamError(res: ServerResponse, code: ContentErrorCode): void {
  if (code === 'offline' || code === 'disconnected') {
    answerPlain(res, 503, 'The site that holds this file went away. Try again in a moment.', { 'Retry-After': '5' })
  } else if (code === 'timeout') {
    answerPlain(res, 504, 'The site that holds this file did not answer in time.')
  } else {
    answerPlain(res, 502, 'The site that holds this file could not serve it.')
  }
}

export function serveStream(mux: StreamMux, method: string, params: unknown, res: ServerResponse, options: ServeOptions): void {
  const reader = createStreamHeadReader()
  let phase: 'head' | 'body' | 'done' = 'head'
  let promised = 0
  let received = 0
  let id = -1
  let headBytes = 0
  /** Bytes taken from the site and passed on, not yet given back as credit. */
  let owed = 0
  let draining = false
  // Held under the window whatever was configured: credit held back for batching must never leave the site waiting.
  const step = Math.max(1, Math.min(options.creditStep, Math.floor(options.window / 2)))

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
    // The browser's response is full: what it holds is given back as credit once it has drained.
    draining = true
    res.once('drain', () => {
      draining = false
      grant()
    })
  }

  const stop = () => {
    phase = 'done'
    clearTimeout(timer)
    mux.cancel(id)
  }
  const timer = setTimeout(() => {
    if (phase !== 'head') return
    stop()
    answerStreamError(res, 'timeout')
  }, options.openTimeoutMs)
  timer.unref?.()

  const pass = (bytes: Uint8Array) => {
    if (bytes.length === 0) return
    received += bytes.length
    if (received > promised) {
      // More than the head promised: not this protocol. The browser gets a cut response, never extra bytes.
      stop()
      res.destroy()
      return
    }
    options.carried(bytes.length)
    taken(bytes.length, res.write(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)))
  }

  const onHead = (head: FileServeHead, rest: Uint8Array) => {
    clearTimeout(timer)
    if ('refusal' in head) {
      stop()
      answerRefusal(res, head.refusal, head.size)
      return
    }
    const served = head as ServedHead
    if (bareRefuses(options.door, served.purpose, served.fileName)) {
      stop()
      answerPlain(res, 403, BARE_REFUSAL)
      return
    }
    setFileHeaders(res, served, options.door)
    res.writeHead(served.status)
    if (options.headOnly) {
      stop()
      res.end()
      return
    }
    phase = 'body'
    promised = promisedLength(served)
    taken(headBytes - rest.length, true)
    pass(rest)
  }

  res.on('close', () => {
    if (phase !== 'done') stop()
    clearTimeout(timer)
    options.done()
  })

  id = mux.open(method, params, {
    onData: chunk => {
      if (phase === 'body') {
        pass(chunk)
        return
      }
      if (phase !== 'head') return
      headBytes += chunk.length
      const read = reader.push(chunk)
      if (read.state === 'need-more') return
      if (read.state === 'invalid') {
        stop()
        answerPlain(res, 502, 'The site that holds this file answered in a way the relay does not read.')
        return
      }
      try {
        onHead(read.head, read.rest)
      } catch {
        // A head the relay cannot turn into headers: the site's fault, never a reason to stop the relay.
        stop()
        answerPlain(res, 502, 'The site that holds this file answered in a way the relay does not read.')
      }
    },
    onEnd: () => {
      const was = phase
      phase = 'done'
      clearTimeout(timer)
      mux.end(id)
      if (was === 'head') answerPlain(res, 502, 'The site that holds this file ended without answering.')
      else if (was === 'body') {
        if (received === promised) res.end()
        else res.destroy()
      }
    },
    onError: code => {
      const was = phase
      phase = 'done'
      clearTimeout(timer)
      if (was === 'head') answerStreamError(res, code)
      else if (was === 'body') res.destroy()
    },
  }, { window: options.window })
}
