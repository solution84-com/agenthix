import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { controlSocketPath, preparePrivateFolder, startControlSocket, type CommandHandler } from '../controlSocket'

// The control socket carries commands run on hq's machine to the running hq (the host service sends them);
// it is run here against a socket in a temporary folder.

let server: net.Server | null = null
let dir = ''

afterEach(async () => {
  await new Promise<void>(resolve => (server ? server.close(() => resolve()) : resolve()))
  server = null
  if (dir) fs.rmSync(dir, { recursive: true, force: true })
})

async function start(handler: CommandHandler, requestTimeoutMs?: number) {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-control-'))
  const socketPath = path.join(dir, 'run', 'control.sock')
  server = await startControlSocket(handler, socketPath, requestTimeoutMs)
  return socketPath
}

function send(socketPath: string, line: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const conn = net.createConnection(socketPath)
    let reply = ''
    conn.setEncoding('utf8')
    conn.on('connect', () => conn.write(line))
    conn.on('data', chunk => { reply += chunk })
    conn.on('end', () => resolve(reply))
    conn.on('error', reject)
  })
}

describe('controlSocketPath @SC-721', () => {
  it('is HQ_CONTROL_SOCKET when set, else a folder per port under the temp folder', () => {
    expect(controlSocketPath({ HQ_CONTROL_SOCKET: '/run/x.sock' })).toBe('/run/x.sock')
    expect(controlSocketPath({ PORT: '4101' })).toBe(path.join(os.tmpdir(), 'agenthix-hq-4101', 'control.sock'))
  })
})

describe('the control socket @SC-721', () => {
  it('answers one JSON request with the handler\'s result', async () => {
    const socketPath = await start(async (command, args) => ({ ok: true, text: `${command} ${args.join(' ')}` }))
    const reply = await send(socketPath, '{"command":"reset-password","args":["dana"]}\n')
    expect(JSON.parse(reply)).toEqual({ ok: true, text: 'reset-password dana' })
  })

  it('answers a command that takes longer than reading a request may', async () => {
    const socketPath = await start(() => new Promise(r => setTimeout(() => r({ ok: true, text: 'told' }), 300)), 100)
    const reply = await send(socketPath, '{"command":"address-move","args":["http://198.51.100.24:4100"]}\n')
    expect(JSON.parse(reply)).toEqual({ ok: true, text: 'told' })
  })

  it('is reachable only by this user: the socket 0600 in a 0700 folder', async () => {
    const socketPath = await start(async () => ({ ok: true, text: '' }))
    expect(fs.statSync(socketPath).mode & 0o777).toBe(0o600)
    expect(fs.statSync(path.dirname(socketPath)).mode & 0o777).toBe(0o700)
  })

  it('refuses what is not a request, and a handler\'s failure, without stopping', async () => {
    const socketPath = await start(async () => { throw new Error('boom') })
    expect(JSON.parse(await send(socketPath, 'not json\n'))).toEqual({ ok: false, error: 'Not a request' })
    expect(JSON.parse(await send(socketPath, '{"command":"status"}\n'))).toEqual({ ok: false, error: 'boom' })
  })

  it('replaces a socket left behind by an earlier process', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-control-'))
    const socketPath = path.join(dir, 'control.sock')
    fs.writeFileSync(socketPath, '')
    server = await startControlSocket(async () => ({ ok: true, text: 'here' }), socketPath)
    expect(JSON.parse(await send(socketPath, '{"command":"status"}\n'))).toEqual({ ok: true, text: 'here' })
  })

  it('refuses a folder that is a link', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-control-'))
    fs.mkdirSync(path.join(dir, 'real'))
    fs.symlinkSync(path.join(dir, 'real'), path.join(dir, 'link'))
    expect(() => preparePrivateFolder(path.join(dir, 'link'))).toThrow('not a folder')
  })
})
