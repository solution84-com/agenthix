/**
 * Stopping the site on SIGTERM or SIGINT: no new connections, the hq link
 * closed, requests in flight given a grace period, the database disconnected,
 * then exit. Driven directly, with a real HTTP server and the steps recorded.
 *
 * The last block checks the handler beside gitProcessGroup.ts's own: git's
 * runs first and kills live git groups, sees this one listening, and does not
 * raise the signal again. Driven with `process.emit` and a spied
 * `process.kill`, as gitShutdownHandlers.test.ts does.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import http from 'node:http'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import { createShutdown, installShutdownSignals } from '../shutdown'
import { GitDeadline, runGit } from '../../storage/gitRunner'

type Steps = string[]

async function serve(handler: http.RequestListener): Promise<{ server: http.Server; url: string }> {
  const server = http.createServer(handler)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }
}

function deps(server: http.Server, steps: Steps, graceMs = 2_000) {
  return {
    server,
    stopHqLink: () => { steps.push('hq link stopped') },
    disconnectDb: async () => { steps.push('database disconnected') },
    exit: (code: number) => { steps.push(`exit ${code}`) },
    log: () => {},
    graceMs,
  }
}

const servers: http.Server[] = []
afterEach(() => {
  for (const s of servers.splice(0)) { s.closeAllConnections(); s.close() }
})

describe('shutdown', () => {
  it('stops accepting, closes the hq link, lets a request in flight finish, disconnects, and exits 0', async () => {
    const steps: Steps = []
    let release!: () => void
    const { server, url } = await serve((_req, res) => {
      steps.push('request started')
      release = () => { steps.push('request finished'); res.end('done') }
    })
    servers.push(server)

    const inFlight = fetch(url).then(r => r.text())
    await vi.waitFor(() => expect(steps).toContain('request started'))

    const done = createShutdown(deps(server, steps))('SIGTERM')
    await vi.waitFor(() => expect(steps).toContain('hq link stopped'))
    expect(server.listening).toBe(false)
    await expect(fetch(url)).rejects.toThrow()

    release()
    expect(await inFlight).toBe('done')
    await done
    expect(steps).toEqual(['request started', 'hq link stopped', 'request finished', 'database disconnected', 'exit 0'])
  })

  it('cuts a request that outlasts the grace period, then still disconnects and exits promptly', async () => {
    const steps: Steps = []
    const { server, url } = await serve(() => { steps.push('request started') })
    servers.push(server)
    const hung = fetch(url).then(() => 'answered', () => 'cut')
    await vi.waitFor(() => expect(steps).toContain('request started'))

    const started = Date.now()
    await createShutdown(deps(server, steps, 100))('SIGTERM')
    expect(Date.now() - started).toBeLessThan(2_000)
    expect(await hung).toBe('cut')
    expect(steps.slice(-2)).toEqual(['database disconnected', 'exit 0'])
  })

  it('exits at once on a second signal while the first is still shutting down', async () => {
    const steps: Steps = []
    const { server, url } = await serve(() => { steps.push('request started') })
    servers.push(server)
    void fetch(url).catch(() => {})
    await vi.waitFor(() => expect(steps).toContain('request started'))

    const shutdown = createShutdown(deps(server, steps, 60_000))
    const first = shutdown('SIGINT')
    await shutdown('SIGINT')
    expect(steps).toContain('exit 1')
    server.closeAllConnections()
    await first
  })

  it('still exits when the hq link or the database fails to close', async () => {
    const steps: Steps = []
    const { server } = await serve(() => {})
    await createShutdown({
      ...deps(server, steps),
      stopHqLink: () => { throw new Error('socket gone') },
      disconnectDb: async () => { throw new Error('db gone') },
    })('SIGTERM')
    expect(steps).toEqual(['exit 0'])
  })
})

describe('the signal handlers, beside gitProcessGroup.ts\'s', () => {
  const killSpy = vi.spyOn(process, 'kill')
  let tmp: string | undefined
  let uninstall: (() => void) | undefined

  afterEach(async () => {
    uninstall?.()
    killSpy.mockRestore()
    if (tmp) await fs.rm(tmp, { recursive: true, force: true })
  })

  it('runs the graceful shutdown on SIGTERM, and git\'s handler does not raise the signal again', async () => {
    const shutdown = vi.fn(async () => {})
    // main.ts installs before setupServer, so before any git process starts.
    uninstall = installShutdownSignals(shutdown)
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'site-shutdown-'))
    // git's handlers install on the first spawn.
    await runGit(['-C', tmp, 'init', '-q'], { deadline: new GitDeadline(30_000) })
    killSpy.mockImplementation(() => true)

    const listeners = process.listeners('SIGTERM')
    expect(listeners.length).toBeGreaterThanOrEqual(2)

    process.emit('SIGTERM')

    expect(shutdown).toHaveBeenCalledWith('SIGTERM')
    expect(killSpy.mock.calls.filter(([pid, sig]) => pid === process.pid && sig === 'SIGTERM')).toHaveLength(0)
  })
})
