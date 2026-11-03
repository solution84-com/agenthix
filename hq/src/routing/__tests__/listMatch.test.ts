import { describe, expect, it } from 'vitest'
import { allowedByLists, patternMatches, type AppliedList } from '../listMatch'

const list = (mode: AppliedList['mode'], entries: AppliedList['entries'] = []): AppliedList => ({ mode, entries })

describe('patternMatches @SC-1194', () => {
  it('matches a model exactly, by its maker and name', () => {
    expect(patternMatches('anthropic/claude-sonnet-5', 'anthropic/claude-sonnet-5')).toBe(true)
    expect(patternMatches('anthropic/claude-sonnet-5', 'anthropic/claude-opus-5')).toBe(false)
  })

  it('matches a maker with maker/*', () => {
    expect(patternMatches('deepseek/*', 'deepseek/deepseek-v3.2')).toBe(true)
    expect(patternMatches('deepseek/*', 'qwen/qwen3')).toBe(false)
  })

  it('matches a family with * anywhere', () => {
    expect(patternMatches('*-pro', 'google/gemini-2.5-pro')).toBe(true)
    expect(patternMatches('anthropic/claude-*', 'anthropic/claude-haiku-4-5')).toBe(true)
    expect(patternMatches('*', 'openai/gpt-5')).toBe(true)
    expect(patternMatches('*-pro', 'google/gemini-2.5-flash')).toBe(false)
  })

  it('reads a dotted and a hyphenated version as the same model, and ignores case', () => {
    expect(patternMatches('anthropic/claude-sonnet-4-5', 'anthropic/claude-sonnet-4.5')).toBe(true)
    expect(patternMatches('Anthropic/Claude-*', 'anthropic/claude-sonnet-5')).toBe(true)
  })

  it('matches a name without a maker against the name alone', () => {
    expect(patternMatches('gpt-5', 'openai/gpt-5')).toBe(true)
    expect(patternMatches('gpt-5', 'openai/gpt-5-mini')).toBe(false)
  })

  it('treats regular-expression characters as themselves', () => {
    expect(patternMatches('openai/gpt-4.1', 'openai/gpt-401')).toBe(false)
    expect(patternMatches('a+b', 'x/aab')).toBe(false)
  })
})

describe('patternMatches with many stars @SC-1194', () => {
  it('reads a run of stars as one, and keeps the pieces between them in order', () => {
    expect(patternMatches('**', 'openai/gpt-5')).toBe(true)
    expect(patternMatches('a**b*c', 'x/aXbYc')).toBe(true)
    expect(patternMatches('*b*a*', 'x/ab')).toBe(false)
    expect(patternMatches('ab*ba', 'x/aba')).toBe(false)
    expect(patternMatches('*gpt*5*', 'openai/gpt-5')).toBe(true)
  })

  it('answers at once for the longest pattern a person may save, however many stars it has', () => {
    const started = performance.now()
    for (const pattern of ['*'.repeat(199) + 'z', '*a'.repeat(100), 'a*'.repeat(100)]) {
      expect(patternMatches(pattern, `x/${'a'.repeat(200)}`)).toBe(!pattern.endsWith('z'))
    }
    expect(performance.now() - started).toBeLessThan(100)
  })
})

describe('allowedByLists @SC-1194', () => {
  it('allows everything with no list', () => {
    expect(allowedByLists([], 'openai/gpt-5')).toBe(true)
  })

  it('in every mode, allows all but its Never entries', () => {
    const l = list('every', [{ effect: 'never', pattern: 'deepseek/*' }])
    expect(allowedByLists([l], 'openai/gpt-5')).toBe(true)
    expect(allowedByLists([l], 'deepseek/deepseek-v3.2')).toBe(false)
  })

  it('with Only these, allows only its allow entries, and Never still carves exceptions out', () => {
    const l = list('only_these', [
      { effect: 'allow', pattern: 'anthropic/claude-*' },
      { effect: 'never', pattern: 'anthropic/claude-opus-*' },
    ])
    expect(allowedByLists([l], 'anthropic/claude-sonnet-5')).toBe(true)
    expect(allowedByLists([l], 'anthropic/claude-opus-5')).toBe(false)
    expect(allowedByLists([l], 'openai/gpt-5')).toBe(false)
  })

  it('Only these with no allow entry allows nothing', () => {
    expect(allowedByLists([list('only_these')], 'openai/gpt-5')).toBe(false)
  })

  it('narrows by every list: no list widens another, and a ban anywhere beats an allow anywhere', () => {
    const org = list('only_these', [{ effect: 'allow', pattern: 'anthropic/*' }])
    const agent = list('only_these', [{ effect: 'allow', pattern: 'openai/*' }, { effect: 'allow', pattern: 'anthropic/claude-sonnet-5' }])
    const person = list('every', [{ effect: 'never', pattern: 'anthropic/claude-sonnet-5' }])
    expect(allowedByLists([org, agent], 'openai/gpt-5')).toBe(false)
    expect(allowedByLists([org, agent], 'anthropic/claude-sonnet-5')).toBe(true)
    expect(allowedByLists([org, agent, person], 'anthropic/claude-sonnet-5')).toBe(false)
  })
})
