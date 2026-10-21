import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PRIVATE, SHARED, ask, listen, type Progress } from '../lineServer'

let dir: string
let servers: net.Server[]
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hs-'))
  servers = []
})
afterEach(() => {
  for (const s of servers) s.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

async function serve(mode = PRIVATE, handler: Parameters<typeof listen>[2] = async r => ({ ok: true, echo: r })) {
  const socket = path.join(dir, 'run', 's.sock')
  servers.push(await listen(socket, mode, handler))
  return socket
}

function rawAsk(socket: string, text: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const c = net.createConnection(socket)
    let got = ''
    c.setEncoding('utf8')
    c.on('connect', () => c.write(text))
    c.on('data', d => { got += d })
    c.on('error', reject)
    c.on('close', () => resolve(got))
  })
}

describe('a line socket', () => {
  it('tells a long-running request when the asker goes away, as Ctrl-C on the CLI does', async () => {
    let aborted: () => void = () => {}
    const gone = new Promise<void>(resolve => { aborted = resolve })
    const socket = await serve(PRIVATE, (_r, _p, closed) => new Promise(resolve => {
      closed?.addEventListener('abort', () => { aborted(); resolve({ ok: false }) })
    }))
    const c = net.createConnection(socket)
    c.on('connect', () => c.write('{"op":"console.connect"}\n'))
    await new Promise(r => setTimeout(r, 20))
    c.destroy()
    await gone
  })

  it('answers one request with its progress, then the result', async () => {
    const socket = await serve(PRIVATE, async (_r, progress) => {
      progress({ event: 'step', step: 'Starting HQ' })
      progress({ event: 'stepDone', outcome: 'answers' })
      return { ok: true, op: 'x', result: 1 }
    })
    const seen: Progress[] = []
    expect(await ask(socket, { op: 'x' }, p => seen.push(p))).toEqual({ event: 'result', ok: true, op: 'x', result: 1 })
    expect(seen).toEqual([{ event: 'step', step: 'Starting HQ' }, { event: 'stepDone', outcome: 'answers' }])
  })

  it('keeps the owner socket and its folder to their owner @SC-847', async () => {
    const socket = await serve(PRIVATE)
    expect(fs.statSync(socket).mode & 0o777).toBe(0o600)
    expect(fs.statSync(path.dirname(socket)).mode & 0o777).toBe(0o700)
  })

  it('opens the figures socket to the site’s user', async () => {
    const socket = await serve(SHARED)
    expect(fs.statSync(socket).mode & 0o777).toBe(0o666)
  })

  it('passes a line that is not JSON to the handler as nothing, for it to refuse', async () => {
    const socket = await serve()
    expect(JSON.parse(await rawAsk(socket, 'not json\n'))).toEqual({ event: 'result', ok: true })
  })

  it('refuses a request that is too long, without reading on', async () => {
    const socket = await serve()
    const answer = JSON.parse(await rawAsk(socket, 'x'.repeat(70 * 1024)))
    expect(answer.refusal.code).toBe('malformed')
  })

  it('answers in words when an operation throws', async () => {
    const socket = await serve(PRIVATE, async () => { throw new Error('Docker is not running') })
    expect(await ask(socket, {})).toMatchObject({ ok: false, refusal: { code: 'failed', message: 'Docker is not running' } })
  })
})
