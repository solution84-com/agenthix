import { describe, expect, it } from 'vitest'
import { assertGuideDatabase, databaseNameOf, guideStorageRoot, guideUrls, urlWithDatabase } from '../databaseUrls.mjs'

const HQ_DEV = 'postgresql://agenthix:secret@127.0.0.1:4109/agenthix'
const SITE_DEV = 'postgresql://agenthix:secret@localhost:4209/agenthix_site'

describe('the guide databases @SC-808 @SC-809', () => {
  it('swaps only the database name', () => {
    expect(urlWithDatabase(HQ_DEV, 'agenthix_guide')).toBe('postgresql://agenthix:secret@127.0.0.1:4109/agenthix_guide')
  })

  it('reads the name back after the URL round trip', () => {
    expect(databaseNameOf('postgresql://u:p@h:1/agenthix%5Fguide')).toBe('agenthix_guide')
  })

  it('derives both addresses from the developer\'s own, each on its own server', () => {
    expect(guideUrls({ env: {}, hqDevUrl: HQ_DEV, siteDevUrl: SITE_DEV })).toEqual({
      hq: 'postgresql://agenthix:secret@127.0.0.1:4109/agenthix_guide',
      site: 'postgresql://agenthix:secret@localhost:4209/agenthix_site_guide',
    })
  })

  it('takes explicit addresses over the developer\'s own, as CI supplies them', () => {
    const env = {
      GUIDE_HQ_DATABASE_URL: 'postgresql://ci:ci@db:5432/hq_guide',
      GUIDE_SITE_DATABASE_URL: 'postgresql://ci:ci@db:5432/site_guide',
    }
    expect(guideUrls({ env, hqDevUrl: HQ_DEV, siteDevUrl: SITE_DEV })).toEqual({
      hq: env.GUIDE_HQ_DATABASE_URL,
      site: env.GUIDE_SITE_DATABASE_URL,
    })
  })

  it('works with no developer files at all when CI supplies both', () => {
    const env = { GUIDE_HQ_DATABASE_URL: 'postgresql://a:b@db/x_guide', GUIDE_SITE_DATABASE_URL: 'postgresql://a:b@db/y_guide' }
    expect(guideUrls({ env, hqDevUrl: null, siteDevUrl: null }).hq).toBe(env.GUIDE_HQ_DATABASE_URL)
  })

  it('refuses a database whose name does not end in _guide', () => {
    expect(() => assertGuideDatabase('postgresql://u:p@h/agenthix', 'hq')).toThrow(/does not end in "_guide"/)
    expect(() => guideUrls({ env: { GUIDE_HQ_DB_NAME: 'agenthix' }, hqDevUrl: HQ_DEV, siteDevUrl: SITE_DEV })).toThrow(/agenthix"/)
    expect(() => guideUrls({ env: { GUIDE_SITE_DATABASE_URL: 'postgresql://u:p@h/agenthix_site_test' }, hqDevUrl: HQ_DEV, siteDevUrl: SITE_DEV })).toThrow(/site/)
  })

  it('refuses when there is no address to derive from', () => {
    expect(() => guideUrls({ env: {}, hqDevUrl: null, siteDevUrl: SITE_DEV })).toThrow(/hq/)
    expect(() => guideUrls({ env: {}, hqDevUrl: HQ_DEV, siteDevUrl: null })).toThrow(/site/)
  })

  it('refuses something that is not a URL', () => {
    expect(() => assertGuideDatabase('not a url', 'hq')).toThrow(/not a URL/)
  })
})

describe('where hq keeps its files for the guide @SC-1106', () => {
  it('uses a directory under the temporary one when none is set', () => {
    expect(guideStorageRoot({}, '/tmp')).toBe('/tmp/agenthix-guide-hq-storage')
  })

  it('keeps the caller\'s own when it set one', () => {
    expect(guideStorageRoot({ HQ_STORAGE_ROOT: '/data/hq' }, '/tmp')).toBe('/data/hq')
  })
})
