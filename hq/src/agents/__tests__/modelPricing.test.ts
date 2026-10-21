/** Task 6.19: one price table, from the pinned catalogue, for every model either picker lists. */
import { describe, it, expect } from 'vitest'
import { CLAUDE_SDK_MODELS, OPENCODE_MODELS, MODEL_PRICING, defaultModelFor, DEFAULT_MODELS } from '@agenthix/core'
import * as hqMetrics from '../../shared/utils/aiMetrics'
import * as uiMetrics from '@agenthix/ui/agents'

const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000, totalTokens: 2_000_000 }

describe('the price table', () => {
  it('prices every model of both lists', () => {
    for (const m of [...CLAUDE_SDK_MODELS, ...OPENCODE_MODELS]) expect(MODEL_PRICING[m.value], m.value).toBeDefined()
  })

  it('is the same table in hq and ui', () => {
    expect(hqMetrics.MODEL_PRICING).toBe(MODEL_PRICING)
    expect(uiMetrics.MODEL_PRICING).toBe(MODEL_PRICING)
  })

  it('still prices a stored dated Claude id', () => {
    expect(MODEL_PRICING['claude-haiku-4-5-20251001']).toMatchObject({ inputPerMTok: 1, outputPerMTok: 5 })
  })

  it('keeps the cost formula: tokens times the per-million price, cache included', () => {
    expect(hqMetrics.formatCost(usage, 'claude-sonnet-5')).toBe('~$12.000')
    expect(uiMetrics.formatCost(usage, 'claude-sonnet-5')).toBe('~$12.000')
    const cached = { ...usage, cacheReadTokens: 1_000_000, cacheWriteTokens: 1_000_000 }
    expect(uiMetrics.calculateCost(cached, 'claude-sonnet-5')).toBeCloseTo(12 + 0.2 + 2.5)
  })

  it('gives an OpenCode model a cost instead of a dash', () => {
    for (const fmt of [hqMetrics.formatCost, uiMetrics.formatCost]) {
      expect(fmt(usage, 'openrouter/deepseek/deepseek-v4-flash')).toBe('~$0.166')
      expect(fmt(usage, 'openrouter/openrouter/free')).toBe('<$0.001')
    }
  })

  it('keeps the dash for a model with no price', () => {
    expect(uiMetrics.formatCost(usage, 'openai_compatible/llama3')).toBe('—')
    expect(uiMetrics.formatCost(usage, '')).toBe('—')
    expect(hqMetrics.formatCost(usage, null)).toBe('—')
  })
})

describe('the fallback default model', () => {
  it('is the runtime’s shared default, Claude’s for an unknown or missing runtime', () => {
    expect(defaultModelFor('opencode')).toBe(DEFAULT_MODELS.opencode)
    expect(defaultModelFor('claude-sdk')).toBe(DEFAULT_MODELS['claude-sdk'])
    expect(defaultModelFor('mystery')).toBe(DEFAULT_MODELS['claude-sdk'])
    expect(defaultModelFor(undefined)).toBe(DEFAULT_MODELS['claude-sdk'])
  })
})
