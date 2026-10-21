import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getWaspHttpServer, upgradeHandlersReady, whenWaspHttpServerReady } from '../waspHttpServer'
import { healthHandler } from '../apis'

const glob = globalThis as { __wasp_io__?: unknown }

beforeEach(() => {
  vi.useFakeTimers()
  delete glob.__wasp_io__
})

afterEach(() => {
  vi.useRealTimers()
  delete glob.__wasp_io__
})

describe('reaching Wasp\'s http server @SC-292', () => {
  it('reads io.httpServer, which is where socket.io actually puts it', () => {
    // engine.io declares engine.httpServer in its types but never assigns it in
    // the version Wasp 0.21 pins — reading that returns undefined forever, and
    // the live-preview upgrade handler had been failing to attach because of it.
    const server = { marker: 'real' }
    glob.__wasp_io__ = { httpServer: server, engine: {} }
    expect(getWaspHttpServer()).toBe(server)
  })

  it('returns null when the socket.io instance is not there yet', () => {
    expect(getWaspHttpServer()).toBeNull()
    glob.__wasp_io__ = { engine: {} }
    expect(getWaspHttpServer()).toBeNull()
  })

  it('attaches immediately when the server already exists', () => {
    const server = { marker: 'real' }
    glob.__wasp_io__ = { httpServer: server }
    const attach = vi.fn()
    whenWaspHttpServerReady('test', attach as never)
    expect(attach).toHaveBeenCalledWith(server)
  })

  it('attaches once the server appears later', () => {
    const attach = vi.fn()
    whenWaspHttpServerReady('test', attach as never, { attempts: 5, intervalMs: 10 })
    expect(attach).not.toHaveBeenCalled()

    const server = { marker: 'real' }
    glob.__wasp_io__ = { httpServer: server }
    vi.advanceTimersByTime(10)
    expect(attach).toHaveBeenCalledWith(server)

    // and stops retrying
    vi.advanceTimersByTime(100)
    expect(attach).toHaveBeenCalledTimes(1)
  })

  it('gives up loudly rather than polling silently forever', () => {
    // A handler that never attached used to look exactly like one that had.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    whenWaspHttpServerReady('test', vi.fn() as never, { attempts: 3, intervalMs: 10 })
    vi.advanceTimersByTime(1000)
    expect(error).toHaveBeenCalledWith(expect.stringContaining('never became reachable'))
    error.mockRestore()
  })
})

describe('hq says it is up only once its links listen', () => {
  const health = async () => {
    const res = { code: 200, body: null as unknown, status(c: number) { this.code = c; return this }, json(b: unknown) { this.body = b; return this } }
    await healthHandler({} as never, res as never, {} as never)
    return { code: res.code, body: res.body }
  }

  it('answers starting while a handler waits for the http server, and ok once it attached', async () => {
    whenWaspHttpServerReady('a link', vi.fn() as never, { attempts: 5, intervalMs: 10 })
    expect(upgradeHandlersReady()).toBe(false)
    expect(await health()).toEqual({ code: 503, body: { status: 'starting' } })
    glob.__wasp_io__ = { httpServer: { marker: 'real' } }
    vi.advanceTimersByTime(10)
    expect(upgradeHandlersReady()).toBe(true)
    expect(await health()).toEqual({ code: 200, body: { status: 'ok' } })
  })

  it('does not stay starting for a handler that gave up', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    whenWaspHttpServerReady('never', vi.fn() as never, { attempts: 2, intervalMs: 10 })
    expect(upgradeHandlersReady()).toBe(false)
    vi.advanceTimersByTime(100)
    expect(upgradeHandlersReady()).toBe(true)
  })
})
