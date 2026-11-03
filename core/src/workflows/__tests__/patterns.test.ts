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

  // Worst cases from the review: repeats side by side, with no group, backtrack in polynomial or exponential time.
  const slow = ['[a-z]*[a-z]*[a-z]*[a-z]*[a-z]*[a-z]*-x', '[a-z]*'.repeat(8) + '-x', '.*a.*a.*b', '\\w+\\w+\\w+x',
    'a?'.repeat(25) + 'a'.repeat(25), '[a-z]{0,600}[a-z]{0,600}[a-z]{0,600}x']

  it('is refused when repeats side by side could take too many ways to match a value', () => {
    for (const p of slow) {
      const r = readParameterPattern(p)
      expect(r.ok, p).toBe(false)
      if (!r.ok) expect(r.reason, p).toMatch(/too many ways/)
    }
  })

  it('matches the worst value against the worst pattern it accepts quickly', () => {
    const accepted = ['.*a.*b', '[a-z]*[a-z]*-x', '\\w+\\.\\w+', 'a?'.repeat(19) + 'a'.repeat(19), '[a-z]{0,600}[a-z]{0,600}x']
    for (const p of accepted) expect(readParameterPattern(p).ok, p).toBe(true)
    const values = ['a'.repeat(1024), 'a'.repeat(1023) + '\n', 'a'.repeat(38)]
    const started = performance.now()
    for (const p of accepted) for (const v of values) matchesParameterPattern(p, v)
    expect(performance.now() - started).toBeLessThan(1000)
  })

  it('does not match a value longer than any parameter may be', () => {
    expect(matchesParameterPattern('a*', 'a'.repeat(1025))).toBe(false)
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
