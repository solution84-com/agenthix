import { describe, it, expect } from 'vitest'
import { deriveProjectKey } from '@agenthix/core'
import { RESERVED_PROJECT_KEYS, reservedSlugRefusal } from '../reservedNames'

describe('the names a project may not take @SC-1434', () => {
  it('are org, platform and personal as slugs, each refused saying why', () => {
    for (const slug of ['org', 'platform', 'personal']) {
      expect(reservedSlugRefusal(slug)).toMatch(/can't be called .* Nothing was changed\.$/)
    }
    expect(reservedSlugRefusal('shop')).toBeNull()
    expect(reservedSlugRefusal('org-tools')).toBeNull()
  })

  it('keep ORG from a derived key', () => {
    expect(deriveProjectKey('Organic', [...RESERVED_PROJECT_KEYS])).not.toBe('ORG')
    expect(deriveProjectKey('Our Research Group', [...RESERVED_PROJECT_KEYS])).not.toBe('ORG')
  })
})
