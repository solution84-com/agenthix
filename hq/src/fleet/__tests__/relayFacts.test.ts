/** `relay.facts` (relayFacts.ts): hq's own relay for the Fleet Console, answering only while it keeps reporting. */
import { describe, expect, it, vi } from 'vitest'

vi.mock('wasp/server', () => ({ prisma: {} }))

import { relayFactsOf, RELAY_SILENT_AFTER_MS } from '../relayFacts'

const now = new Date('2026-10-26T08:00:00.000Z')
const seen = (agoMs: number) => new Date(now.getTime() - agoMs)
const load = { startedAt: '2026-10-26T06:00:00.000Z', sites: ['a', 'b'], openStreams: 3, bytesCarried: 38_000_000 }

describe('hq’s relay for the Fleet Console @SC-1530', () => {
  it('gives its address, the sites it serves and its traffic from its last report', () => {
    expect(relayFactsOf({ name: 'hq-box', state: 'ON', lastSeenAt: seen(5_000), load }, 'https://files.acme.example', now)).toEqual({
      name: 'hq-box', filesAddress: 'https://files.acme.example', answering: true, lastSeenAt: seen(5_000).toISOString(),
      sites: 2, openStreams: 3, bytesCarried: 38_000_000,
    })
  })

  it('is not answering after a minute of silence, when quiet, or when it has never been heard', () => {
    expect(relayFactsOf({ name: 'r', state: 'ON', lastSeenAt: seen(RELAY_SILENT_AFTER_MS + 1), load }, null, now).answering).toBe(false)
    expect(relayFactsOf({ name: 'r', state: 'QUIET', lastSeenAt: seen(1_000), load }, null, now).answering).toBe(false)
    expect(relayFactsOf({ name: 'r', state: 'ON', lastSeenAt: null, load: null }, null, now))
      .toMatchObject({ answering: false, lastSeenAt: null, sites: null, openStreams: null, bytesCarried: null })
  })

  it('reads nothing from a report that is not its shape', () => {
    expect(relayFactsOf({ name: 'r', state: 'ON', lastSeenAt: seen(1), load: { sites: 'x', openStreams: -1, bytesCarried: 1.5 } }, null, now))
      .toMatchObject({ sites: null, openStreams: null, bytesCarried: null })
  })
})
