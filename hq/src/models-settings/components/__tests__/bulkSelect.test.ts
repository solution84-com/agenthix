import { describe, expect, it } from 'vitest'
import { NO_FILTER, filterModels, makersOf, providersOf } from '../bulkSelect'
import type { ReachableModel } from '../../types'

const m = (key: string, maker: string, via: string[], price: 1 | 2 | 3): ReachableModel => ({ key, label: key, maker, via, price })
const models = [
  m('anthropic/claude-opus-5', 'Anthropic', ['OpenRouter', 'Anthropic'], 3),
  m('openai/gpt-5-pro', 'OpenAI', ['OpenRouter'], 3),
  m('google/gemini-flash', 'Google', ['OpenRouter'], 1),
]

describe('selecting in bulk @SC-1202', () => {
  it('filters by maker, provider, price band and search together', () => {
    expect(filterModels(models, NO_FILTER)).toHaveLength(3)
    expect(filterModels(models, { ...NO_FILTER, maker: 'OpenAI' }).map(x => x.key)).toEqual(['openai/gpt-5-pro'])
    expect(filterModels(models, { ...NO_FILTER, provider: 'Anthropic' })).toHaveLength(1)
    expect(filterModels(models, { ...NO_FILTER, minPrice: 3 })).toHaveLength(2)
    expect(filterModels(models, { ...NO_FILTER, minPrice: 3, search: 'pro' }).map(x => x.key)).toEqual(['openai/gpt-5-pro'])
  })

  it('offers the makers and providers that exist', () => {
    expect(makersOf(models)).toEqual(['Anthropic', 'Google', 'OpenAI'])
    expect(providersOf(models)).toEqual(['Anthropic', 'OpenRouter'])
  })
})
