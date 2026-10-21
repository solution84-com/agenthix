import { describe, it, expect } from 'vitest'
import {
  archiveSettingProblem, effectiveArchiveDays, orgDaysFromStored, orgDaysToStored,
} from '../archiveSetting'

describe('archiveSettingProblem', () => {
  it.each([0, 1, 7, 30])('accepts %s', v => expect(archiveSettingProblem(v)).toBeNull())
  it.each([2, -1, 1.5, '7', null, undefined])('refuses %s', v => expect(archiveSettingProblem(v)).not.toBeNull())
})

describe('effectiveArchiveDays', () => {
  it('uses the project\'s own choice whatever the org has', () => {
    expect(effectiveArchiveDays(30, 1)).toBe(30)
    expect(effectiveArchiveDays(1, null)).toBe(1)
  })
  it('lets a project turn it off while the org has it on', () => expect(effectiveArchiveDays(0, 7)).toBe(0))
  it('falls back to the org when the project chose nothing', () => {
    expect(effectiveArchiveDays(null, 7)).toBe(7)
    expect(effectiveArchiveDays(null, null)).toBe(0)
  })
})

describe('the org\'s stored form', () => {
  it('stores off as null and reads it back', () => {
    expect(orgDaysToStored(0)).toBeNull()
    expect(orgDaysFromStored(null)).toBe(0)
    expect(orgDaysFromStored(7)).toBe(7)
  })
})
