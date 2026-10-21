import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sealed } from './testCredential'
import http from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { SITE_PROTOCOL_VERSION_HEADER, HQ_SITE_CONTENT_PATH, SITE_PROTOCOL_VERSION, parseProtocolVersion } from '@agenthix/core'

// What a 426 states: hq's own version, here two majors ahead of this site's.
const HQ_VERSION = `${parseProtocolVersion(SITE_PROTOCOL_VERSION)!.major + 2}.0`

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
import { isHqConnectionStatus } from '../connectionStatus'

// Health reports would run real Docker commands; a channel test reports nothing.
hqConnectionManager.setHealthReporter(() => () => {})

let server: http.Server

beforeEach(async () => {
  vi.resetAllMocks()
  updateMany.mockResolvedValue({ count: 1 })
  server = http.createServer((_q, r) => r.end())
  server.on('upgrade', (_req, socket) => {
    socket.write(`HTTP/1.1 426 Upgrade Required\r\n${SITE_PROTOCOL_VERSION_HEADER}: ${HQ_VERSION}\r\nConnection: close\r\n\r\n`)
    socket.destroy()
  })
  await new Promise<void>(r => server.listen(0, r))
  const port = (server.address() as { port: number }).port
  findFirstConnection.mockResolvedValue({ status: 'ACTIVE', hqWsUrl: `ws://127.0.0.1:${port}/hq-link`, connectionToken: sealed('t') })
  findFirstConfig.mockResolvedValue({ siteId: 's1', name: 'Box' })
})

afterEach(async () => {
  hqConnectionManager.stop()
  // The singleton outlives any one test — a mismatch recorded here must not
  // leak into the next test's "nothing has happened yet" assumptions.
  hqConnectionManager.requiredProtocolVersion = null
  await new Promise<void>(r => server.close(() => r()))
})

async function until(check: () => boolean) {
  for (let i = 0; i < 200 && !check(); i++) await new Promise(r => setTimeout(r, 10))
}

describe('a version the hq refuses @SC-291 @SC-440', () => {
  it('is a status of its own', () => {
    expect(isHqConnectionStatus('VERSION_MISMATCH')).toBe(true)
  })

  it('records VERSION_MISMATCH, not DEGRADED, and remembers the version hq requires', async () => {
    await hqConnectionManager.start()
    await until(() => hqConnectionManager.requiredProtocolVersion !== null)

    expect(hqConnectionManager.requiredProtocolVersion).toBe(HQ_VERSION)
    expect(hqConnectionManager.problem).toBe('versionMismatch')
    expect(hqConnectionManager.lastError).toBe(
      `HQ speaks protocol ${HQ_VERSION} and this site speaks ${SITE_PROTOCOL_VERSION}, too far apart to work together: upgrade this site.`,
    )
    expect(updateMany).toHaveBeenCalledWith({ data: { status: 'VERSION_MISMATCH' } })
    // The close that follows the refusal must not overwrite it as a network failure.
    await new Promise(r => setTimeout(r, 50))
    const statuses = updateMany.mock.calls.map(([arg]) => (arg as { data: { status: string } }).data.status)
    expect(statuses.at(-1)).toBe('VERSION_MISMATCH')
  })

  it('keeps the site linked — it never writes REVOKED or clears the credential', async () => {
    await hqConnectionManager.start()
    // Wait on a signal this test produced itself, not on shared singleton state
    // another test may have already set — otherwise this can pass vacuously
    // before this test's own connection attempt has written anything at all.
    await until(() => updateMany.mock.calls.some(([arg]) => (arg as { data: { status: string } }).data.status === 'VERSION_MISMATCH'))
    expect(updateMany.mock.calls.some(([arg]) => (arg as { data: { status: string } }).data.status === 'VERSION_MISMATCH')).toBe(true)

    const writes = updateMany.mock.calls.map(([arg]) => JSON.stringify(arg))
    expect(writes.some(w => w.includes('REVOKED'))).toBe(false)
    expect(writes.some(w => w.includes('connectionToken'))).toBe(false)
  })
})

describe('a refusal on the content transport alone', () => {
  it('never decides the control channel\'s own status', async () => {
    // A fake hq that accepts the control channel normally but refuses only
    // the content transport with a 426 — the two sockets must be judged
    // independently, exactly as hq's own two connections are.
    // A plain mutable holder, not a bare `let` — the assignment happens inside
    // an escaping upgrade callback, and TS's control-flow narrowing does not
    // track that across the closure boundary the way this test needs.
    const held: { control: WebSocket | null } = { control: null }
    let contentRefused = false
    const wss = new WebSocketServer({ noServer: true })
    const mixedServer = http.createServer((_q, r) => r.end())
    mixedServer.on('upgrade', (req, socket, head) => {
      if (req.url === HQ_SITE_CONTENT_PATH) {
        socket.write(`HTTP/1.1 426 Upgrade Required\r\n${SITE_PROTOCOL_VERSION_HEADER}: ${HQ_VERSION}\r\nConnection: close\r\n\r\n`)
        socket.destroy()
        contentRefused = true
        return
      }
      wss.handleUpgrade(req, socket, head, ws => {
        held.control = ws
      })
    })

    try {
      await new Promise<void>(r => mixedServer.listen(0, r))
      const port = (mixedServer.address() as { port: number }).port
      findFirstConnection.mockResolvedValue({
        status: 'ACTIVE',
        hqWsUrl: `ws://127.0.0.1:${port}/hq-link`,
        connectionToken: sealed('t'),
      })

      await hqConnectionManager.start()
      await until(() => held.control !== null && contentRefused)
      // Give any wrongly-wired handler every chance to fire too.
      await new Promise(r => setTimeout(r, 50))

      expect(hqConnectionManager.requiredProtocolVersion).toBeNull()
      const writesBeforeDisconnect = updateMany.mock.calls.map(([arg]) => JSON.stringify(arg))
      expect(writesBeforeDisconnect.some(w => w.includes('VERSION_MISMATCH'))).toBe(false)

      // An unrelated control-channel disconnect must still take the ordinary
      // DEGRADED path — the content refusal must not have suppressed it.
      updateMany.mockClear()
      held.control?.terminate()
      await until(() => updateMany.mock.calls.some(([arg]) => (arg as { data: { status: string } }).data.status === 'DEGRADED'))
      expect(updateMany).toHaveBeenCalledWith({ data: { status: 'DEGRADED' } })
    } finally {
      held.control?.terminate()
      wss.close()
      await new Promise<void>(r => mixedServer.close(() => r()))
    }
  })
})

describe('a mismatch that is no longer the problem', () => {
  async function refusingHq(statusFor: (attempt: number) => number) {
    let attempts = 0
    const refusing = http.createServer((_q, r) => r.end())
    refusing.on('upgrade', (req, socket) => {
      if (req.url === HQ_SITE_CONTENT_PATH) {
        socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n')
        socket.destroy()
        return
      }
      const status = statusFor(++attempts)
      const extra = status === 426 ? `${SITE_PROTOCOL_VERSION_HEADER}: ${HQ_VERSION}\r\n` : ''
      socket.write(`HTTP/1.1 ${status} Refused\r\n${extra}Connection: close\r\n\r\n`)
      socket.destroy()
    })
    await new Promise<void>(r => refusing.listen(0, r))
    const port = (refusing.address() as { port: number }).port
    findFirstConnection.mockResolvedValue({ status: 'ACTIVE', hqWsUrl: `ws://127.0.0.1:${port}/hq-link`, connectionToken: sealed('t') })
    return refusing
  }

  const statuses = () => updateMany.mock.calls.map(([arg]) => (arg as { data: { status: string } }).data.status)

  it('is cleared by a later ordinary refusal, which then reads as DEGRADED', async () => {
    const refusing = await refusingHq(attempt => (attempt === 1 ? 426 : 401))
    try {
      await hqConnectionManager.start()
      await until(() => statuses().includes('VERSION_MISMATCH'))
      await new Promise(r => setTimeout(r, 50))
      expect(hqConnectionManager.requiredProtocolVersion).toBe(HQ_VERSION)
      expect(statuses().at(-1)).toBe('VERSION_MISMATCH')

      updateMany.mockClear()
      // The retry after a mismatch waits a minute; restart() is the same
      // attempt without the wait.
      await hqConnectionManager.restart()
      await until(() => statuses().includes('DEGRADED'))
      expect(hqConnectionManager.requiredProtocolVersion).toBeNull()
      expect(statuses()).toContain('DEGRADED')
      expect(statuses()).not.toContain('VERSION_MISMATCH')
    } finally {
      hqConnectionManager.stop()
      await new Promise<void>(r => refusing.close(() => r()))
    }
  })

  it('is cleared when hq cannot be reached at all, which then reads as DEGRADED', async () => {
    const refusing = await refusingHq(() => 426)
    const port = (refusing.address() as { port: number }).port
    await hqConnectionManager.start()
    await until(() => statuses().includes('VERSION_MISMATCH'))
    await new Promise(r => setTimeout(r, 50))
    expect(hqConnectionManager.requiredProtocolVersion).toBe(HQ_VERSION)

    hqConnectionManager.stop()
    await new Promise<void>(r => refusing.close(() => r()))
    // Nothing listens on the port any more: the next attempt fails without an answer.
    findFirstConnection.mockResolvedValue({ status: 'ACTIVE', hqWsUrl: `ws://127.0.0.1:${port}/hq-link`, connectionToken: sealed('t') })
    updateMany.mockClear()
    await hqConnectionManager.restart()
    await until(() => statuses().includes('DEGRADED'))
    expect(hqConnectionManager.requiredProtocolVersion).toBeNull()
    expect(statuses()).toContain('DEGRADED')
  })
})

