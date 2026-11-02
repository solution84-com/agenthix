/**
 * App streams go through one forwarder per live preview (live preview spec section 4, *The app*): many requests at
 * once cost one exec, large bodies are carried both ways under credit, an app that does not answer fails its stream
 * only, and while no forwarder can answer the per-stream execs run under a site-wide limit. The forwarder's own program
 * runs here as a local Node process, standing in for `docker exec` into the container.
 */
import { spawn as spawnChild } from 'node:child_process'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Duplex } from 'node:stream'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { PreviewSpawned } from '../container/exec'
import { AppDidNotAnswer } from '../apps/appForwarder'
import { AppStreams, PER_STREAM_EXECS, StreamsBusy, type AppStreamDeps } from '../apps/appStreams'

let server: http.Server
let port: number
const big = Buffer.alloc(3 * 1024 * 1024, 'x')

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/echo') { req.pipe(res); return }
    if (req.url === '/big') { res.end(big); return }
    setTimeout(() => res.end(`hello ${req.url}`), 5)
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  port = (server.address() as AddressInfo).port
})
afterAll(() => new Promise<void>(r => server.close(() => r())))

function localSpawn(argv: string[]): PreviewSpawned {
  const child = spawnChild(process.execPath, argv.slice(1), { stdio: ['pipe', 'pipe', 'pipe'] })
  return {
    exited: new Promise(r => child.on('close', code => r(code ?? -1))),
    detach: () => { child.kill('SIGKILL') }, stdin: child.stdin, stdout: child.stdout, stderr: child.stderr,
  }
}

type Counted = AppStreamDeps & { spawns: string[][]; held: number[]; live: number; most: number }

function deps(over: Partial<AppStreamDeps> = {}): Counted {
  const d: Counted = {
    spawns: [], held: [], live: 0, most: 0,
    spawn: async (_id, argv) => {
      d.spawns.push(argv)
      const p = localSpawn(argv)
      d.live++
      d.most = Math.max(d.most, d.live)
      void p.exited.then(() => { d.live-- })
      return p
    },
    hold: (_id, pid) => { d.held.push(pid); return () => {} },
    execBegins: () => () => {},
    now: Date.now,
    ...over,
  }
  return d
}

function get(socket: Duplex, path: string, body?: Buffer): Promise<{ status: number; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: 'app', port, path, method: body ? 'POST' : 'GET', createConnection: () => socket as never }, res => {
      const parts: Buffer[] = []
      res.on('data', d => parts.push(d))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(parts) }))
    })
    req.on('error', reject)
    req.end(body)
  })
}

let streams: AppStreams | null = null
afterEach(() => { streams?.stopAll(); streams = null })

describe('the forwarder @SC-1736', () => {
  it('carries 200 requests at once with one exec, and is held for the guard', async () => {
    const d = deps()
    streams = new AppStreams(d)
    const answers = await Promise.all(Array.from({ length: 200 }, async (_, i) => {
      const { socket } = await streams!.connect('lp1', port)
      const r = await get(socket, `/m${i}.js`)
      socket.destroy()
      return r.body.toString()
    }))
    expect(answers[0]).toBe('hello /m0.js')
    expect(answers[199]).toBe('hello /m199.js')
    expect(d.spawns.length).toBe(1)
    expect(d.held.length).toBe(1)
  })

  it('carries large bodies both ways', async () => {
    streams = new AppStreams(deps())
    const down = await streams.connect('lp1', port)
    expect((await get(down.socket, '/big')).body.equals(big)).toBe(true)
    const up = await streams.connect('lp1', port)
    expect((await get(up.socket, '/echo', big)).body.equals(big)).toBe(true)
  })

  it('fails only the stream whose app does not answer', async () => {
    streams = new AppStreams(deps())
    const closed = await new Promise<number>(r => { const s = http.createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as AddressInfo).port; s.close(() => r(p)) }) })
    await expect(streams.connect('lp1', closed)).rejects.toBeInstanceOf(AppDidNotAnswer)
    const ok = await streams.connect('lp1', port)
    expect((await get(ok.socket, '/x')).body.toString()).toBe('hello /x')
  })

  it('ends with its live preview, and the next stream starts another', async () => {
    const d = deps()
    streams = new AppStreams(d)
    const first = await streams.connect('lp1', port)
    first.socket.on('error', () => {})
    const ended = new Promise(r => first.socket.once('close', r))
    streams.stop('lp1')
    await ended
    const second = await streams.connect('lp1', port)
    expect((await get(second.socket, '/y')).body.toString()).toBe('hello /y')
    expect(d.spawns.length).toBe(2)
  })
})

describe('while no forwarder can answer @SC-1736', () => {
  it('per-stream execs run no more than the limit at once', async () => {
    // The forwarder never says it is ready; the per-stream relay (a different program) is spawned for real.
    const d = deps()
    const real = d.spawn
    d.spawn = async (id, argv) => (argv.some(a => a.includes('MAXS')) ? localSpawn(['node', '-e', 'setInterval(() => {}, 1000)']) : real(id, argv))
    streams = new AppStreams({ ...d, now: () => 0 })
    // Let the first start time out before the storm, so every stream takes the per-stream path.
    await expect(Promise.race([streams.connect('lp1', port).then(c => { c.socket.destroy(); return 'ok' }), new Promise(r => setTimeout(() => r('late'), 12_000))])).resolves.toBe('ok')
    d.most = 0
    const answers = await Promise.all(Array.from({ length: 20 }, async (_, i) => {
      const { socket } = await streams!.connect('lp1', port)
      const r = await get(socket, `/p${i}`)
      socket.destroy()
      return r.body.toString()
    }))
    expect(answers[19]).toBe('hello /p19')
    expect(d.most).toBeLessThanOrEqual(PER_STREAM_EXECS)
  }, 30_000)

  it('a stream that finds every per-stream exec busy for too long is refused busy', async () => {
    const d = deps({ spawn: async () => localSpawn(['node', '-e', 'setInterval(() => {}, 1000)']) })
    streams = new AppStreams({ ...d, now: () => 0 })
    const releases = await Promise.all(Array.from({ length: PER_STREAM_EXECS }, () => streams!.perStream.acquire(0)))
    // The forwarder is failing to start (no hello), and no per-stream slot is free.
    await expect(streams.connect('lp1', port)).rejects.toBeInstanceOf(StreamsBusy)
    for (const r of releases) r?.()
  }, 30_000)
})
