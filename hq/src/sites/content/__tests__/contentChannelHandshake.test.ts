import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import http from 'node:http'
import net from 'node:net'
import { SITE_PROTOCOL_VERSION, HQ_SITE_CONTENT_PATH } from '@agenthix/core'
import { attachContentChannel } from '../contentChannelServer'
import { ContentChannelRegistry } from '../contentChannelRegistry'

let server: http.Server
let port: number
let registry: ContentChannelRegistry
let sockets: Set<net.Socket>

let releaseAuth!: () => void
let authStarted!: () => void
let authenticating: Promise<void>

beforeEach(async () => {
  registry = new ContentChannelRegistry()
  sockets = new Set()
  const gate = new Promise<void>(r => { releaseAuth = r })
  authenticating = new Promise<void>(r => { authStarted = r })
  server = http.createServer((_q, r) => r.end())
  server.on('connection', s => { sockets.add(s); s.on('close', () => sockets.delete(s)) })
  attachContentChannel(server, {
    registry,
    authenticate: async siteId => {
      authStarted()
      await gate
      return { siteId }
    },
    siteExists: async () => true,
    recordProtocolVersion: async () => {},
    markVersionMismatch: async () => {},
  })
  await new Promise<void>(r => server.listen(0, r))
  port = (server.address() as { port: number }).port
})

afterEach(async () => {
  for (const s of sockets) s.destroy()
  await new Promise<void>(r => server.close(() => r()))
})

describe('content channel: a site that stops mid-handshake (R-036)', () => {
  it('is not left registered, and does not crash hq, when it hangs up while its credential is still being checked', async () => {
    const uncaught: unknown[] = []
    const collect = (err: unknown) => { uncaught.push(err) }
    process.on('uncaughtException', collect)
    try {
      const client = net.connect(port, '127.0.0.1')
      client.on('error', () => {})
      await new Promise<void>(r => client.once('connect', () => r()))
      client.write(
        `GET ${HQ_SITE_CONTENT_PATH} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n` +
        'Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
        `Authorization: Bearer good\r\nX-Site-Id: s1\r\nX-Site-Protocol-Version: ${SITE_PROTOCOL_VERSION}\r\n\r\n`,
      )
      await authenticating
      client.destroy()
      // Let hq see the socket close before the credential check finishes.
      await new Promise(r => setTimeout(r, 50))
      releaseAuth()
      await new Promise(r => setTimeout(r, 100))

      expect(registry.isConnected('s1')).toBe(false)
      expect(uncaught).toEqual([])
    } finally {
      process.off('uncaughtException', collect)
    }
  })
})
