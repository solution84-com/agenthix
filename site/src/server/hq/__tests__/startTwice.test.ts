import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sealed } from './testCredential'
import http from 'node:http'
import type { Duplex } from 'node:stream'
import { HQ_SITE_CONTENT_PATH } from '@agenthix/core'

// A real ws server and the real HqConnectionManager, the same convention
// channelHarness.ts uses — only the database is mocked. This upgrade handler
// never completes a handshake: the point here is only to count how many times
// the site dials `/hq-content`, not to exercise a working connection.
const mockHqFindFirst = vi.hoisted(() => vi.fn())
const mockSiteConfigFindFirst = vi.hoisted(() => vi.fn())
const mockUpdateMany = vi.hoisted(() => vi.fn())

vi.mock('#db', () => ({
  prisma: {
    hqConnection: { findFirst: mockHqFindFirst, updateMany: mockUpdateMany },
    siteConfig: { findFirst: mockSiteConfigFindFirst },
  },
}))

import { hqConnectionManager } from '../hqConnection'

// Health reports would run real Docker commands; a channel test reports nothing.
hqConnectionManager.setHealthReporter(() => () => {})

let server: http.Server | null = null
let heldSockets: Duplex[] = []
let contentUpgrades = 0

async function startFakeHq(): Promise<string> {
  contentUpgrades = 0
  heldSockets = []
  server = http.createServer((_req, res) => res.end())
  server.on('upgrade', (req, socket) => {
    if (req.url === HQ_SITE_CONTENT_PATH) contentUpgrades++
    // Held open on purpose — never upgraded, never destroyed here. Destroyed
    // in afterEach so the server can close.
    heldSockets.push(socket)
  })
  await new Promise<void>(resolve => server!.listen(0, resolve))
  const { port } = server!.address() as { port: number }
  return `ws://127.0.0.1:${port}`
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUpdateMany.mockResolvedValue({ count: 1 })
  mockSiteConfigFindFirst.mockResolvedValue({ siteId: 's1', name: 'Box' })
})

afterEach(async () => {
  hqConnectionManager.stop()
  for (const socket of heldSockets) socket.destroy()
  heldSockets = []
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()))
  server = null
})

describe('a second start() without an intervening stop()', () => {
  it('dials the content transport only once', async () => {
    const hqWsUrl = await startFakeHq()
    mockHqFindFirst.mockResolvedValue({
      status: 'ACTIVE',
      hqWsUrl,
      connectionToken: sealed('tok'),
    })

    // Boot's start() and a fresh registration's restart() (itself stop()+
    // start()) can both call start() without anything in between — exactly
    // what this reproduces, without needing the two to literally interleave.
    await hqConnectionManager.start()
    await hqConnectionManager.start()

    // Poll for the dial(s) to reach the server, then wait a bit longer so a
    // stray second dial (the bug) has every chance to arrive too.
    for (let i = 0; i < 100 && contentUpgrades < 1; i++) {
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    await new Promise(resolve => setTimeout(resolve, 100))

    expect(contentUpgrades).toBe(1)
  })
})
