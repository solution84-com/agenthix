import { describe, it, expect, afterEach } from 'vitest'
import path from 'node:path'
import { getHqAssetsRoot, resolveHqAssetPath } from '../hqAssets'

const saved = process.env.HQ_ASSETS_ROOT
afterEach(() => {
  if (saved === undefined) delete process.env.HQ_ASSETS_ROOT
  else process.env.HQ_ASSETS_ROOT = saved
})

describe('hq assets root', () => {
  it('uses HQ_ASSETS_ROOT when set', () => {
    process.env.HQ_ASSETS_ROOT = '/opt/hq/assets'
    expect(getHqAssetsRoot()).toBe('/opt/hq/assets')
  })

  it('defaults to the assets beside the Wasp build output, never to SITE_ROOT', () => {
    delete process.env.HQ_ASSETS_ROOT
    process.env.SITE_ROOT = '/somewhere/else'
    expect(getHqAssetsRoot()).toBe(path.resolve(process.cwd(), '..', '..', '..', 'assets'))
  })

  it('resolves an asset path inside the root and refuses one that leaves it', () => {
    process.env.HQ_ASSETS_ROOT = '/opt/hq/assets'
    expect(resolveHqAssetPath('library/agents/qa')).toBe('/opt/hq/assets/library/agents/qa')
    expect(() => resolveHqAssetPath('../../etc/passwd')).toThrow(/leaves hq's assets/)
  })
})
