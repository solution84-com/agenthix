/**
 * R-036, the site-side buffer overflow case.
 *
 * There is no outbound buffer to overflow. `sendEvent` (run.status, run.stream
 * and the credential events) is fire-and-forget by design: with the channel
 * closed it drops the frame, and logs once per closed period rather than once
 * per frame, because a run in progress while hq is unreachable can produce tens
 * of thousands of stream frames. The durable records are the transcript and
 * hq's run.list reconcile on reconnect, not this socket. These tests pin that
 * documented behaviour: no memory grows with the drops, nothing is replayed
 * when the channel opens, and the once-only log re-arms after a successful send.
 *
 * A real ws server and the real HqConnectionManager, like the other channel
 * tests; only the database is mocked. Tests run in order on one manager, and
 * the first relies on it never having sent a frame.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { HQConnectionMessage, RunStatusEvent, RunStreamEvent } from '@agenthix/core'
import { hqConnectionManager } from '../hqConnection'
import { startChannelHarness, type ChannelHarness } from './channelHarness'

const findFirstHqConnection = vi.hoisted(() => vi.fn())
const findFirstSiteConfig = vi.hoisted(() => vi.fn())
const updateManyHqConnection = vi.hoisted(() => vi.fn())

vi.mock('#db', () => ({
  prisma: {
    hqConnection: { findFirst: findFirstHqConnection, updateMany: updateManyHqConnection },
    siteConfig: { findFirst: findFirstSiteConfig },
  },
}))

const FLOOD = 500

const streamFrame = (notice: string): RunStreamEvent => ({
  sessionId: 's1', runId: 'r1', taskId: null, targetRoom: 'session', name: 'agentRunNotice', data: { runId: 'r1', notice },
})
const statusFrame: RunStatusEvent = {
  runId: 'r1', sessionId: 's1', taskId: null, agentId: 'a1', agentHandle: 'ada', status: 'RUNNING', error: null,
  sessionPatch: null, manifestPending: null,
}

const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

function dropWarnings(): unknown[][] {
  return warn.mock.calls.filter(call => String(call[0]).includes('dropped'))
}

async function until(condition: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 200 && !condition(); i++) await new Promise(resolve => setTimeout(resolve, 10))
  if (!condition()) throw new Error(`timed out waiting for ${what}`)
}

// The harness returns once hq's side has accepted the connection, which can be
// before the site's own socket has fired 'open' — and sendEvent drops anything
// sent before that. connectionState() flips to 'connected' in that same 'open'
// handler, so waiting for it is waiting for a genuinely open channel.
async function startOpenChannel(): Promise<ChannelHarness> {
  const harness = await startChannelHarness({ findFirstHqConnection, findFirstSiteConfig, updateManyHqConnection })
  await until(() => hqConnectionManager.connectionState() === 'connected', 'the site to see its channel open')
  return harness
}

function floodWhileClosed(): void {
  for (let i = 0; i < FLOOD; i++) hqConnectionManager.sendEvent('run.stream', streamFrame(String(i)))
}

beforeEach(() => {
  warn.mockClear()
})

describe('sendEvent with the channel closed', () => {
  it('drops every frame and logs the drop once, not once per frame', () => {
    floodWhileClosed()
    expect(dropWarnings()).toHaveLength(1)
  })

  it('does not throw for any event kind', () => {
    expect(() => {
      hqConnectionManager.sendEvent('run.status', statusFrame)
      hqConnectionManager.sendEvent('run.stream', streamFrame('x'))
    }).not.toThrow()
  })
})

describe('sendEvent when the channel then opens', () => {
  it('sends only what is emitted once it is open: nothing dropped earlier is replayed', async () => {
    floodWhileClosed()

    const harness = await startOpenChannel()
    try {
      const frames: HQConnectionMessage[] = []
      harness.socket.on('message', raw => frames.push(JSON.parse(raw.toString()) as HQConnectionMessage))
      hqConnectionManager.sendEvent('run.stream', streamFrame('after-open'))
      await until(() => frames.some(m => m.type === 'site.event'), 'the frame sent after the channel opened')
      // Give a replay of the dropped frames every chance to arrive too.
      await new Promise(resolve => setTimeout(resolve, 100))

      const events = frames.filter(m => m.type === 'site.event')
      expect(events).toHaveLength(1)
      expect(events[0].payload).toEqual({ event: 'run.stream', data: streamFrame('after-open') })
    } finally {
      await harness.stop()
    }
  })
})

describe('the drop log re-arms', () => {
  let harness: ChannelHarness

  beforeEach(async () => {
    harness = await startOpenChannel()
  })

  afterEach(async () => {
    await harness.stop()
  })

  it('and stays silent while frames are being delivered', async () => {
    const frames: HQConnectionMessage[] = []
    harness.socket.on('message', raw => frames.push(JSON.parse(raw.toString()) as HQConnectionMessage))
    hqConnectionManager.sendEvent('run.status', statusFrame)
    await until(() => frames.some(m => m.type === 'site.event'), 'the site.event frame')

    const event = frames.find(m => m.type === 'site.event')
    expect(event?.payload).toEqual({ event: 'run.status', data: statusFrame })
    expect(dropWarnings()).toHaveLength(0)
  })

  it('in a later closed period, once a send has gone out in between', async () => {
    const frames: HQConnectionMessage[] = []
    harness.socket.on('message', raw => frames.push(JSON.parse(raw.toString()) as HQConnectionMessage))
    hqConnectionManager.sendEvent('run.stream', streamFrame('1'))
    await until(() => frames.some(m => m.type === 'site.event'), 'the site.event frame')

    hqConnectionManager.stop()
    floodWhileClosed()
    expect(dropWarnings()).toHaveLength(1)
  })
})
