/**
 * The proxy's program run as its container runs it — its source text on a `node` process's standard input — here on
 * the loopback address instead of a run's network. Built two ways: from these modules as vitest loads them, and
 * from a bundle made as `npm run build` makes the site's, since the bundle is what an installation runs.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import dgram from 'node:dgram'
import fs from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { EgressProxyConfig } from '../program/proxyMain'
import { egressProxyProgram } from '../program/source'
import { dnsQuery, readReply } from './dns'

const here = path.dirname(fileURLToPath(import.meta.url))

async function bundledProgram(config: EgressProxyConfig): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'egress-bundle-'))
  const entry = path.join(dir, 'entry.ts')
  await fs.writeFile(entry, `import { egressProxyProgram } from ${JSON.stringify(path.join(here, '../program/source.ts'))}\n`
    + 'process.stdout.write(egressProxyProgram(JSON.parse(process.argv[2])))\n')
  const out = path.join(dir, 'entry.mjs')
  await build({ entryPoints: [entry], outfile: out, bundle: true, platform: 'node', target: 'node22', format: 'esm', logLevel: 'silent' })
  const child = spawn(process.execPath, [out, JSON.stringify(config)])
  let text = ''
  child.stdout.on('data', d => { text += d })
  await new Promise(r => child.on('close', r))
  await fs.rm(dir, { recursive: true, force: true })
  return text
}

function freePort(host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer().listen(0, host, () => { const p = (s.address() as net.AddressInfo).port; s.close(() => resolve(p)) })
    s.on('error', reject)
  })
}

async function startProgram(source: string): Promise<ChildProcess> {
  const child = spawn(process.execPath, ['--input-type=module', '-'], { stdio: ['pipe', 'pipe', 'inherit'] })
  child.stdin!.end(source)
  await new Promise<void>((resolve, reject) => {
    let out = ''
    child.stdout!.on('data', d => { out += d; if (out.includes('"ready":true')) resolve(); if (out.includes('failed')) reject(new Error(out)) })
    child.on('exit', code => reject(new Error(`exited ${code}: ${out}`)))
  })
  return child
}

function lookup(port: number, name: string, type = 1): Promise<ReturnType<typeof readReply>> {
  return new Promise((resolve, reject) => {
    const s = dgram.createSocket('udp4')
    s.on('message', m => { s.close(); resolve(readReply(m)) })
    s.on('error', reject)
    s.send(dnsQuery(name, type), port, '127.0.0.1')
  })
}

/** What comes back on a connection to the proxy that sends `request`: the upstream's reply, or '' when closed. */
function exchange(port: number, request: string): Promise<string> {
  return new Promise(resolve => {
    let got = ''
    const c = net.connect({ host: '127.0.0.1', port }, () => c.write(request))
    c.on('data', d => { got += d; if (got.includes('\n')) c.end() })
    c.on('close', () => resolve(got))
    c.on('error', () => resolve(got))
    c.setTimeout(5000, () => c.destroy())
  })
}

describe.each(['as loaded', 'bundled'] as const)('the proxy program, %s', variant => {
  let upstream: net.Server
  let reached: string[]
  let port: number
  let dnsPort: number
  const children: ChildProcess[] = []

  beforeAll(async () => {
    reached = []
    // The approved upstream listens on IPv6 loopback, the proxy on IPv4 loopback, at the same port.
    upstream = net.createServer(s => s.once('data', d => { reached.push(d.toString().split('\r\n')[0]!); s.end('upstream-reply\n') }))
    await new Promise<void>(r => upstream.listen(0, '::1', r))
    port = (upstream.address() as net.AddressInfo).port
  })

  afterAll(async () => {
    for (const c of children) c.kill()
    await new Promise(r => upstream.close(r))
  })

  async function proxy(hosts: EgressProxyConfig['hosts']): Promise<void> {
    for (const c of children.splice(0)) { c.kill(); await new Promise(r => c.once('exit', r)) }
    // A port found free is free only until something else binds it before the program does, so a program that could
    // not bind is started again on a fresh one.
    for (let attempt = 1; ; attempt++) {
      dnsPort = await freePort('127.0.0.1')
      const config = { address: '127.0.0.1', dnsPort, hosts }
      const source = variant === 'bundled' ? await bundledProgram(config) : egressProxyProgram(config)
      try {
        children.push(await startProgram(source))
        return
      } catch (err) {
        if (attempt >= 5) throw err
      }
    }
  }

  it('answers DNS itself: the approved name with its own address, others NXDOMAIN @SC-1348', async () => {
    await proxy([{ host: 'localhost', port }])
    expect((await lookup(dnsPort, 'localhost')).answers).toEqual(['127.0.0.1'])
    expect((await lookup(dnsPort, 'localhost', 28)).answers).toEqual([])
    expect((await lookup(dnsPort, 'leak-canary-7f3a9c1e.example.net')).rcode).toBe(3)
  })

  it('refuses an approved name that resolves to loopback when no address of it was approved @SC-1348', async () => {
    await proxy([{ host: 'localhost', port }])
    reached.length = 0
    expect(await exchange(port, 'GET /a HTTP/1.1\r\nHost: localhost\r\n\r\n')).toBe('')
    expect(reached).toEqual([])
  })

  it('carries a connection to the approved host at the exact approved address, and refuses another name @SC-1349', async () => {
    await proxy([{ host: 'localhost', port }, { host: '[::1]', port }])
    reached.length = 0
    expect(await exchange(port, 'GET /b HTTP/1.1\r\nHost: localhost\r\n\r\n')).toBe('upstream-reply\n')
    expect(await exchange(port, 'GET /c HTTP/1.1\r\nHost: other.example.net\r\n\r\n')).toBe('')
    expect(await exchange(port, 'SSH-2.0-OpenSSH_9.9\r\n')).toBe('')
    expect(reached).toEqual(['GET /b HTTP/1.1'])
  })
})
