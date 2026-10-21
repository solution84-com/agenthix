import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sealed } from './testCredential'
import http from 'node:http'
import { WebSocketServer } from 'ws'
import { HQ_SITE_CHANNEL_PATH } from '@agenthix/core'

// R-161: hq's admin-set label is how hq identifies a site, and the site has no
// authority over it — so a site says nothing about its own name when it connects.
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

let server: http.Server
let wss: WebSocketServer
const received: string[] = []

beforeEach(async () => {
  vi.clearAllMocks()
  received.length = 0
  mockUpdateMany.mockResolvedValue({ count: 1 })
  mockSiteConfigFindFirst.mockResolvedValue({ siteId: 's1', name: 'Box', description: 'A box' })
  server = http.createServer()
  wss = new WebSocketServer({ server, path: HQ_SITE_CHANNEL_PATH })
  wss.on('connection', ws => {
    ws.on('message', raw => received.push((JSON.parse(raw.toString()) as { type: string }).type))
  })
  await new Promise<void>(resolve => server.listen(0, resolve))
  const { port } = server.address() as { port: number }
  mockHqFindFirst.mockResolvedValue({
    id: 'singleton', status: 'ACTIVE', connectionToken: sealed('smc_x_y'), hqWsUrl: `ws://127.0.0.1:${port}`,
  })
})

afterEach(async () => {
  hqConnectionManager.stop()
  for (const client of wss.clients) client.terminate()
  wss.close()
  await new Promise<void>(resolve => server.close(() => resolve()))
})

describe('what a site says when it connects — R-161', () => {
  it('sends no identity update, though it holds a name of its own', async () => {
    const opened = new Promise<void>(resolve => hqConnectionManager.onOpen(resolve))
    await hqConnectionManager.start()
    await opened
    // Long enough for a frame sent on open to have crossed the loopback socket.
    await new Promise(resolve => setTimeout(resolve, 150))

    expect(received).not.toContain('site.identity_update')
  })

  it('no longer offers a way to send one', () => {
    expect('sendIdentityUpdate' in hqConnectionManager).toBe(false)
  })
})
