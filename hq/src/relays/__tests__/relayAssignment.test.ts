import { describe, it, expect, vi, afterEach } from 'vitest'
import { RELAY_SITE_LINE_PATH, type ProtocolVersion, type RelayAssignParams } from '@agenthix/core'
import { createRelayAssigner, speaksRelays, PASS_RENEWAL_MS, ASSIGN_RETRY_MS, type RelayAssignmentDeps } from '../relayAssignment'

vi.mock('../../server/utils/logger', () => ({ Logger: class { info() {} warn() {} error() {} } }))

const V18: ProtocolVersion = { major: 1, minor: 8 }

function harness(overrides: Partial<RelayAssignmentDeps> = {}) {
  const connections = new Map<string, { protocol: ProtocolVersion }>([['site-1', { protocol: V18 }]])
  const sent: Array<{ siteId: string; params: RelayAssignParams }> = []
  let passes = 0
  const deps: RelayAssignmentDeps = {
    connection: siteId => connections.get(siteId) ?? null,
    request: async (siteId, params) => { sent.push({ siteId, params }); return { taken: true } },
    place: async () => ({ relayId: 'relay-hq', lineUrl: RELAY_SITE_LINE_PATH }),
    signPass: async ({ siteId, relayId }) => ({ token: `pass-${++passes}-${siteId}-${relayId}`, expiresAt: Date.now() + 3_600_000 }),
    ...overrides,
  }
  const assigner = createRelayAssigner(deps)
  return { assigner, connections, sent }
}

afterEach(() => { vi.useRealTimers() })

describe('relay assignment on a site connecting @SC-1528', () => {
  it("sends hq's relay's line path and a fresh pass for this site and relay", async () => {
    const { assigner, sent } = harness()
    await assigner.onSiteConnected('site-1')
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ siteId: 'site-1', params: { relayId: 'relay-hq', lineUrl: '/relay-line', pass: 'pass-1-site-1-relay-hq' } })
    expect(sent[0].params.passExpiresAt).toBeGreaterThan(Date.now())
    assigner.stop()
  })

  it('sends nothing when no relay is available, and does not fail', async () => {
    const { assigner, sent } = harness({ place: async () => null })
    await expect(assigner.onSiteConnected('site-1')).resolves.toBeUndefined()
    expect(sent).toEqual([])
    assigner.stop()
  })

  it('sends nothing to a site speaking a protocol before relays', async () => {
    const { assigner, connections, sent } = harness()
    connections.set('site-1', { protocol: { major: 1, minor: 7 } })
    await assigner.onSiteConnected('site-1')
    expect(sent).toEqual([])
    expect(speaksRelays({ major: 2, minor: 0 })).toBe(true)
    expect(speaksRelays({ major: 1, minor: 8 })).toBe(true)
  })

  it('sends nothing to a site that is not connected, or that went while its pass was made', async () => {
    const { assigner, sent } = harness()
    await assigner.onSiteConnected('site-2')
    expect(sent).toEqual([])

    const gone: ReturnType<typeof harness> = harness({
      signPass: async () => { gone.connections.delete('site-1'); return { token: 't', expiresAt: 0 } },
    })
    await gone.assigner.onSiteConnected('site-1')
    expect(gone.sent).toEqual([])
  })

  it('never throws when the site cannot be asked', async () => {
    const { assigner } = harness({ request: async () => { throw new Error('Execution Site site-1 is not connected') } })
    await expect(assigner.onSiteConnected('site-1')).resolves.toBeUndefined()
    assigner.stop()
  })
})

describe('pass renewal @SC-1528', () => {
  it('sends a new pass before the old one ends, while the same connection lasts', async () => {
    vi.useFakeTimers()
    const { assigner, sent } = harness()
    await assigner.onSiteConnected('site-1')
    await vi.advanceTimersByTimeAsync(PASS_RENEWAL_MS - 1)
    expect(sent).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(sent).toHaveLength(2)
    expect(sent[1].params.pass).toBe('pass-2-site-1-relay-hq')
    assigner.stop()
  })

  it('stops renewing for a connection that was replaced or closed', async () => {
    vi.useFakeTimers()
    const { assigner, connections, sent } = harness()
    await assigner.onSiteConnected('site-1')
    connections.set('site-1', { protocol: V18 }) // a reconnect is a new connection object
    await vi.advanceTimersByTimeAsync(PASS_RENEWAL_MS)
    expect(sent).toHaveLength(1)
    assigner.stop()
  })

  it('tries again soon when the site did not take the assignment, or could not be asked', async () => {
    vi.useFakeTimers()
    let calls = 0
    const { assigner } = harness({
      request: async () => {
        calls++
        if (calls === 1) return { taken: false, problem: 'an address it may not dial' }
        if (calls === 2) throw new Error('timed out')
        return { taken: true }
      },
    })
    await assigner.onSiteConnected('site-1')
    await vi.advanceTimersByTimeAsync(ASSIGN_RETRY_MS)
    expect(calls).toBe(2)
    await vi.advanceTimersByTimeAsync(ASSIGN_RETRY_MS)
    expect(calls).toBe(3)
    await vi.advanceTimersByTimeAsync(ASSIGN_RETRY_MS)
    expect(calls).toBe(3)
    assigner.stop()
  })
})
