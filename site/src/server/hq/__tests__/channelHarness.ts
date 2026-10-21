import type { Mock } from 'vitest'
import { sealed } from './testCredential'
import http from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { SITE_PROTOCOL_VERSION, HQ_SITE_CHANNEL_PATH, type HQConnectionMessage } from '@agenthix/core'
import { hqConnectionManager } from '../hqConnection'
import type { HealthReporter } from '../siteHealthReport'

/**
 * Shared setup for both channel test files (channelRequests.test.ts,
 * runtimeChannelMethods.test.ts): a real ws server and the real
 * HqConnectionManager dialling it, so these tests exercise the actual
 * channel.request → handleChannelRequest → channelMethods path, not a
 * hand-rolled stand-in for it.
 *
 * `vi.mock('#db')` and any row-module `vi.mock`s stay per test file —
 * vitest hoists `vi.mock` calls to the top of their own module, so a mock
 * declared in here would never apply to the importing file's module graph.
 * Callers pass their own hoisted mock functions in; `startChannelHarness`
 * only fills in the connection-bootstrap return values once it knows the
 * port it bound to.
 */
export type ChannelHarness = {
  ask: (method: string, requestId: string, params?: unknown) => Promise<HQConnectionMessage>
  stop: () => Promise<void>
  socket: WebSocket
}

export type ConnectionMocks = {
  findFirstHqConnection: Mock
  findFirstSiteConfig: Mock
  updateManyHqConnection: Mock
}

/** `healthReporter` defaults to one that reports nothing: the real one would run Docker commands. */
export async function startChannelHarness(
  mocks: ConnectionMocks,
  healthReporter: HealthReporter = () => () => {},
): Promise<ChannelHarness> {
  hqConnectionManager.setHealthReporter(healthReporter)
  mocks.updateManyHqConnection.mockResolvedValue({ count: 1 })
  mocks.findFirstSiteConfig.mockResolvedValue({ siteId: 's1', name: 'Box', description: 'A box' })

  const server = http.createServer()
  // Bound to the channel path: a client that does not append it never connects,
  // which is what makes channelRequests.test.ts's first case a real assertion.
  const wss = new WebSocketServer({ server, path: HQ_SITE_CHANNEL_PATH })
  await new Promise<void>(resolve => server.listen(0, resolve))
  const { port } = server.address() as { port: number }

  mocks.findFirstHqConnection.mockResolvedValue({
    id: 'singleton',
    status: 'PENDING',
    connectionToken: sealed('smc_x_y'),
    hqWsUrl: `ws://127.0.0.1:${port}`,
  })

  const connected = new Promise<WebSocket>(resolve => wss.once('connection', resolve))
  await hqConnectionManager.start()
  const socket = await connected

  function ask(method: string, requestId: string, params: unknown = {}): Promise<HQConnectionMessage> {
    const reply = new Promise<HQConnectionMessage>(resolve => {
      socket.on('message', raw => {
        const msg = JSON.parse(raw.toString()) as HQConnectionMessage
        if (msg.replyTo === requestId) resolve(msg)
      })
    })
    socket.send(JSON.stringify({
      version: SITE_PROTOCOL_VERSION,
      type: 'channel.request',
      siteId: 's1',
      requestId,
      payload: { method, params },
    }))
    return reply
  }

  async function stop(): Promise<void> {
    hqConnectionManager.stop()
    // terminate, not close: a graceful close needs a handshake the manager has
    // already stopped answering, and server.close() then waits on it forever.
    for (const client of wss.clients) client.terminate()
    wss.close()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }

  return { ask, stop, socket }
}
