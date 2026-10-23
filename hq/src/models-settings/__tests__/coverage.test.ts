import { describe, expect, it } from 'vitest'
import { cleanPattern, countAllowed, dedupeEntries, entryKind, reachableModels, viewEntries } from '../coverage'

const reach = reachableModels([
  { name: 'Anthropic', vendor: 'anthropic' },
  { name: 'OpenRouter', vendor: 'openrouter' },
])

describe('what a list reaches @SC-1194 @SC-1202', () => {
  it('lists a model two providers reach once, with both providers', () => {
    const sonnets = reach.filter(m => m.key.startsWith('anthropic/claude-sonnet'))
    expect(sonnets.length).toBeGreaterThan(0)
    expect(new Set(sonnets.map(m => m.key)).size).toBe(sonnets.length)
    expect(sonnets.some(m => m.via.length === 2)).toBe(true)
  })

  it('counts what a maker pattern, a family pattern and a model cover', () => {
    const [maker, family, model, none] = viewEntries([
      { effect: 'never', pattern: 'anthropic/*' },
      { effect: 'never', pattern: 'anthropic/claude-*-opus*' },
      { effect: 'never', pattern: reach.find(m => m.key.startsWith('anthropic/claude-sonnet'))!.key },
      { effect: 'never', pattern: 'nobody/*' },
    ], reach)
    expect(maker.covers).toBe(reach.filter(m => m.key.startsWith('anthropic/')).length)
    expect(maker).toMatchObject({ kind: 'maker', meaning: 'Every model made by Anthropic' })
    expect(family.kind).toBe('family')
    expect(family.covers).toBeLessThanOrEqual(maker.covers)
    expect(model).toMatchObject({ kind: 'model', covers: 1, meaning: 'One model' })
    expect(none.covers).toBe(0)
  })

  it('classifies an entry', () => {
    expect([entryKind('*'), entryKind('deepseek/*'), entryKind('*-pro'), entryKind('openai/gpt-5')]).toEqual(['everything', 'maker', 'family', 'model'])
  })

  it('counts what a list leaves: a ban beats an allow, Only these keeps new models off', () => {
    const claude = reach.filter(m => m.key.startsWith('anthropic/')).length
    expect(countAllowed([{ mode: 'every', entries: [] }], reach)).toBe(reach.length)
    expect(countAllowed([{ mode: 'every', entries: [{ effect: 'never', pattern: 'anthropic/*' }] }], reach)).toBe(reach.length - claude)
    expect(countAllowed([{ mode: 'only_these', entries: [{ effect: 'allow', pattern: 'anthropic/*' }] }], reach)).toBe(claude)
    expect(countAllowed([{ mode: 'only_these', entries: [] }], reach)).toBe(0)
    expect(countAllowed([
      { mode: 'only_these', entries: [{ effect: 'allow', pattern: 'anthropic/*' }, { effect: 'never', pattern: 'anthropic/*' }] },
    ], reach)).toBe(0)
  })

  it('narrows with every list: the second never widens the first', () => {
    const first = { mode: 'every' as const, entries: [{ effect: 'never' as const, pattern: 'anthropic/*' }] }
    const second = { mode: 'only_these' as const, entries: [{ effect: 'allow' as const, pattern: 'anthropic/*' }] }
    expect(countAllowed([first, second], reach)).toBe(0)
  })
})

describe('an entry as typed @SC-1202', () => {
  it('is trimmed, one word, and not too long', () => {
    expect(cleanPattern('  deepseek/*  ', 200)).toBe('deepseek/*')
    expect(cleanPattern('two words', 200)).toBeNull()
    expect(cleanPattern('', 200)).toBeNull()
    expect(cleanPattern('x'.repeat(201), 200)).toBeNull()
    expect(cleanPattern(5, 200)).toBeNull()
  })

  it('keeps one entry per pattern and lets a ban win', () => {
    expect(dedupeEntries([
      { effect: 'allow', pattern: 'A/*' }, { effect: 'never', pattern: 'a/*' }, { effect: 'allow', pattern: 'b' }, { effect: 'allow', pattern: 'b' },
    ])).toEqual([{ effect: 'never', pattern: 'a/*' }, { effect: 'allow', pattern: 'b' }])
  })
})
