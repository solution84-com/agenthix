/**
 * `preview.connect` on the content transport — the bytes of a dev server
 * somebody is watching, and the one property that must not erode.
 *
 * The third case below is the load-bearing one. A stream method whose params
 * could name a container or a port would be the generic relay into the site's
 * network that ADR-0051 refuses, and the whole reason preview gets its own
 * transport rather than a carve-out on the control channel. The params carry
 * an id THIS SITE minted and nothing else; the destination is resolved from
 * the site's own registry.
 *
 * The harness is the one `locationReadHandler.test.ts` uses — an opener mux
 * wired straight to a server mux, no socket — so the real framing, half-close
 * and cancel logic in core's `StreamMux` is exercised in one process.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { PassThrough } from 'node:stream'
import { StreamMux, PREVIEW_METHODS, decodePreviewError, type StreamEvents } from '@agenthix/core'
import { ContentStream } from '../contentStream'
import { contentMethods } from '../contentMethods'
import { handlePreviewConnect, type PreviewConnectDeps } from '../previewConnectHandler'

function fakeExec() {
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  const kill = vi.fn(() => {
    stdout.end()
  })
  const exec = vi.fn(() => ({ stdin, stdout, kill }))
  return { stdin, stdout, kill, exec }
}

/** hq's end of one `preview.connect`, and the handler serving it.
 *  `beforeHandle` runs on the served stream before the handler sees it — the
 *  window in which hq can already have gone away. */
function connect(params: unknown, deps: PreviewConnectDeps, beforeHandle?: (stream: ContentStream) => void) {
  let site!: StreamMux
  const hq = new StreamMux('opener', { sendText: t => site.receiveText(t), sendBinary: async b => site.receiveBinary(b) })
  site = new StreamMux('server', { sendText: t => hq.receiveText(t), sendBinary: async b => hq.receiveBinary(b) })

  const received: Buffer[] = []
  let ended = false
  let failure: string | null = null
  let served: ContentStream | null = null
  let handled: Promise<void> = Promise.resolve()
  let rejection: Error | null = null

  site.onOpen = (id, _method, p) => {
    const { stream, events } = ContentStream.attach(site, id)
    site.accept(id, events)
    served = stream
    beforeHandle?.(stream)
    handled = handlePreviewConnect(stream, p, deps).catch(err => {
      rejection = err instanceof Error ? err : new Error(String(err))
      if (!stream.destroyed) {
        site.fail(id, 'handler_failed', rejection.message)
        stream.destroy()
      }
    })
  }

  const events: StreamEvents = {
    onAccept() {},
    onData: payload => received.push(Buffer.from(payload)),
    onEnd: () => {
      ended = true
    },
    onError: (code, message) => {
      failure = `${code}: ${message}`
    },
  }
  const id = hq.open(PREVIEW_METHODS.connect, params, events)

  return {
    write: (text: string) => hq.write(id, Buffer.from(text)),
    endRequest: () => hq.end(id),
    cancel: () => hq.cancel(id),
    body: () => Buffer.concat(received).toString(),
    sawEnd: () => ended,
    failure: () => failure,
    rejection: () => rejection,
    handled: () => handled,
    siteWritableEnded: () => served?.writableEnded ?? false,
  }
}

const running: PreviewConnectDeps['lookup'] = () => ({ container: 'c1', port: 5173 })

afterEach(() => {
  vi.useRealTimers()
})

describe('preview.connect', () => {
  it('pipes bytes both ways between hq and the process inside the container', async () => {
    const { stdin, stdout, exec } = fakeExec()
    const seen: string[] = []
    stdin.on('data', chunk => seen.push(chunk.toString()))

    const c = connect({ previewId: 'pv1' }, { lookup: running, exec })
    await c.write('GET / HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n')
    stdout.write('HTTP/1.1 200 OK\r\n\r\nhello')
    stdout.end()
    await c.handled()

    // The destination came from the registry, never from the params.
    expect(exec).toHaveBeenCalledWith('c1', 5173)
    expect(seen.join('')).toContain('GET / HTTP/1.1')
    expect(c.body()).toBe('HTTP/1.1 200 OK\r\n\r\nhello')
    // The handler ends its own writable half, or hq waits forever on a frame
    // that never comes — contentMethods.ts's contract for every handler here.
    expect(c.sawEnd()).toBe(true)
    expect(c.siteWritableEnded()).toBe(true)
    expect(c.rejection()).toBeNull()
  })

  it('carries hq half-closing its request through to the process, rather than ending the stream', async () => {
    const { stdin, stdout, exec } = fakeExec()
    let stdinEnded = false
    stdin.on('end', () => {
      stdinEnded = true
    })
    stdin.resume()

    const c = connect({ previewId: 'pv1' }, { lookup: running, exec })
    await c.write('bye')
    c.endRequest()
    await new Promise(resolve => setImmediate(resolve))
    expect(stdinEnded).toBe(true)

    // Still writable back: a half-close is "I have stopped sending", not "we are done".
    stdout.write('answer')
    stdout.end()
    await c.handled()
    expect(c.body()).toBe('answer')
  })

  it('fails not_found for a preview this site does not know, and opens nothing', async () => {
    const exec = vi.fn()
    const c = connect({ previewId: 'ghost' }, { lookup: () => null, exec })
    await c.handled()

    expect(exec).not.toHaveBeenCalled()
    expect(decodePreviewError(String(c.rejection()?.message))?.code).toBe('not_found')
    expect(c.failure()).toMatch(/not_found/)
  })

  it('refuses a params object without a preview id, and never resolves a destination from it', async () => {
    const exec = vi.fn()
    for (const params of [
      { container: 'c1', port: 22 },
      { previewId: '' },
      'pv1',
    ]) {
      const c = connect(params, { lookup: running, exec })
      await c.handled()
      expect(decodePreviewError(String(c.rejection()?.message))?.code).toBe('invalid')
    }
    expect(exec).not.toHaveBeenCalled()
  })

  it('treats a viewer closing the tab as the ordinary ending, and kills the exec', async () => {
    const { stdout, kill, exec } = fakeExec()
    const c = connect({ previewId: 'pv1' }, { lookup: running, exec })
    stdout.write('partial')
    await new Promise(resolve => setImmediate(resolve))

    c.cancel()
    await c.handled()

    expect(kill).toHaveBeenCalled()
    // No refusal: hq is the side that went away, so there is nothing to fail.
    expect(c.rejection()).toBeNull()
  })

  it('fails rather than ending empty when the exec reaches no dev server', async () => {
    const { stdout, exec } = fakeExec()
    const c = connect({ previewId: 'pv1' }, { lookup: running, exec })
    stdout.end()
    await c.handled()

    expect(decodePreviewError(String(c.rejection()?.message))?.code).toBe('exec_failed')
    // An empty stream would have reached hq as a bare socket hang up.
    expect(c.sawEnd()).toBe(false)
  })

  it('opens nothing for a stream hq has already given up on', async () => {
    const { exec, kill } = fakeExec()
    const c = connect({ previewId: 'pv1' }, { lookup: running, exec }, stream => stream.destroy())
    await c.handled()

    expect(exec).not.toHaveBeenCalled()
    expect(kill).not.toHaveBeenCalled()
    expect(c.rejection()).toBeNull()
  })

  it('gives the exec a deadline for its first byte, rather than hanging the browser', async () => {
    vi.useFakeTimers()
    const { kill, exec } = fakeExec()
    const c = connect({ previewId: 'pv1' }, { lookup: running, exec })

    // A `docker exec` that neither answers nor ends — a daemon that has
    // stopped, a container removed under it. Nothing below would ever settle.
    await vi.advanceTimersByTimeAsync(60_000)
    await c.handled()

    expect(decodePreviewError(String(c.rejection()?.message))?.code).toBe('exec_failed')
    expect(kill).toHaveBeenCalled()
  })

  it('is the registered handler for preview.connect', () => {
    expect(contentMethods[PREVIEW_METHODS.connect]).toBe(handlePreviewConnect)
  })
})
