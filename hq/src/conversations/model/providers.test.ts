import { describe, expect, it } from 'vitest'
import type { ResolvedAccess } from '../contract'
import { languageModelFor, sdkModelId } from './providers'

const access = (provider: ResolvedAccess['provider'], model: string, baseUrl?: string): ResolvedAccess => ({
  provider, model, apiKey: 'k', baseUrl, owner: 'org', kind: 'API_KEY',
})

describe('sdkModelId @SC-956', () => {
  it('strips the provider prefix, except for Anthropic', () => {
    expect(sdkModelId(access('openai', 'openai/gpt-5'))).toBe('gpt-5')
    expect(sdkModelId(access('google', 'google/gemini-3'))).toBe('gemini-3')
    expect(sdkModelId(access('openrouter', 'openrouter/anthropic/claude-x'))).toBe('anthropic/claude-x')
    expect(sdkModelId(access('anthropic', 'claude-sonnet-5'))).toBe('claude-sonnet-5')
    expect(sdkModelId(access('openai', 'gpt-5'))).toBe('gpt-5')
  })
})

describe('languageModelFor @SC-956', () => {
  it.each([
    ['anthropic', 'claude-x', 'anthropic'],
    ['openai', 'openai/gpt-5', 'openai.responses'],
    ['google', 'google/gemini-3', 'google'],
    ['openrouter', 'openrouter/vendor/m', 'openai.chat'],
    ['openai_compatible', 'openai_compatible/m', 'openai.chat'],
  ] as const)('builds a model for %s', (provider, model, expected) => {
    const built = languageModelFor(access(provider, model, 'http://localhost:1234/v1'))
    expect(built).toMatchObject({ specificationVersion: 'v3' })
    expect((built as { provider: string }).provider).toContain(expected.split('.')[0])
  })
})
