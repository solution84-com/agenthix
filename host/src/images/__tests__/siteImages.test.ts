import { describe, expect, it } from 'vitest'
import { PARTS_OF } from '../../upgrades/versions'
import { siteImagesWanted, sitePins, siteRefs, SITE_PARTS } from '../siteImages'

describe('the images a site runs', () => {
  it('include the workflow executor, in every list that checks, fetches or pins them', () => {
    expect(SITE_PARTS).toEqual(['site-server', 'agent', 'executor'])
    expect(siteImagesWanted('0.2.0')).toEqual(SITE_PARTS.map(part => ({ part, version: '0.2.0' })))
    expect(PARTS_OF.site).toContain('executor')
    expect(PARTS_OF.hq).toContain('executor')
  })

  it('are kept in the stored site settings and fetched, the executor with the rest', () => {
    const pins = { 'site-server': 's@sha256:1', agent: 'a@sha256:2', executor: 'e@sha256:3', relay: 'r@sha256:4' }
    expect(sitePins(pins)).toEqual({ 'site-server': 's@sha256:1', agent: 'a@sha256:2', executor: 'e@sha256:3' })
    expect(siteRefs(pins, '0.2.0')).toEqual(['s@sha256:1', 'a@sha256:2', 'e@sha256:3'])
  })

  it('leave out the executor for a version published before it, and refuse a part of the version that was not checked', () => {
    expect(siteImagesWanted('0.1.0-alpha.3').map(w => w.part)).toEqual(['site-server', 'agent'])
    expect(siteImagesWanted('dev').map(w => w.part)).toEqual(['site-server', 'agent', 'executor'])
    const pins = { 'site-server': 's@sha256:1', agent: 'a@sha256:2' }
    expect(sitePins(pins)).toEqual(pins)
    expect(siteRefs(pins, '0.1.0-alpha.3')).toEqual(['s@sha256:1', 'a@sha256:2'])
    expect(() => siteRefs(pins, '0.2.0')).toThrow('The image of executor 0.2.0 was not checked')
  })
})
