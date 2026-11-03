import { describe, it, expect, afterEach } from 'vitest'
import http from 'node:http'
import net from 'node:net'
import { SITE_PROTOCOL_VERSION, HQ_SITE_CONTENT_PATH } from '@agenthix/core'
import { attachContentChannel } from '../contentChannelServer'
import { ContentChannelRegistry } from '../contentChannelRegistry'

let server: http.Server | undefined
const unhandled: unknown[] = []
const onUnhandled = (e: unknown) => { unhandled.push(e) }

afterEach(async () => {
  process.off('unhandledRejection', onUnhandled)
  await new Promise<void>(r => (server ? server.close(() => r()) : r()))
  server = undefined
})

describe('content channel upgrade when a check rejects', () => {
  it('destroys the socket and leaves no unhandled rejection when the check fails', async () => {
    const failing = async () => { throw new Error('database down') }
    await expectSocketEnds(new ContentChannelRegistry(), failing, failing)
  })

  it('destroys the socket and leaves no unhandled rejection when registering the connection throws', async () => {
    const registry = new ContentChannelRegistry()
    registry.add = () => { throw new Error('registry broke') }
    await expectSocketEnds(registry, async (siteId: string) => ({ siteId }), async () => true)
  })
})

async function expectSocketEnds(
  registry: ContentChannelRegistry,
  authenticate: (siteId: string, credential: string) => Promise<{ siteId: string } | null>,
  siteExists: (siteId: string) => Promise<boolean>,
): Promise<void> {
  {
    unhandled.length = 0
    process.on('unhandledRejection', onUnhandled)
    server = http.createServer((_q, r) => r.end())
    attachContentChannel(server, {
      registry,
      authenticate,
      siteExists,
      recordProtocolVersion: async () => {},
      markVersionMismatch: async () => {},
    })
    await new Promise<void>(r => server!.listen(0, r))
    const port = (server.address() as { port: number }).port

    const closed = await new Promise<boolean>(resolve => {
      const sock = net.connect(port, '127.0.0.1', () => {
        sock.write(
          `GET ${HQ_SITE_CONTENT_PATH} HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
          `Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n` +
          `Authorization: Bearer good\r\nX-Site-Id: s1\r\nX-Site-Protocol-Version: ${SITE_PROTOCOL_VERSION}\r\n\r\n`,
        )
      })
      sock.on('close', () => resolve(true))
      sock.on('error', () => {})
      sock.resume()
      setTimeout(() => resolve(false), 3000)
    })
    await new Promise(r => setTimeout(r, 50))
    expect(closed).toBe(true)
    expect(unhandled).toEqual([])
  }
}
