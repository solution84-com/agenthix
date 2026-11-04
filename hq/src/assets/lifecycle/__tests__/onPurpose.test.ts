import { describe, it, expect } from 'vitest'
import { refusalOf } from '../onPurpose'
import type { InstallPreview } from '../../install/types'

const preview = (existingId: string | null, over: object = {}) => ({
  refusal: null, fingerprint: 'fp', kind: 'skill', needs: { unsignedRead: false, publisherChoice: false },
  main: { identity: 'acme/other', outcome: 'older', existingId, version: '1.0.0', installedVersion: '2.0.0' }, ...over,
}) as unknown as InstallPreview

describe('installing another version from one skill\'s page @SC-1619', () => {
  it('refuses a package of another skill, naming it', () => {
    expect(refusalOf(preview('b'), { assetId: 'a', fingerprint: 'fp', reason: 'r' })).toMatch(/acme\/other, not the skill whose page you are on.*Nothing was changed\./)
  })

  it("accepts the page's own skill, and any skill when no page is named", () => {
    expect(refusalOf(preview('a'), { assetId: 'a', fingerprint: 'fp', reason: 'r' })).toBeNull()
    expect(refusalOf(preview('b'), { fingerprint: 'fp', reason: 'r' })).toBeNull()
  })
})
