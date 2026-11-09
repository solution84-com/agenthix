/**
 * The caching hints as each provider's request body carries them, through the real provider SDKs with the network
 * replaced: the body is captured and the call refused, so no request leaves the process.
 */
import { describe, expect, it } from 'vitest'
import type { LeadRequest, ModelProvider } from '../contract'
import { createModelAdapter } from './index'
import { languageModelFor } from './providers'
import { anthropicAccess, requestFor } from './testSupport'

type Body = Record<string, unknown> & { messages?: Array<Record<string, unknown>>; system?: Array<Record<string, unknown>> }

async function sentBody(request: LeadRequest): Promise<{ url: string; body: Body }> {
  let captured: { url: string; body: Body } | null = null
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    captured = { url: String(input), body: JSON.parse(String(init?.body)) as Body }
    return new Response(JSON.stringify({ error: { message: 'refused in a test' } }), { status: 400, headers: { 'content-type': 'application/json' } })
  }) as typeof globalThis.fetch
  const adapter = createModelAdapter({ languageModel: (access, extras) => languageModelFor(access, { ...extras, fetch }), maxRetries: 0 })
  await expect(adapter.complete(request)).rejects.toMatchObject({ kind: 'invalid' })
  if (!captured) throw new Error('nothing was sent')
  return captured
}

const access = (provider: ModelProvider, model: string) => ({ ...anthropicAccess, provider, model, baseUrl: 'http://compatible.test/v1' })

/** Instructions, the compaction block, three earlier messages, and this turn's input. */
const fourParts = (overrides: Partial<LeadRequest> = {}) =>
  requestFor({
    system: [{ text: 'instructions', cacheAfter: true }, { text: 'compaction block', cacheAfter: true }],
    messages: [
      { role: 'user', content: 'one' },
      { role: 'assistant', content: 'two' },
      { role: 'user', content: 'three' },
      { role: 'assistant', content: 'four' },
      { role: 'user', content: 'this turn' },
    ],
    cacheAfterMessage: 3,
    cacheKey: 'conversation-1',
    ...overrides,
  })

const hasCacheControl = (value: unknown) => JSON.stringify(value).includes('cache_control')

describe('Anthropic @SC-956', () => {
  it('sends four breakpoints: after the instructions, after the compaction block, before the turn and at the end', async () => {
    const { body } = await sentBody(fourParts())
    expect(body.system?.map((b) => b.cache_control)).toEqual([{ type: 'ephemeral' }, { type: 'ephemeral' }])
    const marked = (body.messages ?? []).map((m) => hasCacheControl(m.content))
    // The SDK merges nothing here: the roles alternate.
    expect(marked).toEqual([false, false, false, true, true])
    expect(body).not.toHaveProperty('prompt_cache_key')
  })

  it('never sends more than four, keeping the latest', async () => {
    const { body } = await sentBody(
      fourParts({ system: [{ text: 'a', cacheAfter: true }, { text: 'b', cacheAfter: true }, { text: 'c', cacheAfter: true }] }),
    )
    expect(JSON.stringify(body).match(/cache_control/g)).toHaveLength(4)
    expect(body.system?.[0]).not.toHaveProperty('cache_control')
  })

  it('in a tool loop, keeps the breakpoint before the turn and moves the last one to the newest tool result', async () => {
    const { body } = await sentBody(
      fourParts({
        messages: [
          ...fourParts().messages,
          { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'find', input: {} }] },
          { role: 'tool', toolCallId: 'c1', toolName: 'find', result: { found: 1 } },
        ],
      }),
    )
    const marked = (body.messages ?? []).map((m) => hasCacheControl(m.content))
    expect(marked).toEqual([false, false, false, true, false, false, true])
  })
})

describe('OpenAI @SC-956', () => {
  it('sends the conversation as prompt_cache_key and no breakpoints', async () => {
    const { body, url } = await sentBody(fourParts({ access: access('openai', 'openai/gpt-test') }))
    expect(url).toContain('/responses')
    expect(body.prompt_cache_key).toBe('conversation-1')
    expect(hasCacheControl(body)).toBe(false)
  })
})

describe('OpenRouter @SC-956', () => {
  it('for an Anthropic model, sends session_id and the breakpoints as cache_control on content parts', async () => {
    const { body, url } = await sentBody(fourParts({ access: access('openrouter', 'openrouter/anthropic/claude-test') }))
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(body.session_id).toBe('conversation-1')
    const messages = body.messages ?? []
    expect(messages.map((m) => m.role)).toEqual(['system', 'system', 'user', 'assistant', 'user', 'assistant', 'user'])
    expect(messages.map((m) => hasCacheControl(m.content))).toEqual([true, true, false, false, false, true, true])
    expect(messages[0]!.content).toEqual([{ type: 'text', text: 'instructions', cache_control: { type: 'ephemeral' } }])
    expect(messages[2]!.content).toBe('one')
  })

  it('for any other model, sends session_id alone: those providers cache on their own', async () => {
    for (const model of ['openrouter/openai/gpt-test', 'openrouter/google/gemini-test', 'deepseek/deepseek-test']) {
      const { body } = await sentBody(fourParts({ access: access('openrouter', model) }))
      expect(body.session_id).toBe('conversation-1')
      expect(hasCacheControl(body)).toBe(false)
    }
  })

  it('cuts session_id to OpenRouter\'s 256 characters', async () => {
    const { body } = await sentBody(fourParts({ access: access('openrouter', 'openai/gpt-test'), cacheKey: 'k'.repeat(300) }))
    expect(body.session_id).toBe('k'.repeat(256))
  })

  it('asks for no reasoning on a reply spoken aloud, and leaves a written one to the model', async () => {
    const spoken = await sentBody(fourParts({ access: access('openrouter', 'openai/gpt-test'), spoken: true }))
    expect(spoken.body.reasoning).toEqual({ effort: 'none' })
    expect(spoken.body.session_id).toBe('conversation-1')
    const written = await sentBody(fourParts({ access: access('openrouter', 'openai/gpt-test') }))
    expect(written.body.reasoning).toBeUndefined()
  })
})

describe("a spoken message's first step", () => {
  it('turns thinking off for Haiku, thinks only between tools on Sonnet 5.5, and leaves Opus as it is', async () => {
    const first = (model: string) => sentBody(fourParts({ access: access('anthropic', model), spoken: true, firstSpokenStep: true }))
    expect((await first('claude-haiku-5-5')).body.thinking).toEqual({ type: 'disabled' })
    expect((await first('claude-sonnet-5-5')).body.thinking).toEqual({ type: 'between_tools' })
    expect((await first('claude-opus-5-5')).body).not.toHaveProperty('thinking')
  })

  it('sends Anthropic no thinking on any other step, as before', async () => {
    const later = await sentBody(fourParts({ access: access('anthropic', 'claude-haiku-5-5'), spoken: true }))
    expect(later.body).not.toHaveProperty('thinking')
    expect(later.body.system?.map((b) => b.cache_control)).toEqual([{ type: 'ephemeral' }, { type: 'ephemeral' }])
  })

  it("keeps OpenRouter's reasoning at none", async () => {
    const first = await sentBody(fourParts({ access: access('openrouter', 'openai/gpt-test'), firstSpokenStep: true }))
    expect(first.body.reasoning).toEqual({ effort: 'none' })
  })

  it('asks OpenAI for its least effort, keeping the cache key beside it', async () => {
    const first = await sentBody(fourParts({ access: access('openai', 'gpt-5.1'), spoken: true, firstSpokenStep: true }))
    expect(first.body.reasoning).toEqual({ effort: 'none' })
    expect(first.body.prompt_cache_key).toBe('conversation-1')
  })

  it('asks Google for its least thinking', async () => {
    const flash = await sentBody(fourParts({ access: access('google', 'gemini-2.5-flash'), spoken: true, firstSpokenStep: true }))
    expect((flash.body.generationConfig as Record<string, unknown>).thinkingConfig).toEqual({ thinkingBudget: 0 })
  })
})

describe("a spoken message's later steps, after its tools", () => {
  it('send no reasoning setting on any provider: the model thinks as it does', async () => {
    const later = (provider: ModelProvider, model: string) => sentBody(fourParts({ access: access(provider, model) }))
    expect((await later('anthropic', 'claude-haiku-5-5')).body).not.toHaveProperty('thinking')
    expect((await later('openai', 'gpt-5.1')).body).not.toHaveProperty('reasoning')
    expect((await later('openrouter', 'openai/gpt-test')).body).not.toHaveProperty('reasoning')
    const google = (await later('google', 'gemini-2.5-flash')).body.generationConfig as Record<string, unknown> | undefined
    expect(google?.thinkingConfig).toBeUndefined()
    expect(JSON.stringify((await later('openai_compatible', 'm')).body)).not.toMatch(/reasoning|thinking/)
  })
})

describe('Google and an OpenAI-compatible endpoint @SC-956', () => {
  it('send no caching hints: Gemini caches implicitly, and an endpoint has no standard hint', async () => {
    const google = await sentBody(fourParts({ access: access('google', 'google/gemini-test') }))
    expect(JSON.stringify(google.body)).not.toMatch(/cache_control|cachedContent|prompt_cache_key|session_id/)
    const compatible = await sentBody(fourParts({ access: access('openai_compatible', 'openai_compatible/m') }))
    expect(compatible.url).toBe('http://compatible.test/v1/chat/completions')
    expect(JSON.stringify(compatible.body)).not.toMatch(/cache_control|prompt_cache_key|session_id/)
  })
})

describe('a tool call made with no arguments @SC-956', () => {
  it('is replayed with empty input: an undefined one fails the SDK\'s prompt check, and a provider gets no arguments', async () => {
    const request = requestFor({
      messages: [
        { role: 'user', content: 'what is this organisation?' },
        { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'get_org', input: undefined }] },
        { role: 'tool', toolCallId: 'c1', toolName: 'get_org', result: { name: 'My Organisation' } },
      ],
    })
    const { body } = await sentBody({ ...request, access: access('openrouter', 'openrouter/~deepseek/deepseek-flash-latest') })
    const call = (body.messages ?? []).flatMap(m => (m.tool_calls as Array<{ function: { arguments?: string } }> | undefined) ?? [])[0]
    expect(call?.function.arguments).toBe('{}')
  })
})

describe('a tool result holding a date @SC-956', () => {
  it('is sent as JSON carries it, not refused before it leaves: the SDK takes JSON values only', async () => {
    const request = requestFor({
      messages: [
        { role: 'user', content: 'what tasks are there?' },
        { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'list_tasks', input: { status: 'TODO' } }] },
        { role: 'tool', toolCallId: 'c1', toolName: 'list_tasks', result: { tasks: [{ title: 'Write a one-line welcome', createdAt: new Date('2026-10-16T22:30:57.366Z') }] } },
      ],
    })
    const { body } = await sentBody({ ...request, access: access('openrouter', 'openrouter/~deepseek/deepseek-flash-latest') })
    const tool = (body.messages ?? []).find(m => m.role === 'tool')
    expect(JSON.parse(String(tool?.content))).toEqual({ tasks: [{ title: 'Write a one-line welcome', createdAt: '2026-10-16T22:30:57.366Z' }] })
  })
})

