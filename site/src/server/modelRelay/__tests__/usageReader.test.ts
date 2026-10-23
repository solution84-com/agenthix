import { describe, expect, it } from 'vitest'
import { UsageReader, usageApiFor } from '../usageReader'

const SSE = 'text/event-stream'

/** Feeds the answer in small, uneven pieces, as a network delivers it, so a line split across chunks is read whole. */
function read(reader: UsageReader, body: string, size = 7): UsageReader {
  const bytes = Buffer.from(body)
  for (let i = 0; i < bytes.length; i += size) reader.push(bytes.subarray(i, i + size))
  return reader
}

const sse = (...events: unknown[]) => events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('')

describe('the usage an answer carries @SC-1228', () => {
  it("reads Anthropic's message_start and message_delta, the delta's count winning", () => {
    const body =
      'event: message_start\n' + sse({ type: 'message_start', message: { id: 'm', usage: { input_tokens: 25, cache_read_input_tokens: 100, cache_creation_input_tokens: 40, output_tokens: 1 } } }) +
      'event: content_block_delta\n' + sse({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello "usage" here' } }) +
      'event: message_delta\n' + sse({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 312 } }) +
      'event: message_stop\n' + sse({ type: 'message_stop' })
    const reader = read(new UsageReader('anthropic', SSE), body)
    expect(reader.end()).toEqual({ inputTokens: 25, outputTokens: 312, cacheReadTokens: 100, cacheWriteTokens: 40 })
    expect(reader.streamFailure).toBeNull()
  })

  it("reads Anthropic's answer that is not streamed", () => {
    const body = JSON.stringify({ type: 'message', content: [], usage: { input_tokens: 9, output_tokens: 4 } })
    expect(read(new UsageReader('anthropic', 'application/json'), body).end())
      .toEqual({ inputTokens: 9, outputTokens: 4, cacheReadTokens: 0, cacheWriteTokens: 0 })
  })

  it("names an error Anthropic sends inside a stream that began well", () => {
    const body = sse({ type: 'message_start', message: { usage: { input_tokens: 3, output_tokens: 1 } } }) +
      'event: error\n' + sse({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } })
    const reader = read(new UsageReader('anthropic', SSE), body)
    expect(reader.end()).toEqual({ inputTokens: 3, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 })
    expect(reader.streamFailure).toBe('unavailable')
  })

  it("reads OpenAI's final usage chunk, cached input counted apart", () => {
    const body = sse(
      { id: 'c', choices: [{ delta: { content: 'Hi' } }], usage: null },
      { id: 'c', choices: [], usage: { prompt_tokens: 120, completion_tokens: 30, prompt_tokens_details: { cached_tokens: 100 } } },
    ) + 'data: [DONE]\n\n'
    expect(read(new UsageReader('openai', SSE), body).end())
      .toEqual({ inputTokens: 20, outputTokens: 30, cacheReadTokens: 100, cacheWriteTokens: 0 })
  })

  it("reads OpenRouter's final usage chunk, with its cache writes", () => {
    const body = ': OPENROUTER PROCESSING\n\n' + sse(
      { id: 'gen', choices: [{ delta: { content: 'x' } }] },
      { id: 'gen', choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 50, completion_tokens: 7, prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 50 } } },
    ) + 'data: [DONE]\n\n'
    expect(read(new UsageReader('openai', SSE), body).end())
      .toEqual({ inputTokens: 0, outputTokens: 7, cacheReadTokens: 0, cacheWriteTokens: 50 })
  })

  it("reads the usage of OpenAI's Responses API from response.completed", () => {
    const body = sse(
      { type: 'response.created', response: { id: 'r', usage: null } },
      { type: 'response.output_text.delta', delta: 'Hi' },
      { type: 'response.completed', response: { id: 'r', usage: { input_tokens: 80, output_tokens: 12, input_tokens_details: { cached_tokens: 64 } } } },
    )
    expect(read(new UsageReader('openai', SSE), body).end())
      .toEqual({ inputTokens: 16, outputTokens: 12, cacheReadTokens: 64, cacheWriteTokens: 0 })
  })

  it("reads OpenAI's answer that is not streamed", () => {
    const body = JSON.stringify({ id: 'c', choices: [], usage: { prompt_tokens: 5, completion_tokens: 2 } })
    expect(read(new UsageReader('openai', 'application/json; charset=utf-8'), body).end())
      .toEqual({ inputTokens: 5, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0 })
  })

  it("reads Gemini's usageMetadata, the last one winning, thinking counted as output", () => {
    const body = sse(
      { candidates: [{ content: { parts: [{ text: 'a' }] } }], usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 1 } },
      { candidates: [{ content: { parts: [{ text: 'b' }] } }], usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 9, thoughtsTokenCount: 6, cachedContentTokenCount: 30 } },
    )
    expect(read(new UsageReader('google', SSE), body).end())
      .toEqual({ inputTokens: 10, outputTokens: 15, cacheReadTokens: 30, cacheWriteTokens: 0 })
  })

  it("reads Gemini's stream sent as one JSON array", () => {
    const body = JSON.stringify([
      { candidates: [], usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 1 } },
      { candidates: [], usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 3 } },
    ])
    expect(read(new UsageReader('google', 'application/json'), body).end())
      .toEqual({ inputTokens: 4, outputTokens: 3, cacheReadTokens: 0, cacheWriteTokens: 0 })
  })

  it('has no usage for an answer that carries none', () => {
    expect(read(new UsageReader('openai', SSE), sse({ choices: [{ delta: { content: 'x' } }] }) + 'data: [DONE]\n\n').end()).toBeNull()
    expect(read(new UsageReader('anthropic', 'application/json'), 'not json').end()).toBeNull()
  })

  it('ignores a usage block that is not a count', () => {
    const body = JSON.stringify({ usage: { input_tokens: -1, output_tokens: 'many' } })
    expect(read(new UsageReader('anthropic', 'application/json'), body).end()).toBeNull()
  })

  it('keeps no more than its limit of an answer it cannot read as a stream', () => {
    const reader = new UsageReader('openai', 'application/json')
    reader.push(Buffer.alloc(5 * 1024 * 1024, 0x20))
    reader.push(Buffer.from(JSON.stringify({ usage: { prompt_tokens: 1, completion_tokens: 1 } })))
    expect(reader.end()).toBeNull()
  })

  it('keeps the start of an answer, for the failure it names', () => {
    const reader = read(new UsageReader('openai', 'application/json'), JSON.stringify({ error: { message: 'You exceeded your current quota' } }))
    expect(reader.text()).toContain('exceeded your current quota')
  })
})

describe('which API a request speaks @SC-1228', () => {
  it('follows the provider the harness addressed', () => {
    expect(usageApiFor('anthropic')).toBe('anthropic')
    expect(usageApiFor('google')).toBe('google')
    expect(usageApiFor('openai')).toBe('openai')
    expect(usageApiFor('openrouter')).toBe('openai')
    expect(usageApiFor('openai_compatible')).toBe('openai')
  })
})
