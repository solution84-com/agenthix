import { describe, expect, it } from 'vitest'
import type { ModelChoice } from '../../../conversations/protocol'
import {
  GROUP_SIZE, NO_FILTER, addWords, costWords, filterModels, fromChoices, groupModels, makersOf, patternFor, providersOf,
  type ListModel,
} from '../modelListLogic'

const c = (value: string, label: string, maker: string, via = 'via OpenRouter', price: 1 | 2 | 3 = 2): ModelChoice =>
  ({ value, label, maker, via, price })
const l = (key: string, maker: string, providers: string[], price: 1 | 2 | 3 = 2): ListModel =>
  ({ id: key, key, label: key, maker, providers, route: null, price })

const reach = [
  l('deepseek/deepseek-v4-flash', 'DeepSeek', ['OpenRouter'], 1),
  l('deepseek/deepseek-v4', 'DeepSeek', ['OpenRouter']),
  l('anthropic/claude-haiku-5', 'Anthropic', ['Anthropic'], 1),
  l('anthropic/claude-haiku-4-5', 'Anthropic', ['Anthropic', 'OpenRouter'], 1),
  l('anthropic/claude-opus-5', 'Anthropic', ['Anthropic'], 3),
  l('google/gemini-flash', 'Google', ['OpenRouter'], 1),
]

describe('the model list rows @SC-953', () => {
  it('shows a route only on the rows of a model reached two ways', () => {
    const rows = fromChoices([
      c('p-ant/claude-sonnet-5', 'Claude Sonnet 5', 'Anthropic', 'via Anthropic'),
      c('p-or/anthropic/claude-sonnet-5', 'Claude Sonnet 5', 'Anthropic', 'via OpenRouter'),
      c('p-or/deepseek-v4', 'DeepSeek V4', 'DeepSeek'),
    ])
    expect(rows.map(r => r.route)).toEqual(['via Anthropic', 'via OpenRouter', null])
    expect(rows[0].providers).toEqual(['Anthropic'])
  })

  it('filters by search, maker, provider and price together', () => {
    expect(filterModels(reach, NO_FILTER)).toHaveLength(6)
    expect(filterModels(reach, { ...NO_FILTER, maker: 'Anthropic' })).toHaveLength(3)
    expect(filterModels(reach, { ...NO_FILTER, provider: 'OpenRouter', price: 1 }).map(m => m.id))
      .toEqual(['deepseek/deepseek-v4-flash', 'anthropic/claude-haiku-4-5', 'google/gemini-flash'])
    expect(filterModels(reach, { ...NO_FILTER, query: 'HAIKU' })).toHaveLength(2)
  })

  it('offers the makers and providers that exist', () => {
    expect(makersOf(reach)).toEqual(['Anthropic', 'DeepSeek', 'Google'])
    expect(providersOf(reach)).toEqual(['Anthropic', 'OpenRouter'])
  })

  it('groups by maker showing the first few, all of them when filtered or expanded', () => {
    const groups = groupModels(reach, false, new Set())
    expect(groups.map(g => g.maker)).toEqual(['DeepSeek', 'Anthropic', 'Google'])
    expect(groups[1].shown).toHaveLength(GROUP_SIZE)
    expect(groupModels([...reach, l('anthropic/x', 'Anthropic', ['A'])], false, new Set())[1].hidden).toBe(1)
    expect(groupModels([...reach, l('anthropic/x', 'Anthropic', ['A'])], true, new Set())[1].hidden).toBe(0)
    expect(groupModels([...reach, l('anthropic/x', 'Anthropic', ['A'])], false, new Set(['Anthropic']))[1].hidden).toBe(0)
  })

  it('writes the cost in words', () => {
    expect([1, 2, 3].map(p => costWords(p as 1 | 2 | 3))).toEqual(['Low cost', 'Medium cost', 'High cost'])
  })
})

describe('the pattern row @SC-1202', () => {
  it('turns a maker into every model it makes', () => {
    expect(patternFor('deepseek', reach)).toEqual({ pattern: 'deepseek/*', covers: 2 })
  })

  it('turns the start of names one maker shares into that family', () => {
    expect(patternFor('claude-haiku', reach)).toEqual({ pattern: 'anthropic/claude-haiku*', covers: 2 })
  })

  it('turns any other text into every name holding it', () => {
    expect(patternFor('flash', reach)).toEqual({ pattern: '*flash*', covers: 2 })
  })

  it('offers nothing for text that covers one model or none', () => {
    expect(patternFor('opus', reach)).toBeNull()
    expect(patternFor('zzz', reach)).toBeNull()
    expect(patternFor('', reach)).toBeNull()
  })

  it('takes a typed star as it is, even for a maker no provider reaches yet', () => {
    expect(patternFor('xai/*', reach)).toEqual({ pattern: 'xai/*', covers: 0 })
  })

  it('says what Add adds', () => {
    expect(addWords(2, 0)).toBe('Add 2 models')
    expect(addWords(1, 0)).toBe('Add 1 model')
    expect(addWords(0, 1)).toBe('Add 1 pattern')
    expect(addWords(2, 1)).toBe('Add 1 pattern and 2 models')
  })
})
