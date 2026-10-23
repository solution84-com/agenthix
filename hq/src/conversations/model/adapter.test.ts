import { describe, expect, it, vi } from 'vitest'
import { APICallError } from 'ai'
import { MockLanguageModelV3 } from 'ai/test'
import { z } from 'zod'
import { ModelCallError, type LeadStreamEvent } from '../contract'
import { createModelAdapter } from './index'
import { anthropicAccess, echoSchema, requestFor, streamingModel, textChunks, usageOf } from './testSupport'

async function collect(iterable: AsyncIterable<LeadStreamEvent>) {
  const events: LeadStreamEvent[] = []
  for await (const event of iterable) events.push(event)
  return events
}

describe('stream @SC-956', () => {
  it('yields the text, then one finish with the usage', async () => {
    const model = streamingModel(textChunks(['Hel', 'lo'], usageOf({ total: 120, noCache: 20, cacheRead: 80, cacheWrite: 20 }, 7)))
    const adapter = createModelAdapter({ languageModel: () => model })
    const events = await collect(adapter.stream(requestFor()))
    expect(events).toEqual([
      { type: 'text', text: 'Hel' },
      { type: 'text', text: 'lo' },
      { type: 'finish', reason: 'stop', usage: { inputTokens: 20, outputTokens: 7, cacheReadTokens: 80, cacheWriteTokens: 20 } },
    ])
  })

  it('ends the step at a tool call and yields it with the finish reason tool-calls', async () => {
    const model = streamingModel([
      { type: 'stream-start', warnings: [] },
      { type: 'tool-call', toolCallId: 'call-1', toolName: 'echo', input: '{"text":"hi"}' },
      { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool_use' }, usage: usageOf({ total: 4 }, 2) },
    ])
    const adapter = createModelAdapter({ languageModel: () => model })
    const events = await collect(adapter.stream(requestFor({ tools: [{ name: 'echo', description: 'Echoes', input: echoSchema }] })))
    expect(events[0]).toEqual({ type: 'tool-call', call: { id: 'call-1', name: 'echo', input: { text: 'hi' } } })
    expect(events[1]).toMatchObject({ type: 'finish', reason: 'tool-calls' })
    expect(model.doStreamCalls).toHaveLength(1)
    expect(model.doStreamCalls[0].tools?.[0]).toMatchObject({ type: 'function', name: 'echo' })
  })

  it('passes the step\'s tool choice: one tool it must call, or none, with the tools still sent', async () => {
    const tools = [{ name: 'echo', description: 'Echoes', input: echoSchema }]
    const forced = streamingModel(textChunks(['x']))
    await collect(createModelAdapter({ languageModel: () => forced }).stream(requestFor({ tools, toolChoice: { tool: 'echo' } })))
    expect(forced.doStreamCalls[0].toolChoice).toEqual({ type: 'tool', toolName: 'echo' })
    const words = streamingModel(textChunks(['x']))
    await collect(createModelAdapter({ languageModel: () => words }).stream(requestFor({ tools, toolChoice: 'none' })))
    expect(words.doStreamCalls[0].toolChoice).toEqual({ type: 'none' })
    expect(words.doStreamCalls[0].tools).toHaveLength(1)
  })

  it('sends the earlier tool call and its result back to the model', async () => {
    const model = streamingModel(textChunks(['Done']))
    const adapter = createModelAdapter({ languageModel: () => model })
    await collect(
      adapter.stream(
        requestFor({
          messages: [
            { role: 'user', content: 'Echo hi' },
            { role: 'assistant', content: 'Sure.', toolCalls: [{ id: 'call-1', name: 'echo', input: { text: 'hi' } }] },
            { role: 'tool', toolCallId: 'call-1', toolName: 'echo', result: { said: 'hi' } },
          ],
          tools: [{ name: 'echo', description: 'Echoes', input: echoSchema }],
        }),
      ),
    )
    const prompt = model.doStreamCalls[0].prompt
    expect(prompt.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'tool'])
  })

  it('fails with a ModelCallError when the provider sends an error part', async () => {
    const model = streamingModel([
      { type: 'stream-start', warnings: [] },
      { type: 'error', error: Object.assign(new Error('boom'), { name: 'AI_APICallError', statusCode: 500 }) },
    ])
    const adapter = createModelAdapter({ languageModel: () => model, maxRetries: 0 })
    await expect(collect(adapter.stream(requestFor()))).rejects.toBeInstanceOf(ModelCallError)
  })

  it('is cancelled when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const adapter = createModelAdapter({ languageModel: () => streamingModel(textChunks(['x'])) })
    await expect(collect(adapter.stream(requestFor({ signal: controller.signal })))).rejects.toMatchObject({ kind: 'cancelled' })
  })

  it('is cancelled when the signal aborts mid-stream', async () => {
    const controller = new AbortController()
    const adapter = createModelAdapter({ languageModel: () => streamingModel(textChunks(['a', 'b', 'c'])) })
    const seen: LeadStreamEvent[] = []
    const run = async () => {
      for await (const event of adapter.stream(requestFor({ signal: controller.signal }))) {
        seen.push(event)
        controller.abort()
      }
    }
    await expect(run()).rejects.toMatchObject({ kind: 'cancelled' })
    expect(seen[0]).toEqual({ type: 'text', text: 'a' })
  })
})

describe('complete @SC-956', () => {
  it('returns the step whole with its usage', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: {
        content: [{ type: 'text', text: 'A summary.' }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: usageOf({ total: 30, noCache: 30 }, 6),
        warnings: [],
      },
    })
    const adapter = createModelAdapter({ languageModel: () => model })
    expect(await adapter.complete(requestFor())).toEqual({
      text: 'A summary.',
      usage: { inputTokens: 30, outputTokens: 6, cacheReadTokens: 0, cacheWriteTokens: 0 },
    })
  })

  it('maps a failure to a ModelCallError', async () => {
    const model = new MockLanguageModelV3({ doGenerate: async () => { throw new Error('socket hang up') } })
    const adapter = createModelAdapter({ languageModel: () => model, maxRetries: 0 })
    await expect(adapter.complete(requestFor())).rejects.toMatchObject({ kind: 'unavailable' })
  })
})

describe('caching hints @SC-956', () => {
  const cache = { anthropic: { cacheControl: { type: 'ephemeral' } } }
  const prompt = async (request: ReturnType<typeof requestFor>) => {
    const model = streamingModel(textChunks(['ok']))
    await collect(createModelAdapter({ languageModel: () => model }).stream(request))
    return { prompt: model.doStreamCalls[0].prompt, options: model.doStreamCalls[0].providerOptions }
  }

  it('puts an Anthropic breakpoint after each system part marked cacheAfter, after cacheAfterMessage and at the end', async () => {
    const { prompt: sent } = await prompt(
      requestFor({
        system: [{ text: 'stable', cacheAfter: true }, { text: 'slow', cacheAfter: true }, { text: 'fast' }],
        messages: [{ role: 'user', content: 'one' }, { role: 'user', content: 'two' }, { role: 'user', content: 'three' }],
        cacheAfterMessage: 1,
      }),
    )
    const systems = sent.filter((m) => m.role === 'system')
    expect(systems.map((m) => m.providerOptions)).toEqual([cache, cache, undefined])
    const users = sent.filter((m) => m.role === 'user')
    expect(users.map((m) => m.providerOptions)).toEqual([undefined, cache, cache])
  })

  it('sends no breakpoint to another provider, and the cache key to OpenAI alone', async () => {
    const parts = { system: [{ text: 'stable', cacheAfter: true }], cacheAfterMessage: 0 }
    const openai = await prompt(requestFor({ ...parts, access: { ...anthropicAccess, provider: 'openai', model: 'openai/gpt-test' } }))
    expect(JSON.stringify(openai.prompt)).not.toContain('cacheControl')
    expect(openai.options).toEqual({ openai: { promptCacheKey: 'conv-1' } })
    const google = await prompt(requestFor({ ...parts, access: { ...anthropicAccess, provider: 'google', model: 'google/gemini-test' } }))
    expect(JSON.stringify(google.prompt)).not.toContain('cacheControl')
    expect(google.options).toBeUndefined()
    const compatible = await prompt(requestFor({ ...parts, access: { ...anthropicAccess, provider: 'openai_compatible', baseUrl: 'http://x/v1' } }))
    expect(compatible.options).toBeUndefined()
  })
})

describe('tools @SC-956', () => {
  it('passes the Zod input schema as the tool\'s JSON schema', async () => {
    const model = streamingModel(textChunks(['ok']))
    await collect(
      createModelAdapter({ languageModel: () => model }).stream(
        requestFor({ tools: [{ name: 'find', description: 'Finds', input: z.object({ query: z.string() }) }] }),
      ),
    )
    const tool = model.doStreamCalls[0].tools?.[0]
    expect(tool).toMatchObject({ name: 'find', description: 'Finds' })
    expect(JSON.stringify(tool)).toContain('query')
  })
})

describe("each call's outcome, for its provider's health", () => {
  it('reports a call that worked, and a failure by its kind', async () => {
    const report = vi.fn()
    const ok = createModelAdapter({ languageModel: () => streamingModel(textChunks(['Hi'])), report })
    await collect(ok.stream(requestFor()))
    expect(report).toHaveBeenCalledWith(anthropicAccess.providerId, null)

    const refused = new MockLanguageModelV3({ doStream: async () => { throw new APICallError({ message: 'invalid x-api-key', url: 'u', requestBodyValues: {}, statusCode: 401 }) } })
    const failing = createModelAdapter({ languageModel: () => refused, report, maxRetries: 0 })
    await expect(collect(failing.stream(requestFor()))).rejects.toMatchObject({ kind: 'auth' })
    expect(report).toHaveBeenLastCalledWith(anthropicAccess.providerId, 'auth')
  })
})
