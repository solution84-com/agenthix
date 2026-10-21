/**
 * The relay's program run for real, by this machine's node, against a small
 * stand-in for the OpenCode server — no container, no OpenCode. What the
 * relay does in a container is covered by the container checks
 * (openCodeRuntime.container.test.ts).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { ProcessRelay, relayDockerArgs, type RelayServerExit } from '../openCodeRelay'
import { RELAY_SOURCE } from '../relayScript'

const STAND_IN = String.raw`
const http = require('node:http')
const port = Number(process.argv[process.argv.indexOf('--port') + 1])
const expected = 'Basic ' + Buffer.from('opencode:' + process.env.OPENCODE_SERVER_PASSWORD).toString('base64')
http.createServer((req, res) => {
  if (req.headers.authorization !== expected) { res.writeHead(401); res.end('no'); return }
  if (req.url === '/global/event') {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write('data: ' + JSON.stringify({ payload: { type: 'server.connected', properties: {} } }) + '\n\n')
    let n = 0
    const t = setInterval(() => { res.write('data: ' + JSON.stringify({ payload: { type: 'tick', properties: { n: n++ } } }) + '\n\n') }, 20)
    req.on('close', () => clearInterval(t))
    return
  }
  if (req.url === '/slow') return
  if (req.url === '/env') { res.end(JSON.stringify({ tag: process.env.SITE_SESSION ?? null, secret: process.env.CONTAINER_SECRET ?? null, given: process.env.GIVEN ?? null })); return }
  let body = ''
  req.on('data', c => (body += c))
  req.on('end', () => res.end(JSON.stringify({ method: req.method, url: req.url, body })))
}).listen(port, '127.0.0.1')
`

function freePort(): Promise<number> {
  return new Promise(resolve => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const port = (s.address() as net.AddressInfo).port
      s.close(() => resolve(port))
    })
  })
}

let home: string
let standIn: string
let exits: RelayServerExit[]
let closedCount: number

function relay(extraEnv: Record<string, string> = {}): ProcessRelay {
  return new ProcessRelay(
    () => spawn(process.execPath, ['--experimental-sqlite', '--no-warnings', '-e', RELAY_SOURCE], {
      env: { PATH: process.env.PATH ?? '', HOME: home, SITE_SESSION: 'leaked-tag', CONTAINER_SECRET: 'x', ...extraEnv },
      stdio: ['pipe', 'pipe', 'pipe'],
    }),
    { onServerExit: e => exits.push(e), onClose: () => { closedCount++ } },
  )
}

async function started(r: ProcessRelay, env: Record<string, string> = {}): Promise<number | null> {
  const port = await freePort()
  const { pid } = await r.start([process.execPath, standIn, 'serve', '--port', String(port)], { OPENCODE_SERVER_PASSWORD: 'pw', ...env }, port, 10_000)
  for (let i = 0; i < 100; i++) {
    const res = await r.request('GET', '/ping', undefined, 1_000)
    if (res.status === 200) return pid
    await new Promise(res2 => setTimeout(res2, 50))
  }
  throw new Error('stand-in never answered')
}

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-home-'))
  standIn = path.join(home, 'stand-in.cjs')
  fs.writeFileSync(standIn, STAND_IN)
  exits = []
  closedCount = 0
})

afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true })
})

describe('the relay', () => {
  it('runs as the image user through one docker exec, with nothing secret on its command line', () => {
    const args = relayDockerArgs('agent-c1')
    expect(args.slice(0, 5)).toEqual(['exec', '-i', '-u', 'appuser', 'agent-c1'])
    expect(args).not.toContain('-e' + 'OPENCODE_SERVER_PASSWORD')
    expect(args.join(' ')).not.toMatch(/PASSWORD=|HARNESS_KEY=/)
  })

  it('starts the server, carries requests with its password, and streams its events', async () => {
    const r = relay()
    try {
      await started(r)
      const res = await r.request('POST', '/session?directory=%2Fp', { a: 1 }, 5_000)
      expect(res.status).toBe(200)
      expect(JSON.parse(res.body)).toEqual({ method: 'POST', url: '/session?directory=%2Fp', body: '{"a":1}' })

      const seen: unknown[] = []
      r.subscribe('/global/event', e => seen.push(e), 5_000)
      for (let i = 0; i < 100 && seen.length < 3; i++) await new Promise(res2 => setTimeout(res2, 20))
      expect(seen[0]).toEqual({ payload: { type: 'server.connected', properties: {} } })
      expect(seen.length).toBeGreaterThanOrEqual(3)
    } finally {
      r.close()
    }
  })

  it('gives the server only the environment it was sent, never the container\'s tag or other variables', async () => {
    const r = relay()
    try {
      await started(r, { GIVEN: 'yes' })
      const res = await r.request('GET', '/env', undefined, 5_000)
      expect(JSON.parse(res.body)).toEqual({ tag: null, secret: null, given: 'yes' })
    } finally {
      r.close()
    }
  })

  it('times a request out rather than waiting on a server that never answers', async () => {
    const r = relay()
    try {
      await started(r)
      const t0 = Date.now()
      const res = await r.request('GET', '/slow', undefined, 300)
      expect(res.status).toBe(0)
      expect(Date.now() - t0).toBeLessThan(3_000)
    } finally {
      r.close()
    }
  })

  it('reports a server that stops, and stays up for the next one', async () => {
    const r = relay()
    try {
      const pid = await started(r)
      await r.stop(15_000)
      const mine = () => exits.filter(e => e.pid === pid)
      for (let i = 0; i < 100 && mine().length === 0; i++) await new Promise(res2 => setTimeout(res2, 20))
      expect(mine()).toHaveLength(1)
      expect(r.closed).toBe(false)
      await started(r)
      expect((await r.request('GET', '/ping', undefined, 2_000)).status).toBe(200)
    } finally {
      r.close()
    }
  })

  it('removes auth.json before it starts a server and when it stops one', async () => {
    const data = path.join(home, '.local', 'share', 'opencode')
    fs.mkdirSync(data, { recursive: true })
    fs.writeFileSync(path.join(data, 'auth.json'), '{"openrouter":{"type":"api","key":"planted"}}')
    const r = relay()
    try {
      await started(r)
      expect(fs.existsSync(path.join(data, 'auth.json'))).toBe(false)
      fs.writeFileSync(path.join(data, 'auth.json'), '{}')
      await r.stop(15_000)
      expect(fs.existsSync(path.join(data, 'auth.json'))).toBe(false)
    } finally {
      r.close()
    }
  })

  it('refuses to start a server on a home whose opencode.db holds an account', async () => {
    const data = path.join(home, '.local', 'share', 'opencode')
    fs.mkdirSync(data, { recursive: true })
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(path.join(data, 'opencode.db'))
    db.exec("CREATE TABLE account (id TEXT PRIMARY KEY, email TEXT); INSERT INTO account VALUES ('a', 'x@example.com')")
    db.close()
    const r = relay()
    try {
      const port = await freePort()
      await expect(r.start([process.execPath, standIn, 'serve', '--port', String(port)], { OPENCODE_SERVER_PASSWORD: 'pw' }, port, 10_000))
        .rejects.toThrow(/holds an OpenCode account/)
    } finally {
      r.close()
    }
  })

  it('starts on a home whose opencode.db has no account', async () => {
    const data = path.join(home, '.local', 'share', 'opencode')
    fs.mkdirSync(data, { recursive: true })
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(path.join(data, 'opencode.db'))
    db.exec('CREATE TABLE account (id TEXT PRIMARY KEY); CREATE TABLE session (id TEXT)')
    db.close()
    const r = relay()
    try {
      await started(r)
    } finally {
      r.close()
    }
  })

  it('answers everything still waiting when the relay goes, and stops its server with it', async () => {
    const r = relay()
    await started(r)
    const waiting = r.request('GET', '/slow', undefined, 20_000)
    const ended = r.subscribe('/global/event', () => {}, 5_000).ended
    r.close()
    await expect(waiting).rejects.toThrow(/relay has stopped/)
    // The relay stops its server as it goes, so the stream ends either way, with an error.
    expect((await ended).error).toBeTruthy()
    for (let i = 0; i < 100 && closedCount === 0; i++) await new Promise(res2 => setTimeout(res2, 20))
    expect(closedCount).toBeGreaterThanOrEqual(1)
    await expect(r.request('GET', '/ping', undefined, 1_000)).rejects.toThrow(/relay has stopped/)
  })
})
