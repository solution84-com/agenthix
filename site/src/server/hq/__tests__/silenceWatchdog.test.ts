import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sealed } from './testCredential'
import http from 'node:http'
import { WebSocketServer } from 'ws'
import { HQ_SITE_CONTENT_PATH, SITE_PROTOCOL_VERSION } from '@agenthix/core'

// The real HqConnectionManager against a real ws server; only the database is mocked.
const mockHqFindFirst = vi.hoisted(() => vi.fn())
const mockSiteConfigFindFirst = vi.hoisted(() => vi.fn())
const mockUpdateMany = vi.hoisted(() => vi.fn())

vi.mock('#db', () => ({
  prisma: {
    hqConnection: { findFirst: mockHqFindFirst, updateMany: mockUpdateMany },
    siteConfig: { findFirst: mockSiteConfigFindFirst },
  },
}))

import { hqConnectionManager, setSilenceTimeoutForTests } from '../hqConnection'

// Health reports would run real Docker commands; a channel test reports nothing.
hqConnectionManager.setHealthReporter(() => () => {})

let server: http.Server | null = null
let wss: WebSocketServer | null = null
const timers: Array<ReturnType<typeof setInterval>> = []

/** Accepts the control channel and counts its upgrades; refuses the content transport. */
async function fakeHq(opts: { pingEveryMs?: number } = {}) {
  const state = { upgrades: 0, closes: 0 }
  wss = new WebSocketServer({ noServer: true })
  server = http.createServer((_q, r) => r.end())
  server.on('upgrade', (req, socket, head) => {
    if (req.url === HQ_SITE_CONTENT_PATH) {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }
    state.upgrades++
    wss!.handleUpgrade(req, socket, head, ws => {
      if (opts.pingEveryMs) {
        const t = setInterval(() => {
          ws.send(JSON.stringify({ version: SITE_PROTOCOL_VERSION, type: 'ping', siteId: 's1', payload: {} }))
        }, opts.pingEveryMs)
        timers.push(t)
        ws.on('close', () => clearInterval(t))
      }
      ws.on('close', () => { state.closes++ })
    })
  })
  await new Promise<void>(r => server!.listen(0, r))
  const port = (server!.address() as { port: number }).port
  mockHqFindFirst.mockResolvedValue({ status: 'ACTIVE', hqWsUrl: `ws://127.0.0.1:${port}/hq-link`, connectionToken: sealed('t') })
  return state
}

async function until(check: () => boolean, ms: number) {
  for (const deadline = Date.now() + ms; Date.now() < deadline && !check();) await new Promise(r => setTimeout(r, 10))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUpdateMany.mockResolvedValue({ count: 1 })
  mockSiteConfigFindFirst.mockResolvedValue({ siteId: 's1', name: 'Box', description: '' })
  setSilenceTimeoutForTests(100)
})

afterEach(async () => {
  hqConnectionManager.stop()
  setSilenceTimeoutForTests()
  for (const t of timers.splice(0)) clearInterval(t)
  for (const c of wss?.clients ?? []) c.terminate()
  wss?.close()
  wss = null
  if (server) await new Promise<void>(r => server!.close(() => r()))
  server = null
})

describe('the control channel\'s silence watchdog', () => {
  it('gives up on a connection that hears nothing, and reconnects', async () => {
    const hq = await fakeHq()
    await hqConnectionManager.start()
    // The site terminates within the timeout; the redial then waits out the
    // ordinary reconnect delay, which this does not shorten.
    await until(() => hq.closes >= 1, 1_000)
    expect(hq.closes).toBe(1)
    await until(() => hq.upgrades >= 2, 7_000)
    expect(hq.upgrades).toBe(2)
  }, 10_000)

  it('keeps a connection that hq keeps pinging', async () => {
    const hq = await fakeHq({ pingEveryMs: 30 })
    await hqConnectionManager.start()
    await until(() => hq.upgrades >= 1, 1_000)
    await new Promise(r => setTimeout(r, 400))
    expect(hq.upgrades).toBe(1)
    expect(hq.closes).toBe(0)
  })
})
