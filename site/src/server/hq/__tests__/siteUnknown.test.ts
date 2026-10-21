import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sealed } from './testCredential'
import http from 'node:http'
import { HQ_SITE_UNKNOWN_HEADER, HQ_SITE_CHANNEL_PATH, HQ_SITE_CONTENT_PATH } from '@agenthix/core'

const updateMany = vi.hoisted(() => vi.fn())
const findFirstConnection = vi.hoisted(() => vi.fn())
const findFirstConfig = vi.hoisted(() => vi.fn())
vi.mock('#db', () => ({
  prisma: {
    hqConnection: { updateMany, findFirst: findFirstConnection },
    siteConfig: { findFirst: findFirstConfig },
  },
}))

import { hqConnectionManager } from '../hqConnection'
import { ContentConnection } from '../content/contentConnection'

// Health reports would run real Docker commands; a channel test reports nothing.
hqConnectionManager.setHealthReporter(() => () => {})

const RECONNECT_DELAY_MS = 5_000
const UNKNOWN_MESSAGE = 'hq does not recognise this site — a fleet admin adds it again in the Fleet Console'

let server: http.Server | null = null
let attempts: { control: number; content: number }
let unknownFor: { control: boolean; content: boolean }

/** A fake hq that refuses every upgrade with 401, carrying the unknown-site header only where asked. */
async function refusingHq(unknown: { control: boolean; content: boolean }) {
  attempts = { control: 0, content: 0 }
  unknownFor = unknown
  server = http.createServer((_q, r) => r.end())
  server.on('upgrade', (req, socket) => {
    const which = req.url === HQ_SITE_CONTENT_PATH ? 'content' : 'control'
    attempts[which]++
    const extra = unknownFor[which] ? `${HQ_SITE_UNKNOWN_HEADER}: 1\r\n` : ''
    socket.write(`HTTP/1.1 401 Unauthorized\r\n${extra}Connection: close\r\n\r\n`)
    socket.destroy()
  })
  await new Promise<void>(r => server!.listen(0, r))
  return (server.address() as { port: number }).port
}

const statuses = () => updateMany.mock.calls.map(([arg]) => (arg as { data: { status: string } }).data.status)
const reconnectTimers = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.filter(([, ms]) => ms === RECONNECT_DELAY_MS)

async function until(check: () => boolean) {
  for (let i = 0; i < 200 && !check(); i++) await new Promise(r => setTimeout(r, 10))
}

beforeEach(() => {
  vi.resetAllMocks()
  updateMany.mockResolvedValue({ count: 1 })
  findFirstConfig.mockResolvedValue({ siteId: 's1', name: 'Box' })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(async () => {
  hqConnectionManager.stop()
  hqConnectionManager.lastError = null
  hqConnectionManager.problem = null
  vi.restoreAllMocks()
  if (server) await new Promise<void>(r => server!.close(() => r()))
  server = null
})

describe('a site hq says it has no record of', () => {
  async function startAgainst(unknown: { control: boolean; content: boolean }) {
    const port = await refusingHq(unknown)
    findFirstConnection.mockResolvedValue({ status: 'ACTIVE', hqWsUrl: `ws://127.0.0.1:${port}${HQ_SITE_CHANNEL_PATH}`, connectionToken: sealed('t') })
    const timers = vi.spyOn(globalThis, 'setTimeout')
    await hqConnectionManager.start()
    return timers
  }

  it('is marked REVOKED with the reason and never DEGRADED, and is not retried', async () => {
    const timers = await startAgainst({ control: true, content: true })
    await until(() => statuses().includes('REVOKED'))
    await new Promise(r => setTimeout(r, 100))

    expect(updateMany).toHaveBeenCalledWith({ data: { status: 'REVOKED' } })
    expect(statuses()).not.toContain('DEGRADED')
    expect(statuses().at(-1)).toBe('REVOKED')
    expect(hqConnectionManager.lastError).toBe(UNKNOWN_MESSAGE)
    expect(hqConnectionManager.problem).toBe('credentialRefused')
    expect(hqConnectionManager.connectionState()).toBe('disconnected')
    expect(reconnectTimers(timers)).toEqual([])
    expect(attempts).toEqual({ control: 1, content: 1 })
  })

  it('tells the operator who adds it again', async () => {
    await startAgainst({ control: true, content: true })
    await until(() => statuses().includes('REVOKED'))
    const said = (console.error as unknown as ReturnType<typeof vi.fn>).mock.calls.map(c => c.join(' ')).join('\n')
    expect(said).toContain(UNKNOWN_MESSAGE)
    expect(said).toContain('Fleet Console')
  })

  it('is not treated as unknown by a 401 without the header — that stays a degraded link that retries', async () => {
    const timers = await startAgainst({ control: false, content: false })
    await until(() => statuses().includes('DEGRADED'))
    await new Promise(r => setTimeout(r, 50))

    expect(statuses()).toContain('DEGRADED')
    expect(statuses()).not.toContain('REVOKED')
    expect(hqConnectionManager.lastError).toBe('hq refused the connection (HTTP 401)')
    expect(hqConnectionManager.problem).toBe('credentialRefused')
    expect(reconnectTimers(timers).length).toBeGreaterThan(0)
  })
})

describe('an hq that does not answer at all', () => {
  it('is the cause the site reports: unreachable', async () => {
    const closed = http.createServer()
    await new Promise<void>(r => closed.listen(0, r))
    const port = (closed.address() as { port: number }).port
    await new Promise<void>(r => closed.close(() => r()))
    findFirstConnection.mockResolvedValue({ status: 'ACTIVE', hqWsUrl: `ws://127.0.0.1:${port}${HQ_SITE_CHANNEL_PATH}`, connectionToken: sealed('t') })
    await hqConnectionManager.start()
    await until(() => hqConnectionManager.problem !== null)
    expect(hqConnectionManager.problem).toBe('unreachable')
  })
})

describe('the content transport refused as unknown', () => {
  it('stops reconnecting, even with nothing else stopping it', async () => {
    const port = await refusingHq({ control: true, content: true })
    const timers = vi.spyOn(globalThis, 'setTimeout')
    const conn = new ContentConnection({ url: `ws://127.0.0.1:${port}${HQ_SITE_CONTENT_PATH}`, token: 't', siteId: 's1', methods: {} })
    try {
      conn.start()
      await until(() => attempts.content > 0)
      await new Promise(r => setTimeout(r, 100))
      expect(reconnectTimers(timers)).toEqual([])
      expect(attempts.content).toBe(1)
    } finally {
      conn.stop()
    }
  })

  it('keeps reconnecting on a 401 without the header', async () => {
    const port = await refusingHq({ control: false, content: false })
    const timers = vi.spyOn(globalThis, 'setTimeout')
    const conn = new ContentConnection({ url: `ws://127.0.0.1:${port}${HQ_SITE_CONTENT_PATH}`, token: 't', siteId: 's1', methods: {} })
    try {
      conn.start()
      await until(() => reconnectTimers(timers).length > 0)
      expect(reconnectTimers(timers).length).toBeGreaterThan(0)
    } finally {
      conn.stop()
    }
  })
})
