import type { LanguageModelV3StreamPart } from '@ai-sdk/provider'
import { MockLanguageModelV3, convertArrayToReadableStream } from 'ai/test'
import { z } from 'zod'
import type { LeadRequest, ResolvedAccess } from '../contract'

export const anthropicAccess: ResolvedAccess = { providerId: 'p-ant', providerName: 'Anthropic', provider: 'anthropic', model: 'claude-test', apiKey: 'sk-test-fake' }

export function requestFor(overrides: Partial<LeadRequest> = {}): LeadRequest {
  return {
    access: anthropicAccess,
    system: [{ text: 'You are an agent.' }],
    messages: [{ role: 'user', content: 'Hello' }],
    tools: [],
    cacheKey: 'conv-1',
    signal: new AbortController().signal,
    ...overrides,
  }
}

export const usageOf = (input: { total: number; noCache?: number; cacheRead?: number; cacheWrite?: number }, output = 5) => ({
  inputTokens: { total: input.total, noCache: input.noCache, cacheRead: input.cacheRead, cacheWrite: input.cacheWrite },
  outputTokens: { total: output, text: output, reasoning: undefined },
})

export function streamingModel(chunks: LanguageModelV3StreamPart[]) {
  return new MockLanguageModelV3({
    doStream: async () => ({ stream: convertArrayToReadableStream<LanguageModelV3StreamPart>(chunks) }),
  })
}

export const textChunks = (words: string[], usage = usageOf({ total: 10 })): LanguageModelV3StreamPart[] => [
  { type: 'stream-start', warnings: [] },
  { type: 'text-start', id: 't' },
  ...words.map((delta) => ({ type: 'text-delta' as const, id: 't', delta })),
  { type: 'text-end', id: 't' },
  { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage },
]

export const echoSchema = z.object({ text: z.string() })
