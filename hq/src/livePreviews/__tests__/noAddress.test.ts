/**
 * An installation reached by a bare network address (live preview spec section 5): its apps have no name to live
 * under, so live previews are off. *Live preview* says a domain is needed, a start is refused in those words before
 * any site is asked, and the lead offers none; branches and merging do not depend on it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEV_PREVIEW_PATTERN } from '@agenthix/core'

const address = vi.hoisted(() => ({ has: false }))
vi.mock('wasp/server', () => ({
  prisma: { livePreview: { count: vi.fn(async () => 0), findFirst: vi.fn(async () => null) }, workspaceBranch: { count: vi.fn(async () => 1) } },
  HttpError: class extends Error { constructor(readonly statusCode: number, m?: string, readonly data?: unknown) { super(m) } },
}))
vi.mock('../../server/siteConfig', () => ({ getSiteClientUrl: () => 'http://192.168.1.20:3000' }))
vi.mock('../../relays', async () => {
  const real = await vi.importActual<typeof import('../../relays/appAddress')>('../../relays/appAddress')
  return {
    livePreviewsHaveAnAddress: () => address.has, NO_PREVIEW_ADDRESS_MESSAGE: real.NO_PREVIEW_ADDRESS_MESSAGE,
    appAddress: () => null, appTickets: { revoke: vi.fn() }, carryBundle: vi.fn(), bundleRelayFor: vi.fn(),
    onBundleReport: vi.fn(), onAppsCutOff: vi.fn(),
  }
})
const ws = { ref: { ownerType: 'project', ownerId: 'p1', workspaceId: 'w1' }, name: 'shop-app', logicalSiteId: 's1', executionSiteId: 'es1', canAct: true }
vi.mock('../../branches/workspaceAccess', () => ({ reachWorkspace: vi.fn(async () => ws) }))
const asked = vi.hoisted(() => ({ site: vi.fn(), choices: vi.fn(async () => []) }))
vi.mock('../siteAsk', () => ({ askSite: asked.site, OPEN_TIMEOUT_MS: 1, SiteFailed: class extends Error {}, SiteSilent: class extends Error {} }))
vi.mock('../sites', () => ({ siteChoices: asked.choices, pickSite: () => null, hasRoom: () => true }))
vi.mock('../../branches/siteCalls', () => ({ siteCall: vi.fn() }))
vi.mock('../../branches/codeWorkDispatch', () => ({ copyForBranch: vi.fn() }))
vi.mock('../store', () => ({
  LIVE: ['STARTING', 'RUNNING', 'PAUSED'], livePreviewOn: vi.fn(async () => null), lastStoppedOn: vi.fn(async () => null),
  livePreviewsOnSite: vi.fn(), lockSlot: vi.fn(), moveFromSummary: vi.fn(), moveLivePreview: vi.fn(), touchLivePreview: vi.fn(),
}))
vi.mock('../socket', () => ({ emitLivePreviewChange: vi.fn() }))
vi.mock('../stopping', () => ({ releaseCopyAfterStop: vi.fn(), stopOnSite: vi.fn() }))

import { livePreviewPattern, livePreviewsHaveAnAddress, NO_PREVIEW_ADDRESS_MESSAGE } from '../../relays/appAddress'
import { NO_ADDRESS, startLivePreview } from '../opening'
import { getLivePreviewPlaces } from '../places'

beforeEach(() => {
  vi.clearAllMocks()
  address.has = false
})

describe('an installation reached by a bare network address @SC-1719', () => {
  it('has no address for live apps; a domain, a preview address set, or development on localhost has one', () => {
    expect(livePreviewPattern({}, 'http://192.168.1.20:3000')).toBeNull()
    expect(livePreviewPattern({}, 'http://[fd00::20]:3000')).toBeNull()
    expect(livePreviewsHaveAnAddress(livePreviewPattern({}, 'https://10.0.0.5'))).toBe(false)
    expect(livePreviewPattern({}, 'http://localhost:3000')).toBe(DEV_PREVIEW_PATTERN)
    expect(livePreviewPattern({ PREVIEW_PATTERN: 'https://p-{id}.preview.example.com' }, 'http://192.168.1.20:3000'))
      .toBe('https://p-{id}.preview.example.com')
  })

  it('says a domain is needed, who gives it, and that nothing was changed', () => {
    expect(NO_ADDRESS).toBe(NO_PREVIEW_ADDRESS_MESSAGE)
    expect(NO_ADDRESS).toMatch(/^Live previews need a domain/)
    expect(NO_ADDRESS).toMatch(/A fleet admin gives HQ a domain/)
    expect(NO_ADDRESS).toMatch(/Nothing was changed\.$/)
  })

  it("shows it on Live preview instead of any site", async () => {
    const places = await getLivePreviewPlaces('u1', 'w1', null)
    expect(places).toMatchObject({ blocked: NO_ADDRESS, picked: null, others: [], current: null })
    expect(asked.choices).not.toHaveBeenCalled()
  })

  it('refuses a start in those words, asking no site', async () => {
    const refused = startLivePreview('u1', { workspaceId: 'w1', branchId: null })
    await expect(refused).rejects.toMatchObject({ statusCode: 409, message: NO_ADDRESS, data: { code: 'noAddress' } })
    expect(asked.site).not.toHaveBeenCalled()
    expect(asked.choices).not.toHaveBeenCalled()
  })
})
