// askEverySite (combinedRead.ts): which sites a combined read asks, and how long it waits.
// Its handling of silence and failure is combinedReadFailures.test.ts.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SITE_PROTOCOL_VERSION, parseProtocolVersion } from '@agenthix/core'

const mockEligibleSites = vi.hoisted(() => vi.fn())
vi.mock('../eligibleSites', () => ({ eligibleSites: mockEligibleSites }))

// `workspaceStore` is imported only for its `SiteUnreachableError` class, but it
// pulls the live channel singleton in with it. Stub the singleton; the error
// class itself stays real, because the classification under test is `instanceof`.
vi.mock('../channel', async () => {
  const { ChannelRequestFailed } = await import('../channel/pendingRequests')
  return { siteChannelRegistry: { request: vi.fn() }, ChannelRequestFailed }
})

import { ChannelRequestFailed, DEFAULT_REQUEST_TIMEOUT_MS } from '../channel/pendingRequests'
import { SiteUnreachableError } from '../../storage/workspaceStore'
import { askEverySite, COMBINED_READ_TIMEOUT_MS, type EligibleSite } from '../combinedRead'

// Relative to hq's own major, so a protocol bump does not turn these fixtures
// into sites on a foreign major.
const MAJOR = parseProtocolVersion(SITE_PROTOCOL_VERSION)!.major
const BASE = `${MAJOR}.0`
const NEWER_MAJOR = `${MAJOR + 1}.0`

const site = (over: Partial<EligibleSite> = {}): EligibleSite => ({
  id: 'es-a',
  siteId: 'site-a',
  label: 'Site A',
  status: 'ONLINE',
  protocolVersion: SITE_PROTOCOL_VERSION,
  ...over,
})

const A = site()
const B = site({ id: 'es-b', siteId: 'site-b', label: 'Site B' })
const C = site({ id: 'es-c', siteId: 'site-c', label: 'Site C' })

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const never = () => new Promise<number>(() => {})

beforeEach(() => {
  vi.clearAllMocks()
  mockEligibleSites.mockResolvedValue([A, B])
  // The error path logs the real failure for whoever has to diagnose it; the
  // suite does not need it on stdout.
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('which sites a combined read asks', () => {
  it('asks every site it is given', async () => {
    mockEligibleSites.mockResolvedValue([A, B, C])
    const call = vi.fn(async (s: EligibleSite) => s.siteId)

    const result = await askEverySite(call)

    expect(call).toHaveBeenCalledTimes(3)
    expect(result.answers).toEqual([
      { siteId: 'site-a', value: 'site-a' },
      { siteId: 'site-b', value: 'site-b' },
      { siteId: 'site-c', value: 'site-c' },
    ])
    expect(result.unanswered).toEqual([])
  })

  it('answers an organisation with no sites at all with two empty lists', async () => {
    mockEligibleSites.mockResolvedValue([])
    const call = vi.fn(async () => 1)

    const result = await askEverySite(call)

    expect(call).not.toHaveBeenCalled()
    expect(result).toEqual({ answers: [], unanswered: [] })
  })

  it('never names a revoked site, even when one is revoked mid-read', async () => {
    // A revoked site is not a site that failed to answer. It is not part of
    // the org any more, and listing it under "these did not answer" would
    // invite somebody to go and fix it.
    mockEligibleSites.mockResolvedValue([A, site({ id: 'es-r', siteId: 'revoked-1', label: 'Gone' })])
    const call = async (s: EligibleSite) => {
      if (s.siteId === 'revoked-1') throw new SiteUnreachableError('Gone', 'revoked-1', 'revoked')
      return 1
    }

    const result = await askEverySite(call)

    expect(result.answers).toEqual([{ siteId: 'site-a', value: 1 }])
    expect(result.unanswered.map((u) => u.siteId)).not.toContain('revoked-1')
    expect(result.unanswered).toEqual([])
  })

  it('names a version-suspended site as unanswered with reason "version", and does not call it', async () => {
    mockEligibleSites.mockResolvedValue([
      A,
      site({ id: 'es-o', siteId: 'site-old', label: 'Old Site', status: 'VERSION_MISMATCH', protocolVersion: '9.4' }),
    ])
    const call = vi.fn(async () => 1)

    const result = await askEverySite(call)

    expect(call).toHaveBeenCalledTimes(1)
    expect(call).not.toHaveBeenCalledWith(expect.objectContaining({ siteId: 'site-old' }))
    expect(result.unanswered).toEqual([
      { siteId: 'site-old', label: 'Old Site', reason: 'version', detail: expect.stringContaining('9.4') },
    ])
  })

  it('asks a site one major apart, as the handshake accepts one', async () => {
    mockEligibleSites.mockResolvedValue([site({ status: 'ONLINE', protocolVersion: NEWER_MAJOR })])
    const call = vi.fn(async () => 1)

    const result = await askEverySite(call)

    expect(call).toHaveBeenCalledTimes(1)
    expect(result.answers).toHaveLength(1)
  })

  it('does not ask a site two majors apart, whatever its status says, and names the side to upgrade', async () => {
    // The handshake should have suspended it; this is the only thing between hq and a read sent to a protocol the
    // rule says the two cannot share.
    mockEligibleSites.mockResolvedValue([
      site({ status: 'ONLINE', protocolVersion: `${MAJOR + 2}.0` }),
      site({ id: 'es-b', siteId: 'site-b', label: 'Site B', status: 'ONLINE', protocolVersion: `${MAJOR + 3}.1` }),
    ])
    const call = vi.fn(async () => 1)

    const result = await askEverySite(call)

    expect(call).not.toHaveBeenCalled()
    expect(result.unanswered.map(u => u.reason)).toEqual(['version', 'version'])
    expect(result.unanswered[0].detail).toContain(`${MAJOR + 2}.0`)
    expect(result.unanswered[0].detail).toContain('Upgrade HQ')
  })

  it('asks a site on minor 0 of hq\'s major', async () => {
    mockEligibleSites.mockResolvedValue([site({ protocolVersion: BASE })])
    const call = vi.fn(async () => 1)

    const result = await askEverySite(call)

    expect(call).toHaveBeenCalledTimes(1)
    expect(result.answers).toHaveLength(1)
  })

  it('asks a site whose version hq has never seen, rather than calling it out of date', async () => {
    // A site that registered and never connected has no recorded version. It
    // is not on an old protocol; it is simply not here, which the call itself
    // reports far more honestly than a guess would.
    mockEligibleSites.mockResolvedValue([site({ status: 'REGISTERED', protocolVersion: null })])
    const call = vi.fn(async () => {
      throw new ChannelRequestFailed('Execution Site site-a is not connected', 'offline')
    })

    const result = await askEverySite(call)

    expect(call).toHaveBeenCalledTimes(1)
    expect(result.unanswered[0].reason).toBe('offline')
  })
})

describe('how long a combined read waits', () => {
  it('gives a site less time than the channel gives its own request', () => {
    // The whole offline-versus-slow distinction rests on this. Above the
    // channel's timeout, a connected-but-slow site comes back through a store
    // as `SiteUnreachableError('offline')` and the person is told a healthy
    // connection is down.
    expect(COMBINED_READ_TIMEOUT_MS).toBeLessThan(DEFAULT_REQUEST_TIMEOUT_MS)
  })

  it('holds that bound against a caller who asks for longer', async () => {
    mockEligibleSites.mockResolvedValue([A])
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // The wait the read reports is the wait it actually applied, so this reads
    // the clamp without spending it.
    const result = await askEverySite(
      async () => {
        throw new ChannelRequestFailed('Request timed out', 'timeout')
      },
      { timeoutMs: 60_000 },
    )

    // Just under the channel's own 15 s, not the 60 s asked for.
    expect(result.unanswered[0].detail).toBe('Did not answer within 15 seconds.')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(String(DEFAULT_REQUEST_TIMEOUT_MS)))
  })

  it('refuses a deadline that is not a number, rather than reporting every site as "NaN ms"', async () => {
    mockEligibleSites.mockResolvedValue([A])

    const result = await askEverySite(async () => 1, { timeoutMs: Number.NaN })

    expect(result.answers).toHaveLength(1)
    expect(result.unanswered).toEqual([])
  })

  it('asks every site in parallel, not one after another', async () => {
    const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((k) => site({ id: `es-${k}`, siteId: `site-${k}`, label: k }))
    mockEligibleSites.mockResolvedValue(six)
    const call = async () => {
      await sleep(120)
      return 1
    }

    const started = Date.now()
    const result = await askEverySite(call)

    expect(result.answers).toHaveLength(6)
    // One wait, not six. Sequential would be 720 ms.
    expect(Date.now() - started).toBeLessThan(300)
  })

  it('spends one deadline for the whole read, not one per site', async () => {
    const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((k) => site({ id: `es-${k}`, siteId: `site-${k}`, label: k }))
    mockEligibleSites.mockResolvedValue(six)

    const started = Date.now()
    const result = await askEverySite(never, { timeoutMs: 120 })

    expect(result.unanswered).toHaveLength(6)
    // Sequential deadlines would be 720 ms.
    expect(Date.now() - started).toBeLessThan(300)
  })

  it('gives up on a call that never settles at all', async () => {
    mockEligibleSites.mockResolvedValue([A])

    const result = await askEverySite(never, { timeoutMs: 40 })

    expect(result.answers).toEqual([])
    expect(result.unanswered[0]).toMatchObject({ siteId: 'site-a', reason: 'timeout' })
  })

  it('takes its standard deadline from the environment', async () => {
    vi.stubEnv('COMBINED_READ_TIMEOUT_MS', '2500')
    vi.resetModules()
    const fresh = await import('../combinedRead')

    expect(fresh.COMBINED_READ_TIMEOUT_MS).toBe(2500)

    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('falls back to the standard deadline when the environment holds nonsense', async () => {
    vi.stubEnv('COMBINED_READ_TIMEOUT_MS', 'four seconds')
    vi.resetModules()
    const fresh = await import('../combinedRead')

    expect(fresh.COMBINED_READ_TIMEOUT_MS).toBe(4000)

    vi.unstubAllEnvs()
    vi.resetModules()
  })
})
