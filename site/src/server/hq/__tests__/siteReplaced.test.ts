import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sealed } from './testCredential'
import http from 'node:http'
import { HQ_SITE_REPLACED_HEADER, HQ_SITE_CHANNEL_PATH, HQ_SITE_CONTENT_PATH } from '@agenthix/core'

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
import { replacedAtOf } from '../hqAnswers'
import { ContentConnection } from '../content/contentConnection'

hqConnectionManager.setHealthReporter(() => () => {})

const RECONNECT_DELAY_MS = 5_000
const RESTORED_AT = '2026-10-15T09:33:00.000Z'

let server: http.Server | null = null
let attempts: { control: number; content: number }

/** A fake hq that refuses every upgrade with 401, saying a restore replaced this copy when `replaced` is given. */
async function refusingHq(replaced: string | null) {
  attempts = { control: 0, content: 0 }
  server = http.createServer((_q, r) => r.end())
  server.on('upgrade', (req, socket) => {
    attempts[req.url === HQ_SITE_CONTENT_PATH ? 'content' : 'control']++
    const extra = replaced ? `${HQ_SITE_REPLACED_HEADER}: ${replaced}\r\n` : ''
    socket.write(`HTTP/1.1 401 Unauthorized\r\n${extra}Connection: close\r\n\r\n`)
    socket.destroy()
  })
  await new Promise<void>(r => server!.listen(0, r))
  return (server.address() as { port: number }).port
}

const writes = () => updateMany.mock.calls.map(([arg]) => (arg as { data: Record<string, unknown> }).data)
const reconnectTimers = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.filter(([, ms]) => ms === RECONNECT_DELAY_MS)

async function until(check: () => boolean) {
  for (let i = 0; i < 200 && !check(); i++) await new Promise(r => setTimeout(r, 10))
}

async function startAgainst(replaced: string | null) {
  const port = await refusingHq(replaced)
  findFirstConnection.mockResolvedValue({ status: 'ACTIVE', hqWsUrl: `ws://127.0.0.1:${port}${HQ_SITE_CHANNEL_PATH}`, connectionToken: sealed('t') })
  const timers = vi.spyOn(globalThis, 'setTimeout')
  await hqConnectionManager.start()
  return timers
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

describe('a copy of the site hq says a restore onto another machine replaced @SC-928', () => {
  it('records when, ends the link, and never dials again', async () => {
    const timers = await startAgainst(RESTORED_AT)
    await until(() => writes().some(d => d.status === 'REVOKED'))
    await new Promise(r => setTimeout(r, 100))

    expect(writes()).toEqual([{ status: 'REVOKED', replacedAt: new Date(RESTORED_AT) }])
    expect(hqConnectionManager.problem).toBe('credentialRefused')
    expect(hqConnectionManager.lastError).toContain('restored onto another machine')
    expect(hqConnectionManager.connectionState()).toBe('disconnected')
    expect(reconnectTimers(timers)).toEqual([])
    expect(attempts).toEqual({ control: 1, content: 1 })
  })

  it('is not taken from a value that is not a time: that stays an ordinary refusal, retried', async () => {
    const timers = await startAgainst('soon')
    await until(() => reconnectTimers(timers).length > 0)
    expect(writes().some(d => d.status === 'REVOKED')).toBe(false)
  })

  it('reads the time only from the header', () => {
    expect(replacedAtOf({ [HQ_SITE_REPLACED_HEADER.toLowerCase()]: RESTORED_AT })).toEqual(new Date(RESTORED_AT))
    expect(replacedAtOf({})).toBeNull()
  })

  it('stops the content transport too, with nothing else stopping it', async () => {
    const port = await refusingHq(RESTORED_AT)
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
})

describe('an hq that does not answer', () => {
  it('is never taken for a refusal: the site keeps trying', async () => {
    const closed = http.createServer()
    await new Promise<void>(r => closed.listen(0, r))
    const port = (closed.address() as { port: number }).port
    await new Promise<void>(r => closed.close(() => r()))
    findFirstConnection.mockResolvedValue({ status: 'ACTIVE', hqWsUrl: `ws://127.0.0.1:${port}${HQ_SITE_CHANNEL_PATH}`, connectionToken: sealed('t') })
    const timers = vi.spyOn(globalThis, 'setTimeout')
    await hqConnectionManager.start()
    await until(() => reconnectTimers(timers).length > 0)
    expect(hqConnectionManager.problem).toBe('unreachable')
    expect(writes().some(d => d.status === 'REVOKED')).toBe(false)
  })
})
