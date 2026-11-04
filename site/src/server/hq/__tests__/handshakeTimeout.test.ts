import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import net from 'node:net'
import { sealed } from './testCredential'

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
import { setHandshakeTimeoutForTests } from '../hqAnswers'

hqConnectionManager.setHealthReporter(() => () => {})

let server: net.Server | null = null
const sockets: net.Socket[] = []

beforeEach(() => {
  vi.clearAllMocks()
  mockUpdateMany.mockResolvedValue({ count: 1 })
  mockSiteConfigFindFirst.mockResolvedValue({ siteId: 's1', name: 'Box', description: '' })
  setHandshakeTimeoutForTests(100)
})

afterEach(async () => {
  hqConnectionManager.stop()
  setHandshakeTimeoutForTests()
  for (const s of sockets.splice(0)) s.destroy()
  if (server) await new Promise<void>(r => server!.close(() => r()))
  server = null
})

describe('the dial to hq', () => {
  it('gives up on an hq that accepts the connection and never answers the upgrade', async () => {
    const closed = vi.fn()
    server = net.createServer(socket => {
      sockets.push(socket)
      socket.on('data', () => {})
      socket.on('close', closed)
    })
    await new Promise<void>(r => server!.listen(0, r))
    const { port } = server.address() as net.AddressInfo
    mockHqFindFirst.mockResolvedValue({ status: 'ACTIVE', hqWsUrl: `ws://127.0.0.1:${port}/hq-link`, connectionToken: sealed('t') })

    await hqConnectionManager.start()
    await vi.waitFor(() => expect(closed).toHaveBeenCalled(), { timeout: 3_000 })
  })
})
