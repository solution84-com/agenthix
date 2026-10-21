import { describe, expect, it } from 'vitest'
import { compareVersions } from '../restoreSource'

describe('which backups a host service may restore, by the version that took them', () => {
  it('orders releases and pre-releases, so a backup from a newer pre-release is not taken as older', () => {
    expect(compareVersions('1.0.0-alpha.2', '1.0.0-alpha.1')).toBe(1)
    expect(compareVersions('1.0.0-alpha.1', '1.0.0-alpha.2')).toBe(-1)
    expect(compareVersions('1.0.0', '1.0.0-rc.1')).toBe(1)
    expect(compareVersions('0.9.0', '1.0.0-alpha.1')).toBe(-1)
    expect(compareVersions('1.0.0-alpha.1', '1.0.0-alpha.1')).toBe(0)
  })

  it('takes a development build as newer than any published version', () => {
    expect(compareVersions('dev', '1.0.0-alpha.1')).toBe(1)
    expect(compareVersions('1.0.0-alpha.1', 'dev')).toBe(-1)
  })
})
