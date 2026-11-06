import { describe, expect, it } from 'vitest'
import { changedInWords, dayWords, draftWords, lookingAtWords, usedByWords, versionCrumb, RETURN_TO_VERSION } from '../skill/skillWords'

describe("a skill's page in words (board *A skill's page*, *Smaller fixes and words*) @SC-1632", () => {
  it('says who uses it first, or that no agent does', () => {
    expect(usedByWords({ everyAgent: false, count: 2 })).toBe('Used by 2 agents')
    expect(usedByWords({ everyAgent: false, count: 1 })).toBe('Used by 1 agent')
    expect(usedByWords({ everyAgent: false, count: 0 })).toBe('No agent uses it')
    expect(usedByWords({ everyAgent: true, count: 0 })).toBe('Used by every agent')
  })

  it('names the version in the breadcrumb, and an older one read-only', () => {
    expect(versionCrumb('1.1.0', true)).toBe('1.1.0 · in use')
    expect(versionCrumb('1.0.0', false)).toBe('1.0.0')
    expect(lookingAtWords('1.0.0', '1.1.0')).toBe('You are looking at 1.0.0, read-only. Agents use 1.1.0.')
    expect(changedInWords('added', '1.0.0', true)).toBe('new in 1.0.0, the first version · read-only')
  })

  it('has one name for going back, and dates as "Nov 5"', () => {
    expect(RETURN_TO_VERSION).toBe('Return to this version')
    expect(dayWords('2026-11-05T12:00:00Z')).toBe('Nov 5')
  })

  it('says what the draft changes', () => {
    expect(draftWords(2, '1.1.0, in use', true)).toBe('Draft · changes 2 files from 1.1.0, in use')
  })
})
