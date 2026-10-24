import { describe, expect, it } from 'vitest'
import { matchesParameterPattern, readParameterPattern } from '../patterns.js'

const dash = (p: string) => {
  const r = readParameterPattern(p)
  if (!r.ok) throw new Error(`${p}: ${r.reason}`)
  return r.canStartWithDash
}

describe('a parameter pattern @SC-1361', () => {
  it('matches the whole value', () => {
    const branch = '^[A-Za-z0-9_][A-Za-z0-9._/-]{0,99}$'
    expect(matchesParameterPattern(branch, 'feature/region')).toBe(true)
    expect(matchesParameterPattern(branch, '--force')).toBe(false)
    expect(matchesParameterPattern('[a-z]+', 'abc; rm -rf /')).toBe(false)
    expect(matchesParameterPattern('a|b', 'ab')).toBe(false)
  })

  it('is refused when it is no regular expression, too long or empty', () => {
    for (const p of ['', '(', '[a-', 'a{2,1}', '\\-', 'x'.repeat(201)]) expect(readParameterPattern(p).ok, p).toBe(false)
  })

  it('is refused when it could backtrack without end', () => {
    for (const p of ['(a+)+$', '(a*)*', '(a|a)*', '(?:x|y)+z', '([a-z]{2})+', '(a?)+', '((ab)+)+']) {
      expect(readParameterPattern(p).ok, p).toBe(false)
    }
  })

  it('is refused with back-references or lookarounds', () => {
    for (const p of ['(a)\\1', '(?<n>a)\\k<n>', '(?=a)a', '(?!-)x', '(?<=a)b', '(?<!a)b']) expect(readParameterPattern(p).ok, p).toBe(false)
  })

  it('accepts groups that do not repeat a repeat', () => {
    for (const p of ['^(main|develop)$', '(abc)+', 'v(\\d+)\\.(\\d+)', '(?<major>\\d+)\\.\\d+']) expect(readParameterPattern(p).ok, p).toBe(true)
  })
})

describe('whether a pattern can match a value starting with - @SC-1361', () => {
  it('says no where the first character cannot be -', () => {
    for (const p of ['^[A-Za-z0-9_][A-Za-z0-9._/-]{0,99}$', '^\\d+$', '\\w-\\w', '[a-z]+', 'main|develop', '^(?:v)\\d', '[^-a]x',
      'a?b', '\\u0041']) {
      expect(dash(p), p).toBe(false)
    }
  })

  it('says yes where it can', () => {
    for (const p of ['.*', '-x', '[-a]', '[a-]', '[+--]', '[\\-]', '[^a]', 'a?-', '(a|-)', '\\D', '\\S+', '\\W', '\\x2d',
      '\\u002d', '\\u{2d}', '\\p{P}', '[\\p{L}]', '^$|-', '(?:)-', 'a{0}-', '\\b-']) {
      expect(dash(p), p).toBe(true)
    }
  })
})
