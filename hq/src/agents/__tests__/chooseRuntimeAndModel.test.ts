/**
 * Task 6.19: runtimes are shown by
 * name, the Claude model list is generated from the pinned catalogue, and the
 * OpenCode picker is grouped and priced. ui has no test runner, so its pure
 * logic is tested here.
 */
import { describe, it, expect } from 'vitest'
import {
  CLAUDE_SDK_MODELS, OPENCODE_MODELS, DEFAULT_MODELS, RUNTIME_LABELS, AGENT_RUNTIMES, COST_BAND_MAX_RANKS,
  runtimeLabel, costBand, COST_BAND_MARKERS, modelForRuntimeChange, isKnownModel, modelsForRuntime,
} from '@agenthix/core'
import { modelOptionLabel, filterModels, groupByProvider } from '@agenthix/ui/agents'
import { DEFAULT_MODEL } from '../models'


describe('runtime labels', () => {
  it('names every runtime and falls back to the id for an unknown one', () => {
    expect(RUNTIME_LABELS).toEqual({ 'claude-sdk': 'Claude', opencode: 'OpenCode' })
    for (const r of AGENT_RUNTIMES) expect(runtimeLabel(r)).not.toBe(r)
    expect(runtimeLabel('mystery')).toBe('mystery')
  })
})

describe('the generated Claude model list', () => {
  const values = CLAUDE_SDK_MODELS.map(m => m.value)

  it('holds the catalogue’s current Anthropic models', () => {
    for (const v of ['claude-sonnet-5', 'claude-opus-5', 'claude-haiku-4-5', 'claude-fable-5-1']) expect(values).toContain(v)
  })

  it('has bare ids the CLI accepts, none with a provider prefix, and no dated duplicate of an alias', () => {
    for (const v of values) expect(v).not.toContain('/')
    expect(values).not.toContain('claude-haiku-4-5-20251001')
    expect(values).not.toContain('claude-sonnet-4-5-20250929')
    expect(new Set(values).size).toBe(values.length)
    expect(CLAUDE_SDK_MODELS.every(m => !m.label.includes('(latest)'))).toBe(true)
  })

  it('carries the catalogue’s ranks: Haiku below Sonnet below Opus, on the OpenCode scale', () => {
    const rank = (v: string) => CLAUDE_SDK_MODELS.find(m => m.value === v)!.costRank
    expect(rank('claude-haiku-4-5')).toBeLessThan(rank('claude-sonnet-4-6'))
    expect(rank('claude-sonnet-4-6')).toBeLessThan(rank('claude-opus-5'))
    expect(rank('claude-opus-5')).toBe(OPENCODE_MODELS.find(m => m.value === 'anthropic/claude-opus-5')!.costRank)
  })

  it('holds each default, which is the catalogue’s current Sonnet', () => {
    expect(isKnownModel('claude-sdk', DEFAULT_MODELS['claude-sdk'])).toBe(true)
    expect(isKnownModel('opencode', DEFAULT_MODELS.opencode)).toBe(true)
    expect(DEFAULT_MODELS['claude-sdk']).toBe('claude-sonnet-5')
    expect(DEFAULT_MODELS.opencode).toBe(`anthropic/${DEFAULT_MODELS['claude-sdk']}`)
    expect(DEFAULT_MODEL).toBe(DEFAULT_MODELS['claude-sdk'])
  })
})

describe('the runtime of a model', () => {
  it('resets the model on a runtime change unless the new runtime offers it', () => {
    expect(modelForRuntimeChange('opencode', 'claude-sonnet-5')).toBe('anthropic/claude-sonnet-5')
    expect(modelForRuntimeChange('claude-sdk', 'anthropic/claude-sonnet-5')).toBe('claude-sonnet-5')
    expect(modelForRuntimeChange('opencode', 'openai/gpt-5-nano')).toBe('openai/gpt-5-nano')
  })

  it('offers the models of the chosen runtime', () => {
    expect(modelsForRuntime('opencode').length).toBeGreaterThan(modelsForRuntime('claude-sdk').length)
  })
})

describe('cost bands', () => {
  it('cuts free, low, mid and high, with Anthropic’s tiers in three bands', () => {
    const band = (v: string) => costBand(CLAUDE_SDK_MODELS.find(m => m.value === v)!.costRank)
    expect(costBand(0)).toBe('free')
    expect(band('claude-haiku-4-5')).toBe('low')
    expect(band('claude-sonnet-5')).toBe('mid')
    expect(band('claude-sonnet-4-6')).toBe('mid')
    expect(band('claude-opus-5')).toBe('high')
    expect(costBand(COST_BAND_MAX_RANKS.low + 1)).toBe('mid')
    expect(costBand(COST_BAND_MAX_RANKS.mid + 1)).toBe('high')
  })

  it('marks an option with its band', () => {
    expect(modelOptionLabel({ label: 'X', value: 'x', costRank: 0 })).toBe(`X · ${COST_BAND_MARKERS.free}`)
    expect(modelOptionLabel({ label: 'X', value: 'x', costRank: 1 })).toBe('X · $')
  })
})

describe('the grouped OpenCode picker', () => {
  const groups = groupByProvider(OPENCODE_MODELS)

  it('groups by provider, every model once', () => {
    expect(groups.map(([p]) => p).sort()).toEqual(['anthropic', 'google', 'openai', 'openrouter'])
    expect(groups.flatMap(([, g]) => g).length).toBe(OPENCODE_MODELS.length)
    for (const [provider, group] of groups) expect(group.every(m => m.provider === provider)).toBe(true)
  })

  it('puts the free models first and orders each group by price', () => {
    const openrouter = groups.find(([p]) => p === 'openrouter')![1]
    expect(openrouter[0].costRank).toBe(0)
    const ranks = openrouter.map(m => m.costRank)
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
  })

  it('filters by name, provider, id and price marker', () => {
    expect(filterModels(OPENCODE_MODELS, 'sonnet 5').every(m => /sonnet/i.test(m.label))).toBe(true)
    expect(filterModels(OPENCODE_MODELS, 'openai').every(m => m.provider === 'openai' || m.value.includes('openai'))).toBe(true)
    expect(filterModels(OPENCODE_MODELS, 'free').some(m => m.costRank === 0)).toBe(true)
    expect(filterModels(OPENCODE_MODELS, '')).toHaveLength(OPENCODE_MODELS.length)
    expect(filterModels(OPENCODE_MODELS, 'zzzz-no-such-model')).toEqual([])
  })
})
