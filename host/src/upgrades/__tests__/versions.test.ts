import { describe, expect, it } from 'vitest'
import { compare, newest, parseVersion } from '../versions'

describe('versions, pre-releases included @SC-820 @SC-1052', () => {
  it('orders a pre-release before its release, an alpha before a beta before a release candidate, and each by its number', () => {
    const ordered = ['0.9.9', '1.0.0-alpha.1', '1.0.0-alpha.2', '1.0.0-beta.1', '1.0.0-beta.2', '1.0.0-beta.10', '1.0.0-rc.1', '1.0.0', '1.0.1-beta.1']
    expect([...ordered].reverse().sort(compare)).toEqual(ordered)
    expect(parseVersion('1.0.0-rc.1')).toEqual([1, 0, 0])
  })

  it('offers only a release as the newest, never a pre-release', () => {
    expect(newest(['1.0.0-alpha.1', '1.0.0-beta.1', '1.0.0-rc.1'])).toBeNull()
    expect(newest(['0.9.0', '1.0.0-rc.1'])).toBe('0.9.0')
  })
})
