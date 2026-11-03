/**
 * A site whose guard has not told hq it runs in the last minute starts no live previews (live preview spec section 6,
 * *The guard*): it is offered as blocked, with why, and HQ picks another site or none.
 */
import { withFeature } from '@agenthix/core/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GUARD_REPORT_STALE_MS } from '@agenthix/core'

const db = vi.hoisted(() => ({
  livePreviewGuardReport: { findUnique: vi.fn() },
  executionSite: { findMany: vi.fn() },
  livePreview: { groupBy: vi.fn() },
}))
vi.mock('wasp/server', () => ({ prisma: db }))
vi.mock('../../sites/channel', () => ({ siteChannelRegistry: { isOnline: () => true } }))
vi.mock('../store', () => ({ LIVE: ['STARTING', 'RUNNING', 'PAUSED'] }))

import { guardReportedRecently, pickSite, siteChoices } from '../sites'

const NOW = Date.parse('2026-11-02T10:00:00Z')
const reports = new Map<string, Date>()

function site(id: string, label: string) {
  return { id, siteId: `s-${id}`, label, status: 'ACTIVE', livePreviewsAllowed: true, livePreviewLimit: null, livePreviewIdleMinutes: 30, health: null }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  reports.clear()
  db.livePreviewGuardReport.findUnique.mockImplementation(async ({ where }: { where: { executionSiteId: string } }) => {
    const at = reports.get(where.executionSiteId)
    return at ? { executionSiteId: where.executionSiteId, at } : null
  })
  db.livePreview.groupBy.mockResolvedValue([])
})

afterEach(() => {
  vi.useRealTimers()
})

withFeature('livePreview', () => {
describe("a site's guard gone quiet @SC-1748", () => {
  it('counts as running for a minute after its last report, and not after', async () => {
    reports.set('es1', new Date(NOW - GUARD_REPORT_STALE_MS))
    expect(await guardReportedRecently('es1', NOW)).toBe(true)
    expect(await guardReportedRecently('es1', NOW + 1)).toBe(false)
  })

  it('counts as not running when it never reported', async () => {
    expect(await guardReportedRecently('es1', NOW)).toBe(false)
  })

  it('blocks the site, saying why, and HQ picks another site', async () => {
    db.executionSite.findMany.mockResolvedValue([site('es1', 'office'), site('es2', 'lab')])
    reports.set('es1', new Date(NOW - GUARD_REPORT_STALE_MS - 1))
    reports.set('es2', new Date(NOW - 5_000))
    const choices = await siteChoices('es1')
    expect(choices.find(c => c.executionSiteId === 'es1')?.blocked).toBe("office's guard hasn't reported in the last minute, so no live preview starts there.")
    expect(choices.find(c => c.executionSiteId === 'es2')?.blocked).toBeNull()
    expect(pickSite(choices)?.executionSiteId).toBe('es2')
  })

  it('leaves no site to start on when every guard is quiet', async () => {
    db.executionSite.findMany.mockResolvedValue([site('es1', 'office')])
    reports.set('es1', new Date(NOW - 2 * GUARD_REPORT_STALE_MS))
    expect(pickSite(await siteChoices('es1'))).toBeNull()
  })
})
})
