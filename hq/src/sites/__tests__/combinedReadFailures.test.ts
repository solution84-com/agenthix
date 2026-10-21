// askEverySite (combinedRead.ts): what a combined read does with silence, and what a person is told about a failure.
// Which sites it asks and how long it waits is combinedReadSites.test.ts.
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

import { ChannelRequestFailed } from '../channel/pendingRequests'
import { SiteUnreachableError } from '../../storage/workspaceStore'
import { askEverySite, COMBINED_READ_TIMEOUT_MS, type EligibleSite } from '../combinedRead'

// Relative to hq's own major, so a protocol bump does not turn these fixtures
// into sites on a foreign major.
const MAJOR = parseProtocolVersion(SITE_PROTOCOL_VERSION)!.major
const BASE = `${MAJOR}.0`

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

describe('what a combined read does with silence', () => {
  it('returns the answers it got and names the site that timed out', async () => {
    const call = async (s: EligibleSite) => {
      if (s.siteId === 'site-b') return never()
      return s.siteId
    }

    const result = await askEverySite(call, { timeoutMs: 50 })

    expect(result.answers).toEqual([{ siteId: 'site-a', value: 'site-a' }])
    expect(result.unanswered).toEqual([
      { siteId: 'site-b', label: 'Site B', reason: 'timeout', detail: expect.stringContaining('50') },
    ])
  })

  it('says how long it waited, in seconds, at the standard deadline', async () => {
    mockEligibleSites.mockResolvedValue([B])
    const result = await askEverySite(async () => {
      throw new ChannelRequestFailed('Request timed out', 'timeout')
    })

    expect(COMBINED_READ_TIMEOUT_MS).toBe(4000)
    expect(result.unanswered[0]).toMatchObject({ reason: 'timeout' })
    expect(result.unanswered[0].detail).toContain('4 seconds')
  })

  it('distinguishes a site with no channel from one that was too slow', async () => {
    const call = async (s: EligibleSite) => {
      if (s.siteId === 'site-a') throw new ChannelRequestFailed('Execution Site site-a is not connected', 'offline')
      return never()
    }

    const result = await askEverySite(call, { timeoutMs: 50 })

    expect(result.unanswered.map((u) => u.reason)).toEqual(['offline', 'timeout'])
    expect(result.unanswered[0].detail).not.toEqual(result.unanswered[1].detail)
  })

  it('reads a dropped connection as offline, through the error the stores already raise', async () => {
    mockEligibleSites.mockResolvedValue([A])
    const result = await askEverySite(async () => {
      throw new SiteUnreachableError('Site A', 'site-a', 'offline')
    })

    expect(result.unanswered[0].reason).toBe('offline')
  })

  it("reads a store's version_mismatch as a version problem, not a fault", async () => {
    mockEligibleSites.mockResolvedValue([A])
    const result = await askEverySite(async () => {
      throw new SiteUnreachableError('Site A', 'site-a', 'version_mismatch', '9.4')
    })

    expect(result.unanswered[0]).toMatchObject({ reason: 'version' })
  })

  it('reads an unknown method as a site that does not serve this read yet, which is an upgrade, not a fault', async () => {
    mockEligibleSites.mockResolvedValue([site({ protocolVersion: BASE })])
    const result = await askEverySite(async () => {
      throw new ChannelRequestFailed('Unknown method run.listPage', 'unknown_method')
    })

    expect(result.unanswered[0]).toMatchObject({ reason: 'version' })
    expect(result.unanswered[0].detail).toBe(`Runs protocol ${BASE}, which does not serve this read yet. Upgrade the site.`)
  })

  it('never fails the whole read because one site failed', async () => {
    mockEligibleSites.mockResolvedValue([A, B, C])
    const call = async (s: EligibleSite) => {
      if (s.siteId === 'site-b') throw new Error('handler blew up')
      return 1
    }

    const result = await askEverySite(call)

    expect(result.answers).toHaveLength(2)
    expect(result.unanswered).toHaveLength(1)
    expect(result.unanswered[0].reason).toBe('error')
  })

  it('never fails the whole read because one call threw synchronously', async () => {
    mockEligibleSites.mockResolvedValue([A, B])
    // Not `async` — a thrower like this escapes a bare `call(site)` as an
    // exception rather than a rejected promise.
    const call = ((s: EligibleSite) => {
      if (s.siteId === 'site-b') throw new Error('bad argument')
      return Promise.resolve(1)
    }) as (s: EligibleSite) => Promise<number>

    const result = await askEverySite(call)

    expect(result.answers).toEqual([{ siteId: 'site-a', value: 1 }])
    expect(result.unanswered[0]).toMatchObject({ siteId: 'site-b', reason: 'error' })
  })

  it("carries a site's own label, so a view can name it to a person", async () => {
    mockEligibleSites.mockResolvedValue([site({ siteId: 'site-z', label: 'Avery’s laptop' })])
    const result = await askEverySite(async () => {
      throw new ChannelRequestFailed('not connected', 'offline')
    })

    expect(result.unanswered[0].label).toBe('Avery’s laptop')
  })

  it('keeps both lists in registration order when answers and silences are mixed', async () => {
    const five = ['a', 'b', 'c', 'd', 'e'].map((k) => site({ id: `es-${k}`, siteId: `site-${k}`, label: k }))
    mockEligibleSites.mockResolvedValue(five)
    const call = async (s: EligibleSite) => {
      if (['site-b', 'site-d'].includes(s.siteId)) throw new ChannelRequestFailed('not connected', 'offline')
      return s.siteId
    }

    const result = await askEverySite(call)

    expect(result.answers.map((a) => a.siteId)).toEqual(['site-a', 'site-c', 'site-e'])
    expect(result.unanswered.map((u) => u.siteId)).toEqual(['site-b', 'site-d'])
  })

  it('hands back answers and the reasons for silence as one object', async () => {
    const result = await askEverySite(async () => 1)

    expect(Object.keys(result).sort()).toEqual(['answers', 'unanswered'])
  })
})

describe('what a person is told about a failure', () => {
  // The `error` bucket is the one whose message nobody has vetted. Nothing
  // upstream reaches the person: a fixed sentence per recognised case, one
  // generic sentence otherwise. These are the shapes a scrub would have let
  // through.
  const leaks: [string, string][] = [
    ['a stack and a leading Error:', 'Error: connect ECONNREFUSED\n    at Object.<anonymous> (/srv/hq/x.js:1:1)'],
    ['a bare host and port', 'connect ECONNREFUSED site-a.internal:4201'],
    ['a scheme and address', 'request to https://site-a.internal:4201/hq-link failed'],
    ['an Error: that is not leading', 'store failed: Error: connect refused'],
    ['an internal id', 'workspace 8f3a-uuid-9911 on site es-a missing'],
  ]

  for (const [what, message] of leaks) {
    it(`does not pass ${what} through to a person`, async () => {
      mockEligibleSites.mockResolvedValue([A])
      const result = await askEverySite(async () => {
        throw new Error(message)
      })

      const { detail } = result.unanswered[0]
      expect(detail).toBe('The read failed on this site.')
      expect(detail).not.toMatch(/at Object\.<anonymous>|\bError:/)
      expect(detail).not.toContain('site-a.internal')
      expect(detail).not.toContain('8f3a-uuid-9911')
      expect(detail).not.toContain('es-a')
    })
  }

  it('says what it recognises: a site whose handler failed', async () => {
    mockEligibleSites.mockResolvedValue([A])
    const result = await askEverySite(async () => {
      throw new ChannelRequestFailed('TypeError: cannot read x of undefined', 'handler_failed')
    })

    expect(result.unanswered[0]).toMatchObject({
      reason: 'error',
      detail: 'The site could not complete this read.',
    })
  })

  it('logs the real failure for whoever has to diagnose it', async () => {
    mockEligibleSites.mockResolvedValue([A])
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await askEverySite(async () => {
      throw new Error('connect ECONNREFUSED site-a.internal:4201')
    })

    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/Site A[\s\S]*connect ECONNREFUSED site-a\.internal:4201/))
  })
})
