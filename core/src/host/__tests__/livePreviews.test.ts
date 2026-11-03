import { describe, expect, it } from 'vitest'
import { CONSOLE_LINK_METHODS } from '../relay.js'
import { FLEET_NOTICE_KINDS } from '../fleetRecord.js'
import { parseSiteLivePreviewsView } from '../livePreviews.js'

const preview = {
  livePreviewId: 'p1', projectName: 'Fernhill', workspaceName: 'shop-app', branch: 'add-login-page',
  person: { id: 'u1', name: 'Ada' }, state: 'running', openedAt: '2026-11-01T10:00:00.000Z', lastUsedAt: '2026-11-01T11:00:00.000Z',
}
const view = {
  executionSiteId: 's1', allowed: true, limit: null, idleMinutes: 120, livePreviews: [preview],
  capacity: { open: 1, limit: null, memoryPercent: 42, cpuPercent: 12 }, problems: [],
}

describe("live previews on the organisation's sites in the Fleet Console @SC-1754", () => {
  it('has its console link methods and fleet notices', () => {
    for (const m of ['sites.livePreviews', 'sites.livePreviews.set', 'sites.livePreviews.stop']) expect(CONSOLE_LINK_METHODS).toContain(m)
    for (const k of ['siteMemoryHigh', 'siteMemoryRecovered', 'livePreviewStoppedForResources']) expect(FLEET_NOTICE_KINDS).toContain(k)
  })

  it("reads a site's view", () => {
    expect(parseSiteLivePreviewsView(view)).toEqual(view)
    expect(parseSiteLivePreviewsView({ ...view, capacity: null, limit: 6 })).toEqual({ ...view, capacity: null, limit: 6 })
  })

  it('drops a live preview not in its shape, and refuses a view that is not one', () => {
    const bad = [{ ...preview, state: 'stopped' }, { ...preview, person: null }, { ...preview, branch: '' }]
    expect(parseSiteLivePreviewsView({ ...view, livePreviews: [preview, ...bad] })!.livePreviews).toEqual([preview])
    expect(parseSiteLivePreviewsView({ ...view, limit: 0 })).toBeNull()
    expect(parseSiteLivePreviewsView({ ...view, idleMinutes: 1 })).toBeNull()
    expect(parseSiteLivePreviewsView({ ...view, capacity: { open: 1 } })).toBeNull()
    expect(parseSiteLivePreviewsView({ ...view, allowed: undefined })).toBeNull()
  })
})
