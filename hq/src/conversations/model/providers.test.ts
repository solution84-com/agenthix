import { describe, expect, it } from 'vitest'
import type { ResolvedAccess } from '../contract'
import { languageModelFor } from './providers'

const access = (provider: ResolvedAccess['provider'], model: string, baseUrl?: string): ResolvedAccess => ({
  providerId: 'p1', providerName: 'P', provider, model, apiKey: 'k', baseUrl,
})

describe('languageModelFor @SC-956', () => {
  it.each([
    ['anthropic', 'claude-x', 'anthropic'],
    ['openai', 'gpt-5', 'openai.responses'],
    ['google', 'gemini-3', 'google'],
    ['openrouter', 'vendor/m', 'openai.chat'],
    ['openai_compatible', 'm', 'openai.chat'],
  ] as const)('builds a model for %s', (provider, model, expected) => {
    const built = languageModelFor(access(provider, model, 'http://localhost:1234/v1'))
    expect(built).toMatchObject({ specificationVersion: 'v3' })
    expect((built as { provider: string }).provider).toContain(expected.split('.')[0])
  })
})
