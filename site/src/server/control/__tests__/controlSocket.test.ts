import { describe, it, expect, vi, afterEach } from 'vitest'
import net from 'node:net'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

vi.mock('../commands', () => ({
  readStatus: async () => ({ siteId: 's', name: 'Build box', hq: null }),
}))
vi.mock('../leave', () => ({ unregister: async () => ({ toldHq: true, hq: 'left' }) }))
vi.mock('../../../agents/agentDiskPaths', () => ({ getSiteRoot: () => '/unused' }))

import { startControlSocket, controlSocketPath } from '../controlSocket'

let server: net.Server | null = null
afterEach(() => {
  server?.close()
  server = null
})

function ask(socketPath: string, request: unknown): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const replies: unknown[] = []
    let buf = ''
    const conn = net.createConnection(socketPath, () => conn.write(JSON.stringify(request) + '\n'))
    conn.on('data', d => {
      buf += d.toString()
      let nl
      while ((nl = buf.indexOf('\n')) >= 0) { replies.push(JSON.parse(buf.slice(0, nl))); buf = buf.slice(nl + 1) }
    })
    conn.on('end', () => resolve(replies))
    conn.on('error', reject)
  })
}

async function listening(dir: string) {
  const socketPath = path.join(dir, 'run', 'control.sock')
  server = await startControlSocket(socketPath)
  await new Promise(r => server!.once('listening', r))
  return socketPath
}

describe('control socket', () => {
  it('is readable only by the site’s own user', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctl-'))
    const socketPath = await listening(dir)
    expect(fs.statSync(path.dirname(socketPath)).mode & 0o777).toBe(0o700)
    expect(fs.statSync(socketPath).mode & 0o777).toBe(0o600)
  })

  it('answers status', async () => {
    const socketPath = await listening(fs.mkdtempSync(path.join(os.tmpdir(), 'ctl-')))
    expect(await ask(socketPath, { command: 'status' })).toEqual([{ type: 'status', status: { siteId: 's', name: 'Build box', hq: null } }])
  })

  it('has no register command: it refuses it, and anything it does not know', async () => {
    const socketPath = await listening(fs.mkdtempSync(path.join(os.tmpdir(), 'ctl-')))
    expect(await ask(socketPath, { command: 'register', hqUrl: 'https://hq.example.com' })).toEqual([{ type: 'error', message: expect.stringMatching(/Unknown command: register/) }])
    expect(await ask(socketPath, { command: 'format-disk' })).toEqual([{ type: 'error', message: expect.stringMatching(/Unknown command/) }])
  })

  it('replaces a stale socket file left by a crashed run', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctl-'))
    fs.mkdirSync(path.join(dir, 'run'))
    fs.writeFileSync(path.join(dir, 'run', 'control.sock'), '')
    const socketPath = await listening(dir)
    expect(await ask(socketPath, { command: 'status' })).toHaveLength(1)
  })

  it('refuses a request line larger than 64 KiB rather than buffering it without bound', async () => {
    const socketPath = await listening(fs.mkdtempSync(path.join(os.tmpdir(), 'ctl-')))
    const oversized = { command: 'status', padding: 'x'.repeat(64 * 1024 + 1) }
    expect(await ask(socketPath, oversized)).toEqual([{ type: 'error', message: 'Request too large' }])
  })
})

describe('a second site on the same root', () => {
  it('refuses to start while another site is answering on the socket, leaving it untouched', async () => {
    const socketPath = await listening(fs.mkdtempSync(path.join(os.tmpdir(), 'ctl-')))
    await expect(startControlSocket(socketPath)).rejects.toThrow(/already running|another site/i)
    expect(await ask(socketPath, { command: 'status' })).toEqual([expect.objectContaining({ type: expect.any(String) })])
  })

  it('removes a stale socket file that nothing answers on and starts', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctl-'))
    const socketPath = path.join(dir, 'run', 'control.sock')
    fs.mkdirSync(path.dirname(socketPath), { recursive: true })
    fs.writeFileSync(socketPath, '')
    server = await startControlSocket(socketPath)
    await new Promise(r => server!.once('listening', r))
    expect(await ask(socketPath, { command: 'status' })).toEqual([expect.objectContaining({ type: expect.any(String) })])
  })
})

describe('where the socket lives', () => {
  afterEach(() => { delete process.env.SITE_CONTROL_SOCKET })
  it('uses SITE_CONTROL_SOCKET when set', () => {
    expect(controlSocketPath({ SITE_CONTROL_SOCKET: '/run/agenthix-site/control.sock' })).toBe('/run/agenthix-site/control.sock')
  })
  it('refuses a path longer than a Unix socket allows', async () => {
    const long = '/' + 'x'.repeat(120) + '/control.sock'
    await expect(startControlSocket(long)).rejects.toThrow(/SITE_CONTROL_SOCKET/)
  })
})
