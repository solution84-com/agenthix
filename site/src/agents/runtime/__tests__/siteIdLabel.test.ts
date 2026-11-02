/**
 * Two sites on one Docker (live preview spec, step 13 of the proof): what a site makes carries its own id, and what it
 * looks for and removes is kept to that id, so a second site, even with the same namespace, is never touched.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearContainerSiteIdForTests, composeProjectLabelArgs, setContainerSiteId, siteIdFilterArgs, siteIdLabel,
} from '../containerLabels'
import { anyLivePreviewFilters, livePreviewFilters, livePreviewLabels } from '../../../server/livePreviews/container/labels'

beforeEach(() => {
  process.env.HOST_NAMESPACE = 'agenthix-dev'
})
afterEach(() => clearContainerSiteIdForTests())

describe("a site's own id on what it makes @SC-1738", () => {
  it('labels every container made with the install\'s group, and each live preview\'s container and networks', () => {
    setContainerSiteId('3f1c2b9e-1a2b-4c3d-8e9f-0a1b2c3d4e5f')
    expect(composeProjectLabelArgs('agent')).toEqual([
      '--label', 'com.docker.compose.project=agenthix-dev-agents',
      '--label', 'com.docker.compose.service=agent',
      '--label', 'agenthix-dev.site=3f1c2b9e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
    ])
    expect(livePreviewLabels({ id: 'lp1', workspaceId: 'w1', personId: 'p1', projectId: null })['agenthix-dev.site'])
      .toBe('3f1c2b9e-1a2b-4c3d-8e9f-0a1b2c3d4e5f')
  })

  it("keeps the live previews' sweeps and the guard's listings to that id", () => {
    setContainerSiteId('site-a')
    expect(anyLivePreviewFilters()).toContain('label=agenthix-dev.site=site-a')
    expect(livePreviewFilters('lp1')).toContain('label=agenthix-dev.site=site-a')
  })

  it('refuses an id a label cannot carry', () => {
    expect(() => setContainerSiteId('a=b')).toThrow()
    expect(() => setContainerSiteId('')).toThrow()
  })

  it('labels and filters nothing by it before the id is set', () => {
    expect(siteIdLabel()).toEqual({})
    expect(siteIdFilterArgs()).toEqual([])
  })
})
