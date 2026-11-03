import { describe, expect, it } from 'vitest'
import { flagsOverdue } from '../featureFlagReleases.js'
import type { FeatureFlagEntry } from '../featureFlags.js'

const about = { feature: 'f', removeWhen: 'r' }
const FLAGS: Record<string, FeatureFlagEntry> = {
  wentLiveIn02: { ...about, stage: 'released', releasedIn: '0.2' },
  wentLiveIn10: { ...about, stage: 'released', releasedIn: '1.0' },
  stillBeta: { ...about, stage: 'beta' },
  stillExperimental: { ...about, stage: 'experimental' },
}

describe('released flags overdue for removal (adr-0172) @SC-1763', () => {
  it('a patch or pre-release of the flag\'s own minor does not count', () => {
    for (const version of ['0.2.0', '0.2.1', '0.2.7', '0.2.1-rc.1', '0.2.0-alpha.3']) {
      expect(flagsOverdue(version, FLAGS)).toEqual([])
    }
  })

  it('a later minor or major counts, its pre-releases too, so the rehearsal catches it before the final', () => {
    expect(flagsOverdue('0.3.0', FLAGS)).toEqual(['wentLiveIn02'])
    expect(flagsOverdue('0.3.0-rc.1', FLAGS)).toEqual(['wentLiveIn02'])
    expect(flagsOverdue('v0.3.0', FLAGS)).toEqual(['wentLiveIn02'])
    expect(flagsOverdue('1.0.0', FLAGS)).toEqual(['wentLiveIn02'])
    expect(flagsOverdue('1.0.3', FLAGS)).toEqual(['wentLiveIn02'])
    expect(flagsOverdue('1.1.0-alpha.1', FLAGS)).toEqual(['wentLiveIn02', 'wentLiveIn10'])
    expect(flagsOverdue('2.0.0', FLAGS)).toEqual(['wentLiveIn02', 'wentLiveIn10'])
  })

  it('an earlier version names nothing, and flags not released are never named', () => {
    expect(flagsOverdue('0.1.0', FLAGS)).toEqual([])
    expect(flagsOverdue('9.9.9', { stillBeta: FLAGS.stillBeta, stillExperimental: FLAGS.stillExperimental })).toEqual([])
  })

  it('names a released flag whose releasedIn is not major.minor, whatever the version', () => {
    const bad = { odd: { ...about, stage: 'released', releasedIn: '0.2.0' } } as Record<string, FeatureFlagEntry>
    expect(flagsOverdue('0.2.1', bad)).toEqual(['odd'])
  })

  it('refuses a version that is not major.minor.patch', () => {
    for (const version of ['', '0.3', 'latest', '0.3.0.1', '0.3.x']) expect(() => flagsOverdue(version, FLAGS)).toThrow(/Not a version/)
  })

  it('names nothing in the list today for the next release line', () => {
    expect(flagsOverdue('0.1.0')).toEqual([])
  })
})
