import { describe, it, expect, vi, beforeEach } from 'vitest'

const warn = vi.hoisted(() => vi.fn())
vi.mock('wasp/server', () => ({ prisma: {} }))
// The handler's other imports reach the database and the task machine; none is used on the unknown-event path.
vi.mock('../../../server/dashboard/activity', () => ({}))
vi.mock('../../../server/dashboard/debouncedPush', () => ({}))
vi.mock('../../../server/runEvents', () => ({}))
vi.mock('../sessionOwnerSite', () => ({ __resetSessionOwnerCacheForTests: () => undefined }))
vi.mock('../../subscriptionGrants', () => ({}))
vi.mock('../sessionPatchEvent', () => ({}))
vi.mock('../runWaitingEvent', () => ({}))
vi.mock('../../siteHealth', () => ({}))
vi.mock('../../scheduled/scheduledChanges', () => ({}))
vi.mock('../../../agents/agentHandle', () => ({}))
vi.mock('../../../sessions/siteSessionTitle', () => ({}))
vi.mock('../../../sessions/sessionProject', () => ({}))
vi.mock('../../../shared/siteName', () => ({}))
vi.mock('../operationLinesForward', () => ({}))
vi.mock('../clientRunEvents', () => ({}))
vi.mock('../../../shared/conversations/runEvents', () => ({}))
vi.mock('../../../server/utils/logger', () => ({ Logger: class { warn = warn; error = vi.fn(); info = vi.fn() } }))

import { handleSiteEvent, __resetForTests } from '../siteEventHandler'

// A site a minor ahead sends events this hq does not know: each name is warned about once per site, never again.

beforeEach(() => {
  __resetForTests()
  warn.mockClear()
})

describe('an unknown site.event @SC-1145', () => {
  it('is dropped with one warning, however often it arrives', async () => {
    for (let i = 0; i < 5; i++) await handleSiteEvent('site-1', 'site.future', { n: i })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('site.future')
  })

  it('warns once for each different name', async () => {
    await handleSiteEvent('site-1', 'site.future', {})
    await handleSiteEvent('site-1', 'site.later', {})
    await handleSiteEvent('site-1', 'site.future', {})
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('warns separately for each site', async () => {
    await handleSiteEvent('site-1', 'site.future', {})
    await handleSiteEvent('site-2', 'site.future', {})
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('stops remembering names past a cap, so a flood of names cannot grow memory without bound', async () => {
    for (let i = 0; i < 200; i++) await handleSiteEvent('site-1', `site.n${i}`, {})
    expect(warn.mock.calls.length).toBeLessThanOrEqual(50)
  })
})
