import { describe, expect, it, vi } from 'vitest'
import type { ResolvedAccess } from '../contract'
import { generateText } from 'ai'
import { inworldLlmAuthorization } from '../../shared/inworldLlm'
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
    ['inworld', 'anthropic/claude-sonnet-5-5', 'openai.chat'],
  ] as const)('builds a model for %s', (provider, model, expected) => {
    const built = languageModelFor(access(provider, model, 'http://localhost:1234/v1'))
    expect(built).toMatchObject({ specificationVersion: 'v3' })
    expect((built as { provider: string }).provider).toContain(expected.split('.')[0])
  })
})

describe('languageModelFor, Inworld (adr-0183) @SC-1851', () => {
  it('reaches Inworld at its address by the provider/model id, with the key in the one header it is given in', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      id: 'c1', object: 'chat.completion', created: 1, model: 'anthropic/claude-sonnet-5-5',
      choices: [{ index: 0, message: { role: 'assistant', content: 'hi' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const model = languageModelFor(access('inworld', 'anthropic/claude-sonnet-5-5'), { fetch })
    await generateText({ model, prompt: 'hello' })
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.inworld.ai/v1/chat/completions')
    expect(new Headers(init.headers).get('authorization')).toBe(inworldLlmAuthorization('k'))
    expect(JSON.parse(init.body as string).model).toBe('anthropic/claude-sonnet-5-5')
  })
})
