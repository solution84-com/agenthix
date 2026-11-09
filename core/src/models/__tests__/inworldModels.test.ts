import { describe, expect, it } from 'vitest'
import { costBand } from '../modelList.js'
import { makerAndName, sameModelKey } from '../modelIdentity.js'
import { INWORLD_LIST_FIXTURE } from './inworldModelList.js'
import { inworldCostRank, inworldLabel, inworldPriceRef, inworldPricesMicros, parseInworldModels } from '../inworldModels.js'
import { tokenCostMicros, NO_USAGE } from '../../billing/ledger.js'

const models = parseInworldModels(INWORLD_LIST_FIXTURE)
const byId = (id: string) => models.find(m => m.id === id)!

describe('reading Inworld\'s model list @SC-1862', () => {
  it('keeps what an agent can use and drops image, safety, unsupported and unreadable entries', () => {
    expect(models.map(m => m.id)).toEqual([
      'anthropic/claude-sonnet-5-5', 'anthropic/claude-sonnet-5', 'anthropic/claude-haiku-5-5', 'inworld/models/deepseek-v4-flash',
      'google-ai-studio/gemini-3-1-pro', 'openai/gpt-5.4-nano', 'groq/openai/gpt-oss-20b', 'mistral/bare-model',
    ])
  })
  it('defaults what is missing instead of failing', () => {
    const bare = byId('mistral/bare-model')
    expect(bare).toEqual({ id: 'mistral/bare-model', creator: null, prices: null, contextLength: null, vision: false })
    expect(byId('anthropic/claude-sonnet-5-5')).toMatchObject({ creator: 'Anthropic', contextLength: 1000000, vision: true })
  })
  it('reads any other shape as no models', () => {
    for (const body of [null, 'x', 7, [], {}, { models: 'x' }, { models: {} }]) expect(parseInworldModels(body)).toEqual([])
  })
  it('lists an id once', () => {
    const one = INWORLD_LIST_FIXTURE.models[0]
    expect(parseInworldModels({ models: [one, one] })).toHaveLength(1)
  })
  it('ignores an unreadable price rather than reading it as free', () => {
    const bad = { model: 'm', provider: 'openai', pricing: { promptToken: 'x', completionToken: 1 }, spec: { capabilities: { functionCalling: true } } }
    expect(parseInworldModels({ models: [bad] })[0].prices).toBeNull()
  })
  it('reads a price above a dollar a token as unknown, so converting it cannot throw', () => {
    const huge = { model: 'm', provider: 'openai', pricing: { promptToken: 1e300, completionToken: 1e-6 }, spec: { capabilities: { functionCalling: true } } }
    const [m] = parseInworldModels({ models: [huge] })
    expect(m.prices).toBeNull()
    expect(inworldPricesMicros(m)).toBeNull()
  })
  it('keeps at most 5000 entries', () => {
    const many = Array.from({ length: 5200 }, (_, i) => ({ model: `m${i}`, provider: 'openai', spec: { capabilities: { functionCalling: true } } }))
    expect(parseInworldModels({ models: many })).toHaveLength(5000)
  })
})

describe('a model via Inworld is the same model as at its maker @SC-1863', () => {
  it('matches Anthropic\'s, Google\'s and OpenAI\'s own', () => {
    expect(sameModelKey('inworld', 'anthropic/claude-sonnet-5-5')).toBe(sameModelKey('anthropic', 'claude-sonnet-5-5'))
    expect(sameModelKey('inworld', 'anthropic/claude-sonnet-5-5')).toBe(sameModelKey('openrouter', 'anthropic/claude-sonnet-5.5'))
    expect(sameModelKey('inworld', 'google-ai-studio/gemini-3-1-pro')).toBe(sameModelKey('google', 'gemini-3.1-pro'))
    expect(sameModelKey('inworld', 'openai/gpt-5.4-nano')).toBe(sameModelKey('openai', 'gpt-5.4-nano'))
    expect(makerAndName('inworld', 'google-ai-studio/gemini-3-1-pro')).toBe('google/gemini-3-1-pro')
  })
  it('reads an Inworld-hosted model\'s maker from the list\'s creator', () => {
    const m = byId('inworld/models/deepseek-v4-flash')
    expect(makerAndName('inworld', m.id, m.creator)).toBe('deepseek/deepseek-v4-flash')
    expect(sameModelKey('inworld', m.id, m.creator)).toBe(sameModelKey('openrouter', 'deepseek/deepseek-v4-flash'))
    expect(makerAndName('inworld', m.id)).toBe('inworld/deepseek-v4-flash')
  })
  it('reads the maker of a re-hosted model from inside its id', () => {
    expect(makerAndName('inworld', 'groq/openai/gpt-oss-20b')).toBe('openai/gpt-oss-20b')
    expect(makerAndName('inworld', 'xai/grok-4.7')).toBe('x-ai/grok-4.7')
    expect(makerAndName('inworld', 'deepinfra/some-model', 'Z AI')).toBe('z-ai/some-model')
    expect(makerAndName('inworld', 'deepinfra/some-model', 'Odd Maker!')).toBe('odd-maker/some-model')
  })
})

describe('prices @SC-1855', () => {
  it('converts a token price to millionths of a dollar per million tokens', () => {
    expect(inworldPricesMicros(byId('anthropic/claude-sonnet-5-5'))).toEqual({
      inputMicros: 3_000_000n, outputMicros: 15_000_000n, cacheReadMicros: 300_000n, cacheWriteMicros: 3_750_000n,
    })
  })
  it('prices a cache price the list omits as the prompt price, and no price as unknown', () => {
    expect(inworldPricesMicros(byId('openai/gpt-5.4-nano'))?.cacheWriteMicros).toBe(200_000n)
    expect(inworldPricesMicros(byId('mistral/bare-model'))).toBeNull()
  })
  it('costs a call with cached input at the cache-read price', () => {
    const prices = inworldPricesMicros(byId('anthropic/claude-sonnet-5-5'))!
    // prompt_tokens 10,000 includes 6,000 read and 1,000 written, so 3,000 are plain input.
    const usage = { ...NO_USAGE, inputTokens: 10_000 - 6_000 - 1_000, outputTokens: 500, cacheReadTokens: 6_000, cacheWriteTokens: 1_000 }
    // 3000*3 + 500*15 + 6000*0.3 + 1000*3.75 = 9000 + 7500 + 1800 + 3750 micros-per-token-million units.
    expect(tokenCostMicros(prices, usage)).toBe(22_050n)
  })
  it('prices an Inworld-hosted model at Inworld\'s own price', () => {
    const prices = inworldPricesMicros(byId('inworld/models/deepseek-v4-flash'))!
    expect(tokenCostMicros(prices, { ...NO_USAGE, inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBe(420_000n)
  })
  it('names the list it priced from, the same for the same prices', () => {
    expect(inworldPriceRef(models)).toMatch(/^hq:inworld-[0-9a-f]{8}$/)
    expect(inworldPriceRef([...models].reverse())).toBe(inworldPriceRef(models))
    expect(inworldPriceRef(models.slice(1))).not.toBe(inworldPriceRef(models))
  })
})

describe('cost rank and label', () => {
  it('ranks by price into the same bands as the catalogue', () => {
    expect(costBand(inworldCostRank(byId('anthropic/claude-haiku-5-5'))!)).toBe('low')
    expect(costBand(inworldCostRank(byId('anthropic/claude-sonnet-5-5'))!)).toBe('mid')
    expect(costBand(inworldCostRank({ prices: { prompt: 5e-6, completion: 2.5e-5, cacheRead: null, cacheWrite: null } })!)).toBe('high')
    expect(costBand(inworldCostRank({ prices: { prompt: 0, completion: 0, cacheRead: null, cacheWrite: null } })!)).toBe('free')
    expect(inworldCostRank(byId('mistral/bare-model'))).toBeNull()
  })
  it('is dearer for a dearer model', () => {
    expect(inworldCostRank(byId('anthropic/claude-sonnet-5-5'))!).toBeGreaterThan(inworldCostRank(byId('anthropic/claude-haiku-5-5'))!)
  })
  it('makes a label from the id', () => {
    expect(inworldLabel('anthropic/claude-sonnet-5-5')).toBe('Claude Sonnet 5.5')
    expect(inworldLabel('inworld/models/deepseek-v4-flash')).toBe('DeepSeek V4 Flash')
    expect(inworldLabel('deepinfra/deepseek-ai/DeepSeek-V4-Pro')).toBe('DeepSeek V4 Pro')
    expect(inworldLabel('inworld/models/zai-org/glm-5.2')).toBe('GLM 5.2')
    expect(inworldLabel('groq/openai/gpt-oss-20b')).toBe('GPT OSS 20b')
  })
})

const entry = (provider: string, model: string, creator: string, prompt: number | null) => ({
  provider, model, modelCreator: creator, isSupported: true,
  ...(prompt !== null && { pricing: { promptToken: prompt, completionToken: prompt } }),
  spec: { inputModalities: ['text'], outputModalities: ['text'], capabilities: { functionCalling: true } },
})

describe('one entry per model @SC-1863', () => {
  const ids = (list: unknown[]) => parseInworldModels({ models: list }).map(m => m.id)
  it('keeps the host with the lower price', () => {
    expect(ids([entry('deepinfra', 'openai/gpt-oss-120b', 'OpenAI', 2e-7), entry('groq', 'openai/gpt-oss-120b', 'OpenAI', 1e-7)])).toEqual(['groq/openai/gpt-oss-120b'])
  })
  it('prefers a priced host to an unpriced one, and keeps the first on a tie', () => {
    expect(ids([entry('deepinfra', 'openai/gpt-oss-120b', 'OpenAI', null), entry('groq', 'openai/gpt-oss-120b', 'OpenAI', 1e-7)])).toEqual(['groq/openai/gpt-oss-120b'])
    expect(ids([entry('deepinfra', 'openai/gpt-oss-120b', 'OpenAI', 1e-7), entry('groq', 'openai/gpt-oss-120b', 'OpenAI', 1e-7)])).toEqual(['deepinfra/openai/gpt-oss-120b'])
  })
})

describe('Inworld makers read as the other providers\' do @SC-1863', () => {
  it('maps a creator or a hosted maker to the same maker', () => {
    expect(makerAndName('inworld', 'inworld/models/x', 'Deepseek Ai')).toBe('deepseek/x')
    expect(makerAndName('inworld', 'inworld/models/x', 'Meta Models')).toBe('meta-llama/x')
    expect(makerAndName('inworld', 'inworld/models/x', 'Zai Org')).toBe('z-ai/x')
    expect(makerAndName('inworld', 'deepinfra/deepseek-ai/DeepSeek-V4-Pro')).toBe('deepseek/DeepSeek-V4-Pro')
    expect(makerAndName('inworld', 'deepinfra/MiniMaxAI/MiniMax-M3')).toBe('minimax/MiniMax-M3')
    expect(makerAndName('inworld', 'groq/zai-org/glm-5.2')).toBe('z-ai/glm-5.2')
    expect(makerAndName('inworld', 'inworld/models/x', 'Some New Lab')).toBe('some-new-lab/x')
  })
})
