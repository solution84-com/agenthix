import { describe, it, expect } from 'vitest'
import type { SiteHealth } from '@agenthix/core'
import { siteStanding, awayWithinGrace, NOT_CONNECTED_GRACE_MS, upgradeSide, type StandingInput } from '../siteStanding'

const now = new Date('2026-10-09T12:00:00Z')
const longAgo = new Date('2026-10-01T00:00:00Z')
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000)
const GIB = 1024 ** 3

const healthy: SiteHealth = {
  takenAt: now.toISOString(),
  runs: { running: 0, maxAtOnce: 5 },
  disk: { freeBytes: 200 * GIB, totalBytes: 500 * GIB },
  docker: { running: true, version: '27' },
  agentImage: { name: 'agenthix-agent', present: true, version: null },
  ceilings: null,
  memoryNearlyFull: false,
}

const site = (over: Partial<StandingInput> = {}): StandingInput => ({
  status: 'ONLINE', isDefault: false, registeredAt: longAgo, lastSeenAt: minutesAgo(1), protocolVersion: '1.0',
  health: healthy, revoked: false, projectCount: 1, waiting: { runs: 0, changes: 0 }, ...over,
})

const standing = (over: Partial<StandingInput> = {}, startedAt = longAgo) => siteStanding(site(over), now, startedAt)

describe('where a site is listed @SC-632', () => {
  it('is Running when connected with nothing wrong', () => {
    expect(standing()).toEqual({ group: 'running', problems: [] })
  })

  it('is Never connected once approved and not yet heard from', () => {
    expect(standing({ status: 'REGISTERED', lastSeenAt: null }).group).toBe('neverConnected')
  })

  it('is Not connected when away with nothing waiting for it', () => {
    expect(standing({ status: 'OFFLINE', lastSeenAt: minutesAgo(60) })).toEqual({ group: 'notConnected', problems: [] })
  })

  it('is Removed once removed, unless projects are still on it', () => {
    expect(standing({ status: 'REVOKED', revoked: true, projectCount: 0 })).toEqual({ group: 'removed', problems: [] })
    expect(standing({ status: 'REVOKED', revoked: true, projectCount: 2 }))
      .toEqual({ group: 'needsYou', problems: [{ kind: 'removedWithProjects', projects: 2 }] })
  })
})

describe('what needs an admin @SC-632 @SC-631', () => {
  it('a refused site, at once, with its version and the side that must upgrade', () => {
    expect(standing({ status: 'VERSION_MISMATCH', protocolVersion: '', lastSeenAt: now }).problems)
      .toEqual([{ kind: 'upgrade', protocolVersion: '', side: 'site' }])
    expect(standing({ status: 'VERSION_MISMATCH', protocolVersion: '3.0', lastSeenAt: now }).problems)
      .toEqual([{ kind: 'upgrade', protocolVersion: '3.0', side: 'hq' }])
  })

  it('names the side behind by the compatibility rule: HQ for a site two majors ahead, else the site', () => {
    expect(upgradeSide('3.0')).toBe('hq')
    expect(upgradeSide('9.4')).toBe('hq')
    expect(upgradeSide('2.1')).toBe('site')
    expect(upgradeSide('six')).toBe('site')
    expect(upgradeSide(null)).toBe('site')
  })

  it('a site not connected while work waits for it, once past the grace', () => {
    const away = minutesAgo(60)
    expect(standing({ status: 'OFFLINE', lastSeenAt: away, waiting: { runs: 3, changes: 0 } }).problems)
      .toEqual([{ kind: 'notConnectedWithWork', since: away }])
    expect(standing({ status: 'OFFLINE', lastSeenAt: away, waiting: { runs: 0, changes: 1 } }).group).toBe('needsYou')
    // Within the grace, a blip is not news.
    const blip = new Date(now.getTime() - NOT_CONNECTED_GRACE_MS + 1000)
    expect(standing({ status: 'OFFLINE', lastSeenAt: blip, waiting: { runs: 3, changes: 0 } }).problems).toEqual([])
  })

  it("HQ's own site not running, work or not, once past the grace", () => {
    const away = minutesAgo(5)
    expect(standing({ isDefault: true, status: 'OFFLINE', lastSeenAt: away }).problems).toEqual([{ kind: 'hqSiteDown', since: away }])
    expect(standing({ isDefault: true, status: 'REGISTERED', lastSeenAt: null, registeredAt: minutesAgo(5) }).problems)
      .toEqual([{ kind: 'hqSiteDown', since: minutesAgo(5) }])
  })

  it("counts the grace from hq's own start, which forgets every connection", () => {
    const justStarted = new Date(now.getTime() - 10_000)
    expect(standing({ isDefault: true, status: 'OFFLINE', lastSeenAt: longAgo }, justStarted).problems).toEqual([])
  })

  it("Docker not running, or a nearly full disk, from a connected site's report", () => {
    expect(standing({ health: { ...healthy, docker: { running: false, version: null } } }).problems).toEqual([{ kind: 'dockerDown' }])
    const full = { freeBytes: 2 * GIB, totalBytes: 500 * GIB }
    expect(standing({ health: { ...healthy, disk: full } }).problems).toEqual([{ kind: 'diskNearlyFull', ...full }])
  })

  it("not from the last report of a site that is away, which says how it was", () => {
    const down = { ...healthy, docker: { running: false, version: null } }
    expect(standing({ status: 'OFFLINE', lastSeenAt: minutesAgo(60), health: down }).problems).toEqual([])
  })
})

describe('a site away for less than the grace @SC-632', () => {
  const within = (over: Partial<StandingInput> = {}, startedAt = longAgo) => awayWithinGrace(site(over), now, startedAt)

  it('is undecided after hq has only just started, however long it has been away', () => {
    const justStarted = new Date(now.getTime() - 10_000)
    expect(within({ isDefault: true, status: 'OFFLINE', lastSeenAt: longAgo }, justStarted)).toBe(true)
  })

  it('is undecided when it was heard from moments ago', () => {
    expect(within({ status: 'OFFLINE', lastSeenAt: new Date(now.getTime() - 10_000) })).toBe(true)
  })

  it('is decided once past the grace, when connected, needing an upgrade, or removed', () => {
    expect(within({ status: 'OFFLINE', lastSeenAt: minutesAgo(5) })).toBe(false)
    expect(within({ status: 'ONLINE', lastSeenAt: new Date(now.getTime() - 10_000) })).toBe(false)
    expect(within({ status: 'VERSION_MISMATCH', lastSeenAt: new Date(now.getTime() - 10_000) })).toBe(false)
    expect(within({ status: 'REVOKED', revoked: true, lastSeenAt: new Date(now.getTime() - 10_000) })).toBe(false)
  })
})
