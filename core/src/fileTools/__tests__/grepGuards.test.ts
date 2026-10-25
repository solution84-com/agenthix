import { describe, expect, it } from 'vitest'
import { classifyRgError, GrepRateLimiter, grepRefusalMessage } from '../grepGuards.js'

describe('the call limit @SC-1375', () => {
  it('allows 30 calls a minute per caller and refuses the 31st, without counting it', () => {
    let now = 0
    const limiter = new GrepRateLimiter(30, 60_000, () => now)
    for (let i = 0; i < 30; i++) expect(limiter.take('run-1')).toBe(true)
    expect(limiter.take('run-1')).toBe(false)
    expect(limiter.take('run-2')).toBe(true)
    now = 59_999
    expect(limiter.take('run-1')).toBe(false)
    now = 60_000
    expect(limiter.take('run-1')).toBe(true)
  })
})

describe('reading ripgrep\'s failure @SC-1375', () => {
  it('tells look-around, backreferences and other bad patterns apart', () => {
    expect(classifyRgError('rg: regex parse error:\n    (?:(?=a))\nerror: look-around, including look-ahead and look-behind, is not supported')).toBe('pattern-look-around')
    const hint = '\n\nConsider enabling PCRE2 with the --pcre2 flag, which can handle backreferences\nand look-around.'
    expect(classifyRgError('rg: regex parse error:\n    (?:(a)\\1)\nerror: backreferences are not supported' + hint)).toBe('pattern-backreference')
    expect(classifyRgError('rg: regex parse error:\n    (?:(?=a))\nerror: look-around, including look-ahead and look-behind, is not supported' + hint)).toBe('pattern-look-around')
    expect(classifyRgError('rg: regex parse error:\n    (?:(a)\nerror: unclosed group')).toBe('pattern-invalid')
    expect(classifyRgError("rg: error parsing glob '[': unclosed character class")).toBe('glob-invalid')
    expect(classifyRgError('rg: ./x.md: Permission denied (os error 13)')).toBeUndefined()
  })
})

describe('refusal messages @SC-1375', () => {
  it('are fixed: none holds anything from the call but a parameter\'s name', () => {
    expect(grepRefusalMessage('pattern-look-around')).toContain('look-around, including look-ahead and look-behind, is not supported')
    expect(grepRefusalMessage('invalid-parameter', 'glob')).toContain('glob')
    expect(grepRefusalMessage('too-slow')).toContain('2 seconds')
    expect(grepRefusalMessage('rate-limited')).toContain('30 a minute')
  })
})
