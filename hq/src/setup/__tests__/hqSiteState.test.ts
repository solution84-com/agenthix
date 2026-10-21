import { describe, it, expect } from 'vitest'
import { hqSiteStateOf } from '../hqSiteState'

// The line setup's Model access step shows about hq's own site, and what the installer waits on.

const health = (dockerRunning: boolean) => ({
  takenAt: '2026-10-11T10:00:00.000Z',
  runs: { running: 0, maxAtOnce: 5 },
  disk: null,
  docker: { running: dockerRunning, version: '27.3.1' },
  agentImage: { name: 'agenthix-agent', present: true, version: '0.4.0' },
  ceilings: null,
  memoryNearlyFull: false,
})

describe('hqSiteStateOf @SC-711', () => {
  it('is unpaired without a pairing secret or a row', () => {
    expect(hqSiteStateOf({ status: 'ONLINE', health: null }, false)).toEqual({ state: 'unpaired', dockerRunning: null, cause: null })
    expect(hqSiteStateOf(null, true)).toEqual({ state: 'unpaired', dockerRunning: null, cause: null })
  })

  it('is connected while online, with Docker as its last report said', () => {
    expect(hqSiteStateOf({ status: 'ONLINE', health: health(true) }, true)).toEqual({ state: 'connected', dockerRunning: true, cause: null })
    expect(hqSiteStateOf({ status: 'ONLINE', health: health(false) }, true)).toEqual({ state: 'connected', dockerRunning: false, cause: null })
  })

  it('is not connected otherwise, or needs upgrading on another protocol', () => {
    expect(hqSiteStateOf({ status: 'OFFLINE', health: null }, true)).toEqual({ state: 'notConnected', dockerRunning: null, cause: null })
    expect(hqSiteStateOf({ status: 'REGISTERED', health: null }, true).state).toBe('notConnected')
    expect(hqSiteStateOf({ status: 'VERSION_MISMATCH', health: null }, true).state).toBe('upgrade')
  })
})

describe('hqSiteStateOf with the cause hq\'s machine reported', () => {
  const seen = new Date('2026-10-14T09:00:00Z')
  const after = { cause: 'credentialRefused' as const, at: new Date('2026-10-14T09:14:00Z') }
  const before = { cause: 'unreachable' as const, at: new Date('2026-10-14T08:00:00Z') }

  it('names the cause while the site is not connected', () => {
    expect(hqSiteStateOf({ status: 'OFFLINE', health: null, lastSeenAt: seen }, true, after).cause).toBe('credentialRefused')
    expect(hqSiteStateOf({ status: 'REGISTERED', health: null, lastSeenAt: null }, true, after).cause).toBe('credentialRefused')
  })

  it('ignores a cause from before the site was last seen, and any while it is connected', () => {
    expect(hqSiteStateOf({ status: 'OFFLINE', health: null, lastSeenAt: seen }, true, before).cause).toBeNull()
    expect(hqSiteStateOf({ status: 'ONLINE', health: null, lastSeenAt: seen }, true, after).cause).toBeNull()
  })

  it('needs no cause to say it needs upgrading, which hq sees itself', () => {
    expect(hqSiteStateOf({ status: 'VERSION_MISMATCH', health: null, lastSeenAt: seen }, true, after)).toMatchObject({ state: 'upgrade', cause: null })
  })
})
