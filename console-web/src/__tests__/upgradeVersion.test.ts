import { describe, expect, it } from 'vitest'
import { parseVersion } from '../forms/UpgradeChange'

describe('the version typed into the upgrade form', () => {
  it('takes a release and a pre-release', () => {
    expect(parseVersion('0.3.0', null)).toEqual({ ok: true, version: '0.3.0' })
    expect(parseVersion(' 0.1.0-rc.1 ', null)).toEqual({ ok: true, version: '0.1.0-rc.1' })
    expect(parseVersion('0.1.0-alpha.3', '0.1.0-alpha.2')).toEqual({ ok: true, version: '0.1.0-alpha.3' })
  })
  it('refuses what is not a published version, and the one already running', () => {
    expect(parseVersion('dev', null).ok).toBe(false)
    expect(parseVersion('0.1', null).ok).toBe(false)
    expect(parseVersion('0.1.0-rc.1', '0.1.0-rc.1')).toEqual({ ok: false, error: 'It runs 0.1.0-rc.1 already.' })
  })
})
