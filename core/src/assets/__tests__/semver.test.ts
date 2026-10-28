import { describe, expect, it } from 'vitest'
import { compareSemVer, formatSemVer, isSemVer, parseSemVer, SEMVER_MAX_LENGTH } from '../semver.js'

describe('SemVer', () => {
  it('parses major.minor.patch with an optional pre-release', () => {
    expect(parseSemVer('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: [] })
    expect(parseSemVer('0.1.0-rc.1')).toEqual({ major: 0, minor: 1, patch: 0, prerelease: ['rc', 1] })
    expect(parseSemVer('1.0.0-alpha-2.x7')).toEqual({ major: 1, minor: 0, patch: 0, prerelease: ['alpha-2', 'x7'] })
    expect(formatSemVer(parseSemVer('0.1.0-rc.1')!)).toBe('0.1.0-rc.1')
  })

  it('refuses what is not SemVer', () => {
    for (const bad of [
      '', '1', '1.2', '1.2.3.4', 'v1.2.3', '01.2.3', '1.02.3', '1.2.03', '1.2.3-', '1.2.3-01', '1.2.3-a..b',
      '1.2.3-a_b', '1.2.3+build', ' 1.2.3', '1.2.3 ', '-1.2.3', '1.2.3-é', `1.2.${'9'.repeat(20)}`,
      `1.2.3-${'a'.repeat(SEMVER_MAX_LENGTH)}`,
    ]) expect(parseSemVer(bad), bad).toBeNull()
    expect(isSemVer(42)).toBe(false)
    expect(isSemVer(null)).toBe(false)
  })

  it('orders by SemVer precedence, pre-releases included', () => {
    const ordered = [
      '1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11',
      '1.0.0-rc.1', '1.0.0', '1.0.1', '1.1.0', '1.10.0', '2.0.0',
    ]
    for (let i = 0; i < ordered.length; i++) {
      for (let j = 0; j < ordered.length; j++) {
        expect(Math.sign(compareSemVer(ordered[i], ordered[j])), `${ordered[i]} vs ${ordered[j]}`).toBe(Math.sign(i - j))
      }
    }
  })

  it('compares numerically, not as text', () => {
    expect(compareSemVer('1.9.0', '1.10.0')).toBeLessThan(0)
    expect(compareSemVer('1.0.0-2', '1.0.0-10')).toBeLessThan(0)
    expect(compareSemVer('1.0.0-10', '1.0.0-a')).toBeLessThan(0)
  })

  it('throws on a version that is not SemVer, rather than ordering it silently', () => {
    expect(() => compareSemVer('1.0', '1.0.0')).toThrow(/SemVer/)
  })
})
