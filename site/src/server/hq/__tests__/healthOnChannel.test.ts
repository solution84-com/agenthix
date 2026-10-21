/**
 * The site's health reaches hq as a `site.health` event while the channel is
 * open, and stops when it closes. The reporter is injected, so no Docker
 * command runs; what a report holds is siteHealthReport.test.ts's.
 */
import { describe, it, expect, vi } from 'vitest'
import { SITE_HEALTH_EVENT, type HQConnectionMessage, type SiteHealth } from '@agenthix/core'
import { startChannelHarness } from './channelHarness'

const findFirstHqConnection = vi.hoisted(() => vi.fn())
const findFirstSiteConfig = vi.hoisted(() => vi.fn())
const updateManyHqConnection = vi.hoisted(() => vi.fn())

vi.mock('#db', () => ({
  prisma: {
    hqConnection: { findFirst: findFirstHqConnection, updateMany: updateManyHqConnection },
    siteConfig: { findFirst: findFirstSiteConfig },
  },
}))

const report: SiteHealth = {
  takenAt: '2026-10-09T10:00:00.000Z',
  runs: { running: 0, maxAtOnce: 5 },
  disk: null,
  docker: { running: true, version: '27' },
  agentImage: { name: 'agenthix-agent', present: true, version: null },
  ceilings: null,
  memoryNearlyFull: false,
}

describe("the site's health on the channel @SC-766", () => {
  it('is sent as site.health once the channel opens, and the reporter is stopped when it closes', async () => {
    const stop = vi.fn()
    // Sent a moment after the open, so the listener below is in place on hq's side.
    const reporter = vi.fn((send: (h: SiteHealth) => void) => {
      setTimeout(() => send(report), 50)
      return stop
    })
    const harness = await startChannelHarness({ findFirstHqConnection, findFirstSiteConfig, updateManyHqConnection }, reporter)
    const event = await new Promise<HQConnectionMessage>(resolve => {
      harness.socket.on('message', raw => {
        const msg = JSON.parse(raw.toString()) as HQConnectionMessage<{ event: string }>
        if (msg.type === 'site.event' && msg.payload.event === SITE_HEALTH_EVENT) resolve(msg)
      })
    })
    expect(event.payload).toEqual({ event: SITE_HEALTH_EVENT, data: report })
    expect(reporter).toHaveBeenCalledTimes(1)

    await harness.stop()
    expect(stop).toHaveBeenCalled()
  })
})
