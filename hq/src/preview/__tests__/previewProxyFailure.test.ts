// @vitest-environment node
/**
 * What a failed forward does to the response — the one thing in the preview
 * proxy that can take hq down rather than fail a request.
 *
 * `res.status()` on a response whose headers have already gone throws
 * `ERR_HTTP_HEADERS_SENT`, and it throws from inside a `ClientRequest`'s own
 * error handler, where nothing catches it: hq installs no `uncaughtException`
 * handler, so the process exits. The trigger is ordinary — the site failing
 * the stream mid-response, the content socket dropping, a sweep stopping the
 * preview while an asset is streaming, or the transport's unread-buffer limit,
 * which can only ever fire mid-response.
 *
 * So the after-headers case is tested against a real express response and a
 * real mid-response failure rather than a stub, because a stub could not have
 * thrown in the first place. Without the `headersSent` branch this file does
 * not fail: it kills the worker.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import http from 'node:http'
import net from 'node:net'
import express from 'express'
import httpProxy from 'http-proxy'
import { Duplex } from 'node:stream'
import { PreviewError } from '@agenthix/core'
import { previewStreamAgent } from '../previewRelay'

const { failForward, viewerMessage, previewIsGone } = await import('../previewProxy')

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  warn.mockRestore()
})

/**
 * A front express app forwarding to `target` with the real failure handler,
 * and a client that reports what it actually received.
 */
async function forwardOnce(
  target: string,
  options: { agent?: http.Agent; onFirstChunk?: () => void; gone?: () => Promise<void> } = {},
): Promise<{ status: number; body: string; aborted: boolean }> {
  const proxy = httpProxy.createProxyServer({ changeOrigin: true })
  const app = express()
  app.use((req, res) => {
    void proxy.web(req, res, { target, agent: options.agent }, (err: Error) => {
      void failForward(res, err, options.gone)
    })
  })
  const front = http.createServer(app)
  await new Promise<void>(resolve => front.listen(0, '127.0.0.1', resolve))
  const port = (front.address() as net.AddressInfo).port

  try {
    return await new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, path: '/asset.js' }, res => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', chunk => {
          body += chunk
          options.onFirstChunk?.()
        })
        // `close` rather than `end`: a response the proxy destroyed mid-body
        // never ends, and `complete` is what says which of the two happened.
        res.on('error', () => {})
        res.on('close', () => resolve({ status: res.statusCode ?? 0, body, aborted: !res.complete }))
      })
      req.on('error', reject)
      req.end()
    })
  } finally {
    proxy.close()
    front.closeAllConnections()
    await new Promise<void>(resolve => front.close(() => resolve()))
  }
}

describe('a failed forward', () => {
  it('answers 502 in prose while the response can still be written', async () => {
    // Nothing is listening on this port, so the forward fails before headers.
    const closed = http.createServer()
    await new Promise<void>(resolve => closed.listen(0, '127.0.0.1', resolve))
    const deadPort = (closed.address() as net.AddressInfo).port
    await new Promise<void>(resolve => closed.close(() => resolve()))

    const answer = await forwardOnce(`http://127.0.0.1:${deadPort}`)
    expect(answer.status).toBe(502)
    expect(answer.body).toContain('preview upstream error:')
  })

  it('destroys the response instead of throwing once the headers have gone', async () => {
    // The production shape exactly: the upstream connection IS a content
    // stream, and the site fails it part-way through the body.
    const upstream = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/javascript' })
      res.write('console.log("first chunk")')
      // Deliberately not ended: the failure is what finishes this response.
    })
    await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve))
    const port = (upstream.address() as net.AddressInfo).port

    const streams: Duplex[] = []
    const open = async (): Promise<Duplex> => {
      const socket = net.connect(port, '127.0.0.1')
      await new Promise<void>(resolve => socket.once('connect', () => resolve()))
      const duplex = new Duplex({
        allowHalfOpen: true,
        read() {},
        write(chunk, _enc, cb) {
          socket.write(chunk as Buffer, cb)
        },
        final(cb) {
          socket.end()
          cb()
        },
        destroy(err, cb) {
          socket.destroy()
          cb(err)
        },
      })
      socket.on('data', chunk => duplex.push(chunk))
      socket.on('error', () => {})
      streams.push(duplex)
      return duplex
    }

    try {
      const answer = await forwardOnce('http://127.0.0.1', {
        agent: previewStreamAgent('site-b', 'pv1', open),
        onFirstChunk: () => {
          // What the site failing the stream looks like from here — the same
          // shape as `exec_failed`, a cancel, or the unread-buffer limit.
          streams[0]?.destroy(new PreviewError('exec_failed', 'the dev server stopped answering'))
        },
      })
      // The viewer keeps what arrived and is told nothing more — there is no
      // way left to tell them, and an invented body would corrupt the asset.
      expect(answer.status).toBe(200)
      expect(answer.body).toContain('first chunk')
      expect(answer.aborted).toBe(true)
      // The reason an operator can reach.
      expect(warn.mock.calls.flat().join(' ')).toMatch(/after the response had started/)
    } finally {
      for (const stream of streams) stream.destroy()
      upstream.closeAllConnections()
      await new Promise<void>(resolve => upstream.close(() => resolve()))
    }
  })
})

describe('what a viewer reads', () => {
  it('turns this vocabulary off the wire into prose, wherever in the sentence it sits', () => {
    const wire = new PreviewError('not_found', 'preview.connect names a preview this site is not running')
    const wrapped = new Error(`preview pv1 on Execution Site site-b could not be reached: ${wire.message}`)
    const text = viewerMessage(wrapped)
    expect(text).not.toContain('preview/')
    expect(text).not.toContain('preview.connect')
    expect(text).toMatch(/no longer running/)
  })

  it('passes anything that is not ours through as it stands', () => {
    const plain = new Error('Execution Site site-b has no content connection')
    expect(viewerMessage(plain)).toBe('Execution Site site-b has no content connection')
  })
})

/**
 * The site's own answer that a token names nothing.
 *
 * A site's preview registry is in memory and dies with the site, so
 * `not_found` is the ordinary answer after a site restart — and hq's row is
 * then the only thing still claiming the preview exists. The site's registry
 * says in as many words that hq's rows expire on the first connect that comes
 * back this way, and this is that promise.
 */
describe('a preview the site does not know', () => {
  /** How it arrives: encoded in the failure's message, wrapped by the relay. */
  function notFoundAgent(): http.Agent {
    return previewStreamAgent('site-b', 'pv1', async () => {
      throw new PreviewError('not_found', 'preview.connect names a preview this site is not running')
    })
  }

  it('answers 404 and ends hq\'s own row, without a clock', async () => {
    const gone = vi.fn(async () => {})
    const answer = await forwardOnce('http://127.0.0.1', { agent: notFoundAgent(), gone })

    expect(answer.status).toBe(404)
    expect(gone).toHaveBeenCalledOnce()
    // Prose, not this vocabulary's wire encoding.
    expect(answer.body).not.toContain('preview/')
    expect(answer.body).toMatch(/no longer running/)
  })

  // Anything else is a fault of the path, not a statement about the row: the
  // preview may be perfectly alive behind a site that is merely unreachable.
  it('leaves the row alone on any other upstream failure, and stays a 502', async () => {
    const gone = vi.fn(async () => {})
    const agent = previewStreamAgent('site-b', 'pv1', async () => {
      throw new Error('Execution Site site-b has no content connection')
    })

    const answer = await forwardOnce('http://127.0.0.1', { agent, gone })

    expect(answer.status).toBe(502)
    expect(gone).not.toHaveBeenCalled()
  })

  // A row that cannot be written must still answer the browser rather than
  // reject into a callback nothing awaits.
  it('still answers 404 when the row cannot be written', async () => {
    const answer = await forwardOnce('http://127.0.0.1', {
      agent: notFoundAgent(),
      gone: async () => { throw new Error('database is down') },
    })

    expect(answer.status).toBe(404)
    expect(warn.mock.calls.flat().join(' ')).toMatch(/database is down/)
  })

  it('recognises the answer wherever in the sentence it sits, and nothing else', () => {
    expect(previewIsGone(new Error(`preview pv1 on Execution Site site-b could not be reached: ${new PreviewError('not_found', 'x').message}`))).toBe(true)
    expect(previewIsGone(new Error(new PreviewError('no_container', 'x').message))).toBe(false)
    expect(previewIsGone(new Error('not_found'))).toBe(false)
  })
})
