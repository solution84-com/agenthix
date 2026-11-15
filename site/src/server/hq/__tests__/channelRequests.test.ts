import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { WebSocket } from 'ws'
import { SITE_PROTOCOL_VERSION, type HQConnectionMessage } from '@agenthix/core'
import { startChannelHarness, type ChannelHarness } from './channelHarness'

// A real ws server and the real HqConnectionManager dialling it. Only the
// database is mocked — the point of this test is the wire, and a mocked socket
// would assert nothing about it.
const findFirstHqConnection = vi.hoisted(() => vi.fn())
const findFirstSiteConfig = vi.hoisted(() => vi.fn())
const updateManyHqConnection = vi.hoisted(() => vi.fn())
const findUniqueWorkspace = vi.hoisted(() => vi.fn())

vi.mock('#db', () => ({
  prisma: {
    hqConnection: { findFirst: findFirstHqConnection, updateMany: updateManyHqConnection },
    siteConfig: { findFirst: findFirstSiteConfig },
    workspace: { findUnique: findUniqueWorkspace },
  },
}))

import { channelMethods } from '../channelMethods'

let harness: ChannelHarness
let socket: WebSocket

beforeEach(async () => {
  vi.clearAllMocks()
  harness = await startChannelHarness({ findFirstHqConnection, findFirstSiteConfig, updateManyHqConnection })
  socket = harness.socket
})

afterEach(async () => {
  await harness.stop()
})

function ask(method: string, requestId: string, params: unknown = {}): Promise<HQConnectionMessage> {
  return harness.ask(method, requestId, params)
}

describe('answering hq over the control channel @SC-295', () => {
  it('dials the channel path even though the stored url has none', () => {
    // The connection in beforeEach only happened because resolveChannelUrl
    // appended it — the server rejects any other path.
    expect(socket).toBeDefined()
  })

  it("answers site.describe with this site's own details", async () => {
    const msg = await ask('site.describe', 'r1')
    expect(msg.type).toBe('channel.response')
    expect(msg.payload).toMatchObject({
      siteId: 's1',
      protocolVersion: SITE_PROTOCOL_VERSION,
    })
  })

  it('answers a method it does not know with an explicit error', async () => {
    const msg = await ask('site.nonsense', 'r2')
    expect(msg.type).toBe('channel.error')
    expect(msg.payload).toMatchObject({ code: 'unknown_method' })
  })
})

describe('answering hq over the control channel @SC-296', () => {
  it('turns a handler failure into an error reply, not a hang', async () => {
    findFirstSiteConfig.mockRejectedValue(new Error('database is away'))
    const msg = await ask('site.describe', 'r3')
    expect(msg.type).toBe('channel.error')
    expect(msg.payload).toMatchObject({ code: 'handler_failed', message: 'database is away' })
  })
})

describe('workspace + repo-attachment channel methods @SC-320', () => {
  it('registers every workspace/repo method the channel map exposes', () => {
    const expected = [
      'workspace.get', 'workspace.list', 'workspace.listByOwner', 'workspace.listByIds',
      'workspace.create', 'workspace.setAllowedTools', 'workspace.delete',
      'repo.getForTarget', 'repo.findByUrl', 'repo.list', 'repo.create', 'repo.delete',
    ]
    const served: Readonly<Record<string, unknown>> = channelMethods
    for (const method of expected) {
      expect(served[method]).toBeTypeOf('function')
    }
  })

  it('dispatches workspace.get through handleChannelRequest end-to-end', async () => {
    findUniqueWorkspace.mockResolvedValue({ id: 'w1', name: 'W1' })
    const msg = await ask('workspace.get', 'r4', { id: 'w1' })
    expect(msg.type).toBe('channel.response')
    expect(msg.payload).toMatchObject({ id: 'w1', name: 'W1' })
    expect(findUniqueWorkspace).toHaveBeenCalledWith({ where: { id: 'w1' } })
  })
})
