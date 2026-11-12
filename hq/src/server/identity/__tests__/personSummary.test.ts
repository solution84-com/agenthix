import { describe, it, expect } from 'vitest'
import { FORMER_MEMBER, missingPerson, normaliseDisplayName, personSummary, type PersonRow } from '../personSummary'

const row = (over: Partial<PersonRow> = {}): PersonRow => ({
  id: 'u-1234567890',
  displayName: null,
  avatarUrl: null,
  deactivatedAt: null,
  erasedAt: null,
  auth: { identities: [{ providerUserId: 'dana' }] },
  ...over,
})

describe('personSummary @SC-601', () => {
  it('names a person by their display name, with their login name as the handle', () => {
    expect(personSummary(row({ displayName: 'Dana Reyes', avatarUrl: '/people/u/images/a.png', coverUrl: '/people/u/images/c.webp' }))).toEqual({
      userId: 'u-1234567890', name: 'Dana Reyes', handle: 'dana', avatarUrl: '/people/u/images/a.png', coverUrl: '/people/u/images/c.webp', state: 'active',
    })
  })

  it('falls back to the login name when no display name is set, or it is blank', () => {
    expect(personSummary(row()).name).toBe('dana')
    expect(personSummary(row({ displayName: '   ' })).name).toBe('dana')
  })

  it('falls back to the start of the id when there is no login either', () => {
    expect(personSummary(row({ auth: null }))).toMatchObject({ name: 'u-123456', handle: null })
  })

  it('keeps the name of someone who left, marked as left', () => {
    expect(personSummary(row({ displayName: 'Dana', deactivatedAt: new Date() }))).toMatchObject({ name: 'Dana', state: 'left' })
  })

  it('reads an erased person as a former member, with no handle and no picture', () => {
    const erased = row({ displayName: 'Dana', avatarUrl: '/x.png', deactivatedAt: new Date(), erasedAt: new Date() })
    expect(personSummary(erased)).toEqual({ userId: 'u-1234567890', name: FORMER_MEMBER, handle: null, avatarUrl: null, coverUrl: null, state: 'erased' })
  })

  it('reads an id with no row as a former member', () => {
    expect(missingPerson('gone')).toEqual({ userId: 'gone', name: FORMER_MEMBER, handle: null, avatarUrl: null, coverUrl: null, state: 'erased' })
  })
})

describe('normaliseDisplayName @SC-601', () => {
  it('trims and collapses spaces, and stores a blank name as none', () => {
    expect(normaliseDisplayName('  Dana   Reyes ')).toBe('Dana Reyes')
    expect(normaliseDisplayName('   ')).toBeNull()
    expect(normaliseDisplayName(null)).toBeNull()
  })

  it('refuses a name that is not text, or too long', () => {
    expect(() => normaliseDisplayName(42)).toThrow(TypeError)
    expect(() => normaliseDisplayName('x'.repeat(81))).toThrow(RangeError)
  })
})
