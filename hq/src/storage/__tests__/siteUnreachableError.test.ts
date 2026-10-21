import { describe, it, expect } from 'vitest'
import { SiteUnreachableError } from '../workspaceStore'

describe('SiteUnreachableError', () => {
  it('says an offline site is unavailable until it reconnects', () => {
    const e = new SiteUnreachableError('Box One', 's1')
    expect(e.reason).toBe('offline')
    expect(e.message).toMatch(/until it reconnects/)
  })

  it('says a revoked site is revoked, and keeps revoked readable', () => {
    const e = new SiteUnreachableError('Box One', 's1', 'revoked')
    expect(e.revoked).toBe(true)
    expect(e.message).toMatch(/revoked/)
  })

  it('names the version for a suspended site, and never says it will reconnect on its own', () => {
    const e = new SiteUnreachableError('Box One', 's1', 'version_mismatch', '6.3')
    expect(e.reason).toBe('version_mismatch')
    expect(e.revoked).toBe(false)
    expect(e.message).toContain('6.3')
    expect(e.message).toMatch(/upgrade/i)
    expect(e.message).not.toMatch(/until it reconnects/)
  })

  it('says HQ is the one to upgrade for a site two majors ahead of it, and the site for one behind', () => {
    expect(new SiteUnreachableError('Box One', 's1', 'version_mismatch', '3.0').message).toMatch(/until HQ is upgraded$/)
    expect(new SiteUnreachableError('Box One', 's1', 'version_mismatch', '0.4').message).toMatch(/until the site is upgraded$/)
  })

  it.each([
    ['null', null],
    ['empty', ''],
  ])('says a suspended site with a %s version runs an incompatible protocol version, never an empty one', (_label, version) => {
    const e = new SiteUnreachableError('Box One', 's1', 'version_mismatch', version)
    expect(e.message).toBe(
      'Execution Site "Box One" runs an incompatible protocol version, which this HQ does not accept — its runs and workspaces are unavailable until the site is upgraded',
    )
    expect(e.message).not.toMatch(/protocol ,/)
    expect(e.message).not.toMatch(/runs protocol an/)
  })
})
